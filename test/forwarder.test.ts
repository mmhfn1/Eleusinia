// The forwarder end to end in plain Node, werift on every side: a synthetic VP8 L1T3 sender at 60 fps, the forwarder,
// and two receiving viewers at different layers. Local host candidates only (no STUN).
import { MediaStreamTrack, RTCPeerConnection, RTCRtpCodecParameters, RtpHeader, RtpPacket, useOPUS, useVP8 } from 'werift'
import { afterAll, expect, test } from 'vitest'
import { createForwarder } from '../src/main/forwarder'
import { parseVp8 } from '../src/shared/vp8layers'
import { l1t3 } from './vp8packets'

const A = 'a'.repeat(64)
const B = 'b'.repeat(64)
const C = 'c'.repeat(64)
// RTX as Chromium negotiates it, so retransmissions show as such
const codecs = () => ({ video: [useVP8(), new RTCRtpCodecParameters({ mimeType: 'video/rtx', clockRate: 90000 })], audio: [useOPUS()] })
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const until = async (ok: () => boolean, ms = 5000) => {
  for (const end = Date.now() + ms; !ok(); await wait(20)) if (Date.now() > end) throw new Error('timed out')
}
const pcs: RTCPeerConnection[] = []
const fwd = createForwarder({ iceServers: [], maxViewers: 2 })
afterAll(async () => {
  fwd.close()
  await Promise.all(pcs.map((pc) => pc.close()))
})

type Got = { seqs: Set<number>; tids: number[]; retransmitted: number; audio: number; ssrc?: number; pc: RTCPeerConnection; connected: boolean }

async function viewer(key: string, loss = 0): Promise<Got> {
  // werift's debug loss is inverted in 0.27.0: it passes p % of packets
  const pc = new RTCPeerConnection({ iceServers: [], iceUseDefaultStunServer: false, iceUseIpv6: false, codecs: codecs(), debug: loss ? { inboundPacketLoss: 100 - loss } : {} })
  pcs.push(pc)
  const got: Got = { seqs: new Set(), tids: [], retransmitted: 0, audio: 0, pc, connected: false }
  pc.onTrack.subscribe((t) =>
    t.onReceiveRtp.subscribe((rtp, _e, info) => {
      if (t.kind === 'audio') return void got.audio++
      if (info?.type === 'padding') return
      got.ssrc = rtp.header.ssrc
      if (info?.type === 'retransmission') got.retransmitted++
      got.seqs.add(rtp.header.sequenceNumber)
      const d = parseVp8(rtp.payload)
      if (d?.start) got.tids.push(d.tid)
    }),
  )
  pc.connectionStateChange.subscribe((s) => (got.connected ||= s === 'connected'))
  const v = await fwd.addViewer('s1', key, { onIce: (c) => pc.addIceCandidate(c) })
  pc.onIceCandidate.subscribe((c) => c?.candidate && v.addIce(c.toJSON()))
  await pc.setRemoteDescription({ type: 'offer', sdp: v.offer })
  await pc.setLocalDescription(await pc.createAnswer())
  await v.accept(pc.localDescription!.sdp)
  return got
}

// Sorted sequence numbers with no gaps (they start near 0 or wrap once at most in a few seconds)
const gaps = (s: Set<number>) => {
  const xs = [...s].sort((a, b) => a - b)
  return xs.slice(1).filter((x, i) => x - xs[i] !== 1 && x - xs[i] !== 1 - 65536).length
}

