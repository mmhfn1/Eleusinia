import { randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { type Server, createServer } from 'node:http'
import { join } from 'node:path'
import { type Cs2, cs2Of } from '../shared/cs2'
import { type Dota, dotaOf } from '../shared/dota'
import { steamAppDir, steamLaunchOptions } from './activity'

// Valve's Game State Integration for Counter-Strike 2 and Dota 2 (docs/roadmap-activity.md, steps 2 and 3). With the
// user's go-ahead in Settings, a config file in the game's cfg folder makes the game POST its state to a server here,
// on 127.0.0.1 only, with a secret token we check on every request. Both games share one port and token, kept in
// gsi.json in our data folder, since a game reads the file only when it starts; each payload names its game.
// No Electron imports.
const FILE = 'gamestate_integration_eleusinia.cfg'
const MAX_BODY = 512 * 1024

export type GsiGame = 'cs2' | 'dota'
const GAMES = {
  cs2: {
    app: 730,
    cfg: 'game/csgo/cfg',
    sub: '',
    parse: cs2Of,
    data: ['provider', 'map', 'map_round_wins', 'round', 'phase_countdowns', 'player_id', 'player_state', 'player_weapons', 'player_match_stats'],
  },
  dota: { app: 570, cfg: 'game/dota/cfg', sub: 'gamestate_integration', parse: dotaOf, data: ['provider', 'map', 'player', 'hero', 'items'] },
} as const
export const GSI_GAMES = Object.keys(GAMES) as GsiGame[]
// Dota 2 reads these files only when started with this launch option (since March 2022).
export const DOTA_LAUNCH = '-gamestateintegration'

export const gsiConfig = (game: GsiGame, port: number, token: string) => `"Eleusinia"
{
  "uri" "http://127.0.0.1:${port}/"
  "timeout" "5.0"
  "buffer" "0.1"
  "throttle" "0.5"
  "heartbeat" "10.0"
  "auth"
  {
    "token" "${token}"
  }
  "data"
  {
${GAMES[game].data.map((d) => `    "${d}" "1"`).join('\n')}
  }
}
`

export type GsiStatus = { found: boolean; installed: boolean; folder: string | null; launch?: boolean | null } // launch: Dota's option is set (null: cannot tell)

// cfgFolder and launchOptions: testing only, standing in for the game's folder and Steam's launch options.
type Opts = {
  dir: string
  onData: (game: GsiGame, data: Cs2 | Dota | null) => void
  diag: (text: string) => void
  cfgFolder?: (game: GsiGame) => Promise<string | null>
  launchOptions?: (app: number) => Promise<string[] | null>
}

export function createGsi({ dir, onData, diag, cfgFolder, launchOptions = steamLaunchOptions }: Opts) {
  const keep = join(dir, 'gsi.json')
  const pick = () => 30000 + Math.floor(Math.random() * 20000)
  let conf: { port: number; token: string }
  try {
    conf = JSON.parse(readFileSync(keep, 'utf8'))
    if (!Number.isInteger(conf.port) || !/^[0-9a-f]{48}$/.test(conf.token)) throw new Error('bad')
  } catch {
    conf = { port: pick(), token: randomBytes(24).toString('hex') }
    writeFileSync(keep, JSON.stringify(conf))
  }
  const expected = Buffer.from(conf.token)
  // The folder the file goes in, when the game is installed.
  const cfgDir = async (game: GsiGame) => {
    if (cfgFolder) return cfgFolder(game)
    const g = GAMES[game]
    const app = await steamAppDir(g.app)
    return app && existsSync(join(app, g.cfg)) ? join(app, g.cfg, g.sub) : null
  }
  const installedIn = async (game: GsiGame) => {
    const cfg = await cfgDir(game)
    return cfg && existsSync(join(cfg, FILE)) ? cfg : null
  }

  let server: Server | null = null
  const lastAt = new Map<GsiGame, number>()
  let expiry: ReturnType<typeof setInterval> | null = null
  // Resolves once listening. A port that is taken (or reserved, as Windows does for whole ranges) is swapped for
  // another, and the games' files rewritten to match; a game picks that up when it next starts.
  function listen(): Promise<void> {
    if (server) return Promise.resolve()
    const s = (server = createServer((req, res) => {
      if (req.method !== 'POST') return void res.writeHead(405).end()
      const parts: Buffer[] = []
      let size = 0
      req.on('data', (b: Buffer) => {
        size += b.length
        if (size > MAX_BODY) req.destroy()
        else parts.push(b)
      })
      req.on('end', () => {
        res.writeHead(200).end()
        try {
          const p = JSON.parse(Buffer.concat(parts).toString('utf8'))
          const token = Buffer.from(String(p?.auth?.token ?? ''))
          if (token.length !== expected.length || !timingSafeEqual(token, expected)) return
          const game = GSI_GAMES.find((g) => GAMES[g].app === p?.provider?.appid)
          const data = game && GAMES[game].parse(p)
          if (!game || !data) return
          lastAt.set(game, Date.now())
          onData(game, data)
        } catch {} // not JSON: ignored
      })
    }))
    // A game sends at least every 10 s while running; quiet for 30 s means it closed.
    expiry = setInterval(() => {
      for (const [game, at] of lastAt) if (Date.now() - at > 30000) lastAt.delete(game), onData(game, null)
    }, 5000)
    return new Promise((done) => {
      const attempt = (left: number) => {
        const failed = async (e: NodeJS.ErrnoException) => {
          diag(`Live game details: cannot listen on port ${conf.port} (${e.code ?? e.message})`)
          if (left === 0 || server !== s) return (server === s && close()), done()
          conf = { ...conf, port: pick() }
          writeFileSync(keep, JSON.stringify(conf))
          for (const game of GSI_GAMES) {
            const cfg = await installedIn(game).catch(() => null)
            if (cfg) writeFileSync(join(cfg, FILE), gsiConfig(game, conf.port, conf.token))
          }
          attempt(left - 1)
        }
        s.once('error', failed)
        s.listen(conf.port, '127.0.0.1', () => {
          s.off('error', failed)
          s.on('error', (e: Error) => diag(`Live game details: ${e.message}`))
          done()
        })
      }
      attempt(5)
    })
  }
  function close() {
    server?.close()
    server = null
    if (expiry) clearInterval(expiry)
    expiry = null
    lastAt.clear()
  }
  // The server runs while any game's file is in place.
  async function update() {
    const any = (await Promise.all(GSI_GAMES.map(installedIn))).some(Boolean)
    if (any) await listen()
    else close()
  }

  return {
    get port() {
      return conf.port
    },
    // Whether the game is found and its file is in place, and for Dota whether its launch option is set.
    async status(game: GsiGame): Promise<GsiStatus> {
      const cfg = await cfgDir(game)
      const installed = !!cfg && existsSync(join(cfg, FILE))
      await update()
      const out: GsiStatus = { found: !!cfg, installed, folder: cfg }
      if (game === 'dota') {
        const opts = await launchOptions(GAMES.dota.app).catch(() => null)
        out.launch = opts ? opts.some((o) => o.split(/\s+/).includes(DOTA_LAUNCH)) : null
      }
      return out
    },
    async install(game: GsiGame) {
      const cfg = await cfgDir(game)
      if (!cfg) throw new Error(`${game === 'cs2' ? 'Counter-Strike 2' : 'Dota 2'} was not found in your Steam library`)
      mkdirSync(cfg, { recursive: true })
      writeFileSync(join(cfg, FILE), gsiConfig(game, conf.port, conf.token))
      diag(`Live ${game} details set up in ${cfg}`)
      return this.status(game)
    },
    async remove(game: GsiGame) {
      const cfg = await cfgDir(game)
      if (cfg) rmSync(join(cfg, FILE), { force: true })
      lastAt.delete(game)
      onData(game, null)
      return this.status(game)
    },
    // Whether any game's file is in place, so the server should run.
    update,
    stop: close,
  }
}
