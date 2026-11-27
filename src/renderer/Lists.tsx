// The Home column's direct messages, and the activity notices: what friends start doing flashes for a few seconds in
// the bottom left corner and is gone, rather than piling up in a list, which read like keeping tabs on people.
import { type MouseEvent, useEffect, useState } from 'react'
import { type Key, type State, dmId, mutedNow, statusOf } from '../shared/protocol'
import * as call from './call'
import { ActivityLine } from './Activity'
import { type People, groupName } from './common'
import { otherIn, railDms } from './Rail'
import { Avatar, Icon } from './ui'

// A friend starting a game, joining a group or server call, coming online: this session only, never stored
export type Notice = { id: number; k: Key; kind: 'game' | 'voice' | 'online'; game?: string; conv?: string }
export const NOTICE_MS = 3000
let seen: { games: Map<Key, string>; calls: Map<string, Set<Key>>; online: Set<Key> } | null = null
let nextId = 0
const shown = new Map<string, number>() // the same news within 15 minutes is not told again
const listeners = new Set<(n: Notice) => void>()

// Compared with what was seen last time, after every render of the app; what was already so at start is not news.
export function observe(st: State) {
  const games = new Map<Key, string>()
  for (const [k, a] of Object.entries(st.activity)) if (k !== st.me && a?.game) games.set(k, a.game.name)
  const calls = new Map([...call.active].map(([c, ks]) => [c, new Set(ks)] as const))
  const online = new Set(st.online)
  if (seen) {
    const now = Date.now()
    const tell = (n: Omit<Notice, 'id'>) => {
      const same = [n.k, n.kind, n.game, n.conv].join('|')
      if (now - (shown.get(same) ?? -Infinity) < 15 * 60000) return
      shown.set(same, now)
      for (const l of listeners) l({ ...n, id: nextId++ })
    }
    for (const [k, g] of games) if (seen.games.get(k) !== g) tell({ k, kind: 'game', game: g })
    // Group and server calls only: a direct call rings, and is ours
    for (const [c, ks] of calls) if (st.groups[c] || st.servers[c.split('.')[0]]) for (const k of ks) if (k !== st.me && !seen.calls.get(c)?.has(k)) tell({ k, kind: 'voice', conv: c })
    for (const k of online) if (!seen.online.has(k) && st.friends[k] === 'friend') tell({ k, kind: 'online' })
  }
  seen = { games, calls, online }
}

// Where a call is, in words: a group, a server's voice channel, or a direct call
export function callName(st: State, name: (k: Key) => string, c: string) {
  if (st.groups[c]) return groupName(st.groups[c])
  const sv = st.servers[c.split('.')[0]]
  if (sv) return `${sv.channels.find((x) => `${sv.id}.${x.id}` === c)?.name ?? 'Voice'}, ${sv.name}`
  return name(otherIn(c, st.me))
}

// The notices, stacked above the user bar (and the call bar while in a call), newest at the bottom, at most three;
// each fades out over NOTICE_MS. A click opens what it is about, as the list's rows did.
export function ActivityNotices({ st, people, go }: { st: State; people: People; go: (c: string) => void }) {
  const [notices, setNotices] = useState<Notice[]>([])
  const [bottom, setBottom] = useState(72)
  useEffect(() => {
    const add = (n: Notice) => {
      setBottom((document.querySelector('.app > .bars') as HTMLElement | null)?.offsetHeight ?? 72)
      setNotices((ns) => [...ns, n].slice(-3))
      setTimeout(() => setNotices((ns) => ns.filter((x) => x.id !== n.id)), NOTICE_MS)
    }
    listeners.add(add)
    return () => void listeners.delete(add)
  }, [])
  if (!notices.length) return null
  const { name, prof, show } = people
  const words = (n: Notice) =>
    n.kind === 'game' ? (
      <>
        started playing <b>{n.game}</b>
      </>
    ) : n.kind === 'voice' ? (
      <>
        joined <b>{callName(st, name, n.conv!)}</b>
      </>
    ) : (
      'came online'
    )
  const open = (n: Notice) => (n.kind === 'voice' ? go(n.conv!) : st.friends[n.k] === 'friend' ? go(dmId(st.me, n.k)) : show(n.k))
  return (
    <div className="notices" role="status" aria-live="polite" style={{ bottom: bottom + 12 }}>
      {notices.map((n) => (
        <button key={n.id} className={`notice ${n.kind}`} onClick={() => open(n)}>
          <Avatar k={n.k} p={prof(n.k)} size={24} />
          <span className="notice-text">
            <b>{name(n.k)}</b> {words(n)}
          </span>
        </button>
      ))}
    </div>
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
    return statusOf(prof(k))?.text ?? (isOnline(k) ? 'Online' : <span className="handle">{prof(k).handle}</span>)
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
