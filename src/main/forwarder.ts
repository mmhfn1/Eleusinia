// A stream forwarder (design/plan-stream-forwarding.md, phase 4): receives a streamer's screen over WebRTC and sends
// the packets on to a few viewers without decoding them, each at its own temporal layer (vp8layers.ts). No Electron
// imports, like node.ts: the same code runs in the app's main process and, later, headless on a server.
// Shape from the phase 0 spike: the streamer's Chromium offers and werift answers; to viewers werift offers sendonly.
import {
  GenericNack,
  MediaStreamTrack,
  RTCPeerConnection,
  RTCRtpCodecParameters,
  type RTCRtpReceiver,
  type RTCRtpSender,
  RtcpTransportLayerFeedback,
  type RtpPacket,
  useAbsSendTime,
  useOPUS,
  useSdesMid,
  useTransportWideCC,
  useVP8,
} from 'werift'
import { monitorEventLoopDelay } from 'node:perf_hooks'
import { lagSince, overloaded } from '../shared/forward'
import { isKey, type Key } from '../shared/protocol'
import { LAYER_TID, type Layer, type Out, createLayerFilter, isLayer } from '../shared/vp8layers'

export type IceServer = { urls: string | string[]; username?: string; credential?: string }
export type Ice = { candidate: string; sdpMid?: string; sdpMLineIndex?: number }
export type ForwarderOptions = {
  iceServers: IceServer[]
  log?: (...a: unknown[]) => void
  maxViewers?: number // across all streams: a call mate's upload carries about 3 copies at 1080p60
  // A server behind 1:1 NAT (a cloud VM): its public address offered as a host candidate besides STUN's, and the UDP
  // ports its firewall opens (werift's iceAdditionalHostAddresses and icePortRange)
  publicIp?: string
  portRange?: [number, number]
}

const MAX_SDP = 32 * 1024
const KEY_GAP = 1000 // ms between key-frame requests to a streamer: one broken viewer forced them twice a second
// werift resends only from its last 128 packets per viewer (RTP_HISTORY_SIZE), under 0.2 s at 1080p60: a viewer far
// from us, or losing a burst, asks for packets already gone and freezes until the next key frame. We keep this much more
const HISTORY_MS = 2000
const WERIFT_HISTORY = 128
const isStreamId = (s: unknown): s is string => typeof s === 'string' && /^[\w-]{1,64}$/.test(s)

function checkSdp(sdp: unknown): string {
  if (typeof sdp !== 'string' || !sdp.startsWith('v=0') || sdp.length > MAX_SDP) throw new Error('bad sdp')
  return sdp
}

function checkIce(c: unknown): Ice {
  const o = c as Ice
  if (!o || typeof o.candidate !== 'string' || o.candidate.length > 1024) throw new Error('bad candidate')
  if (o.sdpMid !== undefined && (typeof o.sdpMid !== 'string' || o.sdpMid.length > 32)) throw new Error('bad candidate')
  if (o.sdpMLineIndex !== undefined && !(Number.isInteger(o.sdpMLineIndex) && o.sdpMLineIndex >= 0 && o.sdpMLineIndex < 16)) throw new Error('bad candidate')
  return { candidate: o.candidate, sdpMid: o.sdpMid, sdpMLineIndex: o.sdpMLineIndex }
}

type Viewer = {
  key: Key
  pc: RTCPeerConnection
  video: MediaStreamTrack
  audio: MediaStreamTrack
  filter: ReturnType<typeof createLayerFilter>
  layer: Layer
  ready: boolean
  sent: number
  history: Map<number, { rtp: RtpPacket; at: number }> // video sent, by its sequence number, for HISTORY_MS
  resent: number // packets resent from our history that werift no longer had
}

type Stream = {
  id: string
  pc: RTCPeerConnection
  viewers: Map<Key, Viewer>
  receiver?: RTCRtpReceiver
  ssrc?: number
  lastKey: number
  keyTimer?: ReturnType<typeof setTimeout>
  received: number
  bytes: number
  keyRequests: number
}

