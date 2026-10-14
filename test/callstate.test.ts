import { expect, test } from 'vitest'
import { type IceCandidate, OFFLINE_GRACE, RESTART_AFTER, RESTART_GRACE, backoff, createCandidates, createWatchdog, offers } from '../src/shared/callstate'

// Stands in for RTCPeerConnection: rejects candidates until a remote description is set, as the real one does.
function fakePc() {
  const added: IceCandidate[] = []
  return {
    remoteDescription: null as unknown,
    added,
    async addIceCandidate(c: IceCandidate) {
      if (!this.remoteDescription) throw new Error('InvalidStateError: no remote description')
      if (c.candidate === 'bad') throw new Error('OperationError')
      added.push(c)
    },
  }
}

// A manual clock, so timing decisions are checked without waiting.
function fakeTimers() {
  let now = 0
  let id = 0
  const due = new Map<number, { at: number; fn: () => void }>()
  return {
    set: (fn: () => void, ms: number) => (due.set(++id, { at: now + ms, fn }), id),
    clear: (i: unknown) => void due.delete(i as number),
    advance(ms: number) {
      const end = now + ms
      for (;;) {
        const next = [...due].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
        if (!next) break
        due.delete(next[0])
        now = next[1].at
        next[1].fn()
      }
      now = end
    },
    get pending() {
      return due.size
    },
  }
}

function watch(me: string, them: string) {
  const timers = fakeTimers()
  const log: string[] = []
  const w = createWatchdog(me, them, { restart: () => log.push('restart'), rebuild: () => log.push('rebuild') }, timers)
  return { w, timers, log }
}

test('candidates that arrive before the remote description are held, then added in order', async () => {
  const pc = fakePc()
  const c = createCandidates(pc)
  await c.add({ candidate: 'one' })
  await c.add({ candidate: 'two' })
  expect(pc.added).toEqual([])
  expect(c.size).toBe(2)
  pc.remoteDescription = { type: 'offer' }
  await c.flush()
  expect(pc.added.map((x) => x.candidate)).toEqual(['one', 'two'])
  expect(c.size).toBe(0)
})

test('candidates after the remote description go straight through', async () => {
  const pc = fakePc()
  pc.remoteDescription = { type: 'answer' }
  const c = createCandidates(pc)
  await c.add({ candidate: 'now' })
  expect(pc.added.map((x) => x.candidate)).toEqual(['now'])
  expect(c.size).toBe(0)
})

test('one bad buffered candidate does not stop the rest', async () => {
  const pc = fakePc()
  const c = createCandidates(pc)
  for (const candidate of ['a', 'bad', 'b']) await c.add({ candidate })
  pc.remoteDescription = { type: 'offer' }
  await c.flush()
  expect(pc.added.map((x) => x.candidate)).toEqual(['a', 'b'])
  await c.flush() // nothing left to add twice
  expect(pc.added.length).toBe(2)
})

test('the smaller key offers', () => {
  expect(offers('aa', 'bb')).toBe(true)
  expect(offers('bb', 'aa')).toBe(false)
})

test('backoff steps up, then stays at 15 s', () => {
  expect([0, 1, 2, 3, 4, 10].map(backoff)).toEqual([2000, 5000, 10000, 15000, 15000, 15000])
})

test('a short disconnect that recovers by itself triggers nothing', () => {
  const { w, timers, log } = watch('aa', 'bb')
  w.update('connected')
  w.update('disconnected')
  timers.advance(RESTART_AFTER - 1)
  w.update('connected')
  timers.advance(60000)
  expect(log).toEqual([])
  expect(timers.pending).toBe(0)
})

test('a disconnect that lasts restarts ICE once after 3 s', () => {
  const { w, timers, log } = watch('aa', 'bb')
  w.update('connected')
  w.update('disconnected')
  w.update('disconnected') // repeated events do not push the restart back
  timers.advance(RESTART_AFTER - 1)
  expect(log).toEqual([])
  timers.advance(1)
  expect(log).toEqual(['restart'])
  w.update('connected')
  timers.advance(60000)
  expect(log).toEqual(['restart'])
})

test('a restart gets 8 s to finish before the first rebuild, then rebuilds back off 2, 5, 10, 15 s', () => {
  const { w, timers, log } = watch('aa', 'bb')
  w.update('connected')
  w.update('disconnected')
  timers.advance(RESTART_AFTER)
  expect(log).toEqual(['restart'])
  timers.advance(RESTART_GRACE - 1)
  expect(log).toEqual(['restart'])
  timers.advance(1)
  expect(log).toEqual(['restart', 'rebuild'])
  for (const wait of [2000, 5000, 10000, 15000, 15000]) {
    const before = log.length
    timers.advance(wait - 1)
    expect(log.length).toBe(before)
    timers.advance(1)
    expect(log.length).toBe(before + 1)
  }
})

