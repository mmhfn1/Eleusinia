// Server settings: a wide dialog with its pages on the left. Every change is one signed op through `serverAct`;
// what the replay would refuse (src/shared/server.ts) is disabled here first, with the reason beside it.
import { type DragEvent, type FormEvent, type KeyboardEvent, useEffect, useState } from 'react'
import { type Key, type ServerView, type State } from '../shared/protocol'
import { Avatar, CopyButton, Dialog, Icon } from './ui'
import { NOBODY, type Run, api, labelOf } from './common'
import './server-settings.css'

type Srv = State['servers'][string]
type Role = Srv['roles'][number]
type Channel = Srv['channels'][number]
type Override = Channel['overrides'][string]

// Every permission in src/shared/server.ts PERMS (not imported: that module pulls in node:crypto), with plain words.
const PERM_TEXT: [string, string, string][] = [
  ['manageServer', 'Manage server', 'Change the name and picture.'],
  ['manageRoles', 'Manage roles', 'Create, edit, order and give the roles below their own.'],
  ['manageChannels', 'Manage channels', 'Create, edit and delete channels, and set who can use them.'],
  ['createInvites', 'Create invites', 'Make invite links to this server.'],
  ['viewAuditLog', 'See the audit log', 'Read who changed what in this server.'],
  ['kick', 'Kick members', 'Remove members below their highest role. They can rejoin with an invite.'],
  ['ban', 'Ban members', 'Remove members below their highest role and keep them out.'],
  ['changeNickname', 'Change nickname', 'Pick their own name in this server.'],
  ['manageNicknames', 'Manage nicknames', 'Change other members’ names in this server.'],
  ['viewChannel', 'See channels', 'See channels and read their messages.'],
  ['sendMessages', 'Send messages', 'Write in text channels.'],
  ['manageMessages', 'Manage messages', 'Delete other people’s messages in channels they can see.'],
  ['mentionEveryone', 'Mention everyone', 'Notify everyone in a channel at once.'],
  ['connect', 'Connect', 'Join voice channels.'],
  ['speak', 'Speak', 'Talk in voice channels.'],
  ['muteMembers', 'Mute members', 'Mute others in voice channels.'],
  ['deafenMembers', 'Deafen members', 'Stop others hearing a voice channel.'],
  ['moveMembers', 'Move members', 'Move others between voice channels.'],
  ['administrator', 'Administrator', 'Every permission, in every channel.'],
]
const AUDIT_WORDS: Record<string, string> = {
  create: 'created the server',
  'server.edit': 'changed the server’s name or picture',
  'role.add': 'created a role',
  'role.edit': 'edited a role',
  'role.delete': 'deleted a role',
  'role.move': 'reordered the roles',
  'member.roles': 'changed a member’s roles',
  'channel.add': 'created a channel',
  'channel.edit': 'edited a channel',
  'channel.delete': 'deleted a channel',
  'channel.move': 'moved a channel',
  'invite.add': 'made an invite link',
  'invite.revoke': 'revoked an invite link',
  join: 'let someone in with an invite',
  leave: 'left the server',
  kick: 'kicked a member',
  ban: 'banned someone',
  unban: 'lifted a ban',
  nickname: 'changed a nickname',
}
const PAGES = ['Overview', 'Roles', 'Members', 'Channels', 'Invites', 'Bans', 'Audit log'] as const
type Page = (typeof PAGES)[number]

const newId = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('')
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0')
const dot = (c: number) => (c ? hex(c) : 'var(--mist-2)') // colour 0 is "no colour"
const when = (ts: number) => new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
// A member's rank as the replay counts it: the owner above everyone, otherwise their highest role's index.
const rankOf = (s: Srv, k: Key) => (k === s.owner ? Infinity : Math.max(0, ...(s.members[k]?.roles ?? []).map((r) => s.roles.findIndex((x) => x.id === r))))

// A square crop of a chosen picture, small enough for a server op (isPicture: at most 60000 characters).
async function shrink(file: File): Promise<string> {
  const img = await createImageBitmap(file)
  const side = Math.min(img.width, img.height)
  const c = document.createElement('canvas')
  c.width = c.height = 256
  c.getContext('2d')!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 256, 256)
  img.close()
  for (let q = 0.85; q > 0.2; q -= 0.15) {
    const url = c.toDataURL('image/jpeg', q)
    if (url.length <= 60000) return url
  }
  throw new Error('That picture is too detailed to use')
}

