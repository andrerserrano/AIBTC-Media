export type AgentState =
  | 'scanning'
  | 'monologuing'
  | 'shortlisting'
  | 'ideating'
  | 'generating'
  | 'critiquing'
  | 'composing'
  | 'inscribing'
  | 'posting'
  | 'engaging'

export type ConsoleEvent =
  | { type: 'monologue'; text: string; state: AgentState; ts: number; tweetId?: string }
  | { type: 'scan'; source: string; signalCount: number; ts: number }
  | { type: 'shortlist'; topics: { id: string; summary: string; score: number }[]; ts: number }
  | { type: 'ideate'; concepts: { id: string; caption: string }[]; topicId: string; ts: number }
  | { type: 'generate'; prompt: string; variantCount: number; ts: number }
  | { type: 'critique'; critique: string; selected: number; ts: number }
  | { type: 'post'; tweetId: string; text: string; imageUrl?: string; ts: number }
  | { type: 'engage'; replyTo: string; text: string; ts: number }
  | { type: 'state_change'; from: AgentState; to: AgentState; ts: number }
  | { type: 'metric'; name: string; value: number; ts: number }

export interface LocalPost {
  id: string
  tweetId?: string
  text: string
  imagePath: string | null
  videoPath?: string | null
  quotedTweetId?: string | null
  createdAt: number
  /** Category tag for the post (e.g. INFRASTRUCTURE, GOVERNANCE, DEV TOOLS) */
  category?: string
  /** The source signal — the news event or data that triggered coverage */
  sourceSignal?: string
  /** Agent's editorial reasoning for the humor angle / coverage approach */
  editorialReasoning?: string
  /** News source or signal attribution */
  source?: string
  /** Description of the cartoon scene */
  sceneDescription?: string
  /** On-chain provenance URL (e.g. Ordinals inscription) */
  provenanceUrl?: string
  /** Raw inscription ID for display */
  inscriptionId?: string
}
