import { randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import DHT from 'hyperdht'
import createTestnet from 'hyperdht/testnet'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { createNode } from '../src/main/node'
import { type RelayLimits, createNet, relayKeyPair } from '../src/main/network'
import { CALL_VERSION, type Group, type Msg, cleanProfile, dmId, identicon, isHandle, keyTail, normHandle, stack, versionOf } from '../src/shared/protocol'
import { mergeGroup, missing, signAdd, signLeft, signMsg, validGroup, verifyAdd, verifyMsg } from '../src/shared/sync'

test('a tampered or re-attributed message fails verification', () => {
  const a = DHT.keyPair()
  const b = DHT.keyPair()
  const m = signMsg({ conv: 'c', author: a.publicKey.toString('hex'), seq: 1, ts: 1, text: 'hi' }, a.secretKey)
  expect(verifyMsg(m)).toBe(true)
  expect(verifyMsg({ ...m, text: 'bye' })).toBe(false)
  expect(verifyMsg({ ...m, author: b.publicKey.toString('hex') })).toBe(false)
})

test('missing returns only what the peer lacks', () => {
  const log = [1, 2, 3].map((seq) => ({ conv: 'c', author: 'x', seq, ts: 0, text: '', sig: '' }))
  expect(missing(log, { x: 2 }).map((m) => m.seq)).toEqual([3])
  expect(missing(log, {}).length).toBe(3)
})

test('group merge converges whichever side merges first', () => {
  const a: Group = { id: 'g', name: 'old', members: ['a', 'b'], updatedAt: 1 }
  const b: Group = { id: 'g', name: 'new', members: ['a', 'c'], updatedAt: 2 }
  expect(mergeGroup(a, b)).toEqual(mergeGroup(b, a))
  expect(mergeGroup(a, b)).toEqual({ id: 'g', name: 'new', members: ['a', 'b', 'c'], updatedAt: 2, adds: {}, left: {} })
})

test('a group invite only verifies for the member and group it was signed for', () => {
  const kp = DHT.keyPair()
  const add = signAdd('g1', 'bob', kp)
  expect(verifyAdd('g1', 'bob', add)).toBe(true)
  expect(verifyAdd('g1', 'eve', add)).toBe(false)
  expect(verifyAdd('g2', 'bob', add)).toBe(false)
  expect(verifyAdd('g1', 'bob', { ...add, by: DHT.keyPair().publicKey.toString('hex') })).toBe(false)
})

test('profiles from peers are capped and unsafe pictures dropped', () => {
  const png = 'data:image/png;base64,AAAA'
  expect(cleanProfile({ name: ' Ann ', about: 5, avatar: png })).toEqual({ handle: '', name: 'Ann', about: '', avatar: png })
  expect(cleanProfile({ name: 'x'.repeat(99), avatar: 'data:image/svg+xml;base64,AAAA' })).toEqual({ handle: '', name: 'x'.repeat(40), about: '', avatar: '' })
  expect(cleanProfile({ name: 'a', avatar: 'https://example.com/a.png' }).avatar).toBe('')
  expect(cleanProfile(null)).toEqual({ handle: '', name: '', about: '', avatar: '' })
  expect(cleanProfile({ handle: 'ann#0042' }).handle).toBe('ann#0042')
  expect(cleanProfile({ handle: '<b>ann</b>#1' }).handle).toBe('')
})

test('friend IDs are username#1234 and forgiving to type', () => {
  expect(isHandle('ann_b.1#0042')).toBe(true)
  expect(isHandle('ann#42')).toBe(false)
  expect(isHandle('a#1234')).toBe(false)
  expect(isHandle('Ann#1234')).toBe(false)
  expect(normHandle(' Ann #1234 ')).toBe('ann#1234')
})

test('generated pictures are stable, mirrored and differ between keys', () => {
  const [k1, k2] = [DHT.keyPair(), DHT.keyPair()].map((k) => k.publicKey.toString('hex'))
  expect(identicon(k1)).toEqual(identicon(k1))
  expect(identicon(k1)).not.toEqual(identicon(k2))
  const { cells, hue } = identicon(k1)
  expect(cells).toHaveLength(25)
  for (let row = 0; row < 5; row++) expect(cells[row * 5]).toBe(cells[row * 5 + 4])
  expect(hue).toBeGreaterThanOrEqual(0)
  expect(hue).toBeLessThanOrEqual(360)
  expect(keyTail('ab'.repeat(29) + 'a3f9c2')).toBe('A3F9C2')
})

// Three real nodes on a local DHT: friends, direct chat, offline delivery, groups.
let testnet: any
const nodes: { node: ReturnType<typeof createNode> }[] = []
function start(dir = mkdtempSync(join(tmpdir(), 'eleusinia-')), keyPair = DHT.keyPair(), diag?: (area: string, text: string) => void) {
  const node = createNode({ dir, keyPair, emit: () => {}, dht: { bootstrap: testnet.bootstrap }, redialMs: 300, diag })
  const n = { node, dir, keyPair, key: keyPair.publicKey.toString('hex') as string }
  nodes.push(n)
  return n
}
const until = (ok: () => boolean) => expect.poll(ok, { timeout: 20000, interval: 100 }).toBe(true)
const texts = (n: { node: any }, conv: string) => n.node.history(conv).msgs.map((m: any) => m.text)

beforeAll(async () => {
  testnet = await createTestnet(10)
})
afterAll(async () => {
  await Promise.all(nodes.map((n) => n.node.destroy()))
  await testnet.destroy()
})

test('friends, chat, offline delivery and groups end to end', async () => {
  const a = start()
  let b = start()
  const c = start()
  await a.node.setProfile({ username: 'ann', name: 'Ann', about: 'hi there', avatar: '' })
  await Promise.all([named(b), named(c)])

  // A stranger cannot message before being accepted
  a.node.addFriend(b.key)
  await until(() => b.node.state().friends[a.key] === 'incoming')
  expect(b.node.state().profiles[a.key]).toEqual({ handle: a.node.state().profile.handle, name: 'Ann', about: 'hi there', avatar: '' })
  expect(() => a.node.send(dmId(a.key, b.key), 'too early')).toThrow()

  b.node.addFriend(a.key) // accept
  await until(() => a.node.state().friends[b.key] === 'friend' && a.node.state().online.includes(b.key))

  const dm = dmId(a.key, b.key)
  a.node.send(dm, 'hello')
  await until(() => texts(b, dm).includes('hello'))
  await until(() => a.node.history(dm).acked === 1)

  // Recipient offline: message stays pending, then arrives when they return
  await b.node.destroy()
  await until(() => !a.node.state().online.includes(b.key))
  a.node.send(dm, 'while you were out')
  expect(a.node.history(dm).acked).toBe(1)
  b = start(b.dir, b.keyPair)
  await until(() => texts(b, dm).includes('while you were out'))
  await until(() => a.node.history(dm).acked === 2)

  // Group: B and C are not friends with each other but can talk in A's group
  a.node.addFriend(c.key)
  await until(() => c.node.state().friends[a.key] === 'incoming')
  c.node.addFriend(a.key)
  await until(() => a.node.state().friends[c.key] === 'friend')
  const gid = a.node.createGroup('trio', [b.key, c.key])
  await until(() => !!b.node.state().groups[gid] && !!c.node.state().groups[gid])
  c.node.send(gid, 'from c')
  await until(() => texts(b, gid).includes('from c') && texts(a, gid).includes('from c'))
  expect(b.node.state().friends[c.key]).not.toBe('friend')

  // Author goes offline; a member who was away catches up from another member
  await b.node.destroy()
  await until(() => !c.node.state().online.includes(b.key))
  c.node.send(gid, 'b missed this')
  await until(() => texts(a, gid).includes('b missed this'))
  await c.node.destroy()
  b = start(b.dir, b.keyPair)
  await until(() => texts(b, gid).includes('b missed this'))
}, 120000)

type N = { node: ReturnType<typeof createNode>; dir: string; keyPair: any; key: string }
// Strangers cannot link, so a request travels through the DHT, which needs a profile, as every real user has.
const named = async (n: N) => {
  if (!n.node.state().profile.handle) await n.node.setProfile({ username: 'u' + n.key.slice(0, 6), name: 'U' })
}
async function befriend(x: N, y: N) {
  await Promise.all([named(x), named(y)])
  x.node.addFriend(y.key)
  await until(() => y.node.state().friends[x.key] === 'incoming')
  y.node.addFriend(x.key)
  await until(() => x.node.state().friends[y.key] === 'friend' && x.node.state().online.includes(y.key))
}
const restart = (n: N) => start(n.dir, n.keyPair)

test('a direct message survives the sender restarting before the recipient returns', async () => {
  let a = start()
  let b = start()
  await befriend(a, b)
  const dm = dmId(a.key, b.key)
  await b.node.destroy()
  a.node.send(dm, 'one')
  a.node.send(dm, 'two')
  await a.node.destroy()
  a = restart(a)
  expect(a.node.history(dm).acked).toBe(0)
  b = restart(b)
  await until(() => texts(b, dm).join() === 'one,two')
  await until(() => a.node.history(dm).acked === 2)
  b.node.send(dm, 'got them')
  await until(() => texts(a, dm).includes('got them'))
}, 120000)

test('a member offline since before the group existed gets it from a friend, then its messages from a member who is not', async () => {
  // This passes locally but has failed on the GitHub runner: the network diagnostics of B and C are printed if it does
  const events: string[] = []
  const t0 = Date.now()
  const log = (who: string) => (_area: string, text: string) => events.push(`${((Date.now() - t0) / 1000).toFixed(1)} ${who} ${text}`)
  let a = start()
  let b = start(undefined, undefined, log('B'))
  const c = start(undefined, undefined, log('C'))
  await befriend(a, b)
  await befriend(a, c)
  await b.node.destroy()

  const gid = a.node.createGroup('late', [b.key, c.key])
  a.node.send(gid, 'welcome')
  await until(() => texts(c, gid).includes('welcome'))
  await a.node.destroy()
  c.node.send(gid, 'c here')

  // Only C is online, and B has never met C: C cannot link to B (strangers are turned away) until B knows the group
  b = start(b.dir, b.keyPair, log('B'))
  await new Promise((r) => setTimeout(r, 2000))
  expect(b.node.state().groups[gid]).toBeUndefined()
  a = restart(a) // B's friend hands it over, with proof that A added B
  await until(() => !!b.node.state().groups[gid])
  await a.node.destroy()
  events.push(`${((Date.now() - t0) / 1000).toFixed(1)} -- B has the group; A is gone; B: ${b.key.slice(-6)}, C: ${c.key.slice(-6)}`)
  try {
    await until(() => texts(b, gid).join() === 'welcome,c here') // 'c here' only C has
  } catch (e) {
    console.log(`B holds ${JSON.stringify(texts(b, gid))}, B online: ${b.node.state().online.map((k: string) => k.slice(-6))}, C online: ${c.node.state().online.map((k: string) => k.slice(-6))}
${events.slice(-80).join(String.fromCharCode(10))}`)
    throw e
  }
  expect(b.node.state().friends[c.key]).toBeUndefined()

  // And back the other way: B writes while the group's creator is away
  b.node.send(gid, 'thanks')
  await until(() => texts(c, gid).includes('thanks'))
  await c.node.destroy()
  a = restart(a)
  await until(() => texts(a, gid).join() === 'welcome,c here,thanks')
}, 120000)

const PNG = 'data:image/png;base64,AAAA'

test('setup assigns username#1234; search shows a stranger from their published card and adds only the one picked', async () => {
  const a = start()
  const b = start()
  await expect(b.node.setProfile({ username: 'no spaces!', name: 'Bob' })).rejects.toThrow(/Usernames/)
  await b.node.setProfile({ username: 'Bob', name: 'Bobby', about: 'hello', avatar: PNG })
  await a.node.setProfile({ username: 'ann', name: 'Ann' })
  const id = b.node.state().profile.handle
  expect(id).toMatch(/^bob#\d{4}$/)

  // Editing the profile later keeps the same ID, whatever the form sends
  await b.node.setProfile({ username: 'other', handle: 'evil#0000', name: 'Bob', about: 'hello', avatar: PNG })
  expect(b.node.state().profile).toMatchObject({ handle: id, name: 'Bob' })

  const found = await a.node.findFriend(' ' + id.toUpperCase() + ' ')
  // Strangers cannot link, so the card comes from the DHT record: no picture until they are friends
  expect(found).toEqual([{ key: b.key, linked: false, profile: { handle: id, name: 'Bob', about: 'hello', avatar: '' } }])
  // Searching alone asks nothing of the other person
  expect(a.node.state().friends).toEqual({})
  expect(b.node.state().friends).toEqual({})

  a.node.addFriend(found[0].key, found[0].profile)
  expect(a.node.state().friends[b.key]).toBe('outgoing')
  expect(a.node.state().profiles[b.key].name).toBe('Bob')
  await until(() => b.node.state().friends[a.key] === 'incoming')
  b.node.addFriend(a.key)
  await until(() => a.node.state().friends[b.key] === 'friend')

  expect(await a.node.findFriend('nobody#0000')).toEqual([])
  expect(await a.node.findFriend('nope')).toEqual([])
  expect(await a.node.findFriend(a.node.state().profile.handle)).toEqual([])
  expect(() => a.node.addFriend(a.key)).toThrow()
  expect(() => a.node.addFriend('bob#1234')).toThrow()
}, 120000)

test('two people with the same ID are both listed and only the chosen one gets the request', async () => {
  const a = start()
  const b = start()
  await b.node.setProfile({ username: 'twin', name: 'B' })
  // Force the clash a 1-in-10000 roll (or an impostor) would produce: C takes B's exact ID.
  const id = b.node.state().profile.handle
  const { writeFileSync } = await import('node:fs')
  const dir = mkdtempSync(join(tmpdir(), 'eleusinia-'))
  writeFileSync(join(dir, 'state.json'), JSON.stringify({ profile: { handle: id, name: 'C', about: '', avatar: '' } }))
  const c = start(dir)
  await c.node.ready

  const found = await a.node.findFriend(id)
  expect(found.map((f) => f.key).sort()).toEqual([b.key, c.key].sort())
  expect(found.find((f) => f.key === c.key)!.profile.name).toBe('C')
  expect(keyTail(b.key)).not.toBe(keyTail(c.key))

  a.node.addFriend(c.key, found.find((f) => f.key === c.key)!.profile)
  await until(() => c.node.state().friends[a.key] === 'incoming')
  expect(b.node.state().friends).toEqual({})
}, 120000)

test('a request rings at once and accepting is immediate, with the real 30 s checks, while a stranger still cannot link', async () => {
  const real = () => {
    const dir = mkdtempSync(join(tmpdir(), 'eleusinia-'))
    const keyPair = DHT.keyPair()
    const node = createNode({ dir, keyPair, emit: () => {}, dht: { bootstrap: testnet.bootstrap }, redialMs: 15000 })
    const n = { node, dir, keyPair, key: keyPair.publicKey.toString('hex') as string }
    nodes.push(n)
    return n
  }
  const a = real()
  const b = real()
  await Promise.all([named(a), named(b)])
  await new Promise((r) => setTimeout(r, 1000)) // past the startup check, so only the knock can find it in time
  let t = Date.now()
  a.node.addFriend(b.key)
  await expect.poll(() => b.node.state().friends[a.key], { timeout: 8000, interval: 50 }).toBe('incoming')
  const rang = Date.now() - t
  expect(b.node.state().online).not.toContain(a.key) // the knock was turned away
  t = Date.now()
  b.node.addFriend(a.key)
  await expect.poll(() => a.node.state().friends[b.key] === 'friend' && a.node.state().online.includes(b.key), { timeout: 8000, interval: 50 }).toBe(true)
  const accepted = Date.now() - t
  console.log(`request arrived in ${rang} ms, acceptance in ${accepted} ms`)
}, 60000)

test('a stranger sees our picture in search and requests, as a small thumbnail, without linking', async () => {
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]) // stands in for nativeImage's JPEG
  const dir = mkdtempSync(join(tmpdir(), 'eleusinia-'))
  const keyPair = DHT.keyPair()
  const node = createNode({ dir, keyPair, emit: () => {}, dht: { bootstrap: testnet.bootstrap }, redialMs: 300, thumbnail: () => jpeg })
  const b = { node, dir, keyPair, key: keyPair.publicKey.toString('hex') as string }
  nodes.push(b)
  const a = start()
  await named(a)
  await b.node.setProfile({ username: 'pictured', name: 'Pic', about: 'x'.repeat(200), avatar: PNG })
  const found = await a.node.findFriend(b.node.state().profile.handle)
  expect(found).toHaveLength(1)
  expect(found[0].linked).toBe(false)
  expect(found[0].profile.avatar).toBe('data:image/jpeg;base64,' + jpeg.toString('base64'))
  b.node.addFriend(a.key)
  await until(() => a.node.state().friends[b.key] === 'incoming')
  expect(a.node.state().profiles[b.key].avatar).toBe('data:image/jpeg;base64,' + jpeg.toString('base64'))
}, 120000)

