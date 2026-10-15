import { expect, test } from 'vitest'
import { type Bindings, ESCAPE, createMatcher, createRecorder } from '../src/shared/hotkeys'

const CTRL = 29
const M = 50
const V = 47
const D = 32

test('nothing fires when no hotkey is bound', () => {
  const m = createMatcher(() => ({}))
  expect([...m.down(CTRL), ...m.down(M), ...m.up(M), ...m.up(CTRL)]).toEqual([])
})

test('a combination fires once when its last key goes down, ignoring auto-repeat and order', () => {
  const bindings: Bindings = { mute: { keys: [CTRL, M], label: 'Ctrl+M' } }
  const m = createMatcher(() => bindings)
  expect(m.down(M)).toEqual([])
  expect(m.down(CTRL)).toEqual([{ action: 'mute', down: true }])
  expect(m.down(CTRL)).toEqual([]) // held key repeating
  expect(m.up(M)).toEqual([]) // toggles report only the press
  expect(m.down(M)).toEqual([{ action: 'mute', down: true }]) // pressed again while Ctrl is held
})

test('push to talk reports both pressing and releasing', () => {
  const m = createMatcher(() => ({ ptt: { keys: [V], label: 'V' } }))
  expect(m.down(V)).toEqual([{ action: 'ptt', down: true }])
  expect(m.down(V)).toEqual([])
  expect(m.up(V)).toEqual([{ action: 'ptt', down: false }])
})

test('a reset never leaves push to talk on', () => {
  const m = createMatcher(() => ({ ptt: { keys: [V], label: 'V' }, deafen: { keys: [D], label: 'D' } }))
  m.down(V)
  m.down(D)
  expect(m.reset()).toEqual([{ action: 'ptt', down: false }])
  expect(m.up(V)).toEqual([])
})

test('changing a binding takes effect straight away', () => {
  let bindings: Bindings = { deafen: { keys: [D], label: 'D' } }
  const m = createMatcher(() => bindings)
  expect(m.down(D)).toEqual([{ action: 'deafen', down: true }])
  m.up(D)
  bindings = {}
  expect(m.down(D)).toEqual([])
})

test('recording collects every key until all are released; a lone Escape cancels', () => {
  const r = createRecorder()
  r.down(CTRL)
  r.down(M)
  expect(r.up(M)).toBe(null) // Ctrl still held
  expect(r.up(CTRL)).toEqual([CTRL, M].sort((a, b) => a - b))
  const c = createRecorder()
  c.down(ESCAPE)
  expect(c.up(ESCAPE)).toBe('cancel')
  const e = createRecorder()
  e.down(CTRL)
  e.down(ESCAPE)
  e.up(ESCAPE)
  expect(e.up(CTRL)).toEqual([ESCAPE, CTRL]) // Escape inside a combination is allowed
})
