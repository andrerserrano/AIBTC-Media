import { generateObject } from 'ai'
import { anthropic } from '../ai.js'
import { z } from 'zod'
import { randomUUID, createHash } from 'crypto'
import type { Signal, Topic } from '../types.js'
import { Cache } from '../cache/cache.js'
import { EventBus } from '../console/events.js'
import { config } from '../config/index.js'
import { TOPIC_SCORING_SYSTEM } from '../prompts/scoring.js'
import { SAFETY_CHECK_SYSTEM } from '../prompts/safety.js'
import { MONOLOGUE_SYSTEM } from '../prompts/monologue.js'
import { withTimeout, LLM_TIMEOUT_MS } from '../utils/timeout.js'

const batchScoreSchema = z.object({
  topics: z.array(
    z.object({
      signalIndices: z.array(z.number()).describe('Which signal indices (0-based) this topic covers'),
      summary: z.string().describe('Short punchy headline — under 80 characters, no filler. This becomes the tweet text accompanying a cartoon. THREE modes: (1) SERIOUS NEWS: write like a NYT editor — "Block Lays Off Nearly Half Its Staff, Citing AI Automation" NOT the full wordy version. (2) WILD CLAIMS: lean into intrigue — "Satoshi Was AI From the Future" NOT "Binance Founder CZ: Satoshi Was AI From the Future". (3) ABSURD-PREMISE STORIES (industry does something that sounds like a joke): reframe as a punchline, NOT a news wire. Use colon structure, irony, or a deadpan setup — "Worldcoin\'s New Turing Test: Coinbase KYC" or "To Tell Humans from AI, Worldcoin Turned to… Coinbase" NOT "Worldcoin Now Uses Coinbase KYC to Distinguish Humans from AI". Drop the "Person Says:" prefix unless the WHO is the story — the standalone claim is punchier.'),
      safe: z.boolean().describe('Is this topic safe to cartoon about?'),
      safetyReason: z.string().optional().describe('If unsafe, why'),
      virality: z.number().describe('Score 0-10'),
      visualPotential: z.number().describe('Score 0-10'),
      audienceBreadth: z.number().describe('Score 0-10'),
      timeliness: z.number().describe('Score 0-10'),
      humor: z.number().describe('Score 0-10'),
      worldviewAlignment: z.number().describe('Score 0-10: how well does this connect to AIBTC Media\'s themes (Bitcoin agent economy, Stacks/sBTC, open protocols)?'),
      reasoning: z.string().describe('Brief explanation of the scoring'),
    }),
  ),
})

export class Scorer {
  constructor(
    private events: EventBus,
    private evalCache: Cache,
  ) {}

  /** Clear the evaluation cache so topics are re-scored fresh */
  clearCache(): void {
    this.evalCache.clear()
  }

