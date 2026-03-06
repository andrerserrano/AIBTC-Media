import { randomUUID } from 'crypto'
import type { Signal } from '../types.js'
import { Cache } from '../cache/cache.js'
import { EventBus } from '../console/events.js'
import { config } from '../config/index.js'

interface AIBTCSignal {
  id: string
  btcAddress: string
  beat: string
  beatSlug: string
  headline: string
  content: string
  sources?: Array<{ url: string; title?: string }>
  tags?: string[]
  timestamp: string
  signature: string
  correction?: string
  correctedAt?: string
}

interface AIBTCSignalsResponse {
  signals: AIBTCSignal[]
  total: number
  filtered: number
}

/**
 * AIBTCScanner — Ingests intelligence signals from aibtc.news
 * 
 * Replaces Twitter/Grok scanning with Bitcoin agent network signals.
 * Converts AIBTC signals into Sovra's Signal format for the pipeline.
 */
export class AIBTCScanner {
  private buffer: Map<string, Signal> = new Map()
  private signalCache: Cache<Signal[]>
  private seenIds = new Set<string>()

  constructor(
    private events: EventBus,
    signalCache: Cache<Signal[]>,
  ) {
    this.signalCache = signalCache
  }

  async scan(): Promise<Signal[]> {
    this.events.transition('scanning')
    this.pruneStale()

    const results = await Promise.allSettled([
      // Latest signals from all beats
      this.scanLatestSignals(),
      // Signals from specific high-value beats
      this.scanBeat('dev-tools'),
      this.scanBeat('ordinals-culture'),
      this.scanBeat('governance'),
      this.scanBeat('defi'),
    ])

    let newCount = 0
    for (const result of results) {
      if (result.status === 'fulfilled') {
        for (const signal of result.value) {
          // Deduplicate by AIBTC signal ID
          if (this.seenIds.has(signal.id)) continue
          this.seenIds.add(signal.id)
          this.buffer.set(signal.id, signal)
          newCount++
        }
      }
    }

    const signals = [...this.buffer.values()]
    this.events.emit({
      type: 'scan',
      source: 'aibtc-news',
      signalCount: signals.length,
      ts: Date.now(),
    })

    if (newCount > 0) {
      this.events.monologue(`${newCount} new signals from AIBTC Network (${signals.length} total in buffer).`)
    }

    return signals
  }

  private async scanLatestSignals(limit = 20): Promise<Signal[]> {
    const cacheKey = Cache.key('aibtc-latest')
    const cached = this.signalCache.get(cacheKey)
    if (cached) return cached

    try {
      const url = new URL('https://aibtc.news/api/signals')
      url.searchParams.set('limit', limit.toString())
      url.searchParams.set('since', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

      const res = await fetch(url.toString())
      if (!res.ok) {
        throw new Error(`${res.status} ${res.statusText}`)
      }

      const json = (await res.json()) as AIBTCSignalsResponse
      const signals = this.convertSignals(json.signals)

      this.signalCache.set(cacheKey, signals, config.scan.newsTtlMs)
      
      const newSignals = signals.filter(s => !this.seenIds.has(s.id))
      if (newSignals.length > 0) {
        const top = newSignals[0]
        this.events.monologue(
          `AIBTC latest: ${newSignals.length} new signals. Top: "${top.content.slice(0, 80)}..." from ${top.author}`
        )
      }

      return signals
    } catch (err) {
      this.events.monologue(`AIBTC latest signals failed: ${(err as Error).message}`)
      return []
    }
  }

  private async scanBeat(beatSlug: string, limit = 10): Promise<Signal[]> {
    const cacheKey = Cache.key(`aibtc-beat:${beatSlug}`)
    const cached = this.signalCache.get(cacheKey)
    if (cached) return cached

    try {
      const url = new URL('https://aibtc.news/api/signals')
      url.searchParams.set('beat', beatSlug)
      url.searchParams.set('limit', limit.toString())
      url.searchParams.set('since', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())

      const res = await fetch(url.toString())
      if (!res.ok) {
        throw new Error(`${res.status} ${res.statusText}`)
      }

      const json = (await res.json()) as AIBTCSignalsResponse
      const signals = this.convertSignals(json.signals)

      this.signalCache.set(cacheKey, signals, config.scan.newsTtlMs)

      const newSignals = signals.filter(s => !this.seenIds.has(s.id))
      if (newSignals.length > 0) {
        this.events.monologue(
          `Beat "${beatSlug}": ${newSignals.length} new signals. Latest: "${newSignals[0].content.slice(0, 60)}..."`
        )
      }

      return signals
    } catch (err) {
      this.events.monologue(`AIBTC beat "${beatSlug}" failed: ${(err as Error).message}`)
      return []
    }
  }

  private convertSignals(aibtcSignals: AIBTCSignal[]): Signal[] {
    return aibtcSignals.map((s) => {
      // Build full content combining headline and body
      const content = s.headline 
        ? `${s.headline}\n\n${s.content}`
        : s.content

      // Extract source URL if available
      const url = s.sources?.[0]?.url ?? `https://aibtc.news/api/signals/${s.id}`

      // Determine signal type based on beat
      const type = this.inferSignalType(s.beatSlug)

      return {
        id: s.id,
        source: 'aibtc' as const,
        type,
        content,
        url,
        author: s.btcAddress.slice(0, 12), // Truncate BTC address for display
        metrics: {
          // No like/retweet metrics from AIBTC News
          // Could add streak/score data if we fetch agent status
        },
        ingestedAt: Date.now(),
        expiresAt: Date.now() + config.scan.newsTtlMs,
        aibtc: {
          signalId: s.id,
          beat: s.beat,
          beatSlug: s.beatSlug,
          headline: s.headline,
          tags: s.tags,
          sources: s.sources,
          signature: s.signature,
          timestamp: s.timestamp,
        },
      }
    })
  }

  private inferSignalType(beatSlug: string): 'headline' | 'tweet' | 'post' {
    // Map beat types to signal types for pipeline compatibility
    const headlineBeats = ['governance', 'defi', 'ordinals-culture', 'dev-tools']
    return headlineBeats.includes(beatSlug) ? 'headline' : 'post'
  }

  private pruneStale(): void {
    const now = Date.now()
    for (const [id, signal] of this.buffer) {
      if (now > signal.expiresAt) {
        this.seenIds.delete(id)
        this.buffer.delete(id)
      }
    }
  }

  get bufferSize(): number {
    return this.buffer.size
  }
}
