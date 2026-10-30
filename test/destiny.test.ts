import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { artUrl, cleanActivity, shareable } from '../src/shared/activity'
import { type Defs, cleanDestiny, destinyOf, neededDefs, shareableDestiny } from '../src/shared/destiny'

// A synthesized GetProfile response and the Manifest definitions it needs (also served by the smoke run's stand-in).
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'))
const profile = () => fixture('destiny-profile.json')
const all: Defs = fixture('destiny-defs.json')
const NOW = Date.parse('2026-10-30T15:00:00Z')

// What main/bungie.ts does: ask for what is missing, in rounds, then read the profile.
function resolve(p: any) {
  const defs: Defs = {}
  for (let round = 0; round < 3; round++) for (const k of neededDefs(p, defs)) defs[k] = all[k] ?? null
  return defs
}

test('a raid: the activity, the guardian in it, the fireteam and the loadout', () => {
  const p = profile()
  const defs = resolve(p)
  // Asked for only what the card shows: not the ghost (5007) or the other character's things
  expect(Object.keys(defs)).not.toContain('DestinyInventoryItemDefinition:5007')
  expect(Object.keys(defs)).toContain('DestinyPlaceDefinition:4001') // the second round, from the activity's own definition
  const d = destinyOf(p, defs, NOW)!
  expect(d.activity).toEqual({ name: "Salvation's Edge", mode: 'Raid', place: 'The Pale Heart, The Traveler', image: '/img/destiny_content/pgcr/europa-mission-knuckle.jpg', since: Date.parse('2026-10-30T14:40:00Z'), light: 1990 })
  expect(d.character).toEqual({ class: 'Warlock', light: 2010, emblem: `/common/destiny2_content/icons/${(1).toString(16).padStart(32, '0')}.jpg`, title: 'Rivensbane', rank: 7, session: 74 })
  expect(d.fireteam!.members.map((m) => m.name)).toEqual(['Ann', 'Osiris', 'Saint'])
  expect(d.fireteam!.members[2].emblem).toBeUndefined()
  expect([d.fireteam!.max, d.fireteam!.open]).toEqual([6, 3])
  expect(d.score).toBeUndefined() // a raid has none
  // Subclass, the three weapons, exotic armor only
  expect(d.loadout!.map((i) => [i.name, i.exotic])).toEqual([
    ['Prismatic', true],
    ['Ace of Spades', true],
    ['Fatebringer', false],
    ['Gjallarhorn', true],
    ['Necrotic Grip', true],
  ])
})

test('the Crucible with its score and playlist, orbit, and no character in an activity', () => {
  const pvp = profile()
  Object.assign(pvp.characterActivities.data['2305843009000000001'], { currentActivityHash: 2002, currentActivityModeHash: 3199098680, currentPlaylistActivityHash: 2003 })
  Object.assign(pvp.profileTransitoryData.data.currentActivity, { score: 87, highestOpposingFactionScore: 64, numberOfOpponents: 6 })
  const d = destinyOf(pvp, resolve(pvp), NOW)!
  expect(d.activity).toMatchObject({ name: 'Altar of Flame', mode: 'Control', playlist: 'Quickplay', place: 'Mercury', pvp: true })
  expect(d.activity!.light).toBeUndefined()
  expect(d.score).toEqual({ us: 87, them: 64 })
  const orbit = profile()
  orbit.characterActivities.data['2305843009000000001'].currentActivityHash = 82913930
  const o = destinyOf(orbit, resolve(orbit), NOW)!
  expect([o.orbit, o.activity]).toEqual([true, undefined])
  // Nobody in an activity: the character played last, nothing else
  const idle = profile()
  idle.characterActivities.data['2305843009000000001'].currentActivityHash = 0
  delete idle.profileTransitoryData
  const i = destinyOf(idle, resolve(idle), NOW)!
  expect(i.character!.class).toBe('Warlock')
  expect([i.activity, i.orbit, i.fireteam]).toEqual([undefined, undefined, undefined])
  expect(destinyOf({}, {}, NOW)).toBeNull()
  // A definition Bungie did not have leaves its part out instead of failing
  const d2 = destinyOf(profile(), {}, NOW)!
  expect([d2.activity, d2.loadout]).toEqual([undefined, undefined])
})

test('what is shared, each part on unless turned off, and a friend\'s details are checked and moved onto our clock', () => {
  const d = destinyOf(profile(), resolve(profile()), NOW)!
  expect(shareableDestiny(d, undefined)).toEqual(d)
  const some = shareableDestiny(d, { fireteam: false, loadout: false })
  expect([some.fireteam, some.loadout, !!some.activity, !!some.character]).toEqual([undefined, undefined, true, true])
  expect(shareableDestiny(d, { activity: false, character: false, fireteam: false, loadout: false })).toEqual({})
  const g = shareable({ now: 1, game: { name: 'Destiny 2', since: 0, source: 'steam', app: 1085660, destiny: d } }, { destiny: { loadout: false } }).game!
  expect(g.destiny!.loadout).toBeUndefined()

  const c = cleanDestiny(d, -10_000, NOW)!
  expect(c.activity!.since).toBe(d.activity!.since! - 10_000)
  expect({ ...c, activity: { ...c.activity, since: d.activity!.since } }).toEqual(d)
  const hostile = cleanDestiny(
    {
      activity: { name: 'x'.repeat(500), image: 'https://evil.example/a.jpg', since: NOW + 864e5 },
      character: { class: 'Wizard', light: 5 },
      fireteam: { members: [{ name: 'ok', emblem: '/common/destiny2_content/icons/../../x.jpg' }, { name: '' }, 42] },
      loadout: [{ name: 'Gun', icon: '/img/misc/x.png' }],
    },
    0,
    NOW,
  )!
  expect(hostile.activity).toEqual({ name: 'x'.repeat(100) })
  expect(hostile.character).toBeUndefined()
  expect(hostile.fireteam).toEqual({ members: [{ name: 'ok' }] })
  expect(hostile.loadout).toBeUndefined()
  const sent = { now: NOW, game: { name: 'Destiny 2', since: 0, source: 'steam', app: 1085660, destiny: d } }
  expect(cleanActivity(sent, NOW)!.game!.destiny!.activity!.name).toBe("Salvation's Edge")
  expect(cleanActivity({ ...sent, game: { ...sent.game, app: 570 } }, NOW)!.game!.destiny).toBeUndefined()
})

test('pictures only from Destiny\'s folders on bungie.net', () => {
  expect(artUrl('eleusinia-art://bungie/img/destiny_content/pgcr/raid_splinter.jpg')).toBe('https://www.bungie.net/img/destiny_content/pgcr/raid_splinter.jpg')
  expect(artUrl('eleusinia-art://bungie/common/destiny2_content/icons/DestinyActivityModeDefinition_f6de6d95.png')).toBe('https://www.bungie.net/common/destiny2_content/icons/DestinyActivityModeDefinition_f6de6d95.png')
  expect(artUrl('eleusinia-art://bungie/Platform/User/GetMembershipsForCurrentUser/')).toBeNull()
  expect(artUrl('eleusinia-art://bungie/common/destiny2_content/icons/../../x.jpg')).toBeNull()
  expect(artUrl('eleusinia-art://bungie//evil.example/common/destiny2_content/icons/a.jpg')).toBeNull()
})
