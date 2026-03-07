import { randomUUID } from 'crypto'
import type { Cartoon, CartoonConcept, ConceptCritique, Post, Signal, Topic } from '../types.js'
import { EventBus } from '../console/events.js'
import { Scorer } from '../pipeline/scorer.js'

/** Any object that can scan for signals — allows combining multiple scanners */
interface SignalScanner {
  scan(): Promise<Signal[]>
  readonly bufferSize: number
}
import { Ideator } from '../pipeline/ideator.js'
import { Generator } from '../pipeline/generator.js'
import { Captioner } from '../pipeline/captioner.js'
import { TwitterClient } from '../twitter/client.js'
import { EngagementLoop } from '../twitter/engagement.js'
import { Editor } from '../pipeline/editor.js'
import { Composer } from '../pipeline/composer.js'
import { JsonStore } from '../store/json-store.js'
import { toCdnUrl } from '../cdn/r2.js'
import { config } from '../config/index.js'
import type { WorldviewStore } from './worldview.js'
import { join } from 'path'

interface AgentStores {
  cartoons: JsonStore<Cartoon[]>
  posts: JsonStore<Post[]>
}

interface TimerState {
  lastFlagship: number
  lastQuickhit: number
  lastEngagement: number
  lastReflection: number
}

interface Shortlist {
  topics: Topic[]
  signals: Signal[]
  recentSummaries: string[]
  ranAt: number
}

export class AgentLoop {
  private running = false
  private lastFlagship = 0
  private lastQuickhit = 0
  private lastEngagement = 0
  private lastReflection = 0
  private engagementCooldownMs = 5 * 60_000
  private postCount = 0
  private shortlist: Shortlist | null = null
  private timerStore: JsonStore<TimerState>
  private rejectedTopics: JsonStore<Array<string | { summary: string; ts: number }>>
  private rejectedCartoons: JsonStore<Array<{
    caption: string
    imageUrl: string
    reason: string
    rejectedAt: number
  }>>

  constructor(
    private events: EventBus,
    private scanner: SignalScanner,
    private scorer: Scorer,
    private ideator: Ideator,
    private generator: Generator,
    private captioner: Captioner,
    private twitter: TwitterClient,
    private engagement: EngagementLoop,
    private editor: Editor,
    private composer: Composer,
    private stores: AgentStores,
    private worldview?: WorldviewStore,
  ) {
    this.timerStore = new JsonStore(join(config.dataDir, 'agent-timers.json'))
    this.rejectedTopics = new JsonStore(join(config.dataDir, 'rejected-topics.json'))
    this.rejectedCartoons = new JsonStore(join(config.dataDir, 'rejected-cartoons.json'))
  }

  async start(): Promise<void> {
    this.running = true

    // Restore timer state from disk so we resume where we left off
    const saved = await this.timerStore.read()
    if (saved) {
      this.lastFlagship = saved.lastFlagship
      this.lastQuickhit = saved.lastQuickhit
      this.lastEngagement = saved.lastEngagement
      this.lastReflection = saved.lastReflection
      this.events.monologue('Resumed from previous state. Scanning for signals...')
    } else {
      this.events.monologue("AIBTC Media is awake. Scanning the Bitcoin agent economy for stories worth telling.")
    }

    while (this.running) {
      try {
        await this.tick()
        await this.persistTimers()
      } catch (err) {
        this.events.monologue(`Loop error: ${(err as Error).message}. Recovering...`)
      }
      await sleep(config.tickIntervalMs)
    }
  }

  stop(): void {
    this.running = false
    this.events.monologue('Shutting down. The agent economy keeps going, but I need to rest.')
  }

