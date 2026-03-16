#!/usr/bin/env bun
/**
 * test-commentary-live.ts — Dry-run test using REAL live signals from scanners.
 *
 * Scans Google News, Bitcoin Magazine RSS, CoinDesk, and The Defiant for
 * fresh signals, then runs the commentary writer → editor pipeline.
 * Nothing gets posted.
 *
 * Usage:
 *   bun run scripts/test-commentary-live.ts
 *   bun run scripts/test-commentary-live.ts --rounds=6
 */
// Load .env for Node/tsx (Bun does this automatically)
import { readFileSync } from 'fs'
const envContent = readFileSync('.env', 'utf8')
for (const line of envContent.split('\n')) {
  const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (match) process.env[match[1]] = match[2].trim()
}

import { EventEmitter } from 'events'
import { writeFile, mkdir } from 'fs/promises'
import { CommentaryWriter } from '../src/pipeline/commentary-writer.js'
import { CommentaryEditor } from '../src/pipeline/commentary-editor.js'
import { GoogleNewsScanner } from '../src/pipeline/google-news-scanner.js'
import { BTCMagScanner } from '../src/pipeline/btcmag-scanner.js'
import { RSSScanner } from '../src/pipeline/rss-scanner.js'
import { Cache } from '../src/cache/cache.js'
import { config } from '../src/config/index.js'
import type { CommentaryCategory, Post, Signal } from '../src/types.js'

// ── Minimal EventBus shim ──
class TestEventBus {
  private emitter = new EventEmitter()
  monologue(text: string) {
    const ts = new Date().toLocaleTimeString()
    console.log(`  [${ts}] ${text}`)
  }
  emit(event: string, ...args: unknown[]) { this.emitter.emit(event, ...args) }
  on(event: string, listener: (...args: unknown[]) => void) { this.emitter.on(event, listener) }
}

// ── Parse CLI args ──
const args = process.argv.slice(2)
const getArg = (name: string, defaultVal: string) => {
  const arg = args.find(a => a.startsWith(`--${name}=`))
  return arg ? arg.split('=')[1] : defaultVal
}
const rounds = Number(getArg('rounds', '4'))
const categories: CommentaryCategory[] = ['commentary', 'self-aware', 'thesis', 'qrt']