test('a restart that works within its grace period triggers no rebuild', () => {
  const { w, timers, log } = watch('aa', 'bb')
  w.update('connected')
  w.update('disconnected')
  timers.advance(RESTART_AFTER + RESTART_GRACE - 1)
  w.update('connected')
  timers.advance(60000)
  expect(log).toEqual(['restart'])
  expect(w.attempt).toBe(0)
})

test('failed during the grace period still waits for the grace period to end', () => {
  const { w, timers, log } = watch('aa', 'bb')
  w.update('connected')
  w.update('disconnected')
  timers.advance(RESTART_AFTER)
  w.update('failed')
  timers.advance(RESTART_GRACE - 1)
  expect(log).toEqual(['restart'])
  timers.advance(1)
  expect(log).toEqual(['restart', 'rebuild'])
})

test('failed rebuilds with backoff 2, 5, 10, then every 15 s until connected', () => {
  const { w, timers, log } = watch('aa', 'bb')
  w.update('connected')
  w.update('failed')
  const at: number[] = []
  let t = 0
  for (let i = 0; i < 60000; i += 1000) {
    timers.advance(1000)
    t += 1000
    if (log.length > at.length) at.push(t)
  }
  expect(at).toEqual([2000, 7000, 17000, 32000, 47000])
  expect(log.every((x) => x === 'rebuild')).toBe(true)
  w.update('connected')
  expect(w.attempt).toBe(0)
  timers.advance(60000)
  expect(log.length).toBe(5)
})

test('failed while a restart is waiting rebuilds instead, and repeated failed events do not delay it', () => {
  const { w, timers, log } = watch('aa', 'bb')
  w.update('connected')
  w.update('disconnected')
  w.update('failed')
  w.update('failed')
  timers.advance(backoff(0))
  expect(log).toEqual(['rebuild'])
})

test('a rebuilt connection that fails again waits longer', () => {
  const { w, timers, log } = watch('aa', 'bb')
  w.update('failed')
  timers.advance(backoff(0))
  expect(log).toEqual(['rebuild'])
  w.update('new')
  w.update('connecting')
  w.update('failed')
  timers.advance(backoff(1) - 1)
  expect(log).toEqual(['rebuild'])
  timers.advance(1)
  expect(log).toEqual(['rebuild', 'rebuild'])
})

test('a connection that holds resets the backoff', () => {
  const { w, timers, log } = watch('aa', 'bb')
  w.update('failed')
  timers.advance(backoff(0))
  w.update('failed')
  timers.advance(backoff(1))
  w.update('connected')
  w.update('failed')
  timers.advance(backoff(0))
  expect(log).toEqual(['rebuild', 'rebuild', 'rebuild'])
})

test('the larger key never restarts or rebuilds; it answers the other side', () => {
  const { w, timers, log } = watch('bb', 'aa')
  w.update('connected')
  w.update('disconnected')
  w.update('failed')
  timers.advance(120000)
  expect(log).toEqual([])
})

test('stopping (peer offline or call ended) cancels pending recovery', () => {
  const { w, timers, log } = watch('aa', 'bb')
  w.update('connected')
  w.update('disconnected')
  w.stop()
  timers.advance(120000)
  w.update('failed')
  timers.advance(120000)
  expect(log).toEqual([])
  expect(timers.pending).toBe(0)
})

test('a caller who goes offline keeps their place for 15 s, then is dropped', () => {
  for (const [me, them] of [['aa', 'bb'], ['bb', 'aa']]) {
    const { w, timers } = watch(me, them)
    let dropped = 0
    w.update('connected')
    w.update('disconnected')
    w.away(() => dropped++)
    w.away(() => dropped++) // repeated offline events do not push the drop back or drop twice
    timers.advance(OFFLINE_GRACE - 1)
    expect(dropped).toBe(0)
    timers.advance(1)
    expect(dropped).toBe(1)
    timers.advance(60000)
    expect(dropped).toBe(1)
  }
})

test('a caller back online within the grace period is not dropped', () => {
  const { w, timers } = watch('aa', 'bb')
  let dropped = 0
  w.update('connected')
  w.update('disconnected')
  w.away(() => dropped++)
  timers.advance(OFFLINE_GRACE - 1)
  w.back()
  timers.advance(60000)
  expect(dropped).toBe(0)
})

test('a call still connected directly survives the chat link going away, until it breaks too', () => {
  const { w, timers } = watch('bb', 'aa')
  let dropped = 0
  w.update('connected')
  w.away(() => dropped++)
  timers.advance(OFFLINE_GRACE * 4)
  expect(dropped).toBe(0)
  w.update('failed')
  timers.advance(OFFLINE_GRACE)
  expect(dropped).toBe(1)
})

test('stopping cancels a pending offline drop', () => {
  const { w, timers } = watch('aa', 'bb')
  let dropped = 0
  w.update('disconnected')
  w.away(() => dropped++)
  w.stop()
  timers.advance(60000)
  expect(dropped).toBe(0)
  expect(timers.pending).toBe(0)
})
