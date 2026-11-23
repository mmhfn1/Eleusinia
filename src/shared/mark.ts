// Pictures and banners drawn from a key (or a group or server id), so the same key always looks the same and another
// key looks different (design/system). Pure: shapes as data, drawn by the renderer as SVG.

export type Shape = { tag: 'rect' | 'circle' | 'path' | 'line'; a: Record<string, string | number> }
export type Drawing = { w: number; h: number; shapes: Shape[] }
export type Weave = { kind: number; shift: number } // a banner's pattern (0..3) and how far its tones turn (0..359)
export const WEAVES = ['Arcade', 'Skyline', 'Bands', 'Lattice'] as const

// 32 bytes from hex: a key gives its own; a shorter id is stretched, each pass mixed so the bytes still differ.
export function bytesOf(hex: string): number[] {
  const raw: number[] = []
  for (let i = 0; i + 1 < hex.length; i += 2) raw.push(parseInt(hex.slice(i, i + 2), 16) || 0)
  if (!raw.length) raw.push(0)
  const out: number[] = []
  for (let i = 0; i < 32; i++) out.push((raw[i % raw.length] ^ Math.imul(Math.floor(i / raw.length), 167)) & 255)
  return out
}

// Three tones a fixed step apart on the wheel, at lightness both themes allow; shift turns the wheel.
export function tones(b: number[], shift = 0): [string, string, string] {
  const h = ((b[12] * 360) / 256 + shift) % 360, turn = 35 + (b[13] % 4) * 30
  const at = (l: number, c: number, x: number) => `oklch(${l} ${c} ${Math.round(x % 360)})`
  return [at(0.42, 0.07, h), at(0.7, 0.095, h + turn), at(0.9, 0.035, h + 2 * turn)]
}

// A picture: one built form (an arch with a window, a stepped front, a split disc or two quarter circles) and a small
// accent (a sun, a ring, a bar), turned and placed by the key.
export function picture(hex: string): Drawing {
  const b = bytesOf(hex), [c0, c1, c2] = tones(b)
  const turn = [0, 0, 90, 180, 270, 0][b[14] % 6]
  const g = (a: Record<string, string | number>) => ({ ...a, transform: `rotate(${turn} 50 50)` })
  const shapes: Shape[] = [{ tag: 'rect', a: { width: 100, height: 100, fill: c0 } }]
  const kind = b[15] % 4, x = 26 + (b[16] % 20), w = 34 + (b[17] % 18)
  if (kind === 0) {
    shapes.push({ tag: 'path', a: g({ d: `M${x} 100 V${50 - w / 4} a${w / 2} ${w / 2} 0 0 1 ${w} 0 V100 Z`, fill: c1 }) })
    shapes.push({ tag: 'path', a: g({ d: `M${x + w / 2 - 6} 100 V64 a6 6 0 0 1 12 0 V100 Z`, fill: c0 }) })
  } else if (kind === 1) {
    const s = 3 + (b[18] % 2), st = 70 / s
    let d = 'M0 100'
    for (let i = 0; i < s; i++) d += ` V${100 - st * (i + 1)} H${((i + 1) * 100) / (s + 1)}`
    shapes.push({ tag: 'path', a: g({ d: d + ' V100 Z', fill: c1 }) })
  } else if (kind === 2) {
    shapes.push({ tag: 'path', a: g({ d: 'M18 56 a32 32 0 0 1 64 0 Z', fill: c1 }) })
    shapes.push({ tag: 'path', a: g({ d: 'M18 56 a32 32 0 0 0 64 0 Z', fill: c2, opacity: 0.9 }) })
  } else {
    shapes.push({ tag: 'path', a: g({ d: 'M0 100 V30 a70 70 0 0 1 70 70 Z', fill: c1 }) })
    shapes.push({ tag: 'path', a: g({ d: 'M100 0 V46 a46 46 0 0 1 -46 -46 Z', fill: c2, opacity: 0.85 }) })
  }
  const ax = 20 + (b[19] % 60), ay = 18 + (b[20] % 22), acc = b[21] % 3
  if (acc === 0) shapes.push({ tag: 'circle', a: g({ cx: ax, cy: ay, r: 7 + (b[22] % 5), fill: c2 }) })
  if (acc === 1) shapes.push({ tag: 'circle', a: g({ cx: ax, cy: ay, r: 8, fill: 'none', stroke: c2, 'stroke-width': 3 }) })
  if (acc === 2) shapes.push({ tag: 'rect', a: g({ x: ax - 12, y: ay, width: 24, height: 4, rx: 2, fill: c2 }) })
  return { w: 100, h: 100, shapes }
}

export const defaultWeave = (hex: string): Weave => ({ kind: bytesOf(hex)[23] % 4, shift: 0 })

