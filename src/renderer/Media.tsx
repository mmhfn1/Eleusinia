// Calls on screen: the voice panel's pieces, screen sharing and camera dialogs, and the stage that shows videos.
import { type KeyboardEvent, type PointerEvent, type ReactNode, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { usable } from '../shared/devices'
import { type Key, type State } from '../shared/protocol'
import type { Steadiness } from '../shared/quality'
import { type Level, type Quality, SOUND_KBPS, type Verdict, choices, defaultQuality, fitQuality, heightLabel, streamKbps } from '../shared/video'
import * as call from './call'
import { Avatar, Dialog, Icon } from './ui'
import type { SourceKind } from '../shared/sources'
import { api } from './common'
import { callWords } from '../shared/reach'
import './pip.css'

const GRADE_WORDS = { good: 'good and stable', fair: 'degraded', poor: 'poor' }
// How much the ping moved over the last minute, next to the number itself.
const STEADY_WORDS: Record<Steadiness, (spread: number) => string> = {
  steady: () => 'steady',
  varies: (s) => `varies ±${s} ms`,
  unstable: (s) => `unstable ±${s} ms`,
}

// Your voice connection while in a call: a wifi sign coloured by quality, with ping on hover or focus.
export function VoiceSignal({ name }: { name: (k: Key) => string }) {
  const { grade, pings } = call.signal()
  return (
    <div className={`signal ${grade ?? 'measuring'}`}>
      <span className="info">
        <button type="button" className="signal-icon" aria-label={`Connection ${grade ? GRADE_WORDS[grade] : 'being measured'}`} aria-describedby="ping-tip">
          <Icon name="wifi" size={18} />
        </button>
        <span role="tooltip" id="ping-tip" className="tip">
          {pings.length
            ? pings.map(({ k, ms, spread, steadiness }) => (
                <span key={k} className="ping-row">
                  {k ? name(k) : 'Ping'}: <b>{Number.isFinite(ms) ? `${ms} ms` : 'no response'}</b>
                  {Number.isFinite(ms) && <span className={`ping-steady ${steadiness}`}>{STEADY_WORDS[steadiness](spread)}</span>}
                </span>
              ))
            : 'Measuring ping…'}
        </span>
      </span>
      <span className="signal-text">Voice Connected</span>
    </div>
  )
}

// The call itself, above the chat while nobody shares video: everyone in it under one pool of light, whoever is talking
// lifted and glowing. It gives way to the stage once a screen or camera is on.
// Redraws the component that calls it whenever someone starts or stops speaking.
export const useSpeaking = () => useSyncExternalStore(call.onSpeaking, call.speakingVersion)

export function Oculus({ st, name, show }: { st: State; name: (k: Key) => string; show: (k: Key, from: HTMLElement) => void }) {
  useSpeaking()
  if (call.shares.size || call.cameras.size || call.sharing() || call.filming()) return null
  const people = [st.me, ...call.peers.keys()]
  const prof = (k: Key) => (k === st.me ? st.profile : st.profiles[k])
  const state = (k: Key) => {
    const v = k === st.me ? { muted: call.muted, deafened: call.deafened } : call.voices.get(k)
    return v?.deafened ? 'Deafened' : v?.muted ? 'Muted' : call.speaking.has(k) ? 'Talking' : k === st.me ? '' : callWords(st, k, call.peers.get(k)?.pc.connectionState ?? '')
  }
  return (
    <section className="oculus" aria-label="People in the call">
      {people.map((k) => (
        <figure key={k} className={`oculus-person ${call.speaking.has(k) ? 'speaking' : ''}`}>
          <button className="oculus-who" onClick={(e) => show(k, e.currentTarget)} aria-label={`${k === st.me ? 'Your' : `${name(k)}'s`} profile`}>
            <Avatar k={k} p={prof(k) ?? { handle: '', name: '', about: '', avatar: '' }} size={call.speaking.has(k) ? 96 : 80} />
          </button>
          <figcaption>
            <span className="row-title">{k === st.me ? 'You' : name(k)}</span>
            <span className={`row-sub ${state(k) === 'Muted' || state(k) === 'Deafened' ? 'held' : state(k) === 'Talking' ? 'live' : ''}`}>{state(k)}</span>
          </figcaption>
        </figure>
      ))}
    </section>
  )
}

// A direct call you have not joined: it rings for up to 40 s (jingles.ts), and stays here to join for as long as it lasts.
export function RingBar({ conv, who, st, name, join }: { conv: string; who: Key; st: State; name: (k: Key) => string; join: (muted: boolean) => void }) {
  const [quiet, setQuiet] = useState(false)
  return (
    <div className={`ring-bar ${quiet ? '' : 'ringing'}`} role="status">
      <Avatar k={who} p={st.profiles[who] ?? { handle: '', name: '', about: '', avatar: '' }} size={44} />
      <span className="row-text">
        <span className="row-title">{name(who)} is calling you</span>
      </span>
      <button className="round" aria-label="Join with your microphone muted" title="Join muted" onClick={() => join(true)}>
        <Icon name="micOff" size={18} />
      </button>
      <button className="round primary" aria-label="Join the call" title="Join" onClick={() => join(false)}>
        <Icon name="phone" size={18} />
      </button>
      {!quiet && (
        <button className="round leave" aria-label="Silence the ringing" title="Silence" onClick={() => (call.silence(conv), setQuiet(true))}>
          <Icon name="close" size={18} />
        </button>
      )}
    </div>
  )
}

// A muted or deafened mark to the right of a name in the call; deafened wins, since it also mutes.
export function VoiceMark({ muted, deafened }: { muted?: boolean; deafened?: boolean }) {
  if (!muted && !deafened) return null
  const label = deafened ? 'Deafened' : 'Muted'
  return (
    <span className="voice-mark" title={label}>
      <Icon name={deafened ? 'headphonesOff' : 'micOff'} size={14} />
      <span className="visually-hidden">{label}</span>
    </span>
  )
}

// How loud one person plays for you, up to 200%. Saved with your settings, so it holds in every call and after a restart.
export function PersonVolume({ st, k, name }: { st: State; k: Key; name: string }) {
  const pct = Math.round(call.volumeOf(k) * 100)
  const set = (v: number) => api.call('setSettings', { volumes: { ...st.settings.volumes, [k]: v / 100 } })
  return (
    <label className="person-volume" title={`Volume for ${name}`}>
      <Icon name="volume" size={14} />
      <input type="range" min={0} max={200} step={5} value={pct} aria-label={`Volume for ${name}`} onChange={(e) => set(Number(e.target.value))} />
      <span className="person-volume-pct">{pct}%</span>
    </label>
  )
}


const mbps = (kbps: number) => (kbps / 1000).toFixed(kbps < 10000 ? 1 : 0)

// Picking a screen or window and its quality, or, while sharing, switching to another one or changing the quality.
// The streamer's choice is final: anything up to what the system can deliver. Starting a stream checks it fits the
// call (see canStream); switching or changing quality does not add a stream, so it is not checked.
const SOURCE_TABS: { kind: SourceKind; label: string; empty: string }[] = [
  { kind: 'screen', label: 'Screens', empty: 'No screens are available to share.' },
  { kind: 'window', label: 'Applications', empty: 'No application windows open' },
]

export function ShareDialog({ close }: { close: () => void }) {
  const current = call.sharing()
  const [sources, setSources] = useState<call.ScreenSource[] | null>(current ? [current.src] : null)
  // Opens on Screens, or on the tab of what is being shared when changing it.
  const [tab, setTab] = useState<SourceKind>(current?.src.kind ?? 'screen')
  const [picked, setPicked] = useState<call.ScreenSource | null>(current?.src ?? null)
  const src = picked?.kind === tab ? picked : null // a selection counts only while its tab is showing
  const [q, setQ] = useState<Quality | null>(current?.q ?? null)
  const [sound, setSound] = useState(current?.sound ?? false)
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    window.api.screens().then(setSources, () => !current && setSources([]))
  }, [])
  const viewers = [...call.peers.values()].filter((p) => p.pc.connectionState === 'connected').length
  const kbps = src && q ? streamKbps(src, q) + (sound ? SOUND_KBPS : 0) : 0
  // A stream that would strain the call is warned about as it is chosen, so one click still starts it.
  useEffect(() => {
    if (current || !src || !q) return
    let live = true
    call.checkStream('screen', src, q, sound).then((v) => live && setVerdict(v), () => {})
    return () => void (live = false)
  }, [src?.id, q?.height, q?.fps, sound])
  // A new share starts at the default; switching keeps the quality already chosen, as far as the new source allows.
  const pick = (s: call.ScreenSource) => {
    setPicked(s)
    setQ(q && current ? fitQuality(s, q) : defaultQuality(s))
    setVerdict(null)
  }
  const change = (p: Partial<Quality>) => {
    setQ({ ...q!, ...p })
    setVerdict(null)
  }

  async function go() {
    if (!src || !q) return
    setBusy(true)
    setErr('')
    try {
      if (current && (src.id !== current.src.id || sound !== current.sound)) await call.switchShare(src, q, sound)
      else if (current) await call.setQuality(q)
      else await call.startShare(src, q, sound)
      close()
    } catch (e: any) {
      setErr(`Sharing could not start: ${String(e?.message ?? e)}`)
    } finally {
      setBusy(false)
    }
  }

  const { heights, rates } = src ? choices(src) : { heights: [], rates: [] }
  const listed = sources?.filter((s) => s.kind === tab)
  // Arrow keys move between tabs (and select them), as tabs do everywhere else.
  const tabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = SOURCE_TABS.findIndex((t) => t.kind === tab)
    const to = ({ ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: SOURCE_TABS.length - 1 } as Record<string, number>)[e.key]
    if (to === undefined) return
    e.preventDefault()
    const next = SOURCE_TABS[(to + SOURCE_TABS.length) % SOURCE_TABS.length].kind
    setTab(next)
    document.getElementById(`share-tab-${next}`)?.focus()
  }
  return (
    <Dialog label={current ? 'Stream settings' : 'Share your screen'} close={close} className="share-dialog">
      <h1>{current ? 'Stream settings' : 'Share your screen'}</h1>
      {current && <p className="hint">Choose another screen or window to switch to it without stopping.</p>}
      <div className="tabs" role="tablist" aria-label="What to share" onKeyDown={tabKey}>
        {SOURCE_TABS.map((t) => (
          <button
            key={t.kind}
            id={`share-tab-${t.kind}`}
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === t.kind}
            aria-controls="share-sources"
            tabIndex={tab === t.kind ? 0 : -1}
            onClick={() => setTab(t.kind)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="sources" id="share-sources" role="tabpanel" aria-labelledby={`share-tab-${tab}`}>
        {sources === null && <p className="quiet">Looking for screens and windows…</p>}
        {listed?.length === 0 && <p className="quiet">{SOURCE_TABS.find((t) => t.kind === tab)!.empty}</p>}
        {listed?.map((s) => (
          <button key={s.id} type="button" className={`source ${src?.id === s.id ? 'chosen' : ''}`} aria-pressed={src?.id === s.id} onClick={() => pick(s)}>
            <img src={s.thumb} alt="" />
            <span>
              {current?.src.id === s.id && <b>Now sharing: </b>}
              {s.name}
            </span>
          </button>
        ))}
      </div>
      {src && q && (
        <div className="quality">
          <label className="field-label">
            Resolution
            <select value={q.height} onChange={(e) => change({ height: Number(e.target.value) })}>
              {heights.map((h) => (
                <option key={h} value={h}>
                  {heightLabel(h)}
                  {h === src.height ? ' (full size)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Frame rate
            <select value={q.fps} onChange={(e) => change({ fps: Number(e.target.value) })}>
              {rates.map((f) => (
                <option key={f} value={f}>
                  {f} fps
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Optimise for
            <select value={q.motion ? 'motion' : 'detail'} onChange={(e) => change({ motion: e.target.value === 'motion' })}>
              <option value="detail">Text and detail</option>
              <option value="motion">Motion (video, games)</option>
            </select>
          </label>
          {CAN_SHARE_SOUND && (
            <label className="check-row sound-row">
              <input type="checkbox" role="switch" checked={sound} onChange={(e) => (setSound(e.target.checked), setVerdict(null))} />
              <span>
                Share computer sound
                <span className="hint"> · everything you hear except Eleusinia, so nobody hears themselves</span>
              </span>
            </label>
          )}
          <p className="row-sub estimate">
            About {mbps(kbps)} Mbps per viewer
            {viewers > 0 && ` · about ${mbps(kbps * viewers)} Mbps of upload to ${viewers} ${viewers === 1 ? 'person' : 'people'}`}
          </p>
        </div>
      )}
      {verdict && !verdict.ok && <StreamWarning verdict={verdict} q={q!} viewers={viewers} />}
      {err && (
        <p role="alert" className="form-error">
          {err}
        </p>
      )}
      <div className="form-actions">
        <button type="button" className="button" onClick={close}>
          Cancel
        </button>
        <button type="button" className="button primary" disabled={!src || !q || busy} onClick={go}>
          {busy ? (current ? 'Applying…' : 'Starting…') : !current ? (verdict && !verdict.ok ? 'Share anyway' : 'Share') : src && src.id !== current.src.id ? 'Switch' : 'Apply'}
        </button>
      </div>
    </Dialog>
  )
}

const CAN_SHARE_SOUND = navigator.userAgent.includes('Windows') // computer sound can only be captured on Windows

// Why a stream cannot start: the soft cap (see canStream).
// The soft cap only warns: the streamer has the final say, and can start anyway.
function StreamWarning({ verdict, q, viewers }: { verdict: Verdict; q: Quality; viewers: number }) {
  if (verdict.ok) return null
  return (
    <p role="alert" className="form-error">
      {verdict.reason === 'upload'
        ? `Streaming now will likely lower the quality of the call for others. Your upload is about ${mbps(verdict.uploadKbps)} Mbps, and ${heightLabel(q.height)} at ${q.fps} fps to ${viewers} ${viewers === 1 ? 'person' : 'people'} needs about ${mbps(verdict.needKbps)} Mbps along with anything you already send. You can choose a lower quality, or go ahead anyway.`
        : 'Someone already streaming is short of bandwidth, so another stream will likely lower the quality of the call for everyone. You can go ahead anyway.'}
    </p>
  )
}

// Choosing a camera and its quality, with a preview. Like a stream, the camera starts at 720p and 30 fps, goes as high
// as the camera allows, and the choice is final; turning it on checks it fits the call.
export function CameraDialog({ st, close }: { st: State; close: () => void }) {
  const current = call.filming()
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [cam, setCam] = useState<{ track: MediaStreamTrack; src: call.CameraSource } | null>(null)
  const [q, setQ] = useState<Quality | null>(current?.q ?? null)
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const handed = useRef(false) // a preview handed to the call keeps running after the dialog closes
  const preview = useRef<MediaStreamTrack | null>(null)
  const closed = useRef(false)
  const viewers = [...call.peers.values()].filter((p) => p.pc.connectionState === 'connected').length
  useEffect(() => {
    if (current || !cam || !q) return
    let live = true
    call.checkStream('camera', cam.src, q).then((v) => live && setVerdict(v), () => {})
    return () => void (live = false)
  }, [cam?.src.id, q?.height, q?.fps])

  // Opens a camera for the preview; the one in use is shown as it is.
  async function open(id: string) {
    setErr('')
    setVerdict(null)
    try {
      const c = await call.openCamera(id)
      if (closed.current) return c.track.stop() // the dialog closed while it was opening; never leave a camera on
      preview.current?.stop()
      preview.current = c.track
      setCam(c)
      setQ((old) => (old ? fitQuality(c.src, old) : defaultQuality(c.src)))
      api.call('setSettings', { cam: c.src.id, camLabel: c.track.label })
    } catch (e: any) {
      setErr(`The camera could not be opened: ${String(e?.message ?? e)}`)
    }
  }
  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then(async (list) => {
      setDevices(list.filter((d) => d.kind === 'videoinput'))
      if (current) setCam({ track: current.stream.getVideoTracks()[0], src: current.src })
      else await open(usable(st.settings.cam ?? '', 'videoinput', list, st.settings.camLabel))
    })
    return () => {
      closed.current = true
      if (!handed.current) preview.current?.stop()
    }
  }, [])
  // The preview follows the chosen quality, so what you see is what is sent.
  useEffect(() => {
    if (cam && q && !current) cam.track.applyConstraints(call.cameraLimits(cam.src, q)).catch(() => {})
  }, [cam, q])

  async function go() {
    if (!cam || !q) return
    setBusy(true)
    setErr('')
    try {
      const switching = !!current && cam.src.id !== current.src.id
      handed.current = true
      await call.useCamera(cam.track, cam.src, q)
      if (switching) preview.current = null
      close()
    } catch (e: any) {
      handed.current = false
      setErr(`The camera could not start: ${String(e?.message ?? e)}`)
    } finally {
      setBusy(false)
    }
  }

  const { heights, rates } = cam ? choices(cam.src) : { heights: [], rates: [] }
  const kbps = cam && q ? streamKbps(cam.src, q) : 0
  const shown = useMemo(() => cam && new MediaStream([cam.track]), [cam]) ?? undefined
  return (
    <Dialog label="Camera settings" close={close} className="share-dialog">
      <h1>Camera settings</h1>
      <div className="camera-preview">
        <Screen stream={shown} label={cam?.src.name ?? 'Opening camera…'} mirror />
      </div>
      <div className="quality">
        <label className="field-label">
          Camera
          <select value={cam?.src.id ?? ''} onChange={(e) => open(e.target.value)}>
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || 'Camera'}
              </option>
            ))}
          </select>
        </label>
        {q && (
          <>
            <label className="field-label">
              Resolution
              <select value={q.height} onChange={(e) => (setQ({ ...q, height: Number(e.target.value) }), setVerdict(null))}>
                {heights.map((h) => (
                  <option key={h} value={h}>
                    {heightLabel(h)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Frame rate
              <select value={q.fps} onChange={(e) => (setQ({ ...q, fps: Number(e.target.value) }), setVerdict(null))}>
                {rates.map((f) => (
                  <option key={f} value={f}>
                    {f} fps
                  </option>
                ))}
              </select>
            </label>
            <p className="row-sub estimate">
              About {mbps(kbps)} Mbps per viewer
              {viewers > 0 && ` · about ${mbps(kbps * viewers)} Mbps of upload to ${viewers} ${viewers === 1 ? 'person' : 'people'}`}
            </p>
          </>
        )}
      </div>
      {verdict && q && <StreamWarning verdict={verdict} q={q} viewers={viewers} />}
      {err && (
        <p role="alert" className="form-error">
          {err}
        </p>
      )}
      <div className="form-actions">
        {current && (
          <button type="button" className="button danger" onClick={() => (call.stopCamera(), close())}>
            Turn off camera
          </button>
        )}
        <button type="button" className="button" onClick={close}>
          Cancel
        </button>
        <button type="button" className="button primary" disabled={!cam || !q || busy} onClick={go}>
          {busy ? (current ? 'Applying…' : 'Starting…') : current ? 'Apply' : verdict && !verdict.ok ? 'Turn on anyway' : 'Turn on camera'}
        </button>
      </div>
    </Dialog>
  )
}

// volume: for a share with sound, a slider for how loud it plays here, beside the full screen button.
type ScreenProps = { stream?: MediaStream; label: string; big?: boolean; mirror?: boolean; volume?: { value: number; set: (v: number) => void; name: string }; children?: ReactNode }

// children: drawn inside the figure, over the bottom of the video (the people row), so they stay in full screen.
function Screen({ stream, label, big, mirror, volume, children }: ScreenProps) {
  const ref = useRef<HTMLVideoElement>(null)
  const fig = useRef<HTMLElement>(null)
  // Follows the document rather than the button, so leaving full screen any other way (Esc, F11) shows up too.
  const [full, setFull] = useState(false)
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream ?? null
  }, [stream])
  useEffect(() => {
    const on = () => setFull(!!fig.current && document.fullscreenElement === fig.current)
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])
  // Asks the document, not the state: the state only catches up once fullscreenchange has fired.
  const toggle = () => (document.fullscreenElement === fig.current ? document.exitFullscreen() : fig.current?.requestFullscreen())?.catch(() => {})
  const word = full ? 'Exit full screen' : 'Full screen'
  // The title and controls of the large view fade 1 s after the last mouse move, click or key press over it
  const unmuted = useRef(1) // the volume to go back to when unmuting
  const [idle, setIdle] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const wake = () => {
    setIdle(false)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setIdle(true), 1000)
  }
  useEffect(() => {
    if (big) wake()
    return () => clearTimeout(timer.current)
  }, [big])
  return (
    <figure
      ref={fig}
      className={`screen ${big ? 'big' : ''} ${mirror ? 'mirror' : ''} ${big && idle ? 'idle' : ''}`}
      onPointerMove={big ? wake : undefined}
      onPointerDown={big ? wake : undefined}
      onKeyDown={big ? wake : undefined}
    >
      <video ref={ref} autoPlay playsInline muted onDoubleClick={big ? toggle : undefined} />
      <figcaption>{label}</figcaption>
      {children}
      {big && (
        <div className="screen-controls">
          {volume && (
            <div className="screen-volume" title={`Volume of ${volume.name}'s stream: ${Math.round(volume.value * 100)}%`}>
              <button
                className="icon-button"
                aria-label={volume.value ? `Mute ${volume.name}'s stream` : `Unmute ${volume.name}'s stream`}
                aria-pressed={!volume.value}
                onClick={() => (volume.value ? ((unmuted.current = volume.value), volume.set(0)) : volume.set(unmuted.current))}
              >
                <Icon name={volume.value ? 'volume' : 'volumeOff'} size={16} />
              </button>
              <input
                type="range"
                min={0}
                max={200}
                step={5}
                value={Math.round(volume.value * 100)}
                aria-label={`Volume of ${volume.name}'s stream`}
                onChange={(e) => volume.set(Number(e.target.value) / 100)}
              />
            </div>
          )}
          <button className="icon-button screen-full" aria-label={word} title={word} onClick={toggle}>
            <Icon name={full ? 'collapse' : 'expand'} size={16} />
          </button>
        </div>
      )}
    </figure>
  )
}

// A shared screen nobody here has joined: where its video would be, who shares what, and Join stream.
function StreamInvite({ label, big, preview, join }: { label: string; big?: boolean; preview?: string; join: () => void }) {
  return (
    <figure className={`screen invite ${big ? 'big' : ''}`}>
      {preview && <img className="invite-preview" src={preview} alt="" />}
      <div className="invite-body">
        <Icon name="screen" size={big ? 32 : 20} />
        <button className="button primary" onClick={join}>
          Join stream
        </button>
      </div>
      <figcaption>{label}</figcaption>
    </figure>
  )
}

// Screens and cameras in this call. Shared screens are joined, one at a time, as on Discord; the others wait as Join
// stream tiles, and send nothing. With a stream joined (or a video picked), one is shown large and the rest as
// thumbnails; with only cameras, they share a grid. Each person is told what we show of their screen and camera, so
// they send only that: nothing for a stream we have not joined, sound only while hidden or minimised, a thumbnail, or
// their full stream.
type Item = { k: Key; slot: call.Slot }
const itemId = (i: Item) => `${i.slot}:${i.k}`
const GRID_FULL = 4 // up to this many cameras in the grid each get full quality; beyond it, thumbnails

const PEOPLE_ROW = 'people-row-hidden' // remembered per computer: whether the people row under a stream is folded away

// How many Stages are showing (one while the call's conversation is open), so the floating player knows to step aside.
let stages = 0
const stageWatchers = new Set<() => void>()
const stagesChanged = () => stageWatchers.forEach((f) => f())
const useStages = () => useSyncExternalStore((f) => (stageWatchers.add(f), () => void stageWatchers.delete(f)), () => stages)

export function Stage({ st, name, settings }: { st: State; name: (k: Key) => string; settings: () => void }) {
  useSpeaking()
  const [focus, setFocus] = useState<string | null>(null)
  const [hidden, setHidden] = useState(false)
  const [rowHidden, setRowHidden] = useState(() => {
    try {
      return localStorage.getItem(PEOPLE_ROW) === '1'
    } catch {
      return false
    }
  })
  const foldRow = (v: boolean) => {
    setRowHidden(v)
    try {
      localStorage.setItem(PEOPLE_ROW, v ? '1' : '0')
    } catch {}
  }
  const [away, setAway] = useState(document.hidden)
  const items: Item[] = [
    ...[...call.shares.keys()].map((k) => ({ k, slot: 'screen' as const })),
    ...[...call.cameras.keys()].map((k) => ({ k, slot: 'camera' as const })),
  ].filter((i) => call.peers.has(i.k) && !call.noVideo(i.k))
  const latest = useRef(items)
  latest.current = items
  useEffect(() => {
    const on = () => setAway(document.hidden)
    document.addEventListener('visibilitychange', on)
    stages++
    stagesChanged()
    return () => {
      document.removeEventListener('visibilitychange', on)
      // The stream we watch plays on in the floating player (Pip); everything else stops
      for (const i of latest.current) if (i.slot !== 'screen' || i.k !== call.watched) call.show(i.k, i.slot, 'off')
      stages--
      stagesChanged()
    }
  }, [])
  const mine = call.sharing()
  const cam = call.filming()
  // The stream we joined, while it lasts (call.ts forgets one that ended, so its next share starts unjoined again)
  const watching = call.watched && call.shares.has(call.watched) && !call.noVideo(call.watched) ? call.watched : null
  const join = (k: Key) => (call.watch(k), setFocus(null))
  const live = (i: Item) => i.slot === 'camera' || i.k === watching
  const main = items.find((i) => itemId(i) === focus) ?? items.find((i) => i.slot === 'screen' && i.k === watching) ?? items.find((i) => i.slot === 'screen') ?? null
  // A joined stream, or our own share with nothing else large, fills the stage with the people row along its bottom.
  const theater = !!main && main.slot === 'screen' && live(main)
  const ownBig = !main && !!mine
  const row = theater || ownBig
  const level = (i: Item): Level => {
    if (!live(i)) return 'off'
    if (hidden || away) return i.slot === 'screen' ? 'audio' : 'off'
    if (row && i.slot === 'camera') return rowHidden ? 'off' : 'thumb' // a folded row sends no cameras
    return !main ? (items.length <= GRID_FULL ? 'full' : 'thumb') : itemId(i) === itemId(main) ? 'full' : 'thumb'
  }
  useEffect(() => {
    for (const i of items) call.show(i.k, i.slot, level(i))
  })
  if (!items.length && !mine && !cam) return null

  const info = (i: Item) => (i.slot === 'screen' ? call.shares : call.cameras).get(i.k)!
  const media = (i: Item) => call.peers.get(i.k)?.[i.slot]
  const label = (i: Item) =>
    i.slot === 'screen'
      ? `${name(i.k)}: ${info(i).name}${info(i).sound ? ' · with sound' : ''} · ${heightLabel(info(i).height)}, ${info(i).fps} fps`
      : name(i.k)
  const tile = (i: Item) =>
    live(i) ? (
      <button key={itemId(i)} className="stage-thumb" aria-label={`Show ${label(i)} large`} onClick={() => setFocus(itemId(i))}>
        <Screen stream={media(i)} label={i.slot === 'screen' ? `${name(i.k)}'s screen` : name(i.k)} />
      </button>
    ) : (
      <div key={itemId(i)} className="stage-thumb">
        <StreamInvite label={`${name(i.k)}'s screen`} preview={call.shares.get(i.k)?.preview} join={() => join(i.k)} />
      </div>
    )
  const ownTiles = (
    <>
      {mine && (
        <div className="stage-thumb own">
          <Screen stream={mine.stream} label="Your screen" />
        </div>
      )}
      {cam && (
        <div className="stage-thumb own">
          <Screen stream={cam.stream} label="You" mirror />
        </div>
      )}
    </>
  )
  // Everyone in the call, us last: their camera when it is on, otherwise their picture with the speaking ring.
  const person = (k: Key) => {
    const own = k === st.me
    const stream = own ? cam?.stream : call.cameras.has(k) ? media({ k, slot: 'camera' }) : undefined
    return (
      <div key={k} className={`person-tile ${call.speaking.has(k) ? 'speaking' : ''}`}>
        {stream ? <Screen stream={stream} label={own ? 'You' : name(k)} mirror={own} /> : <Avatar k={k} p={(own ? st.profile : st.profiles[k]) ?? { handle: '', name: '', about: '', avatar: '' }} size={34} />}
        {!stream && <span className="person-name">{own ? 'You' : name(k)}</span>}
      </div>
    )
  }
  const people = (
    <div className={`people-row ${rowHidden ? 'folded' : ''}`}>
      <button className="people-toggle" aria-expanded={!rowHidden} aria-label={rowHidden ? 'Show the people in the call' : 'Hide the people in the call'} onClick={() => foldRow(!rowHidden)}>
        <Icon name="chevron" size={14} />
      </button>
      {!rowHidden && (
        <div className="people-tiles">
          {[...call.peers.keys()].map(person)}
          {person(st.me)}
        </div>
      )}
    </div>
  )
  const others = items.filter((i) => i.slot === 'screen' && (!main || itemId(i) !== itemId(main))) // other shares, beside the stage
  const count = items.length
  return (
    <section className={`stage ${hidden ? 'collapsed' : ''}`} aria-label="Shared screens and cameras">
      <div className="stage-bar">
        {mine ? (
          <span className="sharing-badge">
            <span className="live-dot" aria-hidden="true" /> You are sharing <b>{mine.src.name}</b>
            {mine.sound && ' with sound'} · {heightLabel(mine.q.height)}, {mine.q.fps} fps
          </span>
        ) : (
          <span className="row-sub">
            {count ? `${count} ${count === 1 ? 'video' : 'videos'} in this call` : 'Your camera is on'}
          </span>
        )}
        {mine && (
          <button className="button" onClick={settings}>
            <Icon name="screen" size={16} /> Switch screen
          </button>
        )}
        {mine && (
          <button className="button danger" onClick={() => call.stopShare()}>
            Stop sharing
          </button>
        )}
        {cam && (
          <button className="button" onClick={call.stopCamera}>
            <Icon name="cameraOff" size={16} /> Turn off camera
          </button>
        )}
        {focus && main && !items.some((i) => i.slot === 'screen') && (
          <button className="button subtle" onClick={() => setFocus(null)}>
            Show everyone
          </button>
        )}
        {watching && (
          <button className="button subtle" onClick={() => call.watch(null)}>
            Leave stream
          </button>
        )}
        {count > 0 && (
          <button className="button subtle" aria-pressed={hidden} onClick={() => setHidden(!hidden)}>
            {hidden ? 'Show video' : 'Hide video'}
          </button>
        )}
      </div>
      {!hidden && main && !live(main) && <StreamInvite key={itemId(main)} big label={label(main)} preview={call.shares.get(main.k)?.preview} join={() => join(main.k)} />}
      {!hidden && main && live(main) && (
        <Screen
          key={itemId(main)}
          stream={media(main)}
          label={label(main)}
          big
          mirror={false}
          volume={main.slot === 'screen' && info(main).sound ? { value: call.streamVolumeOf(main.k), set: (v) => call.setStreamVolume(main.k, v), name: name(main.k) } : undefined}
        >
          {theater && people}
        </Screen>
      )}
      {!hidden && ownBig && (
        <Screen stream={mine!.stream} label="Your screen" big>
          {people}
        </Screen>
      )}
      {!hidden && row && others.length > 0 && <div className="stage-strip">{others.map(tile)}</div>}
      {!hidden && main && !theater && (items.length > 1 || mine || cam) && (
        <div className="stage-strip">
          {items.filter((i) => itemId(i) !== itemId(main)).map(tile)}
          {ownTiles}
        </div>
      )}
      {!hidden && !main && !ownBig && (
        <div className="video-grid">
          {items.map(tile)}
          {mine && <Screen stream={mine.stream} label="Your screen (preview)" />}
          {cam && <Screen stream={cam.stream} label="You" mirror />}
        </div>
      )}
    </section>
  )
}

// The floating player (picture in picture): the stream we watch, carried into other conversations. Shown only while
// no Stage is (the call's conversation is closed); dragged by any part, it settles in the nearest corner of the area
// it is placed in, remembered per computer. It keeps asking for the stream as the Stage did: full, sound only while
// the window is hidden.
const PIP_CORNER = 'pip-corner'
type Corner = 'br' | 'bl' | 'tr' | 'tl'
export function Pip({ st, name, back }: { st: State; name: (k: Key) => string; back: () => void }) {
  const open = useStages() > 0
  const k = call.watched
  const share = k ? call.shares.get(k) : undefined
  const on = !open && !!k && !!share && !call.noVideo(k)
  const [away, setAway] = useState(document.hidden)
  const [corner, setCorner] = useState<Corner>(() => {
    try {
      return (['br', 'bl', 'tr', 'tl'] as const).find((c) => c === localStorage.getItem(PIP_CORNER)) ?? 'br'
    } catch {
      return 'br'
    }
  })
  const [drag, setDrag] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null)
  const unmuted = useRef(1)
  useEffect(() => {
    const vis = () => setAway(document.hidden)
    document.addEventListener('visibilitychange', vis)
    return () => document.removeEventListener('visibilitychange', vis)
  }, [])
  useEffect(() => {
    if (on) call.show(k!, 'screen', away ? 'audio' : 'full')
  })
  if (!on || !k || !share) return null
  const [sid, cid] = (call.conv ?? '').split('.')
  const where = st.servers?.[sid]?.channels.find((c) => c.id === cid)?.name ?? st.groups[call.conv ?? '']?.name
  const box = (e: PointerEvent<HTMLElement>) => ({ el: e.currentTarget.getBoundingClientRect(), area: (e.currentTarget.offsetParent ?? document.body).getBoundingClientRect() })
  const down = (e: PointerEvent<HTMLElement>) => {
    if ((e.target as Element).closest('button, input')) return
    const { el, area } = box(e)
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ x: el.left - area.left, y: el.top - area.top, dx: e.clientX - el.left, dy: e.clientY - el.top })
  }
  const move = (e: PointerEvent<HTMLElement>) => {
    if (!drag) return
    const { el, area } = box(e)
    const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v))
    setDrag({ ...drag, x: clamp(e.clientX - area.left - drag.dx, area.width - el.width), y: clamp(e.clientY - area.top - drag.dy, area.height - el.height) })
  }
  const up = (e: PointerEvent<HTMLElement>) => {
    if (!drag) return
    const { el, area } = box(e)
    const c = `${el.top + el.height / 2 - area.top > area.height / 2 ? 'b' : 't'}${el.left + el.width / 2 - area.left > area.width / 2 ? 'r' : 'l'}` as Corner
    setDrag(null)
    setCorner(c)
    try {
      localStorage.setItem(PIP_CORNER, c)
    } catch {}
  }
  const leave = () => (call.show(k, 'screen', 'off'), call.watch(null))
  // shortcut: finds the Stage's large view by its class once Back has opened it; pass a ref through if this grows
  const expand = () => (back(), setTimeout(() => document.querySelector<HTMLElement>('.stage .screen.big')?.requestFullscreen().catch(() => {}), 0))
  const vol = call.streamVolumeOf(k)
  const mute = vol ? `Mute ${name(k)}'s stream` : `Unmute ${name(k)}'s stream`
  return (
    <div
      className={`pip ${drag ? 'dragging' : corner}`}
      style={drag ? { left: drag.x, top: drag.y } : undefined}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      role="region"
      aria-label={`${name(k)}'s stream, picture in picture`}
    >
      <Screen stream={call.peers.get(k)?.screen} label={`${name(k)}${where ? ` · ${where}` : ''}`}>
        <span className="pip-grip" aria-hidden="true">
          <Icon name="grip" size={14} />
        </span>
        <div className="screen-controls">
          <button className="button screen-full pip-back" onClick={back}>
            <Icon name="back" size={14} /> Back to call
          </button>
          {share.sound && (
            <button className="icon-button screen-full" aria-label={mute} title={mute} aria-pressed={!vol} onClick={() => (vol ? ((unmuted.current = vol), call.setStreamVolume(k, 0)) : call.setStreamVolume(k, unmuted.current))}>
              <Icon name={vol ? 'volume' : 'volumeOff'} size={16} />
            </button>
          )}
          <button className="icon-button screen-full" aria-label="Leave stream" title="Leave stream" onClick={leave}>
            <Icon name="close" size={16} />
          </button>
          <button className="icon-button screen-full" aria-label="Expand" title="Expand" onClick={expand}>
            <Icon name="expand" size={16} />
          </button>
        </div>
      </Screen>
    </div>
  )
}
