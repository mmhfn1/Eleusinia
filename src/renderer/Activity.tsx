// Activity (docs/roadmap-activity.md): what a friend is playing, as one line in lists, a card on their profile, and
// the Settings section that says what is shared, with a preview of exactly what friends see.
import { useEffect, useReducer, useState } from 'react'
import { type Achievement, type Activity, type ActivitySettings, type Game } from '../shared/activity'
import { type Key, type State } from '../shared/protocol'
import { api } from './common'

// Re-renders every `ms`, so times since a start move on the viewer's side; nothing is resent for it.
function useTick(ms: number) {
  const [, tick] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    const t = setInterval(tick, ms)
    return () => clearInterval(t)
  }, [ms])
}

export const duration = (ms: number) => {
  const min = Math.max(0, Math.floor(ms / 60000))
  if (min < 1) return 'just started'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  return min % 60 ? `${h} h ${min % 60} min` : `${h} h`
}
const ago = (at: number) => {
  const s = (Date.now() - at) / 1000
  if (s < 90) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  if (s < 30 * 86400) return `${Math.round(s / 86400)} days ago`
  return new Date(at).toLocaleDateString()
}
const hours = (min: number) => (min < 60 ? `${min} min` : `${Math.round(min / 60).toLocaleString()} h`)

// "Playing Deadlock · 1 h 12 min", for friend rows.
export function ActivityLine({ a }: { a?: Activity }) {
  useTick(30000)
  if (!a?.game) return null
  return (
    <span className="activity-line" title={a.game.name}>
      Playing <b>{a.game.name}</b> · {duration(Date.now() - a.game.since)}
    </span>
  )
}

const hide = (e: { currentTarget: HTMLImageElement }) => (e.currentTarget.style.display = 'none')

function AchievementRow({ app, x }: { app?: number; x: Achievement }) {
  return (
    <li className="achievement">
      {app && x.icon ? <img src={`eleusinia-art://achievement/${app}/${x.icon}`} alt="" width={40} height={40} onError={hide} /> : <span className="achievement-blank" />}
      <span className="row-text">
        <span className="row-title">{x.name}</span>
        {x.desc && <span className="achievement-desc">{x.desc}</span>}
        <span className="row-sub">
          {x.at ? `Unlocked ${ago(x.at)}` : 'Unlocked'}
          {x.rarity !== undefined && ` · ${x.rarity < 10 ? x.rarity.toFixed(1) : Math.round(x.rarity)}% of players have it`}
        </span>
      </span>
    </li>
  )
}

// The whole card. full: the profile view, with the description, every recent achievement and the Steam buttons.
export function GameCard({ g, full = true }: { g: Game; full?: boolean }) {
  useTick(15000)
  const session = Date.now() - g.since
  const facts = [g.genres?.slice(0, 3).join(', '), g.developer, g.released].filter(Boolean)
  const a = g.achievements
  return (
    <section className="activity-card" aria-label={`Playing ${g.name}`}>
      {g.app && <img className="activity-art" src={`eleusinia-art://steam/${g.app}/header`} alt="" onError={hide} />}
      <div className="activity-body">
        <p className="activity-kicker">Playing{g.source === 'steam' ? ' on Steam' : ''}</p>
        <h3>{g.name}</h3>
        <p className="row-sub">
          For {duration(session)}
          {g.played !== undefined && ` · ${hours(g.played + Math.floor(session / 60000))} in total`}
        </p>
        {facts.length > 0 && <p className="activity-facts">{facts.join(' · ')}</p>}
        {full && g.about && <p className="activity-about">{g.about}</p>}
        {a && (
          <div className="activity-achievements">
            <div className="achievement-head">
              <span>Achievements</span>
              <span>
                {a.got} of {a.total} · {Math.round((a.got / a.total) * 100)}%
              </span>
            </div>
            <div className="achievement-bar" role="progressbar" aria-valuemin={0} aria-valuemax={a.total} aria-valuenow={a.got}>
              <span style={{ width: `${(a.got / a.total) * 100}%` }} />
            </div>
            {a.recent.length > 0 && <ul className="achievement-list">{(full ? a.recent : a.recent.slice(0, 1)).map((x, i) => <AchievementRow key={i} app={g.app} x={x} />)}</ul>}
          </div>
        )}
        {full && g.app && (
          <div className="activity-actions">
            <button className="button" onClick={() => window.api.openSteam(g.app!, 'store')}>
              Store page
            </button>
            <button className="button" onClick={() => window.api.openSteam(g.app!, 'run')}>
              Play on Steam
            </button>
          </div>
        )}
      </div>
    </section>
  )
}

