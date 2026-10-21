import { expect, test } from 'vitest'
import { type Gif, gifUrl, isGifData, parseGifs, searchUrl } from '../src/shared/gifs'
import { JINGLES, RING_MS, loopNow } from '../src/shared/jingles'

test('every sound is different from every other', () => {
  const tunes = Object.values(JINGLES).map((n) => JSON.stringify(n))
  expect(new Set(tunes).size).toBe(tunes.length)
  for (const notes of Object.values(JINGLES)) for (const n of notes) expect(n.f > 20 && n.d > 0 && n.t >= 0).toBe(true)
})

test('ringing and the caller tune stop after 40 s, calling first, and nothing ends the call', () => {
  expect(loopNow(1000, 0, [])).toBe('calling')
  expect(loopNow(RING_MS + 1, 0, [])).toBe(null)
  expect(loopNow(1000, 0, [500])).toBe('calling')
  expect(loopNow(1000, null, [500])).toBe('ring')
  expect(loopNow(RING_MS + 600, null, [500])).toBe(null)
  expect(loopNow(RING_MS + 600, null, [500, RING_MS])).toBe('ring')
})

const giphy = {
  data: [
    {
      id: 'abc123',
      title: 'Cat',
      images: {
        fixed_width_small: { url: 'https://media2.giphy.com/media/abc123/100w.gif', width: '100', height: '80' },
        downsized: { url: 'https://media2.giphy.com/media/abc123/giphy-downsized.gif', size: '900000' },
      },
    },
    { id: 'evil', images: { fixed_width_small: { url: 'https://evil.example/x.gif', width: '1', height: '1' }, downsized: { url: 'https://media.giphy.com/x.gif', size: '1' } } },
    { id: 'huge', images: { fixed_width_small: { url: 'https://media.giphy.com/s.gif', width: '1', height: '1' }, downsized: { url: 'https://media.giphy.com/b.gif', size: String(99 * 2 ** 20) } } },
  ],
}
const klipy = {
  results: [
    {
      id: '42',
      content_description: 'Dog',
      media_formats: {
        tinygif: { url: 'https://static.klipy.com/ii/d/42/tiny.gif', dims: [120, 90], size: 1000 },
        gif: { url: 'https://static.klipy.com/ii/d/42/full.gif', dims: [480, 360], size: 500000 },
      },
    },
    { id: '43', media_formats: { tinygif: { url: 'http://static.klipy.com/t.gif', dims: [1, 1] }, gif: { url: 'https://static.klipy.com/g.gif' } } },
  ],
}

test('GIF results keep only https links on the provider\'s own media hosts, within the size limit', () => {
  expect(parseGifs('giphy', giphy)).toEqual<Gif[]>([
    { id: 'abc123', title: 'Cat', preview: { url: 'https://media2.giphy.com/media/abc123/100w.gif', w: 100, h: 80 }, full: { url: 'https://media2.giphy.com/media/abc123/giphy-downsized.gif', size: 900000 } },
  ])
  expect(parseGifs('klipy', klipy).map((g) => [g.id, g.title, g.preview.w])).toEqual([['42', 'Dog', 120]])
  expect(parseGifs('giphy', { data: 'nope' })).toEqual([])
  expect(parseGifs('klipy', null)).toEqual([])
  expect(gifUrl('klipy', 'https://static.klipy.com.evil.example/x.gif')).toBe(false)
  expect(gifUrl('giphy', 'https://i.giphy.com/x.gif')).toBe(true)
})

test('searching asks for trending with nothing typed, and a filtered search otherwise', () => {
  expect(searchUrl('giphy', 'K', '')).toMatch(/^https:\/\/api\.giphy\.com\/v1\/gifs\/trending\?api_key=K&limit=24&rating=pg-13$/)
  expect(searchUrl('klipy', 'K', ' hi & bye ')).toMatch(/^https:\/\/api\.klipy\.com\/v2\/search\?key=K&q=hi\+%26\+bye&limit=24&contentfilter=medium/)
  expect(isGifData(new TextEncoder().encode('GIF89a....'))).toBe(true)
  expect(isGifData(new TextEncoder().encode('<html>....'))).toBe(false)
})
