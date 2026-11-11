// A server: its channels on the left, the open channel's chat in the middle, its members by role on the right, and
// the dialogs opened from there (invite, poke into a voice channel, new channel, nickname, leave, kick and ban).
import { type MouseEvent, type ReactNode, memo, useState } from 'react'
import { type Key, type Profile, type ServerView, type State, dmId } from '../shared/protocol'
import * as call from './call'
import { ActivityLine } from './Activity'
import { Chat } from './Chat'
import { Oculus, ShareDialog, Stage, VoiceMark, useSpeaking } from './Media'
import { type People, type Run, api, card } from './common'
import { ContextMenu, type Item } from './Rail'
import { ServerSettings } from './ServerSettings'
import { CopyButton, Dialog, GroupEmblem, Icon, Splitter, useWidth, Avatar } from './ui'

type Channel = ServerView['channels'][number]
type Ask =
  | { invite: true }
  | { poke: string } // the voice channel
  | { nick: Key }
  | { channel: true }
  | { settings: true }
  | { title: string; body: string; yes: string; act: () => void }
  | null

export const newId = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('')
const hex = (c: number) => (c ? '#' + c.toString(16).padStart(6, '0') : undefined)
const byPosition = (sv: ServerView) => [...sv.channels].sort((a, b) => a.position - b.position)
const rankOf = (sv: ServerView, k: Key) => (k === sv.owner ? Infinity : Math.max(0, ...(sv.members[k]?.roles ?? []).map((r) => sv.roles.findIndex((x) => x.id === r))))
// A name takes the colour of the highest of its roles that has one, as on Discord.
const colorOf = (sv: ServerView, k: Key) => hex([...sv.roles].reverse().find((r) => r.color && sv.members[k]?.roles.includes(r.id))?.color ?? 0)
const locked = (sv: ServerView, c: Channel) => !!c.overrides[sv.id]?.deny.includes('viewChannel')
const voiceIn = (conv: string, me: Key) => [...(call.active.get(conv) ?? []), ...(call.conv === conv ? [me] : [])]

// The channel a server opens on: the one asked for, else the last one open here, else its first text channel.
const lastChannel = new Map<string, string>()
export function channelOf(sv: ServerView, asked?: string) {
  const ok = (id?: string) => !!id && sv.channels.some((c) => c.id === id && c.kind !== 'category')
  if (ok(asked)) return asked!
  if (ok(lastChannel.get(sv.id))) return lastChannel.get(sv.id)!
  const all = byPosition(sv)
  return (all.find((c) => c.kind === 'text') ?? all.find((c) => c.kind === 'voice'))?.id
}

type Props = { st: State; sv: ServerView; channel?: string; people: People; run: Run; go: (c: string | null) => void }

