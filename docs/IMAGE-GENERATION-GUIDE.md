# Image Generation Guide — AIBTC Media

## Quick Start

```bash
# Run all tests (style comparison + single panel + strip panels)
AI_GATEWAY_API_KEY=<key> npx tsx test-image-gen.ts

# Run a specific test
AI_GATEWAY_API_KEY=<key> npx tsx test-image-gen.ts --test style-compare
AI_GATEWAY_API_KEY=<key> npx tsx test-image-gen.ts --test single-panel
AI_GATEWAY_API_KEY=<key> npx tsx test-image-gen.ts --test strip-panel
```

Results go to `.data-test/image-tests/`.

## Setup

### Option A: Vercel AI Gateway (current setup)

The code uses `@ai-sdk/gateway` which routes through Vercel's unified API:

```
AI_GATEWAY_API_KEY=<your-key>
```

Get a key from Vercel's AI Gateway dashboard.

### Option B: Google Direct (alternative)

If you want to call Gemini directly without the gateway:

1. Get a key from [Google AI Studio](https://aistudio.google.com/apikey)
2. Install: `npm install @ai-sdk/google`
3. Set: `GOOGLE_GENERATIVE_AI_API_KEY=<your-key>`
4. Change the import in generator.ts from `gateway()` to `google()`

### Model Options

| Model | Quality | Speed | Cost |
|-------|---------|-------|------|
| `google/gemini-3-pro-image` | Best | Slower | ~$0.13/image |
| `google/gemini-2.5-flash-image` | Good | Fast | Cheaper |

Currently configured as `gemini-3-pro-image` in `src/config/index.ts`.

## Prompt Architecture

Every image prompt has this structure:

```
[STYLE TEMPLATE]    ← Visual identity (line art, colors, proportions)
---
[COLOR MOOD]        ← Palette selection based on emotional tone
[JOKE MECHANIC]     ← Context for rendering decisions
[SCENE DESCRIPTION] ← What to draw (characters, setting, gag)
[COMPOSITION]       ← How to frame it (camera, focal point, eye flow)
[CRITICAL RULES]    ← No text, clean background, etc.
```

For multi-panel strips, each panel gets its own prompt with an additional character consistency block.

## What Makes Prompts Work (and Fail)

### Things that help Gemini produce good editorial cartoons:

1. **"No text" must be repeated multiple times.** Gemini loves adding text to images. Say it in the style template, in the scene description, AND in the critical rules. Still expect occasional text leaks — the editor stage catches these.

2. **Describe characters like a police sketch artist.** Vague descriptions like "a developer" produce inconsistent results. Instead: "A tall, lanky human with messy dark hair, thick-rimmed round glasses, wearing a wrinkled gray hoodie. Slight slouch."

3. **Color mood directives work well.** Telling Gemini "use slate blue, teal, muted purple, off-white" produces much more cohesive palettes than letting it choose.

4. **Composition instructions should use spatial language.** "Rule of thirds — character at left-third intersection" beats "character on the left side."

5. **The word "cartoon" matters.** Without it, Gemini drifts toward illustration or semi-realistic styles. Including "editorial cartoon" and "flat color fills" keeps it stylized.

### Things that cause problems:

1. **Too many characters.** 3+ characters and Gemini starts merging or duplicating them. Stick to 1-2 for reliable results.

2. **Complex environments.** Busy backgrounds dilute the focal point. Specify "clean white background" or "minimal environment."

3. **Asking for specific proportions between characters.** "Character A is twice as tall as Character B" is unreliable. Use relative language: "Character A looms over Character B."

4. **Cross-hatching and fine detail instructions.** Gemini handles "bold outlines" and "flat colors" well. Cross-hatching instructions are hit-or-miss.

5. **Reference images of real people.** The generator tries to find Wikipedia/Twitter photos for reference. This can help with recognizable caricatures but can also cause the style to drift toward realism.

## Style Exploration

The test script includes 4 styles to compare:

### Style A: New Yorker Editorial (current default)
Bold ink, flat colors, dot-eyes, exaggerated proportions. Sophisticated but accessible.

### Style B: XKCD/Oatmeal
Minimal line art, near-monochrome. Maximum clarity, internet-native energy.

### Style C: Digital Illustration
Clean vector aesthetic, slightly more detail. Modern tech blog feel.

### Style D: Vintage Print
Retro newspaper vibe, cross-hatching, limited warm palette. Nostalgic.

Run `--test style-compare` to generate the same scene in all 4 and compare.

## Multi-Panel Strip Challenges

The hardest part of comic strips is **character consistency across panels**. Here's the strategy:

1. **Character Reference Sheet**: Every strip concept includes detailed character descriptions. These are injected into every panel's prompt.

2. **Distinctive Traits**: Each character gets a signature visual trait (specific color, hat, body shape) that's easy for the model to reproduce.

3. **Identical Style Instructions**: Every panel gets the exact same style template and character block.

4. **Post-hoc Composition**: Panels are generated independently and stitched by the Composer module. This means inconsistencies between panels are possible — the Editor reviews the final strip.

## Iteration Workflow

1. **Run `test-image-gen.ts`** to generate test images
2. **Review results** in `.data-test/image-tests/`
3. **Identify issues** (text leaks, style drift, character inconsistency)
4. **Adjust the style template** in `src/prompts/style.ts`
5. **Re-run** and compare

The style template in `style.ts` is the single biggest lever. Changes there propagate to every image the pipeline generates.

## Tuning Tips

- If images are **too realistic**: add "cartoon", "stylized", "flat color" more prominently
- If images have **text/letters**: add more "no text" instructions and consider a post-processing step
- If characters **look different across panels**: make character descriptions more specific (exact colors, exact proportions)
- If the **joke doesn't read visually**: make the scene description more explicit about what's absurd/exaggerated
- If colors are **too busy**: reduce the palette instruction to 2-3 colors instead of 3-4
