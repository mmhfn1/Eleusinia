import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BrowserWindow, app, desktopCapturer, ipcMain, safeStorage, screen, session } from 'electron'
import DHT from 'hyperdht'
import { UiohookKey, uIOhook } from 'uiohook-napi'
import { type Bindings, type Hotkey, createMatcher, createRecorder } from '../shared/hotkeys'
import { kindOf, shareable } from '../shared/sources'
import { createNode } from './node'

// Lets several instances run side by side on one machine, each with its own identity.
if (process.env.ELEUSINIA_DATA) app.setPath('userData', process.env.ELEUSINIA_DATA)

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

app.whenReady().then(() => {
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

  // Testing only: join this DHT instead of the public one, as "host:port,host:port" (test/smoke.mjs runs a local
  // one). Unset in normal use, which keeps the public DHT.
  const bootstrap = (process.env.ELEUSINIA_BOOTSTRAP ?? '').split(',').map((s) => s.trim()).filter((s) => /^[\w.-]+:\d{1,5}$/.test(s))
  const node = createNode({
    dir,
    keyPair: loadIdentity(dir),
    emit: (e) => !win.isDestroyed() && win.webContents.send('event', e),
    noDirect: process.env.ELEUSINIA_NO_DIRECT === '1',
    dht: bootstrap.length ? { bootstrap } : undefined,
  })
  ipcMain.handle('call', async (_e, method: string, ...args: unknown[]) => {
    if (!Object.hasOwn(node, method)) throw new Error('Unknown method')
    const result = await (node as any)[method](...args)
    if (method === 'setSettings') hook()
    if (method === 'deleteAccount') {
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
    if (ok) win.close()
    return ok
  })

  app.on('window-all-closed', async () => {
    if (hooked) uIOhook.stop()
    await node.destroy()
    app.quit()
  })
})
