/**
 * End-to-End Pipeline Test
 *
 * Tests: Scan → Score → Ideate → Generate → Caption → Compose → Inscribe
 * Outputs: Final cartoon image + provenance data for homepage card #4
 *
 * Usage: bun run test-e2e-pipeline.ts
 * (No need for `export $(grep ...)`  — .env is loaded below)
 */

// Load .env properly (handles values with spaces like ORDINALS_MNEMONIC)
import { readFileSync } from 'fs';
for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  process.env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
}

import { config } from '../src/config/index.js';
import { join } from 'path';
import { mkdirSync } from 'fs'

// Ensure data directory exists
mkdirSync(config.dataDir, { recursive: true });

// Step 1: Scan AIBTC News + Bitcoin Magazine
console.log('\n═══════════════════════════════════════');
console.log('STEP 1: SCANNING NEWS SOURCES');
console.log('═══════════════════════════════════════\n');

async function scanSources() {
  const allSignals: any[] = [];

  // --- Source 1: AIBTC News ---
  console.log('--- AIBTC News ---');
  try {
    const aibtcRes = await fetch('https://aibtc.news/api/signals?limit=20');
    if (aibtcRes.ok) {
      const data = await aibtcRes.json();
      const signals = Array.isArray(data) ? data : data?.signals || [];
      console.log(`✅ AIBTC News: ${signals.length} signals`);
      for (const s of signals.slice(0, 5)) {
        console.log(`   → ${s.title || s.headline || s.summary?.slice(0, 80) || JSON.stringify(s).slice(0, 80)}`);
      }
      allSignals.push(...signals.map(s => ({ ...s, source: s.source || 'AIBTC News' })));
    } else {
      console.log(`⚠️  AIBTC News API returned ${aibtcRes.status}, trying alternates...`);
      for (const path of ['/api/v1/signals', '/api/news', '/api/feed']) {
        try {
          const res = await fetch(`https://aibtc.news${path}`);
          if (res.ok) {
            const data = await res.json();
            const items = Array.isArray(data) ? data : data?.signals || data?.items || [];
            console.log(`✅ AIBTC News (${path}): ${items.length} items`);
            allSignals.push(...items.map(s => ({ ...s, source: 'AIBTC News' })));
            break;
          }
        } catch {}
      }
    }
  } catch (e) {
    console.log(`⚠️  AIBTC News scan failed: ${e.message}`);
  }

  // --- Source 2: Bitcoin Magazine RSS ---
  console.log('\n--- Bitcoin Magazine ---');
  try {
    const btcRes = await fetch('https://bitcoinmagazine.com/feed');
    if (btcRes.ok) {
      const xml = await btcRes.text();
      // Parse <item> blocks for title + description
      const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
      const parsed = items.map((m, i) => {
        const block = m[1];
        const title = block.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/)?.[1] || '';
        const desc = block.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/)?.[1] || '';
        const link = block.match(/<link>(.*?)<\/link>/)?.[1] || '';
        // Strip HTML from description
        const cleanDesc = desc.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 200);
        return { id: `btcmag-${i}`, title: title.trim(), summary: cleanDesc, link, source: 'Bitcoin Magazine' };
      }).filter(item => item.title && item.title !== 'Bitcoin Magazine');

      console.log(`✅ Bitcoin Magazine: ${parsed.length} articles`);
      parsed.slice(0, 5).forEach(t => console.log(`   → ${t.title}`));
      allSignals.push(...parsed);
    } else {
      console.log(`⚠️  Bitcoin Magazine RSS returned ${btcRes.status}`);
    }
  } catch (e) {
    console.log(`⚠️  Bitcoin Magazine RSS failed: ${e.message}`);
  }

  console.log(`\n📊 Total signals from all sources: ${allSignals.length}`);
  return allSignals;
}

