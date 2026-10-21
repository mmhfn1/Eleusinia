import crypto from 'hypercore-crypto'

// Finding someone by friend ID while they are offline. Each friend ID has one small record on the DHT, at an address
// anyone can work out from the ID itself (idSeed), so anyone can also write it. What makes it trustworthy is inside:
// a few claims, each the owner's key and their signature over the ID. A reader keeps only claims that verify, so a
// stranger can never put someone else's key there; at worst they push claims out until the owner or one of their
// friends writes them back. Several claims fit, since friend IDs are not unique: two people may hold the same one.

export const MAX_CLAIMS = 6 // about 140 bytes each; records hold up to 1000
export type Claim = { key: string; sig: string } // hex

const body = (handle: string) => Buffer.from('eleusinia-id:' + handle)
export const idSeed = (handle: string): Buffer => crypto.data(body(handle)) // 32 bytes, the record's key pair seed

export const signClaim = (handle: string, kp: { publicKey: Buffer; secretKey: Buffer }): Claim => ({
  key: kp.publicKey.toString('hex'),
  sig: crypto.sign(body(handle), kp.secretKey).toString('hex'),
})

// The claims in a record that really are signed by their key for this ID, at most MAX_CLAIMS, no key twice.
export function readClaims(handle: string, value: unknown): Claim[] {
  let list: unknown
  try {
    list = JSON.parse(String(value))
  } catch {
    return []
  }
  if (!Array.isArray(list)) return []
  const out: Claim[] = []
  for (const c of list.slice(0, MAX_CLAIMS * 2)) {
    if (!Array.isArray(c) || typeof c[0] !== 'string' || typeof c[1] !== 'string') continue
    const key = Buffer.from(c[0], 'base64')
    const sig = Buffer.from(c[1], 'base64')
    if (key.length !== 32 || sig.length !== 64 || out.some((o) => o.key === key.toString('hex'))) continue
    if (!crypto.verify(body(handle), sig, key)) continue
    out.push({ key: key.toString('hex'), sig: sig.toString('hex') })
    if (out.length === MAX_CLAIMS) break
  }
  return out
}

// Our claim first, then the others that were there, so writing never pushes out someone else who holds the ID.
export const withClaim = (mine: Claim, others: Claim[]) => [mine, ...others.filter((c) => c.key !== mine.key)].slice(0, MAX_CLAIMS)

export const writeClaims = (claims: Claim[]) =>
  Buffer.from(JSON.stringify(claims.map((c) => [Buffer.from(c.key, 'hex').toString('base64'), Buffer.from(c.sig, 'hex').toString('base64')])))
