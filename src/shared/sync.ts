import crypto from 'hypercore-crypto'
import { type Add, type Group, type Have, type Msg, MAX_TEXT, isGroupId, isKey } from './protocol'

const body = (m: Omit<Msg, 'sig'>) => Buffer.from(JSON.stringify([m.conv, m.author, m.seq, m.ts, m.text]))

const isSig = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f]{128}$/.test(s)
const addBody = (id: string, member: string) => Buffer.from(`add:${id}:${member}`)

export const signAdd = (id: string, member: string, kp: { publicKey: Buffer; secretKey: Buffer }): Add => ({
  by: kp.publicKey.toString('hex'),
  sig: crypto.sign(addBody(id, member), kp.secretKey).toString('hex'),
})
export const verifyAdd = (id: string, member: string, a?: Add) =>
  !!a && isKey(a.by) && isSig(a.sig) && crypto.verify(addBody(id, member), Buffer.from(a.sig, 'hex'), Buffer.from(a.by, 'hex'))

export function signMsg(m: Omit<Msg, 'sig'>, secretKey: Buffer): Msg {
  return { ...m, sig: crypto.sign(body(m), secretKey).toString('hex') }
}

export function verifyMsg(m: Msg): boolean {
  return (
    !!m &&
    typeof m.conv === 'string' &&
    isKey(m.author) &&
    Number.isSafeInteger(m.seq) &&
    m.seq > 0 &&
    typeof m.ts === 'number' &&
    typeof m.text === 'string' &&
    m.text.length <= MAX_TEXT &&
    isSig(m.sig) &&
    crypto.verify(body(m), Buffer.from(m.sig, 'hex'), Buffer.from(m.author, 'hex'))
  )
}

// Logs hold each author's messages in seq order with no gaps, so this is everything the peer lacks.
export const missing = (log: Msg[], have: Have) => log.filter((m) => m.seq > (Number(have[m.author]) || 0))

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
    (g.adds === undefined || (!!g.adds && typeof g.adds === 'object' && Object.keys(g.adds).length <= 100))
  )
}

// Members only ever grow (union); the name follows the latest edit. Same result on every peer in any order.
export function mergeGroup(a: Group | undefined, b: Group): Group {
  a ??= { ...b, members: [], adds: {} }
  const newer = b.updatedAt > a.updatedAt || (b.updatedAt === a.updatedAt && b.name > a.name) ? b : a
  const members = [...new Set([...a.members, ...b.members])].sort()
  const adds: Record<string, Add> = {}
  for (const k of members) {
    const [x, y] = [a.adds?.[k], b.adds?.[k]]
    const pick = x && y ? (String(x.sig) <= String(y.sig) ? x : y) : (x ?? y)
    if (pick) adds[k] = { by: pick.by, sig: pick.sig }
  }
  return { id: a.id, name: newer.name, members, updatedAt: newer.updatedAt, adds }
}