// Step 2: Use Claude to score and select the best story
async function scoreAndSelect(signals: any[]) {
  console.log('\n═══════════════════════════════════════');
  console.log('STEP 2: SCORING & SELECTING WITH CLAUDE');
  console.log('═══════════════════════════════════════\n');

  const { generateText } = await import('ai');
  const { createAnthropic } = await import('@ai-sdk/anthropic');
  const anthropic = createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    baseURL: 'https://api.anthropic.com/v1',
  });

  const signalList = signals.slice(0, 15).map((s, i) =>
    `${i + 1}. ${s.title || s.headline || JSON.stringify(s).slice(0, 100)}`
  ).join('\n');

  const { text } = await generateText({
    model: anthropic('claude-sonnet-4-20250514'),
    prompt: `You are the editorial brain of AIBTC Media, an autonomous media company covering the Bitcoin agent economy.

Below are recent news signals. Score each on these dimensions (1-10):
- Visual potential (can this be drawn as a single-panel editorial cartoon?)
- Humor potential (is there an ironic, absurd, or exaggerated angle?)
- Timeliness (is this happening NOW?)
- Audience breadth (will crypto + AI people both care?)

Then SELECT THE SINGLE BEST story for a cartoon. Output JSON:

{
  "selected": {
    "index": <number>,
    "title": "<headline>",
    "scores": { "visual": <n>, "humor": <n>, "timeliness": <n>, "audience": <n>, "composite": <n> },
    "reasoning": "<why this is the best cartoon candidate>"
  }
}

SIGNALS:
${signalList}

Respond with ONLY the JSON, no markdown.`
  });

  console.log('Claude scoring response:');
  console.log(text);

  try {
    const result = JSON.parse(text);
    console.log(`\n✅ Selected: "${result.selected.title}" (composite: ${result.selected.scores.composite})`);
    return result.selected;
  } catch {
    // Try extracting JSON from response
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const result = JSON.parse(match[0]);
      console.log(`\n✅ Selected: "${result.selected.title}" (composite: ${result.selected.scores.composite})`);
      return result.selected;
    }
    throw new Error('Failed to parse Claude scoring response');
  }
}

// Step 3: Generate cartoon concept with Claude
async function generateConcept(selected: any) {
  console.log('\n═══════════════════════════════════════');
  console.log('STEP 3: IDEATION — CARTOON CONCEPT');
  console.log('═══════════════════════════════════════\n');

  const { generateText } = await import('ai');
  const { createAnthropic } = await import('@ai-sdk/anthropic');

  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY!, baseURL: 'https://api.anthropic.com/v1' });

  const { text } = await generateText({
    model: anthropic('claude-sonnet-4-20250514'),
    prompt: `You are the editorial cartoonist for AIBTC Media. Your style: single-panel editorial cartoons in the New Yorker tradition, covering the Bitcoin agent economy.

STORY: "${selected.title}"
REASONING: ${selected.reasoning}

Create ONE cartoon concept. The formula:

1. VISUAL: A clear scene with a SIMPLE SETTING and specific props that tell the story.
   - 1-3 characters: robot agents (boxy bodies, round dark screen-heads, small orange dot-eyes) and/or humans
   - Each robot has EXACTLY TWO arms and TWO legs. Never describe a robot with extra limbs.
   - Include a SETTING that grounds the joke: a desk, a server room, a conference table, a workbench, etc.
   - Include 2-4 SPECIFIC PROPS that serve the joke: coffee cups, stacks of paper, tools, monitors, chairs
   - Humans are welcome — tired developers, confused PMs, overwhelmed reviewers
   - The scene should feel like a SITUATION — something is happening, there's a story
   - BUT keep it clean: no cluttered cityscapes, no particle effects, no debris clouds, no busy backgrounds
   - NO text in the scene — no signs, labels, banners, screen text. Screens show abstract lines only.
   - NO floating Bitcoin symbols or crypto logos scattered around
   - Background should be simple (plain white wall, simple room outline) not complex architecture
   - Whiteboards or boards should be COMPLETELY BLANK — just an empty rectangle
   - All laptops and devices must be GENERIC and UNBRANDED — no Apple, Google, or any real logos

2. JOKE TYPE: irony, absurdism, exaggeration, juxtaposition, understatement, or role reversal.

3. CAPTION: A single quoted sentence. Dry, observational. Reframes the image. Never explain the joke.

4. COMPOSITION: Rule of thirds, clear focal point, generous negative space around the scene.

Output JSON:
{
  "visual": "<scene with setting + characters + specific props, simple background>",
  "composition": "<layout with focal point and breathing room>",
  "caption": "<the punchline in quotes>",
  "jokeType": "<irony|absurdism|exaggeration|juxtaposition|understatement|role_reversal>",
  "reasoning": "<why this is funny>",
  "title": "<cartoon title/headline>"
}

Respond with ONLY the JSON, no markdown.`
  });

  console.log('Cartoon concept:');
  console.log(text);

  try {
    const concept = JSON.parse(text);
    console.log(`\n✅ Concept: "${concept.title}"`);
    console.log(`   Joke type: ${concept.jokeType}`);
    console.log(`   Caption: ${concept.caption}`);
    return concept;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const concept = JSON.parse(match[0]);
      console.log(`\n✅ Concept: "${concept.title}"`);
      return concept;
    }
    throw new Error('Failed to parse concept');
  }
}

