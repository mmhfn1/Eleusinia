import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { type Key, keyTail } from '../shared/protocol'
import { type Pull, type Report, cleanReport, describe, eventLine } from '../shared/reports'
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
  gatherMs?: number // how long after a log pull its issue is filed with the answers so far (testing: shorter)
}
// A log pull and the logs that answered it, kept in pulls.json: one issue per pull, later answers as comments on it
type PullRecord = Pull & { reports: string[]; posted: string[]; issue: number | null }
type Saved = { report: Report; from: string; received: number; issue: number | null }

// Reports accepted per hour from one sender, and from everyone together (new keys cost nothing), so nobody can
// flood the inbox or the issues. Only accepted senders are kept, and only for the hour.
export function reportLimit(perSender = 20, total = 100) {
  const recent = new Map<Key, number[]>()
  return (key: Key, now = Date.now()) => {
    for (const [k, times] of recent) {
      const kept = times.filter((t) => t > now - 3600e3)
      if (kept.length) recent.set(k, kept)
      else recent.delete(k)
    }
    if ((recent.get(key)?.length ?? 0) >= perSender || [...recent.values()].reduce((n, t) => n + t.length, 0) >= total) return false
    recent.set(key, [...(recent.get(key) ?? []), now])
    return true
  }
}

export function createInbox({ dir, keyPair, dht, github, log = () => {}, fileEvery = 60000, gatherMs = 10 * 60000 }: Opts) {
  const saved = join(dir, 'reports')
  mkdirSync(saved, { recursive: true })
  const allowed = reportLimit()
  const fileOf = (id: string) => join(saved, id + '.json')
  // Reports without an issue yet, read from the folder once: it only grows, so it is not read again every minute.
  const read = (f: string): Saved | null => {
    try {
      return JSON.parse(readFileSync(join(saved, f), 'utf8'))
    } catch {
      return null
    }
  }
  // Logs from a pull are only saved: a pull from every tester would otherwise open an issue each
  const files = (s: Saved | null) => s?.issue === null && s.report.kind !== 'logs'
  const unfiled = new Set(readdirSync(saved).filter((f) => f.endsWith('.json') && files(read(f))))
  const pullsFile = join(dir, 'pulls.json')
  let pulls: PullRecord[] = []
  try {
    pulls = JSON.parse(readFileSync(pullsFile, 'utf8'))
  } catch {}
  const savePulls = () => writeFileSync(pullsFile, JSON.stringify(pulls.slice(-50), null, 2))
  // A tester's answer names its pull by the first 6 characters (index.ts), the newest pull with them is it
  const pullOf = (r: Report) => {
    const m = r.kind === 'logs' && /^Logs for pull ([0-9a-f]{6})$/.exec(r.title)
    return m ? [...pulls].reverse().find((p) => p.id.startsWith(m[1])) : undefined
  }

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
          if (!allowed(key)) return // no receipt: their copy waits and is offered again later
          const s: Saved = { report: r, from: keyTail(key), received: Date.now(), issue: null }
          writeFileSync(fileOf(r.id), JSON.stringify(s, null, 2))
          if (files(s)) unfiled.add(r.id + '.json')
          const p = pullOf(r)
          if (p && !p.reports.includes(r.id)) p.reports.push(r.id), savePulls()
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
      for (const f of unfiled) {
        const s = read(f)
        if (!s || s.issue) {
          unfiled.delete(f)
          continue
        }
        const issue = await createIssue(github, issueOf(s)).catch((e) => (log(`could not file ${s.report.id} yet: ${e.message}`), e))
        // GitHub refusing this one report (a 4xx other than sign-in or rate limits) must not hold back the ones after
        // it; anything else (offline, GitHub down, a bad token) stops the round until the next minute.
        if (issue instanceof Error) {
          if (refused(issue)) continue
          break
        }
        s.issue = issue
        writeFileSync(join(saved, f), JSON.stringify(s, null, 2))
        unfiled.delete(f)
        log(`filed ${s.report.id} as issue #${issue}`)
      }
      // Log pulls: one issue once gatherMs has passed (most testers answer within minutes), then each later answer as a
      // comment on it. A failure stops the round, as above.
      for (const p of pulls) {
        const fresh = p.reports.filter((id) => !p.posted.includes(id))
        if (!fresh.length || (!p.issue && Date.now() < p.at + gatherMs)) continue
        const answers = fresh.map((id) => read(id + '.json')).filter((s): s is Saved => !!s)
        try {
          if (!p.issue) p.issue = await createIssue(github, pullIssueOf(p, answers))
          else for (const s of answers) await addComment(github, p.issue, pullSection(s))
        } catch (e) {
          log(`could not file pull ${p.id.slice(0, 6)} yet: ${(e as Error).message}`)
          break
        }
        p.posted.push(...fresh)
        savePulls()
        log(`pull ${p.id.slice(0, 6)}: ${answers.length} answer${answers.length === 1 ? '' : 's'} in issue #${p.issue}`)
      }
    })().finally(() => (filing = null))
  }
  const timer = setInterval(fileIssues, fileEvery)
  fileIssues()

  return {
    key: keyPair.publicKey.toString('hex') as Key,
    listening: net.listening as Promise<void>,
    // A log pull (shared/reports.ts Pull), published under the inbox's own key so nobody else can make one; tester copies
    // answer within a few minutes, or when they next start within a day. Resolves null when the DHT did not take it.
    async pull(to: Pull['to']): Promise<Pull | null> {
      await net.listening
      const p: Pull = { id: randomBytes(8).toString('hex'), at: Date.now(), to }
      if (!(await net.publish(Buffer.from(JSON.stringify(p)), Math.floor(p.at / 1000)))) return null
      pulls.push({ ...p, reports: [], posted: [], issue: null })
      savePulls()
      return p
    },
    async destroy() {
      clearInterval(timer)
      await filing
      await net.destroy()
    },
  }
}

