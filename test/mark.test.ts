import { describe, expect, it } from 'vitest'
import { banner, bytesOf, cleanWeave, defaultWeave, picture } from '../src/shared/mark'
import { MAX_MEDIA, cleanProfile, statusOf } from '../src/shared/protocol'

const key = (seed: number) => Array.from({ length: 32 }, (_, i) => ((seed * 97 + i * 31) & 255).toString(16).padStart(2, '0')).join('')

describe('pictures and banners from a key', () => {
  it('draws the same key the same way every time', () => {
    expect(picture(key(1))).toEqual(picture(key(1)))
    expect(banner(key(1))).toEqual(banner(key(1)))
  })

  it('draws different keys differently', () => {
    const seen = new Set(Array.from({ length: 40 }, (_, i) => JSON.stringify(picture(key(i + 1)).shapes)))
    expect(seen.size).toBe(40)
  })

  it('stretches short ids to 32 bytes that still differ', () => {
    const b = bytesOf('0123456789abcdef0123456789abcdef')
    expect(b).toHaveLength(32)
    expect(b.slice(0, 16)).not.toEqual(b.slice(16))
    expect(bytesOf('')).toHaveLength(32)
  })

  it('keeps every shape inside the picture', () => {
    for (let i = 0; i < 50; i++)
      for (const s of picture(key(i)).shapes) {
        if (s.a.cx !== undefined) expect(+s.a.cx).toBeGreaterThanOrEqual(0), expect(+s.a.cx).toBeLessThanOrEqual(100)
        if (s.a.x !== undefined) expect(+s.a.x).toBeGreaterThanOrEqual(0)
      }
  })

  it('draws all four weaves, wide and tall, and the tone shift changes the colours', () => {
    for (let kind = 0; kind < 4; kind++) {
      expect(banner(key(3), { kind, shift: 0 }).shapes.length).toBeGreaterThan(1)
      expect(banner(key(3), { kind, shift: 0 }, false).h).toBe(700)
    }
    expect(banner(key(3), { kind: 0, shift: 0 }).shapes[0]).not.toEqual(banner(key(3), { kind: 0, shift: 120 }).shapes[0])
    expect(defaultWeave(key(3)).kind).toBeLessThan(4)
  })

  it('keeps only a valid chosen weave from a peer', () => {
    expect(cleanWeave({ kind: 2, shift: 40 })).toEqual({ kind: 2, shift: 40 })
    expect(cleanWeave({ kind: 2, shift: 40, extra: 'x' })).toEqual({ kind: 2, shift: 40 })
    for (const bad of [null, 'x', { kind: 4, shift: 0 }, { kind: 1, shift: 360 }, { kind: 1.5, shift: 0 }, { kind: '1', shift: 0 }]) expect(cleanWeave(bad)).toBeUndefined()
  })
})

describe('a profile banner', () => {
  const base = { handle: 'ann#1234', name: 'Ann', about: '', avatar: '' }
  const gif = 'data:image/gif;base64,R0lGODlhAQABAAAAACw='
  it('keeps a weave, the softened picture, or a picture or GIF of their own, and the game art switch', () => {
    expect(cleanProfile({ ...base, banner: { kind: 1, shift: 20 } }).banner).toEqual({ kind: 1, shift: 20 })
    expect(cleanProfile({ ...base, banner: { fade: true } }).banner).toEqual({ fade: true })
    expect(cleanProfile({ ...base, banner: { pic: gif } }).banner).toEqual({ pic: gif })
    expect(cleanProfile({ ...base, avatar: gif }).avatar).toBe(gif)
    expect(cleanProfile({ ...base, gameArt: false }).gameArt).toBe(false)
    expect(cleanProfile({ ...base, gameArt: 'no' }).gameArt).toBeUndefined()
  })
  it('drops what is not a picture, or too large to travel', () => {
    expect(cleanProfile({ ...base, banner: { pic: 'javascript:alert(1)' } }).banner).toBeUndefined()
    expect(cleanProfile({ ...base, banner: { pic: 'data:image/gif;base64,' + 'A'.repeat(MAX_MEDIA) } }).banner).toBeUndefined()
    expect(cleanProfile({ ...base, avatar: 'data:image/svg+xml;base64,AAAA' }).avatar).toBe('')
  })
})

describe('a status', () => {
  const base = { handle: 'ann#1234', name: 'Ann', about: '', avatar: '' }
  it('keeps the text, an end time and quiet, and runs out at its end', () => {
    const p = cleanProfile({ ...base, status: { text: '  ranked grind  ', until: 2000, quiet: true, extra: 1 } })
    expect(p.status).toEqual({ text: 'ranked grind', until: 2000, quiet: true })
    expect(statusOf(p, 1999)).toEqual(p.status)
    expect(statusOf(p, 2000)).toBeUndefined()
    expect(cleanProfile({ ...base, status: { text: '' } }).status).toBeUndefined()
    expect(cleanProfile({ ...base, status: { text: 'x'.repeat(100) } }).status!.text).toHaveLength(60)
  })
})
