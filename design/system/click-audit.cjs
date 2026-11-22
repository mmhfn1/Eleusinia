// The clickable inventory for the mockups: npx electron design/system/click-audit.cjs
// Every button-like element's radius, height and any shadow, gradient, clip-path on every screen in both themes.
const { app, BrowserWindow } = require('electron')
const { pathToFileURL } = require('url')
const { join } = require('path')
app.whenReady().then(async () => {
  const w = new BrowserWindow({ width: 1320, height: 900, show: false, webPreferences: { offscreen: true } })
  const page = pathToFileURL(join(__dirname, 'screen.html')).href
  await w.loadURL(page + '?s=home')
  const ids = await w.webContents.executeJavaScript('Object.keys(SCREENS)')
  const radii = new Map(), heights = new Map(), extras = new Map(), variants = new Map()
  const add = (m, k, ex) => { if (!m.has(k)) m.set(k, { n: 0, ex }); m.get(k).n++ }
  for (const s of ids) for (const t of ['ink', 'ivory']) {
    await w.loadURL(`${page}?s=${s}&t=${t}`)
    const got = await w.webContents.executeJavaScript(`[...document.querySelectorAll('#out button, #out a, #out select, #out [role=switch], #out [role=tab], #out [role=menuitem], #out input[type=range]')].map((e) => { const c = getComputedStyle(e), r = e.getBoundingClientRect(); return { cls: (e.className.baseVal ?? e.className) || e.tagName.toLowerCase(), r: c.borderTopLeftRadius, h: Math.round(r.height), sh: c.boxShadow, bg: c.backgroundImage, clip: c.clipPath } })`)
    for (const g of got) {
      const v = g.cls.split(' ').filter((c) => !/^is-|^t-|^av|^sub|^nm/.test(c)).join('.') || g.cls
      add(variants, v, s); add(radii, g.r, `${s} .${v}`); add(heights, g.h, `${s} .${v}`)
      if (g.sh !== 'none' && !/^inset/.test(g.sh)) add(extras, 'shadow', `${s} .${v}`)
      if (g.bg !== 'none' && !/linear-gradient\(45deg/.test(g.bg)) add(extras, 'gradient', `${s} .${v}`)
      if (g.clip !== 'none') add(extras, 'clip-path', `${s} .${v}`)
    }
  }
  const show = (m) => [...m].sort((a, b) => parseFloat(a[0]) - parseFloat(b[0])).map(([k, v]) => `${k} ×${v.n} (${v.ex})`).join('; ')
  console.log('variants', variants.size, [...variants.keys()].join(', '))
  console.log('radii', radii.size, show(radii))
  console.log('heights', heights.size, show(heights))
  console.log('extras', extras.size ? show(extras) : 'none')
  app.quit()
}).catch((e) => { console.error(e); app.exit(1) })
