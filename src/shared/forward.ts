// Who carries a stream to whom (design/plan-stream-forwarding.md, phase 2). Pure, so every copy agrees and it is tested
// alone. Direct copies first while the streamer's upload covers them, then call mates with spare upload forwarding,
// then a server, at most two levels below the streamer; without a server the rest go direct, flagged `over`.
import type { Key } from './protocol'
import type { Grade } from './quality'
import { nearest } from './relays'
import type { Level } from './video'

export const HEADROOM = 0.7 // every upload is used to 70 % at most, as measurements run high
export const MAX_LEVELS = 2
export const SERVER_VIEWERS = 40 // a server forwarder's cap per stream (phase 5)

export type Layers = { full: number; low: number } // kbps of the whole stream and of its lowest layer (thumbnails)
export type Mate = {
  key: Key
  want: Level
  spareKbps: number // upload they can give, measured and reported by them
  grade: Grade | null
  strict: boolean
  busy: boolean // streaming themselves or in a game
  canForward: boolean // hello.fwd: older copies never forward
}
export type Input = { layers: Layers; uploadKbps: number | null; mates: Mate[]; servers: Record<Key, number | null> }
export type From = 'streamer' | Key
export type Seat = { from: From; low?: true; over?: true } // low: the lowest layer; over: beyond the streamer's upload
export type Tree = { seats: Record<Key, Seat>; forwarders: Key[] } // seats: viewers, and each forwarder's own feed
// Why a carrier is dropped: it left, its grade stayed poor for 90 s, or it was starved for 10 s. The streamer itself is
// never dropped; its viewers are rechecked against the upload given anyway.
export type Reason = { key: From; why: 'gone' | 'poor' | 'starved' }

type Carrier = { key: From; level: number; room: number; strict: boolean; server?: true }

const canCarry = (m: Mate) => m.canForward && !m.busy && (m.grade === 'good' || m.grade === 'fair')
// Forwarders first, best spare upload first, so the direct copies go to whoever can pass them on; then strict viewers,
// whom strict forwarders cannot reach
const pref = (a: Mate, b: Mate) =>
  +canCarry(b) - +canCarry(a) || (canCarry(a) ? b.spareKbps - a.spareKbps : 0) || +b.strict - +a.strict || (a.key < b.key ? -1 : 1)

export const forward = (i: Input): Tree => reforward({ seats: {}, forwarders: [] }, i, [])

