import { expect, test } from 'vitest'
import { type Input, LAG_FOR, type Mate, type Tree, forward, lagSince, overloaded, reforward } from '../src/shared/forward'

const k = (n: number) => n.toString(16).padStart(64, '0')
const S = 'f'.repeat(64) // a server forwarder
const layers = { full: 6000, low: 150 }
// A call mate watching full size who could forward 3 copies (30000 * 0.7 / 6000)
const mate = (n: number, o: Partial<Mate> = {}): Mate => ({ key: k(n), want: 'full', spareKbps: 30000, grade: 'good', strict: false, busy: false, canForward: true, ...o })
const call = (n: number, o: Partial<Mate> = {}) => Array.from({ length: n }, (_, i) => mate(i + 1, o))
// Streamer upload 20000: 14000 usable, so 2 direct copies at 6000
const input = (mates: Mate[], o: Partial<Input> = {}): Input => ({ layers, uploadKbps: 20000, mates, servers: {}, ...o })

const from = (t: Tree, n: number | string) => t.seats[typeof n === 'number' ? k(n) : n]?.from
const direct = (t: Tree) => Object.keys(t.seats).filter((v) => t.seats[v].from === 'streamer')
// Upload each carrier spends, to check the 30 % headroom
const spent = (t: Tree, c: string) => Object.values(t.seats).filter((s) => s.from === c).reduce((n, s) => n + (s.low ? layers.low : layers.full), 0)
const depth = (t: Tree, v: string): number => (t.seats[v].from === 'streamer' ? 1 : 1 + depth(t, t.seats[v].from))

test('a small call is all direct', () => {
  const t = forward(input(call(2)))
  expect(t.forwarders).toEqual([])
  expect(direct(t).sort()).toEqual([k(1), k(2)])
})

test('a large call with good call mates needs no server, and every upload keeps its headroom', () => {
  const mates = call(8, { spareKbps: 50000 }) // 5 copies each
  const t = forward(input(mates, { servers: { [S]: 30 } }))
  expect(t.forwarders.length).toBeGreaterThan(0)
  expect(t.forwarders).not.toContain(S)
  expect(Object.keys(t.seats)).toHaveLength(8)
  expect(Object.values(t.seats).some((s) => s.over)).toBe(false)
  expect(spent(t, 'streamer')).toBeLessThanOrEqual(20000 * 0.7)
  for (const f of t.forwarders) expect(spent(t, f)).toBeLessThanOrEqual(50000 * 0.7)
  expect(direct(t).length).toBeGreaterThan(0) // one viewer always direct
})

test('a large call with poor call mates is topped up by the nearest server', () => {
  const t = forward(input(call(6, { grade: 'poor' }), { servers: { [S]: 80, ['e'.repeat(64)]: 20 } }))
  expect(t.forwarders).toEqual(['e'.repeat(64)])
  expect(direct(t)).toHaveLength(2) // one viewer and the server's feed
  expect(Object.values(t.seats).filter((s) => s.from === 'e'.repeat(64))).toHaveLength(5)
})

test('an upload carrying one copy feeds the server rather than one viewer, when nobody else can forward', () => {
  const t = forward(input(call(2, { canForward: false }), { uploadKbps: 9000, servers: { [S]: 30 } }))
  expect(t.forwarders).toEqual([S])
  expect(direct(t)).toEqual([S])
  expect([from(t, 1), from(t, 2)]).toEqual([S, S])
  expect(reforward(t, input(call(2, { canForward: false }), { uploadKbps: 9000, servers: { [S]: 30 } }), [])).toEqual(t) // stable
})

test('with no server the rest go direct, flagged so the window warns', () => {
  const t = forward(input(call(5, { grade: 'poor' })))
  expect(direct(t)).toHaveLength(5)
  expect(Object.values(t.seats).filter((s) => s.over)).toHaveLength(3)
})

test('an unmeasured upload sends everyone direct, as the soft cap never blocks on it', () => {
  const t = forward(input(call(10), { uploadKbps: null }))
  expect(direct(t)).toHaveLength(10)
  expect(t.forwarders).toEqual([])
})

test('large calls use a second level, never a third', () => {
  const t = forward(input(call(16, { spareKbps: 40000 }), { uploadKbps: 9000 })) // 1 direct copy, 4 per forwarder
  expect(Object.keys(t.seats)).toHaveLength(16)
  expect(Object.values(t.seats).some((s) => s.over)).toBe(false)
  const depths = Object.keys(t.seats).map((v) => depth(t, v))
  expect(Math.max(...depths)).toBe(3) // viewers of a second-level forwarder: two levels below the streamer
  for (const f of t.forwarders) expect(depth(t, f)).toBeLessThanOrEqual(2)
})

test('old copies never forward but are served like anyone', () => {
  const mates = [mate(1, { canForward: false }), mate(2, { canForward: false }), mate(3), mate(4, { canForward: false }), mate(5, { canForward: false })]
  const t = forward(input(mates))
  expect(t.forwarders).toEqual([k(3)])
  expect([1, 2, 4, 5].filter((n) => from(t, n) === k(3)).length).toBeGreaterThan(0)
  expect(Object.values(t.seats).some((s) => s.over)).toBe(false)
})

