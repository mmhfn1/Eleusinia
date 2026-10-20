import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { BrowserWindow, Menu, Tray, app, desktopCapturer, ipcMain, nativeImage, safeStorage, screen, session } from 'electron'
import DHT from 'hyperdht'
import { autoUpdater } from 'electron-updater'
import { UiohookKey, uIOhook } from 'uiohook-napi'
import { type Bindings, type Hotkey, createMatcher, createRecorder } from '../shared/hotkeys'
import { isKey } from '../shared/protocol'
import { AREAS, BUILD, INBOX_KEY, type Meta, createDiagnostics } from '../shared/reports'
import { kindOf, shareable } from '../shared/sources'
import { createInbox } from './inbox'
import { createNode } from './node'

// `npm run inbox` runs the developers' inbox (inbox.ts) instead of the app, in a data folder of its own.
const inboxMode = process.argv.includes('--inbox')
if (inboxMode) app.setPath('userData', process.env.ELEUSINIA_INBOX_DIR || join(app.getPath('appData'), 'Eleusinia Inbox'))
// Lets several instances run side by side on one machine, each with its own identity.
else if (process.env.ELEUSINIA_DATA) app.setPath('userData', process.env.ELEUSINIA_DATA)
// One copy per data folder: opening Eleusinia while it waits in the tray brings that copy back rather than starting a
// second one with the same identity.
const firstCopy = inboxMode || app.requestSingleInstanceLock()
if (!firstCopy) app.quit()

// Testing only: join this DHT instead of the public one, as "host:port,host:port" (test/smoke.mjs runs a local
// one). Unset in normal use, which keeps the public DHT.
function testDht() {
  const bootstrap = (process.env.ELEUSINIA_BOOTSTRAP ?? '').split(',').map((s) => s.trim()).filter((s) => /^[\w.-]+:\d{1,5}$/.test(s))
  return bootstrap.length ? { bootstrap } : undefined
}

// The inbox's identity is kept in plain text on purpose: it only exists on the developers' machine, and whoever
// holds it can receive every report. The GitHub token comes from the environment or github.json beside it.
function startInbox() {
  const dir = app.getPath('userData')
  mkdirSync(dir, { recursive: true })
  const idFile = join(dir, 'inbox-identity.json')
  if (!existsSync(idFile)) writeFileSync(idFile, JSON.stringify({ sk: DHT.keyPair().secretKey.toString('hex') }))
  const secretKey = Buffer.from(JSON.parse(readFileSync(idFile, 'utf8')).sk, 'hex')
  const config = join(dir, 'github.json')
  const saved = existsSync(config) ? JSON.parse(readFileSync(config, 'utf8')) : {}
  const token = process.env.GITHUB_TOKEN || saved.token
  const repo = process.env.ELEUSINIA_REPORTS_REPO || saved.repo
  const log = (line: string) => console.log(`${new Date().toISOString().slice(0, 19).replace('T', ' ')}  ${line}`)
  const inbox = createInbox({ dir, keyPair: { publicKey: secretKey.subarray(32), secretKey }, dht: testDht(), github: token && repo ? { token, repo } : undefined, log })
  log(`Eleusinia inbox ${inbox.key}`)
  log(`saving reports in ${join(dir, 'reports')}`)
  log(token && repo ? `filing issues in ${repo}` : `not filing issues: put {"token": "...", "repo": "owner/name"} in ${config}`)
  if (inbox.key !== INBOX_KEY && !process.env.ELEUSINIA_BOOTSTRAP) log('warning: the app sends reports to a different inbox (INBOX_KEY in src/shared/reports.ts)')
  process.on('SIGINT', () => inbox.destroy().then(() => app.exit(0)))
}

