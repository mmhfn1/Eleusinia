import DHT from 'hyperdht'
import { expect, test } from 'vitest'
import { openRequest, requestKeyPair, sealRequest } from '../src/shared/sealed'

test('a sealed request names its sender only to its recipient, and only for its own one-off key', () => {
  const [a, b, c] = [DHT.keyPair(), DHT.keyPair(), DHT.keyPair()]
  const hex = (k: { publicKey: Buffer }) => k.publicKey.toString('hex')
  const oneOff = requestKeyPair(a, hex(b))
  expect(requestKeyPair(a, hex(b)).publicKey.equals(oneOff.publicKey)).toBe(true) // the same each time: no pile-up
  expect(requestKeyPair(a, hex(c)).publicKey.equals(oneOff.publicKey)).toBe(false)
  const sealed = sealRequest(a, hex(b), oneOff.publicKey)
  expect(sealed.includes(Buffer.from(hex(a)))).toBe(false)
  expect(openRequest(b, oneOff.publicKey, sealed)).toBe(hex(a))
  expect(openRequest(c, oneOff.publicKey, sealed)).toBe(null) // not for them
  expect(openRequest(b, requestKeyPair(c, hex(b)).publicKey, sealed)).toBe(null) // copied under another one-off key
  // Sealed to B but claiming to be from C, without C's signature
  expect(openRequest(b, oneOff.publicKey, sealRequest({ publicKey: c.publicKey, secretKey: a.secretKey }, hex(b), oneOff.publicKey))).toBe(null)
  expect(openRequest(b, oneOff.publicKey, Buffer.from('nonsense nonsense nonsense nonsense nonsense nonsense'))).toBe(null)
  expect(openRequest(b, oneOff.publicKey, null)).toBe(null)
})
