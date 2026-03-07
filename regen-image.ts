/**
 * Regenerate "Post-Launch Panic" image with fixes:
 * 1. Cleaner whiteboard (simple lines, not messy squiggles)
 * 2. Absolutely NO logo on laptop back
 */
import { writeFileSync, readFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import sharp from 'sharp';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY required');

const caption = `"The launch was the easy part."`;

const cleanVisual = `A robot agent sits at a desk, slumped forward with one hand on its dark screen-face. It wears a small crooked party hat. On the desk: an open laptop seen from behind showing a COMPLETELY PLAIN flat grey back with absolutely nothing on it, a half-eaten slice of cake on a plate, and a coffee mug. Behind the robot on the wall, a simple whiteboard with just two or three clean straight lines forming a basic bar chart outline. The robot body language conveys exhaustion.`;

const stylePrompt = `STYLE: Single-panel editorial cartoon. Think New Yorker cartoon simplicity.

COLOR PALETTE (STRICT):
- Bold black ink lines (2-3px weight, confident — NOT sketchy)
- White, light grey, medium grey, dark grey fills
- ONE accent color ONLY: Bitcoin orange (#E8740C)
- Orange ONLY on: robot eyes (always) + at most ONE small prop (mug, warning light, hard hat)
- Everything else is greyscale. Less orange = more impact.

ROBOT CHARACTER DESIGN (CRITICAL — follow exactly):
- HEAD: Round or rounded-rectangle SCREEN shape. The screen face is BLACK/DARK.
- EYES: Two SMALL orange dots on the dark screen — like tiny LED indicators. NOT large ovals.
- The face is MOSTLY BLACK SCREEN with just the two small orange dots. This is the signature look.
- NO other facial features — no mouth, no eyebrows, no nose
- BODY: Boxy rectangular torso — friendly appliance proportions
- Emotion through BODY LANGUAGE: slumped shoulders, raised arms, tilted head

SCENE: ${cleanVisual}

COMPOSITION STYLE (CRITICAL — this defines the brand):
- Clean and uncluttered, but with enough detail to tell a story
- Draw the characters, their setting (desk, table, workbench), and specific props
- BACKGROUND: Clean WHITE or very light cream. NOT grey. The background should be bright and clean.
- Keep backgrounds SIMPLE: a plain white wall or nothing
- NO debris clouds, NO particle effects, NO scattered floating objects
- Generous negative space — the cartoon should BREATHE, with white space around the scene
- WHITEBOARD in background: Keep extremely clean — just 2-3 simple straight lines forming a basic bar chart. NOT messy squiggles, NOT chaotic scribbles. Think of a clean presentation slide with minimal content.
- Leave ~12% blank space at bottom edge for caption overlay
- Square 1:1 aspect ratio

ABSOLUTE RULES:
- ZERO text anywhere — no words, letters, labels, signs, speech bubbles, banners
- Monitors/screens show abstract lines — NEVER readable text
- The laptop back MUST be a COMPLETELY PLAIN, FLAT, SOLID grey rectangle. NO logo, NO symbol, NO circle, NO apple shape, NO bite mark, NO emblem, NO lines, NO dot, NO decoration of ANY kind. Just a smooth flat grey surface.
- NO real-world brand logos (Apple, Google, Microsoft, etc.) anywhere in the scene
- Maximum 3 characters
- Bitcoin symbols: small environmental detail only, never focal`;

async function composeWithCaption(imageBuffer: Buffer, captionText: string): Promise<Buffer> {
  const fontFamily = "Georgia, 'Times New Roman', serif";
  const baseFontSize = 20;
  const fontStyle = 'italic';
  const color = '#333';
  const dividerColor = '#E8740C';
  const dividerWidth = 3;
  const backgroundColor = '#faf9f6';
  const maxCharsPerLine = 55;
  const baseLineHeight = 28;

  const trimmed = await sharp(imageBuffer).trim({ threshold: 30 }).toBuffer();
  const meta = await sharp(trimmed).metadata();
  const imgW = meta.width!;
  const imgH = meta.height!;

  const padding = 20;
  const totalWidth = imgW + padding * 2;

  // Word wrap
  const words = captionText.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxCharsPerLine) {
      lines.push(current.trim());
      current = word;
    } else {
      current = (current + ' ' + word).trim();
    }
  }
  if (current) lines.push(current.trim());

  const fontSize = lines.length > 2 ? Math.round(baseFontSize * 0.85) : baseFontSize;
  const lineHeight = lines.length > 2 ? Math.round(baseLineHeight * 0.85) : baseLineHeight;

  const captionPaddingTop = 12;
  const captionPaddingBottom = 16;
  const captionHeight = captionPaddingTop + lines.length * lineHeight + captionPaddingBottom;
  const totalHeight = imgH + captionHeight + padding * 2;

  const captionStartY = imgH + padding * 2 + captionPaddingTop;
  const dividerY = imgH + padding * 2;

  const textElements = lines
    .map((line, i) => {
      const y = captionStartY + i * lineHeight + fontSize;
      const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      return `<text x="${totalWidth / 2}" y="${y}" text-anchor="middle" font-family="${fontFamily}" font-size="${fontSize}" font-style="${fontStyle}" fill="${color}">${escaped}</text>`;
    })
    .join('\n');

  const frameSvg = `<svg width="${totalWidth}" height="${totalHeight}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${totalWidth}" height="${totalHeight}" fill="${backgroundColor}"/>
    <rect x="${padding - 1}" y="${padding - 1}" width="${imgW + 2}" height="${imgH + 2}" fill="none" stroke="#ddd" stroke-width="1"/>
    <line x1="${padding}" y1="${dividerY}" x2="${totalWidth - padding}" y2="${dividerY}" stroke="${dividerColor}" stroke-width="${dividerWidth}"/>
    ${textElements}
  </svg>`;

  return sharp(Buffer.from(frameSvg))
    .composite([{ input: trimmed, top: padding, left: padding }])
    .png()
    .toBuffer();
}

