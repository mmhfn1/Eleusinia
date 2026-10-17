import { createHash } from 'node:crypto'
import BlindRelay from 'blind-relay'
import DHT from 'hyperdht'
import type { Key, Wire } from '../shared/protocol'

const MAX_LINE = 1 << 20

type Handlers = {
  open(key: Key): void
  close(key: Key): void
  msg(key: Key, w: Wire): void
  packet?(key: Key, b: Buffer): void
  failed?(key: Key, via?: Key): void // a dial ended without a link
}
type KeyPair = { publicKey: Buffer; secretKey: Buffer }
export type RelayLimits = { pairs: number; perContact: number; bytesPerSec: number }
export const RELAY_LIMITS: RelayLimits = { pairs: 4, perContact: 2, bytesPerSec: 24 * 1024 } // per direction: 48 KB/s a pair

// The key our blind relay listens on: separate from the identity, so relay connections never look like a peer link.
export const relayKeyPair = (secretKey: Buffer): KeyPair =>
  DHT.keyPair(createHash('sha256').update('eleusinia-relay:').update(secretKey).digest())

// Testing: what a strict router does on the local test DHT, where every direct path would otherwise work.
const STRICT = { dht: { quickFirewall: false, ephemeral: true }, server: { holepunch: false, shareLocalAddress: false } }

