// The Settings dialog and what opens from it: audio, hotkeys, general options, problem reports and account deletion.
import { type FormEvent, useEffect, useReducer, useState } from 'react'
import { usable } from '../shared/devices'
import { type Action, type Hotkey, sameKeys } from '../shared/hotkeys'
import { type Area, type Diag, type Kind, type Meta, BUILD, cleanReport, describe } from '../shared/reports'
import { GATE_DB, dbOf } from '../shared/speaking'
import { DEFAULT_CACHE_MB, sizeLabel } from '../shared/media'
import { type Profile, type State } from '../shared/protocol'
import * as call from './call'
import { Avatar, Dialog, Icon, Info } from './ui'
import { NOBODY, api, labelOf } from './common'
import { ActivitySettingsSection } from './Activity'

// Microphone, speakers and voice quality, in Settings.
function AudioSettings({ st }: { st: State }) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then(setDevices)
  }, [])
  const set = (p: Partial<State['settings']>) => api.call('setSettings', p)
  // The label is saved too, so the device is found again if its id changes.
  const choose = (field: 'mic' | 'out', id: string) =>
    set({ [field]: id, [`${field}Label`]: devices.find((d) => d.deviceId === id)?.label ?? '' })
  const pick = (kind: string, label: string, field: 'mic' | 'out') => (
    <label className="field-label">
      {label}
      <select value={usable(st.settings[field], kind, devices, st.settings[`${field}Label`]) || st.settings[field]} onChange={(e) => choose(field, e.target.value)}>
        <option value="">System default</option>
        {devices
          .filter((d) => d.kind === kind && d.deviceId !== 'default')
          .map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || d.deviceId.slice(0, 8)}
            </option>
          ))}
      </select>
    </label>
  )
  return (
    <div className="audio-settings">
      {pick('audiooutput', 'Speakers', 'out')}
      <div className="setting">
        <label htmlFor="out-volume">
          Master volume <b>{Math.round(call.outVolume() * 100)}%</b>
        </label>
        <input id="out-volume" type="range" min={0} max={200} step={5} value={Math.round(call.outVolume() * 100)} onChange={(e) => set({ outVolume: Number(e.target.value) / 100 })} />
        <div className="range-ends" aria-hidden="true">
          <span>0%</span>
          <span>200%</span>
        </div>
      </div>
      <div className="setting">
        <label htmlFor="sound-volume">
          Sound volume <b>{Math.round(call.soundVolume() * 100)}%</b>
        </label>
        <input id="sound-volume" type="range" min={0} max={100} step={5} value={Math.round(call.soundVolume() * 100)} onChange={(e) => set({ soundVolume: Number(e.target.value) / 100 })} />
        <div className="range-ends" aria-hidden="true">
          <span>Off</span>
          <span>100%</span>
        </div>
      </div>
      {pick('audioinput', 'Microphone', 'mic')}
      <div className="setting">
        <label className="check-row">
          <input type="checkbox" role="switch" checked={st.settings.noiseSuppression !== false} onChange={(e) => set({ noiseSuppression: e.target.checked })} />
          <span>Noise suppression</span>
        </label>
        <Info id="noise-tip">
          Takes background noise out of your microphone before anyone hears it: taps, keyboards, fans, traffic and hum. It is gentle, so your voice
          stays natural; voices in the room are speech, so it lets them through. Mic sensitivity helps with those.
          <br />
          It runs on your computer and uses very little of it.
        </Info>
      </div>
      <MicSensitivity st={st} set={set} />
      <div className="setting">
        <label htmlFor="bitrate">
          Voice bitrate <b>{st.settings.audioKbps} kbps</b>
        </label>
        <Info id="bitrate-tip">
          This is the quality other people hear from you.
          <br />
          <b>Higher</b> (64 kbps and up): fuller, clearer voice, good enough for music. Uses more upload: you send a separate copy to each person in the
          call, so 64 kbps with 5 others is about 320 kbps.
          <br />
          <b>Lower</b> (16 to 24 kbps): less data and steadier on weak or mobile connections, but your voice sounds thinner.
          <br />
          32 kbps is plenty for normal speech.
        </Info>
        <input id="bitrate" type="range" min={8} max={256} step={8} value={st.settings.audioKbps} onChange={(e) => set({ audioKbps: Number(e.target.value) })} />
        <div className="range-ends" aria-hidden="true">
          <span>8</span>
          <span>256 kbps</span>
        </div>
      </div>
    </div>
  )
}

