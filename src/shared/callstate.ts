// Per-peer call decisions with no DOM or WebRTC imports, so they can be unit tested with a fake connection.
// renderer/call.ts is the thin adapter that wires these to a real RTCPeerConnection.

export type IceCandidate = { candidate?: string; sdpMid?: string | null; sdpMLineIndex?: number | null; usernameFragment?: string | null }

// The slice of RTCPeerConnection the candidate buffer needs.
export type CandidateTarget = {
  readonly remoteDescription: unknown
  addIceCandidate(c: IceCandidate): Promise<void>
}

export type Timers = {
  set(fn: () => void, ms: number): unknown
  clear(id: unknown): void
}

const realTimers: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id as any) }

// The smaller key always makes the offer, so two people joining or recovering at once cannot both offer.
export const offers = (me: string, them: string) => me < them

// A disconnected link often recovers by itself within a few seconds, so wait before restarting ICE.
export const RESTART_AFTER = 3000
// An ICE restart needs a round trip of signaling plus fresh connectivity checks, so give it time to finish.
export const RESTART_GRACE = 8000
const BACKOFF = [2000, 5000, 10000, 15000]
export const backoff = (attempt: number) => BACKOFF[Math.min(attempt, BACKOFF.length - 1)]

// addIceCandidate throws before the remote description is set, so early candidates wait here
// until flush() runs right after setRemoteDescription.
export function createCandidates(pc: CandidateTarget) {
  let pending: IceCandidate[] = []
  return {
    async add(c: IceCandidate) {
      if (pc.remoteDescription) await pc.addIceCandidate(c)
      else pending.push(c)
    },
    async flush() {
      const list = pending
      pending = []
      // One stale candidate should not stop the rest from being tried.
      for (const c of list) await pc.addIceCandidate(c).catch(() => {})
    },
    get size() {
      return pending.length
    },
  }
}

export type Recovery = {
  restart(): void // ICE restart on the existing connection, with a fresh offer
  rebuild(): void // drop the connection and offer a new one, as on join
}

// Watches one peer across rebuilt connections, so the backoff keeps counting until a connection holds.
// Only the offering side acts; the other side answers whatever offer arrives.
export function createWatchdog(me: string, them: string, act: Recovery, timers: Timers = realTimers) {
  let state = 'new'
  let attempt = 0
  let timer: unknown = null
  let pending: 'restart' | 'rebuild' | null = null
  let stopped = false
  const leader = offers(me, them)

  const clear = () => {
    if (timer !== null) timers.clear(timer)
    timer = pending = null
  }
  const arm = (kind: 'restart' | 'rebuild', ms: number, fn: () => void) => {
    clear()
    pending = kind
    timer = timers.set(() => {
      timer = pending = null
      if (!stopped && state !== 'connected') fn()
    }, ms)
  }
  // Rebuild unless a connection holds by the next backoff step; this also catches a rebuilt connection
  // stuck before `connected`. A restart that does not help within its grace period starts this too.
  const rebuild = () => (act.rebuild(), rebuildLater())
  const rebuildLater = () => arm('rebuild', backoff(attempt++), rebuild)

  return {
    update(next: string) {
      if (stopped) return
      state = next
      if (next === 'connected') {
        clear()
        attempt = 0
      } else if (!leader) return
      else if (next === 'disconnected' && !pending) arm('restart', RESTART_AFTER, () => (act.restart(), arm('rebuild', RESTART_GRACE, rebuild)))
      else if (next === 'failed' && pending !== 'rebuild') rebuildLater()
    },
    stop() {
      stopped = true
      clear()
    },
    get attempt() {
      return attempt
    },
  }
}
