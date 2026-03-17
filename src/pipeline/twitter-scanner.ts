import type { Signal } from '../types.js'
import type { TwitterReadProvider, Tweet } from '../twitter/provider.js'
import { Cache } from '../cache/cache.js'
import { EventBus } from '../console/events.js'
import { config } from '../config/index.js'
import { generateObject } from 'ai'
import { anthropic } from '../ai.js'
import { z } from 'zod'
import { withTimeout, API_TIMEOUT_MS, LLM_TIMEOUT_MS } from '../utils/timeout.js'

const relevanceSchema = z.object({
  tweets: z.array(
    z.object({
      index: z.number(),
      relevant: z.boolean(),
      reason: z.string().describe('Brief explanation of why this is or is not relevant'),
      beat: z.string().optional().describe('Suggested beat: infrastructure, governance, dev-tools, defi, culture'),
    }),
  ),
})

/**
 * TwitterScanner — Searches Twitter/X for trending Bitcoin × AI discussions
 * and converts them into pipeline Signals.
 *
 * Follows the same scanner pattern as RSSScanner:
 *   fetch → pre-filter → LLM relevance filter → convert to Signal → dedup → cache
 *
 * Uses the existing TwitterReadProvider.search() method (v2 API, bearer token).
 */
export class TwitterScanner {
  private buffer: Map<string, Signal> = new Map()
  private seenIds = new Set<string>()

  constructor(
    private events: EventBus,
    private signalCache: Cache<Signal[]>,
    private readProvider: TwitterReadProvider,
  ) {}

  async scan(): Promise<Signal[]> {
    if (!config.twitter.searchEnabled) return []

    const cacheKey = Cache.key('twitter-search')
    const cached = this.signalCache.get(cacheKey)
    if (cached) {
      this.events.monologue(`Twitter: using cached scan (${cached.length} signals).`)
      return cached
    }

    try {
      this.events.monologue(`Scanning Twitter/X for Bitcoin × AI discussions...`)

      // Fetch tweets from all configured search queries
      const allTweets = await this.fetchTweets()
      if (allTweets.length === 0) {
        this.events.monologue(`Twitter: no tweets passed pre-filter.`)
        this.signalCache.set(cacheKey, [], config.scan.newsTtlMs)
        return []
      }

      // Filter for Bitcoin × AI relevance using LLM
      const relevant = await this.filterForRelevance(allTweets)

      if (relevant.length === 0) {
        this.events.monologue(
          `Twitter: ${allTweets.length} tweets scanned, none passed relevance filter.`
        )
        this.signalCache.set(cacheKey, [], config.scan.newsTtlMs)
        return []
      }

      // Convert to pipeline Signal format
      const signals = relevant.map((item) => this.convertToSignal(item.tweet, item.query, item.beat))

      // Deduplicate against previously seen
      const newSignals = signals.filter((s) => {
        const tweetId = s.twitter?.tweetId ?? s.id
        if (this.seenIds.has(tweetId)) return false
        this.seenIds.add(tweetId)
        this.buffer.set(s.id, s)
        return true
      })

      this.signalCache.set(cacheKey, newSignals, config.scan.newsTtlMs)

      if (newSignals.length > 0) {
        this.events.monologue(
          `Twitter: ${newSignals.length} relevant tweets from ${allTweets.length} total. Top: "@${newSignals[0].twitter?.username}: ${newSignals[0].content.slice(0, 60)}..."`
        )
      }

      return newSignals
    } catch (err) {
      this.events.monologue(`Twitter scan failed: ${(err as Error).message}`)
      return []
    }
  }

  /**
   * Run all configured search queries and pre-filter results by engagement.
   */
  private async fetchTweets(): Promise<Array<{ tweet: Tweet; query: string }>> {
    const results: Array<{ tweet: Tweet; query: string }> = []
    const seenInBatch = new Set<string>()

    for (const query of config.twitter.searchQueries) {
      try {
        const searchResult = await withTimeout(
          this.readProvider.search(query, 'Top'),
          API_TIMEOUT_MS,
          `Twitter search "${query.slice(0, 40)}"`,
        )

        for (const tweet of searchResult.tweets) {
          // Dedup within this batch (same tweet can match multiple queries)
          if (seenInBatch.has(tweet.id)) continue
          seenInBatch.add(tweet.id)

          // Pre-filter: skip replies
          if (tweet.isReply) continue

          // Pre-filter: minimum engagement
          if (tweet.likeCount < config.twitter.searchMinLikes) continue

          // Pre-filter: minimum follower count (skip bots)
          if (tweet.author.followers < config.twitter.searchMinFollowers) continue

          results.push({ tweet, query })
        }
      } catch (err) {
        this.events.monologue(`Twitter search query "${query}" failed: ${(err as Error).message}`)
      }
    }

    // Sort by engagement (likes + retweets*2) descending
    results.sort((a, b) => {
      const scoreA = a.tweet.likeCount + a.tweet.retweetCount * 2
      const scoreB = b.tweet.likeCount + b.tweet.retweetCount * 2
      return scoreB - scoreA
    })

    // Cap results to avoid sending too many to LLM
    return results.slice(0, config.twitter.searchMaxResults)
  }

