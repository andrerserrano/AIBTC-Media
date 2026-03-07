// Re-export the public API
export { inscribeImage, type InscribeImageResult, type InscribeImageOptions } from './inscribe-image.js'
export { compressImage, type CompressResult } from './compress.js'
export { estimateFees, feesAcceptable, type FeeEstimate } from './estimate-fees.js'
export { getOrdinalConfig, type OrdinalConfig } from './utils.js'
export { readLog, isDuplicate, type InscriptionLogEntry } from './logger.js'
