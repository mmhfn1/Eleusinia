// Destiny 2 through the Bungie.net API (docs/roadmap-activity.md, step 7): with the user's account linked
// (src/main/bungie.ts), their profile is read while the game runs and turned here into what a friend's card shows.
// Names and pictures come from Bungie's Manifest, one definition at a time (`neededDefs`, then `destinyOf`).

export type DestinyItem = { name: string; icon: string; kind: string; exotic: boolean }
export type Destiny = {
  orbit?: boolean // between activities
  activity?: {
    name: string // Altar of Flame, Salvation's Edge
    mode?: string // Control, Raid, Strike
    playlist?: string // the playlist it was picked from, when that names it better: Quickplay
    place?: string // destination and planet: "Cosmodrome, Earth"
    image?: string // its picture, a bungie.net path
    since?: number // started, unix ms (moved onto the receiver's clock)
    light?: number // recommended power
    pvp?: boolean
  }
  // emblem: the wide banner; rank: Guardian Rank; session: minutes this session; clan and tag: the clan's name and callsign
  character?: { class: string; light: number; emblem?: string; title?: string; rank?: number; session?: number; clan?: string; tag?: string }
  fireteam?: { members: { name: string; emblem?: string }[]; max?: number; open?: number }
  score?: { us: number; them: number }
  loadout?: DestinyItem[] // subclass, kinetic, energy, power weapons, then exotic armor
}

// What may be shared of it (ActivitySettings.destiny), each on unless turned off.
export type DestinySettings = { activity?: boolean; character?: boolean; fireteam?: boolean; loadout?: boolean }
export function shareableDestiny(d: Destiny, set: DestinySettings | undefined): Destiny {
  const out: Destiny = {}
  if (set?.activity !== false) {
    if (d.orbit) out.orbit = true
    if (d.activity) out.activity = d.activity
    if (d.score) out.score = d.score
  }
  if (set?.character !== false && d.character) out.character = d.character
  if (set?.fireteam !== false && d.fireteam) out.fireteam = d.fireteam
  if (set?.loadout !== false && d.loadout) out.loadout = d.loadout
  return out
}

// Pictures are bungie.net paths, only from Destiny's icon and activity picture folders (shared/activity.ts artUrl).
export const BUNGIE_PATH = /^\/(?:common\/destiny2_content\/icons|img\/destiny_content\/pgcr)\/[\w-]{1,120}\.(?:jpg|png)$/
const path = (v: unknown) => (typeof v === 'string' && BUNGIE_PATH.test(v) ? v : undefined)
const text = (v: unknown, max = 100) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined)
const num = (v: unknown, max = 1e6) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v) : undefined)

// Where equipped items sit (DestinyInventoryBucketDefinition hashes, stable across versions).
const SUBCLASS = 3284755031
const WEAPONS = [1498876634, 2465295065, 953998645] // kinetic, energy, power
const ARMOR = [3448274439, 3551918588, 14239492, 20886954, 1585787867] // helmet, gauntlets, chest, legs, class item
const CLASSES = ['Titan', 'Hunter', 'Warlock']

// The character in an activity now (the latest started), else the one played last.
function current(p: any): string | undefined {
  const acts = p?.characterActivities?.data ?? {}
  const playing = Object.entries(acts).filter(([, a]: any) => a?.currentActivityHash)
  if (playing.length) return playing.sort(([, a]: any, [, b]: any) => Date.parse(b.dateActivityStarted) - Date.parse(a.dateActivityStarted))[0][0]
  const chars = Object.values(p?.characters?.data ?? {}) as any[]
  return chars.sort((a, b) => Date.parse(b.dateLastPlayed) - Date.parse(a.dateLastPlayed))[0]?.characterId
}

// Definitions are keyed "<table>:<hash>", e.g. "DestinyActivityDefinition:82913930".
export type Defs = Record<string, any>
const key = (table: string, hash: unknown) => (typeof hash === 'number' && hash > 0 ? `${table}:${hash}` : null)