test('forwards VP8 L1T3 per layer, answers NACKs, rate-limits PLI, caps viewers', { timeout: 15000 }, async () => {
  // the streamer
  const sender = new RTCPeerConnection({ iceServers: [], iceUseDefaultStunServer: false, iceUseIpv6: false, codecs: codecs() })
  pcs.push(sender)
  const video = new MediaStreamTrack({ kind: 'video' })
  const audio = new MediaStreamTrack({ kind: 'audio' })
  const vt = sender.addTransceiver(video, { direction: 'sendonly' })
  sender.addTransceiver(audio, { direction: 'sendonly' })
  let keyRequests = 0
  vt.sender.onKeyFrameRequest.subscribe(() => keyRequests++)
  const ingest = fwd.addStream('s1', { onIce: (c) => sender.addIceCandidate(c) })
  sender.onIceCandidate.subscribe((c) => c?.candidate && ingest.addIce(c.toJSON()))
  await sender.setLocalDescription(await sender.createOffer())
  await sender.setRemoteDescription({ type: 'answer', sdp: await ingest.answer(sender.localDescription!.sdp) })

  const a = await viewer(A, 5) // full, 5 % loss on its line
  const b = await viewer(B) // quarter
  fwd.setLayer('s1', B, 'quarter')
  await expect(fwd.addViewer('s1', C)).rejects.toThrow('viewer limit')
  expect(() => fwd.setLayer('s1', A, 'max' as never)).toThrow('bad layer')
  await expect(fwd.addViewer('s1', 'not a key')).rejects.toThrow('bad viewer key')
  await until(() => sender.connectionState === 'connected' && a.connected && b.connected && fwd.stats()[0].viewers.every((v) => v.connected))

  // 2 s at 60 fps, 2 packets a frame, a key frame every second; B asks for a key frame every 100 ms meanwhile
  const pkts = l1t3(120, { keyEvery: 60 })
  const ssrc = 1234
  const pli = setInterval(() => b.ssrc && b.pc.getTransceivers()[0].receiver.sendRtcpPLI(b.ssrc), 100)
  const t0 = Date.now()
  for (let f = 0; f < 120; f++) {
    for (const p of pkts.slice(f * 2, f * 2 + 2)) {
      const header = new RtpHeader({ payloadType: 96, sequenceNumber: p.seq, timestamp: f * 1500, ssrc, marker: !p.start })
      video.writeRtp(new RtpPacket(header, Buffer.from(p.payload)))
    }
    audio.writeRtp(new RtpPacket(new RtpHeader({ payloadType: 111, sequenceNumber: f, timestamp: f * 960, ssrc: 99 }), Buffer.alloc(40, 1)))
    await wait(Math.max(0, t0 + (f + 1) * (1000 / 60) - Date.now()))
  }
  clearInterval(pli)
  await wait(500) // let retransmissions land

  // A gets every frame, B every fourth (TID 0 only)
  expect(a.tids.length).toBeGreaterThanOrEqual(110)
  expect(b.tids.length).toBe(30)
  expect(b.tids.every((t) => t === 0)).toBe(true)
  expect(b.seqs.size).toBe(60)
  expect(gaps(b.seqs)).toBe(0)
  // A lost about 5 % on its line and got them back from the forwarder's history
  expect(a.retransmitted).toBeGreaterThan(0)
  expect(a.seqs.size).toBeGreaterThanOrEqual(236)
  expect(a.audio).toBeGreaterThan(100) // screen sound passes too
  expect(b.audio).toBeGreaterThan(100)
  // ~20 PLIs from B in 2 s reach the streamer as at most one a second
  expect(keyRequests).toBeGreaterThanOrEqual(1)
  expect(keyRequests).toBeLessThanOrEqual(4)

  // a removed viewer gets nothing more; its seat is free again
  fwd.removeViewer('s1', B)
  const before = b.seqs.size
  const more = l1t3(30, { from: 120, seq0: 240, keyEvery: 120 })
  for (const p of more) video.writeRtp(new RtpPacket(new RtpHeader({ payloadType: 96, sequenceNumber: p.seq, timestamp: p.frame * 1500, ssrc }), Buffer.from(p.payload)))
  await wait(300)
  expect(b.seqs.size).toBe(before)
  expect(a.seqs.size).toBeGreaterThan(236 + 40)
  expect(fwd.stats()[0].viewers.map((v) => v.key)).toEqual([A])
})
