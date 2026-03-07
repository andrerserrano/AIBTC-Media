/**
 * ContentSigner — Signs editorial content with the agent's Bitcoin key.
 *
 * Provides ECDSA signatures over content hashes, proving that a specific
 * piece of content (cartoon caption, tweet text) was produced by this agent.
 *
 * Unlike Sovra's EVM-based ContentSigner (which used viem/verifyMessage),
 * this uses the Bitcoin secp256k1 key from the WalletProvider, keeping
 * all signing behind the same secure boundary.
 *
 * Signature flow:
 *   content → SHA-256(content) → secp256k1 sign → hex signature
 *
 * Verification:
 *   signature + content + public key → verify without needing private key
 */
import { createHash } from 'crypto'
import * as btc from '@scure/btc-signer'
import { hex } from '@scure/base'
import { HDKey } from '@scure/bip32'
import { mnemonicToSeedSync } from '@scure/bip39'
import { secp256k1 } from '@noble/curves/secp256k1'

export class ContentSigner {
  private privateKey: Uint8Array
  readonly publicKey: string
  readonly address: string

  constructor(mnemonic: string, network: 'mainnet' | 'testnet' = 'testnet') {
    const seed = mnemonicToSeedSync(mnemonic)
    const root = HDKey.fromMasterSeed(seed)
    const coinType = network === 'mainnet' ? 0 : 1

    // Use BIP86 Taproot key for content signing
    const bip86 = root.derive(`m/86'/${coinType}'/0'/0/0`)
    this.privateKey = new Uint8Array(bip86.privateKey!)
    this.publicKey = hex.encode(bip86.publicKey!)
    this.address = btc.p2tr(
      bip86.publicKey!.slice(1),
      undefined,
      network === 'mainnet' ? btc.NETWORK : btc.TEST_NETWORK,
    ).address!

    // Zero out seed
    seed.fill(0)
  }

  /**
   * Sign content with the agent's private key.
   * Returns hex-encoded Schnorr signature.
   */
  async sign(content: string): Promise<string> {
    const hash = this.hashContent(content)
    const sig = secp256k1.sign(hash, this.privateKey)
    return sig.toCompactHex()
  }

  /**
   * Verify a content signature against a public key.
   * Static method — no private key needed.
   */
  static verify(content: string, signature: string, publicKeyHex: string): boolean {
    try {
      const hash = ContentSigner.hashContentStatic(content)
      const sigBytes = hex.decode(signature)
      const pubKey = hex.decode(publicKeyHex)
      return secp256k1.verify(sigBytes, hash, pubKey)
    } catch {
      return false
    }
  }

  /** Destroy private key material */
  destroy(): void {
    this.privateKey.fill(0)
  }

  private hashContent(content: string): Uint8Array {
    return new Uint8Array(
      createHash('sha256').update(content).digest()
    )
  }

  private static hashContentStatic(content: string): Uint8Array {
    return new Uint8Array(
      createHash('sha256').update(content).digest()
    )
  }
}
