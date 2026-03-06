/**
 * Image Generation Test Harness
 *
 * Standalone script for iterating on image prompts with Gemini.
 * Tests different style approaches and saves results for comparison.
 *
 * Usage:
 *   AI_GATEWAY_API_KEY=<key> npx tsx test-image-gen.ts
 *   AI_GATEWAY_API_KEY=<key> npx tsx test-image-gen.ts --test single-panel
 *   AI_GATEWAY_API_KEY=<key> npx tsx test-image-gen.ts --test strip-panel
 *   AI_GATEWAY_API_KEY=<key> npx tsx test-image-gen.ts --test style-compare
 */

import { generateText } from 'ai'
import { gateway } from '@ai-sdk/gateway'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

const OUTPUT_DIR = '.data-test/image-tests'
const MODEL = 'google/gemini-3-pro-image'

// ───── STYLE TEMPLATES TO TEST ─────

const STYLES = {
  /**
   * Style A: "New Yorker Editorial"
   * Clean, sophisticated, minimal. Classic editorial cartoon feel.
   */
  newYorker: `
STYLE: New Yorker editorial cartoon.
- Bold confident ink outlines with slight line weight variation
- Flat color fills, strictly limited palette: 3-4 colors max
- Simple dot-eyes, minimal facial features, expressive body language
- Slightly exaggerated proportions (heads 1.3x normal)
- Clean white background, generous negative space
- Thick 2-3px black panel border
- No photorealistic rendering — stylized cartoon
- No text, words, letters, signs, labels, or speech bubbles anywhere
`.trim(),

  /**
   * Style B: "XKCD Meets Oatmeal"
   * Simpler, more line-art focused. Internet comic energy.
   */
  xkcdOatmeal: `
STYLE: Modern webcomic, blend of XKCD clarity with The Oatmeal expressiveness.
- Clean black line art on white background
- Minimal to no color — when used, only 1-2 flat accent colors
- Stick-figure-adjacent characters with exaggerated expressions
- Very simple environments, props only when they serve the joke
- Characters convey emotion through posture and gesture, not detailed faces
- Thick consistent line weight
- No text, words, letters, signs, labels, or speech bubbles anywhere
`.trim(),

  /**
   * Style C: "Digital Illustration"
   * More polished, slightly more detailed. Modern editorial illustration.
   */
  digitalIllustration: `
STYLE: Modern digital editorial illustration.
- Clean vector-like outlines with confident strokes
- Flat color fills with a limited but vibrant palette (4-5 colors)
- Characters with slightly caricatured features and expressive faces
- Simple geometric shapes for environments
- Subtle shadow shapes (no gradients) for depth
- Contemporary, clean aesthetic — like a tech blog illustration
- No text, words, letters, signs, labels, or speech bubbles anywhere
`.trim(),

  /**
   * Style D: "Vintage Print"
   * Retro newspaper editorial cartoon vibe.
   */
  vintagePrint: `
STYLE: Vintage newspaper editorial cartoon, like 1960s-70s print comics.
- Bold ink lines with cross-hatching for texture
- Limited palette: black, one warm accent color, and white/cream
- Exaggerated caricature proportions — big heads, small bodies
- Dense, expressive linework
- Slightly rough, hand-drawn quality
- Characters with strong silhouettes
- No text, words, letters, signs, labels, or speech bubbles anywhere
`.trim(),
}

// ───── TEST SCENARIOS ─────

