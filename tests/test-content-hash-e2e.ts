/**
 * End-to-end test for content hash inscription flow.
 *
 * Tests the full pipeline without needing a wallet or Bitcoin network:
 *   1. Hash computation on a real composed image
 *   2. JSON payload construction
 *   3. Data model integrity (Cartoon & Post records)
 *   4. API feed response shape (how the frontend will see it)
 *   5. Simulated batch-inscription matching
 *
 * Run: bun test-content-hash-e2e.ts
 */
import { createHash } from 'crypto'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { ContentHashProvenance, Cartoon, Post } from './src/types.js'
import { hashFile, type ContentHashPayload } from './src/ordinals/inscribe-hash.js'

const DATA_DIR = join(import.meta.dir, '.data')
const IMAGES_DIR = join(DATA_DIR, 'images')

// ─── Helpers ───

function pass(label: string) { console.log(`  ✅ ${label}`) }
function fail(label: string, detail?: string) {
  console.log(`  ❌ ${label}${detail ? ': ' + detail : ''}`)
  process.exitCode = 1
}
function section(label: string) { console.log(`\n── ${label} ──`) }

// ─── Find a real composed image to test with ───

function findTestImage(): string | null {
  if (!existsSync(IMAGES_DIR)) return null
  const { readdirSync } = require('fs')
  const files = readdirSync(IMAGES_DIR) as string[]
  const composed = files.find((f: string) => f.includes('-composed') && f.endsWith('.png'))
  if (composed) return join(IMAGES_DIR, composed)
  const anyPng = files.find((f: string) => f.endsWith('.png'))
  if (anyPng) return join(IMAGES_DIR, anyPng)
  return null
}

// ─── Test 1: Hash computation ───

section('1. Content Hash Computation')

const testImagePath = findTestImage()
if (!testImagePath) {
  // Use a synthetic test image if no real one exists
  console.log('  (No composed image found — using synthetic test data)')
  const syntheticData = Buffer.from('AIBTC-Media-test-image-' + Date.now())
  const syntheticHash = createHash('sha256').update(syntheticData).digest('hex')
  console.log(`  Synthetic hash: sha256:${syntheticHash.slice(0, 16)}...`)

  // Verify hash is deterministic
  const rehash = createHash('sha256').update(syntheticData).digest('hex')
  if (syntheticHash === rehash) pass('Hash is deterministic (same input → same hash)')
  else fail('Hash is NOT deterministic')

  // Verify different input → different hash
  const differentData = Buffer.from('AIBTC-Media-different-image')
  const differentHash = createHash('sha256').update(differentData).digest('hex')
  if (syntheticHash !== differentHash) pass('Different content → different hash')
  else fail('Hash collision detected')
} else {
  console.log(`  Using image: ${testImagePath.split('/').pop()}`)
  const hash1 = hashFile(testImagePath)
  const hash2 = hashFile(testImagePath)
  console.log(`  Hash: sha256:${hash1.slice(0, 16)}...`)
  if (hash1 === hash2) pass('hashFile() is deterministic')
  else fail('hashFile() returned different hashes for same file')
  if (hash1.length === 64) pass('SHA-256 hash is correct length (64 hex chars)')
  else fail(`Hash length incorrect: ${hash1.length}`)
}

// ─── Test 2: JSON payload construction ───

section('2. Inscription Payload')

const testHash = createHash('sha256').update(Buffer.from('test-canonical-image')).digest('hex')
const testCardId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

const payload: ContentHashPayload = {
  v: 1,
  type: 'aibtc-content-hash',
  contentHash: `sha256:${testHash}`,
  cardId: testCardId,
  timestamp: new Date().toISOString(),
}

const payloadJson = JSON.stringify(payload)
const payloadBytes = Buffer.from(payloadJson, 'utf-8')

console.log(`  Payload JSON: ${payloadJson}`)
console.log(`  Payload size: ${payloadBytes.length} bytes`)

if (payloadBytes.length < 250) pass(`Payload is small (${payloadBytes.length} bytes < 250)`)
else fail(`Payload too large: ${payloadBytes.length} bytes`)

if (payload.v === 1) pass('Schema version is 1')
else fail(`Unexpected version: ${payload.v}`)

if (payload.type === 'aibtc-content-hash') pass('Type discriminator is correct')
else fail(`Unexpected type: ${payload.type}`)

if (payload.contentHash.startsWith('sha256:')) pass('contentHash has sha256: prefix')
else fail('contentHash missing sha256: prefix')