export function Server({ st, sv, channel, people: everyone, run, go }: Props) {
  const [left, setLeft] = useWidth('server', 260)
  const [right, setRight] = useWidth('members', 230)
  const [menu, setMenu] = useState<{ x: number; y: number; for: Key | null } | null>(null)
  const [rolesOpen, setRolesOpen] = useState(false)
  const [ask, setAsk] = useState<Ask>(null)
  const [share, setShare] = useState(false)
  const me = st.me
  const perms = new Set(sv.mine.perms)
  const owner = sv.owner === me
  // Our own nickname for someone wins, then their nickname on this server, then their name.
  const name = (k: Key) => st.settings.nicknames?.[k] || sv.members[k]?.nick || everyone.name(k)
  const people: People = { ...everyone, name }
  const cid = channelOf(sv, channel)
  if (cid) lastChannel.set(sv.id, cid)
  const ch = sv.channels.find((c) => c.id === cid)
  const conv = `${sv.id}.${cid}`
  const open = (id: string) => go(`${sv.id}.${id}`)
  const act = (kind: string, body: unknown) => run(api.call('serverAct', sv.id, kind, body))
  const inCall = call.conv === conv
  const ourCall = call.conv?.startsWith(sv.id + '.') ? sv.channels.find((c) => `${sv.id}.${c.id}` === call.conv) : undefined

  // Someone we may act on: not ourselves, not the owner, and below our highest role (the owner is above everyone).
  const below = (k: Key) => k !== me && k !== sv.owner && (owner || rankOf(sv, k) < sv.mine.rank)
  function memberMenu(k: Key): Item[][] {
    const mine = sv.members[k]?.roles ?? []
    const grantable = sv.roles.map((r, i) => ({ r, i })).filter(({ i }) => i > 0 && (owner || i < sv.mine.rank))
    const toggle = (id: string) => act('member.roles', { key: k, roles: mine.includes(id) ? mine.filter((x) => x !== id) : [...mine, id] })
    const n = name(k)
    return [
      [
        { label: 'Profile', act: () => people.show(k) },
        ...(k !== me && st.friends[k] === 'friend' ? [{ label: 'Message', act: () => go(dmId(me, k)) }] : []),
        ...((k === me ? perms.has('changeNickname') : perms.has('manageNicknames') && below(k)) ? [{ label: 'Change nickname', act: () => setAsk({ nick: k }) }] : []),
      ],
      perms.has('manageRoles') && below(k) && grantable.length
        ? [
            { label: rolesOpen ? 'Roles ▾' : 'Roles ▸', act: () => setRolesOpen(!rolesOpen), sub: true },
            ...(rolesOpen ? grantable.reverse().map(({ r }) => ({ label: r.name, act: () => toggle(r.id), checked: mine.includes(r.id) })) : []),
          ]
        : [],
      [
        ...(perms.has('kick') && below(k) && sv.members[k]
          ? [{ label: `Kick ${n}`, danger: true, act: () => setAsk({ title: `Kick ${n}?`, body: 'They leave the server. They can join again with an invite.', yes: 'Kick', act: () => act('kick', { key: k }) }) }]
          : []),
        ...(perms.has('ban') && below(k)
          ? [{ label: `Ban ${n}`, danger: true, act: () => setAsk({ title: `Ban ${n}?`, body: 'They leave the server and cannot join again, not even with an invite, until they are unbanned.', yes: 'Ban', act: () => act('ban', { key: k }) }) }]
          : []),
      ],
    ]
  }
  const headMenu: Item[][] = [
    [
      ...(perms.has('createInvites') ? [{ label: 'Invite people', act: () => setAsk({ invite: true }) }] : []),
      ...(['manageServer', 'manageRoles', 'manageChannels', 'kick', 'ban', 'viewAuditLog'].some((p) => perms.has(p)) ? [{ label: 'Server settings', act: () => setAsk({ settings: true }) }] : []),
      ...(perms.has('manageChannels') ? [{ label: 'Create a channel', act: () => setAsk({ channel: true }) }] : []),
    ],
    // The owner cannot leave until ownership can be handed over (shared/server.ts)
    owner
      ? []
      : [
          {
            label: 'Leave server',
            danger: true,
            act: () =>
              setAsk({
                title: `Leave ${sv.name}?`,
                body: 'You can come back only with a new invite.',
                yes: 'Leave server',
                act: () => (ourCall && call.leave(), act('leave', {}), go(null)),
              }),
          },
        ],
  ]
  const openMenu = (k: Key) => (e: MouseEvent<HTMLElement>) => {
    e.preventDefault()
    const r = e.currentTarget.getBoundingClientRect()
    setRolesOpen(false)
    setMenu({ x: e.clientX || r.left, y: e.clientY || r.bottom, for: k })
  }

  // One row per channel: text opens its chat; voice joins its call (and opens its chat), its own chat and poking
  // members into it come from the two buttons shown on hover.
  const row = (c: Channel) => {
    const voice = c.kind === 'voice'
    const here = voiceIn(`${sv.id}.${c.id}`, me)
    // A full voice channel is not joined (0 or none: no limit); its chat still opens
    const full = voice && !!c.userLimit && here.length >= c.userLimit && call.conv !== `${sv.id}.${c.id}`
    const muted = st.settings.muted
    const unread = muted?.[sv.id] || muted?.[`${sv.id}.${c.id}`] ? 0 : (st.chats[`${sv.id}.${c.id}`]?.unread ?? 0)
    return (
      <div key={c.id} className="channel-row">
        <button
          className={`channel ${c.id === cid ? 'active' : ''} ${unread ? 'unread' : ''}`}
          aria-current={c.id === cid ? 'page' : undefined}
          aria-label={`${c.name}${voice ? `, voice channel${here.length ? `, ${here.length} in it` : ''}` : ''}${unread ? `, ${unread} unread` : ''}${voice ? (full ? ', full' : ': join') : ''}`}
          title={full ? 'This voice channel is full' : undefined}
          onClick={() => (open(c.id), voice && !full && call.conv !== `${sv.id}.${c.id}` && run(call.join(`${sv.id}.${c.id}`)))}
        >
          <Icon name={voice ? 'volume' : 'hash'} size={16} />
          <span className="channel-name">{c.name}</span>
          {locked(sv, c) && (
            <span className="channel-lock" title="Limited">
              <Icon name="lock" size={14} />
            </span>
          )}
          {unread > 0 && <span className="channel-count">{unread > 99 ? '99+' : unread}</span>}
          {voice && c.userLimit ? (
            <span className="tail">{full ? 'Full' : `${here.length}/${c.userLimit}`}</span>
          ) : null}
        </button>
        {voice && (
          <span className="channel-tools">
            <button className="icon-button" aria-label={`Open ${c.name}'s text chat`} title="Open text chat" onClick={() => open(c.id)}>
              <Icon name="hash" size={14} />
            </button>
            {sv.mine.channels[c.id]?.includes('connect') && (
              <button className="icon-button" aria-label="Invite to voice channel" title="Invite to voice channel" onClick={() => setAsk({ poke: c.id })}>
                <Icon name="userPlus" size={14} />
              </button>
            )}
          </span>
        )}
        {voice && here.length > 0 && <VoicePeople sv={sv} keys={here} st={st} people={people} conv={`${sv.id}.${c.id}`} />}
      </div>
    )
  }
  const all = byPosition(sv)
  const loose = all.filter((c) => c.kind !== 'category' && !c.parent)
  // Text before voice within each list, as on Discord
  const listOf = (cs: Channel[]) => [...cs.filter((c) => c.kind === 'text'), ...cs.filter((c) => c.kind === 'voice')].map(row)

  // Members: each hoisted role, highest first, with its online members; everyone else online; then everyone offline.
  const keys = Object.keys(sv.members).sort((a, b) => name(a).localeCompare(name(b)))
  const online = keys.filter(people.isOnline)
  const hoisted = sv.roles.filter((r, i) => i > 0 && r.hoist).reverse()
  const topOf = (k: Key) => hoisted.find((r) => sv.members[k].roles.includes(r.id))?.id
  const lists: [string, string | undefined, Key[]][] = [
    ...hoisted.map((r) => [r.name, hex(r.color), online.filter((k) => topOf(k) === r.id)] as [string, string | undefined, Key[]]),
    ['Online', undefined, online.filter((k) => !topOf(k))],
    ['Offline', undefined, keys.filter((k) => !people.isOnline(k))],
  ]

  const control = (label: string, icon: Parameters<typeof Icon>[0]['name'], onClick: () => void, pressed?: boolean, extra = '') => (
    <button className={`round ${pressed ? 'on' : ''} ${extra}`} aria-pressed={pressed} title={label} onClick={onClick}>
      <Icon name={icon} size={18} />
      <span className="visually-hidden">{label}</span>
    </button>
  )
  const head: ReactNode = ch && (
    <>
      <Icon name={ch.kind === 'voice' ? 'volume' : 'hash'} size={22} />
      <h1>{ch.name}</h1>
      {ch.topic && <span className="chat-topic">{ch.topic}</span>}
      {perms.has('createInvites') && (
        <button className="icon-button chat-invite" aria-label="Invite people" title="Invite people" onClick={() => setAsk({ invite: true })}>
          <Icon name="userPlus" size={18} />
        </button>
      )}
    </>
  )

  return (
    <>
      <aside className="server-side" style={{ width: left }} aria-label={sv.name}>
        <button className={`server-head ${menu?.for === null ? 'open' : ''}`} aria-haspopup="menu" aria-expanded={menu?.for === null} onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setMenu({ x: r.left + 8, y: r.bottom + 4, for: null })
        }}>
          <GroupEmblem g={sv} size={28} />
          <span className="server-name">{sv.name}</span>
          <Icon name="chevron" size={16} />
        </button>
        <nav className="channels" aria-label="Channels">
          {listOf(loose)}
          {all
            .filter((c) => c.kind === 'category')
            .map((cat) => (
              <details key={cat.id} open>
                <summary>
                  <h2>{cat.name}</h2>
                </summary>
                {listOf(all.filter((c) => c.parent === cat.id))}
              </details>
            ))}
          {!all.length && <p className="quiet">No channels you can see yet.</p>}
        </nav>
        {ourCall && (
          <div className="voice-dock">
            <span className="row-text">
              <span className="row-title voice-live">Voice connected</span>
              <span className="row-sub">
                {ourCall.name} · {sv.name}
              </span>
            </span>
            <div className="call-controls" role="toolbar" aria-label="Call controls">
              {control(call.muted || call.deafened ? 'Unmute' : 'Mute', call.muted || call.deafened ? 'micOff' : 'mic', call.toggleMute, call.muted || call.deafened)}
              {control(call.deafened ? 'Undeafen' : 'Deafen', call.deafened ? 'headphonesOff' : 'headphones', call.toggleDeafen, call.deafened)}
              {control(call.sharing() ? 'Stream settings' : 'Share screen', 'screen', () => setShare(true), !!call.sharing())}
              {call.sharing() && control('Stop sharing', 'screenOff', () => call.stopShare())}
              {control('Leave call', 'phone', call.leave, undefined, 'leave')}
            </div>
          </div>
        )}
      </aside>
      <Splitter label="Resize channels sidebar" width={left} set={setLeft} dir={1} />

      {ch ? (
        <Chat
          key={conv}
          st={st}
          conv={conv}
          title={ch.kind === 'text' ? '#' + ch.name : ch.name}
          people={people}
          run={run}
          home={() => go(null)}
          head={head}
          about={
            ch.kind === 'voice'
              ? `${ch.name}'s text chat is new. What you write here stays with the channel for everyone who can join it, also after the call ends.`
              : `Messages here travel directly between the members who can see #${ch.name}. Members who are offline receive them when they return.`
          }
          stage={
            inCall ? (
              <>
                <Oculus st={st} name={name} show={people.show} />
                <Stage st={st} name={name} settings={() => setShare(true)} />
              </>
            ) : null
          }
        />
      ) : (
        <main className="workspace chat">
          <div className="empty-state">
            <p className="empty-title">No channels yet</p>
          </div>
        </main>
      )}

      <Splitter label="Resize members sidebar" width={right} set={setRight} dir={-1} />
      <aside className="members" style={{ width: right }} aria-label="Members">
        <Speaking>
          {() =>
            lists
              .filter(([, , ks]) => ks.length)
              .map(([title, color, ks]) => (
                <section key={title} aria-label={title}>
                  <h2 style={{ color }}>
                    {title} — {ks.length}
                  </h2>
                  {ks.map((k) => (
                    <MemberRow
                      key={k}
                      k={k}
                      p={people.prof(k)}
                      name={name(k)}
                      you={k === me}
                      online={people.isOnline(k)}
                      speaking={!!call.conv?.startsWith(sv.id + '.') && call.speaking.has(k) && voiceIn(call.conv, me).includes(k)}
                      a={st.activity[k]}
                      color={colorOf(sv, k)}
                      show={people.show}
                      menu={openMenu(k)}
                      menuOpen={menu?.for === k}
                    />
                  ))}
                </section>
              ))
          }
        </Speaking>
      </aside>

      {menu && <ContextMenu x={menu.x} y={menu.y} sections={menu.for === null ? headMenu : memberMenu(menu.for)} close={() => setMenu(null)} />}
      {share && <ShareDialog close={() => setShare(false)} />}
      {ask && 'invite' in ask && <InviteDialog sv={sv} close={() => setAsk(null)} />}
      {ask && 'poke' in ask && sv.channels.some((c) => c.id === ask.poke) && (
        <PokeDialog
          sv={sv}
          ch={sv.channels.find((c) => c.id === ask.poke)!}
          keys={Object.keys(sv.members).filter((k) => k !== me && !voiceIn(`${sv.id}.${ask.poke}`, me).includes(k))}
          people={people}
          close={() => setAsk(null)}
        />
      )}
      {ask && 'nick' in ask && <ServerNickname sv={sv} k={ask.nick} name={everyone.name(ask.nick)} act={act} close={() => setAsk(null)} />}
      {ask && 'channel' in ask && <NewChannel sv={sv} act={act} open={open} close={() => setAsk(null)} />}
      {ask && 'settings' in ask && <ServerSettings st={st} id={sv.id} close={() => setAsk(null)} run={run} />}
      {ask && 'yes' in ask && (
        <Dialog label={ask.title} close={() => setAsk(null)}>
          <h1>{ask.title}</h1>
          <p>{ask.body}</p>
          <div className="form-actions">
            <button className="button" onClick={() => setAsk(null)}>
              Cancel
            </button>
            <button className="button danger" onClick={() => (ask.act(), setAsk(null))}>
              {ask.yes}
            </button>
          </div>
        </Dialog>
      )}
    </>
  )
}

