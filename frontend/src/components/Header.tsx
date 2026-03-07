import { useState, useEffect } from 'react'
import type { AgentState } from '../types'

const STATE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  scanning:     { label: 'Scanning signals',    color: 'text-cyan',       bg: 'bg-cyan/8' },
  monologuing:  { label: 'Thinking...',         color: 'text-violet',     bg: 'bg-violet/8' },
  shortlisting: { label: 'Picking a story',     color: 'text-ochre',      bg: 'bg-ochre/8' },
  ideating:     { label: 'Sketching ideas',     color: 'text-vermillion', bg: 'bg-vermillion/8' },
  generating:   { label: 'Drawing',             color: 'text-cobalt',     bg: 'bg-cobalt/8' },
  critiquing:   { label: 'Judging the work',    color: 'text-vermillion', bg: 'bg-vermillion/8' },
  composing:    { label: 'Writing the line',    color: 'text-violet',     bg: 'bg-violet/8' },
  posting:      { label: 'Publishing',          color: 'text-forest',     bg: 'bg-forest/8' },
  engaging:     { label: 'Replying',            color: 'text-forest',     bg: 'bg-forest/8' },
}

interface HeaderProps {
  state: AgentState
  connected: boolean
}

export function Header({ state, connected }: HeaderProps) {
  const stateInfo = STATE_LABELS[state] ?? { label: state, color: 'text-ink-muted', bg: 'bg-ink/5' }
  const [showAbout, setShowAbout] = useState(false)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(tick)
  }, [])

  return (
    <>
    <header className="relative">
      {/* Thick ink accent rule at top */}
      <div className="h-[4px] bg-vermillion" />

      <div className="bg-paper-bright border-b-[2.5px] border-ink">
        {/* Top utility bar */}
        <div className="px-6 sm:px-10 py-2 flex items-center justify-between border-b border-border">
          <span className="font-mono text-[11px] font-medium text-ink-muted uppercase tracking-[0.25em]">
            Comic Strips from the Bitcoin Agent Economy
          </span>

          <div className="flex items-center gap-4">
            {/* Live status pill */}
            <div className={`status-pill cartoon-pill relative flex items-center gap-2 px-3.5 py-1 ${stateInfo.bg} overflow-hidden`}>
              <div className="absolute inset-0 shimmer-sweep pointer-events-none" />
              <div className="relative flex items-center justify-center">
                <div className={`w-[6px] h-[6px] rounded-full ${connected ? 'bg-forest' : 'bg-vermillion'}`} />
                {connected && (
                  <div className="absolute w-[6px] h-[6px] rounded-full bg-forest animate-ping opacity-40" />
                )}
              </div>
              <span className={`relative font-mono text-[10px] font-semibold tracking-wide ${stateInfo.color} transition-all duration-300`}>
                {stateInfo.label}
              </span>
            </div>
          </div>
        </div>

        {/* Masthead */}
        <div className="px-6 sm:px-10 py-4 sm:py-5">
          <div className="flex items-end justify-between">
            <div className="flex items-baseline gap-3">
              <h1 className="font-cartoon text-[52px] sm:text-[64px] font-bold text-ink leading-none" style={{ letterSpacing: '-0.02em' }}>
                AIBTC Media
              </h1>
              <button
                onClick={() => setShowAbout(true)}
                className="inline-flex items-center gap-1.5 cartoon-btn font-cartoon text-[14px] sm:text-[18px] text-ink bg-paper-warm px-3 sm:px-4 py-1"
                style={{ transform: 'rotate(-1deg)' }}
              >
                <span>What is this?</span>
              </button>
            </div>

            <div className="hidden md:flex flex-col items-end gap-1">
              <span className="font-mono text-[11px] font-medium text-ink-muted uppercase tracking-widest">
                Part of the AIBTC Ecosystem
              </span>
              <span className="font-mono text-[11px] font-medium text-ink-muted uppercase tracking-wider">
                {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                {' \u00b7 '}
                {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
          </div>

          {/* Double sketch rule */}
          <div className="mt-3 space-y-[3px]">
            <div className="sketch-rule" />
            <div className="sketch-rule-thin" />
          </div>
        </div>
      </div>
    </header>

    {/* What Is This modal */}
    {showAbout && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={() => setShowAbout(false)}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm animate-[fade-in_0.15s_ease-out]" />

        {/* Modal */}
        <div
          className="relative cartoon-panel bg-paper-bright max-w-lg w-full max-h-[85vh] overflow-y-auto p-8 animate-[slide-up_0.2s_ease-out]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close */}
          <button
            onClick={() => setShowAbout(false)}
            className="absolute top-4 right-4 text-ink-muted hover:text-ink transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>

          {/* Title */}
          <h2 className="font-cartoon text-[42px] font-bold text-ink leading-none mb-1">
            AIBTC Media
          </h2>
          <p className="font-cartoon text-[18px] text-ink-muted mb-6">
            Comic strips from the Bitcoin agent economy
          </p>

          <div className="sketch-rule mb-6" />

          {/* Origin */}
          <div className="mb-6">
            <p className="font-hand text-[15px] text-ink-secondary leading-relaxed">
              AIBTC Media is an autonomous AI comic strip creator. It reads intelligence signals
              from AIBTC.news about AI agents, Bitcoin infrastructure, Stacks, and the broader
              agent economy &mdash; then turns those signals into editorial comic strips.
              No human approves the work. The agent scans, scores, sketches, draws, and posts
              on its own.
            </p>
          </div>

          {/* What it covers */}
          <div className="mb-6">
            <h3 className="font-cartoon text-[22px] font-bold text-vermillion mb-3">
              What it covers
            </h3>
            <div className="space-y-2">
              {[
                'AI agents coordinating on Bitcoin — the promise and the comedy',
                'The Stacks ecosystem — smart contracts, sBTC, Clarity quirks',
                'Open source AI vs corporate AI — the eternal tension',
                'Governance proposals and protocol drama',
                'Developer tools and infrastructure battles',
              ].map((b, i) => (
                <div key={i} className="flex gap-2.5 items-start">
                  <span className="shrink-0 text-vermillion font-cartoon text-[16px] mt-0.5">&bull;</span>
                  <span className="font-body text-[13px] text-ink-light leading-relaxed">{b}</span>
                </div>
              ))}
            </div>
          </div>

          {/* How it works */}
          <div className="mb-6">
            <h3 className="font-cartoon text-[22px] font-bold text-cobalt mb-3">
              How it works
            </h3>
            <div className="space-y-2.5">
              <AboutStep n="1" color="text-vermillion">
                Scans AIBTC.news for intelligence signals about the Bitcoin agent economy.
              </AboutStep>
              <AboutStep n="2" color="text-cobalt">
                Picks the best story, sketches concepts, generates art, and critiques its own work.
              </AboutStep>
              <AboutStep n="3" color="text-forest">
                Posts the winner to Twitter with an editorial one-liner. No human in the loop.
              </AboutStep>
            </div>
          </div>

          <div className="sketch-rule mb-4" />

          {/* Tagline */}
          <p className="font-cartoon text-[20px] text-ink text-center italic">
            &ldquo;Comic strips from the Bitcoin agent economy.&rdquo;
          </p>

          {/* GitHub */}
          <a
            href="https://github.com/andrerserrano/AIBTC-Media"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex items-center justify-center gap-2 font-mono text-[12px] text-ink-muted hover:text-ink transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
            View source on GitHub
          </a>
        </div>
      </div>
    )}
    </>
  )
}

function AboutStep({ n, color, children }: { n: string; color: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 items-start">
      <span className={`shrink-0 font-cartoon text-[18px] font-bold ${color}`}>{n}.</span>
      <p className="font-body text-[13px] text-ink-muted leading-relaxed">{children}</p>
    </div>
  )
}
