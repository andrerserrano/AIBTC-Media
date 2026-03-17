import { generateText, generateObject } from 'ai'
import { anthropic } from '../ai.js'
import { google } from '@ai-sdk/google'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { z } from 'zod'
import sharp from 'sharp'
import { uploadToR2 } from '../cdn/r2.js'
import type { CartoonConcept, StripConcept, Panel } from '../types.js'
import { Cache } from '../cache/cache.js'
import { EventBus } from '../console/events.js'
import { config } from '../config/index.js'
import { STYLE_TEMPLATE, buildScenePrompt, stripTextFromVisual } from '../prompts/style.js'
import type { TwitterReadProvider } from '../twitter/provider.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SIGNATURE_PATH = join(__dirname, '..', 'assets', 'aibtc_studio_signature.png')

const subjectExtractionSchema = z.object({
  subjects: z.array(z.object({
    name: z.string().describe('Full name or product name'),
    type: z.enum(['person', 'product', 'company', 'other']),
    twitterHandle: z.string().optional().describe('Twitter handle if known, without @'),
  })),
})

export class Generator {
  private imageDir: string
  private signatureBuffer: Buffer | null = null
  private refImageCache = new Map<string, string>()

  constructor(
    private events: EventBus,
    private imageCache: Cache,
    private twitterApiIo?: TwitterReadProvider,
  ) {
    this.imageDir = join(config.dataDir, 'images')
  }

  async init(): Promise<void> {
    await mkdir(this.imageDir, { recursive: true })
    try {
      this.signatureBuffer = await readFile(SIGNATURE_PATH)
    } catch {
      this.events.monologue('Signature file not found — cartoons will be unsigned.')
    }
  }

  // --- Multi-panel strip generation ---

  /**
   * Generate all panels for a comic strip.
   * Each panel is rendered individually with character consistency context,
   * then returns file paths for each panel image.
   */
  async generateStrip(concept: StripConcept): Promise<{ panelImages: string[]; prompts: string[] }> {
    this.events.transition('generating')
    this.events.monologue(
      `Generating ${concept.panels.length}-panel strip: "${concept.headline}"`,
    )

    const panelImages: string[] = []
    const prompts: string[] = []

    // Build character consistency block (shared across all panels)
    const characterBlock = this.buildCharacterBlock(concept)

    for (const panel of concept.panels) {
      const panelPrompt = this.buildPanelPrompt(panel, concept, characterBlock)
      prompts.push(panelPrompt)

      this.events.monologue(
        `Panel ${panel.index + 1}/${concept.panels.length} (${panel.narrativeRole}): generating...`,
      )
      this.events.emit({
        type: 'generate',
        prompt: panelPrompt.slice(0, 200),
        variantCount: 1,
        ts: Date.now(),
      })

      try {
        const refImages = panel.index === 0
          ? await this.findReferenceImages({
              id: concept.id,
              topicId: concept.topicId,
              visual: panel.visual,
              composition: panel.composition,
              caption: concept.caption,
              jokeType: concept.jokeType,
              reasoning: concept.reasoning,
              referenceImageUrls: concept.referenceImageUrls,
            })
          : (concept.referenceImageUrls ?? [])

        const messages = await this.buildMessages(panelPrompt, refImages)
        const { files } = await generateText({
          model: google(config.imageModel),
          messages,
        })

        if (files && files.length > 0) {
          const file = files[0]
          const filename = `${concept.id}-panel${panel.index + 1}.png`
          const filepath = join(this.imageDir, filename)
          const raw = Buffer.from(file.base64, 'base64')
          await writeFile(filepath, raw) // No signature on individual panels
          uploadToR2(filepath, 'images').catch(() => {})
          panelImages.push(filepath)
          this.events.monologue(`Panel ${panel.index + 1} generated.`)
        } else {
          this.events.monologue(`Panel ${panel.index + 1}: no image returned. Skipping.`)
        }
      } catch (err) {
        this.events.monologue(
          `Panel ${panel.index + 1} failed: ${(err as Error).message}`,
        )
      }
    }

    return { panelImages, prompts }
  }

