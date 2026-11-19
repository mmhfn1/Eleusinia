import { expect, test } from 'vitest'
import { LAYER_TID, type Out, createLayerFilter, isLayer, parseVp8 } from '../src/shared/vp8layers'
import { type Pkt, l1t3, vp8Payload } from './vp8packets'

type Sent = { seq: number; pic: number; tl0: number; tid: number; padding: boolean }

function run(filter: ReturnType<typeof createLayerFilter>, pkts: Pkt[]): Sent[] {
  const sent: Sent[] = []
  for (const p of pkts) collect(sent, filter.next(p.seq, p.payload))
  return sent
}

function collect(sent: Sent[], o: Out) {
  if (!o) return
  if ('padding' in o) return sent.push({ seq: o.seq, pic: -1, tl0: -1, tid: -1, padding: true })
  const d = parseVp8(o.payload)!
  sent.push({ seq: o.seq, pic: d.picId, tl0: d.tl0, tid: d.tid, padding: false })
}

const steps = (xs: number[], mod: number) => xs.slice(1).map((x, i) => (x - xs[i] + mod) % mod)
const frames = (s: Sent[]) => s.filter((x) => !x.padding).map((x) => x.pic).filter((p, i, a) => p !== a[i - 1])
const continuous = (s: Sent[]) => {
  expect(steps(s.map((x) => x.seq), 65536).every((d) => d === 1)).toBe(true)
  expect(steps(frames(s), 32768).every((d) => d === 1)).toBe(true)
}

test('the payload descriptor is read as RFC 7741 lays it out', () => {
  expect(parseVp8(vp8Payload({ picId: 0x1234, tl0: 7, tid: 2, start: true, key: false }))).toMatchObject({
    picId: 0x1234, picBits: 15, tl0: 7, tid: 2, start: true, key: false,
  })
  expect(parseVp8(vp8Payload({ picId: 5, tl0: 0, tid: 0, start: true, key: true }))).toMatchObject({ key: true, tid: 0 })
  expect(parseVp8(Uint8Array.of(0x90, 0x80, 0x45, 0x00))).toMatchObject({ picId: 0x45, picBits: 7, tid: -1, key: true })
  expect(parseVp8(Uint8Array.of(0x10, 0x01))).toMatchObject({ picBits: 0, tid: -1, start: true, key: false })
  expect(parseVp8(Uint8Array.of(0x80, 0x80, 0x80))).toBe(null) // 15-bit PictureID cut short
  expect(parseVp8(new Uint8Array(0))).toBe(null)
  expect([isLayer('half'), isLayer('toString'), isLayer(2)]).toEqual([true, false, false])
})

test('60 fps L1T3: full keeps all, half half, quarter a quarter, all numbered without gaps', () => {
  const pkts = l1t3(400, { seq0: 65000 }) // crosses the 16-bit wrap
  for (const [layer, share] of [['full', 1], ['half', 2], ['quarter', 4]] as const) {
    const sent = run(createLayerFilter(LAYER_TID[layer]), pkts)
    expect(sent.length).toBe(pkts.length / share)
    expect(sent.every((s) => s.tid <= LAYER_TID[layer])).toBe(true)
    continuous(sent)
    if (layer === 'quarter') expect(steps(sent.filter((_, i) => i % 2 === 0).map((s) => s.tl0), 256).every((d) => d === 1)).toBe(true)
  }
})

test('a packet lost upstream does not stall the filter, and its late copy closes the hole', () => {
  const pkts = l1t3(40)
  const lostKept = pkts.findIndex((p) => p.frame === 8 && !p.start) // TID 0, kept at half
  const lostDropped = pkts.findIndex((p) => p.frame === 13 && !p.start) // TID 2, dropped at half
  const f = createLayerFilter(LAYER_TID.half)
  const sent = run(f, pkts.filter((_, i) => i !== lostKept && i !== lostDropped))
  expect(sent.length).toBe(pkts.length / 2 - 1) // only the lost kept packet is missing
  const late = [f.next(pkts[lostKept].seq, pkts[lostKept].payload), f.next(pkts[lostDropped].seq, pkts[lostDropped].payload)]
  const all = [...sent]
  late.forEach((o) => collect(all, o))
  expect(late[1]).toMatchObject({ padding: true })
  // the retransmission and the padding fill exactly the two holes downstream
  const seqs = all.map((s) => s.seq).sort((a, b) => a - b)
  expect(steps(seqs, 65536).every((d) => d === 1)).toBe(true)
  // a duplicate (original and retransmission both arriving) is sent once
  expect(f.next(pkts[lostKept].seq, pkts[lostKept].payload)).toBe(null)
})

test('a viewer starts on a key frame, at any layer', () => {
  const f = createLayerFilter(LAYER_TID.quarter)
  expect(run(f, l1t3(20, { from: 1 }))).toEqual([]) // joined mid-stream: nothing until a key frame
  const sent = run(f, l1t3(20, { from: 21, seq0: 40, keyEvery: 21 }))
  expect(sent[0]).toMatchObject({ tid: 0 })
  expect(sent.length).toBe(10)
  continuous(sent)
})

test('going up waits for a TID 0 frame; going down and off take the next frame', () => {
  const pkts = l1t3(64)
  const f = createLayerFilter(LAYER_TID.quarter)
  const sent = run(f, pkts.slice(0, 2 * 5)) // frames 0 to 4
  f.setMaxTid(LAYER_TID.full) // during frame 5 (TID 2)
  run(f, pkts.slice(10, 22)).forEach((s) => sent.push(s)) // frames 5 to 10
  const after = sent.slice(4) // frames 0 and 4 before (2 packets each), then frame 8 onwards
  expect(after.map((s) => s.tid).filter((_, i) => i % 2 === 0)).toEqual([0, 2, 1])
  continuous(sent)
  f.setMaxTid(LAYER_TID.off)
  expect(run(f, pkts.slice(22, 40))).toEqual([])
  f.setMaxTid(LAYER_TID.half) // back on: waits for a key frame
  expect(run(f, pkts.slice(40))).toEqual([])
  const more = run(f, l1t3(8, { from: 64, seq0: 128, keyEvery: 64 }))
  expect(more.length).toBe(8)
  continuous([...sent, ...more])
})
