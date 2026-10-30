// Counter-Strike 2's Game State Integration (docs/roadmap-activity.md, step 2): the game POSTs JSON to our local
// server (src/main/cs2.ts) as things change. This turns one payload into what a friend's card shows, and checks what a
// friend sends. While we play, the game only describes us (and, when we are dead, whoever we are watching: those
// numbers are not ours, so they are left out); the whole scoreboard only comes while spectating.

export type Cs2 = {
  menu?: boolean // in the main menu, not in a match
  map?: string // e.g. de_mirage
  mode?: string // competitive, premier, casual, deathmatch, scrimcomp2v2 (wingman), ...
  phase?: string // warmup, live, intermission, gameover
  round?: number // rounds played so far
  ct?: number // scores
  t?: number
  team?: 'CT' | 'T' // our side
  rounds?: string[] // how each round was won, in order: ct_win_elimination, t_win_bomb, ...
  roundPhase?: string // freezetime, live, over
  bomb?: string // planted, defused, exploded
  endsAt?: number // when the current phase ends, unix ms (moved onto the receiver's clock)
  endsPhase?: string // which phase that is: freezetime, live, bomb, defuse, over, warmup, ...
  stats?: { kills: number; assists: number; deaths: number; mvps: number; score: number }
  state?: { health: number; armor: number; helmet: boolean; money: number; roundKills: number; roundHeadshots: number; equip: number; weapon?: string; defuser?: boolean }
}

// What may be shared of it (ActivitySettings.cs2), each on unless turned off; `state` is off unless turned on, since
// live health, money and weapon would help someone playing against us.
export type Cs2Settings = { match?: boolean; stats?: boolean; state?: boolean }
export function shareableCs2(c: Cs2, set: Cs2Settings | undefined): Cs2 {
  if (c.menu) return { menu: true }
  const out: Cs2 = {}
  if (set?.match !== false) {
    for (const k of ['map', 'mode', 'phase', 'round', 'ct', 't', 'team', 'rounds', 'roundPhase', 'bomb', 'endsAt', 'endsPhase'] as const)
      if (c[k] !== undefined) (out as any)[k] = c[k]
  } else if (c.map) out.map = c.map
  if (set?.stats !== false && c.stats) out.stats = c.stats
  if (set?.state === true && c.state) out.state = c.state
  return out
}

const num = (v: unknown, max = 1e6) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v) : undefined)
const word = (v: unknown, max = 40) => (typeof v === 'string' && /^[\w-]{1,40}$/.test(v) ? v.slice(0, max) : undefined)
const team = (v: unknown) => (v === 'CT' || v === 'T' ? v : undefined)

// One GSI payload, as the game sends it. The provider's SteamID is ours, so a watched player's numbers are not taken
// for ours.
export function cs2Of(p: any, now = Date.now()): Cs2 | null {
  if (!p || typeof p !== 'object' || p.provider?.appid !== 730) return null
  const me = typeof p.provider.steamid === 'string' ? p.provider.steamid : ''
  const player = p.player && typeof p.player === 'object' ? p.player : {}
  if (!p.map || player.activity === 'menu') return { menu: true }
  const c: Cs2 = {}
  const m = p.map
  const set = <K extends keyof Cs2>(k: K, v: Cs2[K] | undefined) => v !== undefined && (c[k] = v)
  set('map', word(m.name))
  set('mode', word(m.mode))
  set('phase', word(m.phase))
  set('round', num(m.round, 100))
  set('ct', num(m.team_ct?.score, 100))
  set('t', num(m.team_t?.score, 100))
  if (m.round_wins && typeof m.round_wins === 'object')
    c.rounds = Object.entries(m.round_wins)
      .filter(([n, v]) => /^\d+$/.test(n) && word(v))
      .sort(([a], [b]) => Number(a) - Number(b))
      .slice(0, 60)
      .map(([, v]) => v as string)
  set('roundPhase', word(p.round?.phase))
  set('bomb', word(p.round?.bomb))
  const left = Number(p.phase_countdowns?.phase_ends_in)
  if (Number.isFinite(left) && left >= 0 && left < 3600) (c.endsAt = Math.round((now + left * 1000) / 1000) * 1000), set('endsPhase', word(p.phase_countdowns.phase))
  const mine = !player.steamid || player.steamid === me
  if (mine) {
    set('team', team(player.team))
    const s = player.match_stats
    if (s && typeof s === 'object') c.stats = { kills: num(s.kills, 1000) ?? 0, assists: num(s.assists, 1000) ?? 0, deaths: num(s.deaths, 1000) ?? 0, mvps: num(s.mvps, 100) ?? 0, score: num(s.score, 10000) ?? 0 }
    const st = player.state
    if (st && typeof st === 'object') {
      const active = Object.values(player.weapons ?? {}).find((w: any) => w?.state === 'active') as any
      c.state = {
        health: num(st.health, 100) ?? 0,
        armor: num(st.armor, 100) ?? 0,
        helmet: st.helmet === true,
        money: num(st.money, 100000) ?? 0,
        roundKills: num(st.round_kills, 10) ?? 0,
        roundHeadshots: num(st.round_killhs, 10) ?? 0,
        equip: num(st.equip_value, 100000) ?? 0,
        ...(word(active?.name) && { weapon: word(active.name) }),
        ...(st.defusekit === true && { defuser: true }),
      }
    }
  }
  return c
}