const TEST_PROMPTS = {
  /**
   * Bitcoin agent doing something mundane — tests our core visual identity
   */
  singlePanel: {
    scene: `A small robot wearing a Bitcoin orange hard hat sits at a tiny desk,
reviewing an enormous stack of papers labeled with checkmarks. The robot looks
exhausted, slumped in its chair. A coffee mug sits nearby, empty. Behind the
robot, a massive server rack hums with blinking lights. The contrast between
the tiny, tired robot and the massive infrastructure it manages is the visual gag.`,
    composition: `Rule of thirds — robot at left-third intersection, server rack
fills the right two-thirds. Eye travels: tired robot → empty mug → enormous
paper stack → looming servers. Low camera angle makes the servers feel even
more imposing relative to the small robot.`,
  },

  /**
   * Two characters in dialogue — tests multi-character consistency
   */
  dialogueScene: {
    scene: `Two developers at a whiteboard. Developer A (tall, wearing a Stacks
hoodie, wild curly hair, round glasses) is enthusiastically drawing an
impossibly complex architecture diagram that has spiraled across the entire
whiteboard and onto the wall. Developer B (short, neat polo shirt, skeptical
expression, arms crossed) stares at the diagram with visible concern. A small
potted plant on the desk has started wilting, implying they've been at this
for hours.`,
    composition: `Developer A at left, leaning toward whiteboard with marker
extended. Developer B at right, leaning back with crossed arms. Whiteboard
between them, covered in chaotic lines and arrows. The wilting plant is a
small background detail in the lower right. Strong diagonal energy from
Developer A's enthusiasm vs Developer B's resistance.`,
  },

  /**
   * Strip panel test — one panel from a sequence
   */
  stripPanel: {
    scene: `A confident AI agent (depicted as a sleek, chrome robot with a
briefcase) walks into a boardroom full of old-fashioned bankers in suits.
The bankers look startled, some dropping their papers. The AI agent has a
name tag that would say "Agent #47" but remember — NO TEXT in the image.
The contrast is between the futuristic robot and the stuffy, traditional
banking environment. Dark wood paneling, leather chairs, oil paintings
on walls.`,
    composition: `AI agent entering from the left doorway, silhouetted
against hallway light. Bankers arranged around a long oval table,
reacting with surprise. Camera at eye level. The room's traditional
decor (dark wood, portraits) contrasts sharply with the chrome robot.
Strong light-dark contrast at the doorway creates a dramatic entrance.`,
  },
}

// ───── TEST RUNNER ─────

async function generateImage(
  prompt: string,
  filename: string,
): Promise<void> {
  console.log(`  Generating: ${filename}...`)
  const start = Date.now()

  try {
    const { files } = await generateText({
      model: gateway(MODEL),
      messages: [{
        role: 'user',
        content: [{ type: 'text', text: prompt }],
      }],
    })

    if (files && files.length > 0) {
      const buffer = Buffer.from(files[0].base64, 'base64')
      const filepath = join(OUTPUT_DIR, filename)
      await writeFile(filepath, buffer)
      const elapsed = ((Date.now() - start) / 1000).toFixed(1)
      console.log(`  ✅ ${filename} (${elapsed}s, ${(buffer.length / 1024).toFixed(0)}KB)`)
    } else {
      console.log(`  ❌ ${filename} — no image returned`)
    }
  } catch (err) {
    console.log(`  ❌ ${filename} — ${(err as Error).message}`)
  }
}

function buildPrompt(style: string, scene: string, composition: string): string {
  return [
    style,
    '',
    'SCENE:',
    scene,
    '',
    'COMPOSITION:',
    composition,
    '',
    'CRITICAL: Do NOT include any text, words, letters, numbers, labels, or speech bubbles in the image.',
    'This is a CARTOON, not a photograph. Use flat colors and bold outlines.',
  ].join('\n')
}

async function testStyleComparison() {
  console.log('\n=== Style Comparison Test ===')
  console.log('Generating the same scene in 4 different styles...\n')

  const { scene, composition } = TEST_PROMPTS.singlePanel

  for (const [styleName, styleTemplate] of Object.entries(STYLES)) {
    const prompt = buildPrompt(styleTemplate, scene, composition)
    await generateImage(prompt, `style-${styleName}.png`)
  }
}

async function testSinglePanel() {
  console.log('\n=== Single Panel Test ===')
  console.log('Testing different scenes with the primary (New Yorker) style...\n')

  for (const [sceneName, { scene, composition }] of Object.entries(TEST_PROMPTS)) {
    const prompt = buildPrompt(STYLES.newYorker, scene, composition)
    await generateImage(prompt, `scene-${sceneName}.png`)
  }
}

