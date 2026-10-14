import { type FormEvent, type KeyboardEvent, type PointerEvent, type ReactNode, useEffect, useReducer, useRef, useState } from 'react'
import { type Key, type Msg, type Profile, type State, MAX_TEXT, dmId, identicon, keyTail } from '../shared/protocol'
import * as call from './call'

const api = window.api
const NOBODY: Profile = { handle: '', name: '', about: '', avatar: '' }
const labelOf = (p: Profile, k: Key) => p.name || p.handle || k.slice(0, 8)

type Run = (p: Promise<unknown>) => Promise<void>
// What every screen needs to show people: their profile, their name, and their name as a button opening their card.
type People = { prof: (k: Key) => Profile; name: (k: Key) => string; user: (k: Key) => ReactNode; isOnline: (k: Key) => boolean }

const [MIN_W, MAX_W] = [160, 480]
// A sidebar width the user can drag, remembered on this computer.
function useWidth(id: string, initial: number) {
  const [w, setW] = useState(() => Number(localStorage.getItem('width-' + id)) || initial)
  const set = (v: number) => {
    const clamped = Math.max(MIN_W, Math.min(MAX_W, Math.round(v)))
    setW(clamped)
    localStorage.setItem('width-' + id, String(clamped))
  }
  return [w, set] as const
}

// Drag handle on a sidebar's inner edge. `dir` is 1 when dragging right widens the sidebar, -1 when it narrows it.
function Splitter({ label, width, set, dir }: { label: string; width: number; set: (v: number) => void; dir: 1 | -1 }) {
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

export default function App() {
  const [st, setSt] = useState<State | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [card, setCard] = useState<Key | null>(null)
  const [editing, setEditing] = useState(false)
  const [err, setErr] = useState('')
  const [, tick] = useReducer((n: number) => n + 1, 0)

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
      <button key={k} className="user" onClick={() => setCard(k)}>
        {labelOf(prof(k), k)}
      </button>
    ),
    isOnline: (k) => k === st.me || st.online.includes(k),
  }
  // A conversation that no longer exists (friend removed) falls back to Home.
  const open = sel && (st.groups[sel] || st.friends[sel.split('_').find((k) => k !== st.me)!] === 'friend') ? sel : null

  return (
    <div className="app">
      {open ? (
        <Conversation key={open} st={st} conv={open} people={people} run={run} home={() => setSel(null)} />
      ) : (
        <Home st={st} people={people} run={run} open={setSel} />
      )}
      {err && (
        <p role="alert" className="toast">
          {err} <button onClick={() => setErr('')}>Dismiss</button>
        </p>
      )}
      {card && (
        <Card
          k={card}
          st={st}
          p={{ ...prof(card), name: people.name(card) }}
          close={() => setCard(null)}
          message={() => setSel(dmId(st.me, card))}
          edit={() => setEditing(true)}
          run={run}
        />
      )}
    </div>
  )
}

function Avatar({ k, p, big }: { k: Key; p: Profile; big?: boolean }) {
  const cls = big ? 'avatar big' : 'avatar'
  if (p.avatar) return <img className={cls} src={p.avatar} alt="" />
  // No uploaded picture: a pattern drawn from the person's public key, so it differs for everyone.
  const { hue, cells } = identicon(k)
  return (
    <svg className={cls} viewBox="0 0 5 5" aria-hidden="true" style={{ background: `hsl(${hue} 40% 22%)` }}>
      {cells.map((on, i) => on && <rect key={i} x={i % 5} y={Math.floor(i / 5)} width={1.02} height={1.02} fill={`hsl(${hue} 75% 68%)`} />)}
    </svg>
  )
}

