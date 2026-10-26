// Updates are signed with Eleusinia's own update key, on top of HTTPS and GitHub: installers are not code-signed, so
// without this anyone able to publish a release (a stolen GitHub login or token, a tampered build) could push code to
// every installed copy. The signature covers the version and the installer's SHA-512, so an older signed installer
// cannot be passed off as a newer version. Signed in the release workflow by build/sign-update.cjs, checked in
// src/main/index.ts before anything is installed.
import crypto from 'hypercore-crypto'

export const UPDATE_KEY = '95a8f947437c88dfe821fa2bb60f53058959af1dd7113ea1ac362fa009fb909e'

export const updateMessage = (version: string, sha512: string) => Buffer.from(`eleusinia-update:${version}:${sha512}`)

export function verifyUpdate(version: string, sha512: string, sig: string, key = UPDATE_KEY) {
  if (!/^[0-9a-f]{128}$/.test(sig) || !/^[0-9a-f]{128}$/.test(sha512) || !version) return false
  return crypto.verify(updateMessage(version, sha512), Buffer.from(sig, 'hex'), Buffer.from(key, 'hex'))
}

// Which file of a release this copy installs on macOS and Linux (Windows uses electron-updater's own choice): the
// zip for this Mac's processor (Eleusinia-<version>-<arch>-mac.zip, package.json), or the AppImage.
export function updateFileFor(files: { url: string }[], platform: string, arch: string): string | null {
  const want = platform === 'darwin' ? (u: string) => u.endsWith(`-${arch}-mac.zip`) : platform === 'linux' ? (u: string) => u.endsWith('.AppImage') : () => false
  return files.find((f) => want(f.url))?.url ?? null
}
