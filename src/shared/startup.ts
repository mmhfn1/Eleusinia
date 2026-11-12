import type { Event, StartupStep } from './protocol'

// What the splash waits for, in order (the window's own step is the renderer's)
export type StepId = StartupStep['id']
export const LABELS: Record<StepId, string> = {
  account: 'Loading your account',
  network: 'Joining the network',
  updates: 'Checking for updates',
  links: 'Connecting to your friends',
  presence: 'Seeing who is around',
  catchup: 'Catching up',
  memory: 'Tidying up',
}
const ORDER = Object.keys(LABELS) as StepId[]
// One step as the node or main process sees it: waiting names what holds it up, in plain words; label replaces the
// step's usual one (an update being installed says so)
export type Check = { done: boolean; detail: string; waiting?: string[]; label?: string }
export type StartupEvent = Extract<Event, { type: 'startup' }>

// Ready once every step is done; given up (when the caller's time is out) only while something is not. A step's
// first three waits are named, the rest counted, so a long list stays readable.
export function startupEvent(checks: Record<StepId, Check>, timedOut: boolean): StartupEvent {
  const steps = ORDER.map((id) => ({ id, label: checks[id].label ?? LABELS[id], detail: checks[id].detail, done: checks[id].done }))
  const ready = steps.every((s) => s.done)
  const pending = steps
    .filter((s) => !s.done)
    .flatMap(({ id, label }) => {
      const w = checks[id].waiting?.length ? checks[id].waiting! : [`Still ${label[0].toLowerCase()}${label.slice(1)}`]
      return w.length > 3 ? [...w.slice(0, 3), `and ${w.length - 3} more`] : w
    })
  return { type: 'startup', steps, ready, gaveUp: timedOut && !ready, pending }
}

// The label the splash shows now: the first step not done
export const nowShowing = (e: StartupEvent) => e.steps.find((s) => !s.done)?.label ?? 'Ready'
