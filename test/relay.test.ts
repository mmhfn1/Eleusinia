import dgram from 'node:dgram'
import { networkInterfaces } from 'node:os'
import { expect, test } from 'vitest'
import { type Iface, createRelay } from '../src/main/relay'
import { relayCandidate } from '../src/shared/callstate'

const v4 = (address: string, internal = false): Iface => ({ address, family: 'IPv4', internal })
const v6 = (address: string, internal = false): Iface => ({ address, family: 'IPv6', internal })
const loopback6 = Object.values(networkInterfaces()).flatMap((l) => l ?? []).some((i) => i.address === '::1')

test('with no external address the relay is unavailable', async () => {
  const relay = createRelay(() => {}, () => [v4('127.0.0.1', true), v6('::1', true)])
  expect(await relay.open('k')).toBeNull()
})

test('link-local IPv6 is skipped, since a candidate cannot carry its scope', async () => {
  const relay = createRelay(() => {}, () => [v4('127.0.0.1', true), v6('fe80::1')])
  expect(await relay.open('k')).toBeNull()
})

test('an address that cannot be bound is skipped', async () => {
  // 192.0.2.0/24 is reserved for documentation, so no machine has it.
  const relay = createRelay(() => {}, () => [v4('192.0.2.1')])
  expect(await relay.open('k')).toBeNull()
})

// ::1 stands in for an external IPv6 address, since test machines may have none.
test.skipIf(!loopback6)('IPv6 only: the port binds over udp6 and carries packets both ways', async () => {
  const only6 = () => [v4('127.0.0.1', true), v6('::1')]
  const a = createRelay((_, b) => b2.deliver('a', b), only6)
  const b2 = createRelay((_, b) => a.deliver('b', b), only6)
  const ra = (await a.open('b'))!
  const rb = (await b2.open('a'))!
  expect(ra.ip).toBe('::1')
  const udp = async () => {
    const s = dgram.createSocket('udp6')
    await new Promise<void>((r) => s.bind(0, '::1', r))
    return s
  }
  const [pa, pb] = await Promise.all([udp(), udp()])
  const got: string[] = []
  pb.on('message', (m, r) => r.port === rb.port && got.push(m.toString()))
  pb.send('register', rb.port, '::1') // B's relay learns where B's stack is from its first packet
  await expect
    .poll(() => (pa.send('ping', ra.port, '::1'), got.includes('ping')), { timeout: 5000, interval: 50 })
    .toBe(true)
  pa.close()
  pb.close()
  a.closeAll()
  b2.closeAll()
})

test('only our own addresses may use the port', async () => {
  const sent: string[] = []
  // 127.0.0.1 stands in for our external address; 127.0.0.2 for another machine on the network.
  const relay = createRelay((_, b) => sent.push(b.toString()), () => [v4('127.0.0.1')])
  const r = (await relay.open('k'))!
  const from = async (ip: string) => {
    const s = dgram.createSocket('udp4')
    await new Promise<void>((ok, fail) => (s.once('error', fail), s.bind(0, ip, ok)))
    return s
  }
  const stranger = await from('127.0.0.2').catch(() => null) // not every OS binds all of 127/8
  const ours = await from('127.0.0.1')
  stranger?.send('stranger', r.port, r.ip)
  await expect.poll(() => (ours.send('ours', r.port, r.ip), sent.includes('ours')), { timeout: 5000, interval: 50 }).toBe(true)
  expect(sent).not.toContain('stranger')
  stranger?.close()
  ours.close()
  relay.closeAll()
})

test('the relay candidate is valid for both address families', () => {
  expect(relayCandidate('192.168.1.5', 5000)).toBe('candidate:9 1 udp 16777215 192.168.1.5 5000 typ relay raddr 0.0.0.0 rport 0')
  expect(relayCandidate('2001:db8::5', 5000)).toBe('candidate:9 1 udp 16777215 2001:db8::5 5000 typ relay raddr :: rport 0')
})