// @mentions in what testers wrote would ping GitHub users; a zero-width space keeps them as plain text.
const quiet = (text: string) => text.replace(/@(?=\w)/g, '@​')

const utc = (at: number) => new Date(at).toISOString().replace('T', ' ').slice(0, 16)
const FENCE = '```'

// The newest event lines that fit in room characters: GitHub refuses a body over 65536 characters, and 400 long
// events go past it, so the oldest are left out and the heading says how many
function eventsIn(r: Report, room: number, heading: string) {
  const lines = (r.events ?? []).map(eventLine)
  let size = 0
  let cut = lines.length // the newest that fit are kept: lines[cut..]
  while (cut > 0 && size + lines[cut - 1].length + 1 <= room) size += lines[--cut].length + 1
  return lines.length ? `\n\n${heading}${cut ? `, the ${cut} oldest left out to fit` : ''}\n${[FENCE + 'text', ...lines.slice(cut), FENCE].join('\n')}` : ''
}

export function issueOf(s: Saved) {
  const r = s.report
  const parts = [
    `**${r.kind}** · received ${utc(s.received)} UTC · from tester …${s.from} · report \`${r.id}\``,
    r.contact ? `Contact: \`${r.contact}\`` : '',
    '### Description',
    quiet(r.body) || '_No description._',
  ]
  if (r.meta) parts.push('### App and system', ...Object.entries(r.meta).map(([k, v]) => `- ${k}: \`${v}\``))
  const head = parts.filter(Boolean).join('\n\n')
  return { title: quiet(`[${r.kind}] ${r.title}`), body: head + eventsIn(r, ISSUE_MAX - head.length - 200, '### Events (UTC)'), labels: [r.kind] }
}

// One tester's answer to a log pull: what they run, then their newest events within room
export function pullSection(s: Saved, room = ISSUE_MAX) {
  const m = s.report.meta
  const head = `### Tester …${s.from}\n${m ? `${m.version} · ${m.os} · ${m.appMemoryMb ?? '?'} MB in use · ${m.locale}` : 'no app details'} · answered ${utc(s.received)} UTC`
  return head + eventsIn(s.report, room - head.length - 100, '**Events (UTC)**')
}

// The issue for a log pull: who was asked and who answered, then a section each, sharing the room equally
export function pullIssueOf(p: Pull, answers: Saved[]) {
  const who = p.to === 'all' ? 'every tester' : p.to.join(', ')
  const head = [
    `**Log pull** \`${p.id.slice(0, 6)}\` · asked ${utc(p.at)} UTC for ${who} · ${answers.length} answered so far (later answers are added as comments)`,
    `Testers: ${answers.map((s) => `…${s.from}`).join(', ')}`,
  ].join('\n\n')
  const room = Math.floor((ISSUE_MAX - head.length - 200) / Math.max(1, answers.length))
  const title = `[logs] Pull ${p.id.slice(0, 6)}: ${answers.length} tester${answers.length === 1 ? '' : 's'}, ${utc(p.at)} UTC`
  return { title, body: [head, ...answers.map((s) => pullSection(s, room))].join('\n\n'), labels: ['logs'] }
}
const ISSUE_MAX = 65000
const refused = (e: Error & { status?: number }) => !!e.status && e.status >= 400 && e.status < 500 && ![401, 403, 429].includes(e.status)

type GitHub = { token: string; repo: string }
const post = (github: GitHub, path: string, body: object) =>
  fetch(`https://api.github.com/repos/${github.repo}/issues${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${github.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'eleusinia-inbox' },
    body: JSON.stringify(body),
  })
async function numberOf(res: Response): Promise<number> {
  if (!res.ok) throw Object.assign(new Error(`GitHub answered ${res.status}`), { status: res.status })
  return (await res.json()).number
}

async function createIssue(github: GitHub, issue: { title: string; body: string; labels?: string[] }): Promise<number> {
  let res = await post(github, '', issue)
  if (res.status === 422) res = await post(github, '', { ...issue, labels: undefined }) // the token may not be allowed to create labels
  return numberOf(res)
}
async function addComment(github: GitHub, issue: number, body: string) {
  const res = await post(github, `/${issue}/comments`, { body })
  if (!res.ok) throw Object.assign(new Error(`GitHub answered ${res.status}`), { status: res.status })
}
