/**
 * Test: Scan → Score pipeline
 *
 * Exercises Phase 1 of AIBTC Media:
 * 1. AIBTCScanner fetches signals from aibtc.news
 * 2. Scorer evaluates and ranks them for comic strip potential
 *
 * Run: TEST_MODE=true ANTHROPIC_API_KEY=<key> npx tsx tests/test-pipeline.ts
 */

import { join } from 'path'
import { mkdir } from 'fs/promises'
import { EventBus } from './src/console/events.js'
import { Cache } from './src/cache/cache.js'
import { AIBTCScanner } from './src/pipeline/aibtc-scanner.js'
import { Scorer } from './src/pipeline/scorer.js'
import type { Signal } from './src/types.js'

const DATA_DIR = '.data-test'

async function testPipeline() {
  console.log('=== AIBTC Media Pipeline Test ===\n')

  // Setup
  await mkdir(DATA_DIR, { recursive: true })
  const events = new EventBus(join(DATA_DIR, 'events.jsonl'))
  await events.init()

  const signalCache = new Cache<Signal[]>('signals', 200, join(DATA_DIR, 'cache-signals.json'))
  const evalCache = new Cache('eval', 100, join(DATA_DIR, 'cache-eval.json'))

  // --- STEP 1: Scan ---
  console.log('\n--- Step 1: Scanning AIBTC.news ---\n')
  const scanner = new AIBTCScanner(events, signalCache)
  const signals = await scanner.scan()

  console.log(`\n✅ Scanner returned ${signals.length} signals`)
  if (signals.length === 0) {
    console.log('❌ No signals found. API may be down or returning empty.')
    process.exit(1)
  }

  // Show first 3 signals
  console.log('\nSample signals:')
  for (const s of signals.slice(0, 3)) {
    console.log(`  [${s.type}] ${s.content.slice(0, 100)}...`)
    console.log(`    beat: ${s.aibtc?.beat ?? 'unknown'} | author: ${s.author}`)
  }

  // --- STEP 2: Score ---
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('\n⚠️  ANTHROPIC_API_KEY not set — skipping scorer test.')
    console.log('    Run with ANTHROPIC_API_KEY=<key> to test full pipeline.')
    console.log('\n✅ Scanner test PASSED. Signals are flowing.')
    process.exit(0)
  }

  console.log('\n--- Step 2: Scoring signals ---\n')
  const scorer = new Scorer(events, evalCache)
  const topics = await scorer.scoreAndFilter(signals, [])

  console.log(`\n✅ Scorer returned ${topics.length} topics`)

  if (topics.length > 0) {
    console.log('\nTop topics:')
    for (const t of topics.slice(0, 5)) {
      console.log(`  [${t.scores.composite.toFixed(1)}] ${t.summary}`)
      console.log(`    status: ${t.status} | signals: ${t.signals.length}`)
    }
  }

  console.log('\n✅ Pipeline test PASSED. Scan → Score working end-to-end.')
}

testPipeline().catch((err) => {
  console.error('\n❌ Pipeline test FAILED:', err)
  process.exit(1)
})