  /** System prompt shared across all relevance-filter batches. */
  private static readonly RELEVANCE_SYSTEM = `You are a signal pre-filter for AIBTC Media, an autonomous media company that creates editorial cartoons about AI, technology, and the agent economy.

Your job: identify which Twitter/X posts are worth covering. Be topically broad but quality-strict. The downstream scorer and editor handle final decisions.

RELEVANT — include any of these:

Core beat (always include):
- AI agents interacting with Bitcoin, crypto, or financial systems
- Bitcoin or crypto infrastructure enabling AI agents
- Agent economy discussions, autonomous finance, machine-to-machine payments
- DeFi protocols incorporating AI agents or autonomous trading
- Policy or regulation at the intersection of AI and Bitcoin/crypto
- Significant Bitcoin ecosystem developments (Lightning milestones, protocol upgrades, L2 launches)

Broader AI and tech (also include — editorial pipeline adds the Bitcoin lens):
- AI agents, autonomous systems, AI automation, agent economy
- AI replacing or augmenting human jobs, labor economics of AI
- AI companies and products (OpenAI, Anthropic, Google, Meta, startups) — launches, controversies, funding
- AI regulation, safety debates, governance, open vs. closed AI
- Viral or culturally significant tech stories people are talking about
- Humor, satire, or commentary about AI, crypto, or tech culture

NOT RELEVANT — exclude:
- Pure price predictions with no substance ("BTC to $100K!")
- Token price speculation, presale promotions, or obvious shilling
- Spam, bot-generated content, automated alerts, portfolio screenshots
- "Which crypto should I buy?" type content
- Job postings, hiring announcements, or career advice
- Tutorial bait / engagement farming ("5 AI tools you NEED" / "Like if you agree" / "Thread on how I...")
- Corporate press releases with no story (just product announcements)
- Duplicate or near-duplicate posts from the same account
- Completely off-topic content (sports, entertainment, food) with no tech angle

If a tweet is about AI, Bitcoin, crypto, or tech and has genuine news value or cultural significance, include it. If it's noise — even on-topic noise — exclude it.`

  /** Max tweets per LLM call — larger batches reduce API calls while Haiku handles them well. */
  private static readonly BATCH_SIZE = 40

  /**
   * Use LLM to identify which tweets are at the Bitcoin × AI intersection.
   * Processes tweets in batches to avoid overwhelming the structured output.
   */
  private async filterForRelevance(
    items: Array<{ tweet: Tweet; query: string }>
  ): Promise<Array<{ tweet: Tweet; query: string; beat?: string }>> {
    const results: Array<{ tweet: Tweet; query: string; beat?: string }> = []

    // Process in batches to keep structured output reliable
    for (let start = 0; start < items.length; start += TwitterScanner.BATCH_SIZE) {
      const batch = items.slice(start, start + TwitterScanner.BATCH_SIZE)
      const batchResults = await this.filterBatch(batch)
      results.push(...batchResults)
    }

    return results
  }

  /**
   * Run LLM relevance filter on a single batch of tweets.
   * Retries once with a halved batch on schema failure.
   */
  private async filterBatch(
    batch: Array<{ tweet: Tweet; query: string }>
  ): Promise<Array<{ tweet: Tweet; query: string; beat?: string }>> {
    const tweetList = batch
      .map((item, i) => `[${i}] @${item.tweet.author.userName} (${item.tweet.author.followers} followers, ${item.tweet.likeCount} likes)\n    "${item.tweet.text}"`)
      .join('\n\n')

    try {
      const { object } = await withTimeout(generateObject({
        model: anthropic(config.relevanceModel),
        schema: relevanceSchema,
        system: TwitterScanner.RELEVANCE_SYSTEM,
        prompt: `Which of these tweets are worth covering? If a tweet is about AI, Bitcoin, crypto, or tech and has genuine news value or cultural significance, include it.\n\n${tweetList}`,
      }), LLM_TIMEOUT_MS, 'Twitter relevance filter')

      return object.tweets
        .filter((t) => t.relevant && t.index >= 0 && t.index < batch.length)
        .map((t) => ({
          ...batch[t.index],
          beat: t.beat,
        }))
    } catch (err) {
      // If schema fails on this batch, retry with smaller halves
      if (batch.length > 5) {
        this.events.monologue(
          `Twitter relevance batch (${batch.length} tweets) failed, retrying in halves: ${(err as Error).message}`
        )
        const mid = Math.ceil(batch.length / 2)
        const [firstHalf, secondHalf] = await Promise.allSettled([
          this.filterBatch(batch.slice(0, mid)),
          this.filterBatch(batch.slice(mid)),
        ])
        return [
          ...(firstHalf.status === 'fulfilled' ? firstHalf.value : []),
          ...(secondHalf.status === 'fulfilled' ? secondHalf.value : []),
        ]
      }
      // Small batch still failing — skip it
      this.events.monologue(
        `Twitter relevance batch (${batch.length} tweets) failed, skipping: ${(err as Error).message}`
      )
      return []
    }
  }

  private convertToSignal(tweet: Tweet, query: string, beat?: string): Signal {
    return {
      id: `twitter-${tweet.id}`,
      source: 'twitter',
      type: 'post',
      content: tweet.text,
      url: `https://x.com/${tweet.author.userName}/status/${tweet.id}`,
      author: `@${tweet.author.userName}`,
      mediaUrls: this.extractMediaUrls(tweet),
      metrics: {
        score: tweet.likeCount + tweet.retweetCount * 2,
      },
      ingestedAt: Date.now(),
      expiresAt: Date.now() + config.scan.newsTtlMs,
      twitter: {
        tweetId: tweet.id,
        username: tweet.author.userName,
        authorName: tweet.author.name,
        followers: tweet.author.followers,
        likeCount: tweet.likeCount,
        retweetCount: tweet.retweetCount,
        query,
      },
    }
  }

  private extractMediaUrls(tweet: Tweet): string[] | undefined {
    const urls: string[] = []
    if (tweet.media?.photos) {
      urls.push(...tweet.media.photos.map((p) => p.url))
    }
    if (tweet.extendedEntities?.media) {
      urls.push(...tweet.extendedEntities.media.map((m) => m.media_url_https))
    }
    return urls.length > 0 ? urls : undefined
  }

  get bufferSize(): number {
    return this.buffer.size
  }
}