// channel: open on the Channels page with that channel chosen (Edit channel in its right-click menu)
export function ServerSettings({ st, id, channel, close, run }: { st: State; id: string; channel?: string; close: () => void; run: Run }) {
  const s = st.servers[id]
  const [page, setPage] = useState<Page>(channel ? 'Channels' : 'Overview')
  if (!s)
    return (
      <Dialog label="Server settings" close={close}>
        <div className="empty-state">
          <span className="empty-title">Server not found</span>
          <p className="quiet">You are no longer in this server.</p>
        </div>
      </Dialog>
    )
  const act = (kind: string, body: object) => run(api.call('serverAct', id, kind, body))
  const p = { st, s, act, run, channel }
  return (
    <Dialog label={`${s.name} settings`} close={close} className="server-settings">
      <nav className="settings-nav" aria-label="Server settings">
        <div className="settings-nav-head">
          <ServerCrest s={s} size={28} />
          <span className="row-text">
            <span className="row-title">{s.name}</span>
            <span className="row-sub">Server settings</span>
          </span>
        </div>
        {PAGES.map((x) => (
          <button key={x} className={x === page ? 'settings-page active' : 'settings-page'} aria-current={x === page ? 'page' : undefined} onClick={() => setPage(x)}>
            {x}
          </button>
        ))}
      </nav>
      <div className="settings-pane">
        <h1>{page}</h1>
        {page === 'Overview' && <Overview {...p} />}
        {page === 'Roles' && <Roles {...p} />}
        {page === 'Members' && <Members {...p} />}
        {page === 'Channels' && <Channels {...p} />}
        {page === 'Invites' && <Invites {...p} />}
        {page === 'Bans' && <Bans {...p} />}
        {page === 'Audit log' && <Audit {...p} />}
      </div>
    </Dialog>
  )
}

type P = { st: State; s: Srv; act: (kind: string, body: object) => Promise<void>; run: Run; channel?: string }
const has = (s: Srv, perm: string) => s.mine.perms.includes(perm)
const name = (st: State, k: Key) => labelOf(st.profiles[k] ?? (k === st.me ? st.profile : NOBODY), k)
// Who or what an audit entry acted on: a person's name, a role's or channel's current name; nothing for an invite or
// anything since deleted
const targetOf = (st: State, s: ServerView, t: string) =>
  /^[0-9a-f]{64}$/.test(t) ? name(st, t) : (s.roles.find((r) => r.id === t)?.name ?? (s.channels.find((c) => c.id === t) ? '#' + s.channels.find((c) => c.id === t)!.name : ''))

// The server's picture, or its first letter like a group's crest (GroupEmblem in ui.tsx takes a Group).
function ServerCrest({ s, size }: { s: Srv; size: number }) {
  if (s.avatar) return <img className="crest" src={s.avatar} alt="" style={{ width: size, height: size }} />
  return (
    <span className="crest" style={{ width: size, height: size, fontSize: size * 0.46, ['--hue' as string]: 190 + (parseInt(s.id.slice(0, 4), 16) % 80) }} aria-hidden="true">
      {(s.name.trim()[0] ?? '?').toUpperCase()}
    </span>
  )
}

function Lacks({ what }: { what: string }) {
  return <p className="notice">You do not have the {what} permission, so this page is read only.</p>
}

function Overview({ s, act, run }: P) {
  const [nm, setNm] = useState(s.name)
  const [busy, setBusy] = useState(false)
  const can = has(s, 'manageServer')
  const save = (body: object) => {
    setBusy(true)
    act('server.edit', body).finally(() => setBusy(false))
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (nm.trim() && nm !== s.name) save({ name: nm.trim() })
  }
  return (
    <>
      {!can && <Lacks what="Manage server" />}
      <div className="portrait-pick">
        <ServerCrest s={s} size={88} />
        <div>
          <label className={can && !busy ? 'button file-button' : 'button file-button disabled'} aria-disabled={!can || busy}>
            {s.avatar ? 'Change picture' : 'Choose a picture'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="visually-hidden"
              disabled={!can || busy}
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = '' // so the same file can be chosen again
                if (f) run(shrink(f).then((avatar) => act('server.edit', { avatar })))
              }}
            />
          </label>
          {s.avatar && (
            <button type="button" className="button subtle" disabled={!can || busy} onClick={() => save({ avatar: '' })}>
              Remove picture
            </button>
          )}
        </div>
      </div>
      <form className="settings-section" onSubmit={submit}>
        <label className="field-label">
          Server name
          <input value={nm} onChange={(e) => setNm(e.target.value)} maxLength={100} required disabled={!can} />
        </label>
        <div className="settings-row">
          <button className="button primary" disabled={!can || busy || !nm.trim() || nm === s.name}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </>
  )
}