// On someone's profile card: their game, or for a friend, whether they see ours.
export function ProfileActivity({ st, k }: { st: State; k: Key }) {
  const g = st.activity[k]?.game
  const set = st.settings.activity
  const hidden = set?.hidden?.includes(k)
  return (
    <>
      {g && <GameCard g={g} />}
      {k !== st.me && set?.games && st.friends[k] === 'friend' && (
        <label className="check-row activity-hide">
          <input type="checkbox" role="switch" checked={!hidden} onChange={(e) => api.call('setSettings', { activity: { ...set, hidden: e.target.checked ? (set.hidden ?? []).filter((h) => h !== k) : [...(set.hidden ?? []), k] } })} />
          <span>Show them what I'm playing</span>
        </label>
      )}
    </>
  )
}

// Settings → Activity.
export function ActivitySettingsSection({ st, name }: { st: State; name: (k: Key) => string }) {
  const set: ActivitySettings = st.settings.activity ?? {}
  const save = (p: Partial<ActivitySettings>) => api.call('setSettings', { activity: { ...set, ...p } })
  const mine = st.activity[st.me]?.game
  const [programs, setPrograms] = useState<string[] | null>(null)
  const [pick, setPick] = useState('')
  const [title, setTitle] = useState('')
  const extra = Object.entries(set.extra ?? {})
  const detail = (field: 'playtime' | 'achievements' | 'details', label: string) => (
    <label className="check-row">
      <input type="checkbox" role="switch" disabled={!set.games} checked={set[field] !== false} onChange={(e) => save({ [field]: e.target.checked })} />
      <span>{label}</span>
    </label>
  )
  function add() {
    if (!pick || !title.trim()) return
    save({ extra: { ...set.extra, [pick]: title.trim().slice(0, 100) } })
    setPick('')
    setTitle('')
    setPrograms(null)
  }
  return (
    <>
      <label className="check-row">
        <input type="checkbox" role="switch" checked={!!set.games} onChange={(e) => save({ games: e.target.checked })} />
        <span>
          Share the game I'm playing with friends and group members. Found from Steam, or by the game's program. Never
          shown to anyone else
        </span>
      </label>
      <div className="activity-details">
        {detail('playtime', 'How long I have played it in total')}
        {detail('achievements', 'My achievements in it, with the newest ones')}
        {detail('details', 'Its genre, developer, release date and description')}
      </div>
      {set.games && (
        <div className="activity-preview">
          <p className="row-sub">What friends see now</p>
          {mine ? <GameCard g={mine} /> : <p className="quiet">No game running.</p>}
        </div>
      )}
      {(set.hidden?.length ?? 0) > 0 && (
        <div className="activity-hidden">
          <p className="row-sub">Never shown to</p>
          {set.hidden!.map((k) => (
            <div className="settings-row" key={k}>
              <span className="row-text">
                <span className="row-title">{name(k)}</span>
              </span>
              <button className="button subtle" onClick={() => save({ hidden: set.hidden!.filter((h) => h !== k) })}>
                Show again
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="activity-extra">
        <p className="row-sub">Games found by their program, besides Steam and the built-in list</p>
        {extra.map(([exe, game]) => (
          <div className="settings-row" key={exe}>
            <span className="row-text">
              <span className="row-title">{game}</span>
              <span className="row-sub">{exe}</span>
            </span>
            <button className="button subtle" onClick={() => save({ extra: Object.fromEntries(extra.filter(([e]) => e !== exe)) })}>
              Remove
            </button>
          </div>
        ))}
        {programs === null ? (
          <button className="button" onClick={() => window.api.programs().then(setPrograms)}>
            Add a game…
          </button>
        ) : (
          <div className="activity-add">
            <select aria-label="Running program" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Pick the game's program (start the game first)</option>
              {programs.sort().map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <input aria-label="Game name" placeholder="Game name" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} />
            <button className="button primary" disabled={!pick || !title.trim()} onClick={add}>
              Add
            </button>
            <button className="button subtle" onClick={() => setPrograms(null)}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </>
  )
}
