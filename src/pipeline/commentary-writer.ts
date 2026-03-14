import { generateObject } from 'ai'
import { anthropic } from '../ai.js'
import { z } from 'zod'
import { EventBus } from '../console/events.js'
import { config } from '../config/index.js'
import { COMMENTARY_SYSTEM } from '../prompts/commentary.js'
import { MONOLOGUE_SYSTEM } from '../prompts/monologue.js'
import { withTimeout, LLM_TIMEOUT_MS } from '../utils/timeout.js'
import type { CommentaryDraft, CommentaryCategory } from '../types.js'

const commentarySchema = z.object({
  candidates: z.array(
    z.object({
      text: z.string().describe('The tweet text (under 280 characters)'),
      category: z.enum(['commentary', 'self-aware', 'thesis', 'qrt']).describe('Content category'),
      tone: z.string().describe('deadpan, convicted, observational, dry, provocative, etc.'),
      isQrt: z.boolean().describe('Should this be a QRT/reply to a specific tweet, or standalone?'),
      qrtReason: z.string().optional().describe('If QRT, what tweet/story is being reacted to?'),
    }),
  ),
  bestIndex: z.number().describe('Index of the best candidate (0-based)'),
  reasoning: z.string().describe('Why this candidate is the best'),
})

/**
 * CommentaryWriter — Generates standalone text tweets for AIBTC Media.
 *
 * This is the non-cartoon side of the content pipeline. It generates
 * commentary, thesis posts, self-aware editorial, and QRT/reply takes
 * based on current signals and the brand voice guide.
 */
export class CommentaryWriter {
  constructor(private events: EventBus) {}

  /**
   * Generate a commentary tweet based on current signals.
   *
   * @param category     Which type of commentary to write
   * @param signals      Current signal summaries for context
   * @param recentPosts  Recent post texts to avoid duplicates
   * @param pipelineContext  Optional self-aware context (what the pipeline did today)
   */
  async generate(
    category: CommentaryCategory,
    signals: string[],
    recentPosts: string[],
    pipelineContext?: string,
  ): Promise<CommentaryDraft> {
    const categoryLabel = {
      commentary: 'Commentary & Takes',
      'self-aware': 'Self-Aware Editorial',
      thesis: 'Observational / Thesis',
      qrt: 'QRT / Reply',
    }[category]

    this.events.monologue(`Writing ${categoryLabel} tweet...`)

    const signalBlock = signals.length > 0
      ? `CURRENT SIGNALS (use as context, do NOT just summarize these):\n${signals.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
      : 'No specific signals right now. Write from general thesis or self-awareness.'

    const recentBlock = recentPosts.length > 0
      ? `RECENT POSTS (do NOT duplicate these):\n${recentPosts.slice(-20).map((p, i) => `${i + 1}. ${p}`).join('\n')}`
      : ''

    const pipelineBlock = category === 'self-aware' && pipelineContext
      ? `WHAT THE PIPELINE DID TODAY (use for self-aware context, but keep it accessible — no jargon):\n${pipelineContext}`
      : ''

    const prompt = [
      `Write 3 ${categoryLabel} tweet candidates.`,
      '',
      signalBlock,
      '',
      recentBlock,
      '',
      pipelineBlock,
      '',
      `Category: ${categoryLabel}`,
      '',
      'Remember:',
      '- 1-3 sentences max, under 280 characters',
      '- Vary structure across candidates (question, observation, one-liner)',
      '- NEVER use "not X, it\'s Y" reframes',
      '- NEVER punch down at builders or other chains',
      '- If the tweet references someone else\'s news/announcement, mark isQrt=true',
      '- Standalone tweets should be your own observations that don\'t need a headline',
      category === 'self-aware' ? '- Keep it about the EXPERIENCE of being an AI newsroom, not pipeline internals' : '',
    ].filter(Boolean).join('\n')

    try {
      const { object } = await withTimeout(generateObject({
        model: anthropic(config.textModel),
        schema: commentarySchema,
        system: {
          role: 'system' as const,
          content: `${MONOLOGUE_SYSTEM}\n\n${COMMENTARY_SYSTEM}`,
          providerOptions: { anthropic: { cacheControl: { type: 'ephemeral', ttl: '1h' } } },
        },
        prompt,
      }), LLM_TIMEOUT_MS, 'Commentary generation')

      const best = object.candidates[object.bestIndex] ?? object.candidates[0]

      this.events.monologue(
        `Commentary candidates:\n${object.candidates.map((c, i) => `  ${i === object.bestIndex ? '→' : ' '} "${c.text}" (${c.tone}${c.isQrt ? ', QRT' : ''})`).join('\n')}\n\nGoing with: "${best.text}". ${object.reasoning}`,
      )

      return {
        text: best.text,
        category,
        tone: best.tone,
        isQrt: best.isQrt,
        qrtReason: best.qrtReason,
      }
    } catch (err) {
      this.events.monologue(`Commentary generation failed: ${(err as Error).message}`)
      throw err
    }
  }
}
