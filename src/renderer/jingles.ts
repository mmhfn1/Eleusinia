// Plays the app's sounds (shared/jingles.ts) on their own small AudioContext, so they work outside calls too (a
// ringing call) and never mix into what the microphone sends.
import { JINGLES, type Jingle } from '../shared/jingles'

let ctx: AudioContext | null = null
let sink: string | null = null
let doneAt = 0
let idle: ReturnType<typeof setTimeout> | undefined

// volume: 0 to 2, the output volume from Settings. out: the chosen speakers ('' for the system default).
export async function play(name: Jingle, volume: number, out: string) {
  if (volume <= 0) return
  ctx ??= new AudioContext()
  if (sink !== out) {
    sink = out
    await (ctx as AudioContext & { setSinkId(id: string): Promise<void> }).setSinkId(out).catch(() => {}) // unplugged: the default
  }
  await ctx.resume().catch(() => {})
  const start = ctx.currentTime + 0.02
  for (const n of JINGLES[name]) {
    const osc = ctx.createOscillator()
    const amp = ctx.createGain()
    osc.type = n.wave
    osc.frequency.value = n.f
    // A short fade in and out, so notes never click.
    const peak = 0.18 * volume * (n.gain ?? 1)
    const t0 = start + n.t
    amp.gain.setValueAtTime(0, t0)
    amp.gain.linearRampToValueAtTime(peak, t0 + 0.01)
    amp.gain.setValueAtTime(peak, t0 + Math.max(0.01, n.d - 0.03))
    amp.gain.linearRampToValueAtTime(0, t0 + n.d)
    osc.connect(amp).connect(ctx.destination)
    osc.start(t0)
    osc.stop(t0 + n.d + 0.02)
    doneAt = Math.max(doneAt, t0 + n.d + 0.02)
  }
  // Suspended between sounds: a running context keeps an output stream open, which costs CPU and keeps Windows awake.
  clearTimeout(idle)
  idle = setTimeout(() => ctx?.suspend().catch(() => {}), (doneAt - ctx.currentTime + 0.5) * 1000)
}
