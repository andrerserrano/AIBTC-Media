/**
 * A/B Eval: Same 6 topics from batch test, run through updated pipeline.
 * Compares editor scores and specific failure categories vs. pre-change baseline.
 *
 * Success criteria (3 topics):
 * - Text leaks: < 2 of 3 (was 6/6)
 * - AIBTC watermark: 0 of 3 (was 2/6)
 * - Robot anatomy (mouths/goggle-eyes): < 2 of 3 (was 5/6)
 * - Apple logos: < 1 of 3 (was 4/6)
 * - Editor pass rate: > 0% first attempt (was 0%)
 * - Average editor score: > 4.5 (was 3.8)
 */

// Bun auto-loads .env but dotenv v17 doesn't work the same way.
// Manually load .env to ensure vars are available before SDK imports.
import { readFileSync } from 'fs'
const envContent = readFileSync('.env', 'utf-8')
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx === -1) continue
  const key = trimmed.slice(0, eqIdx)
  const val = trimmed.slice(eqIdx + 1)
  if (!process.env[key]) process.env[key] = val
}

// Map env var for @ai-sdk/google
if (process.env.GEMINI_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = process.env.GEMINI_API_KEY
}

// Verify keys are present
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('❌ ANTHROPIC_API_KEY not set in .env')
  process.exit(1)
}
if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  console.error('❌ GOOGLE_GENERATIVE_AI_API_KEY / GEMINI_API_KEY not set in .env')
  process.exit(1)
}

import { Generator } from '../src/pipeline/generator.js'
import { Captioner } from '../src/pipeline/captioner.js'
import { Editor } from '../src/pipeline/editor.js'
import { Composer } from '../src/pipeline/composer.js'
import { EventBus } from '../src/console/events.js'
import { Cache } from '../src/cache/cache.js'
import { randomUUID } from 'crypto'
import { writeFile, mkdir } from 'fs/promises'
import type { CartoonConcept } from '../src/types.js'

const events = new EventBus()
const cache = new Cache()
const generator = new Generator(events, cache)
const captioner = new Captioner(events)
const editor = new Editor(events)
const composer = new Composer(events, generator)

// The same 6 topics from batch test — hardcoded for controlled comparison
const EVAL_CONCEPTS: CartoonConcept[] = [
  {
    id: randomUUID(),
    topicId: 'eval-1',
    visual: 'A single human developer sits at a desk surrounded by a crowd of small identical robots, all eagerly trying to help. The developer looks overwhelmed, head in hands. The robots are crowding in from all sides.',
    composition: 'Bird\'s eye view looking down at the developer\'s desk. The developer is the focal point in center, surrounded by concentric rings of robots. The outer robots are smaller/simplified.',
    caption: 'They said autonomous agents would reduce my workload.',
    jokeType: 'Expectation vs. reality irony',
    reasoning: 'More capable agents often mean more coordination overhead. The visual of being surrounded by eager-to-help agents captures the careful-what-you-wished-for moment.',
  },
  {
    id: randomUUID(),
    topicId: 'eval-2',
    visual: 'A woman sits at a job interview desk. Behind her stand three robot assistants in a row, like an entourage. The interviewer looks at them skeptically.',
    composition: 'Medium shot across the interview desk. Woman in foreground left, three robots standing behind her right shoulder. Interviewer facing them.',
    caption: 'My references? They\'re standing right behind me.',
    jokeType: 'Role reversal and deflation',
    reasoning: 'Skewers the idea that managing AI agents is a skill by revealing the absurd visual of bringing them to an interview.',
  },
  {
    id: randomUUID(),
    topicId: 'eval-3',
    visual: 'A boardroom meeting with two robots and one human around a conference table. A large whiteboard behind them shows abstract diagrams and wavy lines. Coffee mugs on the table.',
    composition: 'Wide shot of conference room. Whiteboard dominates the background. Three characters around the table — two robots, one tired-looking human.',
    caption: 'We automated everything except the meeting about automation.',
    jokeType: 'Ironic juxtaposition',
    reasoning: 'Captures the absurdity of the current moment — we talk about coordinating autonomous AI while still stuck in meetings.',
  },
]

