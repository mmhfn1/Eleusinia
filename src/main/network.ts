import DHT from 'hyperdht'
import type { Key, Wire } from '../shared/protocol'

const MAX_LINE = 1 << 20

type Handlers = { open(key: Key): void; close(key: Key): void; msg(key: Key, w: Wire): void }

// One encrypted, authenticated stream per peer, found by public key over the DHT.
export function createNet(keyPair: { publicKey: Buffer; secretKey: Buffer }, on: Handlers, dhtOpts?: object) {
  const me = keyPair.publicKey.toString('hex')
  const dht = new DHT(dhtOpts)
  const links = new Map<Key, { sock: any; initiator: Key }>()
  const dialing = new Set<Key>()

  function adopt(sock: any, initiator: Key) {
    const key: Key = sock.remotePublicKey.toString('hex')
    const old = links.get(key)
    if (old) {
      // Both sides dialed at once: both keep the stream dialed by the smaller key.
      if (old.initiator <= initiator) return sock.destroy()
      links.delete(key)
      old.sock.destroy()
    }
    links.set(key, { sock, initiator })
    sock.setKeepAlive(5000)
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
    sock.on('close', () => {
      if (links.get(key)?.sock !== sock) return
      links.delete(key)
      on.close(key)
    })
    on.open(key) // also after a replacement: greeting twice is harmless, a lost greeting is not
  }

  const server = dht.createServer((sock: any) => {
    sock.on('error', () => {})
    adopt(sock, sock.remotePublicKey.toString('hex'))
  })
  const listening = server.listen(keyPair)

  return {
    listening,
    linked: (key: Key) => links.has(key),
    keys: () => [...links.keys()],
    send(key: Key, w: Wire) {
      links.get(key)?.sock.write(JSON.stringify(w) + '\n')
    },
    dial(key: Key) {
      if (links.has(key) || dialing.has(key)) return
      dialing.add(key)
      const sock = dht.connect(Buffer.from(key, 'hex'), { keyPair })
      sock.on('error', () => {}) // offline peers end up here; the caller redials on a timer
      sock.on('close', () => dialing.delete(key))
      sock.on('open', () => {
        dialing.delete(key)
        adopt(sock, me)
      })
    },
    // Topics let a peer be found by something shorter than its key; records expire, so callers re-announce.
    announce: (topic: Buffer) => dht.announce(topic, keyPair).finished().catch(() => {}) as Promise<void>,
    async lookup(topic: Buffer) {
      const keys = new Set<Key>()
      for await (const r of dht.lookup(topic)) for (const peer of r.peers) keys.add(peer.publicKey.toString('hex'))
      return [...keys]
    },
    drop(key: Key) {
      links.get(key)?.sock.destroy()
    },
    destroy: () => dht.destroy() as Promise<void>,
  }
}
