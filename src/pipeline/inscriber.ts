/**
 * Pipeline stage: Inscriber
 *
 * Wraps the ordinals inscription engine for use inside the AIBTC-Media pipeline.
 * Inscription is NON-BLOCKING — if it fails or fees are too high, the cartoon
 * still gets posted. Provenance is simply undefined in that case.
 */
import { EventBus } from '../console/events.js'
import { inscribeImage, type InscribeImageResult } from '../ordinals/index.js'
import { getOrdinalConfig } from '../ordinals/utils.js'

export interface Provenance {
  inscriptionId: string
  commitTxid: string
  revealTxid: string
  costSat: number
  costUSD: number
  feeRate: number
  network: string
}

export class Inscriber {
  private enabled: boolean

  constructor(private events: EventBus) {
    const config = getOrdinalConfig()
    this.enabled = config.inscriptionEnabled && !!config.mnemonic

    if (this.enabled) {
      this.events.monologue(`Ordinals inscriber active on ${config.network}. Max fee: ${config.maxFeeRate} sat/vB, max cost: $${config.maxCostUSD}`)
    } else {
      this.events.monologue('Ordinals inscriber disabled (no mnemonic or INSCRIPTION_ENABLED=false)')
    }
  }

  /**
   * Attempt to inscribe the composed cartoon image onto Bitcoin.
   * Returns provenance data on success, undefined on failure/skip.
   *
   * This method NEVER throws — inscription failure should not prevent posting.
   */
  async inscribe(composedImagePath: string): Promise<Provenance | undefined> {
    if (!this.enabled) return undefined

    try {
      this.events.monologue('Inscribing cartoon onto Bitcoin...')

      const result = await inscribeImage(composedImagePath)

      if (!result) {
        this.events.monologue('Inscription skipped (fees too high, duplicate, or disabled)')
        return undefined
      }

      this.events.monologue(
        `₿ Inscribed! ${result.inscriptionId.slice(0, 12)}... ` +
        `Cost: ${result.costSat} sats (~$${result.costUSD}). ` +
        `Reveal: ${result.explorerUrl}`
      )

      return result.provenance

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.events.monologue(`Inscription failed (non-blocking): ${msg}`)
      console.error('[inscriber] Error:', err)
      return undefined
    }
  }

  /**
   * Check if inscription is currently enabled and configured.
   */
  isEnabled(): boolean {
    return this.enabled
  }
}