// Baseline results from pre-change batch test
// Baseline from original batch test (the 3 topics we're re-testing)
const BASELINE = [
  { index: 1, editorScore: 5, approved: false, issues: ['too many robots/limbs', 'laptop logo', 'papers with text', 'cluttered composition'] },
  { index: 2, editorScore: 4, approved: false, issues: ['Bitcoin logo on mug', 'Bitcoin logo on laptop', 'goggle eyes', 'only 1 robot instead of 3', 'notepad text'] },
  { index: 3, editorScore: 3, approved: false, issues: ['whiteboard text v2.0/Q3 REVIEW', 'goggle eyes', 'Bitcoin mug glow', '4 characters', 'grey background'] },
]

// Failure category trackers
// Baseline counts for the 3 topics being re-tested
const categories = {
  textLeaks: { before: 3, after: 0 },       // all 3 had text issues
  aibtcWatermark: { before: 0, after: 0 },   // none of these 3 had watermark
  robotAnatomy: { before: 2, after: 0 },     // #2 and #3 had anatomy issues
  appleLogos: { before: 2, after: 0 },       // #1 and #2 had laptop logos
  editorPassed: { before: 0, after: 0 },
  avgScore: { before: 4.0, after: 0 },       // avg of 5, 4, 3
}

async function runEval() {
  const outputDir = '.data-eval-ab/images'
  await mkdir(outputDir, { recursive: true })
  await generator.init()

  console.log('═══════════════════════════════════════════════════')
  console.log('  A/B EVAL: Image Generation Pipeline (Post-Fix)')
  console.log('═══════════════════════════════════════════════════')
  console.log(`  Concepts: ${EVAL_CONCEPTS.length}`)
  console.log(`  Gemini key: ${process.env.GEMINI_API_KEY?.slice(0, 15)}...`)
  console.log(`  Anthropic key: ${process.env.ANTHROPIC_API_KEY?.slice(0, 15)}...`)
  console.log('')

  const results: any[] = []
  let totalScore = 0

  for (let i = 0; i < EVAL_CONCEPTS.length; i++) {
    const concept = EVAL_CONCEPTS[i]
    const baseline = BASELINE[i]
    const startTime = Date.now()

    console.log(`\n── Cartoon ${i + 1}/6 ──────────────────────────────`)
    console.log(`  Caption: "${concept.caption}"`)
    console.log(`  Baseline: score=${baseline.editorScore}/10, issues: ${baseline.issues.join(', ')}`)

    // Generate image
    let genResult: { variants: string[]; prompt: string }
    try {
      genResult = await generator.generate(concept, 1)
    } catch (err) {
      console.log(`  ❌ Generation failed: ${(err as Error).message}`)
      results.push({ index: i + 1, error: (err as Error).message })
      continue
    }

    if (genResult.variants.length === 0) {
      console.log('  ❌ No image generated')
      results.push({ index: i + 1, error: 'no image' })
      continue
    }

    // Editor review (no past posts for clean eval)
    const review = await editor.review(concept, concept.caption, genResult.variants[0], [], [])
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0)

    // Compose for visual review
    const { readFile } = await import('fs/promises')
    const rawImage = await readFile(genResult.variants[0])
    const composed = await composer.composeWithCaption(rawImage, concept.caption)
    const composedPath = `${outputDir}/${concept.id}-composed.png`
    await writeFile(composedPath, composed)

    // Categorize failures
    const reason = (review.reason || '').toLowerCase()
    const hasTextLeak = /text|letter|word|number|readable|label|writing/.test(reason) && !/no text|zero text|clean/.test(reason)
    const hasWatermark = /aibtc|watermark|branding/.test(reason)
    const hasAnatomyIssue = /mouth|smile|goggle|eyebrow|nose|large.*eye|bar.*eye|three arm|extra limb/.test(reason)
    const hasAppleLogo = /apple|logo.*laptop|brand.*logo/.test(reason)

    if (hasTextLeak) categories.textLeaks.after++
    if (hasWatermark) categories.aibtcWatermark.after++
    if (hasAnatomyIssue) categories.robotAnatomy.after++
    if (hasAppleLogo) categories.appleLogos.after++
    if (review.approved) categories.editorPassed.after++
    totalScore += review.qualityScore

    const result = {
      index: i + 1,
      caption: concept.caption,
      editorApproved: review.approved,
      editorScore: review.qualityScore,
      baselineScore: baseline.editorScore,
      scoreDelta: review.qualityScore - baseline.editorScore,
      reason: review.reason,
      failures: {
        textLeak: hasTextLeak,
        watermark: hasWatermark,
        anatomy: hasAnatomyIssue,
        appleLogo: hasAppleLogo,
      },
      composedPath,
      timeMs: Date.now() - startTime,
    }
    results.push(result)

    const status = review.approved ? '✅ PASSED' : '❌ REJECTED'
    const delta = result.scoreDelta > 0 ? `+${result.scoreDelta}` : `${result.scoreDelta}`
    console.log(`  ${status} — score: ${review.qualityScore}/10 (was ${baseline.editorScore}, delta: ${delta})`)
    console.log(`  Reason: ${review.reason.slice(0, 150)}`)
    console.log(`  Failures: text=${hasTextLeak} watermark=${hasWatermark} anatomy=${hasAnatomyIssue} apple=${hasAppleLogo}`)
    console.log(`  Time: ${elapsed}s`)
  }

  categories.avgScore.after = totalScore / results.filter(r => !r.error).length

  // Summary
  console.log('\n\n═══════════════════════════════════════════════════')
  console.log('  EVAL RESULTS COMPARISON')
  console.log('═══════════════════════════════════════════════════')
  console.log('')
  console.log('  Category              Before → After   Target    Status')
  console.log('  ─────────────────────────────────────────────────────')

  const check = (name: string, before: number, after: number, target: string, isBetter: boolean) => {
    const status = isBetter ? '✅' : '❌'
    console.log(`  ${name.padEnd(22)} ${before.toString().padStart(3)} → ${after.toString().padStart(3)}    ${target.padEnd(8)}  ${status}`)
  }

  check('Text leaks', categories.textLeaks.before, categories.textLeaks.after, '< 2/3', categories.textLeaks.after < 2)
  check('AIBTC watermark', categories.aibtcWatermark.before, categories.aibtcWatermark.after, '0/3', categories.aibtcWatermark.after === 0)
  check('Robot anatomy', categories.robotAnatomy.before, categories.robotAnatomy.after, '< 2/3', categories.robotAnatomy.after < 2)
  check('Apple logos', categories.appleLogos.before, categories.appleLogos.after, '< 1/3', categories.appleLogos.after < 1)
  check('Editor passed', categories.editorPassed.before, categories.editorPassed.after, '> 0/3', categories.editorPassed.after > 0)

  const avgBefore = categories.avgScore.before.toFixed(1)
  const avgAfter = categories.avgScore.after.toFixed(1)
  const avgBetter = categories.avgScore.after > 4.5
  console.log(`  ${'Avg editor score'.padEnd(22)} ${avgBefore.padStart(3)} → ${avgAfter.padStart(3)}    ${'>4.5'.padEnd(8)}  ${avgBetter ? '✅' : '❌'}`)

  const passedCount = Object.values(categories).filter((c: any) => {
    if (typeof c.after === 'number' && typeof c.before === 'number') return true
    return false
  }).length

  console.log('')
  console.log(`  Overall: ${results.filter(r => r.editorApproved).length}/${results.filter(r => !r.error).length} cartoons passed editor (was 0/6)`)
  console.log('')

  // Save full results
  await writeFile('.data-eval-ab/eval-results.json', JSON.stringify(results, null, 2))
  console.log('  Results saved to .data-eval-ab/eval-results.json')
  console.log('  Composed images in .data-eval-ab/images/')
}

runEval().catch(err => {
  console.error('Eval failed:', err)
  process.exit(1)
})