test('someone watching the request topic of a person sees one-off keys, never who is asking', async () => {
  const a = start()
  const b = start()
  await Promise.all([named(a), named(b)])
  a.node.addFriend(b.key)
  await until(() => b.node.state().friends[a.key] === 'incoming')
  const watcher = createNet(DHT.keyPair(), { open() {}, close() {}, msg() {} }, { bootstrap: testnet.bootstrap })
  const { createHash } = await import('node:crypto')
  const seen = await watcher.lookup(createHash('sha256').update('eleusinia-request:' + b.key).digest())
  expect(seen.length).toBeGreaterThan(0)
  expect(seen).not.toContain(a.key)
  await watcher.destroy()
}, 120000)

test('a stranger cannot link at all, so cannot learn our address, ask for our card or push one on us', async () => {
  const a = start()
  await a.node.setProfile({ username: 'ann', name: 'Ann' })
  let opened = false
  const raw = createNet(
    DHT.keyPair(),
    {
      open(k) {
        opened = true
        raw.send(k, { t: 'card', handle: 'evil#0000', name: 'Evil', about: '', avatar: '' })
        raw.send(k, { t: 'who' })
      },
      close() {},
      msg() {},
    },
    { bootstrap: testnet.bootstrap },
  )
  raw.dial(a.key)
  await new Promise((r) => setTimeout(r, 5000))
  expect(opened).toBe(false)
  expect(a.node.state().friends).toEqual({})
  expect(a.node.state().profiles).toEqual({})
  await raw.destroy()
}, 120000)

