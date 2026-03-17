import { randomUUID } from 'crypto'
import type { Signal } from '../types.js'
import { Cache } from '../cache/cache.js'
import { EventBus } from '../console/events.js'
import { config } from '../config/index.js'
import { generateObject } from 'ai'
import { anthropic } from '../ai.js'
import { z } from 'zod'
import { withTimeout, API_TIMEOUT_MS, LLM_TIMEOUT_MS } from '../utils/timeout.js'

interface GoogleNewsItem {
  title: string
  link: string
  description: string
  pubDate: string
  sourceName: string
  sourceUrl: string
}

const relevanceSchema = z.object({
  articles: z.array(
    z.object({
      index: z.number(),
      relevant: z.boolean(),
      reason: z.string().describe('Brief explanation of why this is or is not relevant'),
      beat: z.string().optional().describe('Suggested beat: infrastructure, governance, dev-tools, defi, culture'),
    }),
  ),
})

/**
 * GoogleNewsScanner — Aggregates Bitcoin × AI stories from Google News RSS.
 *
 * Google News aggregates from hundreds of publishers, so this single scanner
 * replaces the need to maintain individual RSS subscriptions for each outlet.
 *
 * Each configured search query produces its own RSS feed. Results are merged,
 * deduped by title similarity, filtered for relevance via LLM, and converted
 * to pipeline Signals.
 *
 * Note on URLs: Google News article links use an encoded redirect format
 * (news.google.com/rss/articles/CBMi...) that can't be reliably decoded
 * server-side. These URLs still work as click-through redirects in browsers,
 * so we use them as-is. The <source> tag provides the publisher's base URL
 * and name for attribution.
 */
export class GoogleNewsScanner {
  private buffer: Map<string, Signal> = new Map()
  private seenTitles = new Set<string>()

  constructor(
    private events: EventBus,
    private signalCache: Cache<Signal[]>,
  ) {}

  async scan(): Promise<Signal[]> {
    if (!config.googleNews.enabled) return []

    const cacheKey = Cache.key('google-news')
    const cached = this.signalCache.get(cacheKey)
    if (cached) {
      this.events.monologue(`Google News: using cached scan (${cached.length} signals).`)
      return cached
    }

    try {
      this.events.monologue(`Scanning Google News for Bitcoin × AI stories...`)

      // Fetch from all configured queries
      const allItems = await this.fetchAllQueries()
      if (allItems.length === 0) {
        this.events.monologue(`Google News: no articles found.`)
        this.signalCache.set(cacheKey, [], config.scan.newsTtlMs)
        return []
      }

      // LLM relevance filter
      const relevant = await this.filterForRelevance(allItems)

      if (relevant.length === 0) {
        this.events.monologue(
          `Google News: ${allItems.length} articles scanned, none at the Bitcoin × AI intersection.`
        )
        this.signalCache.set(cacheKey, [], config.scan.newsTtlMs)
        return []
      }

      // Convert to pipeline Signals
      const signals = relevant.map((item) => this.convertToSignal(item))

      // Dedup against previously seen (by normalized title)
      const newSignals = signals.filter((s) => {
        const titleKey = this.normalizeTitle(s.rss?.title ?? s.content.split('\n')[0])
        if (this.seenTitles.has(titleKey)) return false
        this.seenTitles.add(titleKey)
        this.buffer.set(s.id, s)
        return true
      })

      this.signalCache.set(cacheKey, newSignals, config.scan.newsTtlMs)

      if (newSignals.length > 0) {
        this.events.monologue(
          `Google News: ${newSignals.length} relevant stories from ${allItems.length} total. Top: "${newSignals[0].content.slice(0, 80)}..."`
        )
      }

      return newSignals
    } catch (err) {
      this.events.monologue(`Google News scan failed: ${(err as Error).message}`)
      return []
    }
  }

