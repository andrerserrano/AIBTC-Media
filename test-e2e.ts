/**
 * End-to-end pipeline test: signal → cartoon
 *
 * Runs the full pipeline on a hardcoded signal to validate:
 * 1. Scorer picks it up
 * 2. Ideator generates a scene concept + caption
 * 3. Generator renders the image via Gemini
 * 4. Composer frames it with orange divider + caption
 *
 * Usage:
 *   GOOGLE_GENERATIVE_AI_API_KEY=<key> ANTHROPIC_API_KEY=<key> npx tsx test-e2e.ts
 */

import { generateObject, generateText } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'

const anthropic = createAnthropic({ baseURL: 'https://api.anthropic.com/v1' })
import { google } from '@ai-sdk/google'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import sharp from 'sharp'
import { STYLE_TEMPLATE, CAPTION_SYSTEM, buildScenePrompt, ACCENT_COLOR, CAPTION_STYLE } from './src/prompts/style.js'

const OUTPUT_DIR = '.data-test/e2e'
const IMAGE_MODEL = 'gemini-2.5-flash-image'
const TEXT_MODEL = 'claude-sonnet-4-20250514'

// ───── STEP 1: Hardcoded signal (simulating scanner output) ─────

const testSignal = {
  title: 'Skills repo sees 5 new PRs in 24h from 5 different agents',
  summary: `The aibtcdev/skills repo is experiencing a burst of development. Five new feature PRs landed in under 24 hours from five different contributors: yield-dashboard (Fabio662 + cocoa007, competing implementations for bounty f8ee4390), Nostr signal amplification (sonic-mast), agent onboarding flow improvements, and automated testing infrastructure. This marks the fastest pace of agent-driven development in the project's history.`,
  beat: 'dev-tools',
}

// ───── STEP 2: Scene + Caption ideation (using Claude) ─────

const editorialConceptSchema = z.object({
  concepts: z.array(z.object({
    sceneDescription: z.string().describe('Detailed visual scene description for the cartoon. Describe characters, their poses, the setting, and the visual gag. Do NOT include any text or captions in the scene.'),
    caption: z.string().describe('The New Yorker-style italic caption. In quotes. Dry, observational humor.'),
    jokeType: z.string().describe('The type of humor: irony, understatement, absurdity, meta-commentary, etc.'),
    reasoning: z.string().describe('Why this concept works'),
  })),
  bestIndex: z.number().describe('Index of the strongest concept (0-based)'),
})

async function ideate(signal: typeof testSignal) {
  console.log('\n── STEP 2: Ideating scene + caption ──')
  console.log(`  Signal: "${signal.title}"`)

  const { object } = await generateObject({
    model: anthropic(TEXT_MODEL),
    schema: editorialConceptSchema,
    system: `You are the creative director of AIBTC.Studio, an autonomous editorial cartoon outlet covering the Bitcoin agent economy.

You create single-panel editorial cartoons in the tradition of The New Yorker — one image, one caption, maximum impact.

${CAPTION_SYSTEM}

SCENE GUIDELINES:
- The scene should work WITHOUT any text — pure visual storytelling
- Characters are robots/agents (boxy bodies, screen-faces, orange-glowing eyes) and/or humans (developers, PMs)
- Use visual metaphors: assembly lines, waiting rooms, office chaos, factory floors, boardrooms
- The humor comes from agents behaving like humans in absurd workplace situations
- Maximum 4-5 characters. Fewer is better.
- Strong, clear focal point — readable in 2 seconds

IMPORTANT:
- The scene description should be detailed enough for an image generation model
- Describe character poses, expressions, and the physical environment
- The caption is separate from the image — don't reference text or speech in the scene`,
    prompt: `Generate 3 editorial cartoon concepts for this news:

HEADLINE: "${signal.title}"

SUMMARY: ${signal.summary}

BEAT: ${signal.beat}

Each concept should take a DIFFERENT comedic angle on this story.`,
  })

  const best = object.concepts[object.bestIndex]
  console.log(`  Generated ${object.concepts.length} concepts`)
  for (const [i, c] of object.concepts.entries()) {
    const marker = i === object.bestIndex ? '  → ' : '    '
    console.log(`${marker}[${i}] ${c.jokeType}: "${c.caption}"`)
  }
  console.log(`  Winner: concept ${object.bestIndex}`)

  return best
}

// ───── STEP 3: Image generation (using Gemini) ─────

