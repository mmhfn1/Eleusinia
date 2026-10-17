import { expect, test } from 'vitest'
import { KEEP_EVENTS_MS, LIMITS, cleanReport, createDiagnostics, describe, scrub } from '../src/shared/reports'

const key = 'ab'.repeat(29) + 'a3f9c2'

test('scrub keeps only what cannot identify anyone', () => {
  expect(scrub(`link open ${key}`)).toBe('link open …A3F9C2')
  expect(scrub('group 0123456789abcdef0123456789abcdef left')).toBe('group group…CDEF left')
  expect(scrub('candidate 192.168.1.20:51234 and [2001:db8::1]:443 and fe80:0:0:0:1:2:3:4')).toBe('candidate [address] and [address] and [address]')
  expect(scrub('at C:\\Users\\Giri\\AppData\\x.js and /home/giri/app and /Users/giri/app')).toBe('at C:\\Users\\…\\AppData\\x.js and /home/…/app and /Users/…/app')
  expect(scrub('mail me at someone@example.com')).toBe('mail me at [email]')
  expect(scrub('x'.repeat(1000))).toHaveLength(LIMITS.event)
  expect(scrub('call joined with 3 people at 12:34:56, 720p 30 fps, 16:9')).toBe('call joined with 3 people at 12:34:56, 720p 30 fps, 16:9') // ordinary text is untouched
})

test('reports from anyone are checked, capped and scrubbed again at the inbox', () => {
  const ok = { id: '0123456789abcdef', at: 5, kind: 'bug', title: `Crash near ${key}`, body: 'steps\nfrom 10.0.0.2', events: [{ at: 1, area: 'call', text: `ice failed ${key}` }] }
  expect(cleanReport(ok)).toEqual({ id: ok.id, at: 5, kind: 'bug', title: 'Crash near …A3F9C2', body: 'steps\nfrom [address]', events: [{ at: 1, area: 'call', text: 'ice failed …A3F9C2' }] })
  expect(cleanReport({ ...ok, id: 'nope' })).toBeNull()
  expect(cleanReport({ ...ok, kind: 'spam' })).toBeNull()
  expect(cleanReport({ ...ok, title: '  ' })).toBeNull()
  expect(cleanReport({ ...ok, events: [{ at: 1, area: 'secret', text: 'x' }, 'junk'] })!.events).toEqual([])
  expect(cleanReport({ ...ok, body: 'x'.repeat(10000) })!.body).toHaveLength(LIMITS.body)
  expect(cleanReport(null)).toBeNull()
})

test('diagnostics keep only the last minutes, in memory, scrubbed on arrival', () => {
  let now = 0
  const d = createDiagnostics(() => now)
  d.add('network', `open ${key}`)
  now = KEEP_EVENTS_MS / 2
  d.add('call', 'joined')
  expect(d.list()).toEqual([
    { at: 0, area: 'network', text: 'open …A3F9C2' },
    { at: KEEP_EVENTS_MS / 2, area: 'call', text: 'joined' },
  ])
  expect(d.list(['call']).map((e) => e.text)).toEqual(['joined'])
  now = KEEP_EVENTS_MS + 1
  d.add('app', 'later')
  expect(d.list().map((e) => e.text)).toEqual(['joined', 'later']) // the oldest aged out
})

test('a report reads the same in the preview and the inbox', () => {
  const text = describe({ kind: 'feedback', title: 'Nice', body: 'more please', events: [{ at: 0, area: 'app', text: 'started' }] })
  expect(text).toContain('[feedback] Nice')
  expect(text).toContain('00:00:00 app     started')
})
