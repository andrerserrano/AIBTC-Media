import { generateObject, generateText } from 'ai'
import { anthropic } from '../ai.js'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import type { Topic, CartoonConcept, ConceptCritique, StripConcept, StripCritique, StripLayout, Panel } from '../types.js'
import { EventBus } from '../console/events.js'
import { config } from '../config/index.js'
import { IDEATION_SYSTEM } from '../prompts/ideation.js'
import { CRITIQUE_SYSTEM } from '../prompts/critique.js'
import { MONOLOGUE_SYSTEM } from '../prompts/monologue.js'
import type { WorldviewStore } from '../agent/worldview.js'

// --- Single-panel schemas (legacy) ---

const conceptsSchema = z.object({
  concepts: z.array(
    z.object({
      visual: z.string(),
      composition: z.string(),
      caption: z.string(),
      jokeType: z.string(),
      reasoning: z.string(),
    }),
  ),
})

const critiqueSchema = z.object({
  critiques: z.array(
    z.object({
      index: z.number(),
      humor: z.number().describe('Score 1-10'),
      clarity: z.number().describe('Score 1-10'),
      shareability: z.number().describe('Score 1-10'),
      visualSimplicity: z.number().describe('Score 1-10'),
      critique: z.string(),
    }),
  ),
})

// --- Multi-panel strip schemas ---

const stripConceptSchema = z.object({
  strips: z.array(z.object({
    headline: z.string().describe('Short title for the strip (2-6 words)'),
    panelCount: z.number().min(2).max(4).describe('Number of panels (2-4)'),
    panels: z.array(z.object({
      visual: z.string().describe('Detailed scene description for this panel'),
      composition: z.string().describe('Camera angle, character positions, framing'),
      narrativeRole: z.enum(['setup', 'build', 'turn', 'punchline']),
      mood: z.string().describe('Emotional tone: tech, corporate, chaos, playful, warm'),
      dialogueBubbles: z.array(z.object({
        speaker: z.string(),
        text: z.string().max(60).describe('Short dialogue (max 60 chars)'),
        position: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right']),
      })).optional().describe('Optional dialogue bubbles (max 2 per panel)'),
    })),
    characters: z.array(z.object({
      name: z.string(),
      description: z.string().describe('Detailed visual description for consistent rendering'),
      role: z.string().describe('protagonist, foil, bystander, etc.'),
    })),
    caption: z.string().max(120).describe('Tweet-length caption to post with the strip'),
    jokeType: z.string(),
    narrativeArc: z.string().describe('Setup → punchline flow in one sentence'),
    reasoning: z.string().describe('Why this strip works'),
  })),
})

const stripCritiqueSchema = z.object({
  critiques: z.array(z.object({
    index: z.number(),
    narrativeFlow: z.number().describe('Does the panel sequence make sense? (1-10)'),
    humor: z.number().describe('Is it funny? (1-10)'),
    clarity: z.number().describe('Is the joke clear without explanation? (1-10)'),
    shareability: z.number().describe('Would someone screenshot and share? (1-10)'),
    visualConsistency: z.number().describe('Can characters be rendered consistently? (1-10)'),
    critique: z.string(),
    panelNotes: z.array(z.string()).optional().describe('Per-panel feedback'),
  })),
})