  /**
   * Fetch articles from all configured Google News search queries.
   * Deduplicates across queries by normalized title.
   */
  private async fetchAllQueries(): Promise<GoogleNewsItem[]> {
    const results: GoogleNewsItem[] = []
    const seenTitles = new Set<string>()

    for (const query of config.googleNews.queries) {
      try {
        const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`
        const items = await this.fetchFeed(feedUrl)

        for (const item of items) {
          const titleKey = this.normalizeTitle(item.title)
          if (seenTitles.has(titleKey)) continue
          seenTitles.add(titleKey)
          results.push(item)
        }
      } catch (err) {
        this.events.monologue(`Google News query "${query}" failed: ${(err as Error).message}`)
      }
    }

    // Sort by pub date descending (most recent first)
    results.sort((a, b) => {
      const timeA = new Date(a.pubDate).getTime() || 0
      const timeB = new Date(b.pubDate).getTime() || 0
      return timeB - timeA
    })

    return results.slice(0, config.googleNews.maxArticles)
  }

  /**
   * Fetch and parse a single Google News RSS feed.
   */
  private async fetchFeed(feedUrl: string): Promise<GoogleNewsItem[]> {
    const res = await withTimeout(
      fetch(feedUrl),
      API_TIMEOUT_MS,
      'Google News RSS fetch',
    )
    if (!res.ok) {
      throw new Error(`Google News RSS fetch failed: ${res.status} ${res.statusText}`)
    }

    const xml = await res.text()
    return this.parseGoogleNewsRSS(xml)
  }

  /**
   * Parse Google News RSS XML. Google News uses standard RSS 2.0 with
   * an additional <source url="...">Publisher Name</source> tag per item.
   */
  private parseGoogleNewsRSS(xml: string): GoogleNewsItem[] {
    const items: GoogleNewsItem[] = []
    const itemRegex = /<item>([\s\S]*?)<\/item>/g
    let match: RegExpExecArray | null

    const lookbackMs = config.googleNews.lookbackMs ?? 48 * 60 * 60 * 1000
    const cutoff = Date.now() - lookbackMs

    while ((match = itemRegex.exec(xml)) !== null) {
      const itemXml = match[1]

      const title = this.extractTag(itemXml, 'title')
      const link = this.extractTag(itemXml, 'link')
      const description = this.extractTag(itemXml, 'description')
      const pubDate = this.extractTag(itemXml, 'pubDate')

      // Google News specific: <source url="https://publisher.com">Publisher Name</source>
      const sourceUrlMatch = /<source\s+url="([^"]+)">([\s\S]*?)<\/source>/i.exec(itemXml)
      const sourceUrl = sourceUrlMatch ? sourceUrlMatch[1] : ''
      const sourceName = sourceUrlMatch ? this.stripCDATA(sourceUrlMatch[2]).trim() : ''

      if (!title || !link) continue

      const pubTime = pubDate ? new Date(pubDate).getTime() : 0
      if (pubTime > 0 && pubTime < cutoff) continue

      items.push({
        title: this.stripCDATA(title),
        link: this.stripCDATA(link).trim(),
        description: this.stripHTML(this.stripCDATA(description || '')),
        pubDate: pubDate || new Date().toISOString(),
        sourceName,
        sourceUrl,
      })
    }

    return items
  }

  /** System prompt for the relevance filter. */
  private static readonly RELEVANCE_SYSTEM = `You are a signal pre-filter for AIBTC Media, an autonomous media company that creates editorial cartoons about AI, Bitcoin, and the agent economy.

Your job: identify which Google News articles are worth passing to the editorial pipeline. This is only a pre-filter — the downstream scorer and editor handle final decisions.

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
- Bitcoin, crypto, or blockchain developments (protocol upgrades, adoption, regulation, L2s, DeFi)
- Decentralization vs. centralization debates in tech or finance
- Tech power dynamics, monopolies, platform control, surveillance
- Viral or culturally significant tech stories people are talking about
- Humor, satire, or commentary about AI, crypto, or tech culture

NOT RELEVANT — exclude:
- Pure price predictions with no substance ("BTC to $100K!")
- Token price speculation, presale promotions, "best crypto to buy" clickbait
- Spam, bot-generated content, or obvious shilling
- SEO-optimized filler articles, listicles with no news value
- Trading signals, portfolio advice, automated alerts
- Job postings, hiring announcements, or career advice
- Tutorial bait / engagement farming ("5 AI tools you NEED")
- Corporate press releases with no story
- Generic ecosystem stats with no narrative angle

If an article is about AI, Bitcoin, crypto, or tech and has genuine news value, include it.`

  /** Max articles per LLM batch. Larger batches reduce API calls while Haiku handles them well. */
  private static readonly BATCH_SIZE = 30

  /**
   * Filter articles for Bitcoin × AI relevance using LLM.
   */
  private async filterForRelevance(
    items: GoogleNewsItem[]
  ): Promise<(GoogleNewsItem & { _beat?: string })[]> {
    const results: (GoogleNewsItem & { _beat?: string })[] = []

    for (let start = 0; start < items.length; start += GoogleNewsScanner.BATCH_SIZE) {
      const batch = items.slice(start, start + GoogleNewsScanner.BATCH_SIZE)
      const batchResults = await this.filterBatch(batch)
      results.push(...batchResults)
    }

    return results
  }

  private async filterBatch(
    batch: GoogleNewsItem[]
  ): Promise<(GoogleNewsItem & { _beat?: string })[]> {
    const articleList = batch
      .map((a, i) => `[${i}] ${a.title} (via ${a.sourceName})\n    ${a.description.slice(0, 200)}`)
      .join('\n\n')

    try {
      const { object } = await withTimeout(generateObject({
        model: anthropic(config.relevanceModel),
        schema: relevanceSchema,
        system: GoogleNewsScanner.RELEVANCE_SYSTEM,
        prompt: `Which of these Google News articles are relevant to the Bitcoin × AI intersection?\n\n${articleList}`,
      }), LLM_TIMEOUT_MS, 'Google News relevance filter')

      return object.articles
        .filter((a) => a.relevant && a.index >= 0 && a.index < batch.length)
        .map((a) => ({
          ...batch[a.index],
          _beat: a.beat,
        }))
    } catch (err) {
      // Retry with halved batch on failure
      if (batch.length > 5) {
        this.events.monologue(
          `Google News relevance batch (${batch.length} articles) failed, retrying in halves: ${(err as Error).message}`
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
      this.events.monologue(
        `Google News relevance batch (${batch.length} articles) failed, skipping: ${(err as Error).message}`
      )
      return []
    }
  }

  private convertToSignal(item: GoogleNewsItem & { _beat?: string }): Signal {
    // Include publisher name in content for better scoring context
    const content = `${item.title} (via ${item.sourceName})\n\n${item.description}`
    const beat = item._beat || 'infrastructure'

    return {
      id: `gnews-${this.hashString(item.title)}`,
      source: 'rss' as Signal['source'],
      type: 'headline',
      content,
      url: item.link,
      author: item.sourceName || 'Google News',
      ingestedAt: Date.now(),
      expiresAt: Date.now() + config.scan.newsTtlMs,
      rss: {
        feedKey: 'google-news',
        feedName: `Google News (${item.sourceName})`,
        title: item.title,
        link: item.link,
        pubDate: item.pubDate,
        categories: [],
        beat,
      },
    }
  }

  /**
   * Normalize a title for dedup: lowercase, strip publisher suffix, collapse whitespace.
   */
  private normalizeTitle(title: string): string {
    return title
      .toLowerCase()
      .replace(/\s*\(via\s+[^)]+\)\s*$/, '')   // Remove "(via Publisher)" suffix
      .replace(/\s+[-–—|]\s+[^-–—|]+$/, '')  // Remove " - Publisher Name" suffix
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  private hashString(str: string): string {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const chr = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + chr
      hash |= 0
    }
    return Math.abs(hash).toString(36)
  }

  private extractTag(xml: string, tag: string): string | null {
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`)
    const match = regex.exec(xml)
    return match ? match[1] : null
  }

  private stripCDATA(text: string): string {
    return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim()
  }

  private stripHTML(text: string): string {
    return text
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  get bufferSize(): number {
    return this.buffer.size
  }
}
