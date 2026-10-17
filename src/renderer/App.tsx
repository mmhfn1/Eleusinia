import { type FormEvent, type KeyboardEvent, type ReactNode, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import { type Offset, clampOffset, cropRect } from '../shared/crop'
import { usable } from '../shared/devices'
import { type Action, type Hotkey, sameKeys } from '../shared/hotkeys'
import { type Area, type Diag, type Kind, type Meta, BUILD, cleanReport, describe } from '../shared/reports'
import { GATE_DB, dbOf } from '../shared/speaking'
import { type Group, type Key, type Msg, type Profile, type State, MAX_TEXT, dmId, keyTail, stack } from '../shared/protocol'
import type { SourceKind } from '../shared/sources'
import { type Quality, SOUND_KBPS, type Verdict, choices, defaultQuality, fitQuality, heightLabel, streamKbps } from '../shared/video'
import * as call from './call'
import { Avatar, CopyButton, Dialog, Emblem, GroupEmblem, Icon, Info, Splitter, Wordmark, useWidth } from './ui'

const api = window.api
const NOBODY: Profile = { handle: '', name: '', about: '', avatar: '' }
// Right-clicking a person opens their profile card instead of the browser's menu.
const card = (show: (k: Key) => void, k: Key) => (e: { preventDefault: () => void }) => {
  e.preventDefault()
  show(k)
}
const labelOf = (p: Profile, k: Key) => p.name || p.handle || k.slice(0, 8)
const groupName = (g: Group) => g.name || 'Unnamed group'

type Run = (p: Promise<unknown>) => Promise<void>
// What every screen needs to show people: their profile, their name, and their name as a button opening their card.
// show opens a person's profile card, the same one wherever they are clicked.
type People = { prof: (k: Key) => Profile; name: (k: Key) => string; user: (k: Key) => ReactNode; isOnline: (k: Key) => boolean; show: (k: Key) => void }
type Modal = { kind: 'card'; k: Key } | { kind: 'settings' } | { kind: 'group' } | { kind: 'delete' } | null

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

  if (!st) return null
  if (!st.profile.handle || editing) return <ProfileForm st={st} first={!st.profile.handle} done={() => setEditing(false)} />

  // Runs an action and shows its failure instead of swallowing it.
  const run: Run = (p) => p.then(() => setErr(''), (e) => setErr(String(e.message ?? e).replace(/^.*Error: /, '')))
  const prof = (k: Key) => (k === st.me ? st.profile : (st.profiles[k] ?? NOBODY))
  const people: People = {
    prof,
    name: (k) => labelOf(prof(k), k),
    user: (k) => (
      <button key={k} className="user" onClick={() => people.show(k)}>
        {labelOf(prof(k), k)}
      </button>
    ),
    isOnline: (k) => k === st.me || st.online.includes(k),
    show: (k) => setModal({ kind: 'card', k }),
  }
  // A conversation that no longer exists (friend removed) falls back to Home.
  const open = sel && (st.groups[sel] || st.friends[sel.split('_').find((k) => k !== st.me)!] === 'friend') ? sel : null

  return (
    <div className="app">
      <Rail st={st} open={open} go={go} show={setModal} />
      {open ? (
        <Conversation key={open} st={st} conv={open} people={people} run={run} home={() => go(null)} />
      ) : (
        <Home st={st} people={people} run={run} open={go} newGroup={() => setModal({ kind: 'group' })} />
      )}
      {update && (
        <div role="status" className="toast update-toast">
          <span>
            Eleusinia {update} is ready.{call.conv ? ' Restarting ends your call.' : ''}
          </span>
          <button className="button primary" onClick={() => window.api.installUpdate()}>
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
    </div>
  )
}

// The narrow rail on the far left: identity, Home, each group, and the global actions.
function Rail({ st, open, go, show }: { st: State; open: string | null; go: (c: string | null) => void; show: (m: Modal) => void }) {
  const [tip, setTip] = useState<{ text: string; top: number } | null>(null)
  const homeActive = !open || !st.groups[open]
  // Tooltips are drawn outside the rail so its scrolling list cannot clip them.
  const tipFor = (text: string) => ({
    onMouseEnter: (e: { currentTarget: HTMLElement }) => setTip({ text, top: e.currentTarget.getBoundingClientRect().top + 22 }),
    onFocus: (e: { currentTarget: HTMLElement }) => setTip({ text, top: e.currentTarget.getBoundingClientRect().top + 22 }),
    onMouseLeave: () => setTip(null),
    onBlur: () => setTip(null),
  })
  const item = (label: string, active: boolean, onClick: () => void, body: ReactNode, extra = '') => (
    <button className={`rail-item ${active ? 'active' : ''} ${extra}`} aria-label={label} aria-current={active ? 'page' : undefined} onClick={onClick} {...tipFor(label)}>
      {body}
    </button>
  )
  return (
    <nav className="rail" aria-label="Main">
      <div className="rail-mark">
        <Emblem size={38} />
      </div>
      {item('Home: friends and direct messages', homeActive, () => go(null), <Icon name="home" size={20} />)}
      <div className="rail-groups">
        {Object.values(st.groups).map((g) =>
          item(
            `${groupName(g)}${call.active.get(g.id)?.size || call.conv === g.id ? ' (call in progress)' : ''}`,
            open === g.id,
            () => go(g.id),
            <>
              <GroupEmblem g={g} size={34} />
              {(call.active.get(g.id)?.size || call.conv === g.id) && <span className="rail-badge" aria-hidden="true" />}
            </>,
          ),
        )}
        {item('Create a group', false, () => show({ kind: 'group' }), <Icon name="plus" size={20} />, 'rail-add')}
      </div>
      <div className="rail-foot">
        {item('Settings', false, () => show({ kind: 'settings' }), <Icon name="settings" size={20} />)}
        {item('Your profile', false, () => show({ kind: 'card', k: st.me }), <Avatar k={st.me} p={st.profile} size={34} />)}
      </div>
      {tip && (
        <div className="rail-tip" style={{ top: tip.top }} aria-hidden="true">
          {tip.text}
        </div>
      )}
    </nav>
  )
}

function Home({ st, people, run, open, newGroup }: { st: State; people: People; run: Run; open: (conv: string) => void; newGroup: () => void }) {
  const [width, setWidth] = useWidth('home', 260)
  const { prof, name, user, isOnline, show } = people
  const byStatus = (s: string) => Object.keys(st.friends).filter((k) => st.friends[k] === s)
  const friends = byStatus('friend').sort((a, b) => name(a).localeCompare(name(b)))
  const friend = (k: Key) => (
    <button key={k} className="row-button" onClick={() => open(dmId(st.me, k))} onContextMenu={card(show, k)}>
      <Avatar k={k} p={prof(k)} size={36} online={isOnline(k)} />
      <span className="row-text">
        <span className="row-title">{name(k)}</span>
        <span className="row-sub">{prof(k).handle}</span>
      </span>
      {call.active.get(dmId(st.me, k))?.size ? (
        <span className="call-chip">
          <Icon name="phone" size={14} /> Calling
        </span>
      ) : null}
    </button>
  )
  const online = friends.filter((k) => st.online.includes(k))
  const offline = friends.filter((k) => !st.online.includes(k))
  const incoming = byStatus('incoming')
  const outgoing = byStatus('outgoing')
  const groups = Object.values(st.groups).sort((a, b) => groupName(a).localeCompare(groupName(b)))

  return (
    <>
      <aside className="sidebar" style={{ width }} aria-label="Your groups">
        <header className="sidebar-head">
          <Wordmark />
        </header>
        <FriendId st={st} />
        <section className="sidebar-section">
          <div className="section-head">
            <h2>Groups</h2>
            <button className="icon-button" aria-label="Create a group" title="Create a group" onClick={newGroup}>
              <Icon name="plus" size={16} />
            </button>
          </div>
          {groups.map((g) => {
            const here = g.members.filter(isOnline).length
            const live = call.active.get(g.id)?.size || call.conv === g.id
            return (
              <button key={g.id} className="row-button item" onClick={() => open(g.id)}>
                <GroupEmblem g={g} size={34} />
                <span className="row-text">
                  <span className="row-title">{groupName(g)}</span>
                  <span className="row-sub">
                    {here} of {g.members.length} online
                  </span>
                </span>
                {live ? (
                  <span className="call-chip">
                    <Icon name="phone" size={14} /> In call
                  </span>
                ) : null}
              </button>
            )
          })}
          {!groups.length && <p className="quiet">No groups yet. Create one to talk with several friends at once.</p>}
        </section>
      </aside>
      <Splitter label="Resize groups sidebar" width={width} set={setWidth} dir={1} />

      <main className="workspace home">
        <header className="page-head">
          <h1>Friends</h1>
          <span className="page-sub">
            {online.length} of {friends.length} online
          </span>
        </header>
        <div className="page-body">
          <Search st={st} run={run} />

          {(incoming.length > 0 || outgoing.length > 0) && (
            <section className="requests" aria-label="Friend requests">
              <h2>Requests</h2>
              {incoming.map((k) => (
                <div className="request" key={k}>
                  <Avatar k={k} p={prof(k)} size={36} />
                  <span className="row-text">
                    <span className="row-title">{user(k)} wants to be friends</span>
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
                    <span className="row-sub">Request sent, waiting for them to accept</span>
                  </span>
                  <button className="button" onClick={() => run(api.call('removeFriend', k))}>
                    Cancel
                  </button>
                </div>
              ))}
            </section>
          )}

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
              <p className="quiet">Search for someone's friend ID above. Your own ID is in the sidebar for them to find you.</p>
            </div>
          )}
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
        Unique Key <span className="tail">{keyTail(st.me)}</span>
      </p>
    </section>
  )
}

