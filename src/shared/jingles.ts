// The app's sounds, as notes played on a synthesizer (renderer/jingles.ts): nothing to download or ship. Each one is
// different, so a sound alone says what happened: muting goes down and unmuting up, deafening is lower and slower,
// someone joining rises and someone leaving falls. Ringing and the caller tune repeat for RING_MS at most; the call
// itself never ends because nobody answered.

export type Jingle = 'mute' | 'unmute' | 'deafen' | 'undeafen' | 'join' | 'leave' | 'ring' | 'calling' | 'waiting' | 'talk' | 'untalk'
export type Note = { f: number; t: number; d: number; wave: 'sine' | 'triangle' | 'square'; gain?: number } // Hz, start s, length s

export const JINGLES: Record<Jingle, Note[]> = {
  mute: [
    { f: 740, t: 0, d: 0.07, wave: 'sine' },
    { f: 494, t: 0.08, d: 0.11, wave: 'sine' },
  ],
  unmute: [
    { f: 494, t: 0, d: 0.07, wave: 'sine' },
    { f: 740, t: 0.08, d: 0.11, wave: 'sine' },
  ],
  deafen: [
    { f: 587, t: 0, d: 0.09, wave: 'triangle' },
    { f: 440, t: 0.11, d: 0.09, wave: 'triangle' },
    { f: 294, t: 0.22, d: 0.18, wave: 'triangle' },
  ],
  undeafen: [
    { f: 294, t: 0, d: 0.09, wave: 'triangle' },
    { f: 440, t: 0.11, d: 0.09, wave: 'triangle' },
    { f: 587, t: 0.22, d: 0.18, wave: 'triangle' },
  ],
  join: [
    { f: 523, t: 0, d: 0.09, wave: 'sine' },
    { f: 659, t: 0.08, d: 0.09, wave: 'sine' },
    { f: 784, t: 0.16, d: 0.09, wave: 'sine' },
    { f: 1047, t: 0.24, d: 0.2, wave: 'sine' },
  ],
  leave: [
    { f: 880, t: 0, d: 0.12, wave: 'sine' },
    { f: 659, t: 0.13, d: 0.12, wave: 'sine' },
    { f: 440, t: 0.26, d: 0.26, wave: 'sine' },
  ],
  // Push to talk held and let go: a single soft tick up and down, short enough to use constantly.
  talk: [{ f: 1175, t: 0, d: 0.045, wave: 'sine', gain: 0.6 }],
  untalk: [{ f: 880, t: 0, d: 0.04, wave: 'sine', gain: 0.45 }],
  // An incoming direct call: two quick trills, like a phone.
  ring: [0, 0.7].flatMap((at) => Array.from({ length: 8 }, (_, i) => ({ f: i % 2 ? 1568 : 1319, t: at + i * 0.055, d: 0.05, wave: 'square' as const, gain: 0.35 }))),
  // A direct call while you are already in one: two soft beeps, heard over the conversation without drowning it.
  waiting: [
    { f: 880, t: 0, d: 0.12, wave: 'sine', gain: 0.4 },
    { f: 880, t: 0.22, d: 0.12, wave: 'sine', gain: 0.4 },
  ],
  // Calling someone: a soft rising tune while you wait for them to answer.
  calling: [
    { f: 392, t: 0, d: 0.28, wave: 'triangle' },
    { f: 494, t: 0.32, d: 0.28, wave: 'triangle' },
    { f: 587, t: 0.64, d: 0.28, wave: 'triangle' },
    { f: 494, t: 0.96, d: 0.5, wave: 'triangle' },
  ],
}

export const RING_MS = 40000
export const LOOP_EVERY: Record<'ring' | 'calling' | 'waiting', number> = { ring: 3000, calling: 3500, waiting: 4000 }

// What should be repeating now. calling: since when we have waited alone in a direct call we started or joined
// first; ringing: since when each direct call we are not in has been going. Calling takes priority.
// inCall: we are in another call, so a ringing one only gets the soft call-waiting beeps.
export function loopNow(now: number, calling: number | null, ringing: number[], inCall = false): 'ring' | 'calling' | 'waiting' | null {
  if (calling !== null && now - calling < RING_MS) return 'calling'
  return ringing.some((at) => now - at < RING_MS) ? (inCall ? 'waiting' : 'ring') : null
}
