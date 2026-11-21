// The deployed server forwarder, end to end over the public DHT and the internet: a streamer and a viewer on this
// computer, each its own key, link to it like the app, and synthetic VP8 L1T3 frames must come back through it.
// Opt-in: ELEUSINIA_LIVE_FORWARDER=1 npx vitest run test/liveforwarder.test.ts (the first key in HOSTED_FORWARDERS),
// or ELEUSINIA_LIVE_FORWARDER=<key>. Checks the server after a deploy (docs/oracle-setup.md, part F).
import DHT from 'hyperdht'
import { MediaStreamTrack, RTCPeerConnection, RTCRtpCodecParameters, RtpHeader, RtpPacket, useOPUS, useVP8 } from 'werift'
import { expect, test } from 'vitest'
import { createNet } from '../src/main/network'
import { type Fwd, cleanFwd } from '../src/shared/fwdproto'
import { HOSTED_FORWARDERS } from '../src/shared/relays'
import { parseVp8 } from '../src/shared/vp8layers'
import { l1t3 } from './vp8packets'

const live = process.env.ELEUSINIA_LIVE_FORWARDER
const server = live?.length === 64 ? live : HOSTED_FORWARDERS[0]
const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }]
const codecs = () => ({ video: [useVP8(), new RTCRtpCodecParameters({ mimeType: 'video/rtx', clockRate: 90000 })], audio: [useOPUS()] })
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const until = async (ok: () => boolean, ms: number, what: string) => {
  for (const end = Date.now() + ms; !ok(); await wait(50)) if (Date.now() > end) throw new Error(`timed out: ${what}`)
}

// A key of our own linked to the server, handing its fwd messages to `on`
function client(on: (m: Fwd) => void) {
  const keyPair = DHT.keyPair()
  const net = createNet(keyPair, { open: () => {}, close: () => {}, msg: (_k, w: any) => { const m = w.t === 'fwd' && cleanFwd(w); if (m) on(m) } })
  return { key: keyPair.publicKey.toString('hex'), net, send: (m: Fwd) => net.send(server, { t: 'fwd', ...m } as any) }
}

test.skipIf(!live || !server)('the deployed server forwarder carries a stream to a listed viewer', { timeout: 120000 }, async () => {
  const spc = new RTCPeerConnection({ iceServers, codecs: codecs() })
  const vpc = new RTCPeerConnection({ iceServers, codecs: codecs() })
  const s = client(async (m) => {
    if (m.k === 'answer') await spc.setRemoteDescription({ type: 'answer', sdp: m.sdp })
    else if (m.k === 'ice' && m.to === 'src') await spc.addIceCandidate(m.c)
  })
  const v = client(async (m) => {
    if (m.k === 'offer' && m.s === s.key) {
      await vpc.setRemoteDescription({ type: 'offer', sdp: m.sdp })
      await vpc.setLocalDescription(await vpc.createAnswer())
      v.send({ k: 'accept', s: s.key, sdp: vpc.localDescription!.sdp })
    } else if (m.k === 'ice' && m.to === 'view') await vpc.addIceCandidate(m.c)
  })
  try {
    s.net.dial(server)
    v.net.dial(server)
    await until(() => s.net.linked(server) && v.net.linked(server), 40000, 'linking to the server')

    // the viewer counts the frames that reach it
    let frames = 0
    vpc.onTrack.subscribe((t) => t.onReceiveRtp.subscribe((rtp) => t.kind === 'video' && parseVp8(rtp.payload)?.start && frames++))
    vpc.onIceCandidate.subscribe((c) => c?.candidate && v.send({ k: 'ice', to: 'fwd', s: s.key, c: c.toJSON() as any }))

    // the streamer opens with an offer naming the viewer
    const video = new MediaStreamTrack({ kind: 'video' })
    spc.addTransceiver(video, { direction: 'sendonly' })
    spc.addTransceiver(new MediaStreamTrack({ kind: 'audio' }), { direction: 'sendonly' })
    spc.onIceCandidate.subscribe((c) => c?.candidate && s.send({ k: 'ice', to: 'fwd', c: c.toJSON() as any }))
    await spc.setLocalDescription(await spc.createOffer())
    s.send({ k: 'open', sdp: spc.localDescription!.sdp, viewers: { [v.key]: 'full' } })

    await until(() => spc.connectionState === 'connected', 30000, 'the streamer connecting to the server')
    await until(() => vpc.connectionState === 'connected', 30000, 'the viewer connecting to the server')
    // 3 s at 60 fps, a key frame every second
    const pkts = l1t3(180, { keyEvery: 60 })
    for (let f = 0; f < 180; f++) {
      for (const p of pkts.slice(f * 2, f * 2 + 2)) video.writeRtp(new RtpPacket(new RtpHeader({ payloadType: 96, sequenceNumber: p.seq, timestamp: f * 1500, ssrc: 4321, marker: !p.start }), Buffer.from(p.payload)))
      await wait(1000 / 60)
    }
    await wait(1500)
    console.log(`frames through the server: ${frames} of 180`)
    expect(frames).toBeGreaterThan(150)
    s.send({ k: 'close' })
    await wait(300)
  } finally {
    await Promise.all([spc.close(), vpc.close()])
    await Promise.all([s.net.destroy(), v.net.destroy()])
  }
})
