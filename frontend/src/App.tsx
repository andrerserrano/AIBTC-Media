import { useState } from 'react'
import { useConsoleStream } from './hooks/useConsoleStream'
import { useFeed } from './hooks/useFeed'
import { Header } from './components/Header'
import { Monologue } from './components/Monologue'
import { Feed } from './components/Feed'
import { Sidebar } from './components/Sidebar'
import { Footer } from './components/Footer'

export default function App() {
  const { entries, agentState, connected, shortlist, stats } = useConsoleStream({})
  const posts = useFeed()
  const params = new URLSearchParams(window.location.search)
  const viewEverything = params.get('view_everything') === 'true'
  const [showAbout, setShowAbout] = useState(false)

  /* Hidden debug mode: three-column layout */
  if (viewEverything) {
    return (
      <div className="h-screen flex flex-col bg-paper">
        <Header state={agentState} connected={connected} />

        <div className="flex-1 grid grid-cols-[1fr_1fr_340px] min-h-0">
          {/* The Brain */}
          <div className="min-h-0 overflow-hidden border-r border-border">
            <div className="sticky top-0 z-10 glass-panel border-b border-border px-4 py-2">
              <div className="flex items-center gap-2">
                <div className="w-[3px] h-4 bg-bitcoin rounded-full" />
                <span className="font-editorial text-[16px] font-bold text-ink">The Brain</span>
                <span className="font-mono text-[9px] text-ink-faint uppercase tracking-wider">Live thoughts</span>
              </div>
            </div>
            <Monologue entries={entries} />
          </div>

          {/* Gallery */}
          <div className="min-h-0 overflow-hidden border-r border-border">
            <Feed posts={posts} streamMode />
          </div>

          {/* Sidebar */}
          <div className="min-h-0 overflow-y-auto">
            <Sidebar stats={stats} shortlist={shortlist} agentState={agentState} postCount={posts.length} consoleEntries={entries} />
          </div>
        </div>
      </div>
    )
  }

  /* Default: v4 two-panel editorial layout (feed + sidebar) */
  return (
    <div className="min-h-screen flex flex-col bg-paper">
      <Header state={agentState} connected={connected} />

      {/* Two-panel editorial layout */}
      <div className="flex-1 layout-grid grid grid-cols-[1fr_340px] min-h-0" style={{ maxWidth: 1280, margin: '0 auto', width: '100%' }}>
        {/* Left: Feed — with mobile About button */}
        <main className="min-h-0 overflow-y-auto feed-main" style={{ borderRight: '1px solid var(--color-border)' }}>
          <Feed posts={posts} onAbout={() => setShowAbout(true)} />
        </main>

        {/* Right: Sidebar (hidden on mobile, replaced by About overlay) */}
        <aside className="sidebar-panel min-h-0 overflow-y-auto" style={{ position: 'sticky', top: 0, height: '100vh' }}>
          <Sidebar stats={stats} shortlist={shortlist} agentState={agentState} postCount={posts.length} consoleEntries={entries} />
        </aside>
      </div>

      {/* Mobile About overlay */}
      {showAbout && (
        <div
          className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-sm animate-[fade-in_0.15s_ease-out]"
          onClick={() => setShowAbout(false)}
        >
          <div
            className="absolute inset-x-0 top-0 max-h-[85vh] overflow-y-auto bg-paper-bright"
            style={{ borderBottom: '2px solid var(--color-bitcoin)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0.75rem 1rem 0' }}>
              <button
                onClick={() => setShowAbout(false)}
                className="btn"
                style={{ fontSize: 11 }}
              >
                Close ×
              </button>
            </div>
            <Sidebar stats={stats} shortlist={shortlist} agentState={agentState} postCount={posts.length} consoleEntries={entries} />
          </div>
        </div>
      )}

      <Footer />
    </div>
  )
}
