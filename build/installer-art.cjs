// Draws the installer's artwork in the app's own look (its background, emblem and wordmark) and saves it as the
// BMP files the Windows installer uses: the sidebar of the welcome and finish pages (164x314) and the header of
// the others (150x57). Run with `npm run installer-art` after changing the look; the results are committed.
const { app, BrowserWindow } = require('electron')
const { writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { pathToFileURL } = require('node:url')

const root = join(__dirname, '..')
const url = (p) => pathToFileURL(join(root, p)).href
const version = require('../package.json').version

const css = `
@font-face { font-family: Display; font-weight: 700; src: url('${url('node_modules/@fontsource/zen-kaku-gothic-new/files/zen-kaku-gothic-new-latin-700-normal.woff2')}'); }
@font-face { font-family: Text; font-weight: 100 900; src: url('${url('node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2')}'); }
html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
body {
  font-family: Text, 'Segoe UI', sans-serif; color: #d9e0ec;
  background:
    radial-gradient(260px 200px at 20% -10%, rgb(145 185 240 / 0.16), transparent 70%),
    radial-gradient(220px 200px at 110% 115%, rgb(145 185 240 / 0.12), transparent 70%),
    linear-gradient(180deg, #0f1722, #0b1119);
}
.emblem { background: linear-gradient(180deg, #d9e0ec, #a6b6ca); -webkit-mask: url('${url('src/renderer/assets/emblem.png')}') center / contain no-repeat; filter: drop-shadow(0 0 14px rgb(145 185 240 / 0.45)); }
.word { font: 700 15px/1 Display, sans-serif; letter-spacing: 0.34em; padding-left: 0.34em; text-transform: uppercase; }
.quiet { color: #8290a6; font-size: 10px; letter-spacing: 0.04em; }
`
const sidebar = `<body style="display:flex;flex-direction:column;align-items:center;text-align:center">
  <div class="emblem" style="width:92px;height:92px;margin-top:58px"></div>
  <div class="word" style="margin-top:22px">Eleusinia</div>
  <div class="quiet" style="margin-top:10px;line-height:1.5;padding:0 14px">Chat and calls that go<br>straight between friends</div>
  <div class="quiet" style="margin-top:auto;margin-bottom:16px;opacity:.75">Tester build ${version}</div>
</body>`
const header = `<body style="display:flex;align-items:center;justify-content:flex-end;gap:9px;padding-right:12px;box-sizing:border-box">
  <div class="word" style="font-size:11px;letter-spacing:0.2em;padding-left:0.2em">Eleusinia</div>
  <div class="emblem" style="width:34px;height:34px;filter:drop-shadow(0 0 8px rgb(145 185 240 / 0.45))"></div>
</body>`

// A 24-bit BMP from Chromium's BGRA pixels; rows go bottom up, each padded to 4 bytes.
function bmp(bgra, w, h) {
  const row = Math.ceil((w * 3) / 4) * 4
  const out = Buffer.alloc(54 + row * h)
  out.write('BM', 0)
  out.writeUInt32LE(out.length, 2)
  out.writeUInt32LE(54, 10)
  out.writeUInt32LE(40, 14)
  out.writeInt32LE(w, 18)
  out.writeInt32LE(h, 22)
  out.writeUInt16LE(1, 26)
  out.writeUInt16LE(24, 28)
  out.writeUInt32LE(row * h, 34)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const o = 54 + (h - 1 - y) * row + x * 3
      out[o] = bgra[i]
      out[o + 1] = bgra[i + 1]
      out[o + 2] = bgra[i + 2]
    }
  return out
}

async function render(html, w, h, file) {
  const win = new BrowserWindow({ width: w, height: h, show: false, useContentSize: true, webPreferences: { offscreen: true } })
  // A file page, so it may load the emblem and font from the project (a data: page may not).
  const page = join(require('node:os').tmpdir(), `eleusinia-art-${w}x${h}.html`)
  writeFileSync(page, `<!doctype html><meta charset="utf-8"><style>${css}</style>${html}`)
  await win.loadFile(page)
  await win.webContents.executeJavaScript('document.fonts.ready.then(() => new Promise((r) => setTimeout(r, 300)))')
  const img = (await win.webContents.capturePage()).resize({ width: w, height: h })
  writeFileSync(join(__dirname, file), bmp(img.toBitmap(), w, h))
  writeFileSync(join(__dirname, file.replace('.bmp', '.preview.png')), img.toPNG()) // only for looking at; not used by the installer
  win.destroy()
}

app.disableHardwareAcceleration()
app.on('window-all-closed', () => {}) // each picture closes its window; that must not end the run
app.whenReady().then(async () => {
  await render(sidebar, 164, 314, 'installer-sidebar.bmp')
  await render(header, 150, 57, 'installer-header.bmp')
  console.log('wrote build/installer-sidebar.bmp and build/installer-header.bmp')
  app.quit()
})
