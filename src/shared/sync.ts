import { createHash } from 'node:crypto'
import crypto from 'hypercore-crypto'
import { type LinkPreview, cleanLink, linkBody } from './links'
import { filesBody, validFiles } from './media'
import { type Add, type Group, type Have, type Key, type Msg, type Profile, MAX_TEXT, isGroupId, isKey, isPicture } from './protocol'

// A signed "online" note, passed along between group members so they know who is online without a link to everyone.
// call: the group or server voice channel (`${serverId}.${channelId}`) whose call the author is in, if any, so members
// not linked with them still see the call.
// v: their profile's version (profileVersion), so members not linked with them notice a new name or picture.
export type Presence = { key: Key; at: number; call: string | null; v: string; sig: string }
const presenceBody = (key: string, at: number, call: string | null, v: string) => Buffer.from(`presence:${key}:${at}:${call ?? ''}:${v}`)
export const profileVersion = (p: Profile) => createHash('sha256').update(JSON.stringify([p.handle, p.name, p.about, p.avatar])).digest('hex').slice(0, 16)
export const signPresence = (at: number, call: string | null, v: string, kp: { publicKey: Buffer; secretKey: Buffer }): Presence => {
  const key = kp.publicKey.toString('hex')
  return { key, at, call, v, sig: crypto.sign(presenceBody(key, at, call, v), kp.secretKey).toString('hex') }
}
export function verifyPresence(p: any, now = Date.now()): p is Presence {
  return (
    !!p &&
    isKey(p.key) &&
    Number.isSafeInteger(p.at) &&
    p.at <= now + 60000 && // a note dated ahead cannot keep someone online for long after they left
    (p.call === null || isGroupId(p.call) || (typeof p.call === 'string' && /^[0-9a-f]{32}\.[0-9a-f]{32}$/.test(p.call))) &&
    typeof p.v === 'string' &&
    /^[0-9a-f]{16}$/.test(p.v) &&
    isSig(p.sig) &&
    crypto.verify(presenceBody(p.key, p.at, p.call, p.v), Buffer.from(p.sig, 'hex'), Buffer.from(p.key, 'hex'))
  )
}

// Files are signed only when present, so messages from before files existed still verify.
const body = (m: Omit<Msg, 'sig'>) => Buffer.from(JSON.stringify([m.conv, m.author, m.seq, m.ts, m.text, ...(m.files ? [filesBody(m.files)] : [])]))

const isSig = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f]{128}$/.test(s)
const addBody = (id: string, member: string) => Buffer.from(`add:${id}:${member}`)

export const signAdd = (id: string, member: string, kp: { publicKey: Buffer; secretKey: Buffer }): Add => ({
  by: kp.publicKey.toString('hex'),
  sig: crypto.sign(addBody(id, member), kp.secretKey).toString('hex'),
})
export const verifyAdd = (id: string, member: string, a?: Add) =>
  !!a && isKey(a.by) && isSig(a.sig) && crypto.verify(addBody(id, member), Buffer.from(a.sig, 'hex'), Buffer.from(a.by, 'hex'))

const leftBody = (id: string, member: string) => Buffer.from(`left:${id}:${member}`)
export const signLeft = (id: string, kp: { publicKey: Buffer; secretKey: Buffer }) => crypto.sign(leftBody(id, kp.publicKey.toString('hex')), kp.secretKey).toString('hex')
export const verifyLeft = (id: string, member: string, sig: unknown) =>
  isKey(member) && isSig(sig) && crypto.verify(leftBody(id, member), Buffer.from(sig, 'hex'), Buffer.from(member, 'hex'))

export function signMsg(m: Omit<Msg, 'sig'>, secretKey: Buffer): Msg {
  return { ...m, sig: crypto.sign(body(m), secretKey).toString('hex') }
}

// A link preview is signed on its own, over the message's place and the preview, so nobody passing the message on can
// change what it shows. Older copies do not know it and keep it as it came.
const previewBody = (m: Pick<Msg, 'conv' | 'author' | 'seq'>, l: LinkPreview) => Buffer.from(JSON.stringify(['link', m.conv, m.author, m.seq, ...linkBody(l)]))
export const withLink = (m: Msg, l: LinkPreview, secretKey: Buffer): Msg => ({ ...m, link: l, lsig: crypto.sign(previewBody(m, l), secretKey).toString('hex') })
const validLink = (m: Msg) => {
  const l = cleanLink(m.link, m.text)
  return !!l && JSON.stringify(linkBody(l)) === JSON.stringify(linkBody(m.link!)) && isSig(m.lsig) && crypto.verify(previewBody(m, l), Buffer.from(m.lsig, 'hex'), Buffer.from(m.author, 'hex'))
}

