import DHT from 'hyperdht'
import createTestnet from 'hyperdht/testnet'
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest'
import { type RelayLimits, HOSTED_LIMITS, createNet, startBlindRelay } from '../src/main/network'

// The hosted relay (src/relay/main.ts) on a local test DHT: 10 nodes, see CLAUDE.md.
let testnet: any
beforeAll(async () => {
  testnet = await createTestnet(10)
})
afterAll(() => testnet.destroy())
const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((f) => f().catch(() => {})))
})

async function hosted(limits: RelayLimits) {
  const dht = new DHT({ bootstrap: testnet.bootstrap })
  const keyPair = DHT.keyPair()
  const relay = startBlindRelay(dht, keyPair, () => true, limits)
  await relay.listening
  cleanup.push(() => relay.stop().then(() => dht.destroy()))
  return { relay, key: keyPair.publicKey.toString('hex') }
}

// A strict peer (direct links fail for real on the test DHT), so a link can only form through the relay.
function strictPeer() {
  const got: string[] = []
  const failed: string[] = []
  const keyPair = DHT.keyPair()
  const net = createNet(
    keyPair,
    { open() {}, close() {}, msg: (_k, w: any) => got.push(w.text), failed: (k) => failed.push(k) },
    { bootstrap: testnet.bootstrap },
    () => true,
    true,
  )
  cleanup.push(() => net.destroy())
  return { net, got, failed, key: keyPair.publicKey.toString('hex') }
}
const until = (ok: () => boolean) => expect.poll(ok, { timeout: 30000, interval: 100 }).toBe(true)

test('two strict peers link through a hosted relay and exchange bytes both ways', async () => {
  const { relay, key } = await hosted(HOSTED_LIMITS)
  const a = strictPeer()
  const b = strictPeer()
  await Promise.all([a.net.listening, b.net.listening])
  a.net.dial(b.key, key)
  await until(() => a.net.linked(b.key) && b.net.linked(a.key))
  a.net.send(b.key, { t: 'chat', text: 'hi' } as any)
  b.net.send(a.key, { t: 'chat', text: 'hello' } as any)
  await until(() => b.got.includes('hi') && a.got.includes('hello'))
  const s = relay.stats()
  expect(s.pairs).toBe(1)
  expect(s.bytes).toBeGreaterThan(0)
}, 60000)

test('the per-address cap refuses a pair past it', async () => {
  // Every test peer is on 127.0.0.1, and both sides of a pair connect to the relay: one pair takes 2.
  const { relay, key } = await hosted({ ...HOSTED_LIMITS, perIp: 2 })
  const [a, b, c, d] = [strictPeer(), strictPeer(), strictPeer(), strictPeer()]
  await Promise.all([a, b, c, d].map((p) => p.net.listening))
  a.net.dial(b.key, key)
  await until(() => a.net.linked(b.key) && b.net.linked(a.key))
  c.net.dial(d.key, key)
  await until(() => c.failed.includes(d.key))
  expect(c.net.linked(d.key)).toBe(false)
  expect(relay.stats().refused).toBeGreaterThan(0)
}, 60000)
