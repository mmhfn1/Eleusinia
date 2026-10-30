import type { Key } from './protocol'
import { type Cs2, type Cs2Settings, cleanCs2, shareableCs2 } from './cs2'
import { BUNGIE_PATH, type Destiny, type DestinySettings, cleanDestiny, shareableDestiny } from './destiny'
import { type Dota, type DotaSettings, cleanDota, shareableDota } from './dota'

// What someone is doing, shared with friends and group members only (docs/roadmap-activity.md). Pictures are never
// sent as links: a card names a Steam app id or an achievement's icon file, and the receiving app builds the address
// itself from an allowed host (artUrl).

export type Achievement = {
  name: string
  desc: string
  icon: string // Steam's file name for its picture
  at: number // unlocked, unix ms
  rarity?: number // percent of all players who have it
}
export type Game = {
  name: string
  since: number // when it started, unix ms (corrected to the receiver's clock by cleanActivity)
  source: 'steam' | 'program'
  app?: number // Steam app id: art, store page, achievements
  played?: number // minutes played before this session (Steam)
  genres?: string[]
  developer?: string
  released?: string
  about?: string
  achievements?: { got: number; total: number; recent: Achievement[] } // recent: newest first
  cs2?: Cs2 // live match details from Counter-Strike 2 (shared/cs2.ts)
  dota?: Dota // and from Dota 2 (shared/dota.ts)
  destiny?: Destiny // Destiny 2 through the Bungie.net API (shared/destiny.ts)
}
// now: the sender's clock when sent, so `since` can be moved onto the receiver's clock.
export type Activity = { now: number; game?: Game }

// What may be shared, set in Settings → Activity. On unless `games` is turned off; each detail is on unless turned
// off, except the store `details`, which are off unless turned on.
export type ActivitySettings = {
  games?: boolean
  playtime?: boolean
  achievements?: boolean
  details?: boolean // genre, developer, release date, description; off unless true
  hidden?: Key[] // people who never see it
  extra?: Record<string, string> // program file name (lower case) → game name, added by the user
  cs2?: Cs2Settings
  dota?: DotaSettings
  destiny?: DestinySettings
}

export const RECENT_ACHIEVEMENTS = 5
export const DESTINY_APP = 1085660 // Destiny 2's Steam app id

export const sharing = (set: ActivitySettings | undefined) => set?.games !== false

// Only what the user chose to share leaves this computer.
export function shareable(a: Activity, set: ActivitySettings | undefined): Activity {
  if (!sharing(set) || !a.game) return { now: a.now }
  const g: Game = { ...a.game }
  if (set?.playtime === false) delete g.played
  if (set?.achievements === false) delete g.achievements
  if (set?.details !== true) delete g.genres, delete g.developer, delete g.released, delete g.about
  if (g.cs2) g.cs2 = shareableCs2(g.cs2, set?.cs2)
  if (g.dota) g.dota = shareableDota(g.dota, set?.dota)
  if (g.destiny) g.destiny = shareableDestiny(g.destiny, set?.destiny)
  return { now: a.now, game: g }
}

const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined)
const int = (v: unknown, min: number, max: number) => (Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= max ? (v as number) : undefined)
const DAY = 864e5

// A friend's activity, checked and capped like a profile. Null when there is nothing valid to show.
export function cleanActivity(x: unknown, now = Date.now()): Activity | null {
  if (!x || typeof x !== 'object') return null
  const a = x as Record<string, any>
  const shift = Number.isFinite(a.now) ? now - a.now : 0
  const g = a.game
  if (!g || typeof g !== 'object') return { now }
  const name = str(g.name, 100)
  if (!name || (g.source !== 'steam' && g.source !== 'program')) return { now }
  const since = Number.isFinite(g.since) ? Math.min(now, Math.max(now - 30 * DAY, g.since + shift)) : now
  const game: Game = { name, since, source: g.source }
  const app = int(g.app, 1, 1e8)
  if (app) game.app = app
  const played = int(g.played, 0, 1e7)
  if (played !== undefined) game.played = played
  if (Array.isArray(g.genres)) game.genres = g.genres.slice(0, 5).map((s: unknown) => str(s, 40)).filter((s: string | undefined): s is string => !!s)
  for (const [k, max] of [['developer', 100], ['released', 40], ['about', 400]] as const) {
    const v = str(g[k], max)
    if (v) game[k] = v
  }
  const ach = g.achievements
  const total = int(ach?.total, 1, 10000)
  const got = int(ach?.got, 0, 10000)
  if (total && got !== undefined && got <= total) {
    const recent = (Array.isArray(ach.recent) ? ach.recent : []).slice(0, RECENT_ACHIEVEMENTS).flatMap((r: any): Achievement[] => {
      const name = str(r?.name, 100)
      if (!name) return []
      const out: Achievement = { name, desc: str(r.desc, 300) ?? '', icon: typeof r.icon === 'string' && ICON.test(r.icon) ? r.icon : '', at: int(r.at, 0, now + DAY) ?? 0 }
      if (Number.isFinite(r.rarity) && r.rarity >= 0 && r.rarity <= 100) out.rarity = r.rarity
      return [out]
    })
    game.achievements = { got, total, recent }
  }
  const cs2 = game.app === 730 ? cleanCs2(g.cs2, shift, now) : undefined
  if (cs2) game.cs2 = cs2
  const dota = game.app === 570 ? cleanDota(g.dota, shift, now) : undefined
  if (dota) game.dota = dota
  const destiny = game.app === DESTINY_APP ? cleanDestiny(g.destiny, shift, now) : undefined
  if (destiny) game.destiny = destiny
  return { now, game }
}
const ICON = /^[0-9a-f]{40}\.(jpg|png)$/

