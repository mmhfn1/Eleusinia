import type { Event, Key, Settings, State } from '../shared/protocol'

declare global {
  interface Window {
    api: { call(method: string, ...args: any[]): Promise<any>; on(fn: (e: Event) => void): () => void }
  }
}

// Voice calls as a full mesh: one RTCPeerConnection per other participant, signaled over the control links.
type Peer = { pc: RTCPeerConnection; audio: HTMLAudioElement; relayed?: boolean }

export const active = new Map<string, Set<Key>>() // conversation -> peers we know are in its call
export const peers = new Map<Key, Peer>()
export let conv: string | null = null
export let muted = false
export let deafened = false // hear nobody; also keeps your microphone off

let state: State
let stream: MediaStream | null = null
let notify = () => {}
export const onChange = (fn: () => void) => void (notify = fn)

const send = (c: string, to: Key | null, data: unknown) => window.api.call('signal', c, to, data)
const membersOf = (c: string) => state.groups[c]?.members ?? c.split('_')
const mic = (s: Settings) => navigator.mediaDevices.getUserMedia({ audio: s.mic ? { deviceId: s.mic } : true })

function bitrate(pc: RTCPeerConnection) {
  for (const sender of pc.getSenders()) {
    const p = sender.getParameters()
    if (!p.encodings?.length) continue
    p.encodings[0].maxBitrate = state.settings.audioKbps * 1000
    sender.setParameters(p).catch(() => {})
  }
}

function drop(k: Key) {
  const p = peers.get(k)
  if (!p) return
  p.pc.close()
  p.audio.srcObject = null
  peers.delete(k)
  window.api.call('relayClose', k)
}

function connect(k: Key) {
  drop(k)
  const c = conv!
  const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
  const audio = new Audio()
  audio.autoplay = true
  audio.muted = deafened
  if (state.settings.out) audio.setSinkId(state.settings.out).catch(() => {})
  for (const t of stream!.getTracks()) pc.addTrack(t, stream!)
  pc.onicecandidate = (e) => e.candidate && send(c, k, { k: 'ice', c: e.candidate.toJSON() })
  pc.ontrack = (e) => (audio.srcObject = e.streams[0])
  const peer: Peer = { pc, audio }
  pc.onconnectionstatechange = async () => {
    if (pc.connectionState === 'connected') {
      bitrate(pc)
      peer.relayed = await isRelayed(pc)
    }
    notify()
  }
  peers.set(k, peer)
  return pc
}

// Offers the relay port as a last-resort path: ICE prefers any direct route, and only uses this one
// when routers block every direct route. Must run after the remote description is set.
async function addRelay(k: Key, pc: RTCPeerConnection) {
  const r = await window.api.call('relayOpen', k)
  if (!r || pc.signalingState === 'closed') return
  const mid = pc.getTransceivers()[0]?.mid ?? '0'
  await pc.addIceCandidate({ candidate: `candidate:9 1 udp 16777215 ${r.ip} ${r.port} typ relay raddr 0.0.0.0 rport 0`, sdpMid: mid, sdpMLineIndex: 0 })
}

async function isRelayed(pc: RTCPeerConnection) {
  const stats = await pc.getStats()
  let pair: any
  stats.forEach((s) => s.type === 'transport' && (pair = stats.get(s.selectedCandidatePairId)))
  return stats.get(pair?.remoteCandidateId)?.candidateType === 'relay'
}

export async function join(c: string) {
  leave()
  stream = await mic(state.settings)
  conv = c
  muted = deafened = false
  send(c, null, { k: 'join' })
  notify()
}

export function leave() {
  if (!conv) return
  send(conv, null, { k: 'leave' })
  for (const k of [...peers.keys()]) drop(k)
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
  conv = null
  notify()
}

const applyMic = () => stream?.getAudioTracks().forEach((t) => (t.enabled = !muted && !deafened))

// Unmuting while deafened also undeafens, since you cannot talk without hearing the reply.
export function toggleMute() {
  if (deafened) deafened = muted = false
  else muted = !muted
  for (const p of peers.values()) p.audio.muted = deafened
  applyMic()
  notify()
}

export function toggleDeafen() {
  deafened = !deafened
  for (const p of peers.values()) p.audio.muted = deafened
  applyMic()
  notify()
}

async function handle(from: Key, c: string, d: any) {
  if (!d || typeof d !== 'object') return
  const set = active.get(c) ?? new Set()
  active.set(c, set)
  if (d.k === 'leave') {
    set.delete(from)
    if (c === conv) drop(from)
    return
  }
  if (!set.size && !conv) new Notification('Eleusinia', { body: `${state.profiles[from]?.name || 'Someone'} started a call` })
  set.add(from)
  if (c !== conv) return

  if (d.k === 'join') {
    const p = peers.get(from)
    if (p && !['failed', 'closed'].includes(p.pc.connectionState)) return
    // The smaller key always makes the offer, so two people joining at once cannot both offer.
    if (state.me > from) return void send(c, from, { k: 'join' })
    const pc = connect(from)
    await pc.setLocalDescription(await pc.createOffer())
    send(c, from, { k: 'offer', sdp: pc.localDescription!.toJSON() })
  } else if (d.k === 'offer') {
    const pc = connect(from)
    await pc.setRemoteDescription(d.sdp)
    await addRelay(from, pc)
    await pc.setLocalDescription(await pc.createAnswer())
    send(c, from, { k: 'answer', sdp: pc.localDescription!.toJSON() })
  } else if (d.k === 'answer') {
    const pc = peers.get(from)?.pc
    if (!pc) return
    await pc.setRemoteDescription(d.sdp)
    await addRelay(from, pc)
  } else if (d.k === 'ice') {
    await peers.get(from)?.pc.addIceCandidate(d.c)
  }
}

// One at a time, so a candidate never overtakes the offer it belongs to.
let queue = Promise.resolve()
export function onSignal(from: Key, c: string, d: any) {
  queue = queue
    .then(() => handle(from, c, d))
    .catch(console.error)
    .then(notify)
}

export function onState(next: State) {
  const prev = state
  state = next
  if (!prev) return
  for (const k of prev.online) {
    if (next.online.includes(k)) continue
    for (const set of active.values()) set.delete(k)
    drop(k)
  }
  // Tell people who just came online that a call is running.
  if (conv) for (const k of next.online) if (!prev.online.includes(k) && membersOf(conv).includes(k)) send(conv, k, { k: 'join' })

  const [a, b] = [prev.settings, next.settings]
  if (a.audioKbps !== b.audioKbps) for (const p of peers.values()) bitrate(p.pc)
  if (a.out !== b.out) for (const p of peers.values()) p.audio.setSinkId(b.out).catch(() => {})
  if (a.mic !== b.mic && stream) {
    mic(b).then((fresh) => {
      const track = fresh.getAudioTracks()[0]
      track.enabled = !muted && !deafened
      for (const p of peers.values()) p.pc.getSenders().forEach((s) => s.track?.kind === 'audio' && s.replaceTrack(track))
      stream?.getTracks().forEach((t) => t.stop())
      stream = fresh
    }, console.error)
  }
  notify()
}
