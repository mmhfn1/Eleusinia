import { expect, test } from 'vitest'
import { ASK_RELAYS, pickRelays } from '../src/shared/relaypick'

const calls: Record<string, string> = { t: 'raid', c1: 'raid', c2: 'raid', o: 'lounge' }
const how = { callOf: (k: string) => calls[k], shares: (k: string) => ['s1', 's2', 'c1', 'c2'].includes(k), last: 'l' }

test('relays are asked best first: the last that worked, the target call mates, those who share a server, then the rest', () => {
  const cands = ['x1', 'x2', 'x3', 's1', 's2', 'o', 'c1', 'c2', 'l']
  for (let i = 0; i < 20; i++) {
    const got = pickRelays(cands, 't', how)
    expect(got).toHaveLength(ASK_RELAYS)
    expect(got[0]).toBe('l')
    expect(got.slice(1, 3).sort()).toEqual(['c1', 'c2']) // in the target's call, ahead of everyone else
    expect(got.slice(3, 5).sort()).toEqual(['s1', 's2'])
    expect(['x1', 'x2', 'x3', 'o']).toContain(got[5]) // someone in another call ranks with the rest
  }
})

test('with no call or shared server known, every candidate is a stranger and they are spread at random', () => {
  const seen = new Set<string>()
  for (let i = 0; i < 50; i++) seen.add(pickRelays(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], 't', { callOf: () => undefined, shares: () => false }, 3)[0])
  expect(seen.size).toBeGreaterThan(3)
})

test('the target not in any call puts nobody ahead for sharing a call', () => {
  const got = pickRelays(['n1', 's1'], 'u', { callOf: (k) => (k === 'n1' ? undefined : 'raid'), shares: (k) => k === 's1' }, 2, () => 0)
  expect(got).toEqual(['s1', 'n1'])
})
