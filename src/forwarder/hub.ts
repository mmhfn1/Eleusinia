// The server forwarder's rules (design/plan-stream-forwarding.md, phase 5): who may open a stream, who is served, and
// the limits. No network of its own, so tests drive it with a fake forwarder and fake links (test/fwdserver.test.ts).
// Unlike a call mate it serves anyone (it is a public service), but only the viewers a streamer listed: the link's
// handshake proves every key, so nobody can watch a stream they were not given.
import type { Forwarder } from '../main/forwarder'
import { SERVER_VIEWERS } from '../shared/forward'
import { type Fwd, cleanFwd, forForwarder } from '../shared/fwdproto'
import type { Key } from '../shared/protocol'
import type { Layer } from '../shared/vp8layers'

// A stream is its streamer's key (forwarder.ts addStream), so a key has one stream at a time: a new open replaces it.
export const LIMITS = {
  perIp: 4, // streams from one address: keys cost nothing, addresses do
  inKbps: 12000, // in per stream, averaged over RATE_WINDOW seconds; a faster one is closed
  viewers: SERVER_VIEWERS, // per stream
  monthBytes: 10e12, // Oracle's free 10 TB out a month, shared with the relay
  budget: 0.8, // past this share of it no new streams: the tree uses call mates and direct copies only
}
const RATE_WINDOW = 5 // seconds: a key frame's burst is not a fast stream
const WAIT_MS = 30000 // messages for a viewer who has not linked yet are kept this long

export type Why = 'budget' | 'ip'
// Whether a new stream is refused. The streamer's own earlier stream is replaced, so it does not count.
export function refusal(o: { from: Key; ip: string; open: { from: Key; ip: string }[]; usedBytes: number }, l = LIMITS): Why | null {
  if (o.usedBytes >= l.monthBytes * l.budget) return 'budget'
  if (o.open.filter((s) => s.ip === o.ip && s.from !== o.from).length >= l.perIp) return 'ip'
  return null
}

// Bytes received in each of the last seconds, newest last
export const tooFast = (perSecond: number[], l = LIMITS) =>
  perSecond.length >= RATE_WINDOW && (perSecond.slice(-RATE_WINDOW).reduce((a, b) => a + b, 0) * 8) / RATE_WINDOW / 1000 > l.inKbps

type Link = { send(k: Key, w: object): void; linked(k: Key): boolean; ip(k: Key): string }
type Viewing = { layer: Layer; accept?: (sdp: string) => Promise<unknown>; addIce?: (c: unknown) => Promise<unknown> }
type Carried = { ip: string; addIce: (c: unknown) => Promise<unknown>; viewers: Map<Key, Viewing>; rates: number[]; bytes: number }
type Fwdr = Pick<Forwarder, 'addStream' | 'addViewer' | 'setLayer' | 'removeViewer' | 'removeStream' | 'stats'>

