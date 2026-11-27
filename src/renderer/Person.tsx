// The right column of a DM: who the other person is, beside the conversation. Their banner and picture, status, what
// they play now, whether we verified their key, our time together, what we share, and the pictures sent between us.
import { type KeyboardEvent, useEffect, useState } from 'react'
import { inlineKind } from '../shared/media'
import { type Key, type Msg, type State, statusOf } from '../shared/protocol'
import { type Showcase, PLAY_DAYS, daysBack, playLevel, sharing } from '../shared/activity'
import { GameGlance } from './Activity'
import { type People, api, groupName } from './common'
import { ProfileBanner } from './Profile'
import { togetherWith } from './together'
import { Avatar, VerifiedSeal, useAccent } from './ui'

const hours = (ms: number) => (ms < 3_600_000 ? `${Math.max(1, Math.round(ms / 60000))} min` : `${(ms / 3_600_000).toFixed(ms < 36_000_000 ? 1 : 0)} h`)
const when = (t: number) => {
  const d = Math.floor((Date.now() - t) / 86_400_000)
  return d < 1 ? 'today' : d < 2 ? 'yesterday' : `${d} days ago`
}

export function PersonPanel({ st, k, conv, people }: { st: State; k: Key; conv: string; people: People }) {
  const { name, prof, isOnline, show } = people
  const p = prof(k)
  const status = statusOf(p)
  const game = st.activity[k]?.game
  const t = togetherWith(k)
  const verified = !!st.settings.verified?.includes(k)
  const groups = Object.values(st.groups).filter((g) => g.members.includes(k) && g.members.includes(st.me))
  const servers = Object.values(st.servers).filter((v) => v.members[k])
  const accent = useAccent(k, p, p.gameArt === true ? game?.app : undefined)
  return (
    <div className="person-panel" style={{ ['--person' as string]: accent }}>
      <button className="person-head" onClick={(e) => show(k, e.currentTarget)} aria-label={`Open ${name(k)}'s profile`}>
        <ProfileBanner st={st} k={k} p={p} />
        <span className="person-portrait">
          <Avatar k={k} p={p} size={80} online={isOnline(k)} />
        </span>
      </button>
      <div className="person-body">
        <div className="person-name">
          {name(k)} {verified && <VerifiedSeal />}
        </div>
        <span className="row-sub"><span className="handle">{p.handle}</span></span>
        {status && (
          <p className="person-status">
            {status.text}
            {status.until && <span className="row-sub"> · until {new Date(status.until).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>}
          </p>
        )}
        <PlayDays st={st} k={k} />
        {p.about && <p className="person-about">{p.about}</p>}
        {game && (
          <button className="pop-glance" onClick={() => show(k)}>
            <GameGlance g={game} />
          </button>
        )}
        <ShowcaseView items={p.showcase} />
        {t && (t.calls > 0 || Object.keys(t.games).length > 0) && (
          <section className="person-section">
            <h3>Together</h3>
            {t.calls > 0 && (
              <p>
                Talked {hours(t.ms)} over {t.calls} {t.calls === 1 ? 'call' : 'calls'}, last {when(t.last)}
              </p>
            )}
            {Object.entries(t.games)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([g, n]) => (
                <p key={g}>
                  Played <b>{g}</b> at the same time on {n} {n === 1 ? 'day' : 'days'}
                </p>
              ))}
          </section>
        )}
        {(groups.length > 0 || servers.length > 0) && (
          <section className="person-section">
            <h3>In common</h3>
            <p>{[...servers.map((v) => v.name), ...groups.map(groupName)].join(', ')}</p>
          </section>
        )}
        <SharedMedia st={st} conv={conv} />
      </div>
    </div>
  )
}

// What they pinned to their profile: favourite games with their hours, or achievements, art from Steam
export function ShowcaseView({ items }: { items?: Showcase }) {
  if (!items?.length) return null
  return (
    <section className="person-section">
      <h3>Showcase</h3>
      <div className="showcase">
        {items.map((x, i) =>
          'ach' in x ? (
            <div key={i} className="show-item ach" title={`${x.ach}, ${x.game}`}>
              <img src={`eleusinia-art://achievement/${x.app}/${x.icon}`} alt="" />
              <span>
                <b>{x.ach}</b>
                <small>{x.game}</small>
              </span>
            </div>
          ) : (
            <div key={i} className="show-item game" title={x.game}>
              <img src={`eleusinia-art://steam/${x.app}/header`} alt="" />
              <span>
                <b>{x.game}</b>
                {x.hours !== undefined && <small>{x.hours.toLocaleString()} h</small>}
              </span>
            </div>
          ),
        )}
      </div>
    </section>
  )
}

