import { randomUUID } from 'crypto'
import type { Signal } from '../types.js'
import { Cache } from '../cache/cache.js'
import { EventBus } from '../console/events.js'
import { config } from '../config/index.js'
import { generateObject } from 'ai'
import { anthropic } from '../ai.js'
import { z } from 'zod'
import { withTimeout, API_TIMEOUT_MS, LLM_TIMEOUT_MS } from '../utils/timeout.js'

interface RSSItem {
  title: string
  link: string
  description: string
  pubDate: string
  categories?: string[]
  author?: string
}

const relevanceSchema = z.object({
  articles: z.array(
    z.object({
      index: z.number(),
      relevant: z.boolean(),
      reason: z.string().describe('Brief explanation of why this is or is not relevant'),
      beat: z.string().optional().describe('Suggested beat category if relevant: infrastructure, governance, dev-tools, defi, culture'),
    }),
  ),
})

export interface RSSFeedConfig {
  /** Unique key for this feed (used in signal IDs and cache keys) */
  key: string
  /** Human-readable name for logging */
  name: string
  /** RSS feed URL */
  feedUrl: string
  /** Maximum articles to pull per scan */
  maxArticles: number
  /** Whether this feed is enabled */
  enabled: boolean
  /** How far back to look for articles (ms). Defaults to 48 hours */
  lookbackMs?: number
}

/**
 * RSSScanner — A generic RSS scanner that ingests articles from any RSS 2.0 feed,
 * filters for Bitcoin × AI relevance using an LLM pass, and converts to pipeline Signals.
 *
 * This is a generalized version of BTCMagScanner that can be instantiated for any feed:
 * Bitcoin Magazine, CoinDesk, The Defiant, etc.
 *
 * All feeds share the same relevance filter — the scoring pipeline downstream
 * handles final ranking via worldview alignment and other dimensions.
 */
export class RSSScanner {
  private buffer: Map<string, Signal> = new Map()
  private seenUrls = new Set<string>()

  constructor(
    private feedConfig: RSSFeedConfig,
    private events: EventBus,
    private signalCache: Cache<Signal[]>,
  ) {}

  async scan(): Promise<Signal[]> {
    if (!this.feedConfig.enabled) return []

    const cacheKey = Cache.key(`rss-${this.feedConfig.key}`)
    const cached = this.signalCache.get(cacheKey)
    if (cached) {
      this.events.monologue(`${this.feedConfig.name}: using cached scan (${cached.length} signals).`)
      return cached
    }

    try {
      this.events.monologue(`Scanning ${this.feedConfig.name} RSS for Bitcoin × AI stories...`)

      // Fetch and parse the RSS feed
      const articles = await this.fetchRSS()
      if (articles.length === 0) {
        this.events.monologue(`${this.feedConfig.name}: no new articles found.`)
        return []
      }

      // Filter for Bitcoin × AI relevance using LLM
      const relevant = await this.filterForRelevance(articles)

      if (relevant.length === 0) {
        this.events.monologue(
          `${this.feedConfig.name}: ${articles.length} articles scanned, none at the Bitcoin × AI intersection today.`
        )
        // Cache the empty result to avoid re-scanning too soon
        this.signalCache.set(cacheKey, [], config.scan.newsTtlMs)
        return []
      }

      // Convert to pipeline Signal format
      const signals = relevant.map((item) => this.convertToSignal(item))

      // Deduplicate against previously seen
      const newSignals = signals.filter((s) => {
        if (this.seenUrls.has(s.url)) return false
        this.seenUrls.add(s.url)
        this.buffer.set(s.id, s)
        return true
      })

      this.signalCache.set(cacheKey, newSignals, config.scan.newsTtlMs)

      if (newSignals.length > 0) {
        this.events.monologue(
          `${this.feedConfig.name}: ${newSignals.length} relevant stories from ${articles.length} total. Top: "${newSignals[0].content.slice(0, 80)}..."`
        )
      }

      return newSignals
    } catch (err) {
      this.events.monologue(`${this.feedConfig.name} RSS failed: ${(err as Error).message}`)
      return []
    }
  }

  private async fetchRSS(): Promise<RSSItem[]> {
    const res = await withTimeout(
      fetch(this.feedConfig.feedUrl),
      API_TIMEOUT_MS,
      `${this.feedConfig.name} RSS fetch`,
    )
    if (!res.ok) {
      throw new Error(`RSS fetch failed: ${res.status} ${res.statusText}`)
    }

    const xml = await res.text()
    return this.parseRSS(xml)
  }