  private buildCharacterBlock(concept: StripConcept): string {
    if (concept.characters.length === 0) return ''

    return [
      'CHARACTER REFERENCE SHEET — these characters MUST look identical in every panel:',
      ...concept.characters.map((c, i) =>
        `  Character ${i + 1}: "${c.name}" (${c.role})\n    ${c.description}`
      ),
      '',
      'CRITICAL: Maintain exact proportions, clothing, colors, and features for each character.',
    ].join('\n')
  }

  private buildPanelPrompt(panel: Panel, concept: StripConcept, characterBlock: string): string {
    return buildScenePrompt([
      characterBlock,
      '',
      `CONTEXT: "${concept.headline}" — ${concept.narrativeArc}`,
      '',
      `SCENE: ${stripTextFromVisual(panel.visual)}`,
      '',
      `COMPOSITION: ${panel.composition}`,
    ].join('\n'))
  }

  // --- Legacy single-panel generation ---

  async generate(
    concept: CartoonConcept,
    variantCount: number = config.imageVariants,
  ): Promise<{ variants: string[]; prompt: string }> {
    this.events.transition('generating')

    const prompt = this.buildPrompt(concept)
    const cacheKey = Cache.key(`img:${prompt}`)
    const cached = this.imageCache.get(cacheKey) as { variants: string[] } | null
    if (cached) {
      this.events.monologue('Using cached image variants for this prompt.')
      return { variants: cached.variants, prompt }
    }

    this.events.monologue(
      `Generating ${variantCount} image variants. Prompt: "${prompt.slice(0, 120)}..."`,
    )
    this.events.emit({
      type: 'generate',
      prompt: prompt.slice(0, 200),
      variantCount,
      ts: Date.now(),
    })

    const variants: string[] = []

    for (let i = 0; i < variantCount; i++) {
      try {
        const refImages = i === 0 ? await this.findReferenceImages(concept) : (concept.referenceImageUrls ?? [])
        const messages = await this.buildMessages(prompt, refImages)
        const { files } = await generateText({
          model: google(config.imageModel),
          messages,
        })

        if (files && files.length > 0) {
          const file = files[0]
          const filename = `${concept.id}-v${i + 1}.png`
          const filepath = join(this.imageDir, filename)
          const raw = Buffer.from(file.base64, 'base64')
          const signed = await this.applySignature(raw)
          await writeFile(filepath, signed)
          uploadToR2(filepath, 'images').catch(() => {})
          variants.push(filepath)
          this.events.monologue(`Variant ${i + 1}/${variantCount} generated.`)
        } else {
          this.events.monologue(`Variant ${i + 1}: no image returned. Skipping.`)
        }
      } catch (err) {
        this.events.monologue(
          `Variant ${i + 1} failed: ${(err as Error).message}. Moving on.`,
        )
      }
    }

    if (variants.length > 0) {
      this.imageCache.set(cacheKey, { variants }, config.cache.imagePromptTtlMs)
    }

    return { variants, prompt }
  }

  async retry(
    concept: CartoonConcept,
    feedback: string,
    attempt: number,
  ): Promise<{ variants: string[]; prompt: string }> {
    this.events.monologue(
      `Retry ${attempt}/${config.maxImageRetries}. Adjusting prompt based on: ${feedback}`,
    )
    const modified = {
      ...concept,
      composition: `${concept.composition}\n\nIMPORTANT ADJUSTMENT (attempt ${attempt}): ${feedback}`,
    }

    // Bypass cache on retries — the whole point is to generate a FRESH image
    this.events.transition('generating')
    const prompt = this.buildPrompt(modified)

    this.events.monologue(
      `Generating 1 image variant (retry, no cache). Prompt: "${prompt.slice(0, 120)}..."`,
    )
    this.events.emit({
      type: 'generate',
      prompt: prompt.slice(0, 200),
      variantCount: 1,
      ts: Date.now(),
    })

    const variants: string[] = []

    try {
      const refImages = await this.findReferenceImages(modified)
      const messages = await this.buildMessages(prompt, refImages)
      const { files } = await generateText({
        model: google(config.imageModel),
        messages,
      })

      if (files && files.length > 0) {
        const file = files[0]
        const filename = `${modified.id}-retry${attempt}.png`
        const filepath = join(this.imageDir, filename)
        const raw = Buffer.from(file.base64, 'base64')
        const signed = await this.applySignature(raw)
        await writeFile(filepath, signed)
        uploadToR2(filepath, 'images').catch(() => {})
        variants.push(filepath)
        this.events.monologue(`Retry ${attempt} variant generated.`)
      } else {
        this.events.monologue(`Retry ${attempt}: no image returned.`)
      }
    } catch (err) {
      this.events.monologue(
        `Retry ${attempt} failed: ${(err as Error).message}. Moving on.`,
      )
    }

    return { variants, prompt }
  }

