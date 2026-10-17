import { createCandidates, createWatchdog, lightOpus, offers, relayCandidate } from '../shared/callstate'
import { fellBack, nextDevice, usable } from '../shared/devices'
import type { Event, Key, State } from '../shared/protocol'
import { SAMPLE_EVERY, type Sample, grade, remember, worst } from '../shared/quality'
import type { SourceKind } from '../shared/sources'
import { gate, hear, rms } from '../shared/speaking'
import {
  type Level,
  type Quality,
  RAMP_MS,
  SOUND_KBPS,
  STARVED_AFTER,
  type Source,
  type Verdict,
  canStream,
  cameraSource,
  encodingFor,
  streamKbps,
  widthFor,
} from '../shared/video'

// A screen or window offered by the system for sharing, with what it can deliver.
export type ScreenSource = { id: string; kind: SourceKind; name: string; thumb: string; width: number; height: number; fps: number }
// A camera, with what it can deliver.
export type CameraSource = Source & { id: string; name: string }
export type Slot = 'screen' | 'camera'

declare global {
  interface Window {
    api: {
      call(method: string, ...args: any[]): Promise<any>
      on(fn: (e: Event) => void): () => void
      screens(): Promise<ScreenSource[]>
      chooseScreen(id: string, sound?: boolean): Promise<void>
      recordHotkey(): Promise<import('../shared/hotkeys').Hotkey | null>
      stopRecording(): Promise<void>
      isAdmin(): Promise<boolean>
      restartAsAdmin(): Promise<boolean>
      diag(area: import('../shared/reports').Area, text: string): void
      diagnostics(): Promise<{ meta: import('../shared/reports').Meta; events: import('../shared/reports').Diag[] }>
    }
  }
}

// Calls as a full mesh: one RTCPeerConnection per other participant, signaled over the control links.
// Each connection carries voice, plus slots that stay empty until used: a screen, a camera, and the sound of a shared
// screen. They are all set up with the first offer, so starting or stopping a share or a camera never needs a new one.
// A voice through the shared AudioContext: its source, the analyser behind the speaking ring, and when it was last loud.
type Listen = { source: MediaStreamAudioSourceNode; analyser: AnalyserNode; loudAt: number | null }