function Home({ st, people, run, open }: { st: State; people: People; run: Run; open: (conv: string) => void }) {
  const [width, setWidth] = useWidth('home', 240)
  const { prof, name, user } = people
  const byStatus = (s: string) => Object.keys(st.friends).filter((k) => st.friends[k] === s)
  const friends = byStatus('friend').sort((a, b) => name(a).localeCompare(name(b)))
  const friend = (k: Key) => (
    <button key={k} className="item" onClick={() => open(dmId(st.me, k))}>
      <Avatar k={k} p={prof(k)} />
      {name(k)}
      {call.active.get(dmId(st.me, k))?.size ? ' (calling)' : ''}
    </button>
  )
  const online = friends.filter((k) => st.online.includes(k))
  const offline = friends.filter((k) => !st.online.includes(k))

  return (
    <>
      <aside style={{ width }} aria-label="Your groups">
        <div className="row">
          <Avatar k={st.me} p={st.profile} />
          {user(st.me)}
        </div>
        <Settings st={st} />
        <h2>Groups</h2>
        {Object.values(st.groups).map((g) => (
          <button key={g.id} className="item" onClick={() => open(g.id)}>
            {g.name || 'Unnamed group'}
            {call.active.get(g.id)?.size ? ' (in call)' : ''}
          </button>
        ))}
        <details>
          <summary>New group</summary>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const f = new FormData(e.currentTarget)
              run(api.call('createGroup', f.get('name'), f.getAll('member')).then(open))
              e.currentTarget.reset()
            }}
          >
            <input name="name" aria-label="Group name" placeholder="Group name" required maxLength={100} />
            {friends.map((k) => (
              <label key={k}>
                <input type="checkbox" name="member" value={k} /> {name(k)}
              </label>
            ))}
            <button>Create</button>
          </form>
        </details>
      </aside>
      <Splitter label="Resize groups sidebar" width={width} set={setWidth} dir={1} />

      <main className="home">
        <Search run={run} />
        {byStatus('incoming').map((k) => (
          <div className="row" key={k}>
            <Avatar k={k} p={prof(k)} />
            <span>{user(k)} wants to be friends</span>
            <span className="tail">{keyTail(k)}</span>
            <button onClick={() => run(api.call('addFriend', k))}>Accept</button>
            <button onClick={() => run(api.call('removeFriend', k))}>Decline</button>
          </div>
        ))}
        {byStatus('outgoing').map((k) => (
          <div className="row" key={k}>
            <Avatar k={k} p={prof(k)} />
            <span>{name(k)}: request sent</span>
            <button onClick={() => run(api.call('removeFriend', k))}>Cancel</button>
          </div>
        ))}

        <section className="online">
          <h2>Online ({online.length})</h2>
          {online.map(friend)}
        </section>
        <hr />
        <section className="offline">
          <h2>Offline ({offline.length})</h2>
          {offline.map(friend)}
        </section>
        {!friends.length && <p className="dim">No friends yet. Search for a friend ID above to add someone.</p>}
      </main>
    </>
  )
}

type Found = { key: Key; profile: Profile }

// Looks an ID up and lists everyone who holds it; the request goes only to the row that is clicked.
function Search({ run }: { run: Run }) {
  const [found, setFound] = useState<Found[] | null>(null)
  const [busy, setBusy] = useState(false)
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const input = e.currentTarget.elements.namedItem('code') as HTMLInputElement
    setBusy(true)
    setFound(null)
    run(api.call('findFriend', input.value).then(setFound)).then(() => setBusy(false))
  }
  return (
    <div className="search-box">
      <form className="search" onSubmit={submit}>
        <input name="code" aria-label="Friend ID" placeholder="Find a friend by ID, e.g. name#1234" />
        <button disabled={busy}>{busy ? 'Searching…' : 'Search'}</button>
      </form>
      {found && (
        <div className="results" role="group" aria-label="People with this ID">
          {found.length > 1 && (
            <p className="dim">{found.length} different people are using this ID. Ask your friend for their key ending (shown on the right) and pick that one.</p>
          )}
          {found.map((r) => (
            <button
              key={r.key}
              className="item result"
              onClick={() => {
                run(api.call('addFriend', r.key, r.profile))
                setFound(null)
              }}
            >
              <Avatar k={r.key} p={r.profile} />
              <span>
                <b>{r.profile.handle}</b> {r.profile.name}
              </span>
              <span className="tail" title="Key ending">
                {keyTail(r.key)}
              </span>
            </button>
          ))}
          <p className="dim">Click a person to send a friend request.</p>
        </div>
      )}
    </div>
  )
}

// Square-crops and shrinks a picture so it is small enough to send to every contact.
async function shrink(file: File) {
  const bmp = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const side = Math.min(bmp.width, bmp.height)
  canvas.getContext('2d')!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 128, 128)
  return canvas.toDataURL('image/jpeg', 0.8)
}

