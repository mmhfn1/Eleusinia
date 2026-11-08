import { randomBytes } from 'node:crypto'
import DHT from 'hyperdht'
import { expect, test } from 'vitest'
import {
  INVITE_PREFIX, type JoinAsk, askOrder, checkJoinAsk, cleanJoinAsk, isJoinAnswer, isJoinAsk, limiter, makeInvite, newInvite, parseInvite, serverTopic,
} from '../src/shared/invite'
import { type Op, createServer, isCut, joinProof, replay, signOp } from '../src/shared/server'

type KP = ReturnType<typeof DHT.keyPair>
const hex = (kp: { publicKey: Buffer }) => kp.publicKey.toString('hex')
const NOW = 10_000_000

// A server with an owner and a log; `by` writes the next op of an author, `ask` builds a stranger's join ask.
function world() {
  const o = DHT.keyPair()
  const { id, op } = createServer('test', o, 1000)
  const ops: Op[] = [op]
  const seqs = new Map([[hex(o), 1]])
  let t = 1000
  // A cut op (ban, revoke, ...) says it saw every op written so far
  const by = (kp: KP, kind: string, body: Record<string, unknown>) => {
    if (isCut(kind, body)) body = { ...body, seen: Object.fromEntries(seqs) }
    const seq = (seqs.get(hex(kp)) ?? 0) + 1
    seqs.set(hex(kp), seq)
    ops.push(signOp({ server: id, seq, n: ops.length + 1, ts: ++t, kind, body }, kp))
  }
  const invite = (opts: { expires?: number; maxUses?: number } = {}) => {
    const inv = newInvite(opts)
    by(o, 'invite.add', inv.body)
    return { id: inv.body.id, secret: inv.secret }
  }
  const ask = (kp: KP, inv: { id: string; secret: Buffer }): JoinAsk =>
    ({ t: 'joinAsk', server: id, invite: inv.id, key: hex(kp), proof: joinProof(id, inv.id, hex(kp), inv.secret) })
  const state = () => replay(ops, NOW)!
  // What a member does on an ok ask: writes the join. Proves checkJoinAsk agrees with replay.
  const accept = (a: JoinAsk) => by(o, 'join', { invite: a.invite, key: a.key, proof: a.proof })
  return { o, id, by, invite, ask, state, accept }
}

const contact = () => hex(DHT.keyPair())
const sample = () => ({ server: randomBytes(16).toString('hex'), invite: randomBytes(16).toString('hex'), secret: randomBytes(32), contacts: [contact()] })

test('links round-trip with one or two contacts, bare, and pasted with spaces and line breaks', () => {
  const one = sample()
  const link = makeInvite(one)
  expect(link.startsWith(INVITE_PREFIX)).toBe(true)
  expect(parseInvite(link)).toEqual(one)
  const two = { ...sample(), contacts: [contact(), contact()] }
  const link2 = makeInvite(two)
  expect(parseInvite(link2)).toEqual(two)
  const bare = link2.slice(INVITE_PREFIX.length)
  expect(parseInvite(bare)).toEqual(two)
  expect(parseInvite(`  ${link2.slice(0, 30)}\n ${link2.slice(30, 90)}\r\n\t${link2.slice(90)} `)).toEqual(two)
  expect(parseInvite(link2 + '/')).toEqual(two)
  expect(parseInvite(link2.replace('eleusinia', 'Eleusinia'))).toEqual(two)
  // The same contact twice is written once
  expect(parseInvite(makeInvite({ ...one, contacts: [one.contacts[0], one.contacts[0]] }))!.contacts).toEqual(one.contacts)
})

test('junk links give null and never throw', () => {
  const link = makeInvite({ ...sample(), contacts: [contact(), contact()] })
  const raw = Buffer.from(link.slice(INVITE_PREFIX.length), 'base64url')
  const enc = (b: Buffer) => INVITE_PREFIX + b.toString('base64url')
  const junk: unknown[] = [
    undefined, null, 42, {}, [], '', INVITE_PREFIX, 'eleusinia://invite/', 'https://example.com', link.slice(0, -1), link + 'A', link + '=',
    link.slice(0, -1) + '+', 'x'.repeat(10_000), link + ' '.repeat(400),
    enc(Buffer.concat([Buffer.from([3]), raw.subarray(1)])), // unknown version
    enc(Buffer.concat([Buffer.from([2]), raw.subarray(1)])), // version 2, never written
    enc(raw.subarray(0, 65)), // no contact
    enc(raw.subarray(0, 64 + 32)), // short contact
    enc(Buffer.concat([raw, randomBytes(32)])), // three contacts
    enc(Buffer.concat([raw.subarray(0, 97), raw.subarray(65, 97)])), // the same contact twice
    'eleusinia://other/' + link.slice(INVITE_PREFIX.length),
  ]
  for (const j of junk) expect(parseInvite(j)).toBeNull()
  expect(() => makeInvite({ ...sample(), server: 'nope' })).toThrow()
  expect(() => makeInvite({ ...sample(), contacts: [] })).toThrow()
})

test('newInvite gives an invite.add body the log accepts, with expiry and uses only when asked', () => {
  const plain = newInvite()
  expect(Object.keys(plain.body).sort()).toEqual(['id', 'pub'])
  expect(plain.secret.length).toBe(32)
  const w = world()
  const inv = w.invite({ expires: NOW + 1000, maxUses: 3 })
  expect(w.state().invites[inv.id]).toMatchObject({ expires: NOW + 1000, maxUses: 3, uses: 0, revoked: false })
})

