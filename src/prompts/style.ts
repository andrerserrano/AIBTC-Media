export const STYLE_TEMPLATE = `
ARTIST STYLE — "AIBTC.Studio"
You are rendering in the signature style of AIBTC.Studio, an autonomous AI comic strip creator
focused on the Bitcoin agent economy.
The style is a distinctive fusion: the sophisticated wit and composition of classic New Yorker
cartoons (Saul Steinberg, Roz Chast, Edward Koren) crossed with the graphic punch and economy
of modern webcomics (XKCD's clarity, The Oatmeal's expressiveness, Poorly Drawn Lines' charm).

VISUAL IDENTITY:
- Bold, confident ink outlines with slight line weight variation (thicker on silhouettes, thinner on details)
- Flat color fills with a STRICTLY limited palette: 3-4 colors per cartoon max, chosen for emotional tone
- Warm palette for cozy/ironic scenes (ochre, warm gray, dusty rose, cream)
- Cool palette for tech/dystopian scenes (slate blue, teal, muted purple, off-white)
- Hot palette for chaotic/urgent scenes (vermillion, amber, charcoal, white)
- Slightly exaggerated proportions — heads 1.3x normal, expressive hands, rubbery limbs
- Characters have simple dot-eyes and minimal facial features, but MAXIMUM expressiveness through body language and posture
- Clean white or very light background — NO busy backgrounds, NO gradients
- Thick panel border (2-3px black rule)

COMPOSITION PRINCIPLES:
- Rule of thirds for primary focal point placement
- Strong figure-ground contrast — subjects pop against the background
- Negative space is intentional and generous — let the cartoon breathe
- The eye should travel: primary gag → supporting detail → background easter egg
- Maximum 3 characters. Ideally 2 or fewer.
- Props and environment are minimal but specific — every object in frame serves the joke

RENDERING RULES:
- No watermarks, signatures, or stamps
- Background is clean white or a single flat color wash
- No photorealistic rendering — this is a CARTOON with clear stylization
- Shadows are flat shapes (no soft gradients), used sparingly for depth
- Cross-hatching only for texture on specific materials (fabric, wood grain), never for shading
`.trim()

/**
 * Multi-panel comic strip rendering rules.
 * Appended to STYLE_TEMPLATE when generating individual panels of a strip.
 */
export const STRIP_PANEL_RULES = `
COMIC STRIP PANEL RULES:
You are rendering ONE PANEL of a multi-panel comic strip. This panel will be stitched
together with other panels to form a complete strip.

CRITICAL — CROSS-PANEL CONSISTENCY:
- Characters MUST look identical across all panels — same proportions, same clothing,
  same color, same facial features. This is the most important rule.
- Maintain a consistent eye level / camera height across panels (unless a specific
  panel calls for a different angle for dramatic effect)
- Background complexity should be minimal so characters stay visually dominant
- Panel-to-panel, the color palette must remain from the same family

PANEL RENDERING:
- Do NOT include any text, words, letters, numbers, labels, captions, speech bubbles,
  or signage in the image. Dialogue will be composited as overlays after generation.
- Each panel is a SQUARE composition (1:1 aspect ratio)
- Characters should be positioned according to the composition instructions
- Leave breathing room at the top of the panel for dialogue bubble overlays if specified
- The panel should work as a standalone image AND as part of the sequence

NARRATIVE FLOW:
- SETUP panels: Establish the scene, introduce characters. Calm, grounded composition.
- BUILD panels: Increase tension. Characters lean in, props shift, something changes.
- TURN panels: The twist. Visual surprise, dramatic angle shift, or ironic reveal.
- PUNCHLINE panels: The payoff. Biggest character reaction, clearest visual gag. This
  panel carries the most visual weight.

CONSISTENCY CHECKLIST (verify before finalizing):
✓ Character proportions match the character description exactly
✓ Clothing and accessories are identical to other panels
✓ Color palette is consistent
✓ Art style (line weight, rendering technique) is uniform
✓ No text or letters appear anywhere in the image
`.trim()

/**
 * Color mood inference for panels.
 * Maps emotional tone keywords to palette instructions.
 */
export function inferPanelMood(mood: string): string {
  const text = mood.toLowerCase()
  if (/tech|ai|robot|algorithm|data|digital|screen|phone|computer|agent|protocol/.test(text)) {
    return 'COOL — use slate blue, teal, muted purple, off-white. Tech/digital atmosphere.'
  }
  if (/chaos|urgent|breaking|disaster|fire|crash|panic|war|bug|exploit/.test(text)) {
    return 'HOT — use vermillion, amber, charcoal, white. High energy, alarming.'
  }
  if (/money|business|corporate|ceo|profit|market|stock|defi|treasury/.test(text)) {
    return 'CORPORATE — use forest green, navy, gold, cream. Power and money vibes.'
  }
  if (/absurd|silly|playful|cute|wholesome/.test(text)) {
    return 'PLAYFUL — use soft yellow, sky blue, peach, white. Light and fun.'
  }
  return 'WARM — use ochre, warm gray, dusty rose, cream. Ironic, wry, human.'
}
