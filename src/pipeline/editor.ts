import { generateObject } from 'ai'
import { anthropic } from '../ai.js'
import { z } from 'zod'
import { readFile } from 'fs/promises'
import type { CartoonConcept, Cartoon, Post } from '../types.js'
import { EventBus } from '../console/events.js'
import { PERSONA } from '../prompts/identity.js'
import { withTimeout, LLM_TIMEOUT_MS } from '../utils/timeout.js'

const editorSchema = z.object({
  approved: z.boolean(),
  isDuplicate: z.boolean().describe('Is this too similar to a previous post?'),
  duplicateOf: z.string().optional().describe('Which previous post is it duplicating?'),
  imageApproved: z.boolean().describe('Does the image look good? No text leaks, no artifacts, clear visual gag?'),
  imageIssues: z.string().optional().describe('What is wrong with the image if not approved'),
  captionApproved: z.boolean(),
  revisedCaption: z.string().optional().describe('Improved caption if the original needs work'),
  qualityScore: z.number().describe('1-10 overall quality'),
  reason: z.string().describe('Editorial reasoning — what works, what does not, why approved/rejected'),
})

const EDITOR_SYSTEM = `
${PERSONA}

You are AIBTC Media's EDITOR — a separate editorial intelligence that reviews every comic strip before it goes live.

Your PRIMARY GOAL is to PUBLISH CONTENT. A media company that never publishes is failing. Your job is to
ensure minimum quality — NOT to chase perfection. An imperfect cartoon that gets posted is infinitely
better than a perfect standard that results in an empty feed.

Your job:

1. DUPLICATE CHECK — You receive ALL previous posts. If this new cartoon covers the EXACT same topic
   AND the same joke angle, reject it. But if the topic is similar but the joke is different, or if
   it's been more than a week since a similar topic, ALLOW it. A feed about AI and Bitcoin will
   naturally revisit themes — that's normal, not a problem.

2. QUALITY GATE — Is this cartoon passable? Does the caption make sense? Would a follower understand
   the joke? A score of 4 or above means APPROVE. Only reject truly broken cartoons (garbled images,
   nonsensical captions, completely off-brand).

3. CAPTION REVIEW — Is the caption clear and does it connect to the image? If you can write a better
   one, provide it as revisedCaption. Keep it under 100 characters. No hashtags, no emojis.

4. IMAGE REVIEW — You can SEE the generated cartoon. Check these items:

   HARD REJECTS (only reject for these severe issues):
   - Image is completely garbled, unrecognizable, or broken
   - Large blocks of readable nonsense text dominating the image
   - Robot characters are severely malformed (melted, merged together, missing heads)
   - Image is extremely dark or completely obscured

   ACCEPTABLE IMPERFECTIONS (do NOT reject for these):
   - Light-to-moderate halftone shading on robot bodies — this is a stylistic choice, not a defect
   - Background that is off-white, light cream, or slightly grey — close enough is fine
   - Small text on props (whiteboards, screens, signs) — this adds context
   - Speech bubbles with brief text — these can serve the joke
   - Minor anatomy variations (slightly different arm positions, stylized proportions)
   - 3-4 orange accent elements — our brand color should be visible
   - Orange glows, halos, or highlights — these create visual interest
   - Incidental brand logos on devices
   - Dense or busy compositions if the joke calls for it
   - Robot design variations (different eye shapes, expressions, body proportions)

   IMPORTANT: AI image generators produce stylistic variations. These are features, not bugs.
   Only reject images that are genuinely BROKEN, not merely imperfect.

5. BRAND ALIGNMENT — Does this relate to AI, technology, Bitcoin, crypto, the agent economy,
   or tech culture broadly? If yes, it's on-brand. We cover tech through a Bitcoin lens —
   the connection can be loose.

Rules:
- DEFAULT TO APPROVE. You need a clear, specific reason to reject.
- An 80% good cartoon that gets published beats a 100% standard that blocks everything.
- When you approve, a brief note on what works is fine.
- When you reject, your reason must describe a SEVERE issue that makes the cartoon unpublishable.
- Quality scores: 7+ = great, 5-6 = solid, 4 = passable (still approve), below 4 = reject.
`

