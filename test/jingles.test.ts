import { expect, test } from 'vitest'
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
