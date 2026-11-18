import { expect, test } from 'vitest'
import { MAX_FWD_VIEWERS, cleanFwd, forForwarder } from '../src/shared/fwdproto'

const A = 'a'.repeat(64)
const B = 'b'.repeat(64)
const sdp = 'v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\n'
const c = { candidate: 'candidate:1 1 udp 1 10.0.0.2 5000 typ host', sdpMid: '0', sdpMLineIndex: 0 }

test('fwd messages are rebuilt from checked fields, and anything off is dropped', () => {
  expect(cleanFwd({ k: 'open', sdp, viewers: { [A]: 'full', [B]: 'quarter' }, extra: 1 })).toEqual({ k: 'open', sdp, viewers: { [A]: 'full', [B]: 'quarter' } })
  expect(cleanFwd({ k: 'open', sdp, viewers: { [A]: 'huge' } })).toBeNull()
  expect(cleanFwd({ k: 'open', sdp, viewers: { nokey: 'full' } })).toBeNull()
  expect(cleanFwd({ k: 'open', sdp: 'x'.repeat(10), viewers: {} })).toBeNull()
  expect(cleanFwd({ k: 'answer', sdp: 'v=0' + 'x'.repeat(33 * 1024) })).toBeNull() // capped
  const many = Object.fromEntries(Array.from({ length: MAX_FWD_VIEWERS + 1 }, (_, i) => [i.toString(16).padStart(64, '0'), 'full']))
  expect(cleanFwd({ k: 'viewers', viewers: many })).toBeNull()
  expect(cleanFwd({ k: 'offer', s: A, sdp })).toEqual({ k: 'offer', s: A, sdp })
  expect(cleanFwd({ k: 'accept', s: 'nope', sdp })).toBeNull()
  expect(cleanFwd({ k: 'feed', via: B, viewers: { [A]: 'full' }, sdp })).toEqual({ k: 'feed', via: B, viewers: { [A]: 'full' } })
  expect(cleanFwd({ k: 'feed', via: 'nope', viewers: {} })).toBeNull()
  expect(cleanFwd({ k: 'close', junk: 'x' })).toEqual({ k: 'close' })
  expect(cleanFwd({ k: 'what' })).toBeNull()
  expect(cleanFwd(null)).toBeNull()
})

test('ice names the role it is for, and the stream wherever a viewer is involved', () => {
  expect(cleanFwd({ k: 'ice', to: 'fwd', c })).toEqual({ k: 'ice', to: 'fwd', c })
  expect(cleanFwd({ k: 'ice', to: 'fwd', s: A, c })).toEqual({ k: 'ice', to: 'fwd', s: A, c })
  expect(cleanFwd({ k: 'ice', to: 'view', c })).toBeNull() // a viewer must know whose stream
  expect(cleanFwd({ k: 'ice', to: 'src', s: A, c })).toBeNull()
  expect(cleanFwd({ k: 'ice', to: 'fwd', c: { candidate: 'x'.repeat(2000) } })).toBeNull()
  expect(cleanFwd({ k: 'ice', to: 'fwd', c: { ...c, sdpMLineIndex: 99 } })).toBeNull()
  expect(cleanFwd({ k: 'ice', to: 'elsewhere', c })).toBeNull()
})

test('only open, feed, viewers, close, accept and ice to a forwarder are for the forwarder', () => {
  const kinds = [{ k: 'open', sdp, viewers: {} }, { k: 'feed', via: B, viewers: {} }, { k: 'viewers', viewers: {} }, { k: 'close' }, { k: 'accept', s: A, sdp }, { k: 'ice', to: 'fwd', c }, { k: 'answer', sdp }, { k: 'offer', s: A, sdp }, { k: 'ice', to: 'src', c }, { k: 'ice', to: 'view', s: A, c }]
  expect(kinds.map((m) => forForwarder(cleanFwd(m)!))).toEqual([true, true, true, true, true, true, false, false, false, false])
})