async function testStripPanel() {
  console.log('\n=== Strip Panel Consistency Test ===')
  console.log('Generating 3 panels of the same characters to test consistency...\n')

  const characterBlock = `
CHARACTER REFERENCE — must look IDENTICAL in every panel:
  Character 1: "Ada" — A small, cheerful robot with a round head, single
    antenna, orange LED eyes, and a Bitcoin-orange chest plate. Short,
    stubby proportions. Always has a slight forward lean, curious posture.
  Character 2: "Max" — A tall, lanky human developer with messy dark hair,
    thick-rimmed round glasses, wearing a wrinkled gray hoodie. Perpetual
    slight slouch, hands often in pockets or gesturing.

CRITICAL: These characters must have EXACTLY the same proportions, clothing,
colors, and features in every panel.`

  const panels = [
    {
      name: 'panel1-setup',
      scene: `Ada (the small orange robot) and Max (the tall developer) stand
side by side looking at a computer monitor. Ada is pointing excitedly at
the screen. Max has his arms crossed, looking skeptical. The monitor shows
abstract colored shapes (no text). Clean white background.`,
      composition: `Ada at left, Max at right. Monitor between them. Ada's
pointing arm creates a diagonal line toward the screen. Max's crossed
arms create a closed, resistant posture. Square composition (1:1).`,
    },
    {
      name: 'panel2-build',
      scene: `Same room. Ada is now furiously typing on the keyboard, a blur
of mechanical arms. Max has leaned in closer to the monitor, his skepticism
turning to curiosity. His glasses are sliding down his nose. The monitor
now shows more complex abstract shapes. Clean white background.`,
      composition: `Ada at left, crouched over keyboard with intense focus.
Max leaning in from the right, one hand pushing up his glasses. The
energy has shifted — both characters now oriented toward the screen.
Square composition (1:1).`,
    },
    {
      name: 'panel3-punchline',
      scene: `Same room. The monitor now shows a single simple shape (like a
smiley face or checkmark pattern — no text). Ada has her arms raised in
triumph, LED eyes bright. Max has his jaw dropped, glasses askew, genuinely
impressed. He's reaching out to high-five Ada. Clean white background.`,
      composition: `Both characters facing each other for the high-five, with
the monitor behind them. Ada's raised arms and Max's outstretched hand
create a dynamic diagonal. This is the payoff panel — biggest expressions,
most energy. Square composition (1:1).`,
    },
  ]

  for (const panel of panels) {
    const prompt = [
      STYLES.newYorker,
      '',
      'COMIC STRIP PANEL — this is one panel of a 3-panel strip.',
      '',
      characterBlock,
      '',
      'SCENE:',
      panel.scene,
      '',
      'COMPOSITION:',
      panel.composition,
      '',
      'CRITICAL: Do NOT include any text. Square (1:1) aspect ratio.',
      'Characters must match the reference sheet EXACTLY.',
    ].join('\n')

    await generateImage(prompt, `strip-${panel.name}.png`)
  }
}

// ───── MAIN ─────

async function main() {
  if (!process.env.AI_GATEWAY_API_KEY) {
    console.log('❌ AI_GATEWAY_API_KEY not set.')
    console.log('')
    console.log('To get started:')
    console.log('  1. Go to https://aistudio.google.com/apikey')
    console.log('  2. Create an API key')
    console.log('  3. Run: AI_GATEWAY_API_KEY=<your-key> npx tsx test-image-gen.ts')
    console.log('')
    console.log('Note: The AI SDK gateway uses AI_GATEWAY_API_KEY.')
    console.log('If you want to use Google directly instead, you\'d need to')
    console.log('swap @ai-sdk/gateway for @ai-sdk/google in the code and')
    console.log('use GOOGLE_GENERATIVE_AI_API_KEY instead.')
    process.exit(1)
  }

  await mkdir(OUTPUT_DIR, { recursive: true })
  console.log(`Output directory: ${OUTPUT_DIR}`)

  const testArg = process.argv.find(a => a.startsWith('--test='))?.split('=')[1]
    ?? process.argv[process.argv.indexOf('--test') + 1]
    ?? 'all'

  switch (testArg) {
    case 'single-panel':
      await testSinglePanel()
      break
    case 'strip-panel':
      await testStripPanel()
      break
    case 'style-compare':
      await testStyleComparison()
      break
    case 'all':
      await testStyleComparison()
      await testSinglePanel()
      await testStripPanel()
      break
    default:
      console.log(`Unknown test: ${testArg}`)
      console.log('Available: single-panel, strip-panel, style-compare, all')
      process.exit(1)
  }

  console.log(`\n✅ Done! Check ${OUTPUT_DIR}/ for results.`)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
