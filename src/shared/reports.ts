// Problem reports and crash reports for the developers. No DOM or Electron imports, so it can be unit tested.
//
// A report travels encrypted and peer to peer to the developers' inbox (src/main/inbox.ts), never through anyone
// else. Privacy rules, applied here so every path obeys them:
// - nothing leaves without the person seeing it first, except crash reports, which they can turn off;
// - every line is scrubbed (`scrub`) before it is even kept in memory: no full keys, network addresses, user
//   folders or email addresses;
// - no messages, names, pictures, window titles or device names are ever recorded.

// The developers' inbox. Its secret key lives only on the machine that runs `npm run inbox`.
export const INBOX_KEY = 'dcd6194dda6abebfddf17b8fd26e23ed87b8791894156e7ec931dcd83d6be1c6'

// Shown in Settings and sent with every report.
export const BUILD = 'tester'

export type Kind = 'bug' | 'feedback' | 'idea' | 'crash' | 'logs'
export const KINDS: Kind[] = ['bug', 'feedback', 'idea', 'crash', 'logs'] // logs: answered a developer's pull (pullFor)
// Which part of the app a diagnostic event comes from; the report dialog offers each as its own choice.
export type Area = 'app' | 'network' | 'call' | 'error'
export const AREAS: Area[] = ['app', 'network', 'call', 'error']
export type Diag = { at: number; area: Area; text: string }
export type Meta = { version: string; build: string; os: string; arch: string; electron: string; chrome: string; locale: string; memoryGb: number; appMemoryMb?: number } // appMemoryMb: all of the app's processes, from 0.0.45

export type Report = {
  id: string // 16 hex, chosen by the sender, so a report resent after a lost receipt is stored once
  at: number
  kind: Kind
  title: string
  body: string
  contact?: string // the sender's friend ID, only when they ask to be contacted
  meta?: Meta
  events?: Diag[]
}

export const LIMITS = { title: 120, body: 4000, contact: 40, events: 400, event: 300, bytes: 96 * 1024 }
export const KEEP_EVENTS_MS = 15 * 60000 // this session's diagnostics cover its last 15 minutes
// Earlier sessions' last lines, kept in the data folder (index.ts, diagnostics.json) so a crash report or a log pull
// after a restart still has what happened before it: for a day, as long as a pull stays valid, and at most this many
export const KEEP_PREVIOUS_MS = 24 * 3600e3
export const KEEP_PREVIOUS = 200

// Removes anything that could identify the person or their machine. Keys keep only their last 6 characters, the
// Unique Key the app already shows, so events about the same peer can still be told apart. Clock times (12:34:56)
// are left alone; IPv6 addresses need a "::" or at least five groups to count.
export function clean(text: string) {
  return text
    .replace(/\b[0-9a-f]{64}\b/gi, (k) => '…' + k.slice(-6).toUpperCase())
    .replace(/\b[0-9a-f]{32}\b/gi, (g) => 'group…' + g.slice(-4).toUpperCase())
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/\b(\d{1,3}\.){3}\d{1,3}(:\d+)?\b/g, '[address]')
    .replace(/\[?[0-9a-f:]*::[0-9a-f:]*\]?(:\d+)?|\[?\b(?:[0-9a-f]{1,4}:){4,7}[0-9a-f]{1,4}\b\]?(:\d+)?/gi, '[address]')
    .replace(/([a-z]:[\\/]+users[\\/]+|\/(?:home|Users)\/)[^\\/'"\n]+/gi, '$1…') // spaces allowed: "John Smith" is one folder
}
// One diagnostic line: cleaned and capped.
export const scrub = (text: string) => clean(text).slice(0, LIMITS.event)

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

// Reports arrive at the inbox from anyone running the app, so every field is checked, capped and scrubbed again.
export function cleanReport(r: any): Report | null {
  if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !/^[0-9a-f]{16}$/.test(r.id)) return null
  if (!KINDS.includes(r.kind)) return null
  const title = scrub(str(r.title, LIMITS.title))
  if (!title) return null
  const out: Report = { id: r.id, at: Number(r.at) || 0, kind: r.kind, title, body: clean(str(r.body, LIMITS.body)) }
  if (r.contact) out.contact = str(r.contact, LIMITS.contact)
  if (r.meta && typeof r.meta === 'object') {
    const m = r.meta
    out.meta = {
      version: str(m.version, 20),
      build: str(m.build, 20),
      os: scrub(str(m.os, 60)),
      arch: str(m.arch, 10),
      electron: str(m.electron, 20),
      chrome: str(m.chrome, 30),
      locale: str(m.locale, 20),
      memoryGb: Math.round(Number(m.memoryGb) || 0),
    }
    const mb = Math.round(Number(m.appMemoryMb))
    if (mb > 0 && mb < 1e6) out.meta.appMemoryMb = mb
  }
  if (Array.isArray(r.events)) {
    out.events = r.events
      .slice(-LIMITS.events)
      .filter((e: any) => e && AREAS.includes(e.area) && typeof e.text === 'string')
      .map((e: any) => ({ at: Number(e.at) || 0, area: e.area, text: scrub(e.text) }))
  }
  // Too big with every line (stored sessions fill the list): the oldest lines go first, so the report still arrives
  while (out.events?.length && JSON.stringify(out).length > LIMITS.bytes) out.events.splice(0, Math.ceil(out.events.length / 10))
  return JSON.stringify(out).length <= LIMITS.bytes ? out : null
}

