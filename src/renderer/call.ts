import { createCandidates, createWatchdog, lightOpus, offers, relayCandidate } from '../shared/callstate'
import { fellBack, nextDevice, usable } from '../shared/devices'
import type { Event, Key, State } from '../shared/protocol'
import { SAMPLE_EVERY, type Sample, grade, remember, worst } from '../shared/quality'
import { type Level, type Quality, RAMP_MS, STARVED_AFTER, type Verdict, canStream, encodingFor, streamKbps, widthFor } from '../shared/video'

// A screen or window offered by the system for sharing, with what it can deliver.
export type ScreenSource = { id: string; name: string; thumb: string; width: number; height: number; fps: number }

declare global {
  interface Window {
    api: {
      call(method: string, ...args: any[]): Promise<any>
      on(fn: (e: Event) => void): () => void
      screens(): Promise<ScreenSource[]>
      chooseScreen(id: string): Promise<void>
    }
  }
}

// Calls as a full mesh: one RTCPeerConnection per other participant, signaled over the control links.
// Each connection carries voice, plus a video slot that is empty until someone shares their screen, so starting
// or stopping a share never needs a new offer.
type Peer = {
  pc: RTCPeerConnection
  audio: HTMLAudioElement
  relayed?: boolean
  candidates: ReturnType<typeof createCandidates>
  offer?: number
  video?: RTCRtpTransceiver
  screen?: MediaStream // their shared screen, once frames arrive
}

export const active = new Map<string, Set<Key>>() // conversation -> peers we know are in its call
export const peers = new Map<Key, Peer>()
// Outlives a rebuilt connection, so reconnect attempts keep backing off until one holds.
const watchdogs = new Map<Key, ReturnType<typeof createWatchdog>>()
export let conv: string | null = null
export let muted = false
export let deafened = false // hear nobody; also keeps your microphone off

let state: State
let stream: MediaStream | null = null
// The devices actually in use: the chosen ones, or '' (system default) while a chosen one is unplugged.
let micId = ''
let outId = ''
let relayMissing = false // no network address the relay port could use
// Connection samples per person in the call, or '' for the network while nobody is connected. Memory only.
const samples = new Map<string, Sample[]>()
let sampler: ReturnType<typeof setInterval> | null = null
let measuring = false

// Screen sharing. Ours: the captured track, its source and the quality the user chose (always final).
// Theirs: what each sharer in the call told us. Wants: what each side is showing of the other's share.
export type ShareInfo = { name: string; width: number; height: number; fps: number; starved: boolean }
export const shares = new Map<Key, ShareInfo>()
// Whether each person in the call has muted or deafened themselves, as they told us.
export const voices = new Map<Key, { muted: boolean; deafened: boolean }>()
let screen: { track: MediaStreamTrack; stream: MediaStream; src: ScreenSource; q: Quality; at: number } | null = null
const wants = new Map<Key, Level>() // what each viewer shows of our share
const shown = new Map<Key, Level>() // what we show of each sharer's
let starved = 0 // samples in a row where our stream to someone was held back by their or our bandwidth
let cpuBound = 0 // ... or by our computer not encoding fast enough
let upload: { kbps: number | null; at: number } | null = null
let notify = () => {}
export const onChange = (fn: () => void) => void (notify = fn)

const send = (c: string, to: Key | null, data: unknown) => window.api.call('signal', c, to, data)
const membersOf = (c: string) => state.groups[c]?.members ?? c.split('_')
export const volumeOf = (k: Key) => state.settings.volumes?.[k] ?? 1
const mic = (id: string) => navigator.mediaDevices.getUserMedia({ audio: id ? { deviceId: { exact: id } } : true })

