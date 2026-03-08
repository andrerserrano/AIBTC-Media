/**
 * Quick cartoon generator — takes a headline and generates a cartoon.
 * Uses the REAL Generator.buildPrompt (via Generator.generate) so the full
 * STYLE_TEMPLATE is applied. Also enforces scene diversity against existing cartoons.
 *
 * Usage: bun scripts/gen-cartoon.ts "Your headline here"
 */

import { generateObject } from 'ai'
import { anthropic } from '../src/ai.js'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { mkdir } from 'fs/promises'
import { EventBus } from '../src/console/events.js'
import { Cache } from '../src/cache/cache.js'
import { Generator } from '../src/pipeline/generator.js'
import { Composer } from '../src/pipeline/composer.js'
import { config } from '../src/config/index.js'
import { STYLE_TEMPLATE } from '../src/prompts/style.js'
import type { CartoonConcept } from '../src/types.js'

const headline = process.argv[2]
if (!headline) {
  console.error('Usage: bun scripts/gen-cartoon.ts "headline text"')
  process.exit(1)
}

console.log(`\n🎨 Generating cartoon for: "${headline}"\n`)

// Minimal infrastructure
const events = new EventBus(join(config.dataDir, 'events.jsonl'))
await events.init()
const imageCache = new Cache('images', 100, join(config.dataDir, 'cache-images.json'))
await imageCache.restore()

// Existing scene descriptions — ideation must avoid these settings
const EXISTING_SCENES = [
  'Bridge with construction: robots crossing a bridge while a construction worker watches (seed-1)',
  'Boardroom/conference table: robot sitting at a board meeting with humans (seed-2)',
  'Desk/office: two robots at a desk reviewing code on a screen (seed-3)',
  'Cafeteria: robots and humans eating in a corporate cafeteria (cartoon-c2222234)',
]

// Step 1: Ideate — Claude generates a cartoon concept
console.log('💡 Step 1: Ideating concept...')

const conceptSchema = z.object({
  visual: z.string().describe('Scene description for image generation — must follow AIBTC style guide'),
  composition: z.string().describe('Camera angle, character positions, framing'),
  caption: z.string().describe('The punchline caption (under 120 chars)'),
  jokeType: z.string().describe('irony, absurdity, juxtaposition, wordplay, etc.'),
  reasoning: z.string().describe('Why this is funny'),
})

const { object: concept } = await generateObject({
  model: anthropic(config.textModel),
  schema: conceptSchema,
  system: `You are the editorial cartoonist for AIBTC Media — a sharp, witty voice covering the Bitcoin agent economy.

Your style: single-panel editorial cartoons with a punchy caption underneath. Think New Yorker cartoons meets crypto Twitter.

=== VISUAL STYLE GUIDE (MUST FOLLOW) ===
${STYLE_TEMPLATE}

=== SCENE DIVERSITY ===
These scenes already exist in the collection. You MUST use a DIFFERENT setting:
${EXISTING_SCENES.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Choose from settings like: server room, factory floor, assembly line, rooftop, park bench,
elevator, waiting room, courtroom, stage/podium, protest/march, cafeteria, lab, garage,
loading dock, construction site (NOT bridge), or any creative setting that serves the joke.

=== CRITICAL RULES ===
- Bitcoin ₿ symbols: TINY and INCIDENTAL only. Never as focal point. Small icon on a mug, badge, laptop sticker.
  Never standalone, floating, glowing, or prominent. It contextualizes, never dominates.
- PURE WHITE canvas background (#FFFFFF). No grey, cream, or colored backgrounds behind the scene.
- Monochrome palette: black ink + greyscale + ONLY Bitcoin orange (#E8740C) on robot eyes + 1-2 small props
- NO text in the image except minimal 1-3 word labels on whiteboards/signs
- Robot design: dark screen-head, orange rectangle-eyes, antenna, circular ear-speakers, segmented limbs
- ABSOLUTELY NO watermarks, signatures, branding text, or logos anywhere in the image. No "AIBTC", no company names. The image must be clean.`,
  prompt: `Generate a single-panel editorial cartoon concept based on this news headline:

"${headline}"

The cartoon should find the humor, irony, or absurdity in this story. Think about what makes someone screenshot this and send it to a group chat.

REMEMBER:
- Choose a UNIQUE setting (not a boardroom, not a desk, not a bridge — those are already taken)
- Bitcoin symbols must be tiny/incidental, NEVER the focal point
- Pure white canvas, no grey backgrounds
- The scene must read in under 2 seconds`,
})

console.log(`   Visual: ${concept.visual.slice(0, 120)}...`)
console.log(`   Caption: "${concept.caption}"`)
console.log(`   Joke type: ${concept.jokeType}`)

// Step 2: Generate image via Gemini (uses the REAL Generator which applies STYLE_TEMPLATE)
console.log('\n🖼️  Step 2: Generating image...')

const cartoonConcept: CartoonConcept = {
  id: randomUUID().slice(0, 8),
  visual: concept.visual,
  composition: concept.composition,
  caption: concept.caption,
  jokeType: concept.jokeType,
  reasoning: concept.reasoning,
}

const generator = new Generator(events, imageCache)
await generator.init()

const { variants } = await generator.generate(cartoonConcept, 1)

if (variants.length === 0) {
  console.error('❌ No image generated. Check Gemini API key.')
  process.exit(1)
}

const imagePath = variants[0]
console.log(`   Image saved: ${imagePath}`)

// Step 3: Compose (add caption overlay)
console.log('\n✍️  Step 3: Composing with caption...')

const composer = new Composer(events, generator)
const composedPath = await composer.composeCartoon(imagePath, concept.caption)
console.log(`   Composed: ${composedPath}`)

// Also copy to public/images for preview
const publicDir = join(process.cwd(), 'public', 'images')
await mkdir(publicDir, { recursive: true })
const filename = `cartoon-${cartoonConcept.id}-composed.png`
const publicPath = join(publicDir, filename)
await Bun.write(publicPath, Bun.file(composedPath))
console.log(`   Copied to: public/images/${filename}`)

console.log(`\n✅ Done! Cartoon generated successfully.`)
console.log(`   Caption: "${concept.caption}"`)
console.log(`   Public: public/images/${filename}`)
