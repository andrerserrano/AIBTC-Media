import { readdir, unlink, stat, readFile, writeFile } from 'fs/promises'
import { join, extname } from 'path'
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3'
import { config } from '../config/index.js'

const MEDIA_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4'])

/**
 * Minimum age (ms) before a file is eligible for cleanup.
 * Protects files still being used in the active pipeline
 * (generation → editor review → compose → Twitter upload).
 */
const MIN_AGE_MS = 60 * 60_000 // 1 hour

/**
 * Maximum number of lines to keep in events.jsonl.
 * At ~200 bytes/line this caps the file around 2 MB.
 */
const MAX_EVENT_LINES = 10_000

let r2Client: S3Client | null = null

function getR2Client(): S3Client {
  if (!r2Client) {
    r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.r2.accessKeyId,
        secretAccessKey: config.r2.secretAccessKey,
      },
    })
  }
  return r2Client
}

async function existsInR2(key: string): Promise<boolean> {
  try {
    await getR2Client().send(new HeadObjectCommand({
      Bucket: config.r2.bucketName,
      Key: key,
    }))
    return true
  } catch {
    return false
  }
}

/**
 * Scan .data/images/ and delete local files that are safely stored in R2.
 * Only deletes files older than MIN_AGE_MS to avoid removing in-flight images.
 * Returns the number of files cleaned up and bytes freed.
 */
export async function cleanupLocalMedia(): Promise<{ deleted: number; freedBytes: number }> {
  if (!config.r2.enabled) return { deleted: 0, freedBytes: 0 }

  const imagesDir = join(config.dataDir, 'images')
  let files: string[]
  try {
    files = await readdir(imagesDir)
  } catch {
    return { deleted: 0, freedBytes: 0 }
  }

  const now = Date.now()
  let deleted = 0
  let freedBytes = 0

  for (const file of files) {
    const ext = extname(file).toLowerCase()
    if (!MEDIA_EXTENSIONS.has(ext)) continue

    const filepath = join(imagesDir, file)
    try {
      const info = await stat(filepath)
      const ageMs = now - info.mtimeMs

      // Skip files still in the pipeline
      if (ageMs < MIN_AGE_MS) continue

      // Confirm it exists in R2 before deleting locally
      const r2Key = `images/${file}`
      if (await existsInR2(r2Key)) {
        await unlink(filepath)
        deleted++
        freedBytes += info.size
      }
    } catch {
      // File vanished or permission issue — skip
    }
  }

  return { deleted, freedBytes }
}

/**
 * Trim the events.jsonl file to the last MAX_EVENT_LINES lines.
 * This prevents unbounded growth of the event log on the volume.
 */
export async function trimEventLog(): Promise<{ trimmed: boolean; linesBefore: number; linesAfter: number }> {
  const logPath = join(config.dataDir, 'events.jsonl')
  try {
    const content = await readFile(logPath, 'utf-8')
    const lines = content.split('\n').filter(Boolean)

    if (lines.length <= MAX_EVENT_LINES) {
      return { trimmed: false, linesBefore: lines.length, linesAfter: lines.length }
    }

    const kept = lines.slice(-MAX_EVENT_LINES)
    await writeFile(logPath, kept.join('\n') + '\n')

    return { trimmed: true, linesBefore: lines.length, linesAfter: kept.length }
  } catch {
    return { trimmed: false, linesBefore: 0, linesAfter: 0 }
  }
}

/**
 * Run all cleanup tasks. Safe to call periodically (e.g. every 30 min).
 */
export async function runCleanup(): Promise<string> {
  const results: string[] = []

  const media = await cleanupLocalMedia()
  if (media.deleted > 0) {
    const mbFreed = (media.freedBytes / 1024 / 1024).toFixed(1)
    results.push(`Cleaned up ${media.deleted} local images (${mbFreed} MB freed)`)
  }

  const log = await trimEventLog()
  if (log.trimmed) {
    results.push(`Trimmed event log: ${log.linesBefore} → ${log.linesAfter} lines`)
  }

  return results.length > 0 ? results.join('. ') : 'Nothing to clean up'
}
