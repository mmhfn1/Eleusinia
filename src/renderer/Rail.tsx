// The rail down the left edge: the emblem (Home), servers, groups, direct conversations with at least one message,
// then + (create or join) at its foot. Unread messages and missed calls show as a count on its picture.
// Also the right-click menus every screen shares (useMenus): a conversation or channel, and a person in a call.
import { type KeyboardEvent, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { type Key, type State, dmId } from '../shared/protocol'
import * as call from './call'
import { PersonVolume } from './Media'
import { type Modal, type People, type Run, api, groupName, isMuted } from './common'
import { InviteDialog, PokeDialog, below, newId } from './Server'
import { ServerSettings } from './ServerSettings'
import { Avatar, Dialog, Emblem, GroupEmblem, Icon, copyText } from './ui'

type Props = { st: State; people: People; open: string | null; go: (c: string | null) => void; show: (m: Modal) => void; run: Run }
// checked: a checkable item, which keeps the menu open; node: something other than a button (a heading and a slider)
export type Item = { label: string; act?: () => void; danger?: boolean; sub?: boolean; checked?: boolean; node?: ReactNode }
// A menu is sections of items; a divider goes between sections.
type Ask =
  | { title: string; body: string; yes: string; act: () => void }
  | { nickname: Key }
  | { poke: string } // a voice channel's conversation
  | { invite: string } // a server
  | { edit: string } // a channel's conversation, opened in Server settings
  | null

export const otherIn = (c: string, me: Key) => c.split('_').find((k) => k !== me)!

// The direct conversations on the rail: those with a message, not closed since, pinned first, then the latest.
export function railDms(st: State) {
  const pinned = st.settings.pinned ?? []
  const dms = Object.entries(st.chats)
    .filter(([c, ch]) => !st.groups[c] && !st.servers[c.split('.')[0]] && !st.blocked.includes(otherIn(c, st.me)) && (pinned.includes(c) || ch.at > (st.settings.closed?.[c] ?? 0)))
    .sort(([a, x], [b, y]) => (pinned.includes(a) ? pinned.indexOf(a) - 1e15 : -x.at) - (pinned.includes(b) ? pinned.indexOf(b) - 1e15 : -y.at))
  return dms.map(([c]) => c)
}

const MUTE_FOR: [string, number][] = [
  ['15 minutes', 15 * 60e3],
  ['1 hour', 3600e3],
  ['8 hours', 8 * 3600e3],
  ['Until I turn it back on', 0],
]

// The right-click menus of conversations, channels and people in a call, with the dialogs they open. A target is a
// conversation (a DM, a group, a server, `${server}.${channel}`), '+' (create or join), or `${key} ${conv}`: a person
// in that conversation's call. open(target) is the onContextMenu handler; node renders the menu and its dialogs.
export function useMenus({ st, people, open: here, go, show, run }: Props) {
  const [menu, setMenu] = useState<{ x: number; y: number; for: string } | null>(null)
  const [fold, setFold] = useState('') // the sub-list unfolded in place
  const [ask, setAsk] = useState<Ask>(null)
  const settings = (p: Partial<State['settings']>) => run(api.call('setSettings', p))
  const muted = (c: string) => isMuted(st, c)
  const convs = (c: string) => (st.servers[c] ? Object.keys(st.chats).filter((x) => x.startsWith(c + '.')) : [c])
  const leaveIfOpen = (c: string) => (here === c || here?.startsWith(c + '.')) && go(null)
  const startCall = (c: string) => (go(c), run(call.join(c)))
  const confirm = (title: string, body: string, yes: string, act: () => void) => setAsk({ title, body, yes, act })
  const folding = (label: string, id: string, items: Item[]): Item[] =>
    items.length ? [{ label: `${label} ${fold === id ? '▾' : '▸'}`, act: () => setFold(fold === id ? '' : id), sub: true }, ...(fold === id ? items.map((i) => ({ ...i, sub: false })) : [])] : []
  const markRead = (c: string): Item[] => (convs(c).some((x) => st.chats[x]?.unread) ? [{ label: 'Mark as read', act: () => convs(c).forEach((x) => run(api.call('markRead', x))) }] : [])
  const common = (c: string): Item[] => [...markRead(c), { label: muted(c) ? 'Unmute' : 'Mute', act: () => settings({ muted: { ...st.settings.muted, [c]: !muted(c) } }) }]
  const block = (k: Key, c?: string) =>
    confirm(
      `Block ${people.name(k)}?`,
      'You stop being friends, they can no longer send you friend requests or connect to you, and their messages in groups you share are hidden.',
      'Block',
      () => (c && leaveIfOpen(c), run(api.call('block', k))),
    )
  const unfriend = (k: Key, c?: string) =>
    confirm(`Remove ${people.name(k)}?`, 'You stop being friends. Your messages stay on both computers.', 'Remove friend', () => (c && leaveIfOpen(c), run(api.call('removeFriend', k))))

  function dmMenu(c: string): Item[][] {
    const k = otherIn(c, st.me)
    const pinned = st.settings.pinned ?? []
    const groups = Object.values(st.groups).filter((g) => g.members.includes(st.me) && !g.members.includes(k))
    return [
      [...common(c), { label: pinned.includes(c) ? 'Unpin' : 'Pin', act: () => settings({ pinned: pinned.includes(c) ? pinned.filter((x) => x !== c) : [...pinned, c] }) }],
      [
        { label: 'Profile', act: () => people.show(k) },
        { label: 'Copy friend ID', act: () => copyText(people.prof(k).handle || k) },
        { label: st.settings.nicknames?.[k] ? 'Change nickname' : 'Add nickname', act: () => setAsk({ nickname: k }) },
      ],
      [{ label: 'Start a call', act: () => startCall(c) }, ...folding('Invite to group', 'group', groups.map((g) => ({ label: groupName(g), act: () => run(api.call('addToGroup', g.id, k)) })))],
      [{ label: 'Close DM', act: () => (settings({ closed: { ...st.settings.closed, [c]: Date.now() }, pinned: pinned.filter((x) => x !== c) }), leaveIfOpen(c)) }],
      [
        { label: 'Remove friend', danger: true, act: () => unfriend(k, c) },
        { label: 'Block', danger: true, act: () => block(k, c) },
      ],
    ]
  }
  function groupMenu(c: string): Item[][] {
    const g = st.groups[c]
    return [
      common(c),
      [{ label: 'Start a call', act: () => startCall(c) }],
      [
        {
          label: 'Leave group',
          danger: true,
          act: () =>
            confirm(`Leave ${groupName(g)}?`, 'Its messages are deleted from this computer, and you cannot be added back to this group.', 'Leave group', () => (call.conv === c && call.leave(), leaveIfOpen(c), run(api.call('leaveGroup', c)))),
        },
      ],
    ]
  }
  function channelMenu(c: string): Item[][] {
    const [sid, cid] = c.split('.')
    const sv = st.servers[sid]
    const ch = sv?.channels.find((x) => x.id === cid)
    if (!ch) return []
    const perms = new Set(sv.mine.perms)
    const act = (kind: string, body: unknown) => run(api.call('serverAct', sid, kind, body))
    const connect = !!sv.mine.channels[cid]?.includes('connect')
    const mute: Item[] = muted(c)
      ? [{ label: 'Unmute channel', act: () => settings({ muted: { ...st.settings.muted, [c]: false } }) }]
      : folding('Mute channel', 'mute', MUTE_FOR.map(([label, ms]) => ({ label, act: () => settings({ muted: { ...st.settings.muted, [c]: ms ? Date.now() + ms : true } }) })))
    // A copy of the channel with its permissions, placed last
    const { id: _id, position: _pos, ...copy } = ch
    return [
      ch.kind === 'voice'
        ? [
            ...(call.conv === c ? [{ label: 'Leave call', act: call.leave }] : connect ? [{ label: 'Join call', act: () => startCall(c) }] : []),
            { label: 'Open chat', act: () => go(c) },
            ...(connect ? [{ label: 'Invite to voice channel', act: () => setAsk({ poke: c }) }] : []),
          ]
        : [],
      // shortcut: the link names the channel but nothing in the app opens it yet; add that where links are opened when wanted
      [...markRead(c), ...mute, { label: 'Copy link', act: () => copyText(`eleusinia://channel/${sid}/${cid}`) }],
      [
        ...(perms.has('manageChannels')
          ? [
              { label: 'Edit channel', act: () => setAsk({ edit: c }) },
              { label: 'Duplicate channel', act: () => act('channel.add', { ...copy, id: newId() }) },
            ]
          : []),
        ...(perms.has('createInvites') ? [{ label: 'Invite people', act: () => setAsk({ invite: sid }) }] : []),
      ],
      perms.has('manageChannels')
        ? [
            {
              label: 'Delete channel',
              danger: true,
              act: () => confirm(`Delete ${ch.name}?`, 'The channel and its messages go for everyone in the server.', 'Delete channel', () => (here === c && go(sid), act('channel.delete', { id: cid }))),
            },
          ]
        : [],
    ]
  }
  function personMenu(k: Key, c: string): Item[][] {
    if (k === st.me) return [[{ label: 'Profile', act: () => people.show(k) }]]
    const sv = st.servers[c.split('.')[0]]
    const name = people.name(k)
    const friend = st.friends[k] === 'friend'
    type Field = 'localMuted' | 'noVideo' | 'ignored'
    const has = (f: Field) => !!st.settings[f]?.includes(k)
    const flip = (f: Field) => settings({ [f]: has(f) ? st.settings[f]!.filter((x) => x !== k) : [...(st.settings[f] ?? []), k] })
    // Our servers they are not in: a fresh link, sent to them in our DM
    const ours = Object.values(st.servers).filter((s) => !s.members[k] && s.mine.perms.includes('createInvites'))
    const inviteTo = (id: string) => run(api.call('createInvite', id, { expires: Date.now() + 7 * 86400e3 }).then((link: string) => api.call('send', dmId(st.me, k), link)))
    // Server mute, deafen, move and disconnect: servers only, only on people ranked below us
    const perms = new Set(sv && below(sv, st.me, k) ? sv.mine.perms : [])
    const act = (kind: string, body: unknown) => run(api.call('serverAct', sv!.id, kind, body))
    const elsewhere = sv ? sv.channels.filter((x) => x.kind === 'voice' && `${sv.id}.${x.id}` !== c).sort((a, b) => a.position - b.position) : []
    return [
      [
        { label: 'Profile', act: () => people.show(k) },
        ...(friend
          ? [
              { label: 'Message', act: () => go(dmId(st.me, k)) },
              { label: 'Start a call', act: () => startCall(dmId(st.me, k)) },
            ]
          : []),
      ],
      [
        {
          label: 'User volume',
          node: (
            <>
              <p className="context-head">User volume</p>
              <PersonVolume st={st} k={k} name={name} />
            </>
          ),
        },
        { label: 'Mute', checked: has('localMuted'), act: () => flip('localMuted') },
        { label: 'Disable video', checked: has('noVideo'), act: () => flip('noVideo') },
        { label: 'Ignore', checked: has('ignored'), act: () => flip('ignored') },
      ],
      [
        ...(friend ? folding('Invite to server', 'server', ours.map((s) => ({ label: s.name, act: () => inviteTo(s.id) }))) : []),
        ...(friend ? [{ label: 'Remove friend', danger: true, act: () => unfriend(k) }] : st.friends[k] !== 'outgoing' ? [{ label: 'Add friend', act: () => run(api.call('addFriend', k, people.prof(k))) }] : []),
        { label: 'Block', danger: true, act: () => block(k) },
      ],
      [
        ...(perms.has('muteMembers') ? [{ label: 'Server mute', checked: !!sv!.voice[k]?.mute, act: () => act('voice.mute', { key: k, on: !sv!.voice[k]?.mute }) }] : []),
        ...(perms.has('deafenMembers') ? [{ label: 'Server deafen', checked: !!sv!.voice[k]?.deafen, act: () => act('voice.deafen', { key: k, on: !sv!.voice[k]?.deafen }) }] : []),
      ],
      perms.has('moveMembers')
        ? [...folding('Move to', 'move', elsewhere.map((x) => ({ label: x.name, act: () => act('voice.move', { key: k, channel: x.id }) }))), { label: 'Disconnect', danger: true, act: () => act('voice.disconnect', { key: k }) }]
        : [],
    ]
  }
  const addMenu: Item[][] = [
    [
      { label: 'Create a server', act: () => show({ kind: 'server' }) },
      { label: 'Join with an invite', act: () => show({ kind: 'join' }) },
    ],
    [{ label: 'Create a group', act: () => show({ kind: 'group' }) }],
  ]
  // Rebuilt from the latest state while open, so unfolded lists and checks follow it
  const of = (t: string): Item[][] =>
    t === '+'
      ? addMenu
      : t.includes(' ')
        ? personMenu(...(t.split(' ') as [Key, string]))
        : st.groups[t]
          ? groupMenu(t)
          : st.servers[t]
            ? [common(t)]
            : t.includes('.')
              ? channelMenu(t)
              : st.friends[otherIn(t, st.me)] === 'friend' || st.chats[t]
                ? dmMenu(t)
                : []
  const sections = menu ? of(menu.for) : []
  const at = (target: string, x: number, y: number) => (setFold(''), setMenu({ x, y, for: target }))
  const open = (target: string) => (e: { preventDefault: () => void; clientX: number; clientY: number; currentTarget: HTMLElement }) => {
    e.preventDefault()
    const r = e.currentTarget.getBoundingClientRect()
    // A keyboard's menu key gives no pointer position: open beside the item instead.
    if (e.clientX || e.clientY) at(target, e.clientX, e.clientY)
    else at(target, r.right + 8, r.top)
  }
  const target = ask && 'poke' in ask ? ask.poke : ask && 'edit' in ask ? ask.edit : ask && 'invite' in ask ? ask.invite : ''
  const sv = st.servers[target.split('.')[0]]
  const pokeCh = ask && 'poke' in ask ? sv?.channels.find((x) => `${sv.id}.${x.id}` === ask.poke) : undefined
  const node = (
    <>
      {menu && sections.some((s) => s.length) && <ContextMenu x={menu.x} y={menu.y} sections={sections} close={() => setMenu(null)} />}
      {ask && 'nickname' in ask && <Nickname st={st} k={ask.nickname} name={people.prof(ask.nickname).name || people.name(ask.nickname)} run={run} close={() => setAsk(null)} />}
      {sv && pokeCh && (
        <PokeDialog sv={sv} ch={pokeCh} keys={Object.keys(sv.members).filter((k) => k !== st.me && !call.active.get(target)?.has(k))} people={people} close={() => setAsk(null)} />
      )}
      {sv && ask && 'invite' in ask && <InviteDialog sv={sv} close={() => setAsk(null)} />}
      {sv && ask && 'edit' in ask && <ServerSettings st={st} id={sv.id} channel={ask.edit.split('.')[1]} close={() => setAsk(null)} run={run} />}
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
  return { open, at, node, for: menu?.for }
}

export function Rail(props: Props) {
  const { st, people, open, go } = props
  const [tip, setTip] = useState<{ text: string; top: number } | null>(null)
  const menus = useMenus(props)
  // Tooltips are drawn outside the rail so its scrolling list cannot clip them.
  const tipFor = (text: string) => ({
    onMouseEnter: (e: { currentTarget: HTMLElement }) => setTip({ text, top: e.currentTarget.getBoundingClientRect().top + 22 }),
    onFocus: (e: { currentTarget: HTMLElement }) => setTip({ text, top: e.currentTarget.getBoundingClientRect().top + 22 }),
    onMouseLeave: () => setTip(null),
    onBlur: () => setTip(null),
  })
  const muted = (c: string) => isMuted(st, c)
  // An ignored person's DM adds nothing to the counts (plan-sounds-menus.md, answers from the user)
  const quiet = (c: string) => muted(c) || (c.includes('_') && !!st.settings.ignored?.includes(otherIn(c, st.me)))
  // A server counts as in a call when any of its channels is (their conversations are `${server}.${channel}`).
  const inCall = (c: string) => [...call.active].some(([x, v]) => (x === c || x.startsWith(c + '.')) && v.size) || call.conv === c || !!call.conv?.startsWith(c + '.')
  // A server's conversations are its channels'; a muted channel or server adds nothing to its count
  const convs = (c: string) => (st.servers[c] ? Object.keys(st.chats).filter((x) => x.startsWith(c + '.')) : [c])
  const count = (c: string) => (muted(c) ? 0 : convs(c).reduce((n, x) => n + (quiet(x) ? 0 : (st.chats[x]?.unread ?? 0)), 0))
  const badges = (c: string) => (
    <>
      {inCall(c) && <span className="rail-badge" aria-hidden="true" />}
      {count(c) > 0 && (
        <span className="rail-count" aria-hidden="true">
          {count(c) > 99 ? '99+' : count(c)}
        </span>
      )}
    </>
  )
  const labelOf = (c: string, name: string) =>
    `${name}${count(c) ? `, ${count(c)} unread` : ''}${muted(c) ? ', muted' : ''}${inCall(c) ? ' (call in progress)' : ''}`
  const here = (c: string) => open === c || !!open?.startsWith(c + '.')

  const conv = (c: string, label: string, body: ReactNode, extra: string) => (
    <button
      key={c}
      className={`rail-item ${extra} ${here(c) ? 'active' : ''}`}
      aria-label={label}
      aria-current={here(c) ? 'page' : undefined}
      aria-haspopup="menu"
      onClick={() => go(c)}
      onContextMenu={menus.open(c)}
      {...tipFor(label)}
    >
      {body}
      {badges(c)}
    </button>
  )
  const dms = railDms(st)
  const servers = Object.values(st.servers ?? {})
  return (
    <nav className="rail" aria-label="Main">
      <button
        className={`rail-mark ${!open ? 'active' : ''}`}
        aria-label="Home: friends and direct messages"
        aria-current={!open ? 'page' : undefined}
        onClick={() => go(null)}
        onContextMenu={(e) => (e.preventDefault(), props.show({ kind: 'menu' }))}
        {...tipFor('Home')}
      >
        <Emblem size={42} />
      </button>
      <div className="rail-groups">
        {servers.map((v) => conv(v.id, labelOf(v.id, v.name), <GroupEmblem g={v} size={34} />, 'rail-group rail-server'))}
        {Object.values(st.groups).map((g) => conv(g.id, labelOf(g.id, groupName(g)), <GroupEmblem g={g} size={34} />, 'rail-group'))}
        {dms.map((c) => {
          const k = otherIn(c, st.me)
          return conv(c, labelOf(c, people.name(k)), <Avatar k={k} p={people.prof(k)} size={34} online={people.isOnline(k)} />, 'rail-dm')
        })}
      </div>
      <div className="rail-foot">
        <button
          className={`rail-item rail-add ${menus.for === '+' ? 'open' : ''}`}
          aria-label="Create or join"
          aria-haspopup="menu"
          aria-expanded={menus.for === '+'}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            menus.at('+', r.right + 8, r.top)
          }}
          {...tipFor('Create or join')}
        >
          <Icon name="plus" size={20} />
        </button>
      </div>
      {tip && (
        <div className="rail-tip" style={{ top: tip.top }} aria-hidden="true">
          {tip.text}
        </div>
      )}
      {menus.node}
    </nav>
  )
}

