import { expect, test, vi } from 'vitest'
import { KEEP_EVENTS_MS, KEEP_PREVIOUS, KEEP_PREVIOUS_MS, LIMITS, cleanReport, createDiagnostics, describe, previousDiagnostics, scrub } from '../src/shared/reports'

const key = 'ab'.repeat(29) + 'a3f9c2'

test('scrub keeps only what cannot identify anyone', () => {
  expect(scrub(`link open ${key}`)).toBe('link open …A3F9C2')
  expect(scrub('group 0123456789abcdef0123456789abcdef left')).toBe('group group…CDEF left')
  expect(scrub('candidate 192.168.1.20:51234 and [2001:db8::1]:443 and fe80:0:0:0:1:2:3:4')).toBe('candidate [address] and [address] and [address]')
  expect(scrub('at C:\\Users\\Giri\\AppData\\x.js and /home/giri/app and /Users/giri/app')).toBe('at C:\\Users\\…\\AppData\\x.js and /home/…/app and /Users/…/app')
  // a surname after a space is part of the folder name, but the rest of the path stays
  expect(scrub('at foo (C:\\Users\\John Smith\\app.asar\\main.js:1:2) and /home/john smith/x')).toBe('at foo (C:\\Users\\…\\app.asar\\main.js:1:2) and /home/…/x')
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
  // past 15 minutes, a quiet session still keeps its last lines: a copy open for hours answered a pull with 3 lines
  expect(d.list().map((e) => e.text)).toEqual([`open …A3F9C2`, 'joined', 'later'])
  // a busy one keeps the last 15 minutes in full, and of what is older only enough to make KEEP_PREVIOUS lines
  now = 3 * KEEP_EVENTS_MS
  for (let i = 0; i < KEEP_PREVIOUS; i++) d.add('call', `busy ${i}`)
  expect(d.list()).toHaveLength(KEEP_PREVIOUS)
  expect(d.list()[0].text).toBe('busy 0')
  for (let i = 0; i < 50; i++) d.add('call', `still busy ${i}`) // all within 15 minutes: every one is kept
  expect(d.list()).toHaveLength(KEEP_PREVIOUS + 50)
  now = 3 * KEEP_EVENTS_MS + KEEP_PREVIOUS_MS + 1
  d.add('app', 'next day')
  expect(d.list().map((e) => e.text)).toEqual(['next day']) // nothing older than a day
})

test('a report reads the same in the preview and the inbox', () => {
  const text = describe({ kind: 'feedback', title: 'Nice', body: 'more please', events: [{ at: 0, area: 'app', text: 'started' }] })
  expect(text).toContain('[feedback] Nice')
  expect(text).toContain('00:00:00 app     started')
})

test("a report keeps the app's memory use only as a plain number", () => {
  const meta = { version: '0.0.45', build: 'tester', os: 'Windows_NT 10', arch: 'x64', electron: '44', chrome: '152', locale: 'en-US', memoryGb: 16 }
  const r = (m: object) => cleanReport({ id: '0123456789abcdef', at: 1, kind: 'bug', title: 'Memory', meta: { ...meta, ...m } })?.meta
  expect(r({ appMemoryMb: 812.4 })?.appMemoryMb).toBe(812)
  expect(r({ appMemoryMb: 'lots' })).toEqual(meta)
  expect(r({})).toEqual(meta) // older copies send none
})

test("earlier sessions' stored lines are checked again, kept a day, and come before this session's", () => {
  const now = 10 * KEEP_PREVIOUS_MS
  const stored = [
    { at: now - KEEP_PREVIOUS_MS - 1, area: 'call', text: 'too old' },
    { at: now - 60000, area: 'call', text: `call to ${key} failed` },
    { at: now - 50000, area: 'nope', text: 'unknown area' },
    { at: 'soon', area: 'app', text: 'bad time' },
    { at: now + 60000, area: 'app', text: 'from the future' },
    { at: now - 40000, area: 'app', text: 'x'.repeat(5000) },
  ]
  const prev = previousDiagnostics(stored, now)
  expect(prev.map((e) => e.text.slice(0, 20))).toEqual(['call to …A3F9C2 fail', 'x'.repeat(20)]) // scrubbed again
  expect(prev[1].text).toHaveLength(LIMITS.event)
  expect(previousDiagnostics('not a list', now)).toEqual([])
  const many = Array.from({ length: KEEP_PREVIOUS + 50 }, (_, i) => ({ at: now - 1000 + i, area: 'app', text: String(i) }))
  expect(previousDiagnostics(many, now)).toHaveLength(KEEP_PREVIOUS)
  expect(previousDiagnostics(many, now)[0].text).toBe('50') // the newest are kept

  const d = createDiagnostics(() => now, prev)
  d.add('app', 'started again')
  expect(d.list().map((e) => e.text.slice(0, 13))).toEqual(['call to …A3F9', 'x'.repeat(13), 'started again'])
  expect(d.list(['call']).map((e) => e.text)).toEqual(['call to …A3F9C2 failed'])
})

test('diagnostics are saved shortly after a change, all at once, and at once on flush', () => {
  vi.useFakeTimers()
  try {
    const saves: string[][] = []
    const d = createDiagnostics(() => 0, [{ at: 0, area: 'app', text: 'before' }], (e) => saves.push(e.map((x) => x.text)))
    d.add('app', 'one')
    d.add('app', 'two')
    expect(saves).toEqual([])
    vi.advanceTimersByTime(2000)
    expect(saves).toEqual([['before', 'one', 'two']]) // one write for the burst
    d.add('call', 'three')
    d.flush()
    expect(saves[1]).toEqual(['before', 'one', 'two', 'three'])
    vi.advanceTimersByTime(5000)
    expect(saves).toHaveLength(2) // the flush took the pending write
  } finally {
    vi.useRealTimers()
  }
})

test('a report too big with every line loses its oldest lines rather than being turned away', () => {
  const events = Array.from({ length: LIMITS.events }, (_, i) => ({ at: i, area: 'call', text: `${i} `.padEnd(LIMITS.event, 'x') }))
  const r = cleanReport({ id: '0123456789abcdef', at: 1, kind: 'logs', title: 'Logs for pull abcdef', events })
  expect(r).not.toBeNull()
  expect(JSON.stringify(r).length).toBeLessThanOrEqual(LIMITS.bytes)
  expect(r!.events!.length).toBeLessThan(LIMITS.events)
  expect(r!.events!.at(-1)!.text.startsWith(`${LIMITS.events - 1} `)).toBe(true) // the newest stay
})
