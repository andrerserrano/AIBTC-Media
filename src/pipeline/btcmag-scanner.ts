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

/**
 * BTCMagScanner — Ingests articles from Bitcoin Magazine's RSS feed,
 * filters for Bitcoin × AI relevance, and converts to pipeline Signals.
 *
 * Bitcoin Magazine covers broad Bitcoin news. Most articles won't be
 * relevant to AIBTC Media's focus. The scanner uses a fast LLM pass
 * to identify articles at the intersection of Bitcoin and AI/agents
 * before they enter the scoring pipeline.
 *
 * Examples of relevant stories:
 * - "Block lays off 4,000 people because of AI"
 * - "Fidelity launches AI-powered Bitcoin investment tool"
 * - "Lightning Network gets autonomous agent routing"
 *
 * Examples of irrelevant stories:
 * - "Bitcoin price hits new all-time high"
 * - "El Salvador buys more Bitcoin"
 * - "Mining difficulty adjustment recap"
 */
export class BTCMagScanner {
  private buffer: Map<string, Signal> = new Map()
  private signalCache: Cache<Signal[]>
  private seenUrls = new Set<string>()

  constructor(
    private events: EventBus,
    signalCache: Cache<Signal[]>,
  ) {
    this.signalCache = signalCache
  }

  async scan(): Promise<Signal[]> {
    const cacheKey = Cache.key('btcmag-rss')
    const cached = this.signalCache.get(cacheKey)
    if (cached) {
      this.events.monologue(`Bitcoin Magazine: using cached scan (${cached.length} signals).`)
      return cached
    }

    try {
      this.events.monologue('Scanning Bitcoin Magazine RSS for Bitcoin × AI stories...')

      // Fetch and parse the RSS feed
      const articles = await this.fetchRSS()
      if (articles.length === 0) {
        this.events.monologue('Bitcoin Magazine: no new articles found.')
        return []
      }

      // Filter for Bitcoin × AI relevance using LLM
      const relevant = await this.filterForRelevance(articles)

      if (relevant.length === 0) {
        this.events.monologue(
          `Bitcoin Magazine: ${articles.length} articles scanned, none at the Bitcoin × AI intersection today.`
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
          `Bitcoin Magazine: ${newSignals.length} relevant stories from ${articles.length} total. Top: "${newSignals[0].content.slice(0, 80)}..."`
        )
      }

      return newSignals
    } catch (err) {
      this.events.monologue(`Bitcoin Magazine RSS failed: ${(err as Error).message}`)
      return []
    }
  }

  private async fetchRSS(): Promise<RSSItem[]> {
    const feedUrl = config.btcMag.feedUrl
    const res = await withTimeout(
      fetch(feedUrl),
      API_TIMEOUT_MS,
      'Bitcoin Magazine RSS fetch',
    )
    if (!res.ok) {
      throw new Error(`RSS fetch failed: ${res.status} ${res.statusText}`)
    }

    const xml = await res.text()
    return this.parseRSS(xml)
  }

