import { randomUUID } from 'crypto'
import type { Post, Signal, CommentaryCategory } from '../types.js'
import { EventBus } from '../console/events.js'
import { CommentaryWriter } from '../pipeline/commentary-writer.js'
import { CommentaryEditor } from '../pipeline/commentary-editor.js'
import { TwitterClient } from '../twitter/client.js'
import { JsonStore } from '../store/json-store.js'
import { config } from '../config/index.js'
import { join } from 'path'

/** Any object that can scan for signals */
interface SignalScanner {
  scan(): Promise<Signal[]>
}

interface CommentaryTimerState {
  lastCommentary: number
  commentaryCountToday: number
  commentaryDayStart: number
}

/**
 * CommentaryLoop — Independent event loop for text-only commentary tweets.
 *
 * Runs on its own timer, completely parallel to the cartoon AgentLoop.
 * Shares only the signal scanner (read-only) and post store (for duplicate detection).
 * Neither loop blocks the other.
 */
export class CommentaryLoop {
  private running = false
  private lastCommentary = 0
  private commentaryCountToday = 0
  private commentaryDayStart = 0
  private timerStore: JsonStore<CommentaryTimerState>

  constructor(
    private events: EventBus,
    private scanner: SignalScanner,
    private writer: CommentaryWriter,
    private editor: CommentaryEditor,
    private twitter: TwitterClient,
    private posts: JsonStore<Post[]>,
  ) {
    this.timerStore = new JsonStore(join(config.dataDir, 'commentary-timers.json'))
  }

  async start(): Promise<void> {
    if (!config.commentary.enabled) {
      console.log('[commentary] Commentary disabled — skipping loop start')
      return
    }

    this.running = true

    // Restore timer state from disk
    const saved = await this.timerStore.read()
    if (saved) {
      this.lastCommentary = saved.lastCommentary
      this.commentaryCountToday = saved.commentaryCountToday ?? 0
      this.commentaryDayStart = saved.commentaryDayStart ?? 0
      this.events.monologue('Commentary loop resumed from previous state.')
    } else {
      this.events.monologue('Commentary loop started.')
    }

    while (this.running) {
      try {
        await this.tick()
        await this.persistTimers()
      } catch (err) {
        this.events.monologue(`Commentary loop error: ${(err as Error).message}. Recovering...`)
      }
      // Commentary ticks on its own interval (same as main tick, or could be different)
      await sleep(config.tickIntervalMs)
    }
  }

  stop(): void {
    this.running = false
  }

  /** Manually trigger a commentary tweet (called from admin API) */
  async triggerCommentary(): Promise<{ success: boolean; reason: string }> {
    this.events.monologue('Manual commentary trigger received...')
    try {
      const signals = await this.scanner.scan()
      if (signals.length === 0) {
        return { success: false, reason: 'No signals available.' }
      }
      await this.doCommentary(signals)
      return { success: true, reason: 'Commentary cycle completed.' }
    } catch (err) {
      const msg = (err as Error).message
      this.events.monologue(`Manual commentary trigger failed: ${msg}`)
      return { success: false, reason: msg }
    }
  }

  private async tick(): Promise<void> {
    const now = Date.now()

    this.resetCommentaryDayIfNeeded()

    const cooldownReady = now - this.lastCommentary >= config.commentary.cooldownMs
    const underDailyLimit = this.commentaryCountToday < config.commentary.maxPerDay

    if (!cooldownReady || !underDailyLimit) return

    const signals = await this.scanner.scan()
    if (signals.length === 0) return

    try {
      await this.doCommentary(signals)
    } catch (err) {
      this.events.monologue(`Commentary failed: ${(err as Error).message}`)
    }
  }