type Found = { key: Key; profile: Profile }

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
    // Nobody found is asked again a few times: someone who just came online takes a few seconds to be findable.
    let timer: ReturnType<typeof setTimeout>
    const look = (tries: number) => {
      api.call('findFriend', q).then(
        (r: Found[]) => {
          if (id !== latest.current) return
          setFound(r)
          if (!r.length && tries > 0) timer = setTimeout(() => look(tries - 1), 3000)
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
        {busy ? 'Searching…' : found && (found.length ? found.some((f) => !st.friends[f.key]) ? 'Choose a person to send them a friend request.' : `${found.length} found` : 'No one online matches that.')}
      </p>
      {found && found.length > 0 && (
        <div className="results" role="group" aria-label="Suggestions">
          {sameId && <p className="notice">Some people here share the same ID. Ask your friend for their Unique Key and choose that one.</p>}
          {found.map((r) => (
            <button key={r.key} className="row-button result" disabled={st.friends[r.key] === 'friend' || st.friends[r.key] === 'outgoing'} onClick={() => pick(r)}>
              <Avatar k={r.key} p={r.profile} size={36} />
              <span className="row-text">
                <span className="row-title">
                  <b>{r.profile.handle}</b> {r.profile.name}
                </span>
                {status(r.key) && <span className="row-sub">{status(r.key)}</span>}
              </span>
              <span className="tail" title="Unique Key">
                {keyTail(r.key)}
              </span>
            </button>
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
              {avatar ? (
                <button type="button" className="button subtle" onClick={() => setAvatar('')}>
                  Use my pattern instead
                </button>
              ) : (
                <p className="row-sub">Optional</p>
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
  const status = st.friends[k]
  const then = (fn: () => void) => () => {
    fn()
    close()
  }
  return (
    <Dialog label={`Profile of ${p.name}`} close={close} className="card-dialog">
      <div className="card">
        <div className="card-portrait">
          <Avatar k={k} p={p} size={96} online={k === st.me ? undefined : st.online.includes(k)} />
        </div>
        <h1>{p.name}</h1>
        {k !== st.me && (
          <p className="row-sub">
            {st.online.includes(k) ? 'Online' : 'Offline'}
            {st.versions[k] && ` · Eleusinia ${st.versions[k].app}`}
          </p>
        )}
        {p.about && <p className="about">{p.about}</p>}
        <dl className="identity">
          <dt>Friend ID</dt>
          <dd>
            <b>{p.handle || 'not set up yet'}</b> {p.handle && <CopyButton text={p.handle} label="Copy friend ID" />}
          </dd>
          <dt>Unique Key</dt>
          <dd>
            <b className="tail">{keyTail(k)}</b>
          </dd>
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
            <button className="button danger" onClick={then(() => run(api.call('removeFriend', k)))}>
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
          Output volume <b>{Math.round(call.outVolume() * 100)}%</b>
        </label>
        <input id="out-volume" type="range" min={0} max={200} step={5} value={Math.round(call.outVolume() * 100)} onChange={(e) => set({ outVolume: Number(e.target.value) / 100 })} />
        <div className="range-ends" aria-hidden="true">
          <span>0%</span>
          <span>200%</span>
        </div>
      </div>
      {pick('audioinput', 'Microphone', 'mic')}
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

function SettingsDialog({ st, close, edit, remove }: { st: State; close: () => void; edit: () => void; remove: () => void }) {
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

function ReportDialog({ st, close }: { st: State; close: () => void }) {
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
function DeleteAccount({ st, close }: { st: State; close: () => void }) {
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

type ConvProps = { st: State; conv: string; people: People; run: Run; home: () => void }

const GRADE_WORDS = { good: 'good and stable', fair: 'degraded', poor: 'poor' }

// Your voice connection while in a call: a wifi sign coloured by quality, with ping on hover or focus.
function VoiceSignal({ name }: { name: (k: Key) => string }) {
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
function VoiceMark({ muted, deafened }: { muted?: boolean; deafened?: boolean }) {
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
function PersonVolume({ st, k, name }: { st: State; k: Key; name: string }) {
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

const STATE_WORDS: Record<string, string> = {
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

function ShareDialog({ close }: { close: () => void }) {
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
        const v = await call.checkStream('screen', src, q, sound)
        if (!v.ok) return setVerdict(v)
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
              <input type="checkbox" role="switch" checked={sound} onChange={(e) => setSound(e.target.checked)} />
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
      {verdict && !verdict.ok && <Refusal verdict={verdict} q={q!} viewers={viewers} />}
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
          {busy ? (current ? 'Applying…' : 'Checking…') : !current ? 'Share' : src && src.id !== current.src.id ? 'Switch' : 'Apply'}
        </button>
      </div>
    </Dialog>
  )
}

const CAN_SHARE_SOUND = navigator.userAgent.includes('Windows') // computer sound can only be captured on Windows

// Why a stream cannot start: the soft cap (see canStream).
function Refusal({ verdict, q, viewers }: { verdict: Verdict; q: Quality; viewers: number }) {
  if (verdict.ok) return null
  return (
    <p role="alert" className="form-error">
      {verdict.reason === 'upload'
        ? `You can't start streaming right now. Your upload is about ${mbps(verdict.uploadKbps)} Mbps, and ${heightLabel(q.height)} at ${q.fps} fps to ${viewers} ${viewers === 1 ? 'person' : 'people'} needs about ${mbps(verdict.needKbps)} Mbps along with anything you already send, so it would lower the quality of the call for others. Choose a lower quality, or try again when fewer people are in the call.`
        : "You can't start streaming right now. Someone already streaming is short of bandwidth, and another stream would lower the quality of the call for everyone. Try again shortly."}
    </p>
  )
}

// Choosing a camera and its quality, with a preview. Like a stream, the camera starts at 720p and 30 fps, goes as high
// as the camera allows, and the choice is final; turning it on checks it fits the call.
function CameraDialog({ st, close }: { st: State; close: () => void }) {
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
        const v = await call.checkStream('camera', cam.src, q)
        if (!v.ok) return setVerdict(v)
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
      {verdict && q && <Refusal verdict={verdict} q={q} viewers={viewers} />}
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
          {busy ? (current ? 'Applying…' : 'Checking…') : current ? 'Apply' : 'Turn on camera'}
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

function Stage({ name, settings }: { name: (k: Key) => string; settings: () => void }) {
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

// A group or direct chat: the voice chamber on the left, text in the middle, group members on the right.
function Conversation({ st, conv, people, run, home }: ConvProps) {
  const [shareDialog, setShareDialog] = useState(false)
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
    <div className={`member${ring(k)}`} key={k} onContextMenu={card(show, k)}>
      <Avatar k={k} p={prof(k)} size={32} online={isOnline(k)} />
      <span className="row-text">
        <span className="row-title">
          {user(k)}
          {k === st.me && <span className="row-sub"> (you)</span>}
        </span>
        <span className="row-sub">{prof(k).handle}</span>
      </span>
    </div>
  )
  const onlineMembers = group ? group.members.filter(isOnline) : []
  const offlineMembers = group ? group.members.filter((k) => !isOnline(k)) : []

  return (
    <>
      <aside className={`voice ${inCall ? 'live' : ''}`} style={{ width: left }} aria-label="Voice call">
        <button className="home back" onClick={home}>
          <Icon name="back" size={16} /> Home
        </button>
        <div className="chamber-id">
          {group ? <GroupEmblem g={group} size={56} /> : <Avatar k={other} p={prof(other)} size={56} online={isOnline(other)} />}
          <h1>{title}</h1>
          {!group && <p className="row-sub">{prof(other).handle}</p>}
        </div>
        <section className="chamber" aria-labelledby="voice-title">
          <h2 id="voice-title">Voice</h2>
          {inCall ? (
            <>
              <VoiceSignal name={name} />
              <div className="callers" aria-live="polite">
                <div className={`caller${ring(st.me)}`}>
                  <Avatar k={st.me} p={st.profile} size={44} />
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
                  <div className={`caller state-${p.pc.connectionState}${ring(k)}`} key={k}>
                    <Avatar k={k} p={prof(k)} size={44} />
                    <span className="row-text">
                      <span className="row-title">
                        {name(k)} <VoiceMark {...call.voices.get(k)} />
                      </span>
                      <span className="row-sub">
                        {STATE_WORDS[p.pc.connectionState] ?? p.pc.connectionState}
                        {p.relayed && p.pc.connectionState === 'connected' && ' · relayed through the chat link'}
                      </span>
                      <PersonVolume st={st} k={k} name={name(k)} />
                    </span>
                  </div>
                ))}
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
              <div className="call-controls">
                <button className={`button ${call.muted || call.deafened ? 'active' : ''}`} aria-pressed={call.muted || call.deafened} onClick={call.toggleMute}>
                  <Icon name={call.muted || call.deafened ? 'micOff' : 'mic'} size={16} /> {call.muted || call.deafened ? 'Unmute' : 'Mute'}
                </button>
                <button className={`button ${call.deafened ? 'active' : ''}`} aria-pressed={call.deafened} onClick={call.toggleDeafen}>
                  <Icon name={call.deafened ? 'headphonesOff' : 'headphones'} size={16} /> {call.deafened ? 'Undeafen' : 'Deafen'}
                </button>
                <button className="button danger" onClick={call.leave}>
                  <Icon name="phone" size={16} /> Leave call
                </button>
              </div>
              <div className="call-controls">
                {call.sharing() ? (
                  <>
                    <button className="button" onClick={() => setShareDialog(true)}>
                      <Icon name="screen" size={16} /> Stream settings
                    </button>
                    <button className="button" onClick={call.stopShare}>
                      Stop sharing
                    </button>
                  </>
                ) : (
                  <button className="button" onClick={() => setShareDialog(true)}>
                    <Icon name="screen" size={16} /> Share screen
                  </button>
                )}
              </div>
              <div className="call-controls">
                {call.filming() ? (
                  <>
                    <button className="button" onClick={() => setCameraDialog(true)}>
                      <Icon name="camera" size={16} /> Camera settings
                    </button>
                    <button className="button" onClick={call.stopCamera}>
                      Turn off camera
                    </button>
                  </>
                ) : (
                  <button className="button" onClick={() => setCameraDialog(true)}>
                    <Icon name="camera" size={16} /> Turn on camera
                  </button>
                )}
              </div>
              {shareDialog && <ShareDialog close={() => setShareDialog(false)} />}
              {cameraDialog && <CameraDialog st={st} close={() => setCameraDialog(false)} />}
            </>
          ) : (
            <>
              <button className="button primary wide" onClick={() => run(call.join(conv))}>
                <Icon name="phone" size={16} /> {others ? `Join call (${others})` : 'Start call'}
              </button>
            </>
          )}
        </section>
      </aside>
      <Splitter label="Resize voice sidebar" width={left} set={setLeft} dir={1} />

      <Chat st={st} conv={conv} title={title} people={people} run={run} home={home} stage={inCall ? <Stage name={name} settings={() => setShareDialog(true)} /> : null} />

      {group && (
        <>
          <Splitter label="Resize members sidebar" width={right} set={setRight} dir={-1} />
          <aside className="members" style={{ width: right }} aria-label="Group members">
            <h2>Online ({onlineMembers.length})</h2>
            {onlineMembers.map(member)}
            <hr />
            <h2>Offline ({offlineMembers.length})</h2>
            {offlineMembers.map(member)}
          </aside>
        </>
      )}
    </>
  )
}

const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString()
const dayLabel = (ts: number) =>
  sameDay(ts, Date.now()) ? 'Today' : sameDay(ts, Date.now() - 864e5) ? 'Yesterday' : new Date(ts).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const clock = (ts: number) => new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

type ChatProps = { st: State; conv: string; title: string; people: People; run: Run; home: () => void; stage: ReactNode }

// Messages a conversation opens with; older ones load on request, so a long history costs nothing until wanted.
const PAGE = 200

function Chat({ st, conv, title, people, run, home, stage }: ChatProps) {
  const [leaving, setLeaving] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [acked, setAcked] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [total, setTotal] = useState(0)
  const [more, setMore] = useState({ conv, limit: PAGE })
  const limit = more.conv === conv ? more.limit : PAGE
  const kept = useRef<number | null>(null) // the list's height before older messages were added above
  const [length, setLength] = useState(0)
  const list = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  const box = useRef<HTMLTextAreaElement>(null)
  const { prof, name, user, isOnline, show } = people

  useEffect(() => {
    api.call('history', conv, limit).then((h) => {
      setMsgs(h.msgs)
      setAcked(h.acked)
      setTotal(h.total)
      setLoaded(true)
    })
    return api.on((e) => {
      if (e.type === 'msg' && e.m.conv === conv) {
        setMsgs((m) => [...m, e.m])
        setTotal((t) => t + 1)
      }
      if (e.type === 'acked' && e.conv === conv) setAcked(e.seq)
    })
  }, [conv, limit])
  // Follow new messages only if the reader was already at the bottom, or wrote the newest one themselves.
  useLayoutEffect(() => {
    const el = list.current
    if (el && kept.current !== null) (el.scrollTop += el.scrollHeight - kept.current), (kept.current = null) // stay on what was being read
    else if (el && (atBottom.current || msgs[msgs.length - 1]?.author === st.me)) el.scrollTop = el.scrollHeight
  }, [msgs, st.me])

  const group = st.groups[conv]
  const other = conv.split('_').find((k) => k !== st.me)!
  const addable = group ? Object.keys(st.friends).filter((k) => st.friends[k] === 'friend' && !group.members.includes(k) && !group.left?.[k]) : []
  const sorted = [...msgs].sort((a, b) => a.ts - b.ts)
  const lastDelivered = [...sorted].reverse().find((m) => m.author === st.me && m.seq <= acked)

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const input = e.currentTarget.elements.namedItem('text') as HTMLTextAreaElement
    if (!input.value.trim()) return
    run(api.call('send', conv, input.value))
    input.value = ''
    grow()
  }
  // The composer grows with its text up to a few lines, then scrolls.
  function grow() {
    const el = box.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
    setLength(el.value.length)
  }
  function keys(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      e.currentTarget.form?.requestSubmit()
    }
  }

  // Consecutive messages by the same author within five minutes share one header (see stack), never across days.
  const rows: ReactNode[] = []
  stack(msgs).forEach(({ m, first }, i, all) => {
    const prev = all[i - 1]?.m
    const newDay = !prev || !sameDay(prev.ts, m.ts)
    if (newDay) rows.push(<DayRule key={'d' + m.ts} ts={m.ts} />)
    const continued = !first && !newDay
    const mine = m.author === st.me
    const pending = mine && m.seq > acked
    rows.push(
      <div key={m.author + m.seq} className={`msg ${mine ? 'mine' : ''} ${continued ? 'continued' : ''}`}>
        <div className="msg-gutter">{continued ? <time className="msg-hover-time">{clock(m.ts)}</time> : <Avatar k={m.author} p={prof(m.author)} size={36} />}</div>
        <div className="msg-main">
          {!continued && (
            <div className="msg-head">
              {user(m.author)}
              <time dateTime={new Date(m.ts).toISOString()} title={new Date(m.ts).toLocaleString()}>
                {clock(m.ts)}
              </time>
            </div>
          )}
          <p className="msg-text">{m.text}</p>
          {pending && (
            <span className="msg-status pending" title="Not delivered yet. It will be sent automatically when they are online.">
              <Icon name="clock" size={12} /> pending, sends when they are online
            </span>
          )}
          {m === lastDelivered && (
            <span className="msg-status delivered">
              <Icon name="check" size={12} /> Delivered
            </span>
          )}
        </div>
      </div>,
    )
  })

  return (
    <main className="workspace chat">
      <header className="chat-head">
        {group ? (
          <>
            <GroupEmblem g={group} size={32} />
            <div className="row-text">
              <h1>{title}</h1>
              <span className="row-sub">{`${group.members.length} members · ${group.members.filter(isOnline).length} online`}</span>
            </div>
          </>
        ) : (
          <button className="chat-person" onClick={() => show(other)} aria-label={`Open ${title}'s profile`}>
            <Avatar k={other} p={prof(other)} size={32} online={isOnline(other)} />
            <span className="row-text">
              <span className="chat-title">{title}</span>
              <span className="row-sub">
                {prof(other).handle} · {isOnline(other) ? 'Online' : 'Offline'}
              </span>
            </span>
          </button>
        )}
        {addable.length > 0 && (
          <label className="add-member">
            <Icon name="userPlus" size={16} />
            <select aria-label="Add a member" value="" onChange={(e) => run(api.call('addToGroup', conv, e.target.value))}>
              <option value="">Add member…</option>
              {addable.map((k) => (
                <option key={k} value={k}>
                  {name(k)}
                </option>
              ))}
            </select>
          </label>
        )}
        {group && (
          <button className="icon-button" aria-label="Leave group" title="Leave group" onClick={() => setLeaving(true)}>
            <Icon name="leave" size={18} />
          </button>
        )}
      </header>
      {leaving && (
        <Dialog label="Leave group" close={() => setLeaving(false)}>
          <h1>Leave {title}?</h1>
          <p>Its messages are deleted from this computer, and you cannot be added back to this group.</p>
          <div className="form-actions">
            <button className="button" onClick={() => setLeaving(false)}>
              Cancel
            </button>
            <button
              className="button danger"
              onClick={() => {
                if (call.conv === conv) call.leave()
                run(api.call('leaveGroup', conv))
                home()
              }}
            >
              <Icon name="leave" size={16} /> Leave group
            </button>
          </div>
        </Dialog>
      )}

      {stage}
      <div className="msgs" ref={list} onScroll={(e) => (atBottom.current = e.currentTarget.scrollHeight - e.currentTarget.scrollTop - e.currentTarget.clientHeight < 40)}>
        {loaded && !sorted.length && (
          <div className="empty-state">
            <Emblem size={84} className="faint" />
            <p className="empty-title">No messages yet</p>
            <p className="quiet">
              {group
                ? `Messages here travel directly between the members of ${title}. Members who are offline receive them when they return.`
                : `Messages travel directly between you and ${title}. If they are offline, yours wait and arrive when you are both online.`}
            </p>
          </div>
        )}
        {total > msgs.length && (
          <button
            className="button subtle earlier"
            onClick={() => {
              kept.current = list.current!.scrollHeight
              setMore({ conv, limit: limit + PAGE })
            }}
          >
            Show earlier messages
          </button>
        )}
        {rows}
      </div>

      <form className="send composer" onSubmit={submit}>
        <textarea
          ref={box}
          name="text"
          rows={1}
          aria-label={`Message ${title}`}
          placeholder={`Message ${title}`}
          maxLength={MAX_TEXT}
          onInput={grow}
          onKeyDown={keys}
          autoFocus
        />
        {length > MAX_TEXT - 500 && (
          <span className="counter" aria-live="polite">
            {MAX_TEXT - length} left
          </span>
        )}
        <button className="send-button" aria-label="Send message" title="Send (Enter). New line: Shift+Enter" disabled={!length}>
          <Icon name="send" size={18} />
        </button>
      </form>
    </main>
  )
}

function DayRule({ ts }: { ts: number }) {
  return (
    <div className="day-rule" role="separator" aria-label={dayLabel(ts)}>
      <span />
      <b>{dayLabel(ts)}</b>
      <span />
    </div>
  )
}
