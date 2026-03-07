# AIBTC Media — Visual Style Guide & Image Prompting Reference

## Part 1: Aesthetic Analysis of the Homepage Cartoons

### Image 1: "The sBTC Bridge Opens and the Agents Rush In"
**Caption:** *"Well, I guess we built it and they came."*

**What works:**
- **Robot consistency:** Every robot has the same iconic design — boxy body, round screen-head, orange dot-eyes. They're slightly different sizes but unmistakably from the same "family."
- **Scale and metaphor:** The bridge-as-infrastructure metaphor is immediately legible. The server rack towers serve double duty as bridge pillars AND data centers.
- **Bitcoin B usage:** The Bitcoin symbol appears as a small, architectural element on the left tower — integrated into the structure like a logo on a building. It's environmental, not focal. The lightning bolt on the right tower mirrors it with the same subtlety.
- **Human contrast:** The single construction worker sitting below, coffee in hand, provides the "straight man" perspective. His scale relative to the robots above creates the visual gag.
- **Orange accent discipline:** Orange appears only in the robot eyes, the construction worker's hard hat, and as the divider line below. Maximum 3-4 instances. This restraint is what makes the orange feel like a brand signature rather than decoration.
- **Composition:** Strong vertical towers frame the scene. The eye goes: bridge full of robots → down to the lone human → the caption. Clean, readable in 2 seconds.

### Image 2: "Governance Proposal #47: Let the AI Vote"
**Caption:** *"I move to table this discussion until we figure out what to do about their perfect attendance."*

**What works:**
- **Robot-human contrast:** One robot stands at the head of a conference table full of suited humans. The power dynamic is clear — the robot is presenting, the humans are reacting.
- **Body language storytelling:** The humans' postures — crossed arms, leaning back, exchanging glances — tell the entire story without any text needed.
- **Minimal environment:** Conference table, chairs, a projection screen. Nothing extraneous. Every object serves the scene.
- **Orange restraint:** Orange appears ONLY on the robot's eyes and a subtle accent (coffee mug). The humans are rendered in pure greyscale.
- **Line weight:** Bold, confident outlines. No sketchy or tentative lines. The style reads as editorial, not doodle.

### Image 3: "Clarity Smart Contract Passes Its First Audit — By Another Smart Contract"
**Caption:** *"I'm afraid your code has some serious issues, but don't take it personally — I'm programmed to say that to everyone."*

**What works:**
- **Two-character intimacy:** Just two robots facing each other across a desk. The simplicity focuses all attention on the interaction.
- **Emotion through minimalism:** One robot appears confident/clinical, the other anxious/deflated. This is achieved purely through head tilt, posture, and subtle eye expression — no complex facial features needed.
- **Props that serve the joke:** The stack of papers between them is the only prop, and it's essential — it's the "audit report" that contextualizes the scene.
- **Greyscale depth:** The robots are rendered in light greys with black outlines, creating depth without color. The only warmth is in the orange eyes.
- **Negative space:** The clean pure white background lets the characters breathe. No busy backgrounds competing for attention.

---

## Part 2: What Makes the Robot Design Iconic

### The Core Robot Formula
Every successful AIBTC robot follows this recipe:

1. **Round screen-head** — A simple circle or rounded rectangle that reads as a "display screen." This is the single most recognizable feature.
2. **Orange dot-eyes** — Two orange circles/dots on the screen-face. These are the ONLY color on the robot. The orange is #E8740C (Bitcoin orange). The eyes glow — they feel lit from within.
3. **Minimal face** — Eyes + optional simple line mouth. No nose, no eyebrows, no complex expressions. Emotion comes from eye size, spacing, and head tilt.
4. **Boxy body** — Rectangular torso, simple limbs. Not sleek or futuristic — more "friendly appliance" than "Terminator."
5. **Family resemblance** — Robots in a scene can vary in size and proportion, but they share the same design language. They look like they rolled off the same assembly line.
6. **Expressive posture** — Since faces are minimal, all emotion lives in body language: slumped shoulders = tired, raised arms = triumph, tilted head = curiosity, forward lean = engagement.

