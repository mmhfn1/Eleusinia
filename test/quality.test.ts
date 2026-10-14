import { expect, test } from 'vitest'
import { lightOpus } from '../src/shared/callstate'
import { clampOffset, cropRect } from '../src/shared/crop'
import { WINDOW, grade, remember, worst } from '../src/shared/quality'

const many = (n: number, s: object) => Array.from({ length: n }, () => ({ rtt: 40, ...s }))

test('grades follow round trip, loss and jitter', () => {
  expect(grade([])).toBe(null)
  expect(grade(many(5, { rtt: 40 }))).toBe('good')
  expect(grade(many(5, { rtt: 180 }))).toBe('fair')
  expect(grade(many(5, { rtt: 320 }))).toBe('poor')
  expect(grade(many(5, { loss: 0.03 }))).toBe('fair')
  expect(grade(many(5, { loss: 0.1 }))).toBe('poor')
  expect(grade(many(5, { jitter: 40 }))).toBe('fair')
  expect(grade(many(5, { rtt: Infinity }))).toBe('poor') // no response at all
})

test('one slow sample does not change the grade, a lasting change does', () => {
  let s = many(4, {})
  s = remember(s, { rtt: 900 })
  expect(grade(s)).toBe('good')
  for (let i = 0; i < 3; i++) s = remember(s, { rtt: 900 })
  expect(grade(s)).toBe('poor')
  expect(s).toHaveLength(WINDOW)
})

test('the call is graded by its weakest link', () => {
  expect(worst(['good', 'fair', 'good'])).toBe('fair')
  expect(worst(['good', null, 'poor'])).toBe('poor')
  expect(worst([null])).toBe(null)
})

const offer = [
  'v=0',
  'm=audio 9 UDP/TLS/RTP/SAVPF 111 63',
  'a=rtpmap:111 opus/48000/2',
  'a=fmtp:111 minptime=10;useinbandfec=1',
  'a=rtpmap:63 red/48000/2',
  'a=fmtp:63 111/111',
  '',
].join('\r\n')

test('Opus asks for silence suppression and keeps error correction; other codecs are untouched', () => {
  const out = lightOpus(offer)
  expect(out).toContain('a=fmtp:111 minptime=10;useinbandfec=1;usedtx=1\r\n')
  expect(out).toContain('a=fmtp:63 111/111\r\n')
  expect(lightOpus(out)).toBe(out) // never added twice
  expect(lightOpus('v=0\r\n')).toBe('v=0\r\n')
})

test('a picture is cut from under the frame and can never leave an empty edge', () => {
  // 400x200 landscape in a 100 px frame: the short side fills the frame, centred.
  expect(cropRect(400, 200, 100, 1, { x: 0, y: 0 })).toEqual({ x: 100, y: 0, size: 200 })
  // Dragged as far right as it goes, the left edge of the picture is under the frame.
  const right = clampOffset(400, 200, 100, 1, { x: 999, y: 999 })
  expect(right).toEqual({ x: 50, y: 0 })
  expect(cropRect(400, 200, 100, 1, right).x).toBe(0)
  // Zoomed in twice: a quarter of the area, still inside the picture.
  const r = cropRect(400, 200, 100, 2, clampOffset(400, 200, 100, 2, { x: -999, y: -999 }))
  expect(r.size).toBe(100)
  expect(r.x + r.size).toBe(400)
  expect(r.y + r.size).toBe(200)
})