test('strict call mates never serve strict viewers', () => {
  const mates = [mate(1, { strict: true }), mate(2, { strict: true, canForward: false }), mate(3, { strict: true, canForward: false }), mate(4, { canForward: false })]
  const t = forward(input(mates, { uploadKbps: 9000, servers: { [S]: 30 } }))
  expect(from(t, 1)).toBe('streamer')
  expect(from(t, 4)).toBe(k(1)) // not strict: the strict forwarder may serve them
  expect(from(t, 2)).toBe(S) // through the server, which the strict forwarder feeds
  expect(from(t, 3)).toBe(S)
  expect(from(t, S)).toBe(k(1))
})

test('call mates streaming or playing are never asked to forward', () => {
  const t = forward(input([...call(4, { busy: true }), mate(5, { want: 'off', spareKbps: 60000 })]))
  expect(t.forwarders).toEqual([k(5)]) // the idle mate, not watching, is fed a copy to forward
  expect(from(t, 5)).toBe('streamer')
})

test('thumbnails and sound-only viewers take the lowest layer from the nearest carrier', () => {
  const t = forward(input([...call(6), mate(7, { want: 'thumb', canForward: false }), mate(8, { want: 'audio', canForward: false })]))
  expect(t.seats[k(7)]).toEqual({ from: 'streamer', low: true })
  expect(t.seats[k(8)]).toEqual({ from: 'streamer', low: true })
})

test('a forwarder leaving moves only its viewers', () => {
  const i = input(call(10, { spareKbps: 50000 }))
  const before = forward(i)
  const gone = before.forwarders.find((f) => !Object.keys(before.seats).some((v) => before.seats[v].from === f && before.forwarders.includes(v)))! // one with no forwarder below it
  const left = { ...i, mates: i.mates.filter((m) => m.key !== gone) }
  const after = reforward(before, left, [{ key: gone, why: 'gone' }])
  expect(Object.keys(after.seats)).toHaveLength(9)
  for (const v of Object.keys(after.seats)) if (before.seats[v].from !== gone) expect(after.seats[v]).toEqual(before.seats[v])
  expect(Object.values(after.seats).some((s) => s.from === gone)).toBe(false)
})

test('a poor forwarder is dropped only when a reason says so, and a newcomer moves nobody', () => {
  const i = input(call(8))
  const before = forward(i)
  const f = before.forwarders[0]
  // Its grade dipped, but no reason yet (not poor for 90 s): nothing moves
  const dipped = { ...i, mates: i.mates.map((m) => (m.key === f ? { ...m, grade: 'fair' as const } : m)) }
  expect(reforward(before, dipped, [])).toEqual(before)
  const joined = reforward(before, { ...i, mates: [...i.mates, mate(9, { canForward: false })] }, [])
  for (const v of Object.keys(before.seats)) expect(joined.seats[v]).toEqual(before.seats[v])
  expect(joined.seats[k(9)]).toBeDefined()
  const dropped = reforward(before, i, [{ key: f, why: 'poor' }])
  expect(dropped.forwarders).not.toContain(f)
})

test('a forwarder drops out when its encoders are CPU-bound or its lag stays over budget for 10 s', () => {
  expect(overloaded(true, null, 0)).toBe(true)
  let since: number | null = null
  for (let t = 0; t < LAG_FOR; t += 1000) since = lagSince(since, 80, t)
  expect(overloaded(false, since, LAG_FOR - 1000)).toBe(false) // 9 s of lag
  since = lagSince(since, 80, LAG_FOR)
  expect(overloaded(false, since, LAG_FOR)).toBe(true)
  // One good second starts the count again: a hiccup is not a struggling machine
  since = lagSince(lagSince(lagSince(null, 80, 0), 20, 1000), 80, 2000)
  expect(since).toBe(2000)
  expect(overloaded(false, since, 2000 + LAG_FOR - 1)).toBe(false)
  expect(lagSince(null, 50, 0)).toBeNull() // at the budget is within it
})

test("the large smoke's call: viewers joining one by one give Bob two and Dee, fed by Bob, a second level", () => {
  const layers = { full: 1510, low: 278 }
  const [bob, cy, dee, eve] = [mate(1, { spareKbps: 5000 }), mate(2, { spareKbps: 500 }), mate(3, { spareKbps: 4000 }), mate(4, { spareKbps: 500 })]
  let t = forward(input([bob, cy], { layers, uploadKbps: 3000 }))
  t = reforward(t, input([bob, cy, dee], { layers, uploadKbps: 3000 }), [])
  t = reforward(t, input([bob, cy, dee, eve], { layers, uploadKbps: 3000 }), [])
  expect(t.seats[k(1)].from).toBe('streamer')
  expect([from(t, 2), from(t, 3), from(t, 4)]).toEqual([k(1), k(1), k(3)])
  expect(t.forwarders.sort()).toEqual([k(1), k(3)])
})