async function generateImage(sceneDescription: string): Promise<Buffer> {
  console.log('\n── STEP 3: Generating image via Gemini ──')

  const prompt = buildScenePrompt(sceneDescription)

  console.log(`  Sending to ${IMAGE_MODEL}...`)
  const { files } = await generateText({
    model: google(IMAGE_MODEL),
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
  })

  if (!files || files.length === 0) {
    throw new Error('No image returned from Gemini')
  }

  const buf = Buffer.from(files[0].base64, 'base64')
  console.log(`  ✅ Image generated (${(buf.length / 1024).toFixed(0)}KB)`)
  return buf
}

// ───── STEP 4: Compose final cartoon (image + caption) ─────

async function compose(imageBuffer: Buffer, caption: string): Promise<Buffer> {
  console.log('\n── STEP 4: Composing final cartoon ──')

  const {
    fontFamily, fontSize, fontStyle, color,
    dividerColor, dividerWidth, backgroundColor,
    captionHeight, maxCharsPerLine, lineHeight,
  } = CAPTION_STYLE

  // Trim whitespace
  const trimmed = await sharp(imageBuffer).trim({ threshold: 30 }).toBuffer()
  const meta = await sharp(trimmed).metadata()
  const imgW = meta.width!
  const imgH = meta.height!

  const padding = 20
  const totalWidth = imgW + padding * 2
  const totalHeight = imgH + captionHeight + padding * 2

  // Word wrap
  const words = caption.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const word of words) {
    if ((cur + ' ' + word).trim().length > maxCharsPerLine) {
      lines.push(cur.trim())
      cur = word
    } else {
      cur = (cur + ' ' + word).trim()
    }
  }
  if (cur) lines.push(cur.trim())

  const captionStartY = imgH + padding * 2 + 8
  const dividerY = imgH + padding * 2
  const escXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  const textEls = lines.map((line, i) => {
    const y = captionStartY + i * lineHeight + fontSize
    return `<text x="${totalWidth / 2}" y="${y}" text-anchor="middle" font-family="${fontFamily}" font-size="${fontSize}" font-style="${fontStyle}" fill="${color}">${escXml(line)}</text>`
  }).join('\n')

  const svg = `<svg width="${totalWidth}" height="${totalHeight}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${totalWidth}" height="${totalHeight}" fill="${backgroundColor}"/>
    <rect x="${padding - 1}" y="${padding - 1}" width="${imgW + 2}" height="${imgH + 2}" fill="none" stroke="#ddd" stroke-width="1"/>
    <line x1="${padding}" y1="${dividerY}" x2="${totalWidth - padding}" y2="${dividerY}" stroke="${dividerColor}" stroke-width="${dividerWidth}"/>
    ${textEls}
  </svg>`

  const result = await sharp(Buffer.from(svg))
    .composite([{ input: trimmed, top: padding, left: padding }])
    .png()
    .toBuffer()

  console.log(`  ✅ Final cartoon: ${totalWidth}x${totalHeight} (${(result.length / 1024).toFixed(0)}KB)`)
  return result
}

// ───── MAIN ─────

async function main() {
  // Check env vars
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    console.error('❌ GOOGLE_GENERATIVE_AI_API_KEY not set')
    process.exit(1)
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY not set')
    process.exit(1)
  }

  await mkdir(OUTPUT_DIR, { recursive: true })

  console.log('═══════════════════════════════════════')
  console.log('  AIBTC.Studio — End-to-End Pipeline Test')
  console.log('═══════════════════════════════════════')
  console.log(`\n── STEP 1: Signal ──`)
  console.log(`  "${testSignal.title}"`)

  // Ideate
  const concept = await ideate(testSignal)

  // Generate image
  const rawImage = await generateImage(concept.sceneDescription)
  await writeFile(join(OUTPUT_DIR, 'raw-image.png'), rawImage)

  // Compose final
  const final = await compose(rawImage, concept.caption)
  await writeFile(join(OUTPUT_DIR, 'final-cartoon.png'), final)

  // Also save metadata
  await writeFile(join(OUTPUT_DIR, 'metadata.json'), JSON.stringify({
    signal: testSignal,
    concept,
    timestamp: new Date().toISOString(),
  }, null, 2))

  console.log('\n═══════════════════════════════════════')
  console.log('  ✅ Pipeline complete!')
  console.log(`  Output: ${OUTPUT_DIR}/final-cartoon.png`)
  console.log('═══════════════════════════════════════')
}

main().catch((err) => {
  console.error('Pipeline failed:', err)
  process.exit(1)
})
