import { artUrl } from '../shared/activity'
import { MAX_GIF } from '../shared/protocol'

// The GIF picker's search. KLIPY's key comes in at build time (MAIN_VITE_KLIPY_API_KEY in .env.local, or the release
// workflow's secret); without one, search is off and the picker offers only the GIFs on this computer. What is typed
// goes to KLIPY, nothing else does (no customer id). Previews come through eleusinia-art://klipy/… (index.ts), and a
// GIF that is picked is downloaded here once, then travels by hash like any shared file, so the people who see it
// never reach KLIPY.
export type KlipyHit = { id: string; title: string; w: number; h: number; preview: string; gif: string }
type Fetch = (url: string) => Promise<Response>
const PAGE = 24

// A KLIPY media address as eleusinia-art://klipy/<host>/<path>, or null when it is not one artUrl would fetch back
const art = (url: unknown) => {
  const m = typeof url === 'string' ? /^https:\/\/(static[12]?)\.klipy\.com(\/.+)$/.exec(url) : null
  const a = m && `eleusinia-art://klipy/${m[1]}${m[2]}`
  return a && artUrl(a) === url ? a : null
}

export function hitsOf(j: any): KlipyHit[] {
  return (Array.isArray(j?.data?.data) ? j.data.data : []).flatMap((g: any) => {
    const sm = g?.file?.sm?.webp, full = g?.file?.hd?.gif ?? g?.file?.md?.gif
    const preview = art(sm?.url), gif = art(full?.url)
    if (typeof g?.slug !== 'string' || !preview || !gif) return []
    return [{ id: g.slug.slice(0, 100), title: String(g.title ?? '').slice(0, 100), w: Number(sm.width) || 200, h: Number(sm.height) || 200, preview, gif }]
  })
}

export function createKlipy(key: string | undefined, fetch: Fetch) {
  return {
    on: !!key,
    // Trending without a query. offset: how many are shown already, for the next page.
    async search(q: string, offset = 0): Promise<KlipyHit[]> {
      if (!key) throw new Error('GIF search is not set up in this build')
      q = String(q).trim().slice(0, 50)
      const page = Math.floor(Math.max(0, Math.min(Number(offset) || 0, 2400)) / PAGE) + 1
      const params = new URLSearchParams({ page: String(page), per_page: String(PAGE), content_filter: 'medium', format_filter: 'gif,webp', ...(q && { q }) })
      const r = await fetch(`https://api.klipy.com/api/v1/${encodeURIComponent(key)}/gifs/${q ? 'search' : 'trending'}?${params}`)
      if (!r.ok) throw new Error(`KLIPY did not answer (${r.status})`)
      return hitsOf(await r.json())
    },
    // The whole GIF from a hit's gif address, checked to be one and within MAX_GIF
    async download(gif: string): Promise<Uint8Array> {
      const url = /^eleusinia-art:\/\/klipy\//.test(String(gif)) ? artUrl(String(gif)) : null
      if (!url?.endsWith('.gif')) throw new Error('Not a KLIPY GIF')
      const r = await fetch(url)
      if (!r.ok || !(r.headers.get('content-type') ?? '').startsWith('image/gif')) throw new Error('That GIF could not be downloaded')
      const data = new Uint8Array(await r.arrayBuffer())
      if (data.length > MAX_GIF) throw new Error('That GIF is over 25 MB')
      return data
    },
  }
}
