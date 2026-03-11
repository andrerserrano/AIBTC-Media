/**
 * High-level entry point for inscribing an image as a Bitcoin Ordinal.
 *
 * Handles the full flow: compress → dedup check → fee check → commit → reveal → log.
 * Returns provenance data ready to embed in the Cartoon record.
 */
import { readFileSync } from 'fs'
import { createHash } from 'crypto'
import { compressImage } from './compress.js'
import { estimateFees } from './estimate-fees.js'
import { inscribe } from './inscribe.js'
import { isDuplicate, appendLog, type InscriptionLogEntry } from './logger.js'
import { getOrdinalConfig, satToUsd } from './utils.js'
import type { WalletProvider } from '../crypto/wallet-provider.js'

export interface InscribeImageResult {
  inscriptionId: string
  commitTxid: string
  revealTxid: string
  costSat: number
  costUSD: number
  feeRate: number
  compressedSize: number
  network: string
  explorerUrl: string
  /** Ready to embed in Cartoon.provenance */
  provenance: {
    inscriptionId: string
    commitTxid: string
    revealTxid: string
    costSat: number
    costUSD: number
    feeRate: number
    network: string
  }
}

export interface InscribeImageOptions {
  /** Skip fee and duplicate checks */
  force?: boolean
  /** Log what would happen without inscribing */
  dryRun?: boolean
  /** Override content type (default: image/webp) */
  contentType?: string
  /** WalletProvider for secure signing (required) */
  walletProvider: WalletProvider
  /** Cartoon/card UUID — links this full-image inscription to its content hash inscription */
  cardId?: string
}

/**
 * Inscribe a single image onto Bitcoin.
 *
 * @param imagePath - Path to the image file (PNG, JPG, WebP, etc.)
 * @param options - Configuration options
 * @returns InscribeImageResult with provenance data, or null if skipped
 */
export async function inscribeImage(
  imagePath: string,
  options: InscribeImageOptions
): Promise<InscribeImageResult | null> {
  const config = getOrdinalConfig()

  if (!config.inscriptionEnabled && !options.force) {
    console.log('[ordinals] Inscription disabled via INSCRIPTION_ENABLED=false')
    return null
  }

  if (!options.walletProvider) {
    console.warn('[ordinals] No WalletProvider configured — skipping inscription')
    return null
  }

  // Step 1: Compress image to WebP thumbnail
  console.log(`[ordinals] Compressing ${imagePath}...`)
  const compressed = await compressImage(imagePath)
  console.log(`[ordinals] Compressed: ${compressed.inputSize} → ${compressed.outputSize} bytes (${compressed.ratio}%)`)

  // Step 2: Check for duplicate
  const compressedData = readFileSync(compressed.outputPath)
  const imageHash = createHash('sha256').update(compressedData).digest('hex')

  if (!options.force) {
    const existing = isDuplicate(imageHash)
    if (existing) {
      console.log(`[ordinals] Already inscribed: ${existing.inscriptionId}`)
      return null
    }
  }

  // Step 3: Check fees
  const feeEstimate = await estimateFees(compressedData.length)
  console.log(`[ordinals] Fee estimate: ${feeEstimate.estimatedFee} sats (~$${feeEstimate.estimatedUSD}) at ${feeEstimate.feeRate} sat/vB`)

  if (!feeEstimate.withinBudget && !options.force) {
    console.log(`[ordinals] Fees too high (${feeEstimate.feeRate} sat/vB > max ${config.maxFeeRate}, or $${feeEstimate.estimatedUSD} > max $${config.maxCostUSD})`)
    return null
  }

  if (options.dryRun) {
    console.log(`[ordinals] DRY RUN — would inscribe ${compressed.outputSize} bytes at ${feeEstimate.feeRate} sat/vB`)
    return null
  }

  // Step 4: Inscribe (commit + reveal)
  console.log(`[ordinals] Inscribing on ${config.network}...`)
  const result = await inscribe({
    filePath: compressed.outputPath,
    contentType: options.contentType ?? 'image/webp',
    feeRate: feeEstimate.feeRate,
    network: config.network,
    walletProvider: options.walletProvider,
  })

  const costUSD = Number(satToUsd(result.totalCostSat).toFixed(2))
  const explorer = config.network === 'testnet'
    ? 'https://mempool.space/testnet4'
    : 'https://mempool.space'

  // Step 5: Log the inscription
  const logEntry: InscriptionLogEntry = {
    imageHash,
    cardId: options.cardId,
    inscriptionId: result.inscriptionId,
    commitTxid: result.commitTxid,
    revealTxid: result.revealTxid,
    costSat: result.totalCostSat,
    costUSD,
    feeRate: result.feeRate,
    compressedSize: compressed.outputSize,
    network: config.network,
    timestamp: new Date().toISOString(),
    originalPath: imagePath,
  }
  appendLog(logEntry)

  console.log(`[ordinals] ✓ Inscribed: ${result.inscriptionId}`)
  console.log(`[ordinals]   Cost: ${result.totalCostSat} sats (~$${costUSD})`)
  console.log(`[ordinals]   Reveal: ${explorer}/tx/${result.revealTxid}`)

  const provenance = {
    inscriptionId: result.inscriptionId,
    commitTxid: result.commitTxid,
    revealTxid: result.revealTxid,
    costSat: result.totalCostSat,
    costUSD,
    feeRate: result.feeRate,
    network: config.network,
  }

  return {
    ...provenance,
    compressedSize: compressed.outputSize,
    explorerUrl: `${explorer}/tx/${result.revealTxid}`,
    provenance,
  }
}
