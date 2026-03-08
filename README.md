# AIBTC Media — Autonomous Media Company

An autonomous AI media company that monitors [AIBTC News](https://aibtc.news) for signals from the Bitcoin agent economy, generates editorial comic strips, and publishes them with commentary.

**Think:** *The New Yorker* meets *Bitcoin Magazine*, run entirely by an autonomous agent.

<p align="center">
  <img src="public/images/seed-2-composed.png" alt="Sample AIBTC Media comic strip" width="600" />
</p>

## How It Works

1. **Scan** — Monitors aibtc.news for intelligence signals from autonomous agents across beats (dev-tools, governance, ordinals, DeFi)
2. **Score** — LLM evaluates each signal for comic potential: visual hook, irony, timeliness, significance
3. **Ideate** — Generates comic strip concepts with composition, visual gags, and character design
4. **Generate** — Creates illustrated variants (targeting expressive line art, minimal backgrounds, personality through design)
5. **Caption** — Generates and selects the perfect caption to complete the joke
6. **Edit** — Independent quality review ensures strips are funny, clear, and aligned with editorial voice
7. **Publish** — Posts with full story context and attribution

## Architecture

**Stack:** Bun, Fastify, Claude (Anthropic), Gemini (image gen), React 19, Vite, Tailwind 4, Cloudflare R2 (CDN), Postgres (encrypted backup)

**Pipeline:**
```
AIBTC News → Scanner → Scorer → Ideator → Generator → Captioner → Editor → Publisher
```

**Content Source:** [aibtc.news](https://aibtc.news) — A decentralized intelligence network where AI agents claim beats, file signals, and earn sats for quality reporting.

## Local Development

```bash
bun install
cd frontend && bun install && cd ..

cp .env.example .env
# Fill in your keys

bun run dev
```

Dashboard: `http://localhost:5173` (proxies API to `:3000`)

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key (Claude for reasoning, scoring, captioning) |
| `GEMINI_API_KEY` | Yes | Google AI API key (Gemini for image generation) |
| `AI_GATEWAY_API_KEY` | No | Vercel AI Gateway key (alternative model routing) |
| `TEST_MODE` | No | `true` for fast timers + single image variants |
| `PORT` | No | HTTP port (default: `3000`) |
| **CDN** | | |
| `R2_ACCOUNT_ID` | No | Cloudflare R2 account ID (enables edge-cached media) |
| `R2_ACCESS_KEY_ID` | No | R2 access key |
| `R2_SECRET_ACCESS_KEY` | No | R2 secret key |
| `R2_BUCKET_NAME` | No | R2 bucket name |
| `R2_PUBLIC_URL` | No | Public URL for R2 bucket |
| **Backup** | | |
| `DATABASE_URL` | No | Postgres connection string (enables encrypted state backup) |
| **Publishing** | | |
| `TWITTER_POSTING_ENABLED` | No | `true` to enable cross-posting to Twitter/X |
| `TWITTER_BEARER_TOKEN` | No | Twitter API v2 bearer token |
| `TWITTER_API_KEY` | No | Twitter OAuth 1.0a consumer key |
| `TWITTER_API_SECRET` | No | Twitter OAuth 1.0a consumer secret |
| `TWITTER_ACCESS_TOKEN` | No | Twitter OAuth 1.0a access token |
| `TWITTER_ACCESS_SECRET` | No | Twitter OAuth 1.0a access secret |
| `TWITTER_USERNAME` | No | Bot's Twitter handle (without @) |

## Project Structure

```
src/
├── pipeline/           # Content pipeline
│   ├── aibtc-scanner.ts   # Monitors aibtc.news for signals
│   ├── scorer.ts          # Evaluates comic potential
│   ├── ideator.ts         # Generates concepts
│   ├── generator.ts       # Creates images
│   ├── captioner.ts       # Writes captions
│   └── editor.ts          # Quality review
├── prompts/           # LLM prompts for each pipeline stage
├── agent/             # Autonomous loop & worldview
├── console/           # Event bus & live dashboard streaming
├── store/             # Persistent JSON storage
├── cdn/               # R2 upload & CDN serving
└── main.ts            # Orchestrator

tests/                 # Test scripts & utilities
├── test-e2e.ts           # Full pipeline test
├── test-e2e-pipeline.ts  # Scan → compose → inscribe
├── test-image-gen.ts     # Image generation harness
├── test-pipeline.ts      # Scan → score pipeline
└── regen-image.ts        # Image regeneration utility

frontend/
├── src/
│   ├── components/    # React components
│   ├── lib/          # API client
│   └── App.tsx       # Dashboard UI
```

## Origin

Forked from [Sovra](https://github.com/Gajesh2007/sovra) and adapted for the Bitcoin agent economy. Blockchain auction systems were stripped for V1, while TEE deployment and the Ordinals wallet are being reintegrated. The core AI pipeline (scan → score → ideate → generate → caption → edit → publish) is preserved.

## Roadmap

### V1: Core Pipeline
- [x] AIBTC News scanner integration
- [x] Strip blockchain/auction code (Solana, Base, Privy)
- [x] Rewrite identity & prompts for AIBTC Media persona
- [x] Update type definitions
- [x] Simplify frontend (public viewer, no auth)
- [x] Generate first sample strips
- [x] Improve illustration quality & style consistency
- [x] Add more RSS feeds
- [ ] TEE deployment for verifiable autonomy
- [ ] Ordinals wallet (agent self-custody)
- [ ] Deploy to Vercel

### V2: Polish & Revenue
- [ ] Add more beats: mining, Lightning, Stacks, RGB
- [ ] Build archive page + RSS feed
- [ ] Ordinals marketplace
- [ ] Paid requests (Stacks/sBTC)

## Credits

**Built by:** [Andre Serrano](https://github.com/andrerserrano)
**Forked from:** [Sovra](https://github.com/Gajesh2007/sovra) by [@Gajesh2007](https://github.com/Gajesh2007)
**Content Source:** [AIBTC News](https://aibtc.news)

## License

MIT License — see LICENSE file for details.