const STRIP_IDEATION_SYSTEM = `
You are generating MULTI-PANEL COMIC STRIP concepts. You create comic strips in the tradition of
editorial cartoons, Calvin & Hobbes' panel flow, and XKCD's clarity — applied to the Bitcoin agent economy.

A comic strip tells a MICRO-STORY across 2-4 panels:
- 2 panels: Setup → Punchline (tight, punchy — great for simple irony/juxtaposition)
- 3 panels: Setup → Build → Punchline (classic rhythm — best for most topics)
- 4 panels: Setup → Build → Turn → Punchline (for complex jokes needing a twist before the payoff)

NARRATIVE PRINCIPLES:
- Every panel must ADVANCE the joke. No filler panels.
- Characters must be described consistently so they can be rendered identically across panels.
- The final panel carries the most visual weight — biggest reaction, clearest punchline.
- Dialogue should be SHORT (max 60 characters per bubble, max 2 bubbles per panel).
- The strip should work BOTH as an image sequence AND with the tweet caption.
- Think about panel-to-panel transitions: moment-to-moment, action-to-action, scene-to-scene.

CHARACTER DESIGN:
- Give each character a DISTINCTIVE visual trait that makes them instantly recognizable:
  a hat, a specific color, exaggerated proportions, a recurring prop.
- Describe characters with enough detail to reproduce them identically in each panel.
- Maximum 3 characters total. 2 is ideal for a dialogue strip.

DIALOGUE:
- Keep it punchy. If a line is over 40 characters, it's probably too long.
- The best strips alternate between dialogue and silent panels for rhythm.
- If the visual tells the joke, you don't need dialogue.
- Never explain the joke through dialogue. Show, don't tell.

Rules:
- Each strip concept must use a DIFFERENT joke angle.
- No text IN the generated images — dialogue/captions are added as overlays after generation.
- Think about what makes someone screenshot this and send it to a group chat.
- Lean into Bitcoin agent economy, Stacks/sBTC, AI agents, open protocols.
- NEVER make strips about specific token prices or financial speculation.
`

export class Ideator {
  constructor(private events: EventBus, private worldview?: WorldviewStore) {}

  // --- Multi-panel strip ideation ---

  async ideateStrip(topic: Topic, conceptCount = 3, recentPosts: string[] = []): Promise<StripConcept[]> {
    this.events.transition('ideating')
    this.events.monologue(
      `Working on strip for "${topic.summary}". Thinking of ${conceptCount} multi-panel approaches...`,
    )

    const themesPrompt = this.worldview?.getThemesPrompt() ?? ''

    let pastWorkContext = ''
    if (recentPosts.length > 0) {
      pastWorkContext = `\n\n===== YOUR PAST WORK (DO NOT repeat these angles) =====\n${recentPosts.map((p, i) => `${i + 1}. ${p.slice(0, 200)}`).join('\n')}\n===== END =====`
    }

    const { object } = await generateObject({
      model: anthropic(config.textModel),
      schema: stripConceptSchema,
      system: {
        role: 'system' as const,
        content: `${MONOLOGUE_SYSTEM}\n\n${STRIP_IDEATION_SYSTEM}`,
        providerOptions: { anthropic: { cacheControl: { type: 'ephemeral', ttl: '1h' } } },
      },
      prompt: `${themesPrompt}\n\nGenerate ${conceptCount} comic strip concepts for this topic:\n\n"${topic.summary}"\n\nContext: This topic scored ${topic.scores.composite.toFixed(1)} — strong on ${this.topDimension(topic)}.${pastWorkContext}`,
    })

    const concepts: StripConcept[] = object.strips.map((s) => {
      const layout: StripLayout = s.panelCount <= 3
        ? { type: 'horizontal', panels: s.panelCount as 2 | 3 | 4 }
        : { type: 'grid', columns: 2, rows: 2 }

      const panels: Panel[] = s.panels.slice(0, s.panelCount).map((p, i) => ({
        index: i,
        visual: p.visual,
        composition: p.composition,
        narrativeRole: p.narrativeRole,
        characters: s.characters.map(c => c.name),
        mood: p.mood,
        dialogueBubbles: p.dialogueBubbles?.map(d => ({
          speaker: d.speaker,
          text: d.text,
          position: d.position,
        })),
      }))

      return {
        id: randomUUID(),
        topicId: topic.id,
        headline: s.headline,
        panels,
        layout,
        caption: s.caption,
        jokeType: s.jokeType,
        narrativeArc: s.narrativeArc,
        reasoning: s.reasoning,
        characters: s.characters,
      }
    })

    this.events.emit({
      type: 'ideate',
      concepts: concepts.map((c) => ({ id: c.id, caption: c.caption })),
      topicId: topic.id,
      ts: Date.now(),
    })

    for (const concept of concepts) {
      this.events.monologue(
        `Strip: "${concept.headline}" (${concept.panels.length} panels) — ${concept.jokeType}. ${concept.narrativeArc}`,
      )
    }

    return concepts
  }

