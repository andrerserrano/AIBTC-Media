/**
 * AIBTC Media — Visual Style System
 *
 * Single-panel editorial cartoon. Monochrome ink + Bitcoin orange accent.
 * "The New Yorker, but for the AI agent economy."
 */

export const STYLE_TEMPLATE = `
ARTIST STYLE — EDITORIAL CARTOON
You are rendering a single-panel editorial cartoon for an autonomous
media outlet covering the Bitcoin agent economy.

VISUAL IDENTITY — MONOCHROME + BITCOIN ORANGE:
- Bold, confident black ink lines — thick outlines (2-3px), NOT sketchy or tentative
- Strong shadows, confident hatching for depth
- ABSOLUTELY NO halftone dots, stipple patterns, crosshatch, or screentone anywhere
  in the image. All shading uses FLAT SOLID FILLS of grey (light, medium, or dark).
  Shadows are simple flat shapes — never textured. Robot bodies are CLEAN white or
  light grey with NO surface patterns of any kind. This is a CLEAN DIGITAL cartoon,
  NOT a printed newspaper comic.
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
- Two SMALL vertical orange rectangle-eyes on the dark screen — mandatory on every robot.
  These are the brand signature. They glow as if lit from within. Eyes are SMALL — roughly
  15% of the screen width each, NOT large bars or goggles.
- NO mouth or nose on the screen-face. The core face is the dark screen + two small orange eyes.
- OPTIONAL: subtle eyebrow-like lines above the eyes or round glasses frames are allowed
  as character-distinguishing accessories — but keep them minimal and don't let them
  dominate the screen-face. The orange rectangle-eyes must remain the primary focal point.
- Emotion comes primarily from body language, with eyebrows as a secondary accent.
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
- Emotion is conveyed primarily through BODY LANGUAGE, with optional subtle eyebrow accents:
  - Slumped shoulders = tired/defeated
  - Raised arms = triumph/excitement
  - Tilted head = curiosity/confusion
  - Forward lean = engagement/eagerness
  - Pointing finger = authority/accusation
  - Hands on hips = frustration, arms crossed = skepticism

CHARACTER DESIGN — HUMANS (when present):
- Same bold ink style with halftone dot-shading — minimal detail, maximum personality through posture
- Rendered in pure greyscale — no orange on human characters themselves
  (orange is allowed on PROPS they hold: hard hat, safety vest, coffee mug)
- Often the "straight man" reacting to agent behavior
- Archetypal roles: tired developer with coffee, overwhelmed reviewer, confused PM,
  bewildered construction worker with hard hat and safety vest

BITCOIN/CRYPTO SYMBOL USAGE:
- The ₿ symbol is our BRAND MARK — use it as a subtle, tasteful accent that reinforces identity.
- The ₿ must be DIEGETIC — it exists as a physical object IN the scene, not as a floating logo or overlay.
- GOOD placements: etched/engraved into a prop (coffee mug, bridge pillar, badge, laptop sticker),
  as a small pin on a jacket, printed on a mug, embossed on a wall plaque.
- BAD placements: giant ₿ floating in the air, ₿ overlaid on a screen as a logo, ₿ as the focal point
  of the composition, flaming/glowing ₿ that dominates the scene. The ₿ should NEVER be the subject —
  it's set dressing.
- Keep ₿ usage to 1-2 small instances per image — it should feel like a natural detail in the world.
- ₿ symbols do NOT count as "text" for the no-text rule. They are brand iconography.
- NO other crypto logos, blockchain diagrams, or Lightning bolt symbols.

TEXT IN THE IMAGE:
- ABSOLUTELY NO TEXT of any kind in the image. Zero words, zero letters, zero numbers.
- No speech bubbles, labels, signs, whiteboard writing, screen text, document text, or watermarks.
- Whiteboards and screens show ONLY abstract shapes, wavy lines, or simple geometric diagrams.
- Documents and papers are BLANK or show abstract wavy lines only.
- The caption below the image carries ALL the words. The image is purely visual.
- All laptops, monitors, and devices must be GENERIC and UNBRANDED.
- Laptop backs are PLAIN FLAT RECTANGLES — no logos, circles, symbols, or marks of any kind.
  NOT Apple, NOT Google, NOT any brand. Just a plain flat colored rectangle.

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
- Shading uses FLAT GREY FILLS ONLY — clean solid areas of grey with ZERO texture.
  NO halftone dots, NO stipple, NO crosshatch anywhere. Every grey area is a smooth solid fill.
- Shadows are flat shapes, used sparingly for depth
- Line weight is bold and confident — never thin or wispy
- ABSOLUTELY NO watermarks, signatures, logos, or branding text anywhere in the image.
  Do NOT write ANY text in corners, margins, or anywhere else. The image must be completely
  clean of all text, letters, and words. Branding is added in post-processing, not by you.
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

FINAL MANDATORY CHECKS BEFORE RENDERING:
1. Background is PURE WHITE (#FFFFFF) — not grey, not cream, not any color. The majority of the canvas must be white.
2. ALL shading is flat solid grey — ZERO halftone dots, stipple, or crosshatch anywhere in the image.
3. Robot bodies are clean white/light grey surfaces with NO dot patterns or texture.
4. Monochrome + orange eyes only. No other hues.
5. If the scene has a ground plane or environment, render it as minimal line art ON the white canvas — do NOT fill the frame with dark terrain.`
}

/**
 * Strip ALL text descriptions from a visual prompt.
 * Replaces any described text with abstract visual alternatives.
 * Gemini tends to render any text it sees in the prompt, so we strip everything.
 */
export function stripTextFromVisual(visual: string): string {
  return visual
    // Remove ALL described screen/monitor/display text — replace with abstract visuals
    .replace(/(?:screen|monitor|display)\s+(?:showing|reading|displaying)\s+["'][^"']+["']/gi,
      'screen with abstract wavy lines and geometric shapes')
    // Remove ALL sign/banner/poster text
    .replace(/(?:sign|banner|poster)\s+(?:reading|saying|that says)\s+["'][^"']+["']/gi,
      'a blank sign')
    // Remove ALL badge/label/tag text
    .replace(/(?:badge|label|tag)\s+(?:reading|saying|that says)\s+["'][^"']+["']/gi,
      'a small blank badge')
    // Remove ALL whiteboard/board text
    .replace(/(?:whiteboard|board|chalkboard)\s+(?:showing|reading|with|displaying)\s+["'][^"']+["']/gi,
      'a whiteboard with abstract diagrams and wavy lines')
    // Remove quoted text after "labeled" or "marked"
    .replace(/(?:labeled|marked|titled|headed)\s+["'][^"']+["']/gi,
      '')
    // Remove "that reads/says" patterns
    .replace(/that\s+(?:reads|says)\s+["'][^"']+["']/gi,
      '')
}
