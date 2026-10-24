// Friend requests and acceptances announced on the DHT without saying who sent them. The announcement uses a one-off
// key (`requestKeyPair`, the same for one sender and recipient, so re-announcing does not pile up), and that key's DHT
// record holds the sender's identity sealed to the recipient, signed for this recipient and this one-off key. Anyone
// looking at someone's request topic sees only how many one-off keys are there, never whose they are.
import { createHash } from 'node:crypto'
import DHT from 'hyperdht'
import crypto from 'hypercore-crypto'
import sodium from 'sodium-universal'
import { type Key, isKey } from './protocol'

type KeyPair = { publicKey: Buffer; secretKey: Buffer }

export const requestSeed = (me: KeyPair, to: Key) => createHash('sha256').update('eleusinia-request-key:').update(me.secretKey).update(to).digest()
export const requestKeyPair = (me: KeyPair, to: Key): KeyPair => DHT.keyPair(requestSeed(me, to))

const claim = (to: Key, oneOff: Buffer) => Buffer.from(`eleusinia-request:${to}:${oneOff.toString('hex')}`)

export function sealRequest(me: KeyPair, to: Key, oneOff: Buffer): Buffer {
  const body = Buffer.from(JSON.stringify({ from: me.publicKey.toString('hex'), sig: crypto.sign(claim(to, oneOff), me.secretKey).toString('hex') }))
  const curve = Buffer.alloc(32)
  sodium.crypto_sign_ed25519_pk_to_curve25519(curve, Buffer.from(to, 'hex'))
  const out = Buffer.alloc(body.length + sodium.crypto_box_SEALBYTES)
  sodium.crypto_box_seal(out, body, curve)
  return out
}

// Who sent this, or null when it is not sealed to us, not valid, or not signed for this one-off key.
export function openRequest(me: KeyPair, oneOff: Buffer, sealed: Buffer | null): Key | null {
  if (!sealed || sealed.length <= sodium.crypto_box_SEALBYTES || sealed.length > 1024) return null
  const pk = Buffer.alloc(32)
  const sk = Buffer.alloc(32)
  sodium.crypto_sign_ed25519_pk_to_curve25519(pk, me.publicKey)
  sodium.crypto_sign_ed25519_sk_to_curve25519(sk, me.secretKey)
  const body = Buffer.alloc(sealed.length - sodium.crypto_box_SEALBYTES)
  if (!sodium.crypto_box_seal_open(body, sealed, pk, sk)) return null
  try {
    const { from, sig } = JSON.parse(body.toString())
    const to = me.publicKey.toString('hex')
    return isKey(from) && from !== to && typeof sig === 'string' && /^[0-9a-f]{128}$/.test(sig) && crypto.verify(claim(to, oneOff), Buffer.from(sig, 'hex'), Buffer.from(from, 'hex')) ? from : null
  } catch {
    return null
  }
}
