// Dota 2's Game State Integration (docs/roadmap-activity.md, step 3): like CS2's, the game POSTs JSON to our local
// server (src/main/gsi.ts). While we play it describes only us and our hero; while spectating it describes everyone,
// and then only the match itself is taken, since none of those heroes is ours.

type Side = 'radiant' | 'dire'
export type Dota = {
  menu?: boolean // in the main menu, not in a match
  watching?: boolean // spectating or watching a replay: no hero of ours
  state?: string // hero_selection, strategy_time, pre_game, game_in_progress, post_game, ... (DOTA_GAMERULES_STATE_*)
  clockAt?: number // when the match clock read 0:00, unix ms (moved onto the receiver's clock); it runs from there
  clock?: number // the clock in seconds, while paused
  day?: boolean
  radiant?: number // kills
  dire?: number
  team?: Side
  winner?: Side
  hero?: string // npc_dota_hero_<hero>, without the prefix: art and name
  level?: number
  stats?: { kills: number; deaths: number; assists: number; lastHits: number; denies: number; gpm: number; xpm: number; streak: number }
  live?: {
    gold: number
    health: number
    maxHealth: number
    mana: number
    maxMana: number
    respawnAt?: number // dead until then, unix ms (moved onto the receiver's clock)
    buyback?: number // its cost, when it is ready
    scepter: boolean
    shard: boolean
    items: string[] // the 6 main slots in order, '' when empty; item_<name> without the prefix
    backpack: string[] // the 3 backpack slots
    neutral?: string
  }
}

// What may be shared of it (ActivitySettings.dota): the match and our numbers unless turned off; the live state (gold,
// items, health, buyback) only when turned on, since it would help someone playing against us.
export type DotaSettings = { match?: boolean; stats?: boolean; live?: boolean }
export function shareableDota(d: Dota, set: DotaSettings | undefined): Dota {
  if (d.menu) return { menu: true }
  const out: Dota = {}
  if (d.watching) out.watching = true
  if (set?.match !== false)
    for (const k of ['state', 'clockAt', 'clock', 'day', 'radiant', 'dire', 'team', 'winner', 'hero', 'level'] as const) if (d[k] !== undefined) (out as any)[k] = d[k]
  if (set?.stats !== false && d.stats) out.stats = d.stats
  if (set?.live === true && d.live) out.live = d.live
  return out
}

const num = (v: unknown, max = 1e6) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v) : undefined)
const name = (v: unknown) => (typeof v === 'string' && /^[a-z0-9_]{1,60}$/.test(v) ? v : undefined)
const side = (v: unknown) => (v === 'radiant' || v === 'dire' ? v : undefined)
const second = (t: number) => Math.round(t / 1000) * 1000
const short = (v: unknown, prefix: string) => (typeof v === 'string' && v.startsWith(prefix) ? (name(v.slice(prefix.length)) ?? '') : '')

// One GSI payload, as the game sends it.
export function dotaOf(p: any, now = Date.now()): Dota | null {
  if (!p || typeof p !== 'object' || p.provider?.appid !== 570) return null
  const m = p.map
  const player = p.player && typeof p.player === 'object' ? p.player : {}
  if (!m || typeof m !== 'object' || player.activity === 'menu') return { menu: true }
  const d: Dota = {}
  const set = <K extends keyof Dota>(k: K, v: Dota[K] | undefined) => v !== undefined && (d[k] = v)
  const state = typeof m.game_state === 'string' ? m.game_state.replace(/^DOTA_GAMERULES_STATE_/, '').toLowerCase() : ''
  set('state', name(state))
  const clock = Number(m.clock_time)
  if (Number.isFinite(clock) && Math.abs(clock) < 36000 && (state === 'pre_game' || state === 'game_in_progress'))
    m.paused === true ? (d.clock = Math.round(clock)) : (d.clockAt = second(now - clock * 1000))
  if (typeof m.daytime === 'boolean') d.day = m.daytime
  set('radiant', num(m.radiant_score, 500))
  set('dire', num(m.dire_score, 500))
  set('winner', side(m.win_team))
  // Spectating: player and hero are per team (team2, team3), none of them us.
  if (player.team2 || p.hero?.team2) return (d.watching = true), d
  set('team', side(player.team_name))
  const hero = p.hero && typeof p.hero === 'object' ? p.hero : null
  if (hero) {
    set('hero', short(hero.name, 'npc_dota_hero_') || undefined)
    set('level', num(hero.level, 100))
  }
  if (typeof player.kills === 'number')
    d.stats = {
      kills: num(player.kills, 1000) ?? 0,
      deaths: num(player.deaths, 1000) ?? 0,
      assists: num(player.assists, 1000) ?? 0,
      lastHits: num(player.last_hits, 10000) ?? 0,
      denies: num(player.denies, 10000) ?? 0,
      gpm: num(player.gpm, 10000) ?? 0,
      xpm: num(player.xpm, 10000) ?? 0,
      streak: num(player.kill_streak, 100) ?? 0,
    }
  if (hero && typeof hero.health === 'number') {
    const items = p.items && typeof p.items === 'object' ? p.items : {}
    const slot = (k: string) => short(items[k]?.name, 'item_')
    const respawn = num(hero.respawn_seconds, 600)
    const buyback = num(hero.buyback_cost, 100000)
    d.live = {
      gold: num(player.gold, 1e6) ?? 0,
      health: num(hero.health, 1e5) ?? 0,
      maxHealth: num(hero.max_health, 1e5) ?? 0,
      mana: num(hero.mana, 1e5) ?? 0,
      maxMana: num(hero.max_mana, 1e5) ?? 0,
      ...(hero.alive === false && respawn !== undefined && { respawnAt: second(now + respawn * 1000) }),
      ...(buyback !== undefined && !hero.buyback_cooldown && { buyback }),
      scepter: hero.aghanims_scepter === true,
      shard: hero.aghanims_shard === true,
      items: [0, 1, 2, 3, 4, 5].map((i) => slot(`slot${i}`)),
      backpack: [6, 7, 8].map((i) => slot(`slot${i}`)),
      ...(slot('neutral0') && { neutral: slot('neutral0') }),
    }
  }
  return d
}