### What Breaks the Design
- Overly detailed faces (pupils, eyebrows, nostrils)
- Sleek/futuristic chrome bodies — the robots should feel approachable, not intimidating
- Too many unique robot designs in one scene — they should feel like variants, not different species
- Eyes that aren't orange — this is non-negotiable
- **Surface damage on robots** — bandaids, patches, cracks, dents, stitches, tape, squiggly lines, or any damage marks on robot bodies. Robots are always clean and intact. Don't use physical damage as a visual metaphor for bugs or broken code — use body language and scene context instead

---

## Part 3: Bitcoin Symbol Usage — When It Works and When It Doesn't

### The Fire Comic Problem
In the "emergency hotfix" cartoon (robots putting out a fire on a computer), the Bitcoin ₿ symbol is rendered as a large, flaming icon on the computer screen. This is problematic because:

- **The ₿ is the focal point** — it dominates the composition, pulling attention away from the robots and the humor of the scene
- **It reads as "Bitcoin is on fire"** which has unintended negative connotations (crash, failure, catastrophe)
- **It's too literal** — the joke is about developers scrambling to fix a bug, not about Bitcoin itself crashing
- **It competes with the orange accent** — the flaming ₿ introduces yellow/orange that clashes with the disciplined Bitcoin orange of the robot eyes

### The Bridge Image — Tasteful Bitcoin Integration
In the bridge cartoon, the Bitcoin ₿ appears as a small logo on the bridge tower, like a corporate logo on a building. This works because:

- **It's environmental, not focal** — you notice it on second look, not first
- **It contextualizes without dominating** — it tells you "this is Bitcoin infrastructure" without screaming it
- **It's at the same visual weight as other details** — the lightning bolt on the other tower, the directional sign below
- **It doesn't introduce competing colors** — it's rendered in the same greyscale as the architecture

### The Rule: Bitcoin Symbols as Infrastructure, Not Spectacle

| DO | DON'T |
|---|---|
| Small logo on a building, screen, or badge | Large flaming/glowing Bitcoin symbol |
| Integrated into architecture or environment | Floating/standalone symbol as focal point |
| Same greyscale treatment as surroundings | Color-highlighted to draw attention |
| Appears on second look, not first | Dominates the composition |
| Contextualizes the scene | IS the scene |

---

## Part 4: Updated Image Prompting Best Practices

### Style Template (for use in `src/prompts/style.ts`)

