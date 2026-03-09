/**
 * Bitcoin Ordinals inscription engine.
 * Implements the commit/reveal two-step pattern for Taproot inscriptions.
 *
 * Based on Ordinals protocol: inscriptions are embedded in the witness data
 * of a Taproot (P2TR) transaction using an envelope format:
 *   OP_FALSE OP_IF <"ord"> <content-type> <data> OP_ENDIF
 *
 * Security: Private keys are NEVER accessed directly. All signing goes through
 * the WalletProvider interface, which may be backed by a local key or a TEE
 * enclave (EigenCloud EigenCompute). See src/crypto/wallet-provider.ts.
 */
import * as btc from '@scure/btc-signer'
import { hex } from '@scure/base'
import { readFileSync } from 'fs'
import { getOrdinalConfig, getBtcNetwork, addressToScript } from './utils.js'
import type { WalletProvider } from '../crypto/wallet-provider.js'

// Unspendable internal key (NUMS point) for script-only P2TR
const NUMS_KEY = new Uint8Array(32).fill(0x50)

export interface InscriptionParams {
  filePath: string
  contentType: string
  feeRate: number
  network?: 'mainnet' | 'testnet'
  /** WalletProvider handles all signing — keys never leave the provider boundary */
  walletProvider: WalletProvider
}

export interface InscriptionResult {
  inscriptionId: string
  commitTxid: string
  revealTxid: string
  totalCostSat: number
  feeRate: number
}

/**
 * Build the Ordinals inscription script.
 * Envelope format: OP_FALSE OP_IF OP_PUSH "ord" OP_PUSH 1 OP_PUSH <content-type> OP_0 OP_PUSH <data> OP_ENDIF
 */
function buildInscriptionScript(contentType: string, data: Uint8Array): Uint8Array {
  const encoder = new TextEncoder()
  const ordTag = encoder.encode('ord')
  const ctBytes = encoder.encode(contentType)

  // Build script using raw opcodes
  const OP_FALSE = 0x00
  const OP_IF = 0x63
  const OP_ENDIF = 0x68
  const OP_1 = 0x51            // Ordinals tag: content-type follows

  // Helper: push data with proper length prefix
  function pushData(d: Uint8Array): number[] {
    const len = d.length
    if (len <= 75) return [len, ...d]
    if (len <= 255) return [0x4c, len, ...d]
    if (len <= 65535) return [0x4d, len & 0xff, (len >> 8) & 0xff, ...d]
    return [0x4e, len & 0xff, (len >> 8) & 0xff, (len >> 16) & 0xff, (len >> 24) & 0xff, ...d]
  }

  // Ordinals envelope: OP_FALSE OP_IF OP_PUSH "ord" OP_1 OP_PUSH <ct> OP_0 OP_PUSH <data> OP_ENDIF
  const script = [
    OP_FALSE,
    OP_IF,
    ...pushData(ordTag),        // "ord"
    OP_1,                       // tag: content-type
    ...pushData(ctBytes),       // <content-type> (properly length-prefixed)
    OP_FALSE,                   // tag: body data
    ...pushData(data),          // content
    OP_ENDIF,
  ]

  return new Uint8Array(script)
}

/**
 * Fetch UTXOs for an address from mempool.space API.
 */
async function fetchUtxos(address: string, mempoolApi: string): Promise<Array<{
  txid: string
  vout: number
  value: number
  status: { confirmed: boolean }
}>> {
  const res = await fetch(`${mempoolApi}/address/${address}/utxo`)
  if (!res.ok) throw new Error(`UTXO fetch failed: ${res.status}`)
  return res.json() as any
}

/**
 * Fetch raw transaction hex from mempool.space.
 */
async function fetchRawTx(txid: string, mempoolApi: string): Promise<string> {
  const res = await fetch(`${mempoolApi}/tx/${txid}/hex`)
  if (!res.ok) throw new Error(`Raw tx fetch failed: ${res.status}`)
  return res.text()
}

/**
 * Broadcast a raw transaction to the network.
 */
async function broadcastTx(rawHex: string, mempoolApi: string): Promise<string> {
  const res = await fetch(`${mempoolApi}/tx`, {
    method: 'POST',
    body: rawHex,
    headers: { 'Content-Type': 'text/plain' },
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Broadcast failed: ${err}`)
  }
  return res.text()
}

/**
 * Wait for a transaction to appear in the mempool or get confirmed.
 */
async function waitForTx(txid: string, mempoolApi: string, timeoutMs = 120_000): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${mempoolApi}/tx/${txid}`)
      if (res.ok) return true
    } catch {}
    await new Promise(r => setTimeout(r, 5000))
  }
  return false
}

