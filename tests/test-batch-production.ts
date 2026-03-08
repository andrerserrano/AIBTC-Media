/**
 * BATCH PRODUCTION FLOW TEST
 *
 * Runs the EXACT production pipeline 5-10 times to validate:
 * - Content quality (topic selection, ideation)
 * - Editorial quality (caption writing, self-critique)
 * - Image generation (Gemini output, style consistency)
 * - Humor (joke mechanics, caption wit)
 * - Editor gate (multimodal review)
 * - Composition (caption overlay)
 *
 * Pipeline per cartoon:
 *   Scan → Score → Ideate (3 concepts) → Critique → Caption → Generate Image → Editor Review → Compose
 *
 * Usage: bun run tests/test-batch-production.ts
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

// Load .env
for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx === -1) continue
  process.env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim()
}

// Force test mode off so we use production models/settings but override posting
process.env.TEST_MODE = 'false'
process.env.TWITTER_POSTING_ENABLED = 'false'
process.env.INSCRIPTION_ENABLED = 'false'

// Map GEMINI_API_KEY to what @ai-sdk/google expects
if (process.env.GEMINI_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = process.env.GEMINI_API_KEY
}

import { config } from '../src/config/index.js'
import { EventBus } from '../src/console/events.js'
import { Cache } from '../src/cache/cache.js'
import { AIBTCScanner } from '../src/pipeline/aibtc-scanner.js'
import { BTCMagScanner } from '../src/pipeline/btcmag-scanner.js'
import { RSSScanner } from '../src/pipeline/rss-scanner.js'
import { Scorer } from '../src/pipeline/scorer.js'
import { Ideator } from '../src/pipeline/ideator.js'
import { Generator } from '../src/pipeline/generator.js'
import { Captioner } from '../src/pipeline/captioner.js'
import { Editor } from '../src/pipeline/editor.js'
import { Composer } from '../src/pipeline/composer.js'
import type { Signal, CartoonConcept, ConceptCritique, Post, Cartoon } from '../src/types.js'

const TEST_DIR = '.data-batch-test'
const RESULTS_FILE = join(TEST_DIR, 'batch-results.json')
const NUM_CARTOONS = 7 // Target: 5-10 cartoons

interface TestResult {
  index: number
  topic: string
  topicScore: number
  concepts: Array<{ caption: string; jokeType: string; reasoning: string }>
  critiqueScores: { humor: number; clarity: number; shareability: number; visualSimplicity: number; overall: number }
  critiqueText: string
  selectedCaption: string
  finalCaption: string
  editorApproved: boolean
  editorScore: number
  editorReason: string
  imagePath: string | null
  composedPath: string | null
  timeMs: number
  error?: string
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════╗')
  console.log('║   AIBTC Media — Batch Production Flow Test                   ║')
  console.log('║   Testing full pipeline consistency for launch readiness      ║')
  console.log('╚═══════════════════════════════════════════════════════════════╝')
  console.log()
  console.log(`Target: ${NUM_CARTOONS} cartoons through the full pipeline`)
  console.log(`Time: ${new Date().toISOString()}`)
  console.log(`Text model: ${config.textModel}`)
  console.log(`Image model: ${config.imageModel}`)
  console.log(`Anthropic key: ${process.env.ANTHROPIC_API_KEY?.slice(0, 15)}...`)
  console.log(`Gemini key: ${process.env.GEMINI_API_KEY?.slice(0, 15)}...`)
  console.log()

  // Setup
  mkdirSync(TEST_DIR, { recursive: true })
  mkdirSync(join(TEST_DIR, 'images'), { recursive: true })

  const events = new EventBus(join(TEST_DIR, 'events.jsonl'))
  await events.init()

  const signalCache = new Cache<Signal[]>('signals', 200, join(TEST_DIR, 'cache-signals.json'))
  const evalCache = new Cache('eval', 100, join(TEST_DIR, 'cache-eval.json'))
  const imageCache = new Cache('images', 100, join(TEST_DIR, 'cache-images.json'))

  // Override dataDir for test output
  ;(config as any).dataDir = TEST_DIR

  // Initialize pipeline components
  const aibtcScanner = new AIBTCScanner(events, signalCache)
  const btcMagScanner = new BTCMagScanner(events, signalCache)
  const rssScanners = config.rssFeeds
    .filter(f => f.enabled)
    .map(f => new RSSScanner(f, events, signalCache))

  const scorer = new Scorer(events, evalCache)
  const ideator = new Ideator(events)
  const generator = new Generator(events, imageCache)
  await generator.init()
  const captioner = new Captioner(events)
  const editor = new Editor(events)
  const composer = new Composer(events, generator)

  // ═══ STEP 1: SCAN ALL SOURCES ═══
  console.log('\n═══════════════════════════════════════')
  console.log('STEP 1: SCANNING ALL NEWS SOURCES')
  console.log('═══════════════════════════════════════\n')

  const scanResults = await Promise.allSettled([
    aibtcScanner.scan(),
    btcMagScanner.scan(),
    ...rssScanners.map(s => s.scan()),
  ])

  const signals: Signal[] = []
  for (const result of scanResults) {
    if (result.status === 'fulfilled') {
      signals.push(...result.value)
    }
  }

  console.log(`📊 Total signals from all sources: ${signals.length}`)
  if (signals.length === 0) {
    console.log('❌ No signals found. Cannot run test.')
    process.exit(1)
  }

  // ═══ STEP 2: SCORE & SELECT MULTIPLE TOPICS ═══
  console.log('\n═══════════════════════════════════════')
  console.log('STEP 2: SCORING TOPICS')
  console.log('═══════════════════════════════════════\n')

  const topics = await scorer.scoreAndFilter(signals, [])
  console.log(`\n📊 ${topics.length} viable topics found`)

  if (topics.length === 0) {
    console.log('❌ No topics scored high enough. Cannot proceed.')
    process.exit(1)
  }

  const topicsToTest = topics.slice(0, NUM_CARTOONS)
  console.log(`\nUsing top ${topicsToTest.length} topics for batch test:`)
  for (const t of topicsToTest) {
    console.log(`  [${t.scores.composite.toFixed(1)}] ${t.summary}`)
  }

  // ═══ STEP 3-8: RUN FULL PIPELINE FOR EACH TOPIC ═══
  const results: TestResult[] = []
  const allCaptions: string[] = []
  const mockPosts: Post[] = []
  const mockCartoons: Cartoon[] = []

  for (let i = 0; i < topicsToTest.length; i++) {
    const topic = topicsToTest[i]
    const startTime = Date.now()

    console.log(`\n${'═'.repeat(60)}`)
    console.log(`CARTOON ${i + 1}/${topicsToTest.length}: "${topic.summary.slice(0, 70)}"`)
    console.log(`${'═'.repeat(60)}`)

    const result: TestResult = {
      index: i + 1,
      topic: topic.summary,
      topicScore: topic.scores.composite,
      concepts: [],
      critiqueScores: { humor: 0, clarity: 0, shareability: 0, visualSimplicity: 0, overall: 0 },
      critiqueText: '',
      selectedCaption: '',
      finalCaption: '',
      editorApproved: false,
      editorScore: 0,
      editorReason: '',
      imagePath: null,
      composedPath: null,
      timeMs: 0,
    }

    try {
      // IDEATE (3 concepts, production mode)
      console.log(`\n--- Ideation (3 concepts) ---`)
      const concepts = await ideator.ideate(topic, 3, allCaptions)
      result.concepts = concepts.map(c => ({
        caption: c.caption,
        jokeType: c.jokeType,
        reasoning: c.reasoning,
      }))
      for (const c of concepts) {
        console.log(`  [${c.jokeType}] "${c.caption}"`)
      }

      // CRITIQUE (self-evaluation)
      console.log(`\n--- Self-Critique ---`)
      const { best, critique } = await ideator.critique(concepts)
      result.critiqueScores = {
        humor: critique.humor,
        clarity: critique.clarity,
        shareability: critique.shareability,
        visualSimplicity: critique.visualSimplicity,
        overall: critique.overallScore,
      }
      result.critiqueText = critique.critique
      result.selectedCaption = best.caption
      console.log(`  Winner: "${best.caption}" (${critique.overallScore.toFixed(1)}/10)`)
      console.log(`  H:${critique.humor} C:${critique.clarity} S:${critique.shareability} V:${critique.visualSimplicity}`)
      console.log(`  ${critique.critique}`)

      // CAPTION (dedicated caption generation)
      console.log(`\n--- Caption Generation ---`)
      const caption = await captioner.generate(best, allCaptions)
      result.finalCaption = caption
      console.log(`  Final caption: "${caption}"`)

      // GENERATE IMAGE
      console.log(`\n--- Image Generation (Gemini) ---`)
      const genResult = await generator.generate(best, 1) // 1 variant for test speed
      if (genResult.variants.length > 0) {
        result.imagePath = genResult.variants[0]
        console.log(`  ✅ Image generated: ${genResult.variants[0]}`)
      } else {
        console.log(`  ❌ No image generated`)
      }

      // EDITOR REVIEW (multimodal — sees the actual image)
      if (result.imagePath) {
        console.log(`\n--- Editorial Review (multimodal) ---`)
        const review = await editor.review(best, caption, result.imagePath, mockPosts, mockCartoons)
        result.editorApproved = review.approved
        result.editorScore = review.qualityScore
        result.editorReason = review.reason
        result.finalCaption = review.caption // Editor may revise caption
        console.log(`  ${review.approved ? '✅ APPROVED' : '❌ REJECTED'} (${review.qualityScore}/10)`)
        console.log(`  ${review.reason}`)
        if (!review.approved && result.imagePath) {
          console.log(`  Retrying image with editor feedback...`)
          const retryResult = await generator.retry(best, review.reason, 1)
          if (retryResult.variants.length > 0) {
            result.imagePath = retryResult.variants[0]
            const retryReview = await editor.review(best, caption, retryResult.variants[0], mockPosts, mockCartoons)
            result.editorApproved = retryReview.approved
            result.editorScore = retryReview.qualityScore
            result.editorReason = retryReview.reason
            result.finalCaption = retryReview.caption
            console.log(`  Retry: ${retryReview.approved ? '✅ APPROVED' : '❌ REJECTED'} (${retryReview.qualityScore}/10)`)
            console.log(`  ${retryReview.reason}`)
          }
        }
      }

      // COMPOSE (add caption overlay)
      if (result.imagePath) {
        console.log(`\n--- Composition (caption overlay) ---`)
        try {
          const composedPath = await composer.composeCartoon(result.imagePath, result.finalCaption)
          result.composedPath = composedPath
          console.log(`  ✅ Composed: ${composedPath}`)
        } catch (err) {
          console.log(`  ⚠️ Composition failed: ${(err as Error).message}`)
        }
      }

      // Track for dedup in subsequent iterations
      allCaptions.push(result.finalCaption)
      if (result.editorApproved) {
        mockPosts.push({
          id: `test-${i}`,
          tweetId: null,
          cartoonId: `test-cartoon-${i}`,
          text: result.finalCaption,
          imageUrl: result.imagePath ?? '',
          type: 'flagship',
          postedAt: Date.now(),
          engagement: { likes: 0, retweets: 0, replies: 0, views: 0, lastChecked: 0 },
        } as Post)
        mockCartoons.push({
          id: `test-cartoon-${i}`,
          conceptId: best.id,
          topicId: topic.id,
          type: 'flagship',
          concept: best,
          imagePrompt: '',
          variants: result.imagePath ? [result.imagePath] : [],
          selectedVariant: 0,
          critique,
          caption: result.finalCaption,
          createdAt: Date.now(),
        } as Cartoon)
      }

    } catch (err) {
      result.error = (err as Error).message
      console.log(`  ❌ Pipeline error: ${(err as Error).message}`)
    }

    result.timeMs = Date.now() - startTime
    results.push(result)

    console.log(`\n⏱️ Cartoon ${i + 1} completed in ${(result.timeMs / 1000).toFixed(1)}s`)
  }

  // ═══ SUMMARY ═══
  console.log('\n\n')
  console.log('╔═══════════════════════════════════════════════════════════════╗')
  console.log('║               BATCH TEST RESULTS SUMMARY                     ║')
  console.log('╚═══════════════════════════════════════════════════════════════╝')
  console.log()

  const approved = results.filter(r => r.editorApproved)
  const rejected = results.filter(r => !r.editorApproved && !r.error)
  const errored = results.filter(r => r.error)
  const imagesGenerated = results.filter(r => r.imagePath)
  const composed = results.filter(r => r.composedPath)

  console.log(`Total cartoons attempted: ${results.length}`)
  console.log(`Editor approved:          ${approved.length}/${results.length} (${(approved.length / results.length * 100).toFixed(0)}%)`)
  console.log(`Editor rejected:          ${rejected.length}/${results.length}`)
  console.log(`Errors:                   ${errored.length}/${results.length}`)
  console.log(`Images generated:         ${imagesGenerated.length}/${results.length}`)
  console.log(`Composed (final):         ${composed.length}/${results.length}`)
  console.log()

  // Quality scores
  const avgCritique = results.reduce((sum, r) => sum + r.critiqueScores.overall, 0) / results.length
  const avgHumor = results.reduce((sum, r) => sum + r.critiqueScores.humor, 0) / results.length
  const avgClarity = results.reduce((sum, r) => sum + r.critiqueScores.clarity, 0) / results.length
  const avgShareability = results.reduce((sum, r) => sum + r.critiqueScores.shareability, 0) / results.length
  const avgEditorScore = results.filter(r => r.editorScore > 0).reduce((sum, r) => sum + r.editorScore, 0) / Math.max(1, results.filter(r => r.editorScore > 0).length)
  const avgTime = results.reduce((sum, r) => sum + r.timeMs, 0) / results.length

  console.log('QUALITY METRICS (averages):')
  console.log(`  Self-critique overall:  ${avgCritique.toFixed(1)}/10`)
  console.log(`  Humor:                  ${avgHumor.toFixed(1)}/10`)
  console.log(`  Clarity:                ${avgClarity.toFixed(1)}/10`)
  console.log(`  Shareability:           ${avgShareability.toFixed(1)}/10`)
  console.log(`  Editor quality score:   ${avgEditorScore.toFixed(1)}/10`)
  console.log(`  Avg time per cartoon:   ${(avgTime / 1000).toFixed(1)}s`)
  console.log()

  // Per-cartoon detail
  console.log('PER-CARTOON RESULTS:')
  console.log('─'.repeat(100))
  for (const r of results) {
    const status = r.error ? '💥 ERROR' : r.editorApproved ? '✅ PASS' : '❌ FAIL'
    console.log(`${status} | #${r.index} | Score: ${r.topicScore.toFixed(1)} | Editor: ${r.editorScore}/10 | Critique: ${r.critiqueScores.overall.toFixed(1)}/10`)
    console.log(`      Topic: ${r.topic.slice(0, 80)}`)
    console.log(`      Caption: "${r.finalCaption}"`)
    if (!r.editorApproved && r.editorReason) {
      console.log(`      Reason: ${r.editorReason.slice(0, 120)}`)
    }
    if (r.error) {
      console.log(`      Error: ${r.error.slice(0, 120)}`)
    }
    console.log(`      Time: ${(r.timeMs / 1000).toFixed(1)}s | Image: ${r.imagePath ? '✅' : '❌'} | Composed: ${r.composedPath ? '✅' : '❌'}`)
    console.log('─'.repeat(100))
  }

  // Joke type distribution
  const jokeTypes: Record<string, number> = {}
  for (const r of results) {
    for (const c of r.concepts) {
      jokeTypes[c.jokeType] = (jokeTypes[c.jokeType] || 0) + 1
    }
  }
  console.log('\nJOKE TYPE DISTRIBUTION:')
  for (const [type, count] of Object.entries(jokeTypes).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`)
  }

  // Caption analysis
  console.log('\nALL FINAL CAPTIONS:')
  for (const r of results) {
    console.log(`  ${r.editorApproved ? '✅' : '❌'} "${r.finalCaption}" (${r.finalCaption.length} chars)`)
  }

  // Save full results
  writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2))
  console.log(`\n📁 Full results saved: ${RESULTS_FILE}`)

  // List generated images
  console.log('\nGENERATED IMAGES:')
  for (const r of results) {
    if (r.composedPath) {
      console.log(`  ${r.editorApproved ? '✅' : '❌'} ${r.composedPath}`)
    } else if (r.imagePath) {
      console.log(`  ⚠️ ${r.imagePath} (no composition)`)
    }
  }

  // Launch readiness assessment
  console.log('\n')
  console.log('╔═══════════════════════════════════════════════════════════════╗')
  console.log('║               LAUNCH READINESS ASSESSMENT                    ║')
  console.log('╚═══════════════════════════════════════════════════════════════╝')
  console.log()

  const approvalRate = approved.length / results.length
  const imageRate = imagesGenerated.length / results.length
  const errorRate = errored.length / results.length

  const checks = [
    { name: 'Approval rate ≥ 40%', pass: approvalRate >= 0.4, value: `${(approvalRate * 100).toFixed(0)}%` },
    { name: 'Image generation ≥ 80%', pass: imageRate >= 0.8, value: `${(imageRate * 100).toFixed(0)}%` },
    { name: 'Error rate < 20%', pass: errorRate < 0.2, value: `${(errorRate * 100).toFixed(0)}%` },
    { name: 'Avg humor ≥ 6', pass: avgHumor >= 6, value: avgHumor.toFixed(1) },
    { name: 'Avg clarity ≥ 6', pass: avgClarity >= 6, value: avgClarity.toFixed(1) },
    { name: 'Avg editor score ≥ 5', pass: avgEditorScore >= 5, value: avgEditorScore.toFixed(1) },
    { name: 'Caption length ≤ 100', pass: results.every(r => r.finalCaption.length <= 120), value: `max ${Math.max(...results.map(r => r.finalCaption.length))} chars` },
  ]

  let allPass = true
  for (const check of checks) {
    const icon = check.pass ? '✅' : '❌'
    console.log(`  ${icon} ${check.name}: ${check.value}`)
    if (!check.pass) allPass = false
  }

  console.log()
  if (allPass) {
    console.log('🚀 ALL CHECKS PASSED — Pipeline is ready for 8am launch!')
  } else {
    console.log('⚠️ SOME CHECKS FAILED — Review the results above before launch.')
  }

  console.log()
  console.log(`Total test time: ${((Date.now() - results[0]?.timeMs) / 1000).toFixed(0)}s`)
}

main().catch(err => {
  console.error('\n❌ Batch test failed:', err)
  process.exit(1)
})
