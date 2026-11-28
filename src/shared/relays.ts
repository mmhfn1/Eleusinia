// Hosted relays and the order of routes to someone (design/plan-public-relay.md, "Order of routes"). Pure, so it is
// tested alone; node.ts measures the hosted relays and asks friends.
import { type Key, isKey } from './protocol'

// The project's own relays, by public key (the address on the DHT; their IP may change). The Oracle relay's key goes
// here once it runs: `npm run relay -- --print-key` on the server (docs/oracle-setup.md).
export const HOSTED_RELAYS: Key[] = ['4eb446bae09abc9ab114d7877eae7283c5965014603cfd64479bf6c67ada0798']

// ELEUSINIA_RELAYS (testing only): comma or space separated keys in place of HOSTED_RELAYS; set but empty means none.
export function parseRelays(env: string | undefined): Key[] {
  if (env === undefined) return HOSTED_RELAYS
  return [...new Set(env.split(/[\s,]+/).filter(isKey))]
}

// The project's server forwarders (design/plan-stream-forwarding.md, phase 5), used last by forward.ts: `node forwarder.cjs
// --data … --print-key` on the server (docs/oracle-setup.md, part F). The Oracle server, beside the relay.
export const HOSTED_FORWARDERS: Key[] = ['c87b676f72d1cee9cc4b453c3b18350531aaca00e432be9286430828a3c8ca6b']

// ELEUSINIA_FORWARDERS (testing only), read like ELEUSINIA_RELAYS: set but empty means none
export const parseForwarders = (env: string | undefined): Key[] => (env === undefined ? HOSTED_FORWARDERS : parseRelays(env))

// Hosted relays nearest first by measured handshake time; one that did not answer (null) is left out.
export const nearest = (rtts: Record<Key, number | null>): Key[] =>
  Object.keys(rtts)
    .filter((k) => Number.isFinite(rtts[k]))
    .sort((a, b) => rtts[a]! - rtts[b]!)

export type Hop = { key: Key; kind: 'friend' | 'hosted' } // friend: the contact's identity key, hosted: the relay's
export type Route = {
  direct: boolean // dial directly first: skipped only when both sides are known to be strict
  first: Hop | null // the relay that worked last, tried alone, if it is still available
  // the nearest hosted relay, and friend asks starting friendsAfter ms later (at once when the hosted dial fails)
  race: { friends: Key[]; hosted: Key | null; friendsAfter: number }
  next: Key[] // further hosted relays, nearest first, one at a time once the race failed
}

// A friend's relay carries voice and pictures only (State.relayed, 24 KB/s), a hosted relay video and files too, so
// the hosted relay gets this long to link before friends are asked; it links within a couple of seconds when it can.
// Before, both started at once and a friend that won left the call without video.
export const HOSTED_HEADSTART = 6000

export function routeFor(o: {
  meStrict: boolean
  themStrict: boolean | null // null: not known yet (an older copy, or no hello or note heard)
  lastGood?: Hop
  hosted: Key[] // answering hosted relays, nearest first (nearest)
  friends: Key[] // relaying contacts, already ranked (pickRelays)
}): Route {
  const g = o.lastGood
  // A friend that worked last goes first only while no hosted relay answers: one that does carries more
  const first = g && (g.kind === 'friend' ? !o.hosted.length && o.friends.includes(g.key) : o.hosted.includes(g.key)) ? g : null
  const friends = first?.kind === 'friend' ? o.friends.filter((k) => k !== first.key) : o.friends
  const [hosted = null, ...next] = first?.kind === 'hosted' ? o.hosted.filter((k) => k !== first.key) : o.hosted
  return { direct: !(o.meStrict && o.themStrict === true), first, race: { friends, hosted, friendsAfter: hosted ? HOSTED_HEADSTART : 0 }, next }
}