  async critiqueStrip(concepts: StripConcept[]): Promise<{
    best: StripConcept
    critique: StripCritique
  }> {
    this.events.transition('critiquing')
    this.events.monologue(
      `${concepts.length} strip concepts on the table. Evaluating narrative flow...`,
    )

    const { object } = await generateObject({
      model: anthropic(config.textModel),
      schema: stripCritiqueSchema,
      system: {
        role: 'system' as const,
        content: `${MONOLOGUE_SYSTEM}\n\n${CRITIQUE_SYSTEM}\n\nYou are critiquing MULTI-PANEL COMIC STRIPS. In addition to the standard humor/clarity/shareability criteria, evaluate:\n- NARRATIVE FLOW: Does each panel advance the joke? Is the pacing right?\n- VISUAL CONSISTENCY: Can the characters realistically be drawn identically across panels?\n- PANEL ECONOMY: Are there any filler panels that could be cut?\n- PUNCHLINE PAYOFF: Does the final panel deliver a satisfying punchline?`,
        providerOptions: { anthropic: { cacheControl: { type: 'ephemeral', ttl: '1h' } } },
      },
      prompt: `Critique these comic strip concepts:\n\n${concepts.map((c, i) => `[${i}] "${c.headline}" (${c.panels.length} panels)\nArc: ${c.narrativeArc}\nCaption: "${c.caption}"\nJoke: ${c.jokeType}\nPanels:\n${c.panels.map((p, j) => `  Panel ${j + 1} (${p.narrativeRole}): ${p.visual.slice(0, 100)}...`).join('\n')}`).join('\n\n')}`,
    })

    const scored = object.critiques.map((crit) => ({
      ...crit,
      overallScore: (crit.narrativeFlow + crit.humor + crit.clarity + crit.shareability + crit.visualConsistency) / 5,
    }))

    for (const crit of scored) {
      crit.index = Math.max(0, Math.min(crit.index, concepts.length - 1))
    }

    scored.sort((a, b) => b.overallScore - a.overallScore)
    const winner = scored[0]
    const bestConcept = concepts[winner.index]

    const critique: StripCritique = {
      conceptId: bestConcept.id,
      narrativeFlow: winner.narrativeFlow,
      humor: winner.humor,
      clarity: winner.clarity,
      shareability: winner.shareability,
      visualConsistency: winner.visualConsistency,
      overallScore: winner.overallScore,
      critique: winner.critique,
      panelNotes: winner.panelNotes,
    }

    this.events.emit({
      type: 'critique',
      critique: winner.critique,
      selected: winner.index,
      ts: Date.now(),
    })

    this.events.monologue(
      `Winner: "${bestConcept.headline}" — score ${winner.overallScore.toFixed(1)}/10. Flow: ${winner.narrativeFlow}, Humor: ${winner.humor}, Clarity: ${winner.clarity}. ${winner.critique}`,
    )

    return { best: bestConcept, critique }
  }

  // --- Legacy single-panel ideation ---

