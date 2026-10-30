import { randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { type Server, createServer } from 'node:http'
import { join } from 'node:path'
import { type Cs2, cs2Of } from '../shared/cs2'
import { steamAppDir } from './activity'

// Counter-Strike 2's Game State Integration (docs/roadmap-activity.md, step 2). With the user's go-ahead in Settings,
// a config file in the game's cfg folder makes the game POST its state to a server here, on 127.0.0.1 only, with a
// secret token we check on every request. The port and token are kept in gsi.json in our data folder, since the game
// reads the file only when it starts. No Electron imports.
const FILE = 'gamestate_integration_eleusinia.cfg'
const MAX_BODY = 512 * 1024

export const cs2Config = (port: number, token: string) => `"Eleusinia"
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
    "provider" "1"
    "map" "1"
    "map_round_wins" "1"
    "round" "1"
    "phase_countdowns" "1"
    "player_id" "1"
    "player_state" "1"
    "player_weapons" "1"
    "player_match_stats" "1"
  }
}
`

// cfgFolder: testing only, a folder standing in for the game's cfg folder.
type Opts = { dir: string; onData: (c: Cs2 | null) => void; diag: (text: string) => void; cfgFolder?: () => Promise<string | null> }

export function createCs2({ dir, onData, diag, cfgFolder }: Opts) {
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
  const cfgDir = async () => {
    if (cfgFolder) return cfgFolder()
    const game = await steamAppDir(730)
    return game && existsSync(join(game, 'game/csgo/cfg')) ? join(game, 'game/csgo/cfg') : null
  }

  let server: Server | null = null
  let lastAt = 0
  let expiry: ReturnType<typeof setInterval> | null = null
  // Resolves once listening. A port that is taken (or reserved, as Windows does for whole ranges) is swapped for
  // another, and the game's file rewritten to match; the game picks that up when it next starts.
  function listen(cfg: string): Promise<void> {
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
          const c = cs2Of(p)
          if (!c) return
          lastAt = Date.now()
          onData(c)
        } catch {} // not JSON: ignored
      })
    }))
    // The game sends at least every 10 s while running; quiet for 30 s means it closed.
    expiry = setInterval(() => lastAt && Date.now() - lastAt > 30000 && ((lastAt = 0), onData(null)), 5000)
    return new Promise((done) => {
      const attempt = (left: number) => {
        const failed = (e: NodeJS.ErrnoException) => {
          diag(`CS2 live details: cannot listen on port ${conf.port} (${e.code ?? e.message})`)
          if (left === 0 || server !== s) return (server === s && close()), done()
          conf = { ...conf, port: pick() }
          writeFileSync(keep, JSON.stringify(conf))
          if (existsSync(join(cfg, FILE))) writeFileSync(join(cfg, FILE), cs2Config(conf.port, conf.token))
          attempt(left - 1)
        }
        s.once('error', failed)
        s.listen(conf.port, '127.0.0.1', () => {
          s.off('error', failed)
          s.on('error', (e: Error) => diag(`CS2 live details: ${e.message}`))
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
    lastAt = 0
  }

  return {
    get port() {
      return conf.port
    },
    // Whether the game is found and the file is in place; the server runs only while it is.
    async status() {
      const cfg = await cfgDir()
      const installed = !!cfg && existsSync(join(cfg, FILE))
      if (installed) await listen(cfg)
      else close()
      return { found: !!cfg, installed, folder: cfg }
    },
    async install() {
      const cfg = await cfgDir()
      if (!cfg) throw new Error('Counter-Strike 2 was not found in your Steam library')
      writeFileSync(join(cfg, FILE), cs2Config(conf.port, conf.token))
      diag(`CS2 live details set up in ${cfg}`)
      return this.status()
    },
    async remove() {
      const cfg = await cfgDir()
      if (cfg) rmSync(join(cfg, FILE), { force: true })
      onData(null)
      return this.status()
    },
    stop: close,
  }
}
