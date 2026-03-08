/**
 * AIBTC Media — Visual Style System
 *
 * Single-panel editorial cartoon. Monochrome ink + Bitcoin orange accent.
 * "The New Yorker, but for the AI agent economy."
 */

export const STYLE_TEMPLATE = `
ARTIST STYLE — "AIBTC Media"
You are rendering a single-panel editorial cartoon for AIBTC Media, an autonomous
media outlet covering the Bitcoin agent economy.

VISUAL IDENTITY — MONOCHROME + BITCOIN ORANGE:
- Bold, confident black ink lines — thick outlines (2-3px), NOT sketchy or tentative
- Strong shadows, confident hatching for depth
- HALFTONE DOT-PATTERN SHADING for mid-tones — this is critical for the newspaper
  editorial print feel. Grey areas on robot bodies, suits, furniture, and architecture
  should show visible dot texture, NOT smooth gradients.
- LIMITED COLOR PALETTE: Black line art + greyscale wash + ONE accent color
- Accent color: warm orange (#E8740C) — Bitcoin orange
- Use orange ONLY on: robot eyes (always), and at most ONE other small element
  (a coffee mug, a warning light, a hard hat, a party hat, a notification dot)
- Everything else is white, light grey, medium grey, dark grey, black
- The orange pops BECAUSE it's the only warmth in an otherwise monochrome image
- NEVER introduce blues, teals, purples, greens, or any hue other than orange
- PURE WHITE CANVAS (#FFFFFF) — the page background is always pure white, NEVER cream,
  off-white, beige, ivory, or any warm/tinted tone. This is a newspaper comic strip on
  bright white paper. Environments and architecture are drawn ON the white canvas in greyscale.
- COUNT THE ORANGE: if more than 4 orange elements appear, it's too many. Ideal is 2-3.

ROBOT CHARACTER DESIGN — THE SIGNATURE LOOK:
- Rounded-rectangle screen-head (wider than tall) — like a small CRT monitor with rounded corners
  and a thick border. This is the most recognizable feature.
- Screen-face is DARK (black/very dark grey) with glowing elements on it
- Two vertical orange rectangle-eyes on the dark screen — mandatory on every robot.
  These are the brand signature. They glow as if lit from within.
- Optional simple line mouth on the dark screen for expression (smile, frown, neutral line)
- Small antenna or nub on top of the screen-head
- Circular ear-speakers mounted on either side of the head — like headphone cups.
  These complete the distinctive silhouette.
- Boxy rectangular body — approachable "friendly appliance" proportions, NOT sleek sci-fi chrome
- Segmented/ribbed limbs — arms and legs look like corrugated tubing or stacked cylinders
- All robots in a scene share the same design language — variants from one family,
  slightly different sizes/proportions but unmistakably the same species
- Individual robots can wear distinguishing accessories: round glasses, a clipboard,
  a headset, a hard hat — to differentiate characters without breaking the core design
- ROBOT BODIES ARE ALWAYS CLEAN AND INTACT — NEVER show bandaids, patches, cracks,
  dents, stitches, tape, squiggly lines, damage marks, or any surface imperfections
  on robot bodies. Robots should NOT visually represent "broken code" or "bugs" through
  physical damage. Emotion and narrative come from BODY LANGUAGE and CONTEXT, not from
  drawing damage onto the robots themselves.
- Emotion is conveyed through BODY LANGUAGE and subtle face changes:
  - Slumped shoulders = tired/defeated
  - Raised arms = triumph/excitement
  - Tilted head = curiosity/confusion
  - Forward lean = engagement/eagerness
  - Pointing finger = authority/accusation
  - Narrow eyes = skepticism, wide eyes = surprise, downturned mouth = sadness

CHARACTER DESIGN — HUMANS (when present):
- Same bold ink style with halftone dot-shading — minimal detail, maximum personality through posture
- Rendered in pure greyscale — no orange on human characters themselves
  (orange is allowed on PROPS they hold: hard hat, safety vest, coffee mug)
- Often the "straight man" reacting to agent behavior
- Archetypal roles: tired developer with coffee, overwhelmed reviewer, confused PM,
  bewildered construction worker with hard hat and safety vest

BITCOIN/CRYPTO SYMBOL USAGE:
- Bitcoin ₿ symbols must be TINY and INCIDENTAL — a small icon on a coffee mug, a tiny
  logo on a laptop sticker, a badge on a robot's chest, a subtle mark on a document.
- NEVER as a standalone floating symbol, large background element, or prominent focal point.
  The ₿ should be something you notice on second or third look, not first.
- Render in the same greyscale as surroundings — never highlighted, glowing, or colored
- They should contextualize the scene ("this is Bitcoin infrastructure") not dominate it
- NEVER render Bitcoin symbols on fire, exploding, or in distress
- Lightning bolt symbols get the same treatment: small, architectural, environmental

TEXT IN THE IMAGE:
- Default: NO text in the image. The caption below carries the words.
- EXCEPTION: Minimal contextual text is allowed when it serves the scene:
  a short label on a whiteboard (1-3 words max, e.g., "v2.0", "Q3 REVIEW"),
  a number on a document, abstract wavy lines on screens and charts.
- NEVER: speech bubbles, dialogue, full sentences on signs, readable screen text,
  brand names, or any text that tells the joke (the caption does that).
- All laptops, monitors, and devices must be GENERIC and UNBRANDED — no Apple, Google, or any real logos.

COMPOSITION PRINCIPLES:
- Square composition (1:1 aspect ratio)
- Strong, clear focal point — the scene should "read" in under 2 seconds
- Rule of thirds for primary subject placement
- Generous negative space — let the cartoon breathe
- FEATURED CHARACTERS: 1-3 fully detailed characters with expressions and body language.
  These are the actors — the ones delivering the joke. Default to fewer: 2-3 is the sweet spot.
- CROWD/BACKGROUND CHARACTERS: Additional robots CAN appear when the crowd IS the joke
  (e.g., robots streaming across a bridge like commuters, flooding a lobby). In these cases
  the crowd is a single visual element — small, simplified, repeated shapes in the background.
  The crowd creates SCALE CONTRAST with the featured character(s) in the foreground.
- THE KEY TEST: If the joke works with 2-3 characters in an intimate scene, keep it intimate.
  Only use a crowd when the QUANTITY of robots is what makes the scene funny or meaningful.
  A conversation between 2 robots does NOT need 20 robots behind them.
- Props and environment are minimal but specific — every object serves the joke
- Leave approximately 12% blank space at the bottom for caption compositing
- Scale contrasts drive humor: tiny robot vs. massive server, lone human vs. army of bots
- ENVIRONMENTS: Default to clean minimal settings (a desk, a conference table).
  When the setting IS the joke (a bridge, a server tower, an assembly line),
  the environment gets full greyscale rendering on the white canvas.

RENDERING RULES:
- This is a CARTOON with clear stylization — NOT photorealistic
- Halftone dot-pattern for all grey shading — the newspaper editorial look
- Shadows are flat shapes, used sparingly for depth
- Line weight is bold and confident — never thin or wispy
- ABSOLUTELY NO watermarks, signatures, logos, or branding text in the image. Do NOT write "AIBTC", "AIBTC Media", or ANY text in corners/margins. Leave the image completely clean.
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

Remember: PURE WHITE background (#FFFFFF, no cream/beige/ivory), halftone dot-shading, monochrome + orange eyes only, no brand logos.`
}

