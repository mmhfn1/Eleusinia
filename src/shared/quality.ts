// How a call's connection is doing, from periodic samples. No DOM imports, so it can be unit tested.
// Samples live in memory only, a few per link, and are dropped when the call ends.

export type Sample = { rtt: number; loss?: number; jitter?: number } // round trip in ms, lost fraction 0-1, jitter in ms
export type Grade = 'good' | 'fair' | 'poor'

export const SAMPLE_EVERY = 2000
// About 10 s of history: one slow packet does not flip the colour, a lasting change shows within seconds.
export const WINDOW = 5

export const remember = (list: Sample[] = [], s: Sample) => [...list, s].slice(-WINDOW)

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1]

// Common VoIP limits: under 150 ms round trip feels immediate and from 300 ms people talk over each other;
// Opus hides a couple of percent of loss, and from about 8 % words drop out.
export function grade(samples: Sample[]): Grade | null {
  if (!samples.length) return null
  const rtt = median(samples.map((s) => s.rtt))
  const loss = median(samples.map((s) => s.loss ?? 0))
  const jitter = median(samples.map((s) => s.jitter ?? 0))
  if (rtt >= 300 || loss >= 0.08 || jitter >= 60) return 'poor'
  if (rtt >= 150 || loss >= 0.02 || jitter >= 30) return 'fair'
  return 'good'
}

const ORDER: Grade[] = ['good', 'fair', 'poor']
// A call is only as good as its weakest link.
export const worst = (grades: (Grade | null)[]) =>
  grades.reduce<Grade | null>((w, g) => (g && (!w || ORDER.indexOf(g) > ORDER.indexOf(w)) ? g : w), null)
