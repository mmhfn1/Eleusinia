// Pictures and weaves exactly as src/shared/mark.ts draws them, icons as the app's, and the people and words the
// mockups use. Loaded before screens.js.

function bytesOf(hex) { const raw = []; for (let i = 0; i + 1 < hex.length; i += 2) raw.push(parseInt(hex.slice(i, i + 2), 16) || 0); if (!raw.length) raw.push(0)
  const out = []; for (let i = 0; i < 32; i++) out.push((raw[i % raw.length] ^ Math.imul(Math.floor(i / raw.length), 167)) & 255); return out }
function tones(b, shift = 0) { const h = ((b[12] * 360) / 256 + shift) % 360, turn = 35 + (b[13] % 4) * 30
  const at = (l, c, x) => `oklch(${l} ${c} ${Math.round(x % 360)})`; return [at(0.42, 0.07, h), at(0.7, 0.095, h + turn), at(0.9, 0.035, h + 2 * turn)] }
const svgOf = (w, h, shapes, slice = true) => `<svg viewBox="0 0 ${w} ${h}" ${slice ? 'preserveAspectRatio="xMidYMid slice"' : ''} aria-hidden="true">${shapes.map(([t, a]) => `<${t} ${Object.entries(a).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`).join('')}</svg>`
function picture(hex) {
  const b = bytesOf(hex), [c0, c1, c2] = tones(b), turn = [0, 0, 90, 180, 270, 0][b[14] % 6], g = (a) => ({ ...a, transform: `rotate(${turn} 50 50)` })
  const S = [['rect', { width: 100, height: 100, fill: c0 }]], kind = b[15] % 4, x = 26 + (b[16] % 20), w = 34 + (b[17] % 18)
  if (kind === 0) { S.push(['path', g({ d: `M${x} 100 V${50 - w / 4} a${w / 2} ${w / 2} 0 0 1 ${w} 0 V100 Z`, fill: c1 })]); S.push(['path', g({ d: `M${x + w / 2 - 6} 100 V64 a6 6 0 0 1 12 0 V100 Z`, fill: c0 })]) }
  else if (kind === 1) { const s = 3 + (b[18] % 2), st = 70 / s; let d = 'M0 100'; for (let i = 0; i < s; i++) d += ` V${100 - st * (i + 1)} H${((i + 1) * 100) / (s + 1)}`; S.push(['path', g({ d: d + ' V100 Z', fill: c1 })]) }
  else if (kind === 2) { S.push(['path', g({ d: 'M18 56 a32 32 0 0 1 64 0 Z', fill: c1 })]); S.push(['path', g({ d: 'M18 56 a32 32 0 0 0 64 0 Z', fill: c2, opacity: 0.9 })]) }
  else { S.push(['path', g({ d: 'M0 100 V30 a70 70 0 0 1 70 70 Z', fill: c1 })]); S.push(['path', g({ d: 'M100 0 V46 a46 46 0 0 1 -46 -46 Z', fill: c2, opacity: 0.85 })]) }
  const ax = 20 + (b[19] % 60), ay = 18 + (b[20] % 22), acc = b[21] % 3
  if (acc === 0) S.push(['circle', g({ cx: ax, cy: ay, r: 7 + (b[22] % 5), fill: c2 })])
  if (acc === 1) S.push(['circle', g({ cx: ax, cy: ay, r: 8, fill: 'none', stroke: c2, 'stroke-width': 3 })])
  if (acc === 2) S.push(['rect', g({ x: ax - 12, y: ay, width: 24, height: 4, rx: 2, fill: c2 })])
  return svgOf(100, 100, S, false)
}
function weave(hex, kind = bytesOf(hex)[23] % 4, shift = 0, wide = true) {
  const b = bytesOf(hex), [c0, c1, c2] = tones(b, shift), w = wide ? 600 : 200, h = wide ? 220 : 700, S = [['rect', { width: w, height: h, fill: c0 }]]
  if (kind === 0) { const n = (3 + (b[24] % 2)) * (wide ? 3 : 1), aw = w / n, rh = aw * 1.6
    for (let r = 0; r * rh < h; r++) for (let i = 0; i < n; i++) { const x = i * aw + aw * 0.18, ww = aw * 0.64, top = r * rh + aw * 0.2; S.push(['path', { d: `M${x} ${top + rh * 0.8} V${top + ww / 2} a${ww / 2} ${ww / 2} 0 0 1 ${ww} 0 V${top + rh * 0.8} Z`, fill: (r + i) % 5 ? c1 : c2, opacity: 0.32 }]) } }
  else if (kind === 1) { const s = (6 + (b[25] % 4)) * (wide ? 3 : 1); for (let i = 0; i < s; i++) { const hh = h * (0.23 + ((b[(i % 20) + 4] * 5) % 360) / 700); S.push(['rect', { x: (i * w) / s, y: h - hh, width: w / s - 3, height: hh, fill: i % 3 ? c1 : c2, opacity: 0.3 }]) } }
  else if (kind === 2) { for (let y = 0; y < h; y += 26) S.push(['rect', { y, width: w, height: 7, fill: c1, opacity: 0.28 }]); for (let i = 0; i < 3; i++) S.push(['circle', { cx: 40 + ((b[26 + i] * 3) % (w - 80)), cy: wide ? 40 + i * 70 : 90 + i * 170, r: 20 + (b[27 + i] % 4) * 4, fill: c2, opacity: 0.35 }]) }
  else { const s = 34 + (b[25] % 3) * 8; for (let x = -h; x < w + h; x += s) { S.push(['line', { x1: x, y1: 0, x2: x + h, y2: h, stroke: c1, 'stroke-width': 1.4, opacity: 0.26 }]); S.push(['line', { x1: x + h, y1: 0, x2: x, y2: h, stroke: c1, 'stroke-width': 1.4, opacity: 0.26 }]) }
    for (let i = 0; i < 7; i++) { const cx = (b[i + 4] * 7) % w, cy = (b[i + 11] * 11) % h; S.push(['rect', { x: cx - 9, y: cy - 9, width: 18, height: 18, fill: c2, opacity: 0.24, transform: `rotate(45 ${cx} ${cy})` }]) } }
  return svgOf(w, h, S)
}
const accentOf = (hex) => tones(bytesOf(hex))[1]

// Icons, 24 px grid, stroke 1.7 (the app's set)
const P = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3', back: 'M15 5l-7 7 7 7', fwd: 'M9 5l7 7-7 7', min: 'M5 12h14', max: 'M5 5h14v14H5z', close: 'M6 6l12 12M18 6L6 18',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3', micoff: 'M3 3l18 18M9 9v3a3 3 0 0 0 5 2.2M15 9.3V6a3 3 0 0 0-5.7-1.3M5 11a7 7 0 0 0 11.5 5.4M19 11a7 7 0 0 1-.7 3M12 18v3',
  head: 'M4 15v-3a8 8 0 0 1 16 0v3M3 14h4v6H3zM17 14h4v6h-4z', gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1',
  plus: 'M12 5v14M5 12h14', hash: 'M5 9h14M5 15h14M10 4l-2 16M16 4l-2 16', speaker: 'M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z', hang: 'M3 14c5-5 13-5 18 0l-2.5 2.5-3-1.5v-2.5a10 10 0 0 0-5 0V15l-3 1.5z',
  cam: 'M3 7h12v10H3zM15 10l6-3v10l-6-3', screen: 'M3 4h18v12H3zM8 20h8M12 16v4', wave: 'M4 12h2M8 8v8M12 5v14M16 8v8M20 12h-2', signal: 'M4 18a12 12 0 0 1 16 0M7 15a8 8 0 0 1 10 0M10 12a4 4 0 0 1 4 0M12 19h.01',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0', userplus: 'M10 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a8 8 0 0 1 14-5M19 8v6M16 11h6', users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3a4 4 0 0 1 0 8M22 21a7 7 0 0 0-5-6.7',
  chev: 'M6 9l6 6 6-6', clip: 'M21 11l-9 9a6 6 0 0 1-8.5-8.5l9-9a4 4 0 0 1 5.7 5.7l-9 9a2 2 0 0 1-2.8-2.8l8.5-8.5', send: 'M4 12l16-8-6 16-2.5-6.5z', gif: 'M3 6h18v12H3zM8 10H6.5v4H8v-1.5M11 10v4M14 14v-4h3M14 12h2',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5', lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3', key: 'M8 15a4 4 0 1 0 0 .01M11 12l9-9M17 6l3 3M14 9l2 2', file: 'M6 3h8l4 4v14H6zM14 3v4h4', folder: 'M3 6h6l2 2h10v11H3z',
  check: 'M5 12l5 5 9-10', x: 'M7 7l10 10M17 7L7 17', slash: 'M8 19L16 5', info: 'M12 10v7M12 7h.01M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', alert: 'M12 3l10 18H2zM12 10v5M12 18h.01', star: 'M12 3l2.8 6 6.2.6-4.7 4.2 1.4 6.2L12 17l-5.7 3 1.4-6.2L3 9.6 9.2 9z',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13', copy: 'M8 8h12v12H8zM4 16V4h12', grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01', more: 'M5 12h.01M12 12h.01M19 12h.01', pin: 'M12 17v5M8 3h8l-1 6 3 4H6l3-4z',
  leave: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10', arrow: 'M5 12h14M13 6l6 6-6 6', poke: 'M8 11V5a2 2 0 0 1 4 0v5M12 9a2 2 0 0 1 4 0v2M16 10a2 2 0 0 1 4 0v4a7 7 0 0 1-7 7h-1a7 7 0 0 1-6-3.4L3 13a2 2 0 0 1 3.4-2L8 13',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4', refresh: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5', down: 'M12 4v12M6 10l6 6 6-6M4 20h16', eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
}
const ico = (n, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${P[n]}"/></svg>`
// The emblem (Home): a hemicycle of columns, drawn in the current colour
const emblem = `<svg viewBox="-50 -50 100 100" aria-hidden="true"><circle r="46" fill="none" stroke="currentColor" stroke-width="3"/>${[0, 1, 2, 3, 4, 5, 6].map((i) => { const a = Math.PI * (i / 6), x = -Math.cos(a) * 26, y = -Math.sin(a) * 20 + 8; return `<rect x="${x - 2.4}" y="${y - 11}" width="4.8" height="17" fill="currentColor"/>` }).join('')}<rect x="-29" y="16" width="58" height="4" fill="currentColor"/></svg>`

// People, groups and servers: a key each (the drawings come from these)
const K = {
  ann: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9', mira: '7f3a91c20be4d8155c07a9e133d06b2f7f3a91c20be4d8155c07a9e133d06b2f', dov: '3c8e1f0a9b2d4c6e8f1a3b5c7d9e0f2a3c8e1f0a9b2d4c6e8f1a3b5c7d9e0f2a',
  rae: '9e4d2c1b0a8f7e6d5c4b3a291807f6e59e4d2c1b0a8f7e6d5c4b3a291807f6e5', theo: '0c1d2e3f405162738495a6b7c8d9eafb0c1d2e3f405162738495a6b7c8d9eafb', lux: 'd4c3b2a1f0e9d8c7b6a5948372615041d4c3b2a1f0e9d8c7b6a5948372615041',
  pim: '61b7a2e94c3d8f05e1a6b2c7d3e8f49061b7a2e94c3d8f05e1a6b2c7d3e8f490', sol: 'b8f15e2a7c4d9e3f6a0b1c5d8e2f7a4bb8f15e2a7c4d9e3f6a0b1c5d8e2f7a4b',
  owls: '5d0e9a77c1f2b3a4d5e6f708192a3b4c5d0e9a77c1f2b3a4d5e6f708192a3b4c', trio: 'e2a94f61b0c7d38e5f2a14b6c9d07e3fe2a94f61b0c7d38e5f2a14b6c9d07e3f', raid: '4b6f0c2e8a1d3f5b7c9e0a2d4f6b8c1e4b6f0c2e8a1d3f5b7c9e0a2d4f6b8c1e',
}
const NAME = { ann: 'Ann', mira: 'Mira', dov: 'Dov', rae: 'Rae', theo: 'Theo', lux: 'Lux', pim: 'Pim', sol: 'Sol' }
const HANDLE = { ann: 'ann#7095', mira: 'mira#2210', dov: 'dov#4410', rae: 'rae#0912', theo: 'theo#5531', lux: 'lux#8802', pim: 'pim#3307', sol: 'sol#6150' }
const av = (k, size = '', pr = '') => `<span class="av ${size}">${picture(K[k])}${pr ? `<span class="pr ${pr}"></span>` : ''}</span>`
// Two weeks of Mira's play, minutes a day, d 13 (oldest) .. 0 (today)
const PLAY = [300, 0, 150, 75, 0, 0, 50, 250, 30, 0, 260, 0, 185, 95]
const level = (m) => (m <= 0 ? 0 : m < 60 ? 1 : m < 120 ? 2 : m < 240 ? 3 : 4)
