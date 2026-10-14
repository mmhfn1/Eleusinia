import { expect, test } from 'vitest'
import { fellBack, nextDevice, usable } from '../src/shared/devices'

const headset = { kind: 'audioinput', deviceId: 'headset' }
const builtIn = { kind: 'audioinput', deviceId: 'builtin' }
const speakers = { kind: 'audiooutput', deviceId: 'speakers' }

test('the chosen device is used while it is plugged in', () => {
  expect(usable('headset', 'audioinput', [builtIn, headset])).toBe('headset')
})

test('a chosen device that is missing gives way to the default', () => {
  expect(usable('headset', 'audioinput', [builtIn, speakers])).toBe('')
})

test('a device of the other kind with the same id does not count', () => {
  expect(usable('speakers', 'audioinput', [builtIn, speakers])).toBe('')
})

test('the default stays the default', () => {
  expect(usable('', 'audioinput', [])).toBe('')
  expect(usable('', 'audioinput', [headset])).toBe('')
})

test('a list without ids (before permission) cannot tell, so the choice is kept', () => {
  expect(usable('headset', 'audioinput', [{ kind: 'audioinput', deviceId: '' }])).toBe('headset')
  expect(usable('headset', 'audioinput', [])).toBe('headset')
})

test('unplugging switches to the default, and plugging back in switches back', () => {
  let inUse = 'headset'
  const step = (devices: { kind: string; deviceId: string }[]) => {
    const next = nextDevice('headset', inUse, 'audioinput', devices)
    if (next !== null) inUse = next
    return next
  }
  expect(step([builtIn, headset])).toBeNull() // nothing changed
  expect(step([builtIn])).toBe('') // unplugged
  expect(fellBack('headset', inUse)).toBe(true)
  expect(step([builtIn, speakers])).toBeNull() // still unplugged: no second switch
  expect(step([builtIn, headset])).toBe('headset') // back
  expect(fellBack('headset', inUse)).toBe(false)
})

test('choosing the default is never a fallback', () => {
  expect(fellBack('', '')).toBe(false)
  expect(nextDevice('', '', 'audioinput', [builtIn])).toBeNull()
})

test('a chosen device whose id changed is found again by its name', () => {
  const renamed = { kind: 'audioinput', deviceId: 'new-id', label: 'HyperX Cloud' }
  expect(usable('old-id', 'audioinput', [builtIn, renamed], 'HyperX Cloud')).toBe('new-id')
  expect(fellBack('old-id', 'new-id')).toBe(false) // the chosen headset, not a stand-in: no notice
})

test('the id wins over the name, and the name must match exactly and in kind', () => {
  const sameName = { kind: 'audioinput', deviceId: 'other', label: 'HyperX Cloud' }
  expect(usable('headset', 'audioinput', [headset, sameName], 'HyperX Cloud')).toBe('headset')
  expect(usable('old-id', 'audioinput', [{ kind: 'audioinput', deviceId: 'x', label: 'HyperX Cloud II' }], 'HyperX Cloud')).toBe('')
  expect(usable('old-id', 'audioinput', [builtIn, { kind: 'audiooutput', deviceId: 'x', label: 'HyperX Cloud' }], 'HyperX Cloud')).toBe('')
})

test('without a saved name (older settings), a changed id falls back to the default', () => {
  const renamed = { kind: 'audioinput', deviceId: 'new-id', label: 'HyperX Cloud' }
  expect(usable('old-id', 'audioinput', [builtIn, renamed])).toBe('')
  expect(usable('old-id', 'audioinput', [builtIn, renamed], '')).toBe('')
})

test('a device that comes back under a new id is switched back to by name', () => {
  let inUse = 'old-id'
  const step = (devices: { kind: string; deviceId: string; label?: string }[]) => {
    const next = nextDevice('old-id', inUse, 'audioinput', devices, 'HyperX Cloud')
    if (next !== null) inUse = next
    return next
  }
  expect(step([builtIn])).toBe('') // unplugged
  expect(fellBack('old-id', inUse)).toBe(true)
  expect(step([builtIn, { kind: 'audioinput', deviceId: 'new-id', label: 'HyperX Cloud' }])).toBe('new-id')
  expect(fellBack('old-id', inUse)).toBe(false)
})
