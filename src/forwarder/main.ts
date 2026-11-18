// The server forwarder (design/plan-stream-forwarding.md, phase 5): plain Node, no Electron, beside the relay. The same
// forwarder.ts as call mates, reached over a hyperdht link to its key like a call mate, with hub.ts's limits. It sees
// only encrypted frames, and who streams to whom. Logs only counts. Deployment: docs/oracle-setup.md, part F.
// --data <dir> (forwarder-key, usage.json), --print-key, --public-ip <a.b.c.d> (behind 1:1 NAT), --ports 32768-60999
// (the UDP range the firewall opens), --relay-usage <relay's usage.json> (the month's budget is shared with it).
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import DHT from 'hyperdht'
import { createForwarder } from '../main/forwarder'
import { createNet } from '../main/network'
import { LIMITS, createHub } from './hub'

const args = process.argv.slice(2)
const opt = (name: string) => (args.indexOf(name) >= 0 ? args[args.indexOf(name) + 1] : undefined)
const dir = opt('--data') || process.env.ELEUSINIA_FORWARDER_DIR || './forwarder-data'
const log = (line: string) => console.log(`${new Date().toISOString().slice(0, 19).replace('T', ' ')}  ${line}`)

const publicIp = opt('--public-ip')
if (publicIp !== undefined && !/^\d{1,3}(\.\d{1,3}){3}$/.test(publicIp)) throw new Error('--public-ip needs an IPv4 address')
const range = opt('--ports')?.match(/^(\d{1,5})-(\d{1,5})$/)
if (opt('--ports') !== undefined && !(range && +range[1] > 0 && +range[1] <= +range[2] && +range[2] < 65536)) throw new Error('--ports needs a range like 32768-60999')
const portRange = range ? ([+range[1], +range[2]] as [number, number]) : undefined

// The key is what the app knows the forwarder by (HOSTED_FORWARDERS): a lost key needs a new app release. Owner-only.
function loadKey() {
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const file = join(dir, 'forwarder-key')
  if (!existsSync(file)) writeFileSync(file, DHT.keyPair().secretKey.toString('hex') + '\n', { mode: 0o600, flag: 'wx' })
  chmodSync(file, 0o600)
  const secretKey = Buffer.from(readFileSync(file, 'utf8').trim(), 'hex')
  if (secretKey.length !== 64) throw new Error(`${file} is not a forwarder key`)
  return { publicKey: secretKey.subarray(32), secretKey }
}

const keyPair = loadKey()
if (args.includes('--print-key')) {
  console.log(keyPair.publicKey.toString('hex'))
  process.exit(0)
}

// This month's bytes out, kept across restarts, plus the relay's (read only) when it runs beside us
const usageFile = join(dir, 'usage.json')
const thisMonth = () => new Date().toISOString().slice(0, 7)
const monthBytes = (file: string) => {
  try {
    const u = JSON.parse(readFileSync(file, 'utf8'))
    return u.month === thisMonth() && Number.isFinite(u.bytes) ? u.bytes : 0
  } catch {
    return 0
  }
}
let usage = { month: thisMonth(), bytes: monthBytes(usageFile) }
const relayUsage = opt('--relay-usage')
const used = () => usage.bytes + (relayUsage ? monthBytes(relayUsage) : 0)

// The app's STUN server gives the public address too; maxViewers is the whole server's cap, hub.ts caps each stream
const forwarder = createForwarder({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }], maxViewers: 3 * LIMITS.viewers, publicIp, portRange })
// Testing only, as in the app: "host:port,host:port" joins a local test DHT instead of the public one.
const bootstrap = (process.env.ELEUSINIA_BOOTSTRAP ?? '').split(',').map((s) => s.trim()).filter((s) => /^[\w.-]+:\d{1,5}$/.test(s))
const net = createNet(
  keyPair,
  {
    open: (k) => hub.opened(k),
    close: (k) => hub.closed(k),
    msg: (k, w) => w.t === 'fwd' && hub.msg(k, w),
  },
  { port: Number(process.env.ELEUSINIA_FORWARDER_PORT || 49738), ...(bootstrap.length && { bootstrap }) },
)
const hub = createHub({ forwarder, used, link: { send: net.send, linked: net.linked, ip: (k) => net.path(k).replace(/:\d+$/, '') } })

let counted = 0
const gb = (n: number) => (n / 1e9).toFixed(2) + ' GB'
function minute() {
  if (usage.month !== thisMonth()) usage = { month: thisMonth(), bytes: 0 }
  usage.bytes += forwarder.bytesOut() - counted
  counted = forwarder.bytesOut()
  writeFileSync(usageFile, JSON.stringify(usage))
  const c = hub.counts()
  log(`streams ${c.streams}, viewers ${c.viewers}, ${gb(usage.bytes)} out this month (${gb(used())} with the relay); refused since start: ${c.budget} over budget, ${c.ip} per address, ${c.rate} too fast, ${c.full} viewers past the cap; ${c.failed} failed`)
  if (used() >= LIMITS.monthBytes * LIMITS.budget) log(`warning: ${Math.round((used() / LIMITS.monthBytes) * 100)} % of this month's 10 TB used: no new streams`)
}

net.listening.then(
  () => log(`Eleusinia forwarder listening${publicIp ? ' (public address given)' : ''}${portRange ? `, UDP ${portRange.join('-')}` : ''}`),
  (e: Error) => {
    log(`could not listen: ${e.message}`)
    process.exit(1)
  },
)
const ticks = [setInterval(() => hub.tick(), 1000), setInterval(minute, 60000)]

let stopping = false
async function stop() {
  if (stopping) return
  stopping = true
  ticks.forEach(clearInterval)
  minute()
  forwarder.close()
  await net.destroy().catch(() => {})
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