  /**
   * Minimal RSS XML parser — extracts <item> elements from RSS 2.0 feeds.
   * No external dependency needed for this simple structure.
   */
  private parseRSS(xml: string): RSSItem[] {
    const items: RSSItem[] = []
    const itemRegex = /<item>([\s\S]*?)<\/item>/g
    let match: RegExpExecArray | null

    while ((match = itemRegex.exec(xml)) !== null) {
      const itemXml = match[1]

      const title = this.extractTag(itemXml, 'title')
      const link = this.extractTag(itemXml, 'link')
      const description = this.extractTag(itemXml, 'description')
      const pubDate = this.extractTag(itemXml, 'pubDate')
      const author = this.extractTag(itemXml, 'dc:creator') || this.extractTag(itemXml, 'author')

      // Extract categories
      const categories: string[] = []
      const catRegex = /<category[^>]*>([\s\S]*?)<\/category>/g
      let catMatch: RegExpExecArray | null
      while ((catMatch = catRegex.exec(itemXml)) !== null) {
        const cat = this.stripCDATA(catMatch[1]).trim()
        if (cat) categories.push(cat)
      }

      if (title && link) {
        // Only include articles from the last 48 hours
        const pubTime = pubDate ? new Date(pubDate).getTime() : 0
        const cutoff = Date.now() - 48 * 60 * 60 * 1000
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

    return items.slice(0, config.btcMag.maxArticles)
  }

  /** Max articles per LLM batch. Keeps schema validation reliable. */
  private static readonly BATCH_SIZE = 15

  /** System prompt for the relevance filter — shared across all batches. */
  private static readonly RELEVANCE_SYSTEM = `You are a signal pre-filter for AIBTC Media, an autonomous media company that creates editorial cartoons about AI, Bitcoin, and the agent economy.

Your job: identify which Bitcoin Magazine articles are worth passing to the editorial pipeline. This is only a pre-filter — the downstream scorer and editor handle final decisions.

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
- Tech power dynamics, monopolies, platform control
- Viral or culturally significant tech stories
- Any Bitcoin Magazine story with a technology or automation angle

NOT RELEVANT — exclude:
- Pure price predictions with no substance
- Token price speculation, presale promotions
- Spam, bot-generated content, or obvious shilling
- Trading signals, portfolio advice
- Generic ecosystem stats with no narrative angle
- Mining difficulty or hash rate updates (unless AI-related)

If a Bitcoin Magazine article is about technology, AI, automation, or infrastructure and has genuine news value, include it. Bitcoin Magazine articles are already on-beat — be more inclusive here than you would with a general news source.`

  /**
   * Use a fast LLM pass to identify which articles are editorially relevant.
   * Processes articles in batches with retry-on-failure for schema robustness.
   */
  private async filterForRelevance(articles: RSSItem[]): Promise<RSSItem[]> {
    const results: (RSSItem & { _beat?: string })[] = []

    for (let start = 0; start < articles.length; start += BTCMagScanner.BATCH_SIZE) {
      const batch = articles.slice(start, start + BTCMagScanner.BATCH_SIZE)
      const batchResults = await this.filterBatch(batch)
      results.push(...batchResults)
    }

    return results
  }

  private async filterBatch(batch: RSSItem[]): Promise<(RSSItem & { _beat?: string })[]> {
    const articleList = batch
      .map((a, i) => `[${i}] ${a.title}\n    ${a.description.slice(0, 200)}`)
      .join('\n\n')

    try {
      const { object } = await withTimeout(generateObject({
        model: anthropic(config.textModel),
        schema: relevanceSchema,
        system: BTCMagScanner.RELEVANCE_SYSTEM,
        prompt: `Which of these Bitcoin Magazine articles are worth covering?\n\n${articleList}`,
      }), LLM_TIMEOUT_MS, 'Bitcoin Magazine relevance filter')

      return object.articles
        .filter((a) => a.relevant && a.index >= 0 && a.index < batch.length)
        .map((a) => ({
          ...batch[a.index],
          _beat: a.beat,
        })) as (RSSItem & { _beat?: string })[]
    } catch (err) {
      // Retry with halved batch on schema/LLM failure
      if (batch.length > 5) {
        this.events.monologue(
          `Bitcoin Magazine relevance batch (${batch.length} articles) failed, retrying in halves: ${(err as Error).message}`
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
        `Bitcoin Magazine relevance batch (${batch.length} articles) failed, skipping: ${(err as Error).message}`
      )
      return []
    }
  }

  private convertToSignal(item: RSSItem & { _beat?: string }): Signal {
    const content = `${item.title}\n\n${item.description}`
    const beat = item._beat || 'infrastructure'

    return {
      id: `btcmag-${this.hashUrl(item.link)}`,
      source: 'btcmag' as Signal['source'],
      type: 'headline',
      content,
      url: item.link,
      author: item.author || 'Bitcoin Magazine',
      ingestedAt: Date.now(),
      expiresAt: Date.now() + config.scan.newsTtlMs,
      btcMag: {
        title: item.title,
        link: item.link,
        pubDate: item.pubDate,
        categories: item.categories,
        beat,
      },
    }
  }

  private hashUrl(url: string): string {
    // Simple hash for deduplication — deterministic from URL
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