  async scoreAndFilter(
    signals: Signal[],
    recentTopicSummaries: string[],
  ): Promise<Topic[]> {
    this.events.transition('shortlisting')

    if (signals.length === 0) {
      this.events.monologue('Nothing worth cartooning right now. Slow news cycle.')
      return []
    }

    // Check cache — hash ALL signal IDs so every source (Twitter, RSS, etc.)
    // contributes to the key. The old approach truncated to 500 chars of content,
    // which meant only the first ~10 signals (usually all AIBTC) affected the key
    // and new Twitter/RSS signals were invisible to the cache.
    const idHash = createHash('sha256')
      .update(signals.map(s => s.id).sort().join('|'))
      .digest('hex')
      .slice(0, 16)
    const batchKey = Cache.key(`batch-eval:${signals.length}:${idHash}`)
    const cached = this.evalCache.get(batchKey) as Topic[] | null
    if (cached) {
      this.events.monologue(`Using cached evaluation for ${cached.length} topics.`)
      return cached
    }

    this.events.monologue(
      `${signals.length} signals to evaluate. Batch-scoring in a single pass...`,
    )

    // Build a numbered signal list for the LLM
    const capped = signals.slice(0, 100)
    const signalList = capped
      .map((s, i) => `[${i}] ${s.content}`)
      .join('\n\n')

    const blacklist = recentTopicSummaries.length > 0
      ? `\n\n===== DO NOT REPEAT — ALREADY COVERED =====\nThe following topics, angles, and jokes have ALREADY been drawn. You MUST NOT select any topic that overlaps with these. If a signal covers the same ground as anything below, score its worldview alignment as 0 and mark it as already covered.\n\n${recentTopicSummaries.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n===== END BLACKLIST =====`
      : ''

    const { object } = await withTimeout(generateObject({
      model: anthropic(config.textModel),
      schema: batchScoreSchema,
      system: { role: 'system' as const, content: `${MONOLOGUE_SYSTEM}\n\n${TOPIC_SCORING_SYSTEM}\n\n${SAFETY_CHECK_SYSTEM}\n\nYou are evaluating a batch of signals. Group related signals into topics, then score each topic. Return at most 10 topics, ranked by cartoon potential. For each topic, list which signal indices it covers. Also perform a safety check inline — mark unsafe topics with safe=false.\n\nCRITICAL: Check every topic against the DO NOT REPEAT blacklist. If a topic covers the same subject, same angle, or same joke as anything on the blacklist — even if the phrasing is different — give it worldview alignment 0.`, providerOptions: { anthropic: { cacheControl: { type: 'ephemeral', ttl: '1h' } } } },
      prompt: `Score these signals for editorial cartoon potential:\n\n${signalList}${blacklist}`,
    }), LLM_TIMEOUT_MS, 'Topic scoring and filtering')

    const topics: Topic[] = []

    for (const scored of object.topics) {
      if (!scored.safe) {
        this.events.monologue(
          `"${scored.summary.slice(0, 60)}..." — skipping. ${scored.safetyReason ?? 'Content policy.'}`,
        )
        continue
      }

      const worldview = scored.worldviewAlignment ?? 0

      if (worldview < 4) {
        this.events.monologue(
          `"${scored.summary.slice(0, 60)}..." — worldview alignment ${worldview}/10. Not my beat. Skipping.`,
        )
        continue
      }

      const validIndices = scored.signalIndices
        .filter(i => i >= 0 && i < capped.length)

      // Capture source URLs for potential quoting
      const quoteCandidates: string[] = []
      for (const idx of validIndices) {
        const sig = capped[idx]
        if (sig.url) quoteCandidates.push(sig.url)
      }

      const composite =
        scored.virality * 0.20 +
        scored.visualPotential * 0.15 +
        scored.audienceBreadth * 0.10 +
        scored.timeliness * 0.05 +
        scored.humor * 0.20 +
        worldview * 0.30

      const isDuplicate = recentTopicSummaries.some(
        (recent) => this.similarity(recent, scored.summary) > 0.3,
      )

      if (isDuplicate) {
        this.events.monologue(
          `"${scored.summary.slice(0, 60)}..." — already covered recently. Skipping.`,
        )
        continue
      }

      const topic: Topic = {
        id: randomUUID(),
        signals: validIndices.map(i => capped[i].id),
        summary: scored.summary,
        scores: {
          virality: scored.virality,
          visualPotential: scored.visualPotential,
          audienceBreadth: scored.audienceBreadth,
          timeliness: scored.timeliness,
          humor: scored.humor,
          worldviewAlignment: worldview,
          composite,
        },
        safety: { passed: true },
        status: 'candidate',
        evaluatedAt: Date.now(),
        quoteCandidates: [...new Set(quoteCandidates)],
      }

      topics.push(topic)

      this.events.monologue(
        `"${scored.summary}" — virality: ${scored.virality}, visual: ${scored.visualPotential}, humor: ${scored.humor}, worldview: ${worldview}. Composite: ${topic.scores.composite.toFixed(1)}${isDuplicate ? ' (penalized — already covered recently)' : ''}. ${scored.reasoning}`,
      )
    }

    // Sort by composite score descending
    topics.sort((a, b) => b.scores.composite - a.scores.composite)

    // Source diversity enforcement: cap AIBTC-exclusive topics at 2 in the shortlist.
    // Topics where ALL contributing signals come from aibtc.news get pushed to the
    // back if more than 2 would otherwise dominate the top picks.
    {
      const MAX_AIBTC_EXCLUSIVE = 2
      let aibtcExclusiveCount = 0
      const promoted: Topic[] = []
      const demoted: Topic[] = []

      for (const topic of topics) {
        const allAibtc = topic.signals.length > 0 && topic.signals.every(sigId => {
          const sig = capped.find(s => s.id === sigId)
          return sig?.source === 'aibtc'
        })

        if (allAibtc && aibtcExclusiveCount >= MAX_AIBTC_EXCLUSIVE) {
          demoted.push(topic)
        } else {
          if (allAibtc) aibtcExclusiveCount++
          promoted.push(topic)
        }
      }

      // Reassemble: promoted first, then demoted (still available, just lower priority)
      topics.length = 0
      topics.push(...promoted, ...demoted)
    }

    // Mark top 5 as shortlisted
    for (let i = 0; i < Math.min(5, topics.length); i++) {
      topics[i].status = 'shortlisted'
    }

    this.events.emit({
      type: 'shortlist',
      topics: topics.slice(0, 5).map((t) => ({
        id: t.id,
        summary: t.summary,
        score: t.scores.composite,
      })),
      ts: Date.now(),
    })

    if (topics.length > 0) {
      this.events.monologue(
        `Top pick: "${topics[0].summary}" (${topics[0].scores.composite.toFixed(1)}). This has cartoon potential.`,
      )
    } else {
      this.events.monologue('Nothing worth cartooning right now. Slow news cycle.')
    }

    // Cache the batch result
    this.evalCache.set(batchKey, topics, config.cache.topicEvalTtlMs)

    return topics
  }

  private similarity(a: string, b: string): number {
    // Simple Jaccard similarity on words
    const wordsA = new Set(a.toLowerCase().split(/\s+/))
    const wordsB = new Set(b.toLowerCase().split(/\s+/))
    const intersection = [...wordsA].filter((w) => wordsB.has(w)).length
    const union = new Set([...wordsA, ...wordsB]).size
    return union === 0 ? 0 : intersection / union
  }
}

