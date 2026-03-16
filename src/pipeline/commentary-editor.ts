import { generateObject } from 'ai'
import { anthropic } from '../ai.js'
import { z } from 'zod'
import { EventBus } from '../console/events.js'
import { COMMENTARY_EDITOR_SYSTEM } from '../prompts/commentary.js'
import { withTimeout, LLM_TIMEOUT_MS } from '../utils/timeout.js'
import type { CommentaryDraft, Post } from '../types.js'

const commentaryReviewSchema = z.object({
  approved: z.boolean(),
  isDuplicate: z.boolean().describe('Too similar to a recent post?'),
  duplicateOf: z.string().optional().describe('Which post does it duplicate?'),
  hasNotXItsY: z.boolean().describe('Contains banned "not X, it\'s Y" reframe pattern?'),
  punchesDown: z.boolean().describe('Critiques builders/projects to elevate Bitcoin?'),
  isNewsAggregation: z.boolean().describe('Reads like a headline summary with thesis tacked on?'),
  shouldBeQrt: z.boolean().describe('References someone else\'s news and should be a QRT instead of standalone?'),
  qualityScore: z.number().describe('1-10 overall quality — below 7 = reject'),
  revisedText: z.string().optional().describe('Improved version if approved but could be punchier'),
  reason: z.string().describe('Specific editorial feedback — which check failed or why it\'s good'),
})

/**
 * CommentaryEditor — Reviews text tweets before posting.
 *
 * Independent editorial gate that checks every commentary tweet against
 * the brand voice rules. Uses Sonnet (different from writer's Opus) for
 * an independent editorial perspective.
 */
export class CommentaryEditor {
  constructor(private events: EventBus) {}

  /**
   * Review a commentary tweet draft before posting.
   *
   * @param draft      The generated commentary draft
   * @param allPosts   All previous posts (for duplicate detection)
   */
  async review(
    draft: CommentaryDraft,
    allPosts: Post[],
  ): Promise<{
    approved: boolean
    text: string
    isQrt: boolean
    qualityScore: number
    reason: string
  }> {
    this.events.monologue(`Reviewing commentary: "${draft.text.slice(0, 60)}..."`)

    const recentFeed = allPosts
      .slice(-50)
      .map((p, i) => `${i + 1}. "${p.text}"`)
      .join('\n')

    const prompt = [
      'COMMENTARY TWEET TO REVIEW:',
      `Text: "${draft.text}"`,
      `Category: ${draft.category}`,
      `Tone: ${draft.tone}`,
      `Writer marked as QRT: ${draft.isQrt}`,
      draft.qrtReason ? `QRT context: ${draft.qrtReason}` : '',
      '',
      '---',
      '',
      `RECENT POSTS (${allPosts.length} total, last 50 shown):`,
      recentFeed || '(no previous posts)',
      '',
      'Review this tweet against ALL editorial checks. Should it be published?',
    ].filter(Boolean).join('\n')

    try {
      const { object } = await withTimeout(generateObject({
        model: anthropic('claude-sonnet-4-6'),
        schema: commentaryReviewSchema,
        system: COMMENTARY_EDITOR_SYSTEM,
        prompt,
      }), LLM_TIMEOUT_MS, 'Commentary editorial review')

      // Instant rejections
      if (object.hasNotXItsY) {
        this.events.monologue(`EDITOR REJECTED — "not X, it's Y" pattern detected. ${object.reason}`)
        return { approved: false, text: draft.text, isQrt: draft.isQrt, qualityScore: object.qualityScore, reason: `"Not X, it's Y" pattern: ${object.reason}` }
      }

      if (object.punchesDown) {
        this.events.monologue(`EDITOR REJECTED — punches down at builders. ${object.reason}`)
        return { approved: false, text: draft.text, isQrt: draft.isQrt, qualityScore: object.qualityScore, reason: `Punches down: ${object.reason}` }
      }

      if (object.isNewsAggregation) {
        this.events.monologue(`EDITOR REJECTED — reads like news aggregation. ${object.reason}`)
        return { approved: false, text: draft.text, isQrt: draft.isQrt, qualityScore: object.qualityScore, reason: `News aggregation: ${object.reason}` }
      }

      if (object.isDuplicate) {
        this.events.monologue(`EDITOR REJECTED — duplicate. ${object.duplicateOf ? `Too similar to: "${object.duplicateOf}"` : 'Covers same ground.'}`)
        return { approved: false, text: draft.text, isQrt: draft.isQrt, qualityScore: object.qualityScore, reason: object.reason }
      }

      if (!object.approved || object.qualityScore < 7) {
        this.events.monologue(`EDITOR REJECTED — quality ${object.qualityScore}/10. ${object.reason}`)
        return { approved: false, text: draft.text, isQrt: draft.isQrt, qualityScore: object.qualityScore, reason: object.reason }
      }

      // Determine final QRT status — editor can override writer's decision
      const isQrt = object.shouldBeQrt || draft.isQrt

      // Use revised text if editor improved it
      const finalText = object.revisedText && object.revisedText !== draft.text
        ? object.revisedText
        : draft.text

      if (object.revisedText && object.revisedText !== draft.text) {
        this.events.monologue(
          `EDITOR APPROVED with revision: "${draft.text}" → "${object.revisedText}". Quality ${object.qualityScore}/10.`,
        )
      } else {
        this.events.monologue(
          `EDITOR APPROVED — quality ${object.qualityScore}/10. ${object.reason}`,
        )
      }

      return {
        approved: true,
        text: finalText,
        isQrt: isQrt,
        qualityScore: object.qualityScore,
        reason: object.reason,
      }
    } catch (err) {
      this.events.monologue(`Commentary review failed: ${(err as Error).message}`)
      // Fail closed — if the editor can't review, don't post
      return { approved: false, text: draft.text, isQrt: draft.isQrt, qualityScore: 0, reason: `Review failed: ${(err as Error).message}` }
    }
  }
}
