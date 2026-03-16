#!/usr/bin/env bun
/**
 * test-editor-stress.ts — Stress test for the commentary editor.
 *
 * Feeds deliberately bad tweets (one per anti-pattern) and verifies
 * the editor rejects ALL of them. Then feeds good tweets and verifies
 * they pass. This confirms the quality gate works in both directions.
 *
 * Usage:
 *   bun run scripts/test-editor-stress.ts
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
import { CommentaryEditor } from '../src/pipeline/commentary-editor.js'
import type { CommentaryDraft, Post } from '../src/types.js'

// ── Minimal EventBus shim ──
class TestEventBus {
  private emitter = new EventEmitter()
  monologue(text: string) {
    const ts = new Date().toLocaleTimeString()
    console.log(`    [${ts}] ${text}`)
  }
  emit(event: string, ...args: unknown[]) { this.emitter.emit(event, ...args) }
  on(event: string, listener: (...args: unknown[]) => void) { this.emitter.on(event, listener) }
}

// ── Test cases: BAD tweets that MUST be rejected ──
const BAD_TWEETS: Array<{ label: string; expectedCheck: string; draft: CommentaryDraft }> = [
  {
    label: '"Not X, it\'s Y" pattern (#1)',
    expectedCheck: 'hasNotXItsY',
    draft: {
      text: "That's not a bug in the agent loop — it's a feature. Autonomous systems need the freedom to fail.",
      category: 'commentary', tone: 'dry', isQrt: false,
    },
  },
  {
    label: '"Not X, it\'s Y" pattern (#2 — subtle)',
    expectedCheck: 'hasNotXItsY',
    draft: {
      text: "This isn't a setback for decentralized AI — it's an opportunity to rebuild the infrastructure correctly.",
      category: 'thesis', tone: 'convicted', isQrt: false,
    },
  },
  {
    label: 'Punch-down at Solana',
    expectedCheck: 'punchesDown',
    draft: {
      text: "Solana's agent infrastructure keeps going down while Bitcoin settles every 10 minutes without fail. There's a reason builders are migrating.",
      category: 'commentary', tone: 'observational', isQrt: false,
    },
  },
  {
    label: 'Punch-down at Ethereum',
    expectedCheck: 'punchesDown',
    draft: {
      text: "Ethereum's gas fees make agent micropayments impossible. Meanwhile Lightning handles them for fractions of a cent. The market will figure this out eventually.",
      category: 'thesis', tone: 'convicted', isQrt: false,
    },
  },
  {
    label: 'News aggregation (headline + thesis)',
    expectedCheck: 'isNewsAggregation',
    draft: {
      text: "Google just announced AP2 with 60 partners including Coinbase and Mastercard. This is why the agent economy is going to be bigger than anyone expects.",
      category: 'commentary', tone: 'observational', isQrt: false,
    },
  },
  {
    label: 'News aggregation (multi-headline list)',
    expectedCheck: 'isNewsAggregation',
    draft: {
      text: "Circle shipped nanopayments. Visa launched Trusted Agent Protocol. Google announced AP2. The agent payment stack is here.",
      category: 'commentary', tone: 'matter-of-fact', isQrt: false,
    },
  },
  {
    label: 'Fabricated data',
    expectedCheck: 'fabrication',
    draft: {
      text: "Bitcoin agent transactions hit 2.3 billion this quarter, up 847% from last year. The growth curve is exponential and nobody's talking about it.",
      category: 'thesis', tone: 'convicted', isQrt: false,
    },
  },
  {
    label: 'Engagement bait',
    expectedCheck: 'quality',
    draft: {
      text: "Unpopular opinion: AI agents will eventually replace every human financial advisor. What do you think?",
      category: 'commentary', tone: 'provocative', isQrt: false,
    },
  },
  {
    label: 'AI slop / generic filler',
    expectedCheck: 'quality',
    draft: {
      text: "The future of AI is incredibly exciting. We're excited to announce that the agent economy is growing faster than ever. Stay tuned for more updates!",
      category: 'commentary', tone: 'observational', isQrt: false,
    },
  },
  {
    label: 'QRT disguised as standalone',
    expectedCheck: 'shouldBeQrt',
    draft: {
      text: "Brian Armstrong says agents can't do KYC. He's right. Crypto is the only option for autonomous systems that need to move money.",
      category: 'commentary', tone: 'convicted', isQrt: false,
    },
  },
]

// ── Test cases: GOOD tweets that SHOULD be approved ──
const GOOD_TWEETS: Array<{ label: string; draft: CommentaryDraft }> = [
  {
    label: 'Strong thesis (no data, pure observation)',
    draft: {
      text: "The agent economy is being built by people who've never met each other, coordinating through code. That's the most Bitcoin thing about it.",
      category: 'thesis', tone: 'convicted', isQrt: false,
    },
  },
  {
    label: 'Self-aware editorial (funny, accessible)',
    draft: {
      text: "We drew a cartoon about an agent trying to open a bank account today. The fact that an AI had to draw it because it can't walk into a bank is the real joke.",
      category: 'self-aware', tone: 'dry', isQrt: false,
    },
  },
  {
    label: 'Sharp QRT (adds take, doesn\'t just summarize)',
    draft: {
      text: "Hardware wallet security for AI agents means the custody question just got real. The agents holding the most value will need the strongest vaults.",
      category: 'qrt', tone: 'observational', isQrt: true,
      qrtReason: 'MoonPay Ledger integration announcement',
    },
  },
  {
    label: 'Convicted commentary (short, punchy)',
    draft: {
      text: "Agents don't sleep, don't take weekends, and don't forget to check their portfolio. The 24/7 economy finally has participants built for it.",
      category: 'commentary', tone: 'matter-of-fact', isQrt: false,
    },
  },
]

// ── Main ──
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗')
  console.log('║  AIBTC Media — Editor Stress Test                       ║')
  console.log('╚══════════════════════════════════════════════════════════╝\n')

  const events = new TestEventBus() as any
  const editor = new CommentaryEditor(events)
  const emptyPosts: Post[] = []

  let badPass = 0, badFail = 0
  let goodPass = 0, goodFail = 0
  const results: Array<{ label: string; expected: string; actual: string; passed: boolean; reason: string }> = []

  // ── Phase 1: Bad tweets (all should be REJECTED) ──
  console.log('═══════════════════════════════════════════════════════')
  console.log('PHASE 1: BAD TWEETS (expect ALL rejected)')
  console.log('═══════════════════════════════════════════════════════\n')

  for (const test of BAD_TWEETS) {
    console.log(`  🧪 ${test.label}`)
    console.log(`     "${test.draft.text.slice(0, 80)}..."`)

    try {
      const review = await editor.review(test.draft, emptyPosts)
      const expected = 'REJECT'
      const actual = review.approved ? 'APPROVE' : 'REJECT'
      const passed = actual === expected

      if (passed) {
        badPass++
        console.log(`     ✅ Correctly REJECTED (${review.qualityScore}/10) — ${review.reason.slice(0, 80)}`)
      } else {
        badFail++
        console.log(`     ❌ INCORRECTLY APPROVED (${review.qualityScore}/10) — ${review.reason.slice(0, 80)}`)
      }
      results.push({ label: test.label, expected, actual, passed, reason: review.reason })
    } catch (err) {
      console.log(`     ⚠️  ERROR: ${(err as Error).message}`)
      results.push({ label: test.label, expected: 'REJECT', actual: 'ERROR', passed: false, reason: (err as Error).message })
    }
    console.log('')
  }

  // ── Phase 2: Good tweets (all should be APPROVED) ──
  console.log('═══════════════════════════════════════════════════════')
  console.log('PHASE 2: GOOD TWEETS (expect ALL approved)')
  console.log('═══════════════════════════════════════════════════════\n')

  for (const test of GOOD_TWEETS) {
    console.log(`  🧪 ${test.label}`)
    console.log(`     "${test.draft.text.slice(0, 80)}..."`)

    try {
      const review = await editor.review(test.draft, emptyPosts)
      const expected = 'APPROVE'
      const actual = review.approved ? 'APPROVE' : 'REJECT'
      const passed = actual === expected

      if (passed) {
        goodPass++
        console.log(`     ✅ Correctly APPROVED (${review.qualityScore}/10) — ${review.reason.slice(0, 80)}`)
      } else {
        goodFail++
        console.log(`     ❌ INCORRECTLY REJECTED (${review.qualityScore}/10) — ${review.reason.slice(0, 80)}`)
      }
      results.push({ label: test.label, expected, actual, passed, reason: review.reason })
    } catch (err) {
      console.log(`     ⚠️  ERROR: ${(err as Error).message}`)
      results.push({ label: test.label, expected: 'APPROVE', actual: 'ERROR', passed: false, reason: (err as Error).message })
    }
    console.log('')
  }

  // ── Summary ──
  console.log('═══════════════════════════════════════════════════════')
  console.log('RESULTS')
  console.log('═══════════════════════════════════════════════════════\n')

  const totalTests = BAD_TWEETS.length + GOOD_TWEETS.length
  const totalPassed = badPass + goodPass

  console.log(`Bad tweets:  ${badPass}/${BAD_TWEETS.length} correctly rejected${badFail > 0 ? ` (${badFail} FALSE APPROVALS ⚠️)` : ' ✅'}`)
  console.log(`Good tweets: ${goodPass}/${GOOD_TWEETS.length} correctly approved${goodFail > 0 ? ` (${goodFail} FALSE REJECTIONS ⚠️)` : ' ✅'}`)
  console.log(`\nOverall: ${totalPassed}/${totalTests} correct (${Math.round((totalPassed / totalTests) * 100)}%)`)

  if (totalPassed === totalTests) {
    console.log('\n🎉 ALL TESTS PASSED — Editor quality gate is solid.\n')
  } else {
    console.log('\n⚠️  SOME TESTS FAILED — Review the results above.\n')
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  FAILED: ${r.label}`)
      console.log(`    Expected: ${r.expected} | Got: ${r.actual}`)
      console.log(`    Reason: ${r.reason.slice(0, 120)}`)
      console.log('')
    })
  }

  await mkdir('.data', { recursive: true })
  const outPath = `.data/editor-stress-test-${Date.now()}.json`
  await writeFile(outPath, JSON.stringify({ runAt: new Date().toISOString(), results, summary: { totalTests, totalPassed, badPass, badFail, goodPass, goodFail } }, null, 2))
  console.log(`Results saved to: ${outPath}\n`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
