/**
 * Bitcoin Ordinals inscription engine.
 * Implements the commit/reveal two-step pattern for Taproot inscriptions.
 *
 * Based on Ordinals protocol: inscriptions are embedded in the witness data
 * of a Taproot (P2TR) transaction using an envelope format:
 *   OP_FALSE OP_IF <"ord"> <content-type> <data> OP_ENDIF
 */
import * as btc from '@scure/btc-signer'
import { hex } from '@scure/base'
import { HDKey } from '@scure/bip32'
import { mnemonicToSeedSync } from '@scure/bip39'
import { readFileSync } from 'fs'
import { getOrdinalConfig, getBtcNetwork, addressToScript, sha256Async } from './utils.js'

// Unspendable internal key (NUMS point) for script-only P2TR
const NUMS_KEY = new Uint8Array(32).fill(0x50)

export interface InscriptionParams {
  filePath: string
  contentType: string
  feeRate: number
  network?: 'mainnet' | 'testnet'
}

export interface InscriptionResult {
  inscriptionId: string
  commitTxid: string
  revealTxid: string
  totalCostSat: number
  feeRate: number
}

/**
 * Derive wallet keys from BIP39 mnemonic.
 * BIP84 (P2WPKH) for funding, BIP86 (P2TR) for Taproot.
 */
function deriveKeys(mnemonic: string, network: typeof btc.NETWORK) {
  const seed = mnemonicToSeedSync(mnemonic)
  const root = HDKey.fromMasterSeed(seed)

  // BIP84 path for SegWit (funding wallet)
  const coinType = network === btc.NETWORK ? 0 : 1
  const bip84 = root.derive(`m/84'/${coinType}'/0'/0/0`)
  const funding = btc.p2wpkh(bip84.publicKey!, network)

  // BIP86 path for Taproot
  const bip86 = root.derive(`m/86'/${coinType}'/0'/0/0`)
  const taproot = btc.p2tr(bip86.publicKey!.slice(1), undefined, network)

  return {
    funding: { payment: funding, privateKey: bip84.privateKey! },
    taproot: { payment: taproot, privateKey: bip86.privateKey! },
  }
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

  // Helper: push data with proper length prefix
  function pushData(d: Uint8Array): number[] {
    const len = d.length
    if (len <= 75) return [len, ...d]
    if (len <= 255) return [0x4c, len, ...d]
    if (len <= 65535) return [0x4d, len & 0xff, (len >> 8) & 0xff, ...d]
    return [0x4e, len & 0xff, (len >> 8) & 0xff, (len >> 16) & 0xff, (len >> 24) & 0xff, ...d]
  }

  const script = [
    OP_FALSE,
    OP_IF,
    ...pushData(ordTag),      // "ord"
    0x01, ctBytes.length, ...ctBytes, // OP_PUSH_1 <content-type>
    OP_FALSE,                 // separator
    ...pushData(data),        // content
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
 */
export async function inscribe(params: InscriptionParams): Promise<InscriptionResult> {
  const config = getOrdinalConfig()
  const networkName = params.network ?? config.network
  const network = getBtcNetwork(networkName)
  const mempoolApi = config.mempoolApi

  if (!config.mnemonic) throw new Error('No mnemonic configured')

  const data = readFileSync(params.filePath)
  const keys = deriveKeys(config.mnemonic, network)

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

  // Fetch UTXOs from funding address
  const utxos = await fetchUtxos(keys.funding.payment.address!, mempoolApi)
  if (utxos.length === 0) throw new Error(`No UTXOs found for ${keys.funding.payment.address}`)

  // Select a UTXO with enough funds
  const totalNeeded = revealAmount + commitFee + dustLimit
  const utxo = utxos.find(u => u.value >= totalNeeded)
  if (!utxo) {
    throw new Error(`Insufficient funds. Need ${totalNeeded} sats, best UTXO has ${Math.max(...utxos.map(u => u.value))} sats`)
  }

  // === COMMIT TX ===
  // Send funds to the inscription P2TR address
  const rawHex = await fetchRawTx(utxo.txid, mempoolApi)
  const rawTx = btc.Transaction.fromRaw(hex.decode(rawHex), {
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
      script: keys.funding.payment.script,
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
      script: addressToScript(keys.funding.payment.address!, network),
      amount: BigInt(change),
    })
  }

  // Sign and broadcast commit
  commitTx.sign(keys.funding.privateKey)
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
    tapLeafScript: [{
      version: 0xc0,
      script: inscriptionScript,
      controlBlock: inscriptionPayment.tapLeafScript![0].controlBlock,
    }],
  })

  // Output: send dust to our taproot address (inscription receiver)
  revealTx.addOutput({
    script: addressToScript(keys.taproot.payment.address!, network),
    amount: BigInt(dustLimit),
  })

  revealTx.sign(keys.taproot.privateKey)
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