// The definitions destinyOf needs that are not known yet. Destinations and places come from the activity's own
// definition, so a second round asks for them once that has arrived.
export function neededDefs(p: any, defs: Defs): string[] {
  const id = current(p)
  if (!id) return []
  const act = p.characterActivities?.data?.[id]
  const char = p.characters?.data?.[id]
  const want = [
    key('DestinyActivityDefinition', act?.currentActivityHash),
    key('DestinyActivityDefinition', act?.currentPlaylistActivityHash),
    key('DestinyActivityModeDefinition', act?.currentActivityModeHash),
    key('DestinyRecordDefinition', char?.titleRecordHash),
    ...((p.characterEquipment?.data?.[id]?.items ?? []) as any[]).filter((i) => [SUBCLASS, ...WEAPONS, ...ARMOR].includes(i?.bucketHash)).map((i) => key('DestinyInventoryItemDefinition', i.itemHash)),
    ...((p.profileTransitoryData?.data?.partyMembers ?? []) as any[]).map((m) => key('DestinyInventoryItemDefinition', m?.emblemHash)),
  ]
  const a = defs[`DestinyActivityDefinition:${act?.currentActivityHash}`]
  if (a) want.push(key('DestinyDestinationDefinition', a.destinationHash), key('DestinyPlaceDefinition', a.placeHash))
  return [...new Set(want.filter((k): k is string => !!k && !(k in defs)))]
}

const nameOf = (def: any) => text(def?.displayProperties?.name)
const itemOf = (def: any): DestinyItem | null => {
  const name = nameOf(def)
  const icon = path(def?.displayProperties?.icon)
  return name && icon ? { name, icon, kind: text(def.itemTypeDisplayName, 40) ?? '', exotic: def.inventory?.tierType === 6 } : null
}

// A GetProfile response (components 100, 200, 204, 205, 1000) with its definitions. Null when there is no character.
export function destinyOf(p: any, defs: Defs, now = Date.now()): Destiny | null {
  const id = current(p)
  if (!id) return null
  const d: Destiny = {}
  const def = (table: string, hash: unknown) => defs[`${table}:${hash}`]
  const char = p.characters?.data?.[id]
  const act = p.characterActivities?.data?.[id]
  if (char) {
    const title = def('DestinyRecordDefinition', char.titleRecordHash)?.titleInfo
    d.character = {
      class: CLASSES[char.classType] ?? 'Guardian',
      light: num(char.light, 10000) ?? 0,
      ...(path(char.emblemBackgroundPath) && { emblem: char.emblemBackgroundPath }),
      ...(text(title?.titlesByGenderHash?.[char.genderHash] ?? title?.titlesByGender?.Male, 40) && { title: text(title.titlesByGenderHash?.[char.genderHash] ?? title.titlesByGender.Male, 40) }),
      ...(num(p.profile?.data?.currentGuardianRank, 100) && { rank: num(p.profile.data.currentGuardianRank, 100) }),
      ...(num(char.minutesPlayedThisSession, 100000) !== undefined && { session: num(char.minutesPlayedThisSession, 100000) }),
    }
  }
  const a = def('DestinyActivityDefinition', act?.currentActivityHash)
  if (act?.currentActivityHash && a) {
    const name = nameOf(a)
    // Orbit is an activity with no name
    if (!name) d.orbit = true
    else {
      const mode = def('DestinyActivityModeDefinition', act.currentActivityModeHash)
      const playlist = nameOf(def('DestinyActivityDefinition', act.currentPlaylistActivityHash))
      // The destination names the place well enough ("Savathûn's Throne World"); the planet only when there is none
      const place = [nameOf(def('DestinyDestinationDefinition', a.destinationHash)) ?? nameOf(def('DestinyPlaceDefinition', a.placeHash))].filter(Boolean)
      const since = Date.parse(act.dateActivityStarted)
      d.activity = {
        name,
        ...(nameOf(mode) && { mode: nameOf(mode) }),
        ...(playlist && playlist !== name && playlist !== nameOf(mode) && { playlist }),
        ...(place.length && { place: place.join(', ') }),
        ...((path(a.pgcrImage) ?? path(mode?.pgcrImage)) && { image: path(a.pgcrImage) ?? path(mode?.pgcrImage) }),
        ...(Number.isFinite(since) && since <= now && { since }),
        ...(num(a.activityLightLevel, 10000) && { light: num(a.activityLightLevel, 10000) }),
        ...(a.isPvP === true && { pvp: true }),
      }
    }
  }
  const t = p.profileTransitoryData?.data
  if (t) {
    const members = ((t.partyMembers ?? []) as any[]).flatMap((m) => {
      const name = text(m?.displayName, 40)
      const emblem = path(def('DestinyInventoryItemDefinition', m?.emblemHash)?.displayProperties?.icon)
      return name ? [{ name, ...(emblem && { emblem }) }] : []
    })
    const max = num(a?.matchmaking?.maxParty, 12)
    if (members.length) d.fireteam = { members: members.slice(0, 12), ...(max && { max }), ...(num(t.joinability?.openSlots, 12) !== undefined && { open: num(t.joinability.openSlots, 12) }) }
    const c = t.currentActivity
    // Us against them only means something against other players (a strike's score is not a match score)
    if (!d.orbit && c && (a?.isPvP === true || c.numberOfOpponents > 0)) d.score = { us: num(c.score) ?? 0, them: num(c.highestOpposingFactionScore) ?? 0 }
  }
  const items = ((p.characterEquipment?.data?.[id]?.items ?? []) as any[]).map((i) => ({ bucket: i?.bucketHash, item: itemOf(def('DestinyInventoryItemDefinition', i?.itemHash)) }))
  const pick = (buckets: number[], exoticOnly = false) =>
    buckets.flatMap((b) => items.filter((i) => i.bucket === b && i.item && (!exoticOnly || i.item.exotic)).map((i) => i.item!))
  const loadout = [...pick([SUBCLASS]), ...pick(WEAPONS), ...pick(ARMOR, true)]
  if (loadout.length) d.loadout = loadout
  return d
}