// The only addresses activity pictures come from, built here from ids (eleusinia-art:// in src/main/index.ts).
// eleusinia-art://steam/<app>/<header|capsule|hero|logo>, eleusinia-art://achievement/<app>/<icon file>, and Dota 2's
// eleusinia-art://dota/<heroes|items>/<name> (the game's own name without npc_dota_hero_ or item_), and Destiny 2's
// eleusinia-art://bungie/<path> (a bungie.net path from Destiny's icon or activity picture folders).
const STEAM = 'https://cdn.akamai.steamstatic.com/'
const STEAM_ART: Record<string, string> = { header: 'header.jpg', capsule: 'library_600x900.jpg', hero: 'library_hero.jpg', logo: 'logo.png' }
export function artUrl(url: string): string | null {
  const d = /^eleusinia-art:\/\/dota\/(heroes|items)\/([a-z0-9_]{1,60})$/.exec(url)
  if (d) return `${STEAM}apps/dota2/images/dota_react/${d[1]}/${d[2]}.png`
  const b = /^eleusinia-art:\/\/bungie(\/.*)$/.exec(url)
  if (b) return BUNGIE_PATH.test(b[1]) ? `https://www.bungie.net${b[1]}` : null
  const m = /^eleusinia-art:\/\/(steam|achievement)\/(\d{1,8})\/([\w.]+)$/.exec(url)
  if (!m) return null
  if (m[1] === 'steam') return Object.hasOwn(STEAM_ART, m[3]) ? `${STEAM}steam/apps/${m[2]}/${STEAM_ART[m[3]]}` : null
  return ICON.test(m[3]) ? `${STEAM}steamcommunity/public/images/apps/${m[2]}/${m[3]}` : null
}

// Games found by their program's file name when Steam does not say (not from Steam, or Steam not running). Lower
// case; Windows names, plus the few that differ elsewhere. Users add their own in Settings (ActivitySettings.extra).
export const KNOWN_GAMES: Record<string, { name: string; app?: number }> = {
  'cs2.exe': { name: 'Counter-Strike 2', app: 730 },
  cs2: { name: 'Counter-Strike 2', app: 730 },
  'dota2.exe': { name: 'Dota 2', app: 570 },
  dota2: { name: 'Dota 2', app: 570 },
  'deadlock.exe': { name: 'Deadlock', app: 1422450 },
  'destiny2.exe': { name: 'Destiny 2', app: 1085660 },
  'league of legends.exe': { name: 'League of Legends' },
  'r5apex.exe': { name: 'Apex Legends', app: 1172470 },
  'r5apex_dx12.exe': { name: 'Apex Legends', app: 1172470 },
  'fortniteclient-win64-shipping.exe': { name: 'Fortnite' },
  'overwatch.exe': { name: 'Overwatch 2', app: 2357570 },
  'rocketleague.exe': { name: 'Rocket League', app: 252950 },
  'wow.exe': { name: 'World of Warcraft' },
  'genshinimpact.exe': { name: 'Genshin Impact' },
  'eldenring.exe': { name: 'Elden Ring', app: 1245620 },
  'gta5.exe': { name: 'Grand Theft Auto V', app: 271590 },
  'rdr2.exe': { name: 'Red Dead Redemption 2', app: 1174180 },
  'minecraft.windows.exe': { name: 'Minecraft' },
  'tslgame.exe': { name: 'PUBG: Battlegrounds', app: 578080 },
  'rainbowsix.exe': { name: "Tom Clancy's Rainbow Six Siege", app: 359550 },
  'marvel-win64-shipping.exe': { name: 'Marvel Rivals', app: 2767030 },
  'helldivers2.exe': { name: 'Helldivers 2', app: 553850 },
}
