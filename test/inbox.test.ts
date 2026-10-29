import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import DHT from 'hyperdht'
import createTestnet from 'hyperdht/testnet'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { createInbox, issueOf, reportLimit } from '../src/main/inbox'
import { createNode } from '../src/main/node'

let testnet: any
beforeAll(async () => {
  testnet = await createTestnet(10)
})
afterAll(() => testnet.destroy())
const until = (ok: () => boolean) => expect.poll(ok, { timeout: 20000, interval: 100 }).toBe(true)
const tmp = () => mkdtempSync(join(tmpdir(), 'eleusinia-inbox-'))

test('a report waits on the tester computer until the inbox is reachable, then is filed as a GitHub issue', async () => {
  const inboxKeys = DHT.keyPair()
  const inboxKey = inboxKeys.publicKey.toString('hex')
  const testerDir = tmp()
  const tester = createNode({ dir: testerDir, keyPair: DHT.keyPair(), emit: () => {}, dht: { bootstrap: testnet.bootstrap }, redialMs: 300, inbox: inboxKey })
  const secret = 'ab'.repeat(32)
  const id = tester.report({ kind: 'bug', title: 'No sound', body: `Talking to ${secret} from 10.1.2.3 @octocat`, events: [{ at: 1, area: 'call', text: 'joined' }] })
  expect(tester.state().reports).toBe(1)
  expect(readFileSync(join(testerDir, 'outbox', id + '.json'), 'utf8')).not.toContain(secret) // scrubbed before it is even stored

  // GitHub's API, standing in: the first call refuses the label, as a token without label rights would.
  const posted: any[] = []
  vi.stubGlobal('fetch', async (url: string, init: any) => {
    posted.push({ url, body: JSON.parse(init.body), auth: init.headers.Authorization })
    if (posted.length === 1) return new Response('{}', { status: 422 })
    return new Response(JSON.stringify({ number: 7 }), { status: 201 })
  })
  const inboxDir = tmp()
  const inbox = createInbox({ dir: inboxDir, keyPair: inboxKeys, dht: { bootstrap: testnet.bootstrap }, github: { token: 't0ken', repo: 'team/Eleusinia-reports' }, fileEvery: 200 })
  await inbox.listening
  // The tester retries on its own once a minute; nudging it with a second report gets the test there sooner.
  tester.report({ kind: 'feedback', title: 'Nice', body: '' })
  await until(() => tester.state().reports === 0)
  await until(() => posted.length === 3)

  const saved = readdirSync(join(inboxDir, 'reports'))
  expect(saved).toContain(id + '.json')
  expect(saved).toContain(id + '.txt')
  const bug = posted.find((p) => p.body.title === '[bug] No sound')!
  expect(posted[0].body.labels).toHaveLength(1) // tried with its label first, then again without it
  expect(posted[1].body.title).toBe(posted[0].body.title)
  expect(posted[1].body.labels).toBeUndefined()
  expect(bug.url).toBe('https://api.github.com/repos/team/Eleusinia-reports/issues')
  expect(bug.auth).toBe('Bearer t0ken')
  expect(bug.body.body).toContain('…ABABAB') // the key's tail only
  expect(bug.body.body).not.toContain(secret)
  expect(bug.body.body).toContain('[address]')
  expect(bug.body.body).toContain('@​octocat') // no GitHub user is pinged
  await until(() => JSON.parse(readFileSync(join(inboxDir, 'reports', id + '.json'), 'utf8')).issue === 7)

  vi.unstubAllGlobals()
  await tester.destroy()
  await inbox.destroy()
  expect(existsSync(join(testerDir, 'outbox', id + '.json'))).toBe(false)
})

test('the issue text names the kind, time, tester and report, and lists app details and events', () => {
  const issue = issueOf({
    report: { id: '0123456789abcdef', at: 0, kind: 'crash', title: 'The window crashed', body: 'sent automatically', contact: 'ann#1234', meta: { version: '0.0.1', build: 'tester', os: 'Windows 10', arch: 'x64', electron: '44', chrome: '140', locale: 'en-GB', memoryGb: 16 }, events: [{ at: 0, area: 'error', text: 'oom' }] },
    from: 'A3F9C2',
    received: 0,
    issue: null,
  })
  expect(issue.title).toBe('[crash] The window crashed')
  expect(issue.labels).toEqual(['crash'])
  expect(issue.body).toContain('from tester …A3F9C2')
  expect(issue.body).toContain('Contact: `ann#1234`')
  expect(issue.body).toContain('- version: `0.0.1`')
  expect(issue.body).toContain('00:00:00 error   oom')
})

test('reports are limited per sender and for everyone together, each for an hour', () => {
  const allowed = reportLimit(2, 3)
  expect([allowed('a', 0), allowed('a', 1), allowed('a', 2)]).toEqual([true, true, false])
  expect([allowed('b', 3), allowed('c', 4)]).toEqual([true, false]) // fresh keys do not get around the total
  expect(allowed('a', 3600e3 + 1)).toBe(true) // an hour on, the old ones no longer count
})

test('reports saved before a restart and not yet filed are filed by the next start; filed ones are left alone', async () => {
  const dir = tmp()
  mkdirSync(join(dir, 'reports'))
  const saved = (id: string, issue: number | null) => ({ report: { id, at: 0, kind: 'bug', title: 'Saved ' + id, body: '', meta: {}, events: [] }, from: 'A3F9C2', received: 0, issue })
  writeFileSync(join(dir, 'reports', '1111111111111111.json'), JSON.stringify(saved('1111111111111111', null)))
  writeFileSync(join(dir, 'reports', '2222222222222222.json'), JSON.stringify(saved('2222222222222222', 3)))
  const posted: string[] = []
  vi.stubGlobal('fetch', async (_url: string, init: any) => (posted.push(JSON.parse(init.body).title), new Response(JSON.stringify({ number: 8 }), { status: 201 })))
  const inbox = createInbox({ dir, keyPair: DHT.keyPair(), dht: { bootstrap: testnet.bootstrap }, github: { token: 't', repo: 'team/r' }, fileEvery: 200 })
  await until(() => JSON.parse(readFileSync(join(dir, 'reports', '1111111111111111.json'), 'utf8')).issue === 8)
  await new Promise((r) => setTimeout(r, 500)) // a few more rounds: nothing is filed twice
  expect(posted).toEqual(['[bug] Saved 1111111111111111'])
  vi.unstubAllGlobals()
  await inbox.destroy()
})
