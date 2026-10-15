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

  const node = createNode({
    dir,
    keyPair: loadIdentity(dir),
    emit: (e) => !win.isDestroyed() && win.webContents.send('event', e),
    noDirect: process.env.ELEUSINIA_NO_DIRECT === '1',
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
  ipcMain.handle('chooseScreen', (_e, id: unknown) => void (chosen = typeof id === 'string' ? id : null))
  session.defaultSession.setDisplayMediaRequestHandler(async (_req, grant) => {
    const id = chosen
    chosen = null
    const source = id ? (await desktopCapturer.getSources({ types: ['screen', 'window'] })).find((s) => s.id === id) : undefined
    grant(source ? { video: source } : {})
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

  app.on('window-all-closed', async () => {
    if (hooked) uIOhook.stop()
    await node.destroy()
    app.quit()
  })
})