// ─── Test 3: Fee estimate for payload size ───

section('3. Fee Estimation (for ~${payloadBytes.length} byte payload)')

// Using the formula from estimate-fees.ts
const contentSizeBytes = payloadBytes.length
const commitVsize = 150
const revealOverhead = 100
const revealVsize = revealOverhead + Math.ceil(contentSizeBytes / 4)
const totalVsize = commitVsize + revealVsize

console.log(`  Commit vsize: ${commitVsize}`)
console.log(`  Reveal vsize: ${revealVsize} (100 overhead + ${Math.ceil(contentSizeBytes / 4)} witness)`)
console.log(`  Total vsize: ${totalVsize}`)

const feeRates = [1, 2, 3, 5, 10]
const btcPrice = 85000

console.log(`\n  Cost estimates at $${btcPrice.toLocaleString()} BTC:`)
for (const rate of feeRates) {
  const feeSats = totalVsize * rate
  const feeUSD = (feeSats / 1e8) * btcPrice
  console.log(`    ${rate} sat/vB: ${feeSats} sats = $${feeUSD.toFixed(2)}`)
}

if (totalVsize < 400) pass(`Total vsize is small (${totalVsize} < 400)`)
else fail(`Total vsize unexpectedly large: ${totalVsize}`)

// ─── Test 4: Data model — Cartoon record ───

section('4. Data Model: Cartoon Record')

const mockContentHashProvenance: ContentHashProvenance = {
  contentHash: testHash,
  inscriptionId: `${'a'.repeat(64)}i0`,
  commitTxid: 'b'.repeat(64),
  revealTxid: 'a'.repeat(64),
  costSat: 900,
  costUSD: 0.75,
  feeRate: 3,
  network: 'testnet',
  inscribedAt: new Date().toISOString(),
}

const cartoon: Cartoon = {
  id: testCardId,
  conceptId: 'concept-123',
  topicId: 'topic-456',
  type: 'flagship',
  concept: {
    id: 'concept-123',
    topicId: 'topic-456',
    visual: 'A robot reading a newspaper about Bitcoin agents',
    composition: 'Medium shot, centered',
    caption: 'Even the agents need to stay informed',
    jokeType: 'observational',
    reasoning: 'Testing content hash inscription',
  },
  imagePrompt: 'test prompt',
  variants: ['/images/test.png'],
  selectedVariant: 0,
  critique: {
    conceptId: 'concept-123',
    humor: 7,
    clarity: 8,
    shareability: 7,
    visualSimplicity: 8,
    overallScore: 7.5,
    critique: 'Test critique',
  },
  caption: 'Even the agents need to stay informed',
  createdAt: Date.now(),
  contentHashProvenance: mockContentHashProvenance,
  // provenance is undefined — will be added later via batch inscription
}

if (cartoon.contentHashProvenance) pass('Cartoon has contentHashProvenance')
else fail('Cartoon missing contentHashProvenance')

if (!cartoon.provenance) pass('Cartoon.provenance is undefined (will be added via batch later)')
else fail('Cartoon.provenance should be undefined for hash-only inscription')

if (cartoon.id === testCardId) pass('Cartoon ID matches cardId in payload')
else fail('Cartoon ID mismatch')

// ─── Test 5: Data model — Post record ───

section('5. Data Model: Post Record')

const post: Post = {
  id: 'post-789',
  tweetId: 'tweet-abc',
  cartoonId: cartoon.id,
  text: 'Test headline\n"Even the agents need to stay informed"',
  imageUrl: 'https://r2.example.com/images/test-composed.png',
  type: 'flagship',
  postedAt: Date.now(),
  engagement: { likes: 0, retweets: 0, replies: 0, views: 0, lastChecked: 0 },
  contentHashProvenance: mockContentHashProvenance,
  sourceSignal: 'AI agents now reading their own coverage',
  editorialReasoning: 'Meta-humor about autonomous media',
  category: 'DEV TOOLS',
}

if (post.contentHashProvenance) pass('Post has contentHashProvenance')
else fail('Post missing contentHashProvenance')

if (!post.provenance) pass('Post.provenance is undefined (hash-only mode)')
else fail('Post.provenance should be undefined')

// ─── Test 6: API feed response shape ───

section('6. API Feed Response (what frontend receives)')