// A friend's CS2 details: the same checks, plus the clock correction for endsAt.
export function cleanCs2(x: any, shift: number, now: number): Cs2 | undefined {
  if (!x || typeof x !== 'object') return undefined
  if (x.menu === true) return { menu: true }
  const c: Cs2 = {}
  for (const k of ['map', 'mode', 'phase', 'roundPhase', 'bomb', 'endsPhase'] as const) if (word(x[k])) c[k] = word(x[k])
  for (const k of ['round', 'ct', 't'] as const) if (num(x[k], 100) !== undefined) c[k] = num(x[k], 100)
  if (team(x.team)) c.team = team(x.team)
  if (Array.isArray(x.rounds)) c.rounds = x.rounds.slice(0, 60).filter((r: unknown) => !!word(r))
  if (Number.isFinite(x.endsAt) && x.endsAt + shift > now - 60000 && x.endsAt + shift < now + 3600e3) c.endsAt = x.endsAt + shift
  const s = x.stats
  if (s && typeof s === 'object') c.stats = { kills: num(s.kills, 1000) ?? 0, assists: num(s.assists, 1000) ?? 0, deaths: num(s.deaths, 1000) ?? 0, mvps: num(s.mvps, 100) ?? 0, score: num(s.score, 10000) ?? 0 }
  const st = x.state
  if (st && typeof st === 'object')
    c.state = {
      health: num(st.health, 100) ?? 0,
      armor: num(st.armor, 100) ?? 0,
      helmet: st.helmet === true,
      money: num(st.money, 100000) ?? 0,
      roundKills: num(st.roundKills, 10) ?? 0,
      roundHeadshots: num(st.roundHeadshots, 10) ?? 0,
      equip: num(st.equip, 100000) ?? 0,
      ...(word(st.weapon) && { weapon: word(st.weapon) }),
      ...(st.defuser === true && { defuser: true }),
    }
  return c
}

// Names as players know them.
const MAPS: Record<string, string> = {
  de_mirage: 'Mirage', de_inferno: 'Inferno', de_dust2: 'Dust II', de_nuke: 'Nuke', de_ancient: 'Ancient', de_anubis: 'Anubis',
  de_vertigo: 'Vertigo', de_overpass: 'Overpass', de_train: 'Train', de_italy: 'Italy', cs_italy: 'Italy', cs_office: 'Office',
  de_basalt: 'Basalt', de_edin: 'Edin', de_palais: 'Palais', de_whistle: 'Whistle', de_thera: 'Thera', de_mills: 'Mills', ar_shoots: 'Shoots',
  ar_baggage: 'Baggage', ar_pool_day: 'Pool Day', de_assembly: 'Assembly', de_memento: 'Memento',
}
export const mapName = (m: string) => MAPS[m] ?? m.replace(/^(de|cs|ar|dz|gd|aim)_/, '').replace(/_/g, ' ').replace(/\b\w/g, (x) => x.toUpperCase())
const MODES: Record<string, string> = {
  competitive: 'Competitive', premier: 'Premier', casual: 'Casual', deathmatch: 'Deathmatch', scrimcomp2v2: 'Wingman',
  gungameprogressive: 'Arms Race', survival: 'Danger Zone', custom: 'Custom', training: 'Training',
}
export const modeName = (m: string) => MODES[m] ?? m.replace(/\b\w/g, (x) => x.toUpperCase())
const WEAPONS: Record<string, string> = {
  ak47: 'AK-47', m4a1: 'M4A4', m4a1_silencer: 'M4A1-S', awp: 'AWP', deagle: 'Desert Eagle', glock: 'Glock-18', hkp2000: 'P2000',
  usp_silencer: 'USP-S', p250: 'P250', fiveseven: 'Five-SeveN', tec9: 'Tec-9', cz75a: 'CZ75-Auto', elite: 'Dual Berettas',
  revolver: 'R8 Revolver', famas: 'FAMAS', galilar: 'Galil AR', aug: 'AUG', sg556: 'SG 553', ssg08: 'SSG 08', scar20: 'SCAR-20',
  g3sg1: 'G3SG1', mp9: 'MP9', mac10: 'MAC-10', mp7: 'MP7', mp5sd: 'MP5-SD', ump45: 'UMP-45', p90: 'P90', bizon: 'PP-Bizon',
  nova: 'Nova', xm1014: 'XM1014', mag7: 'MAG-7', sawedoff: 'Sawed-Off', m249: 'M249', negev: 'Negev', taser: 'Zeus x27',
  c4: 'C4', hegrenade: 'HE Grenade', flashbang: 'Flashbang', smokegrenade: 'Smoke Grenade', molotov: 'Molotov',
  incgrenade: 'Incendiary', decoy: 'Decoy', knife: 'Knife', knife_t: 'Knife', bayonet: 'Bayonet',
}
export const weaponName = (w: string) => {
  const k = w.replace(/^weapon_/, '')
  return WEAPONS[k] ?? (k.startsWith('knife') ? 'Knife' : k.replace(/_/g, ' ').replace(/\b\w/g, (x) => x.toUpperCase()))
}
// How a round was won, for the round strip.
export const roundWin = (r: string) => {
  const m = /^(ct|t)_win_(\w+)$/.exec(r)
  if (!m) return null
  const how: Record<string, string> = { elimination: 'Eliminated', bomb: 'Bomb exploded', defuse: 'Bomb defused', time: 'Time ran out', rescue: 'Hostages rescued' }
  return { side: m[1].toUpperCase() as 'CT' | 'T', how: how[m[2]] ?? m[2] }
}
