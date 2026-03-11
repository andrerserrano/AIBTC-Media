import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { getOrdinalConfig } from './utils.js'

// --- Full-image inscription log ---

export interface InscriptionLogEntry {
  imageHash: string
  /** Cartoon/card UUID — links full-image inscription to its content hash inscription */
  cardId?: string
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

// --- Content hash inscription log ---

export interface HashInscriptionLogEntry {
  /** SHA-256 hex digest of the canonical image (matching key) */
  contentHash: string
  /** Cartoon/card UUID */
  cardId: string
  inscriptionId: string
  commitTxid: string
  revealTxid: string
  costSat: number
  costUSD: number
  feeRate: number
  payloadSize: number
  network: string
  timestamp: string
  canonicalImagePath?: string
}

function getHashLogPath(): string {
  const config = getOrdinalConfig()
  const logPath = join(config.dataDir, 'hash-inscription-log.json')
  const dir = dirname(logPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return logPath
}

export function readHashLog(): HashInscriptionLogEntry[] {
  const logPath = getHashLogPath()
  if (!existsSync(logPath)) return []
  try {
    return JSON.parse(readFileSync(logPath, 'utf-8'))
  } catch {
    return []
  }
}

export function appendHashLog(entry: HashInscriptionLogEntry): void {
  const entries = readHashLog()
  entries.push(entry)
  writeFileSync(getHashLogPath(), JSON.stringify(entries, null, 2))
}

/**
 * Check if a content hash has already been inscribed.
 */
export function isDuplicateHash(contentHash: string): HashInscriptionLogEntry | undefined {
  return readHashLog().find(e => e.contentHash === contentHash)
}

/**
 * Find a hash inscription by card ID.
 * Useful for matching when batch-inscribing full images later.
 */
export function findHashByCardId(cardId: string): HashInscriptionLogEntry | undefined {
  return readHashLog().find(e => e.cardId === cardId)
}

/**
 * Get all cards that have a content hash inscription but no full-image inscription.
 * Matches by cardId (the natural linking key between the two inscription types).
 *
 * Note: we do NOT match by hash because contentHash is computed from the
 * canonical PNG while imageHash is computed from the compressed WebP thumbnail —
 * they are hashes of different data and will never match.
 */
export function getPendingFullInscriptions(): HashInscriptionLogEntry[] {
  const hashEntries = readHashLog()
  const imageEntries = readLog()
  const fullyInscribedCardIds = new Set(
    imageEntries.filter(e => e.cardId).map(e => e.cardId!)
  )
  return hashEntries.filter(h => !fullyInscribedCardIds.has(h.cardId))
}