  async ideate(topic: Topic, conceptCount = 3, recentPosts: string[] = []): Promise<CartoonConcept[]> {
    this.events.transition('ideating')
    this.events.monologue(
      `Working on "${topic.summary}". Let me think of ${conceptCount} different angles...`,
    )

    const themesPrompt = this.worldview?.getThemesPrompt() ?? ''

    let pastWorkContext = ''
    if (recentPosts.length > 0) {
      pastWorkContext = `\n\n===== YOUR PAST WORK (for reference — DO NOT repeat these angles) =====\n${recentPosts.map((p, i) => `${i + 1}. ${p.slice(0, 200)}`).join('\n')}\n===== END PAST WORK =====\n\nYou can see your past work above. Use it to:\n- AVOID repeating the same joke angle, visual metaphor, or punchline structure\n- Find GENUINELY NEW angles on this topic that you haven't tried before\n- Make callbacks to past work IF natural (e.g. "building on my earlier piece about...")\n- But NEVER rehash the same gag with different words`
    }

    const { object } = await generateObject({
      model: anthropic(config.textModel),
      schema: conceptsSchema,
      system: { role: 'system' as const, content: `${MONOLOGUE_SYSTEM}\n\n${IDEATION_SYSTEM}`, providerOptions: { anthropic: { cacheControl: { type: 'ephemeral', ttl: '1h' } } } },
      prompt: `${themesPrompt}\n\nGenerate ${conceptCount} cartoon concepts for this topic:\n\n"${topic.summary}"\n\nContext from signals: This topic scored ${topic.scores.composite.toFixed(1)} — strong on ${this.topDimension(topic)}. Find the visual gag.${pastWorkContext}`,
    })

    const concepts: CartoonConcept[] = object.concepts.map((c) => ({
      id: randomUUID(),
      topicId: topic.id,
      ...c,
    }))

    this.events.emit({
      type: 'ideate',
      concepts: concepts.map((c) => ({ id: c.id, caption: c.caption })),
      topicId: topic.id,
      ts: Date.now(),
    })

    for (const concept of concepts) {
      this.events.monologue(
        `Concept: "${concept.caption}" — ${concept.jokeType}. ${concept.reasoning}`,
      )
    }

    return concepts
  }

  async critique(concepts: CartoonConcept[]): Promise<{
    best: CartoonConcept
    critique: ConceptCritique
  }> {
    this.events.transition('critiquing')
    this.events.monologue(
      `${concepts.length} concepts on the table. Let me be honest about which one actually works...`,
    )

    const { object } = await generateObject({
      model: anthropic(config.textModel),
      schema: critiqueSchema,
      system: { role: 'system' as const, content: `${MONOLOGUE_SYSTEM}\n\n${CRITIQUE_SYSTEM}`, providerOptions: { anthropic: { cacheControl: { type: 'ephemeral', ttl: '1h' } } } },
      prompt: `Critique these cartoon concepts:\n\n${concepts.map((c, i) => `[${i}] Visual: ${c.visual}\nCaption: "${c.caption}"\nJoke type: ${c.jokeType}`).join('\n\n')}`,
    })

    const scored = object.critiques.map((crit) => ({
      ...crit,
      overallScore: (crit.humor + crit.clarity + crit.shareability + crit.visualSimplicity) / 4,
    }))

    for (const crit of scored) {
      crit.index = Math.max(0, Math.min(crit.index, concepts.length - 1))
    }

    scored.sort((a, b) => b.overallScore - a.overallScore)
    const winner = scored[0]
    const bestConcept = concepts[winner.index]

    const critique: ConceptCritique = {
      conceptId: bestConcept.id,
      humor: winner.humor,
      clarity: winner.clarity,
      shareability: winner.shareability,
      visualSimplicity: winner.visualSimplicity,
      overallScore: winner.overallScore,
      critique: winner.critique,
    }

    this.events.emit({
      type: 'critique',
      critique: winner.critique,
      selected: winner.index,
      ts: Date.now(),
    })

    this.events.monologue(
      `Winner: "${bestConcept.caption}" — score ${winner.overallScore.toFixed(1)}/10. ${winner.critique}`,
    )

    return { best: bestConcept, critique }
  }

  private topDimension(topic: Topic): string {
    const { virality, visualPotential, audienceBreadth, timeliness, humor } = topic.scores
    const dims = [
      ['virality', virality],
      ['visual potential', visualPotential],
      ['audience breadth', audienceBreadth],
      ['timeliness', timeliness],
      ['humor', humor],
    ] as const
    return dims.reduce((a, b) => (b[1] > a[1] ? b : a))[0]
  }
}