  /**
   * Minimal RSS XML parser — extracts <item> elements from RSS 2.0 feeds.
   * Also handles Atom <entry> elements for feeds that use Atom format.
   */
  private parseRSS(xml: string): RSSItem[] {
    const items: RSSItem[] = []

    // Try RSS 2.0 <item> first, then Atom <entry>
    const itemRegex = /<item>([\s\S]*?)<\/item>/g
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g

    let match: RegExpExecArray | null
    const regex = itemRegex.exec(xml) ? itemRegex : entryRegex

    // Reset regex since we tested it
    regex.lastIndex = 0

    while ((match = regex.exec(xml)) !== null) {
      const itemXml = match[1]

      // RSS 2.0 fields
      let title = this.extractTag(itemXml, 'title')
      let link = this.extractTag(itemXml, 'link')
      const description = this.extractTag(itemXml, 'description')
        || this.extractTag(itemXml, 'summary')
        || this.extractTag(itemXml, 'content')
      const pubDate = this.extractTag(itemXml, 'pubDate')
        || this.extractTag(itemXml, 'published')
        || this.extractTag(itemXml, 'updated')
      const author = this.extractTag(itemXml, 'dc:creator')
        || this.extractTag(itemXml, 'author')

      // Atom feeds use <link href="..."/> (self-closing)
      if (!link) {
        const linkAttr = /<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i.exec(itemXml)
        if (linkAttr) link = linkAttr[1]
      }

      // Extract categories
      const categories: string[] = []
      const catRegex = /<category[^>]*>([\s\S]*?)<\/category>/g
      let catMatch: RegExpExecArray | null
      while ((catMatch = catRegex.exec(itemXml)) !== null) {
        const cat = this.stripCDATA(catMatch[1]).trim()
        if (cat) categories.push(cat)
      }
      // Atom category: <category term="..." />
      const atomCatRegex = /<category[^>]*term=["']([^"']+)["'][^>]*\/?>/g
      let atomCatMatch: RegExpExecArray | null
      while ((atomCatMatch = atomCatRegex.exec(itemXml)) !== null) {
        categories.push(atomCatMatch[1].trim())
      }

      if (title && link) {
        const lookback = this.feedConfig.lookbackMs ?? 48 * 60 * 60 * 1000
        const pubTime = pubDate ? new Date(pubDate).getTime() : 0
        const cutoff = Date.now() - lookback
        if (pubTime > cutoff || pubTime === 0) {
          items.push({
            title: this.stripCDATA(title),
            link: this.stripCDATA(link).trim(),
            description: this.stripHTML(this.stripCDATA(description || '')),
            pubDate: pubDate || new Date().toISOString(),
            categories,
            author: author ? this.stripCDATA(author) : undefined,
          })
        }
      }
    }

    return items.slice(0, this.feedConfig.maxArticles)
  }

  /**
   * Use a fast LLM pass to identify which articles are at the
   * intersection of Bitcoin and AI/autonomous agents.
   */
  private async filterForRelevance(articles: RSSItem[]): Promise<(RSSItem & { _beat?: string })[]> {
    const articleList = articles
      .map((a, i) => `[${i}] ${a.title}\n    ${a.description.slice(0, 200)}`)
      .join('\n\n')

    const { object } = await withTimeout(generateObject({
      model: anthropic(config.textModel),
      schema: relevanceSchema,
      system: `You are a signal pre-filter for AIBTC Media, an autonomous media company covering the Bitcoin agent economy.

Your job: identify which ${this.feedConfig.name} articles are relevant to the intersection of Bitcoin and AI/autonomous agents. This is a pre-filter — the downstream scoring pipeline handles final editorial decisions.

RELEVANT — include these:
- AI companies making moves that affect Bitcoin (e.g., "Block lays off 4,000 due to AI")
- AI agents interacting with Bitcoin infrastructure
- Autonomous systems, smart contracts, or AI tools being built on Bitcoin/Stacks/Lightning
- Major tech companies integrating AI with Bitcoin/crypto
- Policy or regulation at the intersection of AI and Bitcoin
- Bitcoin infrastructure developments that enable or are affected by AI agents
- DeFi protocols incorporating AI agents or autonomous trading
- AI agent economies, autonomous finance, or machine-to-machine payments
- Major AI industry stories coverable from a Bitcoin/decentralization angle
- Viral or significant AI autonomy stories — but only with genuine news value, not just keyword overlap

NOT RELEVANT — exclude these:
- Pure Bitcoin price discussion, market analysis, or price predictions
- Mining difficulty, hash rate, or energy consumption (unless AI-related)
- Regulatory news about Bitcoin alone (no AI angle)
- General Bitcoin adoption stories without an AI/agent connection
- NFTs, ordinals, or inscriptions (unless connected to AI agents)
- Exchange listings, ETF updates, or institutional buying (unless AI-driven)
- Token price speculation or presale promotions
- Generic ecosystem stats without a clear AI agent angle

Be selective but not narrow. A major AI story that can be reframed through a Bitcoin/decentralization lens IS relevant — but low-signal noise should still be filtered out.`,
      prompt: `Which of these ${this.feedConfig.name} articles are relevant to the Bitcoin × AI intersection?\n\n${articleList}`,
    }), LLM_TIMEOUT_MS, `${this.feedConfig.name} relevance filter`)

    return object.articles
      .filter((a) => a.relevant && a.index >= 0 && a.index < articles.length)
      .map((a) => ({
        ...articles[a.index],
        _beat: a.beat,
      }))
  }

  private convertToSignal(item: RSSItem & { _beat?: string }): Signal {
    const content = `${item.title}\n\n${item.description}`
    const beat = item._beat || 'infrastructure'

    return {
      id: `${this.feedConfig.key}-${this.hashUrl(item.link)}`,
      source: 'rss' as Signal['source'],
      type: 'headline',
      content,
      url: item.link,
      author: item.author || this.feedConfig.name,
      ingestedAt: Date.now(),
      expiresAt: Date.now() + config.scan.newsTtlMs,
      rss: {
        feedKey: this.feedConfig.key,
        feedName: this.feedConfig.name,
        title: item.title,
        link: item.link,
        pubDate: item.pubDate,
        categories: item.categories,
        beat,
      },
    }
  }

  private hashUrl(url: string): string {
    let hash = 0
    for (let i = 0; i < url.length; i++) {
      const chr = url.charCodeAt(i)
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