// A menu at the pointer, kept inside the window (up: above y, for a button at the window's foot). Arrow keys move
// between items, Escape or a click elsewhere closes it.
export function ContextMenu({ x, y, up, sections, close }: { x: number; y: number; up?: boolean; sections: Item[][]; close: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState({ left: x, top: y })
  useLayoutEffect(() => {
    const r = ref.current!.getBoundingClientRect()
    setAt({ left: Math.max(8, Math.min(x, innerWidth - r.width - 8)), top: Math.max(8, Math.min(up ? y - r.height : y, innerHeight - r.height - 8)) })
  }, [x, y, sections.flat().length])
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>('[role^=menuitem]')?.focus()
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && close()
    const blur = () => close()
    document.addEventListener('pointerdown', away, true)
    window.addEventListener('blur', blur)
    return () => {
      document.removeEventListener('pointerdown', away, true)
      window.removeEventListener('blur', blur)
      back?.focus()
    }
  }, [])
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = [...ref.current!.querySelectorAll<HTMLElement>('[role^=menuitem]')]
    const i = items.indexOf(document.activeElement as HTMLElement)
    const to = ({ ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: items.length - 1 } as Record<string, number>)[e.key]
    if (e.key === 'Escape' || e.key === 'Tab') return e.preventDefault(), close()
    if (to === undefined) return
    e.preventDefault()
    items[(to + items.length) % items.length]?.focus()
  }
  return createPortal(
    <div ref={ref} className="context-menu" role="menu" style={at} onKeyDown={key}>
      {sections
        .filter((s) => s.length)
        .map((s, i) => (
          <div key={i} className="context-section" role="group">
            {s.map((it) =>
              it.node ? (
                <div key={it.label} className="context-node">
                  {it.node}
                </div>
              ) : (
                <button
                  key={it.label}
                  role={it.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                  aria-checked={it.checked}
                  className={`context-item ${it.danger ? 'danger' : ''} ${it.sub === false ? 'nested' : ''} ${it.checked === undefined ? '' : 'has-check'}`}
                  // An item that unfolds more items, or a checkable one, keeps the menu open; every other one acts and closes it.
                  onClick={() => (it.act?.(), (it.sub === undefined || it.sub === false) && it.checked === undefined ? close() : undefined)}
                >
                  {it.checked !== undefined && (it.checked ? <Icon name="check" size={14} /> : <span className="check-space" />)}
                  {it.label}
                </button>
              ),
            )}
          </div>
        ))}
    </div>,
    document.body,
  )
}

// Our own name for someone, shown instead of theirs everywhere in this app; empty goes back to theirs.
function Nickname({ st, k, name, run, close }: { st: State; k: Key; name: string; run: Run; close: () => void }) {
  const [v, setV] = useState(st.settings.nicknames?.[k] ?? '')
  const save = () => {
    const { [k]: _old, ...rest } = st.settings.nicknames ?? {}
    const n = v.trim().slice(0, 32)
    run(api.call('setSettings', { nicknames: n ? { ...rest, [k]: n } : rest }))
    close()
  }
  return (
    <Dialog label="Nickname" close={close}>
      <form onSubmit={(e) => (e.preventDefault(), save())}>
        <h1>Nickname for {name}</h1>
        <p className="quiet">Only you see it. Leave it empty to show their own name again.</p>
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