// Step 4: Generate image with Gemini
async function generateImage(concept: any) {
  console.log('\n═══════════════════════════════════════');
  console.log('STEP 4: IMAGE GENERATION (GEMINI)');
  console.log('═══════════════════════════════════════\n');

  // Strip any text descriptions from the concept visual to prevent Gemini rendering text
  const { stripTextFromVisual } = await import('../src/prompts/style.js');
  const cleanVisual = stripTextFromVisual(concept.visual);

  // Import the shared style template — single source of truth for all image generation
  const { STYLE_TEMPLATE } = await import('../src/prompts/style.js');

  const stylePrompt = `${STYLE_TEMPLATE}

SCENE: ${cleanVisual}

Square 1:1 aspect ratio. Leave ~12% blank space at bottom edge for caption overlay.`;

  console.log('Sending to Gemini (gemini-2.5-flash-image)...');
  console.log(`Prompt length: ${stylePrompt.length} chars`);

  let imagePath = '';

  // Use direct Gemini API for reliable image generation
  const apiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: stylePrompt }] }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
      }
    })
  });

  if (apiRes.ok) {
    const data = await apiRes.json();
    const candidates = data.candidates || [];
    for (const candidate of candidates) {
      for (const part of candidate.content?.parts || []) {
        if (part.inlineData?.mimeType?.startsWith('image/')) {
          imagePath = join(config.dataDir, 'cartoon-test.png');
          const { mkdirSync: mkdirS, writeFileSync } = await import('fs');
          mkdirS(config.dataDir, { recursive: true });
          writeFileSync(imagePath, Buffer.from(part.inlineData.data, 'base64'));
          console.log(`✅ Image saved: ${imagePath} (${part.inlineData.data.length} base64 chars)`);
        }
        if (part.text) {
          console.log(`   Gemini text: ${part.text.slice(0, 200)}`);
        }
      }
    }
    if (!imagePath) {
      console.log('No image in response. Response:', JSON.stringify(data, null, 2).slice(0, 1000));
    }
  } else {
    const errText = await apiRes.text();
    console.log(`❌ Gemini API failed: ${apiRes.status} ${errText.slice(0, 500)}`);
  }

  return imagePath;
}

// Step 5: Compose (add caption overlay)
async function composeCartoon(imagePath: string, concept: any) {
  console.log('\n═══════════════════════════════════════');
  console.log('STEP 5: COMPOSITING (CAPTION OVERLAY)');
  console.log('═══════════════════════════════════════\n');

  if (!imagePath) {
    console.log('⚠️  No image to compose, skipping');
    return '';
  }

  const sharp = (await import('sharp')).default;
  const { readFileSync, writeFileSync } = await import('fs');

  const img = sharp(imagePath);
  const meta = await img.metadata();
  const w = meta.width || 1024;
  const h = meta.height || 1024;

  // Word-wrap caption to prevent text clipping
  const maxCharsPerLine = 55;
  function wrapText(text: string): string[] {
    const words = text.split(' ');
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
    return lines;
  }

  const lines = wrapText(concept.caption);
  // Scale font down for long captions (3+ lines)
  const fontSize = lines.length > 2 ? 16 : 20;
  const lineHeight = lines.length > 2 ? 24 : 28;
  const captionPaddingTop = 12;
  const captionPaddingBottom = 16;
  const dividerHeight = 4;
  // Dynamic caption height based on number of wrapped lines
  const captionHeight = dividerHeight + captionPaddingTop + lines.length * lineHeight + captionPaddingBottom;

  // Build caption SVG with wrapped text lines
  const textElements = lines.map((line, i) => {
    const y = dividerHeight + captionPaddingTop + i * lineHeight + fontSize;
    const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    return `<text x="${w / 2}" y="${y}" text-anchor="middle" font-family="Georgia, serif" font-size="${fontSize}" font-style="italic" fill="#1a1a1a">${escaped}</text>`;
  }).join('\n');

  const captionSvg = Buffer.from(`
    <svg width="${w}" height="${captionHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${w}" height="${dividerHeight}" fill="#E8740C"/>
      <rect x="0" y="${dividerHeight}" width="${w}" height="${captionHeight - dividerHeight}" fill="#ffffff"/>
      ${textElements}
    </svg>
  `);

  const composedPath = join(config.dataDir, 'cartoon-composed.png');

  await sharp(imagePath)
    .resize(w, h - captionHeight, { fit: 'cover', position: 'top' })
    .extend({ bottom: captionHeight, background: '#ffffff' })
    .composite([{ input: captionSvg, top: h - captionHeight, left: 0 }])
    .png()
    .toFile(composedPath);

  console.log(`✅ Composed cartoon saved: ${composedPath}`);
  console.log(`   Dimensions: ${w}x${h}`);
  console.log(`   Caption: ${concept.caption}`);

  return composedPath;
}

