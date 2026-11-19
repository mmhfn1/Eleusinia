// The developers' inbox on a server: plain Node, no Electron, the same inbox as `npm run inbox` (inbox.ts runInbox).
// `--pull all | name#1234 | a1b2c3 ...` asks the inbox running on that data folder for a log pull and exits.
// Deployment: docs/oracle-setup.md, part E.
import { askPull, runInbox, takeAsks } from '../main/inbox'
import { pullTargets } from '../shared/reports'

const args = process.argv.slice(2)
const flag = args.indexOf('--data')
const dir = flag >= 0 && args[flag + 1] ? args[flag + 1] : process.env.ELEUSINIA_INBOX_DIR || './inbox-data'
const log = (line: string) => console.log(`${new Date().toISOString().slice(0, 19).replace('T', ' ')}  ${line}`)

const p = args.indexOf('--pull')
if (p >= 0) {
  const rest = args.slice(p + 1)
  const end = rest.findIndex((a) => a.startsWith('-'))
  const arg = (end < 0 ? rest : rest.slice(0, end)).join(' ') || 'all'
  if (!pullTargets(arg)) {
    console.log(`"${arg}" is not a friend ID (name#1234) or Unique Key (6 characters); say all for everyone`)
    process.exit(1)
  }
  askPull(dir, arg)
  console.log(`Asked the inbox in ${dir} to pull logs from ${arg}; it says when the pull is out (journalctl -u eleusinia-inbox)`)
  process.exit(0)
}

// Testing only, as in the app: "host:port,host:port" joins a local test DHT instead of the public one.
const bootstrap = (process.env.ELEUSINIA_BOOTSTRAP ?? '').split(',').map((s) => s.trim()).filter((s) => /^[\w.-]+:\d{1,5}$/.test(s))
const { inbox, pull } = runInbox(dir, bootstrap.length ? { bootstrap } : undefined, log)
const takePulls = () => takeAsks(dir).forEach(pull)
takePulls()
const timer = setInterval(takePulls, 2000)

let stopping = false
async function stop() {
  if (stopping) return
  stopping = true
  clearInterval(timer)
  await inbox.destroy().catch(() => {})
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