function loadIdentity(dir: string) {
  const file = join(dir, 'identity.json')
  let hex: string
  if (existsSync(file)) {
    const { sk, enc } = JSON.parse(readFileSync(file, 'utf8'))
    hex = enc ? safeStorage.decryptString(Buffer.from(sk, 'base64')) : sk
  } else {
    hex = DHT.keyPair().secretKey.toString('hex')
    // Without an OS keychain (some Linux setups) the key is stored in plain text.
    const enc = safeStorage.isEncryptionAvailable()
    const sk = enc ? safeStorage.encryptString(hex).toString('base64') : hex
    writeFileSync(file, JSON.stringify({ sk, enc }))
  }
  const secretKey = Buffer.from(hex, 'hex')
  return { publicKey: secretKey.subarray(32), secretKey } // an ed25519 secret key ends with its public key
}

// Closing windows never quits by itself: the tray menu, the close-to-tray setting or an update does, explicitly.
app.on('window-all-closed', () => {})
app.whenReady().then(async () => (inboxMode ? startInbox() : firstCopy && (await updateFirst()) && startApp()))

// Updates: the installed app looks for a newer release of github.com/mmhfn1/Eleusinia (published for every push to
// main, see .github/workflows/release.yml) on start and every 4 hours, downloads it in the background and tells the
// window, which offers a restart; otherwise it installs the next time Eleusinia is closed. Copies run from source never
// update. ELEUSINIA_UPDATE_URL points it at another folder of releases (testing), ELEUSINIA_NO_UPDATES=1 turns it off.
const updatable = () => app.isPackaged && process.env.ELEUSINIA_NO_UPDATES !== '1'
const updateFeed = () => process.env.ELEUSINIA_UPDATE_URL && autoUpdater.setFeedURL({ provider: 'generic', url: process.env.ELEUSINIA_UPDATE_URL })

// Every start first asks for a newer release (at most 6 s, so being offline never holds it up). When there is one, a
// small window shows the download, then it installs quietly and opens the new version; this copy never starts.
// Resolves true to start this version.
async function updateFirst() {
  if (!updatable()) return true
  updateFeed()
  autoUpdater.autoDownload = false
  const found = await Promise.race([autoUpdater.checkForUpdates().catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 6000))])
  if (!found?.isUpdateAvailable) return true
  const version = found.updateInfo.version
  const splash = new BrowserWindow({ width: 380, height: 120, frame: false, resizable: false, backgroundColor: '#0b1119', show: false })
  const page = (text: string) =>
    `data:text/html;charset=utf-8,${encodeURIComponent(`<body style="margin:0;height:100vh;display:grid;place-items:center;background:#0b1119;color:#d9e0ec;font:14px 'Segoe UI',sans-serif">${text}</body>`)}`
  await splash.loadURL(page(`Updating Eleusinia to ${version}…`))
  splash.show()
  autoUpdater.on('download-progress', (p) => !splash.isDestroyed() && splash.setProgressBar(p.percent / 100))
  try {
    await autoUpdater.downloadUpdate()
  } catch {
    splash.destroy() // the download failed: start this version, and the background check tries again later
    return true
  }
  autoUpdater.quitAndInstall(true, true) // quietly, then opens the new version
  return false
}

function startUpdates(ready: (version: string) => void, diag: (area: 'app' | 'error', text: string) => void) {
  if (!updatable()) return
  updateFeed()
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('update-available', (i) => diag('app', `update ${i.version} found, downloading`))
  autoUpdater.on('update-downloaded', (i) => {
    diag('app', `update ${i.version} ready`)
    ready(i.version)
  })
  autoUpdater.on('error', (e) => diag('error', `update check failed: ${e.message}`))
  const check = () => autoUpdater.checkForUpdates().catch(() => {}) // offline: the next check tries again
  check()
  setInterval(check, 4 * 3600e3)
}

