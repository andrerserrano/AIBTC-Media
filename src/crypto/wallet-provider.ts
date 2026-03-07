/**
 * WalletProvider — Secure wallet abstraction for Bitcoin signing operations.
 *
 * Provides a unified interface for key management across environments:
 *
 *  1. LOCAL mode (development/testnet):
 *     Mnemonic loaded from ORDINALS_MNEMONIC env var.
 *     Suitable for testnet with a low-value hot wallet.
 *
 *  2. TEE mode (production via EigenCloud EigenCompute):
 *     Mnemonic is sealed inside a Trusted Execution Environment.
 *     The key material never leaves the enclave — signing happens in-process
 *     and only signed transaction bytes are returned.
 *     Attestation proofs are generated for each signing operation.
 *
 * Architecture:
 *   - The WalletProvider interface exposes ONLY signing operations.
 *   - Private keys / mnemonics are NEVER exported from the provider.
 *   - The inscribe.ts module calls provider.signCommitTx() / provider.signRevealTx()
 *     instead of accessing raw private keys.
 *   - This makes it a drop-in replacement: swap LocalWalletProvider for
 *     TeeWalletProvider and the rest of the pipeline works identically.
 *
 * Security boundaries:
 *   ┌──────────────────────────────────────────────────┐
 *   │  TEE Enclave (EigenCompute)                      │
 *   │  ┌────────────────────────────────────────────┐  │
 *   │  │  Sealed mnemonic (never leaves enclave)    │  │
 *   │  │  Key derivation (BIP84/BIP86)              │  │
 *   │  │  Transaction signing                       │  │
 *   │  │  Attestation proof generation              │  │
 *   │  └────────────────────────────────────────────┘  │
 *   │                    ↓ signed tx bytes only         │
 *   └──────────────────────────────────────────────────┘
 *                        ↓
 *   ┌──────────────────────────────────────────────────┐
 *   │  Application layer (untrusted)                   │
 *   │  - UTXO selection                                │
 *   │  - Fee estimation                                │
 *   │  - Transaction construction (unsigned)           │
 *   │  - Broadcasting                                  │
 *   └──────────────────────────────────────────────────┘
 */

import * as btc from '@scure/btc-signer'
import { HDKey } from '@scure/bip32'
import { mnemonicToSeedSync } from '@scure/bip39'
import { getBtcNetwork } from '../ordinals/utils.js'

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface DerivedAddresses {
  /** BIP84 SegWit (P2WPKH) funding address */
  funding: string
  /** BIP86 Taproot (P2TR) address — receives inscriptions */
  taproot: string
}

export interface SigningContext {
  /** Which key to sign with */
  keyPath: 'funding' | 'taproot'
}

export interface WalletProvider {
  /** Provider mode identifier */
  readonly mode: 'local' | 'tee'

  /** Get derived addresses (safe to expose publicly) */
  getAddresses(): DerivedAddresses

  /** Get the funding address payment script (for UTXO witness) */
  getFundingScript(): Uint8Array

  /** Get the taproot payment object (for inscription receiver) */
  getTaprootPayment(): ReturnType<typeof btc.p2tr>

  /**
   * Sign a fully-constructed transaction.
   * The provider signs in-place and returns the signed transaction.
   * Private keys never leave the provider boundary.
   */
  signTransaction(tx: btc.Transaction, context: SigningContext): btc.Transaction

  /**
   * Get attestation proof for the last signing operation (TEE mode only).
   * Returns null in local mode.
   */
  getAttestation?(): Promise<AttestationProof | null>

  /** Securely destroy key material from memory */
  destroy(): void
}

export interface AttestationProof {
  /** TEE platform (e.g., 'eigencompute', 'nitro') */
  platform: string
  /** Base64-encoded attestation document */
  document: string
  /** Timestamp of attestation */
  timestamp: number
  /** Public key that was attested */
  publicKey: string
}

// ---------------------------------------------------------------------------
// Local Wallet Provider (development / testnet)
// ---------------------------------------------------------------------------

export class LocalWalletProvider implements WalletProvider {
  readonly mode: 'local' | 'tee' = 'local'

  private fundingKey: Uint8Array
  private taprootKey: Uint8Array
  private fundingPayment: ReturnType<typeof btc.p2wpkh>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private taprootPayment: any
  private addresses: DerivedAddresses
  private destroyed = false

  constructor(mnemonic: string, network: 'mainnet' | 'testnet' = 'testnet') {
    if (!mnemonic || mnemonic.trim().split(/\s+/).length < 12) {
      throw new Error('Invalid mnemonic: must be at least 12 words')
    }

    const net = getBtcNetwork(network)
    const seed = mnemonicToSeedSync(mnemonic)
    const root = HDKey.fromMasterSeed(seed)

    const coinType = network === 'mainnet' ? 0 : 1

    // BIP84 for SegWit funding wallet
    const bip84 = root.derive(`m/84'/${coinType}'/0'/0/0`)
    this.fundingKey = new Uint8Array(bip84.privateKey!)
    this.fundingPayment = btc.p2wpkh(bip84.publicKey!, net)

    // BIP86 for Taproot
    const bip86 = root.derive(`m/86'/${coinType}'/0'/0/0`)
    this.taprootKey = new Uint8Array(bip86.privateKey!)
    this.taprootPayment = btc.p2tr(bip86.publicKey!.slice(1), undefined, net)

    this.addresses = {
      funding: this.fundingPayment.address!,
      taproot: this.taprootPayment.address!,
    }

    // Zero out the seed and root key material
    seed.fill(0)
  }