export function createForwarder({ iceServers, log = () => {}, maxViewers = 3, publicIp, portRange }: ForwarderOptions) {
  const streams = new Map<string, Stream>()
  let out = 0 // bytes sent to viewers, for a server's monthly budget
  const viewerCount = () => [...streams.values()].reduce((n, s) => n + s.viewers.size, 0)
  // This process's event loop lag, a p95 each second: forwarding runs here, so a lagging loop delays every packet
  const delay = monitorEventLoopDelay({ resolution: 10 })
  delay.enable()
  let lagged: number | null = null
  const lagTimer = setInterval(() => ((lagged = lagSince(lagged, delay.percentile(95) / 1e6, Date.now())), delay.reset()), 1000)
  lagTimer.unref()

  // iceUseDefaultStunServer: werift would otherwise ask Google's STUN on every connection, whatever we pass
  const peer = () =>
    new RTCPeerConnection({
      iceServers,
      iceUseDefaultStunServer: false,
      iceUseIpv6: false,
      ...(publicIp && { iceAdditionalHostAddresses: [publicIp] }),
      ...(portRange && { icePortRange: portRange }),
      codecs: { video: [useVP8(), new RTCRtpCodecParameters({ mimeType: 'video/rtx', clockRate: 90000 })], audio: [useOPUS()] },
      headerExtensions: { video: [useSdesMid(), useTransportWideCC(), useAbsSendTime()], audio: [useSdesMid()] },
    })

  const trickle = (pc: RTCPeerConnection, onIce?: (c: Ice) => void) => {
    if (onIce) pc.onIceCandidate.subscribe((c) => c?.candidate && onIce({ candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex }))
    return (c: unknown) => pc.addIceCandidate(checkIce(c))
  }

  // Testing only (index.ts allows it on a local test DHT): loss on this forwarder's own lines, in from the streamer and out
  // to viewers, dropped by werift below its send history so resends work as on a real line. werift 0.27 passes p % of
  // packets (and 0 means no loss), hence 100 - loss, and a sliver for a dead line.
  const loss = { inbound: 0, outbound: 0 }
  const pass = (l: number) => (l > 0 ? Math.max(100 - l, 1e-6) : 0)
  const lossy = (pc: RTCPeerConnection, dir: 'inbound' | 'outbound') => {
    pc.config.debug = { ...pc.config.debug, [dir + 'PacketLoss']: pass(loss[dir]) }
    return pc
  }
  function testLoss(o: { inbound?: number; outbound?: number }) {
    Object.assign(loss, o)
    for (const s of streams.values()) {
      lossy(s.pc, 'inbound')
      for (const v of s.viewers.values()) lossy(v.pc, 'outbound')
    }
  }

  const stream = (id: string) => {
    const s = streams.get(id)
    if (!s) throw new Error('no such stream')
    return s
  }

  // At most one request per KEY_GAP; a later one is sent when the gap ends rather than lost, so a new viewer starts
  function requestKey(s: Stream) {
    const wait = s.lastKey + KEY_GAP - Date.now()
    if (wait > 0) {
      s.keyTimer ??= setTimeout(() => {
        s.keyTimer = undefined
        requestKey(s)
      }, wait)
      return
    }
    if (!s.receiver || s.ssrc === undefined) return // nothing received yet: the first frame is a key frame anyway
    s.lastKey = Date.now()
    s.keyRequests++
    s.receiver.sendRtcpPLI(s.ssrc).catch((e) => log('fwd pli', s.id, String(e)))
  }

  function onVideo(s: Stream, rtp: RtpPacket, padding: boolean) {
    s.received++
    s.bytes += rtp.payload.length + 12
    s.ssrc ??= rtp.header.ssrc
    const payload = padding ? new Uint8Array(0) : rtp.payload
    for (const v of s.viewers.values()) if (v.ready) send(v, v.video, rtp, v.filter.next(rtp.header.sequenceNumber, payload))
  }

  // The stream's sound passes unchanged, also to viewers with video off (the app's "audio" want)
  function onAudio(s: Stream, rtp: RtpPacket) {
    s.bytes += rtp.payload.length + 12
    for (const v of s.viewers.values()) if (v.ready) send(v, v.audio, rtp, { seq: rtp.header.sequenceNumber, payload: rtp.payload })
  }

  function send(v: Viewer, track: MediaStreamTrack, rtp: RtpPacket, o: Out) {
    if (!o) return
    const c = rtp.clone() // werift's sender rewrites header fields in place, and the clone is per viewer
    c.header.sequenceNumber = o.seq
    if ('padding' in o) {
      c.header.padding = true
      c.header.paddingSize = 1
      c.header.marker = false
      c.payload = Buffer.alloc(0)
    } else c.payload = Buffer.isBuffer(o.payload) ? o.payload : Buffer.from(o.payload.buffer, o.payload.byteOffset, o.payload.byteLength)
    track.writeRtp(c)
    if (track === v.video && !('padding' in o)) keep(v, c)
    v.sent++
    out += c.payload.length + 12
  }

  function keep(v: Viewer, rtp: RtpPacket) {
    const now = Date.now()
    v.history.set(rtp.header.sequenceNumber, { rtp, at: now })
    for (const [seq, h] of v.history) {
      if (now - h.at <= HISTORY_MS) break // a Map keeps insertion order: the oldest come first
      v.history.delete(seq)
    }
  }

  // A NACK werift could not answer: ours goes into its cache slot for one synchronous call, so its own path (RTX,
  // pacing, congestion control) resends it, and the slot gets its packet back at once
  function resendOld(v: Viewer, sender: RTCRtpSender, nack: GenericNack) {
    const cache = (sender as unknown as { rtpCache: RtpPacket[] }).rtpCache
    for (const seq of nack.lost) {
      const slot = seq % WERIFT_HISTORY
      const ours = v.history.get(seq)?.rtp
      if (!ours || cache[slot]?.header.sequenceNumber === seq) continue
      const was = cache[slot]
      cache[slot] = ours
      try {
        sender.handleRtcpPacket(new RtcpTransportLayerFeedback({ feedback: new GenericNack({ lost: [seq], senderSsrc: nack.senderSsrc, mediaSourceSsrc: nack.mediaSourceSsrc }) }))
      } finally {
        cache[slot] = was
      }
      v.resent++
    }
  }

  function addStream(id: string, { onIce }: { onIce?: (c: Ice) => void } = {}) {
    if (!isStreamId(id)) throw new Error('bad stream id')
    if (streams.has(id)) throw new Error('stream exists')
    const pc = lossy(peer(), 'inbound')
    const s: Stream = { id, pc, viewers: new Map(), lastKey: 0, received: 0, bytes: 0, keyRequests: 0 }
    streams.set(id, s)
    pc.onTrack.subscribe((track) => {
      track.onReceiveRtp.subscribe((rtp, _ext, info) => {
        if (track.kind === 'video') onVideo(s, rtp, info?.type === 'padding')
        else if (info?.type !== 'padding') onAudio(s, rtp)
      })
    })
    pc.connectionStateChange.subscribe((st) => log('fwd stream', id, st))
    return {
      // The streamer's offer in, our answer out (with our candidates already in it)
      async answer(offer: string) {
        await pc.setRemoteDescription({ type: 'offer', sdp: checkSdp(offer) })
        s.receiver = pc.getTransceivers().find((t) => t.kind === 'video')?.receiver
        await pc.setLocalDescription(await pc.createAnswer())
        return pc.localDescription!.sdp
      },
      addIce: trickle(pc, onIce),
    }
  }

  // onGone: the viewer's side closed or failed (it went direct, or reloaded) while we still served it
  async function addViewer(streamId: string, key: Key, { onIce, onGone }: { onIce?: (c: Ice) => void; onGone?: () => void } = {}) {
    const s = stream(streamId)
    if (!isKey(key)) throw new Error('bad viewer key')
    if (s.viewers.has(key)) removeViewer(streamId, key) // a reconnect replaces the old peer
    if (viewerCount() >= maxViewers) throw new Error('viewer limit')
    const pc = lossy(peer(), 'outbound')
    const video = new MediaStreamTrack({ kind: 'video' })
    const audio = new MediaStreamTrack({ kind: 'audio' })
    const vt = pc.addTransceiver(video, { direction: 'sendonly' })
    pc.addTransceiver(audio, { direction: 'sendonly' })
    const v: Viewer = { key, pc, video, audio, filter: createLayerFilter(), layer: 'full', ready: false, sent: 0, history: new Map(), resent: 0 }
    s.viewers.set(key, v)
    let ours = false // our own call into handleRtcpPacket raises onGenericNack again
    vt.sender.onGenericNack.subscribe((nack) => {
      if (ours) return
      ours = true
      try {
        resendOld(v, vt.sender, nack)
      } finally {
        ours = false
      }
    })
    // Retransmissions to this viewer come from werift's own send history (128 packets); key frames from upstream
    vt.sender.onKeyFrameRequest.subscribe(() => requestKey(s))
    // connected includes DTLS: packets written before it would leave holes the viewer cannot get back
    pc.connectionStateChange.subscribe((st) => {
      log('fwd viewer', streamId, key.slice(0, 8), st)
      if (st === 'connected' && !v.ready) {
        v.ready = true
        requestKey(s)
      }
      if ((st === 'closed' || st === 'failed') && s.viewers.get(key) === v) {
        s.viewers.delete(key)
        v.pc.close().catch(() => {})
        onGone?.()
      }
    })
    const add = trickle(pc, onIce)
    try {
      await pc.setLocalDescription(await pc.createOffer())
    } catch (e) {
      if (s.viewers.get(key) === v) removeViewer(streamId, key) // frees its seat
      throw e
    }
    return {
      offer: pc.localDescription!.sdp,
      accept: (answer: string) => pc.setRemoteDescription({ type: 'answer', sdp: checkSdp(answer) }),
      addIce: add,
    }
  }

  function setLayer(streamId: string, key: Key, layer: Layer) {
    if (!isLayer(layer)) throw new Error('bad layer')
    const s = stream(streamId)
    const v = s.viewers.get(key)
    if (!v) throw new Error('no such viewer')
    const resume = v.layer === 'off' && layer !== 'off'
    v.layer = layer
    v.filter.setMaxTid(LAYER_TID[layer])
    if (resume) requestKey(s)
  }

  function removeViewer(streamId: string, key: Key) {
    const v = streams.get(streamId)?.viewers.get(key)
    if (!v) return
    streams.get(streamId)!.viewers.delete(key)
    v.pc.close().catch(() => {})
  }

  function removeStream(id: string) {
    const s = streams.get(id)
    if (!s) return
    for (const key of [...s.viewers.keys()]) removeViewer(id, key)
    clearTimeout(s.keyTimer)
    streams.delete(id)
    s.pc.close().catch(() => {})
  }

  const stats = () =>
    [...streams.values()].map((s) => ({
      id: s.id,
      received: s.received,
      bytes: s.bytes, // in, RTP payload plus header
      keyRequests: s.keyRequests,
      viewers: [...s.viewers.values()].map((v) => ({ key: v.key, layer: v.layer, connected: v.ready, sent: v.sent, resent: v.resent })),
    }))

  return {
    addStream,
    addViewer,
    setLayer,
    removeViewer,
    removeStream,
    stats,
    bytesOut: () => out,
    testLoss,
    lagging: () => overloaded(false, lagged, Date.now()),
    close: () => {
      for (const id of [...streams.keys()]) removeStream(id)
      clearInterval(lagTimer)
      delay.disable()
    },
  }
}

export type Forwarder = ReturnType<typeof createForwarder>
