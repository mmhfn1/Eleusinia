import { createHash } from 'node:crypto'
import { StringDecoder } from 'node:string_decoder'
import BlindRelay from 'blind-relay'
import DHT from 'hyperdht'
import type { Key, Wire } from '../shared/protocol'

const MAX_LINE = 1 << 20

// Splits a stream of chunks into lines. A character can be split across two chunks (emoji, accents, any non-English
// text), so bytes are decoded with a StringDecoder, which keeps half a character until the rest arrives. Returns the
// complete lines, or null once the unfinished line grows past MAX_LINE.
export function lineReader() {
  const decoder = new StringDecoder('utf8')
  let buf = ''
  return (chunk: Buffer): string[] | null => {
    buf += decoder.write(chunk)
    if (buf.length > MAX_LINE) return null
    const lines = buf.split('\n')
    buf = lines.pop()!
    return lines
  }
}

type Handlers = {
  // replaced: a new stream took over from a half-dead one; via: the relay key our dial went through, if any
  open(key: Key, replaced?: boolean, via?: Key): void
  close(key: Key): void
  msg(key: Key, w: Wire): void
  packet?(key: Key, b: Buffer): void
  failed?(key: Key, via?: Key, why?: string): void // a dial ended without a link; why: hyperdht's error code, if any
  // Who may link to us. Decided before the handshake completes, so whoever is turned away never learns our address.
  admit?(key: Key): boolean
  // Someone turned away by `admit`: they learn nothing, but their (verified) key says someone is at the door.
  knock?(key: Key): void
  // Someone admitted is dialing us while we are not linked: their dial may fail at our router, while ours to them works
  incoming?(key: Key): void
  // The network changed, or what the DHT knows of our router did (strict() may have changed)
  network?(): void
}
type KeyPair = { publicKey: Buffer; secretKey: Buffer }
// perContact and perIp count relay connections: each side of a pair is one, so a pair whose two sides share an
// address (the same home, or a local test DHT) takes two of that address's. perIp unset: no address cap.
export type RelayLimits = { pairs: number; perContact: number; perIp?: number; bytesPerSec: number }
// Per direction 24 KB/s a pair, voice only (State.relayed), about 8 KB/s. 8 pairs and 4 per contact: in a server where
// several pairs cannot link, one well-placed member carries several of them, and 4 pairs ran out (0.1.3 reports).
// perIp is the whole budget, so a user's relay behaves as before; it only accepts contacts anyway.
export const RELAY_LIMITS: RelayLimits = { pairs: 8, perContact: 4, perIp: 16, bytesPerSec: 24 * 1024 }
// The project's hosted relays (src/relay/main.ts) accept anyone, and keys cost nothing, so the address cap matters
// there. 400 KB/s a direction carries a 720p screen share plus voice (design/plan-public-relay.md, Addition).
// 16 per contact: someone behind a strict router links with every contact through it, and both sides dialling at once
// briefly takes two; at 4 the rest were turned away (relay log, 27 Nov: links dropped while it refused 3 a minute).
// perIp leaves room for two such people behind one address (a household, a carrier's shared address).
// shortcut: no separate cap on pairs carrying video yet (40 in the plan), add it with the video phase.
export const HOSTED_LIMITS: RelayLimits = { pairs: 400, perContact: 16, perIp: 32, bytesPerSec: 400 * 1024 }

// The key our blind relay listens on: separate from the identity, so relay connections never look like a peer link.
export const relayKeyPair = (secretKey: Buffer): KeyPair =>
  DHT.keyPair(createHash('sha256').update('eleusinia-relay:').update(secretKey).digest())

export type RelayServer = {
  listening: Promise<void>
  stop(): Promise<void>
  // Since start: pairs open now, bytes relayed (each received byte is sent on once, natively by udx's relayTo, which
  // does not count it as sent, so this is also the bytes out), connections turned away, in all and by limit (why)
  stats(): { pairs: number; bytes: number; refused: number; why: Record<Refusal, number> }
}
// Which limit turned a relay connection away: not a contact (our own relay only), banned for going over the byte
// budget, the relay full, too many for that key, or too many from that address
export type Refusal = 'unknown' | 'banned' | 'full' | 'contact' | 'address'