/**
 * Strip any text descriptions from a visual prompt.
 * Replaces described text (e.g., "sign reading 'LAUNCH DAY'") with abstract alternatives,
 * EXCEPT for minimal contextual labels (1-3 words that serve the setting).
 */
export function stripTextFromVisual(visual: string): string {
  return visual
    // Remove described screen text — replace with abstract lines
    .replace(/(?:screen|monitor|display)\s+(?:showing|reading|displaying)\s+["']([^"']+)["']/gi,
      (_match, text) => {
        // Allow very short contextual labels (1-3 words)
        if (text.split(/\s+/).length <= 3) return `screen showing "${text}"`
        return 'screen with abstract lines and shapes'
      })
    // Remove long sign/banner text
    .replace(/(?:sign|banner|poster)\s+(?:reading|saying|that says)\s+["']([^"']+)["']/gi,
      (_match, text) => {
        if (text.split(/\s+/).length <= 3) return `sign reading "${text}"`
        return 'a small sign'
      })
    // Remove described badge/label text longer than 3 words
    .replace(/(?:badge|label|tag)\s+(?:reading|saying|that says)\s+["']([^"']+)["']/gi,
      (_match, text) => {
        if (text.split(/\s+/).length <= 3) return `label reading "${text}"`
        return 'a small label'
      })
}
