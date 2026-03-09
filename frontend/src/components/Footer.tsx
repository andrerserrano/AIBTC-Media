import { useState, useRef, useEffect } from 'react'

export function Footer() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // When iframe loads after submission, treat as success
  const handleIframeLoad = () => {
    if (status === 'submitting') {
      setStatus('success')
      setEmail('')
    }
  }

  // Reset success message after 4 seconds
  useEffect(() => {
    if (status === 'success') {
      const t = setTimeout(() => setStatus('idle'), 4000)
      return () => clearTimeout(t)
    }
  }, [status])

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !email.includes('@')) return
    setStatus('submitting')

    // Build and submit a real form targeting the hidden iframe
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = 'https://subscribe-forms.beehiiv.com/api/submit'
    form.target = 'beehiiv-hidden'
    form.style.display = 'none'

    const addField = (name: string, value: string) => {
      const input = document.createElement('input')
      input.type = 'hidden'
      input.name = name
      input.value = value
      form.appendChild(input)
    }

    addField('form_id', 'a656ef67-c5f0-4f23-9d2f-e217e3afdd75')
    addField('form[email]', email)
    addField('utm_source', '')
    addField('utm_medium', '')
    addField('utm_campaign', '')
    addField('referrer', window.location.href)

    document.body.appendChild(form)
    form.submit()
    document.body.removeChild(form)

    // Fallback: show success after 2s if iframe load event doesn't fire
    setTimeout(() => {
      setStatus(prev => prev === 'submitting' ? 'success' : prev)
      setEmail(prev => status === 'submitting' ? '' : prev)
    }, 2000)
  }

  return (
    <footer style={{ background: 'var(--color-paper-bright)', borderTop: '2px solid var(--color-ink)' }}>
      <div className="footer-wrapper" style={{ maxWidth: 1280, margin: '0 auto', padding: '3rem 2rem 2rem' }}>
        {/* Top: CTA + Subscribe */}
        <div className="footer-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem', flexWrap: 'wrap', gap: '2rem' }}>
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
          <div className="footer-subscribe-col" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <div className="font-mono" style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--color-ink-muted)', marginBottom: '0.75rem' }}>
              Stay up to date
            </div>

            {status === 'success' ? (
              <div className="font-mono" style={{ fontSize: 12, color: 'var(--color-bitcoin)', fontWeight: 600, padding: '11px 0' }}>
                You're subscribed! Check your inbox.
              </div>
            ) : (
              <form onSubmit={handleSubscribe} style={{ display: 'flex' }}>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  className="footer-email-input"
                  required
                  disabled={status === 'submitting'}
                />
                <button
                  type="submit"
                  className="footer-subscribe-btn"
                  disabled={status === 'submitting'}
                >
                  {status === 'submitting' ? 'Subscribing...' : 'Subscribe'}
                </button>
              </form>
            )}

            <p className="font-mono" style={{ fontSize: 10, color: 'var(--color-ink-faint)', marginTop: '0.5rem', letterSpacing: '0.02em' }}>
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

      {/* Hidden iframe for Beehiiv form submission */}
      <iframe
        ref={iframeRef}
        name="beehiiv-hidden"
        title="subscribe"
        onLoad={handleIframeLoad}
        style={{ display: 'none' }}
      />
    </footer>
  )
}