// Mic sensitivity, with your live level against it while in a call (the meter reads the call's own analyser, so
// Settings never opens the microphone by itself).
function MicSensitivity({ st, set }: { st: State; set: (p: Partial<State['settings']>) => void }) {
  const db = st.settings.micGate
  const on = db !== undefined
  const [, tick] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    const t = setInterval(tick, 100)
    return () => clearInterval(t)
  }, [])
  const at = (v: number) => `${Math.max(0, Math.min(100, ((v - GATE_DB.min) / (GATE_DB.max - GATE_DB.min)) * 100))}%`
  const level = dbOf(call.ownLevel)
  return (
    <div className="setting mic-gate">
      <label htmlFor="mic-gate">
        Mic sensitivity <b>{on ? `${db} dB` : 'Off'}</b>
      </label>
      <Info id="mic-gate-tip">
        With this on, your microphone only sends while you are louder than the level you set, so keyboard, fan and room noise stay out between
        words.
        <br />
        <b>Left</b>: picks up quieter speech, and more noise. <b>Right</b>: you need to speak up, and less noise gets through.
        <br />
        Push to talk, when set, takes over from this.
      </Info>
      <label className="check-row">
        <input type="checkbox" role="switch" checked={on} onChange={(e) => set({ micGate: e.target.checked ? GATE_DB.initial : undefined })} />
        <span>Only send while I am speaking</span>
      </label>
      <input
        id="mic-gate"
        type="range"
        min={GATE_DB.min}
        max={GATE_DB.max}
        step={1}
        value={db ?? GATE_DB.initial}
        disabled={!on}
        onChange={(e) => set({ micGate: Number(e.target.value) })}
      />
      <div className="mic-meter" aria-hidden="true">
        {call.conv ? <span className={`mic-meter-level ${on && level > (db ?? 0) ? 'open' : ''}`} style={{ width: at(level) }} /> : null}
        {on && <span className="mic-meter-mark" style={{ left: at(db) }} />}
      </div>
      <span className="range-ends">
        <span>{call.conv ? 'Your level, live' : 'Join a call to see your level here'}</span>
        <span>Louder</span>
      </span>
    </div>
  )
}

const HOTKEYS: { action: Action; name: string }[] = [
  { action: 'mute', name: 'Mute' },
  { action: 'deafen', name: 'Deafen' },
  { action: 'ptt', name: 'Push to talk' },
]

// Shortcuts for mute, deafen and push to talk, none bound until the user sets one. They work even while
// Eleusinia is in the background or minimised.
function Hotkeys({ st }: { st: State }) {
  const [recording, setRecording] = useState<Action | null>(null)
  const [err, setErr] = useState('')
  const bound = st.settings.hotkeys ?? {}
  useEffect(() => () => void window.api.stopRecording(), []) // closing Settings mid-recording
  const save = (action: Action, h: Hotkey | undefined) => {
    const next = { ...bound }
    if (h) next[action] = h
    else delete next[action]
    return api.call('setSettings', { hotkeys: next })
  }
  async function record(action: Action) {
    setErr('')
    setRecording(action)
    const h = await window.api.recordHotkey()
    setRecording(null)
    if (!h) return
    const taken = HOTKEYS.find((x) => x.action !== action && bound[x.action] && sameKeys(bound[x.action]!.keys, h.keys))
    if (taken) return setErr(`${h.label} is already the hotkey for ${taken.name}.`)
    await save(action, h)
  }
  return (
    <div className="hotkeys">
      {HOTKEYS.map(({ action, name }) => (
        <div className="hotkey" key={action}>
          <span className="row-text">
            <span className="row-title">{name}</span>
          </span>
          <kbd className={bound[action] ? '' : 'unset'} aria-live="polite">
            {recording === action ? 'Press keys… (Esc to cancel)' : (bound[action]?.label ?? 'Not set')}
          </kbd>
          <button className="button" disabled={!!recording} onClick={() => record(action)}>
            {bound[action] ? 'Change' : 'Set'}
          </button>
          {bound[action] && (
            <button className="button subtle" disabled={!!recording} onClick={() => save(action, undefined)} aria-label={`Clear the ${name} hotkey`}>
              Clear
            </button>
          )}
        </div>
      ))}
      {err && (
        <p role="alert" className="form-error">
          {err}
        </p>
      )}
    </div>
  )
}