function Roles({ s, act }: P) {
  const top = [...s.roles].reverse() // highest first
  const [sel, setSel] = useState(top[0]?.id)
  const [drag, setDrag] = useState<string | null>(null)
  const can = has(s, 'manageRoles')
  const rank = s.mine.rank
  const movable = (i: number) => can && i >= 1 && i < rank
  const ownTop = s.roles[Math.min(rank, s.roles.length - 1)]
  const count = (r: Role, i: number) => (i === 0 ? Object.keys(s.members).length : Object.values(s.members).filter((m) => m.roles.includes(r.id)).length)
  const moveTo = (rid: string, to: number) => {
    if (to >= 1 && to < rank) act('role.move', { id: rid, to })
  }
  const key = (e: KeyboardEvent, r: Role, i: number) => {
    const to = e.key === 'ArrowUp' ? i + 1 : e.key === 'ArrowDown' ? i - 1 : -1
    if (to < 0) return
    e.preventDefault()
    moveTo(r.id, to)
  }
  const add = () => {
    const rid = newId()
    act('role.add', { id: rid, name: 'New role', color: 0, hoist: false, perms: [] }).then(() => setSel(rid))
  }
  const role = s.roles.find((r) => r.id === sel)
  return (
    <>
      {!can && <Lacks what="Manage roles" />}
      <div className="roles-split">
        <div className="role-list">
          <div className="section-head">
            <h2>Highest first</h2>
            <button className="icon-button" aria-label="Create a role" title={can && rank >= 1 ? 'Create a role' : 'You cannot create roles'} disabled={!can || rank < 1} onClick={add}>
              <Icon name="plus" size={16} />
            </button>
          </div>
          {top.map((r) => {
            const i = s.roles.indexOf(r)
            const m = movable(i)
            const over = (e: DragEvent) => {
              if (drag && drag !== r.id && movable(i)) e.preventDefault()
            }
            return (
              <div
                key={r.id}
                className={['role-row', r.id === sel && 'active', !m && 'fixed', drag === r.id && 'dragging'].filter(Boolean).join(' ')}
                draggable={m}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move'
                  setDrag(r.id)
                }}
                onDragEnd={() => setDrag(null)}
                onDragOver={over}
                onDrop={(e) => {
                  e.preventDefault()
                  if (drag) moveTo(drag, i)
                  setDrag(null)
                }}
              >
                <button
                  type="button"
                  className="role-grip"
                  disabled={!m}
                  aria-label={m ? `Move ${r.name}: arrow up or down` : `${r.name} cannot be moved`}
                  title={m ? 'Drag, or use the arrow keys, to reorder' : i === 0 ? '@everyone always stays at the bottom' : !can ? 'You cannot manage roles' : 'At or above your own role'}
                  onKeyDown={(e) => key(e, r, i)}
                >
                  <Grip />
                </button>
                <button type="button" className="role-pick" aria-current={r.id === sel || undefined} onClick={() => setSel(r.id)}>
                  <span className="role-dot" style={{ background: dot(r.color) }} />
                  <span className="row-title">{r.name}</span>
                  <span className="tail" title="Members with this role">
                    {count(r, i)}
                  </span>
                </button>
              </div>
            )
          })}
          <p className="hint">
            {rank >= 1e9 ? 'Drag to reorder. As the owner you can move and edit every role.' : `Drag to reorder. You can move and edit only the roles below your own (${ownTop?.name ?? '@everyone'}).`}
          </p>
        </div>
        {role ? <RoleEdit key={role.id} s={s} r={role} act={act} /> : <p className="quiet">Choose a role to edit it.</p>}
      </div>
    </>
  )
}

