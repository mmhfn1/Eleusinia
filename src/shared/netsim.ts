// Testing only: a bad line between two callers, for the call lab and smoke runs (ELEUSINIA_TEST_NET). It sits on the
// relayed call path (relay.ts), so with ELEUSINIA_NO_DIRECT every call packet goes through it. Never set in use.
//
// Spec, comma separated: delay=150 (ms one way), jitter=30 (ms, +-), loss=0.03 (average fraction lost), burst=4
// (average packets lost in a row), outage=30:8 (from 30 s after the first packet, drop everything for 8 s).

export type NetSim = { delay: number; jitter: number; loss: number; burst: number; outage: [number, number] | null }

export function parseNetSim(spec: string | undefined): NetSim | null {
  if (!spec) return null
  const v: Record<string, string> = Object.fromEntries(spec.split(',').map((p) => p.split('=').map((s) => s.trim())))
  const n = (k: string, d: number) => (Number.isFinite(Number(v[k])) ? Number(v[k]) : d)
  const o = v.outage?.split(':').map(Number)
  return {
    delay: Math.max(0, n('delay', 0)),
    jitter: Math.max(0, n('jitter', 0)),
    loss: Math.min(0.9, Math.max(0, n('loss', 0))),
    burst: Math.max(1, n('burst', 1)),
    outage: o && o.length === 2 && o.every(Number.isFinite) ? [o[0] * 1000, o[1] * 1000] : null,
  }
}

// Gilbert-Elliott: a good state that loses nothing and a bad one that loses everything, with the switching chances
// set so the average loss and burst length match the spec.
export function createImpairment(sim: NetSim, rand = Math.random, now = Date.now) {
  const leaveBad = 1 / sim.burst
  const enterBad = sim.loss >= 1 ? 1 : (sim.loss * leaveBad) / (1 - sim.loss)
  let bad = false
  let start: number | null = null
  return (send: () => void) => {
    const t = now()
    start ??= t
    if (sim.outage && t - start >= sim.outage[0] && t - start < sim.outage[0] + sim.outage[1]) return
    bad = bad ? rand() >= leaveBad : rand() < enterBad
    if (bad) return
    const wait = sim.delay + (rand() * 2 - 1) * sim.jitter
    if (wait <= 0) return send()
    setTimeout(send, wait)
  }
}
