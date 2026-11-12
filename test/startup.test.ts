import { expect, test } from 'vitest'
import { type Check, type StepId, LABELS, nowShowing, startupEvent } from '../src/shared/startup'

const all = (done: boolean) => Object.fromEntries(Object.keys(LABELS).map((id) => [id, { done, detail: id }])) as Record<StepId, Check>

test('startup is ready only when every step is done, and never given up then', () => {
  const e = startupEvent(all(true), true)
  expect(e).toMatchObject({ ready: true, gaveUp: false, pending: [] })
  expect(e.steps.map((s) => s.label)).toEqual(Object.values(LABELS))
  expect(nowShowing(e)).toBe('Ready')
})

test('startup names what is pending, the first undone step shows, and time out gives up', () => {
  const checks = { ...all(true), links: { done: false, detail: '', waiting: ['Still connecting to Bob', 'a', 'b', 'c', 'd'] }, memory: { done: false, detail: '' } }
  const e = startupEvent(checks, false)
  expect(e).toMatchObject({ ready: false, gaveUp: false })
  expect(e.pending).toEqual(['Still connecting to Bob', 'a', 'b', 'and 2 more', 'Still tidying up'])
  expect(nowShowing(e)).toBe('Connecting to your friends')
  expect(startupEvent(checks, true).gaveUp).toBe(true)
})

test('an update being installed names its own step', () => {
  const e = startupEvent({ ...all(true), updates: { done: false, label: 'Updating Eleusinia', detail: 'Downloading Eleusinia 0.2.0, 40%' } }, false)
  expect(nowShowing(e)).toBe('Updating Eleusinia')
  expect(e.steps.find((s) => s.id === 'updates')!.detail).toBe('Downloading Eleusinia 0.2.0, 40%')
})
