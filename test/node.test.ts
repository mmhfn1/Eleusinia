import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import DHT from 'hyperdht'
import createTestnet from 'hyperdht/testnet'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { createNode } from '../src/main/node'
import { createNet } from '../src/main/network'
import { type Group, type Msg, cleanProfile, dmId, identicon, isHandle, keyTail, normHandle, stack } from '../src/shared/protocol'
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
function start(dir = mkdtempSync(join(tmpdir(), 'eleusinia-')), keyPair = DHT.keyPair()) {
  const node = createNode({ dir, keyPair, emit: () => {}, dht: { bootstrap: testnet.bootstrap }, redialMs: 300 })
  const n = { node, dir, keyPair, key: keyPair.publicKey.toString('hex') as string }
  nodes.push(n)
  return n
}
const until = (ok: () => boolean) => expect.poll(ok, { timeout: 20000, interval: 100 }).toBe(true)
const texts = (n: { node: any }, conv: string) => n.node.history(conv).msgs.map((m: any) => m.text)

beforeAll(async () => {
  testnet = await createTestnet(3)
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
async function befriend(x: N, y: N) {
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

test('a member offline since before the group existed gets it, and its messages, from a member who is not their friend', async () => {
  let a = start()
  let b = start()
  const c = start()
  await befriend(a, b)
  await befriend(a, c)
  await b.node.destroy()

  const gid = a.node.createGroup('late', [b.key, c.key])
  a.node.send(gid, 'welcome')
  await until(() => texts(c, gid).includes('welcome'))
  await a.node.destroy()
  c.node.send(gid, 'c here')

  b = restart(b) // only C is online now, and B has never met C
  await until(() => texts(b, gid).join() === 'welcome,c here')
  expect(b.node.state().friends[c.key]).toBeUndefined()

  // And back the other way: B writes while the group's creator is away
  b.node.send(gid, 'thanks')
  await until(() => texts(c, gid).includes('thanks'))
  await c.node.destroy()
  a = restart(a)
  await until(() => texts(a, gid).join() === 'welcome,c here,thanks')
}, 120000)

const PNG = 'data:image/png;base64,AAAA'

test('setup assigns username#1234; search shows a stranger with their picture and adds only the one picked', async () => {
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
  expect(found).toEqual([{ key: b.key, profile: { handle: id, name: 'Bob', about: 'hello', avatar: PNG } }])
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

test('a profile card nobody asked for is ignored, while a stranger may ask for ours', async () => {
  const a = start()
  await a.node.setProfile({ username: 'ann', name: 'Ann' })
  const got = await new Promise<any>((resolve) => {
    const raw = createNet(
      DHT.keyPair(),
      {
        open(k) {
          raw.send(k, { t: 'card', handle: 'evil#0000', name: 'Evil', about: '', avatar: '' })
          raw.send(k, { t: 'who' })
        },
        close() {},
        msg: (_k, w) => resolve({ w, raw }),
      },
      { bootstrap: testnet.bootstrap },
    )
    raw.dial(a.key)
  })
  expect(got.w).toMatchObject({ t: 'card', name: 'Ann' })
  expect(a.node.state().friends).toEqual({})
  expect(a.node.state().profiles).toEqual({})
  await got.raw.destroy()
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

test('suggestions start at 4 letters of a username and narrow as more is typed', async () => {
  const a = start()
  const b = start()
  const c = start()
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
  expect((await a.node.findFriend('bobb'))[0].profile.avatar).toBe(PNG)
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
