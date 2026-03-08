import { useState, useEffect } from 'react'
import type { AgentState } from '../types'

const STATE_LABELS: Record<string, { label: string; color: string }> = {
  scanning:     { label: 'Scanning signals',      color: 'text-forest' },
  monologuing:  { label: 'Thinking...',           color: 'text-forest' },
  shortlisting: { label: 'Picking a story',       color: 'text-forest' },
  ideating:     { label: 'Sketching ideas',       color: 'text-forest' },
  generating:   { label: 'Drawing',               color: 'text-forest' },
  critiquing:   { label: 'Judging the work',      color: 'text-forest' },
  composing:    { label: 'Writing the line',      color: 'text-forest' },
  inscribing:   { label: 'Inscribing to Bitcoin', color: 'text-forest' },
  posting:      { label: 'Publishing',            color: 'text-forest' },
  engaging:     { label: 'Replying',              color: 'text-forest' },
}

interface HeaderProps {
  state: AgentState
  connected: boolean
}

function splitToLetters(text: string) {
  return text.split('').map((ch, i) => {
    if (ch === ' ') return <span key={i} style={{ display: 'inline-block', width: '0.2em' }}>&nbsp;</span>
    return (
      <span key={i} className="heading-letter">{ch}</span>
    )
  })
}

export function Header({ state, connected }: HeaderProps) {
  const stateInfo = STATE_LABELS[state] ?? { label: state, color: 'text-ink-muted' }
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(tick)
  }, [])

  return (
    <>
      {/* Top accent rule */}
      <div className="accent-rule" />

      <header style={{ background: 'var(--color-paper-bright)', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '1.25rem 2rem 0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          {/* Left: Title + subtitle */}
          <div>
            <h1
              className="font-editorial"
              style={{
                fontSize: 44,
                fontWeight: 'bold',
                color: 'var(--color-ink)',
                lineHeight: 1,
                letterSpacing: '-0.02em',
                cursor: 'pointer',
                textShadow: '2px 2px 0 rgba(26,26,26,0.06), -1px -1px 0 rgba(250,246,235,0.4)',
              }}
            >
              {splitToLetters('AIBTC Media')}
            </h1>
            <p style={{
              marginTop: 3,
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              fontWeight: 500,
              color: 'var(--color-ink-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.2em',
            }}>
              Documenting the Bitcoin agent economy
            </p>
          </div>

          {/* Right: Status pill + date */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, paddingTop: 6 }}>
            <div className="status-pill">
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: connected ? 'var(--color-forest)' : 'var(--color-bitcoin)' }} />
                {connected && (
                  <div style={{ position: 'absolute', width: 6, height: 6, borderRadius: '50%', background: 'var(--color-forest)' }} className="animate-ping opacity-40" />
                )}
              </div>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.05em',
                color: 'var(--color-forest)',
              }}>
                {stateInfo.label}
              </span>
            </div>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--color-ink-faint)',
              letterSpacing: '0.05em',
            }}>
              {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
        </div>

        {/* Editorial rule */}
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 2rem' }}>
          <div className="editorial-rule-strong" />
        </div>
      </header>
    </>
  )
}
