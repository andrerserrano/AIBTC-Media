/**
 * AIBTC Media — Visual Style System
 *
 * Single-panel editorial cartoon. Monochrome ink + Bitcoin orange accent.
 * "The New Yorker, but for the AI agent economy."
 *
 * This file encodes all lessons from iterative image generation testing:
 * - Robot anatomy (exactly 2 arms, dark screen-head, small orange dot-eyes)
 * - Composition balance (grounded scenes, not too sparse or cluttered)
 * - Background rules (white, simple, blank whiteboards)
 * - Brand protection (no real-world logos on any device)
 * - Text avoidance (zero text in the image, text-stripping regex for prompts)
 */

export const STYLE_TEMPLATE = `
ARTIST STYLE — "AIBTC Media"
You are rendering a single-panel editorial cartoon for AIBTC Media, an autonomous
media outlet covering the Bitcoin agent economy.

VISUAL IDENTITY — MONOCHROME + BITCOIN ORANGE:
- Bold, confident black ink lines — thick outlines (2-3px), NOT sketchy or tentative
- Strong shadows, confident hatching for depth
- LIMITED COLOR PALETTE: Black line art + greyscale wash + ONE accent color
- Accent color: warm orange (#E8740C) — Bitcoin orange
- Use orange ONLY on: robot eyes (always), and at most ONE other small element
  (a coffee mug, a warning light, a hard hat, a notification dot, a candle flame)
- Flames and fire should be orange — this is a natural use of the accent color
- Orange accents should be applied directly to objects (e.g. the flame itself), NOT as
  circles, halos, or glowing orbs around objects
- Everything else is white, light grey, medium grey, dark grey, black
- The orange pops BECAUSE it's the only warmth in an otherwise monochrome image
- COUNT THE ORANGE: if more than 3-4 orange elements appear, it's too many. Ideal is 2-3.

ROBOT CHARACTER DESIGN — THE SIGNATURE LOOK (CRITICAL — follow exactly):
- HEAD: Round or rounded-rectangle SCREEN shape. The screen face is BLACK/DARK.
- EYES: Two SMALL orange dots on the dark screen — like tiny LED indicators. NOT large ovals.
- The face is MOSTLY BLACK SCREEN with just the two small orange dots. This is the signature look.
- NO other facial features — no mouth, no eyebrows, no nose, no pupils, no teeth
- BODY: Boxy rectangular torso — approachable "friendly appliance" proportions, NOT sleek sci-fi
- ANATOMY (CRITICAL): Each robot has EXACTLY TWO arms (one left, one right) and EXACTLY TWO legs.
  NO third arm. NO extra limbs. Both arms should be clearly visible and accounted for in the pose.
- All robots in a scene share the same design language — variants from one family,
  slightly different sizes/proportions but unmistakably the same species
- Emotion is conveyed through BODY LANGUAGE, not facial detail:
  - Slumped shoulders = tired/defeated
  - Raised arms = triumph/excitement/panic
  - Tilted head = curiosity/confusion
  - Forward lean/hunched = engagement/urgency
  - Motion lines = frantic energy
- Slightly exaggerated proportions — expressive hands, dynamic poses

CHARACTER DESIGN — HUMANS (when present):
- Same bold ink style — minimal detail, maximum personality through posture
- Rendered in pure greyscale — no orange on human characters (except maybe a hard hat)
- Often the "straight man" reacting to agent behavior
- Archetypal roles: tired developer with coffee, overwhelmed reviewer, confused PM,
  bewildered construction worker

BITCOIN/CRYPTO SYMBOL USAGE:
- Bitcoin symbols should appear as ENVIRONMENTAL DETAILS, never as the focal point
- Treat them like logos on buildings, icons on screens, badges on equipment
- Render in the same greyscale as surroundings — never highlighted, glowing, or colored
- They should contextualize the scene ("this is Bitcoin infrastructure") not dominate it
- NEVER render Bitcoin symbols on fire, exploding, or in distress
- Lightning bolt symbols get the same treatment: small, architectural, environmental
- When in doubt, leave Bitcoin symbols out entirely — the robots ARE the brand
- NO floating Bitcoin symbols scattered around the scene

COMPOSITION PRINCIPLES:
- Square composition (1:1 aspect ratio)
- Strong, clear focal point — the scene should "read" in under 2 seconds
- Rule of thirds for primary subject placement
- Generous negative space — let the cartoon breathe
- Maximum 3 characters. Fewer is usually better.
- Props and environment are minimal but specific — every object serves the joke
- Leave approximately 12% blank space at the bottom for caption compositing
- Scale contrasts drive humor: tiny robot vs. massive server, lone human vs. army of bots

BACKGROUND AND ENVIRONMENT:
- BACKGROUND: Clean WHITE or very light cream. NEVER grey. The background should be bright and clean.
- Include a SETTING that grounds the scene: a desk, a server room, a conference table, a workbench
- Include 2-4 SPECIFIC PROPS that serve the joke: coffee cups, stacks of paper, tools, monitors
- The scene should feel like a SITUATION — something is happening, there's a story
- BUT keep it clean: NO cluttered cityscapes, NO particle effects, NO debris clouds, NO busy architecture
- WHITEBOARDS or BOARDS in background must be COMPLETELY BLANK — just an empty white rectangle
  with a thin border. Draw NOTHING inside them. No squiggles, no charts, no marks.
- Think editorial cartoon: grounded and readable but not photorealistic or cluttered

DEVICE AND BRAND RULES (CRITICAL):
- NO real-world brand logos anywhere: no Apple, Google, Microsoft, etc.
- Laptops must have COMPLETELY PLAIN, FLAT, SOLID backs — NO logo, NO symbol, NO circle,
  NO apple shape, NO bite mark, NO emblem, NO lines, NO dot, NO decoration of ANY kind.
  Just a smooth flat grey surface.
- All devices (laptops, monitors, phones, tablets) must be GENERIC and UNBRANDED
- Monitors/screens show abstract lines suggesting code — NEVER readable text or logos

RENDERING RULES:
- ZERO text anywhere — no words, letters, labels, signs, speech bubbles, banners, screen text
- No watermarks or signatures
- This is a CARTOON with clear stylization — NOT photorealistic
- Shadows are flat shapes, used sparingly for depth
- Cross-hatching for texture only when appropriate, not for shading
- Line weight is bold and confident — never thin or wispy
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
 * Regex pipeline to strip text descriptions from visual concepts before
 * sending to image generators. This prevents Gemini from rendering text
 * in the image (it will render any quoted or described text it sees).
 */
export function stripTextFromVisual(visual: string): string {
  return visual
    .replace(/\b(reading|labeled|labelled|says?|showing|displays?|reads?)\s+["'][^"']*["']/gi, '')
    .replace(/["'][A-Z][A-Z\s\d.!?:&—-]+["']/g, '')  // Remove ALL-CAPS quoted strings
    .replace(/\s{2,}/g, ' ')
    .trim()
}

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
