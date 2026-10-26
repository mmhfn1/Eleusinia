import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { install, tidy } from '../src/main/selfupdate'

const folder = () => mkdtempSync(join(tmpdir(), 'eleusinia-update-'))

test('Linux: the checked download takes the place of the AppImage', () => {
  const dir = folder()
  const app = join(dir, 'Eleusinia.AppImage')
  const file = join(dir, '.eleusinia-update.AppImage')
  writeFileSync(app, 'old')
  writeFileSync(file, 'new')
  install({ version: '1.2.3', file }, app, 'linux')
  expect(readFileSync(app, 'utf8')).toBe('new')
  expect(existsSync(file)).toBe(false)
})

// The Mac app is a folder; the zip is unpacked by ditto, which a stand-in replaces here.
function macApp() {
  const dir = folder()
  const app = join(dir, 'Eleusinia.app')
  mkdirSync(app)
  writeFileSync(join(app, 'version'), 'old')
  const file = join(dir, '.eleusinia-update.zip')
  writeFileSync(file, 'zip')
  return { dir, app, file }
}

test('macOS: the unpacked app replaces the running one, and nothing is left behind', () => {
  const { dir, app, file } = macApp()
  install({ version: '1.2.3', file }, app, 'darwin', (_zip, out) => {
    mkdirSync(join(out, 'Eleusinia.app'), { recursive: true })
    writeFileSync(join(out, 'Eleusinia.app', 'version'), 'new')
  })
  expect(readFileSync(join(app, 'version'), 'utf8')).toBe('new')
  for (const left of ['.Eleusinia-old.app', '.eleusinia-update', '.eleusinia-update.zip']) expect(existsSync(join(dir, left))).toBe(false)
})

test('macOS: when the new app cannot be put in place, the running one goes back', () => {
  const { app, file } = macApp()
  const bad = (_zip: string, out: string) => void mkdirSync(join(out, 'Something else.app'), { recursive: true })
  expect(() => install({ version: '1.2.3', file }, app, 'darwin', bad)).toThrow()
  expect(readFileSync(join(app, 'version'), 'utf8')).toBe('old')
})

test('leftovers of an update that never finished are cleared at the next start', () => {
  const dir = folder()
  const app = join(dir, 'Eleusinia.app')
  mkdirSync(app)
  const download = process.platform === 'darwin' ? '.eleusinia-update.zip' : '.eleusinia-update.AppImage' // this system's
  for (const d of ['.eleusinia-update', '.Eleusinia-old.app']) mkdirSync(join(dir, d))
  writeFileSync(join(dir, download), 'stale')
  tidy(app)
  expect(existsSync(app)).toBe(true)
  for (const left of ['.Eleusinia-old.app', '.eleusinia-update', download]) expect(existsSync(join(dir, left))).toBe(false)
})