// A friend's Dota 2 details: the same checks, plus the clock correction.
export function cleanDota(x: any, shift: number, now: number): Dota | undefined {
  if (!x || typeof x !== 'object') return undefined
  if (x.menu === true) return { menu: true }
  const d: Dota = {}
  const at = (v: unknown, back: number, ahead: number) => (Number.isFinite(v) && (v as number) + shift > now - back && (v as number) + shift < now + ahead ? (v as number) + shift : undefined)
  if (x.watching === true) d.watching = true
  if (name(x.state)) d.state = x.state
  if (at(x.clockAt, 36000e3, 3600e3) !== undefined) d.clockAt = at(x.clockAt, 36000e3, 3600e3)
  if (Number.isSafeInteger(x.clock) && Math.abs(x.clock) < 36000) d.clock = x.clock
  if (typeof x.day === 'boolean') d.day = x.day
  for (const k of ['radiant', 'dire'] as const) if (num(x[k], 500) !== undefined) d[k] = num(x[k], 500)
  for (const k of ['team', 'winner'] as const) if (side(x[k])) d[k] = side(x[k])
  if (name(x.hero)) d.hero = x.hero
  if (num(x.level, 100) !== undefined) d.level = num(x.level, 100)
  const s = x.stats
  if (s && typeof s === 'object')
    d.stats = {
      kills: num(s.kills, 1000) ?? 0,
      deaths: num(s.deaths, 1000) ?? 0,
      assists: num(s.assists, 1000) ?? 0,
      lastHits: num(s.lastHits, 10000) ?? 0,
      denies: num(s.denies, 10000) ?? 0,
      gpm: num(s.gpm, 10000) ?? 0,
      xpm: num(s.xpm, 10000) ?? 0,
      streak: num(s.streak, 100) ?? 0,
    }
  const l = x.live
  const slots = (v: unknown, n: number) => (Array.isArray(v) ? v : []).slice(0, n).map((i) => name(i) ?? '').concat(Array(n).fill('')).slice(0, n)
  if (l && typeof l === 'object') {
    const respawnAt = at(l.respawnAt, 60000, 600e3)
    d.live = {
      gold: num(l.gold, 1e6) ?? 0,
      health: num(l.health, 1e5) ?? 0,
      maxHealth: num(l.maxHealth, 1e5) ?? 0,
      mana: num(l.mana, 1e5) ?? 0,
      maxMana: num(l.maxMana, 1e5) ?? 0,
      ...(respawnAt !== undefined && { respawnAt }),
      ...(num(l.buyback, 100000) !== undefined && { buyback: num(l.buyback, 100000) }),
      scepter: l.scepter === true,
      shard: l.shard === true,
      items: slots(l.items, 6),
      backpack: slots(l.backpack, 3),
      ...(name(l.neutral) && { neutral: l.neutral }),
    }
  }
  return d
}