// A blind relay on `keyPair`: pairs two peers' encrypted streams without being able to read them (hyperdht's
// relayThrough). Capped in pairs, per key, per address and in bytes, since it spends someone's bandwidth. No Electron
// here: the hosted relay runs this from plain Node.
export function startBlindRelay(dht: any, keyPair: KeyPair, accept: (key: Key) => boolean, limits: RelayLimits): RelayServer {
  const sessions = new Map<any, { key: Key; host: string }>() // relay connection; one per relayed pair on each side
  const banned = new Map<Key, number>()
  const streams = new Set<any>()
  let done = 0 // bytes from streams already closed
  let refused = 0
  const why: Record<Refusal, number> = { unknown: 0, banned: 0, full: 0, contact: 0, address: 0 }
  let meter: ReturnType<typeof setInterval> | null = null
  const blind = new BlindRelay.Server({
    createStream(opts: object) {
      const st = dht.createRawStream({ ...opts, framed: true })
      st.mark = { at: Date.now(), bytes: 0 }
      streams.add(st)
      st.on('close', () => {
        streams.delete(st)
        done += st.bytesReceived
      })
      meter ??= setInterval(measure, 5000)
      return st
    },
  })
  // Each stream carries one direction of a pair; over budget for 20 s, it is cut and its sender refused for 10 minutes.
  function measure() {
    const now = Date.now()
    for (const st of streams) {
      if (st.bytesReceived - st.mark.bytes > limits.bytesPerSec * 20) {
        for (const [sock, s] of sessions) {
          if (sock.rawStream?.remoteHost !== st.remoteHost || sock.rawStream?.remotePort !== st.remotePort) continue
          banned.set(s.key, now + 600000)
          sock.destroy()
        }
        st.destroy()
      } else if (now - st.mark.at >= 20000) st.mark = { at: now, bytes: st.bytesReceived }
    }
    if (!streams.size && meter) (clearInterval(meter), (meter = null))
  }
  const count = (f: (s: { key: Key; host: string }) => boolean) => [...sessions.values()].filter(f).length
  // Decided before the handshake completes; `addr` is where the dial came from, as the DHT saw it. That address is
  // the one counted: the connection itself may take a LAN shortcut with another address.
  const from = new Map<Key, string>()
  const refuse = (k: Buffer, _payload: unknown, addr?: { host: string }) => {
    const key = k.toString('hex')
    const reason: Refusal | null = !accept(key)
      ? 'unknown'
      : (banned.get(key) ?? 0) > Date.now()
        ? 'banned'
        : sessions.size >= limits.pairs * 2
          ? 'full'
          : count((s) => s.key === key) >= limits.perContact
            ? 'contact'
            : limits.perIp !== undefined && !!addr && count((s) => s.host === addr.host) >= limits.perIp
              ? 'address'
              : null
    const no = reason !== null
    if (reason) refused++, why[reason]++
    else if (addr) {
      if (from.size > 4096) from.clear() // handshakes admitted but never completed
      from.set(key, addr.host)
    }
    return no
  }
  const srv = dht.createServer({ firewall: refuse }, (sock: any) => {
    sock.on('error', () => {})
    const key = sock.remotePublicKey.toString('hex')
    sessions.set(sock, { key, host: from.get(key) ?? sock.rawStream?.remoteHost ?? '' })
    from.delete(key)
    sock.on('close', () => sessions.delete(sock))
    blind.accept(sock, { id: sock.remotePublicKey }).on('error', () => {})
  })
  return {
    listening: srv.listen(keyPair),
    async stop() {
      if (meter) clearInterval(meter)
      for (const sock of sessions.keys()) sock.destroy()
      await srv.close()
    },
    stats() {
      let bytes = done
      for (const st of streams) bytes += st.bytesReceived
      return { pairs: Math.floor(streams.size / 2), bytes, refused, why: { ...why } }
    },
  }
}

// Testing: what a strict router does on the local test DHT, where every direct path would otherwise work.
const STRICT = { dht: { quickFirewall: false, ephemeral: true }, server: { holepunch: false, shareLocalAddress: false } }