// ── Main ──
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗')
  console.log('║  AIBTC Media — Live Signal Commentary Test              ║')
  console.log('╚══════════════════════════════════════════════════════════╝\n')

  const events = new TestEventBus() as any

  // ── Phase 1: Scan real signals ──
  console.log('📡 SCANNING LIVE SIGNALS...\n')

  // Create a shared signal cache (required by scanners)
  const signalCache = new Cache<Signal[]>('test-signals', 100, '.data/test-signal-cache.json')

  const scanners: Array<{ name: string; scanner: { scan(): Promise<Signal[]> } }> = []

  // Google News (no API key needed)
  if (config.googleNews.enabled) {
    scanners.push({ name: 'Google News', scanner: new GoogleNewsScanner(events, signalCache) })
  }

  // Bitcoin Magazine RSS (no API key needed)
  if (config.btcMag.enabled) {
    scanners.push({ name: 'Bitcoin Magazine', scanner: new BTCMagScanner(events, signalCache) })
  }

  // Additional RSS feeds (CoinDesk, The Defiant — no API key needed)
  for (const feedConfig of config.rssFeeds) {
    if (feedConfig.enabled) {
      scanners.push({ name: feedConfig.name, scanner: new RSSScanner(feedConfig, events, signalCache) })
    }
  }

  const allSignals: Signal[] = []
  for (const { name, scanner } of scanners) {
    try {
      console.log(`  Scanning ${name}...`)
      const signals = await Promise.race([
        scanner.scan(),
        new Promise<Signal[]>((_, reject) => setTimeout(() => reject(new Error('timeout')), 30_000)),
      ])
      console.log(`  ✓ ${name}: ${signals.length} signals`)
      allSignals.push(...signals)
    } catch (err) {
      console.log(`  ✗ ${name}: ${(err as Error).message}`)
    }
  }

  // Deduplicate by content similarity (rough — first 80 chars)
  const seen = new Set<string>()
  const uniqueSignals = allSignals.filter(s => {
    const key = s.content.slice(0, 80).toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  console.log(`\n📊 Total unique signals: ${uniqueSignals.length}\n`)

  if (uniqueSignals.length === 0) {
    console.log('No signals found. Check network connectivity and feed URLs.')
    process.exit(1)
  }

  // Show top signals
  console.log('Top signals:')
  uniqueSignals.slice(0, 8).forEach((s, i) => {
    console.log(`  ${i + 1}. [${s.source}] ${s.content.slice(0, 120)}...`)
  })
  console.log('')

  // Convert signals to summary strings for the writer
  const signalSummaries = uniqueSignals.slice(0, 15).map(s =>
    `[${s.source}] ${s.content.slice(0, 200)}`
  )

  // ── Phase 2: Run writer → editor ──
  const writer = new CommentaryWriter(events)
  const editor = new CommentaryEditor(events)

  const results: Array<{
    round: number
    category: CommentaryCategory
    writerOutput: { text: string; tone: string; isQrt: boolean; qrtReason?: string }
    editorVerdict: { approved: boolean; text: string; qualityScore: number; reason: string; isQrt: boolean }
  }> = []

  const fakePosts: Post[] = []

  for (let i = 0; i < rounds; i++) {
    const category = categories[i % categories.length]

    console.log(`\n${'─'.repeat(60)}`)
    console.log(`ROUND ${i + 1}/${rounds} — ${category.toUpperCase()}`)
    console.log('─'.repeat(60))

    try {
      console.log('\n📝 WRITER generating 3 candidates...\n')
      const draft = await writer.generate(
        category,
        signalSummaries,
        fakePosts.map(p => p.text),
        category === 'self-aware'
          ? `Today the pipeline scanned ${scanners.length} sources and found ${uniqueSignals.length} unique signals about the Bitcoin agent economy.`
          : undefined,
      )

      console.log(`\n  Writer output: "${draft.text}"`)
      console.log(`  Tone: ${draft.tone} | QRT: ${draft.isQrt}${draft.qrtReason ? ` (${draft.qrtReason})` : ''}`)

      console.log('\n🔍 EDITOR reviewing...\n')
      const review = await editor.review(draft, fakePosts)

      const status = review.approved ? '✅ APPROVED' : '❌ REJECTED'
      console.log(`\n  ${status} — Quality: ${review.qualityScore}/10`)
      console.log(`  Reason: ${review.reason}`)
      if (review.approved && review.text !== draft.text) {
        console.log(`  Revised: "${review.text}"`)
      }

      results.push({
        round: i + 1,
        category,
        writerOutput: { text: draft.text, tone: draft.tone, isQrt: draft.isQrt, qrtReason: draft.qrtReason },
        editorVerdict: { approved: review.approved, text: review.text, qualityScore: review.qualityScore, reason: review.reason, isQrt: review.isQrt },
      })

      if (review.approved) {
        fakePosts.push({
          id: `test-${i}`, tweetId: '', text: review.text, type: 'commentary',
          postedAt: Date.now(), engagement: { likes: 0, retweets: 0, replies: 0, views: 0, lastChecked: 0 },
          commentaryCategory: category,
        })
      }
    } catch (err) {
      console.error(`\n  ⚠️  ERROR: ${(err as Error).message}`)
      results.push({
        round: i + 1, category,
        writerOutput: { text: 'ERROR', tone: 'error', isQrt: false },
        editorVerdict: { approved: false, text: 'ERROR', qualityScore: 0, reason: (err as Error).message, isQrt: false },
      })
    }
  }

  // ── Summary ──
  console.log(`\n${'═'.repeat(60)}`)
  console.log('SUMMARY')
  console.log('═'.repeat(60))

  const approved = results.filter(r => r.editorVerdict.approved)
  const rejected = results.filter(r => !r.editorVerdict.approved)

  console.log(`\nSignals scanned: ${uniqueSignals.length} from ${scanners.length} sources`)
  console.log(`Total: ${results.length} | Approved: ${approved.length} | Rejected: ${rejected.length}`)
  console.log(`Approval rate: ${Math.round((approved.length / results.length) * 100)}%`)

  if (approved.length > 0) {
    console.log('\n✅ APPROVED TWEETS:')
    approved.forEach(r => {
      console.log(`\n  [${r.category}] (${r.editorVerdict.qualityScore}/10)`)
      console.log(`  "${r.editorVerdict.text}"`)
    })
  }

  if (rejected.length > 0) {
    console.log('\n❌ REJECTED TWEETS:')
    rejected.forEach(r => {
      console.log(`\n  [${r.category}] (${r.editorVerdict.qualityScore}/10)`)
      console.log(`  "${r.writerOutput.text}"`)
      console.log(`  Reason: ${r.editorVerdict.reason}`)
    })
  }

  await mkdir('.data', { recursive: true })
  const outPath = `.data/commentary-live-test-${Date.now()}.json`
  await writeFile(outPath, JSON.stringify({
    runAt: new Date().toISOString(),
    signalCount: uniqueSignals.length,
    signalSources: scanners.map(s => s.name),
    rounds,
    categories,
    results,
  }, null, 2))
  console.log(`\nResults saved to: ${outPath}\n`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
