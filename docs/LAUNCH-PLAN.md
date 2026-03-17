# AIBTC Media — V1 Launch Plan

*Prepared March 8, 2026*

## What's Done

The core product is built and working end-to-end:

- **5 editorial cartoons inscribed on Bitcoin mainnet** (700px WebP, verified on-chain)
- **Homepage v4** with cartoon grid, source signal cards, editorial analysis, and on-chain provenance linking to ordinals.com
- **Full autonomous pipeline**: signal scanning → scoring → ideation → image generation → captioning → composition → inscription
- **Twitter/X integration code** (OAuth 1.0a, posting, engagement loop) — just needs credentials
- **Vercel + Docker deployment configs** ready
- **Ordinals wallet** on mainnet with commit/reveal inscription pattern

---

## Launch Checklist

### 1. Deploy Frontend to Vercel
**Priority: High | Effort: ~30 min**

- Run `bun run build` in `/frontend`
- Deploy to Vercel (connect GitHub repo or `vercel deploy`)
- Set `BACKEND_URL` environment variable pointing to backend
- Optional: configure custom domain (e.g. aibtc.media)

### 2. Deploy Backend
**Priority: High | Effort: ~1-2 hours**

Two options discussed:

**Option A — EigenCloud TEE (preferred for wallet security)**
- Mnemonic sealed inside TEE attestation
- Best security posture for mainnet funds
- Requires EigenCompute integration (TODO in wallet-provider.ts)

**Option B — VPS/Railway/Render (faster to launch)**
- Deploy Docker container with persistent volume for `.data/`
- Mount `.data/` as persistent storage
- Set all `.env` variables
- Caddy handles HTTPS automatically

### 3. Set Up Twitter/X Account
**Priority: High | Effort: ~1 hour**

- Create the @AIBTC_Media Twitter account (or whatever handle)
- Apply for API access (developer portal)
- Generate OAuth credentials:
  - `TWITTER_BEARER_TOKEN`
  - `TWITTER_API_KEY` / `TWITTER_API_SECRET`
  - `TWITTER_ACCESS_TOKEN` / `TWITTER_ACCESS_SECRET`
- Set `TWITTER_POSTING_ENABLED=true` in .env
- Test with a single dry-run post first

### 4. Secure the Wallet
**Priority: High | Effort: varies**

- Mnemonic is currently in `.env` (fine for dev, not for production)
- For launch: move to EigenCompute TEE or a secrets manager
- Fund the wallet for ongoing inscriptions (~$10-15 per cartoon at current settings)
- Set `MAX_INSCRIPTION_FEE_RATE` and `MAX_INSCRIPTION_COST_SATS` limits

### 5. Domain & DNS
**Priority: Medium | Effort: ~30 min**

- Register/configure domain (aibtc.media or similar)
- Point DNS to Vercel (frontend) and backend server
- Caddyfile already handles automatic HTTPS via `{$DOMAIN}`

### 6. Test Full Pipeline End-to-End
**Priority: High | Effort: ~2 hours**

- Trigger a full scan → score → generate → inscribe → post cycle
- Verify cartoon quality on ordinals.com
- Verify Twitter post goes live
- Check homepage updates with new cartoon
- Monitor agent loop for 24 hours

---

## Known Issues to Fix

1. **Scorer Zod schema bug** — pre-existing, needs investigation
2. **Stale inscription scripts** — multiple versions in `/scripts/`, clean up to avoid confusion
3. **Newsletter (Beehiiv)** — code exists but requires Scale plan; links to hosted page for now
4. **CDN/R2** — images served locally; enable Cloudflare R2 for production edge caching

---

## Post-Launch Roadmap

- Archive page with all cartoons + search/filter
- RSS feed for cartoon subscribers
- Ordinals marketplace integration (buy/transfer cartoons)
- More RSS sources (mining, Lightning, Stacks, RGB)
- Paid cartoon request mechanism (sBTC)
- Newsletter integration (Beehiiv Scale plan)

---

## Budget Estimate

| Item | Cost |
|------|------|
| Inscription per cartoon | ~$8-16 (at 1 sat/vB) |
| Twitter API | Free (Basic tier) |
| Vercel hosting | Free tier |
| VPS backend | ~$5-10/mo |
| Domain | ~$12/yr |
| Anthropic API (Claude) | ~$5-20/mo depending on volume |
| Google AI (Gemini image gen) | Usage-based, ~$1-5/cartoon |

**Estimated monthly run cost: ~$30-60/mo** plus inscription costs per cartoon.

---

## Suggested Launch Sequence

1. Deploy frontend → get a live URL people can visit
2. Deploy backend → enable the autonomous loop
3. Set up Twitter → first public post
4. Announce → share the homepage link + first cartoon tweet
5. Monitor for 48 hours → adjust scheduling/quality as needed