function bitrate(pc: RTCPeerConnection) {
  for (const sender of pc.getSenders()) {
    if (sender.track?.kind !== 'audio') continue
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
  shares.delete(k)
  wants.delete(k)
  shown.delete(k)
  voices.delete(k)
  close(k)
}

function connect(k: Key) {
  close(k)
  const c = conv!
  const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
  const audio = new Audio()
  audio.autoplay = true
  audio.muted = deafened
  audio.volume = volumeOf(k)
  if (outId) audio.setSinkId(outId).catch(() => {})
  for (const t of stream!.getTracks()) pc.addTrack(t, stream!)
  pc.onicecandidate = (e) => e.candidate && send(c, k, { k: 'ice', c: e.candidate.toJSON() })
  const peer: Peer = { pc, audio, candidates: createCandidates(pc) }
  pc.ontrack = (e) => {
    if (e.track.kind === 'audio') audio.srcObject = e.streams[0] ?? new MediaStream([e.track])
    else peer.screen = new MediaStream([e.track])
    notify()
  }
  if (!watchdogs.has(k)) watchdogs.set(k, createWatchdog(state.me, k, { restart: () => serial(() => restart(k)), rebuild: () => serial(() => offer(k)) }))
  pc.onconnectionstatechange = async () => {
    if (peers.get(k) !== peer) return // a replaced connection
    watchdogs.get(k)?.update(pc.connectionState)
    if (pc.connectionState === 'connected') {
      bitrate(pc)
      sendVoice(k)
      if (screen) sendShare(k)
      await applyLevel(k)
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
  relayMissing = !r // peers in a call are always known, so null means no usable address
  if (!r || pc.signalingState === 'closed') return
  const mid = pc.getTransceivers()[0]?.mid ?? '0'
  await pc.addIceCandidate({ candidate: relayCandidate(r.ip, r.port), sdpMid: mid, sdpMLineIndex: 0 })
}

// Answers echo their offer's id, so an answer to an older offer is never applied to a newer connection.
let offerId = 0

// Every description we send asks for Opus silence suppression (see lightOpus).
async function local(pc: RTCPeerConnection, d: RTCSessionDescriptionInit) {
  await pc.setLocalDescription({ type: d.type, sdp: lightOpus(d.sdp ?? '') })
}

// The connection's video slot: VP9 first (sharp text at low bitrates), then H.264 and VP8. If we are sharing,
// our screen goes straight into it.
async function useVideo(k: Key, t: RTCRtpTransceiver) {
  const p = peers.get(k)
  if (!p) return
  p.video = t
  const rank = (m: string) => ((i) => (i < 0 ? 9 : i))(['video/VP9', 'video/H264', 'video/VP8'].indexOf(m))
  const codecs = [...(RTCRtpReceiver.getCapabilities('video')?.codecs ?? [])].sort((a, b) => rank(a.mimeType) - rank(b.mimeType))
  try {
    t.setCodecPreferences(codecs)
  } catch {} // the order is a preference; the default list works too
  if (screen) await t.sender.replaceTrack(screen.track)
}

async function offer(k: Key) {
  if (!conv) return
  const c = conv
  const pc = connect(k)
  await useVideo(k, pc.addTransceiver('video', { direction: 'sendrecv' }))
  const id = (peers.get(k)!.offer = ++offerId)
  await local(pc, await pc.createOffer())
  send(c, k, { k: 'offer', sdp: pc.localDescription!.toJSON(), id })
}

// Finds a new route on the same connection; the other side answers without tearing anything down.
async function restart(k: Key) {
  const p = peers.get(k)
  if (!conv || !p || p.pc.signalingState === 'closed') return
  const id = (p.offer = ++offerId)
  p.pc.restartIce()
  await local(p.pc, await p.pc.createOffer({ iceRestart: true }))
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

// Sends one viewer what they are showing of our share: nothing, a thumbnail, or our chosen quality (see encodingFor).
async function applyLevel(k: Key) {
  const t = peers.get(k)?.video
  if (!t || !screen) return
  const p = t.sender.getParameters()
  if (!p.encodings?.length) return // not negotiated yet; applied again once connected
  Object.assign(p.encodings[0], encodingFor(wants.get(k) ?? 'full', screen.q, streamKbps(screen.src, screen.q)))
  await t.sender.setParameters(p).catch(() => {})
}

function sendShare(k: Key | null) {
  if (!conv) return
  const info = screen && { on: true, name: screen.src.name, width: widthFor(screen.src, screen.q.height), height: screen.q.height, fps: screen.q.fps, starved: starved >= STARVED_AFTER }
  send(conv, k, { k: 'share', ...(info ?? { on: false }) })
}

const captureLimits = (src: ScreenSource, q: Quality) => ({ width: { max: widthFor(src, q.height) }, height: { max: q.height }, frameRate: { max: q.fps } })

export const sharing = () => screen && { src: screen.src, q: screen.q, stream: screen.stream }

// Whether a new stream fits the call (see canStream). Upload is measured against the best-connected person in the
// call and remembered for a minute.
export async function checkShare(src: ScreenSource, q: Quality): Promise<Verdict> {
  const live = [...peers].filter(([, p]) => p.pc.connectionState === 'connected')
  if (!upload || Date.now() - upload.at > 60000) {
    const best = live.map(([k]) => k).sort((a, b) => (samples.get(a)?.at(-1)?.rtt ?? 1e9) - (samples.get(b)?.at(-1)?.rtt ?? 1e9))[0]
    upload = best ? { kbps: await window.api.call('probe', best).catch(() => null), at: Date.now() } : null
  }
  return canStream({ kbps: streamKbps(src, q), viewers: live.length, uploadKbps: upload?.kbps ?? null, starved: [...shares.values()].some((s) => s.starved) })
}

async function capture(src: ScreenSource, q: Quality) {
  await window.api.chooseScreen(src.id)
  const media = await navigator.mediaDevices.getDisplayMedia({ video: captureLimits(src, q), audio: false })
  const track = media.getVideoTracks()[0]
  track.contentHint = q.motion ? 'motion' : 'detail'
  return track
}

// Puts a captured screen on every connection, replacing whatever was shared before.
async function use(track: MediaStreamTrack, src: ScreenSource, q: Quality) {
  const old = screen?.track
  track.onended = () => stopShare() // the shared window was closed
  screen = { track, stream: new MediaStream([track]), src, q, at: Date.now() }
  starved = cpuBound = 0
  for (const [k, p] of peers) {
    await p.video?.sender.replaceTrack(track)
    await applyLevel(k)
  }
  if (old) (old.onended = null), old.stop()
  sendShare(null)
  notify()
}

export async function startShare(src: ScreenSource, q: Quality) {
  if (!conv) return
  const track = await capture(src, q)
  if (!conv) return track.stop() // the call ended meanwhile
  await use(track, src, q)
}

// Shares another screen or window without stopping: viewers keep watching, the picture just changes.
export async function switchShare(src: ScreenSource, q: Quality) {
  if (!screen) return
  const track = await capture(src, q)
  if (!screen) return track.stop() // stopped meanwhile
  await use(track, src, q)
}

// The streamer's choice is final: applied as asked, never second-guessed.
export async function setQuality(q: Quality) {
  if (!screen) return
  screen = { ...screen, q, at: Date.now() }
  starved = cpuBound = 0
  screen.track.contentHint = q.motion ? 'motion' : 'detail'
  await screen.track.applyConstraints(captureLimits(screen.src, q)).catch(() => {})
  for (const k of peers.keys()) await applyLevel(k)
  sendShare(null)
  notify()
}

export function stopShare() {
  if (!screen) return
  screen.track.onended = null
  screen.track.stop()
  screen = null
  for (const p of peers.values()) p.video?.sender.replaceTrack(null)
  sendShare(null)
  notify()
}

// What we show of a sharer's screen; they then send only that. Unchanged levels are not resent.
export function show(k: Key, level: Level) {
  if (!conv || shown.get(k) === level) return
  shown.set(k, level)
  send(conv, k, { k: 'want', level })
}

// Whether our stream is held back, by bandwidth (towards someone showing it full size) or by our own computer.
// Ignored while a stream ramps up after starting or changing quality.
async function checkLimits() {
  if (!screen || Date.now() - screen.at < RAMP_MS) return
  let bandwidth = false
  let cpu = false
  for (const [k, p] of peers) {
    if (!p.video || p.pc.connectionState !== 'connected' || (wants.get(k) ?? 'full') !== 'full') continue
    ;(await p.video.sender.getStats()).forEach((r: any) => {
      if (r.type !== 'outbound-rtp') return
      bandwidth ||= r.qualityLimitationReason === 'bandwidth'
      cpu ||= r.qualityLimitationReason === 'cpu'
    })
  }
  const was = starved >= STARVED_AFTER
  starved = bandwidth ? starved + 1 : 0
  cpuBound = cpu ? cpuBound + 1 : 0
  if (was !== starved >= STARVED_AFTER) sendShare(null)
}

// Round trip, loss and jitter of what we send, as the other side reports it; the route's round trip until it has.
async function sampleLink(pc: RTCPeerConnection): Promise<Sample | null> {
  const stats = await pc.getStats()
  let s: Sample | null = null
  let pair: any
  stats.forEach((r) => {
    if (r.type === 'remote-inbound-rtp' && r.kind === 'audio' && r.roundTripTime !== undefined)
      s = { rtt: r.roundTripTime * 1000, loss: r.fractionLost ?? 0, jitter: (r.jitter ?? 0) * 1000 }
    if (r.type === 'transport') pair = stats.get(r.selectedCandidatePairId)
  })
  return s ?? (pair?.currentRoundTripTime !== undefined ? { rtt: pair.currentRoundTripTime * 1000 } : null)
}

// Samples every connected link; with nobody connected, the network itself, so the sign works when alone in a call.
async function measure() {
  if (measuring || !conv) return
  measuring = true
  try {
    const live = [...peers].filter(([, p]) => p.pc.connectionState === 'connected')
    for (const k of samples.keys()) if (k && !live.some(([l]) => l === k)) samples.delete(k)
    if (live.length) {
      samples.delete('')
      for (const [k, p] of live) {
        const s = await sampleLink(p.pc).catch(() => null)
        if (s) samples.set(k, remember(samples.get(k), s))
      }
    } else {
      const ms: number | null = await window.api.call('ping').catch(() => null)
      samples.set('', remember(samples.get(''), { rtt: ms ?? Infinity }))
    }
    await checkLimits()
  } finally {
    measuring = false
  }
  if (conv) notify()
}

// For the Voice Connected sign: the weakest of your links (or the network while alone), and the latest ping of each.
// A link that is reconnecting counts as poor.
export function signal() {
  const reconnecting = [...peers.values()].some((p) => ['disconnected', 'failed'].includes(p.pc.connectionState))
  const pings = [...samples].map(([k, s]) => ({ k, ms: s[s.length - 1].rtt }))
  return { grade: reconnecting ? ('poor' as const) : worst([...samples.values()].map(grade)), pings }
}

// Swaps in a microphone for every connection. A chosen one that fails to open gives way to the default.
async function useMic(id: string) {
  const fresh = await mic(id).catch(() => mic((id = '')))
  if (!stream) return fresh.getTracks().forEach((t) => t.stop()) // the call ended meanwhile
  const track = fresh.getAudioTracks()[0]
  track.enabled = !muted && !deafened
  track.onended = () => followDevices(true) // unplugged, or the system took it away
  for (const p of peers.values()) p.pc.getSenders().forEach((s) => s.track?.kind === 'audio' && s.replaceTrack(track))
  stream.getTracks().forEach((t) => ((t.onended = null), t.stop()))
  stream = fresh
  micId = id
}

// Keeps the call on the chosen microphone and speakers while they are plugged in, and on the system
// default while they are not. Runs one check at a time, and only during a call.
let devicesQueue = Promise.resolve()
function followDevices(micEnded = false) {
  devicesQueue = devicesQueue
    .then(async () => {
      if (!stream) return
      const list = await navigator.mediaDevices.enumerateDevices()
      if (!stream) return
      const { mic: chosenMic, out: chosenOut, micLabel, outLabel } = state.settings
      const out = nextDevice(chosenOut, outId, 'audiooutput', list, outLabel)
      if (out !== null) {
        outId = out
        for (const p of peers.values()) p.audio.setSinkId(outId).catch(() => {})
      }
      const m = nextDevice(chosenMic, micId, 'audioinput', list, micLabel)
      if (m !== null || micEnded) await useMic(m ?? micId)
    })
    .catch(console.error)
    .then(notify)
}
const onDeviceChange = () => followDevices()

// Short notes for the call panel: devices standing in for unplugged ones, and a missing fallback route.
export function notices() {
  const out: string[] = []
  if (!conv) return out
  if (fellBack(state.settings.mic, micId)) out.push('Your microphone is unplugged, so the system default is in use.')
  if (fellBack(state.settings.out, outId)) out.push('Your speakers are unplugged, so the system default is in use.')
  // Only worth saying while it matters: someone is not connected and the fallback could have helped.
  const struggling = [...peers.values()].some((p) => p.pc.connectionState !== 'connected')
  if (relayMissing && struggling) out.push('No network address for the fallback route, so a call works only where a direct connection does.')
  if (screen && cpuBound >= STARVED_AFTER) out.push('Your computer cannot encode your stream at this quality fast enough. You can lower it in Stream quality.')
  if (screen && starved >= STARVED_AFTER) out.push('Your connection cannot carry your stream at this quality to everyone. You can lower it in Stream quality.')
  return out
}

export async function join(c: string) {
  leave()
  const list = await navigator.mediaDevices.enumerateDevices()
  micId = usable(state.settings.mic, 'audioinput', list, state.settings.micLabel)
  outId = usable(state.settings.out, 'audiooutput', list, state.settings.outLabel)
  const fresh = await mic(micId).catch(() => mic((micId = '')))
  stream = fresh
  fresh.getAudioTracks().forEach((t) => (t.onended = () => followDevices(true)))
  conv = c
  muted = deafened = false
  relayMissing = false
  navigator.mediaDevices.addEventListener('devicechange', onDeviceChange)
  send(c, null, { k: 'join' })
  followDevices() // device ids are only listed once the microphone is allowed
  sampler = setInterval(measure, SAMPLE_EVERY)
  measure()
  notify()
}

export function leave() {
  if (!conv) return
  stopShare()
  send(conv, null, { k: 'leave' })
  for (const k of [...peers.keys()]) drop(k)
  navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange)
  if (sampler) clearInterval(sampler)
  sampler = null
  samples.clear()
  shares.clear()
  wants.clear()
  shown.clear()
  voices.clear()
  upload = null
  stream?.getTracks().forEach((t) => ((t.onended = null), t.stop()))
  stream = null
  conv = null
  notify()
}

const applyMic = () => stream?.getAudioTracks().forEach((t) => (t.enabled = !muted && !deafened))

const sendVoice = (k: Key | null) => conv && send(conv, k, { k: 'voice', muted, deafened })

// Unmuting while deafened also undeafens, since you cannot talk without hearing the reply.
export function toggleMute() {
  if (deafened) deafened = muted = false
  else muted = !muted
  for (const p of peers.values()) p.audio.muted = deafened
  applyMic()
  sendVoice(null)
  notify()
}

export function toggleDeafen() {
  deafened = !deafened
  for (const p of peers.values()) p.audio.muted = deafened
  applyMic()
  sendVoice(null)
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
    // A new connection: take up the video slot the offer brought, so we can send our screen on it too.
    const slot = !peers.get(from)?.video && pc.getTransceivers().find((t: RTCRtpTransceiver) => t.receiver.track.kind === 'video')
    if (slot) {
      slot.direction = 'sendrecv'
      await useVideo(from, slot)
    }
    await local(pc, await pc.createAnswer())
    send(c, from, { k: 'answer', sdp: pc.localDescription!.toJSON(), id: d.id })
  } else if (d.k === 'answer') {
    const p = peers.get(from)
    if (!p || (d.id !== undefined && d.id !== p.offer)) return
    await describe(from, p.pc, d.sdp)
  } else if (d.k === 'ice') {
    await peers.get(from)?.candidates.add(d.c)
  } else if (d.k === 'share') {
    // From another app, so every field is checked and capped.
    const n = (v: unknown, max: number) => Math.max(0, Math.min(max, Math.round(Number(v)) || 0))
    if (d.on) shares.set(from, { name: String(d.name ?? '').slice(0, 100), width: n(d.width, 8192), height: n(d.height, 8192), fps: n(d.fps, 480), starved: !!d.starved })
    else (shares.delete(from), shown.delete(from))
  } else if (d.k === 'voice') {
    voices.set(from, { muted: !!d.muted, deafened: !!d.deafened })
  } else if (d.k === 'want') {
    if (['off', 'thumb', 'full'].includes(d.level)) {
      wants.set(from, d.level)
      await applyLevel(from)
    }
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
  for (const [k, p] of peers) p.audio.volume = volumeOf(k)
  if (a.mic !== b.mic || a.out !== b.out || a.micLabel !== b.micLabel || a.outLabel !== b.outLabel) followDevices()
  notify()
}
