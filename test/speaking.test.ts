import { expect, test } from 'vitest'
import { HANG_MS, SPEAKING_RMS, hear, rms } from '../src/shared/speaking'

test('rms of silence, a constant and a sine', () => {
  expect(rms([])).toBe(0)
  expect(rms(new Float32Array(512))).toBe(0)
  expect(rms([0.5, -0.5, 0.5, -0.5])).toBeCloseTo(0.5)
  const sine = Float32Array.from({ length: 4800 }, (_, i) => 0.2 * Math.sin((2 * Math.PI * 440 * i) / 48000))
  expect(rms(sine)).toBeCloseTo(0.2 / Math.SQRT2, 3)
})

test('above the threshold is speaking; at or below it, with nothing earlier, is not', () => {
  expect(hear(SPEAKING_RMS * 2, 1000, null)).toEqual({ speaking: true, loudAt: 1000 })
  expect(hear(SPEAKING_RMS, 1000, null)).toEqual({ speaking: false, loudAt: null })
  expect(hear(0, 1000, null)).toEqual({ speaking: false, loudAt: null })
})

test('the ring holds for the hang time after the level drops, then goes off', () => {
  let loudAt: number | null = null
  const at = (level: number, now: number) => {
    const r = hear(level, now, loudAt)
    loudAt = r.loudAt
    return r.speaking
  }
  expect(at(0.1, 0)).toBe(true)
  expect(at(0, 100)).toBe(true) // a gap between words
  expect(at(0, HANG_MS - 1)).toBe(true)
  expect(at(0, HANG_MS)).toBe(false)
  expect(at(0, 5000)).toBe(false)
})

test('short gaps in speech never turn the ring off', () => {
  let loudAt: number | null = null
  const states: boolean[] = []
  // 20 readings a second: loud for 3, quiet for 3 (150 ms), repeated, as in normal speech.
  for (let i = 0; i < 60; i++) {
    const r = hear(i % 6 < 3 ? 0.08 : 0.002, i * 50, loudAt)
    loudAt = r.loudAt
    states.push(r.speaking)
  }
  expect(states.every(Boolean)).toBe(true)
})

test('a custom threshold and hang time are respected', () => {
  expect(hear(0.05, 0, null, 0.1).speaking).toBe(false)
  expect(hear(0.2, 0, null, 0.1).speaking).toBe(true)
  expect(hear(0, 99, 0, 0.1, 100).speaking).toBe(true)
  expect(hear(0, 100, 0, 0.1, 100).speaking).toBe(false)
})