  private async tick(): Promise<void> {
    const signals = await this.scanner.scan()
    if (signals.length === 0) {
      this.events.monologue('No new signals. The agent economy is quiet.')
    }

    const now = Date.now()

    // Engagement check (every 5 min)
    if (now - this.lastEngagement >= this.engagementCooldownMs) {
      try {
        await this.engagement.check()
      } catch (err) {
        this.events.monologue(`Engagement check failed: ${(err as Error).message}`)
      }
      this.lastEngagement = now
    }

    // Worldview reflection (rare — every ~7 days)
    if (now - this.lastReflection >= config.reflectionIntervalMs) {
      try {
        const posts = (await this.stores.posts.read()) ?? []
        const recentSummaries = posts
          .filter((p) => Date.now() - p.postedAt < 14 * 24 * 3600_000)
          .map((p) => p.text)
        if (this.worldview) await this.worldview.reflect(recentSummaries)
      } catch (err) {
        this.events.monologue(`Reflection failed: ${(err as Error).message}`)
      }
      this.lastReflection = now
    }

    // Content decisions
    if (signals.length === 0) return

    const timeSinceFlagship = now - this.lastFlagship
    const timeSinceQuickhit = now - this.lastQuickhit
    const adaptiveCooldown = this.getAdaptiveCooldown()

    if (timeSinceFlagship >= config.flagshipIntervalMs) {
      await this.doFlagship(signals)
    } else if (timeSinceQuickhit >= adaptiveCooldown) {
      await this.doQuickhit(signals)
    } else {
      await this.tickCooldown(signals, adaptiveCooldown - timeSinceQuickhit)
    }
  }

  // --- Cooldown: shortlist topics so the post phase can skip scoring ---

  private async tickCooldown(signals: Signal[], remainingMs: number): Promise<void> {
    const now = Date.now()
    const remainingMin = Math.round(remainingMs / 60_000)
    const SHORTLIST_TTL = 10 * 60_000

    // Re-shortlist every 10 min so it stays fresh with new signals
    if (this.shortlist && now - this.shortlist.ranAt < SHORTLIST_TTL) {
      if (remainingMin === 5 || remainingMin === 3 || remainingMin === 1) {
        this.events.monologue(`Posting in ~${remainingMin}min.`)
      }
      return
    }

    this.events.monologue(
      `${remainingMin}min until next comic. Shortlisting stories while I wait...`,
    )

    const recentSummaries = await this.getRecentTopicSummaries()
    const topics = await this.scorer.scoreAndFilter(signals, recentSummaries)

    if (topics.length === 0) {
      this.shortlist = null
      this.events.monologue('Nothing strong enough to shortlist yet. Scanning...')
      return
    }

    this.shortlist = { topics, signals, recentSummaries, ranAt: Date.now() }
    this.events.monologue(
      `Shortlisted ${topics.length} topics. Top pick: "${topics[0].summary.slice(0, 70)}..." (score ${topics[0].scores.composite.toFixed(1)}).`,
    )
  }

  // --- Flagship ---

