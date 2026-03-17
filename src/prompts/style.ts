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
- Two vertical orange rectangle-eyes on the dark screen — mandatory on every robot.
  These are the brand signature. They glow as if lit from within.
- Optional simple line mouth on the screen-face for expression
- Small antenna or nub on top of the screen-head
- Circular ear-speakers mounted on either side of the head — like headphone cups.
  These complete the distinctive silhouette.
- Robot heads are OPAQUE — when viewed from behind, the back of the head is a solid
  surface (no screen). The screen-face is only on the FRONT.
- Robot bodies are WHITE or VERY LIGHT GREY with bold black outlines — clean, bright surfaces.
  Do NOT shade robot bodies with dense patterns, dots, or heavy grey fills.
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
- Emotion is conveyed primarily through BODY LANGUAGE:
  - Slumped shoulders = tired/defeated
  - Raised arms = triumph/excitement
  - Tilted head = curiosity/confusion
  - Forward lean = engagement/eagerness
  - Pointing finger = authority/accusation
  - Robot expressions should match the SCENE CONTEXT — a robot in a meeting is neutral/engaged,
    a robot delivering bad news shows concern. Don't add random emotions that don't fit the scene.

CHARACTER DESIGN — HUMANS (when present):
- Same bold ink style with flat grey fills — minimal detail, maximum personality through posture
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
- Default: NO text in the image. No speech bubbles, labels, or readable signs.
- EXCEPTION: Minimal contextual text is allowed when it serves the joke — e.g. "Q3 REVIEW"
  on a whiteboard in a meeting scene, "PROPOSAL #47" on a presentation. Keep it to 1-3 words max.
- Screens and monitors show abstract shapes or simple diagrams unless contextual text serves the joke.
- Documents and papers are mostly blank or show abstract wavy lines.
- The caption below the image carries the main words. The image is primarily visual.
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
