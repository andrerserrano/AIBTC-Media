import type { Signal } from '../types.js'
import type { TwitterReadProvider, Tweet } from '../twitter/provider.js'
import { Cache } from '../cache/cache.js'
import { EventBus } from '../console/events.js'
import { config } from '../config/index.js'
import { generateObject } from 'ai'
import { anthropic } from '../ai.js'
import { z } from 'zod'

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
          `Twitter: ${allTweets.length} tweets scanned, none at the Bitcoin × AI intersection.`
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
        const searchResult = await this.readProvider.search(query, 'Top')

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

  /**
   * Use LLM to identify which tweets are at the Bitcoin × AI intersection.
   * Same pattern as RSSScanner.filterForRelevance().
   */
  private async filterForRelevance(
    items: Array<{ tweet: Tweet; query: string }>
  ): Promise<Array<{ tweet: Tweet; query: string; beat?: string }>> {
    const tweetList = items
      .map((item, i) => `[${i}] @${item.tweet.author.userName} (${item.tweet.author.followers} followers, ${item.tweet.likeCount} likes)\n    "${item.tweet.text}"`)
      .join('\n\n')

    const { object } = await generateObject({
      model: anthropic(config.textModel),
      schema: relevanceSchema,
      system: `You are a signal filter for AIBTC Media, an autonomous media company covering the Bitcoin agent economy.

Your job: identify which Twitter/X posts are relevant to the intersection of Bitcoin and AI/autonomous agents.

RELEVANT — include these:
- AI agents interacting with Bitcoin or crypto systems
- Autonomous systems, smart contracts, or AI tools on Bitcoin/Stacks/Lightning
- Major AI companies making Bitcoin/crypto moves
- Bitcoin infrastructure enabling AI agents
- Agent economy discussions, autonomous finance, machine-to-machine payments
- DeFi protocols incorporating AI agents or autonomous trading
- Policy or regulation at the intersection of AI and Bitcoin/crypto
- Significant announcements about AI × Bitcoin projects or launches

NOT RELEVANT — exclude these:
- Pure Bitcoin price discussion, market analysis, or price predictions
- Generic crypto market commentary or memes
- News stories already likely covered by traditional outlets (focus on original discussion)
- Spam, shilling, or promotional threads without substance
- General AI news without a Bitcoin/crypto connection
- Mining, hash rate, or energy topics (unless AI-related)

Be selective. It's better to return 0 relevant tweets than to include weak matches. A tweet needs a genuine connection to AI agents or autonomous systems in the Bitcoin/crypto ecosystem.`,
      prompt: `Which of these tweets are relevant to the Bitcoin × AI intersection?\n\n${tweetList}`,
    })

    return object.tweets
      .filter((t) => t.relevant && t.index >= 0 && t.index < items.length)
      .map((t) => ({
        ...items[t.index],
        beat: t.beat,
      }))
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