async function main() {
  console.log('Generating image with Gemini...');

  const apiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: stylePrompt }] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      }),
    }
  );

  if (!apiRes.ok) {
    const errText = await apiRes.text();
    throw new Error(`Gemini API failed: ${apiRes.status} ${errText.slice(0, 500)}`);
  }

  const data = await apiRes.json();
  const outDir = resolve('/sessions/laughing-trusting-shannon/repo/.data');
  mkdirSync(outDir, { recursive: true });
  mkdirSync(resolve('/sessions/laughing-trusting-shannon/repo/public/images'), { recursive: true });

  let rawImageBuf: Buffer | null = null;

  for (const candidate of data.candidates || []) {
    for (const part of candidate.content?.parts || []) {
      if (part.inlineData?.mimeType?.startsWith('image/')) {
        rawImageBuf = Buffer.from(part.inlineData.data, 'base64');
        const rawPath = resolve(outDir, 'cartoon-test.png');
        writeFileSync(rawPath, rawImageBuf);
        console.log(`✅ Raw image saved: ${rawPath}`);
      }
      if (part.text) {
        console.log(`Gemini text: ${part.text.slice(0, 200)}`);
      }
    }
  }

  if (!rawImageBuf) {
    console.log('No image in response:', JSON.stringify(data, null, 2).slice(0, 1000));
    return;
  }

  // Compose with caption
  console.log('Composing with caption...');
  const composed = await composeWithCaption(rawImageBuf, caption);

  const composedPath = resolve(outDir, 'cartoon-test-composed.png');
  writeFileSync(composedPath, composed);
  console.log(`✅ Composed image: ${composedPath}`);

  const publicPath = resolve('/sessions/laughing-trusting-shannon/repo/public/images/cartoon-4-composed.png');
  writeFileSync(publicPath, composed);
  console.log(`✅ Public image: ${publicPath}`);
}

main().catch(console.error);