function RoleEdit({ s, r, act }: { s: Srv; r: Role; act: P['act'] }) {
  const i = s.roles.indexOf(r)
  const everyone = i === 0
  const [d, setD] = useState({ name: r.name, color: r.color, hoist: r.hoist, perms: r.perms })
  const [hexText, setHexText] = useState(hex(r.color))
  const [busy, setBusy] = useState(false)
  const [sure, setSure] = useState(false)
  const lock = !has(s, 'manageRoles') ? 'You do not have Manage roles.' : i >= s.mine.rank ? 'This role is at or above yours, so you cannot change it.' : ''
  const dirty = d.name !== r.name || d.color !== r.color || d.hoist !== r.hoist || d.perms.join() !== r.perms.join()
  const setColor = (c: number) => {
    setD({ ...d, color: c })
    setHexText(hex(c))
  }
  const save = () => {
    setBusy(true)
    const body: Record<string, unknown> = { id: r.id }
    if (d.name !== r.name) body.name = d.name.trim()
    if (d.color !== r.color) body.color = d.color
    if (d.hoist !== r.hoist) body.hoist = d.hoist
    if (d.perms.join() !== r.perms.join()) body.perms = d.perms
    act('role.edit', body).finally(() => setBusy(false))
  }
  return (
    <div className="role-edit">
      {lock && <p className="notice">{lock}</p>}
      <label className="field-label">
        Role name
        <input value={d.name} maxLength={100} disabled={!!lock || everyone} onChange={(e) => setD({ ...d, name: e.target.value })} />
      </label>
      {!everyone && (
        <div className="field-label">
          Colour
          <div className="colour-pick">
            <input type="color" aria-label="Pick a colour" value={hex(d.color)} disabled={!!lock} onChange={(e) => setColor(parseInt(e.target.value.slice(1), 16))} />
            <input
              className="colour-hex"
              aria-label="Colour as hex"
              value={hexText}
              maxLength={7}
              spellCheck={false}
              disabled={!!lock}
              onChange={(e) => {
                setHexText(e.target.value)
                const m = /^#?([0-9a-f]{6})$/i.exec(e.target.value.trim())
                if (m) setD({ ...d, color: parseInt(m[1], 16) })
              }}
            />
            <button type="button" className="button subtle" disabled={!!lock || d.color === 0} onClick={() => setColor(0)}>
              No colour
            </button>
          </div>
        </div>
      )}
      {!everyone && (
        <label className="check-row perm">
          <input type="checkbox" role="switch" checked={d.hoist} disabled={!!lock} onChange={(e) => setD({ ...d, hoist: e.target.checked })} />
          <span className="row-text">
            <span className="row-title">Show members separately</span>
            <span className="row-sub">Online members with this role get their own heading in the member list.</span>
          </span>
        </label>
      )}
      <h2>Permissions</h2>
      {PERM_TEXT.map(([perm, title, sub]) => {
        const why = lock ? '' : !has(s, perm) ? ' Your role does not have it, so you cannot give or take it.' : ''
        const off = !!lock || !!why
        return (
          <label key={perm} className={off ? 'check-row perm locked' : 'check-row perm'}>
            <input
              type="checkbox"
              role="switch"
              checked={d.perms.includes(perm)}
              disabled={off}
              onChange={(e) => setD({ ...d, perms: PERM_TEXT.map((x) => x[0]).filter((x) => (x === perm ? e.target.checked : d.perms.includes(x))) })}
            />
            <span className="row-text">
              <span className="row-title">{title}</span>
              <span className="row-sub">
                {sub}
                {why}
              </span>
            </span>
          </label>
        )
      })}
      <div className="settings-row save-bar">
        <button className="button primary" disabled={!!lock || !dirty || busy || !d.name.trim()} onClick={save}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>
        <button
          className="button subtle"
          disabled={!dirty || busy}
          onClick={() => {
            setD({ name: r.name, color: r.color, hoist: r.hoist, perms: r.perms })
            setHexText(hex(r.color))
          }}
        >
          Reset
        </button>
        {!everyone && (
          <button className="button danger" disabled={!!lock || busy} onClick={() => (sure ? act('role.delete', { id: r.id }) : setSure(true))} onBlur={() => setSure(false)}>
            {sure ? `Delete ${r.name}?` : 'Delete role'}
          </button>
        )}
      </div>
    </div>
  )
}

function Members({ st, s, act }: P) {
  const keys = Object.keys(s.members).sort((a, b) => name(st, a).localeCompare(name(st, b)))
  const [sel, setSel] = useState<Key | undefined>(keys[0])
  const k = sel && s.members[sel] ? sel : keys[0]
  return (
    <div className="roles-split">
      <div className="role-list">
        <h2>{keys.length === 1 ? '1 member' : `${keys.length} members`}</h2>
        {keys.map((m) => {
          const top = s.roles.find((r) => r.id === s.members[m].roles.at(-1)) // roles are stored in rank order
          return (
            <button key={m} type="button" className={m === k ? 'role-row role-pick active' : 'role-row role-pick'} aria-current={m === k || undefined} onClick={() => setSel(m)}>
              <Avatar k={m} p={st.profiles[m] ?? (m === st.me ? st.profile : NOBODY)} size={24} />
              <span className="row-title" style={top?.color ? { color: hex(top.color) } : undefined}>
                {s.members[m].nick ?? name(st, m)}
              </span>
              {m === s.owner && <span className="tail">Owner</span>}
            </button>
          )
        })}
      </div>
      {k ? <MemberEdit key={k} st={st} s={s} k={k} act={act} /> : <p className="quiet">Nobody is in this server.</p>}
    </div>
  )
}