test('a friend request between people already in a group together arrives as a request, not as a friendship', async () => {
  // Giri and Enane share a group (made by rkZ) but are not friends: their apps are already linked and greet each other.
  const rkz = start()
  const giri = start()
  const enane = start()
  await befriend(rkz, giri)
  await befriend(rkz, enane)
  const gid = rkz.node.createGroup('Meh', [giri.key, enane.key])
  await until(() => !!giri.node.state().groups[gid] && !!enane.node.state().groups[gid])
  await until(() => giri.node.state().online.includes(enane.key) && enane.node.state().online.includes(giri.key))

  giri.node.addFriend(enane.key)
  await until(() => enane.node.state().friends[giri.key] === 'incoming') // Enane sees the request
  await new Promise((r) => setTimeout(r, 1000))
  expect(giri.node.state().friends[enane.key]).toBe('outgoing') // a group hello is not an acceptance
  expect(() => giri.node.send(dmId(giri.key, enane.key), 'too early')).toThrow()

  enane.node.addFriend(giri.key) // accept
  await until(() => giri.node.state().friends[enane.key] === 'friend')
  const dm = dmId(giri.key, enane.key)
  giri.node.send(dm, 'hello Enane')
  enane.node.send(dm, 'hello Giri')
  await until(() => texts(enane, dm).includes('hello Enane') && texts(giri, dm).includes('hello Giri'))
  await until(() => giri.node.history(dm).acked === 1 && enane.node.history(dm).acked === 1) // delivered, not pending
}, 120000)

