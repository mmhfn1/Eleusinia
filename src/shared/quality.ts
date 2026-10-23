// How a call's connection is doing, from periodic samples. No DOM imports, so it can be unit tested.
// Samples live in memory only, a few per link, and are dropped when the call ends.

export type Sample = { rtt: number; loss?: number; jitter?: number } // round trip in ms, lost fraction 0-1, jitter in ms
export type Grade = 'good' | 'fair' | 'poor'

export const SAMPLE_EVERY = 2000
// About 10 s of history: one slow packet does not flip the colour, a lasting change shows within seconds.
export const WINDOW = 5

export const remember = (list: Sample[] = [], s: Sample) => [...list, s].slice(-WINDOW)

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1]

// Loss and jitter are what people hear: Opus hides a couple of percent of loss, and from about 8 % words drop out.
// Round trip alone is distance, which nothing can fix: a call between continents (250 ms and more) is still a good
// call, so only from 300 ms does it count against the link, and from 450 ms people talk over each other.
export function grade(samples: Sample[]): Grade | null {
  if (!samples.length) return null
  const rtt = median(samples.map((s) => s.rtt))
  const loss = median(samples.map((s) => s.loss ?? 0))
  const jitter = median(samples.map((s) => s.jitter ?? 0))
  if (rtt >= 450 || loss >= 0.08 || jitter >= 60) return 'poor'
  if (rtt >= 300 || loss >= 0.02 || jitter >= 30) return 'fair'
  return 'good'
}

// How much audio a voice's player should keep in hand, in ms, from the jitter of what arrives: none (Chromium's own
// choice) on an even link, otherwise twice the jitter, between 40 and 150 ms. A little delay beats stretched and
// clipped words on an uneven link. Once holding, it lets go only below 10 ms: a link hovering at 15 ms flipped the
// player every few seconds, and each flip is an audible stretch or squeeze.
export const jitterTarget = (jitterMs: number, holding = false) =>
  jitterMs < (holding ? 10 : 15) ? null : Math.round(Math.min(150, Math.max(40, jitterMs * 2)))

const ORDER: Grade[] = ['good', 'fair', 'poor']
// A call is only as good as its weakest link.
export const worst = (grades: (Grade | null)[]) =>
  grades.reduce<Grade | null>((w, g) => (g && (!w || ORDER.indexOf(g) > ORDER.indexOf(w)) ? g : w), null)

// The ping shown to the user: steady over the last minute rather than the latest reading, plus how much it moves.
// Only fresh measurements are kept (a stat that did not update since the last sample is not a new reading), so a
// silent stretch cannot repeat one stale value, and one late reply cannot make the number jump.
export type PingReading = { ms: number; at: number }
export type Steadiness = 'steady' | 'varies' | 'unstable'
export const PING_WINDOW = 60000

export const rememberPing = (list: PingReading[] = [], r: PingReading) => [...list, r].filter((p) => r.at - p.at < PING_WINDOW).slice(-30)

const at = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]

// ms: the typical ping (median). spread: how far it usually strays from that (half the middle half's range), so a
// single odd reading does not count. Steadiness compares that range with the ping itself: ±15 ms is nothing on a
// 250 ms intercontinental link but a lot on a 20 ms local one.
export function pingSummary(list: PingReading[]): { ms: number; spread: number; steadiness: Steadiness } | null {
  if (!list.length) return null
  const ok = list.map((p) => p.ms).filter(Number.isFinite).sort((a, b) => a - b)
  if (ok.length * 2 < list.length) return { ms: Infinity, spread: 0, steadiness: 'unstable' } // mostly no reply
  const ms = Math.round(at(ok, 0.5))
  const range = at(ok, 0.75) - at(ok, 0.25)
  const lost = ok.length < list.length
  const steadiness = !lost && range <= Math.max(10, ms * 0.08) ? 'steady' : range <= Math.max(30, ms * 0.25) ? 'varies' : 'unstable'
  return { ms, spread: Math.round(range / 2), steadiness }
}
