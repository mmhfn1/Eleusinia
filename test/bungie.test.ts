import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { createBungie } from '../src/main/bungie'
// @ts-expect-error: plain JavaScript, shared with the smoke run
import { fakeBungie } from './fake-bungie.mjs'

let stop: (() => void)[] = []
afterEach(() => {
  for (const s of stop) s()
  stop = []
})
async function setup(opts = {}) {
  const fake = await fakeBungie(opts)
  const dir = mkdtempSync(join(tmpdir(), 'eleusinia-bungie-'))
  const opened: string[] = []
  const make = () =>
    createBungie({
      dir,
      config: { key: 'test', clientId: 'test', secret: 'test', base: fake.base },
      fetch: (url, init) => fetch(url, init),
      // The browser: follows bungie.net's redirect to the return address, as the user approving would
      open: async (url) => (opened.push(url), fetch(url)),
      seal: (t) => `sealed:${Buffer.from(t).toString('base64')}`,
      unseal: (t) => Buffer.from(t.replace(/^sealed:/, ''), 'base64').toString(),
      diag: () => {},
    })
  const b = make()
  stop.push(fake.close, b.stop)
  return { fake, dir, opened, b, make }
}

test('linking: bungie.net in the browser, the code back on 127.0.0.1, the cross save account, kept sealed', async () => {
  const { fake, dir, opened, b, make } = await setup()
  expect(b.status()).toEqual({ configured: true, linked: false })
  const st = await b.link()
  expect(st).toEqual({ configured: true, linked: true, name: 'Guardian#0042', marathon: true })
  expect(opened[0]).toMatch(new RegExp(`^${fake.base}/en/oauth/authorize\\?client_id=test&response_type=code&state=\\d+-[0-9a-f]{32}$`))
  expect(fake.seen.token).toEqual(['authorization_code'])
  const file = readFileSync(join(dir, 'bungie.json'), 'utf8')
  expect(file.startsWith('sealed:')).toBe(true)
  expect(file).not.toContain('access-1')
  // The profile of the cross save primary (type 3), with names from the Manifest, cached on disk
  const d = await b.destiny()
  expect(d!.activity!.name).toBe("Salvation's Edge")
  expect(d!.loadout).toHaveLength(5)
  const asked = fake.seen.defs
  await b.destiny()
  expect(fake.seen.defs).toBe(asked)
  expect(fake.seen.manifest).toBe(1)
  // A restart keeps the link and the definitions
  const again = make()
  stop.push(again.stop)
  expect(again.status().linked).toBe(true)
  expect((await again.destiny())!.activity!.name).toBe("Salvation's Edge")
  expect(fake.seen.defs).toBe(asked)
  b.unlink()
  expect(existsSync(join(dir, 'bungie.json'))).toBe(false)
  expect(await b.destiny()).toBeNull()
})

test('a stale access token is renewed with the refresh token; a refused one unlinks with a reason', async () => {
  const { fake, b } = await setup({ expiresIn: 0 })
  await b.link()
  expect((await b.destiny())!.character!.class).toBe('Warlock')
  expect(fake.seen.token[0]).toBe('authorization_code')
  expect(fake.seen.token.slice(1).every((g: string) => g === 'refresh_token') && fake.seen.token.length > 1).toBe(true)
  expect(b.status().linked).toBe(true)
  // Bungie stops accepting it (the user revoked the app on bungie.net)
  const fresh = await setup()
  await fresh.b.link()
  fresh.fake.expire()
  expect(await fresh.b.destiny()).toBeNull()
  expect(fresh.b.status()).toMatchObject({ linked: false, error: 'Bungie.net no longer accepts the link. Link it again.' })
})

test('a link that is never finished can be cancelled, and a copy built without a key says so', async () => {
  const fake = await fakeBungie()
  stop.push(fake.close)
  const b = createBungie({
    dir: mkdtempSync(join(tmpdir(), 'eleusinia-bungie-')),
    config: { key: 'test', clientId: 'test', secret: 'test', base: fake.base },
    fetch: (url, init) => fetch(url, init),
    open: async () => {}, // the user never approves
    seal: (t) => t,
    unseal: (t) => t,
    diag: () => {},
  })
  const linking = b.link()
  await new Promise((r) => setTimeout(r, 100))
  expect(b.status().waiting).toBe(true)
  b.cancel()
  await expect(linking).rejects.toThrow('cancelled')
  expect(b.status()).toEqual({ configured: true, linked: false })
  const none = createBungie({ dir: mkdtempSync(join(tmpdir(), 'eleusinia-bungie-')), config: null, fetch, open: async () => {}, seal: (t) => t, unseal: (t) => t, diag: () => {} })
  expect(none.status()).toEqual({ configured: false, linked: false })
  await expect(none.link()).rejects.toThrow('without a Bungie.net app key')
})
