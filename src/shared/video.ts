// Screen sharing decisions with no DOM imports, so they can be unit tested: the qualities a source allows,
// the bitrate a choice needs, what each viewer is sent, and whether a new stream fits the call.

export type Source = { width: number; height: number; fps: number } // what the screen or window can deliver
export type Quality = { height: number; fps: number; motion: boolean } // the streamer's choice, always final
export type Level = 'off' | 'thumb' | 'full' // what a viewer is showing of a stream

const HEIGHTS = [720, 1080, 1440, 2160]
const RATES = [15, 30, 60, 120, 144, 240]
export const heightLabel = (h: number) => (h === 2160 ? '4K' : `${h}p`)

// Every resolution and frame rate the source can deliver, up to its own limits (4K at 120 fps if the system has it).
export function choices(src: Source) {
  const heights = HEIGHTS.filter((h) => h <= src.height)
  const rates = RATES.filter((f) => f <= src.fps)
  return { heights: heights.length ? heights : [src.height], rates: rates.length ? rates : [src.fps] }
}

// 720p at 30 fps, or the closest the source allows.
export function defaultQuality(src: Source): Quality {
  const { heights, rates } = choices(src)
  return { height: heights.includes(720) ? 720 : heights[0], fps: Math.max(rates[0], ...rates.filter((f) => f <= 30)), motion: false }
}

// The streamer's quality carried over to another source: kept as is when the new source allows it,
// otherwise the highest the new source offers below it (a smaller window cannot be scaled up).
export function fitQuality(src: Source, q: Quality): Quality {
  const { heights, rates } = choices(src)
  const below = (list: number[], v: number) => (list.includes(v) ? v : Math.max(list[0], ...list.filter((x) => x <= v)))
  return { ...q, height: below(heights, q.height), fps: below(rates, q.fps) }
}

// Keeps the source's shape; even numbers, as video encoders want.
export const widthFor = (src: Source, height: number) => Math.round((height * src.width) / src.height / 2) * 2

// Bits per pixel per frame: text and still screens compress far better than motion (games, video).
export function streamKbps(src: Source, q: Quality) {
  const bps = widthFor(src, q.height) * q.height * q.fps * (q.motion ? 0.08 : 0.05)
  return Math.round(Math.min(50000, Math.max(500, bps / 1000)))
}

// What one viewer is sent: nothing while they are not showing the stream, a small copy for a thumbnail,
// and exactly the streamer's chosen quality whenever it is shown full size.
export function encodingFor(level: Level, q: Quality, kbps: number) {
  if (level === 'off') return { active: false }
  if (level === 'thumb') return { active: true, scaleResolutionDownBy: Math.max(1, q.height / 180), maxBitrate: 150_000, maxFramerate: Math.min(q.fps, 15) }
  return { active: true, scaleResolutionDownBy: 1, maxBitrate: kbps * 1000, maxFramerate: q.fps }
}

// A shared screen's sound (games, video, music): Opus at a rate where music holds up.
export const SOUND_KBPS = 128

// What a camera can deliver, from its track's capabilities, falling back to what it is doing now.
export function cameraSource(
  caps: { width?: { max?: number }; height?: { max?: number }; frameRate?: { max?: number } },
  now: { width?: number; height?: number; frameRate?: number },
) {
  return {
    width: caps.width?.max ?? now.width ?? 1280,
    height: caps.height?.max ?? now.height ?? 720,
    fps: Math.round(caps.frameRate?.max ?? now.frameRate ?? 30),
  }
}

// Room left for voice and everything else on the connection.
export const UPLOAD_SHARE = 0.8
// A stream counts as starved only when it lasts this many samples in a row (2 s each)...
export const STARVED_AFTER = 5
// ...and not while a new stream is still ramping up, when every stream is briefly limited.
export const RAMP_MS = 15000

export type Verdict = { ok: true } | { ok: false; reason: 'call' } | { ok: false; reason: 'upload'; needKbps: number; uploadKbps: number }

// The soft cap, worked out when someone asks to stream: their upload must carry their chosen quality to every
// viewer, and nobody already streaming may be starved of bandwidth, since one more stream would make that worse.
// An unknown upload (the measurement failed) does not block.
export function canStream(o: { kbps: number; viewers: number; uploadKbps: number | null; starved: boolean }): Verdict {
  if (!o.viewers) return { ok: true }
  if (o.starved) return { ok: false, reason: 'call' }
  const needKbps = o.kbps * o.viewers
  if (o.uploadKbps !== null && needKbps > o.uploadKbps * UPLOAD_SHARE) return { ok: false, reason: 'upload', needKbps, uploadKbps: o.uploadKbps }
  return { ok: true }
}