type Peer = {
  pc: RTCPeerConnection
  audio: HTMLAudioElement // muted: it only keeps their stream flowing into Web Audio (see playVoice)
  voice?: Listen & { gain: GainNode }
  relayed?: boolean
  candidates: ReturnType<typeof createCandidates>
  offer?: number
  screen?: MediaStream // their shared screen, once frames arrive
  camera?: MediaStream // their camera
  sound?: { source: MediaStreamAudioSourceNode; gain: GainNode; el: HTMLAudioElement } // their shared screen's sound
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
// Call events for problem reports: counts, qualities and states only (never names, window titles or device names);
// the main process scrubs and keeps them in memory (shared/reports.ts).
const log = (text: string) => window.api.diag('call', text)
const who = (k: Key) => '…' + k.slice(-6).toUpperCase()
let lastGrade: string | null = null

let micId = ''
let outId = ''
let relayMissing = false // no network address the relay port could use
// Connection samples per person in the call, or '' for the network while nobody is connected. Memory only.
const samples = new Map<string, Sample[]>()
let sampler: ReturnType<typeof setInterval> | null = null
let measuring = false

// Screen sharing. Ours: the captured track, its source and the quality the user chose (always final).
// Theirs: what each sharer in the call told us. Wants: what each side is showing of the other's share.
export type ShareInfo = { name: string; width: number; height: number; fps: number; starved: boolean; sound?: boolean }
export const shares = new Map<Key, ShareInfo>()
export const cameras = new Map<Key, ShareInfo>()
// Whether each person in the call has muted or deafened themselves, as they told us.
export const voices = new Map<Key, { muted: boolean; deafened: boolean }>()
type Out<S> = { track: MediaStreamTrack; stream: MediaStream; src: S; q: Quality; at: number }
let screen: (Out<ScreenSource> & { sound?: MediaStreamTrack }) | null = null
let camera: Out<CameraSource> | null = null
// Keyed `${slot}:${person}`: what each viewer shows of our screen and camera, and what we show of theirs.
const wants = new Map<string, Level>()
const shown = new Map<string, Level>()
const want = (slot: Slot, k: Key) => wants.get(`${slot}:${k}`) ?? 'full'
let starved = 0 // samples in a row where our stream to someone was held back by their or our bandwidth
let cpuBound = 0 // ... or by our computer not encoding fast enough
let upload: { kbps: number | null; at: number } | null = null
let notify = () => {}
export const onChange = (fn: () => void) => void (notify = fn)

const send = (c: string, to: Key | null, data: unknown) => window.api.call('signal', c, to, data)
const membersOf = (c: string) => state.groups[c]?.members ?? c.split('_')
// 0 to 2 (200%); played through a GainNode, so above 100% is a real boost.
const clampVolume = (v: number | undefined) => Math.min(2, Math.max(0, v ?? 1))
export const volumeOf = (k: Key) => clampVolume(state.settings.volumes?.[k])
export const outVolume = () => clampVolume(state.settings.outVolume)
// How loud each person's shared screen sound plays here, set beside their stream; for this session only.
const streamVolumes = new Map<Key, number>()
export const streamVolumeOf = (k: Key) => streamVolumes.get(k) ?? 1
export function setStreamVolume(k: Key, v: number) {
  streamVolumes.set(k, clampVolume(v))
  const g = peers.get(k)?.sound?.gain
  if (g) g.gain.value = streamVolumeOf(k)
  notify()
}
const mic = (id: string) => navigator.mediaDevices.getUserMedia({ audio: id ? { deviceId: { exact: id } } : true })

// A connection's transceivers by role, from their order (the same on both sides): voice is the first audio, then the
// screen and camera videos, then the screen's sound. Connections with older versions have only voice and screen.
function slotsOf(pc: RTCPeerConnection) {
  const ts = pc.getTransceivers()
  const video = ts.filter((t) => t.receiver.track.kind === 'video')
  const audio = ts.filter((t) => t.receiver.track.kind === 'audio')
  return { voice: audio[0], screen: video[0], camera: video[1], sound: audio[1] }
}

async function setEncoding(sender: RTCRtpSender, e: object) {
  const p = sender.getParameters()
  if (!p.encodings?.length) return // not negotiated yet; applied again once connected
  Object.assign(p.encodings[0], e)
  await sender.setParameters(p).catch(() => {})
}

const bitrate = (pc: RTCPeerConnection) => {
  const voice = slotsOf(pc).voice
  if (voice) setEncoding(voice.sender, { maxBitrate: state.settings.audioKbps * 1000 })
}

// One AudioContext for the whole app. Each person plays through source → gain (their volume) → master (deafen)
// → output, and feeds an analyser for the speaking ring. Your own microphone only feeds an analyser.
let ctx: AudioContext | null = null
let master: GainNode | null = null
let own: Listen | null = null
let listening: ReturnType<typeof setInterval> | null = null
export const speaking = new Set<Key>() // people speaking right now, you included

function context() {
  if (!ctx) {
    ctx = new AudioContext()
    master = ctx.createGain()
    master.connect(ctx.destination)
  }
  return ctx
}
// Output device for every voice at once. AudioContext.setSinkId is not in the DOM typings yet.
const sinkTo = (id: string) => (context() as AudioContext & { setSinkId(id: string): Promise<void> }).setSinkId(id).catch(() => {})
const applyDeafen = () => master && (master.gain.value = deafened ? 0 : outVolume())

function listen(s: MediaStream): Listen {
  const source = context().createMediaStreamSource(s)
  const analyser = context().createAnalyser()
  analyser.fftSize = 512
  source.connect(analyser)
  return { source, analyser, loudAt: null }
}
function unlisten(l: Listen | null | undefined) {
  l?.source.disconnect()
  l?.analyser.disconnect()
}
// Your own level is read from a copy of the microphone, which keeps hearing you while the one sent is switched off
// (muted, or held back by mic sensitivity), so the sensitivity can open it again.
function listenOwn(s: MediaStream) {
  unlistenOwn()
  own = listen(new MediaStream(s.getAudioTracks().map((t) => t.clone())))
}
function unlistenOwn() {
  own?.source.mediaStream.getTracks().forEach((t) => t.stop())
  unlisten(own)
  own = null
}

// Chromium only feeds a remote stream to Web Audio while a media element plays it, so the element plays it muted
// and the sound itself comes out of the gain chain.
function playVoice(k: Key, p: Peer, s: MediaStream) {
  release(k, p)
  p.audio.srcObject = s
  const l = listen(s)
  const gain = context().createGain()
  gain.gain.value = volumeOf(k)
  l.source.connect(gain).connect(master!)
  p.voice = { ...l, gain }
}
function release(k: Key, p: Peer) {
  unlisten(p.voice)
  p.voice?.gain.disconnect()
  p.voice = undefined
  speaking.delete(k)
}

// A shared screen's sound: played at the sharer's volume, but never counted as them speaking.
function playSound(k: Key, p: Peer, s: MediaStream) {
  stopSound(p)
  const el = new Audio()
  el.autoplay = el.muted = true // as for voices, the element only keeps the stream flowing into Web Audio
  el.srcObject = s
  const source = context().createMediaStreamSource(s)
  const gain = context().createGain()
  gain.gain.value = streamVolumeOf(k)
  source.connect(gain).connect(master!)
  p.sound = { source, gain, el }
}
function stopSound(p: Peer) {
  p.sound?.source.disconnect()
  p.sound?.gain.disconnect()
  if (p.sound) p.sound.el.srcObject = null
  p.sound = undefined
}

// Levels are read 20 times a second; the UI re-renders only when someone starts or stops speaking.
const samplesBuf = new Float32Array(512)
function listenAll() {
  const now = performance.now()
  let changed = false
  const level = (l: Listen) => (l.analyser.getFloatTimeDomainData(samplesBuf), rms(samplesBuf))
  const check = (k: Key, l: Listen | null | undefined, v: number, allowed: boolean) => {
    let on = false
    if (l) {
      const r = hear(v, now, l.loudAt)
      l.loudAt = r.loudAt
      on = r.speaking && allowed
    }
    if (on === speaking.has(k)) return
    changed = true
    if (on) speaking.add(k)
    else speaking.delete(k)
  }
  ownLevel = own ? level(own) : 0
  const g = gate(ownLevel, now, gateAt, state.settings.micGate)
  gateAt = g.loudAt
  if (g.open !== gateOpen) (gateOpen = g.open), applyMic()
  check(state.me, own, ownLevel, sending()) // your own ring stays off whenever your microphone is not sending
  for (const [k, p] of peers) check(k, p.voice, p.voice ? level(p.voice) : 0, true)
  if (changed) notify()
}

function close(k: Key) {
  const p = peers.get(k)
  if (!p) return
  p.pc.close()
  release(k, p)
  stopSound(p)
  p.audio.srcObject = null
  peers.delete(k)
  window.api.call('relayClose', k)
}

// Ends the call with k for good: they left, went offline, or we left.
function drop(k: Key) {
  watchdogs.get(k)?.stop()
  watchdogs.delete(k)
  shares.delete(k)
  cameras.delete(k)
  for (const slot of ['screen', 'camera']) wants.delete(`${slot}:${k}`), shown.delete(`${slot}:${k}`)
  voices.delete(k)
  close(k)
}

function connect(k: Key) {
  close(k)
  const c = conv!
  const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
  const audio = new Audio()
  audio.autoplay = true
  audio.muted = true
  for (const t of stream!.getTracks()) pc.addTrack(t, stream!)
  pc.onicecandidate = (e) => e.candidate && send(c, k, { k: 'ice', c: e.candidate.toJSON() })
  const peer: Peer = { pc, audio, candidates: createCandidates(pc) }
  pc.ontrack = (e) => {
    const s = slotsOf(pc)
    if (e.transceiver === s.screen) peer.screen = new MediaStream([e.track])
    else if (e.transceiver === s.camera) peer.camera = new MediaStream([e.track])
    else if (e.transceiver === s.sound) playSound(k, peer, new MediaStream([e.track]))
    else if (e.track.kind === 'audio') playVoice(k, peer, e.streams[0] ?? new MediaStream([e.track]))
    notify()
  }
  if (!watchdogs.has(k))
    watchdogs.set(k, createWatchdog(state.me, k, { restart: () => serial(() => restart(k)), rebuild: () => (log(`rebuilding the connection to ${who(k)}`), serial(() => offer(k))) }))
  pc.onconnectionstatechange = async () => {
    if (peers.get(k) !== peer) return // a replaced connection
    log(`connection to ${who(k)}: ${pc.connectionState}`)
    watchdogs.get(k)?.update(pc.connectionState)
    if (pc.connectionState === 'connected') {
      bitrate(pc)
      sendVoice(k)
      if (screen) sendShare(k)
      if (camera) sendCamera(k)
      await applyLevel(k)
      peer.relayed = await isRelayed(pc)
      if (peer.relayed) log(`connection to ${who(k)} goes through the relay`)
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

// A connection's slots once they exist: video prefers VP9 (sharp text at low bitrates), then H.264 and VP8, and
// whatever we are already sharing goes straight in.
async function useSlots(k: Key) {
  const p = peers.get(k)
  if (!p) return
  const s = slotsOf(p.pc)
  const rank = (m: string) => ((i) => (i < 0 ? 9 : i))(['video/VP9', 'video/H264', 'video/VP8'].indexOf(m))
  const codecs = [...(RTCRtpReceiver.getCapabilities('video')?.codecs ?? [])].sort((a, b) => rank(a.mimeType) - rank(b.mimeType))
  for (const t of [s.screen, s.camera])
    try {
      t?.setCodecPreferences(codecs)
    } catch {} // the order is a preference; the default list works too
  if (screen) await s.screen?.sender.replaceTrack(screen.track)
  if (screen?.sound) await s.sound?.sender.replaceTrack(screen.sound)
  if (camera) await s.camera?.sender.replaceTrack(camera.track)
}

async function offer(k: Key) {
  if (!conv) return
  const c = conv
  const pc = connect(k)
  for (const kind of ['video', 'video', 'audio']) pc.addTransceiver(kind, { direction: 'sendrecv' }) // screen, camera, sound
  await useSlots(k)
  const id = (peers.get(k)!.offer = ++offerId)
  await local(pc, await pc.createOffer())
  send(c, k, { k: 'offer', sdp: pc.localDescription!.toJSON(), id })
}

// Finds a new route on the same connection; the other side answers without tearing anything down.
async function restart(k: Key) {
  const p = peers.get(k)
  if (!conv || !p || p.pc.signalingState === 'closed') return
  const id = (p.offer = ++offerId)
  log(`looking for a new route to ${who(k)}`)
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

// Sends one viewer what they are showing of our screen and camera: nothing, a thumbnail, or our chosen quality (see
// encodingFor). The screen's sound follows its picture, so nobody is sent sound for a screen they have hidden.
async function applyLevel(k: Key) {
  const p = peers.get(k)
  if (!p) return
  const s = slotsOf(p.pc)
  if (screen && s.screen) await setEncoding(s.screen.sender, encodingFor(want('screen', k), screen.q, streamKbps(screen.src, screen.q)))
  if (screen?.sound && s.sound) await setEncoding(s.sound.sender, { active: want('screen', k) !== 'off', maxBitrate: SOUND_KBPS * 1000 })
  if (camera && s.camera) await setEncoding(s.camera.sender, encodingFor(want('camera', k), camera.q, streamKbps(camera.src, camera.q)))
}

const describeOut = (o: Out<Source & { name: string }>) => ({
  on: true,
  name: o.src.name,
  width: widthFor(o.src, o.q.height),
  height: o.q.height,
  fps: o.q.fps,
  starved: starved >= STARVED_AFTER,
})
function sendShare(k: Key | null) {
  if (conv) send(conv, k, { k: 'share', ...(screen ? { ...describeOut(screen), sound: !!screen.sound } : { on: false }) })
}
function sendCamera(k: Key | null) {
  if (conv) send(conv, k, { k: 'camera', ...(camera ? describeOut(camera) : { on: false }) })
}

const captureLimits = (src: ScreenSource, q: Quality) => ({ width: { max: widthFor(src, q.height) }, height: { max: q.height }, frameRate: { max: q.fps } })

export const sharing = () => screen && { src: screen.src, q: screen.q, stream: screen.stream, sound: !!screen.sound }
export const filming = () => camera && { src: camera.src, q: camera.q, stream: camera.stream }

// What our other streams already send each viewer, which a new one adds to.
const sendingKbps = (besides: Slot) =>
  (screen && besides !== 'screen' ? streamKbps(screen.src, screen.q) + (screen.sound ? SOUND_KBPS : 0) : 0) +
  (camera && besides !== 'camera' ? streamKbps(camera.src, camera.q) : 0)

// Whether a new stream fits the call (see canStream), on top of what we already send. Upload is measured against
// the best-connected person in the call and remembered for a minute.
export async function checkStream(slot: Slot, src: Source, q: Quality, sound = false): Promise<Verdict> {
  const live = [...peers].filter(([, p]) => p.pc.connectionState === 'connected')
  if (!upload || Date.now() - upload.at > 60000) {
    const best = live.map(([k]) => k).sort((a, b) => (samples.get(a)?.at(-1)?.rtt ?? 1e9) - (samples.get(b)?.at(-1)?.rtt ?? 1e9))[0]
    upload = best ? { kbps: await window.api.call('probe', best).catch(() => null), at: Date.now() } : null
  }
  return canStream({
    kbps: streamKbps(src, q) + (sound ? SOUND_KBPS : 0) + sendingKbps(slot),
    viewers: live.length,
    uploadKbps: upload?.kbps ?? null,
    starved: [...shares.values(), ...cameras.values()].some((s) => s.starved),
  })
}

// Computer sound is every app's audio except Eleusinia's own (Windows only): otherwise the people in the call would
// hear themselves back. If the system cannot leave our own audio out, no sound is shared rather than an echo.
let soundRefused = false
async function capture(src: ScreenSource, q: Quality, sound: boolean) {
  await window.api.chooseScreen(src.id, sound)
  const audio = sound && ({ restrictOwnAudio: true, echoCancellation: false, noiseSuppression: false, autoGainControl: false } as MediaTrackConstraints)
  const media = await navigator.mediaDevices.getDisplayMedia({ video: captureLimits(src, q), audio })
  const track = media.getVideoTracks()[0]
  track.contentHint = q.motion ? 'motion' : 'detail'
  let heard: MediaStreamTrack | undefined = media.getAudioTracks()[0]
  soundRefused = sound && !(heard?.getSettings() as { restrictOwnAudio?: boolean } | undefined)?.restrictOwnAudio
  if (soundRefused) log('computer sound refused: this system cannot leave our own audio out')
  if (soundRefused) heard?.stop()
  if (heard) heard.contentHint = 'music'
  return { track, sound: soundRefused ? undefined : heard }
}

// Puts a captured screen (and its sound) on every connection, replacing whatever was shared before.
async function use(cap: { track: MediaStreamTrack; sound?: MediaStreamTrack }, src: ScreenSource, q: Quality) {
  const old = screen
  cap.track.onended = () => stopShare() // the shared window was closed
  screen = { track: cap.track, stream: new MediaStream([cap.track]), src, q, at: Date.now(), sound: cap.sound }
  starved = cpuBound = 0
  for (const [k, p] of peers) {
    const s = slotsOf(p.pc)
    await s.screen?.sender.replaceTrack(cap.track)
    await s.sound?.sender.replaceTrack(cap.sound ?? null)
    await applyLevel(k)
  }
  if (old) (old.track.onended = null), old.track.stop(), old.sound?.stop()
  sendShare(null)
  notify()
}

const shareWords = (src: ScreenSource, q: Quality, sound: boolean) => `a ${src.id.startsWith('window') ? 'window' : 'screen'} at ${q.height}p ${q.fps} fps${q.motion ? ' (motion)' : ''}${sound ? ' with sound' : ''}`

export async function startShare(src: ScreenSource, q: Quality, sound = false) {
  if (!conv) return
  log(`started sharing ${shareWords(src, q, sound)}`)
  const cap = await capture(src, q, sound)
  if (!conv) return cap.track.stop(), cap.sound?.stop() // the call ended meanwhile
  await use(cap, src, q)
}

// Shares another screen or window, or turns its sound on or off, without stopping: viewers keep watching.
export async function switchShare(src: ScreenSource, q: Quality, sound = false) {
  if (!screen) return
  log(`switched to sharing ${shareWords(src, q, sound)}`)
  const cap = await capture(src, q, sound)
  if (!screen) return cap.track.stop(), cap.sound?.stop() // stopped meanwhile
  await use(cap, src, q)
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
  log('stopped sharing')
  screen.track.onended = null
  screen.track.stop()
  screen.sound?.stop()
  screen = null
  soundRefused = false
  for (const p of peers.values()) {
    const s = slotsOf(p.pc)
    s.screen?.sender.replaceTrack(null)
    s.sound?.sender.replaceTrack(null)
  }
  sendShare(null)
  notify()
}

// Cameras. A camera is opened first for its preview in Camera settings, then handed over as it is; what it can
// deliver comes from the camera itself.
export async function openCamera(id: string) {
  const media = await navigator.mediaDevices.getUserMedia({ video: id ? { deviceId: { exact: id } } : true })
  const track = media.getVideoTracks()[0]
  const now = track.getSettings()
  const src: CameraSource = { id: now.deviceId ?? id, name: track.label || 'Camera', ...cameraSource(track.getCapabilities(), now) }
  return { track, src }
}
export const cameraLimits = (src: CameraSource, q: Quality) => ({ width: { ideal: widthFor(src, q.height) }, height: { ideal: q.height }, frameRate: { ideal: q.fps } })

// Puts a camera on every connection, replacing any camera in use. The streamer's quality is applied as chosen.
export async function useCamera(track: MediaStreamTrack, src: CameraSource, q: Quality) {
  if (!conv) return track.stop()
  log(`camera on at ${q.height}p ${q.fps} fps`)
  await track.applyConstraints(cameraLimits(src, q)).catch(() => {})
  track.contentHint = 'motion'
  const old = camera?.track
  track.onended = () => stopCamera() // unplugged, or the system took it away
  camera = { track, stream: new MediaStream([track]), src, q, at: Date.now() }
  starved = cpuBound = 0
  for (const [k, p] of peers) {
    await slotsOf(p.pc).camera?.sender.replaceTrack(track)
    await applyLevel(k)
  }
  if (old && old !== track) (old.onended = null), old.stop()
  sendCamera(null)
  notify()
}

export function stopCamera() {
  if (!camera) return
  log('camera off')
  camera.track.onended = null
  camera.track.stop()
  camera = null
  for (const p of peers.values()) slotsOf(p.pc).camera?.sender.replaceTrack(null)
  sendCamera(null)
  notify()
}

// What we show of someone's screen or camera; they then send only that. Unchanged levels are not resent.
export function show(k: Key, slot: Slot, level: Level) {
  const id = `${slot}:${k}`
  if (!conv || shown.get(id) === level) return
  shown.set(id, level)
  send(conv, k, { k: 'want', level, slot })
}

// Whether our stream is held back, by bandwidth (towards someone showing it full size) or by our own computer.
// Ignored while a stream ramps up after starting or changing quality.
async function checkLimits() {
  const outs = ([['screen', screen], ['camera', camera]] as const).filter(([, o]) => o && Date.now() - o.at >= RAMP_MS)
  if (!outs.length) return
  let bandwidth = false
  let cpu = false
  for (const [k, p] of peers) {
    if (p.pc.connectionState !== 'connected') continue
    for (const [slot] of outs) {
      const t = slotsOf(p.pc)[slot]
      if (!t || want(slot, k) !== 'full') continue
      ;(await t.sender.getStats()).forEach((r: any) => {
        if (r.type !== 'outbound-rtp') return
        bandwidth ||= r.qualityLimitationReason === 'bandwidth'
        cpu ||= r.qualityLimitationReason === 'cpu'
      })
    }
  }
  const was = starved >= STARVED_AFTER
  starved = bandwidth ? starved + 1 : 0
  cpuBound = cpu ? cpuBound + 1 : 0
  if (was !== starved >= STARVED_AFTER) sendShare(null), sendCamera(null)
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
    const now = signal()
    if (now.grade !== lastGrade) log(`connection ${now.grade ?? 'unknown'}; ping ${now.pings.map((p) => `${p.k ? who(p.k) : 'network'} ${Number.isFinite(p.ms) ? Math.round(p.ms) + ' ms' : 'none'}`).join(', ')}`)
    lastGrade = now.grade
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
  track.enabled = sending()
  track.onended = () => followDevices(true) // unplugged, or the system took it away
  for (const p of peers.values()) slotsOf(p.pc).voice?.sender.replaceTrack(track)
  stream.getTracks().forEach((t) => ((t.onended = null), t.stop()))
  stream = fresh
  micId = id
  listenOwn(fresh)
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
        log(`speakers moved to ${out === chosenOut ? 'the chosen device' : 'the system default'}`)
        outId = out
        await sinkTo(outId)
      }
      const m = nextDevice(chosenMic, micId, 'audioinput', list, micLabel)
      if (m !== null || micEnded) log(`microphone moved to ${(m ?? micId) === chosenMic && chosenMic ? 'the chosen device' : 'the system default'}${micEnded ? ' (it stopped)' : ''}`)
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
  const video = screen || camera
  if (video && cpuBound >= STARVED_AFTER) out.push('Your computer cannot encode your video at this quality fast enough. You can lower it in Stream settings or Camera settings.')
  if (video && starved >= STARVED_AFTER) out.push('Your connection cannot carry your video at this quality to everyone. You can lower it in Stream settings or Camera settings.')
  if (screen && soundRefused) out.push("Your computer's sound is not being shared: this system cannot leave Eleusinia's own audio out, so the call would hear itself back.")
  return out
}

export async function join(c: string) {
  leave()
  log(`joining a ${state.groups[c] ? 'group' : 'direct'} call, ${active.get(c)?.size ?? 0} already in it`)
  const list = await navigator.mediaDevices.enumerateDevices()
  micId = usable(state.settings.mic, 'audioinput', list, state.settings.micLabel)
  outId = usable(state.settings.out, 'audiooutput', list, state.settings.outLabel)
  const fresh = await mic(micId).catch(() => mic((micId = '')))
  stream = fresh
  fresh.getAudioTracks().forEach((t) => (t.onended = () => followDevices(true)))
  conv = c
  muted = deafened = false
  relayMissing = false
  await context().resume()
  await sinkTo(outId)
  applyDeafen()
  gateOpen = state.settings.micGate === undefined
  gateAt = null
  listenOwn(fresh)
  listening = setInterval(listenAll, 50)
  navigator.mediaDevices.addEventListener('devicechange', onDeviceChange)
  send(c, null, { k: 'join' })
  followDevices() // device ids are only listed once the microphone is allowed
  sampler = setInterval(measure, SAMPLE_EVERY)
  measure()
  notify()
}

export function leave() {
  if (!conv) return
  log(`left the call (${peers.size} connected)`)
  stopShare()
  stopCamera()
  send(conv, null, { k: 'leave' })
  for (const k of [...peers.keys()]) drop(k)
  navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange)
  if (sampler) clearInterval(sampler)
  sampler = null
  if (listening) clearInterval(listening)
  listening = null
  unlistenOwn()
  ownLevel = 0
  speaking.clear()
  ctx?.suspend()
  samples.clear()
  shares.clear()
  cameras.clear()
  wants.clear()
  shown.clear()
  voices.clear()
  upload = null
  stream?.getTracks().forEach((t) => ((t.onended = null), t.stop()))
  stream = null
  conv = null
  notify()
}

// With a push-to-talk key bound, the microphone only sends while it is held.
export let talking = false
export const pushToTalk = () => state.settings.hotkeys?.ptt
// With mic sensitivity set (and no push to talk), it only sends while you are louder than the level you chose.
let gateOpen = true
let gateAt: number | null = null
export let ownLevel = 0 // your microphone's level right now, for the meter in Settings
const sending = () => !muted && !deafened && (pushToTalk() ? talking : gateOpen)
const applyMic = () => stream?.getAudioTracks().forEach((t) => (t.enabled = sending()))

// A hotkey pressed anywhere, even with the app in the background. They only act during a call.
export function onHotkey(action: string, down: boolean) {
  if (action === 'ptt') {
    talking = down
    applyMic()
    return notify()
  }
  if (!down || !conv) return
  if (action === 'mute') toggleMute()
  if (action === 'deafen') toggleDeafen()
}

const sendVoice = (k: Key | null) => conv && send(conv, k, { k: 'voice', muted, deafened })

// Unmuting while deafened also undeafens, since you cannot talk without hearing the reply.
export function toggleMute() {
  if (deafened) deafened = muted = false
  else muted = !muted
  applyDeafen()
  applyMic()
  sendVoice(null)
  notify()
}

export function toggleDeafen() {
  deafened = !deafened
  applyDeafen()
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
    const reused = !!p && p.pc.signalingState !== 'closed'
    const pc: RTCPeerConnection = reused ? p.pc : connect(from)
    await describe(from, pc, d.sdp)
    // A new connection: take up the slots the offer brought, so we can send our screen, camera and sound on them too.
    if (!reused) {
      const s = slotsOf(pc)
      for (const t of [s.screen, s.camera, s.sound]) if (t) t.direction = 'sendrecv'
      await useSlots(from)
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
    if (d.on) shares.set(from, { name: String(d.name ?? '').slice(0, 100), width: n(d.width, 8192), height: n(d.height, 8192), fps: n(d.fps, 480), starved: !!d.starved, sound: !!d.sound })
    else (shares.delete(from), shown.delete(`screen:${from}`))
  } else if (d.k === 'camera') {
    const n = (v: unknown, max: number) => Math.max(0, Math.min(max, Math.round(Number(v)) || 0))
    if (d.on) cameras.set(from, { name: String(d.name ?? '').slice(0, 100), width: n(d.width, 8192), height: n(d.height, 8192), fps: n(d.fps, 480), starved: !!d.starved })
    else (cameras.delete(from), shown.delete(`camera:${from}`))
  } else if (d.k === 'voice') {
    voices.set(from, { muted: !!d.muted, deafened: !!d.deafened })
  } else if (d.k === 'want') {
    if (['off', 'thumb', 'full'].includes(d.level)) {
      wants.set(`${d.slot === 'camera' ? 'camera' : 'screen'}:${from}`, d.level)
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
  if (!b.hotkeys?.ptt) talking = false
  applyMic()
  for (const [k, p] of peers) if (p.voice) p.voice.gain.gain.value = volumeOf(k)
  applyDeafen()
  if (a.mic !== b.mic || a.out !== b.out || a.micLabel !== b.micLabel || a.outLabel !== b.outLabel) followDevices()
  notify()
}