// The tree again after a change, moving only those who must move: viewers whose carrier was dropped, no longer fits
// or is gone, and newcomers. Everyone else keeps their carrier.
export function reforward(prev: Tree, i: Input, reasons: Reason[]): Tree {
  const { full, low } = i.layers
  const mates = new Map(i.mates.map((m) => [m.key, m]))
  const bad = new Set(reasons.map((r) => r.key))
  const answering = nearest(i.servers)
  const server: Key | undefined = answering.find((k) => prev.forwarders.includes(k)) ?? answering[0] // the one in use while it answers
  const streamer: Carrier = { key: 'streamer', level: 0, room: i.uploadKbps === null ? Infinity : i.uploadKbps * HEADROOM, strict: false } // unmeasured: all direct, as canStream never blocks
  const carriers = [streamer]
  const seats: Record<Key, Seat> = {}
  const carrier = (k: From) => carriers.find((c) => c.key === k)
  const strictOf = (k: Key) => !!mates.get(k)?.strict
  const fits = (c: Carrier, kbps: number, strict: boolean) => c.room >= kbps && !(c.strict && strict)

  const sit = (k: Key, c: Carrier, isLow = false, over = false) => {
    seats[k] = { from: c.key, ...(isLow && { low: true as const }), ...(over && { over: true as const }) }
    c.room -= isLow ? low : full
  }
  const roomOf = (k: Key) => (k === server ? SERVER_VIEWERS * full : mates.get(k)!.spareKbps * HEADROOM)
  const open = (k: Key, feed: Carrier) =>
    carriers.push({ key: k, level: feed.level + 1, room: roomOf(k), strict: strictOf(k), ...(k === server && { server: true as const }) })
  // Nearest first: the streamer, then fewer hops, the server last
  const pick = (kbps: number, strict: boolean, feeding = false) =>
    carriers
      .filter((c) => fits(c, kbps, strict) && !(feeding && (c.server || c.level >= MAX_LEVELS)))
      .sort((a, b) => +!!a.server - +!!b.server || a.level - b.level || b.room - a.room)[0]
  const alive = (k: Key) => !bad.has(k) && (k === server ? true : !!mates.get(k) && canCarry(mates.get(k)!))

  keep(prev, (k) => {
    const s = prev.seats[k]
    const m = mates.get(k)
    const fwd = prev.forwarders.includes(k) && alive(k)
    if (!fwd && (!m || m.want === 'off')) return
    const isLow = !fwd && m!.want !== 'full'
    const c = carrier(s.from)
    const feed = c && !s.over && (!fwd || !c.server) && fits(c, isLow ? low : full, strictOf(k)) ? c : fwd ? pick(full, strictOf(k), true) : undefined
    if (!feed) return
    sit(k, feed, isLow)
    if (fwd) open(k, feed)
  })

  // A seated viewer who can forward becomes a forwarder: their feed is already paid for
  const promote = (strict: boolean) => {
    const m = [...mates.values()]
      .filter((m) => seats[m.key] && !seats[m.key].low && !carrier(m.key) && alive(m.key) && roomOf(m.key) >= full && !(m.strict && strict))
      .filter((m) => { const f = carrier(seats[m.key].from)!; return !f.server && f.level < MAX_LEVELS })
      .sort(pref)[0]
    if (!m) return
    open(m.key, carrier(seats[m.key].from)!)
    return carrier(m.key)
  }
  // No room to feed a new carrier: a direct viewer it can serve moves onto it, freeing their copy. One stays direct,
  // except for the server: an upload carrying a single copy is better spent on its feed than on one viewer.
  const freeSlot = (strict: boolean, forServer: boolean) => {
    const direct = Object.keys(seats).filter((k) => seats[k].from === 'streamer' && !seats[k].low && !seats[k].over && !carrier(k))
    const moved = direct.length > (forServer ? 0 : 1) ? direct.filter((k) => !(strict && strictOf(k))).at(-1) : undefined
    if (moved) delete seats[moved], (streamer.room += full)
    return moved
  }
  // Feeds k one copy and makes it a carrier. The server may be fed by a viewer promoted to forward, strict or not, since
  // it has a public address. Freeing a slot needs room for two: the viewer moved and the one who asked.
  const feed = (k: Key, strict: boolean) => {
    const p = (c?: Carrier) => (c && c.level < MAX_LEVELS ? c : undefined)
    const f = pick(full, strict, true) ?? (k === server ? p(promote(false)) : undefined)
    const moved = f || roomOf(k) < 2 * full ? undefined : freeSlot(strict, k === server)
    if (!f && !moved) return
    if (seats[k]) carrier(seats[k].from)!.room += low // a thumbnail viewer now takes the full stream
    sit(k, f ?? streamer)
    open(k, f ?? streamer)
    if (moved) sit(moved, carrier(k)!)
    return carrier(k)
  }
  // A call mate not yet carrying the stream (not watching, or only a thumbnail) is fed one copy to forward
  const openMate = (viewer: Mate) => {
    for (const m of [...mates.values()].filter((m) => m !== viewer && (!seats[m.key] || seats[m.key].low)).sort(pref)) {
      if (carrier(m.key) || !alive(m.key) || roomOf(m.key) < full || (m.strict && viewer.strict)) continue
      const c = feed(m.key, m.strict)
      if (c) return c
    }
  }
  // The server last
  const openServer = () => (server && !carrier(server) && !bad.has(server) ? feed(server, false) : undefined)

  for (const m of i.mates.filter((m) => m.want === 'full' && !seats[m.key]).sort(pref)) {
    if (seats[m.key]) continue // opened as a forwarder meanwhile
    const c = pick(full, m.strict) ?? promote(m.strict) ?? openMate(m) ?? openServer()
    c ? sit(m.key, c) : sit(m.key, streamer, false, true)
  }
  for (const m of i.mates.filter((m) => (m.want === 'thumb' || m.want === 'audio') && !seats[m.key])) {
    const c = pick(low, m.strict)
    c ? sit(m.key, c, true) : sit(m.key, streamer, true, true)
  }
  // A forwarder left with nobody to serve stops, and is no longer fed unless it watches
  const serving = (c: Carrier) => c === streamer || Object.values(seats).some((s) => s.from === c.key)
  for (const c of carriers) if (!serving(c) && (mates.get(c.key)?.want ?? 'off') === 'off') delete seats[c.key]
  return { seats, forwarders: carriers.filter((c) => c !== streamer && serving(c)).map((c) => c.key) }
}

// Goes through the previous seats parents first, so a carrier is known before anyone it serves
function keep(prev: Tree, each: (k: Key) => void) {
  const depth = (k: Key, n = 0): number => {
    const f = prev.seats[k]?.from
    return !f || f === 'streamer' || n > MAX_LEVELS ? n : depth(f, n + 1)
  }
  for (const k of Object.keys(prev.seats).sort((a, b) => depth(a) - depth(b))) each(k)
}

// CPU budget: a forwarder whose machine struggles drops out (the streamer reforwards it as 'starved'). Its main
// process's event loop lag is read as a p95 each second (forwarder.ts); one bad second is a hiccup, LAG_FOR of them is not.
export const LAG_MS = 50
export const LAG_FOR = 10000
// Since when the lag has stayed over LAG_MS, given the previous answer and this second's p95; null while under it
export const lagSince = (since: number | null, p95Ms: number, now: number) => (p95Ms > LAG_MS ? (since ?? now) : null)
// Whether a forwarder drops out: its own encoders are CPU-bound, or its lag stayed over budget for LAG_FOR
export const overloaded = (cpuBound: boolean, since: number | null, now: number) => cpuBound || (since !== null && now - since >= LAG_FOR)
