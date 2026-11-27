import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { THEME_DEFAULT, THEME_LIMITS, banner, bytesOf, cleanTheme, cleanWeave, defaultWeave, picture, THEME_FX, themeFlat, tones } from '../src/shared/mark'
import { MAX_MEDIA, cleanBanner, cleanCrop, cleanProfile, statusOf } from '../src/shared/protocol'
import { cleanBanner as cleanServerBanner } from '../src/shared/server'
import { profileVersion } from '../src/shared/sync'

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
    expect(cleanProfile({ ...base, gameArt: true }).gameArt).toBe(true)
    expect(cleanProfile({ ...base, gameArt: 'no' }).gameArt).toBeUndefined()
    // on and off are different profiles, and a profile that never set it stays what older copies compute
    const v = (gameArt?: boolean) => profileVersion(cleanProfile({ ...base, ...(gameArt !== undefined && { gameArt }) }))
    expect(new Set([v(), v(true), v(false)]).size).toBe(3)
  })
  it('keeps the crop of a GIF banner when it is a real part of the frame, and only on a GIF', () => {
    const pic = 'data:image/jpeg;base64,' + 'A'.repeat(100), gif = { h: 'a'.repeat(64), s: 1000 }
    expect(cleanCrop({ x: 0.1, y: 0.2, w: 0.5, h: 0.4 })).toEqual({ x: 0.1, y: 0.2, w: 0.5, h: 0.4 })
    expect(cleanCrop({ x: 0.12345, y: 0, w: 0.5, h: 1 })).toEqual({ x: 0.123, y: 0, w: 0.5, h: 1 })
    for (const bad of [null, {}, { x: -0.1, y: 0, w: 0.5, h: 0.5 }, { x: 0.6, y: 0, w: 0.5, h: 0.5 }, { x: 0, y: 0, w: 0.01, h: 0.5 }, { x: 0, y: 0, w: NaN, h: 1 }, { x: '0', y: 0, w: 1, h: 1 }])
      expect(cleanCrop(bad)).toBeUndefined()
    const crop = { x: 0, y: 0.25, w: 1, h: 0.5 }
    expect(cleanBanner({ pic, gif, crop })).toEqual({ pic, gif, crop })
    expect(cleanBanner({ pic, crop })).toEqual({ pic }) // a still picture is already cut
    expect(cleanBanner({ pic, gif, crop: { x: 2, y: 0, w: 1, h: 1 } })).toEqual({ pic, gif })
    expect(cleanServerBanner({ pic, gif, crop, dark: 30 })).toEqual({ pic, gif, crop, dark: 30 })
    expect(cleanServerBanner({ pic, crop })).toEqual({ pic })
  })
  it('drops what is not a picture, or too large to travel', () => {
    expect(cleanProfile({ ...base, banner: { pic: 'javascript:alert(1)' } }).banner).toBeUndefined()
    expect(cleanProfile({ ...base, banner: { pic: 'data:image/gif;base64,' + 'A'.repeat(MAX_MEDIA) } }).banner).toBeUndefined()
    expect(cleanProfile({ ...base, avatar: 'data:image/svg+xml;base64,AAAA' }).avatar).toBe('')
  })
  it('keeps a GIF of any size up to 25 MB by hash beside its still, and only with one', () => {
    const still = 'data:image/jpeg;base64,AAAA'
    const ref = { h: 'cd'.repeat(32), s: 25 * 2 ** 20 }
    const p = cleanProfile({ ...base, avatar: still, gif: { ...ref, by: 'x' }, banner: { pic: still, gif: ref } })
    expect(p.gif).toEqual(ref)
    expect(p.banner).toEqual({ pic: still, gif: ref })
    expect(cleanProfile({ ...base, gif: ref }).gif).toBeUndefined() // no still: older copies would show nothing
    expect(cleanProfile({ ...base, avatar: still, gif: { ...ref, s: ref.s + 1 } }).gif).toBeUndefined()
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

describe('a profile theme', () => {
  const ok = { kind: 2, shift: 40, op: 45, fx: 'drift' as const, speed: 1.25, depth: 60 }
  it('keeps a valid theme as it is', () => {
    expect(cleanTheme(ok)).toEqual(ok)
    expect(cleanTheme({ kind: 0, shift: 0, op: 5, speed: 0.5, depth: 10 })).toEqual({ kind: 0, shift: 0, op: 5, speed: 0.5, depth: 10 })
  })
  it('needs a real weave; without one there is no theme', () => {
    for (const bad of [null, 'arcade', 5, {}, { kind: 4, shift: 0 }, { kind: 1, shift: 360 }, { kind: '1', shift: 0 }, { kind: 1.5, shift: 0 }]) expect(cleanTheme(bad)).toBeUndefined()
  })
  it('takes the default for a number out of range, and snaps the rest to the sliders', () => {
    expect(cleanTheme({ kind: 1, shift: 9, op: 900, speed: -1, depth: 'x' })).toEqual({ kind: 1, shift: 9, ...THEME_DEFAULT })
    expect(cleanTheme({ kind: 1, shift: 9, op: 22.4, speed: 1.1, depth: 44 })).toEqual({ kind: 1, shift: 9, op: 22, speed: 1, depth: 40 })
    expect(cleanTheme({ kind: 1, shift: 9, op: NaN, speed: Infinity })).toEqual({ kind: 1, shift: 9, ...THEME_DEFAULT })
  })
  it('knows the six effects; one it does not know, as from a newer copy, shows the theme still', () => {
    for (const fx of THEME_FX) expect(cleanTheme({ ...ok, fx })?.fx).toBe(fx)
    expect(THEME_FX).toEqual(['drift', 'breathe', 'orbit', 'tide', 'shimmer', 'parallax'])
    const newer = cleanTheme({ ...ok, fx: 'sparkle' })
    expect(newer).toEqual({ kind: 2, shift: 40, op: 45, speed: 1.25, depth: 60 })
  })
  it('starts at strength 45 and depth 60', () => {
    expect(THEME_DEFAULT).toEqual({ op: 45, speed: 1, depth: 60 })
  })
  it('round-trips through the profile and its wire copy, and changes the version', () => {
    const p = cleanProfile({ name: 'Mira', handle: 'mira#2210', about: '', avatar: '', theme: ok })
    expect(p.theme).toEqual(ok)
    expect(cleanProfile(JSON.parse(JSON.stringify(p)))).toEqual(p)
    expect(profileVersion(p)).not.toBe(profileVersion({ ...p, theme: undefined }))
    expect(profileVersion(p)).not.toBe(profileVersion({ ...p, theme: { ...ok, op: 30 } }))
    // without a theme the version is what older copies compute
    const { theme: _, ...plain } = p
    expect(profileVersion(plain)).toBe(profileVersion(cleanProfile(plain)))
    expect(cleanProfile({ ...p, theme: { kind: 9 } }).theme).toBeUndefined()
  })
  it('stays small enough for the published card', () => {
    expect(JSON.stringify(cleanTheme({ ...ok, extra: 'x'.repeat(5000) })).length).toBeLessThan(100)
  })
})

// WCAG contrast of the card's text over a theme: every weave's flat shapes (themeFlat), at every hue turn and every
// strength, over the card's colour from styles/tokens.css, in both themes. The weave moves only away from the text's
// luminance, so no pixel may read worse than the plain card.
describe('text over a theme', () => {
  const css = readFileSync(new URL('../src/renderer/styles/tokens.css', import.meta.url), 'utf8')
  const tokens = (theme: 'dark' | 'light') => {
    const at = theme === 'dark' ? css.indexOf(':root {') : css.indexOf(":root[data-theme='light'] {")
    const block = css.slice(at, css.indexOf('}', at))
    const hex = (name: string) => block.match(new RegExp(`--${name}: (#[0-9a-f]{6})`))![1]
    return { bg: hex('surface'), text: [hex('ink'), hex('ink-2'), hex('ink-3')] }
  }
  const rgbOf = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const toSrgb = (c: number) => Math.min(1, Math.max(0, c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055))
  const oklch = (s: string) => {
    const [L, C, H] = s.match(/oklch\(([\d.]+) ([\d.]+) (\d+)\)/)!.slice(1).map(Number)
    const a = C * Math.cos((H * Math.PI) / 180), b = C * Math.sin((H * Math.PI) / 180)
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, q = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * q, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * q, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * q].map(toSrgb)
  }
  const mix = (a: number[], b: number[], t: number) => a.map((x, i) => x * (1 - t) + b[i] * t) // b over a at t (sRGB, as browsers blend)
  const lum = (c: number[]) => 0.2126 * toLin(c[0]) + 0.7152 * toLin(c[1]) + 0.0722 * toLin(c[2])
  const contrast = (x: number[], y: number[]) => { const [p, q] = [lum(x), lum(y)].sort((m, n) => n - m); return (p + 0.05) / (q + 0.05) }
  for (const theme of ['dark', 'light'] as const)
    it(`keeps AA in ${theme === 'dark' ? 'Ink' : 'Ivory'} on every weave at every strength`, () => {
      const { bg, text } = tokens(theme)
      const plain = Math.min(...text.map((t) => contrast(rgbOf(t), rgbOf(bg))))
      let worst = Infinity
      for (let seed = 0; seed < 24; seed++)
        for (let shift = 0; shift < 360; shift += 15)
          for (let kind = 0; kind < 4; kind++) {
            const d = banner(key(seed), { kind, shift }, false, themeFlat(theme === 'light'))
            expect(d.shapes.some((x) => x.a.width === 200 && x.a.height === 700)).toBe(false) // no ground of its own
            for (const sh of d.shapes) {
              const px = oklch(String(sh.a.fill === 'none' || !sh.a.fill ? sh.a.stroke : sh.a.fill))
              for (let op = THEME_LIMITS.op[0]; op <= THEME_LIMITS.op[1]; op += 5) {
                const under = mix(rgbOf(bg), px, (op / 100) * Number(sh.a.opacity))
                for (const t of text) worst = Math.min(worst, contrast(rgbOf(t), under))
              }
            }
          }
      expect(worst).toBeGreaterThanOrEqual(plain - 0.01)
      expect(worst).toBeGreaterThanOrEqual(4.5)
      console.log(`${theme}: lowest text contrast over any theme ${worst.toFixed(2)}`)
    })
})
