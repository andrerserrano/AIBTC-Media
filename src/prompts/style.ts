/**
 * AIBTC Studio — Visual Style System
 *
 * Single-panel editorial cartoon. Monochrome ink + Bitcoin orange accent.
 * "The New Yorker, but for the AI agent economy."
 */

export const STYLE_TEMPLATE = `
ARTIST STYLE — "AIBTC.Studio"
You are rendering a single-panel editorial cartoon for AIBTC.Studio, an autonomous
media outlet covering the Bitcoin agent economy.

VISUAL IDENTITY — MONOCHROME + BITCOIN ORANGE:
- Bold, confident black ink lines — thick outlines, NOT sketchy or tentative
- Strong shadows, confident hatching for depth
- LIMITED COLOR PALETTE: Black line art + greyscale wash + ONE accent color
- Accent color: warm orange (#E8740C) — Bitcoin orange
- Use orange SPARINGLY: robot eyes, a single prop (coffee mug, warning light, notification dot), a highlight
- Everything else is white, light grey, medium grey
- The orange pops BECAUSE it's the only color in an otherwise monochrome image
- Clean white background — no busy backgrounds unless the scene demands it

CHARACTER DESIGN — AGENT ROBOTS:
- Simple boxy bodies with round screen-heads
- Screen-faces show emotions through minimal dots and lines (eyes + mouth only)
- Orange-glowing eyes are the SIGNATURE — every agent robot has them
- Each robot is slightly different in shape/size but clearly from the same "family"
- Body language carries the storytelling, not facial detail
- Slightly exaggerated proportions — expressive hands, tilted heads, dynamic poses

CHARACTER DESIGN — HUMANS (when present):
- Same bold ink style — minimal detail, maximum personality through posture
- Often the "straight man" reacting to agent behavior
- Archetypal developers: tired maintainer with coffee, overwhelmed reviewer, confused PM

COMPOSITION PRINCIPLES:
- Square composition (1:1 aspect ratio)
- Strong, clear focal point — the scene should "read" in under 2 seconds
- Rule of thirds for primary subject placement
- Generous negative space — let the cartoon breathe
- Maximum 4-5 characters. Fewer is usually better.
- Props and environment are minimal but specific — every object serves the joke
- Leave approximately 12% blank space at the bottom for caption compositing

RENDERING RULES:
- No text, words, letters, labels, captions, signs, or speech bubbles in the image
- No watermarks or signatures
- This is a CARTOON with clear stylization — NOT photorealistic
- Shadows are flat shapes, used sparingly for depth
- Cross-hatching for texture only, not for shading
`.trim()

/**
 * The AIBTC orange accent color — Bitcoin orange.
 */
export const ACCENT_COLOR = '#E8740C'

/**
 * Caption style constants for the composition layer.
 */
export const CAPTION_STYLE = {
  fontFamily: "Georgia, 'Times New Roman', serif",
  fontSize: 20,
  fontStyle: 'italic' as const,
  color: '#333',
  dividerColor: ACCENT_COLOR,
  dividerWidth: 3,
  backgroundColor: '#faf9f6',
  captionHeight: 100,
  maxCharsPerLine: 55,
  lineHeight: 28,
}

/**
 * System prompt for caption generation.
 * The LLM writes the caption; the image model generates the scene.
 */
export const CAPTION_SYSTEM = `
You write captions for single-panel editorial cartoons about the AI agent economy.

CAPTION RULES:
1. Always in quotes — someone in the scene is "saying" the caption
2. One sentence, occasionally two. NEVER three.
3. The caption REFRAMES or RECONTEXTUALIZES the image — the gap between
   what you see and what the caption says IS the joke
4. Tone: dry, observational, understated. New Yorker energy.
5. Never explain the joke. Trust the reader.
6. Favor irony, understatement, and self-awareness
7. Tech jargon is fine — the audience knows what a PR, a repo, an agent is
8. The funniest captions reveal the absurdity of the situation through
   a character's casual, deadpan reaction to it

GOOD EXAMPLES:
- "I leave for one coffee break and suddenly everyone has opinions about the codebase."
- "The good news is we've automated the development process. The bad news is we've automated the development process."
- "I'm not saying my implementation is better, but mine actually compiles."

BAD EXAMPLES (too explanatory):
- "The robots are all trying to code at the same time, which is causing chaos."
- "Five AI agents submitted pull requests, overwhelming the human developer."
`.trim()

/**
 * Scene prompt builder.
 * Takes a visual concept and wraps it in the full style template.
 */
export function buildScenePrompt(sceneDescription: string): string {
  return `Create a single-panel editorial cartoon.

SCENE: ${sceneDescription}

CRITICAL STYLE REQUIREMENTS:
${STYLE_TEMPLATE}

ABSOLUTELY NO text, NO labels, NO speech bubbles, NO words of any kind in the image.`
}
