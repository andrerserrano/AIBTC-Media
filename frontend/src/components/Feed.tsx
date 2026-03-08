import { useState, useEffect, useRef, useCallback } from 'react'
import type { LocalPost } from '../types'
import { TweetEmbed } from './TweetEmbed'
import { sanitizeImagePath, sanitizeImageUrl, sanitizeVideoPath } from '../security'

type ViewMode = 'feed' | 'gallery'

function VideoOverlay({ src, onClose }: { src: string; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/85 backdrop-blur-sm animate-[fade-in_0.15s_ease-out]"
      onClick={onClose}
    >
      <div className="relative max-w-4xl w-full" onClick={e => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 text-paper-bright/80 hover:text-paper-bright transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <video
          ref={videoRef}
          src={src}
          controls
          autoPlay
          playsInline
          className="w-full rounded bg-ink"
          onError={() => onClose()}
        />
      </div>
    </div>
  )
}

interface RejectedCartoon {
  caption: string
  imageUrl: string
  reason: string
  rejectedAt: number
}

function PostDetail({ post, postNumber, onClose }: { post: LocalPost; postNumber: number; onClose: () => void }) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/80 backdrop-blur-sm animate-[fade-in_0.15s_ease-out]"
      onClick={onClose}
    >
      <div
        className="relative max-w-3xl w-full max-h-[90vh] bg-paper-bright rounded overflow-y-auto"
        style={{ border: '1px solid var(--color-border)' }}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center bg-paper-bright/90 rounded text-ink hover:text-bitcoin"
          style={{ border: '1px solid var(--color-border)' }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>

        {post.imagePath && (
          <img
            src={sanitizeImagePath(post.imagePath)}
            alt="post"
            className="w-full object-contain"
            style={{ borderRadius: '4px 4px 0 0' }}
          />
        )}

        <div className="p-6 sm:p-8">
          <p className="font-editorial text-[22px] sm:text-[28px] text-ink font-bold leading-snug">
            {post.text.split('\n')[0]}
          </p>
          {post.text.split('\n').slice(1).filter(Boolean).length > 0 && (
            <p className="mt-2 font-editorial text-[15px] text-ink-muted italic leading-relaxed">
              {post.text.split('\n').slice(1).join('\n')}
            </p>
          )}

          <div className="mt-4 flex items-center gap-3">
            <span className="font-mono" style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-bitcoin)', background: 'rgba(232,116,12,0.08)', padding: '2px 8px', borderRadius: 3 }}>
              #{postNumber}
            </span>
            <span className="font-mono text-[11px] text-ink-muted uppercase tracking-wide">
              {formatDate(post.createdAt)}
            </span>
            <span className="text-ink-faint">&middot;</span>
            <span className="font-mono text-[11px] text-ink-muted uppercase tracking-wide">by AIBTC Media</span>
          </div>

          {/* Editorial reasoning */}
          {post.editorialReasoning && (
            <div className="mt-5 rounded" style={{ background: 'rgba(232,116,12,0.04)', border: '1px solid rgba(232,116,12,0.12)', padding: '0.75rem 1rem' }}>
              <p className="font-mono font-bold uppercase text-[10px] tracking-wider" style={{ color: 'var(--color-bitcoin)', marginBottom: 4 }}>
                Editorial Reasoning
              </p>
              <p className="font-sans text-[13px] text-ink-light leading-relaxed">
                {post.editorialReasoning}
              </p>
            </div>
          )}

          {/* Source */}
          {post.source && (
            <div className="mt-3 flex items-start gap-2">
              <span className="font-mono font-bold uppercase text-[10px] tracking-wider text-ink-faint shrink-0" style={{ marginTop: 2 }}>Source</span>
              <span className="font-sans text-[13px] text-ink-muted">{post.source}</span>
            </div>
          )}

          {/* Provenance — on-chain inscription link */}
          {post.provenanceUrl && (
            <div className="mt-3 flex items-start gap-2">
              <span className="font-mono font-bold uppercase text-[10px] tracking-wider text-ink-faint shrink-0" style={{ marginTop: 2 }}>Provenance</span>
              <a
                href={post.provenanceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[12px] hover:underline"
                style={{ color: 'var(--color-bitcoin)', wordBreak: 'break-all' }}
              >
                {post.provenanceUrl.includes('ordinals.com') ? 'View Bitcoin Ordinals Inscription ↗' : post.provenanceUrl}
              </a>
            </div>
          )}

          {post.quotedTweetId && (
            <div className="mt-5">
              <TweetEmbed tweetId={post.quotedTweetId} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function Feed({ posts, streamMode = false }: { posts: LocalPost[]; streamMode?: boolean }) {
  const [rejected, setRejected] = useState<RejectedCartoon[]>([])
  const [showRejected, setShowRejected] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('feed')
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [videoSrc, setVideoSrc] = useState<string | null>(null)
  const [selectedPost, setSelectedPost] = useState<{ post: LocalPost; number: number } | null>(null)

  const handleImageClick = useCallback((post: LocalPost, fallback?: () => void) => {
    if (streamMode) return
    const safeSrc = post.videoPath ? sanitizeVideoPath(post.videoPath) : null
    if (safeSrc) {
      setVideoSrc(safeSrc)
    } else if (fallback) {
      fallback()
    }
  }, [streamMode])

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/feed/rejected')
        if (res.ok) setRejected(await res.json())
      } catch {}
    }
    load()
    const interval = setInterval(load, 30_000)
    return () => clearInterval(interval)
  }, [])

  if (posts.length === 0 && rejected.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-paper gap-6 px-8">
        <svg width="72" height="72" viewBox="0 0 72 72" fill="none" className="text-ink-faint animate-[float_3s_ease-in-out_infinite]">
          <rect x="12" y="8" width="48" height="56" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12 48L28 32L40 44L48 36L60 48" stroke="currentColor" strokeWidth="1" opacity="0.3" />
          <circle cx="48" cy="22" r="4" stroke="currentColor" strokeWidth="1" opacity="0.25" />
        </svg>
        <div className="text-center max-w-xs">
          <p className="font-editorial text-xl text-ink-light">No posts yet</p>
          <p className="font-sans text-[13px] text-ink-muted mt-2 leading-relaxed">
            AIBTC Media is scanning for something worth covering.
            <br />
            <span className="text-ink-faint">New posts appear here as they're published.</span>
          </p>
        </div>
      </div>
    )
  }

  // Auto-scroll in stream mode
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!streamMode || !scrollRef.current) return
    const el = scrollRef.current
    let direction = 1
    const tick = setInterval(() => {
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 2
      const atTop = el.scrollTop <= 0
      if (atBottom) direction = -1
      if (atTop) direction = 1
      el.scrollTop += direction * 1
    }, 50)
    return () => clearInterval(tick)
  }, [streamMode, posts.length])

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto bg-paper">
      {/* Feed header */}
      <div style={{ padding: '1.5rem 2rem 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="font-editorial" style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-ink)' }}>Latest</span>
            <span className="font-mono" style={{ fontSize: 11, color: 'var(--color-ink-faint)' }}>
              {posts.length} published
            </span>
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button
              onClick={() => setViewMode('feed')}
              className={`btn ${viewMode === 'feed' ? 'btn-active' : ''}`}
            >
              Feed
            </button>
            <button
              onClick={() => setViewMode('gallery')}
              className={`btn ${viewMode === 'gallery' ? 'btn-active' : ''}`}
            >
              Grid
            </button>
            {rejected.length > 0 && (
              <button
                onClick={() => setShowRejected(!showRejected)}
                className={`btn ${showRejected ? 'btn-active' : ''}`}
                style={{ marginLeft: 4 }}
              >
                {showRejected ? 'Hide Rejected' : `${rejected.length} Rejected`}
              </button>
            )}
          </div>
        </div>
      </div>

      <div style={{ padding: '0 2rem 2rem' }}>
        {viewMode === 'gallery' ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {posts.map((post, i) => (
                post.imagePath && (
                  <div
                    key={post.id}
                    className="editorial-card overflow-hidden cursor-pointer group animate-[fade-in_0.3s_ease-out]"
                    style={{ animationDelay: `${i * 0.03}s`, animationFillMode: 'backwards' }}
                    onClick={() => handleImageClick(post, () => setLightboxIndex(i))}
                  >
                    <div className="relative overflow-hidden bg-paper">
                      <img
                        src={sanitizeImagePath(post.imagePath)}
                        alt="post"
                        className="w-full h-auto object-contain group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                        style={{ borderRadius: '4px 4px 0 0' }}
                      />
                      {post.videoPath && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="w-10 h-10 rounded-full bg-ink/60 flex items-center justify-center group-hover:bg-bitcoin/80 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="white"><polygon points="6 3 20 12 6 21 6 3"/></svg>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="font-editorial text-[14px] sm:text-[16px] text-ink font-semibold leading-snug line-clamp-2">
                        {post.text.split('\n')[0]}
                      </p>
                      <time className="block mt-1 font-mono text-[10px] text-ink-faint uppercase">
                        {formatDate(post.createdAt)}
                      </time>
                    </div>
                  </div>
                )
              ))}
            </div>

            {/* Lightbox */}
            {lightboxIndex !== null && posts[lightboxIndex] && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/80 backdrop-blur-sm animate-[fade-in_0.15s_ease-out]"
                onClick={() => setLightboxIndex(null)}
              >
                <div
                  className="relative max-w-4xl w-full max-h-[90vh] bg-paper-bright rounded overflow-y-auto"
                  style={{ border: '1px solid var(--color-border)' }}
                  onClick={e => e.stopPropagation()}
                >
                  <button
                    onClick={() => setLightboxIndex(null)}
                    className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center bg-paper-bright/90 rounded text-ink hover:text-bitcoin"
                    style={{ border: '1px solid var(--color-border)' }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                  {posts[lightboxIndex].videoPath && sanitizeVideoPath(posts[lightboxIndex].videoPath!) ? (
                    <video
                      src={sanitizeVideoPath(posts[lightboxIndex].videoPath!)!}
                      controls
                      autoPlay
                      playsInline
                      className="w-full bg-ink"
                    />
                  ) : posts[lightboxIndex].imagePath ? (
                    <img
                      src={sanitizeImagePath(posts[lightboxIndex].imagePath!)}
                      alt="post"
                      className="w-full object-contain"
                    />
                  ) : null}
                  <div className="p-6 sm:p-8">
                    <p className="font-editorial text-[22px] sm:text-[28px] text-ink font-bold leading-snug">
                      {posts[lightboxIndex].text.split('\n')[0]}
                    </p>
                    {posts[lightboxIndex].text.split('\n').slice(1).filter(Boolean).length > 0 && (
                      <p className="mt-2 font-editorial text-[14px] text-ink-muted italic leading-relaxed">
                        {posts[lightboxIndex].text.split('\n').slice(1).join('\n')}
                      </p>
                    )}
                    <div className="mt-4 flex items-center gap-3">
                      <time className="font-mono text-[11px] font-medium text-ink-muted tabular-nums uppercase tracking-wide">
                        {formatDate(posts[lightboxIndex].createdAt)}
                      </time>
                      <span className="text-ink-faint">&middot;</span>
                      <span className="font-mono text-[11px] font-medium text-ink-muted uppercase tracking-wide">by AIBTC Media</span>
                    </div>
                    {posts[lightboxIndex].quotedTweetId && (
                      <div className="mt-5">
                        <TweetEmbed tweetId={posts[lightboxIndex].quotedTweetId!} />
                      </div>
                    )}
                  </div>
                  <div className="flex justify-between px-6 pb-4">
                    <button
                      onClick={() => setLightboxIndex(Math.max(0, lightboxIndex - 1))}
                      disabled={lightboxIndex === 0}
                      className="btn disabled:opacity-30"
                    >
                      &larr; Prev
                    </button>
                    <button
                      onClick={() => setLightboxIndex(Math.min(posts.length - 1, lightboxIndex + 1))}
                      disabled={lightboxIndex === posts.length - 1}
                      className="btn disabled:opacity-30"
                    >
                      Next &rarr;
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
        <div className="max-w-3xl space-y-6">
          {posts.map((post, i) => (
            <article
              key={post.id}
              className="editorial-card overflow-hidden animate-[fade-in_0.4s_ease-out] cursor-pointer hover:shadow-md transition-shadow"
              style={{ animationDelay: `${i * 0.06}s`, animationFillMode: 'backwards' }}
              onClick={() => {
                if (streamMode) return
                const s = post.videoPath ? sanitizeVideoPath(post.videoPath) : null
                if (s) { setVideoSrc(s) } else { setSelectedPost({ post, number: posts.length - i }) }
              }}
            >
              {post.imagePath && (
                <div className="relative overflow-hidden group">
                  <img
                    src={sanitizeImagePath(post.imagePath)}
                    alt="post"
                    className="w-full object-contain group-hover:scale-[1.02] transition-transform duration-300"
                    loading="lazy"
                    style={{ borderRadius: '4px 4px 0 0' }}
                  />
                  {post.videoPath && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-14 h-14 rounded-full bg-ink/50 flex items-center justify-center group-hover:bg-bitcoin/80 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white"><polygon points="6 3 20 12 6 21 6 3"/></svg>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div style={{ padding: '1rem 1.25rem 1.25rem' }}>
                <p className="font-editorial" style={{ fontSize: 20, fontWeight: 600, color: 'var(--color-ink)', lineHeight: 1.3, marginBottom: '0.25rem' }}>
                  {post.text.split('\n')[0]}
                </p>
                {post.text.split('\n').slice(1).filter(Boolean).length > 0 && (
                  <p className="font-editorial" style={{ fontSize: 14, color: 'var(--color-ink-muted)', fontStyle: 'italic', lineHeight: 1.5 }}>
                    {post.text.split('\n').slice(1).join('\n')}
                  </p>
                )}
                <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span className="font-mono" style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-bitcoin)', background: 'rgba(232,116,12,0.08)', padding: '2px 6px', borderRadius: 3 }}>
                    #{posts.length - i}
                  </span>
                  <span className="font-mono" style={{ fontSize: 10, color: 'var(--color-ink-faint)' }}>
                    {formatDate(post.createdAt)}
                  </span>
                  <span style={{ color: 'var(--color-ink-faint)' }}>&middot;</span>
                  <span className="font-mono" style={{ fontSize: 10, color: 'var(--color-ink-faint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    by AIBTC Media
                  </span>
                </div>
              </div>

              {post.quotedTweetId && (
                <div className="px-5 pb-4">
                  <TweetEmbed tweetId={post.quotedTweetId} />
                </div>
              )}
            </article>
          ))}

          {/* Rejected cartoons */}
          {showRejected && rejected.length > 0 && (
            <>
              <div className="flex items-center gap-4 pt-4">
                <div className="flex-1 editorial-rule" />
                <span className="font-editorial text-[18px] text-bitcoin font-bold">Rejected by Editor</span>
                <div className="flex-1 editorial-rule" />
              </div>

              {rejected.map((r, i) => (
                <article
                  key={`rejected-${i}`}
                  className="editorial-card overflow-hidden opacity-60 hover:opacity-90 transition-opacity"
                >
                  <div className="relative overflow-hidden">
                    <img
                      src={sanitizeImageUrl(r.imageUrl) ?? '/images/placeholder.png'}
                      alt="rejected"
                      className="w-full object-contain grayscale-[30%]"
                      loading="lazy"
                    />
                    <div className="absolute top-3 right-3 bg-bitcoin text-paper-bright font-mono text-[10px] font-bold px-3 py-1 uppercase tracking-wider rounded">
                      Rejected
                    </div>
                  </div>

                  <div style={{ padding: '1rem 1.25rem 1.25rem' }}>
                    <p className="font-editorial text-[16px] text-ink-muted line-through leading-relaxed italic">
                      {r.caption}
                    </p>
                    <div className="mt-2 rounded" style={{ background: 'rgba(232,116,12,0.05)', border: '1px solid rgba(232,116,12,0.15)', padding: '0.5rem 0.75rem' }}>
                      <p className="text-[12px] text-bitcoin leading-snug">
                        <span className="font-mono font-bold uppercase text-[10px]">Editor: </span>
                        <span className="font-sans">{r.reason}</span>
                      </p>
                    </div>
                    <time className="block mt-2 font-mono text-[10px] text-ink-faint uppercase">
                      {formatDate(r.rejectedAt)}
                    </time>
                  </div>
                </article>
              ))}
            </>
          )}
        </div>
        )}
      </div>

      {videoSrc && <VideoOverlay src={videoSrc} onClose={() => setVideoSrc(null)} />}
      {selectedPost && (
        <PostDetail
          post={selectedPost.post}
          postNumber={selectedPost.number}
          onClose={() => setSelectedPost(null)}
        />
      )}
    </div>
  )
}

function formatDate(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  const d = new Date(ts)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}