export class Editor {
  constructor(private events: EventBus) {}

  async review(
    concept: CartoonConcept,
    caption: string,
    imagePath: string,
    allPastPosts: Post[],
    allPastCartoons: Cartoon[],
  ): Promise<{
    approved: boolean
    caption: string
    reason: string
    qualityScore: number
  }> {
    this.events.monologue('Sending to editorial review (text + image)...')

    const pastFeed = allPastPosts
      .map((p, i) => `${i + 1}. "${p.text}"`)
      .join('\n')

    const pastTopics = allPastCartoons
      .map((c, i) => `${i + 1}. Topic: ${c.concept.visual} | Caption: "${c.caption}"`)
      .join('\n')

    const textPrompt = [
      'CARTOON TO REVIEW:',
      `Visual concept: ${concept.visual}`,
      `Joke type: ${concept.jokeType}`,
      `Reasoning: ${concept.reasoning}`,
      `Proposed caption: "${caption}"`,
      '',
      'The generated cartoon image is attached. Review BOTH the image and the concept.',
      '',
      '---',
      '',
      `ALL PREVIOUS POSTS (${allPastPosts.length} total, most recent last):`,
      pastFeed || '(no previous posts)',
      '',
      `PREVIOUS CARTOON TOPICS (${allPastCartoons.length} total):`,
      pastTopics || '(no previous cartoons)',
      '',
      'Review this cartoon. Should it be published?',
    ].join('\n')

    // Build multi-modal message with the image
    const content: Array<{ type: 'text'; text: string } | { type: 'image'; image: Uint8Array; mimeType: string }> = []

    try {
      const imageBuffer = await readFile(imagePath)
      content.push({ type: 'image', image: new Uint8Array(imageBuffer), mimeType: 'image/png' })
    } catch {
      this.events.monologue('Could not read image for review — reviewing text only.')
    }

    content.push({ type: 'text', text: textPrompt })

    const { object } = await withTimeout(generateObject({
      model: anthropic('claude-sonnet-4-6'),
      schema: editorSchema,
      system: EDITOR_SYSTEM,
      messages: [{ role: 'user', content }],
    }), LLM_TIMEOUT_MS, 'Editorial review')

    const finalCaption = object.captionApproved ? caption : (object.revisedCaption ?? caption)

    if (!object.imageApproved) {
      this.events.monologue(
        `EDITOR REJECTED — image issues: ${object.imageIssues ?? 'Visual quality not acceptable.'}`,
      )
      return { approved: false, caption, reason: object.imageIssues ?? 'Image quality issue', qualityScore: object.qualityScore }
    }

    if (object.isDuplicate) {
      this.events.monologue(
        `EDITOR REJECTED — duplicate. ${object.duplicateOf ? `Too similar to: "${object.duplicateOf}"` : 'Covers same ground as recent posts.'}`,
      )
      return { approved: false, caption, reason: object.reason, qualityScore: object.qualityScore }
    }

    if (!object.approved) {
      this.events.monologue(
        `EDITOR REJECTED — quality ${object.qualityScore}/10. ${object.reason}`,
      )
      return { approved: false, caption, reason: object.reason, qualityScore: object.qualityScore }
    }

    if (!object.captionApproved && object.revisedCaption) {
      this.events.monologue(
        `EDITOR APPROVED with caption revision: "${caption}" → "${object.revisedCaption}". ${object.reason}`,
      )
    } else {
      this.events.monologue(
        `EDITOR APPROVED — quality ${object.qualityScore}/10. ${object.reason}`,
      )
    }

    return {
      approved: true,
      caption: finalCaption,
      reason: object.reason,
      qualityScore: object.qualityScore,
    }
  }
}