// Two weeks of play (design/mockups/court-profile.html, 2): a cell a day, oldest first, today ringed, each in the
// person's accent at a fixed strength (playLevel). No key under it, so each cell says it all in its label, and the
// same words show on hover or focus. One tab stop: the arrow keys move between days.
export function PlayDays({ st, k }: { st: State; k: Key }) {
  const a = st.activity[k]
  const [at, setAt] = useState<number | null>(null)
  const [focus, setFocus] = useState(PLAY_DAYS - 1)
  const mine = k === st.me
  if (mine && !sharing(st.settings.activity))
    return (
      <section className="play-days">
        <h3>Two weeks of play</h3>
        <p className="play-empty">Activity is off. Turn it on in Settings, Activity.</p>
      </section>
    )
  if (!a?.week)
    return (
      <section className="play-days">
        <h3>Two weeks of play</h3>
        <p className="play-empty">Not shared</p>
      </section>
    )
  const week = a.week
  const now = Date.now()
  const games = (d: number) => week.filter((w) => w.d === d)
  const total = (d: number) => games(d).reduce((n, w) => n + w.m, 0)
  const sum = week.reduce((n, w) => n + w.m, 0)
  const date = (d: number) => new Date(daysBack(now, d)).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
  const label = (d: number) => `${date(d)}${d === 0 ? ', today' : ''}: ${total(d) ? games(d).map((w) => `${w.g} ${hours(w.m * 60000)}`).join(', ') : 'no play'}`
  const cells = [...Array(PLAY_DAYS).keys()].reverse() // d, oldest first
  const move = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : e.key === 'Home' ? -PLAY_DAYS : e.key === 'End' ? PLAY_DAYS : 0
    if (!step) return
    e.preventDefault()
    const i = Math.min(PLAY_DAYS - 1, Math.max(0, focus + step))
    setFocus(i)
    setAt(i)
    ;(e.currentTarget.children[i] as HTMLElement | undefined)?.focus()
  }
  return (
    <section className="play-days">
      <h3>
        Two weeks of play <span className="play-sum">{sum ? hours(sum * 60000) : 'none'}</span>
      </h3>
      <div className="play-cells" role="list" aria-label={`${sum ? `Played ${hours(sum * 60000)}` : 'Nothing played'} in the last two weeks`} onKeyDown={move} onPointerLeave={() => setAt(null)}>
        {cells.map((d, i) => (
          <span
            key={d}
            role="listitem"
            tabIndex={i === focus ? 0 : -1}
            className={`play-cell ${d === 0 ? 'today' : ''}`}
            data-l={playLevel(total(d))}
            aria-label={label(d)}
            onPointerEnter={() => setAt(i)}
            onFocus={() => (setFocus(i), setAt(i))}
            onBlur={() => setAt(null)}
          />
        ))}
        {at !== null && (
          <>
            <span className="play-tip" aria-hidden="true" style={{ ['--at' as string]: (at + 0.5) / PLAY_DAYS }}>
              <b>{date(cells[at])}</b>
              {total(cells[at]) ? (
                games(cells[at]).map((w) => (
                  <span key={w.g}>
                    <span>{w.g}</span>
                    <span>{hours(w.m * 60000)}</span>
                  </span>
                ))
              ) : (
                <span>No play</span>
              )}
            </span>
            <span className="play-tip-arrow" aria-hidden="true" style={{ ['--at' as string]: (at + 0.5) / PLAY_DAYS }} />
          </>
        )}
      </div>
      {!sum && <p className="play-empty">No play in the last 14 days</p>}
    </section>
  )
}

// The pictures sent in this conversation, newest first, as small tiles; asked again when a message arrives
function SharedMedia({ st, conv }: { st: State; conv: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const at = st.chats[conv]?.at
  useEffect(() => {
    api.call('history', conv, 300).then((h: { msgs: Msg[] }) => setMsgs(h.msgs))
  }, [conv, at])
  const pics = msgs
    .flatMap((m) => m.files ?? [])
    .filter((f) => inlineKind(f.t) === 'image')
    .reverse()
    .slice(0, 9)
  if (!pics.length) return null
  return (
    <section className="person-section">
      <h3>Shared pictures</h3>
      <div className="media-grid">
        {pics.map((f) => (
          <img key={f.h} src={`eleusinia-file://${f.h}`} alt={f.n} title={f.n} onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
        ))}
      </div>
    </section>
  )
}

// Recently played (the full card): the last games they played, newest first, with when. Hidden when they share none,
// or played nothing yet; the art comes from Steam by id, like every game picture.
export function RecentlyPlayed({ st, k }: { st: State; k: Key }) {
  const recent = st.activity[k]?.recent
  if (!recent?.length) return null
  return (
    <section className="recent">
      <h3>Recently played</h3>
      <ol>
        {recent.map((r) => (
          <li key={r.g}>
            {r.app ? <img className="recent-art" src={`eleusinia-art://steam/${r.app}/header`} alt="" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} /> : <span className="recent-art" aria-hidden="true" />}
            <span className="recent-game">{r.g}</span>
            <time className="recent-when" dateTime={new Date(r.at).toISOString()}>
              {whenPlayed(r.at)}
            </time>
          </li>
        ))}
      </ol>
    </section>
  )
}
// Today, 21:10; Yesterday; then the date
function whenPlayed(at: number, now = Date.now()) {
  const days = Math.round((daysBack(now, 0) - daysBack(at, 0)) / 864e5)
  if (days <= 0) return `Today, ${new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
  if (days === 1) return 'Yesterday'
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })
}
