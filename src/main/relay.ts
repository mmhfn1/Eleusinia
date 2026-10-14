import dgram from 'node:dgram'
import { networkInterfaces } from 'node:os'
import type { Key } from '../shared/protocol'

export type Iface = { address: string; family: string | number; internal: boolean }
const systemInterfaces = (): Iface[] => Object.values(networkInterfaces()).flatMap((l) => l ?? [])
const isV4 = (i: Iface) => i.family === 'IPv4' || i.family === 4
// Link-local IPv6 needs a scope id, which an ICE candidate cannot carry.
const isV6 = (i: Iface) => (i.family === 'IPv6' || i.family === 6) && !/^fe80:/i.test(i.address)

// When two routers block a direct WebRTC connection, a call's UDP packets are carried over the peer link
// that chat already uses (which gets through by the DHT's own hole punching). Each side opens a UDP port
// here, offers it to its own RTCPeerConnection as a low-priority "relay" candidate, and this module ferries
// packets between that port and the other side. WebRTC still encrypts the media end to end (DTLS-SRTP).
export function createRelay(toPeer: (key: Key, packet: Buffer) => void, interfaces: () => Iface[] = systemInterfaces) {
  type Port = { sock: dgram.Socket; own: Set<string>; pc?: { address: string; port: number } }
  const ports = new Map<Key, Port>()

  function close(key: Key) {
    const p = ports.get(key)
    ports.delete(key)
    p?.sock.close()
  }

  async function bind(key: Key, ip: string, type: 'udp4' | 'udp6', own: Set<string>) {
    const entry: Port = { sock: dgram.createSocket(type), own }
    try {
      await new Promise<void>((done, fail) => {
        entry.sock.once('error', fail)
        entry.sock.bind(0, ip, done)
      })
    } catch {
      entry.sock.close()
      return null
    }
    ports.set(key, entry)
    entry.sock.on('error', () => ports.get(key) === entry && close(key))
    entry.sock.on('message', (m, from) => {
      // The port is reachable from the local network, so only our own WebRTC stack may use it.
      if (!entry.own.has(from.address)) return
      entry.pc = { address: from.address, port: from.port }
      toPeer(key, m)
    })
    return { ip, port: entry.sock.address().port }
  }

  return {
    // Chromium will not send to loopback candidates, so the port is bound to this machine's network address:
    // IPv4 when there is one, else IPv6 (IPv6-only networks, some VPNs). Null when no address works.
    async open(key: Key): Promise<{ ip: string; port: number } | null> {
      close(key)
      const ifaces = interfaces()
      const own = new Set(ifaces.map((i) => i.address))
      const external = ifaces.filter((i) => !i.internal)
      for (const i of [...external.filter(isV4), ...external.filter(isV6)]) {
        const r = await bind(key, i.address, isV4(i) ? 'udp4' : 'udp6', own)
        if (r) return r
      }
      return null
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
