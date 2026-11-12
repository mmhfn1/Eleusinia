import { expect, test } from 'vitest'
import { REACH_WORDS, callWords, pendingWords, reachOf } from '../src/shared/reach'

const st = { online: ['linked'], present: ['noted', 'stuck'], unreachable: ['stuck', 'gone'] }

test('someone seen online but not linked says connecting, or that we cannot connect yet, never offline', () => {
  expect(reachOf(st, 'linked')).toBe('linked')
  expect(reachOf(st, 'noted')).toBe('connecting')
  expect(reachOf(st, 'stuck')).toBe('unreachable')
  expect(reachOf(st, 'gone')).toBe('offline') // unreachable but not seen online: just offline
  expect(reachOf(st, 'nobody')).toBe('offline')
  expect(REACH_WORDS[reachOf(st, 'stuck')]).toBe("Online, can't connect yet")
})

test('a call tile still forming says it cannot connect once every way through failed, and nothing else changes', () => {
  expect(callWords(st, 'stuck', 'connecting')).toBe("Can't connect yet")
  expect(callWords(st, 'stuck', 'new')).toBe("Can't connect yet")
  expect(callWords(st, 'noted', 'connecting')).toBe('Connecting…') // still being tried
  expect(callWords(st, 'stuck', 'connected')).toBe('Connected') // a working call is never called stuck
  expect(callWords(st, 'stuck', 'failed')).toBe('Reconnecting…')
})

test('waiting messages say why they wait', () => {
  expect(pendingWords('offline')).toBe('pending, sends when they are online')
  expect(pendingWords('connecting')).toBe('pending, connecting to them')
  expect(pendingWords('unreachable')).toContain("can't connect to them yet")
})