test('when both send a request at once they become friends, and both can message straight away', async () => {
  const a = start()
  const b = start()
  a.node.addFriend(b.key)
  b.node.addFriend(a.key)
  await until(() => a.node.state().friends[b.key] === 'friend' && b.node.state().friends[a.key] === 'friend')
  const dm = dmId(a.key, b.key)
  a.node.send(dm, 'hi')
  await until(() => texts(b, dm).includes('hi') && a.node.history(dm).acked === 1)
}, 120000)

test('removing a friend who shares a group puts them back to a request, so neither side sends into a void', async () => {
  const c = start()
  const a = start()
  const b = start()
  await befriend(c, a)
  await befriend(c, b)
  await befriend(a, b)
  const gid = c.node.createGroup('G', [a.key, b.key])
  await until(() => !!a.node.state().groups[gid] && !!b.node.state().groups[gid])
  b.node.removeFriend(a.key)
  await until(() => a.node.state().friends[b.key] === 'outgoing')
  expect(b.node.state().friends[a.key]).toBeUndefined()
}, 120000)

test('one person in several groups: each group keeps its own members and messages', async () => {
  const a = start()
  const b = start()
  const c = start()
  await befriend(a, b)
  await befriend(a, c)
  const g1 = a.node.createGroup('with b', [b.key])
  const g2 = a.node.createGroup('with c', [c.key])
  await until(() => !!b.node.state().groups[g1] && !!c.node.state().groups[g2])
  a.node.send(g1, 'for b')
  a.node.send(g2, 'for c')
  await until(() => texts(b, g1).includes('for b') && texts(c, g2).includes('for c'))
  expect(Object.keys(a.node.state().groups).sort()).toEqual([g1, g2].sort())
  expect(Object.keys(a.node.state().friends)).toHaveLength(2)
  expect(b.node.state().groups[g2]).toBeUndefined()
  expect(c.node.state().groups[g1]).toBeUndefined()
  expect(texts(b, g2)).toEqual([])
}, 120000)

test('suggestions, for those who turn them on, start at 4 letters of a username and narrow as more is typed', async () => {
  const a = start()
  const b = start()
  const c = start()
  const d = start()
  for (const n of [b, c]) await n.node.setSettings({ suggest: true })
  await d.node.setProfile({ username: 'bobbin', name: 'Hidden' }) // suggestions off: found only by exact ID
  await b.node.setProfile({ username: 'bobby', name: 'Bob', about: '', avatar: PNG })
  await c.node.setProfile({ username: 'bobcat', name: 'Cat' })
  await a.node.setProfile({ username: 'ann_x', name: 'Ann' })
  const keys = async (q: string) => (await a.node.findFriend(q)).map((f) => f.key).sort()

  expect(await keys('bob')).toEqual([]) // under 4 letters: no search at all
  expect(await keys('Bobb')).toEqual([b.key])
  const both = await a.node.findFriend('bobc')
  expect(both.map((f) => f.key)).toEqual([c.key])
  expect(both[0].profile).toMatchObject({ name: 'Cat', handle: c.node.state().profile.handle })
  expect(await keys('bobby#')).toEqual([b.key])
  expect(await keys(b.node.state().profile.handle.slice(0, 8))).toEqual([b.key])
  expect(await keys('zzzz')).toEqual([])
  expect(await keys('bobbi')).toEqual([])
  expect(await keys(d.node.state().profile.handle)).toEqual([d.key])
  // Searching sends no friend request
  expect(b.node.state().friends).toEqual({})
}, 120000)

test('messages are shown in time order, stacked per person while each follows the last within 5 minutes', () => {
  const at = (author: string, ts: number, seq: number): Msg => ({ conv: 'c', author, seq, ts, text: author + seq, sig: '' })
  const min = 60000
  // Arrival order differs from time order; equal times keep arrival order
  const shown = stack([at('b', 3 * min, 1), at('a', 0, 1), at('a', min, 2), at('b', 3 * min, 2), at('b', 9 * min, 3), at('a', 9 * min, 3)])
  expect(shown.map(({ m, first }) => (first ? '+' : '') + m.text)).toEqual(['+a1', 'a2', '+b1', 'b2', '+b3', '+a3'])
})

test('upload is measured by sending filler to a call member, who answers only within a sane amount', async () => {
  const a = start()
  const b = start()
  await befriend(a, b)
  const kbps = await a.node.probe(b.key)
  expect(kbps).toBeGreaterThan(1000) // a local test network is fast
  expect(await a.node.probe('ff'.repeat(32))).toBe(null) // not someone we know
  for (let i = 0; i < 3; i++) expect(await a.node.probe(b.key)).toBeGreaterThan(0) // 4 measurements a minute are fine
  expect(await a.node.probe(b.key)).toBe(null) // past 4 MB a minute they stop answering
}, 120000)

test('the network ping gives a round trip in ms', async () => {
  const ms = await start().node.ping()
  expect(ms).toBeGreaterThanOrEqual(0)
  expect(ms).toBeLessThan(5000)
}, 60000)

