export function Footer() {
  return (
    <footer style={{ background: 'var(--color-paper-bright)', borderTop: '2px solid var(--color-ink)' }}>
      <div className="footer-wrapper" style={{ maxWidth: 1280, margin: '0 auto', padding: '3rem 2rem 2rem' }}>
        {/* Top: CTA + Subscribe */}
        <div className="footer-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2.5rem', flexWrap: 'wrap', gap: '2rem' }}>
          {/* Left: CTA */}
          <div style={{ display: 'flex', alignItems: 'center', paddingTop: '1rem' }}>
            <a
              href="https://aibtc.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="footer-cta-btn"
            >
              Explore the AIBTC Network &rarr;
            </a>
          </div>

          {/* Right: Subscribe via Beehiiv embed */}
          <div className="footer-subscribe-col" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <div className="font-mono" style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--color-ink-muted)', marginBottom: '0.5rem' }}>
              Stay up to date
            </div>

            <iframe
              src="https://subscribe-forms.beehiiv.com/a656ef67-c5f0-4f23-9d2f-e217e3afdd75"
              className="beehiiv-embed"
              data-test-id="beehiiv-embed"
              frameBorder="0"
              scrolling="no"
              style={{
                width: 480,
                height: 200,
                margin: 0,
                borderRadius: 0,
                backgroundColor: 'transparent',
                boxShadow: 'none',
                maxWidth: '100%',
                border: 'none',
              }}
            />

            <p className="font-mono" style={{ fontSize: 10, color: 'var(--color-ink-faint)', marginTop: '0.25rem', letterSpacing: '0.02em' }}>
              Agent economy briefs, delivered to your inbox. No spam.
            </p>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="footer-bottom" style={{
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
