// The hosted relay (design/plan-public-relay.md, phase 2): plain Node, no Electron. A blind relay anyone may pair
// through, within HOSTED_LIMITS. Logs only counts, never keys or addresses. Deployment: docs/oracle-setup.md.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import DHT from 'hyperdht'
import { HOSTED_LIMITS, startBlindRelay } from '../main/network'

const MONTH_CAP = 10e12 // Oracle's free 10 TB out a month
const args = process.argv.slice(2)
const flag = args.indexOf('--data')
const dir = flag >= 0 && args[flag + 1] ? args[flag + 1] : process.env.ELEUSINIA_RELAY_DIR || './relay-data'
const log = (line: string) => console.log(`${new Date().toISOString().slice(0, 19).replace('T', ' ')}  ${line}`)

// The key is what the app knows the relay by: a lost key needs a new app release. Owner-only.
function loadKey() {
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const file = join(dir, 'relay-key')
  if (!existsSync(file)) writeFileSync(file, DHT.keyPair().secretKey.toString('hex') + '\n', { mode: 0o600, flag: 'wx' })
  chmodSync(file, 0o600)
  const secretKey = Buffer.from(readFileSync(file, 'utf8').trim(), 'hex')
  if (secretKey.length !== 64) throw new Error(`${file} is not a relay key`)
  return { publicKey: secretKey.subarray(32), secretKey }
}

const keyPair = loadKey()
if (args.includes('--print-key')) {
  console.log(keyPair.publicKey.toString('hex'))
  process.exit(0)
}

// Testing only, as in the app: "host:port,host:port" joins a local test DHT instead of the public one.
const bootstrap = (process.env.ELEUSINIA_BOOTSTRAP ?? '').split(',').map((s) => s.trim()).filter((s) => /^[\w.-]+:\d{1,5}$/.test(s))
const dht = new DHT({ port: Number(process.env.ELEUSINIA_RELAY_PORT || 49737), ...(bootstrap.length && { bootstrap }) })
const relay = startBlindRelay(dht, keyPair, () => true, HOSTED_LIMITS)

// This month's bytes, kept across restarts. Each relayed byte comes in once and goes out once.
const usageFile = join(dir, 'usage.json')
const thisMonth = () => new Date().toISOString().slice(0, 7)
let usage = { month: thisMonth(), bytes: 0 }
try {
  const saved = JSON.parse(readFileSync(usageFile, 'utf8'))
  if (saved.month === usage.month && Number.isFinite(saved.bytes)) usage.bytes = saved.bytes
} catch {}
let counted = 0
let refusedBefore = 0
const gb = (n: number) => (n / 1e9).toFixed(2) + ' GB'

function tick() {
  const s = relay.stats()
  if (usage.month !== thisMonth()) usage = { month: thisMonth(), bytes: 0 }
  usage.bytes += s.bytes - counted
  counted = s.bytes
  writeFileSync(usageFile, JSON.stringify(usage))
  log(`pairs ${s.pairs}, relayed ${gb(s.bytes)} since start, ${gb(usage.bytes)} out this month, refused ${s.refused - refusedBefore} in the last minute`)
  refusedBefore = s.refused
  if (usage.bytes >= MONTH_CAP * 0.8) log(`warning: ${Math.round((usage.bytes / MONTH_CAP) * 100)} % of this month's 10 TB used`)
}

relay.listening.then(
  async () => {
    await dht.fullyBootstrapped()
    log(`Eleusinia relay listening, firewalled=${dht.firewalled} randomized=${dht.randomized}`)
  },
  (e: Error) => {
    log(`could not listen: ${e.message}`)
    process.exit(1)
  },
)
const timer = setInterval(tick, 60000)

let stopping = false
async function stop() {
  if (stopping) return
  stopping = true
  clearInterval(timer)
  tick()
  await relay.stop().catch(() => {})
  await dht.destroy().catch(() => {})
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