test('call packets cross the peer link through the relay, both small and large', async () => {
  const dgram = await import('node:dgram')
  const a = start()
  const b = start()
  const stranger = start()
  await befriend(a, b)
  expect(await stranger.node.relayOpen(a.key)).toBeNull() // only for people we know
  const ra = (await a.node.relayOpen(b.key))!
  const rb = (await b.node.relayOpen(a.key))!
  // Stand-ins for each side's WebRTC stack
  const udp = async (ip: string) => {
    const s = dgram.createSocket('udp4')
    await new Promise<void>((r) => s.bind(0, ip, r))
    return s
  }
  const [pa, pb] = await Promise.all([udp(ra.ip), udp(rb.ip)])
  const got: { text: string; from: number }[] = []
  pb.on('message', (m, r) => got.push({ text: m.toString(), from: r.port }))
  pb.send('register', rb.port, rb.ip) // B's relay learns where B's stack is from its first packet
  const big = 'x'.repeat(1500) // over the datagram size: goes over the reliable stream
  await until(() => {
    pa.send('ping', ra.port, ra.ip)
    pa.send(big, ra.port, ra.ip)
    return got.some((g) => g.text === 'ping') && got.some((g) => g.text === big)
  })
  expect(got.every((g) => g.from === rb.port)).toBe(true) // seen as coming from the relay port, like a relay candidate
  pa.close()
  pb.close()
  a.node.relayClose(b.key)
  b.node.relayClose(a.key)
}, 120000)

test('only the member themselves can sign their leaving, and a merge drops them for good', () => {
  const [a, b] = [DHT.keyPair(), DHT.keyPair()]
  const [ka, kb] = [a.publicKey.toString('hex'), b.publicKey.toString('hex')]
  const id = 'ab'.repeat(16)
  const g: Group = { id, name: 'g', members: [ka, kb].sort(), updatedAt: 1, adds: {} }
  const left = { ...g, left: { [ka]: signLeft(id, a) } }
  expect(validGroup(left)).toBe(true)
  expect(validGroup({ ...g, left: { [ka]: signLeft(id, b) } })).toBe(false) // B cannot remove A
  expect(validGroup({ ...g, left: { [ka]: signLeft('cd'.repeat(16), a) } })).toBe(false) // nor reuse another group's notice
  // Whichever order the copies meet in, A is gone, even from a copy that still lists A
  expect(mergeGroup(g, left).members).toEqual([kb])
  expect(mergeGroup(left, g).members).toEqual([kb])
  expect(mergeGroup(mergeGroup(left, g), { ...g, updatedAt: 9 }).members).toEqual([kb])
})

test('leaving a group: others learn it, even one who was offline, and the leaver keeps none of it', async () => {
  const a = start()
  const b = start()
  let c = start()
  await befriend(a, b)
  await befriend(a, c)
  const gid = a.node.createGroup('club', [b.key, c.key])
  await until(() => !!b.node.state().groups[gid] && !!c.node.state().groups[gid])
  a.node.send(gid, 'hello all')
  await until(() => texts(b, gid).includes('hello all') && texts(c, gid).includes('hello all'))
  await c.node.destroy()

  b.node.leaveGroup(gid)
  expect(b.node.state().groups[gid]).toBeUndefined()
  expect(b.node.history(gid).msgs).toEqual([])
  expect(() => b.node.send(gid, 'still here?')).toThrow()
  await until(() => a.node.state().groups[gid]?.members.length === 2 && !a.node.state().groups[gid].members.includes(b.key))

  // C was offline when B left; A tells C when C returns
  c = start(c.dir, c.keyPair)
  await until(() => !!c.node.state().groups[gid] && !c.node.state().groups[gid].members.includes(b.key))
  // Messages to the group no longer reach B, and B cannot be added back
  a.node.send(gid, 'after b left')
  await until(() => texts(c, gid).includes('after b left'))
  expect(b.node.history(gid).msgs).toEqual([])
  a.node.addToGroup(gid, b.key)
  await new Promise((r) => setTimeout(r, 1000))
  expect(a.node.state().groups[gid].members).not.toContain(b.key)
  expect(b.node.state().groups[gid]).toBeUndefined()
}, 120000)

test('a stolen key gets no old history: what a peer confirmed is never sent to it again', async () => {
  const a = start()
  let b = start()
  const c = start()
  await befriend(a, b)
  await befriend(a, c)
  await befriend(b, c)
  const dm = dmId(a.key, b.key)
  const gid = a.node.createGroup('trio', [b.key, c.key])
  await until(() => !!b.node.state().groups[gid] && !!c.node.state().groups[gid])
  a.node.send(dm, 'old secret')
  a.node.send(gid, 'old group secret')
  await until(() => texts(b, dm).includes('old secret') && texts(b, gid).includes('old group secret'))
  await new Promise((r) => setTimeout(r, 6000)) // B's receipts reach A and C
  // Someone with B's key and B's friends and groups (state.json), but none of B's messages
  const keyPair = b.keyPair
  await b.node.destroy()
  const stolen = mkdtempSync(join(tmpdir(), 'eleusinia-'))
  writeFileSync(join(stolen, 'state.json'), readFileSync(join(b.dir, 'state.json')))
  b = start(stolen, keyPair)
  await until(() => b.node.state().online.includes(a.key) && b.node.state().online.includes(c.key))
  await new Promise((r) => setTimeout(r, 3000))
  expect(texts(b, dm)).toEqual([])
  expect(texts(b, gid)).toEqual([])
  // Messages sent from now on still arrive: only what was already confirmed is held back
  a.node.send(dm, 'new')
  c.node.send(gid, 'new in group')
  await until(() => texts(b, dm).includes('new') && texts(b, gid).includes('new in group'))
  expect(texts(b, dm)).toEqual(['new'])
}, 120000)

test('the owner removes a member: everyone learns it, the removed member loses the group and is heard no more', async () => {
  const a = start()
  const b = start()
  const c = start()
  await befriend(a, b)
  await befriend(a, c)
  const gid = a.node.createGroup('club', [b.key, c.key])
  await until(() => !!b.node.state().groups[gid] && !!c.node.state().groups[gid])
  expect(b.node.state().groups[gid].owner).toBe(a.key)
  b.node.removeFromGroup(gid, c.key) // not the owner: nothing happens
  await new Promise((r) => setTimeout(r, 500))
  expect(a.node.state().groups[gid].members).toContain(c.key)

  a.node.removeFromGroup(gid, c.key)
  await until(() => !b.node.state().groups[gid].members.includes(c.key) && !c.node.state().groups[gid])
  expect(() => c.node.send(gid, 'still here?')).toThrow()
  a.node.send(gid, 'without c')
  await until(() => texts(b, gid).includes('without c'))
  expect(texts(c, gid)).not.toContain('without c')
  a.node.addToGroup(gid, c.key) // removal is for good
  await new Promise((r) => setTimeout(r, 500))
  expect(a.node.state().groups[gid].members).not.toContain(c.key)
}, 120000)

