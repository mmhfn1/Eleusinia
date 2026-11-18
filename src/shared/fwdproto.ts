// Signalling for peer forwarders (design/plan-stream-forwarding.md, phase 4): Wire `{ t: 'fwd', ... }` messages between
// main processes over the encrypted link. Only shape and size are checked here; who may send what is node.ts's job.
import { type Key, isKey } from './protocol'
import { type Layer, isLayer } from './vp8layers'

export const MAX_FWD_VIEWERS = 40 // listed per forwarder: a call mate carries about 3, a server 40 (forward.ts SERVER_VIEWERS)
const MAX_SDP = 32 * 1024

export type Ice = { candidate: string; sdpMid?: string; sdpMLineIndex?: number }
export type Viewers = Record<Key, Layer>
// Streamer to forwarder: open (its offer and who to serve at which layer), viewers (a new list), close; feed instead of
// open for a second-level forwarder: forwarder `via` offers it the stream as to a viewer. Forwarder to streamer: answer. Forwarder to viewer: offer. Viewer to forwarder: accept. ice to any of them, `to` naming the role it
// is for. s: the streamer, on everything between a forwarder and a viewer (and ice to a viewer).
export type Fwd =
  | { k: 'open'; sdp: string; viewers: Viewers }
  | { k: 'feed'; via: Key; viewers: Viewers }
  | { k: 'viewers'; viewers: Viewers }
  | { k: 'close' }
  | { k: 'answer'; sdp: string }
  | { k: 'offer'; s: Key; sdp: string }
  | { k: 'accept'; s: Key; sdp: string }
  | { k: 'ice'; to: 'fwd' | 'src' | 'view'; s?: Key; c: Ice }

const sdpOf = (v: unknown) => (typeof v === 'string' && v.startsWith('v=0') && v.length <= MAX_SDP ? v : null)

function iceOf(c: any): Ice | null {
  if (!c || typeof c.candidate !== 'string' || c.candidate.length > 1024) return null
  if (c.sdpMid !== undefined && c.sdpMid !== null && (typeof c.sdpMid !== 'string' || c.sdpMid.length > 32)) return null
  if (c.sdpMLineIndex !== undefined && c.sdpMLineIndex !== null && !(Number.isInteger(c.sdpMLineIndex) && c.sdpMLineIndex >= 0 && c.sdpMLineIndex < 16)) return null
  return { candidate: c.candidate, ...(typeof c.sdpMid === 'string' && { sdpMid: c.sdpMid }), ...(Number.isInteger(c.sdpMLineIndex) && { sdpMLineIndex: c.sdpMLineIndex }) }
}

function viewersOf(v: unknown): Viewers | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const list = Object.entries(v)
  if (list.length > MAX_FWD_VIEWERS || !list.every(([k, l]) => isKey(k) && isLayer(l))) return null
  return Object.fromEntries(list) as Viewers
}

// A message from a peer (or our own window), rebuilt from checked fields only; null when anything is off.
export function cleanFwd(d: any): Fwd | null {
  if (!d || typeof d !== 'object') return null
  const sdp = sdpOf(d.sdp)
  const viewers = viewersOf(d.viewers)
  if (d.k === 'open') return sdp && viewers ? { k: 'open', sdp, viewers } : null
  if (d.k === 'feed') return isKey(d.via) && viewers ? { k: 'feed', via: d.via, viewers } : null
  if (d.k === 'viewers') return viewers && { k: 'viewers', viewers }
  if (d.k === 'close') return { k: 'close' }
  if (d.k === 'answer') return sdp ? { k: 'answer', sdp } : null
  if ((d.k === 'offer' || d.k === 'accept') && isKey(d.s)) return sdp ? { k: d.k, s: d.s, sdp } : null
  if (d.k !== 'ice' || !['fwd', 'src', 'view'].includes(d.to)) return null
  const c = iceOf(d.c)
  // A viewer's ice always names the stream; a streamer's never does
  if (!c || (d.to === 'view' && !isKey(d.s)) || (d.to === 'src' && d.s !== undefined) || (d.s !== undefined && !isKey(d.s))) return null
  return { k: 'ice', to: d.to, ...(d.s !== undefined && { s: d.s }), c }
}

// Whether a message is for the forwarder role (node.ts hands those to forwarder.ts); the rest go to the window.
export const forForwarder = (m: Fwd) => m.k === 'open' || m.k === 'feed' || m.k === 'viewers' || m.k === 'close' || m.k === 'accept' || (m.k === 'ice' && m.to === 'fwd')
