import { generateObject } from 'ai'
import { anthropic } from '../ai.js'
import { z } from 'zod'
import { EventBus } from '../console/events.js'
import { config } from '../config/index.js'
import { TWEET_TEXT_SYSTEM } from '../prompts/tweet-text.js'
import { MONOLOGUE_SYSTEM } from '../prompts/monologue.js'
import { withTimeout, LLM_TIMEOUT_MS } from '../utils/timeout.js'

const tweetTextSchema = z.object({
  candidates: z.array(
    z.object({
      text: z.string(),
      tone: z.string().describe('deadpan, provocative, wry, straight, etc.'),
    }),
  ),
  bestIndex: z.number().describe('Index of the best candidate (0-based)'),
  reasoning: z.string(),
})

/**
 * TweetTextWriter — Generates the tweet text that accompanies a cartoon.
 *
 * The tweet text acts as the SETUP; the image caption is the PUNCHLINE.
 * This replaces the old approach of using topic.summary (a dry news headline)
 * as the tweet text.
 */
export class TweetTextWriter {
  constructor(private events: EventBus) {}

  /**
   * Generate tweet text that sets up the cartoon's punchline.
   *
   * @param topicSummary  The scorer's topic summary (used as context, not as output)
   * @param caption       The image caption already baked into the cartoon
   * @param jokeType      The joke style from the ideator (irony, absurdity, etc.)
   */
  async generate(topicSummary: string, caption: string, jokeType?: string): Promise<string> {
    this.events.monologue(
      `Writing tweet text to set up: "${caption.slice(0, 50)}..."`,
    )

    try {
      const { object } = await withTimeout(generateObject({
        model: anthropic(config.textModel),
        schema: tweetTextSchema,
        system: {
          role: 'system' as const,
          content: `${MONOLOGUE_SYSTEM}\n\n${TWEET_TEXT_SYSTEM}`,
          providerOptions: { anthropic: { cacheControl: { type: 'ephemeral', ttl: '1h' } } },
        },
        prompt: `Write 3 tweet text candidates for this cartoon:\n\nTopic: ${topicSummary}\nImage caption (punchline — DO NOT repeat this): "${caption}"${jokeType ? `\nJoke style: ${jokeType}` : ''}\n\nThe tweet text should SET UP the joke so the caption LANDS.`,
      }), LLM_TIMEOUT_MS, 'Tweet text generation')

      const best = object.candidates[object.bestIndex] ?? object.candidates[0]

      this.events.monologue(
        `Tweet text candidates:\n${object.candidates.map((c, i) => `  ${i === object.bestIndex ? '→' : ' '} "${c.text}" (${c.tone})`).join('\n')}\n\nGoing with: "${best.text}". ${object.reasoning}`,
      )

      return best.text
    } catch (err) {
      // Fallback: use a truncated topic summary if LLM fails
      this.events.monologue(`Tweet text generation failed, falling back to topic summary: ${(err as Error).message}`)
      return topicSummary.length > 100 ? topicSummary.slice(0, 100) + '…' : topicSummary
    }
  }
}