// Who is in a voice channel, under it, with a speaking ring while they speak (in our own call).
function VoicePeople({ sv, keys, st, people, conv }: { sv: ServerView; keys: Key[]; st: State; people: People; conv: string }) {
  useSpeaking()
  return (
    <div className="voice-people">
      {keys.map((k) => (
        <button key={k} className={`voice-person member${call.conv === conv && call.speaking.has(k) ? ' speaking' : ''}`} onClick={(e) => people.show(k, e.currentTarget)} onContextMenu={card(people.show, k)}>
          <Avatar k={k} p={people.prof(k)} size={24} />
          <span className="row-title">
            <span className="user" style={{ color: colorOf(sv, k) }}>
              {people.name(k)}
            </span>
            {k === st.me && <span className="row-sub"> (you)</span>}
          </span>
          {k === st.me ? <VoiceMark muted={call.muted} deafened={call.deafened} /> : <VoiceMark {...call.voices.get(k)} />}
        </button>
      ))}
    </div>
  )
}

// What shows speaking rings redraws by itself when someone starts or stops speaking, not the view around it.
export function Speaking({ children }: { children: () => ReactNode }) {
  useSpeaking()
  return <>{children()}</>
}

type MemberProps = {
  k: Key
  p: Profile
  name: string
  you: boolean
  online: boolean
  speaking: boolean
  a?: State['activity'][Key]
  show: People['show']
  color?: string // the name's role colour on a server
  menu?: (e: MouseEvent<HTMLElement>) => void // a server's right-click menu, in place of the profile panel
  menuOpen?: boolean
}
// One row of the members list. Kept from redrawing unless it changed: every state push builds new profile and activity
// objects, and a server's list has a couple of hundred rows. show and menu only open things, so they are left out.
export const MemberRow = memo(
  function MemberRow({ k, p, name, you, online, speaking, a, show, color, menu, menuOpen }: MemberProps) {
    return (
      <button
        className={`member${speaking ? ' speaking' : ''}${menuOpen ? ' menu-for' : ''}`}
        onClick={(e) => show(k, e.currentTarget)}
        onContextMenu={menu ?? card(show, k)}
        aria-label={`${name}${you ? ' (you)' : ''}: open profile`}
        aria-haspopup={menu ? 'menu' : undefined}
      >
        <Avatar k={k} p={p} size={32} online={online} />
        <span className="row-text">
          <span className="row-title">
            <span className="user" style={{ color }}>
              {name}
            </span>
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
    x.color === y.color &&
    x.menuOpen === y.menuOpen &&
    x.p.name === y.p.name &&
    x.p.handle === y.p.handle &&
    x.p.avatar === y.p.avatar &&
    JSON.stringify(x.a?.game ?? null) === JSON.stringify(y.a?.game ?? null),
)

const EXPIRES: [string, number][] = [
  ['30 minutes', 30 * 60e3],
  ['1 hour', 3600e3],
  ['1 day', 86400e3],
  ['7 days', 7 * 86400e3],
  ['Never', 0],
]
const USES = [0, 1, 5, 10, 25, 100]

// Asks members already in the server to join a voice channel: a poke, not a link. Those in it are not offered; the
// node refuses anyone who may not view or connect to it, and says when someone could not be reached in 2 minutes.
function PokeDialog({ sv, ch, keys, people, close }: { sv: ServerView; ch: Channel; keys: Key[]; people: People; close: () => void }) {
  const [said, setSaid] = useState<Record<Key, string>>({})
  const tell = (k: Key, text: string) => setSaid((s) => ({ ...s, [k]: text }))
  const poke = (k: Key) => {
    const n = people.name(k)
    tell(k, `Poking ${n}…`)
    api.call('poke', sv.id, ch.id, k).then(
      (ok: boolean) => tell(k, ok ? `Poked ${n}` : `${n} could not be reached in 2 minutes`),
      (e: Error) => tell(k, String(e.message ?? e).replace(/^.*Error: /, '')),
    )
  }
  return (
    <Dialog label={`Invite to ${ch.name}`} close={close}>
      <div className="new-group">
        <h1>Invite to {ch.name}</h1>
        <p className="hint">They get a notice asking them to join you here.</p>
        <div className="poke-list">
          {keys.map((k) => (
            <div key={k} className="check-row poke-row">
              <Avatar k={k} p={people.prof(k)} size={28} />
              <span>{people.name(k)}</span>
              {said[k] ? (
                <span role="status" className="quiet">
                  {said[k]}
                </span>
              ) : (
                <button className="button" onClick={() => poke(k)}>
                  Poke
                </button>
              )}
            </div>
          ))}
          {!keys.length && <p className="quiet">Everyone is already here.</p>}
        </div>
        <div className="form-actions">
          <button className="button" onClick={close}>
            Done
          </button>
        </div>
      </div>
    </Dialog>
  )
}

// An invite link to the server, with how long it works and how often.
function InviteDialog({ sv, close }: { sv: ServerView; close: () => void }) {
  const [expires, setExpires] = useState(7 * 86400e3)
  const [uses, setUses] = useState(0)
  const [link, setLink] = useState('')
  const [err, setErr] = useState('')
  const make = () => {
    setErr('')
    api.call('createInvite', sv.id, { ...(expires && { expires: Date.now() + expires }), ...(uses && { maxUses: uses }) }).then(setLink, (e: Error) => setErr(String(e.message ?? e).replace(/^.*Error: /, '')))
  }
  const title = `Invite people to ${sv.name}`
  return (
    <Dialog label={title} close={close}>
      <form className="new-group" onSubmit={(e) => (e.preventDefault(), make())}>
        <h1>{title}</h1>
        <label className="field-label">
          Expires after
          <select value={expires} onChange={(e) => (setExpires(Number(e.target.value)), setLink(''))}>
            {EXPIRES.map(([l, v]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          Number of uses
          <select value={uses} onChange={(e) => (setUses(Number(e.target.value)), setLink(''))}>
            {USES.map((n) => (
              <option key={n} value={n}>
                {n ? `${n} ${n === 1 ? 'use' : 'uses'}` : 'No limit'}
              </option>
            ))}
          </select>
        </label>
        {link && (
          <div className="field-label">
            Invite link
            <div className="id-plate invite-link">
              <b>{link}</b>
              <CopyButton text={link} label="Copy invite link" />
            </div>
          </div>
        )}
        <p className="hint">Someone in the server has to be online to let them in.</p>
        {err && (
          <p role="alert" className="form-error">
            {err}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="button" onClick={close}>
            Done
          </button>
          <button className="button primary">{link ? 'Make a new link' : 'Create link'}</button>
        </div>
      </form>
    </Dialog>
  )
}

function NewChannel({ sv, act, open, close }: { sv: ServerView; act: (kind: string, body: unknown) => Promise<void>; open: (id: string) => void; close: () => void }) {
  const cats = byPosition(sv).filter((c) => c.kind === 'category')
  return (
    <Dialog label="Create a channel" close={close}>
      <form
        className="new-group"
        onSubmit={(e) => {
          e.preventDefault()
          const f = new FormData(e.currentTarget)
          const id = newId()
          const parent = String(f.get('parent') ?? '')
          act('channel.add', { id, kind: f.get('kind'), name: String(f.get('name')).trim(), ...(parent && { parent }) }).then(() => open(id))
          close()
        }}
      >
        <h1>Create a channel</h1>
        <fieldset>
          <legend>Kind</legend>
          <label className="check-row">
            <input type="radio" name="kind" value="text" defaultChecked />
            <Icon name="hash" size={16} /> <span>Text</span>
          </label>
          <label className="check-row">
            <input type="radio" name="kind" value="voice" />
            <Icon name="volume" size={16} /> <span>Voice, with its own text chat</span>
          </label>
        </fieldset>
        <label className="field-label">
          Channel name
          <input name="name" required maxLength={100} pattern=".*\S.*" />
        </label>
        {cats.length > 0 && (
          <label className="field-label">
            Category
            <select name="parent" defaultValue="">
              <option value="">None</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="form-actions">
          <button type="button" className="button" onClick={close}>
            Cancel
          </button>
          <button className="button primary">Create channel</button>
        </div>
      </form>
    </Dialog>
  )
}

// A nickname on this server, seen by every member; empty gives the name back.
function ServerNickname({ sv, k, name, act, close }: { sv: ServerView; k: Key; name: string; act: (kind: string, body: unknown) => Promise<void>; close: () => void }) {
  const [v, setV] = useState(sv.members[k]?.nick ?? '')
  return (
    <Dialog label="Nickname" close={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          act('nickname', { key: k, nick: v.trim() ? v.trim().slice(0, 32) : null })
          close()
        }}
      >
        <h1>Nickname for {name} on {sv.name}</h1>
        <p className="quiet">Everyone in the server sees it. Leave it empty to show their own name again.</p>
        <input value={v} maxLength={32} onChange={(e) => setV(e.target.value)} aria-label="Nickname" placeholder={name} />
        <div className="form-actions">
          <button type="button" className="button" onClick={close}>
            Cancel
          </button>
          <button className="button primary">Save</button>
        </div>
      </form>
    </Dialog>
  )
}
