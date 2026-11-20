// Time spent with each person, counted on this computer only (never sent): minutes in a call together, how many calls,
// the last one, and the games played at the same time. Kept in this window's storage; a wiped storage starts again.
import type { Key, State } from '../shared/protocol'
import * as call from './call'

export type Together = { ms: number; calls: number; last: number; games: Record<string, number> }
const KEY = 'together'
const TICK = 30_000

function load(): Record<Key, Together> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}')
  } catch {
    return {}
  }
}
let all = load()
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {}
}
export const togetherWith = (k: Key): Together | undefined => all[k]

// Each call is counted once per person; each game once a day per person
let session = ''
const counted = new Set<string>() // people counted in this call
const played = new Set<string>() // person, game and day counted
export function tick(st: State) {
  const now = Date.now()
  const day = new Date(now).toDateString()
  const of = (k: Key) => (all[k] ??= { ms: 0, calls: 0, last: 0, games: {} })
  if (call.conv) {
    if (session !== call.conv) (session = call.conv), counted.clear()
    for (const k of call.peers.keys()) {
      const t = of(k)
      t.ms += TICK
      t.last = now
      if (!counted.has(k)) counted.add(k), t.calls++
    }
  } else session = ''
  const mine = st.activity[st.me]?.game?.name
  if (mine)
    for (const [k, a] of Object.entries(st.activity))
      if (k !== st.me && a?.game?.name === mine && !played.has(`${k} ${mine} ${day}`)) {
        played.add(`${k} ${mine} ${day}`)
        of(k).games[mine] = (of(k).games[mine] ?? 0) + 1
      }
  save()
}
export const TOGETHER_TICK = TICK
