import sharp from 'sharp'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import type { StripConcept } from '../types.js'
import { EventBus } from '../console/events.js'
import { config } from '../config/index.js'
import { uploadToR2 } from '../cdn/r2.js'
import { ACCENT_COLOR, CAPTION_STYLE } from '../prompts/style.js'
import type { Generator } from './generator.js'

/**
 * Composer — Assembles a single-panel editorial cartoon with caption.
 *
 * Format: image + orange divider + italic caption on cream background.
 * "The New Yorker, but for the AI agent economy."
 */
export class Composer {
  private imageDir: string

  constructor(
    private events: EventBus,
    private generator: Generator,
  ) {
    this.imageDir = join(config.dataDir, 'images')
  }

  /**
   * Compose a finished editorial cartoon from a raw panel image and caption.
   *
   * Steps:
   * 1. Trim whitespace from the generated image
   * 2. Add thin border frame
   * 3. Add orange divider line
   * 4. Render italic caption in serif font
   * 5. Export final PNG
   */
  async compose(
    concept: StripConcept,
    panelImages: string[],
  ): Promise<string> {
    this.events.transition('composing')
    this.events.monologue(`Composing editorial cartoon: "${concept.headline}"`)

    if (panelImages.length === 0) {
      throw new Error('No panel image to compose')
    }

    // Use the first (and typically only) panel image
    const rawImage = await readFile(panelImages[0])

    // Compose with caption
    const caption = concept.caption || concept.headline
    const composed = await this.composeWithCaption(rawImage, caption)

    // Save final image
    await mkdir(this.imageDir, { recursive: true })
    const filename = `${concept.id}-cartoon.png`
    const filepath = join(this.imageDir, filename)
    await writeFile(filepath, composed)
    uploadToR2(filepath, 'images').catch(() => {})

    this.events.monologue(`Cartoon composed: ${filepath}`)
    return filepath
  }

  /**
   * Compose a raw image buffer with a caption.
   * Can be used standalone for testing.
   */
  async composeWithCaption(imageBuffer: Buffer, caption: string): Promise<Buffer> {
    const {
      fontFamily,
      fontSize,
      fontStyle,
      color,
      dividerColor,
      dividerWidth,
      backgroundColor,
      captionHeight,
      maxCharsPerLine,
      lineHeight,
    } = CAPTION_STYLE

    // Trim excess whitespace from the generated image
    const trimmed = await sharp(imageBuffer).trim({ threshold: 30 }).toBuffer()
    const meta = await sharp(trimmed).metadata()
    const imgW = meta.width!
    const imgH = meta.height!

    // Layout dimensions
    const padding = 20
    const totalWidth = imgW + padding * 2
    const totalHeight = imgH + captionHeight + padding * 2

    // Word wrap the caption
    const lines = this.wrapText(caption, maxCharsPerLine)
    const captionStartY = imgH + padding * 2 + 8
    const dividerY = imgH + padding * 2

    // Render caption text elements
    const textElements = lines
      .map((line, i) => {
        const y = captionStartY + i * lineHeight + fontSize
        const escaped = line
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
        return `<text x="${totalWidth / 2}" y="${y}" text-anchor="middle" font-family="${fontFamily}" font-size="${fontSize}" font-style="${fontStyle}" fill="${color}">${escaped}</text>`
      })
      .join('\n')

    // Build the frame + caption SVG
    const frameSvg = `<svg width="${totalWidth}" height="${totalHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${totalWidth}" height="${totalHeight}" fill="${backgroundColor}"/>
      <rect x="${padding - 1}" y="${padding - 1}" width="${imgW + 2}" height="${imgH + 2}" fill="none" stroke="#ddd" stroke-width="1"/>
      <line x1="${padding}" y1="${dividerY}" x2="${totalWidth - padding}" y2="${dividerY}" stroke="${dividerColor}" stroke-width="${dividerWidth}"/>
      ${textElements}
    </svg>`

    // Composite: frame SVG base + trimmed image on top
    return sharp(Buffer.from(frameSvg))
      .composite([
        { input: trimmed, top: padding, left: padding },
      ])
      .png()
      .toBuffer()
  }

  private wrapText(text: string, maxChars: number): string[] {
    const words = text.split(' ')
    const lines: string[] = []
    let current = ''

    for (const word of words) {
      if ((current + ' ' + word).trim().length > maxChars) {
        lines.push(current.trim())
        current = word
      } else {
        current = (current + ' ' + word).trim()
      }
    }
    if (current) lines.push(current.trim())

    return lines
  }
}