export function createHub({ forwarder, link, used }: { forwarder: Fwdr; link: Link; used: () => number }) {
  const carried = new Map<Key, Carried>()
  const waiting = new Map<Key, { at: number; ws: object[] }>() // for viewers not linked yet: they dial us once seated
  const counts = { budget: 0, ip: 0, rate: 0, full: 0, failed: 0 } // refused or failed since start; full: viewers past the cap

  function send(to: Key, m: Fwd) {
    const w = { t: 'fwd', ...m }
    if (link.linked(to)) return link.send(to, w)
    const q = waiting.get(to) ?? { at: Date.now(), ws: [] }
    if (q.ws.length < 100) q.ws.push(w)
    waiting.set(to, q)
  }

  async function handle(from: Key, m: Fwd) {
    if (m.k === 'open') return open(from, m.sdp, m.viewers)
    if (m.k === 'viewers') return serveViewers(from, m.viewers)
    if (m.k === 'close') return unserve(from)
    if (m.k === 'ice' && !m.s) return void (await carried.get(from)?.addIce(m.c))
    const v = m.k === 'ice' || m.k === 'accept' ? carried.get(m.s!)?.viewers.get(from) : undefined // only a listed viewer
    if (m.k === 'ice') await v?.addIce?.(m.c)
    else if (m.k === 'accept') await v?.accept?.(m.sdp)
  }

  async function open(from: Key, sdp: string, viewers: Record<Key, Layer>) {
    const ip = link.ip(from)
    const why = refusal({ from, ip, open: [...carried].map(([k, c]) => ({ from: k, ip: c.ip })), usedBytes: used() })
    if (why) return void counts[why]++ // unanswered: the streamer benches us and carries on without
    unserve(from)
    const st = forwarder.addStream(from, { onIce: (c) => send(from, { k: 'ice', to: 'src', c }) })
    const answered = st.answer(sdp)
    const c: Carried = { ip, addIce: (x) => answered.then(() => st.addIce(x)), viewers: new Map(), rates: [], bytes: 0 }
    carried.set(from, c)
    try {
      send(from, { k: 'answer', sdp: await answered })
    } catch (e) {
      if (carried.get(from) === c) unserve(from)
      throw e
    }
    return serveViewers(from, viewers)
  }

  async function serveViewers(s: Key, list: Record<Key, Layer>) {
    const c = carried.get(s)
    if (!c) return
    for (const v of [...c.viewers.keys()]) if (!(v in list)) c.viewers.delete(v), forwarder.removeViewer(s, v)
    for (const [v, layer] of Object.entries(list)) {
      const had = c.viewers.get(v)
      if (v === s || had?.layer === layer) continue
      if (had) {
        had.layer = layer
        if (had.accept) forwarder.setLayer(s, v, layer) // else set once its peer exists
        continue
      }
      if (c.viewers.size >= LIMITS.viewers) {
        counts.full++
        continue
      }
      const entry: Viewing = { layer }
      c.viewers.set(v, entry)
      try {
        const h = await forwarder.addViewer(s, v, { onIce: (ice) => send(v, { k: 'ice', to: 'view', s, c: ice }) })
        if (carried.get(s) !== c || c.viewers.get(v) !== entry) continue // closed or replaced meanwhile
        Object.assign(entry, { accept: h.accept, addIce: h.addIce })
        forwarder.setLayer(s, v, entry.layer)
        send(v, { k: 'offer', s, sdp: h.offer })
      } catch {
        c.viewers.delete(v)
        counts.failed++
      }
    }
  }

  // Stops what involves k: a stream from them, or them as a viewer (listed again, they are served again)
  function unserve(k: Key) {
    if (carried.delete(k)) forwarder.removeStream(k)
    for (const [s, c] of carried) if (c.viewers.delete(k)) forwarder.removeViewer(s, k)
  }

  return {
    msg(from: Key, w: unknown) {
      const m = cleanFwd(w)
      if (m && forForwarder(m)) handle(from, m).catch(() => counts.failed++)
    },
    opened(k: Key) {
      // A dialer drops a link that hears nothing for 3 s (network.ts), and we may have nothing to say until our answer:
      // this says we are here. Nodes drop it, as cleanFwd knows no 'hi'.
      link.send(k, { t: 'fwd', k: 'hi' })
      for (const w of waiting.get(k)?.ws ?? []) link.send(k, w)
      waiting.delete(k)
    },
    closed: unserve,
    // Every second: streams too fast are closed, and messages nobody came for are dropped
    tick() {
      for (const [k, q] of waiting) if (Date.now() - q.at > WAIT_MS) waiting.delete(k)
      const stats = new Map(forwarder.stats().map((x) => [x.id, x]))
      for (const [k, c] of carried) {
        const x = stats.get(k)
        if (!x) continue
        c.rates = [...c.rates, x.bytes - c.bytes].slice(-RATE_WINDOW)
        c.bytes = x.bytes
        if (tooFast(c.rates)) counts.rate++, unserve(k)
      }
    },
    // Counts only: what the server logs
    counts: () => ({ streams: carried.size, viewers: [...carried.values()].reduce((n, c) => n + c.viewers.size, 0), ...counts }),
  }
}
