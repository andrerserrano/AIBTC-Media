import sharp from 'sharp'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, basename, extname } from 'path'
import { getOrdinalConfig } from './utils.js'

export interface CompressResult {
  inputPath: string
  outputPath: string
  inputSize: number
  outputSize: number
  ratio: number
}

/**
 * Compress an image to a small WebP thumbnail suitable for on-chain inscription.
 * Default: 200x200, quality 35 → typically 2-5KB output.
 */
export async function compressImage(
  inputPath: string,
  outputDir?: string,
  options?: { width?: number; height?: number; quality?: number }
): Promise<CompressResult> {
  const config = getOrdinalConfig()
  const width = options?.width ?? config.compressWidth
  const height = options?.height ?? config.compressHeight
  const quality = options?.quality ?? config.compressQuality

  if (!outputDir) {
    outputDir = join(config.dataDir, 'compressed')
  }
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
  }

  const inputBuffer = readFileSync(inputPath)
  const inputSize = inputBuffer.length

  const name = basename(inputPath, extname(inputPath))
  const outputPath = join(outputDir, `${name}.webp`)

  const outputBuffer = await sharp(inputBuffer)
    .resize(width, height, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality })
    .toBuffer()

  writeFileSync(outputPath, outputBuffer)

  return {
    inputPath,
    outputPath,
    inputSize,
    outputSize: outputBuffer.length,
    ratio: Number((outputBuffer.length / inputSize * 100).toFixed(1)),
  }
}
