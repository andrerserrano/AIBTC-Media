import sharp from 'sharp'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import type { StripConcept, StripLayout, Panel, ComicStrip, StripCritique } from '../types.js'
import { EventBus } from '../console/events.js'
import { config } from '../config/index.js'
import { uploadToR2 } from '../cdn/r2.js'
import type { Generator } from './generator.js'

/** Layout constants */
const PANEL_SIZE = 1024              // Each panel is 1024x1024
const GUTTER = 16                     // Gap between panels
const BORDER = 8                      // Outer border width
const BORDER_COLOR = '#1a1a1a'        // Near-black border
const BG_COLOR = '#ffffff'            // White background
const HEADLINE_HEIGHT = 80            // Space for strip headline
const CAPTION_BAR_HEIGHT = 0          // Caption is posted as tweet text, not in image

/** Dialogue bubble styling */
const BUBBLE_PADDING = 16
const BUBBLE_FONT_SIZE = 28
const BUBBLE_MAX_WIDTH = 280
const BUBBLE_BG = '#ffffff'
const BUBBLE_BORDER_COLOR = '#1a1a1a'
const BUBBLE_TEXT_COLOR = '#1a1a1a'
const BUBBLE_TAIL_SIZE = 12

/**
 * Composer — Assembles individual panel images into a complete comic strip.
 *
 * Handles:
 * - Panel stitching (horizontal strips and 2x2 grids)
 * - Headline rendering
 * - Dialogue bubble overlays
 * - Signature watermark
 * - Final export for posting
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
   * Compose a complete comic strip from individual panel images.
   */
  async compose(
    concept: StripConcept,
    panelImages: string[],
  ): Promise<string> {
    this.events.transition('composing')
    this.events.monologue(
      `Composing ${panelImages.length}-panel strip: "${concept.headline}"`,
    )

    if (panelImages.length === 0) {
      throw new Error('No panel images to compose')
    }

    // Load and normalize all panels to the same size
    const panels = await this.loadAndNormalizePanels(panelImages)

    // Calculate final canvas dimensions based on layout
    const { width, height } = this.calculateCanvasSize(concept.layout, panels.length)

    // Create the canvas
    let canvas = sharp({
      create: {
        width,
        height,
        channels: 4,
        background: BG_COLOR,
      },
    })

    // Build composite operations
    const composites: sharp.OverlayOptions[] = []

    // Place panels on canvas
    const panelPositions = this.calculatePanelPositions(concept.layout, panels.length)

    for (let i = 0; i < panels.length; i++) {
      const pos = panelPositions[i]
      if (!pos) continue

      // Add panel border
      const borderedPanel = await this.addPanelBorder(panels[i])

      composites.push({
        input: borderedPanel,
        left: pos.x,
        top: pos.y,
      })
    }

    // Add headline at the top
    if (concept.headline) {
      const headlineSvg = this.renderHeadlineSvg(concept.headline, width)
      composites.push({
        input: Buffer.from(headlineSvg),
        left: 0,
        top: BORDER,
      })
    }

    // Compose all layers
    const composedBuffer = await canvas
      .composite(composites)
      .png()
      .toBuffer()

    // Add dialogue bubbles (as a second pass since they overlay panels)
    const withDialogue = await this.addDialogueBubbles(
      composedBuffer,
      concept.panels,
      panelPositions,
    )

    // Apply signature
    const signed = await this.generator.applySignature(withDialogue)

    // Save final strip
    const filename = `${concept.id}-strip.png`
    const filepath = join(this.imageDir, filename)
    await writeFile(filepath, signed)
    uploadToR2(filepath, 'images').catch(() => {})

    this.events.monologue(`Strip composed: ${filepath}`)

    return filepath
  }

  private async loadAndNormalizePanels(paths: string[]): Promise<Buffer[]> {
    const buffers: Buffer[] = []
    for (const path of paths) {
      const raw = await readFile(path)
      const normalized = await sharp(raw)
        .resize(PANEL_SIZE, PANEL_SIZE, { fit: 'cover' })
        .png()
        .toBuffer()
      buffers.push(normalized)
    }
    return buffers
  }

  private calculateCanvasSize(layout: StripLayout, panelCount: number): { width: number; height: number } {
    if (layout.type === 'horizontal') {
      const cols = panelCount
      const width = BORDER * 2 + cols * PANEL_SIZE + (cols - 1) * GUTTER
      const height = BORDER * 2 + HEADLINE_HEIGHT + PANEL_SIZE
      return { width, height }
    }

    // Grid (2x2)
    const width = BORDER * 2 + 2 * PANEL_SIZE + GUTTER
    const height = BORDER * 2 + HEADLINE_HEIGHT + 2 * PANEL_SIZE + GUTTER
    return { width, height }
  }

  private calculatePanelPositions(
    layout: StripLayout,
    panelCount: number,
  ): Array<{ x: number; y: number }> {
    const positions: Array<{ x: number; y: number }> = []
    const topOffset = BORDER + HEADLINE_HEIGHT

    if (layout.type === 'horizontal') {
      for (let i = 0; i < panelCount; i++) {
        positions.push({
          x: BORDER + i * (PANEL_SIZE + GUTTER),
          y: topOffset,
        })
      }
    } else {
      // 2x2 grid
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 2; col++) {
          if (positions.length >= panelCount) break
          positions.push({
            x: BORDER + col * (PANEL_SIZE + GUTTER),
            y: topOffset + row * (PANEL_SIZE + GUTTER),
          })
        }
      }
    }

    return positions
  }

  private async addPanelBorder(panelBuffer: Buffer): Promise<Buffer> {
    // Add a thin black border around each panel
    const borderWidth = 3
    const size = PANEL_SIZE + borderWidth * 2

    return sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: BORDER_COLOR,
      },
    })
      .composite([{
        input: panelBuffer,
        left: borderWidth,
        top: borderWidth,
      }])
      .resize(PANEL_SIZE, PANEL_SIZE) // Back to original size so layout math works
      .png()
      .toBuffer()
  }

  private renderHeadlineSvg(headline: string, canvasWidth: number): string {
    const escaped = headline
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')

    return `<svg width="${canvasWidth}" height="${HEADLINE_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <text
        x="${canvasWidth / 2}"
        y="${HEADLINE_HEIGHT * 0.65}"
        text-anchor="middle"
        font-family="Georgia, 'Times New Roman', serif"
        font-size="36"
        font-weight="bold"
        fill="${BUBBLE_TEXT_COLOR}"
        letter-spacing="1"
      >${escaped.toUpperCase()}</text>
    </svg>`
  }

  private async addDialogueBubbles(
    canvasBuffer: Buffer,
    panels: Panel[],
    positions: Array<{ x: number; y: number }>,
  ): Promise<Buffer> {
    const composites: sharp.OverlayOptions[] = []

    for (let i = 0; i < panels.length; i++) {
      const panel = panels[i]
      const pos = positions[i]
      if (!panel.dialogueBubbles || panel.dialogueBubbles.length === 0 || !pos) continue

      for (const bubble of panel.dialogueBubbles) {
        const bubbleSvg = this.renderBubbleSvg(bubble.text, bubble.speaker)
        const bubbleBuffer = Buffer.from(bubbleSvg)

        // Calculate bubble position within the panel
        const bubblePos = this.getBubblePosition(bubble.position, pos)
        composites.push({
          input: bubbleBuffer,
          left: bubblePos.x,
          top: bubblePos.y,
        })
      }
    }

    if (composites.length === 0) return canvasBuffer

    return sharp(canvasBuffer)
      .composite(composites)
      .png()
      .toBuffer()
  }

  private renderBubbleSvg(text: string, speaker: string): string {
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

    // Estimate bubble dimensions
    const charWidth = BUBBLE_FONT_SIZE * 0.55
    const maxCharsPerLine = Math.floor(BUBBLE_MAX_WIDTH / charWidth)
    const lines = this.wrapText(escaped, maxCharsPerLine)
    const lineHeight = BUBBLE_FONT_SIZE * 1.3

    const bubbleWidth = Math.min(
      BUBBLE_MAX_WIDTH,
      Math.max(...lines.map(l => l.length)) * charWidth + BUBBLE_PADDING * 2,
    )
    const bubbleHeight = lines.length * lineHeight + BUBBLE_PADDING * 2
    const totalHeight = bubbleHeight + BUBBLE_TAIL_SIZE

    const textElements = lines.map((line, idx) =>
      `<text x="${BUBBLE_PADDING}" y="${BUBBLE_PADDING + (idx + 1) * lineHeight - 4}" font-family="'Courier New', monospace" font-size="${BUBBLE_FONT_SIZE}" fill="${BUBBLE_TEXT_COLOR}">${line}</text>`,
    ).join('\n')

    return `<svg width="${bubbleWidth}" height="${totalHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect
        x="1" y="1"
        width="${bubbleWidth - 2}" height="${bubbleHeight - 2}"
        rx="12" ry="12"
        fill="${BUBBLE_BG}"
        stroke="${BUBBLE_BORDER_COLOR}"
        stroke-width="2"
      />
      <polygon
        points="${bubbleWidth * 0.3},${bubbleHeight - 2} ${bubbleWidth * 0.35},${totalHeight} ${bubbleWidth * 0.45},${bubbleHeight - 2}"
        fill="${BUBBLE_BG}"
        stroke="${BUBBLE_BORDER_COLOR}"
        stroke-width="2"
      />
      <rect
        x="${bubbleWidth * 0.29}" y="${bubbleHeight - 4}"
        width="${bubbleWidth * 0.18}" height="6"
        fill="${BUBBLE_BG}"
      />
      ${textElements}
    </svg>`
  }

  private getBubblePosition(
    position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right',
    panelPos: { x: number; y: number },
  ): { x: number; y: number } {
    const margin = 20

    switch (position) {
      case 'top-left':
        return { x: panelPos.x + margin, y: panelPos.y + margin }
      case 'top-right':
        return { x: panelPos.x + PANEL_SIZE - BUBBLE_MAX_WIDTH - margin, y: panelPos.y + margin }
      case 'bottom-left':
        return { x: panelPos.x + margin, y: panelPos.y + PANEL_SIZE - 120 }
      case 'bottom-right':
        return { x: panelPos.x + PANEL_SIZE - BUBBLE_MAX_WIDTH - margin, y: panelPos.y + PANEL_SIZE - 120 }
    }
  }

  private wrapText(text: string, maxChars: number): string[] {
    const words = text.split(' ')
    const lines: string[] = []
    let currentLine = ''

    for (const word of words) {
      if (currentLine.length + word.length + 1 > maxChars) {
        lines.push(currentLine)
        currentLine = word
      } else {
        currentLine = currentLine ? `${currentLine} ${word}` : word
      }
    }
    if (currentLine) lines.push(currentLine)

    return lines
  }
}
