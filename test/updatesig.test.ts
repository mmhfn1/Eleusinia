import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import crypto from 'hypercore-crypto'
import { expect, test } from 'vitest'
import { updateFileFor, verifyUpdate } from '../src/shared/updatesig'

test('an installer signed by the release script verifies, and nothing else does', () => {
  const kp = crypto.keyPair()
  const key = kp.publicKey.toString('hex')
  const file = join(mkdtempSync(join(tmpdir(), 'eleusinia-sig-')), 'Eleusinia-Setup-1.2.3.exe')
  writeFileSync(file, 'pretend installer')
  execFileSync(process.execPath, ['build/sign-update.cjs', file, '1.2.3'], { env: { ...process.env, UPDATE_SIGNING_KEY: kp.secretKey.toString('hex') } })
  const sig = readFileSync(file + '.sig', 'utf8')
  const sha = createHash('sha512').update(readFileSync(file)).digest('hex')
  expect(verifyUpdate('1.2.3', sha, sig, key)).toBe(true)
  expect(verifyUpdate('1.2.4', sha, sig, key)).toBe(false) // passed off as another version
  expect(verifyUpdate('1.2.3', createHash('sha512').update('tampered').digest('hex'), sig, key)).toBe(false)
  expect(verifyUpdate('1.2.3', sha, sig)).toBe(false) // signed with some other key than Eleusinia's
  expect(verifyUpdate('1.2.3', sha, '')).toBe(false)
})

test('a Mac takes the zip for its own processor, Linux the AppImage, Windows none of these', () => {
  const files = [{ url: 'Eleusinia-1.2.3-x64-mac.zip' }, { url: 'Eleusinia-1.2.3-arm64-mac.zip' }, { url: 'Eleusinia-1.2.3.AppImage' }, { url: 'Eleusinia-1.2.3-arm64.dmg' }]
  expect(updateFileFor(files, 'darwin', 'arm64')).toBe('Eleusinia-1.2.3-arm64-mac.zip')
  expect(updateFileFor(files, 'darwin', 'x64')).toBe('Eleusinia-1.2.3-x64-mac.zip')
  expect(updateFileFor(files, 'linux', 'x64')).toBe('Eleusinia-1.2.3.AppImage')
  expect(updateFileFor(files, 'win32', 'x64')).toBe(null)
  expect(updateFileFor([{ url: 'Eleusinia-1.2.3-x64-mac.zip' }], 'darwin', 'arm64')).toBe(null)
})
