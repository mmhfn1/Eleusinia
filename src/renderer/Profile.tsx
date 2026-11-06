// Someone's profile as a small panel beside wherever they were clicked (a call, the members list, a name in the
// chat): who they are, the cliff notes of what they are playing, and a box to message them without leaving. The full
// profile, with everything about their game, opens from it.
import { type FormEvent, type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { type Key, type Profile, type State, MAX_TEXT, dmId } from '../shared/protocol'
import { GameGlance } from './Activity'
import * as call from './call'
import { type People, type Run, api } from './common'
import { PersonVolume, useSpeaking } from './Media'
import { Avatar, Icon } from './ui'

// The banner behind a profile: the art of the game they are playing, else their own picture, blurred into fog. It is
// what makes each profile look like its person; without either, only the theme's fog shows.
export function ProfileBanner({ st, k, p }: { st: State; k: Key; p: Profile }) {
  const app = st.activity[k]?.game?.app
  const art = app ? `eleusinia-art://steam/${app}/header` : p.avatar
  return (
    <div className={`pop-banner ${app ? 'game' : ''}`} aria-hidden="true">
      {art && <img src={art} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />}
    </div>
  )
}

type PopProps = { k: Key; from: HTMLElement; st: State; people: People; run: Run; close: () => void; expand: () => void; chat: () => void; edit: () => void }

export function ProfilePop({ k, from, st, people, run, close, expand, chat, edit }: PopProps) {
  useSpeaking()
  const ref = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<{ left: number; top: number; side: 'right' | 'left' | 'below' | 'above' } | null>(null)
  const p = people.prof(k)
  const name = people.name(k)
  const me = k === st.me
  const status = st.friends[k]
  const online = people.isOnline(k)
  const inCall = !me && !!call.conv && call.peers.has(k)
  const voice = call.voices.get(k)
  const game = st.activity[k]?.game
  const blocked = st.blocked.includes(k)
  const [blocking, setBlocking] = useState(false) // asked "are you sure" first

  // Beside what was clicked: to its right when there is room, else to its left; a wide row (the friends list) gets it
  // dropped from its start instead, so it opens by the person rather than across the window. Always inside the window.
  useLayoutEffect(() => {
    const place = () => {
      const el = ref.current
      if (!el || !from.isConnected) return
      const r = from.getBoundingClientRect()
      const w = el.offsetWidth
      const h = el.offsetHeight
      const fit = (top: number) => Math.min(Math.max(8, top), innerHeight - h - 8)
      if (r.width > 420) {
        const below = r.bottom + 6 + h <= innerHeight - 8
        return setAt({ left: Math.min(Math.max(8, r.left + 8), innerWidth - w - 8), top: fit(below ? r.bottom + 6 : r.top - 6 - h), side: below ? 'below' : 'above' })
      }
      const right = r.right + 12 + w <= innerWidth - 8
      setAt({ left: right ? r.right + 12 : Math.max(8, r.left - 12 - w), top: fit(r.top - 8), side: right ? 'right' : 'left' })
    }
    place()
    addEventListener('resize', place)
    return () => removeEventListener('resize', place)
  }, [from, game?.name])

  // Escape or a click elsewhere closes it, and focus goes back to what opened it. A click on that same element is
  // left to it, so clicking a person again closes their panel instead of reopening it.
  const shut = useRef(close)
  shut.current = close
  useEffect(() => {
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && !from.contains(e.target as Node) && shut.current()
    const esc = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), shut.current())
    document.addEventListener('pointerdown', away, true)
    document.addEventListener('keydown', esc, true)
    return () => {
      document.removeEventListener('pointerdown', away, true)
      document.removeEventListener('keydown', esc, true)
      if (from.isConnected) from.focus()
    }
  }, [from])

  const presence = inCall ? (voice?.deafened ? 'In your call, deafened' : voice?.muted ? 'In your call, muted' : call.speaking.has(k) ? 'Talking in your call' : 'In your call') : online ? (st.relayed.includes(k) ? 'Online through a friend' : 'Online') : 'Offline'

  // On the page itself: inside the app's layout, a blurred or animated ancestor would move where `fixed` measures from.
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={`${name}'s profile`}
      className={`profile-pop ${at ? 'placed' : ''} from-${at?.side ?? 'right'} ${online ? 'online' : ''} ${inCall && call.speaking.has(k) ? 'speaking' : ''}`}
      style={at ? { left: at.left, top: at.top } : { visibility: 'hidden' }}
    >
      <ProfileBanner st={st} k={k} p={p} />
      <div className="pop-head">
        <span className="pop-portrait">
          <Avatar k={k} p={p} size={76} />
        </span>
        <button className="icon-button pop-expand" aria-label="Open full profile" title="Open full profile" onClick={expand}>
          <Icon name="expand" size={16} />
        </button>
      </div>
      <div className="pop-body">
        <h2 className="pop-name">{name}</h2>
        <p className="pop-handle">
          {p.handle || 'No friend ID yet'}
          {me && ' (you)'}
        </p>
        {!me && (
          <p className={`pop-presence ${online ? 'on' : ''}`}>
            <span className="pop-dot" aria-hidden="true" />
            {presence}
          </p>
        )}
        {p.about && <p className="pop-about">{p.about}</p>}
        {game && (
          <button className="pop-glance" onClick={expand} aria-label={`See everything about ${name}'s game`}>
            <GameGlance g={game} />
          </button>
        )}
        {inCall && (
          <div className="pop-volume">
            <PersonVolume st={st} k={k} name={name} />
          </div>
        )}
        {me ? (
          <button className="button wide" onClick={() => (close(), edit())}>
            Edit profile
          </button>
        ) : blocked ? (
          <button className="button wide" onClick={() => run(api.call('unblock', k))}>
            Unblock
          </button>
        ) : status === 'friend' ? (
          <Note k={k} name={name} st={st} run={run} chat={chat} />
        ) : status === 'outgoing' ? (
          <p className="pop-quiet">Friend request sent</p>
        ) : (
          <button className="button primary wide" onClick={() => run(api.call('addFriend', k, p))}>
            <Icon name="userPlus" size={16} /> {status === 'incoming' ? 'Accept friend request' : 'Add friend'}
          </button>
        )}
        {!me && !blocked && (blocking ? (
          <div className="pop-confirm" role="group" aria-label={`Block ${name}?`}>
            <p className="pop-quiet">{status === 'friend' ? 'This also removes them as a friend. ' : ''}Their requests and messages stop reaching you. Unblock any time in Settings.</p>
            <button className="button danger" onClick={() => (setBlocking(false), run(api.call('block', k)))}>
              Block {name}
            </button>
            <button className="button" onClick={() => setBlocking(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button className="link-button pop-block" onClick={() => setBlocking(true)}>
            Block
          </button>
        ))}
      </div>
    </div>,
    document.body,
  )
}

// The message box at the bottom of a friend's panel: Enter sends it to your chat with them, which stays one click away.
function Note({ k, name, st, run, chat }: { k: Key; name: string; st: State; run: Run; chat: () => void }) {
  const [text, setText] = useState('')
  const [sent, setSent] = useState(0)
  const box = useRef<HTMLInputElement>(null)
  useEffect(() => box.current?.focus(), [])
  function send(e: FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    run(api.call('send', dmId(st.me, k), text).then(() => (setText(''), setSent((n) => n + 1))))
  }
  const keys = (e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && e.nativeEvent.isComposing && e.preventDefault()
  return (
    <form className="pop-note" onSubmit={send}>
      <input ref={box} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={keys} aria-label={`Message ${name}`} placeholder={`Message ${name}`} maxLength={MAX_TEXT} />
      <button className="pop-send" aria-label="Send message" disabled={!text.trim()}>
        <Icon name="send" size={16} />
      </button>
      {sent > 0 && (
        <p className="pop-sent" role="status" key={sent}>
          <Icon name="check" size={12} /> Sent.{' '}
          <button type="button" className="link-button" onClick={chat}>
            Open chat
          </button>
        </p>
      )}
    </form>
  )
}