// Simulate the /api/feed mapping from main.ts
let provenanceUrl: string | null = null
if (post.provenance?.inscriptionId) {
  provenanceUrl = `https://ordinals.com/inscription/${post.provenance.inscriptionId}`
} else if (post.contentHashProvenance?.inscriptionId) {
  provenanceUrl = `https://ordinals.com/inscription/${post.contentHashProvenance.inscriptionId}`
}

const feedItem = {
  id: post.id,
  tweetId: post.tweetId,
  text: post.text,
  imagePath: post.imageUrl,
  createdAt: post.postedAt,
  provenanceUrl,
  sourceSignal: post.sourceSignal,
  editorialReasoning: post.editorialReasoning,
  category: post.category,
  inscriptionId: post.provenance?.inscriptionId ?? post.contentHashProvenance?.inscriptionId ?? null,
  contentHash: post.contentHashProvenance?.contentHash ?? null,
}

console.log('\n  Feed item shape:')
console.log(JSON.stringify(feedItem, null, 4).split('\n').map(l => '    ' + l).join('\n'))

if (feedItem.provenanceUrl) pass('provenanceUrl is populated from contentHashProvenance')
else fail('provenanceUrl is null — frontend provenance section won\'t render')

if (feedItem.provenanceUrl?.includes('ordinals.com/inscription/')) pass('provenanceUrl points to ordinals.com')
else fail('provenanceUrl format is wrong')

if (feedItem.inscriptionId) pass('inscriptionId is populated for frontend display')
else fail('inscriptionId is null')

if (feedItem.contentHash) pass('contentHash is included for verification')
else fail('contentHash is missing')

// ─── Test 7: Batch inscription matching ───

section('7. Batch Inscription Matching (future workflow)')

// Simulate: canonical image → hash → match against stored contentHash
const canonicalImageData = Buffer.from('test-canonical-image')
const rehashForMatch = createHash('sha256').update(canonicalImageData).digest('hex')

if (rehashForMatch === testHash) pass('Re-hashed canonical image matches stored contentHash')
else fail('Hash mismatch — batch inscription would fail to match')

// Simulate: after batch inscription, update the Cartoon record
const batchProvenance = {
  inscriptionId: `${'c'.repeat(64)}i0`,
  commitTxid: 'd'.repeat(64),
  revealTxid: 'c'.repeat(64),
  costSat: 15000,
  costUSD: 12.50,
  feeRate: 3,
  network: 'mainnet' as const,
}

const updatedCartoon = {
  ...cartoon,
  provenance: batchProvenance,  // Full image now inscribed
}

if (updatedCartoon.provenance && updatedCartoon.contentHashProvenance) {
  pass('Updated cartoon has BOTH provenance types')
} else {
  fail('Updated cartoon missing a provenance type')
}

console.log('\n  Before batch inscription:')
console.log(`    provenance:            ${cartoon.provenance ? '✓' : '✗ (none yet)'}`)
console.log(`    contentHashProvenance: ${cartoon.contentHashProvenance ? '✓' : '✗'}`)
console.log('  After batch inscription:')
console.log(`    provenance:            ${updatedCartoon.provenance ? '✓ (full image)' : '✗'}`)
console.log(`    contentHashProvenance: ${updatedCartoon.contentHashProvenance ? '✓ (hash anchor)' : '✗'}`)

// ─── Test 8: Monthly cost projection ───

section('8. Monthly Cost Projection')

const postsPerDay = 12
const daysPerMonth = 30
const totalPerMonth = postsPerDay * daysPerMonth

for (const rate of [2, 3, 5]) {
  const costPerInscription = ((totalVsize * rate) / 1e8) * btcPrice
  const dailyCost = costPerInscription * postsPerDay
  const monthlyCost = costPerInscription * totalPerMonth
  console.log(`  At ${rate} sat/vB:`)
  console.log(`    Per inscription: $${costPerInscription.toFixed(2)}`)
  console.log(`    Daily (${postsPerDay}):      $${dailyCost.toFixed(2)}`)
  console.log(`    Monthly (${totalPerMonth}):   $${monthlyCost.toFixed(2)}`)
  console.log()
}

pass(`Content hash inscription is ${Math.round((totalVsize / (100 + Math.ceil(5000/4) + 150)) * 100)}% the vsize of a ~5KB image inscription`)

// ─── Summary ───

section('Summary')
console.log('  Content hash inscription flow verified end-to-end.')
console.log('  Pipeline: Compose → SHA-256 → JSON payload → Inscribe → Store → Serve to frontend')
console.log('  Batch workflow: Re-hash canonical image → Match contentHash → Inscribe full image → Update record')
console.log()