  private async doCommentary(signals: Signal[]): Promise<void> {
    const allPosts = (await this.posts.read()) ?? []
    const recentTexts = allPosts
      .filter(p => Date.now() - p.postedAt < 7 * 24 * 3600_000)
      .map(p => p.text)

    const signalSummaries = signals.map(s => s.content).slice(0, 30)

    // Build self-aware context (what the pipeline has been doing)
    const pipelineContext = this.buildPipelineContext(allPosts)

    // Try up to maxRetries categories — if one gets rejected, try a different one
    const triedCategories = new Set<CommentaryCategory>()

    for (let attempt = 0; attempt < config.commentary.maxRetries; attempt++) {
      const category = this.pickCommentaryCategory(triedCategories)
      if (!category) {
        this.events.monologue('All commentary categories exhausted. Skipping this cycle.')
        return
      }
      triedCategories.add(category)

      this.events.monologue(`Commentary attempt ${attempt + 1}: writing ${category} tweet...`)

      // Generate draft
      const draft = await this.writer.generate(
        category,
        signalSummaries,
        recentTexts,
        category === 'self-aware' ? pipelineContext : undefined,
      )

      // Editorial review
      const review = await this.editor.review(draft, allPosts)

      if (!review.approved) {
        this.events.monologue(
          `Commentary rejected (${category}): ${review.reason}. ${attempt < config.commentary.maxRetries - 1 ? 'Trying another category...' : 'All retries exhausted.'}`,
        )
        continue
      }

      // Approved — post it
      const finalText = review.text
      let quoteTweetId: string | undefined

      // If this should be a QRT, find a relevant source tweet
      if (review.isQrt && draft.qrtReason) {
        try {
          const found = await this.twitter.findTweetAbout(draft.qrtReason)
          if (found) {
            quoteTweetId = found
            this.events.monologue(`Found QRT source tweet: ${quoteTweetId}`)
          } else {
            this.events.monologue('No source tweet found for QRT. Posting as standalone.')
          }
        } catch (err) {
          this.events.monologue(`QRT tweet search failed: ${(err as Error).message}. Posting as standalone.`)
        }
      }

      const tweetId = await this.twitter.postText({ text: finalText, quoteTweetId })

      const post: Post = {
        id: randomUUID(),
        tweetId,
        text: finalText,
        quotedTweetId: quoteTweetId,
        type: 'commentary',
        commentaryCategory: category,
        commentaryTone: draft.tone,
        commentaryQualityScore: review.qualityScore,
        commentaryEditorReason: review.reason,
        postedAt: Date.now(),
        engagement: { likes: 0, retweets: 0, replies: 0, views: 0, lastChecked: 0 },
      }

      await this.posts.update(p => [...p, post], [])
      this.lastCommentary = Date.now()
      this.commentaryCountToday++

      this.events.monologue(
        `Commentary posted (${category}, quality ${review.qualityScore}/10): "${finalText.slice(0, 80)}..."`,
      )
      return
    }
  }

  /**
   * Pick a commentary category using weighted random selection.
   * Avoids categories that have already been tried this cycle.
   */
  private pickCommentaryCategory(exclude: Set<CommentaryCategory>): CommentaryCategory | null {
    const weights = config.commentary.categoryWeights
    const categories = (Object.keys(weights) as CommentaryCategory[])
      .filter(c => !exclude.has(c))

    if (categories.length === 0) return null

    const totalWeight = categories.reduce((sum, c) => sum + weights[c], 0)
    let roll = Math.random() * totalWeight

    for (const category of categories) {
      roll -= weights[category]
      if (roll <= 0) return category
    }

    return categories[categories.length - 1]
  }

  /** Reset the daily commentary counter at midnight (local timezone) */
  private resetCommentaryDayIfNeeded(): void {
    const nowStr = new Date().toLocaleString('en-US', { timeZone: config.schedule.timezone })
    const localNow = new Date(nowStr)
    const todayStart = new Date(localNow.getFullYear(), localNow.getMonth(), localNow.getDate()).getTime()

    if (todayStart > this.commentaryDayStart) {
      this.commentaryCountToday = 0
      this.commentaryDayStart = todayStart
    }
  }

  /** Build a human-readable summary of recent pipeline activity for self-aware tweets */
  private buildPipelineContext(allPosts: Post[]): string {
    const today = Date.now()
    const last24h = allPosts.filter(p => today - p.postedAt < 24 * 3600_000)
    const cartoonCount = last24h.filter(p => p.type === 'flagship' || p.type === 'quickhit').length
    const commentaryCount = last24h.filter(p => p.type === 'commentary').length

    const parts: string[] = []
    if (cartoonCount > 0) parts.push(`Drew ${cartoonCount} cartoon${cartoonCount > 1 ? 's' : ''} today.`)
    if (commentaryCount > 0) parts.push(`Wrote ${commentaryCount} commentary tweet${commentaryCount > 1 ? 's' : ''} today.`)

    const lastCartoon = last24h.filter(p => p.imageUrl).pop()
    if (lastCartoon?.sceneDescription) {
      parts.push(`Last cartoon scene: "${lastCartoon.sceneDescription.slice(0, 100)}"`)
    }

    if (parts.length === 0) parts.push('Quiet day so far — scanning for stories.')

    return parts.join(' ')
  }

  private async persistTimers(): Promise<void> {
    await this.timerStore.write({
      lastCommentary: this.lastCommentary,
      commentaryCountToday: this.commentaryCountToday,
      commentaryDayStart: this.commentaryDayStart,
    })
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
