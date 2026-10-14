import { type FormEvent, type KeyboardEvent, type ReactNode, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react'
import { type Group, type Key, type Msg, type Profile, type State, MAX_TEXT, dmId, keyTail, stack } from '../shared/protocol'
import * as call from './call'
import { Avatar, CopyButton, Dialog, Emblem, GroupEmblem, Icon, Info, Splitter, Wordmark, useWidth } from './ui'

const api = window.api
const NOBODY: Profile = { handle: '', name: '', about: '', avatar: '' }
const labelOf = (p: Profile, k: Key) => p.name || p.handle || k.slice(0, 8)
const groupName = (g: Group) => g.name || 'Unnamed group'

type Run = (p: Promise<unknown>) => Promise<void>
// What every screen needs to show people: their profile, their name, and their name as a button opening their card.
type People = { prof: (k: Key) => Profile; name: (k: Key) => string; user: (k: Key) => ReactNode; isOnline: (k: Key) => boolean }
type Modal = { kind: 'card'; k: Key } | { kind: 'settings' } | { kind: 'group' } | { kind: 'delete' } | null

export default function App() {
  const [st, setSt] = useState<State | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [modal, setModal] = useState<Modal>(null)
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
      <button key={k} className="user" onClick={() => setModal({ kind: 'card', k })}>
        {labelOf(prof(k), k)}
      </button>
    ),
    isOnline: (k) => k === st.me || st.online.includes(k),
  }
  // A conversation that no longer exists (friend removed) falls back to Home.
  const open = sel && (st.groups[sel] || st.friends[sel.split('_').find((k) => k !== st.me)!] === 'friend') ? sel : null

  return (
    <div className="app">
      <Rail st={st} open={open} go={setSel} show={setModal} />
      {open ? (
        <Conversation key={open} st={st} conv={open} people={people} run={run} home={() => setSel(null)} />
      ) : (
        <Home st={st} people={people} run={run} open={setSel} newGroup={() => setModal({ kind: 'group' })} />
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
          message={() => setSel(dmId(st.me, modal.k))}
          edit={() => setEditing(true)}
          run={run}
        />
      )}
      {modal?.kind === 'settings' && <SettingsDialog st={st} close={() => setModal(null)} edit={() => setEditing(true)} remove={() => setModal({ kind: 'delete' })} />}
      {modal?.kind === 'delete' && <DeleteAccount st={st} close={() => setModal(null)} />}
      {modal?.kind === 'group' && <NewGroup st={st} people={people} run={run} close={() => setModal(null)} open={setSel} />}
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
  const { prof, name, user, isOnline } = people
  const byStatus = (s: string) => Object.keys(st.friends).filter((k) => st.friends[k] === s)
  const friends = byStatus('friend').sort((a, b) => name(a).localeCompare(name(b)))
  const friend = (k: Key) => (
    <button key={k} className="row-button" onClick={() => open(dmId(st.me, k))}>
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
        Key ending <span className="tail">{keyTail(st.me)}</span>
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
    const timer = setTimeout(() => {
      api.call('findFriend', q).then(
        (r: Found[]) => id === latest.current && (setFound(r), setBusy(false)),
        () => id === latest.current && setBusy(false),
      )
    }, 350)
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
          {sameId && <p className="notice">Some people here share the same ID. Ask your friend for their key ending and choose that one.</p>}
          {found.map((r) => (
            <button key={r.key} className="row-button result" disabled={st.friends[r.key] === 'friend' || st.friends[r.key] === 'outgoing'} onClick={() => pick(r)}>
              <Avatar k={r.key} p={r.profile} size={36} />
              <span className="row-text">
                <span className="row-title">
                  <b>{r.profile.handle}</b> {r.profile.name}
                </span>
                {status(r.key) && <span className="row-sub">{status(r.key)}</span>}
              </span>
              <span className="tail" title="Key ending">
                {keyTail(r.key)}
              </span>
            </button>
          ))}
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

// First launch (and Edit profile): the threshold into Eleusinia.
function ProfileForm({ st, first, done }: { st: State; first: boolean; done: () => void }) {
  const [avatar, setAvatar] = useState(st.profile.avatar)
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
                  onChange={(e) => e.target.files?.[0] && shrink(e.target.files[0]).then(setAvatar, () => setErr('That picture could not be read'))}
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
        {k !== st.me && <p className="row-sub">{st.online.includes(k) ? 'Online' : 'Offline'}</p>}
        {p.about && <p className="about">{p.about}</p>}
        <dl className="identity">
          <dt>Friend ID</dt>
          <dd>
            <b>{p.handle || 'not set up yet'}</b> {p.handle && <CopyButton text={p.handle} label="Copy friend ID" />}
          </dd>
          <dt>Key ending</dt>
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
              <input type="checkbox" name="member" value={k} />
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

// Microphone, speakers and voice quality. Shown in Settings and inside the voice panel.
function AudioSettings({ st }: { st: State }) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then(setDevices)
  }, [])
  const set = (p: Partial<State['settings']>) => api.call('setSettings', p)
  const pick = (kind: string, label: string, field: 'mic' | 'out') => (
    <label className="field-label">
      {label}
      <select value={st.settings[field]} onChange={(e) => set({ [field]: e.target.value })}>
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
      {pick('audioinput', 'Microphone', 'mic')}
      {pick('audiooutput', 'Speakers', 'out')}
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

function SettingsDialog({ st, close, edit, remove }: { st: State; close: () => void; edit: () => void; remove: () => void }) {
  return (
    <Dialog label="Settings" close={close} className="settings-dialog">
      <h1>Settings</h1>
      <section className="settings-section">
        <h2>Voice</h2>
        <AudioSettings st={st} />
      </section>
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

const STATE_WORDS: Record<string, string> = {
  new: 'Connecting…',
  connecting: 'Connecting…',
  connected: 'Connected',
  disconnected: 'Reconnecting…',
  failed: 'Reconnecting…', // call.ts retries until the peer leaves or goes offline
  closed: 'Disconnected',
}

// A group or direct chat: the voice chamber on the left, text in the middle, group members on the right.
function Conversation({ st, conv, people, run, home }: ConvProps) {
  const [left, setLeft] = useWidth('voice', 320)
  const [right, setRight] = useWidth('members', 230)
  const { prof, name, user, isOnline } = people
  const group = st.groups[conv]
  const other = conv.split('_').find((k) => k !== st.me)!
  const title = group ? groupName(group) : name(other)
  const inCall = call.conv === conv
  const others = call.active.get(conv)?.size ?? 0
  const member = (k: Key) => (
    <div className="member" key={k}>
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
              <div className="callers" aria-live="polite">
                <div className="caller">
                  <Avatar k={st.me} p={st.profile} size={44} />
                  <span className="row-text">
                    <span className="row-title">You</span>
                    {(call.muted || call.deafened) && <span className="row-sub">{call.deafened ? 'Deafened' : 'Muted'}</span>}
                  </span>
                  {call.deafened ? <Icon name="headphonesOff" size={16} /> : call.muted && <Icon name="micOff" size={16} />}
                </div>
                {[...call.peers].map(([k, p]) => (
                  <div className={`caller state-${p.pc.connectionState}`} key={k}>
                    <Avatar k={k} p={prof(k)} size={44} />
                    <span className="row-text">
                      <span className="row-title">{name(k)}</span>
                      <span className="row-sub">
                        {STATE_WORDS[p.pc.connectionState] ?? p.pc.connectionState}
                        {p.relayed && p.pc.connectionState === 'connected' && ' · relayed through the chat link'}
                      </span>
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
            </>
          ) : (
            <>
              <button className="button primary wide" onClick={() => run(call.join(conv))}>
                <Icon name="phone" size={16} /> {others ? `Join call (${others})` : 'Start call'}
              </button>
            </>
          )}
        </section>
        <details className="audio-panel">
          <summary>Audio devices and quality</summary>
          <AudioSettings st={st} />
        </details>
      </aside>
      <Splitter label="Resize voice sidebar" width={left} set={setLeft} dir={1} />

      <Chat st={st} conv={conv} title={title} people={people} run={run} home={home} />

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

function Chat({ st, conv, title, people, run, home }: { st: State; conv: string; title: string; people: People; run: Run; home: () => void }) {
  const [leaving, setLeaving] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [acked, setAcked] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [length, setLength] = useState(0)
  const list = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  const box = useRef<HTMLTextAreaElement>(null)
  const { prof, name, user, isOnline } = people

  useEffect(() => {
    api.call('history', conv).then((h) => {
      setMsgs(h.msgs)
      setAcked(h.acked)
      setLoaded(true)
    })
    return api.on((e) => {
      if (e.type === 'msg' && e.m.conv === conv) setMsgs((m) => [...m, e.m])
      if (e.type === 'acked' && e.conv === conv) setAcked(e.seq)
    })
  }, [conv])
  // Follow new messages only if the reader was already at the bottom, or wrote the newest one themselves.
  useLayoutEffect(() => {
    const el = list.current
    if (el && (atBottom.current || msgs[msgs.length - 1]?.author === st.me)) el.scrollTop = el.scrollHeight
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
        {group ? <GroupEmblem g={group} size={32} /> : <Avatar k={other} p={prof(other)} size={32} online={isOnline(other)} />}
        <div className="row-text">
          <h1>{group ? title : user(other)}</h1>
          <span className="row-sub">{group ? `${group.members.length} members · ${group.members.filter(isOnline).length} online` : isOnline(other) ? 'Online' : 'Offline'}</span>
        </div>
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
