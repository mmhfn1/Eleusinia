import { createHash } from 'node:crypto'
import crypto from 'hypercore-crypto'
import { type Key, isGroupId, isKey, isPicture } from './protocol'
import { EDIT_AHEAD_MS } from './sync'

// A server is an append-only log of signed operations. Every member replays the same ops in one order (`order`) and
// accepts each only if its author had the right at that point, so the same ops always give the same server.

export const PERMS = [
  'manageServer', 'manageRoles', 'manageChannels', 'createInvites', 'viewAuditLog',
  'kick', 'ban', 'changeNickname', 'manageNicknames',
  'viewChannel', 'sendMessages', 'manageMessages', 'mentionEveryone',
  'connect', 'speak', 'muteMembers', 'deafenMembers', 'moveMembers',
  'administrator',
] as const
export type Perm = (typeof PERMS)[number]
export const EVERYONE_PERMS: Perm[] = ['createInvites', 'changeNickname', 'viewChannel', 'sendMessages', 'connect', 'speak']

export type Op = { server: string; author: Key; seq: number; n: number; ts: number; kind: string; body: unknown; sig: string }
export type Role = { id: string; name: string; color: number; hoist: boolean; perms: Perm[] }
export type Override = { allow: Perm[]; deny: Perm[] }
export type ChannelKind = 'text' | 'voice' | 'category'
export type Channel = { id: string; name: string; kind: ChannelKind; parent?: string; topic?: string; userLimit?: number; position: number; overrides: Record<string, Override> }
export type Member = { roles: string[]; nick?: string; joinedAt: number }
export type Invite = { id: string; pub: Key; by: Key; expires?: number; maxUses?: number; uses: number; revoked: boolean }
export type ServerState = {
  id: string
  owner: Key
  name: string
  avatar: string
  roles: Role[] // index = position: @everyone (id = server id) at 0, higher = more power
  members: Record<Key, Member>
  channels: Channel[]
  invites: Record<string, Invite>
  bans: Key[]
  voice: Record<Key, { mute?: true; deafen?: true }> // server mute and deafen, kept across a leave so rejoining does not lift them
  // target: the key, role, channel or invite acted on; channel: where voice.move sent them
  audit: { author: Key; kind: string; n: number; ts: number; target?: string; channel?: string }[]
}
type KeyPair = { publicKey: Buffer; secretKey: Buffer }

const KINDS = new Set(['create', 'server.edit', 'role.add', 'role.edit', 'role.delete', 'role.move', 'member.roles', 'channel.add', 'channel.edit', 'channel.delete', 'channel.move', 'invite.add', 'invite.revoke', 'join', 'leave', 'kick', 'ban', 'unban', 'nickname', 'voice.mute', 'voice.deafen', 'voice.move', 'voice.disconnect'])
const MAX_ROLES = 250
const MAX_CHANNELS = 500
const MAX_INVITES = 1000
const MAX_BANS = 5000
const MAX_OP = 70000 // a server picture (60000) plus the rest
// shortcut: 1000 members per server (the roadmap aims at ~200), raise once big servers are tried for real
export const MAX_MEMBERS = 1000
// shortcut: a cut op's `seen` names at most 5000 authors, so a server with more authors ever cannot cut any more;
// needs snapshots (which would also bound replay) before then
const MAX_SEEN = 5000
const SEEN_BYTES = 90 // one `seen` entry at most: a quoted key, a colon, a 16-digit number, a comma
// What a channel override may grant or take away: channel matters only, never server-wide power like kick or ban
const CHANNEL_PERMS: readonly Perm[] = ['viewChannel', 'sendMessages', 'manageMessages', 'mentionEveryone', 'connect', 'speak', 'muteMembers', 'deafenMembers', 'moveMembers']
const TARGET_KEY = new Set(['kick', 'ban', 'unban', 'member.roles', 'nickname', 'join', 'voice.mute', 'voice.deafen', 'voice.move', 'voice.disconnect'])
const CUT_KINDS = new Set(['role.edit', 'role.delete', 'role.move', 'member.roles', 'kick', 'ban', 'invite.revoke', 'channel.delete'])

