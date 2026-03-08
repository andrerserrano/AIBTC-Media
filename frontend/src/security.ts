const CONTROL_CHAR_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g
const FILENAME_RE = /^[\w\-. ]+\.(png|jpg|jpeg|gif|webp|svg)$/i

export function sanitizeText(text: string): string {
  return text.replace(CONTROL_CHAR_RE, '').trim()
}

export function sanitizeDisplayName(name: string): string {
  return name.replace(CONTROL_CHAR_RE, '').trim().slice(0, 32)
}

export function sanitizeImagePath(imagePath: string): string {
  if (imagePath.startsWith('https://')) {
    try { if (new URL(imagePath).protocol === 'https:') return imagePath } catch {}
    return '/images/placeholder.png'
  }
  const filename = imagePath.split('/').pop() ?? ''
  if (!FILENAME_RE.test(filename)) return '/images/placeholder.png'
  return `/images/${filename}`
}

const VIDEO_FILENAME_RE = /^[\w\-. ]+\.(mp4|webm|mov|ogg)$/i

export function sanitizeVideoPath(videoPath: string): string | null {
  if (!videoPath || typeof videoPath !== 'string') return null
  if (videoPath.startsWith('https://')) {
    try { if (new URL(videoPath).protocol === 'https:') return videoPath } catch {}
    return null
  }
  const filename = videoPath.split('/').pop() ?? ''
  if (!VIDEO_FILENAME_RE.test(filename)) return null
  return `/videos/${filename}`
}

export function sanitizeImageUrl(url: string): string | null {
  if (!url || typeof url !== 'string') return null
  if (url.startsWith('/images/')) return sanitizeImagePath(url)
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return null
    return parsed.href
  } catch {
    return null
  }
}