function startApp() {
  const dir = app.getPath('userData')
  mkdirSync(dir, { recursive: true })
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Eleusinia',
    icon: join(__dirname, '../../build/icon.png'),
    backgroundColor: '#06081a', // the app's darkest tone, so no white flash before the page paints
    autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, '../preload/index.js') },
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e) => e.preventDefault())

  // Closing the window keeps Eleusinia running in the tray, so calls, messages, hotkeys and updates carry on; it quits
  // from the tray menu (or when Windows shuts down, or to install an update). Settings can turn this off, and closing
  // the window then quits.
  let quitting = false
  app.on('before-quit', () => (quitting = true))
  const show = () => {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }
  const tray = new Tray(nativeImage.createFromPath(join(__dirname, '../../build/icon.png')).resize({ width: 32, height: 32 }))
  tray.setToolTip('Eleusinia')
  tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Quit Eleusinia', click: () => app.quit() }]))
  tray.on('click', show)
  app.on('second-instance', show)
  win.on('close', (e) => {
    if (quitting) return
    e.preventDefault()
    if (node.state().settings.closeToTray === false) app.quit()
    else win.hide()
  })

  // The last few minutes of what happened, scrubbed and in memory only, for problem and crash reports (reports.ts).
  const diagnostics = createDiagnostics()
  const meta = (): Meta => ({
    version: app.getVersion(),
    build: BUILD,
    os: `${os.type()} ${os.release()}`,
    arch: process.arch,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    locale: app.getLocale(),
    memoryGb: Math.round(os.totalmem() / 2 ** 30),
  })
  diagnostics.add('app', `started Eleusinia ${app.getVersion()} (${BUILD} build)`)
  const node = createNode({
    dir,
    keyPair: loadIdentity(dir),
    emit: (e) => !win.isDestroyed() && win.webContents.send('event', e),
    noDirect: process.env.ELEUSINIA_NO_DIRECT === '1',
    strict: process.env.ELEUSINIA_STRICT === '1', // testing: behave as behind a strict router (smoke's relayed mode)
    dht: testDht(),
    // Only the installed app reports to the real inbox, so development runs (stopped with Ctrl+C) never send any.
    inbox: isKey(process.env.ELEUSINIA_INBOX) ? process.env.ELEUSINIA_INBOX : app.isPackaged ? INBOX_KEY : undefined,
    diag: diagnostics.add,
    version: app.getVersion(),
  })
  startUpdates((version) => !win.isDestroyed() && win.webContents.send('event', { type: 'update', version }), diagnostics.add)
  ipcMain.handle('installUpdate', () => autoUpdater.quitAndInstall(true, true)) // quietly, then opens the new version
  ipcMain.on('diag', (_e, area: unknown, text: unknown) => AREAS.includes(area as any) && typeof text === 'string' && diagnostics.add(area as any, text))
  ipcMain.handle('diagnostics', () => ({ meta: meta(), events: diagnostics.list() }))

  // Crash reports go to the developers by themselves (unless turned off in Settings), at most 5 an hour so a crash
  // that repeats cannot flood anyone. They carry only what a problem report would: never a memory dump.
  const crashes: number[] = []
  function crashed(title: string, detail: string, events = true) {
    diagnostics.add('error', `${title}: ${detail}`)
    const hour = crashes.filter((t) => t > Date.now() - 3600e3)
    if (node.state().settings.crashReports === false || hour.length >= 5) return
    crashes.splice(0, crashes.length, ...hour, Date.now())
    try {
      node.report({ kind: 'crash', title, body: `${detail}\n\nSent automatically; this can be turned off in Settings.`, meta: meta(), events: events ? diagnostics.list() : [] })
    } catch {}
  }
  app.on('render-process-gone', (_e, wc, d) => {
    if (d.reason === 'clean-exit') return
    crashed('The window crashed', `${d.reason}, exit code ${d.exitCode}`)
    if (wc === win.webContents) setTimeout(() => !win.isDestroyed() && win.reload(), 500) // a crashed window stays blank otherwise
  })
  app.on('child-process-gone', (_e, d) => {
    if (d.reason === 'clean-exit' || d.reason === 'killed') return
    crashed(`The ${d.name || d.serviceName || d.type} process crashed`, `${d.reason}, exit code ${d.exitCode}`)
  })
  process.on('uncaughtException', (e) => crashed('An error in the background process', e.stack ?? String(e)))
  process.on('unhandledRejection', (e) => diagnostics.add('error', `unhandled: ${e instanceof Error ? e.message : String(e)}`))
  // A marker that only a normal shutdown removes: still there at start means the last run ended abruptly. Nothing
  // from that run survives (diagnostics are in memory only), so the report says just that.
  const running = join(dir, 'running')
  if (existsSync(running)) crashed('Eleusinia closed unexpectedly last time', 'It did not shut down normally: a crash, the computer losing power, or the app being ended from Task Manager.', false)
  writeFileSync(running, '')
  ipcMain.handle('call', async (_e, method: string, ...args: unknown[]) => {
    if (!Object.hasOwn(node, method)) throw new Error('Unknown method')
    const result = await (node as any)[method](...args)
    if (method === 'setSettings') hook()
    if (method === 'deleteAccount') {
      rmSync(running, { force: true })
      app.relaunch()
      app.exit(0)
    }
    return result
  })

  // Screen sharing: the page lists screens and windows (never this app's own), the user picks one in our own
  // picker, and the next getDisplayMedia call captures exactly that source. Anything else is refused.
  let chosen: string | null = null
  ipcMain.handle('screens', async () => {
    const own = win.getMediaSourceId()
    const displays = screen.getAllDisplays()
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 } })
    return sources
      .filter((s) => s.id !== own && shareable({ id: s.id, name: s.name, emptyThumb: s.thumbnail.isEmpty() }))
      .map((s) => {
        // A window can be moved to any display, so it may go as high as the display it is listed on or the primary one.
        const d = displays.find((x) => String(x.id) === s.display_id) ?? screen.getPrimaryDisplay()
        return {
          id: s.id,
          kind: kindOf(s.id),
          name: s.name,
          thumb: s.thumbnail.toDataURL(),
          width: Math.round(d.size.width * d.scaleFactor),
          height: Math.round(d.size.height * d.scaleFactor),
          fps: Math.round(d.displayFrequency) || 60,
        }
      })
  })
  // With sound, the computer's audio is captured too (Windows only); the page asks Chromium to leave this app's own
  // audio out of it, and shares no sound if it cannot.
  let sound = false
  ipcMain.handle('chooseScreen', (_e, id: unknown, withSound: unknown) => {
    chosen = typeof id === 'string' ? id : null
    sound = withSound === true && process.platform === 'win32'
  })
  session.defaultSession.setDisplayMediaRequestHandler(async (_req, grant) => {
    const id = chosen
    chosen = null
    const source = id ? (await desktopCapturer.getSources({ types: ['screen', 'window'] })).find((s) => s.id === id) : undefined
    grant(source ? { video: source, ...(sound ? { audio: 'loopback' as const } : {}) } : {})
  })

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))

  // Hotkeys: a system-wide key hook, so they work while the app is in the background or minimised. Unlike
  // Electron's global shortcuts it sees keys being released (push to talk needs that) and never takes a key away
  // from other apps. It runs only while a hotkey is bound or being recorded, and key codes are only compared in
  // memory, never stored or sent anywhere.
  const names: Record<number, string> = {}
  for (const [name, code] of Object.entries(UiohookKey)) names[code] ??= name.replace(/^(\w+)Right$/, 'Right $1')
  const label = (keys: number[]) => {
    const mod = (k: number) => /^(Right )?(Ctrl|Shift|Alt|Meta)$/.test(names[k] ?? '')
    return [...keys.filter(mod), ...keys.filter((k) => !mod(k))].map((k) => names[k] ?? `Key ${k}`).join(' + ')
  }
  const bindings = () => node.state().settings.hotkeys ?? ({} as Bindings)
  const matcher = createMatcher(bindings)
  let recorder: ReturnType<typeof createRecorder> | null = null
  let recorded: ((h: Hotkey | null) => void) | null = null
  let hooked = false
  const fire = (events: { action: string; down: boolean }[]) =>
    events.forEach((e) => !win.isDestroyed() && win.webContents.send('event', { type: 'hotkey', ...e }))
  function hook() {
    const need = !!recorder || Object.values(bindings()).some((h) => h?.keys?.length)
    if (need === hooked) return
    hooked = need
    if (need) uIOhook.start()
    else {
      fire(matcher.reset())
      uIOhook.stop()
    }
  }
  const finish = (h: Hotkey | null) => {
    const done = recorded
    recorder = recorded = null
    done?.(h)
    hook()
  }
  uIOhook.on('keydown', (e) => (recorder ? recorder.down(e.keycode) : fire(matcher.down(e.keycode))))
  uIOhook.on('keyup', (e) => {
    if (!recorder) return fire(matcher.up(e.keycode))
    const keys = recorder.up(e.keycode)
    if (keys) finish(keys === 'cancel' ? null : { keys, label: label(keys) })
  })
  // The next combination pressed anywhere, or null if cancelled (Escape) or nothing comes within 15 s.
  ipcMain.handle('recordHotkey', () => {
    finish(null)
    fire(matcher.reset())
    return new Promise<Hotkey | null>((resolve) => {
      recorder = createRecorder()
      recorded = resolve
      hook()
      setTimeout(() => recorded === resolve && finish(null), 15000)
    })
  })
  ipcMain.handle('stopRecording', () => finish(null))
  hook()

  // Windows hides keys typed into a program running as administrator (some games, launchers, anti-cheat) from every
  // program that is not, whatever method it uses, so hotkeys over such a game need Eleusinia elevated too.
  const run = (file: string, args: string[]) => new Promise<boolean>((r) => execFile(file, args, { windowsHide: true }, (err) => r(!err)))
  ipcMain.handle('isAdmin', () => process.platform === 'win32' && run('fltmc', [])) // fltmc only succeeds elevated
  // Relaunches elevated once Windows has asked the user, then closes this copy; the new copy waits for it to be gone,
  // so the two never share the identity and data folder. An elevated process does not inherit the environment, so
  // Eleusinia's own variables (data folder, test DHT, dev server) are carried over explicitly.
  ipcMain.handle('restartAsAdmin', async () => {
    if (process.platform !== 'win32') return false
    const q = (s: string) => `'${s.replace(/'/g, "''")}'`
    const env = Object.entries(process.env)
      .filter(([k]) => /^(ELEUSINIA_\w+|ELECTRON_RENDERER_URL)$/.test(k))
      .map(([k, v]) => `$env:${k} = ${q(v ?? '')}; `)
      .join('')
    const args = process.argv.slice(1).map((a) => `"${a.replace(/"/g, '\\"')}"`).join(' ')
    const inner = `Wait-Process -Id ${process.pid} -Timeout 20 -ErrorAction SilentlyContinue; ${env}Set-Location -LiteralPath ${q(process.cwd())}; Start-Process -FilePath ${q(process.execPath)}${args ? ` -ArgumentList ${q(args)}` : ''}`
    const encoded = Buffer.from(inner, 'utf16le').toString('base64')
    // Fails, and this copy stays open, when the user says no to Windows' prompt.
    const ok = await run('powershell', ['-NoProfile', '-NonInteractive', '-Command', `Start-Process powershell -Verb RunAs -WindowStyle Hidden -ArgumentList '-NoProfile','-EncodedCommand','${encoded}'`])
    if (ok) app.quit()
    return ok
  })

  // Every way out (the tray menu, an update, Windows shutting down) passes here once: the network closes cleanly and
  // the marker goes, so the next start does not report an abrupt end.
  let closed = false
  app.on('will-quit', async (e) => {
    if (closed) return
    e.preventDefault()
    if (hooked) uIOhook.stop()
    await node.destroy().catch(() => {})
    rmSync(running, { force: true })
    tray.destroy()
    closed = true
    app.quit()
  })
}
