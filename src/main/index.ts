import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BrowserWindow, app, ipcMain, safeStorage } from 'electron'
import DHT from 'hyperdht'
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
    width: 1000,
    height: 700,
    title: 'Eleusinia',
    autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, '../preload/index.js') },
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e) => e.preventDefault())

  const node = createNode({
    dir,
    keyPair: loadIdentity(dir),
    emit: (e) => !win.isDestroyed() && win.webContents.send('event', e),
  })
  ipcMain.handle('call', (_e, method: string, ...args: unknown[]) => {
    if (!Object.hasOwn(node, method)) throw new Error('Unknown method')
    return (node as any)[method](...args)
  })

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))

  app.on('window-all-closed', async () => {
    await node.destroy()
    app.quit()
  })
})