export function verifyMsg(m: Msg): boolean {
  return (
    !!m &&
    typeof m.conv === 'string' &&
    isKey(m.author) &&
    Number.isSafeInteger(m.seq) &&
    m.seq > 0 &&
    Number.isSafeInteger(m.ts) &&
    m.ts > 0 &&
    m.ts < 8.64e15 && // the latest time a Date can hold: past it, showing the message throws
    typeof m.text === 'string' &&
    m.text.length <= MAX_TEXT &&
    (m.files === undefined || validFiles(m.files)) &&
    (m.link === undefined || validLink(m)) &&
    isSig(m.sig) &&
    crypto.verify(body(m), Buffer.from(m.sig, 'hex'), Buffer.from(m.author, 'hex'))
  )
}

// Which "you already had these" claims (`held`) a peer may make, as [author, seq] to carry on after: only about its
// own messages (up to what it says it holds) and ours (lost with our log). About anyone else's it could make us
// discard that person's messages for good. Ours only up to `acked`, what a peer confirmed while we still had them:
// any member could otherwise push our numbering past what everyone else holds, and they would drop all we send.
export function heldFrom(held: unknown, from: string, me: string, theirs: Have, ours: Have, acked: number): [string, number][] {
  if (!held || typeof held !== 'object') return []
  return Object.entries(held as Record<string, unknown>).filter(
    (e): e is [string, number] =>
      (e[0] === from || e[0] === me) && Number.isSafeInteger(e[1]) && (e[1] as number) > (ours[e[0]] ?? 0) && (e[1] as number) <= (e[0] === from ? Number(theirs?.[from]) || 0 : acked),
  )
}

// Logs hold each author's messages in seq order with no gaps, so this is everything the peer lacks.
export const missing = (log: Msg[], have: Have) => log.filter((m) => m.seq > (Number(have[m.author]) || 0))

// A new group's id comes from its owner's key and a random nonce, so nobody else can claim to own it.
export const groupIdOf = (owner: Key, nonce: string) => createHash('sha256').update(`eleusinia-group:${owner}:${nonce}`).digest('hex').slice(0, 32)

const removedBody = (id: string, member: string) => Buffer.from(`removed:${id}:${member}`)
export const signRemoved = (id: string, member: Key, kp: { publicKey: Buffer; secretKey: Buffer }) => crypto.sign(removedBody(id, member), kp.secretKey).toString('hex')
const verifyRemoved = (id: string, member: string, owner: Key, sig: unknown) =>
  isKey(member) && isSig(sig) && crypto.verify(removedBody(id, member), Buffer.from(sig, 'hex'), Buffer.from(owner, 'hex'))

// A name or picture change is signed by the member who made it, with its time, so it can be neither forged nor
// pinned by another member's made-up date.
const editBody = (g: Pick<Group, 'id' | 'name' | 'avatar' | 'updatedAt'>) => Buffer.from(JSON.stringify(['edit', g.id, g.updatedAt, g.name, g.avatar ?? '']))
export const signEdit = (g: Pick<Group, 'id' | 'name' | 'avatar' | 'updatedAt'>, kp: { publicKey: Buffer; secretKey: Buffer }): Add => ({
  by: kp.publicKey.toString('hex'),
  sig: crypto.sign(editBody(g), kp.secretKey).toString('hex'),
})
export const EDIT_AHEAD_MS = 10 * 60000 // an edit or message dated further ahead than this is ignored until its time comes

const isMap = (x: unknown, max = 100) => x === undefined || (!!x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).length <= max)

export function validGroup(g: Group): boolean {
  return (
    !!g &&
    isGroupId(g.id) &&
    typeof g.name === 'string' &&
    g.name.length <= 100 &&
    typeof g.updatedAt === 'number' &&
    Array.isArray(g.members) &&
    g.members.length <= 100 &&
    g.members.every(isKey) &&
    (g.avatar === undefined || g.avatar === '' || isPicture(g.avatar)) &&
    // Leavers' adds and notices stay (mergeGroup), so these outgrow the 100 members over the group's life.
    isMap(g.adds, 400) &&
    isMap(g.left, 400) &&
    Object.entries(g.left ?? {}).every(([k, sig]) => verifyLeft(g.id, k, sig)) &&
    isMap(g.removed, 400) &&
    (g.owner === undefined || isKey(g.owner)) &&
    (g.nonce === undefined || (typeof g.nonce === 'string' && /^[0-9a-f]{32}$/.test(g.nonce))) &&
    (g.edit === undefined || (!!g.edit && isKey(g.edit.by) && isSig(g.edit.sig)))
  )
}

