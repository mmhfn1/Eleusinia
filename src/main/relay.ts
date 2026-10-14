import dgram from 'node:dgram'
import { networkInterfaces } from 'node:os'
import type { Key } from '../shared/protocol'

// When two routers block a direct WebRTC connection, a call's UDP packets are carried over the peer link
// that chat already uses (which gets through by the DHT's own hole punching). Each side opens a UDP port
// here, offers it to its own RTCPeerConnection as a low-priority "relay" candidate, and this module ferries
// packets between that port and the other side. WebRTC still encrypts the media end to end (DTLS-SRTP).
export function createRelay(toPeer: (key: Key, packet: Buffer) => void) {
  type Port = { sock: dgram.Socket; own: Set<string>; pc?: { address: string; port: number } }
  const ports = new Map<Key, Port>()

  function close(key: Key) {
    const p = ports.get(key)
    ports.delete(key)
    p?.sock.close()
  }

  return {
    // Chromium will not send to loopback candidates, so the port is bound to this machine's network address.
    async open(key: Key): Promise<{ ip: string; port: number } | null> {
      close(key)
      const ifaces = Object.values(networkInterfaces()).flat()
      const ip = ifaces.find((i) => i?.family === 'IPv4' && !i.internal)?.address
      if (!ip) return null
      const entry: Port = { sock: dgram.createSocket('udp4'), own: new Set(ifaces.map((i) => i!.address)) }
      ports.set(key, entry)
      entry.sock.on('error', () => ports.get(key) === entry && close(key))
      entry.sock.on('message', (m, from) => {
        // The port is reachable from the local network, so only our own WebRTC stack may use it.
        if (!entry.own.has(from.address)) return
        entry.pc = { address: from.address, port: from.port }
        toPeer(key, m)
      })
      await new Promise<void>((done) => entry.sock.bind(0, ip, done))
      return { ip, port: entry.sock.address().port }
    },
    // A packet from the other side, handed to our RTCPeerConnection once it has used the port.
    deliver(key: Key, packet: Buffer) {
      const p = ports.get(key)
      if (p?.pc) p.sock.send(packet, p.pc.port, p.pc.address)
    },
    close,
    closeAll: () => [...ports.keys()].forEach(close),
  }
}