// A banner, fine enough to read as a texture: rows of small arches, a skyline of steps, narrow bands with a few discs,
// or a lattice like a shoji screen. Wide for a profile or server head, tall for a call's banner. `flat` is a profile
// theme's weave (themeFlat): only the hues, at one lightness, with no ground, the shapes stronger since they carry the
// pattern alone.
export type Flat = { L: number; C: number }
export function banner(hex: string, weave: Weave = defaultWeave(hex), wide = true, flat?: Flat): Drawing {
  const b = bytesOf(hex), t = tones(b, weave.shift), w = wide ? 600 : 200, h = wide ? 220 : 700
  const hue = (c: string) => +c.match(/(\d+)\)$/)![1]
  const [c0, c1, c2] = flat ? ['none', `oklch(${flat.L} ${flat.C} ${hue(t[1])})`, `oklch(${flat.L} ${(flat.C * 1.25).toFixed(3)} ${hue(t[2])})`] : t
  const shapes: Shape[] = flat ? [] : [{ tag: 'rect', a: { width: w, height: h, fill: c0 } }]
  const o = (x: number) => (flat ? Math.min(0.95, x * 2.8) : x)
  const k = weave.kind
  if (k === 0) {
    const n = (3 + (b[24] % 2)) * (wide ? 3 : 1), aw = w / n, rh = aw * 1.6
    for (let r = 0; r * rh < h; r++)
      for (let i = 0; i < n; i++) {
        const x = i * aw + aw * 0.18, ww = aw * 0.64, top = r * rh + aw * 0.2
        shapes.push({ tag: 'path', a: { d: `M${x} ${top + rh * 0.8} V${top + ww / 2} a${ww / 2} ${ww / 2} 0 0 1 ${ww} 0 V${top + rh * 0.8} Z`, fill: (r + i) % 5 ? c1 : c2, opacity: o(0.32) } })
      }
  } else if (k === 1) {
    const s = (6 + (b[25] % 4)) * (wide ? 3 : 1)
    for (let i = 0; i < s; i++) {
      const hh = h * (0.23 + ((b[(i % 20) + 4] * 5) % 360) / 700)
      shapes.push({ tag: 'rect', a: { x: (i * w) / s, y: h - hh, width: w / s - 3, height: hh, fill: i % 3 ? c1 : c2, opacity: o(0.3) } })
    }
  } else if (k === 2) {
    for (let y = 0; y < h; y += 26) shapes.push({ tag: 'rect', a: { y, width: w, height: 7, fill: c1, opacity: o(0.28) } })
    for (let i = 0; i < 3; i++) shapes.push({ tag: 'circle', a: { cx: 40 + ((b[26 + i] * 3) % (w - 80)), cy: wide ? 40 + i * 70 : 90 + i * 170, r: 20 + (b[27 + i] % 4) * 4, fill: c2, opacity: o(0.35) } })
  } else {
    const s = 34 + (b[25] % 3) * 8
    for (let x = -h; x < w + h; x += s) {
      shapes.push({ tag: 'line', a: { x1: x, y1: 0, x2: x + h, y2: h, stroke: c1, 'stroke-width': 1.4, opacity: o(0.26) } })
      shapes.push({ tag: 'line', a: { x1: x + h, y1: 0, x2: x, y2: h, stroke: c1, 'stroke-width': 1.4, opacity: o(0.26) } })
    }
    for (let i = 0; i < 7; i++) {
      const cx = (b[i + 4] * 7) % w, cy = (b[i + 11] * 11) % h
      shapes.push({ tag: 'rect', a: { x: cx - 9, y: cy - 9, width: 18, height: 18, fill: c2, opacity: o(0.24), transform: `rotate(45 ${cx} ${cy})` } })
    }
  }
  return { w, h, shapes }
}

// A chosen banner from a peer: only these two numbers, in range, are ever kept.
export function cleanWeave(v: any): Weave | undefined {
  if (!v || typeof v !== 'object') return undefined
  const { kind, shift } = v
  if (!Number.isInteger(kind) || kind < 0 || kind > 3 || !Number.isInteger(shift) || shift < 0 || shift > 359) return undefined
  return { kind, shift }
}

// A profile theme (design/mockups/court-profile.html, 3): one of the weaves behind the whole card at a strength, still
// or moving. Every number is snapped to its slider's steps; one out of range takes the default, not the theme away.
export const THEME_FX = ['drift', 'breathe', 'orbit', 'tide', 'shimmer', 'parallax'] as const
export type Theme = { kind: number; shift: number; op: number; fx?: (typeof THEME_FX)[number]; speed: number; depth: number }
export const THEME_DEFAULT = { op: 45, speed: 1, depth: 60 }
export const THEME_LIMITS = { op: [5, 60, 1], speed: [0.5, 2, 0.25], depth: [10, 100, 10] } as const
export function cleanTheme(v: any): Theme | undefined {
  const w = cleanWeave(v)
  if (!w) return undefined
  const step = (x: unknown, [min, max, by]: readonly [number, number, number], d: number) =>
    typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max ? Math.round(x / by) * by : d
  // An effect this copy does not know (a newer one's) is shown still, not dropped with the theme
  const fx = THEME_FX.includes(v.fx) ? { fx: v.fx as Theme['fx'] } : {}
  return { ...w, op: step(v.op, THEME_LIMITS.op, THEME_DEFAULT.op), ...fx, speed: step(v.speed, THEME_LIMITS.speed, THEME_DEFAULT.speed), depth: step(v.depth, THEME_LIMITS.depth, THEME_DEFAULT.depth) }
}
// The weave behind a card moves only away from the text's luminance: darker than the card in Ink (light text), lighter
// in Ivory (dark text), so every pixel keeps at least the plain card's contrast however strong it is, with no scrim
// (test/mark.test.ts measures it).
export const themeFlat = (light: boolean): Flat => (light ? { L: 0.995, C: 0.018 } : { L: 0.12, C: 0.06 })
