import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { getOrdinalConfig } from './utils.js'

export interface InscriptionLogEntry {
  imageHash: string
  inscriptionId: string
  commitTxid: string
  revealTxid: string
  costSat: number
  costUSD: number
  feeRate: number
  compressedSize: number
  network: string
  timestamp: string
  originalPath?: string
}

function getLogPath(): string {
  const config = getOrdinalConfig()
  const logPath = join(config.dataDir, 'inscription-log.json')
  const dir = dirname(logPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return logPath
}

export function readLog(): InscriptionLogEntry[] {
  const logPath = getLogPath()
  if (!existsSync(logPath)) return []
  try {
    return JSON.parse(readFileSync(logPath, 'utf-8'))
  } catch {
    return []
  }
}

export function appendLog(entry: InscriptionLogEntry): void {
  const entries = readLog()
  entries.push(entry)
  writeFileSync(getLogPath(), JSON.stringify(entries, null, 2))
}

/**
 * Check if an image (by its sha256 hash) has already been inscribed.
 */
export function isDuplicate(imageHash: string): InscriptionLogEntry | undefined {
  return readLog().find(e => e.imageHash === imageHash)
}
