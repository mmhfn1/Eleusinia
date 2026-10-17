import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type Key, keyTail } from '../shared/protocol'
import { type Report, cleanReport, describe, eventLine } from '../shared/reports'
import { createNet } from './network'

// The developers' inbox, run with `npm run inbox`: receives problem and crash reports from anyone with the app,
// peer to peer and encrypted, keeps each as a file, and files it as an issue in a private GitHub repo. The GitHub
// token only ever lives on the machine running this, never in the app. No Electron imports, so tests can run it.
type Opts = {
  dir: string
  keyPair: { publicKey: Buffer; secretKey: Buffer }
  dht?: object
  github?: { token: string; repo: string } // repo as "owner/name"
  log?: (line: string) => void
  fileEvery?: number
}
type Saved = { report: Report; from: string; received: number; issue: number | null }

const PER_HOUR = 20 // reports accepted from one sender per hour, so nobody can flood the inbox or the issues

export function createInbox({ dir, keyPair, dht, github, log = () => {}, fileEvery = 60000 }: Opts) {
  const saved = join(dir, 'reports')
  mkdirSync(saved, { recursive: true })
  const recent = new Map<Key, number[]>()
  const fileOf = (id: string) => join(saved, id + '.json')

  const net = createNet(
    keyPair,
    {
      open() {},
      close() {},
      msg(key, w) {
        if (w.t !== 'report') return
        const r = cleanReport(w.r)
        if (!r) return
        if (!existsSync(fileOf(r.id))) {
          const times = (recent.get(key) ?? []).filter((t) => t > Date.now() - 3600e3)
          if (times.length >= PER_HOUR) return // no receipt: their copy waits and is offered again later
          recent.set(key, [...times, Date.now()])
          const s: Saved = { report: r, from: keyTail(key), received: Date.now(), issue: null }
          writeFileSync(fileOf(r.id), JSON.stringify(s, null, 2))
          writeFileSync(join(saved, r.id + '.txt'), describe(r))
          log(`received ${r.kind} from …${s.from}: ${r.title}`)
          fileIssues()
        }
        net.send(key, { t: 'reportAck', id: r.id }) // also for a copy we already hold: their receipt was lost
      },
    },
    dht,
  )

  // Files every saved report that has no issue yet; one at a time, retried each minute (GitHub down, no network).
  let filing: Promise<void> | null = null
  function fileIssues() {
    if (!github || filing) return
    filing = (async () => {
      for (const f of readdirSync(saved).filter((n) => n.endsWith('.json'))) {
        const s: Saved = JSON.parse(readFileSync(join(saved, f), 'utf8'))
        if (s.issue) continue
        const issue = await createIssue(github, s).catch((e) => (log(`could not file ${s.report.id} yet: ${e.message}`), null))
        if (!issue) break
        s.issue = issue
        writeFileSync(join(saved, f), JSON.stringify(s, null, 2))
        log(`filed ${s.report.id} as issue #${issue}`)
      }
    })().finally(() => (filing = null))
  }
  const timer = setInterval(fileIssues, fileEvery)
  fileIssues()

  return {
    key: keyPair.publicKey.toString('hex') as Key,
    listening: net.listening as Promise<void>,
    async destroy() {
      clearInterval(timer)
      await filing
      await net.destroy()
    },
  }
}

// @mentions in what testers wrote would ping GitHub users; a zero-width space keeps them as plain text.
const quiet = (text: string) => text.replace(/@(?=\w)/g, '@​')

export function issueOf(s: Saved) {
  const r = s.report
  const parts = [
    `**${r.kind}** · received ${new Date(s.received).toISOString().replace('T', ' ').slice(0, 16)} UTC · from tester …${s.from} · report \`${r.id}\``,
    r.contact ? `Contact: \`${r.contact}\`` : '',
    '### Description',
    quiet(r.body) || '_No description._',
  ]
  if (r.meta) parts.push('### App and system', ...Object.entries(r.meta).map(([k, v]) => `- ${k}: \`${v}\``))
  if (r.events?.length) parts.push('### Events (UTC)', ['```text', ...r.events.map(eventLine), '```'].join('\n'))
  return { title: quiet(`[${r.kind}] ${r.title}`), body: parts.filter(Boolean).join('\n\n'), labels: [r.kind] }
}

async function createIssue(github: { token: string; repo: string }, s: Saved): Promise<number> {
  const post = (body: object) =>
    fetch(`https://api.github.com/repos/${github.repo}/issues`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${github.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'eleusinia-inbox' },
      body: JSON.stringify(body),
    })
  const issue = issueOf(s)
  let res = await post(issue)
  if (res.status === 422) res = await post({ ...issue, labels: undefined }) // the token may not be allowed to create labels
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
  return (await res.json()).number
}
