// The profile theme's effects (design/system/README.md, Profile theme), exactly as the build will have them: transform
// and opacity only, one set of fixed keyframes per depth step (theme.depth / 10, 1 to 10), stepped (about four updates
// a second, enough for motion this slow), its own layer only while it moves, still under reduced motion. Loaded before
// screens.js; FX_CSS is the stylesheet the build ships, written out here so the mockups and the app share it.

const FX = ['drift', 'breathe', 'orbit', 'tide', 'shimmer', 'parallax']
const FX_NAMES = { drift: 'Drift', breathe: 'Breathe', orbit: 'Orbit', tide: 'Tide', shimmer: 'Shimmer', parallax: 'Parallax' }
// One cycle at speed 1, and how many steps it takes (about 4 a second)
const FX_TIME = { drift: [24, 96], breathe: [6, 24], orbit: [16, 64], tide: [8, 32], shimmer: [5, 20], parallax: [24, 96] }
function fxCss() {
  const out = [
    '.theme-layer .wv { position: absolute; inset: -35%; opacity: var(--op, 0.3); }',
    '.theme-layer .wv > .mv { position: absolute; inset: 0; }',
    '.theme-layer .wv svg { width: 100%; height: 100%; display: block; }',
    '.theme-layer .wv2 { opacity: calc(var(--op, 0.3) * 0.7); }',
    '.theme-layer .wv2 svg { transform: scale(1.35) rotate(8deg); }',
    '.theme-layer .band { position: absolute; top: -10%; bottom: -10%; left: 0; width: 38%; opacity: var(--op, 0.3); background: linear-gradient(90deg, transparent, var(--band, #fff) 50%, transparent); transform: translateX(-120%); }',
    ".theme-layer::after { content: ''; position: absolute; inset: 0; background: color-mix(in srgb, var(--surface) var(--scrim, 45%), transparent); }",
    '.theme-layer.moving .mv, .theme-layer.moving .band { will-change: transform, opacity; }',
    '.theme-layer.paused .mv, .theme-layer.paused .band { animation-play-state: paused !important; }',
    '@media (prefers-reduced-motion: reduce) { .theme-layer .mv, .theme-layer .band { animation: none !important; } }',
  ]
  for (const fx of FX) {
    const [sec, steps] = FX_TIME[fx]
    const target = fx === 'shimmer' ? '.band' : fx === 'parallax' ? '.wv .mv' : '.wv:first-child .mv'
    const alt = ['drift', 'breathe', 'tide'].includes(fx) ? ' alternate' : ''
    out.push(`.theme-layer.fx-${fx} ${target} { animation: calc(${sec}s / var(--spd, 1)) steps(${steps})${alt} infinite; }`)
    if (fx === 'parallax') out.push(`.theme-layer.fx-parallax .wv2 .mv { animation: calc(${sec / 2}s / var(--spd, 1)) steps(${steps}) alternate infinite; }`)
    for (let n = 1; n <= 10; n++) {
      const a = n * 2 // percent of the layer, which is 1.7 times the card: at depth 100, 34 % of the card at most, inside its 35 % bleed
      let k
      if (fx === 'drift') k = `from { transform: translate3d(${-a}%, ${-a * 0.3}%, 0); } to { transform: translate3d(${a}%, ${a * 0.3}%, 0); }`
      if (fx === 'breathe') k = `from { opacity: ${(1 - n * 0.075).toFixed(3)}; transform: scale(1); } to { opacity: 1; transform: scale(${(1 + n * 0.015).toFixed(3)}); }`
      if (fx === 'orbit') { const r = (n * 1.4).toFixed(1); k = `0% { transform: translate3d(${r}%, 0, 0); } 25% { transform: translate3d(0, ${r}%, 0); } 50% { transform: translate3d(-${r}%, 0, 0); } 75% { transform: translate3d(0, -${r}%, 0); } 100% { transform: translate3d(${r}%, 0, 0); }` }
      if (fx === 'tide') k = `from { transform: translate3d(${(-a * 1.2).toFixed(1)}%, 0, 0); } to { transform: translate3d(${(a * 1.2).toFixed(1)}%, 0, 0); }`
      if (fx === 'shimmer') k = `from { transform: translateX(-120%); opacity: 0; } 20% { opacity: ${(0.35 + n * 0.065).toFixed(3)}; } 80% { opacity: ${(0.35 + n * 0.065).toFixed(3)}; } to { transform: translateX(300%); opacity: 0; }`
      if (fx === 'parallax') {
        out.push(`@keyframes fx-parallax-back-${n} { from { transform: translate3d(${(-a * 0.6).toFixed(1)}%, 0, 0); } to { transform: translate3d(${(a * 0.6).toFixed(1)}%, 0, 0); } }`)
        out.push(`@keyframes fx-parallax-front-${n} { from { transform: translate3d(${(a * 1.2).toFixed(1)}%, ${(a * 0.3).toFixed(1)}%, 0); } to { transform: translate3d(${(-a * 1.2).toFixed(1)}%, ${(-a * 0.3).toFixed(1)}%, 0); } }`)
        out.push(`.theme-layer.fx-parallax.d-${n} .wv:first-child .mv { animation-name: fx-parallax-back-${n}; } .theme-layer.fx-parallax.d-${n} .wv2 .mv { animation-name: fx-parallax-front-${n}; }`)
        continue
      }
      out.push(`@keyframes fx-${fx}-${n} { ${k} }`)
      out.push(`.theme-layer.fx-${fx}.d-${n} ${target} { animation-name: fx-${fx}-${n}; }`)
    }
  }
  return out.join('\n')
}
document.head.insertAdjacentHTML('beforeend', `<style id="fx-css">${fxCss()}</style>`)
