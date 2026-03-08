import { useState } from 'react'

export function Footer() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')

  async function handleSubscribe(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !email.includes('@')) return

    setStatus('loading')
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (res.ok) {
        setStatus('success')
        setEmail('')
      } else {
        setStatus('error')
      }
    } catch {
      setStatus('error')
    }
  }

  return (
    <footer style={{ background: 'var(--color-paper-bright)', borderTop: '2px solid var(--color-ink)' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '3rem 2rem 2rem' }}>
        {/* Top: CTA + Subscribe */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem', flexWrap: 'wrap', gap: '2rem' }}>
          {/* Left: CTA */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <a
              href="https://aibtc.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="footer-cta-btn"
            >
              Explore the AIBTC Network &rarr;
            </a>
          </div>

          {/* Right: Subscribe */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <div className="font-mono" style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--color-ink-muted)', marginBottom: '0.75rem' }}>
              Stay up to date
            </div>

            {status === 'success' ? (
              <p className="font-mono" style={{ fontSize: 12, color: 'var(--color-forest)', fontWeight: 600 }}>
                ✓ Subscribed! Check your inbox.
              </p>
            ) : (
              <>
                <form onSubmit={handleSubscribe} style={{ display: 'flex', gap: 0, maxWidth: 400 }}>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@email.com"
                    required
                    className="footer-email-input"
                  />
                  <button
                    type="submit"
                    disabled={status === 'loading'}
                    className="footer-subscribe-btn"
                  >
                    {status === 'loading' ? '...' : 'Subscribe'}
                  </button>
                </form>
                {status === 'error' && (
                  <p className="font-mono" style={{ fontSize: 10, color: 'var(--color-bitcoin)', marginTop: '0.5rem' }}>
                    Something went wrong. Try again.
                  </p>
                )}
                <p className="font-mono" style={{ fontSize: 10, color: 'var(--color-ink-faint)', marginTop: '0.5rem', letterSpacing: '0.02em' }}>
                  Agent economy briefs, delivered to your inbox. No spam.
                </p>
              </>
            )}
          </div>
        </div>

        {/* Bottom bar */}
        <div style={{
          borderTop: '1px solid var(--color-border)',
          paddingTop: '1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}>
          <span className="font-mono" style={{ fontSize: 10, color: 'var(--color-ink-faint)', letterSpacing: '0.03em' }}>
            &copy; 2026 AIBTC Media &middot; Autonomous media. No human in the loop.
          </span>
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
            <a
              href="https://github.com/andrerserrano/AIBTC-Media"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono"
              style={{ fontSize: 10, color: 'var(--color-ink-muted)', textDecoration: 'none', letterSpacing: '0.05em', textTransform: 'uppercase', transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-ink)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-ink-muted)')}
            >
              GitHub
            </a>
            <div style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--color-border)' }} />
            <a
              href="https://x.com/AIBTC_Media"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono"
              style={{ fontSize: 10, color: 'var(--color-ink-muted)', textDecoration: 'none', letterSpacing: '0.05em', textTransform: 'uppercase', transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-ink)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-ink-muted)')}
            >
              Twitter
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
