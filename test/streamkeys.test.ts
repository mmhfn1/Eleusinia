import { expect, test } from 'vitest'
import { KEEP_MS, SWITCH_MS, cleanKeyMsg, clearBytes, createOpener, createSealer, ivFor, split } from '../src/shared/streamkeys'

const ann = 'a'.repeat(64)
const bob = 'b'.repeat(64)
// A VP8 key frame (P bit 0) and a delta frame (P bit 1), and an Opus frame
const frame = (first: number, n = 200) => Uint8Array.from({ length: n }, (_, i) => (i ? (i * 7) & 255 : first))
const keyFrame = frame(0x10)
const delta = frame(0x11)
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex')

// A viewer of Ann's screen holding everything Ann's sealer has handed out
const viewing = (s: ReturnType<typeof createSealer>, now = 0) => {
  const o = createOpener(ann, 'screen')
  for (const m of s.messages()) o.take(ann, m, now)
  return o
}

test('a frame round trips, with the clear header byte-exact and the rest unreadable', async () => {
  const s = createSealer('screen')
  const o = viewing(s)
  for (const [f, media, clear] of [[keyFrame, 'video', 10], [delta, 'video', 3], [frame(0x78), 'audio', 1]] as const) {
    expect(clearBytes(media, f)).toBe(clear)
    const sealed = await s.seal(f, media)
    expect(sealed.length).toBe(f.length + 16 + 12 + 1)
    expect(hex(sealed.subarray(0, clear))).toBe(hex(f.subarray(0, clear)))
    expect(hex(sealed.subarray(clear, f.length))).not.toBe(hex(f.subarray(clear)))
    expect(hex((await o.open(sealed, media))!)).toBe(hex(f))
  }
})

test('frames shorter than their clear header still round trip', async () => {
  const s = createSealer('screen')
  const o = viewing(s)
  for (const n of [0, 1, 2, 5]) expect(hex((await o.open(await s.seal(frame(0x10, n), 'video'), 'video'))!)).toBe(hex(frame(0x10, n)))
})

test('the wrong key, a changed header or body, and junk all fail rather than give garbage', async () => {
  const s = createSealer('screen')
  const sealed = await s.seal(keyFrame, 'video')
  expect(await viewing(createSealer('screen')).open(sealed, 'video')).toBeNull() // another stream's keys
  const o = viewing(s)
  for (const at of [2, 50, sealed.length - 5]) {
    const bad = sealed.slice()
    bad[at] ^= 1
    expect(await o.open(bad, 'video')).toBeNull()
  }
  expect(await o.open(new Uint8Array(10), 'video')).toBeNull()
  expect(await o.open(keyFrame, 'video')).toBeNull() // a plain frame
})

test('no IV repeats across 10,000 frames and a rotation', async () => {
  const s = createSealer('screen')
  const seen = new Set<string>()
  for (let i = 0; i < 10000; i++) {
    if (i === 5000) s.rotate(0)
    const f = split(await s.seal(delta, 'video', i === 0 ? 0 : SWITCH_MS + i), 'video')!
    seen.add(hex(f.iv))
  }
  expect(seen.size).toBe(10000)
  expect(hex(ivFor(1, 2 ** 32 + 5))).toBe('000000010000000100000005')
})

test('a rotation is used only after SWITCH_MS, the old key opens for 10 s more, and a removed viewer is cut off', async () => {
  const s = createSealer('screen')
  const stays = viewing(s)
  const removed = viewing(s)
  const before = await s.seal(delta, 'video', 0)
  const m = s.rotate(1000)
  expect(stays.take(ann, m, 1000)).toBe(true)
  const pending = await s.seal(delta, 'video', 1000 + SWITCH_MS - 1)
  expect(split(pending, 'video')!.id).toBe(split(before, 'video')!.id) // not switched yet: no gap for anyone
  const after = await s.seal(delta, 'video', 1000 + SWITCH_MS)
  expect(split(after, 'video')!.id).toBe(m.id)
  expect(await stays.open(after, 'video', 1000 + SWITCH_MS)).not.toBeNull()
  expect(await removed.open(after, 'video', 1000 + SWITCH_MS)).toBeNull()
  // Frames still in flight under the old key open until 10 s after the new key came, then no longer
  expect(await stays.open(before, 'video', 1000 + KEEP_MS - 1)).not.toBeNull()
  expect(await stays.open(before, 'video', 1000 + KEEP_MS)).toBeNull()
  expect(await stays.open(after, 'video', 1000 + KEEP_MS * 5)).not.toBeNull() // the newest never expires
})

test('a key sent again retires nothing, and key ids wrap within 0..255', () => {
  const s = createSealer('screen')
  const o = viewing(s)
  const first = s.messages()[0]
  const m = s.rotate(0)
  expect(m.id).toBe((first.id + 1) & 255)
  o.take(ann, m, 0)
  expect(o.take(ann, m, 5000)).toBe(true)
  expect(o.has(first.id, KEEP_MS - 1)).toBe(true) // still 10 s from the first arrival, not the repeat
  expect(s.messages()).toEqual([first, m])
})

test('a key message from anyone but the streamer, or for another stream, is refused', () => {
  const s = createSealer('screen')
  const m = s.messages()[0]
  const o = createOpener(ann, 'screen')
  expect(o.take(bob, m)).toBe(false)
  expect(o.has(m.id)).toBe(false)
  expect(createOpener(ann, 'camera').take(ann, m)).toBe(false)
  expect(o.take(ann, m)).toBe(true)
})

test('malformed key messages are refused', () => {
  const good = createSealer('camera').messages()[0]
  expect(cleanKeyMsg(good)).not.toBeNull()
  for (const bad of [
    null,
    'skey',
    { ...good, k: 'key' },
    { ...good, slot: 'voice' },
    { ...good, id: -1 },
    { ...good, id: 256 },
    { ...good, id: 1.5 },
    { ...good, id: '3' },
    { ...good, key: good.key.slice(4) }, // 29 bytes
    { ...good, key: good.key.slice(0, -1) + 'AA=' }, // too long
    { ...good, key: 'A'.repeat(43) + '!' },
    { ...good, key: 42 },
  ])
    expect(cleanKeyMsg(bad)).toBeNull()
})
