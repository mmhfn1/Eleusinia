import { expect, test } from 'vitest'
import { artUrl, cleanActivity, shareable } from '../src/shared/activity'
import { cleanDota, dotaOf, heroName, itemName, shareableDota, stateName } from '../src/shared/dota'

// What Dota 2 sends mid-match while we play (the shape its Game State Integration uses).
const live = (hero: object = {}, map: object = {}) => ({
  provider: { name: 'Dota 2', appid: 570, version: 47, timestamp: 1 },
  map: { name: 'start', matchid: '7890', game_time: 1300, clock_time: 1234, daytime: true, radiant_score: 21, dire_score: 14, game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS', paused: false, win_team: 'none', ...map },
  player: { steamid: '76561198000000001', name: 'Ann', activity: 'playing', kills: 9, deaths: 2, assists: 11, last_hits: 212, denies: 14, kill_streak: 4, team_name: 'dire', gold: 2310, gpm: 612, xpm: 701 },
  hero: { id: 1, name: 'npc_dota_hero_antimage', level: 19, alive: true, respawn_seconds: 0, buyback_cost: 1520, buyback_cooldown: 0, health: 1650, max_health: 2100, mana: 410, max_mana: 780, aghanims_scepter: false, aghanims_shard: true, ...hero },
  items: {
    slot0: { name: 'item_bfury' }, slot1: { name: 'item_manta' }, slot2: { name: 'empty' }, slot3: { name: 'item_power_treads' }, slot4: { name: 'item_blink' }, slot5: { name: 'empty' },
    slot6: { name: 'item_magic_wand' }, slot7: { name: 'empty' }, slot8: { name: 'empty' }, neutral0: { name: 'item_mysterious_hat' }, teleport0: { name: 'item_tpscroll' },
  },
})

test('a payload while we play: hero, score, the clock as a start time, our numbers and our live state', () => {
  const d = dotaOf(live(), 1_000_000)!
  expect(d).toMatchObject({ state: 'game_in_progress', day: true, radiant: 21, dire: 14, team: 'dire', hero: 'antimage', level: 19 })
  expect(d.clockAt).toBe(1_000_000 - 1234_000)
  expect(d.winner).toBeUndefined() // 'none'
  expect(d.stats).toEqual({ kills: 9, deaths: 2, assists: 11, lastHits: 212, denies: 14, gpm: 612, xpm: 701, streak: 4 })
  expect(d.live).toEqual({
    gold: 2310, health: 1650, maxHealth: 2100, mana: 410, maxMana: 780, buyback: 1520, scepter: false, shard: true,
    items: ['bfury', 'manta', '', 'power_treads', 'blink', ''], backpack: ['magic_wand', '', ''], neutral: 'mysterious_hat',
  })
})

test('dead, paused, before the horn, over, spectating, the menu and other games', () => {
  const dead = dotaOf(live({ alive: false, respawn_seconds: 23, buyback_cooldown: 120 }), 1_000_000)!
  expect(dead.live!.respawnAt).toBe(1_023_000)
  expect(dead.live!.buyback).toBeUndefined() // on cooldown
  const paused = dotaOf(live({}, { paused: true }))!
  expect([paused.clock, paused.clockAt]).toEqual([1234, undefined])
  expect(dotaOf(live({}, { clock_time: -45, game_state: 'DOTA_GAMERULES_STATE_PRE_GAME' }), 1_000_000)!.clockAt).toBe(1_045_000)
  // The clock in hero selection counts the picking time, not the match
  expect(dotaOf(live({}, { game_state: 'DOTA_GAMERULES_STATE_HERO_SELECTION' }))!.clockAt).toBeUndefined()
  expect(dotaOf(live({}, { game_state: 'DOTA_GAMERULES_STATE_POST_GAME', win_team: 'radiant' }))!.winner).toBe('radiant')
  // Spectating: per-team players and heroes, none of them us, so only the match
  const watching = dotaOf({ ...live(), player: { team2: { player0: { kills: 5 } } }, hero: { team2: { player0: { name: 'npc_dota_hero_axe' } } } })!
  expect(watching).toMatchObject({ watching: true, radiant: 21, dire: 14 })
  expect([watching.hero, watching.stats, watching.live, watching.team]).toEqual([undefined, undefined, undefined, undefined])
  expect(dotaOf({ provider: { appid: 570 }, player: { activity: 'menu' } })).toEqual({ menu: true })
  expect(dotaOf({ provider: { appid: 570 } })).toEqual({ menu: true })
  expect(dotaOf({ provider: { appid: 730 }, map: {} })).toBeNull()
  // Odd names are dropped rather than passed on
  expect(dotaOf(live({ name: 'npc_dota_hero_<script>' }))!.hero).toBeUndefined()
})

test('what is shared: the match and our numbers unless turned off, gold and items only when turned on', () => {
  const d = dotaOf(live())!
  const plain = shareableDota(d, undefined)
  expect(plain.live).toBeUndefined()
  expect(plain.stats).toEqual(d.stats)
  expect(plain.hero).toBe('antimage')
  expect(shareableDota(d, { live: true }).live).toEqual(d.live)
  const bare = shareableDota(d, { match: false, stats: false })
  expect(bare).toEqual({})
  expect(shareableDota({ menu: true, hero: 'axe' }, { live: true })).toEqual({ menu: true })
  const g = shareable({ now: 1, game: { name: 'Dota 2', since: 0, source: 'steam', app: 570, dota: d } }, { dota: { stats: false } }).game!
  expect(g.dota!.stats).toBeUndefined()
  expect(g.dota!.live).toBeUndefined()
})

test("a friend's Dota 2 details are checked, capped and moved onto our clock, and only on Dota 2", () => {
  const d = shareableDota(dotaOf(live({ alive: false, respawn_seconds: 30 }), 500_000)!, { live: true })
  // Their clock runs 10 s ahead of ours
  const c = cleanDota(d, -10_000, 490_000)!
  expect(c.clockAt).toBe(d.clockAt! - 10_000)
  expect(c.live!.respawnAt).toBe(d.live!.respawnAt! - 10_000)
  expect(c.live!.items).toEqual(d.live!.items)
  const hostile = cleanDota({ hero: '../../x', state: 'a'.repeat(99), radiant: -1, dire: 1e9, team: 'spectators', live: { gold: 'lots', items: ['<img>', 'blink', 'x', 'y', 'z', 'w', 'extra'], respawnAt: 1e15 }, stats: { kills: 1e9 } }, 0, 1000)!
  expect([hostile.hero, hostile.state, hostile.radiant, hostile.dire, hostile.team]).toEqual([undefined, undefined, undefined, undefined, undefined])
  expect(hostile.live).toMatchObject({ gold: 0, items: ['', 'blink', 'x', 'y', 'z', 'w'], backpack: ['', '', ''] })
  expect(hostile.live!.respawnAt).toBeUndefined()
  expect(hostile.stats!.kills).toBe(0)
  const sent = { now: 1000, game: { name: 'Dota 2', since: 0, source: 'steam', app: 570, dota: d } }
  expect(cleanActivity(sent, 1000)!.game!.dota!.hero).toBe('antimage')
  expect(cleanActivity({ ...sent, game: { ...sent.game, app: 730 } }, 1000)!.game!.dota).toBeUndefined()
})

test('names as players know them, and pictures only from Steam\'s Dota 2 folders', () => {
  expect([heroName('antimage'), heroName('nevermore'), heroName('crystal_maiden'), heroName('keeper_of_the_light')]).toEqual(['Anti-Mage', 'Shadow Fiend', 'Crystal Maiden', 'Keeper of the Light'])
  expect([itemName('ultimate_scepter'), itemName('bfury'), itemName('power_treads'), itemName('mysterious_hat')]).toEqual(["Aghanim's Scepter", 'Battle Fury', 'Power Treads', 'Mysterious Hat'])
  expect([stateName('hero_selection'), stateName('game_in_progress'), stateName('something_new')]).toEqual(['Picking heroes', 'Playing', 'Something New'])
  expect(artUrl('eleusinia-art://dota/heroes/antimage')).toBe('https://cdn.akamai.steamstatic.com/apps/dota2/images/dota_react/heroes/antimage.png')
  expect(artUrl('eleusinia-art://dota/items/blink')).toBe('https://cdn.akamai.steamstatic.com/apps/dota2/images/dota_react/items/blink.png')
  expect(artUrl('eleusinia-art://dota/abilities/x')).toBeNull()
  expect(artUrl('eleusinia-art://dota/heroes/../x')).toBeNull()
})
