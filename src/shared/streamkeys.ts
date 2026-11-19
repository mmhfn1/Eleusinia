// Frame encryption for forwarded streams (design/plan-stream-forwarding.md, phase 3): the frame format, the IVs and the
// key rules. Pure apart from WebCrypto, which Node and the window both have, so it is tested in Node.
// A frame: [clear header][AES-GCM ciphertext of the rest, with its tag][12-byte IV][1-byte key id]
import type { Key } from './protocol'

export type StreamSlot = 'screen' | 'camera' // one key per stream; a screen's sound shares the screen's key
export type Media = 'video' | 'audio'
export type KeyMsg = { k: 'skey'; slot: StreamSlot; id: number; key: string }

export const KEY_BYTES = 32 // AES-256-GCM
export const IV_BYTES = 12
export const TAG_BYTES = 16
export const KEEP_MS = 10000 // an older key still opens frames this long after a newer one arrives (frames in flight)
export const SWITCH_MS = 2000 // a new key is sent this long before it is used, so viewers hold it when its frames come
const TRAILER = IV_BYTES + 1
const SOURCE: Record<StreamSlot, number> = { screen: 1, camera: 2 }

// Left readable because the packetizer and forwarders read them: VP8's frame tag (3 bytes), plus the start code and
// size on a key frame (P bit 0, 10 bytes in all); Opus's TOC byte. Read from the frame's first byte, which is always
// clear, so both ends agree.
export const clearBytes = (media: Media, data: Uint8Array) => (media === 'audio' ? 1 : data.length && !(data[0] & 1) ? 10 : 3)

// (source, frame counter) -> IV. The counter never resets for a stream, so no IV repeats under any of its keys.
export function ivFor(source: number, n: number) {
  const iv = new Uint8Array(IV_BYTES)
  const v = new DataView(iv.buffer)
  v.setUint32(0, source)
  v.setUint32(4, Math.floor(n / 2 ** 32))
  v.setUint32(8, n >>> 0)
  return iv
}

export function join(head: Uint8Array, body: Uint8Array, iv: Uint8Array, id: number) {
  const out = new Uint8Array(head.length + body.length + TRAILER)
  out.set(head)
  out.set(body, head.length)
  out.set(iv, head.length + body.length)
  out[out.length - 1] = id
  return out
}

// null when too short to be one of ours. The clear length is capped by the body as on sealing, so tiny frames agree.
export function split(data: Uint8Array<ArrayBuffer>, media: Media) {
  if (data.length < TAG_BYTES + TRAILER) return null
  const end = data.length - TRAILER
  const n = Math.min(clearBytes(media, data), end - TAG_BYTES)
  return { head: data.subarray(0, n), body: data.subarray(n, end), iv: data.subarray(end, end + IV_BYTES), id: data[data.length - 1] }
}

// The clear header is the additional data, so a changed header fails like a changed body.
export async function seal(key: CryptoKey, id: number, iv: Uint8Array<ArrayBuffer>, data: Uint8Array<ArrayBuffer>, media: Media) {
  const n = Math.min(clearBytes(media, data), data.length)
  const head = data.subarray(0, n)
  const body = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: head }, key, data.subarray(n))
  return join(head, new Uint8Array(body), iv, id)
}

// null when the frame is not ours, its key is unknown or retired, or it fails authentication: never garbage.
export async function open(keyOf: (id: number) => Promise<CryptoKey> | undefined, data: Uint8Array<ArrayBuffer>, media: Media) {
  const f = split(data, media)
  const key = f && keyOf(f.id)
  if (!f || !key) return null
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: f.iv, additionalData: f.head }, await key, f.body)
    const out = new Uint8Array(f.head.length + plain.byteLength)
    out.set(f.head)
    out.set(new Uint8Array(plain), f.head.length)
    return out
  } catch {
    return null
  }
}

const importKey = (raw: Uint8Array<ArrayBuffer>) => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
const toBase64 = (raw: Uint8Array) => btoa(String.fromCharCode(...raw))
const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

// A key message from another app: every field checked. Who may send it is the opener's check (createOpener).
export function cleanKeyMsg(d: unknown): { slot: StreamSlot; id: number; key: string; raw: Uint8Array<ArrayBuffer> } | null {
  if (!d || typeof d !== 'object') return null
  const { k, slot, id, key } = d as Record<string, unknown>
  if (k !== 'skey' || (slot !== 'screen' && slot !== 'camera')) return null
  if (typeof id !== 'number' || !Number.isInteger(id) || id < 0 || id > 255) return null
  if (typeof key !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(key)) return null // 32 bytes exactly
  return { slot, id, key, raw: fromBase64(key) }
}

type Entry = { id: number; key: Promise<CryptoKey>; msg: KeyMsg }

// The streamer's side, one per stream. rotate() when a viewer leaves or is removed: the new key goes to the viewers who
// remain at once and is used from SWITCH_MS later, so video plays through the change.
export function createSealer(slot: StreamSlot) {
  const make = (id: number): Entry => {
    const raw = crypto.getRandomValues(new Uint8Array(KEY_BYTES))
    return { id, key: importKey(raw), msg: { k: 'skey', slot, id, key: toBase64(raw) } }
  }
  let current = make(crypto.getRandomValues(new Uint8Array(1))[0])
  let next: (Entry & { at: number }) | null = null
  let n = 0
  const using = (now: number) => {
    if (next && now >= next.at) (current = next), (next = null)
    return current
  }
  return {
    slot,
    // A second rotation before the switch replaces the pending key, which a just-removed viewer may hold.
    rotate(now = Date.now()): KeyMsg {
      next = { ...make((current.id + 1) & 255), at: now + SWITCH_MS }
      return next.msg
    },
    // What a new viewer needs: the key in use, and the next one if a switch is pending.
    messages: (): KeyMsg[] => (next ? [current.msg, next.msg] : [current.msg]),
    async seal(data: Uint8Array<ArrayBuffer>, media: Media, now = Date.now()) {
      const e = using(now)
      const iv = ivFor(SOURCE[slot], n++) // counted before any await, so frames sealed at once never share an IV
      return seal(await e.key, e.id, iv, data, media)
    },
  }
}
export type Sealer = ReturnType<typeof createSealer>

// A viewer's side, for one person's stream. Keys are taken only from that person; each key still opens frames for
// KEEP_MS after a newer one arrives, then is forgotten.
export function createOpener(owner: Key, slot: StreamSlot) {
  const keys = new Map<number, { key: Promise<CryptoKey>; b64: string; until: number }>()
  const keyOf = (id: number, now = Date.now()) => {
    const k = keys.get(id)
    if (k && now >= k.until) keys.delete(id)
    return k && now < k.until ? k.key : undefined
  }
  return {
    take(from: Key, d: unknown, now = Date.now()) {
      const m = from === owner ? cleanKeyMsg(d) : null
      if (!m || m.slot !== slot) return false
      if (keys.get(m.id)?.b64 === m.key) return true // sent again: not newer, so it retires nothing
      for (const k of keys.values()) k.until = Math.min(k.until, now + KEEP_MS)
      keys.set(m.id, { key: importKey(m.raw), b64: m.key, until: Infinity })
      return true
    },
    has: (id: number, now = Date.now()) => !!keyOf(id, now),
    open: (data: Uint8Array<ArrayBuffer>, media: Media, now = Date.now()) => open((id) => keyOf(id, now), data, media),
  }
}
export type Opener = ReturnType<typeof createOpener>