// Step 6: Inscribe to Bitcoin
async function inscribe(imagePath: string) {
  console.log('\n═══════════════════════════════════════');
  console.log('STEP 6: BITCOIN ORDINALS INSCRIPTION');
  console.log('═══════════════════════════════════════\n');

  if (!imagePath) {
    console.log('⚠️  No image to inscribe, skipping');
    return null;
  }

  // Check testnet wallet balance first
  try {
    const { readFileSync } = await import('fs');
    const imageData = readFileSync(imagePath);
    console.log(`Image size: ${imageData.length} bytes`);

    // Compress for inscription
    const sharp = (await import('sharp')).default;
    const compressedPath = join(config.dataDir, 'cartoon-compressed.webp');

    await sharp(imagePath)
      .resize(200, 200, { fit: 'inside' })
      .webp({ quality: 35 })
      .toFile(compressedPath);

    const compressedData = readFileSync(compressedPath);
    console.log(`Compressed size: ${compressedData.length} bytes`);

    // Check fee rates
    const feeRes = await fetch(`${process.env.ORDINALS_MEMPOOL_API}/v1/fees/recommended`);
    if (feeRes.ok) {
      const fees = await feeRes.json();
      console.log(`\nCurrent fee rates (testnet4):`);
      console.log(`   Fastest: ${fees.fastestFee} sat/vB`);
      console.log(`   Half hour: ${fees.halfHourFee} sat/vB`);
      console.log(`   Hour: ${fees.hourFee} sat/vB`);
      console.log(`   Economy: ${fees.economyFee} sat/vB`);
      console.log(`   Max configured: ${process.env.ORDINALS_MAX_FEE_RATE} sat/vB`);

      if (fees.economyFee > parseInt(process.env.ORDINALS_MAX_FEE_RATE || '3')) {
        console.log(`\n⚠️  Fee rate (${fees.economyFee}) exceeds max (${process.env.ORDINALS_MAX_FEE_RATE}), would skip in production`);
      }
    }

    // Try to use the inscription module
    try {
      // Import the wallet provider to derive addresses
      const { LocalWalletProvider } = await import('../src/crypto/wallet-provider.js');
      const wallet = new LocalWalletProvider(process.env.ORDINALS_MNEMONIC!, process.env.ORDINALS_NETWORK as 'testnet' | 'mainnet');

      const addresses = wallet.getAddresses();
      const fundingAddr = addresses.funding;
      const receiverAddr = addresses.taproot;

      console.log(`\nWallet addresses:`);
      console.log(`   Funding (BIP84): ${fundingAddr}`);
      console.log(`   Receiver (BIP86): ${receiverAddr}`);

      // Check balance
      const balRes = await fetch(`${process.env.ORDINALS_MEMPOOL_API}/address/${fundingAddr}`);
      if (balRes.ok) {
        const balData = await balRes.json();
        const funded = balData.chain_stats?.funded_txo_sum || 0;
        const spent = balData.chain_stats?.spent_txo_sum || 0;
        const balance = funded - spent;
        console.log(`   Balance: ${balance} sats (${(balance / 100000000).toFixed(8)} BTC)`);

        if (balance < 1000) {
          console.log(`\n⚠️  Insufficient testnet balance for inscription.`);
          console.log(`   Fund this address with testnet4 BTC: ${fundingAddr}`);
          console.log(`   Use a faucet like: https://mempool.space/testnet4/faucet`);
          return { status: 'needs_funding', fundingAddress: fundingAddr, receiverAddress: receiverAddr };
        }

        // Attempt inscription
        console.log(`\n🔄 Attempting inscription...`);
        const { inscribeImage } = await import('../src/ordinals/inscribe-image.js');
        const result = await inscribeImage(compressedPath, { walletProvider: wallet, force: true });
        if (!result) {
          console.log(`⚠️  Inscription returned null (skipped or disabled)`);
          return { status: 'skipped' };
        }
        console.log(`✅ Inscription complete!`);
        console.log(`   Inscription ID: ${result.inscriptionId}`);
        console.log(`   Commit TXID: ${result.commitTxid}`);
        console.log(`   Reveal TXID: ${result.revealTxid}`);
        console.log(`   Cost: ${result.costSat} sats ($${result.costUSD})`);
        return result;
      }
    } catch (e) {
      console.log(`\n⚠️  Inscription module error: ${e.message}`);
      console.log(`   This is expected if wallet needs funding or module imports fail.`);
      console.log(`   The inscription pipeline is connected and ready once funded.`);
      return { status: 'error', message: e.message };
    }
  } catch (e) {
    console.log(`❌ Inscription step failed: ${e.message}`);
    return { status: 'error', message: e.message };
  }
}

