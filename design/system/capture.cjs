// Photographs every mockup screen: npx electron design/system/capture.cjs [only,ids] [--gold]
// Writes design/system/shots/<id>-<ink|ivory>.png, and with --gold <id>-<theme>-<leaf|brass|line>.png for GOLD_SCREENS.
const { app, BrowserWindow } = require('electron')
const { pathToFileURL } = require('url')
const { mkdirSync, writeFileSync } = require('fs')
const { join } = require('path')

const page = join(__dirname, 'screen.html')
const out = join(__dirname, 'shots')
const GOLD_SCREENS = ['home', 'call-talking', 'settings-profile', 'card-small']
const args = process.argv.slice(2).filter((a) => !a.startsWith('-') && !a.endsWith('.cjs'))
const gold = process.argv.includes('--gold')
process.on('uncaughtException', (e) => { console.error(e); app.exit(1) })

app.whenReady().then(async () => {
  mkdirSync(out, { recursive: true })
  const w = new BrowserWindow({ width: 1320, height: 900, show: false, webPreferences: { offscreen: true } })
  const shoot = async (s, t, g, file) => {
    await w.loadURL(`${pathToFileURL(page).href}?s=${s}&t=${t}&g=${g}`)
    await w.webContents.executeJavaScript('document.fonts.ready.then(() => new Promise((r) => setTimeout(r, 350)))')
    const r = await w.webContents.executeJavaScript(`(() => { const b = document.getElementById('out').getBoundingClientRect(); return { x: 0, y: 0, width: Math.ceil(b.width), height: Math.ceil(b.height) } })()`)
    if (r.width > 1320 || r.height > 900) { w.setContentSize(Math.max(1320, r.width), Math.max(900, r.height)); await new Promise((d) => setTimeout(d, 200)) }
    const img = await w.webContents.capturePage(r)
    writeFileSync(join(out, file), img.toPNG())
  }
  await w.loadURL(`${pathToFileURL(page).href}?s=home`)
  const all = await w.webContents.executeJavaScript('Object.keys(SCREENS).filter((s) => s !== "gold")')
  const ids = args.length ? args.flatMap((a) => a.split(',')) : all
  for (const s of ids) for (const t of ['ink', 'ivory']) await shoot(s, t, 'leaf', `${s}-${t}.png`)
  if (gold) for (const s of GOLD_SCREENS) for (const t of ['ink', 'ivory']) for (const g of ['leaf', 'brass', 'line']) await shoot(s, t, g, `gold-${s}-${t}-${g}.png`)
  console.log(`captured ${ids.length * 2}${gold ? ` and ${GOLD_SCREENS.length * 6} gold` : ''} screens`)
  app.quit()
}).catch((e) => { console.error(e); app.exit(1) })
