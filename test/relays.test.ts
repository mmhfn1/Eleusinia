import { expect, test } from 'vitest'
import { HOSTED_HEADSTART, HOSTED_RELAYS, nearest, parseRelays, routeFor } from '../src/shared/relays'

const k = (c: string) => c.repeat(64)
const [h1, h2, h3, f1, f2] = [k('1'), k('2'), k('3'), k('a'), k('b')]
const base = { meStrict: false, themStrict: null, hosted: [h1, h2, h3], friends: [f1, f2] }

test('ELEUSINIA_RELAYS replaces the built-in relays: keys only, deduplicated; unset keeps them, empty means none', () => {
  expect(parseRelays(undefined)).toBe(HOSTED_RELAYS)
  expect(parseRelays('')).toEqual([])
  expect(parseRelays(` ${h1}, ${h2}  ${h1},nope,${'A'.repeat(64)},${h3.slice(1)}`)).toEqual([h1, h2])
})

test('nearest sorts by handshake time and leaves out relays that did not answer', () => {
  expect(nearest({ [h1]: 120, [h2]: null, [h3]: 40 })).toEqual([h3, h1])
  expect(nearest({ [h1]: null })).toEqual([])
  expect(nearest({})).toEqual([])
})

test('direct is skipped only when both sides are known to be strict', () => {
  expect(routeFor({ ...base, meStrict: true, themStrict: true }).direct).toBe(false)
  expect(routeFor({ ...base, meStrict: true, themStrict: null }).direct).toBe(true)
  expect(routeFor({ ...base, meStrict: true, themStrict: false }).direct).toBe(true)
  expect(routeFor({ ...base, meStrict: false, themStrict: true }).direct).toBe(true)
})

test('with nothing remembered: the nearest hosted relay goes first, friends after its head start, the others follow in order', () => {
  expect(routeFor(base)).toEqual({ direct: true, first: null, race: { friends: [f1, f2], hosted: h1, friendsAfter: HOSTED_HEADSTART }, next: [h2, h3] })
})

test('the friend relay that worked last goes alone first only while no hosted relay answers', () => {
  const r = routeFor({ ...base, hosted: [], lastGood: { key: f2, kind: 'friend' } })
  expect(r.first).toEqual({ key: f2, kind: 'friend' })
  expect(r.race).toEqual({ friends: [f1], hosted: null, friendsAfter: 0 })
  // with a hosted relay answering, it carries video and files, which a friend cannot: the hosted relay goes first
  const h = routeFor({ ...base, lastGood: { key: f2, kind: 'friend' } })
  expect(h.first).toBeNull()
  expect(h.race).toEqual({ friends: [f1, f2], hosted: h1, friendsAfter: HOSTED_HEADSTART })
})

test('the hosted relay that worked last goes first, even when not the nearest, and the race takes the next nearest', () => {
  const r = routeFor({ ...base, lastGood: { key: h2, kind: 'hosted' } })
  expect(r.first).toEqual({ key: h2, kind: 'hosted' })
  expect(r.race).toEqual({ friends: [f1, f2], hosted: h1, friendsAfter: HOSTED_HEADSTART })
  expect(r.next).toEqual([h3])
})

test('a last good relay no longer available (offline, or no longer answering) is not tried first', () => {
  expect(routeFor({ ...base, hosted: [], friends: [f1], lastGood: { key: f2, kind: 'friend' } }).first).toBeNull()
  expect(routeFor({ ...base, hosted: [h1], lastGood: { key: h2, kind: 'hosted' } })).toEqual({
    direct: true,
    first: null,
    race: { friends: [f1, f2], hosted: h1, friendsAfter: HOSTED_HEADSTART },
    next: [],
  })
  // a friend key named as hosted (or the other way round) does not count
  expect(routeFor({ ...base, lastGood: { key: f1, kind: 'hosted' } }).first).toBeNull()
})

test('no hosted relays and no friends leaves only the direct dial', () => {
  expect(routeFor({ meStrict: false, themStrict: null, hosted: [], friends: [] })).toEqual({
    direct: true,
    first: null,
    race: { friends: [], hosted: null, friendsAfter: 0 },
    next: [],
  })
  const only = routeFor({ meStrict: true, themStrict: true, hosted: [h1], friends: [], lastGood: { key: h1, kind: 'hosted' } })
  expect(only).toEqual({ direct: false, first: { key: h1, kind: 'hosted' }, race: { friends: [], hosted: null, friendsAfter: 0 }, next: [] })
})
