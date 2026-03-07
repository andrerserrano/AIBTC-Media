import { createHash } from 'crypto'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as btc from '@scure/btc-signer'

// Resolve .env from project root
const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..', '..')

export interface OrdinalConfig {
  network: 'mainnet' | 'testnet'
  mnemonic: string
  maxFeeRate: number
  maxCostUSD: number
  mempoolApi: string
  inscriptionEnabled: boolean
  compressWidth: number
  compressHeight: number
  compressQuality: number
  dataDir: string
}

export function getOrdinalConfig(): OrdinalConfig {
  return {
    network: (process.env.ORDINALS_NETWORK ?? 'testnet') as 'mainnet' | 'testnet',
    mnemonic: process.env.ORDINALS_MNEMONIC ?? '',
    maxFeeRate: Number(process.env.ORDINALS_MAX_FEE_RATE ?? 3),
    maxCostUSD: Number(process.env.ORDINALS_MAX_COST_USD ?? 2),
    mempoolApi: process.env.ORDINALS_MEMPOOL_API ?? 'https://mempool.space/testnet4/api',
    inscriptionEnabled: process.env.INSCRIPTION_ENABLED === 'true',
    compressWidth: Number(process.env.ORDINALS_COMPRESS_WIDTH ?? 200),
    compressHeight: Number(process.env.ORDINALS_COMPRESS_HEIGHT ?? 200),
    compressQuality: Number(process.env.ORDINALS_COMPRESS_QUALITY ?? 35),
    dataDir: join(projectRoot, process.env.ORDINALS_DATA_DIR ?? '.data/ordinals'),
  }
}

export function getBtcNetwork(network: string): typeof btc.NETWORK {
  return network === 'mainnet' ? btc.NETWORK : btc.TEST_NETWORK
}

export function sha256Sync(data: Uint8Array): Uint8Array {
  return new Uint8Array(createHash('sha256').update(data).digest())
}

export async function sha256Async(data: Uint8Array): Promise<Uint8Array> {
  return sha256Sync(data)
}

export function satToBtc(sat: number): number {
  return sat / 1e8
}

export function btcToUsd(btcAmount: number, priceUsd = 68000): number {
  return btcAmount * priceUsd
}

export function satToUsd(sat: number, priceUsd = 68000): number {
  return btcToUsd(satToBtc(sat), priceUsd)
}

/**
 * Convert a Bitcoin address to its output script bytes.
 * Works around addOutputAddress issues with unknown script types.
 */
export function addressToScript(address: string, network: typeof btc.NETWORK): Uint8Array {
  return btc.OutScript.encode(btc.Address(network).decode(address))
}
