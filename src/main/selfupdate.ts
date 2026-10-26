// Updates on macOS and Linux. electron-updater still finds them (it reads latest-mac.yml or latest-linux.yml), but
// installing is done here: on macOS its installer (Squirrel.Mac) only accepts a build signed with a paid Apple
// Developer ID, and on Linux it has no place to check our signature. So the file is downloaded, checked against the
// update key (shared/updatesig.ts) and then put in place of the running copy, the way Sparkle does: the app bundle on
// macOS (signed with Eleusinia's own certificate, the same for every release, so the Keychain keeps trusting it), the
// AppImage file on Linux.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { accessSync, chmodSync, constants, existsSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { updateFileFor, verifyUpdate } from '../shared/updatesig'

export type Staged = { version: string; file: string }
type Fetch = (url: string) => Promise<Response>

// One name for every download, so a newer one replaces a waiting older one and nothing piles up.
const downloadOf = (t: string) => join(dirname(t), process.platform === 'darwin' ? '.eleusinia-update.zip' : '.eleusinia-update.AppImage')

// The running copy: the .app bundle, or the AppImage file.
const target = () => (process.platform === 'darwin' ? resolve(process.execPath, '../../..') : (process.env.APPIMAGE ?? ''))

// Whether this copy can replace itself: a Mac app opened straight from Downloads runs from a hidden read-only copy
// (App Translocation), and an AppImage must be the file it was started from, in a folder we can write to.
export function canInstall() {
  const t = target()
  if (!t || t.includes('/AppTranslocation/')) return false
  try {
    accessSync(dirname(t), constants.W_OK)
    return true
  } catch {
    return false
  }
}

// Downloads this platform's file of a release next to the running copy and checks it; null if that fails. fetch:
// Electron's net.fetch (index.ts), passed in so this file has no Electron import and can be tested.
export async function fetchUpdate(version: string, files: { url: string }[], base: string, fetch: Fetch, progress?: (share: number) => void): Promise<Staged | null> {
  const name = updateFileFor(files, process.platform, process.arch)
  if (!name || !canInstall()) return null
  const [res, sig] = await Promise.all([fetch(`${base}/${name}`), fetch(`${base}/${name}.sig`).then((r) => (r.ok ? r.text() : ''))])
  if (!res.ok || !res.body) return null
  const size = Number(res.headers.get('content-length')) || 0
  const parts: Uint8Array[] = []
  let got = 0
  for await (const part of res.body as unknown as AsyncIterable<Uint8Array>) {
    parts.push(part)
    got += part.length
    if (size) progress?.(got / size)
  }
  const data = Buffer.concat(parts)
  if (!verifyUpdate(version, createHash('sha512').update(data).digest('hex'), sig.trim())) return null
  const file = downloadOf(target())
  writeFileSync(file, data)
  return { version, file }
}

// Puts a checked download in place of the running copy; the caller then relaunches or quits. Synchronous, so quitting
// can never end the process halfway; if the new copy cannot be put in place, the running one goes back and it throws.
// t, platform and unzip are only ever changed by the tests.
export function install(s: Staged, t = target(), platform = process.platform, unzip = (zip: string, out: string) => void execFileSync('ditto', ['-x', '-k', zip, out])) {
  if (platform === 'darwin') {
    const out = join(dirname(t), '.eleusinia-update')
    rmSync(out, { recursive: true, force: true })
    unzip(s.file, out) // ditto keeps the bundle's signature, links and modes
    const old = join(dirname(t), '.Eleusinia-old.app')
    rmSync(old, { recursive: true, force: true })
    renameSync(t, old)
    try {
      renameSync(join(out, 'Eleusinia.app'), t)
    } catch (e) {
      renameSync(old, t)
      throw e
    }
    rmSync(old, { recursive: true, force: true })
    rmSync(out, { recursive: true, force: true })
    rmSync(s.file, { force: true })
  } else {
    chmodSync(s.file, 0o755)
    renameSync(s.file, t)
  }
}

// What an earlier attempt left behind: a download never installed, a half-unpacked one, or the copy it replaced.
export function tidy(t = target()) {
  if (!t) return
  for (const f of [downloadOf(t), join(dirname(t), '.eleusinia-update'), join(dirname(t), '.Eleusinia-old.app')]) if (existsSync(f)) rmSync(f, { recursive: true, force: true })
}