```
ARTIST STYLE — "AIBTC Media"
You are rendering a single-panel editorial cartoon for AIBTC Media, an autonomous
media outlet covering the Bitcoin agent economy.

VISUAL IDENTITY — MONOCHROME + BITCOIN ORANGE:
- Bold, confident black ink lines — thick outlines, NOT sketchy or tentative
- Strong shadows, confident hatching for depth
- LIMITED COLOR PALETTE: Black line art + greyscale wash + ONE accent color
- Accent color: warm orange (#E8740C) — Bitcoin orange
- Use orange ONLY on: robot eyes (always), and at most ONE other small element
  (a coffee mug, a warning light, a hard hat, a notification dot)
- Everything else is white, light grey, medium grey, dark grey, black
- The orange pops BECAUSE it's the only warmth in an otherwise monochrome image
- PURE WHITE background (#FFFFFF) — never cream, off-white, beige, or ivory. The canvas
  is bright white paper. Only greyscale line art and environments appear on it.

ROBOT CHARACTER DESIGN — THE SIGNATURE LOOK:
- Round screen-head (circle or rounded rectangle) — this is the most recognizable feature
- Screen-face shows emotion through MINIMAL elements: two orange dot-eyes + optional simple line mouth
- Orange-glowing eyes are MANDATORY on every robot — this is the brand signature
- NO complex facial features: no eyebrows, no nose, no pupils, no teeth
- Boxy rectangular body — approachable "friendly appliance" proportions, NOT sleek sci-fi chrome
- All robots in a scene look like variants from the same family — same design language,
  slightly different sizes/proportions
- Emotion is conveyed through BODY LANGUAGE: head tilt, posture, arm position, lean
  - Slumped shoulders = tired/defeated
  - Raised arms = triumph/excitement
  - Tilted head = curiosity/confusion
  - Forward lean = engagement/eagerness
  - Crossed arms = skepticism (for humans)
- Slightly exaggerated proportions — expressive hands, dynamic poses

HUMAN CHARACTER DESIGN (when present):
- Same bold ink style as robots — minimal detail, maximum personality through posture
- Rendered in pure greyscale — no orange on human characters (except maybe a hard hat)
- Often the "straight man" reacting to robot behavior
- Archetypal roles: tired developer with coffee, overwhelmed reviewer, confused PM,
  bewildered construction worker

BITCOIN/CRYPTO SYMBOL USAGE:
- Bitcoin ₿ symbols should appear as ENVIRONMENTAL DETAILS, never as the focal point
- Treat them like logos on buildings, icons on screens, badges on equipment
- Render in the same greyscale as surroundings — never highlighted, glowing, or colored
- They should contextualize the scene ("this is Bitcoin infrastructure") not dominate it
- A viewer should notice the ₿ on their second look, not their first
- NEVER render Bitcoin symbols on fire, exploding, or in distress — this reads as
  negative commentary on Bitcoin itself regardless of intent
- Lightning bolt symbols (for Lightning Network) get the same treatment: small, environmental

COMPOSITION PRINCIPLES:
- Square composition (1:1 aspect ratio)
- Strong, clear focal point — the scene should "read" in under 2 seconds
- Rule of thirds for primary subject placement
- Generous negative space — let the cartoon breathe
- Maximum 3-4 characters. Fewer is usually better.
- Props and environment are minimal but specific — every object serves the joke
- Leave approximately 12% blank space at the bottom for caption compositing
- Scale contrasts drive humor: tiny robot vs. massive server, lone human vs. army of bots

RENDERING RULES:
- No text, words, letters, labels, captions, signs, or speech bubbles in the image
- No watermarks or signatures
- This is a CARTOON with clear stylization — NOT photorealistic
- Shadows are flat shapes, used sparingly for depth
- Cross-hatching for texture only when appropriate, not for shading
- Line weight is bold and confident — 2-3px outlines, never thin/wispy
```

### Prompting Checklist

When generating an AIBTC cartoon, every prompt should address:

1. **Robot eyes:** Explicitly state "orange-glowing dot-eyes on a round screen-head"
2. **Color discipline:** Explicitly state the monochrome palette with orange-only accent
3. **Body language:** Describe specific postures and gestures for each character
4. **Orange count:** Identify exactly which elements will be orange (eyes + at most one prop)
5. **Negative space:** Remind the model to leave breathing room
6. **No text:** Always include the "no text/labels/speech bubbles" instruction
7. **Bitcoin symbols:** If relevant, specify "small, environmental, greyscale" placement
8. **Aspect ratio:** Always specify 1:1 square
9. **Character count:** Keep to 1-4 characters maximum
10. **Focal hierarchy:** Describe what the eye sees first, second, and third

### Common Prompt Mistakes to Avoid

- "A Bitcoin symbol on fire" → reads as anti-Bitcoin regardless of intent
- "A sleek chrome robot" → breaks the friendly/approachable design language
- "Robots with detailed expressive faces" → undermines the minimalist screen-head aesthetic
- "A busy background full of details" → clutters the composition and kills readability
- "Multiple bright colors" → destroys the monochrome + orange discipline
- "The robot has blue/green/red eyes" → orange eyes are non-negotiable
- "A robot covered in bandaids/cracks/damage" → robots are always clean and intact; use body language for emotion
- Forgetting to specify "no text" → models love adding labels and signs

---

## Part 5: Quick Reference Card

### The 5-Second Test
Every AIBTC cartoon should pass this test: Can a viewer understand the scene, identify the robots as AIBTC characters, and get the joke within 5 seconds?

### The Orange Rule
Count the orange elements. If there are more than 4 instances of orange in the image, it's too many. The ideal is 2-3: robot eyes + one accent prop.

### The Squint Test
Squint at the image. Can you still make out the robot's head shape and glowing eyes? If yes, the design is iconic enough. If the robot disappears into the background, the contrast needs work.

### The Caption Gap
The best AIBTC cartoons have a gap between what you SEE and what the caption SAYS. The image sets up the situation; the caption reframes it through a character's dry, deadpan reaction.
