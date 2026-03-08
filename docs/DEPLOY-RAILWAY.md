# Deploy Backend to Railway

## Quick Start

1. **Create a Railway project** at [railway.app](https://railway.app)
2. Connect your GitHub repo (`andrerserrano/AIBTC-Media`)
3. Railway auto-detects the `Dockerfile` and `railway.toml`
4. Set environment variables (see below)
5. Add a persistent volume mounted at `/app/.data`
6. Deploy

---

## Environment Variables

Set these in Railway → your service → **Variables** tab.

### Required

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Claude API key (for reasoning, scoring, captioning) |
| `GEMINI_API_KEY` | Google AI key (for image generation) |
| `PORT` | Set to `3000` (Railway also sets this automatically) |

### Optional — Twitter/X

| Variable | Description |
|----------|-------------|
| `TWITTER_POSTING_ENABLED` | `true` to enable posting |
| `TWITTER_BEARER_TOKEN` | Twitter API bearer token |
| `TWITTER_API_KEY` | OAuth 1.0a consumer key |
| `TWITTER_API_SECRET` | OAuth 1.0a consumer secret |
| `TWITTER_ACCESS_TOKEN` | OAuth 1.0a access token |
| `TWITTER_ACCESS_SECRET` | OAuth 1.0a access secret |
| `TWITTER_USERNAME` | Bot's Twitter handle (without @) |

### Optional — CDN (Cloudflare R2)

| Variable | Description |
|----------|-------------|
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 access key |
| `R2_SECRET_ACCESS_KEY` | R2 secret key |
| `R2_BUCKET_NAME` | R2 bucket name |
| `R2_PUBLIC_URL` | Public URL for the R2 bucket |

### Optional — Postgres Backup

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Postgres connection string (Railway can provision this) |
| `BACKUP_SECRET` | Encryption key for state backups |

### Optional — Bitcoin Ordinals

| Variable | Description |
|----------|-------------|
| `INSCRIPTION_ENABLED` | `true` to enable on-chain inscription |
| `ORDINALS_NETWORK` | `mainnet` or `testnet` |
| `ORDINALS_MNEMONIC` | BIP39 mnemonic (**treat as top-secret**) |
| `ORDINALS_MAX_FEE_RATE` | Max fee rate in sat/vB (default: 3) |
| `ORDINALS_MAX_COST_USD` | Max cost per inscription in USD (default: 2) |
| `ORDINALS_MEMPOOL_API` | Mempool API endpoint |

### Optional — Scheduling

| Variable | Description |
|----------|-------------|
| `POSTING_HOURS` | Comma-separated hours, e.g. `8,20` |
| `POSTING_TIMEZONE` | IANA timezone, e.g. `America/New_York` |
| `TEST_MODE` | `true` for fast timers (dev only) |

---

## Persistent Volume

The backend stores all state (posts, cartoons, caches, events) in the `.data/` directory.

In Railway:
1. Go to your service → **Settings** → **Volumes**
2. Add a volume with mount path: `/app/.data`
3. Size: 1 GB is plenty to start

Without this volume, all state is lost on redeploy.

---

## Postgres Backup (Recommended)

For extra durability, the app can back up state to Postgres:

1. In Railway, click **+ New** → **Database** → **Postgres**
2. Railway auto-sets `DATABASE_URL` as a shared variable
3. Link it to your service
4. Set `BACKUP_SECRET` to a random string (used to encrypt backup data)

The app automatically backs up to Postgres and restores on startup.

---

## Health Check

The app exposes `GET /api/health` which returns:
```json
{ "status": "alive", "state": "idle", "uptime": 1234.5 }
```

Railway uses this for zero-downtime deploys and auto-restart.

---

## Post-Deploy Checklist

- [ ] Visit `https://your-app.up.railway.app/api/health` — should return `alive`
- [ ] Visit `https://your-app.up.railway.app/api/feed` — should return cartoon feed
- [ ] Check Railway logs for startup messages
- [ ] If using Postgres: verify "Restored X files from Postgres backup" in logs
- [ ] Set `TWITTER_POSTING_ENABLED=true` only after verifying everything works

---

## Custom Domain (Optional)

1. In Railway → service → **Settings** → **Networking** → **Custom Domain**
2. Add your domain (e.g., `api.aibtc.media`)
3. Railway provides the DNS record to add
4. HTTPS is automatic

---

## Security Notes

- Railway encrypts env vars at rest
- Vars are only injected at container runtime, never in build logs
- For the wallet mnemonic: Railway is reasonable for launch, but consider migrating to a TEE (EigenCloud) or secrets manager for long-term production
- Never commit `.env` to git (already in `.gitignore`)
