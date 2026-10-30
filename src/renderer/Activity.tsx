// Activity (docs/roadmap-activity.md): what a friend is playing, as one line in lists, a card on their profile, and
// the Settings section that says what is shared, with a preview of exactly what friends see.
import { useEffect, useReducer, useState } from 'react'
import { type Achievement, type Activity, type ActivitySettings, type Game, sharing } from '../shared/activity'
import { type Cs2, mapName, modeName, roundWin, weaponName } from '../shared/cs2'
import type { Destiny } from '../shared/destiny'
import { type Dota, heroName, itemName, stateName } from '../shared/dota'
import { type Key, type State } from '../shared/protocol'
import { api } from './common'
import { Brand, CopyButton } from './ui'

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

// Our side's score first: "Mirage 9–7".
const cs2Score = (c: Cs2) => {
  if (c.ct === undefined || c.t === undefined) return ''
  const [us, them] = c.team === 'T' ? [c.t, c.ct] : [c.ct, c.t]
  return `${us}–${them}`
}
// Dota 2 the same way: "Anti-Mage 21–14".
const dotaScore = (d: Dota) => {
  if (d.radiant === undefined || d.dire === undefined) return ''
  const [us, them] = d.team === 'dire' ? [d.dire, d.radiant] : [d.radiant, d.dire]
  return `${us}–${them}`
}
// "Playing Deadlock · 1 h 12 min", or with live details "Playing Counter-Strike 2 · Mirage 9–7", for friend rows.
export function ActivityLine({ a }: { a?: Activity }) {
  useTick(30000)
  if (!a?.game) return null
  const c = a.game.cs2
  const d = a.game.dota
  const n = a.game.destiny
  const live = n
    ? n.orbit
      ? 'in orbit'
      : n.activity && [n.activity.mode, n.activity.name].filter(Boolean).join(' · ') + (n.score ? ` ${n.score.us}–${n.score.them}` : '')
    : c
    ? c.menu
      ? 'in the menu'
      : [c.map && mapName(c.map), cs2Score(c)].filter(Boolean).join(' ')
    : d && (d.menu ? 'in the menu' : d.watching ? 'watching a match' : [d.hero && heroName(d.hero), dotaScore(d)].filter(Boolean).join(' '))
  return (
    <span className="activity-line" title={a.game.name}>
      Playing <b>{a.game.name}</b> · {live || duration(Date.now() - a.game.since)}
    </span>
  )
}

// m:ss until the phase ends, ticking here.
function Countdown({ at }: { at: number }) {
  useTick(1000)
  const s = Math.max(0, Math.round((at - Date.now()) / 1000))
  return <span className="cs2-clock">{`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`}</span>
}
// A match clock counting up from 0:00 (negative before the horn), ticking here; frozen while paused.
const clockText = (s: number) => `${s < 0 ? '-' : ''}${Math.floor(Math.abs(s) / 60)}:${String(Math.abs(s) % 60).padStart(2, '0')}`
function MatchClock({ d }: { d: Dota }) {
  useTick(1000)
  if (d.clock !== undefined) return <span className="cs2-clock">{clockText(d.clock)} · Paused</span>
  if (d.clockAt === undefined) return <>–</>
  return <span className="cs2-clock">{clockText(Math.floor((Date.now() - d.clockAt) / 1000))}</span>
}
const item = (i: string, key: number) =>
  i ? (
    <li key={key} title={itemName(i)}>
      <img src={`eleusinia-art://dota/items/${i}`} alt={itemName(i)} onError={hide} />
    </li>
  ) : (
    <li key={key} className="empty" />
  )
