// GIF search through GIPHY and KLIPY (KLIPY took over Tenor's API format when Google shut Tenor's API down in
// June 2026). Only the person searching talks to them: a chosen GIF is downloaded once and sent like any other
// picture (main/files.ts), so the people receiving it never contact either service.

export type GifProvider = 'giphy' | 'klipy'
export type Gif = { id: string; title: string; preview: { url: string; w: number; h: number }; full: { url: string; size: number } }

export const GIF_MAX_BYTES = 15 * 2 ** 20 // a GIF bigger than this is skipped in the results
export const GIF_PAGE = 24

// Where previews and GIFs may come from; anything else in a response is ignored.
const HOSTS: Record<GifProvider, RegExp> = { giphy: /^(media\d*|i)\.giphy\.com$/, klipy: /^static\d*\.klipy\.com$/ }
export function gifUrl(p: GifProvider, u: unknown): u is string {
  if (typeof u !== 'string' || u.length > 2000) return false
  try {
    const url = new URL(u)
    return url.protocol === 'https:' && HOSTS[p].test(url.hostname)
  } catch {
    return false
  }
}

export function searchUrl(p: GifProvider, key: string, q: string) {
  const query = q.trim().slice(0, 100)
  if (p === 'giphy') {
    const kind = query ? 'search' : 'trending'
    return `https://api.giphy.com/v1/gifs/${kind}?${new URLSearchParams({ api_key: key, ...(query && { q: query }), limit: String(GIF_PAGE), rating: 'pg-13' })}`
  }
  const kind = query ? 'search' : 'featured'
  return `https://api.klipy.com/v2/${kind}?${new URLSearchParams({ key, ...(query && { q: query }), limit: String(GIF_PAGE), contentfilter: 'medium', media_filter: 'gif,tinygif' })}`
}

const num = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : 0)
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')

// Responses come from a third party, so each result is checked: https links on the provider's own media hosts,
// sane sizes, and a size limit on the GIF itself.
export function parseGifs(p: GifProvider, json: any): Gif[] {
  const raw: any[] = p === 'giphy' ? json?.data : json?.results
  if (!Array.isArray(raw)) return []
  const out: Gif[] = []
  for (const r of raw.slice(0, 50)) {
    const prev = p === 'giphy' ? (r?.images?.fixed_width_small ?? r?.images?.fixed_width) : r?.media_formats?.tinygif
    const full = p === 'giphy' ? (r?.images?.downsized ?? r?.images?.original) : r?.media_formats?.gif
    const id = str(r?.id, 100)
    const w = num(p === 'giphy' ? prev?.width : prev?.dims?.[0])
    const h = num(p === 'giphy' ? prev?.height : prev?.dims?.[1])
    const size = num(full?.size)
    if (!/^[\w-]+$/.test(id) || !gifUrl(p, prev?.url) || !gifUrl(p, full?.url) || !w || !h || size > GIF_MAX_BYTES) continue
    out.push({ id, title: str(r?.title ?? r?.content_description, 140), preview: { url: prev.url, w, h }, full: { url: full.url, size } })
  }
  return out
}

// What the downloaded bytes must start with to be sent as a GIF.
export const isGifData = (b: Uint8Array) => b.length > 6 && String.fromCharCode(...b.subarray(0, 6)).match(/^GIF8[79]a$/) !== null