export function SettingsDialog({ st, close, edit, remove }: { st: State; close: () => void; edit: () => void; remove: () => void }) {
  return (
    <Dialog label="Settings" close={close} className="settings-dialog">
      <h1>Settings</h1>
      <section className="settings-section">
        <h2>Profile</h2>
        <div className="settings-row">
          <Avatar k={st.me} p={st.profile} size={40} />
          <span className="row-text">
            <span className="row-title">{st.profile.name}</span>
            <span className="row-sub">{st.profile.handle}</span>
          </span>
          <button
            className="button"
            onClick={() => {
              close()
              edit()
            }}
          >
            Edit profile
          </button>
        </div>
      </section>
      <section className="settings-section">
        <h2>Audio devices and quality</h2>
        <AudioSettings st={st} />
      </section>
      <section className="settings-section">
        <h2>Hotkeys</h2>
        <Hotkeys st={st} />
        {WINDOWS && <RunAsAdmin />}
      </section>
      <section className="settings-section">
        <h2>General</h2>
        <label className="check-row">
          <input type="checkbox" role="switch" checked={st.settings.closeToTray !== false} onChange={(e) => api.call('setSettings', { closeToTray: e.target.checked })} />
          <span>
            Minimize to the system tray when the window is closed
          </span>
        </label>
        <label className="check-row">
          <input type="checkbox" role="switch" checked={!!st.settings.relay} onChange={(e) => api.call('setSettings', { relay: e.target.checked })} />
          <span>
            Connect through mutual friends when a direct connection fails (experimental). They can see when you talk, never
            what you say. Voice, text and pictures only
          </span>
        </label>
        <label className="check-row">
          <input type="checkbox" role="switch" checked={!!st.settings.suggest} onChange={(e) => api.call('setSettings', { suggest: e.target.checked })} />
          <span>
            Suggest me to people typing the start of my username. Anyone can then see when you are online; with this off
            you are found only by your exact friend ID
          </span>
        </label>
      </section>
      <section className="settings-section">
        <h2>Activity</h2>
        <ActivitySettingsSection st={st} name={(k) => labelOf(st.profiles[k] ?? NOBODY, k)} />
      </section>
      <section className="settings-section">
        <h2>Storage</h2>
        <MediaCache st={st} />
      </section>
      <section className="settings-section">
        <h2>Help and feedback</h2>
        <Feedback st={st} />
      </section>
      <section className="settings-section">
        <h2>Account</h2>
        <div className="settings-row">
          <span className="row-text">
            <span className="row-title">Delete account</span>
            <span className="row-sub">Removes your account, friends, groups and messages from this computer.</span>
          </span>
          <button className="button danger" onClick={remove}>
            <Icon name="trash" size={16} /> Delete
          </button>
        </div>
      </section>
    </Dialog>
  )
}

const WINDOWS = navigator.userAgent.includes('Windows')

// Pictures that downloaded by themselves are kept up to this much, the oldest deleted first. Files you saved and
// files you sent are never counted or deleted.
const CACHE_SIZES = [256, 512, 1024, 2048, 5120]
function MediaCache({ st }: { st: State }) {
  const [used, setUsed] = useState<number | null>(null)
  const measure = () => api.call('cacheSize').then(setUsed)
  useEffect(() => void measure(), [st.settings.cacheMB])
  return (
    <div className="settings-row">
      <span className="row-text">
        <label className="row-title" htmlFor="cache-size">
          Media cache
        </label>
        <span className="row-sub">{used === null ? '…' : `${sizeLabel(used)} of downloaded pictures`}</span>
      </span>
      <select id="cache-size" value={st.settings.cacheMB ?? DEFAULT_CACHE_MB} onChange={(e) => api.call('setSettings', { cacheMB: Number(e.target.value) })}>
        {CACHE_SIZES.map((mb) => (
          <option key={mb} value={mb}>
            {sizeLabel(mb * 2 ** 20)}
          </option>
        ))}
      </select>
      <button className="button" onClick={() => api.call('clearCache').then(measure)}>
        Clear cache
      </button>
    </div>
  )
}