const bar = (label: string, v: number, max: number, kind: string) => (
  <div className={`dota-bar ${kind}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={v} title={`${label} ${v} / ${max}`}>
    <span style={{ width: `${max ? Math.min(100, (v / max) * 100) : 0}%` }} />
    <b>
      {v.toLocaleString()} / {max.toLocaleString()}
    </b>
  </div>
)

// A Dota 2 match as the game describes it: our hero, the kills per side, the clock, our numbers and, if shared, gold
// and items.
function DotaMatch({ d }: { d: Dota }) {
  if (d.menu) return <p className="cs2-menu">In the main menu</p>
  const score = d.radiant !== undefined && d.dire !== undefined
  const s = d.stats
  const l = d.live
  const where = [
    d.state && stateName(d.state),
    d.day !== undefined && d.state === 'game_in_progress' && (d.day ? 'Day' : 'Night'),
    d.winner && `${d.winner === 'radiant' ? 'Radiant' : 'Dire'} victory`,
  ]
  return (
    <div className="cs2 dota">
      <div className="dota-hero">
        {d.hero && <img src={`eleusinia-art://dota/heroes/${d.hero}`} alt="" onError={hide} />}
        <span className="row-text">
          <span className="cs2-map">{d.watching ? 'Watching a match' : d.hero ? heroName(d.hero) : 'In a match'}</span>
          <span className="row-sub">{[d.level !== undefined && `Level ${d.level}`, ...where].filter(Boolean).join(' · ')}</span>
        </span>
      </div>
      {score && (
        <div className="cs2-score" aria-label={`Radiant ${d.radiant} kills, Dire ${d.dire} kills`}>
          <span className={`cs2-team radiant${d.team === 'radiant' ? ' ours' : ''}`}>
            <span>Radiant</span>
            <b>{d.radiant}</b>
          </span>
          <span className="cs2-mid">
            <MatchClock d={d} />
          </span>
          <span className={`cs2-team dire${d.team === 'dire' ? ' ours' : ''}`}>
            <b>{d.dire}</b>
            <span>Dire</span>
          </span>
        </div>
      )}
      {s && (
        <dl className="cs2-stats">
          <div>
            <dt>K / D / A</dt>
            <dd>
              {s.kills} / {s.deaths} / {s.assists}
            </dd>
          </div>
          <div>
            <dt>LH / DN</dt>
            <dd>
              {s.lastHits} / {s.denies}
            </dd>
          </div>
          <div>
            <dt>GPM / XPM</dt>
            <dd>
              {s.gpm} / {s.xpm}
            </dd>
          </div>
          {s.streak >= 3 && (
            <div>
              <dt>Kill streak</dt>
              <dd>{s.streak}</dd>
            </div>
          )}
        </dl>
      )}
      {l && (
        <>
          {l.respawnAt ? (
            <p className="dota-dead">
              Dead · respawning in <Countdown at={l.respawnAt} />
            </p>
          ) : (
            <div className="dota-bars">
              {bar('Health', l.health, l.maxHealth, 'health')}
              {bar('Mana', l.mana, l.maxMana, 'mana')}
            </div>
          )}
          <div className="dota-items">
            <ul aria-label="Items">{l.items.map(item)}</ul>
            {l.neutral && (
              <ul className="neutral" aria-label="Neutral item">
                {item(l.neutral, 0)}
              </ul>
            )}
            {l.backpack.some(Boolean) && (
              <ul className="backpack" aria-label="Backpack">
                {l.backpack.map(item)}
              </ul>
            )}
          </div>
          <dl className="cs2-stats">
            <div>
              <dt>Gold</dt>
              <dd>{l.gold.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Buyback</dt>
              <dd>{l.buyback !== undefined ? `Ready, ${l.buyback.toLocaleString()} gold` : 'On cooldown'}</dd>
            </div>
            {(l.scepter || l.shard) && (
              <div>
                <dt>Aghanim's</dt>
                <dd>{[l.scepter && 'Scepter', l.shard && 'Shard'].filter(Boolean).join(' + ')}</dd>
              </div>
            )}
          </dl>
        </>
      )}
    </div>
  )
}

// Destiny 2 from Bungie.net: the activity with its picture, the guardian, the fireteam and the loadout.
const bungieArt = (path: string) => `eleusinia-art://bungie${path}`
function DestinyMatch({ d }: { d: Destiny }) {
  useTick(30000)
  const a = d.activity
  const ch = d.character
  const f = d.fireteam
  return (
    <div className="cs2 destiny">
      {a?.image && <img className="destiny-art" src={bungieArt(a.image)} alt="" onError={hide} />}
      {d.orbit ? (
        <p className="cs2-map">In orbit</p>
      ) : (
        a && (
          <div className="cs2-head">
            <span className="cs2-map">{a.name}</span>
            <span className="row-sub">
              {[a.mode, a.playlist, a.place, a.since && `for ${duration(Date.now() - a.since)}`, a.light && `Recommended ${a.light}`].filter(Boolean).join(' · ')}
            </span>
          </div>
        )
      )}
      {d.score && (
        <div className="cs2-score" aria-label={`Our team ${d.score.us}, the other team ${d.score.them}`}>
          <span className="cs2-team ct ours">
            <span>Us</span>
            <b>{d.score.us}</b>
          </span>
          <span className="cs2-mid">–</span>
          <span className="cs2-team t">
            <b>{d.score.them}</b>
            <span>Them</span>
          </span>
        </div>
      )}
      {ch && (
        <div className="destiny-guardian" style={ch.emblem ? { backgroundImage: `url("${bungieArt(ch.emblem)}")` } : undefined}>
          <span className="row-text">
            <span className="row-title">
              {ch.class}
              {ch.title && <span className="destiny-title"> {ch.title}</span>}
            </span>
            <span className="row-sub">
              {[ch.rank && `Guardian Rank ${ch.rank}`, ch.session !== undefined && ch.session > 0 && `${duration(ch.session * 60000)} this session`].filter(Boolean).join(' · ')}
            </span>
          </span>
          <b className="destiny-light" aria-label={`Power ${ch.light}`}>
            {ch.light}
          </b>
        </div>
      )}
      {f && (
        <div className="destiny-fireteam">
          <p className="row-sub">
            Fireteam {f.members.length}
            {f.max ? `/${f.max}` : ''}
            {f.open ? ` · ${f.open} open` : ''}
          </p>
          <ul aria-label="Fireteam">
            {f.members.map((m, i) => (
              <li key={i}>
                {m.emblem ? <img src={bungieArt(m.emblem)} alt="" onError={hide} /> : <span className="destiny-blank" />}
                <span>{m.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {d.loadout && (
        <ul className="destiny-loadout" aria-label="Loadout">
          {d.loadout.map((i, k) => (
            <li key={k} className={i.exotic ? 'exotic' : ''} title={[i.name, i.kind].filter(Boolean).join(' · ')}>
              <img src={bungieArt(i.icon)} alt={i.name} onError={hide} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const PHASES: Record<string, string> = {
  warmup: 'Warmup',
  live: 'Live',
  intermission: 'Halftime',
  gameover: 'Match over',
  freezetime: 'Buy time',
  over: 'Round over',
  bomb: 'Bomb planted',
  defuse: 'Defusing',
  timeout_ct: 'CT timeout',
  timeout_t: 'T timeout',
  paused: 'Paused',
}
const phase = (p?: string) => (p ? (PHASES[p] ?? p) : '')

// A CS2 match as the game describes it: map, mode, score with each round's result, the clock, and our numbers.
function Cs2Match({ c }: { c: Cs2 }) {
  if (c.menu) return <p className="cs2-menu">In the main menu</p>
  const score = c.ct !== undefined && c.t !== undefined
  const st = c.state
  const where = [c.mode && modeName(c.mode), c.round !== undefined && c.phase !== 'warmup' && `Round ${Math.min(c.round + 1, 99)}`, phase(c.phase === 'live' ? c.roundPhase : c.phase)]
  return (
    <div className="cs2">
      <div className="cs2-head">
        <span className="cs2-map">{c.map ? mapName(c.map) : 'In a match'}</span>
        <span className="row-sub">{where.filter(Boolean).join(' · ')}</span>
      </div>
      {score && (
        <div className="cs2-score" aria-label={`Counter-Terrorists ${c.ct}, Terrorists ${c.t}`}>
          <span className={`cs2-team ct${c.team === 'CT' ? ' ours' : ''}`}>
            <span>CT</span>
            <b>{c.ct}</b>
          </span>
          <span className="cs2-mid">{c.bomb === 'planted' ? <span className="cs2-bomb">Bomb planted</span> : c.endsAt ? <Countdown at={c.endsAt} /> : '–'}</span>
          <span className={`cs2-team t${c.team === 'T' ? ' ours' : ''}`}>
            <b>{c.t}</b>
            <span>T</span>
          </span>
        </div>
      )}
      {c.rounds && c.rounds.length > 0 && (
        <ol className="cs2-rounds" aria-label="Rounds">
          {c.rounds.map((r, i) => {
            const w = roundWin(r)
            return <li key={i} className={w ? w.side.toLowerCase() : ''} title={w ? `Round ${i + 1}: ${w.side} · ${w.how}` : `Round ${i + 1}`} />
          })}
        </ol>
      )}
      {c.stats && (
        <dl className="cs2-stats">
          <div>
            <dt>K / A / D</dt>
            <dd>
              {c.stats.kills} / {c.stats.assists} / {c.stats.deaths}
            </dd>
          </div>
          <div>
            <dt>MVPs</dt>
            <dd>{c.stats.mvps}</dd>
          </div>
          <div>
            <dt>Score</dt>
            <dd>{c.stats.score}</dd>
          </div>
        </dl>
      )}
      {st && (
        <dl className="cs2-stats">
          <div>
            <dt>{st.health ? 'Health' : 'Status'}</dt>
            <dd>{st.health ? `${st.health} · ${st.armor}${st.helmet ? ' + helmet' : ''}` : 'Dead'}</dd>
          </div>
          <div>
            <dt>Money</dt>
            <dd>${st.money.toLocaleString()}</dd>
          </div>
          {st.weapon && (
            <div>
              <dt>Holding</dt>
              <dd>{weaponName(st.weapon)}</dd>
            </div>
          )}
          {st.roundKills > 0 && (
            <div>
              <dt>This round</dt>
              <dd>
                {st.roundKills} kill{st.roundKills > 1 ? 's' : ''}
                {st.roundHeadshots ? `, ${st.roundHeadshots} HS` : ''}
              </dd>
            </div>
          )}
        </dl>
      )}
    </div>
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
          {x.rarity !== undefined && ` · ${x.rarity < 10 ? x.rarity.toFixed(1) : Math.round(x.rarity)}% of players`}
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
          {session < 60000 ? 'Just started' : `For ${duration(session)}`}
          {g.played !== undefined && ` · ${hours(g.played + Math.floor(session / 60000))} in total`}
        </p>
        {g.cs2 && <Cs2Match c={g.cs2} />}
        {g.dota && <DotaMatch d={g.dota} />}
        {g.destiny && <DestinyMatch d={g.destiny} />}
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
  const set = st.settings.activity ?? {}
  const hidden = set?.hidden?.includes(k)
  return (
    <>
      {g && <GameCard g={g} />}
      {k !== st.me && sharing(set) && st.friends[k] === 'friend' && (
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
  const on = sharing(set)
  const detail = (field: 'playtime' | 'achievements' | 'details', label: string) => (
    <label className="check-row">
      <input type="checkbox" role="switch" disabled={!on} checked={field === 'details' ? set.details === true : set[field] !== false} onChange={(e) => save({ [field]: e.target.checked })} />
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
        <input type="checkbox" role="switch" checked={on} onChange={(e) => save({ games: e.target.checked })} />
        <span>Share what I'm playing</span>
      </label>
      <div className="activity-details">
        {detail('playtime', 'Total playtime')}
        {detail('achievements', 'Achievements')}
        {detail('details', 'Genre, developer and release date')}
      </div>
      {on && <Connections set={set} save={save} />}
      {on && (
        <div className="activity-preview">
          <p className="row-sub">Preview</p>
          {mine ? <GameCard g={mine} /> : <p className="quiet">No game running</p>}
        </div>
      )}
      {(set.hidden?.length ?? 0) > 0 && (
        <div className="activity-hidden">
          <p className="row-sub">Hidden from</p>
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
        <p className="row-sub">Other games</p>
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
              <option value="">Running program</option>
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

// Settings → Activity → connections: Steam (CS2 and Dota 2 through Valve's Game State Integration, main/gsi.ts) and
// Bungie.net (Destiny 2, main/bungie.ts). A tile each; its panel has one switch per game and what of it is shared.
const GSI = {
  cs2: {
    app: 730,
    name: 'Counter-Strike 2',
    short: 'CS2',
    switches: [
      ['match', 'Score and rounds', true],
      ['stats', 'My stats', true],
      ['state', 'Health, money and weapon', false],
    ],
  },
  dota: {
    app: 570,
    name: 'Dota 2',
    short: 'Dota 2',
    switches: [
      ['match', 'Score, clock and hero', true],
      ['stats', 'My stats', true],
      ['live', 'Gold, items and health', false],
    ],
  },
} as const
type GsiGame = keyof typeof GSI
type GsiStatus = Awaited<ReturnType<typeof window.api.gsi>>
type BungieStatus = Awaited<ReturnType<typeof window.api.bungie>>
const DESTINY_SWITCHES = [
  ['activity', 'Activity'],
  ['character', 'Guardian'],
  ['fireteam', 'Fireteam'],
  ['loadout', 'Loadout'],
] as const
const LAUNCH = '-gamestateintegration'
const why = (e: any) => String(e?.message ?? e).replace(/^Error invoking remote method '\w+': (Error: )?/, '')

// Whether a set-up game is sending: live, turned away (and why), or not yet (it reads the file when it starts).
const PROBLEMS: Record<string, string> = { 'wrong token': 'Turn it off and on again', 'not JSON': 'Sent something unreadable', 'not understood': 'Sent something unreadable' }
function GsiState({ st, short }: { st: GsiStatus; short: string }) {
  if (st.heard && Date.now() - st.heard < 30000) return <span className="gsi-state live">Live</span>
  if (st.problem) return <span className="gsi-state problem" title={st.problem}>{PROBLEMS[st.problem] ?? st.problem}</span>
  return <span className="gsi-state">Start or restart {short}</span>
}

function Connections({ set, save }: { set: ActivitySettings; save: (p: Partial<ActivitySettings>) => void }) {
  const [open, setOpen] = useState<'steam' | 'bungie' | null>(null)
  const [gsi, setGsi] = useState<Partial<Record<GsiGame, GsiStatus>>>({})
  const [bungie, setBungie] = useState<BungieStatus | null>(null)
  const [error, setError] = useState('')
  const refresh = () => {
    for (const g of Object.keys(GSI) as GsiGame[]) window.api.gsi(g, 'status').then((r) => setGsi((x) => ({ ...x, [g]: r })), () => {})
  }
  useEffect(() => {
    refresh()
    window.api.bungie('status').then(setBungie, () => {})
  }, [])
  // While the Steam panel is open, whether each game is sending is kept current
  useEffect(() => {
    if (open !== 'steam') return
    const t = setInterval(refresh, 3000)
    return () => clearInterval(t)
  }, [open])
  const gsiAct = (g: GsiGame, a: 'install' | 'remove') => {
    setError('')
    window.api.gsi(g, a).then(
      (r) => setGsi((x) => ({ ...x, [g]: r })),
      (e) => setError(why(e)),
    )
  }
  const bungieAct = (a: 'link' | 'cancel' | 'unlink') => {
    setError('')
    if (a === 'link') setBungie((b) => b && { ...b, waiting: true })
    if (a === 'unlink') setOpen(null)
    return window.api.bungie(a).then(
      (b) => (setBungie(b), a === 'link' && setOpen('bungie')),
      (e) => {
        if (why(e) !== 'cancelled') setError(why(e))
        window.api.bungie('status').then(setBungie, () => {})
      },
    )
  }
  // Bungie's tile links when not linked, cancels while waiting, and opens its switches once linked.
  const bungieClick = () => {
    if (!bungie?.configured) return setError('This copy of Eleusinia was built without a Bungie.net app key.')
    if (bungie.waiting) return bungieAct('cancel')
    if (!bungie.linked) return bungieAct('link')
    setOpen(open === 'bungie' ? null : 'bungie')
  }
  const live = (Object.keys(GSI) as GsiGame[]).filter((g) => gsi[g]?.installed)
  const sw = (field: string, label: string, def: boolean, values: Record<string, boolean | undefined>, put: (v: Record<string, boolean | undefined>) => void) => (
    <label className="check-row" key={field}>
      <input type="checkbox" role="switch" checked={values[field] ?? def} onChange={(e) => put({ ...values, [field]: e.target.checked })} />
      <span>{label}</span>
    </label>
  )
  return (
    <div className="connections-wrap">
      <div className="connections" role="group" aria-label="Connections">
        <button className={`connection${open === 'steam' ? ' open' : ''}`} data-k="steam" aria-expanded={open === 'steam'} onClick={() => setOpen(open === 'steam' ? null : 'steam')}>
          <Brand name="steam" size={26} />
          <span className="connection-name">Steam</span>
          <span className={`connection-state${live.length ? ' on' : ''}`}>{live.length ? live.map((g) => GSI[g].short).join(' · ') : 'Live matches'}</span>
        </button>
        <button
          className={`connection${open === 'bungie' ? ' open' : ''}${bungie?.waiting ? ' waiting' : ''}`}
          data-k="bungie"
          aria-expanded={bungie?.linked ? open === 'bungie' : undefined}
          onClick={bungieClick}
        >
          <Brand name="bungie" size={26} />
          <span className="connection-name">Bungie.net</span>
          <span className={`connection-state${bungie?.linked ? ' on' : ''}`}>{bungie?.waiting ? 'Sign in, in your browser · Cancel' : bungie?.linked ? bungie.name || 'Linked' : 'Link'}</span>
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
      {open === 'steam' && (
        <div className="connection-panel">
          {(Object.keys(GSI) as GsiGame[]).map((g) => {
            const x = GSI[g]
            const st = gsi[g]
            const values: Record<string, boolean | undefined> = set[g] ?? {}
            return (
              <div className="connection-game" key={g} data-game={g}>
                <div className="connection-game-head">
                  <img src={`eleusinia-art://steam/${x.app}/header`} alt="" onError={hide} />
                  <span className="row-title">{x.name}</span>
                  {st && !st.found && <span className="row-sub">Not installed</span>}
                  {st?.installed && <GsiState st={st} short={x.short} />}
                  <input
                    type="checkbox"
                    role="switch"
                    aria-label={`${x.name} live match details`}
                    checked={!!st?.installed}
                    disabled={!st?.found}
                    onChange={(e) => gsiAct(g, e.target.checked ? 'install' : 'remove')}
                  />
                </div>
                {st?.installed && (
                  <>
                    {st.launch !== undefined && st.launch !== true && (
                      <p className="connection-note">
                        Add <code>{LAUNCH}</code> to its Steam launch options <CopyButton text={LAUNCH} label="Copy the launch option" />
                      </p>
                    )}
                    <div className="activity-details">{x.switches.map(([f, label, def]) => sw(f, label, def, values, (v) => save({ [g]: v })))}</div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
      {open === 'bungie' && bungie?.linked && (
        <div className="connection-panel">
          <div className="activity-details">{DESTINY_SWITCHES.map(([f, label]) => sw(f, label, true, set.destiny ?? {}, (v) => save({ destiny: v })))}</div>
          <button className="button subtle" onClick={() => bungieAct('unlink')}>
            Unlink
          </button>
        </div>
      )}
    </div>
  )
}
