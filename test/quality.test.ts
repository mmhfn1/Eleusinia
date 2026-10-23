import { expect, test } from 'vitest'
import { lightOpus } from '../src/shared/callstate'
import { clampOffset, cropRect } from '../src/shared/crop'
import { WINDOW, grade, jitterTarget, pingSummary, remember, rememberPing, videoHold, worst } from '../src/shared/quality'

const many = (n: number, s: object) => Array.from({ length: n }, () => ({ rtt: 40, ...s }))

test('grades follow round trip, loss and jitter', () => {
  expect(grade([])).toBe(null)
  expect(grade(many(5, { rtt: 40 }))).toBe('good')
  expect(grade(many(5, { rtt: 250 }))).toBe('good') // another continent, but even
  expect(grade(many(5, { rtt: 320 }))).toBe('fair')
  expect(grade(many(5, { rtt: 500 }))).toBe('poor')
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

test('an even link keeps the player as it is; an uneven one holds twice its jitter, within limits', () => {
  expect(jitterTarget(5)).toBe(null)
  expect(jitterTarget(15)).toBe(40)
  expect(jitterTarget(30)).toBe(60)
  expect(jitterTarget(21)).toBe(50) // 10 ms steps
  expect(jitterTarget(120)).toBe(150)
  expect(jitterTarget(12)).toBe(null)
  expect(jitterTarget(12, 40)).toBe(40) // holding: no flapping around 15 ms
  expect(jitterTarget(9, 40)).toBe(null)
  expect(jitterTarget(21, 60)).toBe(60) // 50 is not a clear step down from 60
  expect(jitterTarget(14, 60)).toBe(40)
  expect(jitterTarget(40, 60)).toBe(80) // up at once
})

const readings = (ms: number[]) => ms.map((m, i) => ({ ms: m, at: i * 2000 }))

test('the ping shown is the typical one, with how much it moves, judged against its size', () => {
  expect(pingSummary([])).toBe(null)
  expect(pingSummary(readings([20, 21, 19, 22, 20, 300]))).toEqual({ ms: 21, spread: 1, steadiness: 'steady' }) // one late reply
  expect(pingSummary(readings([240, 255, 250, 262, 245, 250]))?.steadiness).toBe('steady') // far but even
  expect(pingSummary(readings([20, 80, 30, 90, 25, 70, 35, 85]))?.steadiness).toBe('unstable')
  expect(pingSummary(readings([180, 230, 200, 250, 190, 240]))?.steadiness).toBe('varies')
  expect(pingSummary(readings([30, Infinity, 31, 30]))?.steadiness).not.toBe('steady') // a reply missing
  expect(pingSummary(readings([Infinity, Infinity, 30]))).toEqual({ ms: Infinity, spread: 0, steadiness: 'unstable' })
})

test('ping readings older than a minute are forgotten', () => {
  let l = rememberPing([], { ms: 10, at: 0 })
  l = rememberPing(l, { ms: 20, at: 30000 })
  l = rememberPing(l, { ms: 30, at: 61000 })
  expect(l.map((p) => p.ms)).toEqual([20, 30])
})

test('video waits for resent pieces only on long lossy links', () => {
  expect(videoHold([])).toBe(null)
  expect(videoHold(many(5, { rtt: 340 }))).toBe(null) // long but clean
  expect(videoHold(many(5, { rtt: 30, loss: 0.05 }))).toBe(null) // short: resends arrive in time anyway
  expect(videoHold([...many(4, { rtt: 340 }), { rtt: 340, loss: 0.03 }])).toBe(450)
  expect(videoHold(many(5, { rtt: 900, loss: 0.03 }))).toBe(500)
  expect(videoHold(many(5, { rtt: 320, loss: 0.03 }), 450)).toBe(450) // 400 is not a clear step down
  expect(videoHold(many(5, { rtt: 290 }), 450)).toBe(null) // clean again: let go
})
