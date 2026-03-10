// Map GEMINI_API_KEY → GOOGLE_GENERATIVE_AI_API_KEY for @ai-sdk/google
if (process.env.GEMINI_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = process.env.GEMINI_API_KEY
}

import Fastify from 'fastify'
import { join } from 'path'
import { mkdir } from 'fs/promises'
import { config } from './config/index.js'
import { EventBus } from './console/events.js'
import { registerConsoleRoutes } from './console/stream.js'
import { Cache } from './cache/cache.js'
import { JsonStore } from './store/json-store.js'
import { AIBTCScanner } from './pipeline/aibtc-scanner.js'
import { BTCMagScanner } from './pipeline/btcmag-scanner.js'
import { RSSScanner } from './pipeline/rss-scanner.js'
import { TwitterScanner } from './pipeline/twitter-scanner.js'
import { Scorer } from './pipeline/scorer.js'
import { Ideator } from './pipeline/ideator.js'
import { Generator } from './pipeline/generator.js'
import { Captioner } from './pipeline/captioner.js'
import { TwitterClient } from './twitter/client.js'
import { TwitterV2Reader } from './twitter/twitterapi-v2.js'
import type { TwitterReadProvider } from './twitter/provider.js'
import { EngagementLoop } from './twitter/engagement.js'
import { Editor } from './pipeline/editor.js'
import { Composer } from './pipeline/composer.js'
import { Inscriber } from './pipeline/inscriber.js'
import { createWalletProvider, type WalletProvider } from './crypto/wallet-provider.js'
import { ContentSigner } from './crypto/content-signer.js'
import { AgentLoop } from './agent/loop.js'
import { WorldviewStore } from './agent/worldview.js'
import { BackupStore } from './store/backup.js'
import { toCdnUrl, uploadBufferToR2, migratePostsToCdn } from './cdn/r2.js'
import type { Cartoon, Post, Signal } from './types.js'

