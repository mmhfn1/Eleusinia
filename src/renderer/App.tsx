import { type FormEvent, type KeyboardEvent, type ReactNode, useEffect, useReducer, useRef, useState } from 'react'
import { type Offset, clampOffset, cropRect } from '../shared/crop'
import { type Group, type Key, type Profile, type State, dmId, keyTail } from '../shared/protocol'
import * as call from './call'
import { Avatar, CopyButton, Dialog, Emblem, GroupEmblem, Icon, Splitter, Wordmark, useWidth } from './ui'
import { Chat } from './Chat'
import { CameraDialog, Oculus, PersonVolume, RingBar, STATE_WORDS, ShareDialog, Stage, VoiceMark, VoiceSignal } from './Media'
import { DeleteAccount, ReportDialog, SettingsDialog } from './Settings'
import { type Modal, NOBODY, type People, type Run, api, card, groupName, labelOf } from './common'

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

  // Ctrl K opens the Eleusinia menu from anywhere, ready to type where to go.
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
        <Home st={st} people={people} run={run} open={go} ring={(c) => (go(c), run(call.join(c)))} newGroup={() => setModal({ kind: 'group' })} />
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
          ring={() => (go(dmId(st.me, modal.k)), run(call.join(dmId(st.me, modal.k))))}
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
      <button className="rail-mark" aria-label="Eleusinia menu" aria-haspopup="dialog" onClick={() => show({ kind: 'menu' })} {...tipFor('Eleusinia menu (Ctrl K)')}>
        <Emblem size={42} />
      </button>
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

function Home({ st, people, run, open, ring, newGroup }: { st: State; people: People; run: Run; open: (conv: string) => void; ring: (conv: string) => void; newGroup: () => void }) {
  const [width, setWidth] = useWidth('home', 260)
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
          <span className="row-sub">{prof(k).handle}</span>
        </span>
        {inCallIn(k) && <span className="row-where">In a call in {groupName(inCallIn(k)!)}</span>}
        {call.active.get(dmId(st.me, k))?.size ? (
          <span className="call-chip">
            <Icon name="phone" size={14} /> Calling
          </span>
        ) : null}
      </button>
      <span className="row-actions">
        <button className="round" aria-label={`Message ${name(k)}`} title="Message" onClick={() => open(dmId(st.me, k))}>
          <Icon name="send" size={16} />
        </button>
        {isOnline(k) && (
          <button className="round" aria-label={`Call ${name(k)}`} title="Call" onClick={() => ring(dmId(st.me, k))}>
            <Icon name="phone" size={16} />
          </button>
        )}
      </span>
    </div>
  )
  const online = friends.filter((k) => st.online.includes(k))
  const offline = friends.filter((k) => !st.online.includes(k))
  const incoming = byStatus('incoming')
  const outgoing = byStatus('outgoing')
  const groups = Object.values(st.groups).sort((a, b) => groupName(a).localeCompare(groupName(b)))
  const live = groups.filter((g) => call.active.get(g.id)?.size && call.conv !== g.id)

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
              <p className="quiet">Search for someone's friend ID above. Your own ID is in the sidebar for them to find you.</p>
            </div>
          )}
          </div>
          {(live.length > 0 || incoming.length > 0 || outgoing.length > 0) && (
          <div className="home-side">
          {live.map((g) => (
            <section key={g.id} className="live-call" aria-label={`Call in ${groupName(g)}`}>
              <h2>Live in {groupName(g)}</h2>
              <div className="live-row">
                <span className="live-faces">
                  {[...call.active.get(g.id)!].slice(0, 4).map((k) => (
                    <Avatar key={k} k={k} p={prof(k)} size={34} />
                  ))}
                </span>
                <span className="row-sub">{[...call.active.get(g.id)!].map(name).join(', ')}</span>
                <button className="button primary" onClick={() => ring(g.id)}>
                  Join call
                </button>
              </div>
            </section>
          ))}
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
        Unique Key <span className="tail">{keyTail(st.me)}</span>
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
          {sameId && <p className="notice">Some people here share the same ID. Ask your friend for their Unique Key and choose that one.</p>}
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
              <span className="tail" title="Unique Key">
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

type CardProps = { k: Key; st: State; p: Profile; close: () => void; message: () => void; ring: () => void; edit: () => void; run: Run }

function Card({ k, st, p, close, message, ring, edit, run }: CardProps) {
  const status = st.friends[k]
  const shared = k === st.me ? [] : Object.values(st.groups).filter((g) => g.members.includes(k)).map(groupName)
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
            {st.online.includes(k) ? (st.relayed.includes(k) ? 'Online through a friend: voice and text only' : 'Online') : 'Offline'}
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
          {status === 'friend' && st.online.includes(k) && (
            <button className="button" onClick={then(ring)}>
              <Icon name="phone" size={16} /> Call
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
          <kbd>Ctrl K</kbd>
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
  // One round, icon-only call button; its name stays readable to screen readers (and to the smoke test).
  const control = (label: string, icon: Parameters<typeof Icon>[0]['name'], onClick: () => void, pressed?: boolean, extra = '') => (
    <button className={`round ${pressed ? 'on' : ''} ${extra}`} aria-pressed={pressed} title={label} onClick={onClick}>
      <Icon name={icon} size={18} />
      <span className="visually-hidden">{label}</span>
    </button>
  )
  const ringing = !group && !inCall && others > 0
  const onlineMembers = group ? group.members.filter(isOnline) : []
  const offlineMembers = group ? group.members.filter((k) => !isOnline(k)) : []

  return (
    <>
      <aside className={`voice ${inCall ? 'live' : ''}`} style={{ width: left }} aria-label="Voice call">
        <button className="home back" onClick={home}>
          <Icon name="back" size={16} /> Home
        </button>
        {group ? (
          <div className="chamber-id">
            <GroupEmblem g={group} size={56} />
            <h1>{title}</h1>
          </div>
        ) : (
          <button className="chamber-id person" onClick={() => show(other)} aria-label={`Open ${title}'s profile`}>
            <Avatar k={other} p={prof(other)} size={64} online={isOnline(other)} />
            <h1>{title}</h1>
            <span className="row-sub">{prof(other).handle}</span>
          </button>
        )}
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
              <div className="call-controls" role="toolbar" aria-label="Call controls">
                {control(call.muted || call.deafened ? 'Unmute' : 'Mute', call.muted || call.deafened ? 'micOff' : 'mic', call.toggleMute, call.muted || call.deafened)}
                {control(call.deafened ? 'Undeafen' : 'Deafen', call.deafened ? 'headphonesOff' : 'headphones', call.toggleDeafen, call.deafened)}
                {control(call.sharing() ? 'Stream settings' : 'Share screen', 'screen', () => setShareDialog(true), !!call.sharing())}
                {call.sharing() && control('Stop sharing', 'close', call.stopShare)}
                {control(call.filming() ? 'Camera settings' : 'Turn on camera', 'camera', () => setCameraDialog(true), !!call.filming())}
                {call.filming() && control('Turn off camera', 'close', call.stopCamera)}
                {control('Leave call', 'phone', call.leave, undefined, 'leave')}
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
              <Oculus st={st} name={name} />
              <Stage name={name} settings={() => setShareDialog(true)} />
            </>
          ) : ringing ? (
            <RingBar conv={conv} who={other} st={st} name={name} join={(muted) => run(call.join(conv).then(() => muted && !call.muted && call.toggleMute()))} />
          ) : null
        }
      />

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