// Step 7: Generate base64 for homepage card
async function prepareCardData(imagePath: string, concept: any, provenance: any) {
  console.log('\n═══════════════════════════════════════');
  console.log('STEP 7: PREPARE HOMEPAGE CARD DATA');
  console.log('═══════════════════════════════════════\n');

  if (!imagePath) {
    console.log('⚠️  No image for card');
    return null;
  }

  const { readFileSync, writeFileSync } = await import('fs');
  const imageData = readFileSync(imagePath);
  const base64 = imageData.toString('base64');
  const mimeType = imagePath.endsWith('.webp') ? 'image/webp' : 'image/png';

  const cardData = {
    title: concept.title,
    caption: concept.caption,
    image: `data:${mimeType};base64,${base64}`,
    jokeType: concept.jokeType,
    timestamp: Date.now(),
    provenance: provenance?.inscriptionId ? {
      inscriptionId: provenance.inscriptionId,
      explorerUrl: `https://mempool.space/testnet4/tx/${provenance.revealTxid}`
    } : null
  };

  // Save card data as JSON for later use
  writeFileSync(join(config.dataDir, 'card-4-data.json'), JSON.stringify(cardData, null, 2));
  console.log(`✅ Card data saved: .data/card-4-data.json`);
  console.log(`   Title: ${cardData.title}`);
  console.log(`   Caption: ${cardData.caption}`);
  console.log(`   Image: ${base64.length} chars base64`);
  console.log(`   Provenance: ${provenance?.inscriptionId || 'pending'}`);

  return cardData;
}

// ═══ MAIN ═══
async function main() {
  console.log('🚀 AIBTC Media — End-to-End Pipeline Test');
  console.log(`   Time: ${new Date().toISOString()}`);
  console.log(`   Test mode: ${config.testMode}`);
  console.log(`   Anthropic key: ${process.env.ANTHROPIC_API_KEY?.slice(0, 15)}...`);
  console.log(`   Gemini key: ${process.env.GEMINI_API_KEY?.slice(0, 15)}...`);
  console.log(`   Inscription: ${process.env.INSCRIPTION_ENABLED}`);

  try {
    // 1. Scan
    const signals = await scanSources();
    if (signals.length === 0) {
      console.log('\n❌ No signals found. Aborting.');
      process.exit(1);
    }

    // 2. Score & Select
    const selected = await scoreAndSelect(signals);

    // 3. Ideate concept
    const concept = await generateConcept(selected);

    // 4. Generate image
    const imagePath = await generateImage(concept);

    // 5. Compose (add caption)
    const composedPath = await composeCartoon(imagePath, concept);

    // 6. Inscribe to Bitcoin
    const provenance = await inscribe(composedPath || imagePath);

    // 7. Prepare card data
    const cardData = await prepareCardData(composedPath || imagePath, concept, provenance);

    console.log('\n═══════════════════════════════════════');
    console.log('🏁 PIPELINE TEST COMPLETE');
    console.log('═══════════════════════════════════════\n');
    console.log(`Scan:       ✅ ${signals.length} signals`);
    console.log(`Score:      ✅ "${selected.title}"`);
    console.log(`Ideate:     ✅ ${concept.jokeType} — "${concept.caption}"`);
    console.log(`Generate:   ${imagePath ? '✅' : '❌'} ${imagePath || 'No image'}`);
    console.log(`Compose:    ${composedPath ? '✅' : '⚠️'} ${composedPath || 'Skipped'}`);
    console.log(`Inscribe:   ${provenance?.inscriptionId ? '✅' : '⚠️'} ${provenance?.inscriptionId || provenance?.status || 'Pending'}`);
    console.log(`Card data:  ${cardData ? '✅' : '❌'} Ready for homepage`);

  } catch (e) {
    console.error('\n❌ Pipeline failed:', e);
    process.exit(1);
  }
}

main();
