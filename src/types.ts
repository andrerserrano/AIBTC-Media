export interface AIBTCMetadata {
  signalId: string
  beat: string
  beatSlug: string
  headline: string
  tags?: string[]
  sources?: Array<{ url: string; title?: string }>
  signature: string
  timestamp: string
}

export interface BTCMagMetadata {
  title: string
  link: string
  pubDate: string
  categories?: string[]
  beat: string
}

export interface Signal {
  id: string
  source: 'aibtc' | 'btcmag'
  type: 'headline' | 'post'
  content: string
  url: string
  author: string
  mediaUrls?: string[]
  metrics?: {
    score?: number
  }
  ingestedAt: number
  expiresAt: number
  aibtc?: AIBTCMetadata
  btcMag?: BTCMagMetadata
}

export interface TopicScores {
  virality: number
  visualPotential: number
  audienceBreadth: number
  timeliness: number
  humor: number
  worldviewAlignment: number
  composite: number
}

export interface Topic {
  id: string
  signals: string[]
  summary: string
  scores: TopicScores
  safety: { passed: boolean; reason?: string }
  status: 'candidate' | 'shortlisted' | 'selected' | 'posted' | 'rejected'
  evaluatedAt: number
  quoteCandidates?: string[]
}

// --- Comic Strip Types (Multi-Panel) ---

/** Layout options for comic strips */
export type StripLayout =
  | { type: 'horizontal'; panels: 2 | 3 | 4 }
  | { type: 'grid'; columns: 2; rows: 2 }

/** A single panel in a comic strip */
export interface Panel {
  index: number
  visual: string            // Scene description for image generation
  composition: string       // Camera angle, framing, character positions
  narrativeRole: 'setup' | 'build' | 'turn' | 'punchline'
  characters: string[]      // Character names/descriptions for consistency
  mood: string              // Emotional tone for color palette selection
  dialogueBubbles?: Array<{
    speaker: string
    text: string
    position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  }>
}

/** A multi-panel comic strip concept */
export interface StripConcept {
  id: string
  topicId: string
  headline: string          // The strip's title/headline
  panels: Panel[]
  layout: StripLayout
  caption: string           // Tweet-length caption to accompany the strip
  jokeType: string          // The comedic mechanism (irony, juxtaposition, escalation, etc.)
  narrativeArc: string      // Brief description of the setup → punchline flow
  reasoning: string         // Why this strip works
  characters: Array<{
    name: string
    description: string     // Visual description for consistent rendering
    role: string            // Their role in the joke (protagonist, foil, bystander)
  }>
  referenceImageUrls?: string[]
}

/** Critique of a strip concept */
export interface StripCritique {
  conceptId: string
  narrativeFlow: number     // Does the panel sequence make sense? (1-10)
  humor: number             // Is it funny? (1-10)
  clarity: number           // Is the joke clear without explanation? (1-10)
  shareability: number      // Would someone screenshot and share? (1-10)
  visualConsistency: number // Can this be rendered with consistent characters? (1-10)
  overallScore: number
  critique: string
  panelNotes?: string[]     // Per-panel feedback
}

/** A rendered comic strip */
export interface ComicStrip {
  id: string
  conceptId: string
  topicId: string
  type: 'flagship' | 'quickhit'
  concept: StripConcept
  panelImages: string[]     // File paths for individual panel images
  compositeImage: string    // Final stitched strip image path
  layout: StripLayout
  critique: StripCritique
  caption: string
  createdAt: number
}

// --- Legacy Single-Panel Types (kept for backwards compatibility) ---

export interface CartoonConcept {
  id: string
  topicId: string
  visual: string
  composition: string
  caption: string
  jokeType: string
  reasoning: string
  referenceImageUrls?: string[]
}

export interface ConceptCritique {
  conceptId: string
  humor: number
  clarity: number
  shareability: number
  visualSimplicity: number
  overallScore: number
  critique: string
}

/** On-chain provenance from Bitcoin Ordinals inscription */
export interface Provenance {
  inscriptionId: string
  commitTxid: string
  revealTxid: string
  costSat: number
  costUSD: number
  feeRate: number
  network: string
}

export interface Cartoon {
  id: string
  conceptId: string
  topicId: string
  type: 'flagship' | 'quickhit'
  concept: CartoonConcept
  imagePrompt: string
  variants: string[]
  selectedVariant: number
  critique: ConceptCritique
  caption: string
  createdAt: number
  provenance?: Provenance
}

export interface Post {
  id: string
  tweetId: string
  cartoonId?: string
  stripId?: string          // Reference to ComicStrip (new)
  text: string
  imageUrl?: string
  quotedTweetId?: string
  type: 'flagship' | 'quickhit' | 'engagement'
  postedAt: number
  engagement: {
    likes: number
    retweets: number
    replies: number
    views: number
    lastChecked: number
  }
  provenance?: Provenance
}
