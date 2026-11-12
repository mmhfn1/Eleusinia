// Which relaying peers to ask when someone cannot be linked directly (node.ts tryRelay). Pure, so it is tested alone.
//
// 0.1.3 asked 3 at random, and the one peer able to reach the target was often not among them. Best first: the relay
// that worked last for them, then peers in the same call as them (they talk to them right now), then peers who share
// a server or group with them (they know them, so may link to them on request), then the rest, shuffled within each
// rank so asks spread over everyone.
export const ASK_RELAYS = 6

export function pickRelays<K extends string>(
  cands: K[],
  target: K,
  how: { last?: K; callOf: (k: K) => string | null | undefined; shares: (k: K) => boolean },
  n = ASK_RELAYS,
  random = Math.random,
): K[] {
  const call = how.callOf(target)
  const rank = (c: K) => (c === how.last ? 0 : call && how.callOf(c) === call ? 1 : how.shares(c) ? 2 : 3)
  return cands
    .map((c) => ({ c, r: rank(c), x: random() }))
    .sort((a, b) => a.r - b.r || a.x - b.x)
    .slice(0, n)
    .map((e) => e.c)
}
