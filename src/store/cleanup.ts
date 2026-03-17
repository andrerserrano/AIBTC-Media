import { readdir, unlink, stat, readFile, writeFile, rename, rm } from 'fs/promises'
import { join, extname, basename } from 'path'
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3'
import { config } from '../config/index.js'
import type { JsonStore } from './json-store.js'
import type { Post, Cartoon } from '../types.js'

const MEDIA_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4'])

/**
 * Minimum age (ms) before a file is eligible for cleanup.
 * Protects files still being used in the active pipeline
 * (generation → editor review → compose → Twitter upload).
 */
const MIN_AGE_MS = 60 * 60_000 // 1 hour

/**
 * Age (ms) after which orphan images (not referenced by any post/cartoon)
 * are deleted even if not in R2. These are failed generations, rejected
 * cartoons, etc. that will never be used.
 */
const ORPHAN_AGE_MS = 4 * 60 * 60_000 // 4 hours

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
 * Build a set of image filenames referenced by posts and cartoons.
 * These are "in-use" and should only be deleted if safely in R2.
 */
function getReferencedImages(
  posts: Post[],
  cartoons: Cartoon[],
): Set<string> {
  const referenced = new Set<string>()

  for (const post of posts) {
    if (post.imageUrl) {
      referenced.add(basename(post.imageUrl))
    }
  }

  for (const cartoon of cartoons) {
    for (const variant of cartoon.variants ?? []) {
      referenced.add(basename(variant))
    }
  }

  return referenced
}

/**
 * Scan .data/images/ and clean up local files:
 *
 * 1. Referenced images (used by a post or cartoon) — only delete if safely in R2
 * 2. Orphan images (not referenced anywhere) — delete after ORPHAN_AGE_MS
 *    regardless of R2 status, since they'll never be needed
 *
 * Returns the number of files cleaned up and bytes freed.
 */
export async function cleanupLocalMedia(
  postsStore?: JsonStore<Post[]>,
  cartoonsStore?: JsonStore<Cartoon[]>,
): Promise<{ deleted: number; freedBytes: number; orphansDeleted: number }> {
  const imagesDir = join(config.dataDir, 'images')
  let files: string[]
  try {
    files = await readdir(imagesDir)
  } catch {
    return { deleted: 0, freedBytes: 0, orphansDeleted: 0 }
  }

  // Build set of referenced filenames
  const posts = postsStore ? ((await postsStore.read()) ?? []) : []
  const cartoons = cartoonsStore ? ((await cartoonsStore.read()) ?? []) : []
  const referenced = getReferencedImages(posts, cartoons)

  const now = Date.now()
  let deleted = 0
  let freedBytes = 0
  let orphansDeleted = 0

  for (const file of files) {
    const ext = extname(file).toLowerCase()
    if (!MEDIA_EXTENSIONS.has(ext)) continue

    const filepath = join(imagesDir, file)
    try {
      const info = await stat(filepath)
      const ageMs = now - info.mtimeMs

      // Skip files still in the pipeline
      if (ageMs < MIN_AGE_MS) continue

      const isReferenced = referenced.has(file)

      if (isReferenced && config.r2.enabled) {
        // Referenced image — only delete if confirmed in R2
        const r2Key = `images/${file}`
        if (await existsInR2(r2Key)) {
          await unlink(filepath)
          deleted++
          freedBytes += info.size
        }
      } else if (!isReferenced && ageMs >= ORPHAN_AGE_MS) {
        // Orphan image — not used by any post/cartoon, old enough to discard
        await unlink(filepath)
        orphansDeleted++
        freedBytes += info.size
      }
    } catch {
      // File vanished or permission issue — skip
    }
  }

  return { deleted, freedBytes, orphansDeleted }
}

/**
 * Clean up temporary/transient directories that accumulate data.
 * Deletes files older than MIN_AGE_MS from: .data/compressed/, .data/tmp/
 */
export async function cleanupTempDirs(): Promise<{ deleted: number; freedBytes: number }> {
  const tempDirs = ['compressed', 'tmp']
  let deleted = 0
  let freedBytes = 0
  const now = Date.now()

  for (const dir of tempDirs) {
    const dirPath = join(config.dataDir, dir)
    let files: string[]
    try {
      files = await readdir(dirPath)
    } catch {
      continue // Directory doesn't exist — fine
    }

    for (const file of files) {
      const filepath = join(dirPath, file)
      try {
        const info = await stat(filepath)
        if (now - info.mtimeMs >= MIN_AGE_MS) {
          await unlink(filepath)
          deleted++
          freedBytes += info.size
        }
      } catch {
        // skip
      }
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
    const tmpPath = logPath + '.tmp'
    await writeFile(tmpPath, kept.join('\n') + '\n')
    await rename(tmpPath, logPath)

    return { trimmed: true, linesBefore: lines.length, linesAfter: kept.length }
  } catch {
    return { trimmed: false, linesBefore: 0, linesAfter: 0 }
  }
}

/**
 * Run all cleanup tasks. Safe to call periodically (e.g. every 30 min).
 * Pass stores so cleanup can identify orphan images.
 */
export async function runCleanup(
  postsStore?: JsonStore<Post[]>,
  cartoonsStore?: JsonStore<Cartoon[]>,
): Promise<string> {
  const results: string[] = []

  const media = await cleanupLocalMedia(postsStore, cartoonsStore)
  if (media.deleted > 0 || media.orphansDeleted > 0) {
    const mbFreed = (media.freedBytes / 1024 / 1024).toFixed(1)
    const parts: string[] = []
    if (media.deleted > 0) parts.push(`${media.deleted} R2-backed images`)
    if (media.orphansDeleted > 0) parts.push(`${media.orphansDeleted} orphan images`)
    results.push(`Cleaned up ${parts.join(' + ')} (${mbFreed} MB freed)`)
  }

  const temp = await cleanupTempDirs()
  if (temp.deleted > 0) {
    const mbFreed = (temp.freedBytes / 1024 / 1024).toFixed(1)
    results.push(`Cleaned up ${temp.deleted} temp files (${mbFreed} MB freed)`)
  }

  const log = await trimEventLog()
  if (log.trimmed) {
    results.push(`Trimmed event log: ${log.linesBefore} → ${log.linesAfter} lines`)
  }

  return results.length > 0 ? results.join('. ') : 'Nothing to clean up'
}
