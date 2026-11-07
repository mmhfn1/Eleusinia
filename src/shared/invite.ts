import { createHash, randomBytes } from 'node:crypto'
import { type Key, type Profile, cleanProfile, isGroupId, isKey } from './protocol'
import { MAX_MEMBERS, type ServerState, inviteKeyPair, verifyJoin } from './server'

// Invite links and the join handshake, with no networking. The link carries the server, the invite, its secret and one
// or two members likely online; a stranger asks one of them with `joinAsk`, and that member writes the `join` op.

export const INVITE_PREFIX = 'eleusinia://invite/'
const HEAD = 1 + 16 + 16 + 32 // version, server id, invite id, secret
const MAX_LINK = 400 // well past the longest real link (2 contacts: 172 payload chars plus the prefix), so junk is cut early

export type InviteLink = { server: string; invite: string; secret: Buffer; contacts: Key[] }

export function makeInvite({ server, invite, secret, contacts }: InviteLink): string {
  if (!isGroupId(server) || !isGroupId(invite) || secret.length !== 32 || contacts.length < 1 || contacts.length > 2 || !contacts.every(isKey))
    throw new Error('bad invite')
  const bytes = Buffer.concat([Buffer.from([1]), Buffer.from(server, 'hex'), Buffer.from(invite, 'hex'), secret, ...[...new Set(contacts)].map((k) => Buffer.from(k, 'hex'))])
  return INVITE_PREFIX + bytes.toString('base64url')
}

// Accepts the full link, the bare payload, or either broken by spaces or line breaks when pasted; null on anything else.
export function parseInvite(text: unknown): InviteLink | null {
  if (typeof text !== 'string' || text.length > MAX_LINK) return null
  let s = text.replace(/\s+/g, '')
  if (s.toLowerCase().startsWith(INVITE_PREFIX)) s = s.slice(INVITE_PREFIX.length)
  if (s.endsWith('/')) s = s.slice(0, -1)
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null
  const b = Buffer.from(s, 'base64url')
  // Only the one encoding we make, so a link has a single spelling and stray characters are not silently dropped.
  if (b.toString('base64url') !== s || b[0] !== 1 || (b.length !== HEAD + 32 && b.length !== HEAD + 64)) return null
  const contacts: Key[] = []
  for (let i = HEAD; i < b.length; i += 32) contacts.push(b.subarray(i, i + 32).toString('hex'))
  if (contacts.length === 2 && contacts[0] === contacts[1]) return null
  return { server: b.subarray(1, 17).toString('hex'), invite: b.subarray(17, 33).toString('hex'), secret: Buffer.from(b.subarray(33, 65)), contacts }
}

// A fresh invite: the body for the `invite.add` op (only the public half of the secret goes in the log) and the secret.
export function newInvite(opts: { expires?: number; maxUses?: number } = {}) {
  const secret = randomBytes(32)
  const body = {
    id: randomBytes(16).toString('hex'),
    pub: inviteKeyPair(secret).publicKey.toString('hex') as Key,
    ...(opts.expires !== undefined && { expires: opts.expires }),
    ...(opts.maxUses !== undefined && { maxUses: opts.maxUses }),
  }
  return { body, secret }
}

// Members announce this while online, so a joiner whose link contacts are offline can still find someone.
export const serverTopic = (serverId: string) => createHash('sha256').update('eleusinia-server-topic:' + serverId).digest()
// A joiner announces themselves here before dialing; a member they knock on looks here to let them link and ask.
export const joinTopic = (serverId: string) => createHash('sha256').update('eleusinia-server-joiners:' + serverId).digest()

export type JoinAsk = { t: 'joinAsk'; server: string; invite: string; key: Key; proof: string; profile?: Profile }
export const JOIN_REASONS = ['server', 'unknown', 'revoked', 'expired', 'used', 'banned', 'member', 'full', 'proof', 'busy'] as const
export type JoinReason = (typeof JOIN_REASONS)[number]
export type JoinAnswer = { t: 'joinOk'; server: string } | { t: 'joinNo'; server: string; why: JoinReason }

const isSig = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f]{128}$/.test(s)

// A join ask from a stranger, checked field by field; the profile is cleaned, never trusted as sent.
export function isJoinAsk(x: any): x is JoinAsk {
  return !!x && typeof x === 'object' && x.t === 'joinAsk' && isGroupId(x.server) && isGroupId(x.invite) && isKey(x.key) && isSig(x.proof) &&
    (x.profile === undefined || (!!x.profile && typeof x.profile === 'object'))
}
export const cleanJoinAsk = (x: JoinAsk): JoinAsk =>
  ({ t: 'joinAsk', server: x.server, invite: x.invite, key: x.key, proof: x.proof, ...(x.profile !== undefined && { profile: cleanProfile(x.profile) }) })

export const isJoinAnswer = (x: any): x is JoinAnswer =>
  !!x && typeof x === 'object' && isGroupId(x.server) && (x.t === 'joinOk' || (x.t === 'joinNo' && (JOIN_REASONS as readonly unknown[]).includes(x.why)))

// Why `replay` would ignore a join for this ask written now, or 'ok'. Same rules as the `join` case in server.ts, so a
// member refuses with a reason instead of writing a join nobody accepts.
export function checkJoinAsk(s: ServerState, ask: JoinAsk, now: number): JoinReason | 'ok' {
  if (ask.server !== s.id) return 'server'
  const inv = Object.hasOwn(s.invites, ask.invite) ? s.invites[ask.invite] : undefined
  if (!inv) return 'unknown'
  if (!verifyJoin(s.id, inv, ask.key, ask.proof)) return 'proof'
  if (inv.revoked) return 'revoked'
  if (s.bans.includes(ask.key)) return 'banned'
  if (Object.hasOwn(s.members, ask.key)) return 'member'
  if (inv.expires !== undefined && now > inv.expires) return 'expired'
  if (inv.maxUses !== undefined && inv.uses >= inv.maxUses) return 'used'
  if (Object.keys(s.members).length >= MAX_MEMBERS) return 'full'
  return 'ok'
}

// Whom a joiner asks, in order: the link's contacts, then members found on the server topic; never ourselves, at most max.
export const askOrder = (contacts: Key[], found: Key[], me: Key, max = 8): Key[] =>
  [...new Set([...contacts, ...found])].filter((k) => isKey(k) && k !== me).slice(0, max)

// One ask per stranger per `everyMs`; forgets the oldest past `keep` keys, so a flood of fresh keys cannot grow memory.
export function limiter(everyMs: number, keep = 1000) {
  const last = new Map<string, number>()
  return (key: string, now: number) => {
    const t = last.get(key)
    if (t !== undefined && now - t < everyMs) return false
    last.delete(key)
    last.set(key, now)
    if (last.size > keep) last.delete(last.keys().next().value!)
    return true
  }
}