  // --- Shared utilities ---

  private async findReferenceImages(concept: CartoonConcept): Promise<string[]> {
    const urls: string[] = [...(concept.referenceImageUrls ?? [])]

    try {
      const { object } = await generateObject({
        model: anthropic('claude-haiku-4-5-20251001'),
        schema: subjectExtractionSchema,
        prompt: `Extract named people, products, or companies from this cartoon concept that would benefit from a visual reference photo:\n\nVisual: ${concept.visual}\n\nOnly include specific, real, recognizable subjects (e.g. "Sam Altman", "iPhone", "Tesla Cybertruck"). Skip generic descriptions like "a businessman" or "a robot". For people, provide their Wikipedia article title (e.g. "Sam_Altman", "Tim_Cook").`,
      })

      for (const subject of object.subjects) {
        if (this.refImageCache.has(subject.name)) {
          urls.push(this.refImageCache.get(subject.name)!)
          continue
        }

        const wikiImage = await this.fetchWikipediaImage(subject.name)
        if (wikiImage) {
          this.refImageCache.set(subject.name, wikiImage)
          urls.push(wikiImage)
          this.events.monologue(`Found reference photo for ${subject.name} via Wikipedia`)
          continue
        }

        if (this.twitterApiIo && subject.twitterHandle) {
          try {
            const user = await this.twitterApiIo.getUserInfo(subject.twitterHandle)
            if (user?.profilePicture) {
              const fullSize = user.profilePicture.replace('_normal', '')
              this.refImageCache.set(subject.name, fullSize)
              urls.push(fullSize)
              this.events.monologue(`Found reference photo for ${subject.name} via @${subject.twitterHandle}`)
            }
          } catch { /* no reference available */ }
        }
      }
    } catch {
      // Subject extraction failed — continue with whatever we have
    }

    return [...new Set(urls)].slice(0, 5)
  }