function ProfileForm({ st, first, done }: { st: State; first: boolean; done: () => void }) {
  const [avatar, setAvatar] = useState(st.profile.avatar)
  const [err, setErr] = useState('')
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    api.call('setProfile', { username: f.get('username'), name: f.get('name'), about: f.get('about'), avatar }).then(done, (x) => setErr(String(x.message ?? x)))
  }
  return (
    <main className="empty">
      <form className="profile" onSubmit={submit}>
        <h1>{first ? 'Welcome to Eleusinia' : 'Edit profile'}</h1>
        {first && <p className="dim">Set up your profile. Friends and people in your groups will see it.</p>}
        <Avatar k={st.me} p={{ ...st.profile, avatar }} big />
        <label>
          Profile picture (optional; the pattern above is yours until you choose one)
          <input
            type="file"
            accept="image/*"
            onChange={(e) => e.target.files?.[0] && shrink(e.target.files[0]).then(setAvatar, () => setErr('That picture could not be read'))}
          />
        </label>
        {avatar && (
          <button type="button" onClick={() => setAvatar('')}>
            Remove picture
          </button>
        )}
        {first ? (
          <label>
            Username
            <input name="username" required pattern="[A-Za-z0-9_.]{2,20}" maxLength={20} autoFocus aria-describedby="username-hint" />
            <span id="username-hint" className="dim">
              Letters, numbers, dots and underscores. A random 4-digit number is added to make your friend ID, like name#1234. It cannot be changed later.
            </span>
          </label>
        ) : (
          <p>
            Friend ID: <b>{st.profile.handle}</b>
          </p>
        )}
        <label>
          Display name
          <input name="name" defaultValue={st.profile.name} required maxLength={40} />
        </label>
        <label>
          About you (optional)
          <input name="about" defaultValue={st.profile.about} maxLength={200} />
        </label>
        {err && <p role="alert">{err}</p>}
        <button>{first ? 'Get started' : 'Save'}</button>
        {!first && (
          <button type="button" onClick={done}>
            Cancel
          </button>
        )}
      </form>
    </main>
  )
}

type CardProps = { k: Key; st: State; p: Profile; close: () => void; message: () => void; edit: () => void; run: Run }

function Card({ k, st, p, close, message, edit, run }: CardProps) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    ref.current?.showModal()
  }, [])
  const status = st.friends[k]
  const then = (fn: () => void) => () => {
    fn()
    close()
  }
  return (
    // Clicking the backdrop (the dialog element itself, outside the inner box) closes it; Esc does too.
    <dialog ref={ref} onClose={close} onClick={(e) => e.target === ref.current && close()} aria-label={`Profile of ${p.name}`}>
      <div className="card">
        <Avatar k={k} p={p} big />
        <h1>{p.name}</h1>
        {k !== st.me && <p className="dim">{st.online.includes(k) ? 'Online' : 'Offline'}</p>}
        {p.about && <p>{p.about}</p>}
        <p>
          Friend ID: <b>{p.handle || 'not set up yet'}</b> {p.handle && <button onClick={() => navigator.clipboard.writeText(p.handle)}>Copy</button>}
        </p>
        <p>
          Key ending: <b className="tail">{keyTail(k)}</b>
        </p>
        <div className="row">
          {k === st.me && <button onClick={then(edit)}>Edit profile</button>}
          {status === 'friend' && <button onClick={then(message)}>Message</button>}
          {status === 'friend' && <button onClick={then(() => run(api.call('removeFriend', k)))}>Remove friend</button>}
          {status === 'outgoing' && <span className="dim">Friend request sent</span>}
          {k !== st.me && (!status || status === 'incoming') && (
            <button onClick={then(() => run(api.call('addFriend', k, p)))}>{status ? 'Accept request' : 'Add friend'}</button>
          )}
          <button onClick={close}>Close</button>
        </div>
      </div>
    </dialog>
  )
}

function Settings({ st }: { st: State }) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const set = (p: Partial<State['settings']>) => api.call('setSettings', p)
  const pick = (kind: string, label: string, field: 'mic' | 'out') => (
    <label>
      {label}
      <select value={st.settings[field]} onChange={(e) => set({ [field]: e.target.value })}>
        <option value="">System default</option>
        {devices.filter((d) => d.kind === kind && d.deviceId !== 'default').map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || d.deviceId.slice(0, 8)}
          </option>
        ))}
      </select>
    </label>
  )
  return (
    <details onToggle={() => navigator.mediaDevices.enumerateDevices().then(setDevices)}>
      <summary>Friend ID and settings</summary>
      <label>
        Your friend ID (share this)
        <input readOnly value={st.profile.handle} onFocus={(e) => e.target.select()} />
      </label>
      <button onClick={() => navigator.clipboard.writeText(st.profile.handle)}>Copy friend ID</button>
      <p>
        Your key ending: <b className="tail">{keyTail(st.me)}</b>
      </p>
      <label>
        Voice bitrate: {st.settings.audioKbps} kbps
        <input
          type="range"
          min={8}
          max={256}
          step={8}
          value={st.settings.audioKbps}
          onChange={(e) => set({ audioKbps: Number(e.target.value) })}
        />
      </label>
      {pick('audioinput', 'Microphone', 'mic')}
      {pick('audiooutput', 'Speakers', 'out')}
    </details>
  )
}

type ConvProps = { st: State; conv: string; people: People; run: Run; home: () => void }

