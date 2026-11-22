// The text inventory for the mockups themselves: npx electron design/system/type-audit.cjs
// Loads every screen in both themes and lists each distinct family, size and weight in use, with any not in the roles.
const { app, BrowserWindow } = require('electron')
const { pathToFileURL } = require('url')
const { join } = require('path')
// The approved roles' family, size and weight (tokens.css)
const ROLES = new Set(['Bodoni Moda Variable 44px 600', 'Bodoni Moda Variable 26px 600', 'Bodoni Moda Variable 20px 500', 'Alegreya Sans 26px 700', 'Alegreya Sans 15px 400', 'Alegreya Sans 15px 500', 'Alegreya Sans 13.5px 700', 'Alegreya Sans 13.5px 500', 'Alegreya Sans 13.5px 400', 'Alegreya Sans 12.5px 400', 'Alegreya Sans 11px 700', 'IBM Plex Mono 12.5px 500'])
app.whenReady().then(async () => {
  const w = new BrowserWindow({ width: 1320, height: 900, show: false, webPreferences: { offscreen: true } })
  const page = pathToFileURL(join(__dirname, 'screen.html')).href
  await w.loadURL(page + '?s=home')
  const ids = await w.webContents.executeJavaScript('Object.keys(SCREENS)')
  const seen = new Map()
  for (const s of ids) for (const t of ['ink', 'ivory']) {
    await w.loadURL(`${page}?s=${s}&t=${t}`)
    const got = await w.webContents.executeJavaScript(`document.fonts.ready.then(() => { const out = []; const walk = document.createTreeWalker(document.getElementById('out'), NodeFilter.SHOW_TEXT); for (let n = walk.nextNode(); n; n = walk.nextNode()) { if (!n.textContent.trim()) continue; const e = n.parentElement, c = getComputedStyle(e), r = e.getBoundingClientRect(); if (!r.width || c.visibility === 'hidden' || e.closest('.vh')) continue; out.push(c.fontFamily.split(',')[0].replace(/["']/g, '').trim() + ' ' + c.fontSize + ' ' + c.fontWeight + '|' + e.className + '|' + n.textContent.trim().slice(0, 30)) } return out })`)
    for (const g of got) { const [k, cls, txt] = g.split('|'); if (!seen.has(k)) seen.set(k, { n: 0, ex: `${s}: .${cls} "${txt}"` }); seen.get(k).n++ }
  }
  const fams = new Set([...seen.keys()].map((k) => k.replace(/ [\d.]+px \d+$/, ''))), sizes = new Set([...seen.keys()].map((k) => k.match(/([\d.]+px)/)[1]))
  console.log(`${ids.length} screens × 2 themes: ${[...seen.values()].reduce((a, v) => a + v.n, 0)} text elements; families ${fams.size} (${[...fams].join(', ')}); sizes ${sizes.size} (${[...sizes].sort((a, b) => parseFloat(a) - parseFloat(b)).join(', ')}); combinations ${seen.size}`)
  const off = [...seen].filter(([k]) => !ROLES.has(k))
  console.log(off.length ? 'Outside the roles:\n' + off.map(([k, v]) => `  ${k} ×${v.n}, e.g. ${v.ex}`).join('\n') : 'Every text element is one of the roles.')
  app.quit()
}).catch((e) => { console.error(e); app.exit(1) })
