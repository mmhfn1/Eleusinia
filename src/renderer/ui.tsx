// Small shared pieces of the Eleusinia interface: icons, portraits, emblems, dialogs and ornaments.
import { type KeyboardEvent, type PointerEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { type Group, type Key, type Profile, identicon } from '../shared/protocol'

const ICONS: Record<string, ReactNode> = {
  home: <path d="M3.5 10.5 12 3.5l8.5 7V20a1 1 0 0 1-1 1h-5v-6h-5v6h-5a1 1 0 0 1-1-1z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6" />
    </>
  ),
  micOff: (
    <>
      <path d="M15 10V6a3 3 0 0 0-5.7-1.3M9 9v2a3 3 0 0 0 4.6 2.5M18.5 11a6.5 6.5 0 0 1-1.1 3.6M5.5 11a6.5 6.5 0 0 0 10.4 5.2M12 17.5V21M9 21h6" />
      <path d="M4 4l16 16" />
    </>
  ),
  phone: <path d="M5.2 3.5h3.1l1.9 4.8-2.4 1.5a11 11 0 0 0 6.4 6.4l1.5-2.4 4.8 1.9v3.1a1.8 1.8 0 0 1-1.9 1.8A16.5 16.5 0 0 1 3.4 5.4a1.8 1.8 0 0 1 1.8-1.9z" />,
  send: <path d="M20.5 3.5 10 14M20.5 3.5 14 20.5l-4-6.5-6.5-4z" />,
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h8" />
    </>
  ),
  back: <path d="M15 5l-7 7 7 7" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  userPlus: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M19 8v6M16 11h6" />
    </>
  ),
  headphones: <path d="M4 15v-3a8 8 0 0 1 16 0v3M4 15a2 2 0 0 1 2-2h1v7H6a2 2 0 0 1-2-2zM20 15a2 2 0 0 0-2-2h-1v7h1a2 2 0 0 0 2-2z" />,
  headphonesOff: (
    <>
      <path d="M4 15v-3a8 8 0 0 1 12.5-6.6M20 12v3M4 15a2 2 0 0 1 2-2h1v7H6a2 2 0 0 1-2-2zM20 15a2 2 0 0 0-2-2h-1v7h1a2 2 0 0 0 2-2z" />
      <path d="M3 3l18 18" />
    </>
  ),
  leave: <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10" />,
  trash: <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.01" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
}

export function Icon({ name, size = 18 }: { name: keyof typeof ICONS; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  )
}

// The Eleusinia emblem (the logo), tinted by CSS so it can be moonlit marble, gold or faint violet.
export function Emblem({ size, className = '' }: { size: number; className?: string }) {
  return <span className={`emblem ${className}`} style={{ width: size, height: size }} aria-hidden="true" />
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`wordmark ${className}`}>
      Eleusinia
    </span>
  )
}

// A person's portrait: their uploaded picture, or a pattern drawn from their public key. With `online` set,
// a presence mark is added: filled when online, hollow when offline, so it does not rely on colour alone.
export function Avatar({ k, p, size = 32, online }: { k: Key; p: Profile; size?: number; online?: boolean }) {
  const { hue, cells } = identicon(k)
  return (
    <span className="avatar" style={{ width: size, height: size }}>
      {p.avatar ? (
        <img src={p.avatar} alt="" />
      ) : (
        <svg viewBox="0 0 5 5" aria-hidden="true" style={{ background: `hsl(${hue} 38% 18%)` }}>
          {cells.map((on, i) => on && <rect key={i} x={i % 5} y={Math.floor(i / 5)} width={1.02} height={1.02} fill={`hsl(${hue} 70% 72%)`} />)}
        </svg>
      )}
      {online !== undefined && <span className={online ? 'presence on' : 'presence'} title={online ? 'Online' : 'Offline'} />}
    </span>
  )
}

// A group's crest: a faceted crystal holding the group's first letter, coloured from the group id.
export function GroupEmblem({ g, size = 32 }: { g: Group; size?: number }) {
  const hue = 190 + (parseInt(g.id.slice(0, 4), 16) % 80)
  return (
    <span className="crest" style={{ width: size, height: size, fontSize: size * 0.42, ['--hue' as string]: hue }} aria-hidden="true">
      <svg viewBox="0 0 32 32">
        <path d="M16 1.5 30.5 16 16 30.5 1.5 16z" />
        <path d="M16 5.5 26.5 16 16 26.5 5.5 16z" className="inner" />
      </svg>
      <span>{(g.name.trim()[0] ?? '?').toUpperCase()}</span>
    </span>
  )
}

// A fine gold rule with a diamond at its centre.
export function Ornament({ className = '' }: { className?: string }) {
  return (
    <div className={`ornament ${className}`} aria-hidden="true">
      <span />
      <svg viewBox="0 0 12 12" width="9" height="9">
        <path d="M6 0.5 11.5 6 6 11.5 0.5 6z" />
      </svg>
      <span />
    </div>
  )
}

