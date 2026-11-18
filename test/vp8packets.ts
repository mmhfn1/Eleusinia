// Synthetic VP8 L1T3 packets, as Chromium sends them at 60 fps: TID 0, 2, 1, 2, ... with a 15-bit PictureID and
// TL0PICIDX in every packet. Shared by vp8layers.test.ts and forwarder.test.ts.

export const TIDS = [0, 2, 1, 2]

export type Pkt = { seq: number; frame: number; tid: number; start: boolean; key: boolean; payload: Uint8Array }

export function vp8Payload(o: { picId: number; tl0: number; tid: number; start: boolean; key: boolean; size?: number }) {
  const p = new Uint8Array(o.size ?? 20)
  p[0] = 0x80 | (o.start ? 0x10 : 0) // X, S, partition 0
  p[1] = 0xe0 // I, L, T
  p[2] = 0x80 | ((o.picId >> 8) & 0x7f)
  p[3] = o.picId & 0xff
  p[4] = o.tl0 & 0xff
  p[5] = o.tid << 6
  p[6] = o.key ? 0x00 : 0x01 // VP8 payload header, P bit
  return p
}

// `frames` frames from frame `from`, `per` packets each; frame 0 (and every `keyEvery`th) is a key frame
export function l1t3(frames: number, o: { from?: number; seq0?: number; per?: number; keyEvery?: number } = {}): Pkt[] {
  const { from = 0, seq0 = 0, per = 2, keyEvery = 1e9 } = o
  const out: Pkt[] = []
  let seq = seq0
  for (let f = from; f < from + frames; f++) {
    const tid = TIDS[f % 4]
    const key = f % keyEvery === 0
    for (let k = 0; k < per; k++) {
      const start = k === 0
      const payload = vp8Payload({ picId: f & 0x7fff, tl0: f >> 2, tid, start, key: start && key })
      out.push({ seq: seq & 0xffff, frame: f, tid, start, key: start && key, payload })
      seq++
    }
  }
  return out
}
