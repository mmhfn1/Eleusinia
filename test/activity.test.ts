import { expect, test } from 'vitest'
import { type Activity, type Game, artUrl, cleanActivity, cleanShowcase, cleanWeek, dayKey, shareable, weekOf } from '../src/shared/activity'

const game: Game = {
  name: 'Deadlock',
  since: 1000,
  source: 'steam',
  app: 1422450,
  played: 600,
  genres: ['Action'],
  developer: 'Valve',
  released: 'TBA',
  about: 'Heroes and lanes',
  achievements: { got: 1, total: 2, recent: [{ name: 'A', desc: 'B', icon: 'f'.repeat(40) + '.jpg', at: 500, rarity: 3.5 }] },
}

test('only what was chosen leaves: on unless turned off, store details only when turned on, each detail can be turned off', () => {
  const a: Activity = { now: 5000, game }
  expect(shareable(a, { games: false })).toEqual({ now: 5000 })
  const { genres, developer, released, about, ...plain } = game
  expect(shareable(a, undefined).game).toEqual(plain)
  expect(shareable(a, {}).game).toEqual(plain)
  expect(shareable(a, { details: true }).game).toEqual(game)
  const g = shareable(a, { games: true, playtime: false, achievements: false }).game!
  expect(Object.keys(g).sort()).toEqual(['app', 'name', 'since', 'source'])
  expect(a.game).toEqual(game) // the original is untouched
})

test("a friend's activity is checked and capped, and its times move onto our clock", () => {
  // Their clock runs 10 s ahead of ours: since 10 s later in their time is "now minus 1 min" in ours.
  const theirs = { now: 100000 + 10000, game: { ...game, since: 100000 + 10000 - 60000 } }
  expect(cleanActivity(theirs, 100000)!.game!.since).toBe(40000)
  expect(cleanActivity(null)).toBeNull()
  expect(cleanActivity({ now: 1, game: { name: '', source: 'steam' } }, 5)).toEqual({ now: 5 })
  expect(cleanActivity({ now: 1, game: { name: 'x', source: 'evil' } }, 5)).toEqual({ now: 5 })
  const bad = cleanActivity(
    {
      now: 0,
      game: {
        name: 'n'.repeat(500),
        source: 'program',
        since: -1e15,
        app: 'javascript:alert(1)',
        played: -4,
        genres: Array(20).fill('g'.repeat(100)),
        about: 'a'.repeat(5000),
        achievements: { got: 9, total: 3, recent: [] },
        extra: 'dropped',
      },
    },
    40 * 864e5,
  )!.game!
  expect(bad.name).toHaveLength(100)
  expect(bad.since).toBe(10 * 864e5) // at most 30 days back
  expect(bad.app).toBeUndefined()
  expect(bad.played).toBeUndefined()
  expect(bad.genres).toHaveLength(5)
  expect(bad.genres![0]).toHaveLength(40)
  expect(bad.about).toHaveLength(400)
  expect(bad.achievements).toBeUndefined() // more unlocked than there are
  expect('extra' in bad).toBe(false)
  const icons = cleanActivity({ now: 0, game: { ...game, achievements: { got: 1, total: 1, recent: [{ name: 'x', icon: '../../evil.jpg', rarity: 400 }] } } }, 0)!
  expect(icons.game!.achievements!.recent[0]).toEqual({ name: 'x', desc: '', icon: '', at: 0 })
})

test('pictures only ever come from Steam, built from ids', () => {
  expect(artUrl('eleusinia-art://steam/730/header')).toBe('https://cdn.akamai.steamstatic.com/steam/apps/730/header.jpg')
  expect(artUrl('eleusinia-art://steam/730/capsule')).toBe('https://cdn.akamai.steamstatic.com/steam/apps/730/library_600x900.jpg')
  expect(artUrl(`eleusinia-art://achievement/730/${'0'.repeat(40)}.jpg`)).toBe(`https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/730/${'0'.repeat(40)}.jpg`)
  for (const bad of ['eleusinia-art://steam/730/../../x', 'eleusinia-art://steam/730/anything', 'eleusinia-art://evil.com/730/header', 'eleusinia-art://achievement/730/x.jpg', 'https://evil.com/a.jpg', 'eleusinia-art://steam/abc/header'])
    expect(artUrl(bad)).toBeNull()
})

test('the two weeks we share: the 3 games played most each day, rounded to 5 minutes, and only what is valid from a friend', () => {
  const now = new Date(2026, 10, 20, 15).getTime()
  const played: Record<string, Record<string, number>> = { [dayKey(now)]: { A: 62, B: 3, C: 20, D: 10, E: 40 }, [dayKey(now - 864e5)]: { A: 30 }, [dayKey(now - 15 * 864e5)]: { A: 500 } }
  expect(weekOf(played, now)).toEqual([
    { d: 0, g: 'A', m: 60 },
    { d: 0, g: 'E', m: 40 },
    { d: 0, g: 'C', m: 20 },
    { d: 1, g: 'A', m: 30 },
  ])
  expect(cleanWeek([{ d: 0, g: 'A', m: 60 }, { d: 14, g: 'B', m: 5 }, { d: 1, g: '', m: 5 }, { d: 2, g: 'C', m: 99999 }, 'x'])).toEqual([{ d: 0, g: 'A', m: 60 }])
  expect(cleanActivity({ now, week: [{ d: 0, g: 'A', m: 60 }] }, now)).toEqual({ now, week: [{ d: 0, g: 'A', m: 60 }] })
  // turned off with playtime, kept with a game or without one
  expect(shareable({ now, week: [{ d: 0, g: 'A', m: 60 }] }, { playtime: false }).week).toBeUndefined()
  expect(shareable({ now, week: [{ d: 0, g: 'A', m: 60 }] }, undefined).week).toHaveLength(1)
})

test('a showcase keeps up to 3 games or achievements with a real Steam icon name', () => {
  const icon = 'a'.repeat(40) + '.jpg'
  expect(cleanShowcase([{ app: 730, game: 'CS2', hours: 412 }, { app: 730, game: 'CS2', ach: 'Ace', icon }])).toEqual([
    { app: 730, game: 'CS2', hours: 412 },
    { app: 730, game: 'CS2', ach: 'Ace', icon },
  ])
  expect(cleanShowcase([{ app: 730, game: 'CS2', ach: 'Ace', icon: '../x.jpg' }, { app: 0, game: 'X' }, { app: 1, game: '' }])).toBeUndefined()
  expect(cleanShowcase(Array.from({ length: 5 }, (_, i) => ({ app: i + 1, game: 'G' })))).toHaveLength(3)
})
