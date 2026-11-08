// The rail down the left edge: the emblem (Home), servers, groups, direct conversations with at least one message,
// and a right-click menu for each conversation. Unread messages and missed calls show as a count on its picture.
import { type KeyboardEvent, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { type Key, type State } from '../shared/protocol'
import * as call from './call'
import { type Modal, type People, type Run, api, groupName } from './common'
import { Avatar, Dialog, Emblem, GroupEmblem, Icon } from './ui'

type Props = { st: State; people: People; open: string | null; go: (c: string | null) => void; show: (m: Modal) => void; run: Run }
// checked: a checkable item, which keeps the menu open
export type Item = { label: string; act: () => void; danger?: boolean; sub?: boolean; checked?: boolean }
// A menu is sections of items; a divider goes between sections.
type Menu = { x: number; y: number; for: string }
type Ask = { title: string; body: string; yes: string; act: () => void } | { nickname: Key } | null

export const otherIn = (c: string, me: Key) => c.split('_').find((k) => k !== me)!

// The direct conversations on the rail: those with a message, not closed since, pinned first, then the latest.
export function railDms(st: State) {
  const pinned = st.settings.pinned ?? []
  const dms = Object.entries(st.chats)
    .filter(([c, ch]) => !st.groups[c] && !st.blocked.includes(otherIn(c, st.me)) && (pinned.includes(c) || ch.at > (st.settings.closed?.[c] ?? 0)))
    .sort(([a, x], [b, y]) => (pinned.includes(a) ? pinned.indexOf(a) - 1e15 : -x.at) - (pinned.includes(b) ? pinned.indexOf(b) - 1e15 : -y.at))
  return dms.map(([c]) => c)
}

export function Rail({ st, people, open, go, show, run }: Props) {
  const [tip, setTip] = useState<{ text: string; top: number } | null>(null)
  const [menu, setMenu] = useState<Menu | null>(null)
  const [invite, setInvite] = useState(false)
  const [ask, setAsk] = useState<Ask>(null)
  // Tooltips are drawn outside the rail so its scrolling list cannot clip them.
  const tipFor = (text: string) => ({
    onMouseEnter: (e: { currentTarget: HTMLElement }) => setTip({ text, top: e.currentTarget.getBoundingClientRect().top + 22 }),
    onFocus: (e: { currentTarget: HTMLElement }) => setTip({ text, top: e.currentTarget.getBoundingClientRect().top + 22 }),
    onMouseLeave: () => setTip(null),
    onBlur: () => setTip(null),
  })
  const settings = (p: Partial<State['settings']>) => run(api.call('setSettings', p))
  const muted = (c: string) => !!st.settings.muted?.[c]
  // A server counts as in a call when any of its channels is (their conversations are `${server}.${channel}`).
  const inCall = (c: string) => [...call.active].some(([x, v]) => (x === c || x.startsWith(c + '.')) && v.size) || call.conv === c || !!call.conv?.startsWith(c + '.')
  const count = (c: string) => (muted(c) ? 0 : (st.chats[c]?.unread ?? 0))
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
  const leaveIfOpen = (c: string) => open === c && go(null)
  const startCall = (c: string) => (go(c), run(call.join(c)))
  const common = (c: string): Item[] => [
    ...(st.chats[c]?.unread ? [{ label: 'Mark as read', act: () => run(api.call('markRead', c)) }] : []),
    { label: muted(c) ? 'Unmute' : 'Mute', act: () => settings({ muted: { ...st.settings.muted, [c]: !muted(c) } }) },
  ]

  function dmMenu(c: string): Item[][] {
    const k = otherIn(c, st.me)
    const pinned = st.settings.pinned ?? []
    const name = people.name(k)
    const groups = Object.values(st.groups).filter((g) => g.members.includes(st.me) && !g.members.includes(k))
    return [
      [...common(c), { label: pinned.includes(c) ? 'Unpin' : 'Pin', act: () => settings({ pinned: pinned.includes(c) ? pinned.filter((x) => x !== c) : [...pinned, c] }) }],
      [
        { label: 'Profile', act: () => people.show(k) },
        { label: 'Copy friend ID', act: () => navigator.clipboard.writeText(people.prof(k).handle || k) },
        { label: st.settings.nicknames?.[k] ? 'Change nickname' : 'Add nickname', act: () => setAsk({ nickname: k }) },
      ],
      [
        { label: 'Start a call', act: () => startCall(c) },
        ...(groups.length ? [{ label: invite ? 'Invite to group ▾' : 'Invite to group ▸', act: () => setInvite(!invite), sub: true }] : []),
        ...(invite ? groups.map((g) => ({ label: groupName(g), act: () => run(api.call('addToGroup', g.id, k)), sub: false })) : []),
      ],
      [{ label: 'Close DM', act: () => (settings({ closed: { ...st.settings.closed, [c]: Date.now() }, pinned: pinned.filter((x) => x !== c) }), leaveIfOpen(c)) }],
      [
        {
          label: 'Remove friend',
          danger: true,
          act: () => setAsk({ title: `Remove ${name}?`, body: 'You stop being friends. Your messages stay on both computers.', yes: 'Remove friend', act: () => (leaveIfOpen(c), run(api.call('removeFriend', k))) }),
        },
        {
          label: 'Block',
          danger: true,
          act: () =>
            setAsk({
              title: `Block ${name}?`,
              body: 'You stop being friends, they can no longer send you friend requests or connect to you, and their messages in groups you share are hidden.',
              yes: 'Block',
              act: () => (leaveIfOpen(c), run(api.call('block', k))),
            }),
        },
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
            setAsk({
              title: `Leave ${groupName(g)}?`,
              body: 'Its messages are deleted from this computer, and you cannot be added back to this group.',
              yes: 'Leave group',
              act: () => (call.conv === c && call.leave(), leaveIfOpen(c), run(api.call('leaveGroup', c))),
            }),
        },
      ],
    ]
  }
  // The menu is rebuilt from the latest state while open (the invite list unfolds in place).
  const openMenu = (c: string) => (e: { preventDefault: () => void; clientX: number; clientY: number; currentTarget: HTMLElement }) => {
    e.preventDefault()
    const r = e.currentTarget.getBoundingClientRect()
    // A keyboard's menu key gives no pointer position: open beside the item instead.
    const at = e.clientX || e.clientY ? { x: e.clientX, y: e.clientY } : { x: r.right + 8, y: r.top }
    setInvite(false)
    setMenu({ ...at, for: c })
  }
  const addMenu: Item[][] = [
    [
      { label: 'Create a server', act: () => show({ kind: 'server' }) },
      { label: 'Join with an invite', act: () => show({ kind: 'join' }) },
    ],
    [{ label: 'Create a group', act: () => show({ kind: 'group' }) }],
  ]
  const sections = menu ? (menu.for === '+' ? addMenu : st.groups[menu.for] ? groupMenu(menu.for) : st.chats[menu.for] ? dmMenu(menu.for) : []) : []
  const here = (c: string) => open === c || !!open?.startsWith(c + '.')

  const conv = (c: string, label: string, body: ReactNode, extra: string) => (
    <button
      key={c}
      className={`rail-item ${extra} ${here(c) ? 'active' : ''}`}
      aria-label={label}
      aria-current={here(c) ? 'page' : undefined}
      aria-haspopup="menu"
      onClick={() => go(c)}
      onContextMenu={openMenu(c)}
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
        onContextMenu={(e) => (e.preventDefault(), show({ kind: 'menu' }))}
        {...tipFor('Home')}
      >
        <Emblem size={42} />
      </button>
      <div className="rail-groups">
        {servers.map((v) => conv(v.id, labelOf(v.id, v.name), <GroupEmblem g={v} size={34} />, 'rail-group rail-server'))}
        {servers.length > 0 && <span className="rail-sep" aria-hidden="true" />}
        {Object.values(st.groups).map((g) => conv(g.id, labelOf(g.id, groupName(g)), <GroupEmblem g={g} size={34} />, 'rail-group'))}
        <button
          className={`rail-item rail-add ${menu?.for === '+' ? 'open' : ''}`}
          aria-label="Create or join"
          aria-haspopup="menu"
          aria-expanded={menu?.for === '+'}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            setMenu({ x: r.right + 8, y: r.top, for: '+' })
          }}
          {...tipFor('Create or join')}
        >
          <Icon name="plus" size={20} />
        </button>
        {dms.length > 0 && <span className="rail-sep" aria-hidden="true" />}
        {dms.map((c) => {
          const k = otherIn(c, st.me)
          return conv(c, labelOf(c, people.name(k)), <Avatar k={k} p={people.prof(k)} size={34} online={people.isOnline(k)} />, 'rail-dm')
        })}
      </div>
      <div className="rail-foot">
        <button className="rail-item" aria-label="Settings" onClick={() => show({ kind: 'settings' })} {...tipFor('Settings')}>
          <Icon name="settings" size={20} />
        </button>
        <button className="rail-item" aria-label="Your profile" onClick={() => show({ kind: 'card', k: st.me })} {...tipFor('Your profile')}>
          <Avatar k={st.me} p={st.profile} size={34} />
        </button>
      </div>
      {tip && (
        <div className="rail-tip" style={{ top: tip.top }} aria-hidden="true">
          {tip.text}
        </div>
      )}
      {menu && sections.length > 0 && <ContextMenu x={menu.x} y={menu.y} sections={sections} close={() => setMenu(null)} />}
      {ask && 'nickname' in ask && <Nickname st={st} k={ask.nickname} name={people.prof(ask.nickname).name || people.name(ask.nickname)} run={run} close={() => setAsk(null)} />}
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
    </nav>
  )
}

// A menu at the pointer, kept inside the window. Arrow keys move between items, Escape or a click elsewhere closes it.
export function ContextMenu({ x, y, sections, close }: { x: number; y: number; sections: Item[][]; close: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState({ left: x, top: y })
  useLayoutEffect(() => {
    const r = ref.current!.getBoundingClientRect()
    setAt({ left: Math.max(8, Math.min(x, innerWidth - r.width - 8)), top: Math.max(8, Math.min(y, innerHeight - r.height - 8)) })
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
            {s.map((it) => (
              <button
                key={it.label}
                role={it.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                aria-checked={it.checked}
                className={`context-item ${it.danger ? 'danger' : ''} ${it.sub === false ? 'nested' : ''} ${it.checked === undefined ? '' : 'has-check'}`}
                // An item that unfolds more items, or a checkable one, keeps the menu open; every other one acts and closes it.
                onClick={() => (it.act(), (it.sub === undefined || it.sub === false) && it.checked === undefined ? close() : undefined)}
              >
                {it.checked !== undefined && (it.checked ? <Icon name="check" size={14} /> : <span className="check-space" />)}
                {it.label}
              </button>
            ))}
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
