import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { cleanActivity, shareable } from '../src/shared/activity'
import { type Cs2, cleanCs2, cs2Of, mapName, modeName, roundWin, shareableCs2, weaponName } from '../src/shared/cs2'
import { createCs2 } from '../src/main/cs2'

const ME = '76561198000000001'
// What CS2 sends mid-match (the shape Valve's Game State Integration uses).
const live = (player: object = {}) => ({
  provider: { name: 'Counter-Strike: Global Offensive', appid: 730, version: 14000, steamid: ME, timestamp: 1 },
  map: {
    mode: 'competitive',
    name: 'de_mirage',
    phase: 'live',
    round: 11,
    team_ct: { score: 7, consecutive_round_losses: 1, timeouts_remaining: 1 },
    team_t: { score: 4, consecutive_round_losses: 0, timeouts_remaining: 1 },
    round_wins: { 2: 't_win_bomb', 1: 'ct_win_elimination', 3: 'ct_win_defuse' },
  },
  round: { phase: 'live', bomb: 'planted' },
  player: {
    steamid: ME,
    name: 'Ann',
    team: 'CT',
    activity: 'playing',
    match_stats: { kills: 12, assists: 3, deaths: 6, mvps: 2, score: 31 },
    state: { health: 76, armor: 100, helmet: true, flashed: 0, money: 4350, round_kills: 2, round_killhs: 1, equip_value: 5200, defusekit: true },
    weapons: { weapon_0: { name: 'weapon_knife', state: 'holstered' }, weapon_1: { name: 'weapon_m4a1_silencer', state: 'active', ammo_clip: 20 } },
    ...player,
  },
  phase_countdowns: { phase: 'bomb', phase_ends_in: '32.4' },
  auth: { token: 'x' },
})

test('a live payload: map, score, how each round went, the clock, and our own numbers', () => {
  const c = cs2Of(live(), 1_000_000)!
  expect(c).toMatchObject({ map: 'de_mirage', mode: 'competitive', phase: 'live', round: 11, ct: 7, t: 4, team: 'CT', roundPhase: 'live', bomb: 'planted', endsPhase: 'bomb' })
  expect(c.rounds).toEqual(['ct_win_elimination', 't_win_bomb', 'ct_win_defuse']) // in round order
  expect(c.endsAt).toBe(1_032_000) // 32.4 s on, to the second
  expect(c.stats).toEqual({ kills: 12, assists: 3, deaths: 6, mvps: 2, score: 31 })
  expect(c.state).toEqual({ health: 76, armor: 100, helmet: true, money: 4350, roundKills: 2, roundHeadshots: 1, equip: 5200, weapon: 'weapon_m4a1_silencer', defuser: true })
})

test("dead and watching someone: their numbers are not taken for ours; the menu; another game's payload", () => {
  const watching = cs2Of(live({ steamid: '76561198000000999', name: 'Bob', team: 'T' }))!
  expect(watching.map).toBe('de_mirage')
  expect(watching.stats).toBeUndefined()
  expect(watching.state).toBeUndefined()
  expect(watching.team).toBeUndefined()
  expect(cs2Of({ provider: { appid: 730, steamid: ME }, player: { steamid: ME, activity: 'menu' } })).toEqual({ menu: true })
  expect(cs2Of({ provider: { appid: 570 } })).toBeNull()
  expect(cs2Of(null)).toBeNull()
})

test('what is shared: match and stats unless turned off, live state only when turned on', () => {
  const c = cs2Of(live())!
  expect(shareableCs2(c, undefined).state).toBeUndefined()
  expect(shareableCs2(c, undefined).stats).toBeDefined()
  expect(shareableCs2(c, { state: true }).state).toEqual(c.state)
  const bare = shareableCs2(c, { match: false, stats: false })
  expect(bare).toEqual({ map: 'de_mirage' })
  const game = { name: 'Counter-Strike 2', since: 0, source: 'steam' as const, app: 730, cs2: c }
  expect(shareable({ now: 0, game }, { games: true }).game!.cs2!.state).toBeUndefined()
})