test('deleting an account erases it from this computer, leaves its groups and tells online friends', async () => {
  const a = start()
  const b = start()
  await befriend(a, b)
  const gid = a.node.createGroup('pair', [b.key])
  await until(() => !!b.node.state().groups[gid])
  a.node.send(dmId(a.key, b.key), 'bye soon')
  await until(() => texts(b, dmId(a.key, b.key)).includes('bye soon'))
  const { writeFileSync } = await import('node:fs')
  writeFileSync(join(a.dir, 'identity.json'), '{}') // stands in for the identity file Electron's main process writes

  await a.node.deleteAccount()
  for (const f of ['state.json', 'identity.json', 'msgs']) expect(existsSync(join(a.dir, f))).toBe(false)
  await until(() => !b.node.state().friends[a.key] && !b.node.state().groups[gid]?.members.includes(a.key))
}, 120000)

test('only a few conversations stay in memory; the rest are read back from disk, and history can be limited', async () => {
  const a = start()
  let b = start()
  await befriend(a, b)
  const dm = dmId(a.key, b.key)
  for (const t of ['one', 'two', 'three']) a.node.send(dm, t)
  await until(() => texts(b, dm).length === 3)

  // Four other conversations push the DM out of A's memory.
  for (const name of ['g1', 'g2', 'g3', 'g4']) {
    a.node.createGroup(name, [b.key])
    const id = Object.values(a.node.state().groups).find((g: any) => g.name === name)!.id
    a.node.send(id, 'in ' + name)
  }
  // Sent while evicted and while B is away; synced from disk when B is back.
  await b.node.destroy()
  await until(() => !a.node.state().online.includes(b.key))
  a.node.send(dm, 'four')
  b = start(b.dir, b.keyPair)
  await until(() => texts(b, dm).includes('four') && a.node.history(dm).acked === 4)
  expect(a.node.history(dm, 2)).toMatchObject({ total: 4 })
  expect(a.node.history(dm, 2).msgs.map((m: any) => m.text)).toEqual(['three', 'four'])
  expect(texts(a, dm)).toEqual(['one', 'two', 'three', 'four'])
}, 120000)

test('peers tell each other their version; a hello without one counts as 0.0.1, and nonsense is not believed', async () => {
  const mk = (version: string) => {
    const dir = mkdtempSync(join(tmpdir(), 'eleusinia-'))
    const keyPair = DHT.keyPair()
    const node = createNode({ dir, keyPair, emit: () => {}, dht: { bootstrap: testnet.bootstrap }, redialMs: 300, version })
    const n = { node, dir, keyPair, key: keyPair.publicKey.toString('hex') as string }
    nodes.push(n)
    return n
  }
  const a = mk('0.0.2')
  const b = mk('0.0.7')
  await befriend(a, b)
  await until(() => a.node.state().versions[b.key]?.app === '0.0.7' && b.node.state().versions[a.key]?.app === '0.0.2')
  expect(a.node.state().versions[b.key]).toEqual({ app: '0.0.7', call: CALL_VERSION })
  expect(versionOf({})).toEqual({ app: '0.0.1 or older', call: 1 })
  expect(versionOf({ app: '<script>', call: -3 })).toEqual({ app: '0.0.1 or older', call: 1 })
  expect(versionOf({ app: '1.2.3', call: 2 })).toEqual({ app: '1.2.3', call: 2 })
})

test('friend requests arrive and are accepted even when no direct link can ever be made, and a declined one stays gone', async () => {
  const blocked = new Set<string>()
  const mk = (name: string) => {
    const dir = mkdtempSync(join(tmpdir(), 'eleusinia-'))
    const keyPair = DHT.keyPair()
    const key = keyPair.publicKey.toString('hex')
    // Two strict routers: these peers refuse every direct link with each other.
    const node = createNode({ dir, keyPair, emit: () => {}, dht: { bootstrap: testnet.bootstrap }, redialMs: 300, links: (k) => !blocked.has([k, key].sort().join()) })
    const n = { node, dir, keyPair, key }
    nodes.push(n)
    return n
  }
  const a = mk('a')
  const b = mk('b')
  const c = mk('c')
  blocked.add([a.key, b.key].sort().join())
  blocked.add([c.key, b.key].sort().join())
  await a.node.setProfile({ username: 'ada', name: 'Ada', about: 'hello', avatar: '' })
  await b.node.setProfile({ username: 'bea', name: 'Bea', about: '', avatar: '' })
  await c.node.setProfile({ username: 'cal', name: 'Cal', about: '', avatar: '' })

  a.node.addFriend(b.key)
  await until(() => b.node.state().friends[a.key] === 'incoming')
  await until(() => b.node.state().profiles[a.key]?.name === 'Ada') // from Ada's published card, no link needed
  expect(b.node.state().profiles[a.key].handle).toBe(a.node.state().profile.handle)
  b.node.addFriend(a.key) // accept
  await until(() => a.node.state().friends[b.key] === 'friend')
  expect(b.node.state().friends[a.key]).toBe('friend')
  expect(a.node.state().online).not.toContain(b.key) // friends now, yet never linked: it all went through the DHT

  c.node.addFriend(b.key)
  await until(() => b.node.state().friends[c.key] === 'incoming')
  b.node.removeFriend(c.key) // decline, while Cal keeps announcing
  await new Promise((r) => setTimeout(r, 3000)) // several checks of the request topic, where Cal is still announced
  expect(b.node.state().friends[c.key]).toBeUndefined()
}, 120000)

