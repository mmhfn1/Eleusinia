// Signs a release installer with the update key (see src/shared/updatesig.ts), writing <installer>.sig next to it.
// Usage: UPDATE_SIGNING_KEY=<secret key hex> node build/sign-update.cjs <installer.exe> <version>
const { createHash } = require('node:crypto')
const { readFileSync, writeFileSync } = require('node:fs')
const crypto = require('hypercore-crypto')

const [file, version] = process.argv.slice(2)
const secret = process.env.UPDATE_SIGNING_KEY?.trim()
if (!file || !version) throw new Error('usage: node build/sign-update.cjs <installer.exe> <version>')
if (!secret || !/^[0-9a-f]{128}$/.test(secret)) throw new Error('UPDATE_SIGNING_KEY is missing or not a 64-byte hex secret key')
const sha512 = createHash('sha512').update(readFileSync(file)).digest('hex')
const sig = crypto.sign(Buffer.from(`eleusinia-update:${version}:${sha512}`), Buffer.from(secret, 'hex'))
writeFileSync(file + '.sig', sig.toString('hex'))
console.log(`signed ${file} (${version})`)
