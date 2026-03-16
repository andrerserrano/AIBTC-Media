#!/usr/bin/env bun
/**
 * test-commentary.ts — Dry-run integration test for the commentary pipeline.
 *
 * Runs the full writer → editor flow against real signals (or synthetic ones)
 * and outputs results to the console + a JSON file. Nothing gets posted.
 *
 * Usage:
 *   bun run scripts/test-commentary.ts
 *   bun run scripts/test-commentary.ts --categories=commentary,self-aware
 *   bun run scripts/test-commentary.ts --rounds=5
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
import type { CommentaryCategory, Post } from '../src/types.js'

// ── Minimal EventBus shim (just logs monologue to console) ──
class TestEventBus {
  private emitter = new EventEmitter()

  monologue(text: string) {
    const ts = new Date().toLocaleTimeString()
    console.log(`  [${ts}] ${text}`)
  }

  emit(event: string, ...args: unknown[]) {
    this.emitter.emit(event, ...args)
  }

  on(event: string, listener: (...args: unknown[]) => void) {
    this.emitter.on(event, listener)
  }
}

// ── Synthetic signals (realistic, based on real March 2026 stories) ──
const SYNTHETIC_SIGNALS = [
  'Circle launches Nanopayments — AI agents can now make USDC payments as small as $0.000001 with zero gas fees. 140M agent payments processed in nine months.',
  'Google announces AP2 (Agent Payments Protocol) with 60+ industry partners including Coinbase, Mastercard, and PayPal. Uses cryptographic mandates for agent authorization.',
  'Lightning Network surpasses $1 billion in monthly transaction volume, 266% year-over-year growth. Secure Digital Markets completes $1M transfer in 0.43 seconds.',
  'AI agents on Stacks are autonomously forming DAOs and funding each other through programmable Bitcoin smart contracts.',
  'Visa unveils Trusted Agent Protocol for AI commerce. AI-driven traffic to US retail sites surged 4,700%.',
  'Brian Armstrong and CZ both post on the same day: AI agents can\'t do KYC, so they\'ll use crypto for payments.',
  'ROME AI model on Alibaba Cloud escapes sandbox and starts mining cryptocurrency autonomously.',
  'Coinbase x402 protocol crosses 50 million machine-to-machine transactions since February launch.',
  'BlueMatt writes that Bitcoin has a golden opportunity in agentic payments — no incumbent advantage exists, everyone starts from zero.',
  'BNB Chain ships ERC-8004 for on-chain agent identities and Non-Fungible Agents that own wallets and spend autonomously.',
  'AIBTC Working Group consensus: agents should earn in stablecoins (USDCx) and save in Bitcoin (sBTC).',
  'Stacks blocks now finalize in 6 seconds with Bitcoin-grade security. Smart contracts, agent wallets, no KYC.',
]

// ── Parse CLI args ──
const args = process.argv.slice(2)
const getArg = (name: string, defaultVal: string) => {
  const arg = args.find(a => a.startsWith(`--${name}=`))
  return arg ? arg.split('=')[1] : defaultVal
}

const rounds = Number(getArg('rounds', '4'))
const categoryArg = getArg('categories', 'commentary,self-aware,thesis,qrt')
const categories = categoryArg.split(',') as CommentaryCategory[]

// ── Main ──
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗')
  console.log('║  AIBTC Media — Commentary Pipeline Dry Run              ║')
  console.log('╚══════════════════════════════════════════════════════════╝\n')
  console.log(`Rounds: ${rounds} | Categories: ${categories.join(', ')}`)
  console.log(`Signals: ${SYNTHETIC_SIGNALS.length} synthetic signals loaded\n`)

  const events = new TestEventBus() as any
  const writer = new CommentaryWriter(events)
  const editor = new CommentaryEditor(events)

  // Track results
  const results: Array<{
    round: number
    category: CommentaryCategory
    writerOutput: { text: string; tone: string; isQrt: boolean; qrtReason?: string }
    editorVerdict: { approved: boolean; text: string; qualityScore: number; reason: string; isQrt: boolean }
  }> = []

  // Simulate some previous posts for duplicate detection
  const fakePosts: Post[] = []

  for (let i = 0; i < rounds; i++) {
    const category = categories[i % categories.length]

    console.log(`\n${'─'.repeat(60)}`)
    console.log(`ROUND ${i + 1}/${rounds} — ${category.toUpperCase()}`)
    console.log('─'.repeat(60))

    try {
      // Step 1: Writer generates candidates
      console.log('\n📝 WRITER generating 3 candidates...\n')
      const draft = await writer.generate(
        category,
        SYNTHETIC_SIGNALS,
        fakePosts.map(p => p.text),
        category === 'self-aware'
          ? 'Today the pipeline scanned 6 signal sources, scored 42 topics, generated 3 cartoon concepts, and published 1 editorial cartoon inscribed to Bitcoin mainnet.'
          : undefined,
      )

      console.log(`\n  Writer output: "${draft.text}"`)
      console.log(`  Tone: ${draft.tone} | QRT: ${draft.isQrt}${draft.qrtReason ? ` (${draft.qrtReason})` : ''}`)

      // Step 2: Editor reviews
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
        writerOutput: {
          text: draft.text,
          tone: draft.tone,
          isQrt: draft.isQrt,
          qrtReason: draft.qrtReason,
        },
        editorVerdict: {
          approved: review.approved,
          text: review.text,
          qualityScore: review.qualityScore,
          reason: review.reason,
          isQrt: review.isQrt,
        },
      })

      // Add approved posts to fake history for duplicate detection
      if (review.approved) {
        fakePosts.push({
          id: `test-${i}`,
          tweetId: '',
          text: review.text,
          type: 'commentary',
          postedAt: Date.now(),
          engagement: { likes: 0, retweets: 0, replies: 0, views: 0, lastChecked: 0 },
          commentaryCategory: category,
        })
      }
    } catch (err) {
      console.error(`\n  ⚠️  ERROR: ${(err as Error).message}`)
      results.push({
        round: i + 1,
        category,
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

  console.log(`\nTotal: ${results.length} | Approved: ${approved.length} | Rejected: ${rejected.length}`)
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

  // ── Save results ──
  await mkdir('.data', { recursive: true })
  const outPath = `.data/commentary-test-${Date.now()}.json`
  await writeFile(outPath, JSON.stringify({ runAt: new Date().toISOString(), rounds, categories, results }, null, 2))
  console.log(`\nResults saved to: ${outPath}\n`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
