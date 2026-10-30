import { execFile } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { type Achievement, type ActivitySettings, type Game, KNOWN_GAMES, RECENT_ACHIEVEMENTS, sharing } from '../shared/activity'
import { type Vdf, achievementsOf, libraryPaths, parseKv, parseReg, parseVdf, programsOf, vget, vnum } from '../shared/steam'

// Finds the game being played, every 10 s while sharing games is on (docs/roadmap-activity.md, steps 0 and 1):
// Steam's own record of the running game first, then the running programs against a list of known games. Read only:
// the registry, Steam's files, the process list, and Steam's public store and stats pages. No Electron imports.
type Opts = {
  settings: () => ActivitySettings | undefined
  onGame: (g: Game | null) => void
  fetch: (url: string) => Promise<Response>
  diag: (text: string) => void
  every?: number
}

const WINDOWS = process.platform === 'win32'
const run = (cmd: string, args: string[]) =>
  new Promise<string>((resolve) => execFile(cmd, args, { windowsHide: true, timeout: 10000, maxBuffer: 16 << 20 }, (e, out) => resolve(e ? '' : String(out))))
const readVdf = (file: string): Vdf | null => {
  try {
    return parseVdf(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}
const mtime = (file: string) => {
  try {
    return statSync(file).mtimeMs
  } catch {
    return 0
  }
}

// Where Steam is, which game it runs (0: none) and whose account is signed in.
type SteamNow = { root: string; app: number; user: number }
async function steamNow(): Promise<SteamNow | null> {
  if (WINDOWS) {
    const r = parseReg(await run('reg', ['query', 'HKCU\\Software\\Valve\\Steam']))
    if (!r.SteamPath) return null
    const app = Number(r.RunningAppID) || 0
    const user = app ? Number(parseReg(await run('reg', ['query', 'HKCU\\Software\\Valve\\Steam\\ActiveProcess', '/v', 'ActiveUser'])).ActiveUser) || 0 : 0
    return { root: r.SteamPath, app, user }
  }
  // Linux keeps the same values in registry.vdf; macOS: verify on a real Mac.
  const roots = process.platform === 'darwin' ? [join(homedir(), 'Library/Application Support/Steam')] : [join(homedir(), '.steam/steam'), join(homedir(), '.local/share/Steam')]
  const root = roots.find(existsSync)
  const reg = readVdf(process.platform === 'darwin' ? join(roots[0], 'registry.vdf') : join(homedir(), '.steam/registry.vdf'))
  if (!root || !reg) return null
  const steam = vget(reg, 'Registry', 'HKCU', 'Software', 'Valve', 'Steam')
  return { root, app: vnum(vget(steam, 'RunningAppID')) ?? 0, user: vnum(vget(steam, 'ActiveProcess', 'ActiveUser')) ?? 0 }
}

// Where a Steam game is installed: its library folder (the one whose app list has it) and the manifest's installdir.
export async function steamAppDir(app: number): Promise<string | null> {
  const s = await steamNow()
  if (!s) return null
  const libs = libraryPaths(readVdf(join(s.root, 'steamapps/libraryfolders.vdf')) ?? {})
  for (const lib of [s.root, ...libs]) {
    const dir = vget(readVdf(join(lib, 'steamapps', `appmanifest_${app}.acf`)) ?? {}, 'AppState', 'installdir')
    if (typeof dir === 'string' && dir && existsSync(join(lib, 'steamapps/common', dir))) return join(lib, 'steamapps/common', dir)
  }
  return null
}

// A game's launch options, one per Steam account on this computer ('' when none are set); null without Steam.
export async function steamLaunchOptions(app: number): Promise<string[] | null> {
  const s = await steamNow()
  if (!s) return null
  let users: string[] = []
  try {
    users = readdirSync(join(s.root, 'userdata'))
  } catch {}
  return users.flatMap((u) => {
    const conf = readVdf(join(s.root, 'userdata', u, 'config/localconfig.vdf'))
    if (!conf) return []
    const o = vget(conf, 'UserLocalConfigStore', 'Software', 'Valve', 'Steam', 'apps', String(app), 'LaunchOptions')
    return [typeof o === 'string' ? o : '']
  })
}

type StoreInfo ={ name?: string; genres?: string[]; developer?: string; released?: string; about?: string }
const entities = (s: string) =>
  s.replace(/&(quot|amp|lt|gt|#39|apos|nbsp);/g, (_, e) => ({ quot: '"', amp: '&', lt: '<', gt: '>', '#39': "'", apos: "'", nbsp: ' ' })[e as 'quot'] ?? '')

export const programs = async () => programsOf(await run(WINDOWS ? 'tasklist' : 'ps', WINDOWS ? ['/fo', 'csv', '/nh'] : ['-axo', 'comm=']), WINDOWS)

export function watchActivity({ settings, onGame, fetch, diag, every = 10000 }: Opts) {
  const store = new Map<number, Promise<StoreInfo>>() // per app, once per run
  const rarity = new Map<number, Promise<Record<string, number>>>()
  let session: { key: string; since: number; game: Game; statsAt: number } | null = null
  let sent = ''

  async function storeInfo(app: number): Promise<StoreInfo> {
    try {
      const r = await fetch(`https://store.steampowered.com/api/appdetails?appids=${app}&l=english`)
      const d = (await r.json())?.[app]?.data
      if (!d) return {}
      return {
        name: typeof d.name === 'string' ? d.name : undefined,
        genres: Array.isArray(d.genres) ? d.genres.map((g: any) => String(g?.description ?? '')).filter(Boolean).slice(0, 5) : undefined,
        developer: Array.isArray(d.developers) && typeof d.developers[0] === 'string' ? d.developers[0] : undefined,
        released: typeof d.release_date?.date === 'string' ? d.release_date.date : undefined,
        about: typeof d.short_description === 'string' ? entities(d.short_description).slice(0, 400) : undefined,
      }
    } catch {
      return {}
    }
  }
  async function rarityOf(app: number): Promise<Record<string, number>> {
    try {
      const r = await fetch(`https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/?gameid=${app}&format=json`)
      const list = (await r.json())?.achievementpercentages?.achievements
      return Object.fromEntries((Array.isArray(list) ? list : []).map((a: any) => [String(a.name), Number(a.percent)]))
    } catch {
      return {}
    }
  }

  // Name from the app's manifest in any library folder; the store's name when it is not installed here.
  function manifestName(root: string, app: number) {
    const libs = libraryPaths(readVdf(join(root, 'steamapps/libraryfolders.vdf')) ?? {})
    for (const lib of [root, ...libs]) {
      const name = vget(readVdf(join(lib, 'steamapps', `appmanifest_${app}.acf`)) ?? {}, 'AppState', 'name')
      if (typeof name === 'string' && name) return name
    }
    return undefined
  }
  function playtime(root: string, user: number, app: number) {
    const conf = readVdf(join(root, 'userdata', String(user), 'config/localconfig.vdf'))
    return vnum(vget(conf ?? {}, 'UserLocalConfigStore', 'Software', 'Valve', 'Steam', 'apps', String(app), 'Playtime'))
  }
  async function achievements(root: string, user: number, app: number): Promise<Game['achievements']> {
    try {
      const schema = parseKv(readFileSync(join(root, 'appcache/stats', `UserGameStatsSchema_${app}.bin`)))
      const statsFile = join(root, 'appcache/stats', `UserGameStats_${user}_${app}.bin`)
      const a = achievementsOf(schema, existsSync(statsFile) ? parseKv(readFileSync(statsFile)) : null)
      if (!a.total) return undefined
      if (!rarity.has(app)) rarity.set(app, rarityOf(app))
      const pct = await rarity.get(app)!
      const recent = a.unlocked.slice(0, RECENT_ACHIEVEMENTS).map((u): Achievement => ({
        name: u.name || u.id,
        desc: u.desc,
        icon: u.icon,
        at: u.at * 1000,
        ...(Number.isFinite(pct[u.id]) && { rarity: pct[u.id] }),
      }))
      return { got: a.unlocked.length, total: a.total, recent }
    } catch {
      return undefined // no stats for this game, or a file Steam was writing
    }
  }

  async function steamGame(s: SteamNow): Promise<Game> {
    const key = `steam:${s.app}`
    if (session?.key === key) {
      // Only achievements change during a session: reread them when Steam rewrites the stats file.
      const at = mtime(join(s.root, 'appcache/stats', `UserGameStats_${s.user}_${s.app}.bin`))
      if (at !== session.statsAt) (session.statsAt = at), (session.game = { ...session.game, achievements: await achievements(s.root, s.user, s.app) })
      return session.game
    }
    if (!store.has(s.app)) store.set(s.app, storeInfo(s.app))
    const info = await store.get(s.app)!
    const game: Game = {
      name: manifestName(s.root, s.app) ?? info.name ?? `Steam game ${s.app}`,
      since: Date.now(),
      source: 'steam',
      app: s.app,
      ...(s.user && { played: playtime(s.root, s.user, s.app) }),
      ...(info.genres?.length && { genres: info.genres }),
      ...(info.developer && { developer: info.developer }),
      ...(info.released && { released: info.released }),
      ...(info.about && { about: info.about }),
      ...(s.user && { achievements: await achievements(s.root, s.user, s.app) }),
    }
    for (const k of Object.keys(game) as (keyof Game)[]) if (game[k] === undefined) delete game[k]
    session = { key, since: game.since, game, statsAt: mtime(join(s.root, 'appcache/stats', `UserGameStats_${s.user}_${s.app}.bin`)) }
    diag(`playing ${game.name} (Steam ${s.app})`)
    return game
  }

  async function programGame(): Promise<Game | null> {
    const extra = settings()?.extra ?? {}
    const exe = (await programs()).find((p) => Object.hasOwn(extra, p) || Object.hasOwn(KNOWN_GAMES, p))
    if (!exe) return null
    const key = `program:${exe}`
    if (session?.key === key) return session.game
    const known = Object.hasOwn(extra, exe) ? { name: extra[exe] } : KNOWN_GAMES[exe]
    const game: Game = { name: known.name, since: Date.now(), source: 'program', ...('app' in known && known.app && { app: known.app }) }
    session = { key, since: game.since, game, statsAt: 0 }
    diag(`playing ${game.name} (found by its program)`)
    return game
  }

  let busy = false
  async function tick() {
    if (busy || !sharing(settings())) return
    busy = true
    try {
      const s = await steamNow()
      const game = s?.app ? await steamGame(s) : await programGame()
      if (!game) session = null
      const now = JSON.stringify(game)
      if (now !== sent) (sent = now), onGame(game)
    } catch (e) {
      diag(`activity check failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      busy = false
    }
  }
  const timer = setInterval(tick, every)
  tick()
  return {
    check: tick, // at once, e.g. when sharing is turned on
    programs, // for Settings → Add a game
    stop() {
      clearInterval(timer)
      session = null
      sent = ''
    },
  }
}