// The last few minutes of diagnostic events, scrubbed as they arrive, and with a store, earlier sessions' last lines.
// What a stored file held, checked again: only well-formed lines, scrubbed once more, from the last day, the newest 200
export function previousDiagnostics(stored: unknown, now = Date.now()): Diag[] {
  if (!Array.isArray(stored)) return []
  const ok = stored.filter((e) => Number.isSafeInteger(e?.at) && e.at > now - KEEP_PREVIOUS_MS && e.at <= now && AREAS.includes(e.area) && typeof e.text === 'string')
  return ok.slice(-KEEP_PREVIOUS).map((e) => ({ at: e.at, area: e.area, text: scrub(e.text).slice(0, LIMITS.event) }))
}

// save: called (soon after each change) with everything list() gives, for the next start to load as `previous`
export function createDiagnostics(now = () => Date.now(), previous: Diag[] = [], save?: (events: Diag[]) => void) {
  const events: Diag[] = []
  let saving: ReturnType<typeof setTimeout> | null = null
  const list = (areas: Area[] = AREAS) => [...previous, ...events].filter((e) => areas.includes(e.area)).slice(-LIMITS.events)
  const flush = () => {
    if (saving) clearTimeout(saving)
    saving = null
    save?.(list())
  }
  return {
    add(area: Area, text: string) {
      events.push({ at: now(), area, text: scrub(text) })
      const cutoff = now() - KEEP_EVENTS_MS
      while (events.length && (events[0].at < cutoff || events.length > LIMITS.events)) events.shift()
      if (save) saving ??= setTimeout(flush, 2000)
    },
    list,
    flush, // at a normal quit, and before a crash report goes out
  }
}

// Log pulls (tester builds only): `npm run logs` makes the inbox publish a record signed by INBOX_KEY on the DHT (the
// DHT checks the signature, so nobody else can make one), naming everyone or some testers by friend ID or Unique Key.
// Tester copies read it every few minutes and answer once per pull, within a day, with the same scrubbed diagnostics a
// problem report carries, unless Settings turns it off.
export type Pull = { id: string; at: number; to: 'all' | string[] }
export const PULL_TTL = 24 * 3600e3
export const PULL_EVERY = 2 * 60000

// "all", or friend IDs (name#1234) and Unique Keys (the last 6 characters of a key), comma or space separated
export function pullTargets(arg: string | undefined): Pull['to'] | null {
  const ids = (arg ?? 'all').toLowerCase().split(/[\s,]+/).filter(Boolean)
  if (!ids.length || ids.includes('all')) return 'all'
  const ok = ids.filter((t) => /^[0-9a-f]{6}$/.test(t) || /^[a-z0-9._]{2,20}#\d{4}$/.test(t))
  return ok.length === ids.length && ok.length <= 50 ? ok : null
}

const pullOf = (p: any): Pull | null => {
  if (!/^[0-9a-f]{16}$/.test(p?.id) || !Number.isSafeInteger(p.at)) return null
  const to = p.to === 'all' ? 'all' : Array.isArray(p.to) && p.to.length <= 50 && p.to.every((t: unknown) => typeof t === 'string' && t.length <= 30) ? p.to : null
  return to ? { id: p.id, at: p.at, to } : null
}
const parse = (b: Buffer | null) => {
  try {
    return JSON.parse(String(b))
  } catch {
    return null
  }
}
// The newest pull in the inbox's record (all a 0.1.4 or 0.1.5 copy reads)
export const cleanPull = (b: Buffer | null) => pullOf(parse(b))
// Every pull in the record: the newest at the top, as 0.1.4 reads it, and the day's earlier ones in `more`, so a pull
// made right after another does not hide it
export function pullsIn(b: Buffer | null): Pull[] {
  const r = parse(b)
  const more = Array.isArray(r?.more) ? r.more.slice(0, 20) : []
  return [r, ...more].map(pullOf).filter((p): p is Pull => !!p)
}
// The record the inbox publishes (pullsIn reads it): the pulls of the last day, newest first, within the 1000 bytes a
// DHT record holds
export function pullRecord(pulls: Pull[], now = Date.now()): Buffer {
  const recent = pulls
    .filter((p) => p.at > now - PULL_TTL)
    .sort((a, b) => b.at - a.at)
    .map(({ id, at, to }) => ({ id, at, to })) // only what testers read, never the inbox's own bookkeeping
  for (let n = recent.length; n > 0; n--) {
    const [top, ...more] = recent.slice(0, n)
    const b = Buffer.from(JSON.stringify(more.length ? { ...top, more } : top))
    if (b.length <= 1000) return b
  }
  return Buffer.from(JSON.stringify(recent[0] ?? {}))
}

// A pull this copy should answer: recent, not answered yet, and naming everyone, our Unique Key or our friend ID
export function pullFor(p: Pull | null, me: { tail: string; handle?: string }, answered: string[], now = Date.now()): p is Pull {
  if (!p || answered.includes(p.id) || p.at < now - PULL_TTL || p.at > now + 600000) return false
  return p.to === 'all' || p.to.includes(me.tail.toLowerCase()) || (!!me.handle && p.to.includes(me.handle.toLowerCase()))
}

// One event as a line: time (UTC), area, text.
export const eventLine = (e: Diag) => `${new Date(e.at).toISOString().slice(11, 19)} ${e.area.padEnd(7)} ${e.text}`

// A report as plain text, for the inbox's readable copy and the preview the sender sees before sending.
export function describe(r: Pick<Report, 'kind' | 'title' | 'body' | 'contact' | 'meta' | 'events'>) {
  const lines = [`[${r.kind}] ${r.title}`, '', r.body || '(no description)']
  if (r.contact) lines.push('', `Contact: ${r.contact}`)
  if (r.meta) lines.push('', 'App and system:', ...Object.entries(r.meta).map(([k, v]) => `  ${k}: ${v}`))
  if (r.events?.length) lines.push('', 'Events:', ...r.events.map((e) => '  ' + eventLine(e)))
  return lines.join('\n')
}