  private async fetchWikipediaImage(name: string): Promise<string | null> {
    const slug = name.replace(/\s+/g, '_')
    try {
      const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(slug)}`)
      if (!res.ok) return null
      const data = await res.json() as {
        originalimage?: { source: string }
        thumbnail?: { source: string }
      }
      return data.originalimage?.source ?? data.thumbnail?.source ?? null
    } catch {
      return null
    }
  }

  private async buildMessages(prompt: string, referenceUrls: string[]): Promise<Array<{ role: 'user'; content: Array<{ type: 'text'; text: string } | { type: 'image'; image: URL }> }>> {
    const content: Array<{ type: 'text'; text: string } | { type: 'image'; image: URL }> = []

    if (referenceUrls.length > 0) {
      content.push({
        type: 'text',
        text: 'REFERENCE IMAGES — these show the real people, products, or scene from the news story. Use them so your caricatures are RECOGNIZABLE. Exaggerate features for cartoon effect but keep the likeness. Do NOT copy the photo — draw an editorial cartoon inspired by it.',
      })

      for (const url of referenceUrls) {
        try {
          content.push({ type: 'image', image: new URL(url) })
        } catch {
          // Invalid URL, skip
        }
      }
    }

    content.push({ type: 'text', text: prompt })

    return [{ role: 'user' as const, content }]
  }

  async applySignature(imageBuffer: Buffer): Promise<Buffer> {
    if (!this.signatureBuffer) return imageBuffer

    try {
      const image = sharp(imageBuffer)
      const { width, height } = await image.metadata()
      if (!width || !height) return imageBuffer

      const sigWidth = Math.round(width * 0.12)
      const margin = Math.round(width * 0.02)

      const resizedSig = await sharp(this.signatureBuffer)
        .resize({ width: sigWidth, withoutEnlargement: true })
        .toBuffer()

      return image
        .composite([{
          input: resizedSig,
          gravity: 'northeast',
          top: margin,
          left: width - sigWidth - margin,
        }])
        .toBuffer()
    } catch {
      return imageBuffer
    }
  }

  private buildPrompt(concept: CartoonConcept): string {
    const mood = this.inferMood(concept)

    return [
      STYLE_TEMPLATE,
      '',
      '---',
      '',
      `COLOR MOOD: ${mood}`,
      '',
      `JOKE MECHANIC: ${concept.jokeType}`,
      `The humor works through ${concept.jokeType.toLowerCase()}. The image must set up or amplify this comedic mechanism visually.`,
      '',
      `SCENE DESCRIPTION:`,
      stripTextFromVisual(concept.visual),
      '',
      `COMPOSITION & CAMERA:`,
      concept.composition,
      '',
      `WHY THIS IS FUNNY (context for rendering decisions):`,
      concept.reasoning,
      '',
      `VISUAL PRIORITIES (in order):`,
      `1. The primary visual gag must read instantly — a viewer should understand the joke within 2 seconds of looking at the image`,
      `2. Character expressions and body language carry the emotion — exaggerate posture, gestures, and reactions`,
      `3. One key supporting detail that rewards a second look`,
      `4. Clean negative space — resist the urge to fill every corner`,
      '',
      `CRITICAL REMINDERS:`,
      `- ZERO TEXT IN THE IMAGE. No words, letters, numbers, labels, speech bubbles, or writing of any kind.`,
      `  Whiteboards show only abstract shapes or wavy lines. Papers are blank. Screens show abstract graphics only.`,
      `- Single panel, PURE WHITE canvas (#FFFFFF, NEVER cream/grey/tinted background), thick border`,
      `- Robot bodies are WHITE with bold black outlines. Shading uses FLAT SOLID grey fills ONLY.`,
      `- ONLY greyscale + Bitcoin orange (#E8740C). No blues, teals, greens, or other hues.`,
      `- Robot bodies: EXACTLY 2 arms, EXACTLY 2 legs. Count them.`,
      `- Laptop backs are PLAIN FLAT RECTANGLES — no logos or symbols. Not Apple, not any brand.`,
      `- NO watermarks, signatures, or branding text anywhere.`,
      ``,
      `ABSOLUTE PROHIBITIONS (violating any of these makes the image unusable):`,
      `- NO halftone dots, stipple, crosshatch, or screentone on ANY surface — use flat solid fills only`,
      `- NO dark or grey backgrounds — the canvas is PURE WHITE (#FFFFFF)`,
      `- NO environmental fills that cover more than 30% of the frame — ground planes are thin strips with white above`,
      `- NO text, letters, numbers, or words of any kind — the ₿ symbol is the ONLY exception (it is brand iconography, not text)`,
      `- Robot screen-faces have a dark background + two SMALL orange rectangle-eyes as the primary feature — NO mouths or noses. Subtle eyebrow lines or round glasses are OK as accessories but must not dominate the face.`,
      `- NO brand logos on any device — laptop backs are plain flat rectangles with zero markings`,
    ].join('\n')
  }

  private inferMood(concept: CartoonConcept): string {
    const text = `${concept.visual} ${concept.jokeType} ${concept.reasoning}`.toLowerCase()
    // All moods use ONLY greyscale + Bitcoin orange (#E8740C).
    // Mood affects contrast and weight, never hue.
    if (/chaos|urgent|breaking|disaster|fire|crash|panic|war/.test(text)) {
      return 'HIGH CONTRAST — deep blacks, bright whites, minimal mid-grey. Bold, punchy energy. Monochrome + orange only.'
    }
    if (/money|business|corporate|ceo|profit|market|stock/.test(text)) {
      return 'HEAVY — rich dark greys, strong shadows, dense halftone shading. Weighty, serious. Monochrome + orange only.'
    }
    if (/tech|ai|robot|algorithm|data|digital|screen|phone|computer/.test(text)) {
      return 'CLEAN — light greys, generous white space, precise lines. Clinical, modern. Monochrome + orange only.'
    }
    return 'WARM — soft mid-greys, gentle halftone shading, balanced contrast. Wry, human. Monochrome + orange only.'
  }
}