function MemberEdit({ st, s, k, act }: { st: State; s: Srv; k: Key; act: P['act'] }) {
  const m = s.members[k]
  const me = k === st.me
  const rank = s.mine.rank
  const above = k === s.owner ? 'The owner cannot be changed.' : me ? '' : rankOf(s, k) >= rank ? 'Their highest role is at or above yours.' : ''
  const [nick, setNick] = useState(m.nick ?? '')
  const [sure, setSure] = useState<'' | 'kick' | 'ban'>('')
  const nickPerm = me ? 'changeNickname' : 'manageNicknames'
  const canNick = has(s, nickPerm)
  const rolesLock = !has(s, 'manageRoles') ? 'You do not have Manage roles.' : me ? 'You cannot change your own roles.' : above
  const setNickTo = (e: FormEvent) => {
    e.preventDefault()
    act('nickname', { key: k, nick: nick.trim() || null })
  }
  const toggle = (rid: string, on: boolean) => act('member.roles', { key: k, roles: on ? [...m.roles, rid] : m.roles.filter((x) => x !== rid) })
  const mod = (kind: 'kick' | 'ban') => (!has(s, kind) ? `You do not have ${kind === 'kick' ? 'Kick' : 'Ban'} members.` : me ? 'That is you.' : above)
  return (
    <div className="role-edit">
      <div className="settings-row">
        <Avatar k={k} p={st.profiles[k] ?? (me ? st.profile : NOBODY)} size={48} />
        <span className="row-text">
          <span className="row-title">{name(st, k)}</span>
          <span className="row-sub">Joined {when(m.joinedAt)}</span>
        </span>
      </div>
      <form className="settings-section" onSubmit={setNickTo}>
        <label className="field-label">
          Nickname in this server
          <input value={nick} maxLength={32} placeholder={name(st, k)} disabled={!canNick} onChange={(e) => setNick(e.target.value)} />
          {!canNick && <span className="hint">You do not have {me ? 'Change nickname' : 'Manage nicknames'}.</span>}
        </label>
        <div className="settings-row">
          <button className="button" disabled={!canNick || nick.trim() === (m.nick ?? '')}>
            {nick.trim() ? 'Set nickname' : 'Clear nickname'}
          </button>
        </div>
      </form>
      <h2>Roles</h2>
      {rolesLock && <p className="hint">{rolesLock}</p>}
      {s.roles.length < 2 && <p className="quiet">This server has no roles besides @everyone yet.</p>}
      {[...s.roles].reverse().map((r, j, all) => {
        const i = all.length - 1 - j
        if (i === 0) return null
        const off = !!rolesLock || i >= rank
        return (
          <label key={r.id} className={off ? 'check-row perm locked' : 'check-row perm'}>
            <input type="checkbox" checked={m.roles.includes(r.id)} disabled={off} onChange={(e) => toggle(r.id, e.target.checked)} />
            <span className="role-dot" style={{ background: dot(r.color) }} />
            <span className="row-title">{r.name}</span>
            {!rolesLock && i >= rank && <span className="row-sub">At or above your role</span>}
          </label>
        )
      })}
      <h2>Moderation</h2>
      <div className="settings-row">
        {(['kick', 'ban'] as const).map((kind) => (
          <button
            key={kind}
            className="button danger"
            disabled={!!mod(kind)}
            title={mod(kind) || undefined}
            onBlur={() => setSure('')}
            onClick={() => (sure === kind ? act(kind, { key: k }) : setSure(kind))}
          >
            {sure === kind ? `${kind === 'kick' ? 'Kick' : 'Ban'} ${name(st, k)}?` : kind === 'kick' ? 'Kick' : 'Ban'}
          </button>
        ))}
      </div>
      <p className="hint">{mod('kick') || mod('ban') || 'A kicked member can rejoin with an invite; a banned one cannot until the ban is lifted.'}</p>
    </div>
  )
}

const ACCESS: [string, string][] = [
  ['viewChannel', 'See it'],
  ['sendMessages', 'Write'],
  ['manageMessages', 'Manage messages'],
]
const VOICE_ACCESS: [string, string][] = [...ACCESS, ['connect', 'Connect'], ['speak', 'Speak']]

function Channels({ st, s, act, channel }: P) {
  const list = [...s.channels].sort((a, b) => a.position - b.position)
  const [sel, setSel] = useState(channel ?? list[0]?.id)
  const [adding, setAdding] = useState(false)
  const can = has(s, 'manageChannels')
  const ch = s.channels.find((c) => c.id === sel)
  const create = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const cid = newId()
    act('channel.add', { id: cid, name: String(f.get('name')).trim(), kind: f.get('kind') }).then(() => {
      setSel(cid)
      setAdding(false)
    })
  }
  return (
    <>
      {!can && <Lacks what="Manage channels" />}
      <div className="roles-split">
        <div className="role-list">
          <h2>In order</h2>
          {list.length === 0 && <p className="quiet">No channels yet.</p>}
          {list.map((c) => (
            <button key={c.id} type="button" className={c.id === sel ? 'role-row role-pick active' : 'role-row role-pick'} aria-current={c.id === sel || undefined} onClick={() => setSel(c.id)}>
              <ChannelMark kind={c.kind} />
              <span className="row-title">{c.name}</span>
              {c.overrides[s.id]?.deny.includes('viewChannel') && <Lock />}
            </button>
          ))}
          {adding ? (
            <form className="settings-section new-channel" onSubmit={create}>
              <label className="field-label">
                Name
                <input name="name" required maxLength={100} autoFocus />
              </label>
              <label className="field-label">
                Kind
                <select name="kind" defaultValue="text">
                  <option value="text">Text</option>
                  <option value="voice">Voice</option>
                  <option value="category">Category</option>
                </select>
              </label>
              <div className="settings-row">
                <button className="button primary">Create</button>
                <button type="button" className="button subtle" onClick={() => setAdding(false)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button className="button subtle" disabled={!can} onClick={() => setAdding(true)}>
              <Icon name="plus" size={16} /> Create a channel
            </button>
          )}
        </div>
        {ch ? <ChannelEdit key={ch.id} me={st.me} s={s} c={ch} act={act} /> : <p className="quiet">{list.length ? 'Choose a channel to edit it.' : 'Create a channel to get started.'}</p>}
      </div>
    </>
  )
}

