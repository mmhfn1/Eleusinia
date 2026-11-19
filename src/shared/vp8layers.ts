// VP8 temporal-layer dropping for a forwarder (design/plan-stream-forwarding.md, phase 4). Pure, so it is tested
// with synthesized packets. The streamer encodes VP8 L1T3 (TID 0 at 15 fps, 1 at 15, 2 at 30 for 60 fps); a viewer on
// a weak line gets only the lower layers. Dropping packets leaves gaps a decoder takes for loss, so each viewer's
// sequence numbers, PictureIDs and TL0PICIDX are renumbered as if the dropped ones never existed (phase 0 spike:
// without the PictureID rewrite Chromium discarded half of the TID 1 frames).

export type Layer = 'full' | 'half' | 'quarter' | 'off'
// Highest temporal layer each viewer level keeps: 60, 30, 15 fps, or no video
export const LAYER_TID: Record<Layer, number> = { full: 2, half: 1, quarter: 0, off: -1 }
export const isLayer = (x: unknown): x is Layer => typeof x === 'string' && Object.hasOwn(LAYER_TID, x)

export type Vp8Desc = {
  start: boolean // first packet of a frame (S bit, partition 0)
  key: boolean
  tid: number // -1 when the stream has no temporal layers
  picId: number // -1 when absent
  picBits: 0 | 7 | 15
  picAt: number // byte offset of the PictureID
  tl0: number // -1 when absent
  tl0At: number
}

// RFC 7741 payload descriptor; null when too short to hold what it announces
export function parseVp8(p: Uint8Array): Vp8Desc | null {
  if (p.length < 1) return null
  const d: Vp8Desc = { start: false, key: false, tid: -1, picId: -1, picBits: 0, picAt: 0, tl0: -1, tl0At: 0 }
  let i = 1
  if (p[0] & 0x80) {
    if (p.length < 2) return null
    const x = p[i++]
    if (x & 0x80) {
      if (i >= p.length) return null
      d.picAt = i
      if (p[i] & 0x80) {
        if (i + 1 >= p.length) return null
        d.picId = ((p[i] & 0x7f) << 8) | p[i + 1]
        d.picBits = 15
        i += 2
      } else {
        d.picId = p[i++]
        d.picBits = 7
      }
    }
    if (x & 0x40) {
      if (i >= p.length) return null
      d.tl0At = i
      d.tl0 = p[i++]
    }
    if (x & 0x30) {
      if (i >= p.length) return null
      if (x & 0x20) d.tid = p[i] >> 6
      i++
    }
  }
  d.start = (p[0] & 0x10) !== 0 && (p[0] & 0x0f) === 0
  d.key = d.start && i < p.length && (p[i] & 0x01) === 0 // VP8 payload header: P bit 0 is a key frame
  return d
}

// Renumbers a wrapping counter so values we drop leave no gap: out = in - (values dropped before it). Only values
// at the front can be dropped; a late one already has its number downstream, which would shift numbers already sent.
export class Renumber {
  private dropped: number[] = [] // extended values, ascending
  private base = 0
  private started = false
  last = 0 // highest extended value seen
  constructor(private readonly bits: number) {}

  ext(v: number): number {
    const size = 2 ** this.bits
    if (!this.started) {
      this.started = true
      return (this.last = v)
    }
    let e = this.last - (this.last % size) + v
    if (e - this.last > size / 2) e -= size
    else if (this.last - e > size / 2) e += size
    if (e > this.last) this.last = e
    return e
  }

  drop(e: number) {
    if (e < this.last || this.dropped.at(-1) === e) return
    this.dropped.push(e)
    // shortcut: forgets the oldest 2000 drops, fine while nothing that old arrives late
    if (this.dropped.length > 4000) {
      this.dropped.splice(0, 2000)
      this.base += 2000
    }
  }

  out(e: number): number {
    let lo = 0
    let hi = this.dropped.length
    while (lo < hi) {
      const m = (lo + hi) >> 1
      if (this.dropped[m] < e) lo = m + 1
      else hi = m
    }
    const size = 2 ** this.bits
    return (((e - this.base - lo) % size) + size) % size
  }
}

export type Out = { seq: number; payload: Uint8Array } | { seq: number; padding: true } | null

// One per viewer: feed every packet of the stream in arrival order (padding as an empty payload); returns what to
// send, or null. Layer changes wait for a frame start so no frame is cut, and going up waits for a TID 0 frame, the
// only ones the higher layers can start from.
export function createLayerFilter(maxTid = LAYER_TID.full) {
  const seq = new Renumber(16)
  const pics = { 7: new Renumber(7), 15: new Renumber(15) }
  const tl0s = new Renumber(8)
  const seen = new Set<number>()
  let cur = maxTid
  let want = maxTid
  let waitKey = true // a viewer starts on a key frame

  const skip = (e: number): Out => {
    // a late packet's number is already a hole downstream: fill it, or the viewer waits on it
    if (e < seq.last) return { seq: seq.out(e), padding: true }
    seq.drop(e)
    return null
  }

  const switchAt = (d: Vp8Desc) => {
    if (!d.start || want === cur) return
    if (want < cur || d.tid <= 0) cur = want
  }

  const keep = (d: Vp8Desc) => {
    if (cur < 0) return false
    if (waitKey) {
      if (!d.key) return false
      waitKey = false
    }
    return Math.max(d.tid, 0) <= cur
  }

  return {
    setMaxTid(t: number) {
      // from off, nothing was sent in a while: restart on a key frame (the forwarder asks the streamer for one)
      if (cur < 0 && t >= 0) {
        cur = want = t
        waitKey = true
      } else want = t
    },
    next(seqIn: number, payload: Uint8Array): Out {
      const e = seq.ext(seqIn)
      // a packet and its retransmission can both arrive; sending both reuses a number, which SRTP drops as a replay
      if (seen.has(e)) return null
      seen.add(e)
      if (seen.size > 4096) seen.delete(seen.values().next().value!)
      const d = payload.length ? parseVp8(payload) : null
      if (!d) return skip(e)
      const pic = d.picBits ? pics[d.picBits] : null
      const pe = pic?.ext(d.picId) ?? 0
      const te = d.tl0 >= 0 ? tl0s.ext(d.tl0) : 0
      switchAt(d)
      if (!keep(d)) {
        pic?.drop(pe)
        if (d.tl0 >= 0 && d.tid <= 0) tl0s.drop(te)
        return skip(e)
      }
      return { seq: seq.out(e), payload: rewrite(payload, d, pic?.out(pe) ?? -1, d.tl0 >= 0 ? tl0s.out(te) : -1) }
    },
  }
}

function rewrite(payload: Uint8Array, d: Vp8Desc, pic: number, tl0: number): Uint8Array {
  if (pic === d.picId && tl0 === d.tl0) return payload
  const p = new Uint8Array(payload) // the original is shared with the other viewers
  if (d.picBits === 15) {
    p[d.picAt] = 0x80 | (pic >> 8)
    p[d.picAt + 1] = pic & 0xff
  } else if (d.picBits === 7) p[d.picAt] = pic
  if (d.tl0 >= 0) p[d.tl0At] = tl0
  return p
}