// Peers behind strict routers (`strict`: their direct connections fail for real on the test DHT), linked through a
// mutual friend's blind relay.
function peer(opts: { strict?: boolean; relayLimits?: RelayLimits } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'eleusinia-'))
  const keyPair = DHT.keyPair()
  const node = createNode({ dir, keyPair, emit: () => {}, dht: { bootstrap: testnet.bootstrap }, redialMs: 300, ...opts })
  const n = { node, dir, keyPair, key: keyPair.publicKey.toString('hex') as string }
  nodes.push(n)
  return n
}
let names = 0
async function setUp(ns: N[], relay = true) {
  await Promise.all(ns.map((n) => n.node.setProfile({ username: 'relay' + names++, name: 'R', about: '', avatar: '' })))
  await Promise.all(ns.map((n) => n.node.setSettings({ relay })))
}
// Friends through the request topics, as two strict peers can only become.
async function befriendUnlinked(x: N, y: N) {
  x.node.addFriend(y.key)
  await until(() => y.node.state().friends[x.key] === 'incoming')
  y.node.addFriend(x.key)
  await until(() => x.node.state().friends[y.key] === 'friend')
}
const linked = (x: N, y: N) => x.node.state().online.includes(y.key)
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
// Opens a plain connection to a node's relay as `keyPair`; resolves to the open DHT or null when refused.
function toRelay(of: N, keyPair: any) {
  const d = new DHT({ bootstrap: testnet.bootstrap, keyPair })
  const sock = d.connect(relayKeyPair(of.keyPair.secretKey).publicKey)
  return new Promise<any>((resolve) => {
    sock.on('open', () => resolve(d))
    sock.on('error', () => (d.destroy(), resolve(null)))
  })
}

test('two peers that can never link directly chat, sync a group and carry a call through a mutual friend who sees none of it', async () => {
  const dgram = await import('node:dgram')
  const a = peer({ strict: true })
  const b = peer({ strict: true })
  const r = peer()
  await setUp([a, b, r])
  await befriendUnlinked(a, b)
  const dm = dmId(a.key, b.key)
  a.node.send(dm, 'queued')
  await wait(6000) // direct dials keep failing and nobody can relay yet
  expect(linked(a, b)).toBe(false)

  await befriend(a, r)
  await befriend(b, r)
  await until(() => texts(b, dm).includes('queued'))
  await until(() => a.node.state().relayed.includes(b.key) && b.node.state().relayed.includes(a.key))
  b.node.send(dm, 'reply')
  await until(() => texts(a, dm).includes('reply'))
  expect(existsSync(join(r.dir, 'msgs', dm + '.jsonl'))).toBe(false)
  expect(await a.node.probe(b.key)).toBeNull() // the upload burst is never sent through a relay

  const gid = a.node.createGroup('pair', [b.key]) // the relay is not in it
  await until(() => !!b.node.state().groups[gid])
  b.node.send(gid, 'in the group')
  await until(() => texts(a, gid).includes('in the group'))
  expect(r.node.state().groups[gid]).toBeUndefined()

  const ra = (await a.node.relayOpen(b.key))!
  const rb = (await b.node.relayOpen(a.key))!
  const udp = async (ip: string) => {
    const s = dgram.createSocket('udp4')
    await new Promise<void>((done) => s.bind(0, ip, done))
    return s
  }
  const [pa, pb] = await Promise.all([udp(ra.ip), udp(rb.ip)])
  const got: string[] = []
  pb.on('message', (m) => got.push(m.toString()))
  pb.send('register', rb.port, rb.ip)
  await until(() => (pa.send('voice', ra.port, ra.ip), got.includes('voice')))
  pa.close()
  pb.close()
}, 180000)

test('when the relaying friend leaves, the pair moves to another mutual friend', async () => {
  const a = peer({ strict: true })
  const b = peer({ strict: true })
  const r1 = peer()
  const r2 = peer()
  await setUp([a, b, r1, r2])
  await befriendUnlinked(a, b)
  await befriend(a, r1)
  await befriend(b, r1)
  const dm = dmId(a.key, b.key)
  a.node.send(dm, 'first')
  await until(() => texts(b, dm).includes('first'))
  await befriend(a, r2)
  await befriend(b, r2)
  await r1.node.destroy()
  a.node.send(dm, 'after the move')
  await until(() => texts(b, dm).includes('after the move'))
  expect(a.node.state().relayed).toContain(b.key)
}, 180000)

test('nobody relays for strangers or with relaying off', async () => {
  const a = peer({ strict: true })
  const b = peer({ strict: true })
  const off = peer() // friends with both, relaying off
  const half = peer() // relaying, but only friends with a
  const stranger = DHT.keyPair()
  await setUp([a, b, half])
  await setUp([off], false)
  await befriendUnlinked(a, b)
  await befriend(a, off)
  await befriend(b, off)
  await befriend(a, half)
  a.node.send(dmId(a.key, b.key), 'nobody can carry this')
  await wait(8000)
  expect(linked(a, b)).toBe(false)
  const ok = await toRelay(half, a.keyPair)
  expect(ok).not.toBeNull() // a friend may use the relay
  await ok.destroy()
  expect(await toRelay(half, stranger)).toBeNull()
  expect(await toRelay(half, b.keyPair)).toBeNull() // b is not half's contact
}, 180000)

test('a relay holds to its caps: pairs, per contact, and bytes', async () => {
  const a = peer({ strict: true })
  const b = peer({ strict: true })
  const c = peer()
  const r = peer({ relayLimits: { pairs: 1, perContact: 1, bytesPerSec: 1024 } })
  await setUp([a, b, c, r])
  await befriend(a, r)
  await befriend(b, r)
  await befriend(c, r)
  // Two connections make one pair; a third, or a second from the same contact, is refused.
  const one = await toRelay(r, a.keyPair)
  expect(one).not.toBeNull()
  expect(await toRelay(r, a.keyPair)).toBeNull()
  const two = await toRelay(r, b.keyPair)
  expect(two).not.toBeNull()
  expect(await toRelay(r, c.keyPair)).toBeNull()
  await Promise.all([one.destroy(), two.destroy()])

  await befriendUnlinked(a, b)
  const dm = dmId(a.key, b.key)
  a.node.send(dm, 'hi')
  await until(() => texts(b, dm).includes('hi'))
  for (let i = 0; i < 20; i++) a.node.send(dm, 'x'.repeat(3000)) // ~60 KB, over the 20 s budget of 20 KB
  await until(() => !linked(a, b))
  await wait(3000)
  expect(linked(a, b)).toBe(false) // and the sender is refused for a while
}, 180000)

