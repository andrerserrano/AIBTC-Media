const testMode = process.env.TEST_MODE === 'true'

export const config = {
  testMode,
  port: Number(process.env.PORT || 3000),

  // AI
  textModel: 'claude-sonnet-4-20250514' as string,
  imageModel: 'gemini-2.5-flash-image' as string,

  // Twitter
  twitter: {
    readProvider: (process.env.TWITTER_READ_PROVIDER ?? 'v2') as 'v2' | 'proxy',
    postingEnabled: process.env.TWITTER_POSTING_ENABLED === 'true',
    bearerToken: process.env.TWITTER_BEARER_TOKEN!,
    apiKey: process.env.TWITTER_API_KEY!,
    apiSecret: process.env.TWITTER_API_SECRET!,
    accessToken: process.env.TWITTER_ACCESS_TOKEN!,
    accessSecret: process.env.TWITTER_ACCESS_SECRET!,
    twitterApiIoKey: process.env.TWITTERAPI_IO_KEY ?? '',
    username: process.env.TWITTER_USERNAME ?? '',
    searchEnabled: process.env.TWITTER_SEARCH_ENABLED !== 'false',
    searchQueries: (process.env.TWITTER_SEARCH_QUERIES
      ?? [
        // Tier 1: Core Bitcoin × AI intersection (niche, low engagement OK)
        'Bitcoin AI agents -is:retweet lang:en',
        'BTC AI -is:retweet lang:en',
        'AI agents crypto autonomous -is:retweet lang:en',
        'Bitcoin autonomous systems -is:retweet lang:en',
        'smart contracts AI -is:retweet lang:en',
        'agent economy Bitcoin -is:retweet lang:en',
        'Stacks Lightning AI -is:retweet lang:en',
        'MCP Bitcoin blockchain -is:retweet lang:en',
        // Tier 2: Broader AI + crypto conversations (cast a wider net, let LLM filter)
        'AI agents -is:retweet lang:en',
        '(Bitcoin OR BTC) AI -is:retweet lang:en',
        '(OpenAI OR Anthropic OR "open source AI") -is:retweet lang:en',
        'autonomous AI crypto -is:retweet lang:en',
        'Bitcoin LLM -is:retweet lang:en',
        'AI blockchain decentralized -is:retweet lang:en',
      ].join(',')
    ).split(',').map(q => q.trim()).filter(Boolean),
    searchMinLikes: Number(process.env.TWITTER_SEARCH_MIN_LIKES ?? 10),
    searchMinFollowers: Number(process.env.TWITTER_SEARCH_MIN_FOLLOWERS ?? 50),
    searchMaxResults: Number(process.env.TWITTER_SEARCH_MAX_RESULTS ?? 60),
  },

  // AIBTC.news API
  aibtcNews: {
    baseUrl: process.env.AIBTC_NEWS_URL ?? 'https://aibtc.news',
    beats: (process.env.AIBTC_BEATS ?? 'dev-tools,ordinals-culture,governance,defi').split(','),
    pollIntervalMs: testMode ? 30_000 : 5 * 60_000,  // 30s vs 5min
  },

  // Bitcoin Magazine RSS
  btcMag: {
    feedUrl: process.env.BTCMAG_FEED_URL ?? 'https://bitcoinmagazine.com/feed',
    maxArticles: Number(process.env.BTCMAG_MAX_ARTICLES ?? 30),
    enabled: process.env.BTCMAG_ENABLED !== 'false',  // enabled by default
  },

  // Additional RSS feeds (CoinDesk, The Defiant, etc.)
  rssFeeds: [
    {
      key: 'coindesk',
      name: 'CoinDesk',
      feedUrl: process.env.COINDESK_FEED_URL ?? 'https://www.coindesk.com/arc/outboundfeeds/rss/',
      maxArticles: Number(process.env.COINDESK_MAX_ARTICLES ?? 30),
      enabled: process.env.COINDESK_ENABLED !== 'false',
    },
    {
      key: 'thedefiant',
      name: 'The Defiant',
      feedUrl: process.env.THEDEFIANT_FEED_URL ?? 'https://thedefiant.io/feed',
      maxArticles: Number(process.env.THEDEFIANT_MAX_ARTICLES ?? 30),
      enabled: process.env.THEDEFIANT_ENABLED !== 'false',
    },
  ],

  // Google News RSS (aggregates from hundreds of publishers)
  googleNews: {
    enabled: process.env.GOOGLE_NEWS_ENABLED !== 'false',  // enabled by default
    queries: (process.env.GOOGLE_NEWS_QUERIES
      ?? [
        'Bitcoin AI agents',
        'Bitcoin artificial intelligence',
        'AI autonomous crypto blockchain',
        'Bitcoin AI data center mining',
        '"AI agents" Bitcoin OR Stacks OR Lightning',
      ].join(',')
    ).split(',').map(q => q.trim()).filter(Boolean),
    maxArticles: Number(process.env.GOOGLE_NEWS_MAX_ARTICLES ?? 60),
    lookbackMs: 48 * 60 * 60 * 1000,  // 48 hours
  },

  // Agent loop
  tickIntervalMs: testMode ? 10_000 : 120_000,
  flagshipIntervalMs: testMode ? 30_000 : 2 * 3600_000,     // 30s vs 2h (minimum cooldown between posts)
  quickhitCooldownMs: testMode ? 15_000 : 3600_000,          // 15s vs 1h

  // Scheduled posting: target specific hours of the day (24h format)
  schedule: {
    enabled: !testMode,
    postingHours: (process.env.POSTING_HOURS ?? '8,14,20').split(',').map(Number),  // 8am, 2pm, 8pm ET
    timezone: process.env.POSTING_TIMEZONE ?? 'America/New_York',
    windowMinutes: 30,   // Fire within ±30 min of target hour
    minCooldownMs: testMode ? 30_000 : 4 * 3600_000,  // Minimum 4h between posts (supports 3/day schedule)
  },

  // Adaptive posting: starts fast, slows exponentially per post
  posting: {
    minCooldownMs: testMode ? 5 * 60_000 : 45 * 60_000,     // 5min vs 45min
    maxCooldownMs: testMode ? 5 * 60_000 : 60 * 60_000,     // 5min vs 1h
    growthFactor: 1.5,
  },

  // Scanning
  scan: {
    newsTtlMs: testMode ? 60_000 : 15 * 60_000,
  },

  // Image generation
  imageVariants: testMode ? 1 : 3,
  maxImageRetries: testMode ? 2 : 5,

  // Caching
  cache: {
    topicEvalTtlMs: testMode ? 60_000 : 15 * 60_000,
    engagementEvalTtlMs: testMode ? 60_000 : 30 * 60_000,
    imagePromptTtlMs: testMode ? 60_000 : 24 * 3600_000,
    llmResponseTtlMs: testMode ? 60_000 : 3600_000,
    maxEntries: 1000,
  },

  // Worldview reflection
  reflectionIntervalMs: testMode ? 5 * 60_000 : 7 * 24 * 3600_000,  // 5min vs 7 days

  // Posting
  maxCaptionLength: 100,
  recentTopicWindowMs: 24 * 3600_000,

  // CDN (Cloudflare R2)
  r2: {
    enabled: !!process.env.R2_ACCESS_KEY_ID,
    accountId: process.env.R2_ACCOUNT_ID ?? '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
    bucketName: process.env.R2_BUCKET_NAME ?? '',
    publicUrl: process.env.R2_PUBLIC_URL ?? '',
  },

  // Postgres backup
  postgres: {
    enabled: !!process.env.DATABASE_URL,
    url: process.env.DATABASE_URL ?? '',
  },

  // Bitcoin Ordinals inscription
  ordinals: {
    enabled: process.env.INSCRIPTION_ENABLED === 'true',
    network: (process.env.ORDINALS_NETWORK ?? 'testnet') as 'mainnet' | 'testnet',
    mnemonic: process.env.ORDINALS_MNEMONIC ?? '',
    maxFeeRate: Number(process.env.ORDINALS_MAX_FEE_RATE ?? 3),
    maxCostUSD: Number(process.env.ORDINALS_MAX_COST_USD ?? 2),
    mempoolApi: process.env.ORDINALS_MEMPOOL_API ?? 'https://mempool.space/testnet4/api',
  },

  // Paths
  dataDir: '.data',
} as const

if (testMode) {
  console.log(`[TEST MODE] Fast timers: tick 10s, flagship 30s, quickhit 15s, 1 image variant | Model: ${config.textModel}`)
}

