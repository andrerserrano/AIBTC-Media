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

  // --- Twitter read provider ---
  const { TwitterApi } = await import('twitter-api-v2')
  const oauth = new TwitterApi({
    appKey: config.twitter.apiKey,
    appSecret: config.twitter.apiSecret,
    accessToken: config.twitter.accessToken,
    accessSecret: config.twitter.accessSecret,
  })
  const readProvider: TwitterReadProvider = new TwitterV2Reader(config.twitter.bearerToken, oauth)

  const twitter = new TwitterClient(events, readProvider)

  // --- Worldview ---
  const worldview = new WorldviewStore(events, join(config.dataDir, 'worldview.json'))
  await worldview.init()

  // --- Pipeline (dual-source: AIBTC.news + Bitcoin Magazine RSS) ---
  const aibtcScanner = new AIBTCScanner(events, signalCache)
  const btcMagScanner = config.btcMag.enabled ? new BTCMagScanner(events, signalCache) : null

  // Combined scanner that merges signals from both sources
  const scanner = {
    async scan(): Promise<Signal[]> {
      const results = await Promise.allSettled([
        aibtcScanner.scan(),
        btcMagScanner ? btcMagScanner.scan() : Promise.resolve([]),
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
      return aibtcScanner.bufferSize + (btcMagScanner?.bufferSize ?? 0)
    },
  }

  const scorer = new Scorer(events, evalCache)
  const ideator = new Ideator(events, worldview)
  const generator = new Generator(events, imageCache, readProvider)
  await generator.init()
  const captioner = new Captioner(events)
  const editor = new Editor(events)
  const composer = new Composer(events, generator)

  // --- Engagement ---
  const engagement = new EngagementLoop(events, twitter, stores.posts)
  await engagement.init()

  // --- Agent loop ---
  const agent = new AgentLoop(
    events, scanner, scorer, ideator, generator, captioner,
    twitter, engagement, editor, composer, stores, worldview,
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
    const sorted = allPosts.filter(p => p.imageUrl).sort((a, b) => b.postedAt - a.postedAt)

    const data = await Promise.all(sorted.map(async p => {
      const imagePath = await resolveMediaUrl(p.imageUrl, 'images')
      return imagePath ? {
        id: p.id,
        tweetId: p.tweetId,
        text: p.text,
        imagePath,
        quotedTweetId: p.quotedTweetId,
        createdAt: p.postedAt,
      } : null
    }))

    const filtered = data.filter(Boolean)
    feedCache = { data: filtered, ts: Date.now() }
    return filtered
  })

  app.get('/api/worldview', async () => worldview.getForFrontend())

  const rejectedCartoonsStore = new JsonStore<Array<{ caption: string; imageUrl: string; reason: string; rejectedAt: number }>>(join(config.dataDir, 'rejected-cartoons.json'))

  app.get('/api/feed/rejected', async () => {
    const rejected = (await rejectedCartoonsStore.read()) ?? []
    return rejected.sort((a, b) => b.rejectedAt - a.rejectedAt)
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
