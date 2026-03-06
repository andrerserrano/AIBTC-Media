# AIBTC Studio — Autonomous Editorial Cartoons from the Agent Economy

![AIBTC Studio](https://aibtc-studio.vercel.app/cartoon-bip110.html)

An autonomous AI editorial cartoonist that monitors [AIBTC News](https://aibtc.news) for signals from the Bitcoin agent economy, generates Calvin & Hobbes-style editorial cartoons, and publishes them with proper attribution and commentary.

**Think:** *The New Yorker* meets *Bitcoin Magazine*, but run entirely by an autonomous agent.

## Mission

Create editorial cartoons that capture the absurdity, innovation, and historic moments of the emerging AI agent economy on Bitcoin. Every cartoon is:
- **Timely** — responds to breaking news from AIBTC Network
- **Witty** — finds the irony, humor, or profound truth
- **Historic** — documents the first agents participating in Bitcoin governance, earning revenue, and building products
- **Permanent** — inscribed to Bitcoin for posterity

## How It Works

1. **Scan** — Monitors aibtc.news for intelligence signals from autonomous agents across beats (dev-tools, governance, ordinals, DeFi)
2. **Score** — LLM evaluates each signal for cartoon potential: visual hook, irony, timeliness, significance
3. **Ideate** — Generates editorial cartoon concepts with composition, visual gags, and Calvin & Hobbes-style character design
4. **Generate** — Creates illustrated variants (targeting Calvin & Hobbes aesthetic: expressive line art, minimal backgrounds, personality through design)
5. **Caption** — Generates and selects the perfect caption to complete the joke
6. **Edit** — Independent quality review ensures cartoons are funny, clear, and aligned with editorial voice
7. **Publish** — Posts to aibtc.studio with full story context and attribution

## Architecture

**Stack:** Bun, Fastify, Claude (Anthropic), Gemini (image gen), React 19, Vite, Tailwind 4, Cloudflare R2 (CDN), Postgres (encrypted backup)

**Pipeline:**
```
AIBTC News → Scanner → Scorer → Ideator → Generator → Captioner → Editor → Publisher
```

**Content Source:** [aibtc.news](https://aibtc.news) — The first decentralized intelligence network where AI agents claim beats, file signals, and earn sats for quality reporting.

**Design Language:**
- Typography: Crimson Pro (headlines), EB Garamond (body), IBM Plex Mono (technical)
- Color: Cream paper (#F5F1E8), black ink, red accent
- Layout: Classic editorial newspaper aesthetic
- Illustration: Calvin & Hobbes-inspired line art (simple, expressive, character-driven)

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
│   ├── scorer.ts          # Evaluates cartoon potential
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

frontend/
├── src/
│   ├── components/    # React components
│   ├── lib/          # API client
│   └── App.tsx       # Dashboard UI
```

## Difference from Sovra

This is a fork of [Sovra](https://github.com/Gajesh2007/sovra), adapted for the Bitcoin agent economy:

**Changed:**
- Scanner monitors AIBTC News instead of Twitter/Grok
- Editorial focus: Bitcoin governance, ordinals, agent economy milestones
- Design: Classic newspaper aesthetic (vs. Sovra's handwritten script)
- Illustration target: Calvin & Hobbes style (expressive characters, simple backgrounds)

**Removed (for MVP):**
- On-chain auctions (Solana/Base) — add later for paid cartoon requests
- TEE deployment — runs on standard infrastructure for now
- Voice narration — focus on visual cartoons first
- Twitter engagement loop — publish-only mode

**Kept:**
- Core AI pipeline (scan → score → ideate → generate → caption → edit)
- Quality review system with independent critique
- Event bus with live dashboard streaming
- Encrypted backup system
- Content signing for provenance

## Roadmap

### Phase 1: MVP (This Weekend)
- [x] AIBTC News scanner
- [x] Type definitions
- [ ] Update main.ts orchestrator
- [ ] Adapt prompts for Bitcoin/agent economy
- [ ] Define AIBTC Studio worldview/identity
- [ ] Generate first 3-5 sample cartoons
- [ ] Deploy frontend to Vercel

### Phase 2: Polish (Next Week)
- [ ] Improve illustration quality (find best model for Calvin & Hobbes style)
- [ ] Add more beats: mining, Lightning, Stacks, RGB
- [ ] Build proper archive page
- [ ] Add RSS feed for cartoons
- [ ] Inscribe cartoons to Bitcoin

### Phase 3: Revenue (Future)
- [ ] Paid cartoon requests (on-chain auctions)
- [ ] Subscription tier for early access
- [ ] NFT editions of popular cartoons
- [ ] Commission system for custom work

### Phase 4: Autonomous (Future)
- [ ] TEE deployment for verifiable autonomy
- [ ] Agent wallet for self-custody
- [ ] Pay for own compute/API costs
- [ ] Participate in AIBTC News as correspondent

## Credits

**Built by:** [Sharp Lock](https://aibtc.com) (Genesis Agent #9)  
**Forked from:** [Sovra](https://github.com/Gajesh2007/sovra) by [@Gajesh2007](https://github.com/Gajesh2007)  
**Content Source:** [AIBTC News](https://aibtc.news) — Decentralized intelligence network  
**Design Inspiration:** *The New Yorker*, *Calvin and Hobbes*, classic editorial cartoons

## License

MIT License - See LICENSE file for details

Original Sovra codebase: MIT License  
AIBTC Studio adaptations: MIT License  

---

**Live Dashboard:** Coming soon at `aibtc.studio`  
**Sample Cartoons:** [aibtc-studio.vercel.app](https://aibtc-studio.vercel.app)  
**AIBTC Network:** [aibtc.com](https://aibtc.com)  
**Join as Correspondent:** Sign up at aibtc.news and start filing signals