// One encrypted, authenticated stream per peer, found by public key over the DHT. `allow` is for tests: refusing a
// peer's link stands in for two routers that never let a direct connection through. `strict` (also for tests) makes
// direct connections fail for real, so only a relay can link two strict peers. `raceMs`: see adopt.
export function createNet(keyPair: KeyPair, on: Handlers, dhtOpts?: object, allow: (key: Key) => boolean = () => true, strict = false, raceMs = 3000) {
  const me = keyPair.publicKey.toString('hex')
  // Our identity is the default key, so hyperdht's own dials to a relay show who we are and the relay can check.
  const dht = new DHT({ ...dhtOpts, ...(strict && STRICT.dht), keyPair })
  const links = new Map<Key, { sock: any; initiator: Key; at: number }>()
  const dialing = new Set<string>()

  function adopt(sock: any, initiator: Key, via?: Key) {
    const key: Key = sock.remotePublicKey.toString('hex')
    if (!allow(key)) return sock.destroy()
    const old = links.get(key)
    if (old) {
      // Both sides dialed at once (their streams open within moments of each other, so each side may see them in a
      // different order): both keep the stream dialed by the smaller key. Seconds apart, both sides see the same order
      // and simply keep the newer, so the window is short: a peer restarting soon after linking must not be held off. Otherwise the peer lost the old stream (it restarted, or its network changed), which is
      // only half alive here and would hold their new one off until it times out, so the new one replaces it.
      const race = old.initiator !== initiator && Date.now() - old.at < raceMs
      if ((race && old.initiator < initiator) || (old.initiator === initiator && initiator === me)) return sock.destroy()
      links.delete(key)
      old.sock.destroy()
    }
    links.set(key, { sock, initiator, at: Date.now() })
    sock.setKeepAlive(5000)
    // Both sides send a keepalive every 5 s, so a stream that hears nothing for 20 s is dead (a dropped
    // connection that was never closed); closing it lets the peer show offline and be redialed.
    sock.setTimeout(20000)
    const read = lineReader()
    sock.on('data', (d: Buffer) => {
      const lines = read(d)
      if (!lines) return sock.destroy()
      for (const line of lines) {
        let w: Wire
        try {
          w = JSON.parse(line)
        } catch {
          return sock.destroy()
        }
        if (w && typeof w === 'object' && links.get(key)?.sock === sock) on.msg(key, w)
      }
    })
    sock.on('message', (b: Buffer) => links.get(key)?.sock === sock && on.packet?.(key, b))
    sock.on('close', () => {
      if (links.get(key)?.sock !== sock) return
      links.delete(key)
      on.close(key)
    })
    on.open(key, !!old, via) // also after a replacement: greeting twice is harmless, a lost greeting is not
  }

  // Anyone not admitted is turned away, directly or through a relay.
  const firewall = (key: Buffer) => {
    const k = key.toString('hex')
    if (on.admit?.(k) ?? true) return links.has(k) || on.incoming?.(k), false
    on.knock?.(k)
    return true
  }
  const server = dht.createServer({ firewall, ...(strict && STRICT.server) }, (sock: any) => {
    sock.on('error', () => {})
    adopt(sock, sock.remotePublicKey.toString('hex'))
  })
  const listening = server.listen(keyPair)
  dht.on('nat-update', () => on.network?.())
  dht.on('network-change', () => on.network?.())

  // Our blind relay, only while relaying is on, on its own key (relayKeyPair).
  let relay: RelayServer | null = null
  async function serveRelay(accept: (key: Key) => boolean, limits: RelayLimits) {
    if (relay) return
    relay = startBlindRelay(dht, relayKeyPair(keyPair.secretKey), accept, limits)
    await relay.listening
  }

  // `via`: a contact's relay key, for peers no direct dial reaches.
  function dial(key: Key, via?: Key, again = true) {
    const id = via ? key + '@' + via : key
    if (links.has(key) || dialing.has(id) || !allow(key)) return
    dialing.add(id)
    let opened = false
    const sock = dht.connect(Buffer.from(key, 'hex'), { keyPair, relayThrough: via ? Buffer.from(via, 'hex') : null })
    let why = ''
    // Offline peers end up here; the caller redials on a timer. The code (PEER_NOT_FOUND, HOLEPUNCH_ABORTED, …) goes to the diagnostics.
    sock.on('error', (e: Error & { code?: string }) => (why = e?.code || e?.message || ''))
    sock.on('close', () => {
      dialing.delete(id)
      if (!opened) on.failed?.(key, via, why)
    })
    sock.on('open', () => {
      opened = true
      dialing.delete(id)
      adopt(sock, me, via)
      // hyperdht reports open before the other side answers, and that side can already have dropped the stream
      // (it aborts a hole punch raced against a LAN shortcut). Its greeting comes within a round trip, so a stream
      // that has heard nothing in 3 s is dead: drop it and dial once more at once, instead of waiting ~13 s for
      // UDX to give up and then for the redial timer.
      setTimeout(() => {
        if (links.get(key)?.sock !== sock || sock.rawStream?.bytesReceived !== 0) return
        if (again) sock.once('close', () => dial(key, via, false)) // after adopt's close handler frees the slot
        sock.destroy()
      }, 3000)
    })
  }

  return {
    listening,
    // Behind a strict router (symmetric NAT: dht-rpc's randomized), or simulating one: no hole punch with another
    // strict copy, and nobody could reach a relay of ours
    strict: () => strict || dht.randomized,
    // One handshake to `key` (a hosted relay), closed at once: its time in ms, or null when it did not answer
    rtt(key: Key): Promise<number | null> {
      return new Promise((resolve) => {
        const start = performance.now()
        const sock = dht.connect(Buffer.from(key, 'hex'), { keyPair })
        const end = (ms: number | null) => (clearTimeout(timer), resolve(ms), sock.destroy())
        const timer = setTimeout(() => end(null), 10000)
        sock.on('error', () => {})
        sock.on('open', () => end(Math.round(performance.now() - start)))
        sock.on('close', () => end(null))
      })
    },
    linked: (key: Key) => links.has(key),
    keys: () => [...links.keys()],
    // We dialed it, and when it opened: links we made and no longer need are ours to close
    ours: (key: Key) => (links.get(key)?.initiator === me ? links.get(key)!.at : null),
    send(key: Key, w: Wire) {
      links.get(key)?.sock.write(JSON.stringify(w) + '\n')
    },
    // Bytes written to that link and not yet sent, so file transfers can wait for a slow link to drain.
    backlog(key: Key): number {
      const sock = links.get(key)?.sock
      return (sock?._writableState?.buffered ?? 0) + (sock?.rawStream?._writableState?.buffered ?? 0)
    },
    dial,
    // Where the link's packets go now: the relay's address while relayed, the peer's once hyperdht finds a direct path.
    path(key: Key) {
      const raw = links.get(key)?.sock.rawStream
      return raw ? `${raw.remoteHost}:${raw.remotePort}` : ''
    },
    // Relaying for our contacts (and accepting relayed links ourselves) on or off. Resolves to our relay key, or null.
    async setRelay(on: boolean, accept: (key: Key) => boolean, limits = RELAY_LIMITS) {
      if (on) await serveRelay(accept, limits)
      else if (relay) await relay.stop().finally(() => (relay = null))
      return on ? relayKeyPair(keyPair.secretKey).publicKey.toString('hex') : null
    },
    // Topics let a peer be found by something shorter than its key; records expire, so callers re-announce.
    // With a seed, under a one-off key pair made from it instead of our identity (see shared/sealed.ts).
    announce: (topic: Buffer, seed?: Buffer) => dht.announce(topic, seed ? DHT.keyPair(seed) : keyPair).finished().catch(() => {}) as Promise<void>,
    async lookup(topic: Buffer) {
      const keys = new Set<Key>()
      for await (const r of dht.lookup(topic)) for (const peer of r.peers) keys.add(peer.publicKey.toString('hex'))
      return [...keys]
    },
    // A small record signed by this key (under 1 KB), kept by the DHT for up to 48 hours: anyone can read it by key
    // without a link. Each publish needs a higher seq than the last.
    publish: (value: Buffer, seq: number) => dht.mutablePut(keyPair, value, { seq }).then(() => true, () => false) as Promise<boolean>,
    // A record under a key pair made from `seed`, which anyone who knows the seed can write too (see shared/idcard.ts).
    putShared: (seed: Buffer, value: Buffer, seq: number) => dht.mutablePut(DHT.keyPair(seed), value, { seq }).then(() => true, () => false) as Promise<boolean>,
    async getShared(seed: Buffer): Promise<{ value: Buffer; seq: number } | null> {
      try {
        const r = await dht.mutableGet(DHT.keyPair(seed).publicKey, { latest: true })
        return r ? { value: r.value, seq: r.seq } : null
      } catch {
        return null
      }
    },
    // The newest record under a key with its number, which a new publish must go past (an inbox sharing its key)
    async record(key: Key): Promise<{ value: Buffer; seq: number } | null> {
      try {
        const r = await dht.mutableGet(Buffer.from(key, 'hex'), { latest: true })
        return r ? { value: r.value, seq: r.seq } : null
      } catch {
        return null
      }
    },
    // latest: ask more nodes for the newest copy (a log pull), rather than taking the first that answers
    async fetch(key: Key, latest = false): Promise<Buffer | null> {
      try {
        return (await dht.mutableGet(Buffer.from(key, 'hex'), { latest }))?.value ?? null
      } catch {
        return null
      }
    },
    // A call packet: sent as an unreliable datagram when it fits, so a lost one is never waited for.
    // Larger ones (DTLS handshake) go over the reliable stream instead.
    packet(key: Key, b: Buffer) {
      const sock = links.get(key)?.sock
      if (!sock) return
      if (b.byteLength <= 1000) sock.trySend(b)
      else sock.write(JSON.stringify({ t: 'pkt', d: b.toString('base64') }) + '\n')
    },
    // Round trip in ms to a few DHT nodes, the fastest counting: how this connection does with nobody else to measure.
    // Null when none answer.
    async ping() {
      const nodes = dht.table.size ? [0, 1, 2].map(() => dht.table.random()) : dht.bootstrapNodes.slice(0, 3)
      const times = await Promise.all(
        nodes.map(async (n: { host: string; port: number }) => {
          const start = performance.now()
          return dht.ping(n).then(() => performance.now() - start, () => Infinity)
        }),
      )
      const best = Math.min(...times)
      return Number.isFinite(best) ? Math.round(best) : null
    },
    drop(key: Key) {
      links.get(key)?.sock.destroy()
    },
    destroy: async () => {
      await relay?.stop()
      await dht.destroy()
    },
  }
}
