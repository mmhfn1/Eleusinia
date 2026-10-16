// Whether someone in a call is speaking, from their audio level. No DOM imports, so it can be unit tested.

// RMS of float samples (-1 to 1). Quiet rooms with noise suppression sit well below this; speech is well above.
export const SPEAKING_RMS = 0.015
// Speech has short gaps between words; holding the ring this long after the level drops keeps it from flickering.
export const HANG_MS = 250

export function rms(samples: ArrayLike<number>) {
  if (!samples.length) return 0
  let sum = 0
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
  return Math.sqrt(sum / samples.length)
}

// One reading: whether they count as speaking now, and when they were last loud (null if not yet).
export function hear(level: number, now: number, loudAt: number | null, threshold = SPEAKING_RMS, hang = HANG_MS) {
  if (level > threshold) return { speaking: true, loudAt: now }
  return { speaking: loudAt !== null && now - loudAt < hang, loudAt }
}

// Mic sensitivity: with a level set (in dB, -70 quiet to -10 loud), the microphone only sends while you are louder
// than it, and for a moment after so word endings are not cut off. Off when no level is set.
export const GATE_HANG_MS = 400
export const GATE_DB = { min: -70, max: -10, initial: -45 }
export const dbOf = (level: number) => (level > 0 ? 20 * Math.log10(level) : -Infinity)
export function gate(level: number, now: number, loudAt: number | null, db: number | undefined) {
  if (db === undefined) return { open: true, loudAt }
  const r = hear(level, now, loudAt, 10 ** (db / 20), GATE_HANG_MS)
  return { open: r.speaking, loudAt: r.loudAt }
}
