// How we stand with someone, in the words the window shows (friends list, profile card, call tiles, a DM's pending
// messages). Pure, so it is tested without a window (test/reach.test.ts).
import type { Key, State } from './protocol'

// linked; online by their presence note but not linked yet (connecting); online but every direct and relayed attempt
// failed for now (unreachable, node.ts State.unreachable, tried again later); or offline
export type Reach = 'linked' | 'connecting' | 'unreachable' | 'offline'
type Seen = Pick<State, 'online' | 'present' | 'unreachable'>

export const reachOf = (st: Seen, k: Key): Reach =>
  st.online.includes(k) ? 'linked' : !st.present.includes(k) ? 'offline' : st.unreachable.includes(k) ? 'unreachable' : 'connecting'

export const REACH_WORDS: Record<Reach, string> = { linked: 'Online', connecting: 'Online, connecting…', unreachable: "Online, can't connect yet", offline: 'Offline' }

// A call connection's state (RTCPeerConnection.connectionState) in words
export const STATE_WORDS: Record<string, string> = {
  new: 'Connecting…',
  connecting: 'Connecting…',
  connected: 'Connected',
  disconnected: 'Reconnecting…',
  failed: 'Reconnecting…', // call.ts retries until the peer leaves or goes offline
  closed: 'Disconnected',
}

// A call connection still forming while the node reaches them neither directly nor through a relay will not form on
// its own: say so rather than "Connecting…" for ever. Someone in our call is online, so present is not needed here.
export const callWords = (st: Pick<State, 'unreachable'>, k: Key, pc: string) =>
  (pc === 'new' || pc === 'connecting') && st.unreachable.includes(k) ? "Can't connect yet" : (STATE_WORDS[pc] ?? pc)

// What a DM's messages still waiting for the other side say
export const pendingWords = (r: Reach) =>
  r === 'connecting' ? 'pending, connecting to them' : r === 'unreachable' ? "pending, can't connect to them yet; tried again soon" : 'pending, sends when they are online'
