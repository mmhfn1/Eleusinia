// Calls on screen: the voice panel's pieces, screen sharing and camera dialogs, and the stage that shows videos.
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import { usable } from '../shared/devices'
import { type Key, type State } from '../shared/protocol'
import { type Quality, SOUND_KBPS, type Verdict, choices, defaultQuality, fitQuality, heightLabel, streamKbps } from '../shared/video'
import * as call from './call'
import { Dialog, Icon } from './ui'
import type { SourceKind } from '../shared/sources'
import { api } from './common'

const GRADE_WORDS = { good: 'good and stable', fair: 'degraded', poor: 'poor' }

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
            ? pings.map(({ k, ms }) => (
                <span key={k} className="ping-row">
                  {k ? name(k) : 'Ping'}: <b>{Number.isFinite(ms) ? `${Math.round(ms)} ms` : 'no response'}</b>
                </span>
              ))
            : 'Measuring ping…'}
        </span>
      </span>
      <span className="signal-text">Voice Connected</span>
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

export const STATE_WORDS: Record<string, string> = {
  new: 'Connecting…',
  connecting: 'Connecting…',
  connected: 'Connected',
  disconnected: 'Reconnecting…',
  failed: 'Reconnecting…', // call.ts retries until the peer leaves or goes offline
  closed: 'Disconnected',
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
      else {
        // A stream that would strain the call is warned about once; pressing again shares anyway.
        const v = verdict ?? (await call.checkStream('screen', src, q, sound))
        if (!v.ok && !verdict) return setVerdict(v)
        await call.startShare(src, q, sound)
      }
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
          {busy ? (current ? 'Applying…' : 'Checking…') : !current ? (verdict ? 'Share anyway' : 'Share') : src && src.id !== current.src.id ? 'Switch' : 'Apply'}
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
      if (!current) {
        const v = verdict ?? (await call.checkStream('camera', cam.src, q))
        if (!v.ok && !verdict) return setVerdict(v) // warned once; pressing again turns it on anyway
      }
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
        <button type="button" className="button" onClick={close}>
          Cancel
        </button>
        <button type="button" className="button primary" disabled={!cam || !q || busy} onClick={go}>
          {busy ? (current ? 'Applying…' : 'Checking…') : current ? 'Apply' : verdict ? 'Turn on anyway' : 'Turn on camera'}
        </button>
      </div>
    </Dialog>
  )
}

// volume: for a share with sound, a slider for how loud it plays here, beside the full screen button.
type ScreenProps = { stream?: MediaStream; label: string; big?: boolean; mirror?: boolean; volume?: { value: number; set: (v: number) => void; name: string } }

function Screen({ stream, label, big, mirror, volume }: ScreenProps) {
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
  return (
    <figure ref={fig} className={`screen ${big ? 'big' : ''} ${mirror ? 'mirror' : ''}`}>
      <video ref={ref} autoPlay playsInline muted onDoubleClick={big ? toggle : undefined} />
      <figcaption>{label}</figcaption>
      {big && (
        <div className="screen-controls">
          {volume && (
            <label className="screen-volume" title={`Volume of ${volume.name}'s stream: ${Math.round(volume.value * 100)}%`}>
              <Icon name="volume" size={16} />
              <input
                type="range"
                min={0}
                max={200}
                step={5}
                value={Math.round(volume.value * 100)}
                aria-label={`Volume of ${volume.name}'s stream`}
                onChange={(e) => volume.set(Number(e.target.value) / 100)}
              />
            </label>
          )}
          <button className="icon-button screen-full" aria-label={word} title={word} onClick={toggle}>
            <Icon name={full ? 'collapse' : 'expand'} size={16} />
          </button>
        </div>
      )}
    </figure>
  )
}

// Screens and cameras in this call. With a screen shared (or a video picked), one is shown large and the rest as
// thumbnails; with only cameras, they share a grid. Each person is told what we show of their screen and camera, so
// they send only that: nothing while hidden or minimised, a thumbnail, or their full stream.
type Item = { k: Key; slot: call.Slot }
const itemId = (i: Item) => `${i.slot}:${i.k}`
const GRID_FULL = 4 // up to this many cameras in the grid each get full quality; beyond it, thumbnails

export function Stage({ name, settings }: { name: (k: Key) => string; settings: () => void }) {
  const [focus, setFocus] = useState<string | null>(null)
  const [hidden, setHidden] = useState(false)
  const [away, setAway] = useState(document.hidden)
  const items: Item[] = [
    ...[...call.shares.keys()].map((k) => ({ k, slot: 'screen' as const })),
    ...[...call.cameras.keys()].map((k) => ({ k, slot: 'camera' as const })),
  ].filter((i) => call.peers.has(i.k))
  const latest = useRef(items)
  latest.current = items
  useEffect(() => {
    const on = () => setAway(document.hidden)
    document.addEventListener('visibilitychange', on)
    return () => {
      document.removeEventListener('visibilitychange', on)
      for (const i of latest.current) call.show(i.k, i.slot, 'off')
    }
  }, [])
  const mine = call.sharing()
  const cam = call.filming()
  const main = items.find((i) => itemId(i) === focus) ?? items.find((i) => i.slot === 'screen') ?? null
  const level = (i: Item) => (hidden || away ? 'off' : !main ? (items.length <= GRID_FULL ? 'full' : 'thumb') : itemId(i) === itemId(main) ? 'full' : 'thumb')
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
  const tile = (i: Item) => (
    <button key={itemId(i)} className="stage-thumb" aria-label={`Show ${label(i)} large`} onClick={() => setFocus(itemId(i))}>
      <Screen stream={media(i)} label={i.slot === 'screen' ? `${name(i.k)}'s screen` : name(i.k)} />
    </button>
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
  const watching = items.length
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
            {watching ? `${watching} ${watching === 1 ? 'video' : 'videos'} in this call` : 'Your camera is on'}
          </span>
        )}
        {mine && (
          <button className="button" onClick={settings}>
            <Icon name="screen" size={16} /> Switch screen
          </button>
        )}
        {mine && (
          <button className="button danger" onClick={call.stopShare}>
            Stop sharing
          </button>
        )}
        {focus && main && !items.some((i) => i.slot === 'screen') && (
          <button className="button subtle" onClick={() => setFocus(null)}>
            Show everyone
          </button>
        )}
        {watching > 0 && (
          <button className="button subtle" aria-pressed={hidden} onClick={() => setHidden(!hidden)}>
            {hidden ? 'Show video' : 'Hide video'}
          </button>
        )}
      </div>
      {!hidden && main && (
        <Screen
          key={itemId(main)}
          stream={media(main)}
          label={label(main)}
          big
          mirror={false}
          volume={main.slot === 'screen' && info(main).sound ? { value: call.streamVolumeOf(main.k), set: (v) => call.setStreamVolume(main.k, v), name: name(main.k) } : undefined}
        />
      )}
      {!hidden && main && (items.length > 1 || mine || cam) && (
        <div className="stage-strip">
          {items.filter((i) => itemId(i) !== itemId(main)).map(tile)}
          {ownTiles}
        </div>
      )}
      {!hidden && !main && (
        <div className="video-grid">
          {items.map(tile)}
          {mine && <Screen stream={mine.stream} label="Your screen (preview)" />}
          {cam && <Screen stream={cam.stream} label="You" mirror />}
        </div>
      )}
    </section>
  )
}
