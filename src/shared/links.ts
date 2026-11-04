// Links in messages: finding them in text, and the preview a message may carry. No DOM imports, so it can be tested.
// The preview is made by the author's app while they type (main/index.ts, previewLink) and travels in the message,
// signed by the author: whoever reads it fetches nothing, so no site a message names learns who read it.

export type LinkPreview = { u: string; t?: string; d?: string; s?: string; i?: string } // url, title, description, site, image
export const LINK_IMAGE_MAX = 24000

const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/gi
// A link ends before the punctuation that usually follows it in a sentence, and before an unmatched closing bracket.
function trim(url: string) {
  let u = url.replace(/[.,;:!?]+$/, '')
  while (u.endsWith(')') && (u.match(/\(/g)?.length ?? 0) < (u.match(/\)/g)?.length ?? 0)) u = u.slice(0, -1).replace(/[.,;:!?]+$/, '')
  return u
}
// The text cut into plain runs and links, in order, for showing it with the links clickable.
export function splitLinks(text: string): { text: string; url?: string }[] {
  const out: { text: string; url?: string }[] = []
  let at = 0
  for (const m of text.matchAll(URL_RE)) {
    const url = trim(m[0])
    if (!isWebUrl(url)) continue
    if (m.index > at) out.push({ text: text.slice(at, m.index) })
    out.push({ text: url, url })
    at = m.index + url.length
  }
  if (at < text.length) out.push({ text: text.slice(at) })
  return out
}
export const firstLink = (text: string) => splitLinks(text).find((p) => p.url)?.url

export function isWebUrl(v: unknown): v is string {
  if (typeof v !== 'string' || v.length > 2000) return false
  try {
    const u = new URL(v)
    return (u.protocol === 'http:' || u.protocol === 'https:') && !!u.hostname
  } catch {
    return false
  }
}

const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.replace(/\s+/g, ' ').trim().slice(0, max) : undefined)
// A preview from another peer, or from our own fetch: only for a link the text really contains, with short plain
// strings and at most a small JPEG. Anything else is dropped rather than shown.
export function cleanLink(l: unknown, text: string): LinkPreview | null {
  const p = l as Record<string, unknown> | null
  if (!p || typeof p !== 'object' || !isWebUrl(p.u) || !splitLinks(text).some((x) => x.url === p.u)) return null
  const i = typeof p.i === 'string' && p.i.length <= LINK_IMAGE_MAX && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(p.i) ? p.i : undefined
  const out: LinkPreview = { u: p.u }
  const t = str(p.t, 200)
  const d = str(p.d, 300)
  const s = str(p.s, 60)
  if (t) out.t = t
  if (d) out.d = d
  if (s) out.s = s
  if (i) out.i = i
  return out.t || out.d || out.i ? out : null
}
// Exactly what the author signed: the same fields in a fixed order.
export const linkBody = (l: LinkPreview) => [l.u, l.t ?? '', l.d ?? '', l.s ?? '', l.i ?? '']

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (all, e: string) =>
    e[0] === '#' ? String.fromCodePoint(parseInt(e[1] === 'x' || e[1] === 'X' ? e.slice(2) : e.slice(1), e[1] === 'x' || e[1] === 'X' ? 16 : 10) || 32) : (ENTITIES[e.toLowerCase()] ?? all),
  )
// The title, description, site name and picture a page offers for previews (Open Graph, Twitter cards, or its
// <title>), from the start of its HTML. The picture's address is made absolute against the page.
export function metaOf(html: string, page: string): { t?: string; d?: string; s?: string; image?: string } {
  const head = html.slice(0, 200000)
  const tags = [...head.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0])
  const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
  const value = (tag: string, name: string) => {
    const m = attr(tag, name)
    return m ? decode(m[2] ?? m[3] ?? m[4] ?? '') : undefined
  }
  const meta = (...keys: string[]) => {
    for (const key of keys)
      for (const tag of tags) if ((value(tag, 'property') ?? value(tag, 'name'))?.toLowerCase() === key) return value(tag, 'content')?.trim() || undefined
    return undefined
  }
  const title = head.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]
  const out = { t: meta('og:title', 'twitter:title') ?? (title ? decode(title).trim() || undefined : undefined), d: meta('og:description', 'twitter:description', 'description'), s: meta('og:site_name') }
  const img = meta('og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src')
  try {
    const image = img ? new URL(img, page).href : undefined
    return isWebUrl(image) ? { ...out, image } : out
  } catch {
    return out
  }
}