// A friend's Destiny 2 details: the same checks, plus the clock correction.
export function cleanDestiny(x: any, shift: number, now: number): Destiny | undefined {
  if (!x || typeof x !== 'object') return undefined
  const d: Destiny = {}
  if (x.orbit === true) d.orbit = true
  const a = x.activity
  const name = text(a?.name)
  if (name) {
    d.activity = { name }
    for (const k of ['mode', 'playlist', 'place'] as const) if (text(a[k])) d.activity[k] = text(a[k])
    if (path(a.image)) d.activity.image = a.image
    if (Number.isFinite(a.since) && a.since + shift <= now && a.since + shift > now - 864e5) d.activity.since = a.since + shift
    if (num(a.light, 10000)) d.activity.light = num(a.light, 10000)
    if (a.pvp === true) d.activity.pvp = true
  }
  const c = x.character
  if (c && typeof c === 'object' && CLASSES.concat('Guardian').includes(c.class)) {
    d.character = { class: c.class, light: num(c.light, 10000) ?? 0 }
    if (path(c.emblem)) d.character.emblem = c.emblem
    if (text(c.title, 40)) d.character.title = text(c.title, 40)
    if (num(c.rank, 100)) d.character.rank = num(c.rank, 100)
    if (num(c.session, 100000) !== undefined) d.character.session = num(c.session, 100000)
    if (text(c.clan, 60)) d.character.clan = text(c.clan, 60)
    if (text(c.tag, 8)) d.character.tag = text(c.tag, 8)
  }
  const f = x.fireteam
  if (f && Array.isArray(f.members)) {
    const members = f.members.slice(0, 12).flatMap((m: any) => (text(m?.name, 40) ? [{ name: text(m.name, 40)!, ...(path(m.emblem) && { emblem: m.emblem }) }] : []))
    if (members.length) d.fireteam = { members, ...(num(f.max, 12) && { max: num(f.max, 12) }), ...(num(f.open, 12) !== undefined && { open: num(f.open, 12) }) }
  }
  if (x.score && typeof x.score === 'object') d.score = { us: num(x.score.us) ?? 0, them: num(x.score.them) ?? 0 }
  if (Array.isArray(x.loadout)) {
    const items = x.loadout.slice(0, 12).flatMap((i: any) => (text(i?.name) && path(i.icon) ? [{ name: text(i.name)!, icon: i.icon, kind: text(i.kind, 40) ?? '', exotic: i.exotic === true }] : []))
    if (items.length) d.loadout = items
  }
  return d
}
