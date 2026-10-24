import DHT from 'hyperdht'
import { expect, test } from 'vitest'
import type { Group } from '../src/shared/protocol'
import { EDIT_AHEAD_MS, groupIdOf, mergeGroup, ownerOf, signAdd, signEdit, signLeft, signRemoved, validGroup } from '../src/shared/sync'

const people = (n: number) => Array.from({ length: n }, () => DHT.keyPair())
const hex = (kp: { publicKey: Buffer }) => kp.publicKey.toString('hex')

// A group made the way createGroup makes it: owner o, members added by o.
function made(o: ReturnType<typeof DHT.keyPair>, others: ReturnType<typeof DHT.keyPair>[]): Group {
  const nonce = 'ab'.repeat(16)
  const id = groupIdOf(hex(o), nonce)
  const look = { id, name: 'g', updatedAt: 1000 }
  const adds = Object.fromEntries(others.map((k) => [hex(k), signAdd(id, hex(k), o)]))
  return mergeGroup(undefined, { ...look, members: [hex(o), ...others.map(hex)], adds, owner: hex(o), nonce, edit: signEdit(look, o) })
}

test('a member counts only through signed adds that lead back to the owner', () => {
  const [o, m, x, y] = people(4)
  const g = made(o, [m])
  expect(validGroup(g)).toBe(true)
  expect(g.members).toEqual([hex(o), hex(m)].sort())
  // Listed with no proof, with a proof from someone outside, or two outsiders vouching for each other: not members
  expect(mergeGroup(g, { ...g, members: [...g.members, hex(x)] }).members).not.toContain(hex(x))
  expect(mergeGroup(g, { ...g, members: [...g.members, hex(x)], adds: { ...g.adds, [hex(x)]: signAdd(g.id, hex(x), y) } }).members).not.toContain(hex(x))
  const ring = { ...g, members: [...g.members, hex(x), hex(y)], adds: { ...g.adds, [hex(x)]: signAdd(g.id, hex(x), y), [hex(y)]: signAdd(g.id, hex(y), x) } }
  expect(mergeGroup(g, ring).members).toEqual(g.members)
  // A member adding someone is fine, and so is someone they added adding the next
  const byM = { ...g, members: [...g.members, hex(x)], adds: { ...g.adds, [hex(x)]: signAdd(g.id, hex(x), m) } }
  const byX = { ...byM, members: [...byM.members, hex(y)], adds: { ...byM.adds, [hex(y)]: signAdd(g.id, hex(y), x) } }
  expect(mergeGroup(g, byX).members).toEqual([hex(o), hex(m), hex(x), hex(y)].sort())
  // The same result whatever order copies meet in
  expect(mergeGroup(mergeGroup(g, ring), byX)).toEqual(mergeGroup(mergeGroup(g, byX), ring))
  expect(mergeGroup(byX, g)).toEqual(mergeGroup(g, byX))
  // The stored proofs lead back to the owner (never x and y vouching for each other), so a copy read afresh keeps them
  const both = mergeGroup(mergeGroup(g, byX), ring)
  expect(mergeGroup(undefined, both).members).toEqual(both.members)
})

test('nobody can claim to own a group someone else made', () => {
  const [o, m, x] = people(3)
  const g = made(o, [m])
  const claim = { ...g, owner: hex(x), nonce: 'cd'.repeat(16), members: [...g.members, hex(x)] }
  expect(ownerOf(g, claim)).toBe(hex(o))
  expect(mergeGroup(g, claim).members).not.toContain(hex(x))
  // Someone whose first copy is the made-up one cannot tell yet; the first honest copy proves the owner and drops x
  expect(ownerOf(undefined, claim)).toBe(null)
  expect(mergeGroup(mergeGroup(undefined, claim), g).members).toEqual(g.members)
})

test('only the owner can remove someone, for good, and those only they added go with them', () => {
  const [o, m, x, n] = people(4)
  const g = made(o, [m, n])
  const withX = mergeGroup(g, { ...g, members: [...g.members, hex(x)], adds: { ...g.adds, [hex(x)]: signAdd(g.id, hex(x), m) } })
  expect(withX.members).toContain(hex(x))
  const out = mergeGroup(withX, { ...withX, removed: { [hex(m)]: signRemoved(g.id, hex(m), o) } })
  expect(out.members).toEqual([hex(o), hex(n)].sort()) // m, and x whom only m added
  expect(mergeGroup(out, withX).members).toEqual(out.members) // an older copy cannot bring them back
  expect(mergeGroup(withX, { ...withX, removed: { [hex(n)]: signRemoved(g.id, hex(n), m) } }).members).toContain(hex(n)) // m is not the owner
  // The owner adds x again: back in
  const readd = { ...out, members: [...out.members, hex(x)], adds: { ...out.adds, [hex(x)]: signAdd(g.id, hex(x), o) } }
  expect(mergeGroup(out, readd).members).toContain(hex(x))
})

test('a leaver drops nobody they added', () => {
  const [o, m, x] = people(3)
  const g = made(o, [m])
  const withX = mergeGroup(g, { ...g, members: [...g.members, hex(x)], adds: { ...g.adds, [hex(x)]: signAdd(g.id, hex(x), m) } })
  const gone = mergeGroup(withX, { ...withX, left: { [hex(m)]: signLeft(g.id, m) } })
  expect(gone.members).toEqual([hex(o), hex(x)].sort())
})

test('names and pictures follow signed changes by members, and a far-future date cannot pin one', () => {
  const [o, m, x] = people(3)
  const g = made(o, [m])
  const rename = (by: typeof o, name: string, updatedAt: number) => ({ ...g, name, updatedAt, edit: signEdit({ id: g.id, name, updatedAt }, by) })
  expect(mergeGroup(g, { ...g, name: 'unsigned', updatedAt: 5000 }).name).toBe('g')
  expect(mergeGroup(g, rename(m, 'by m', 2000)).name).toBe('by m')
  expect(mergeGroup(g, rename(x, 'by outsider', 2000)).name).toBe('g')
  const now = 10_000
  expect(mergeGroup(g, rename(m, 'pinned', now + EDIT_AHEAD_MS + 1), now).name).toBe('g')
  expect(mergeGroup(mergeGroup(g, rename(m, 'by m', 2000)), rename(o, 'later', 3000)).name).toBe('later')
})

test('a group from before owners: the one member nobody added owns it, and unsigned additions stop counting', () => {
  const [o, m, x] = people(3)
  const id = 'ef'.repeat(16)
  const old: Group = { id, name: 'old', members: [hex(o), hex(m)].sort(), updatedAt: 1, adds: { [hex(m)]: signAdd(id, hex(m), o) } }
  expect(ownerOf(old)).toBe(hex(o))
  const kept = { ...old, owner: ownerOf(old)! } // recorded once on this computer (node.ts, on load)
  // Another copy lists x with no proof, and a made-up proof for o so o no longer looks unadded: o stays the owner
  const forged = { ...old, members: [...old.members, hex(x)], adds: { ...old.adds, [hex(o)]: signAdd(id, hex(o), x) } }
  expect(mergeGroup(kept, forged).members).toEqual(old.members)
  expect(mergeGroup(kept, forged).owner).toBe(hex(o))
})