// Windows keeps key presses in a game run as administrator away from Eleusinia unless it runs as administrator too.
function RunAsAdmin() {
  const [admin, setAdmin] = useState<boolean | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    window.api.isAdmin().then(setAdmin)
  }, [])
  const restart = async () => {
    setErr('')
    if (!(await window.api.restartAsAdmin())) setErr('Not restarted: Windows did not get permission.')
  }
  return (
    <div className="settings-row admin-row">
      <span className="row-text">
        <span className="row-line">
          <span className="row-title">Restart App as Administrator</span>
          <Info id="admin-tip">
            Use this when push to talk or your other hotkeys stop working while a game is in front. Some games, launchers and anti-cheat tools run as
            administrator, and Windows then hides your key presses from programs that are not.
            <br />
            Windows asks for permission first. Eleusinia runs as administrator until you close it; only do this when you need it.
          </Info>
        </span>
        {err && (
          <span className="row-sub" role="alert">
            {err}
          </span>
        )}
      </span>
      <button className="button" disabled={admin !== false} onClick={restart}>
        {admin ? 'Running as administrator' : 'Restart'}
      </button>
    </div>
  )
}

// Reporting problems to the developers: a report goes peer to peer to their inbox, which files it for them; nobody
// needs an account. Crash reports go by themselves unless turned off here.
function Feedback({ st }: { st: State }) {
  const [reporting, setReporting] = useState(false)
  const [version, setVersion] = useState('')
  useEffect(() => {
    window.api.diagnostics().then((d) => setVersion(d.meta.version))
  }, [])
  return (
    <>
      <div className="settings-row">
        <span className="row-text">
          <span className="row-title">Report a problem</span>
          <span className="row-sub">
            Eleusinia {version} · {BUILD} build
          </span>
        </span>
        <button className="button" onClick={() => setReporting(true)}>
          Report a problem
        </button>
      </div>
      <div className="setting crash-setting">
        <label className="check-row">
          <input type="checkbox" role="switch" checked={st.settings.crashReports !== false} onChange={(e) => api.call('setSettings', { crashReports: e.target.checked })} />
          <span>Send crash reports to the developers automatically</span>
        </label>
        <Info id="crash-tip">
          When part of Eleusinia crashes, a short report goes to the developers: what crashed and why, the app and Windows versions, and the last few
          minutes of connection, call and error events.
          <br />
          It never includes your messages, names, pictures, window titles, device names, full keys or network addresses.
        </Info>
      </div>
      {st.reports > 0 && (
        <p className="row-sub" role="status">
          {st.reports === 1 ? '1 report is' : `${st.reports} reports are`} waiting to reach the developers. They are sent as soon as their inbox is
          reachable, even after a restart.
        </p>
      )}
      {reporting && <ReportDialog close={() => setReporting(false)} st={st} />}
    </>
  )
}

const REPORT_KINDS: { kind: Kind; label: string; hint: string }[] = [
  { kind: 'bug', label: 'Something went wrong', hint: 'What happened, and what did you expect? Steps to make it happen again help most.' },
  { kind: 'feedback', label: 'Feedback', hint: 'What works well, or what could be better?' },
  { kind: 'idea', label: 'An idea', hint: 'What would you like Eleusinia to do?' },
]
const SHARE: { area: Area; label: string }[] = [
  { area: 'app', label: 'App and system details' },
  { area: 'network', label: 'Connection events' },
  { area: 'call', label: 'Call events and quality' },
  { area: 'error', label: 'Errors' },
]

