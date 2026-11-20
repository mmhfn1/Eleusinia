// The Home column's own lists: what friends are doing (the activity feed) and the direct messages. The rail holds only
// servers and groups; these show on Home and beside an open DM or group, so a conversation is one click away.
import { type MouseEvent, useState } from 'react'
import { type Key, type State, dmId, mutedNow, statusOf } from '../shared/protocol'
import * as call from './call'
import { ActivityLine } from './Activity'
import { type People, groupName } from './common'
import { ContextMenu, type Item, otherIn, railDms } from './Rail'
import { Avatar, Icon } from './ui'

// What happened, newest first, for this session only: a friend starting a game, joining a call, coming online.
export type FeedItem = { id: number; at: number; k: Key; kind: 'game' | 'voice' | 'online'; game?: string; conv?: string }
let feed: FeedItem[] = []
let seen: { games: Map<Key, string>; calls: Map<string, Set<Key>>; online: Set<Key> } | null = null
let nextId = 0

// Compared with what was seen last time, after every render of the app; what was already so at start is not news.
export function observe(st: State) {
  const games = new Map<Key, string>()
  for (const [k, a] of Object.entries(st.activity)) if (k !== st.me && a?.game) games.set(k, a.game.name)
  const calls = new Map([...call.active].map(([c, ks]) => [c, new Set(ks)] as const))
  const online = new Set(st.online)
  if (seen) {
    const now = Date.now()
    // The same news again within 15 minutes moves the old line to the top instead of adding another
    const add = (i: Omit<FeedItem, 'id' | 'at'>) => {
      feed = feed.filter((x) => !(x.k === i.k && x.kind === i.kind && x.game === i.game && x.conv === i.conv && now - x.at < 15 * 60000))
      feed.unshift({ ...i, id: nextId++, at: now })
    }
    for (const [k, g] of games) if (seen.games.get(k) !== g) add({ k, kind: 'game', game: g })
    // Group and server calls only: a direct call rings, and is ours
    for (const [c, ks] of calls) if (st.groups[c] || st.servers[c.split('.')[0]]) for (const k of ks) if (k !== st.me && !seen.calls.get(c)?.has(k)) add({ k, kind: 'voice', conv: c })
    for (const k of online) if (!seen.online.has(k) && st.friends[k] === 'friend') add({ k, kind: 'online' })
    feed = feed.slice(0, 30)
  }
  seen = { games, calls, online }
}

const ago = (t: number) => {
  const m = Math.floor((Date.now() - t) / 60000)
  return m < 1 ? 'now' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h`
}

// Where a call is, in words: a group, a server's voice channel, or a direct call
export function callName(st: State, name: (k: Key) => string, c: string) {
  if (st.groups[c]) return groupName(st.groups[c])
  const sv = st.servers[c.split('.')[0]]
  if (sv) return `${sv.channels.find((x) => `${sv.id}.${x.id}` === c)?.name ?? 'Voice'}, ${sv.name}`
  return name(otherIn(c, st.me))
}

type Props = { st: State; people: People; go: (c: string) => void; join: (c: string) => void }

// Left click opens what it is about (their DM, or the call's place); right click offers to join them.
export function ActivityFeed({ st, people, go, join, max = 8 }: Props & { max?: number }) {
  const [menu, setMenu] = useState<{ x: number; y: number; items: Item[][] } | null>(null)
  const { name, prof, show } = people
  if (!feed.length) return null
  const callOf = (k: Key) => [...call.active].find(([, ks]) => ks.has(k))?.[0]
  const words = (i: FeedItem) =>
    i.kind === 'game' ? (
      <>
        started playing <b>{i.game}</b>
      </>
    ) : i.kind === 'voice' ? (
      <>
        joined <b>{callName(st, name, i.conv!)}</b>
      </>
    ) : (
      'came online'
    )
  const open = (i: FeedItem) => (i.kind === 'voice' ? go(i.conv!) : st.friends[i.k] === 'friend' ? go(dmId(st.me, i.k)) : show(i.k))
  const items = (i: FeedItem): Item[][] => {
    const c = i.conv ?? callOf(i.k)
    return [
      c && c !== call.conv ? [{ label: `Join ${callName(st, name, c)}`, act: () => join(c) }] : [],
      [
        ...(st.friends[i.k] === 'friend' ? [{ label: 'Message', act: () => go(dmId(st.me, i.k)) }] : []),
        { label: 'Profile', act: () => show(i.k) },
      ],
    ]
  }
  const right = (i: FeedItem) => (e: MouseEvent<HTMLElement>) => {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY, items: items(i) })
  }
  return (
    <section className="feed" aria-label="Activity">
      <div className="side-cat">Activity</div>
      {feed.slice(0, max).map((i) => (
        <button key={i.id} className={`feed-row ${i.kind}`} onClick={() => open(i)} onContextMenu={right(i)}>
          <Avatar k={i.k} p={prof(i.k)} size={24} />
          <span className="feed-text">
            <b>{name(i.k)}</b> {words(i)}
          </span>
          <time>{ago(i.at)}</time>
        </button>
      ))}
      {menu && <ContextMenu x={menu.x} y={menu.y} sections={menu.items} close={() => setMenu(null)} />}
    </section>
  )
}

// The direct messages: pinned first, then by the latest message; each with its count, its call and its menu.
export function DmList({ st, people, here, go, menu }: { st: State; people: People; here: string | null; go: (c: string) => void; menu: (c: string) => (e: MouseEvent<HTMLElement>) => void }) {
  const { name, prof, isOnline } = people
  const dms = railDms(st)
  // An ignored person's DM adds nothing to the counts, nor does a muted one
  const count = (c: string) => (mutedNow(st.settings, c) || st.settings.ignored?.includes(otherIn(c, st.me)) ? 0 : (st.chats[c]?.unread ?? 0))
  const inCall = (c: string) => !!call.active.get(c)?.size || call.conv === c
  const sub = (k: Key) => {
    const c = [...call.active].find(([, ks]) => ks.has(k))?.[0]
    if (st.activity[k]?.game) return <ActivityLine a={st.activity[k]} />
    if (c) return <span className="voice-line">In voice: {callName(st, name, c)}</span>
    return statusOf(prof(k))?.text ?? (isOnline(k) ? 'Online' : prof(k).handle)
  }
  return (
    <section className="dms" aria-label="Direct messages">
      <div className="side-cat">Direct messages</div>
      {dms.map((c) => {
        const k = otherIn(c, st.me)
        const n = count(c)
        const label = `${name(k)}${n ? `, ${n} unread` : ''}${mutedNow(st.settings, c) ? ', muted' : ''}${inCall(c) ? ' (call in progress)' : ''}`
        return (
          <button key={c} className={`side-row dm-row ${n ? 'unread' : ''} ${here === c ? 'active on' : ''}`} aria-label={label} aria-current={here === c ? 'page' : undefined} aria-haspopup="menu" onClick={() => go(c)} onContextMenu={menu(c)}>
            <Avatar k={k} p={prof(k)} size={32} online={isOnline(k)} />
            <span className="row-text">
              <span className="row-title">{name(k)}</span>
              <span className="row-sub">{sub(k)}</span>
            </span>
            {inCall(c) && (
              <span className="dm-badge" title="Call in progress">
                <Icon name="phone" size={13} />
              </span>
            )}
            {n > 0 && <span className="side-count dm-count">{n > 99 ? '99+' : n}</span>}
          </button>
        )
      })}
      {!dms.length && <p className="quiet">Conversations show here once a message is sent.</p>}
    </section>
  )
}
