// A stand-in for bungie.net for tests and the smoke run: it approves a sign-in at once (sending "the browser" straight
// to the app's own server, the port taken from `state` as the real return page does), issues tokens, and serves the
// synthesized profile and Manifest definitions in fixtures/. Every Platform call must carry the test API key, and the
// profile also a current access token.
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'))

// expiresIn: seconds an access token lasts (0: already stale, so the app must renew it first)
export async function fakeBungie({ expiresIn = 3600 } = {}) {
  const defs = fixture('destiny-defs.json')
  const seen = { authorize: 0, token: [], profile: 0, defs: 0, manifest: 0 }
  const valid = new Set()
  let n = 0
  const issue = () => {
    const access = `access-${++n}`
    valid.add(access)
    return { access_token: access, token_type: 'Bearer', expires_in: expiresIn, refresh_token: `refresh-${n}`, refresh_expires_in: 7776000, membership_id: '1234' }
  }
  const ok = (res, Response) => res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ Response, ErrorCode: 1, ErrorStatus: 'Success' }))
  const server = createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x')
    if (u.pathname === '/en/oauth/authorize') {
      seen.authorize++
      const state = u.searchParams.get('state') ?? ''
      return res.writeHead(302, { Location: `http://127.0.0.1:${state.split('-')[0]}/bungie?code=code-1&state=${state}` }).end()
    }
    if (u.pathname === '/platform/app/oauth/token/' && req.method === 'POST') {
      let body = ''
      for await (const c of req) body += c
      const form = new URLSearchParams(body)
      seen.token.push(form.get('grant_type'))
      const auth = req.headers.authorization === `Basic ${Buffer.from('test:test').toString('base64')}`
      const good = form.get('grant_type') === 'authorization_code' ? form.get('code') === 'code-1' : /^refresh-\d+$/.test(form.get('refresh_token') ?? '')
      if (!auth || !good) return res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'invalid_grant' }))
      return res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(issue()))
    }
    if (req.headers['x-api-key'] !== 'test') return res.writeHead(403).end()
    const bearer = (req.headers.authorization ?? '').replace(/^Bearer /, '')
    if (u.pathname === '/Platform/Destiny2/Manifest/') return seen.manifest++, ok(res, { version: 'test-1' })
    const m = /^\/Platform\/Destiny2\/Manifest\/(\w+)\/(\d+)\/$/.exec(u.pathname)
    if (m) {
      seen.defs++
      const d = defs[`${m[1]}:${m[2]}`]
      return d ? ok(res, d) : res.writeHead(200).end(JSON.stringify({ ErrorCode: 1665, ErrorStatus: 'DestinyDefinitionNotFound' }))
    }
    if (!valid.has(bearer)) return res.writeHead(401).end(JSON.stringify({ ErrorCode: 99, ErrorStatus: 'WebAuthRequired' }))
    if (u.pathname === '/Platform/User/GetMembershipsForCurrentUser/')
      return ok(res, {
        destinyMemberships: [
          { membershipType: 1, membershipId: '4611686018400000001', displayName: 'Ann', crossSaveOverride: 3 },
          { membershipType: 3, membershipId: '4611686018400000002', displayName: 'Ann', crossSaveOverride: 3 },
        ],
        primaryMembershipId: '4611686018400000002',
        marathonMembershipId: '4611686018400000009',
        bungieNetUser: { membershipId: '1234', displayName: 'Guardian', cachedBungieGlobalDisplayName: 'Guardian', cachedBungieGlobalDisplayNameCode: 42 },
      })
    if (u.pathname === '/Platform/Destiny2/3/Profile/4611686018400000002/' && u.searchParams.get('components') === '100,200,204,205,1000') {
      seen.profile++
      return ok(res, fixture('destiny-profile.json'))
    }
    res.writeHead(404).end()
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  return { base: `http://127.0.0.1:${server.address().port}`, seen, expire: () => valid.clear(), close: () => server.close() }
}
