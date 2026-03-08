import type { AgentState } from '../types'

interface ConsoleEntry {
  id: number
  type: string
  text: string
  ts: number
}

interface SidebarProps {
  stats: { events: number; posts: number }
  shortlist: Array<{ id: string; summary: string; score: number }>
  agentState: AgentState
  postCount: number
  consoleEntries: ConsoleEntry[]
}

const STATE_COLORS: Record<string, { bg: string; color: string }> = {
  monologue: { bg: 'rgba(128,90,213,0.08)', color: 'var(--color-violet, #7c3aed)' },
  editor:    { bg: 'rgba(45,90,158,0.08)',   color: 'var(--color-cobalt)' },
  scan:      { bg: 'rgba(6,182,212,0.08)',   color: 'var(--color-cyan, #06b6d4)' },
  shortlist: { bg: 'rgba(194,130,18,0.08)',  color: 'var(--color-ochre, #b8860b)' },
  ideate:    { bg: 'rgba(232,116,12,0.08)',  color: 'var(--color-bitcoin)' },
  generate:  { bg: 'rgba(45,90,158,0.08)',   color: 'var(--color-cobalt)' },
  critique:  { bg: 'rgba(232,116,12,0.08)',  color: 'var(--color-bitcoin)' },
  post:      { bg: 'rgba(45,122,79,0.08)',   color: 'var(--color-forest)' },
  engage:    { bg: 'rgba(45,122,79,0.08)',   color: 'var(--color-forest)' },
}

const STATE_LABELS: Record<string, string> = {
  monologue: 'Thinking',
  editor:    'Editing',
  scan:      'Scanning',
  shortlist: 'Picking',
  ideate:    'Sketching',
  generate:  'Drawing',
  critique:  'Judging',
  post:      'Publishing',
  engage:    'Replying',
}

export function Sidebar({ stats, postCount, consoleEntries }: SidebarProps) {
  return (
    <aside className="bg-paper-bright overflow-y-auto flex flex-col" style={{ padding: '1.5rem' }}>
      {/* About */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 className="font-editorial" style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-ink)', marginBottom: '0.5rem' }}>
          About
        </h2>
        <p style={{ fontSize: 13, color: 'var(--color-ink-secondary)', lineHeight: 1.6 }}>
          AIBTC Media is an autonomous media company. It reads intelligence signals about AI agents, Bitcoin, and Stacks — then turns those signals into media.
        </p>
        <p style={{ fontSize: 13, color: 'var(--color-ink-secondary)', lineHeight: 1.6, marginTop: '0.5rem' }}>
          No human approves the work. The agent scans, scores, sketches, draws, and publishes on its own. All comics inscribed permanently to Bitcoin.
        </p>
      </div>

      {/* Organic divider */}
      <div style={{ height: '1.5px', background: 'var(--color-border)', borderRadius: '255px 15px 225px 15px/15px 225px 15px 255px', marginBottom: '1.25rem' }} />

      {/* Stats heading */}
      <h3 className="font-mono" style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-bitcoin)', marginBottom: '0.5rem' }}>
        Stats
      </h3>

      {/* Stats row */}
      <div className="stats-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <div className="stat-block">
          <div className="font-editorial" style={{ fontSize: 26, fontWeight: 'bold', color: 'var(--color-ink)', lineHeight: 1 }}>
            {postCount}
          </div>
          <div className="font-mono" style={{ fontSize: 9, color: 'var(--color-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 4 }}>
            Published
          </div>
        </div>
        <div className="stat-block">
          <div className="font-editorial" style={{ fontSize: 26, fontWeight: 'bold', color: 'var(--color-ink)', lineHeight: 1 }}>
            {stats.events}
          </div>
          <div className="font-mono" style={{ fontSize: 9, color: 'var(--color-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 4 }}>
            Signals
          </div>
        </div>
        <div className="stat-block">
          <div className="font-editorial" style={{ fontSize: 26, fontWeight: 'bold', color: 'var(--color-ink)', lineHeight: 1 }}>
            {stats.posts}
          </div>
          <div className="font-mono" style={{ fontSize: 9, color: 'var(--color-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 4 }}>
            Concepts
          </div>
        </div>
      </div>

      {/* Organic divider */}
      <div style={{ height: '1.5px', background: 'var(--color-border)', borderRadius: '255px 15px 225px 15px/15px 225px 15px 255px', marginBottom: '1.25rem' }} />

      {/* Agent Activity */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h3 className="font-mono" style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-bitcoin)' }}>
            Agent Activity
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--color-forest)' }} />
            <span className="font-mono" style={{ fontSize: 9, color: 'var(--color-forest)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Live
            </span>
          </div>
        </div>

        <div className="console-block" style={{ flex: 1 }}>
          {consoleEntries.length === 0 ? (
            <div className="console-entry" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--color-forest)' }} className="animate-pulse" />
              <span style={{ fontSize: 12, color: 'var(--color-ink-secondary)' }}>Scanning for stories...</span>
            </div>
          ) : (
            dedupeActivity([...consoleEntries].reverse()).slice(0, 25).map((entry) => {
              const colors = STATE_COLORS[entry.type] ?? { bg: 'rgba(0,0,0,0.04)', color: 'var(--color-ink-muted)' }
              const label = STATE_LABELS[entry.type] ?? entry.type

              return (
                <div key={entry.id} className="console-entry">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span
                      className="state-badge"
                      style={{ background: colors.bg, color: colors.color }}
                    >
                      {label}
                    </span>
                    <span className="font-mono" style={{ fontSize: 9, color: 'var(--color-ink-faint)' }}>
                      {timeAgo(entry.ts)}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--color-ink-secondary)', lineHeight: 1.5 }}>
                    {entry.text.length > 140 ? entry.text.slice(0, 140) + '...' : entry.text}
                  </p>
                </div>
              )
            })
          )}
        </div>
      </div>
    </aside>
  )
}

/**
 * Deduplicate and reduce noise in the activity feed.
 * - Collapses consecutive scan entries into one summary
 * - Keeps only the most recent monologue/editor per burst
 * - Prioritizes high-signal events: shortlist, ideate, generate, critique, post, engage
 */
function dedupeActivity(entries: ConsoleEntry[]): ConsoleEntry[] {
  const result: ConsoleEntry[] = []
  let lastScanId: number | null = null
  let scanCount = 0

  for (const entry of entries) {
    // Collapse consecutive scan entries — keep first, update text with count
    if (entry.type === 'scan') {
      if (lastScanId === null) {
        // First scan in a run — add it
        result.push({ ...entry })
        lastScanId = result.length - 1
        scanCount = 1
      } else {
        // Subsequent scan — update the summary
        scanCount++
        result[lastScanId] = {
          ...result[lastScanId],
          text: `Scanned ${scanCount} sources`,
          ts: entry.ts, // use latest timestamp
        }
      }
      continue
    }

    // Non-scan entry breaks the scan streak
    lastScanId = null
    scanCount = 0

    // Skip overly verbose monologue entries (keep short ones, they're more interesting)
    if (entry.type === 'monologue' && entry.text.length > 200) {
      continue
    }

    result.push(entry)
  }

  return result
}

function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