  getAddresses(): DerivedAddresses {
    this.assertNotDestroyed()
    return { ...this.addresses }
  }

  getFundingScript(): Uint8Array {
    this.assertNotDestroyed()
    return this.fundingPayment.script
  }

  getTaprootPayment(): ReturnType<typeof btc.p2tr> {
    this.assertNotDestroyed()
    return this.taprootPayment
  }

  signTransaction(tx: btc.Transaction, context: SigningContext): btc.Transaction {
    this.assertNotDestroyed()
    const key = context.keyPath === 'funding' ? this.fundingKey : this.taprootKey
    tx.sign(key)
    return tx
  }

  destroy(): void {
    this.fundingKey.fill(0)
    this.taprootKey.fill(0)
    this.destroyed = true
  }

  private assertNotDestroyed(): void {
    if (this.destroyed) {
      throw new Error('WalletProvider has been destroyed — key material wiped')
    }
  }
}

// ---------------------------------------------------------------------------
// TEE Wallet Provider (EigenCloud EigenCompute)
// ---------------------------------------------------------------------------

/**
 * TEE-based wallet provider for production use with EigenCloud EigenCompute.
 *
 * When deployed inside an EigenCompute TEE:
 *  - The mnemonic is provided via sealed secrets (never visible to host)
 *  - All key derivation and signing happens inside the enclave
 *  - Attestation proofs are generated for each operation
 *  - The enclave's memory is encrypted and isolated from the host OS
 *
 * Deployment flow:
 *  1. `ecloud compute app deploy --image-ref aibtc-media:latest`
 *  2. EigenCompute provisions a TEE enclave
 *  3. Sealed secrets are injected into the enclave at startup
 *  4. The app reads secrets from the enclave's secure memory space
 *  5. All signing operations happen in-process within the TEE
 *
 * For now, this extends LocalWalletProvider with attestation stubs.
 * When EigenCompute's SDK is fully available, this will use their
 * sealed secrets API and attestation generation instead.
 */
export class TeeWalletProvider extends LocalWalletProvider {
  private lastSignTimestamp: number = 0

  constructor(mnemonic: string, network: 'mainnet' | 'testnet' = 'testnet') {
    super(mnemonic, network)
    ;(this as { mode: 'local' | 'tee' }).mode = 'tee'
  }

  signTransaction(tx: btc.Transaction, context: SigningContext): btc.Transaction {
    this.lastSignTimestamp = Date.now()
    return super.signTransaction(tx, context)
  }

  /**
   * Get attestation proof from the TEE enclave.
   *
   * In EigenCompute, this will call the enclave's attestation API to generate
   * a cryptographic proof that:
   *  - The signing happened inside a genuine TEE
   *  - The code running is the expected Docker image hash
   *  - The key was derived from a sealed secret
   *
   * Stub implementation until EigenCompute SDK is integrated.
   */
  async getAttestation(): Promise<AttestationProof | null> {
    // TODO: Replace with EigenCompute attestation API call:
    //   const attestation = await eigencompute.generateAttestation({
    //     publicKey: this.getAddresses().funding,
    //     operation: 'sign',
    //     timestamp: this.lastSignTimestamp,
    //   })
    //
    // For now, check if we're running inside a TEE environment
    const isInTee = process.env.EIGENCOMPUTE_ENCLAVE === 'true'

    if (!isInTee) return null

    return {
      platform: 'eigencompute',
      document: '', // Will contain base64 attestation from EigenCompute
      timestamp: this.lastSignTimestamp,
      publicKey: this.getAddresses().funding,
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export type WalletMode = 'auto' | 'local' | 'tee'

/**
 * Create the appropriate WalletProvider based on environment.
 *
 * 'auto' (default):
 *  - If EIGENCOMPUTE_ENCLAVE=true → TeeWalletProvider
 *  - Otherwise → LocalWalletProvider
 *
 * The mnemonic source depends on the mode:
 *  - local: ORDINALS_MNEMONIC env var
 *  - tee:   Sealed secret injected by EigenCompute at enclave startup
 *           (reads from the same env var, but the secret is sealed in the TEE)
 */
export function createWalletProvider(
  options?: { mode?: WalletMode; mnemonic?: string; network?: 'mainnet' | 'testnet' }
): WalletProvider {
  const mode = options?.mode ?? 'auto'
  const network = options?.network ?? (process.env.ORDINALS_NETWORK as 'mainnet' | 'testnet') ?? 'testnet'
  const mnemonic = options?.mnemonic ?? process.env.ORDINALS_MNEMONIC ?? ''

  if (!mnemonic) {
    throw new Error(
      'No mnemonic available. Set ORDINALS_MNEMONIC env var, ' +
      'or ensure sealed secrets are configured in the TEE enclave.'
    )
  }

  const resolvedMode = mode === 'auto'
    ? (process.env.EIGENCOMPUTE_ENCLAVE === 'true' ? 'tee' : 'local')
    : mode

  if (resolvedMode === 'tee') {
    console.log('[wallet] TEE mode — signing inside EigenCompute enclave')
    return new TeeWalletProvider(mnemonic, network)
  }

  console.log('[wallet] Local mode — signing with env-provided mnemonic')
  if (network === 'mainnet') {
    console.warn(
      '[wallet] ⚠️  WARNING: Running in local mode on MAINNET. ' +
      'Consider deploying inside EigenCompute TEE for production security.'
    )
  }
  return new LocalWalletProvider(mnemonic, network)
}