function ChannelEdit({ me, s, c, act }: { me: Key; s: Srv; c: Channel; act: P['act'] }) {
  const can = has(s, 'manageChannels')
  const [d, setD] = useState({ name: c.name, topic: c.topic ?? '', limit: c.userLimit ?? 0, overrides: c.overrides })
  const [busy, setBusy] = useState(false)
  const [sure, setSure] = useState(false)
  const cols = c.kind === 'voice' ? VOICE_ACCESS : c.kind === 'category' ? ACCESS.slice(0, 1) : ACCESS
  const myRoles = s.members[me]?.roles ?? []
  // The replay checks every permission in the whole override table against the editor's own (`grants`), not only
  // the ones changed, so a table holding one we lack cannot be saved at all.
  const foreign = Object.values(c.overrides).flatMap((o) => [...o.allow, ...o.deny]).find((p) => !has(s, p))
  const ovDirty = JSON.stringify(d.overrides) !== JSON.stringify(c.overrides)
  const dirty = d.name !== c.name || d.topic !== (c.topic ?? '') || d.limit !== (c.userLimit ?? 0) || ovDirty
  const cell = (r: Role, perm: string): 'deny' | 'inherit' | 'allow' => (d.overrides[r.id]?.deny.includes(perm) ? 'deny' : d.overrides[r.id]?.allow.includes(perm) ? 'allow' : 'inherit')
  const set = (r: Role, perm: string, v: 'deny' | 'inherit' | 'allow') => {
    const o: Override = d.overrides[r.id] ?? { allow: [], deny: [] }
    const next = { allow: o.allow.filter((x) => x !== perm).concat(v === 'allow' ? [perm] : []), deny: o.deny.filter((x) => x !== perm).concat(v === 'deny' ? [perm] : []) }
    const overrides = { ...d.overrides, [r.id]: next }
    if (!next.allow.length && !next.deny.length) delete overrides[r.id]
    setD({ ...d, overrides })
  }
  const lockOf = (r: Role, i: number) => (!can ? 'You do not have Manage channels' : i >= s.mine.rank || myRoles.includes(r.id) ? 'Your own role, or one above it' : foreign ? 'Holds a permission you lack' : '')
  const save = () => {
    setBusy(true)
    const body: Record<string, unknown> = { id: c.id }
    if (d.name !== c.name) body.name = d.name.trim()
    if (d.topic !== (c.topic ?? '')) body.topic = d.topic.trim() || null
    if (d.limit !== (c.userLimit ?? 0)) body.userLimit = d.limit || null
    if (ovDirty) body.overrides = d.overrides // only when changed: it makes the edit a cut op
    act('channel.edit', body).finally(() => setBusy(false))
  }
  // Who can see it once @everyone is denied: roles allowed back in, administrators and the owner.
  const limited = d.overrides[s.id]?.deny.includes('viewChannel')
  const seers = s.roles.filter((r) => r.id !== s.id && (d.overrides[r.id]?.allow.includes('viewChannel') || r.perms.includes('administrator'))).map((r) => r.name)
  const ownName = s.roles.find((r) => r.id === myRoles.at(-1))?.name
  return (
    <div className="role-edit">
      <label className="field-label">
        {c.kind === 'category' ? 'Category name' : 'Channel name'}
        <input value={d.name} maxLength={100} disabled={!can} onChange={(e) => setD({ ...d, name: e.target.value })} />
      </label>
      {c.kind !== 'category' && (
        <label className="field-label">
          Topic
          <input value={d.topic} maxLength={1024} disabled={!can} placeholder="What this channel is for" onChange={(e) => setD({ ...d, topic: e.target.value })} />
        </label>
      )}
      {c.kind === 'voice' && (
        <label className="field-label">
          User limit
          <input type="number" min={0} max={99} value={d.limit} disabled={!can} onChange={(e) => setD({ ...d, limit: Math.max(0, Math.min(99, Math.round(Number(e.target.value) || 0))) })} />
          <span className="hint">0 means no limit.</span>
        </label>
      )}
      <h2>Access</h2>
      {limited && (
        <p className="notice">
          Limited: only {seers.length ? seers.join(', ') : 'nobody but'} {seers.length ? '(and the owner, who can see everything)' : 'the owner'} can see {c.kind === 'text' ? '#' : ''}
          {c.name}.
        </p>
      )}
      {foreign && can && <p className="notice">This channel’s access includes a permission you do not have, so you cannot change its access.</p>}
      <div className="access" role="table" aria-label="Access per role" style={{ gridTemplateColumns: `1fr repeat(${cols.length}, auto)` }}>
        <span role="row" className="access-head">
          <span role="columnheader" />
          {cols.map(([, label]) => (
            <span key={label} role="columnheader" className="access-col">
              {label}
            </span>
          ))}
        </span>
        {s.roles.map((r, i) => {
          const lock = lockOf(r, i)
          return (
            <span role="row" key={r.id} className="access-line">
              <span role="rowheader" className="access-role">
                <span className="role-dot" style={{ background: dot(r.color) }} />
                {r.name}
              </span>
              {cols.map(([perm, label]) => {
                const v = cell(r, perm)
                const off = !!lock || !has(s, perm)
                return (
                  <span role="cell" key={perm}>
                    <span className={off ? 'tri locked' : 'tri'} role="radiogroup" aria-label={`${label} for ${r.name}`} title={lock || (!has(s, perm) ? 'You do not have this permission' : undefined)}>
                      {(['deny', 'inherit', 'allow'] as const).map((x) => (
                        <button key={x} type="button" role="radio" aria-checked={v === x} className={`tri-${x}${v === x ? ' on' : ''}`} aria-label={x === 'deny' ? 'Deny' : x === 'allow' ? 'Allow' : 'Not set'} title={x === 'deny' ? 'Deny' : x === 'allow' ? 'Allow' : 'Not set'} disabled={off} onClick={() => set(r, perm, x)}>
                          {x === 'deny' ? '✕' : x === 'allow' ? '✓' : '/'}
                        </button>
                      ))}
                    </span>
                  </span>
                )
              })}
            </span>
          )
        })}
      </div>
      <p className="hint">
        ✕ deny, / take it from the role, ✓ allow.{ownName ? ` ${ownName} is your own role, so you cannot change its access here.` : ''}
      </p>
      <div className="settings-row save-bar">
        <button className="button primary" disabled={!can || !dirty || busy || !d.name.trim()} onClick={save}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>
        <button className="button subtle" disabled={!dirty || busy} onClick={() => setD({ name: c.name, topic: c.topic ?? '', limit: c.userLimit ?? 0, overrides: c.overrides })}>
          Reset
        </button>
        <button className="button danger" disabled={!can || busy} onClick={() => (sure ? act('channel.delete', { id: c.id }) : setSure(true))} onBlur={() => setSure(false)}>
          {sure ? `Delete ${c.name}?` : c.kind === 'category' ? 'Delete category' : 'Delete channel'}
        </button>
      </div>
    </div>
  )
}

