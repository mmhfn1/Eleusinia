import DHT from 'hyperdht'
import { expect, test } from 'vitest'
import { MAX_CLAIMS, idSeed, readClaims, signClaim, withClaim, writeClaims } from '../src/shared/idcard'

const H = 'ann#0042'

test('only claims signed by their own key for this exact ID are believed', () => {
  const ann = DHT.keyPair()
  const eve = DHT.keyPair()
  const mine = signClaim(H, ann)
  expect(readClaims(H, writeClaims([mine]))).toEqual([mine])
  expect(readClaims('ann#0043', writeClaims([mine]))).toEqual([]) // signed for another ID
  const forged = { key: ann.publicKey.toString('hex'), sig: signClaim(H, eve).sig } // Eve cannot sign for Ann
  expect(readClaims(H, writeClaims([forged]))).toEqual([])
  expect(readClaims(H, 'not json')).toEqual([])
  expect(readClaims(H, '[["x","y"],{"a":1},null]')).toEqual([])
})

test('writing puts our claim first, keeps the others, never twice, and fits in a record', () => {
  const people = Array.from({ length: MAX_CLAIMS + 2 }, () => DHT.keyPair())
  const others = people.slice(1).map((p) => signClaim(H, p))
  const merged = withClaim(signClaim(H, people[0]), withClaim(others[0], others))
  expect(merged).toHaveLength(MAX_CLAIMS)
  expect(merged[0].key).toBe(people[0].publicKey.toString('hex'))
  expect(new Set(merged.map((c) => c.key)).size).toBe(MAX_CLAIMS)
  expect(writeClaims(merged).length).toBeLessThan(1000)
  expect(idSeed(H)).toHaveLength(32)
  expect(idSeed(H).equals(idSeed('ann#0043'))).toBe(false)
})
