import { getOrdinalConfig, satToUsd } from './utils.js'

export interface FeeEstimate {
  feeRate: number        // sat/vB recommended
  estimatedVsize: number // virtual bytes
  estimatedFee: number   // total sats
  estimatedUSD: number   // approximate cost
  withinBudget: boolean
  maxFeeRate: number
  maxCostUSD: number
}

/**
 * Fetch recommended fee rate from mempool.space and estimate inscription cost.
 * Returns whether the inscription is within the configured budget.
 */
export async function estimateFees(contentSizeBytes: number): Promise<FeeEstimate> {
  const config = getOrdinalConfig()

  // Fetch recommended fees from mempool
  const res = await fetch(`${config.mempoolApi}/v1/fees/recommended`)
  if (!res.ok) throw new Error(`Fee API error: ${res.status}`)
  const fees = await res.json() as {
    fastestFee: number
    halfHourFee: number
    hourFee: number
    economyFee: number
    minimumFee: number
  }

  // Use economy fee for inscriptions (not time-sensitive)
  let feeRate = fees.economyFee

  // Estimate vsize for inscription tx:
  // Commit tx: ~150 vB
  // Reveal tx: ~100 vB overhead + content in witness (1/4 weight)
  const commitVsize = 150
  const revealOverhead = 100
  const witnessWeight = contentSizeBytes // witness bytes at 1/4 discount
  const revealVsize = revealOverhead + Math.ceil(witnessWeight / 4)
  const totalVsize = commitVsize + revealVsize

  const estimatedFee = totalVsize * feeRate
  const estimatedUSD = satToUsd(estimatedFee)

  const withinBudget = feeRate <= config.maxFeeRate && estimatedUSD <= config.maxCostUSD

  return {
    feeRate,
    estimatedVsize: totalVsize,
    estimatedFee,
    estimatedUSD: Number(estimatedUSD.toFixed(2)),
    withinBudget,
    maxFeeRate: config.maxFeeRate,
    maxCostUSD: config.maxCostUSD,
  }
}

/**
 * Quick check: are current fees acceptable for inscription?
 */
export async function feesAcceptable(contentSizeBytes: number): Promise<boolean> {
  try {
    const estimate = await estimateFees(contentSizeBytes)
    return estimate.withinBudget
  } catch {
    return false // If we can't check fees, don't inscribe
  }
}