test('a full request list drops its oldest instead of refusing new ones, and Decline all clears it for good', async () => {
  const b = (() => {
    const dir = mkdtempSync(join(tmpdir(), 'eleusinia-'))
    const keyPair = DHT.keyPair()
    const node = createNode({ dir, keyPair, emit: () => {}, dht: { bootstrap: testnet.bootstrap }, redialMs: 300, maxRequests: 2 })
    const n = { node, dir, keyPair, key: keyPair.publicKey.toString('hex') as string }
    nodes.push(n)
    return n
  })()
  await b.node.setProfile({ username: 'full', name: 'Full', about: '', avatar: '' })
  const askers = [start(), start(), start()]
  for (const x of askers) {
    x.node.addFriend(b.key)
    await until(() => b.node.state().friends[x.key] === 'incoming')
  }
  // The list stays at its cap and never refuses someone new (the one pushed out was not declined, so it may come back)
  expect(Object.keys(b.node.state().friends)).toHaveLength(2)
  expect(Object.keys(b.node.state().friends)).toContain(askers[2].key)
  const declined = Object.keys(b.node.state().friends)
  b.node.declineAll()
  expect(b.node.state().friends).toEqual({})
  await new Promise((r) => setTimeout(r, 2000)) // their requests are still announced and they still dial
  // Whoever was declined stays gone; one the full list had pushed out was never declined, so it may come back.
  const back = Object.keys(b.node.state().friends)
  for (const k of declined) expect(back).not.toContain(k)
  expect(back.length).toBeLessThanOrEqual(1)
}, 60000)

test('a message with files is signed with them, and changing a file in it breaks the signature', () => {
  const a = DHT.keyPair()
  const files = [{ h: 'ab'.repeat(32), n: 'cat.png', s: 10, t: 'image/png' }]
  const m = signMsg({ conv: 'c', author: a.publicKey.toString('hex'), seq: 1, ts: 1, text: '', files }, a.secretKey)
  expect(verifyMsg(m)).toBe(true)
  expect(verifyMsg({ ...m, files: [{ ...files[0], s: 11 }] })).toBe(false)
  expect(verifyMsg({ ...m, files: undefined })).toBe(false)
  expect(verifyMsg({ ...m, files: [{ ...files[0], n: '../x' }] })).toBe(false)
})

test('shared files: a picture arrives by itself, a big file on request, and a group member serves it once the sender is gone', async () => {
  const a = start()
  const b = start()
  let c = start()
  await befriend(a, b)
  await befriend(a, c)
  const dm = dmId(a.key, b.key)
  const pic = a.node.addBytes('cat.png', 'image/png', randomBytes(100000))
  const src = join(mkdtempSync(join(tmpdir(), 'eleusinia-src-')), 'big.bin')
  writeFileSync(src, randomBytes(3 * 2 ** 20))
  const big = await a.node.addFile(src)
  expect(() => a.node.send(dm, '', [{ ...big, h: 'cd'.repeat(32) }])).toThrow() // not a file we hold
  a.node.send(dm, 'look', [pic, big])
  const state = (n: N, h: string) => n.node.fileStatus([h])[0].state
  await until(() => state(b, pic.h) === 'done')
  expect(state(b, big.h)).toBe('none')
  const to = join(mkdtempSync(join(tmpdir(), 'eleusinia-dl-')), 'big.bin')
  b.node.download(big.h, to)
  await until(() => state(b, big.h) === 'done')
  expect(readFileSync(to).equals(readFileSync(src))).toBe(true)

  // C is offline when A shares a picture in the group, and A is gone by the time C returns: B hands it over.
  const gid = a.node.createGroup('trio', [b.key, c.key])
  await until(() => !!b.node.state().groups[gid] && !!c.node.state().groups[gid])
  await c.node.destroy()
  const pic2 = a.node.addBytes('dog.png', 'image/png', randomBytes(50000))
  a.node.send(gid, '', [pic2])
  await until(() => state(b, pic2.h) === 'done')
  await a.node.destroy()
  c = restart(c)
  await until(() => state(c, pic2.h) === 'done')
  expect(readFileSync(c.node.filePath(pic2.h)!.path).equals(readFileSync(b.node.filePath(pic2.h)!.path))).toBe(true)
  // Leaving the group deletes its pictures from this computer.
  const cached = c.node.filePath(pic2.h)!.path
  c.node.leaveGroup(gid)
  expect(existsSync(cached)).toBe(false)
}, 120000)

test('someone offline is still found by their exact friend ID, and their request is waiting when they come back', async () => {
  let a = start()
  const b = start()
  await a.node.setProfile({ username: 'offlineann', name: 'Ann', about: '', avatar: '' })
  const handle = a.node.state().profile.handle
  await a.node.destroy()
  // Only the ID card can answer now: nothing announces Ann's ID while she is away.
  await expect.poll(() => b.node.idOwners(handle), { timeout: 20000, interval: 300 }).toContain(a.key)
  expect(await b.node.idOwners('offlineann#9999')).not.toContain(a.key)
  const found = await b.node.findFriend(handle)
  const ann = found.find((f) => f.key === a.key)
  expect(ann?.linked).toBe(false)
  b.node.addFriend(a.key, ann!.profile)
  a = restart(a)
  await until(() => a.node.state().friends[b.key] === 'incoming')
}, 120000)

test('a group picture follows the latest change, is checked like a profile picture, and can be removed', () => {
  const g: Group = { id: 'ab'.repeat(16), name: 'Trio', members: [], updatedAt: 1 }
  const pic = 'data:image/jpeg;base64,AAAA'
  expect(mergeGroup(g, { ...g, avatar: pic, updatedAt: 2 }).avatar).toBe(pic)
  expect(mergeGroup({ ...g, avatar: pic, updatedAt: 2 }, g).avatar).toBe(pic) // an older copy does not undo it
  expect(mergeGroup({ ...g, avatar: pic, updatedAt: 2 }, { ...g, updatedAt: 3 }).avatar).toBeUndefined() // removed later
  expect(mergeGroup(g, { ...g, avatar: pic })).toEqual(mergeGroup({ ...g, avatar: pic }, g)) // same result either way
  expect(validGroup({ ...g, avatar: pic })).toBe(true)
  expect(validGroup({ ...g, avatar: 'data:image/svg+xml;base64,AAAA' })).toBe(false)
  expect(validGroup({ ...g, avatar: 'https://example.com/a.png' })).toBe(false)
})

test('a member changes the group picture and the others get it', async () => {
  const a = start()
  const b = start()
  await befriend(a, b)
  const gid = a.node.createGroup('pics', [b.key])
  await until(() => !!b.node.state().groups[gid])
  const pic = 'data:image/png;base64,AAAA'
  b.node.setGroupPicture(gid, pic)
  await until(() => a.node.state().groups[gid]?.avatar === pic)
  expect(() => a.node.setGroupPicture(gid, 'data:image/svg+xml;base64,AAAA')).toThrow()
  a.node.setGroupPicture(gid, '')
  await until(() => b.node.state().groups[gid]?.avatar === undefined)
}, 60000)