// One encrypted, authenticated stream per peer, found by public key over the DHT. `allow` is for tests: refusing a
// peer's link stands in for two routers that never let a direct connection through. `strict` (also for tests) makes
// direct connections fail for real, so only a relay can link two strict peers.
export function createNet(keyPair: KeyPair, on: Handlers, dhtOpts?: object, allow: (key: Key) => boolean = () => true, strict = false) {
  const me = keyPair.publicKey.toString('hex')
  // Our identity is the default key, so hyperdht's own dials to a relay show who we are and the relay can check.
  const dht = new DHT({ ...dhtOpts, ...(strict && STRICT.dht), keyPair })
  const links = new Map<Key, { sock: any; initiator: Key }>()
  const dialing = new Set<string>()
  let usesRelays = false

  function adopt(sock: any, initiator: Key) {
    const key: Key = sock.remotePublicKey.toString('hex')
    if (!allow(key)) return sock.destroy()
    const old = links.get(key)
    if (old) {
      // Both sides dialed at once: both keep the stream dialed by the smaller key. The same side dialing again
      // means it lost the old stream, which is only half alive here, so the new one replaces it.
      if (old.initiator < initiator || (old.initiator === initiator && initiator === me)) return sock.destroy()
      links.delete(key)
      old.sock.destroy()
    }
    links.set(key, { sock, initiator })
    sock.setKeepAlive(5000)
    // Both sides send a keepalive every 5 s, so a stream that hears nothing for 20 s is dead (a dropped
    // connection that was never closed); closing it lets the peer show offline and be redialed.
    sock.setTimeout(20000)
    let buf = ''
    sock.on('data', (d: Buffer) => {
      buf += d.toString()
      if (buf.length > MAX_LINE) return sock.destroy()
      const lines = buf.split('\n')
      buf = lines.pop()!
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
    on.open(key) // also after a replacement: greeting twice is harmless, a lost greeting is not
  }

  // A peer asking to link through a relay is turned away unless we use relays ourselves.
  const firewall = (_key: Buffer, payload: any) => !!payload?.relayThrough && !usesRelays
  const server = dht.createServer({ firewall, ...(strict && STRICT.server) }, (sock: any) => {
    sock.on('error', () => {})
    adopt(sock, sock.remotePublicKey.toString('hex'))
  })
  const listening = server.listen(keyPair)

  // Our blind relay, only while relaying is on: it pairs two contacts' encrypted streams without being able to read
  // them. Capped in pairs, per contact and in bytes, since it spends our bandwidth.
  let relay: { server: any; stop: () => Promise<void> } | null = null
  async function serveRelay(accept: (key: Key) => boolean, limits: RelayLimits) {
    if (relay) return
    const sessions = new Map<any, Key>() // relay connection → contact; one per relayed pair on each side
    const banned = new Map<Key, number>()
    const streams = new Set<any>()
    let meter: ReturnType<typeof setInterval> | null = null
    const blind = new BlindRelay.Server({
      createStream(opts: object) {
        const st = dht.createRawStream({ ...opts, framed: true })
        st.mark = { at: Date.now(), bytes: 0 }
        streams.add(st)
        st.on('close', () => streams.delete(st))
        meter ??= setInterval(measure, 5000)
        return st
      },
    })
    // Each stream carries one direction of a pair; over budget for 20 s, it is cut and its sender refused for 10 minutes.
    function measure() {
      const now = Date.now()
      for (const st of streams) {
        if (st.bytesReceived - st.mark.bytes > limits.bytesPerSec * 20) {
          for (const [sock, key] of sessions) {
            if (sock.rawStream?.remoteHost !== st.remoteHost || sock.rawStream?.remotePort !== st.remotePort) continue
            banned.set(key, now + 600000)
            sock.destroy()
          }
          st.destroy()
        } else if (now - st.mark.at >= 20000) st.mark = { at: now, bytes: st.bytesReceived }
      }
      if (!streams.size && meter) (clearInterval(meter), (meter = null))
    }
    const count = (key: Key) => [...sessions.values()].filter((k) => k === key).length
    const refuse = (k: Buffer) => {
      const key = k.toString('hex')
      return !accept(key) || (banned.get(key) ?? 0) > Date.now() || sessions.size >= limits.pairs * 2 || count(key) >= limits.perContact
    }
    const srv = dht.createServer({ firewall: refuse }, (sock: any) => {
      sock.on('error', () => {})
      sessions.set(sock, sock.remotePublicKey.toString('hex'))
      sock.on('close', () => sessions.delete(sock))
      blind.accept(sock, { id: sock.remotePublicKey }).on('error', () => {})
    })
    relay = {
      server: srv,
      async stop() {
        if (meter) clearInterval(meter)
        for (const sock of sessions.keys()) sock.destroy()
        await srv.close()
      },
    }
    await srv.listen(relayKeyPair(keyPair.secretKey))
  }

  return {
    listening,
    linked: (key: Key) => links.has(key),
    keys: () => [...links.keys()],
    send(key: Key, w: Wire) {
      links.get(key)?.sock.write(JSON.stringify(w) + '\n')
    },
    // `via`: a contact's relay key, for peers no direct dial reaches.
    dial(key: Key, via?: Key) {
      const id = via ? key + '@' + via : key
      if (links.has(key) || dialing.has(id) || !allow(key)) return
      dialing.add(id)
      let opened = false
      const sock = dht.connect(Buffer.from(key, 'hex'), { keyPair, relayThrough: via ? Buffer.from(via, 'hex') : null })
      sock.on('error', () => {}) // offline peers end up here; the caller redials on a timer
      sock.on('close', () => {
        dialing.delete(id)
        if (!opened) on.failed?.(key, via)
      })
      sock.on('open', () => {
        opened = true
        dialing.delete(id)
        adopt(sock, me)
      })
    },
    // Where the link's packets go now: the relay's address while relayed, the peer's once hyperdht finds a direct path.
    path(key: Key) {
      const raw = links.get(key)?.sock.rawStream
      return raw ? `${raw.remoteHost}:${raw.remotePort}` : ''
    },
    // Relaying for our contacts (and accepting relayed links ourselves) on or off. Resolves to our relay key, or null.
    async setRelay(on: boolean, accept: (key: Key) => boolean, limits = RELAY_LIMITS) {
      usesRelays = on
      if (on) await serveRelay(accept, limits)
      else if (relay) await relay.stop().finally(() => (relay = null))
      return on ? relayKeyPair(keyPair.secretKey).publicKey.toString('hex') : null
    },
    // Topics let a peer be found by something shorter than its key; records expire, so callers re-announce.
    announce: (topic: Buffer) => dht.announce(topic, keyPair).finished().catch(() => {}) as Promise<void>,
    async lookup(topic: Buffer) {
      const keys = new Set<Key>()
      for await (const r of dht.lookup(topic)) for (const peer of r.peers) keys.add(peer.publicKey.toString('hex'))
      return [...keys]
    },
    // A small record signed by this key (under 1 KB), kept by the DHT for up to 48 hours: anyone can read it by key
    // without a link. Each publish needs a higher seq than the last.
    publish: (value: Buffer, seq: number) => dht.mutablePut(keyPair, value, { seq }).then(() => true, () => false) as Promise<boolean>,
    async fetch(key: Key): Promise<Buffer | null> {
      try {
        return (await dht.mutableGet(Buffer.from(key, 'hex'), { latest: false }))?.value ?? null
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
