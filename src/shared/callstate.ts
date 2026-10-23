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
// The blip that breaks a call usually drops the chat link too, so a caller who goes offline keeps their place
// this long before being dropped, giving the link time to come back.
export const OFFLINE_GRACE = 15000
const BACKOFF = [2000, 5000, 10000, 15000]
export const backoff = (attempt: number) => BACKOFF[Math.min(attempt, BACKOFF.length - 1)]
// A long route (another continent) loses consent checks in bursts while audio still gets through, so it is given
// longer before a restart: 3 s up to a 100 ms ping, rising to 8 s from 350 ms.
export const restartAfterFor = (pingMs?: number) =>
  pingMs !== undefined && Number.isFinite(pingMs) ? Math.round(Math.min(8000, Math.max(RESTART_AFTER, RESTART_AFTER + (pingMs - 100) * 20))) : RESTART_AFTER

// What the watchdog may ask about the link. flowing: their audio is still arriving, so the route still works and a
// restart or rebuild would only cut it. restartAfter: how long to wait before restarting, in ms.
export type LinkHealth = { flowing?: () => boolean; restartAfter?: () => number }

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
export function createWatchdog(me: string, them: string, act: Recovery, timers: Timers = realTimers, health: LinkHealth = {}) {
  const flowing = health.flowing ?? (() => false)
  const restartAfter = health.restartAfter ?? (() => RESTART_AFTER)
  let state = 'new'
  let attempt = 0
  let timer: unknown = null
  let pending: 'restart' | 'rebuild' | null = null
  let stopped = false
  let away: unknown = null
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
  const back = () => {
    if (away !== null) timers.clear(away)
    away = null
  }
  // While audio still arrives, nothing is torn down: the same step is checked again later.
  const rebuild = () => (flowing() ? arm('rebuild', backoff(attempt), rebuild) : (act.rebuild(), rebuildLater()))
  const rebuildLater = () => arm('rebuild', backoff(attempt++), rebuild)
  const restartSoon = () => arm('restart', restartAfter(), () => (flowing() ? restartSoon() : (act.restart(), arm('rebuild', RESTART_GRACE, rebuild))))

  return {
    update(next: string) {
      if (stopped) return
      state = next
      if (next === 'connected') {
        clear()
        attempt = 0
      } else if (!leader) return
      else if (next === 'disconnected' && !pending) restartSoon()
      else if (next === 'failed' && pending !== 'rebuild') rebuildLater()
    },
    // The peer went offline: drop them unless they are back within the grace period. A call that is still
    // connected directly does not need the chat link, so it is checked again later instead.
    away(drop: () => void) {
      if (stopped || away !== null) return
      const check = () => {
        away = null
        if (stopped) return
        if (state === 'connected') away = timers.set(check, OFFLINE_GRACE)
        else drop()
      }
      away = timers.set(check, OFFLINE_GRACE)
    },
    back,
    stop() {
      stopped = true
      clear()
      back()
    },
    get attempt() {
      return attempt
    },
  }
}

// Asks the other side to send almost nothing while we are silent (Opus DTX), which cuts most of a mesh call's
// traffic; in-band error correction stays on, so speech quality is unchanged. Applied to our own description,
// since each side reads the other's preference from it.
export function lightOpus(sdp: string) {
  const pt = /a=rtpmap:(\d+) opus\/48000/i.exec(sdp)?.[1]
  if (!pt) return sdp
  return sdp.replace(new RegExp(`a=fmtp:${pt} [^\\r\\n]*`), (line) => (/usedtx=/.test(line) ? line : line + ';usedtx=1'))
}

// Video starts at 1 Mbps instead of WebRTC's 300 kbps guess, which began a camera or screen at 180p and took about
// 25 s to climb to 720p even on a fast link. A link that cannot carry it is found out within a second or two.
export const VIDEO_START_KBPS = 1000
export function quickVideo(sdp: string, kbps = VIDEO_START_KBPS) {
  const param = `x-google-start-bitrate=${kbps}`
  const video = new Set([...sdp.matchAll(/a=rtpmap:(\d+) (?:VP8|VP9|H264|AV1)\//gi)].map((m) => m[1]))
  const withParams = new Set([...sdp.matchAll(/a=fmtp:(\d+) /g)].map((m) => m[1]))
  return sdp
    .replace(/a=fmtp:(\d+) ([^\r\n]*)/g, (line, pt, params) => (video.has(pt) && !params.includes('x-google-start-bitrate') ? `${line};${param}` : line))
    .replace(/(a=rtpmap:(\d+) [^\r\n]*)(\r?\n)/g, (all, line, pt, nl) => (video.has(pt) && !withParams.has(pt) ? `${line}${nl}a=fmtp:${pt} ${param}${nl}` : all))
}

// The relay port as an ICE candidate for our own connection. Low priority, so any direct route wins.
// raddr is the unspecified address of the same family, as the candidate grammar expects.
export const relayCandidate = (ip: string, port: number) =>
  `candidate:9 1 udp 16777215 ${ip} ${port} typ relay raddr ${ip.includes(':') ? '::' : '0.0.0.0'} rport 0`
