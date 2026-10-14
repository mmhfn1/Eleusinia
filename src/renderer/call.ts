import { createCandidates, createWatchdog, offers } from '../shared/callstate'
import type { Event, Key, Settings, State } from '../shared/protocol'

declare global {
  interface Window {
    api: { call(method: string, ...args: any[]): Promise<any>; on(fn: (e: Event) => void): () => void }
  }
}

// Voice calls as a full mesh: one RTCPeerConnection per other participant, signaled over the control links.
type Peer = { pc: RTCPeerConnection; audio: HTMLAudioElement; relayed?: boolean; candidates: ReturnType<typeof createCandidates>; offer?: number }

export const active = new Map<string, Set<Key>>() // conversation -> peers we know are in its call
export const peers = new Map<Key, Peer>()
// Outlives a rebuilt connection, so reconnect attempts keep backing off until one holds.
const watchdogs = new Map<Key, ReturnType<typeof createWatchdog>>()
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

function close(k: Key) {
  const p = peers.get(k)
  if (!p) return
  p.pc.close()
  p.audio.srcObject = null
  peers.delete(k)
  window.api.call('relayClose', k)
}

// Ends the call with k for good: they left, went offline, or we left.
function drop(k: Key) {
  watchdogs.get(k)?.stop()
  watchdogs.delete(k)
  close(k)
}

function connect(k: Key) {
  close(k)
  const c = conv!
  const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
  const audio = new Audio()
  audio.autoplay = true
  audio.muted = deafened
  if (state.settings.out) audio.setSinkId(state.settings.out).catch(() => {})
  for (const t of stream!.getTracks()) pc.addTrack(t, stream!)
  pc.onicecandidate = (e) => e.candidate && send(c, k, { k: 'ice', c: e.candidate.toJSON() })
  pc.ontrack = (e) => (audio.srcObject = e.streams[0])
  const peer: Peer = { pc, audio, candidates: createCandidates(pc) }
  if (!watchdogs.has(k)) watchdogs.set(k, createWatchdog(state.me, k, { restart: () => serial(() => restart(k)), rebuild: () => serial(() => offer(k)) }))
  pc.onconnectionstatechange = async () => {
    if (peers.get(k) !== peer) return // a replaced connection
    watchdogs.get(k)?.update(pc.connectionState)
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

// Answers echo their offer's id, so an answer to an older offer is never applied to a newer connection.
let offerId = 0

async function offer(k: Key) {
  if (!conv) return
  const c = conv
  const pc = connect(k)
  const id = (peers.get(k)!.offer = ++offerId)
  await pc.setLocalDescription(await pc.createOffer())
  send(c, k, { k: 'offer', sdp: pc.localDescription!.toJSON(), id })
}

// Finds a new route on the same connection; the other side answers without tearing anything down.
async function restart(k: Key) {
  const p = peers.get(k)
  if (!conv || !p || p.pc.signalingState === 'closed') return
  const id = (p.offer = ++offerId)
  p.pc.restartIce()
  await p.pc.setLocalDescription(await p.pc.createOffer({ iceRestart: true }))
  send(conv, k, { k: 'offer', sdp: p.pc.localDescription!.toJSON(), restart: true, id })
}

// Sets the remote side's description, then the candidates that arrived before it and the relay port.
async function describe(k: Key, pc: RTCPeerConnection, sdp: RTCSessionDescriptionInit) {
  await pc.setRemoteDescription(sdp)
  await peers.get(k)?.candidates.flush()
  await addRelay(k, pc)
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
    // A duplicate while our connection works or is being set up; otherwise they lost us and we start over.
    const p = peers.get(from)
    if (p && ['new', 'connecting', 'connected'].includes(p.pc.connectionState)) return
    if (!offers(state.me, from)) return void send(c, from, { k: 'join' })
    await offer(from)
  } else if (d.k === 'offer') {
    // An ICE restart reuses the connection; any other offer starts a new one.
    const p = d.restart && peers.get(from)
    const pc = p && p.pc.signalingState !== 'closed' ? p.pc : connect(from)
    await describe(from, pc, d.sdp)
    await pc.setLocalDescription(await pc.createAnswer())
    send(c, from, { k: 'answer', sdp: pc.localDescription!.toJSON(), id: d.id })
  } else if (d.k === 'answer') {
    const p = peers.get(from)
    if (!p || (d.id !== undefined && d.id !== p.offer)) return
    await describe(from, p.pc, d.sdp)
  } else if (d.k === 'ice') {
    await peers.get(from)?.candidates.add(d.c)
  }
}

// One at a time, so a candidate never overtakes the offer it belongs to, and a reconnect never
// interleaves with incoming signals.
let queue = Promise.resolve()
function serial(fn: () => Promise<void>) {
  queue = queue.then(fn).catch(console.error).then(notify)
}
export const onSignal = (from: Key, c: string, d: any) => serial(() => handle(from, c, d))

export function onState(next: State) {
  const prev = state
  state = next
  if (!prev) return
  for (const k of prev.online) {
    if (next.online.includes(k)) continue
    for (const set of active.values()) set.delete(k)
    const w = peers.has(k) && watchdogs.get(k)
    if (w) w.away(() => (drop(k), notify()))
    else drop(k)
  }
  // Tell people who just came online that a call is running, unless our call with them never broke.
  for (const k of next.online) {
    if (prev.online.includes(k)) continue
    watchdogs.get(k)?.back()
    if (conv && membersOf(conv).includes(k) && peers.get(k)?.pc.connectionState !== 'connected') send(conv, k, { k: 'join' })
  }

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