/**
 * Execute the full inscription flow: commit → reveal.
 *
 * 1. Commit: Send BTC to a P2TR address whose script tree contains the inscription
 * 2. Reveal: Spend the commit output, revealing the inscription in the witness
 *
 * All signing is delegated to the WalletProvider — private keys never
 * appear in this module. In TEE mode (EigenCompute), the signing happens
 * inside the enclave and only signed bytes come back.
 */
export async function inscribe(params: InscriptionParams): Promise<InscriptionResult> {
  const config = getOrdinalConfig()
  const networkName = params.network ?? config.network
  const network = getBtcNetwork(networkName)
  const mempoolApi = config.mempoolApi
  const wallet = params.walletProvider

  const addresses = wallet.getAddresses()
  const data = readFileSync(params.filePath)

  // Build inscription script
  const inscriptionScript = buildInscriptionScript(params.contentType, new Uint8Array(data))

  // Create P2TR address with inscription in the script tree
  const inscriptionPayment = btc.p2tr(
    NUMS_KEY,
    { script: inscriptionScript },
    network,
    true, // allow custom scripts
  )

  // Estimate costs
  const revealVsize = 100 + Math.ceil(data.length / 4)
  const revealFee = revealVsize * params.feeRate
  const dustLimit = 546
  const revealAmount = revealFee + dustLimit
  const commitVsize = 150
  const commitFee = commitVsize * params.feeRate

  // Fetch UTXOs from funding address (address is safe to expose)
  const utxos = await fetchUtxos(addresses.funding, mempoolApi)
  if (utxos.length === 0) throw new Error(`No UTXOs found for ${addresses.funding}`)

  // Select a UTXO with enough funds
  const totalNeeded = revealAmount + commitFee + dustLimit
  const utxo = utxos.find(u => u.value >= totalNeeded)
  if (!utxo) {
    throw new Error(`Insufficient funds. Need ${totalNeeded} sats, best UTXO has ${Math.max(...utxos.map(u => u.value))} sats`)
  }

  // === COMMIT TX ===
  // Send funds to the inscription P2TR address
  const rawHex = await fetchRawTx(utxo.txid, mempoolApi)
  const _rawTx = btc.Transaction.fromRaw(hex.decode(rawHex), {
    allowUnknownOutputs: true, // faucet txs may have OP_RETURN outputs
  })

  const commitTx = new btc.Transaction({
    allowUnknownOutputs: true,
  })

  // Add the funding input
  commitTx.addInput({
    txid: utxo.txid,
    index: utxo.vout,
    witnessUtxo: {
      script: wallet.getFundingScript(),
      amount: BigInt(utxo.value),
    },
  })

  // Output 0: inscription address
  commitTx.addOutput({
    script: addressToScript(inscriptionPayment.address!, network),
    amount: BigInt(revealAmount),
  })

  // Output 1: change back to funding address
  const change = utxo.value - revealAmount - commitFee
  if (change > dustLimit) {
    commitTx.addOutput({
      script: addressToScript(addresses.funding, network),
      amount: BigInt(change),
    })
  }

  // Sign via WalletProvider (keys never leave the provider boundary)
  wallet.signTransaction(commitTx, { keyPath: 'funding' })
  commitTx.finalize()
  const commitRaw = hex.encode(commitTx.extract())
  const commitTxid = await broadcastTx(commitRaw, mempoolApi)
  console.log(`[ordinals] Commit tx: ${commitTxid}`)

  // Wait for commit to appear in mempool
  const commitSeen = await waitForTx(commitTxid, mempoolApi, 60_000)
  if (!commitSeen) {
    console.warn('[ordinals] Commit tx not seen in mempool after 60s, proceeding anyway...')
  }

  // === REVEAL TX ===
  // Spend the commit output, revealing the inscription
  const revealTx = new btc.Transaction({
    allowUnknownOutputs: true,
  })

  revealTx.addInput({
    txid: commitTxid,
    index: 0,
    witnessUtxo: {
      script: inscriptionPayment.script,
      amount: BigInt(revealAmount),
    },
    tapLeafScript: inscriptionPayment.tapLeafScript,
  })

  // Output: send dust to our taproot address (inscription receiver)
  revealTx.addOutput({
    script: addressToScript(addresses.taproot, network),
    amount: BigInt(dustLimit),
  })

  // Sign via WalletProvider
  wallet.signTransaction(revealTx, { keyPath: 'taproot' })
  revealTx.finalize()
  const revealRaw = hex.encode(revealTx.extract())
  const revealTxid = await broadcastTx(revealRaw, mempoolApi)
  console.log(`[ordinals] Reveal tx: ${revealTxid}`)

  const inscriptionId = `${revealTxid}i0`
  const totalCost = commitFee + revealFee

  return {
    inscriptionId,
    commitTxid,
    revealTxid,
    totalCostSat: totalCost,
    feeRate: params.feeRate,
  }
}
