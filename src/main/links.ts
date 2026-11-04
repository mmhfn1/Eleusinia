import { nativeImage } from 'electron'
import { LINK_IMAGE_MAX, type LinkPreview, isWebUrl, metaOf } from '../shared/links'

// The preview of a link someone is about to send: fetched by their own app (so only the sender's address reaches the
// site, as if they had opened it), without cookies, a page's first 512 KB and a picture of at most 3 MB, which is
// re-encoded as a small JPEG so nothing of the original file travels on.
const UA = 'Mozilla/5.0 (compatible; Eleusinia link preview)'

async function read(url: string, max: number, accept: RegExp): Promise<{ bytes: Buffer; url: string } | null> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,image/*;q=0.8' }, redirect: 'follow', signal: AbortSignal.timeout(5000) })
  if (!res.ok || !accept.test(res.headers.get('content-type') ?? '') || !res.body) return null
  const reader = res.body.getReader()
  const parts: Uint8Array[] = []
  let size = 0
  while (size < max) {
    const { done, value } = await reader.read()
    if (done) break
    parts.push(value)
    size += value.byteLength
  }
  reader.cancel().catch(() => {})
  return { bytes: Buffer.concat(parts).subarray(0, max), url: res.url || url }
}

function thumb(bytes: Buffer): string | undefined {
  let img = nativeImage.createFromBuffer(bytes)
  if (img.isEmpty()) return undefined
  for (const [width, q] of [[320, 72], [220, 60], [160, 50]]) {
    if (img.getSize().width > width) img = img.resize({ width, quality: 'good' })
    const url = 'data:image/jpeg;base64,' + img.toJPEG(q).toString('base64')
    if (url.length <= LINK_IMAGE_MAX) return url
  }
  return undefined
}

async function fetchPreview(url: string): Promise<LinkPreview | null> {
  const page = await read(url, 512 * 1024, /text\/html|application\/xhtml/i)
  if (!page) return null
  const m = metaOf(page.bytes.toString('utf8'), page.url)
  const pic = m.image ? await read(m.image, 3 * 2 ** 20, /^image\//i).catch(() => null) : null
  const i = pic ? thumb(pic.bytes) : undefined
  const p: LinkPreview = { u: url, ...(m.t && { t: m.t }), ...(m.d && { d: m.d }), s: m.s ?? new URL(page.url).hostname.replace(/^www\./, ''), ...(i && { i }) }
  return p.t || p.d || p.i ? p : null
}

// The last few links asked for, so typing past a link does not fetch it again.
const recent = new Map<string, Promise<LinkPreview | null>>()
export function previewLink(url: unknown): Promise<LinkPreview | null> {
  if (!isWebUrl(url)) return Promise.resolve(null)
  if (!recent.has(url)) {
    recent.set(url, fetchPreview(url).catch(() => null))
    if (recent.size > 30) recent.delete(recent.keys().next().value!)
  }
  return recent.get(url)!
}