// Who owns a group: proven by the id (new groups), else what this computer recorded, else, for a group from before
// owners seen for the first time, the one person no add was ever signed for (whoever made it). Null when that is not
// clear; such a group keeps the old rules, where every listed member counts.
export function ownerOf(local: Group | undefined, ...others: Group[]): Key | null {
  const sides = [...(local ? [local] : []), ...others]
  const proven = sides.find((g) => g.owner && g.nonce && groupIdOf(g.owner, g.nonce) === g.id)
  if (proven) return proven.owner!
  if (local?.owner) return local.owner
  const everyone = new Set(sides.flatMap((g) => [...g.members, ...Object.keys(g.left ?? {})]))
  const unadded = [...everyone].filter((k) => !sides.some((g) => g.adds?.[k]))
  return unadded.length === 1 ? unadded[0] : null
}

// The same result on every peer in any order. Members are everyone reachable from the owner through signed adds,
// minus those who left (signed by themselves) or were removed (signed by the owner); someone added only by a removed
// member is out too, until a member adds them again. Leavers' adds still count, so leaving drops nobody else. The
// name and picture follow the newest change a current member signed (not someone who left or was removed); without a signed one, the first copy seen here stands.
export function mergeGroup(a: Group | undefined, b: Group, now = Date.now()): Group {
  const sides = a ? [a, b] : [b]
  const id = sides[0].id
  const owner = ownerOf(a, b)
  const left: Record<string, string> = {}
  for (const k of [...new Set(sides.flatMap((g) => Object.keys(g.left ?? {})))].sort()) left[k] = sides.find((g) => g.left?.[k])!.left![k]
  const removed: Record<string, string> = {}
  if (owner)
    for (const k of [...new Set(sides.flatMap((g) => Object.keys(g.removed ?? {})))].sort()) {
      const sig = sides.map((g) => g.removed?.[k]).find((s) => verifyRemoved(id, k, owner, s))
      if (sig && k !== owner) removed[k] = sig
    }
  const everyone = [...new Set(sides.flatMap((g) => [...g.members, ...Object.keys(left)]))].sort()
  const offered = (k: Key) => sides.map((g) => g.adds?.[k]).filter((x): x is Add => !!x)
  // Rounds out from the owner: a member's proof is always an add by someone in from an earlier round, so the stored
  // proofs lead back to the owner and never round in a loop.
  const round = new Map<Key, number>(owner ? [[owner, 0]] : everyone.map((k) => [k, 0]))
  const valid = { has: (k: Key) => round.has(k) }
  const proof = (k: Key, before = round.get(k) ?? Infinity) =>
    offered(k)
      .filter((x) => !owner || ((round.get(x.by) ?? Infinity) < before && !removed[x.by] && x.by !== k && verifyAdd(id, k, x)))
      .sort((x, y) => (String(x.sig) <= String(y.sig) ? -1 : 1))[0]
  for (let r = 1, grew = !!owner; grew; r++) {
    const next = everyone.filter((k) => !round.has(k) && !removed[k] && proof(k, r))
    for (const k of next) round.set(k, r)
    grew = next.length > 0
  }
  const members = everyone.filter((k) => valid.has(k) && !left[k] && !removed[k])
  const adds: Record<string, Add> = {}
  for (const k of everyone) {
    const pick = k !== owner && valid.has(k) && !removed[k] ? proof(k) : undefined
    if (pick && (owner || members.includes(k))) adds[k] = { by: pick.by, sig: pick.sig }
  }
  const signed = (g: Group) =>
    !!owner && !!g.edit && valid.has(g.edit.by) && !removed[g.edit.by] && !left[g.edit.by] && g.updatedAt <= now + EDIT_AHEAD_MS && crypto.verify(editBody(g), Buffer.from(g.edit.sig, 'hex'), Buffer.from(g.edit.by, 'hex'))
  const later = (x: Group, y: Group) => x.updatedAt > y.updatedAt || (x.updatedAt === y.updatedAt && (x.name > y.name || (x.name === y.name && (x.avatar ?? '') > (y.avatar ?? ''))))
  let look: Group
  if (!owner) look = a && !later(b, a) ? a : b // the old rules
  else {
    const base = sides[0]
    const best = sides.filter(signed).reduce<Group | null>((x, g) => (!x || later(g, x) ? g : x), null)
    look = best && (!signed(base) || later(best, base) || best === base) ? best : { ...base, updatedAt: 0, edit: undefined }
  }
  const nonce = owner && sides.find((g) => g.owner === owner && g.nonce && groupIdOf(owner, g.nonce) === id)?.nonce
  return {
    id,
    name: look.name,
    members,
    updatedAt: look.updatedAt,
    adds,
    left,
    ...(Object.keys(removed).length && { removed }),
    ...(owner && { owner }),
    ...(nonce && { nonce }),
    ...(look.edit && { edit: { by: look.edit.by, sig: look.edit.sig } }),
    ...(look.avatar && { avatar: look.avatar }),
  }
}
