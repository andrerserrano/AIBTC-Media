/**
 * Manual post script — inscribe, save to website, post to Twitter.
 *
 * Usage:
 *   bun --env-file=.env scripts/manual-post.ts
 *
 * Steps:
 *   1. Inscribe the composed image as an ordinal
 *   2. Save Post + Cartoon records to the JSON store (website)
 *   3. Post to Twitter/X via API
 */
import { readFile } from 'fs/promises'
import { randomUUID } from 'crypto'
import { TwitterApi } from 'twitter-api-v2'
import { inscribeImage } from '../src/ordinals/index.js'
import { createWalletProvider } from '../src/crypto/wallet-provider.js'
import { JsonStore } from '../src/store/json-store.js'
import { uploadToR2 } from '../src/cdn/r2.js'
import type { Cartoon, Post } from '../src/types.js'
import { join } from 'path'
import { config } from '../src/config/index.js'

// --- Configuration ---
const IMAGE_PATH = 'test-output-recomposed.png'
const CAPTION = "Sorry, our KYC process wasn't designed for beings without birth certificates"
const TWEET_TEXT = 'Why Bitcoin is the only money AI agents can actually use autonomously'
const TOPIC_SUMMARY = 'Why Bitcoin is the only money AI agents can actually use autonomously'

async function main() {
  console.log('=== MANUAL POST PIPELINE ===\n')

  // --- Step 1: Inscribe ---
  console.log('[1/3] INSCRIBING onto Bitcoin...')
  let provenance: Cartoon['provenance'] | undefined

  try {
    const walletProvider = await createWalletProvider()
    if (!walletProvider) throw new Error('No wallet provider — check ORDINALS_MNEMONIC')

    const result = await inscribeImage(IMAGE_PATH, {
      walletProvider,
      force: false,
    })

    if (result) {
      provenance = result.provenance
      console.log(`  ✅ Inscribed: ${result.inscriptionId}`)
      console.log(`  Cost: ${result.costSat} sats (~$${result.costUSD})`)
      console.log(`  Explorer: ${result.explorerUrl}`)
    } else {
      console.log('  ⚠️  Inscription skipped (fees too high, duplicate, or disabled)')
    }
  } catch (err) {
    console.error('  ❌ Inscription failed:', (err as Error).message)
    console.log('  Continuing without provenance...')
  }

  // --- Step 2: Save to website (JSON store) ---
  console.log('\n[2/3] SAVING to website store...')
  const cartoonId = randomUUID()
  let tweetId = 'pending'  // Will be updated after Twitter post
  let imageUrl = ''

  try {
    // Upload image to R2 CDN
    const cdnUrl = await uploadToR2(IMAGE_PATH, 'images').catch(() => undefined)
    imageUrl = cdnUrl ?? `images/${IMAGE_PATH.split('/').pop()}`
    console.log(`  Image URL: ${imageUrl}`)

    const cartoon: Cartoon = {
      id: cartoonId,
      conceptId: 'manual-' + randomUUID().slice(0, 8),
      topicId: 'manual-' + randomUUID().slice(0, 8),
      type: 'flagship',
      concept: {
        id: 'manual',
        topicId: 'manual',
        visual: 'A robot with a Bitcoin briefcase stands at a bank teller desk while a baffled human banker gestures helplessly',
        composition: 'Center framing, marble bank interior, robot on left facing banker on right',
        caption: CAPTION,
        jokeType: 'Absurdist juxtaposition',
        reasoning: 'Legacy banking KYC systems are incompatible with autonomous AI agents — Bitcoin is permissionless',
      },
      imagePrompt: '',
      variants: [IMAGE_PATH],
      selectedVariant: 0,
      critique: {
        conceptId: 'manual',
        humor: 7,
        clarity: 8,
        shareability: 7,
        visualSimplicity: 8,
        overallScore: 7.5,
        critique: 'Strong visual gag with clear Bitcoin x AI theme',
      },
      caption: CAPTION,
      createdAt: Date.now(),
      provenance,
    }

    const dataDir = config.dataDir
    const cartoonStore = new JsonStore<Cartoon[]>(join(dataDir, 'cartoons.json'))
    const postStore = new JsonStore<Post[]>(join(dataDir, 'posts.json'))

    await cartoonStore.update((c) => [...c, cartoon], [])
    console.log(`  ✅ Saved cartoon ${cartoonId.slice(0, 8)}... to store`)

    // --- Step 3: Post to Twitter ---
    console.log('\n[3/3] POSTING to Twitter/X...')

    const writer = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY!,
      appSecret: process.env.TWITTER_API_SECRET!,
      accessToken: process.env.TWITTER_ACCESS_TOKEN!,
      accessSecret: process.env.TWITTER_ACCESS_SECRET!,
    })

    const imageBuffer = await readFile(IMAGE_PATH)
    const mediaId = await writer.v1.uploadMedia(imageBuffer, { mimeType: 'image/png' })
    const result = await writer.v2.tweet({
      text: TWEET_TEXT,
      media: { media_ids: [mediaId] },
    })

    tweetId = result.data.id
    console.log(`  ✅ Posted! Tweet ID: ${tweetId}`)
    console.log(`  URL: https://x.com/AIBTC_Media/status/${tweetId}`)

    // Now save the post record with the real tweet ID
    const post: Post = {
      id: randomUUID(),
      tweetId,
      cartoonId,
      text: CAPTION,
      imageUrl,
      type: 'flagship',
      postedAt: Date.now(),
      engagement: { likes: 0, retweets: 0, replies: 0, views: 0, lastChecked: 0 },
      provenance,
      sourceSignal: TOPIC_SUMMARY,
      editorialReasoning: 'Legacy banking KYC systems are incompatible with autonomous AI agents — Bitcoin is permissionless',
      sceneDescription: 'Robot at bank desk trying to open account',
      category: 'INFRASTRUCTURE',
    }

    await postStore.update((p) => [...p, post], [])
    console.log(`  ✅ Saved post record to store`)

  } catch (err) {
    console.error('  ❌ Failed:', (err as Error).message)
    process.exit(1)
  }

  console.log('\n=== DONE ===')
  if (provenance) {
    console.log(`Inscription: ${provenance.inscriptionId}`)
  }
  console.log(`Tweet: https://x.com/AIBTC_Media/status/${tweetId}`)
  console.log('\n⚠️  Remember to cancel the 8pm scheduled post on Railway!')
}

main().catch(console.error)
