// WCAG contrast of every text token on every surface it sits on, for Ink and Ivory, read from
// tokens.css: node design/system/contrast.mjs. Fails (under 4.5, or 3 for counts and large text) are listed last.
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')
const blocks = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(([, sel, body]) => [sel.trim(), Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map(([, k, v]) => [k, v]))])
const tokens = (theme, gold) => {
  const t = {}
  for (const [sel, vars] of blocks) {
    const sels = sel.split(',').map((s) => s.trim())
    const hit = sels.some((s) => {
      const light = s.includes("data-theme='light'"), g = /data-gold='(\w+)'/.exec(s)?.[1]
      return (light ? theme === 'light' : true) && (!light || theme === 'light') && (!g || g === gold) && (theme === 'light' || !light)
    })
    // order matters: later, more specific blocks win
    if (hit) Object.assign(t, vars)
  }
  return t
}
const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] }
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05) }
const PAIRS = [
  ['ink', ['ground', 'surface', 'raised', 'sunk'], 4.5], ['ink-2', ['ground', 'surface', 'raised', 'sunk'], 4.5], ['ink-3', ['ground', 'surface', 'raised', 'sunk'], 4.5],
  ['gold', ['ground', 'surface', 'raised'], 4.5], ['voice', ['ground', 'surface', 'raised'], 4.5], ['online', ['ground', 'surface', 'raised'], 4.5], ['danger', ['ground', 'surface', 'raised'], 4.5],
  ['on-gold', ['gold-fill', 'gold-fill-hover', 'gold-fill-press'], 4.5],
]
const fails = []
for (const theme of ['dark', 'light']) for (const gold of ['leaf']) {
  const t = tokens(theme, gold), rows = []
  for (const [fg, bgs, min] of PAIRS) for (const bg of bgs) {
    if (!t[fg] || !t[bg]) continue
    const r = ratio(t[fg], t[bg])
    rows.push(`${fg} on ${bg} ${r.toFixed(2)}`)
    if (r < min) fails.push(`${theme} ${gold}: ${fg} ${t[fg]} on ${bg} ${t[bg]} = ${r.toFixed(2)} (needs ${min})`)
  }
  const dangerFill = t['danger-fill'] && ratio('#fff8f2', t['danger-fill'])
  rows.push(`white on danger-fill ${dangerFill?.toFixed(2)}`)
  if (dangerFill < 4.5) fails.push(`${theme} ${gold}: white on danger-fill ${dangerFill.toFixed(2)}`)
  console.log(`${theme === 'dark' ? 'Ink' : 'Ivory'} · ${gold}: lowest ${Math.min(...rows.map((r) => +r.split(' ').pop())).toFixed(2)}`)
}
console.log(fails.length ? 'Below AA:\n' + fails.join('\n') : 'Every pair meets AA.')
