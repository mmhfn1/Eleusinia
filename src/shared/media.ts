// Files shared in chats: what a message says about each file, and the decisions around fetching and keeping them.
// The bytes never travel inside a message; they are fetched by hash from whoever has them (src/main/files.ts).

export type FileRef = {
  h: string // sha256 of the content, hex
  n: string // file name, no folders
  s: number // size in bytes
  t: string // MIME type
  th?: string // images: a tiny preview as a data URL, shown until the picture itself arrives
}

export const MAX_FILES = 10
export const CHUNK = 64 * 1024
export const AUTO_IMAGE = 25 * 2 ** 20 // pictures up to this size download by themselves; anything else on request
export const DEFAULT_CACHE_MB = 1024

const isHash = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s)
// No folders, control characters or characters Windows forbids, so a name can be shown and saved as it is.
const goodName = (s: unknown): s is string => typeof s === 'string' && s.length >= 1 && s.length <= 200 && !/[\\/:*?"<>|\x00-\x1f]/.test(s) && s.trim() === s
export const isMime = (s: unknown): s is string => typeof s === 'string' && /^[a-z]+\/[a-z0-9.+-]{1,100}$/.test(s)
const goodThumb = (s: unknown) => s === undefined || (typeof s === 'string' && s.length <= 12000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s))

// File references arrive from other people inside signed messages, so each one is checked strictly: any bad field
// rejects the whole message rather than being repaired (the signature covers it as sent).
export const validFileRef = (f: any): f is FileRef =>
  !!f && typeof f === 'object' && isHash(f.h) && goodName(f.n) && Number.isSafeInteger(f.s) && f.s >= 0 && isMime(f.t) && goodThumb(f.th)
export const validFiles = (fs: unknown): fs is FileRef[] => Array.isArray(fs) && fs.length >= 1 && fs.length <= MAX_FILES && fs.every(validFileRef)
// What the signature covers, in a fixed order whatever order the fields arrived in.
export const filesBody = (fs: FileRef[]) => fs.map((f) => [f.h, f.n, f.s, f.t, f.th ?? ''])

// How a file is shown in the chat. Never inline: SVG and HTML (they can run scripts), or anything unknown.
const INLINE: Record<string, 'image' | 'video' | 'audio'> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'image/avif': 'image',
  'video/mp4': 'video',
  'video/webm': 'video',
  'audio/mpeg': 'audio',
  'audio/ogg': 'audio',
  'audio/wav': 'audio',
  'audio/webm': 'audio',
  'audio/flac': 'audio',
  'audio/mp4': 'audio',
}
export const inlineKind = (t: string) => (Object.hasOwn(INLINE, t) ? INLINE[t] : null)
export const autoFetch = (f: FileRef) => inlineKind(f.t) === 'image' && f.s <= AUTO_IMAGE

const TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska',
  mp3: 'audio/mpeg', ogg: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', flac: 'audio/flac', m4a: 'audio/mp4',
  pdf: 'application/pdf', zip: 'application/zip', txt: 'text/plain', svg: 'image/svg+xml', html: 'text/html', htm: 'text/html',
}
export const mimeOf = (name: string) => TYPES[name.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream'

// A file name from someone else, made safe to offer in a save dialog on Windows: no folders, forbidden characters,
// reserved device names (CON, NUL, COM1…) or trailing dots and spaces.
export function safeName(n: string) {
  let s = String(n).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/[. ]+$/, '').slice(0, 200)
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(s)) s = '_' + s
  return s || 'file'
}

export const sizeLabel = (b: number) =>
  b < 1024 ? `${b} B` : b < 2 ** 20 ? `${Math.round(b / 1024)} KB` : b < 2 ** 30 ? `${(b / 2 ** 20).toFixed(1)} MB` : `${(b / 2 ** 30).toFixed(2)} GB`

// Which cached files to delete so the cache fits its limit: the least recently used first.
export function evict(cached: { h: string; size: number; at: number }[], limitBytes: number) {
  let total = cached.reduce((n, c) => n + c.size, 0)
  const out: string[] = []
  for (const c of [...cached].sort((a, b) => a.at - b.at)) {
    if (total <= limitBytes) break
    out.push(c.h)
    total -= c.size
  }
  return out
}