// A group or direct chat: voice on the left, text in the middle, group members on the right.
function Conversation({ st, conv, people, run, home }: ConvProps) {
  const [left, setLeft] = useWidth('voice', 320)
  const [right, setRight] = useWidth('members', 220)
  const { prof, name, user, isOnline } = people
  const group = st.groups[conv]
  const title = group ? group.name || 'Unnamed group' : name(conv.split('_').find((k) => k !== st.me)!)
  const inCall = call.conv === conv
  const others = call.active.get(conv)?.size ?? 0
  const member = (k: Key) => (
    <div className="row" key={k}>
      <Avatar k={k} p={prof(k)} />
      {user(k)}
    </div>
  )

  return (
    <>
      <aside className="voice" style={{ width: left }} aria-label="Voice call">
        <button className="home" onClick={home}>
          ← Home
        </button>
        <h1>{title}</h1>
        <h2>Voice call</h2>
        {inCall ? (
          <>
            <div className="row">
              <button aria-pressed={call.muted} onClick={call.toggleMute}>
                {call.muted ? 'Unmute' : 'Mute'}
              </button>
              <button onClick={call.leave}>Leave call</button>
            </div>
            <div className="callers" aria-live="polite">
              <div className="row">
                <Avatar k={st.me} p={st.profile} />
                <span>You{call.muted ? ' (muted)' : ''}</span>
              </div>
              {[...call.peers].map(([k, p]) => (
                <div className="row" key={k}>
                  <Avatar k={k} p={prof(k)} />
                  <span>
                    {name(k)}: {p.pc.connectionState}
                  </span>
                </div>
              ))}
              {!call.peers.size && <p className="dim">Waiting for others to join…</p>}
            </div>
          </>
        ) : (
          <button onClick={() => run(call.join(conv))}>{others ? `Join call (${others})` : 'Start call'}</button>
        )}
      </aside>
      <Splitter label="Resize voice sidebar" width={left} set={setLeft} dir={1} />

      <Chat st={st} conv={conv} title={title} people={people} run={run} />

      {group && (
        <>
          <Splitter label="Resize members sidebar" width={right} set={setRight} dir={-1} />
          <aside className="members" style={{ width: right }} aria-label="Group members">
            <h2>Online ({group.members.filter(isOnline).length})</h2>
            {group.members.filter(isOnline).map(member)}
            <hr />
            <h2>Offline ({group.members.filter((k) => !isOnline(k)).length})</h2>
            {group.members.filter((k) => !isOnline(k)).map(member)}
          </aside>
        </>
      )}
    </>
  )
}

function Chat({ st, conv, title, people, run }: { st: State; conv: string; title: string; people: People; run: Run }) {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [acked, setAcked] = useState(0)
  const end = useRef<HTMLDivElement>(null)
  const { prof, name, user } = people

  useEffect(() => {
    api.call('history', conv).then((h) => {
      setMsgs(h.msgs)
      setAcked(h.acked)
    })
    return api.on((e) => {
      if (e.type === 'msg' && e.m.conv === conv) setMsgs((m) => [...m, e.m])
      if (e.type === 'acked' && e.conv === conv) setAcked(e.seq)
    })
  }, [conv])
  useEffect(() => {
    end.current?.scrollIntoView() // returns a promise in current Chromium, so it must not be the effect's return value
  }, [msgs])

  const group = st.groups[conv]
  const addable = group ? Object.keys(st.friends).filter((k) => st.friends[k] === 'friend' && !group.members.includes(k)) : []

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const input = e.currentTarget.elements.namedItem('text') as HTMLInputElement
    if (!input.value.trim()) return
    run(api.call('send', conv, input.value))
    input.value = ''
  }

  return (
    <main>
      <header>
        <h1>{group ? title : user(conv.split('_').find((k) => k !== st.me)!)}</h1>
        {addable.length > 0 && (
          <select aria-label="Add a member" value="" onChange={(e) => run(api.call('addToGroup', conv, e.target.value))}>
            <option value="">Add member…</option>
            {addable.map((k) => (
              <option key={k} value={k}>
                {name(k)}
              </option>
            ))}
          </select>
        )}
      </header>

      <div className="msgs">
        {[...msgs].sort((a, b) => a.ts - b.ts).map((m) => (
          <div key={m.author + m.seq} className="msg">
            <Avatar k={m.author} p={prof(m.author)} />
            <p>
              {user(m.author)} <time>{new Date(m.ts).toLocaleString()}</time>
              {m.author === st.me && m.seq > acked && <i> pending</i>}
              <br />
              {m.text}
            </p>
          </div>
        ))}
        <div ref={end} />
      </div>

      <form className="send" onSubmit={submit}>
        <input name="text" aria-label="Message" placeholder={`Message ${title}`} maxLength={MAX_TEXT} autoComplete="off" autoFocus />
        <button>Send</button>
      </form>
    </main>
  )
}