  private async doFlagship(signals: Signal[]): Promise<void> {
    let topics: Topic[]
    let recentSummaries: string[]

    if (this.shortlist) {
      this.events.monologue('Cooldown over. Shortlist ready — jumping straight to creation...')
      topics = this.shortlist.topics
      recentSummaries = this.shortlist.recentSummaries
      signals = this.shortlist.signals.length > 0 ? this.shortlist.signals : signals
      this.shortlist = null
    } else {
      this.events.monologue('Time for a flagship comic strip. Let me find the best story...')
      recentSummaries = await this.getRecentTopicSummaries()
      topics = await this.scorer.scoreAndFilter(signals, recentSummaries)
    }

    if (topics.length === 0) {
      this.events.monologue('Nothing worth a flagship right now. Will try again next cycle.')
      return
    }

    // Try up to 3 topics — if the editor rejects one, try the next
    let topic = topics[0]
    let best: CartoonConcept | null = null
    let critique: ConceptCritique | null = null
    let variants: string[] = []
    let prompt = ''
    let caption = ''

    for (let ti = 0; ti < Math.min(3, topics.length); ti++) {
      topic = topics[ti]
      topic.status = 'selected'
      this.events.monologue(`Trying topic ${ti + 1}/${Math.min(3, topics.length)}: "${topic.summary.slice(0, 80)}..."`)

      const conceptCount = config.testMode ? 1 : 3
      const concepts = await this.ideator.ideate(topic, conceptCount, recentSummaries)
      const critiqueResult = await this.ideator.critique(concepts)
      best = critiqueResult.best
      critique = critiqueResult.critique

      const refImages = this.collectMediaUrls(signals, topic)
      if (refImages.length > 0) best.referenceImageUrls = refImages

      let genResult = await this.generator.generate(best)
      for (let attempt = 1; attempt <= config.maxImageRetries && genResult.variants.length === 0; attempt++) {
        genResult = await this.generator.retry(best, `Attempt ${attempt} failed. Simplify the composition.`, attempt)
      }
      if (genResult.variants.length === 0) {
        this.events.monologue('Image generation failed. Trying next topic.')
        continue
      }
      variants = genResult.variants
      prompt = genResult.prompt

      caption = await this.captioner.generate(best, recentSummaries)

      const allPosts = (await this.stores.posts.read()) ?? []
      const allCartoons = (await this.stores.cartoons.read()) ?? []
      const review = await this.editor.review(best, caption, variants[0], allPosts, allCartoons)

      if (!review.approved) {
        await this.blacklistTopic(topic.summary)
        await this.rejectedCartoons.update(
          (list) => [...list, {
            caption,
            imageUrl: `/images/${variants[0].split('/').pop()}`,
            reason: review.reason,
            rejectedAt: Date.now(),
          }].slice(-50),
          [],
        )
        this.events.monologue(`Editor rejected topic ${ti + 1}. Blacklisted. Trying next...`)
        best = null
        continue
      }

      caption = review.caption
      break
    }

    if (!best || !critique || variants.length === 0) {
      this.events.monologue('All candidate topics rejected by editor. Nothing to post this cycle.')
      return
    }

    // Compose the final framed cartoon (image + orange divider + caption)
    const composedPath = await this.composer.composeCartoon(variants[0], caption)

    const cartoon: Cartoon = {
      id: randomUUID(),
      conceptId: best.id,
      topicId: topic.id,
      type: 'flagship',
      concept: best,
      imagePrompt: prompt,
      variants,
      selectedVariant: 0,
      critique,
      caption,
      createdAt: Date.now(),
    }

    const tweetId = await this.twitter.postCartoon({ text: caption, imagePath: composedPath })

    const post: Post = {
      id: randomUUID(),
      tweetId,
      cartoonId: cartoon.id,
      text: caption,
      imageUrl: toCdnUrl(variants[0], 'images'),
      type: 'flagship',
      postedAt: Date.now(),
      engagement: { likes: 0, retweets: 0, replies: 0, views: 0, lastChecked: 0 },
    }

    await this.stores.cartoons.update((c) => [...c, cartoon], [])
    await this.stores.posts.update((p) => [...p, post], [])
    this.lastFlagship = Date.now()
    this.postCount++
  }

  // --- Quick-hit ---