const EXPIRY: [string, number][] = [
  ['Never', 0],
  ['30 minutes', 30 * 60e3],
  ['1 hour', 60 * 60e3],
  ['1 day', 24 * 60 * 60e3],
  ['7 days', 7 * 24 * 60 * 60e3],
]
const USES = [0, 1, 5, 10, 25, 100]

function Invites({ st, s, act, run }: P) {
  const [expiry, setExpiry] = useState(EXPIRY[3][1])
  const [uses, setUses] = useState(0)
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const can = has(s, 'createInvites')
  const now = Date.now()
  const all = Object.values(s.invites).sort((a, b) => Number(a.revoked) - Number(b.revoked))
  const create = (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const opts = { ...(expiry && { expires: Date.now() + expiry }), ...(uses && { maxUses: uses }) }
    run(api.call('createInvite', s.id, opts).then((l: unknown) => setLink(String(l)))).finally(() => setBusy(false))
  }
  const state = (inv: Srv['invites'][string]) =>
    inv.revoked ? 'Revoked' : inv.expires && inv.expires <= now ? 'Expired' : inv.maxUses && inv.uses >= inv.maxUses ? 'Used up' : inv.expires ? `Expires ${when(inv.expires)}` : 'Never expires'
  return (
    <>
      {!can && <Lacks what="Create invites" />}
      <form className="settings-section" onSubmit={create}>
        <h2>New invite</h2>
        <div className="settings-row">
          <label className="field-label">
            Expires after
            <select value={expiry} disabled={!can} onChange={(e) => setExpiry(Number(e.target.value))}>
              {EXPIRY.map(([l, ms]) => (
                <option key={l} value={ms}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Uses
            <select value={uses} disabled={!can} onChange={(e) => setUses(Number(e.target.value))}>
              {USES.map((u) => (
                <option key={u} value={u}>
                  {u ? `${u} ${u === 1 ? 'use' : 'uses'}` : 'No limit'}
                </option>
              ))}
            </select>
          </label>
          <button className="button primary invite-make" disabled={!can || busy}>
            {busy ? 'Creating…' : 'Create link'}
          </button>
        </div>
        {link && (
          <div className="id-plate invite-link">
            <code>{link}</code>
            <CopyButton text={link} label="Copy invite link" />
          </div>
        )}
        {link && <p className="hint">Copy it now: the link holds a secret that is not kept, so it cannot be shown again.</p>}
      </form>
      <h2>Invites</h2>
      {all.length === 0 ? (
        <p className="quiet">No invites yet.</p>
      ) : (
        <ul className="ss-list">
          {all.map((inv) => {
            const mayRevoke = has(s, 'createInvites') || inv.by === st.me
            return (
              <li key={inv.id} className={inv.revoked ? 'ss-item gone' : 'ss-item'}>
                <span className="row-text">
                  <span className="row-title">
                    <span className="tail">{inv.id.slice(0, 8)}</span> by {name(st, inv.by)}
                  </span>
                  <span className="row-sub">
                    {inv.uses}
                    {inv.maxUses ? ` of ${inv.maxUses}` : ''} {inv.uses === 1 && !inv.maxUses ? 'use' : 'uses'} · {state(inv)}
                  </span>
                </span>
                {!inv.revoked && (
                  <button className="button subtle" disabled={!mayRevoke} title={mayRevoke ? undefined : 'You do not have Create invites'} onClick={() => act('invite.revoke', { id: inv.id })}>
                    Revoke
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

function Bans({ st, s, act }: P) {
  const can = has(s, 'ban')
  return (
    <>
      {!can && <Lacks what="Ban members" />}
      {s.bans.length === 0 ? (
        <p className="quiet">Nobody is banned. Ban someone from the Members page.</p>
      ) : (
        <ul className="ss-list">
          {s.bans.map((k) => (
            <li key={k} className="ss-item">
              <Avatar k={k} p={st.profiles[k] ?? NOBODY} size={28} />
              <span className="row-text">
                <span className="row-title">{name(st, k)}</span>
                <span className="row-sub tail">{k.slice(0, 16)}…</span>
              </span>
              <button className="button subtle" disabled={!can} onClick={() => act('unban', { key: k })}>
                Lift ban
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

type AuditRow = { author: Key; kind: string; n: number; ts: number; target?: string }
function Audit({ st, s, run }: P) {
  const can = has(s, 'viewAuditLog')
  const [rows, setRows] = useState<AuditRow[] | null | 'failed'>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!can) return
    setRows(null)
    run(
      api.call('serverAudit', s.id).then(
        (r: unknown) => setRows(r as AuditRow[]),
        (e: unknown) => {
          setRows('failed')
          throw e
        },
      ),
    )
  }, [s.id, can, tick])
  if (!can) return <p className="notice">You do not have the See the audit log permission.</p>
  if (rows === null) return <p className="quiet" role="status">Loading the audit log…</p>
  if (rows === 'failed')
    return (
      <div className="settings-row">
        <p className="quiet">The audit log could not be read.</p>
        <button className="button subtle" onClick={() => setTick(tick + 1)}>
          Try again
        </button>
      </div>
    )
  if (!rows.length) return <p className="quiet">Nothing has happened here yet.</p>
  return (
    <>
      <div className="settings-row">
        <p className="hint">Newest first.</p>
        <button className="button subtle" onClick={() => setTick(tick + 1)}>
          Refresh
        </button>
      </div>
      <ul className="ss-list">
        {rows.map((r) => (
          <li key={`${r.author}:${r.n}:${r.kind}:${r.ts}`} className="ss-item">
            <Avatar k={r.author} p={st.profiles[r.author] ?? (r.author === st.me ? st.profile : NOBODY)} size={28} />
            <span className="row-text">
              <span className="row-title audit-line">
                <b>{name(st, r.author)}</b> {AUDIT_WORDS[r.kind] ?? r.kind}
                {r.target && targetOf(st, s, r.target) && <>: <b>{targetOf(st, s, r.target)}</b></>}
              </span>
              <span className="row-sub">{when(r.ts)}</span>
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}

// Small marks that ui.tsx's Icon set lacks: a drag grip, a lock, and the channel kinds.
function Grip() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {[6, 12, 18].flatMap((y) => [9, 15].map((x) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.6" />))}
    </svg>
  )
}
function Lock() {
  return (
    <svg className="icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-label="Limited access" role="img">
      <rect x="5" y="11" width="14" height="9" rx="1.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  )
}
function ChannelMark({ kind }: { kind: string }) {
  if (kind === 'voice') return <Icon name="volume" size={16} />
  if (kind === 'category') return <Icon name="folder" size={16} />
  return (
    <span className="channel-hash" aria-hidden="true">
      #
    </span>
  )
}
