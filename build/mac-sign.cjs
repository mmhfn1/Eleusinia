// electron-builder afterPack (package.json): signs the macOS app before it is zipped and put in a disk image. Release
// builds use Eleusinia's own self-signed certificate (MAC_SIGN_IDENTITY, its SHA-1 fingerprint, set by the release
// workflow), the same for every release: the Keychain keeps trusting the app across updates and our updater
// (src/main/selfupdate.ts) can put a new version in place. Without it (test builds) the app is signed ad hoc, the
// least a Mac runs. Not Apple's Developer ID: the first launch still needs right-click → Open.
const { execFileSync } = require('node:child_process')
const { join } = require('node:path')

exports.default = async function (context) {
  if (context.electronPlatformName !== 'darwin') return
  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  const identity = process.env.MAC_SIGN_IDENTITY || '-'
  const keychain = process.env.MAC_SIGN_KEYCHAIN ? ['--keychain', process.env.MAC_SIGN_KEYCHAIN] : []
  execFileSync('codesign', ['--force', '--deep', '--sign', identity, ...keychain, app], { stdio: 'inherit' })
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' })
}
