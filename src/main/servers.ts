// Servers' op logs on this computer and their sync between members (no Electron imports, like node.ts). Each server
// is an append-only log of signed ops (shared/server.ts) in servers/<id>.jsonl, synced like a conversation's messages:
// per-author counts (`sops`), only what the peer lacks, a page at a time, new ops passed on to a few linked members.
// Logs are exchanged only with current members in our own replay, so kicked or banned keys get nothing new.
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { type Have, type Key, type ServerView, type Wire, isGroupId, isKey } from '../shared/protocol'
import { type Op, type ServerState, can, createServer, isCut, permsOf, replay, signOp, verifyOp } from '../shared/server'

const PAGE = 200 // ops per catch-up round, like CATCHUP_PAGE for messages
const BACKLOG = 1 << 20 // no new round while this much is still unsent on the link
// shortcut: every op of every server stays in memory and the whole log is replayed after a change; fine for thousands
// of ops, needs snapshots once real servers have long histories
const MAX_OPS = 100000
const CONV = /^([0-9a-f]{32})\.([0-9a-f]{32})$/ // a text or voice channel's conversation: `${serverId}.${channelId}`

type Opts = {
  dir: string
  keyPair: { publicKey: Buffer; secretKey: Buffer }
  net: { linked(k: Key): boolean; send(k: Key, w: Wire): void; backlog(k: Key): number }
  few: (ks: Key[], n: number) => Key[]
  // A server changed (membership, channels, roles); convs: channels we can newly read, whose messages to ask for
  changed: (convs: string[]) => void
  // A voice.move or voice.disconnect aimed at us, newly accepted while we run
  order?: (server: string, kind: 'move' | 'disconnect', by: Key, channel?: string) => void
}
type Log = { ops: Op[]; have: Have; n: number; state: ServerState | null; dirty: boolean }

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const memberOf = (s: ServerState | null, k: Key) => !!s && Object.hasOwn(s.members, k)