test('serverTopic is 32 bytes, stable, and differs per server', () => {
  const a = sample().server
  expect(serverTopic(a).length).toBe(32)
  expect(serverTopic(a).equals(serverTopic(a))).toBe(true)
  expect(serverTopic(a).equals(serverTopic(sample().server))).toBe(false)
})

test('checkJoinAsk: ok matches replay, and every refusal has its reason', () => {
  const w = world()
  const [a, b, c, d] = Array.from({ length: 4 }, () => DHT.keyPair())
  const inv = w.invite()
  const okAsk = w.ask(a, inv)
  expect(checkJoinAsk(w.state(), okAsk, NOW)).toBe('ok')
  w.accept(okAsk)
  expect(Object.hasOwn(w.state().members, hex(a))).toBe(true)
  expect(checkJoinAsk(w.state(), okAsk, NOW)).toBe('member')

  expect(checkJoinAsk(w.state(), { ...w.ask(b, inv), server: randomBytes(16).toString('hex') }, NOW)).toBe('server')
  expect(checkJoinAsk(w.state(), { ...w.ask(b, inv), invite: randomBytes(16).toString('hex') }, NOW)).toBe('unknown')
  expect(checkJoinAsk(w.state(), w.ask(b, { id: inv.id, secret: randomBytes(32) }), NOW)).toBe('proof')
  expect(checkJoinAsk(w.state(), { ...w.ask(b, inv), key: hex(c) }, NOW)).toBe('proof') // someone else's proof

  w.by(w.o, 'ban', { key: hex(b) })
  expect(checkJoinAsk(w.state(), w.ask(b, inv), NOW)).toBe('banned')

  const old = w.invite({ expires: NOW - 1 })
  expect(checkJoinAsk(w.state(), w.ask(c, old), NOW)).toBe('expired')
  expect(checkJoinAsk(w.state(), w.ask(c, old), NOW - 1)).toBe('ok')

  const once = w.invite({ maxUses: 1 })
  w.accept(w.ask(c, once))
  expect(checkJoinAsk(w.state(), w.ask(d, once), NOW)).toBe('used')

  const gone = w.invite()
  w.by(w.o, 'invite.revoke', { id: gone.id })
  expect(checkJoinAsk(w.state(), w.ask(d, gone), NOW)).toBe('revoked')

  // A refused ask written anyway is ignored by replay too
  const before = Object.keys(w.state().members).length
  w.accept(w.ask(d, gone))
  expect(Object.keys(w.state().members).length).toBe(before)
})

test('checkJoinAsk says full at the member cap', () => {
  const w = world()
  const s = w.state()
  for (let i = 0; i < 999; i++) s.members[i.toString(16).padStart(64, '0')] = { roles: [], joinedAt: 0 }
  const ask = w.ask(DHT.keyPair(), w.invite())
  const fresh = w.state()
  fresh.members = s.members
  expect(checkJoinAsk(fresh, ask, NOW)).toBe('full')
  delete fresh.members[(0).toString(16).padStart(64, '0')]
  expect(checkJoinAsk(fresh, ask, NOW)).toBe('ok')
})

test('join asks and answers from peers are checked strictly', () => {
  const w = world()
  const ask = w.ask(DHT.keyPair(), w.invite())
  expect(isJoinAsk(ask)).toBe(true)
  expect(isJoinAsk({ ...ask, profile: { name: 'x' } })).toBe(true)
  for (const bad of [null, 'x', { ...ask, t: 'joinOk' }, { ...ask, server: 'zz' }, { ...ask, invite: ask.invite.toUpperCase() }, { ...ask, key: ask.key.slice(1) },
    { ...ask, proof: 'ab' }, { ...ask, profile: null }, { ...ask, profile: 'me' }]) expect(isJoinAsk(bad)).toBe(false)
  const clean = cleanJoinAsk({ ...ask, profile: { name: ' Ann ', about: 'x'.repeat(500), avatar: 'javascript:1', extra: 1 } as any, junk: 1 } as any)
  expect(clean.profile).toEqual({ handle: '', name: 'Ann', about: 'x'.repeat(200), avatar: '' })
  expect('junk' in clean).toBe(false)

  expect(isJoinAnswer({ t: 'joinOk', server: w.id })).toBe(true)
  expect(isJoinAnswer({ t: 'joinNo', server: w.id, why: 'banned' })).toBe(true)
  for (const bad of [null, { t: 'joinNo', server: w.id, why: 'nope' }, { t: 'joinNo', server: w.id }, { t: 'joinOk', server: 'x' }, { t: 'other', server: w.id }])
    expect(isJoinAnswer(bad)).toBe(false)
})

test('askOrder puts the link contacts first, drops ourselves and duplicates, and caps', () => {
  const [me, a, b] = [contact(), contact(), contact()]
  const found = Array.from({ length: 12 }, contact)
  expect(askOrder([a, b], [b, me, 'junk' as any, ...found], me)).toEqual([a, b, ...found.slice(0, 6)])
  expect(askOrder([me], [], me)).toEqual([])
})

test('limiter lets one ask per stranger per period and forgets past its cap', () => {
  const ok = limiter(5000, 2)
  expect(ok('a', 0)).toBe(true)
  expect(ok('a', 4999)).toBe(false)
  expect(ok('a', 5000)).toBe(true)
  expect(ok('b', 5000)).toBe(true)
  expect(ok('c', 5000)).toBe(true) // 'a' forgotten
  expect(ok('a', 5001)).toBe(true)
  expect(ok('c', 5001)).toBe(false)
})