const isSig = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f]{128}$/.test(s)
const isId = isGroupId // role, channel and invite ids are 32 hex like the server id
const isObj = (x: unknown): x is Record<string, any> => !!x && typeof x === 'object' && !Array.isArray(x)
const isName = (x: unknown, max = 100): x is string => typeof x === 'string' && x.trim().length > 0 && x.length <= max
const isColor = (x: unknown): x is number => Number.isSafeInteger(x) && (x as number) >= 0 && (x as number) <= 0xffffff
// Ops that can take power away. They carry `seen`, the author's highest held seq per author when signing, which pins
// them after what they saw and before what they did not, so nobody can backdate an op past a cut that removed their right.
export const isCut = (kind: string, body: unknown) => CUT_KINDS.has(kind) || (kind === 'channel.edit' && isObj(body) && body.overrides !== undefined)
const isSeen = (x: unknown): x is Record<Key, number> =>
  isObj(x) && Object.keys(x).length <= MAX_SEEN && Object.entries(x).every(([k, v]) => isKey(k) && Number.isSafeInteger(v) && v >= 0)
const permList = (x: unknown): Perm[] | null =>
  Array.isArray(x) && x.length <= PERMS.length && x.every((p) => (PERMS as readonly unknown[]).includes(p)) ? PERMS.filter((p) => x.includes(p)) : null

