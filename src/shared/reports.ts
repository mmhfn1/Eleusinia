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

export type Kind = 'bug' | 'feedback' | 'idea' | 'crash'
export const KINDS: Kind[] = ['bug', 'feedback', 'idea', 'crash']
// Which part of the app a diagnostic event comes from; the report dialog offers each as its own choice.
export type Area = 'app' | 'network' | 'call' | 'error'
export const AREAS: Area[] = ['app', 'network', 'call', 'error']
export type Diag = { at: number; area: Area; text: string }
export type Meta = { version: string; build: string; os: string; arch: string; electron: string; chrome: string; locale: string; memoryGb: number }

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
export const KEEP_EVENTS_MS = 15 * 60000 // diagnostics cover the last 15 minutes, in memory only

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
    .replace(/([a-z]:[\\/]+users[\\/]+|\/(?:home|Users)\/)[^\\/\s'"]+/gi, '$1…')
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
  }
  if (Array.isArray(r.events)) {
    out.events = r.events
      .slice(-LIMITS.events)
      .filter((e: any) => e && AREAS.includes(e.area) && typeof e.text === 'string')
      .map((e: any) => ({ at: Number(e.at) || 0, area: e.area, text: scrub(e.text) }))
  }
  return JSON.stringify(out).length <= LIMITS.bytes ? out : null
}

// The last few minutes of diagnostic events, kept in memory only and scrubbed as they arrive.
export function createDiagnostics(now = () => Date.now()) {
  const events: Diag[] = []
  return {
    add(area: Area, text: string) {
      events.push({ at: now(), area, text: scrub(text) })
      const cutoff = now() - KEEP_EVENTS_MS
      while (events.length && (events[0].at < cutoff || events.length > LIMITS.events)) events.shift()
    },
    list: (areas: Area[] = AREAS) => events.filter((e) => areas.includes(e.area)),
  }
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
