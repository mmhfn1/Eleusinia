// The startup splash (Lantern, design/mockups/splash.html): covers the window while the app loads underneath and
// closes by itself once the node's startup checks are done and the window has its first state and audio devices.
// Nothing skips it; an update found on the way is downloaded and installed behind it (index.ts), and the new version
// opens and signs in by itself.
import { type ReactNode, useEffect, useState } from 'react'
import type { Event } from '../shared/protocol'
import { api } from './common'
import './splash.css'

type Startup = Extract<Event, { type: 'startup' }>
const FADE = 400
const NOTICE_MS = 60000

// children: the window's title bar, kept usable above the splash so the window can be closed or minimised meanwhile
export function Splash({ loaded, closed, children }: { loaded: boolean; closed: (pending: string[]) => void; children: ReactNode }) {
  const [s, setS] = useState<Startup | null>(null)
  const [devices, setDevices] = useState(false)
  useEffect(() => {
    api.call('startup').then((x: Startup | null) => x && setS((now) => now ?? x))
    navigator.mediaDevices.enumerateDevices().catch(() => {}).finally(() => setDevices(true))
    return api.on((e) => e.type === 'startup' && setS(e))
  }, [])
  // Step 8 is the window's own: its first state and the audio devices listed
  const mine = loaded && devices
  const steps = [...(s?.steps ?? []), { id: 'window', label: 'Opening the window', detail: 'your conversations, microphones and speakers', done: mine }]
  const now = steps.find((x) => !x.done)
  // Given up: the node stopped waiting on someone slow, who is named in a notice once the app shows
  const done = !!s && (s.ready || s.gaveUp) && mine
  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => closed(s!.gaveUp ? s!.pending : []), FADE)
    return () => clearTimeout(t)
  }, [done])
  return (
    <div className={`splash${done ? ' gone' : ''}`}>
      <div className="splash-art" aria-hidden="true">
        <div className="splash-layer splash-fog" />
        <div className="splash-stage">
          <div className="splash-layer splash-fish splash-base" />
          <div className="splash-layer splash-fish splash-lamp" />
        </div>
      </div>
      {children}
      <div role="status" aria-live="polite">
        <span className="splash-word">Eleusinia</span>
        <span className="splash-status">{now?.label ?? (done ? 'Ready' : 'Starting')}</span>
        <span className="splash-detail">{now?.detail}</span>
      </div>
    </div>
  )
}

// After a splash that gave up waiting: what is still going on ("Still connecting to Bob"), until it is done or for a minute.
export function StillConnecting({ first }: { first: string[] }) {
  const [pending, setPending] = useState(first)
  useEffect(() => {
    const t = setTimeout(() => setPending([]), NOTICE_MS)
    const off = api.on((e) => e.type === 'startup' && setPending(e.pending))
    return () => (clearTimeout(t), off())
  }, [])
  if (!pending.length) return null
  return (
    <div role="status" className="toast still-connecting">
      <span>{pending.join(' · ')}</span>
    </div>
  )
}
