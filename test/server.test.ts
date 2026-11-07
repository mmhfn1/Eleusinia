import { randomBytes } from 'node:crypto'
import DHT from 'hyperdht'
import { expect, test } from 'vitest'
import { type Op, type Perm, can, createServer, inviteKeyPair, isCut, joinProof, permsOf, replay, serverIdOf, signOp, verifyOp } from '../src/shared/server'

type KP = ReturnType<typeof DHT.keyPair>
const hex = (kp: { publicKey: Buffer }) => kp.publicKey.toString('hex')
const newId = () => randomBytes(16).toString('hex')
const NOW = 10_000_000

const shuffled = <T>(xs: T[]) => {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// A server and a log to write to: each op gets its author's next seq and an n one past everything written so far; a cut
// op (one that can take power away) says it saw everything written so far, unless the body names its own `seen`.
function world() {
  const [o, ...people] = Array.from({ length: 6 }, () => DHT.keyPair())
  const { id, op } = createServer('test', o, 1000)
  const ops: Op[] = [op]
  const seqs = new Map([[hex(o), 1]])
  let t = 1000
  let top = 1
  const seen = () => Object.fromEntries(seqs)
  const by = (kp: KP, kind: string, body: Record<string, unknown> = {}, extra: Partial<Op> = {}) => {
    const seq = (seqs.get(hex(kp)) ?? 0) + 1
    if (isCut(kind, body) && !('seen' in body)) body = { ...body, seen: seen() }
    seqs.set(hex(kp), seq)
    const op = signOp({ server: id, seq, n: top + 1, ts: ++t, kind, body, ...extra }, kp)
    top = Math.max(top, op.n)
    ops.push(op)
    return op
  }
  // The lowest n `kp` may still pick: one past their own last op
  const lowN = (kp: KP) => Math.max(0, ...ops.filter((x) => x.author === hex(kp)).map((x) => x.n)) + 1
  const state = (list = ops) => replay(list, NOW)!
  const invite = (kp: KP, opts: Record<string, unknown> = {}) => {
    const secret = randomBytes(32)
    const inv = { id: newId(), secret }
    by(kp, 'invite.add', { id: inv.id, pub: hex(inviteKeyPair(secret)), ...opts })
    return inv
  }
  const join = (via: KP, kp: KP, inv: { id: string; secret: Buffer }, extra: Partial<Op> = {}) =>
    by(via, 'join', { invite: inv.id, key: hex(kp), proof: joinProof(id, inv.id, hex(kp), inv.secret) }, extra)
  const role = (name: string, perms: Perm[]) => {
    const rid = newId()
    by(o, 'role.add', { id: rid, name, color: 0, hoist: false, perms })
    return rid
  }
  return { o, people, id, ops, by, state, invite, join, role, seen, lowN, seqs }
}

// Owner o; admin c above moderator a above member b. Roles end up [@everyone, low, mod, admin].
function staffed() {
  const w = world()
  const [a, b, c] = w.people
  const inv = w.invite(w.o)
  for (const kp of [a, b, c]) w.join(w.o, kp, inv)
  const admin = w.role('admin', ['administrator'])
  const mod = w.role('mod', ['kick', 'manageRoles', 'manageNicknames', 'createInvites'])
  const low = w.role('low', ['sendMessages'])
  w.by(w.o, 'member.roles', { key: hex(c), roles: [admin] })
  w.by(w.o, 'member.roles', { key: hex(a), roles: [mod] })
  w.by(w.o, 'member.roles', { key: hex(b), roles: [low] })
  return { ...w, a, b, c, admin, mod, low }
}

test('create proves ownership; ops for another server or with a forged signature are ignored', () => {
  const w = world()
  const s = w.state()
  expect(s.owner).toBe(hex(w.o))
  expect(s.roles.map((r) => r.id)).toEqual([w.id])
  expect(Object.keys(s.members)).toEqual([hex(w.o)])
  expect(verifyOp(w.ops[0], NOW)).toBe(true)

  // Someone else claiming the same id with the owner's nonce, or their own nonce: neither proves this id
  const [x] = w.people
  const nonce = (w.ops[0].body as any).nonce
  const claim = signOp({ server: w.id, seq: 1, n: 1, ts: 1000, kind: 'create', body: { nonce, name: 'mine' } }, x)
  expect(replay([claim], NOW, w.id)).toBeNull()
  expect(serverIdOf(hex(x), nonce)).not.toBe(w.id)
  expect(replay([claim, ...w.ops], NOW)!.owner).toBe(hex(w.o))

  const before = JSON.stringify(w.state())
  // Signed for another server, by the owner
  const other = signOp({ server: newId(), seq: 2, n: 2, ts: 1001, kind: 'server.edit', body: { name: 'other' } }, w.o)
  // A real op with its body changed after signing
  const real = signOp({ server: w.id, seq: 2, n: 2, ts: 1001, kind: 'server.edit', body: { name: 'fine' } }, w.o)
  const forged = { ...real, body: { name: 'forged' } }
  expect(verifyOp(forged, NOW)).toBe(false)
  expect(JSON.stringify(w.state([...w.ops, other]))).toBe(before)
  expect(JSON.stringify(w.state([...w.ops, forged]))).toBe(before)
  expect(w.state([...w.ops, real]).name).toBe('fine')
  // Junk never throws
  expect(replay([null, 1, 'x', { server: w.id }, { ...real, body: JSON.parse('['.repeat(5000) + ']'.repeat(5000)) }], NOW)).toBeNull()
  // Dated too far ahead of now
  const ahead = signOp({ server: w.id, seq: 2, n: 2, ts: NOW + 3600_000, kind: 'server.edit', body: { name: 'later' } }, w.o)
  expect(w.state([...w.ops, ahead]).name).toBe('test')
})

test('the same ops in any order give the same server', () => {
  const w = staffed()
  const ch = newId()
  w.by(w.o, 'channel.add', { id: ch, name: 'general', kind: 'text' })
  w.by(w.a, 'kick', { key: hex(w.b) })
  w.by(w.c, 'server.edit', { name: 'renamed' })
  w.by(w.a, 'nickname', { key: hex(w.a), nick: 'Mod' })
  const want = w.state()
  expect(want.name).toBe('renamed')
  expect(want.members[hex(w.b)]).toBeUndefined()
  for (let i = 0; i < 10; i++) expect(w.state(shuffled(w.ops))).toEqual(want)
})

test('roles: only within your rank and your own permissions; an admin can do all but touch the owner', () => {
  const w = staffed()
  const { o, a, b, c, admin, mod, low } = w
  // b has no manageRoles
  const r1 = newId()
  w.by(b, 'role.add', { id: r1, name: 'x', perms: [] })
  expect(w.state().roles.some((r) => r.id === r1)).toBe(false)

  // The moderator: not their own role or above, nothing they lack, nobody at or above them
  w.by(a, 'role.edit', { id: mod, name: 'boss' })
  w.by(a, 'role.edit', { id: admin, perms: [] })
  w.by(a, 'member.roles', { key: hex(b), roles: [low, admin] })
  w.by(a, 'member.roles', { key: hex(a), roles: [mod, admin] })
  const r2 = newId()
  w.by(a, 'role.add', { id: r2, name: 'banners', perms: ['ban'] })
  w.by(a, 'role.edit', { id: low, perms: ['sendMessages', 'ban'] })
  w.by(a, 'kick', { key: hex(o) })
  w.by(a, 'kick', { key: hex(c) })
  w.by(a, 'role.move', { id: low, to: 3 })
  let s = w.state()
  expect(s.roles.map((r) => r.id)).toEqual([w.id, low, mod, admin])
  expect(s.roles[2].name).toBe('mod')
  expect(s.roles[3].perms).toEqual(['administrator'])
  expect(s.members[hex(b)].roles).toEqual([low])
  expect(s.members[hex(a)].roles).toEqual([mod])
  expect(s.roles[1].perms).toEqual(['sendMessages'])
  expect(Object.keys(s.members)).toHaveLength(4)

  // What the moderator may do: a role with a permission they hold, below them, given to b, then b kicked
  const r3 = newId()
  w.by(a, 'role.add', { id: r3, name: 'kickers', perms: ['kick'] })
  w.by(a, 'member.roles', { key: hex(b), roles: [low, r3] })
  s = w.state()
  expect(s.roles.map((r) => r.id)).toEqual([w.id, r3, low, mod, admin])
  expect(s.members[hex(b)].roles).toEqual([r3, low])
  expect(can(s, hex(b), 'kick')).toBe(true)
  w.by(a, 'kick', { key: hex(b) })
  expect(w.state().members[hex(b)]).toBeUndefined()

  // The admin: grants anything, manages roles below, removes the moderator; never the owner
  const r4 = newId()
  w.by(c, 'role.add', { id: r4, name: 'banners', perms: ['ban', 'manageServer'] })
  w.by(c, 'role.edit', { id: mod, perms: ['kick'] })
  w.by(c, 'kick', { key: hex(o) })
  w.by(c, 'ban', { key: hex(o) })
  w.by(c, 'nickname', { key: hex(o), nick: 'x' })
  w.by(c, 'ban', { key: hex(a) })
  s = w.state()
  expect(s.roles.find((r) => r.id === r4)!.perms).toEqual(['manageServer', 'ban'])
  expect(s.roles.find((r) => r.id === mod)!.perms).toEqual(['kick'])
  expect(s.members[hex(o)]).toBeDefined()
  expect(s.bans).toEqual([hex(a)])
  expect(s.members[hex(a)]).toBeUndefined()
  // A nickname needs only manageNicknames, even on the owner (as the brief has it)
  expect(s.members[hex(o)].nick).toBe('x')
  expect(permsOf(s, hex(o)).size).toBe(permsOf(s, hex(c)).size)
})

test('a channel limited to one role: @everyone denied, the role allowed', () => {
  const w = staffed()
  const ch = newId()
  w.by(w.o, 'channel.add', { id: ch, name: 'staff', kind: 'text', overrides: { [w.id]: { deny: ['viewChannel'] }, [w.mod]: { allow: ['viewChannel'] } } })
  const open = newId()
  w.by(w.o, 'channel.add', { id: open, name: 'general', kind: 'text' })
  const s = w.state()
  expect(can(s, hex(w.a), 'viewChannel', ch)).toBe(true) // the role
  expect(can(s, hex(w.b), 'viewChannel', ch)).toBe(false)
  expect(can(s, hex(w.c), 'viewChannel', ch)).toBe(true) // admin
  expect(can(s, hex(w.o), 'viewChannel', ch)).toBe(true) // owner
  expect(can(s, hex(w.b), 'viewChannel', open)).toBe(true)
  expect(can(s, hex(w.b), 'viewChannel', newId())).toBe(false)
  expect(can(s, hex(w.people[4]), 'viewChannel', open)).toBe(false) // not a member
  // Without manageChannels nothing changes; an override for a role that does not exist is refused
  w.by(w.b, 'channel.edit', { id: ch, overrides: {} })
  w.by(w.o, 'channel.edit', { id: ch, overrides: { [newId()]: { allow: ['viewChannel'] } } })
  expect(w.state().channels[0].overrides).toEqual(s.channels[0].overrides)
})

test('invites: a valid join works; expired, revoked, used up, wrong proof, banned and non-member joins do not', () => {
  const w = world()
  const [a, b, x, y, z] = w.people
  const inv = w.invite(w.o, { maxUses: 2 })
  w.join(w.o, a, inv)
  let s = w.state()
  expect(s.members[hex(a)]).toBeDefined()
  expect(s.invites[inv.id].uses).toBe(1)

  // A non-member hands in a join
  w.join(x, y, inv)
  // A proof made with another secret
  w.by(w.o, 'join', { invite: inv.id, key: hex(y), proof: joinProof(w.id, inv.id, hex(y), randomBytes(32)) })
  // A proof for someone else's key
  w.by(w.o, 'join', { invite: inv.id, key: hex(y), proof: joinProof(w.id, inv.id, hex(z), inv.secret) })
  expect(w.state().members[hex(y)]).toBeUndefined()

  // Uses are counted in replay order: of b and y, the earlier join takes the last use
  w.join(a, b, inv)
  w.join(w.o, y, inv)
  s = w.state()
  expect(s.members[hex(b)]).toBeDefined()
  expect(s.members[hex(y)]).toBeUndefined()
  expect(s.invites[inv.id].uses).toBe(2)

  const expiring = w.invite(w.o, { expires: 5000 })
  w.join(w.o, y, expiring, { ts: 6000 })
  expect(w.state().members[hex(y)]).toBeUndefined()
  // Backdated: an accepted op dated past the expiry replays before it
  w.by(w.o, 'server.edit', { name: 'later' }, { ts: 6000 })
  w.join(w.o, y, expiring, { ts: 1500 })
  expect(w.state().members[hex(y)]).toBeUndefined()

  const revoked = w.invite(w.o)
  w.by(w.o, 'invite.revoke', { id: revoked.id })
  w.join(w.o, y, revoked)
  expect(w.state().members[hex(y)]).toBeUndefined()

  const open = w.invite(w.o)
  w.by(w.o, 'ban', { key: hex(z) })
  w.join(w.o, z, open)
  expect(w.state().members[hex(z)]).toBeUndefined()
  w.join(w.o, y, open)
  expect(w.state().members[hex(y)]).toBeDefined()
})

test('kick and ban remove the member; a banned member is ignored until unbanned and joins afresh', () => {
  const w = world()
  const [a, b] = w.people
  const inv = w.invite(w.o)
  w.join(w.o, a, inv)
  w.join(w.o, b, inv)
  w.by(w.o, 'kick', { key: hex(a) })
  expect(w.state().members[hex(a)]).toBeUndefined()
  w.by(a, 'nickname', { key: hex(a), nick: 'back' }) // no longer a member
  w.join(w.o, a, inv)
  expect(w.state().members[hex(a)]).toEqual({ roles: [], joinedAt: expect.any(Number) })

  w.by(w.o, 'ban', { key: hex(b) })
  w.by(b, 'nickname', { key: hex(b), nick: 'still here' })
  w.join(w.o, b, inv)
  let s = w.state()
  expect(s.members[hex(b)]).toBeUndefined()
  expect(s.bans).toEqual([hex(b)])
  w.by(w.o, 'unban', { key: hex(b) })
  w.join(w.o, b, inv)
  s = w.state()
  expect(s.bans).toEqual([])
  expect(s.members[hex(b)]).toEqual({ roles: [], joinedAt: expect.any(Number) })
  expect(s.audit.filter((x) => x.kind === 'nickname')).toHaveLength(0)
})

test('a demotion racing the demoted moderator resolves the same way in every order', () => {
  const w = staffed()
  const n = Math.max(...w.ops.map((x) => x.n)) + 1
  // Concurrent: both written having seen the same log, so both carry the same n and the same seen
  const seen = w.seen()
  w.by(w.o, 'member.roles', { key: hex(w.a), roles: [], seen }, { n })
  w.by(w.a, 'kick', { key: hex(w.b), seen }, { n })
  const s = w.state()
  // They wait on each other: the owner outranks the moderator, so the demotion goes first and the kick fails
  expect(s.members[hex(w.b)]).toBeDefined()
  expect(s.members[hex(w.a)].roles).toEqual([])
  for (let i = 0; i < 10; i++) expect(w.state(shuffled(w.ops))).toEqual(s)
})

test('seq gaps: an author\'s ops after a missing one are ignored', () => {
  const w = world()
  w.by(w.o, 'server.edit', { name: 'one' })
  const gone = w.by(w.o, 'server.edit', { name: 'two' })
  w.by(w.o, 'server.edit', { name: 'three' })
  expect(w.state().name).toBe('three')
  expect(w.state(w.ops.filter((x) => x !== gone)).name).toBe('one')
  // A seq whose n does not grow is a gap too
  const back = signOp({ server: w.id, seq: 5, n: 1, ts: 2000, kind: 'server.edit', body: { name: 'back' } }, w.o)
  expect(w.state([...w.ops, back]).name).toBe('three')
})

test('backdating: a demoted moderator cannot act before their demotion with a low n', () => {
  for (const demote of ['member.roles', 'role.edit']) {
    const w = staffed()
    if (demote === 'member.roles') w.by(w.o, 'member.roles', { key: hex(w.a), roles: [] })
    else w.by(w.o, 'role.edit', { id: w.mod, perms: ['manageNicknames', 'createInvites'] })
    // The moderator has seen the demotion and signs a kick dated as early as their own run allows
    w.by(w.a, 'kick', { key: hex(w.b) }, { n: w.lowN(w.a) })
    w.by(w.a, 'member.roles', { key: hex(w.b), roles: [] }, { n: w.lowN(w.a) })
    const s = w.state()
    expect(s.members[hex(w.b)]).toEqual({ roles: [w.low], joinedAt: expect.any(Number) })
    for (let i = 0; i < 10; i++) expect(w.state(shuffled(w.ops))).toEqual(s)
  }
})

test('a kick made before the demotion, which the demoter had seen, still counts', () => {
  const w = staffed()
  w.by(w.a, 'kick', { key: hex(w.b) })
  w.by(w.o, 'member.roles', { key: hex(w.a), roles: [] })
  const s = w.state()
  expect(s.members[hex(w.b)]).toBeUndefined()
  expect(s.members[hex(w.a)].roles).toEqual([])
  for (let i = 0; i < 10; i++) expect(w.state(shuffled(w.ops))).toEqual(s)
})

test('concurrent cut ops that did not see each other resolve the same way in every order', () => {
  // The higher-ranked author goes first, whatever the n: the admin's demotion beats the moderator's kick
  for (const kickFirst of [true, false]) {
    for (const demote of ['member.roles', 'role.edit']) {
      const w = staffed()
      const seen = w.seen()
      const n = Math.max(...w.ops.map((x) => x.n))
      const body = demote === 'member.roles' ? { key: hex(w.a), roles: [] } : { id: w.mod, perms: ['manageRoles', 'manageNicknames', 'createInvites'] }
      w.by(w.c, demote, { ...body, seen }, { n: n + (kickFirst ? 5 : 1) })
      w.by(w.a, 'kick', { key: hex(w.b), seen }, { n: n + (kickFirst ? 1 : 5) })
      // Written after both, but with a low n: still after both cut ops, which did not see it
      w.by(w.o, 'nickname', { key: hex(w.o), nick: 'O' }, { n: w.lowN(w.o) })
      const s = w.state()
      expect(s.members[hex(w.b)]).toBeDefined()
      expect(s.members[hex(w.o)].nick).toBe('O')
      for (let i = 0; i < 10; i++) expect(w.state(shuffled(w.ops))).toEqual(s)
    }
  }

  // Equal ranks never act on each other; their concurrent edits fall back to (n, author, seq): the higher n lands last
  for (const aFirst of [true, false]) {
    const w = staffed()
    w.by(w.o, 'member.roles', { key: hex(w.c), roles: [w.mod] })
    const seen = w.seen()
    const n = Math.max(...w.ops.map((x) => x.n))
    w.by(w.a, 'role.edit', { id: w.low, name: 'by a', seen }, { n: n + (aFirst ? 1 : 2) })
    w.by(w.c, 'role.edit', { id: w.low, name: 'by c', seen }, { n: n + (aFirst ? 2 : 1) })
    const s = w.state()
    expect(s.roles.find((r) => r.id === w.low)!.name).toBe(aFirst ? 'by c' : 'by a')
    for (let i = 0; i < 10; i++) expect(w.state(shuffled(w.ops))).toEqual(s)
  }
})

test('a demoted moderator cannot claim not to have seen the demotion to backdate past it', () => {
  const w = staffed()
  w.by(w.a, 'nickname', { key: hex(w.a), nick: 'Mod' }, { n: 5 }) // the moderator's last op, long ago
  const before = w.seen()
  w.by(w.c, 'member.roles', { key: hex(w.a), roles: [] }, { n: 500 }) // the admin saw it
  // The moderator signs a kick just past their own last n, with a seen that leaves out the demotion
  w.by(w.a, 'kick', { key: hex(w.b), seen: before }, { n: 6 })
  const s = w.state()
  expect(s.members[hex(w.b)]).toBeDefined()
  expect(s.members[hex(w.a)].roles).toEqual([])
  for (let i = 0; i < 20; i++) expect(w.state(shuffled(w.ops))).toEqual(s)
})

test('a join written after invite.revoke is refused, however low its n', () => {
  const w = world()
  const [a, b, x, y] = w.people
  const inv = w.invite(w.o)
  w.join(w.o, a, inv)
  w.join(w.o, b, inv)
  w.by(w.o, 'invite.revoke', { id: inv.id })
  // a has seen the revoke (and writes after it); b has not, but b's join seq is past what the revoker saw of b
  w.by(a, 'nickname', { key: hex(a), nick: 'A' })
  w.join(a, x, inv, { n: w.lowN(a) })
  w.join(b, y, inv, { n: w.lowN(b) })
  const s = w.state()
  expect(s.members[hex(a)].nick).toBe('A')
  expect(s.members[hex(x)]).toBeUndefined()
  expect(s.members[hex(y)]).toBeUndefined()
  for (let i = 0; i < 10; i++) expect(w.state(shuffled(w.ops))).toEqual(s)
})

test('channel overrides carry only channel permissions', () => {
  const w = staffed()
  for (const p of ['kick', 'ban', 'administrator', 'manageRoles'] as Perm[]) {
    w.by(w.o, 'channel.add', { id: newId(), name: p, kind: 'text', overrides: { [w.low]: { allow: [p] } } })
    w.by(w.o, 'channel.add', { id: newId(), name: p, kind: 'text', overrides: { [w.low]: { deny: [p] } } })
  }
  expect(w.state().channels).toEqual([])
  const ch = newId()
  w.by(w.o, 'channel.add', { id: ch, name: 'mods', kind: 'text', overrides: { [w.low]: { allow: ['manageMessages', 'mentionEveryone'], deny: ['sendMessages'] } } })
  w.by(w.o, 'channel.edit', { id: ch, overrides: { [w.low]: { allow: ['ban'] } } })
  const s = w.state()
  expect(s.channels.map((c) => c.id)).toEqual([ch])
  expect(can(s, hex(w.b), 'manageMessages', ch)).toBe(true)
  expect(can(s, hex(w.b), 'sendMessages', ch)).toBe(false)
  expect(can(s, hex(w.b), 'ban', ch)).toBe(false)
  w.by(w.o, 'channel.edit', { id: ch, overrides: { [w.low]: { allow: ['speak'] } } })
  expect(w.state().channels[0].overrides).toEqual({ [w.low]: { allow: ['speak'], deny: [] } })
})

test('a cut op without seen, or with a malformed one, is ignored', () => {
  const w = staffed()
  const k = hex(w.b)
  const seq = w.seqs.get(hex(w.o))! + 1
  const many = Object.fromEntries(Array.from({ length: 5001 }, (_, i) => [i.toString(16).padStart(64, '0'), 1]))
  const bad = [undefined, null, 'x', [], { nope: 1 }, { [k]: -1 }, { [k]: 1.5 }, { [k]: '2' }, many]
  for (const seen of bad) {
    const op = signOp({ server: w.id, seq, n: 999, ts: 2000, kind: 'kick', body: { key: k, seen } }, w.o)
    expect(verifyOp(op, NOW)).toBe(false)
    expect(w.state([...w.ops, op]).members[k]).toBeDefined()
  }
  const plain = signOp({ server: w.id, seq, n: 999, ts: 2000, kind: 'channel.edit', body: { id: newId(), overrides: {} } }, w.o)
  expect(verifyOp(plain, NOW)).toBe(false)
  const good = signOp({ server: w.id, seq, n: 999, ts: 2000, kind: 'kick', body: { key: k, seen: w.seen() } }, w.o)
  expect(w.state([...w.ops, good]).members[k]).toBeUndefined()
})

test('20,000 ops with 200 cut ops replay in well under a second', () => {
  const w = staffed()
  const d = w.people[3]
  w.join(w.o, d, w.invite(w.o))
  const writers = [w.a, w.b, w.c, d]
  let stale = w.seen()
  for (let i = 0; w.ops.length < 20000; i++) {
    if (i % 100 === 50) {
      // Two cutters with a stale view, so cut ops are concurrent with each other and with recent writes
      w.by(i % 200 === 50 ? w.o : w.c, 'role.edit', { id: w.low, name: 'low' + i, seen: stale })
      stale = w.seen()
    } else {
      const kp = writers[i % writers.length]
      w.by(kp, 'nickname', { key: hex(kp), nick: 'n' + i })
    }
  }
  expect(w.ops.filter((x) => isCut(x.kind, x.body)).length).toBeGreaterThanOrEqual(200)
  // The first replay checks 20,000 signatures (most of a second on its own); every later one, as after each change in
  // servers.ts, reuses them and pays only for the ordering and the rules
  const s = w.state(shuffled(w.ops))
  expect(s.audit.length).toBeGreaterThan(19000)
  const t = performance.now()
  expect(w.state(shuffled(w.ops))).toEqual(s)
  expect(performance.now() - t).toBeLessThan(500)
}, 60_000)

test('an override edit checks only the entries it changes against the editor\'s rights, both ways', () => {
  const w = staffed()
  const d = w.people[3]
  w.join(w.o, d, w.invite(w.o))
  const chans = w.role('chans', ['manageChannels'])
  w.by(w.o, 'member.roles', { key: hex(d), roles: [chans] })
  const ch = newId()
  w.by(w.o, 'channel.add', { id: ch, name: 'mods', kind: 'text', overrides: { [w.low]: { allow: ['manageMessages'] } } })
  // d lacks manageMessages: an entry they leave alone does not block their edit
  w.by(d, 'channel.edit', { id: ch, overrides: { [w.low]: { allow: ['manageMessages'] }, [w.id]: { deny: ['sendMessages'] } } })
  const kept = { [w.low]: { allow: ['manageMessages'], deny: [] }, [w.id]: { allow: [], deny: ['sendMessages'] } }
  expect(w.state().channels[0].overrides).toEqual(kept)
  // but taking it away, dropping the entry holding it, or handing it to another role is still refused
  w.by(d, 'channel.edit', { id: ch, overrides: { [w.low]: { allow: [] }, [w.id]: { deny: ['sendMessages'] } } })
  w.by(d, 'channel.edit', { id: ch, overrides: { [w.id]: { deny: ['sendMessages'] } } })
  w.by(d, 'channel.edit', { id: ch, overrides: { ...kept, [w.mod]: { allow: ['manageMessages'] } } })
  expect(w.state().channels[0].overrides).toEqual(kept)
})

test('the audit names who or what each op acted on', () => {
  const w = staffed()
  const ch = newId()
  w.by(w.o, 'channel.add', { id: ch, name: 'x', kind: 'text' })
  w.by(w.o, 'kick', { key: hex(w.b) })
  const audit = w.state().audit
  expect(audit[0]).not.toHaveProperty('target') // create
  expect(audit.find((x) => x.kind === 'role.add')!.target).toBe(w.admin)
  expect(audit.find((x) => x.kind === 'join')!.target).toBe(hex(w.a))
  expect(audit.find((x) => x.kind === 'invite.add')!.target).toMatch(/^[0-9a-f]{32}$/)
  expect(audit.slice(-2).map((x) => x.target)).toEqual([ch, hex(w.b)])
})
