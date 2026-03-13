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
import { TweetTextWriter } from './pipeline/tweet-text-writer.js'
import { TwitterClient } from './twitter/client.js'
import { TwitterV2Reader } from './twitter/twitterapi-v2.js'
import type { TwitterReadProvider } from './twitter/provider.js'
import { EngagementLoop } from './twitter/engagement.js'
import { Editor } from './pipeline/editor.js'
import { Composer } from './pipeline/composer.js'
import { Inscriber } from './pipeline/inscriber.js'
import { QuoteTweetResolver } from './pipeline/quote-tweet-resolver.js'
import { createWalletProvider, type WalletProvider } from './crypto/wallet-provider.js'
import { ContentSigner } from './crypto/content-signer.js'
import { AgentLoop } from './agent/loop.js'
import { WorldviewStore } from './agent/worldview.js'
import { BackupStore } from './store/backup.js'
import { toCdnUrl, uploadBufferToR2, migratePostsToCdn } from './cdn/r2.js'
import type { Cartoon, Post, Signal } from './types.js'
import { withTimeout, SCAN_TIMEOUT_MS } from './utils/timeout.js'

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

  // Cap AIBTC signals to prevent one prolific source from overwhelming the pool.
  // AIBTC.news fetches 5 beats in parallel, each returning up to 20 items — that's
  // up to 100 signals per scan. Cap to a sane default so other sources get a fair shake.
  const aibtcSignalCap = Number(process.env.AIBTC_SIGNAL_CAP ?? 10) || 10

  // Combined scanner that merges signals from all sources.
  // Each scanner is individually wrapped with SCAN_TIMEOUT_MS so a single
  // hung scanner can't block the tick — and scanners that finish in time
  // still contribute their signals even if another one times out.
  const scanner = {
    async scan(): Promise<Signal[]> {
      const results = await Promise.allSettled([
        withTimeout(aibtcScanner.scan(), SCAN_TIMEOUT_MS, 'AIBTC scanner')
          .then(signals => signals.slice(0, aibtcSignalCap)),
        withTimeout(
          btcMagScanner ? btcMagScanner.scan() : Promise.resolve([]),
          SCAN_TIMEOUT_MS,
          'BTC Mag scanner',
        ),
        ...rssScanners.map((s) =>
          withTimeout(s.scan(), SCAN_TIMEOUT_MS, `${s.constructor.name} scanner`),
        ),
        withTimeout(
          twitterScanner ? twitterScanner.scan() : Promise.resolve([]),
          SCAN_TIMEOUT_MS,
          'Twitter scanner',
        ),
      ])

      const signals: Signal[] = []
      for (const result of results) {
        if (result.status === 'fulfilled') {
          signals.push(...result.value)
        } else {
          console.error(`[scanner] Scanner failed: ${result.reason}`)
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
  const tweetTextWriter = new TweetTextWriter(events)
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

  // --- Quote-tweet resolver ---
  const quoteTweetResolver = new QuoteTweetResolver(twitter, events)

  // --- Agent loop ---
  const agent = new AgentLoop(
    events, scanner, scorer, ideator, generator, captioner, tweetTextWriter,
    twitter, engagement, editor, composer, inscriber, quoteTweetResolver, stores, worldview,
  )

  // --- HTTP server ---
  const app = Fastify({ logger: false })

  await app.register(import('@fastify/static'), {
    root: join(process.cwd(), 'public'),
    prefix: '/',
    setHeaders: (res, path) => {
      // Cache images aggressively — cartoon content never changes once published
      if (/\.(png|webp|jpg|jpeg|gif|svg|ico)$/i.test(path)) {
        res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400')
      }
    },
  })

  registerConsoleRoutes(app, events)

  app.get('/api/health', async () => ({
    status: 'alive',
    state: events.state,
    uptime: process.uptime(),
  }))

  let feedCache: { data: unknown; ts: number } | null = null
  let rssCache: { xml: string; ts: number } | null = null
  const FEED_CACHE_TTL = 10_000
  const RSS_CACHE_TTL = 60_000

  function escapeXml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  }

  /** Convert a possibly-relative image path to an absolute URL for RSS */
  function toAbsoluteUrl(path: string): string {
    if (path.startsWith('https://') || path.startsWith('http://')) return path
    return `https://aibtc.media${path.startsWith('/') ? '' : '/'}${path}`
  }

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
      // Prefer full-image inscription, fall back to content hash inscription
      let provenanceUrl: string | null = null
      if (p.provenance?.inscriptionId) {
        provenanceUrl = `https://ordinals.com/inscription/${p.provenance.inscriptionId}`
      } else if (p.contentHashProvenance?.inscriptionId) {
        provenanceUrl = `https://ordinals.com/inscription/${p.contentHashProvenance.inscriptionId}`
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
        sourceUrls: p.sourceUrls ?? [],
        editorialReasoning: editorialReasoning ?? null,
        category: category ?? null,
        inscriptionId: p.provenance?.inscriptionId ?? p.contentHashProvenance?.inscriptionId ?? null,
        contentHash: p.contentHashProvenance?.contentHash ?? null,
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
    rssCache = null
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
    rssCache = null
    return { success: true, post: allPosts[idx] }
  })

  app.get('/api/worldview', async () => worldview.getForFrontend())

  const rejectedCartoonsStore = new JsonStore<Array<{ caption: string; imageUrl: string; reason: string; rejectedAt: number }>>(join(config.dataDir, 'rejected-cartoons.json'))

  app.get('/api/feed/rejected', async () => {
    const rejected = (await rejectedCartoonsStore.read()) ?? []
    return rejected.sort((a, b) => b.rejectedAt - a.rejectedAt)
  })

  // --- RSS 2.0 feed ---
  app.get('/rss.xml', async (_request, reply) => {
    if (rssCache && Date.now() - rssCache.ts < RSS_CACHE_TTL) {
      reply.type('application/rss+xml; charset=utf-8')
      return rssCache.xml
    }

    const allPosts = (await stores.posts.read()) ?? []
    const allCartoons = (await stores.cartoons.read()) ?? []
    const sorted = allPosts
      .filter(p => p.imageUrl)
      .sort((a, b) => b.postedAt - a.postedAt)
      .slice(0, 50)

    const items: string[] = []

    for (const p of sorted) {
      const imagePath = await resolveMediaUrl(p.imageUrl, 'images')
      if (!imagePath) continue

      const imageAbsolute = toAbsoluteUrl(imagePath)
      const tweetLink = p.tweetId
        ? `https://x.com/aibtc_media/status/${p.tweetId}`
        : 'https://aibtc.media'
      const pubDate = new Date(p.postedAt).toUTCString()

      // Fall back to cartoon reasoning for older posts missing editorialReasoning
      let description = p.editorialReasoning
      if (!description && p.cartoonId) {
        const cartoon = allCartoons.find(c => c.id === p.cartoonId)
        if (cartoon?.concept) description = cartoon.concept.reasoning
      }
      description = description ?? p.text

      items.push(`    <item>
      <title>${escapeXml(p.text)}</title>
      <link>${escapeXml(tweetLink)}</link>
      <guid isPermaLink="false">${escapeXml(p.id)}</guid>
      <pubDate>${pubDate}</pubDate>
      <description><![CDATA[${description.replace(/]]>/g, ']]]]><![CDATA[>')}]]></description>${p.category ? `\n      <category>${escapeXml(p.category)}</category>` : ''}
      <media:content url="${escapeXml(imageAbsolute)}" type="image/png" medium="image"/>
      <media:thumbnail url="${escapeXml(imageAbsolute)}"/>
    </item>`)
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>AIBTC Media</title>
    <link>https://aibtc.media</link>
    <description>Autonomous AI editorial cartoons covering the Bitcoin agent economy</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="https://aibtc.media/rss.xml" rel="self" type="application/rss+xml"/>
${items.join('\n')}
  </channel>
</rss>`

    rssCache = { xml, ts: Date.now() }
    reply.type('application/rss+xml; charset=utf-8')
    return xml
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
    setHeaders: (res) => {
      // Cartoons are content-addressed and immutable once generated
      res.setHeader('Cache-Control', 'public, max-age=2592000, immutable')
    },
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

