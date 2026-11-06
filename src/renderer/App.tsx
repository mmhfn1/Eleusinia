import { type FormEvent, type KeyboardEvent, type ReactNode, memo, useEffect, useReducer, useRef, useState } from 'react'
import { type Offset, clampOffset, cropRect } from '../shared/crop'
import { type Group, type Key, type Profile, type State, dmId, keyTail } from '../shared/protocol'
import * as call from './call'
import { Avatar, Confirm, CopyButton, Dialog, Emblem, GroupEmblem, Icon, Splitter, Wordmark, useWidth } from './ui'
import { Chat } from './Chat'
import { CameraDialog, Oculus, PersonVolume, RingBar, STATE_WORDS, ShareDialog, Stage, VoiceMark, VoiceSignal, useSpeaking } from './Media'
import { DeleteAccount, ReportDialog, SettingsDialog } from './Settings'
import { ActivityLine, ProfileActivity } from './Activity'
import { ProfileBanner, ProfilePop } from './Profile'
import { type Modal, NOBODY, type People, type Run, api, card, groupName, labelOf, removeFriendAsk } from './common'
import { Rail } from './Rail'

export default function App() {
  const [st, setSt] = useState<State | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [modal, setModal] = useState<Modal>(null)
  const [editing, setEditing] = useState(false)
  const [err, setErr] = useState('')
  const [update, setUpdate] = useState<string | null>(null) // a downloaded version waiting for a restart
  const [, tick] = useReducer((n: number) => n + 1, 0)
  // Where you have been, for the mouse's back and forward buttons (mouse 4 and 5).
  const trail = useRef({ back: [] as (string | null)[], forward: [] as (string | null)[], at: null as string | null })
  trail.current.at = sel
  const go = (c: string | null) => {
    const t = trail.current
    if (c === t.at) return
    t.back.push(t.at)
    t.forward = []
    setSel(c)
  }
  useEffect(() => {
    const step = (e: MouseEvent) => {
      if (e.button !== 3 && e.button !== 4) return
      e.preventDefault()
      const t = trail.current
      const [from, to] = e.button === 3 ? [t.back, t.forward] : [t.forward, t.back]
      if (!from.length) return
      to.push(t.at)
      setSel(from.pop()!)
    }
    window.addEventListener('mouseup', step)
    return () => window.removeEventListener('mouseup', step)
  }, [])

  // Ctrl K (Cmd K) also opens the Eleusinia menu from anywhere: an unadvertised shortcut, kept for those who find it.
  useEffect(() => {
    const key = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') e.preventDefault(), setModal((m) => (m?.kind === 'menu' ? null : { kind: 'menu' }))
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  useEffect(() => {
    const got = (s: State) => {
      setSt(s)
      call.onState(s)
    }
    api.call('state').then(got)
    call.onChange(tick)
    return api.on((e) => {
      if (e.type === 'state') got(e.state)
      if (e.type === 'call') call.onSignal(e.from, e.conv, e.data)
      if (e.type === 'hotkey') call.onHotkey(e.action, e.down)
      if (e.type === 'update') setUpdate(e.version)
    })
  }, [])

  // A new friend request shows as a desktop notification, so it is not missed while Eleusinia is in the background.
  const asked = useRef<Set<Key> | null>(null)
  useEffect(() => {
    if (!st) return
    const now = new Set(Object.keys(st.friends).filter((k) => st.friends[k] === 'incoming'))
    if (asked.current) for (const k of now) if (!asked.current.has(k)) new Notification('Eleusinia', { body: `${labelOf(st.profiles[k] ?? NOBODY, k)} wants to be friends` })
    asked.current = now
  }, [st])

  if (!st)
    return (
      <>
        <TitleBar place="" />
        <div className="app-loading" role="status">
          <Emblem size={56} />
          <p className="quiet">Starting Eleusinia…</p>
        </div>
      </>
    )
  if (!st.profile.handle || editing)
    return (
      <>
        <TitleBar place={st.profile.handle ? 'Edit profile' : 'Create your account'} />
        <ProfileForm st={st} first={!st.profile.handle} done={() => setEditing(false)} />
      </>
    )

  // Runs an action and shows its failure instead of swallowing it.
  const run: Run = (p) => p.then(() => setErr(''), (e) => setErr(String(e.message ?? e).replace(/^.*Error: /, '')))
  const prof = (k: Key) => (k === st.me ? st.profile : (st.profiles[k] ?? NOBODY))
  const people: People = {
    prof,
    name: (k) => st.settings.nicknames?.[k] || labelOf(prof(k), k),
    user: (k) => (
      <button key={k} className="user" onClick={(e) => people.show(k, e.currentTarget)}>
        {people.name(k)}
      </button>
    ),
    // Linked, or a group member known online from their presence note
    isOnline: (k) => k === st.me || st.online.includes(k) || st.present.includes(k),
    // Clicking the same person again closes their panel.
    show: (k, from) => setModal((m) => (!from ? { kind: 'card', k } : m?.kind === 'pop' && m.k === k && m.from === from ? null : { kind: 'pop', k, from })),
  }
  // A conversation that no longer exists (friend removed) falls back to Home.
  const open = sel && (st.groups[sel] || st.friends[sel.split('_').find((k) => k !== st.me)!] === 'friend') ? sel : null

  const place = open ? (st.groups[open] ? groupName(st.groups[open]) : people.name(open.split('_').find((k) => k !== st.me)!)) : 'Friends'
  const callAway = call.conv && call.conv !== open ? call.conv : null
  // Direct calls ringing for us, shown wherever we are (the open conversation shows its own); joining one opens it.
  const other = (c: string) => c.split('_').find((k) => k !== st.me)!
  const incoming = call.ringingCalls().filter((c) => c !== open && st.friends[other(c)] === 'friend')
  const callName = callAway && (st.groups[callAway] ? groupName(st.groups[callAway]) : people.name(callAway.split('_').find((k) => k !== st.me)!))
  return (
    <>
    <TitleBar place={place} call={callAway ? { name: callName!, back: () => go(callAway) } : undefined} />
    <div className="app">
      <Rail st={st} people={people} open={open} go={go} show={setModal} run={run} />
      {open ? (
        <Conversation key={open} st={st} conv={open} people={people} run={run} home={() => go(null)} />
      ) : (
        <Home st={st} people={people} run={run} open={go} />
      )}
      {incoming.length > 0 && (
        <div className="incoming-calls">
          {incoming.map((c) => (
            <RingBar key={c} conv={c} who={other(c)} st={st} name={people.name} join={(muted) => (go(c), run(call.join(c).then(() => muted && !call.muted && call.toggleMute())))} />
          ))}
        </div>
      )}
      {update && (
        <div role="status" className="toast update-toast">
          <span>
            Eleusinia {update} is ready.{call.conv ? ' You rejoin your call after the restart.' : ''}
          </span>
          <button className="button primary" onClick={() => call.restartForUpdate()}>
            Restart now
          </button>
          <button className="button subtle" onClick={() => setUpdate(null)}>
            Later
          </button>
        </div>
      )}
      {err && (
        <div role="alert" className="toast">
          <span>{err}</span>
          <button className="icon-button" aria-label="Dismiss" onClick={() => setErr('')}>
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      {modal?.kind === 'pop' && (
        <ProfilePop
          key={modal.k}
          k={modal.k}
          from={modal.from}
          st={st}
          people={people}
          run={run}
          close={() => setModal(null)}
          expand={() => setModal({ kind: 'card', k: modal.k })}
          chat={() => (setModal(null), go(dmId(st.me, modal.k)))}
          edit={() => setEditing(true)}
        />
      )}
      {modal?.kind === 'card' && (
        <Card
          k={modal.k}
          st={st}
          p={{ ...prof(modal.k), name: people.name(modal.k) }}
          close={() => setModal(null)}
          message={() => go(dmId(st.me, modal.k))}
          edit={() => setEditing(true)}
          run={run}
        />
      )}
      {modal?.kind === 'settings' && <SettingsDialog st={st} close={() => setModal(null)} edit={() => setEditing(true)} remove={() => setModal({ kind: 'delete' })} />}
      {modal?.kind === 'delete' && <DeleteAccount st={st} close={() => setModal(null)} />}
      {modal?.kind === 'group' && <NewGroup st={st} people={people} run={run} close={() => setModal(null)} open={go} />}
      {modal?.kind === 'menu' && <Menu st={st} people={people} close={() => setModal(null)} go={go} report={() => setModal({ kind: 'report' })} />}
      {modal?.kind === 'report' && <ReportDialog st={st} close={() => setModal(null)} />}
    </div>
    </>
  )
}

// The window's own title bar: where you are, a way back to a call you are in elsewhere, and the window buttons. The
// strip itself drags the window (and double-click maximizes, as Windows does); the buttons opt out of dragging.
function TitleBar({ place, call: live }: { place: string; call?: { name: string; back: () => void } }) {
  const [max, setMax] = useState(false)
  useEffect(() => {
    window.api.win('state').then(setMax)
    return api.on((e) => e.type === 'window' && setMax(e.maximized))
  }, [])
  return (
    <header className="titlebar">
      <span className="titlebar-place">{place}</span>
      {live && (
        <button className="titlebar-call" onClick={live.back} title="Back to your call">
          <span className="titlebar-live" aria-hidden="true" />
          In a call in {live.name}
        </button>
      )}
      <div className="window-buttons">
        <button aria-label="Minimize" title="Minimize" onClick={() => window.api.win('minimize')}>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M0 5.5h10" />
          </svg>
        </button>
        <button aria-label={max ? 'Restore' : 'Maximize'} title={max ? 'Restore' : 'Maximize'} onClick={() => window.api.win('maximize').then(setMax)}>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            {max ? <path d="M2.5.5h7v7M.5 2.5h7v7h-7z" /> : <path d="M.5.5h9v9h-9z" />}
          </svg>
        </button>
        <button className="close" aria-label="Close" title="Close" onClick={() => window.api.win('close')}>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M.5.5l9 9M9.5.5l-9 9" />
          </svg>
        </button>
      </div>
    </header>
  )
}

// Home: your friend ID and the search to add people, your friends (a row opens the chat, where calls start too) and
// friend requests. Groups and direct chats are on the rail, so they are not listed here again.
function Home({ st, people, run, open }: { st: State; people: People; run: Run; open: (conv: string) => void }) {
  const { prof, name, user, isOnline, show } = people
  const byStatus = (s: string) => Object.keys(st.friends).filter((k) => st.friends[k] === s)
  const friends = byStatus('friend').sort((a, b) => name(a).localeCompare(name(b)))
  // A group call a friend is in, so the row can say where to find them.
  const inCallIn = (k: Key) => Object.values(st.groups).find((g) => call.active.get(g.id)?.has(k))
  const friend = (k: Key) => (
    <div key={k} className="friend-row">
      <button className="row-button" onClick={() => open(dmId(st.me, k))} onContextMenu={card(show, k)}>
        <Avatar k={k} p={prof(k)} size={40} online={isOnline(k)} />
        <span className="row-text">
          <span className="row-title">{name(k)}</span>
          <span className="row-sub">{st.activity[k]?.game ? <ActivityLine a={st.activity[k]} /> : prof(k).handle}</span>
        </span>
        {inCallIn(k) && <span className="row-where">In a call in {groupName(inCallIn(k)!)}</span>}
        {call.active.get(dmId(st.me, k))?.size ? (
          <span className="call-chip">
            <Icon name="phone" size={14} /> Calling
          </span>
        ) : null}
      </button>
    </div>
  )
  const online = friends.filter((k) => st.online.includes(k))
  const offline = friends.filter((k) => !st.online.includes(k))
  const incoming = byStatus('incoming')
  const outgoing = byStatus('outgoing')

  return (
    <>
      <main className="workspace home">
        <header className="page-head">
          <h1>Friends</h1>
          <span className="page-sub">
            {online.length} of {friends.length} online
          </span>
        </header>
        <div className="page-body">
          <div className="home-add">
            <FriendId st={st} />
            <Search st={st} run={run} />
          </div>
          <div className="home-grid">
          <div className="home-list">
          <section className="online" aria-label="Online friends">
            <h2>Online · {online.length}</h2>
            {online.map(friend)}
          </section>
          <hr />
          <section className="offline" aria-label="Offline friends">
            <h2>Offline · {offline.length}</h2>
            {offline.map(friend)}
          </section>
          {!friends.length && (
            <div className="empty-state">
              <p className="empty-title">No friends yet</p>
              <p className="quiet">Search for someone's friend ID above, or give them yours to search for.</p>
            </div>
          )}
          </div>
          {(incoming.length > 0 || outgoing.length > 0) && (
          <div className="home-side">
          {(incoming.length > 0 || outgoing.length > 0) && (
            <section className="requests" aria-label="Friend requests">
              <div className="requests-head">
                <h2>Requests</h2>
                {incoming.length > 1 && (
                  <button className="button subtle" onClick={() => run(api.call('declineAll'))}>
                    Decline all
                  </button>
                )}
              </div>
              {incoming.map((k) => (
                <div className="request" key={k}>
                  <Avatar k={k} p={prof(k)} size={36} />
                  <span className="row-text">
                    <span className="row-title">{user(k)}</span>
                    <span className="row-sub">
                      {prof(k).handle} <span className="tail">{keyTail(k)}</span>
                    </span>
                  </span>
                  <button className="button primary" onClick={() => run(api.call('addFriend', k))}>
                    Accept
                  </button>
                  <button className="button" onClick={() => run(api.call('removeFriend', k))}>
                    Decline
                  </button>
                </div>
              ))}
              {outgoing.map((k) => (
                <div className="request" key={k}>
                  <Avatar k={k} p={prof(k)} size={36} />
                  <span className="row-text">
                    <span className="row-title">{name(k)}</span>
                    <span className="row-sub">Request sent</span>
                  </span>
                  <button className="button" onClick={() => run(api.call('removeFriend', k))}>
                    Cancel
                  </button>
                </div>
              ))}
            </section>
          )}
          </div>
          )}
          </div>
        </div>
      </main>
    </>
  )
}

function FriendId({ st }: { st: State }) {
  return (
    <section className="friend-id" aria-labelledby="friend-id-title">
      <h2 id="friend-id-title">Your friend ID</h2>
      <div className="id-plate">
        <b>{st.profile.handle}</b>
        <CopyButton text={st.profile.handle} label="Copy friend ID" />
      </div>
      <p className="row-sub">
        Key ending <span className="tail">{keyTail(st.me)}</span>
      </p>
    </section>
  )
}

type Found = { key: Key; profile: Profile; linked: boolean }

// Suggests people as their username or ID is typed (from 4 characters). The request goes only to the row clicked.
function Search({ st, run }: { st: State; run: Run }) {
  const [text, setText] = useState('')
  const [found, setFound] = useState<Found[] | null>(null)
  const [busy, setBusy] = useState(false)
  const latest = useRef(0)

  useEffect(() => {
    const q = text.trim()
    const id = ++latest.current // answers to older keystrokes are dropped
    if (q.length < 4) {
      setFound(null)
      setBusy(false)
      return
    }
    setBusy(true)
    // Asked again a few times while nobody is found (someone who just came online takes a few seconds to be findable)
    // or someone was found only by their published card: once a link is made, their picture comes too.
    let timer: ReturnType<typeof setTimeout>
    const look = (tries: number) => {
      api.call('findFriend', q).then(
        (r: Found[]) => {
          if (id !== latest.current) return
          setFound(r)
          if (r.length) setBusy(false)
          if ((!r.length || r.some((f) => !f.linked)) && tries > 0) timer = setTimeout(() => look(tries - 1), 3000)
          else setBusy(false)
        },
        () => id === latest.current && setBusy(false),
      )
    }
    timer = setTimeout(() => look(4), 350)
    return () => clearTimeout(timer)
  }, [text])

  const sameId = found && new Set(found.map((f) => f.profile.handle)).size < found.length
  const pick = (r: Found) => {
    run(api.call('addFriend', r.key, r.profile))
    setText('')
  }
  const status = (k: Key) => ({ friend: 'Already friends', outgoing: 'Request sent', incoming: 'Wants to be friends' })[st.friends[k]]
  const action = (k: Key) => ({ friend: 'Friends', outgoing: 'Requested', incoming: 'Accept' })[st.friends[k]] ?? 'Add friend'

  return (
    <div className="search-box">
      <div className="field with-icon">
        <Icon name="search" size={16} />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Find a friend"
          aria-describedby="search-status"
          placeholder="Username (4+ letters) or friend ID"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <p id="search-status" className="row-sub" aria-live="polite">
        {busy ? 'Searching…' : found && (found.length ? found.some((f) => !st.friends[f.key]) ? 'Choose Add friend to send them a request.' : `${found.length} found` : 'No one online matches that.')}
      </p>
      {found && found.length > 0 && (
        <div className="results" role="group" aria-label="Suggestions">
          {sameId && <p className="notice">Some people here share the same ID. Ask your friend for the end of their key and choose that one.</p>}
          {found.map((r) => (
            <div key={r.key} className={`result ${r.linked ? '' : 'away'}`}>
              <button
                className="button primary add-friend"
                disabled={st.friends[r.key] === 'friend' || st.friends[r.key] === 'outgoing'}
                onClick={() => pick(r)}
                aria-label={`${action(r.key)}: ${r.profile.name || r.profile.handle}`}
              >
                {!st.friends[r.key] && <Icon name="userPlus" size={16} />} {action(r.key)}
              </button>
              <Avatar k={r.key} p={r.profile} size={36} />
              <span className="row-text">
                <span className="row-title">
                  <b>{r.profile.handle}</b> {r.profile.name}
                </span>
                <span className="row-sub">{status(r.key) ?? (r.linked ? 'Online' : 'Offline')}</span>
              </span>
              <span className="tail" title="End of their key">
                {keyTail(r.key)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const FRAME = 240 // the cropper's frame, in CSS pixels
const PORTRAIT = 128 // saved portrait size: small enough to send to every contact

// Lets the user move, zoom and rotate a picture under a round frame before it becomes their portrait.
function Cropper({ file, done, close }: { file: File; done: (url: string) => void; close: (err?: string) => void }) {
  const [img, setImg] = useState<ImageBitmap | null>(null)
  const [zoom, setZoom] = useState(1)
  const [off, setOff] = useState<Offset>({ x: 0, y: 0 })
  const view = useRef<HTMLCanvasElement>(null)
  const drag = useRef<{ x: number; y: number; o: Offset } | null>(null)

  useEffect(() => {
    createImageBitmap(file).then(setImg, () => close('That picture could not be read'))
  }, [file])
  useEffect(() => () => img?.close(), [img]) // frees the decoded picture as soon as it is replaced or closed
  const draw = (c: HTMLCanvasElement, px: number) => {
    if (!img) return
    const r = cropRect(img.width, img.height, FRAME, zoom, off)
    c.getContext('2d')!.drawImage(img, r.x, r.y, r.size, r.size, 0, 0, px, px)
  }
  useEffect(() => {
    const c = view.current
    if (!c || !img) return
    c.width = c.height = Math.round(FRAME * devicePixelRatio)
    draw(c, c.width)
  }, [img, zoom, off])

  const place = (o: Offset, z = zoom) => img && setOff(clampOffset(img.width, img.height, FRAME, z, o))
  const zoomTo = (z: number) => {
    const next = Math.min(4, Math.max(1, z))
    setZoom(next)
    place(off, next)
  }
  async function rotate() {
    if (!img) return
    const c = document.createElement('canvas')
    ;[c.width, c.height] = [img.height, img.width]
    const ctx = c.getContext('2d')!
    ctx.translate(c.width, 0)
    ctx.rotate(Math.PI / 2)
    ctx.drawImage(img, 0, 0)
    setImg(await createImageBitmap(c))
    setOff({ x: 0, y: 0 })
  }
  function save() {
    const c = document.createElement('canvas')
    c.width = c.height = PORTRAIT
    draw(c, PORTRAIT)
    done(c.toDataURL('image/jpeg', 0.85))
  }
  function keys(e: KeyboardEvent<HTMLDivElement>) {
    const step = ({ ArrowLeft: [-8, 0], ArrowRight: [8, 0], ArrowUp: [0, -8], ArrowDown: [0, 8] } as Record<string, number[]>)[e.key]
    if (step) place({ x: off.x + step[0], y: off.y + step[1] })
    else if (e.key === '+' || e.key === '=') zoomTo(zoom + 0.1)
    else if (e.key === '-') zoomTo(zoom - 0.1)
    else return
    e.preventDefault()
  }

  return (
    <Dialog label="Position your picture" close={() => close()}>
      <h1>Position your picture</h1>
      <div
        className="crop-frame"
        style={{ width: FRAME, height: FRAME }}
        tabIndex={0}
        role="group"
        aria-label="Picture position. Drag, or use the arrow keys to move and plus or minus to zoom."
        onKeyDown={keys}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = { x: e.clientX, y: e.clientY, o: off }
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (d && e.currentTarget.hasPointerCapture(e.pointerId)) place({ x: d.o.x + e.clientX - d.x, y: d.o.y + e.clientY - d.y })
        }}
        onPointerUp={() => (drag.current = null)}
        onWheel={(e) => zoomTo(zoom - e.deltaY / 500)}
      >
        <canvas ref={view} style={{ width: FRAME, height: FRAME }} />
      </div>
      <p className="row-sub">Drag to line it up. Only the area inside the circle shows as your picture.</p>
      <label className="field-label">
        Zoom
        <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => zoomTo(Number(e.target.value))} />
      </label>
      <div className="form-actions">
        <button type="button" className="button subtle" onClick={rotate} disabled={!img}>
          <Icon name="rotate" size={16} /> Rotate
        </button>
        <button type="button" className="button" onClick={() => close()}>
          Cancel
        </button>
        <button type="button" className="button primary" onClick={save} disabled={!img}>
          Use picture
        </button>
      </div>
    </Dialog>
  )
}

// First launch (and Edit profile): the threshold into Eleusinia.
function ProfileForm({ st, first, done }: { st: State; first: boolean; done: () => void }) {
  const [avatar, setAvatar] = useState(st.profile.avatar)
  const [picking, setPicking] = useState<File | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setBusy(true)
    api.call('setProfile', { username: f.get('username'), name: f.get('name'), about: f.get('about'), avatar }).then(done, (x) => {
      setErr(String(x.message ?? x).replace(/^.*Error: /, ''))
      setBusy(false)
    })
  }
  return (
    <main className="threshold">
      <div className="threshold-inner">
        {first && (
          <header className="threshold-head">
            <Emblem size={112} className="glow" />
            <Wordmark className="large" />
          </header>
        )}
        <form className="profile panel" onSubmit={submit}>
          <h1>{first ? 'Create your account' : 'Edit profile'}</h1>
          <div className="portrait-pick">
            <Avatar k={st.me} p={{ ...st.profile, avatar }} size={88} />
            <div>
              <label className="button file-button">
                {avatar ? 'Change picture' : 'Choose a picture'}
                <input
                  type="file"
                  accept="image/*"
                  className="visually-hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = '' // so choosing the same file again reopens the cropper
                    if (f) setPicking(f)
                  }}
                />
              </label>
              {avatar && (
                <button type="button" className="button subtle" onClick={() => setAvatar('')}>
                  Use my pattern instead
                </button>
              )}
            </div>
          </div>
          {first ? (
            <label className="field-label">
              Username
              <input name="username" required pattern="[A-Za-z0-9_.]{2,20}" maxLength={20} autoFocus aria-describedby="username-hint" spellCheck={false} />
              <span id="username-hint" className="hint">
                Letters, numbers, dots and underscores. A random 4-digit number is added to make your friend ID, like name#1234. It cannot be changed later.
              </span>
            </label>
          ) : (
            <div className="field-label">
              Friend ID
              <div className="id-plate">
                <b>{st.profile.handle}</b>
                <CopyButton text={st.profile.handle} label="Copy friend ID" />
              </div>
            </div>
          )}
          <label className="field-label">
            Display name
            <input name="name" defaultValue={st.profile.name} required maxLength={40} autoFocus={!first} />
          </label>
          <label className="field-label">
            <span>
              About you <span className="hint inline">(optional)</span>
            </span>
            <input name="about" defaultValue={st.profile.about} maxLength={200} />
          </label>
          {err && (
            <p role="alert" className="form-error">
              {err}
            </p>
          )}
          {picking && (
            <Cropper
              file={picking}
              done={(url) => {
                setAvatar(url)
                setPicking(null)
              }}
              close={(e) => {
                setPicking(null)
                if (e) setErr(e)
              }}
            />
          )}
          <div className="form-actions">
            {!first && (
              <button type="button" className="button" onClick={done}>
                Cancel
              </button>
            )}
            <button className="button primary" disabled={busy}>
              {busy ? 'Saving…' : first ? 'Enter Eleusinia' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}

type CardProps = { k: Key; st: State; p: Profile; close: () => void; message: () => void; edit: () => void; run: Run }

function Card({ k, st, p, close, message, edit, run }: CardProps) {
  const [removing, setRemoving] = useState(false)
  const status = st.friends[k]
  const shared = k === st.me ? [] : Object.values(st.groups).filter((g) => g.members.includes(k)).map(groupName)
  const then = (fn: () => void) => () => {
    fn()
    close()
  }
  return (
    <Dialog label={`Profile of ${p.name}`} close={close} className="card-dialog">
      <ProfileBanner st={st} k={k} p={p} />
      <div className="card">
        <div className="card-portrait">
          <Avatar k={k} p={p} size={96} online={k === st.me ? undefined : st.online.includes(k)} />
        </div>
        <h1>{p.name}</h1>
        {k !== st.me && (
          <p className="row-sub">
            {st.online.includes(k) ? (st.relayed.includes(k) ? 'Online through a friend: voice and text only' : 'Online') : 'Offline'}
            {st.versions[k] && ` · Eleusinia ${st.versions[k].app}`}
          </p>
        )}
        {p.about && <p className="about">{p.about}</p>}
        <ProfileActivity st={st} k={k} />
        <dl className="identity">
          <dt>Friend ID</dt>
          <dd>
            <b>{p.handle || 'not set up yet'}</b> {p.handle && k !== st.me && <CopyButton text={p.handle} label="Copy friend ID" />}
          </dd>
          <dt>Key ending</dt>
          <dd>
            <b className="tail">{keyTail(k)}</b>
          </dd>
          {shared.length > 0 && (
            <>
              <dt>Groups</dt>
              <dd className="plain">{shared.join(', ')}</dd>
            </>
          )}
        </dl>
        <div className="card-actions">
          {k === st.me && (
            <button className="button primary" onClick={then(edit)}>
              Edit profile
            </button>
          )}
          {status === 'friend' && (
            <button className="button primary" onClick={then(message)}>
              Message
            </button>
          )}
          {status === 'friend' && (
            <button className="button danger" onClick={() => setRemoving(true)}>
              Remove friend
            </button>
          )}
          {status === 'outgoing' && <span className="row-sub">Friend request sent</span>}
          {k !== st.me && (!status || status === 'incoming') && (
            <button className="button primary" onClick={then(() => run(api.call('addFriend', k, p)))}>
              {status ? 'Accept request' : 'Add friend'}
            </button>
          )}
          <button className="button" onClick={close}>
            Close
          </button>
        </div>
      </div>
      {removing && <Confirm ask={removeFriendAsk(p.name, () => (run(api.call('removeFriend', k)), close()))} close={() => setRemoving(false)} />}
    </Dialog>
  )
}

function NewGroup({ st, people, run, close, open }: { st: State; people: People; run: Run; close: () => void; open: (c: string) => void }) {
  const friends = Object.keys(st.friends)
    .filter((k) => st.friends[k] === 'friend')
    .sort((a, b) => people.name(a).localeCompare(people.name(b)))
  return (
    <Dialog label="Create a group" close={close}>
      <form
        className="new-group"
        onSubmit={(e) => {
          e.preventDefault()
          const f = new FormData(e.currentTarget)
          run(api.call('createGroup', f.get('name'), f.getAll('member')).then(open))
          close()
        }}
      >
        <h1>Create a group</h1>
        <label className="field-label">
          Group name
          <input name="name" required maxLength={100} autoFocus />
        </label>
        <fieldset>
          <legend>Members</legend>
          {friends.map((k) => (
            <label key={k} className="check-row">
              <input type="checkbox" role="switch" name="member" value={k} />
              <Avatar k={k} p={people.prof(k)} size={28} />
              <span>{people.name(k)}</span>
            </label>
          ))}
          {!friends.length && <p className="quiet">Add friends first; groups are made from your friends. You can add more members later.</p>}
        </fieldset>
        <div className="form-actions">
          <button type="button" className="button" onClick={close}>
            Cancel
          </button>
          <button className="button primary">Create group</button>
        </div>
      </form>
    </Dialog>
  )
}

// What the Eleusinia emblem opens (also Ctrl K): go anywhere by typing, copy your ID, updates, a problem report, quit.
function Menu({ st, people, close, go, report }: { st: State; people: People; close: () => void; go: (c: string | null) => void; report: () => void }) {
  const [q, setQ] = useState('')
  const [update, setUpdate] = useState('')
  const [copied, setCopied] = useState(false)
  const places = [
    ...Object.values(st.groups).map((g) => ({ id: g.id, label: groupName(g), sub: `${g.members.length} members`, k: null as Key | null, g })),
    ...Object.keys(st.friends)
      .filter((k) => st.friends[k] === 'friend')
      .map((k) => ({ id: dmId(st.me, k), label: people.name(k), sub: people.prof(k).handle, k, g: null as Group | null })),
  ]
  const hits = q.trim() ? places.filter((p) => (p.label + ' ' + p.sub).toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6) : []
  const pick = (id: string) => (go(id), close())
  const check = async () => {
    setUpdate('Checking…')
    const r = await window.api.checkUpdates().catch(() => null)
    setUpdate(!r ? 'Could not reach the update server' : r.state === 'found' ? `Eleusinia ${r.version} is downloading` : r.state === 'latest' ? `Eleusinia ${r.current} is the newest` : `Eleusinia ${r.current}: updates come with the installed app`)
  }
  return (
    <Dialog label="Eleusinia menu" close={close} className="menu-dialog">
      <div className="menu">
        <div className="field with-icon">
          <Icon name="search" size={16} />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && hits[0] && pick(hits[0].id)}
            aria-label="Go to a friend or group"
            placeholder="Go to a friend or group"
          />
        </div>
        {hits.map((h) => (
          <button key={h.id} className="menu-item" onClick={() => pick(h.id)}>
            {h.g ? <GroupEmblem g={h.g} size={28} /> : <Avatar k={h.k!} p={people.prof(h.k!)} size={28} online={people.isOnline(h.k!)} />}
            <span className="row-text">
              <span className="row-title">{h.label}</span>
              <span className="row-sub">{h.sub}</span>
            </span>
          </button>
        ))}
        {q.trim() && !hits.length && <p className="row-sub menu-none">No friend or group by that name</p>}
        <hr />
        <button
          className="menu-item"
          onClick={() => {
            navigator.clipboard.writeText(st.profile.handle)
            setCopied(true)
          }}
        >
          <Icon name="copy" size={16} />
          <span className="row-title">{copied ? 'Copied' : 'Copy my friend ID'}</span>
          <span className="tail">{st.profile.handle}</span>
        </button>
        <button className="menu-item" onClick={check}>
          <Icon name="rotate" size={16} />
          <span className="row-text">
            <span className="row-title">Check for updates</span>
            {update && <span className="row-sub">{update}</span>}
          </span>
        </button>
        <button className="menu-item" onClick={() => report()}>
          <Icon name="info" size={16} />
          <span className="row-title">Report a problem</span>
        </button>
        <hr />
        <button className="menu-item danger" onClick={() => window.api.quit()}>
          <Icon name="leave" size={16} />
          <span className="row-title">Quit Eleusinia</span>
        </button>
      </div>
    </Dialog>
  )
}

type ConvProps = { st: State; conv: string; people: People; run: Run; home: () => void }

// A group or direct chat: the voice chamber on the left, text in the middle, group members on the right.
// A group's name, renamed in place: click it, type, Enter or click away saves, Escape keeps the old name.
function GroupName({ g, run }: { g: Group; run: Run }) {
  const [draft, setDraft] = useState<string | null>(null)
  const done = useRef(false)
  const finish = (keep: boolean) => {
    if (done.current || draft === null) return
    done.current = true
    const n = draft.trim()
    setDraft(null)
    if (keep && n && n !== g.name) run(api.call('renameGroup', g.id, n))
  }
  if (draft === null)
    return (
      <h1>
        <button className="group-name" title="Rename the group" onClick={() => ((done.current = false), setDraft(g.name))}>
          {groupName(g)}
        </button>
      </h1>
    )
  return (
    <h1>
      <input
        className="group-name-edit"
        autoFocus
        value={draft}
        maxLength={100}
        aria-label="Group name"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => (e.key === 'Enter' ? finish(true) : e.key === 'Escape' && (e.stopPropagation(), finish(false)))}
        onBlur={() => finish(true)}
      />
    </h1>
  )
}

type MemberProps = { k: Key; p: Profile; name: string; you: boolean; online: boolean; speaking: boolean; a?: State['activity'][Key]; show: People['show'] }
// One row of the members list. Kept from redrawing unless it changed: every state push builds new profile and activity
// objects, and a server's list has a couple of hundred rows. show only opens things, so it is left out.
const MemberRow = memo(
  function MemberRow({ k, p, name, you, online, speaking, a, show }: MemberProps) {
    return (
      <button className={`member${speaking ? ' speaking' : ''}`} onClick={(e) => show(k, e.currentTarget)} onContextMenu={card(show, k)} aria-label={`${name}${you ? ' (you)' : ''}: open profile`}>
        <Avatar k={k} p={p} size={32} online={online} />
        <span className="row-text">
          <span className="row-title">
            <span className="user">{name}</span>
            {you && <span className="row-sub"> (you)</span>}
          </span>
          <span className="row-sub">{a?.game ? <ActivityLine a={a} /> : p.handle}</span>
        </span>
      </button>
    )
  },
  (x, y) =>
    x.k === y.k &&
    x.name === y.name &&
    x.you === y.you &&
    x.online === y.online &&
    x.speaking === y.speaking &&
    x.p.name === y.p.name &&
    x.p.handle === y.p.handle &&
    x.p.avatar === y.p.avatar &&
    JSON.stringify(x.a?.game ?? null) === JSON.stringify(y.a?.game ?? null),
)

// What shows speaking rings redraws by itself when someone starts or stops speaking, not the conversation around it.
function Speaking({ children }: { children: () => ReactNode }) {
  useSpeaking()
  return <>{children()}</>
}

function Conversation({ st, conv, people, run, home }: ConvProps) {
  const [shareDialog, setShareDialog] = useState(false)
  const [picking, setPicking] = useState<File | null>(null)
  const [cameraDialog, setCameraDialog] = useState(false)
  const [left, setLeft] = useWidth('voice', 320)
  const [right, setRight] = useWidth('members', 230)
  const { prof, name, user, isOnline, show } = people
  const group = st.groups[conv]
  const other = conv.split('_').find((k) => k !== st.me)!
  const title = group ? groupName(group) : name(other)
  const inCall = call.conv === conv
  const others = call.active.get(conv)?.size ?? 0
  // A speaking ring wherever someone in this call appears.
  const ring = (k: Key) => (inCall && call.speaking.has(k) ? ' speaking' : '')
  const member = (k: Key) => (
    <MemberRow key={k} k={k} p={prof(k)} name={name(k)} you={k === st.me} online={isOnline(k)} speaking={!!ring(k)} a={st.activity[k]} show={show} />
  )
  // One round, icon-only call button; its name stays readable to screen readers (and to the smoke test).
  const control = (label: string, icon: Parameters<typeof Icon>[0]['name'], onClick: () => void, pressed?: boolean, extra = '') => (
    <button className={`round ${pressed ? 'on' : ''} ${extra}`} aria-pressed={pressed} title={label} onClick={onClick}>
      <Icon name={icon} size={18} />
      <span className="visually-hidden">{label}</span>
    </button>
  )
  const ringing = !group && !inCall && others > 0
  // A direct chat lists its two people the way a group lists its members.
  const members = group ? group.members : [st.me, other]
  const onlineMembers = members.filter(isOnline)
  const offlineMembers = members.filter((k) => !isOnline(k))

  return (
    <>
      <aside className={`voice ${inCall ? 'live' : ''}`} style={{ width: left }} aria-label="Voice call">
        {group && (
          <div className="chamber-id">
            <label className="crest-pick" title="Change the group picture">
              <GroupEmblem g={group} size={56} />
              <span className="crest-edit" aria-hidden="true">
                <Icon name="camera" size={16} />
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="visually-hidden"
                aria-label="Change the group picture"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = '' // so the same file can be chosen again
                  if (f) setPicking(f)
                }}
              />
            </label>
            <GroupName g={group} run={run} />
            {group.avatar && (
              <button className="button subtle" onClick={() => run(api.call('setGroupPicture', conv, ''))}>
                Remove picture
              </button>
            )}
            {picking && (
              <Cropper
                file={picking}
                done={(url) => {
                  setPicking(null)
                  run(api.call('setGroupPicture', conv, url))
                }}
                close={(err) => {
                  setPicking(null)
                  if (err) run(Promise.reject(new Error(err)))
                }}
              />
            )}
          </div>
        )}
        <section className="chamber" aria-labelledby="voice-title">
          <h2 id="voice-title">Voice</h2>
          {inCall ? (
            <>
              <VoiceSignal name={name} />
              <div className="callers" aria-live="polite">
                <Speaking>
                  {() => (
                    <>
                    <div className={`caller${ring(st.me)}`}>
                      <button className="caller-who" onClick={(e) => show(st.me, e.currentTarget)} aria-label="Your profile">
                        <Avatar k={st.me} p={st.profile} size={44} />
                      </button>
                      <span className="row-text">
                        <span className="row-title">
                          You <VoiceMark muted={call.muted} deafened={call.deafened} />
                        </span>
                        {call.pushToTalk() && !call.muted && !call.deafened && (
                          <span className={`row-sub ptt ${call.talking ? 'on' : ''}`}>
                            {call.talking ? 'Talking' : `Push to talk: hold ${call.pushToTalk()!.label}`}
                          </span>
                        )}
                      </span>
                    </div>
                    {[...call.peers].map(([k, p]) => (
                      <div className={`caller state-${p.pc.connectionState}${ring(k)}`} key={k} onContextMenu={card(show, k)}>
                        <button className="caller-who" onClick={(e) => show(k, e.currentTarget.closest('.caller') as HTMLElement)} aria-label={`${name(k)}: open profile`}>
                          <Avatar k={k} p={prof(k)} size={44} />
                        </button>
                        <span className="row-text">
                          <span className="row-title">
                            <button className="user" onClick={(e) => show(k, e.currentTarget.closest('.caller') as HTMLElement)}>
                              {name(k)}
                            </button>{' '}
                            <VoiceMark {...call.voices.get(k)} />
                          </span>
                          <span className="row-sub">
                            {STATE_WORDS[p.pc.connectionState] ?? p.pc.connectionState}
                            {p.relayed && p.pc.connectionState === 'connected' && ' · through the chat connection, not direct'}
                          </span>
                          <PersonVolume st={st} k={k} name={name(k)} />
                        </span>
                      </div>
                    ))}
                    </>
                  )}
                </Speaking>
                {!call.peers.size && <p className="quiet">Waiting for others to join…</p>}
              </div>
              {call.notices().map((n) => (
                <p className="call-notice" role="status" key={n}>
                  {n}
                </p>
              ))}
              {call.mismatched().map((m) => (
                <p className="call-notice" role="status" key={m.k}>
                  {m.newer
                    ? `${name(m.k)} is on a newer Eleusinia (${m.app}) that cannot call this one. Restart Eleusinia once its update has downloaded to join them.`
                    : `${name(m.k)} is on an older Eleusinia (${m.app}) that cannot join this call. They need to update.`}
                </p>
              ))}
              <div className="call-controls" role="toolbar" aria-label="Call controls">
                {control(call.muted || call.deafened ? 'Unmute' : 'Mute', call.muted || call.deafened ? 'micOff' : 'mic', call.toggleMute, call.muted || call.deafened)}
                {control(call.deafened ? 'Undeafen' : 'Deafen', call.deafened ? 'headphonesOff' : 'headphones', call.toggleDeafen, call.deafened)}
                {control(call.sharing() ? 'Stream settings' : 'Share screen', 'screen', () => setShareDialog(true), !!call.sharing())}
                {call.sharing() && control('Stop sharing', 'screenOff', () => call.stopShare())}
                {control(call.filming() ? 'Camera settings' : 'Turn on camera', 'camera', () => setCameraDialog(true), !!call.filming())}
                {call.filming() && control('Turn off camera', 'cameraOff', call.stopCamera)}
                {control('Leave call', 'phone', call.leave, undefined, 'leave')}
              </div>
              {shareDialog && <ShareDialog close={() => setShareDialog(false)} />}
              {cameraDialog && <CameraDialog st={st} close={() => setCameraDialog(false)} />}
            </>
          ) : (
            <>
              {others > 0 && (
                <ul className="room" aria-label="In the call">
                  {[...call.active.get(conv)!].map((k) => (
                    <li key={k}>
                      <button className="room-who" onClick={(e) => show(k, e.currentTarget)}>
                        <Avatar k={k} p={prof(k)} size={24} />
                        <span className="row-title">{name(k)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button className="button primary wide" onClick={() => run(call.join(conv))}>
                <Icon name="phone" size={16} /> {others ? `Join call (${others})` : 'Start call'}
              </button>
            </>
          )}
        </section>
      </aside>
      <Splitter label="Resize voice sidebar" width={left} set={setLeft} dir={1} />

      <Chat
        st={st}
        conv={conv}
        title={title}
        people={people}
        run={run}
        home={home}
        stage={
          inCall ? (
            <>
              <Oculus st={st} name={name} show={show} />
              <Stage st={st} name={name} settings={() => setShareDialog(true)} />
            </>
          ) : ringing ? (
            <RingBar conv={conv} who={other} st={st} name={name} join={(muted) => run(call.join(conv).then(() => muted && !call.muted && call.toggleMute()))} />
          ) : null
        }
      />

      <Splitter label="Resize members sidebar" width={right} set={setRight} dir={-1} />
      <aside className="members" style={{ width: right }} aria-label={group ? 'Group members' : 'People in this chat'}>
        <h2>Online ({onlineMembers.length})</h2>
        <Speaking>{() => onlineMembers.map(member)}</Speaking>
        <hr />
        <h2>Offline ({offlineMembers.length})</h2>
        <Speaking>{() => offlineMembers.map(member)}</Speaking>
      </aside>
    </>
  )
}
