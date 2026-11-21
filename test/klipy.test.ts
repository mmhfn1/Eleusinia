import { expect, test } from 'vitest'
import { artUrl } from '../src/shared/activity'
import { createKlipy, hitsOf } from '../src/main/klipy'

const media = (name: string, ext: string, w = 220) => ({ url: `https://static.klipy.com/ii/0123456789abcdef0123456789abcdef/14/af/${name}.${ext}`, width: w, height: w })
const item = (slug: unknown, file: unknown) => ({ id: 1, slug, title: 'Hello', file })
const good = { sm: { webp: media('SmAll1', 'webp') }, hd: { gif: media('BigOne', 'gif', 498) } }

test('KLIPY results become hits whose pictures come back through eleusinia-art, in the order given', () => {
  const hits = hitsOf({ result: true, data: { data: [item('hello-hi-1', good), item('wave-2', good)] } })
  expect(hits.map((h) => h.id)).toEqual(['hello-hi-1', 'wave-2'])
  expect(hits[0]).toMatchObject({ title: 'Hello', w: 220, h: 220 })
  expect(artUrl(hits[0].preview)).toBe(good.sm.webp.url)
  expect(artUrl(hits[0].gif)).toBe(good.hd.gif.url)
})

test('items without a slug or with media elsewhere are left out', () => {
  const elsewhere = { ...good, hd: { gif: { url: 'https://evil.example/ii/a.gif' } } }
  const dots = { ...good, sm: { webp: { url: 'https://static.klipy.com/ii/../x.webp' } } }
  expect(hitsOf({ data: { data: [item(7, good), item('a', elsewhere), item('b', dots), null] } })).toEqual([])
  expect(hitsOf('junk')).toEqual([])
  expect(artUrl('eleusinia-art://klipy/static3/ii/a.gif')).toBeNull()
})

test('search asks the right page, and a pick downloads only a KLIPY gif', async () => {
  const asked: string[] = []
  const k = createKlipy('KEY', async (url) => {
    asked.push(url)
    if (url.includes('api.klipy.com')) return new Response(JSON.stringify({ data: { data: [item('x', good)] } }))
    return new Response(new Uint8Array([71, 73, 70]), { headers: { 'content-type': 'image/gif' } })
  })
  const [hit] = await k.search('cats', 24)
  expect(asked[0]).toMatch(/^https:\/\/api\.klipy\.com\/api\/v1\/KEY\/gifs\/search\?page=2&per_page=24&.*q=cats/)
  await k.search('')
  expect(asked[1]).toContain('/gifs/trending?page=1')
  expect(await k.download(hit.gif)).toEqual(new Uint8Array([71, 73, 70]))
  await expect(k.download(hit.preview)).rejects.toThrow('Not a KLIPY GIF')
  await expect(createKlipy(undefined, fetch).search('a')).rejects.toThrow('not set up')
})