// Keys sorted at every level, so the signed bytes do not depend on how the sender built the object.
const canon = (x: any): string =>
  Array.isArray(x)
    ? `[${x.map(canon).join(',')}]`
    : isObj(x)
      ? `{${Object.keys(x).filter((k) => x[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canon(x[k])}`).join(',')}}`
      : (JSON.stringify(x) ?? 'null')
const opBytes = (o: Omit<Op, 'sig'>) =>
  Buffer.from(`eleusinia-server-op:${canon({ server: o.server, author: o.author, seq: o.seq, n: o.n, ts: o.ts, kind: o.kind, body: o.body })}`)

export const serverIdOf = (owner: Key, nonce: string) => createHash('sha256').update(`eleusinia-server:${owner}:${nonce}`).digest('hex').slice(0, 32)

export const signOp = (o: Omit<Op, 'author' | 'sig'>, kp: KeyPair): Op => {
  const op = { ...o, author: kp.publicKey.toString('hex') }
  return { ...op, sig: crypto.sign(opBytes(op), kp.secretKey).toString('hex') }
}

// Op objects whose signature checked out: a log is replayed whole after every change, and ed25519 is most of its cost.
// Nothing changes an op object once made (the log keeps what it parsed), so the object stands for its bytes.
const verified = new WeakSet<object>()

export function verifyOp(o: any, now = Date.now()): o is Op {
  try {
    if (
      !isObj(o) || !isId(o.server) || !isKey(o.author) || !KINDS.has(o.kind) || !isObj(o.body) || !isSig(o.sig) ||
      !Number.isSafeInteger(o.seq) || o.seq < 1 || !Number.isSafeInteger(o.n) || o.n < 1 ||
      !Number.isSafeInteger(o.ts) || o.ts < 1 || o.ts > now + EDIT_AHEAD_MS
    ) return false
    const cut = isCut(o.kind, o.body)
    if (cut && !isSeen(o.body.seen)) return false
    if (verified.has(o)) return true
    const bytes = opBytes(o as Op)
    const ok = bytes.length <= MAX_OP + (cut ? SEEN_BYTES * Object.keys(o.body.seen).length : 0) && crypto.verify(bytes, Buffer.from(o.sig, 'hex'), Buffer.from(o.author, 'hex'))
    if (ok) verified.add(o)
    return ok
  } catch {
    return false // e.g. a body nested deep enough to overflow canon
  }
}

export function createServer(name: string, kp: KeyPair, now = Date.now()): { id: string; op: Op } {
  const nonce = crypto.randomBytes(16).toString('hex')
  const id = serverIdOf(kp.publicKey.toString('hex'), nonce)
  return { id, op: signOp({ server: id, seq: 1, n: 1, ts: now, kind: 'create', body: { nonce, name } }, kp) }
}

// The invite secret travels only in the link; the log holds the public half. The joiner proves they hold the link by
// signing their own key (and where it is used) with it.
export const inviteKeyPair = (secret: Buffer): KeyPair => crypto.keyPair(secret)
const joinBytes = (server: string, invite: string, key: Key) => Buffer.from(`eleusinia-server-join:${server}:${invite}:${key}`)
export const joinProof = (server: string, invite: string, key: Key, secret: Buffer) =>
  crypto.sign(joinBytes(server, invite, key), inviteKeyPair(secret).secretKey).toString('hex') as string
export const verifyJoin = (server: string, inv: { id: string; pub: Key }, key: Key, proof: unknown): boolean =>
  isSig(proof) && crypto.verify(joinBytes(server, inv.id, key), Buffer.from(proof, 'hex'), Buffer.from(inv.pub, 'hex'))

const roleIx = (s: ServerState, id: unknown) => s.roles.findIndex((r) => r.id === id)
const highest = (s: ServerState, k: Key) => (k === s.owner ? Infinity : Math.max(0, ...(s.members[k]?.roles ?? []).map((r) => roleIx(s, r))))

export function permsOf(s: ServerState, key: Key, channelId?: string): Set<Perm> {
  const m = Object.hasOwn(s.members, key) ? s.members[key] : undefined
  if (!m) return new Set()
  const mine = s.roles.filter((r) => r.id === s.id || m.roles.includes(r.id))
  const out = new Set(mine.flatMap((r) => r.perms))
  if (key === s.owner || out.has('administrator')) return new Set(PERMS)
  if (channelId === undefined) return out
  const ch = s.channels.find((c) => c.id === channelId)
  if (!ch) return new Set()
  const apply = (os: Override[]) => {
    for (const o of os) for (const p of o.deny) out.delete(p)
    for (const o of os) for (const p of o.allow) out.add(p)
  }
  apply(ch.overrides[s.id] ? [ch.overrides[s.id]] : [])
  apply(mine.filter((r) => r.id !== s.id && ch.overrides[r.id]).map((r) => ch.overrides[r.id]))
  return out
}
export const can = (s: ServerState, key: Key, perm: Perm, channelId?: string) => permsOf(s, key, channelId).has(perm)

// Nobody hands out (or takes away) a permission they do not hold themselves; owner and administrators hold them all.
const grants = (s: ServerState, a: Key, ps: Perm[]) => {
  const mine = permsOf(s, a)
  return ps.every((p) => mine.has(p))
}

function overridesOf(s: ServerState, x: unknown): Record<string, Override> | null {
  if (!isObj(x) || Object.keys(x).length > MAX_ROLES) return null
  const out: Record<string, Override> = {}
  for (const [id, o] of Object.entries(x)) {
    const allow = permList(o?.allow ?? []), deny = permList(o?.deny ?? [])
    if (roleIx(s, id) < 0 || !isObj(o) || !allow || !deny || ![...allow, ...deny].every((p) => CHANNEL_PERMS.includes(p))) return null
    out[id] = { allow, deny }
  }
  return out
}

// A channel with the fields of `b` applied: undefined keeps a field, null clears it.
function channelWith(s: ServerState, a: Key, c: Channel, b: Record<string, any>): Channel | null {
  const next: any = { ...c }
  for (const k of ['name', 'topic', 'userLimit', 'parent']) if (b[k] === null) delete next[k]; else if (b[k] !== undefined) next[k] = b[k]
  if (!isName(next.name)) return null
  if (next.topic !== undefined && (typeof next.topic !== 'string' || next.topic.length > 1024 || next.kind === 'category')) return null
  if (next.userLimit !== undefined && (next.kind !== 'voice' || !Number.isSafeInteger(next.userLimit) || next.userLimit < 0 || next.userLimit > 99)) return null
  if (next.parent !== undefined && (next.kind === 'category' || s.channels.find((x) => x.id === next.parent)?.kind !== 'category')) return null
  if (b.overrides !== undefined) {
    const ov = overridesOf(s, b.overrides)
    // Only what changed must be the editor's to give or take: an entry they did not touch may hold rights they lack
    const was = c.overrides
    const changed = ov && [...new Set([...Object.keys(was), ...Object.keys(ov)])].flatMap((id) =>
      PERMS.filter((p) => (['allow', 'deny'] as const).some((x) => !!was[id]?.[x].includes(p) !== !!ov[id]?.[x].includes(p))))
    if (!ov || !grants(s, a, changed!)) return null
    next.overrides = ov
  }
  return next
}

const move = <T>(list: T[], from: number, to: number) => {
  const next = [...list]
  next.splice(to, 0, ...next.splice(from, 1))
  return next
}

// Applies one op from a current member; returns false, changing nothing, when it is not allowed or not well formed.
// `latest`: the newest ts of an op accepted before this one.
function apply(s: ServerState, o: Op, latest: number): boolean {
  const a = o.author
  const b = o.body as Record<string, any>
  const p = permsOf(s, a)
  const h = highest(s, a)
  const member = (k: unknown) => isKey(k) && Object.hasOwn(s.members, k)
  const below = (k: unknown) => member(k) && k !== s.owner && highest(s, k as Key) < h
  switch (o.kind) {
    case 'server.edit': {
      if (!p.has('manageServer') || (b.name !== undefined && !isName(b.name)) || (b.avatar !== undefined && b.avatar !== '' && !isPicture(b.avatar))) return false
      s.name = b.name ?? s.name
      s.avatar = b.avatar ?? s.avatar
      return true
    }
    case 'role.add': {
      const ps = permList(b.perms ?? [])
      const color = b.color ?? 0, hoist = b.hoist ?? false
      if (!p.has('manageRoles') || h < 1 || !isId(b.id) || roleIx(s, b.id) >= 0 || s.roles.length >= MAX_ROLES || !isName(b.name) || !ps || !isColor(color) || typeof hoist !== 'boolean' || !grants(s, a, ps)) return false
      s.roles.splice(1, 0, { id: b.id, name: b.name, color, hoist, perms: ps }) // new roles start at the bottom, below the author's
      return true
    }
    case 'role.edit': {
      const i = roleIx(s, b.id)
      const r = s.roles[i]
      const ps = b.perms === undefined ? r?.perms : permList(b.perms)
      if (!p.has('manageRoles') || i < 0 || i >= h || !ps || (b.name !== undefined && !isName(b.name)) || (b.color !== undefined && !isColor(b.color)) || (b.hoist !== undefined && typeof b.hoist !== 'boolean')) return false
      const changed = PERMS.filter((x) => ps.includes(x) !== r.perms.includes(x))
      if (!grants(s, a, changed)) return false
      s.roles[i] = { ...r, name: b.name ?? r.name, color: b.color ?? r.color, hoist: b.hoist ?? r.hoist, perms: ps }
      return true
    }
    case 'role.delete': {
      const i = roleIx(s, b.id)
      if (!p.has('manageRoles') || i < 1 || i >= h) return false
      s.roles.splice(i, 1)
      for (const m of Object.values(s.members)) m.roles = m.roles.filter((x) => x !== b.id)
      for (const c of s.channels) delete c.overrides[b.id]
      return true
    }
    case 'role.move': {
      const i = roleIx(s, b.id)
      if (!p.has('manageRoles') || i < 1 || i >= h || !Number.isSafeInteger(b.to) || b.to < 1 || b.to >= s.roles.length) return false
      const roles = move(s.roles, i, b.to)
      if (b.to >= highest({ ...s, roles }, a)) return false // it must stay below the mover
      s.roles = roles
      return true
    }
    case 'member.roles': {
      const want = Array.isArray(b.roles) && b.roles.length <= MAX_ROLES ? [...new Set(b.roles)] : null
      if (!p.has('manageRoles') || !member(b.key) || b.key === s.owner || highest(s, b.key) >= h || !want || !want.every((r) => roleIx(s, r) >= 1)) return false
      const m = s.members[b.key]
      const changed = [...want.filter((r) => !m.roles.includes(r as string)), ...m.roles.filter((r) => !want.includes(r))]
      if (changed.some((r) => roleIx(s, r) >= h)) return false
      m.roles = s.roles.filter((r) => want.includes(r.id)).map((r) => r.id)
      return true
    }
    case 'channel.add': {
      if (!p.has('manageChannels') || !isId(b.id) || s.channels.some((c) => c.id === b.id) || s.channels.length >= MAX_CHANNELS || !['text', 'voice', 'category'].includes(b.kind)) return false
      const c = channelWith(s, a, { id: b.id, name: '', kind: b.kind, position: s.channels.length, overrides: {} }, b)
      if (!c) return false
      s.channels.push(c)
      return true
    }
    case 'channel.edit': {
      const i = s.channels.findIndex((c) => c.id === b.id)
      const c = i >= 0 && p.has('manageChannels') ? channelWith(s, a, s.channels[i], b) : null
      if (!c) return false
      s.channels[i] = c
      return true
    }
    case 'channel.delete': {
      const i = s.channels.findIndex((c) => c.id === b.id)
      if (!p.has('manageChannels') || i < 0) return false
      s.channels.splice(i, 1)
      for (const c of s.channels) if (c.parent === b.id) delete c.parent
      s.channels.forEach((c, j) => (c.position = j))
      return true
    }
    case 'channel.move': {
      const i = s.channels.findIndex((c) => c.id === b.id)
      if (!p.has('manageChannels') || i < 0 || !Number.isSafeInteger(b.to) || b.to < 0 || b.to >= s.channels.length) return false
      s.channels = move(s.channels, i, b.to)
      s.channels.forEach((c, j) => (c.position = j))
      return true
    }
    case 'invite.add': {
      if (
        !p.has('createInvites') || !isId(b.id) || Object.hasOwn(s.invites, b.id) || Object.keys(s.invites).length >= MAX_INVITES || !isKey(b.pub) ||
        (b.expires !== undefined && (!Number.isSafeInteger(b.expires) || b.expires < 1)) ||
        (b.maxUses !== undefined && (!Number.isSafeInteger(b.maxUses) || b.maxUses < 1 || b.maxUses > MAX_MEMBERS))
      ) return false
      s.invites[b.id] = { id: b.id, pub: b.pub, by: a, ...(b.expires !== undefined && { expires: b.expires }), ...(b.maxUses !== undefined && { maxUses: b.maxUses }), uses: 0, revoked: false }
      return true
    }
    case 'invite.revoke': {
      const inv = isId(b.id) && Object.hasOwn(s.invites, b.id) ? s.invites[b.id] : undefined
      if (!inv || inv.revoked || !(p.has('createInvites') || inv.by === a)) return false
      inv.revoked = true
      return true
    }
    case 'join': {
      const inv = isId(b.invite) && Object.hasOwn(s.invites, b.invite) ? s.invites[b.invite] : undefined
      if (
        !inv || inv.revoked || !isKey(b.key) || member(b.key) || s.bans.includes(b.key) || Object.keys(s.members).length >= MAX_MEMBERS ||
        // The writer picks the join's ts, so an accepted op dated past the expiry that replays before it counts too.
        // shortcut: a writer who backdates both ts and n can still slip one in; any member with createInvites could
        // make a fresh invite anyway, so expiry guards against stale links, not against the members writing joins
        (inv.expires !== undefined && Math.max(o.ts, latest) > inv.expires) || (inv.maxUses !== undefined && inv.uses >= inv.maxUses) ||
        !verifyJoin(s.id, inv, b.key, b.proof)
      ) return false
      inv.uses++
      s.members[b.key] = { roles: [], joinedAt: o.ts }
      return true
    }
    case 'leave': {
      if (a === s.owner) return false // shortcut: the owner cannot leave until ownership can be handed over
      delete s.members[a]
      return true
    }
    case 'kick': {
      if (!p.has('kick') || !member(b.key) || b.key === s.owner || highest(s, b.key) >= h) return false
      delete s.members[b.key]
      return true
    }
    case 'ban': {
      if (!p.has('ban') || !isKey(b.key) || b.key === s.owner || s.bans.includes(b.key) || s.bans.length >= MAX_BANS || (member(b.key) && highest(s, b.key) >= h)) return false
      delete s.members[b.key]
      s.bans = [...s.bans, b.key].sort()
      return true
    }
    case 'unban': {
      if (!p.has('ban') || !s.bans.includes(b.key)) return false
      s.bans = s.bans.filter((k) => k !== b.key)
      return true
    }
    case 'nickname': {
      if (!member(b.key) || (b.nick !== null && !isName(b.nick, 32)) || !p.has(b.key === a ? 'changeNickname' : 'manageNicknames')) return false
      if (b.nick === null) delete s.members[b.key].nick
      else s.members[b.key].nick = b.nick
      return true
    }
    // Voice moderation, checked like kick. Not cut ops: they change no one's rights in the replay, so where they land
    // among others' ops changes nothing; an author demoted by a cut that did not see them is refused as for any op.
    case 'voice.mute':
    case 'voice.deafen': {
      const flag = o.kind === 'voice.mute' ? 'mute' : 'deafen'
      if (!p.has(o.kind === 'voice.mute' ? 'muteMembers' : 'deafenMembers') || !below(b.key) || typeof b.on !== 'boolean') return false
      const v = { ...s.voice[b.key] }
      if (b.on) v[flag] = true
      else delete v[flag]
      if (v.mute || v.deafen) s.voice[b.key] = v
      else delete s.voice[b.key]
      return true
    }
    case 'voice.move': {
      const c = s.channels.find((x) => x.id === b.channel)
      return p.has('moveMembers') && below(b.key) && c?.kind === 'voice' && can(s, b.key, 'viewChannel', c.id) && can(s, b.key, 'connect', c.id)
    }
    case 'voice.disconnect':
      return p.has('moveMembers') && below(b.key)
  }
  return false
}

function created(o: Op, id: string): ServerState | null {
  const b = o.body as Record<string, any>
  if (o.kind !== 'create' || o.seq !== 1 || o.server !== id || typeof b.nonce !== 'string' || !/^[0-9a-f]{32}$/.test(b.nonce) || serverIdOf(o.author, b.nonce) !== id || !isName(b.name)) return null
  return {
    id,
    owner: o.author,
    name: b.name,
    avatar: '',
    roles: [{ id, name: '@everyone', color: 0, hoist: false, perms: [...EVERYONE_PERMS] }],
    members: { [o.author]: { roles: [], joinedAt: o.ts } },
    channels: [],
    invites: {},
    bans: [],
    voice: {},
    audit: [],
  }
}

const before = (x: Op, y: Op) => x.n - y.n || (x.author < y.author ? -1 : x.author > y.author ? 1 : x.seq - y.seq)

// The replay order of the authors' runs: a topological order (Kahn's, lowest (n, author, seq) first) where an author's
// ops keep seq order and every cut op comes after the ops it saw and before every op of another author it did not.
// Cut ops that did not see each other wait on each other: then the one whose author ranks highest in the state replayed
// so far goes first (`rank`, read lazily as ops are yielded), ties by (n, author, seq). Demoting, kicking or banning
// someone takes a rank above theirs, so the senior side of a race wins whatever the junior claims in `seen`.
function* order(runs: Op[][], rank: (k: Key) => number): Generator<Op> {
  const ops = runs.flat()
  const first: number[] = []
  for (let r = 0, i = 0; r < runs.length; i += runs[r++].length) first.push(i)
  const succ: number[][] = ops.map(() => [])
  const sawBy: number[][] = ops.map(() => []) // from an op to the cut ops that saw it
  const indeg = new Int32Array(ops.length)
  const waits = new Int32Array(ops.length) // a cut op's seen ops not replayed yet
  runs.forEach((run, r) => run.forEach((_, j) => j && (succ[first[r] + j - 1].push(first[r] + j), indeg[first[r] + j]++)))
  ops.forEach((c, i) => {
    if (!isCut(c.kind, c.body)) return
    const seen = (c.body as { seen: Record<Key, number> }).seen
    runs.forEach((run, r) => {
      if (run[0].author === c.author) return
      const k = Math.min(seen[run[0].author] ?? 0, run.length)
      if (k > 0) sawBy[first[r] + k - 1].push(i), indeg[i]++, waits[i]++
      if (k < run.length) succ[i].push(first[r] + k), indeg[first[r] + k]++
    })
  })

  const heap: number[] = []
  const less = (a: number, b: number) => before(ops[a], ops[b]) < 0
  const push = (x: number) => {
    let i = heap.push(x) - 1
    while (i && less(x, heap[(i - 1) >> 1])) heap[i] = heap[(i - 1) >> 1], i = (i - 1) >> 1
    heap[i] = x
  }
  const pop = () => {
    const top = heap[0], x = heap.pop()!
    if (!heap.length) return top
    let i = 0
    for (;;) {
      let c = 2 * i + 1
      if (c >= heap.length) break
      if (c + 1 < heap.length && less(heap[c + 1], heap[c])) c++
      if (!less(heap[c], x)) break
      heap[i] = heap[c], i = c
    }
    heap[i] = x
    return top
  }
  const done = new Uint8Array(ops.length)
  const head = [...first] // each run's first op not replayed yet
  // A cycle: free the top-ranked cut op at the head of its run with all its seen ops in, else (forged seen) the lowest head
  const stuck = () => {
    let best = -1, tier = 0, top = -Infinity
    runs.forEach((run, r) => {
      while (head[r] < first[r] + run.length && done[head[r]]) head[r]++
      const i = head[r]
      if (i >= first[r] + run.length) return
      const t = isCut(ops[i].kind, ops[i].body) && !waits[i] ? 2 : 1
      const rk = t === 2 ? rank(ops[i].author) : 0
      if (t > tier || (t === tier && (rk > top || (rk === top && less(i, best))))) best = i, tier = t, top = rk
    })
    return best
  }
  ops.forEach((_, i) => indeg[i] || push(i))
  for (let left = ops.length; left; left--) {
    const i = heap.length ? pop() : stuck()
    done[i] = 1
    yield ops[i]
    for (const j of succ[i]) if (!--indeg[j] && !done[j]) push(j)
    for (const j of sawBy[i]) if ((waits[j]--, !--indeg[j]) && !done[j]) push(j)
  }
}

// `id` picks the server when the ops hold more than one; by default the lowest id a valid create proves.
export function replay(ops: unknown[], now = Date.now(), id?: string): ServerState | null {
  const valid = ops.filter((o): o is Op => verifyOp(o, now))
  id ??= valid
    .filter((o) => o.kind === 'create' && serverIdOf(o.author, String((o.body as any).nonce)) === o.server)
    .map((o) => o.server)
    .sort()[0]
  if (!id) return null
  // An author who signed two different ops with the same seq gets the same one picked everywhere: the lower signature.
  const slot = new Map<string, Op>()
  for (const o of valid) {
    const k = `${o.author}:${o.seq}`
    const had = slot.get(k)
    if (o.server === id && (!had || o.sig < had.sig)) slot.set(k, o)
  }
  const byAuthor = new Map<Key, Op[]>()
  for (const o of slot.values()) byAuthor.set(o.author, [...(byAuthor.get(o.author) ?? []), o])
  // Each author's run counts only up to the first gap, and its n must grow with seq, so a later op never replays first.
  const runs: Op[][] = []
  for (const list of byAuthor.values()) {
    list.sort((x, y) => x.seq - y.seq)
    let i = 0
    while (i < list.length && list[i].seq === i + 1 && (i === 0 || list[i].n > list[i - 1].n)) i++
    if (i) runs.push(list.slice(0, i))
  }
  let s: ServerState | null = null
  let latest = 0
  const rank = (k: Key) => (s && Object.hasOwn(s.members, k) ? highest(s, k) : -1)
  for (const o of order(runs, rank)) {
    const ok: boolean = s ? o.kind !== 'create' && Object.hasOwn(s.members, o.author) && apply(s, o, latest) : !!(s = created(o, id))
    if (!ok) continue
    const b = o.body as Record<string, unknown>
    const target = TARGET_KEY.has(o.kind) ? b.key : /^(role|channel|invite)\./.test(o.kind) ? b.id : undefined
    s!.audit.push({ author: o.author, kind: o.kind, n: o.n, ts: o.ts, ...(typeof target === 'string' && { target }), ...(o.kind === 'voice.move' && { channel: b.channel as string }) })
    latest = Math.max(latest, o.ts)
  }
  return s
}