  private async doQuickhit(signals: Signal[]): Promise<void> {
    let topics: Topic[]
    let recentSummaries: string[]

    if (this.shortlist) {
      this.events.monologue('Cooldown over. Shortlist ready — quick-hit time.')
      topics = this.shortlist.topics
      recentSummaries = this.shortlist.recentSummaries
      signals = this.shortlist.signals.length > 0 ? this.shortlist.signals : signals
      this.shortlist = null
    } else {
      this.events.monologue('Something caught my eye. Quick-hit time.')
      recentSummaries = await this.getRecentTopicSummaries()
      topics = await this.scorer.scoreAndFilter(signals, recentSummaries)
    }

    if (topics.length === 0) return

    const topic = topics[0]
    if (topic.scores.composite < 5) {
      this.events.monologue(
        `Best topic scores ${topic.scores.composite.toFixed(1)}. Not strong enough for a quick-hit.`,
      )
      return
    }

    topic.status = 'selected'
    const concepts = await this.ideator.ideate(topic, 1)
    const concept = concepts[0]

    const refImages = this.collectMediaUrls(signals, topic)
    if (refImages.length > 0) concept.referenceImageUrls = refImages

    let result = await this.generator.generate(concept, 1)
    if (result.variants.length === 0) {
      result = await this.generator.retry(concept, 'Simplify.', 1)
    }
    if (result.variants.length === 0) return
    const { variants, prompt } = result

    let caption = await this.captioner.generate(concept)

    // Editorial review — image + text
    const allPosts = (await this.stores.posts.read()) ?? []
    const allCartoons = (await this.stores.cartoons.read()) ?? []
    const review = await this.editor.review(concept, caption, variants[0], allPosts, allCartoons)

    if (!review.approved) {
      await this.blacklistTopic(topic.summary)
      this.events.monologue(`Quick-hit rejected by editor. Topic blacklisted. Moving on.`)
      return
    }

    caption = review.caption

    // Compose the final framed cartoon (image + orange divider + caption)
    const composedPath = await this.composer.composeCartoon(variants[0], caption)

    const cartoon: Cartoon = {
      id: randomUUID(),
      conceptId: concept.id,
      topicId: topic.id,
      type: 'quickhit',
      concept,
      imagePrompt: prompt,
      variants,
      selectedVariant: 0,
      critique: {
        conceptId: concept.id, humor: 0, clarity: 0, shareability: 0,
        visualSimplicity: 0, overallScore: 0, critique: 'Quick-hit — no formal critique',
      },
      caption,
      createdAt: Date.now(),
    }

    const tweetId = await this.twitter.postCartoon({ text: caption, imagePath: composedPath })

    const post: Post = {
      id: randomUUID(),
      tweetId,
      cartoonId: cartoon.id,
      text: caption,
      imageUrl: toCdnUrl(variants[0], 'images'),
      type: 'quickhit',
      postedAt: Date.now(),
      engagement: { likes: 0, retweets: 0, replies: 0, views: 0, lastChecked: 0 },
    }

    await this.stores.cartoons.update((c) => [...c, cartoon], [])
    await this.stores.posts.update((p) => [...p, post], [])
    this.lastQuickhit = Date.now()
    this.postCount++
  }

  // --- Adaptive cooldown ---

  private getAdaptiveCooldown(): number {
    const { minCooldownMs, maxCooldownMs, growthFactor } = config.posting
    const cooldown = minCooldownMs * Math.pow(growthFactor, this.postCount)
    return Math.min(cooldown, maxCooldownMs)
  }

  // --- Helpers ---

  private collectMediaUrls(signals: Signal[], topic: Topic): string[] {
    const urls: string[] = []
    for (const sigId of topic.signals) {
      const signal = signals.find((s) => s.id === sigId)
      if (signal?.mediaUrls) urls.push(...signal.mediaUrls)
    }
    return [...new Set(urls)].slice(0, 3)
  }

  private async blacklistTopic(summary: string): Promise<void> {
    await this.rejectedTopics.update(
      (list) => [...list, { summary, ts: Date.now() }].slice(-200),
      [],
    )
  }

  private async getRecentTopicSummaries(): Promise<string[]> {
    const cartoons = (await this.stores.cartoons.read()) ?? []
    const posts = (await this.stores.posts.read()) ?? []

    const recentWindow = 7 * 24 * 3600_000
    const recentCartoons = cartoons
      .filter(c => Date.now() - c.createdAt < recentWindow)

    const summaries: string[] = []
    for (const cartoon of recentCartoons) {
      summaries.push(cartoon.concept.visual)
      summaries.push(cartoon.caption)
    }

    const recentPosts = posts.filter(p => Date.now() - p.postedAt < recentWindow)
    for (const post of recentPosts) {
      summaries.push(post.text)
    }

    const blacklistTtlMs = 3 * 24 * 3600_000
    const blacklisted = (await this.rejectedTopics.read()) ?? []
    for (const entry of blacklisted) {
      if (typeof entry === 'string') {
        summaries.push(entry)
      } else if (entry && typeof entry === 'object' && 'summary' in entry) {
        const e = entry as { summary: string; ts: number }
        if (Date.now() - e.ts < blacklistTtlMs) {
          summaries.push(e.summary)
        }
      }
    }

    return summaries
  }

  private async persistTimers(): Promise<void> {
    await this.timerStore.write({
      lastFlagship: this.lastFlagship,
      lastQuickhit: this.lastQuickhit,
      lastEngagement: this.lastEngagement,
      lastReflection: this.lastReflection,
    })
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