// A ruined Awoken spire in the fog: a broken crown, flanking towers, an arcade and shards hanging in the air,
// with one small lamp still burning. Purely decorative, drawn in low-contrast stone so text over it stays readable.
export function Ruin({ className = '' }: { className?: string }) {
  const id = useId()
  const shards: [number, number, number][] = [
    [190, 66, 1], [238, 50, 0.85], [212, 26, 0.6], [258, 86, 0.75], [174, 100, 0.7], [229, 4, 0.4], [150, 40, 0.45], [282, 30, 0.35],
  ]
  return (
    <svg className={`ruin ${className}`} viewBox="0 0 400 800" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      <defs>
        <linearGradient id={id + 's'} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="ruin-top" />
          <stop offset="1" className="ruin-base" />
        </linearGradient>
        <radialGradient id={id + 'l'}>
          <stop offset="0" className="ruin-lamp" />
          <stop offset="1" className="ruin-lamp-edge" />
        </radialGradient>
      </defs>
      <g fill={`url(#${id}s)`} fillRule="evenodd">
        <path d="M150 800 165 610 150 600 172 470 160 462 188 300 178 292 196 170 206 120 214 150 222 96 230 140 240 118 244 170 252 292 242 300 268 462 256 470 278 600 262 610 276 800Z M210 372h8v22h-8z M206 560h16v30h-16z" />
        <path d="M70 800 78 640 70 632 92 560 100 528 108 560 128 632 120 640 126 800Z" />
        <path d="M300 800 306 680 298 672 318 610 326 586 334 610 352 672 344 680 350 800Z" />
        <path d="M110 680H310V722H110Z M130 722v-14a10 10 0 0 1 20 0v14z M170 722v-14a10 10 0 0 1 20 0v14z M230 722v-14a10 10 0 0 1 20 0v14z M270 722v-14a10 10 0 0 1 20 0v14z" />
        {shards.map(([x, y, o], i) => (
          <path key={i} d={`M${x} ${y}l${6 + (i % 3) * 3} -${8 + (i % 2) * 4} l${3 + (i % 2) * 2} ${14 + (i % 3) * 2}z`} opacity={o} />
        ))}
      </g>
      <circle cx="214" cy="383" r="16" fill={`url(#${id}l)`} />
      <circle cx="214" cy="383" r="1.6" className="ruin-flame" />
    </svg>
  )
}

// A still celestial diagram: orbits, a few stars and the lines between them. Purely decorative.
export function Orrery({ className = '' }: { className?: string }) {
  const stars: [number, number][] = [
    [100, 22], [160, 58], [176, 120], [128, 170], [58, 152], [30, 92], [70, 44],
  ]
  return (
    <svg className={`orrery ${className}`} viewBox="0 0 200 200" aria-hidden="true">
      <circle cx="100" cy="100" r="92" className="ring" />
      <circle cx="100" cy="100" r="64" className="ring faint" />
      <circle cx="100" cy="100" r="34" className="ring faint" />
      <path d="M100 4v192M4 100h192" className="axis" />
      <path d="M100 30 170 100 100 170 30 100z" className="ring faint" />
      <polyline points={stars.map((s) => s.join(',')).join(' ')} className="links" />
      {stars.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i % 3 ? 1.6 : 2.4} className="star" />
      ))}
    </svg>
  )
}

// An (i) button whose explanation shows while it is hovered or focused, and is read out as its description.
export function Info({ id, children }: { id: string; children: ReactNode }) {
  return (
    <span className="info">
      <button type="button" className="info-icon" aria-label="More information" aria-describedby={id}>
        <Icon name="info" size={16} />
      </button>
      <span role="tooltip" id={id} className="tip">
        {children}
      </span>
    </span>
  )
}

// A modal dialog: Esc or a click on the dimmed backdrop closes it.
export function Dialog({ label, close, children, className = '' }: { label: string; close: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current!
    d.showModal()
    // Start in the first text field if there is one, otherwise on the dialog itself rather than its close button.
    ;(d.querySelector<HTMLElement>('input:not([type=checkbox]), textarea') ?? d.querySelector<HTMLElement>('.dialog-body'))?.focus()
  }, [])
  return (
    <dialog ref={ref} className={className} onClose={close} onClick={(e) => e.target === ref.current && close()} aria-label={label}>
      <div className="dialog-body" tabIndex={-1}>
        <button className="icon-button dialog-close" onClick={close} aria-label="Close">
          <Icon name="close" />
        </button>
        {children}
      </div>
    </dialog>
  )
}

export function copyText(text: string) {
  navigator.clipboard.writeText(text)
}

// A copy button that briefly confirms it worked.
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      className="icon-button"
      aria-label={done ? 'Copied' : label}
      title={done ? 'Copied' : label}
      onClick={() => {
        copyText(text)
        setDone(true)
        setTimeout(() => setDone(false), 1500)
      }}
    >
      <Icon name={done ? 'check' : 'copy'} size={16} />
    </button>
  )
}

const [MIN_W, MAX_W] = [180, 480]
// A sidebar width the user can drag, remembered on this computer.
export function useWidth(id: string, initial: number) {
  const [w, setW] = useState(() => Number(localStorage.getItem('width-' + id)) || initial)
  const set = (v: number) => {
    const clamped = Math.max(MIN_W, Math.min(MAX_W, Math.round(v)))
    setW(clamped)
    localStorage.setItem('width-' + id, String(clamped))
  }
  return [w, set] as const
}

// Drag handle on a sidebar's inner edge. `dir` is 1 when dragging right widens the sidebar, -1 when it narrows it.
export function Splitter({ label, width, set, dir }: { label: string; width: number; set: (v: number) => void; dir: 1 | -1 }) {
  const from = useRef({ x: 0, w: 0 })
  const down = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    from.current = { x: e.clientX, w: width }
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) set(from.current.w + (e.clientX - from.current.x) * dir)
  }
  const key = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') set(width + 16 * dir)
    if (e.key === 'ArrowLeft') set(width - 16 * dir)
  }
  return (
    <div
      className="splitter"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={MIN_W}
      aria-valuemax={MAX_W}
      tabIndex={0}
      onPointerDown={down}
      onPointerMove={move}
      onKeyDown={key}
    />
  )
}
