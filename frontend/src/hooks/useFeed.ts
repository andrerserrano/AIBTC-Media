import { useState, useEffect } from 'react'
import type { LocalPost } from '../types'
import { SEED_POSTS } from '../data/seedPosts'

export function useFeed() {
  const [posts, setPosts] = useState<LocalPost[]>(SEED_POSTS)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/feed')
        const data: LocalPost[] = await res.json()
        // Merge: live posts first, then seed posts not already in the live feed
        const liveIds = new Set(data.map(p => p.id))
        setPosts([
          ...data,
          ...SEED_POSTS.filter(sp => !liveIds.has(sp.id)),
        ])
      } catch {
        // API unavailable (e.g. static deploy) — keep showing seed posts
      }
    }

    load()
    const interval = setInterval(load, 15_000)
    return () => clearInterval(interval)
  }, [])

  return posts
}
