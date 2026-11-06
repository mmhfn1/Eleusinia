// A bigger group than the other tests use, on a local test DHT: run with ELEUSINIA_STRESS=1 npx vitest run test/stress.test.ts
// (skipped otherwise; it takes a few minutes). Checks that bounded links, gossip, presence, paged catch-up, the flood
// limit and the shallow start hold together when everyone talks at once.
import { appendFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import DHT from 'hyperdht'
import createTestnet from 'hyperdht/testnet'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { createNode } from '../src/main/node'

const on = !!process.env.ELEUSINIA_STRESS
// What it measured, also written to ELEUSINIA_STRESS_LOG when set: vitest shows the console only for failing tests
const note = (...parts: unknown[]) => (console.log(...parts), process.env.ELEUSINIA_STRESS_LOG && appendFileSync(process.env.ELEUSINIA_STRESS_LOG, parts.join(' ') + '\n'))
const N = Number(process.env.ELEUSINIA_STRESS_MEMBERS) || 16
let testnet: any
const nodes: { node: ReturnType<typeof createNode>; key: string }[] = []
const start = (opts = {}) => {
  const keyPair = DHT.keyPair()
  const node = createNode({ dir: mkdtempSync(join(tmpdir(), 'eleusinia-stress-')), keyPair, emit: () => {}, dht: { bootstrap: testnet.bootstrap }, redialMs: 300, groupLinks: 3, ...opts })
  const n = { node, key: keyPair.publicKey.toString('hex') }
  nodes.push(n)
  return n
}
const until = (ok: () => boolean, timeout = 120000) => expect.poll(ok, { timeout, interval: 250 }).toBe(true)
const count = (n: (typeof nodes)[0], conv: string) => n.node.history(conv).total
type Node = (typeof nodes)[0]
async function befriend(x: Node, y: Node) {
  x.node.addFriend(y.key)
  await until(() => y.node.state().friends[x.key] === 'incoming')
  y.node.addFriend(x.key)
  await until(() => x.node.state().friends[y.key] === 'friend' && x.node.state().online.includes(y.key))
}

beforeAll(async () => {
  if (on) testnet = await createTestnet(10)
})
afterAll(async () => {
  await Promise.all(nodes.map((n) => n.node.destroy()))
  await testnet?.destroy()
})

test.skipIf(!on)(`${N} members: everyone talking at once, a flood, a rename, presence and a late joiner`, async () => {
  const t0 = Date.now()
  const lap = (what: string) => note(`${((Date.now() - t0) / 1000).toFixed(1)} s  ${what}`)
  const owner = start()
  await owner.node.setProfile({ username: 'owner', name: 'Owner' })
  const members = Array.from({ length: N - 1 }, () => start())
  for (const m of members) await m.node.setProfile({ username: 'm' + m.key.slice(0, 6), name: 'M' + m.key.slice(0, 4) })
  for (const m of members) await befriend(owner, m)
  lap('befriended')
  const gid = owner.node.createGroup('stress', members.map((m) => m.key))
  await until(() => members.every((m) => !!m.node.state().groups[gid]))
  lap('group everywhere')

  // Everyone writes 30 at once
  const each = 30
  for (let i = 0; i < each; i++) for (const n of [owner, ...members]) n.node.send(gid, `${n.key.slice(0, 4)} ${i}`)
  const progress = setInterval(() => note('counts', [owner, ...members].map((n) => count(n, gid)).join(' ')), 10000)
  await until(() => [owner, ...members].every((n) => count(n, gid) === N * each)).finally(() => clearInterval(progress))
  lap(`${N * each} messages everywhere`)

  // Links stay bounded: members are not friends with each other, so only picks, the owner and whoever picked them
  const links = members.map((m) => m.node.state().online.length)
  note('links per member: max', Math.max(...links), 'mean', (links.reduce((a, b) => a + b, 0) / links.length).toFixed(1))
  expect(Math.max(...links)).toBeLessThan(N - 1)

  // Everyone knows everyone else is online, linked or through presence notes
  await until(() => members.every((m) => new Set([...m.node.state().online, ...m.node.state().present]).size >= N - 2), 180000)
  lap('presence complete')

  // One member floods 600: past the burst of 400, and still all of it arrives everywhere
  const loud = members[0]
  for (let i = 0; i < 600; i++) loud.node.send(gid, 'flood ' + i)
  await until(() => [owner, ...members].every((n) => count(n, gid) === N * each + 600), 300000)
  lap('flood everywhere')

  // A member renames the group: passed on to a few each time, it still reaches everyone
  await members[1].node.renameGroup(gid, 'renamed')
  await until(() => [owner, ...members].every((n) => n.node.state().groups[gid]?.name === 'renamed'))
  lap('rename everywhere')

  // A late joiner starts at each author's newest 100, then pages back
  const late = start()
  await late.node.setProfile({ username: 'late', name: 'Late' })
  await befriend(owner, late)
  owner.node.addToGroup(gid, late.key)
  const total = N * each + 600
  const shallow = (N - 1) * each + 100 // everyone's 30, and the loud member's 630 as their newest 100
  await until(() => count(late, gid) === shallow)
  lap(`late joiner has ${shallow} of ${total}`)
  while (late.node.history(gid).earlier) {
    const had = count(late, gid)
    late.node.older(gid)
    await until(() => count(late, gid) > had || !late.node.history(gid).earlier, 30000)
    // Let the page finish arriving: members answer one request a second
    for (let n = -1; n !== count(late, gid); ) (n = count(late, gid)), await new Promise((r) => setTimeout(r, 1500))
  }
  expect(count(late, gid)).toBe(total)
  lap('late joiner paged back to everything')

  const mb = (process.memoryUsage().heapUsed / 2 ** 20).toFixed(0)
  note(`heap ${mb} MB for ${nodes.length} nodes in one process`)
}, 900000)