export function createServers({ dir, keyPair, net, few, changed, order }: Opts) {
  const started = Date.now()
  const me: Key = keyPair.publicKey.toString('hex')
  const root = join(dir, 'servers')
  mkdirSync(root, { recursive: true })
  const file = (id: string) => join(root, id + '.jsonl')
  const logs = new Map<string, Log>()
  // Servers someone let us into (a join they wrote), and who: until our replay shows us in, only they send us the log
  const expected = new Map<string, Key>()
  const sentUpTo = new Map<string, { have: Have; at: number }>() // per link and server: what catch-up just sent
  const askedAt = new Map<string, number>()
  const receipts = new Map<string, ReturnType<typeof setTimeout>>()
  const catching = new Map<string, Have | null>() // at startup, per link and server greeted: their first have, until we hold it
  const fresh: string[] = []
  let flushing: ReturnType<typeof setTimeout> | null = null
  let mates: Set<Key> | null = null // everyone in a server with us, rebuilt after any replay

  function add(log: Log, o: Op) {
    log.ops.push(o)
    log.have[o.author] = Math.max(log.have[o.author] ?? 0, o.seq)
    log.n = Math.max(log.n, o.n)
    log.dirty = true
  }
  function load(id: string) {
    const log: Log = { ops: [], have: {}, n: 0, state: null, dirty: true }
    logs.set(id, log)
    if (!existsSync(file(id))) return log
    const text = readFileSync(file(id), 'utf8')
    // A write cut short leaves a torn last line: end it, or the next op would be glued to it and lost
    if (text && !text.endsWith('\n')) appendFileSync(file(id), '\n')
    for (const line of text.split('\n')) {
      try {
        const o = JSON.parse(line)
        if (isObj(o) && isKey(o.author) && Number.isSafeInteger(o.seq) && Number.isSafeInteger(o.n)) add(log, o as Op)
      } catch {} // blank or torn last line
    }
    return log
  }

  const readable = (s: ServerState | null) =>
    s && memberOf(s, me) ? s.channels.filter((c) => c.kind !== 'category' && can(s, me, 'viewChannel', c.id)).map((c) => `${s.id}.${c.id}`) : []
  const flushSoon = () =>
    void (flushing ??= setTimeout(() => {
      flushing = null
      for (const id of logs.keys()) stateOf(id)
      changed(fresh.splice(0))
    }, 100))
  // Orders aimed at us that this replay accepted and the last did not. Not on the first replay at start, nor ones from
  // before we started or before our latest join (old history arriving late), so only orders given while we run.
  function newOrders(id: string, was: ServerState | null, next: ServerState | null) {
    if (!order || !was || !memberOf(next, me)) return
    const had = new Set(was.audit.map((x) => `${x.author}:${x.n}`))
    const since = Math.max(started, next!.members[me].joinedAt)
    for (const x of next!.audit) {
      if ((x.kind !== 'voice.move' && x.kind !== 'voice.disconnect') || x.target !== me || x.ts < since || had.has(`${x.author}:${x.n}`)) continue
      order(id, x.kind === 'voice.move' ? 'move' : 'disconnect', x.author, x.channel)
    }
  }
  function settle(id: string, log: Log, next: ServerState | null) {
    const before = readable(log.state)
    newOrders(id, log.state, next)
    log.state = next
    log.dirty = false
    mates = null
    if (memberOf(next, me)) expected.delete(id)
    fresh.push(...readable(next).filter((c) => !before.includes(c)))
    flushSoon()
  }
  function stateOf(id: string) {
    const log = logs.get(id)
    if (log?.dirty) settle(id, log, replay(log.ops, Date.now(), id))
    return log?.state ?? null
  }
  const ours = () => [...logs.keys()].map(stateOf).filter((s): s is ServerState => memberOf(s, me))

  // Who we exchange a server's log with: its other members while we are in, else whoever let us in.
  // `cached` skips a replay, for checks made on every incoming op.
  function peersOf(id: string, cached = false): Key[] {
    const s = cached ? (logs.get(id)?.state ?? null) : stateOf(id)
    if (memberOf(s, me)) return Object.keys(s!.members).filter((k) => k !== me)
    const by = expected.get(id)
    return by ? [by] : []
  }

  function append(id: string, o: Op) {
    // Only the signed fields: anything else riding along on the wire is not stored or passed on
    const op: Op = { server: o.server, author: o.author, seq: o.seq, n: o.n, ts: o.ts, kind: o.kind, body: o.body, sig: o.sig }
    add(logs.get(id)!, op)
    appendFileSync(file(id), JSON.stringify(op) + '\n')
    flushSoon()
    return op
  }

  const sendSops = (k: Key, id: string, re?: boolean) => net.send(k, { t: 'sops', server: id, have: logs.get(id)!.have, ...(re && { re }) })
  // A real ask (not a receipt), so they send what we lack even if they just sent it; at most every 2 s per peer and server
  function ask(k: Key, id: string) {
    if ((askedAt.get(k + id) ?? 0) > Date.now() - 2000) return
    if (askedAt.size > 1000) askedAt.clear()
    askedAt.set(k + id, Date.now())
    sendSops(k, id)
  }
  // What we hold now, once a burst of ops from them has settled, so they send the next page
  function receipt(k: Key, id: string) {
    if (receipts.has(k + id)) return
    receipts.set(k + id, setTimeout(() => (receipts.delete(k + id), net.linked(k) && sendSops(k, id, true)), 300))
  }

  function takeOp(from: Key, o: unknown) {
    if (!isObj(o) || typeof o.server !== 'string' || !logs.has(o.server) || !peersOf(o.server, true).includes(from) || !verifyOp(o)) return
    const id = o.server
    const log = logs.get(id)!
    const next = (log.have[o.author] ?? 0) + 1
    if (o.seq < next) return // already have it
    if (o.seq > next) return ask(from, id) // a gap: the ones before it first
    if (log.ops.length >= MAX_OPS) return
    const op = append(id, o)
    receipt(from, id)
    for (const k of few(peersOf(id, true).filter((k) => k !== from && k !== op.author && net.linked(k)), 3)) net.send(k, { t: 'sop', op })
  }

  function takeHave(from: Key, w: { server: unknown; have: unknown; re?: unknown }) {
    const id = w.server
    if (typeof id !== 'string' || !isGroupId(id) || !logs.has(id) || !peersOf(id, true).includes(from) || !isObj(w.have)) return
    const log = logs.get(id)!
    const theirs = w.have
    if (catching.has(from + id)) catching.set(from + id, theirs as Have)
    const upTo: Have = {}
    for (const a of Object.keys(log.have)) upTo[a] = Number(theirs[a]) || 0
    // What this link just carried is not sent again on a receipt (an ask gets it all), as with messages
    const sent = sentUpTo.get(from + id)
    if (sent && w.re === true && sent.at > Date.now() - 10000) for (const [a, n] of Object.entries(sent.have)) upTo[a] = Math.max(upTo[a] ?? 0, n)
    if (net.backlog(from) < BACKLOG && Object.entries(log.have).some(([a, n]) => n > (upTo[a] ?? 0))) {
      const page = log.ops.filter((o) => o.seq > (upTo[o.author] ?? 0)).slice(0, PAGE)
      for (const op of page) net.send(from, { t: 'sop', op }), (upTo[op.author] = Math.max(upTo[op.author] ?? 0, op.seq))
      sentUpTo.set(from + id, { have: upTo, at: Date.now() })
    }
    if (w.re !== true) sendSops(from, id, true)
    else if (Object.entries(theirs).some(([a, n]) => (Number(n) || 0) > (log.have[a] ?? 0))) ask(from, id)
  }

  function knows(k: Key) {
    if (!mates) mates = new Set([...ours().flatMap((s) => Object.keys(s.members)), ...expected.values()])
    return k !== me && mates.has(k)
  }

  function channelKeys(conv: unknown, perm: 'viewChannel' | 'connect', voice = false): Key[] | null {
    const m = typeof conv === 'string' ? CONV.exec(conv) : null
    if (!m) return null
    const s = logs.has(m[1]) ? stateOf(m[1]) : null
    const kind = s?.channels.find((c) => c.id === m[2])?.kind
    if (!s || !memberOf(s, me) || !kind || kind === 'category' || (voice && kind !== 'voice')) return []
    const ok = (k: Key) => can(s, k, 'viewChannel', m[2]) && can(s, k, perm, m[2])
    return ok(me) ? Object.keys(s.members).filter(ok) : []
  }

  const highest = (s: ServerState, k: Key) =>
    k === s.owner ? 1e9 : Math.max(0, ...(s.members[k]?.roles ?? []).map((r) => s.roles.findIndex((x) => x.id === r)))
  function view(s: ServerState): ServerView {
    const sees = (c: { id: string; kind: string }) => c.kind !== 'category' && can(s, me, 'viewChannel', c.id)
    const shown = s.channels.filter((c) => sees(c) || (c.kind === 'category' && (can(s, me, 'viewChannel', c.id) || s.channels.some((x) => x.parent === c.id && sees(x)))))
    const all = can(s, me, 'manageChannels') // managers get every channel, so channel.move indexes match the whole list
    return {
      id: s.id,
      name: s.name,
      avatar: s.avatar,
      owner: s.owner,
      roles: s.roles,
      members: s.members,
      channels: all ? s.channels : shown,
      invites: Object.fromEntries(Object.entries(s.invites).map(([id, { pub: _, ...inv }]) => [id, inv])),
      bans: s.bans,
      voice: s.voice,
      mine: { rank: highest(s, me), perms: [...permsOf(s, me)], channels: Object.fromEntries(shown.map((c) => [c.id, [...permsOf(s, me, c.id)]])) },
    }
  }

  for (const f of readdirSync(root)) if (/^[0-9a-f]{32}\.jsonl$/.test(f)) load(f.slice(0, -6))

  return {
    knows,
    list: ours,
    state: (id: string) => (logs.has(id) ? stateOf(id) : null),
    members: (id: string) => (logs.has(id) && memberOf(stateOf(id), me) ? Object.keys(stateOf(id)!.members) : []),
    // Members of each server we are in, and whoever is letting us into one, for node.ts to pick links among
    lists: () => [...logs.keys()].map((id) => peersOf(id)).filter((l) => l.length),
    // Members of our servers that `k` is in, for presence notes
    around: (k: Key) => new Set(ours().filter((s) => memberOf(s, k)).flatMap((s) => Object.keys(s.members))),
    shares: (k: Key) => ours().some((s) => memberOf(s, k)),
    isChannel: (conv: unknown) => typeof conv === 'string' && CONV.test(conv),
    // Who takes part in a channel's conversation, text or voice (null: not a channel id; empty: not one we can read)
    channelMembers: (conv: unknown) => channelKeys(conv, 'viewChannel'),
    // Who may be in a voice channel's call: view and connect (null: not a channel id; empty: no call we can be in)
    callMembers: (conv: unknown) => channelKeys(conv, 'connect', true),
    // Channels only: `k` may write there now (other conversations are not ours to judge)
    maySend(conv: unknown, k: Key) {
      const m = typeof conv === 'string' ? CONV.exec(conv) : null
      const s = m && logs.has(m[1]) ? stateOf(m[1]) : null
      return !m || (!!s && can(s, k, 'sendMessages', m[2]))
    },
    // Channels `k` and we can both read, for greeting them with what we hold
    channelsWith: (k: Key) => ours().flatMap((s) => readable(s).filter((c) => can(s, k, 'viewChannel', c.split('.')[1]))),
    summary: () => Object.fromEntries(ours().map((s) => [s.id, view(s)])),
    // The server's log of accepted ops for its settings page, newest first; only with viewAuditLog
    audit(id: string) {
      const s = logs.has(id) ? stateOf(id) : null
      return s && can(s, me, 'viewAuditLog') ? s.audit.slice(-500).reverse() : []
    },
    create(name: string) {
      if (typeof name !== 'string' || !name.trim() || name.length > 100) throw new Error('A server needs a name of up to 100 characters')
      const { id, op } = createServer(name.trim(), keyPair)
      load(id)
      append(id, op)
      stateOf(id)
      return id
    },
    // Signs our next op, keeps it only if the replay accepts it, and sends it to every linked member (before and after
    // it, so someone it kicks hears of it too).
    act(id: string, kind: string, body: unknown) {
      const log = logs.get(id)
      const s = log ? stateOf(id) : null
      if (!log || !s || !memberOf(s, me)) throw new Error('You are not in that server')
      // A cut op names what we had seen; only authors with an accepted op, so junk keys cannot bloat it past the cap
      if (isCut(kind, body) && isObj(body)) {
        const authors = new Set(s.audit.map((x) => x.author))
        body = { ...body, seen: Object.fromEntries(Object.entries(log.have).filter(([k]) => authors.has(k))) }
      }
      const op = signOp({ server: id, seq: (log.have[me] ?? 0) + 1, n: log.n + 1, ts: Date.now(), kind, body }, keyPair)
      const next = replay([...log.ops, op], Date.now(), id)
      if (!next || next.audit.length === s.audit.length) throw new Error('That is not allowed')
      append(id, op)
      settle(id, log, next)
      for (const k of new Set([...Object.keys(s.members), ...Object.keys(next.members)])) if (k !== me && net.linked(k)) net.send(k, { t: 'sop', op })
    },
    // A member wrote our join: take the log from them until our replay shows us in (invite links come later)
    expect(id: string, by: Key) {
      if (!isGroupId(id) || !isKey(by) || by === me) throw new Error('That is not a server to join')
      if (!logs.has(id)) load(id)
      if (memberOf(stateOf(id), me)) return
      expected.set(id, by)
      mates = null
    },
    // `track`: at startup, wait for their answer and what it shows we lack (`behind`)
    greet(k: Key, track = false) {
      for (const id of logs.keys()) if (peersOf(id).includes(k)) sendSops(k, id), track && catching.set(k + id, null)
    },
    // Linked peers whose first sops have has not come, or showed ops we do not hold yet
    behind(): Key[] {
      const out: Key[] = []
      for (const [x, h] of catching) {
        const have = logs.get(x.slice(64))?.have ?? {}
        if (h && !Object.entries(h).some(([a, n]) => (Number(n) || 0) > (have[a] ?? 0))) catching.delete(x)
        else out.push(x.slice(0, 64))
      }
      return out
    },
    receive(k: Key, w: Wire) {
      if (w.t === 'sop') takeOp(k, w.op)
      else if (w.t === 'sops') takeHave(k, w)
    },
    closed(k: Key) {
      for (const m of [sentUpTo, catching]) for (const x of m.keys()) if (x.startsWith(k)) m.delete(x)
    },
    destroy() {
      if (flushing) clearTimeout(flushing)
      receipts.forEach(clearTimeout)
    },
  }
}
