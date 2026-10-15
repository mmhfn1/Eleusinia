import { expect, test } from 'vitest'
import { canStream, choices, defaultQuality, encodingFor, fitQuality, streamKbps, widthFor } from '../src/shared/video'

const fourK = { width: 3840, height: 2160, fps: 120 }
const laptop = { width: 1920, height: 1080, fps: 60 }

test('choices go as high as the system allows, 4K at 120 fps included', () => {
  expect(choices(fourK)).toEqual({ heights: [720, 1080, 1440, 2160], rates: [15, 30, 60, 120] })
  expect(choices(laptop)).toEqual({ heights: [720, 1080], rates: [15, 30, 60] })
  // A small window cannot be scaled up: its own size is the only choice.
  expect(choices({ width: 800, height: 500, fps: 60 }).heights).toEqual([500])
})

test('streams default to 720p at 30 fps, or the closest the source allows', () => {
  expect(defaultQuality(fourK)).toEqual({ height: 720, fps: 30, motion: false })
  expect(defaultQuality({ width: 800, height: 500, fps: 24 })).toEqual({ height: 500, fps: 15, motion: false })
})

test('switching screens keeps the chosen quality where the new source allows it', () => {
  const q = { height: 1440, fps: 120, motion: true }
  expect(fitQuality(fourK, q)).toEqual(q)
  expect(fitQuality(laptop, q)).toEqual({ height: 1080, fps: 60, motion: true })
  expect(fitQuality({ width: 800, height: 500, fps: 60 }, q)).toEqual({ height: 500, fps: 60, motion: true })
})

test('width keeps the source shape', () => {
  expect(widthFor(laptop, 720)).toBe(1280)
  expect(widthFor({ width: 3440, height: 1440, fps: 60 }, 720)).toBe(1720)
})

test('bitrate grows with pixels and frame rate, more for motion, within sane bounds', () => {
  const q = { height: 720, fps: 30, motion: false }
  expect(streamKbps(laptop, q)).toBe(1382)
  expect(streamKbps(laptop, { ...q, motion: true })).toBeGreaterThan(streamKbps(laptop, q))
  expect(streamKbps(fourK, { height: 2160, fps: 120, motion: true })).toBe(50000)
  expect(streamKbps({ width: 400, height: 300, fps: 15 }, { height: 300, fps: 15, motion: false })).toBe(500)
})

test('a viewer showing the stream full size gets exactly the chosen quality; others get less or nothing', () => {
  const q = { height: 1440, fps: 60, motion: false }
  expect(encodingFor('full', q, 9000)).toEqual({ active: true, scaleResolutionDownBy: 1, maxBitrate: 9_000_000, maxFramerate: 60 })
  expect(encodingFor('thumb', q, 9000)).toEqual({ active: true, scaleResolutionDownBy: 8, maxBitrate: 150_000, maxFramerate: 15 })
  expect(encodingFor('off', q, 9000)).toEqual({ active: false })
})

test('the soft cap: a stream must fit the streamer upload, and nobody already streaming may be starved', () => {
  expect(canStream({ kbps: 5000, viewers: 0, uploadKbps: 100, starved: true })).toEqual({ ok: true }) // alone in the call
  expect(canStream({ kbps: 1400, viewers: 4, uploadKbps: 10000, starved: false })).toEqual({ ok: true })
  expect(canStream({ kbps: 1400, viewers: 4, uploadKbps: 6000, starved: false })).toEqual({ ok: false, reason: 'upload', needKbps: 5600, uploadKbps: 6000 })
  expect(canStream({ kbps: 1400, viewers: 4, uploadKbps: 10000, starved: true })).toEqual({ ok: false, reason: 'call' })
  expect(canStream({ kbps: 1400, viewers: 4, uploadKbps: null, starved: false })).toEqual({ ok: true }) // unmeasured: never blocks
})