// Names as players know them, where the game's own names differ.
const title = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
const HEROES: Record<string, string> = {
  antimage: 'Anti-Mage', abyssal_underlord: 'Underlord', centaur: 'Centaur Warrunner', doom_bringer: 'Doom', furion: "Nature's Prophet",
  keeper_of_the_light: 'Keeper of the Light', life_stealer: 'Lifestealer', magnataur: 'Magnus', necrolyte: 'Necrophos', nevermore: 'Shadow Fiend',
  obsidian_destroyer: 'Outworld Destroyer', queenofpain: 'Queen of Pain', rattletrap: 'Clockwerk', shredder: 'Timbersaw', skeleton_king: 'Wraith King',
  treant: 'Treant Protector', vengefulspirit: 'Vengeful Spirit', windrunner: 'Windranger', wisp: 'Io', zuus: 'Zeus',
}
export const heroName = (h: string) => HEROES[h] ?? title(h)
const ITEMS: Record<string, string> = {
  ultimate_scepter: "Aghanim's Scepter", aghanims_shard: "Aghanim's Shard", blink: 'Blink Dagger', bfury: 'Battle Fury', travel_boots: 'Boots of Travel',
  travel_boots_2: 'Boots of Travel 2', tpscroll: 'Town Portal Scroll', sphere: "Linken's Sphere", cyclone: "Eul's Scepter of Divinity", ward_observer: 'Observer Ward',
  ward_sentry: 'Sentry Ward', ward_dispenser: 'Observer and Sentry Wards', manta: 'Manta Style', black_king_bar: 'Black King Bar', bottle: 'Bottle',
  heart: 'Heart of Tarrasque', greater_crit: 'Daedalus', lesser_crit: 'Crystalys', invis_sword: 'Shadow Blade', silver_edge: 'Silver Edge',
  assault: 'Assault Cuirass', basher: 'Skull Basher', abyssal_blade: 'Abyssal Blade', monkey_king_bar: 'Monkey King Bar', satanic: 'Satanic',
  skadi: 'Eye of Skadi', sheepstick: 'Scythe of Vyse', rapier: 'Divine Rapier', refresher: 'Refresher Orb', radiance: 'Radiance', mjollnir: 'Mjollnir',
  maelstrom: 'Maelstrom', desolator: 'Desolator', butterfly: 'Butterfly', hand_of_midas: 'Hand of Midas', power_treads: 'Power Treads',
  phase_boots: 'Phase Boots', arcane_boots: 'Arcane Boots', tranquil_boots: 'Tranquil Boots', boots: 'Boots of Speed', magic_wand: 'Magic Wand',
  magic_stick: 'Magic Stick', wraith_band: 'Wraith Band', bracer: 'Bracer', null_talisman: 'Null Talisman', quelling_blade: 'Quelling Blade',
  tango: 'Tango', flask: 'Healing Salve', clarity: 'Clarity', faerie_fire: 'Faerie Fire', smoke_of_deceit: 'Smoke of Deceit', dust: 'Dust of Appearance',
  gem: 'Gem of True Sight', aegis: 'Aegis of the Immortal', cheese: 'Cheese', force_staff: 'Force Staff', glimmer_cape: 'Glimmer Cape',
  ghost: 'Ghost Scepter', ethereal_blade: 'Ethereal Blade', orchid: 'Orchid Malevolence', bloodthorn: 'Bloodthorn', nullifier: 'Nullifier',
  aeon_disk: 'Aeon Disk', lotus_orb: 'Lotus Orb', pipe: 'Pipe of Insight', crimson_guard: 'Crimson Guard', vanguard: 'Vanguard', hood_of_defiance: 'Hood of Defiance',
  mekansm: 'Mekansm', guardian_greaves: 'Guardian Greaves', vladmir: "Vladmir's Offering", helm_of_the_dominator: 'Helm of the Dominator',
  helm_of_the_overlord: 'Helm of the Overlord', echo_sabre: 'Echo Sabre', diffusal_blade: 'Diffusal Blade', sange_and_yasha: 'Sange and Yasha',
  kaya_and_sange: 'Kaya and Sange', yasha_and_kaya: 'Yasha and Kaya', octarine_core: 'Octarine Core', shivas_guard: "Shiva's Guard", bloodstone: 'Bloodstone',
  dagon: 'Dagon', dagon_2: 'Dagon 2', dagon_3: 'Dagon 3', dagon_4: 'Dagon 4', dagon_5: 'Dagon 5', soul_ring: 'Soul Ring', urn_of_shadows: 'Urn of Shadows',
  spirit_vessel: 'Spirit Vessel', medallion_of_courage: 'Medallion of Courage', solar_crest: 'Solar Crest', rod_of_atos: 'Rod of Atos',
  gungir: 'Gleipnir', wind_waker: 'Wind Waker', blade_mail: 'Blade Mail', armlet: 'Armlet of Mordiggian', mask_of_madness: 'Mask of Madness',
  overwhelming_blink: 'Overwhelming Blink', swift_blink: 'Swift Blink', arcane_blink: 'Arcane Blink', harpoon: 'Harpoon', disperser: 'Disperser',
  revenants_brooch: "Revenant's Brooch", parasma: 'Parasma', khanda: 'Khanda', phylactery: 'Phylactery', pavise: 'Pavise', boots_of_bearing: 'Boots of Bearing',
}
export const itemName = (i: string) => ITEMS[i] ?? title(i.replace(/^recipe_/, 'recipe: '))
const STATES: Record<string, string> = {
  init: 'Loading', wait_for_players_to_load: 'Loading', wait_for_map_to_load: 'Loading', custom_game_setup: 'Setting up', player_draft: 'Draft',
  hero_selection: 'Picking heroes', strategy_time: 'Strategy time', team_showcase: 'Showcase', pre_game: 'Before the horn',
  game_in_progress: 'Playing', post_game: 'Match over', disconnect: 'Disconnected',
}
export const stateName = (s: string) => STATES[s] ?? title(s)