test("a friend's CS2 details are checked, and the round clock moves onto our clock", () => {
  const sent: Cs2 = { map: 'de_mirage', ct: 7, t: 4, team: 'T', endsAt: 50_000, rounds: ['ct_win_time'], stats: { kills: 1, assists: 0, deaths: 0, mvps: 0, score: 2 } }
  // Their clock is 10 s ahead of ours
  const got = cleanActivity({ now: 60_000, game: { name: 'Counter-Strike 2', source: 'steam', app: 730, since: 0, cs2: sent } }, 50_000)!.game!.cs2!
  expect(got).toMatchObject({ map: 'de_mirage', ct: 7, t: 4, team: 'T', endsAt: 40_000, rounds: ['ct_win_time'] })
  const bad = cleanCs2({ map: '<script>', ct: 1e9, team: 'X', rounds: ['ok', '<b>', 5], endsAt: 1e15, stats: { kills: -1, deaths: 'a' }, state: { health: 1000, weapon: '../x' }, extra: 1 }, 0, 0)!
  expect(bad).toEqual({ rounds: ['ok'], stats: { kills: 0, assists: 0, deaths: 0, mvps: 0, score: 0 }, state: { health: 0, armor: 0, helmet: false, money: 0, roundKills: 0, roundHeadshots: 0, equip: 0 } })
  // Only on CS2: another game cannot carry CS2 details
  expect(cleanActivity({ now: 0, game: { name: 'Other', source: 'steam', app: 570, since: 0, cs2: sent } }, 0)!.game!.cs2).toBeUndefined()
})

test('names as players know them', () => {
  expect([mapName('de_dust2'), mapName('de_new_map'), modeName('scrimcomp2v2'), modeName('newmode')]).toEqual(['Dust II', 'New Map', 'Wingman', 'Newmode'])
  expect([weaponName('weapon_ak47'), weaponName('weapon_knife_karambit'), weaponName('weapon_something_new')]).toEqual(['AK-47', 'Knife', 'Something New'])
  expect(roundWin('t_win_bomb')).toEqual({ side: 'T', how: 'Bomb exploded' })
  expect(roundWin('nonsense')).toBeNull()
})

test("the local server: set up writes the game's file, only posts with our token count, and remove takes it away", async () => {
  const cfg = mkdtempSync(join(tmpdir(), 'eleusinia-cs2cfg-'))
  const got: (Cs2 | null)[] = []
  const cs2 = createCs2({ dir: mkdtempSync(join(tmpdir(), 'eleusinia-cs2-')), cfgFolder: async () => cfg, onData: (c) => got.push(c), diag: () => {} })
  expect(await cs2.status()).toEqual({ found: true, installed: false, folder: cfg })
  await cs2.install()
  const file = readFileSync(join(cfg, 'gamestate_integration_eleusinia.cfg'), 'utf8')
  const token = /"token" "([0-9a-f]{48})"/.exec(file)![1]
  expect(file).toContain(`"uri" "http://127.0.0.1:${cs2.port}/"`)
  expect(file).toContain('"map_round_wins" "1"')
  const post = (body: unknown) => fetch(`http://127.0.0.1:${cs2.port}/`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }).catch(() => null)
  await post({ ...live(), auth: { token: 'f'.repeat(48) } })
  await post({ ...live(), auth: {} })
  await post('not json')
  await post('x'.repeat(600 * 1024)) // past the size cap
  expect(got).toEqual([])
  await post({ ...live(), auth: { token } })
  expect(got).toHaveLength(1)
  expect(got[0]!.map).toBe('de_mirage')
  expect((await fetch(`http://127.0.0.1:${cs2.port}/`)).status).toBe(405)
  await cs2.remove()
  expect(existsSync(join(cfg, 'gamestate_integration_eleusinia.cfg'))).toBe(false)
  expect(got.at(-1)).toBeNull()
  cs2.stop()
})
