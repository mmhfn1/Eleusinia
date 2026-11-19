import { expect, test } from 'vitest'
import { LIMITS, createHub, refusal, tooFast } from '../src/forwarder/hub'

const k = (n: number) => n.toString(16).padStart(64, '0')

test('a new stream is refused past 80 % of the month or past 4 from one address, a streamer replacing its own is not', () => {
  const open = [1, 2, 3, 4].map((n) => ({ from: k(n), ip: '1.2.3.4' }))
  expect(refusal({ from: k(5), ip: '1.2.3.4', open, usedBytes: 0 })).toBe('ip')
  expect(refusal({ from: k(4), ip: '1.2.3.4', open, usedBytes: 0 })).toBeNull() // its own, replaced
  expect(refusal({ from: k(5), ip: '5.6.7.8', open, usedBytes: 0 })).toBeNull()
  expect(refusal({ from: k(5), ip: '5.6.7.8', open, usedBytes: LIMITS.monthBytes * 0.8 })).toBe('budget')
})

test('a stream is too fast only once 5 seconds average over 12 Mbit/s', () => {
  const second = (kbps: number) => (kbps * 1000) / 8
  expect(tooFast([second(30000)])).toBe(false) // a key frame's burst
  expect(tooFast([second(30000), ...Array(4).fill(second(6000))])).toBe(false)
  expect(tooFast(Array(5).fill(second(13000)))).toBe(true)
})

function setUp() {
  const calls: string[] = []
  const sent: [string, any][] = []
  const linked = new Set<string>()
  let bytes = 0
  const fake = {
    addStream: (id: string) => (calls.push(`stream ${id}`), { answer: async () => 'v=0 answer', addIce: async () => {} }),
    addViewer: async (_s: string, v: string) => (calls.push(`viewer ${v}`), { offer: 'v=0 offer', accept: async (sdp: string) => void calls.push(`accept ${v} ${sdp}`), addIce: async () => {} }),
    setLayer: () => {},
    removeViewer: (_s: string, v: string) => calls.push(`remove ${v}`),
    removeStream: (s: string) => calls.push(`unstream ${s}`),
    stats: () => [{ id: k(1), bytes, received: 0, keyRequests: 0, viewers: [] }],
  }
  const hub = createHub({ forwarder: fake as any, used: () => 0, link: { send: (to, w) => sent.push([to, w]), linked: (to) => linked.has(to), ip: () => '1.2.3.4' } })
  return { hub, calls, sent, linked, more: (n: number) => (bytes += n) }
}
const tick = () => new Promise((r) => setTimeout(r, 0))

test('the server serves only viewers the streamer listed, holds offers until they link, and closes a stream too fast', async () => {
  const { hub, calls, sent, linked, more } = setUp()
  linked.add(k(1))
  hub.msg(k(1), { t: 'fwd', k: 'open', sdp: 'v=0 offer', viewers: { [k(2)]: 'full' } })
  await tick()
  expect(sent).toContainEqual([k(1), { t: 'fwd', k: 'answer', sdp: 'v=0 answer' }])
  expect(calls).toContain(`viewer ${k(2)}`)
  expect(sent.some(([to]) => to === k(2))).toBe(false) // not linked yet: held
  linked.add(k(2))
  hub.opened(k(2))
  expect(sent).toContainEqual([k(2), { t: 'fwd', k: 'offer', s: k(1), sdp: 'v=0 offer' }])
  hub.msg(k(2), { t: 'fwd', k: 'accept', s: k(1), sdp: 'v=0 answer' })
  hub.msg(k(3), { t: 'fwd', k: 'accept', s: k(1), sdp: 'v=0 sneaky' }) // a key not in the list
  await tick()
  expect(calls).toContain(`accept ${k(2)} v=0 answer`)
  expect(calls.some((c) => c.includes('sneaky'))).toBe(false)
  expect(hub.counts()).toMatchObject({ streams: 1, viewers: 1 })
  for (let i = 0; i < 5; i++) more(2e6), hub.tick() // 16 Mbit/s
  expect(calls).toContain(`unstream ${k(1)}`)
  expect(hub.counts()).toMatchObject({ streams: 0, rate: 1 })
})

test('past 40 viewers a stream serves no more', async () => {
  const { hub, calls } = setUp()
  const viewers = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [k(i + 2), 'full']))
  hub.msg(k(1), { t: 'fwd', k: 'open', sdp: 'v=0 offer', viewers })
  await new Promise((r) => setTimeout(r, 50))
  hub.msg(k(1), { t: 'fwd', k: 'viewers', viewers: { ...viewers, [k(99)]: 'full' } }) // the protocol's own cap is 40
  await new Promise((r) => setTimeout(r, 50))
  expect(calls.filter((c) => c.startsWith('viewer'))).toHaveLength(40)
  expect(hub.counts()).toMatchObject({ viewers: 40 })
})