export function ReportDialog({ st, close }: { st: State; close: () => void }) {
  const [kind, setKind] = useState<Kind>('bug')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [share, setShare] = useState<Area[]>(SHARE.map((s) => s.area))
  const [contact, setContact] = useState(false)
  const [diag, setDiag] = useState<{ meta: Meta; events: Diag[] } | null>(null)
  const [err, setErr] = useState('')
  const [sent, setSent] = useState(false)
  useEffect(() => {
    window.api.diagnostics().then(setDiag)
  }, [])
  const pick = (k: Kind) => {
    setKind(k)
    setShare(k === 'bug' ? SHARE.map((s) => s.area) : []) // diagnostics help with problems; feedback rarely needs them
  }
  const toggle = (a: Area, on: boolean) => setShare((s) => (on ? [...s, a] : s.filter((x) => x !== a)))
  const draft = {
    kind,
    title,
    body,
    contact: contact ? st.profile.handle : undefined,
    meta: share.includes('app') ? diag?.meta : undefined,
    events: diag?.events.filter((e) => share.includes(e.area)),
  }
  // Exactly what will leave: the same checks and scrubbing the app and the inbox apply.
  const preview = cleanReport({ ...draft, id: '0'.repeat(16), at: Date.now(), title: title || '(title)' })
  const count = (a: Area) => diag?.events.filter((e) => e.area === a).length ?? 0
  async function send(e: FormEvent) {
    e.preventDefault()
    setErr('')
    try {
      await api.call('report', draft)
      setSent(true)
    } catch (x: any) {
      setErr(String(x?.message ?? x).replace(/^.*Error: /, ''))
    }
  }
  if (sent)
    return (
      <Dialog label="Report sent" close={close}>
        <h1>Thank you</h1>
        <p>Your report is on its way to the developers. If their inbox is not reachable right now, it waits on this computer and goes later by itself.</p>
        <div className="form-actions">
          <button className="button primary" onClick={close}>
            Close
          </button>
        </div>
      </Dialog>
    )
  return (
    <Dialog label="Report a problem" close={close} className="report-dialog">
      <h1>Report a problem</h1>
      <form onSubmit={send}>
        <div className="report-kinds" role="radiogroup" aria-label="What kind of report">
          {REPORT_KINDS.map((k) => (
            <label key={k.kind} className={`report-kind ${kind === k.kind ? 'chosen' : ''}`}>
              <input type="radio" name="kind" checked={kind === k.kind} onChange={() => pick(k.kind)} />
              {k.label}
            </label>
          ))}
        </div>
        <label className="field-label">
          Title
          <input value={title} maxLength={120} required onChange={(e) => setTitle(e.target.value)} placeholder="In a few words" />
        </label>
        <label className="field-label">
          Description
          <textarea value={body} maxLength={4000} rows={5} onChange={(e) => setBody(e.target.value)} placeholder={REPORT_KINDS.find((k) => k.kind === kind)!.hint} />
        </label>
        <fieldset className="report-share">
          <legend>Share diagnostics</legend>
          {SHARE.map((s) => (
            <label key={s.area} className="check-row">
              <input type="checkbox" role="switch" checked={share.includes(s.area)} onChange={(e) => toggle(s.area, e.target.checked)} />
              <span>
                {s.label}
                <span className="hint"> · {s.area === 'app' ? 'version, Windows version, memory' : `${count(s.area)} from the last 15 minutes`}</span>
              </span>
            </label>
          ))}
          <label className="check-row">
            <input type="checkbox" role="switch" checked={contact} onChange={(e) => setContact(e.target.checked)} />
            <span>
              Include my friend ID so the developers can reply<span className="hint"> · {st.profile.handle}</span>
            </span>
          </label>
          <p className="hint">Never included: your messages, names, pictures, window titles, device names, full keys or network addresses.</p>
        </fieldset>
        <details className="report-preview">
          <summary>See exactly what will be sent</summary>
          <pre>{preview ? describe(preview) : ''}</pre>
        </details>
        {err && (
          <p className="form-error" role="alert">
            {err}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="button" onClick={close}>
            Cancel
          </button>
          <button className="button primary" disabled={!title.trim()}>
            Send report
          </button>
        </div>
      </form>
    </Dialog>
  )
}

// Deleting cannot be undone, so the user types their own friend ID to confirm.
export function DeleteAccount({ st, close }: { st: State; close: () => void }) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const ok = typed.trim().toLowerCase() === st.profile.handle
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!ok) return
    setBusy(true)
    // On success the app restarts at account creation, so only a failure comes back here.
    api.call('deleteAccount').catch((x) => {
      setBusy(false)
      setErr(`The account could not be deleted: ${String(x.message ?? x).replace(/^.*Error: /, '')}. Close and reopen Eleusinia, then try again.`)
    })
  }
  return (
    <Dialog label="Delete account" close={close}>
      <form className="new-group" onSubmit={submit}>
        <h1>Delete account</h1>
        <p>
          This permanently erases your account, friends, groups and messages from this computer, and you leave every group. Friends who are online are told;
          others keep your old messages. This cannot be undone.
        </p>
        <label className="field-label">
          <span>
            Type <b>{st.profile.handle}</b> to confirm
          </span>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
        </label>
        {err && <p role="alert" className="form-error">{err}</p>}
        <div className="form-actions">
          <button type="button" className="button" onClick={close}>
            Cancel
          </button>
          <button className="button danger" disabled={!ok || busy}>
            <Icon name="trash" size={16} /> {busy ? 'Deleting…' : 'Delete account'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
