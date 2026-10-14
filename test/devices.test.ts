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