async function main() {
  // --- Restore from Postgres backup if available ---
  let backup: BackupStore | null = null
  if (config.postgres.enabled) {
    backup = new BackupStore(config.postgres.url, process.env.BACKUP_SECRET ?? 'aibtc-studio-default-key')
    await backup.init()
    const restored = await backup.restoreAll(config.dataDir)
    if (restored > 0) {
      console.log(`Restored ${restored} files from Postgres backup`)
    }
  }

  // --- Event bus ---
  const events = new EventBus(join(config.dataDir, 'events.jsonl'))
  await events.init()

  // --- Caches ---
  const signalCache = new Cache<Signal[]>('signals', 200, join(config.dataDir, 'cache-signals.json'))
  const evalCache = new Cache('eval', config.cache.maxEntries, join(config.dataDir, 'cache-eval.json'))
  const imageCache = new Cache('images', 100, join(config.dataDir, 'cache-images.json'))
  await Promise.all([signalCache.restore(), evalCache.restore(), imageCache.restore()])

  // --- Stores ---
  const stores = {
    cartoons: new JsonStore<Cartoon[]>(join(config.dataDir, 'cartoons.json')),
    posts: new JsonStore<Post[]>(join(config.dataDir, 'posts.json')),
  }

  // --- Twitter read provider (only if credentials are available) ---
  let readProvider: TwitterReadProvider | null = null
  const hasTwitterCreds = config.twitter.apiKey && config.twitter.apiSecret
  if (hasTwitterCreds) {
    const { TwitterApi } = await import('twitter-api-v2')
    const oauth = new TwitterApi({
      appKey: config.twitter.apiKey,
      appSecret: config.twitter.apiSecret,
      accessToken: config.twitter.accessToken,
      accessSecret: config.twitter.accessSecret,
    })
    readProvider = new TwitterV2Reader(config.twitter.bearerToken, oauth)
  } else {
    console.log('[twitter] No API credentials configured — running in local-only mode')
  }

  const twitter = new TwitterClient(events, readProvider)

  // --- Worldview ---
  const worldview = new WorldviewStore(events, join(config.dataDir, 'worldview.json'))
  await worldview.init()

  // --- Pipeline (multi-source: AIBTC.news + Bitcoin Magazine + CoinDesk + The Defiant) ---
  const aibtcScanner = new AIBTCScanner(events, signalCache)
  const btcMagScanner = config.btcMag.enabled ? new BTCMagScanner(events, signalCache) : null

  // Additional RSS feed scanners (CoinDesk, The Defiant, etc.)
  const rssScanners = config.rssFeeds
    .filter((feed) => feed.enabled)
    .map((feed) => new RSSScanner(feed, events, signalCache))

  if (rssScanners.length > 0) {
    console.log(`[scanners] ${rssScanners.length} additional RSS feeds enabled: ${config.rssFeeds.filter(f => f.enabled).map(f => f.name).join(', ')}`)
  }

  // Twitter search scanner (X as signal source)
  const twitterScanner = config.twitter.searchEnabled && readProvider
    ? new TwitterScanner(events, signalCache, readProvider)
    : null

  if (twitterScanner) {
    console.log(`[scanners] Twitter search enabled with ${config.twitter.searchQueries.length} queries`)
  }

  // Combined scanner that merges signals from all sources
  const scanner = {
    async scan(): Promise<Signal[]> {
      const results = await Promise.allSettled([
        aibtcScanner.scan(),
        btcMagScanner ? btcMagScanner.scan() : Promise.resolve([]),
        ...rssScanners.map((s) => s.scan()),
        twitterScanner ? twitterScanner.scan() : Promise.resolve([]),
      ])

      const signals: Signal[] = []
      for (const result of results) {
        if (result.status === 'fulfilled') {
          signals.push(...result.value)
        }
      }

      return signals
    },
    get bufferSize(): number {
      return (
        aibtcScanner.bufferSize +
        (btcMagScanner?.bufferSize ?? 0) +
        rssScanners.reduce((sum, s) => sum + s.bufferSize, 0) +
        (twitterScanner?.bufferSize ?? 0)
      )
    },
  }

  const scorer = new Scorer(events, evalCache)
  const ideator = new Ideator(events, worldview)
  const generator = new Generator(events, imageCache, readProvider ?? undefined)
  await generator.init()
  const captioner = new Captioner(events)
  const editor = new Editor(events)
  const composer = new Composer(events, generator)

  // --- Secure wallet provider (local dev or TEE enclave) ---
  let walletProvider: WalletProvider | undefined
  let contentSigner: ContentSigner | undefined

  if (config.ordinals.enabled && config.ordinals.mnemonic) {
    try {
      walletProvider = createWalletProvider({
        mnemonic: config.ordinals.mnemonic,
        network: config.ordinals.network,
      })
      const addresses = walletProvider.getAddresses()
      console.log(`[wallet] Mode: ${walletProvider.mode}`)
      console.log(`[wallet] Funding address: ${addresses.funding}`)
      console.log(`[wallet] Taproot address: ${addresses.taproot}`)

      // Content signer for ECDSA signatures on editorial content
      contentSigner = new ContentSigner(config.ordinals.mnemonic, config.ordinals.network)
      console.log(`[wallet] Content signer: ${contentSigner.address}`)
    } catch (err) {
      console.error('[wallet] Failed to initialize:', (err as Error).message)
    }
  }

  const inscriber = new Inscriber(events, walletProvider)

  // --- Engagement ---
  const engagement = new EngagementLoop(events, twitter, stores.posts)
  await engagement.init()

  // --- Agent loop ---
  const agent = new AgentLoop(
    events, scanner, scorer, ideator, generator, captioner,
    twitter, engagement, editor, composer, inscriber, stores, worldview,
  )

  // --- HTTP server ---
  const app = Fastify({ logger: false })

  await app.register(import('@fastify/static'), {
    root: join(process.cwd(), 'public'),
    prefix: '/',
  })

  registerConsoleRoutes(app, events)

  app.get('/api/health', async () => ({
    status: 'alive',
    state: events.state,
    uptime: process.uptime(),
  }))

  let feedCache: { data: unknown; ts: number } | null = null
  const FEED_CACHE_TTL = 10_000

  async function resolveMediaUrl(url: string | undefined | null, prefix: 'images' | 'videos'): Promise<string | null> {
    if (!url) return null
    if (url.startsWith('https://')) return url
    const filename = url.split('/').pop() ?? ''
    const localPath = join(config.dataDir, prefix, filename)
    try { await import('fs/promises').then(fs => fs.access(localPath)); return `/${prefix}/${filename}` } catch {}
    if (config.r2.enabled) return `${config.r2.publicUrl}/${prefix}/${filename}`
    return null
  }

  app.get('/api/feed', async () => {
    if (feedCache && Date.now() - feedCache.ts < FEED_CACHE_TTL) return feedCache.data

    const allPosts = (await stores.posts.read()) ?? []
    const allCartoons = (await stores.cartoons.read()) ?? []
    const sorted = allPosts.filter(p => p.imageUrl).sort((a, b) => b.postedAt - a.postedAt)

    const data = await Promise.all(sorted.map(async p => {
      const imagePath = await resolveMediaUrl(p.imageUrl, 'images')
      if (!imagePath) return null

      // Build provenance URL from inscription data
      let provenanceUrl: string | null = null
      if (p.provenance?.inscriptionId) {
        provenanceUrl = `https://ordinals.com/inscription/${p.provenance.inscriptionId}`
      }

      // Use metadata from Post directly (new posts), or fall back to Cartoon lookup (old posts)
      let sourceSignal = p.sourceSignal
      let editorialReasoning = p.editorialReasoning
      let category = p.category

      if (!sourceSignal && p.cartoonId) {
        const cartoon = allCartoons.find(c => c.id === p.cartoonId)
        if (cartoon?.concept) {
          editorialReasoning = editorialReasoning ?? cartoon.concept.reasoning
        }
      }

      return {
        id: p.id,
        tweetId: p.tweetId,
        text: p.text,
        imagePath,
        quotedTweetId: p.quotedTweetId,
        createdAt: p.postedAt,
        provenance: p.provenance ?? null,
        provenanceUrl,
        sourceSignal: sourceSignal ?? null,
        editorialReasoning: editorialReasoning ?? null,
        category: category ?? null,
        inscriptionId: p.provenance?.inscriptionId ?? null,
      }
    }))

    const filtered = data.filter(Boolean)
    feedCache = { data: filtered, ts: Date.now() }
    return filtered
  })

  // Admin: delete a post by ID (requires ADMIN_KEY env var)
  app.delete('/api/feed/:postId', async (request, reply) => {
    const adminKey = process.env.ADMIN_KEY
    const auth = request.headers.authorization
    if (!adminKey || auth !== `Bearer ${adminKey}`) {
      reply.status(401)
      return { error: 'Unauthorized' }
    }
    const { postId } = request.params as { postId: string }
    const allPosts = (await stores.posts.read()) ?? []
    const filtered = allPosts.filter(p => p.id !== postId)
    if (filtered.length === allPosts.length) {
      reply.status(404)
      return { error: 'Post not found' }
    }
    await stores.posts.update(() => filtered, [])
    feedCache = null  // bust cache
    return { success: true, remaining: filtered.length }
  })

  // Admin: patch a post's text by ID (requires ADMIN_KEY env var)
  app.patch('/api/feed/:postId', async (request, reply) => {
    const adminKey = process.env.ADMIN_KEY
    const auth = request.headers.authorization
    if (!adminKey || auth !== `Bearer ${adminKey}`) {
      reply.status(401)
      return { error: 'Unauthorized' }
    }
    const { postId } = request.params as { postId: string }
    const { text } = request.body as { text?: string }
    if (!text) {
      reply.status(400)
      return { error: 'Missing "text" in request body' }
    }
    const allPosts = (await stores.posts.read()) ?? []
    const idx = allPosts.findIndex(p => p.id === postId)
    if (idx === -1) {
      reply.status(404)
      return { error: 'Post not found' }
    }
    allPosts[idx] = { ...allPosts[idx], text }
    await stores.posts.write(allPosts)
    feedCache = null  // bust cache
    return { success: true, post: allPosts[idx] }
  })

  app.get('/api/worldview', async () => worldview.getForFrontend())

  const rejectedCartoonsStore = new JsonStore<Array<{ caption: string; imageUrl: string; reason: string; rejectedAt: number }>>(join(config.dataDir, 'rejected-cartoons.json'))

  app.get('/api/feed/rejected', async () => {
    const rejected = (await rejectedCartoonsStore.read()) ?? []
    return rejected.sort((a, b) => b.rejectedAt - a.rejectedAt)
  })

  // Newsletter subscription — proxies to Beehiiv API (requires BEEHIIV_API_KEY on Scale plan)
  // Currently disabled: using beehiiv's hosted subscribe page directly from frontend instead.
  // Uncomment and add BEEHIIV_API_KEY to .env if you upgrade to beehiiv Scale plan.
  /*
  app.post('/api/subscribe', async (request, reply) => {
    const { email } = request.body as { email?: string }
    if (!email || !email.includes('@')) {
      reply.status(400)
      return { error: 'Valid email required' }
    }

    const beehiivApiKey = process.env.BEEHIIV_API_KEY
    const beehiivPubId = process.env.BEEHIIV_PUBLICATION_ID ?? 'eeaf3bbf-0bdd-4c52-8d41-4820ac2e2d6f'

    if (!beehiivApiKey) {
      reply.status(500)
      return { error: 'Newsletter service not configured' }
    }

    try {
      const res = await fetch(`https://api.beehiiv.com/v2/publications/${beehiivPubId}/subscriptions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${beehiivApiKey}`,
        },
        body: JSON.stringify({
          email,
          reactivate_existing: true,
          send_welcome_email: true,
        }),
      })

      if (!res.ok) {
        const err = await res.text()
        console.error('Beehiiv subscription error:', err)
        reply.status(res.status)
        return { error: 'Subscription failed' }
      }

      return { success: true }
    } catch (err) {
      console.error('Beehiiv subscription error:', err)
      reply.status(500)
      return { error: 'Subscription failed' }
    }
  })
  */

  // Admin: manually trigger a flagship posting cycle
  app.post('/api/admin/trigger', async (request, reply) => {
    const adminKey = process.env.ADMIN_KEY
    const auth = request.headers.authorization
    if (!adminKey || auth !== `Bearer ${adminKey}`) {
      reply.status(401)
      return { error: 'Unauthorized' }
    }
    const result = await agent.triggerFlagship()
    return result
  })

  // Ensure media directories exist before registering static routes
  const imagesDir = join(process.cwd(), config.dataDir, 'images')
  await mkdir(imagesDir, { recursive: true })

  // Serve generated images from .data/images/
  await app.register(import('@fastify/static'), {
    root: imagesDir,
    prefix: '/images/',
    decorateReply: false,
  })

  // Start
  await app.listen({ port: config.port, host: '0.0.0.0' })
  console.log(`AIBTC Media dashboard: http://localhost:${config.port}`)
  console.log(`Console stream: http://localhost:${config.port}/api/console/stream`)

  agent.start()

  // Migrate old posts to R2 CDN (background, non-blocking)
  migratePostsToCdn(stores.posts).catch(err =>
    console.error('[r2] Migration failed:', (err as Error).message),
  )

  // Periodic backup to Postgres (every 1 min)
  if (backup) {
    const backupInterval = setInterval(async () => {
      try {
        const count = await backup!.backupAll(config.dataDir)
        if (count > 0) console.log(`[backup] Backed up ${count} files to Postgres`)
      } catch (err) {
        console.error('[backup] Failed:', (err as Error).message)
      }
    }, 60_000)

    process.on('beforeExit', () => clearInterval(backupInterval))
  }

  const shutdown = async () => {
    console.log('Shutting down...')
    agent.stop()
    // Securely wipe key material from memory
    walletProvider?.destroy()
    contentSigner?.destroy()
    await Promise.all([signalCache.persist(), evalCache.persist(), imageCache.persist()])
    if (backup) {
      const count = await backup.backupAll(config.dataDir)
      console.log(`[backup] Final backup: ${count} files to Postgres`)
      await backup.close()
    }
    await app.close()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
