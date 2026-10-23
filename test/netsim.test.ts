import { expect, test } from 'vitest'
import { createImpairment, parseNetSim } from '../src/shared/netsim'

test('the spec reads as written, with safe defaults', () => {
  expect(parseNetSim(undefined)).toBe(null)
  expect(parseNetSim('delay=150,jitter=30,loss=0.03,burst=4,outage=30:8')).toEqual({ delay: 150, jitter: 30, loss: 0.03, burst: 4, outage: [30000, 8000] })
  expect(parseNetSim('loss=5,burst=0')).toMatchObject({ loss: 0.9, burst: 1, delay: 0 })
})

test('average loss and burst length come out as asked, and an outage drops everything', () => {
  let seed = 7
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const sent: number[] = []
  const go = createImpairment(parseNetSim('loss=0.05,burst=4')!, rand)
  let lost = 0, runs = 0, run = 0
  for (let i = 0; i < 200000; i++) {
    let got = false
    go(() => (got = true))
    if (got) sent.push(i), run && runs++, (run = 0)
    else lost++, run++
  }
  expect(lost / 200000).toBeGreaterThan(0.04)
  expect(lost / 200000).toBeLessThan(0.06)
  expect(lost / runs).toBeGreaterThan(3)
  expect(lost / runs).toBeLessThan(5)
  let t = 0
  const down = createImpairment(parseNetSim('outage=1:2')!, () => 0.5, () => t)
  const at = (ms: number) => ((t = ms), new Promise<boolean>((r) => { let ok = false; down(() => (ok = true)); r(ok) }))
  return Promise.all([at(0), at(1500), at(3500)]).then((r) => expect(r).toEqual([true, false, true]))
})
