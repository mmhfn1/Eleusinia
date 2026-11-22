// Two weeks of play: days by the calendar in the sender's own time zone, pruning, the strength scale and a friend's
// copy checked. The zone is set before any date is made, so the 25-hour day at the end of summer time is real here.
process.env.TZ = 'Europe/Berlin'
import { expect, test } from 'vitest'
import { PLAY_DAYS, cleanActivity, cleanWeek, dayKey, daysBack, playLevel, prunePlayed, shareable, weekOf } from '../src/shared/activity'

test('this file really runs in Berlin time', () => {
  expect(new Date(Date.UTC(2026, 6, 1, 12)).getHours()).toBe(14)
})

test('days step by the calendar: across the 25-hour day no day is counted twice or skipped', () => {
  // Summer time ended on Sunday 25 October 2026, a 25-hour day; late that evening, minus 24 h is still that Sunday
  const late = new Date(2026, 9, 25, 23, 30).getTime()
  expect(dayKey(late - 864e5)).toBe('2026-10-25')
  expect([0, 1, 2].map((d) => dayKey(daysBack(late, d)))).toEqual(['2026-10-25', '2026-10-24', '2026-10-23'])
  // and the 23-hour day in March
  const spring = new Date(2026, 2, 30, 0, 30).getTime()
  expect([0, 1, 2].map((d) => dayKey(daysBack(spring, d)))).toEqual(['2026-03-30', '2026-03-29', '2026-03-28'])
})

test('a minute before and after midnight land on different days', () => {
  const before = new Date(2026, 10, 21, 23, 59).getTime(), after = new Date(2026, 10, 22, 0, 0).getTime()
  expect(dayKey(before)).toBe('2026-11-21')
  expect(dayKey(after)).toBe('2026-11-22')
  const played = { '2026-11-21': { A: 90 }, '2026-11-22': { B: 10 } }
  expect(weekOf(played, after)).toEqual([{ d: 0, g: 'B', m: 10 }, { d: 1, g: 'A', m: 90 }])
  expect(weekOf(played, before)).toEqual([{ d: 0, g: 'A', m: 90 }])
})

test('fourteen days are shared, the oldest first to go', () => {
  const now = new Date(2026, 10, 22, 21).getTime()
  const played: Record<string, Record<string, number>> = {}
  for (let d = 0; d < 20; d++) played[dayKey(daysBack(now, d))] = { G: 30 }
  expect(weekOf(played, now).map((w) => w.d)).toEqual([...Array(PLAY_DAYS).keys()])
  prunePlayed(played, now)
  expect(Object.keys(played).sort()).toEqual([...Array(PLAY_DAYS).keys()].map((d) => dayKey(daysBack(now, d))).sort())
  expect(Object.keys(played)).not.toContain(dayKey(daysBack(now, PLAY_DAYS)))
})

test('the strength scale is fixed: none, under an hour, one to two, two to four, four or more', () => {
  expect([0, 1, 59, 60, 119, 120, 239, 240, 1440].map(playLevel)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4])
})

test("a friend's copy: 14 days at most, 3 games a day, no more than a day in a day, names cleaned", () => {
  expect(cleanWeek([{ d: 13, g: 'A', m: 30 }, { d: 14, g: 'B', m: 30 }, { d: -1, g: 'C', m: 30 }, { d: 1.5, g: 'D', m: 30 }])).toEqual([{ d: 13, g: 'A', m: 30 }])
  expect(cleanWeek([{ d: 0, g: 'A', m: 1 }, { d: 0, g: 'B', m: 1 }, { d: 0, g: 'C', m: 1 }, { d: 0, g: 'D', m: 1 }])).toHaveLength(3)
  expect(cleanWeek([{ d: 2, g: 'A', m: 1000 }, { d: 2, g: 'B', m: 1000 }])).toEqual([{ d: 2, g: 'A', m: 1000 }])
  expect(cleanWeek([{ d: 0, g: 'A', m: 0 }, { d: 0, g: 'B', m: 1441 }, { d: 0, g: 'C', m: '60' }])).toEqual([])
  expect(cleanWeek([{ d: 0, g: 'Half‮Life\u0007', m: 5 }, { d: 1, g: '​\u0000', m: 5 }])).toEqual([{ d: 0, g: 'HalfLife', m: 5 }])
  expect(cleanWeek([{ d: 0, g: 'x'.repeat(500), m: 5 }])[0].g).toHaveLength(100)
  expect(cleanWeek(Array.from({ length: 500 }, (_, i) => ({ d: i % 14, g: `G${i}`, m: 5 })))).toHaveLength(42)
  for (const junk of [null, 'week', 5, {}, [null, 'x', [1]]]) expect(cleanWeek(junk)).toEqual([])
})

test('shared but nothing played travels as an empty list; not shared, or an older copy, as none', () => {
  const now = Date.now()
  expect(shareable({ now, week: [] }, undefined)).toEqual({ now, week: [] })
  expect(shareable({ now, week: [] }, { games: false })).toEqual({ now })
  expect(shareable({ now, week: [{ d: 0, g: 'A', m: 5 }] }, { playtime: false })).toEqual({ now })
  expect(cleanActivity({ now, week: [] }, now)).toEqual({ now, week: [] })
  expect(cleanActivity({ now }, now)).toEqual({ now })
})

test('an older copy reading our two weeks still gets the last one', () => {
  // its cleanWeek, unchanged since 0.1.10: the first 21 entries, days 0 to 6
  const old = (w: any[]) => w.slice(0, 21).filter((x) => Number.isSafeInteger(x.d) && x.d >= 0 && x.d <= 6)
  const now = new Date(2026, 10, 22, 21).getTime()
  const played: Record<string, Record<string, number>> = {}
  for (let d = 0; d < PLAY_DAYS; d++) played[dayKey(daysBack(now, d))] = { A: 60, B: 30, C: 10 }
  expect(new Set(old(weekOf(played, now)).map((w) => w.d))).toEqual(new Set([0, 1, 2, 3, 4, 5, 6]))
})
