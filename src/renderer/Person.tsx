// The right column of a DM: who the other person is, beside the conversation. Their banner and picture, status, what
// they play now, whether we verified their key, our time together, what we share, and the pictures sent between us.
import { useEffect, useState } from 'react'
import { inlineKind } from '../shared/media'
import { type Key, type Msg, type State, statusOf } from '../shared/protocol'
import type { Showcase, Week } from '../shared/activity'
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
  const accent = useAccent(k, p, p.gameArt === false ? undefined : game?.app)
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
        <span className="row-sub">{p.handle}</span>
        {status && (
          <p className="person-status">
            {status.text}
            {status.until && <span className="row-sub"> · until {new Date(status.until).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>}
          </p>
        )}
        {p.about && <p className="person-about">{p.about}</p>}
        {game && (
          <button className="pop-glance" onClick={() => show(k)}>
            <GameGlance g={game} />
          </button>
        )}
        <ShowcaseView items={p.showcase} />
        <WeekBars week={st.activity[k]?.week} />
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

const GAME_TONES = ['var(--accent)', 'var(--cyan)', 'var(--online)', 'var(--danger)', 'var(--mist)']
// A week of play: a bar per day, stacked by game, from what their own app counted and shares (Activity.week)
export function WeekBars({ week }: { week?: Week }) {
  if (!week?.length) return null
  const games = [...new Set(week.map((w) => w.g))]
  const total = (d: number) => week.filter((w) => w.d === d).reduce((n, w) => n + w.m, 0)
  const top = Math.max(60, ...[0, 1, 2, 3, 4, 5, 6].map(total))
  const day = (d: number) => (d === 0 ? 'Today' : new Date(Date.now() - d * 864e5).toLocaleDateString(undefined, { weekday: 'short' }))
  const sum = week.reduce((n, w) => n + w.m, 0)
  return (
    <section className="person-section week">
      <h3>This week · {hours(sum * 60000)}</h3>
      <div className="week-bars" role="img" aria-label={`Played ${hours(sum * 60000)} this week`}>
        {[6, 5, 4, 3, 2, 1, 0].map((d) => (
          <div key={d} className="week-day" title={`${day(d)}: ${hours(total(d) * 60000 || 0)}`}>
            <span className="week-stack">
              {week
                .filter((w) => w.d === d)
                .map((w) => (
                  <i key={w.g} style={{ height: `${(w.m / top) * 100}%`, background: GAME_TONES[games.indexOf(w.g) % GAME_TONES.length] }} />
                ))}
            </span>
            <small>{day(d).slice(0, 2)}</small>
          </div>
        ))}
      </div>
      <p className="week-legend">
        {games.slice(0, 3).map((g, i) => (
          <span key={g}>
            <i style={{ background: GAME_TONES[i] }} /> {g}
          </span>
        ))}
      </p>
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
