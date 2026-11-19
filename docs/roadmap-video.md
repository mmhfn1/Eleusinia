# Roadmap: screen sharing and cameras

Goals: peer-to-peer (no server), lightweight, secure, calls of up to 15 to 20 people, and **no fixed limit** on how many people share a screen or camera.

**Status:** phases 1 to 3 (screen sharing, cameras and shared screen sound, in the mesh) are built. Phases 4 and 5 (peer forwarders with werift, frame encryption, the server forwarder) are built for screens, in testing; the details are in `design/plan-stream-forwarding.md`.

## Rules

- **The streamer has the final say on quality.** Streams default to 720p at 30 fps. The streaming menu offers every resolution and frame rate the streamer's system can deliver (for example 1080p at 60 fps, or 4K at 120 fps), and whatever they choose is applied as chosen, including mid-stream.
- **Soft cap, worked out on the fly.** When someone starts a stream, the app checks two things:
  - **Their upload:** it must carry their chosen quality to everyone in the call. The upload is measured live by sending about 1 MB to the best-connected person in the call and timing its arrival.
  - **Nobody already streaming may be short of bandwidth.** This is read from WebRTC's own report of what limits each stream.

  If either fails, a warning explains why before the stream starts: the numbers for their upload, or that another stream would lower the quality of the call for others. They can pick a lower quality or start anyway; the soft cap never blocks.
- **Viewers only receive what they show.** A stream shown large gets exactly the streamer's chosen quality. A thumbnail gets a small copy, and a hidden, minimised or fully covered window gets nothing. This never changes what the streamer picked; it only avoids sending video nobody is looking at.

## The core problem

Calls are a full mesh: everyone sends their audio straight to everyone else (`src/renderer/call.ts`). Video in a mesh means each sender uploads one copy per viewer, and also encodes one copy per viewer, since each connection has its own encoder.

| Stream | Typical bitrate | 1 sender to 19 viewers |
|---|---|---|
| Camera thumbnail (180p) | ~150 kbps | ~2.9 Mbps upload |
| Camera (360p) | ~400 kbps | ~7.6 Mbps |
| Camera (720p) | ~1.2 Mbps | ~23 Mbps |
| Screen, sharp text (720p, 30 fps) | ~1.4 Mbps | ~26 Mbps |

A pure mesh therefore holds up to about 6 to 8 full-quality streams on ordinary home connections. Beyond that, the soft cap warns before each new stream, and call mates forward screens (phase 5).

## Phases

1. **Screen sharing in the mesh. Built.**
   - **Picker:** screens and windows, never Eleusinia's own window.
   - **Streaming menu:** resolution, frame rate, and "optimise for text or motion", up to the system's limits, with the upload estimate shown.
   - **While sharing:** switch to another screen or window without stopping (the quality carries over as far as the new source allows), a "You are sharing" bar with switch and stop buttons, and a stage above the chat (one share large, others as thumbnails).
   - **Saving bandwidth:** per-viewer levels, as in Rules.
   - **Soft-cap check** on start, as in Rules.
   - **Streamer notices:** a note when their computer or connection cannot keep up with the quality they chose. The choice is never changed for them.
   - **How it fits the call:** every call connection carries a video slot from the start, so starting or stopping a share needs no new offer. VP9 is preferred, then H.264, then VP8.
2. **Cameras in the mesh. Built.** Camera settings with a live preview: camera, resolution and frame rate up to what the camera offers (default 720p at 30 fps, or the closest it offers). Cameras join the stage: a grid when no screen is shared (each tile at full quality up to 4 cameras, thumbnails beyond), or the strip beside a shared screen; your own picture is mirrored. They count towards the same soft cap, on top of anything you already send. A camera that is unplugged turns off; it does not yet switch to another one.
3. **Shared screen sound. Built (Windows).** "Share computer sound" in the share dialog sends every app's sound except Eleusinia's own (Chromium's `restrictOwnAudio`, which Windows supports), so nobody hears themselves back; if the system cannot leave our own audio out, no sound is shared and the call panel says why. It travels on its own slot at 128 kbps Opus, plays at the sharer's volume, and is not sent to anyone who has hidden the screens. Mono for now; on macOS and Linux the option is not offered.
4. **Peer forwarders with werift. Built (screens).** A call mate with spare upload passes a screen on without decoding it: `werift` (pure TypeScript, no native module, the one new dependency) in the main process (`src/main/forwarder.ts`). The streamer sends each forwarder one VP8 copy with three temporal layers (`L1T3`), and the forwarder gives each viewer a frame rate by dropping layers (`src/shared/vp8layers.ts`); retransmissions come from its own send history, key-frame requests go upstream at most once a second.
   - **Who carries whom** is one pure rule (`src/shared/forward.ts`) run by the streamer: direct copies while its upload covers them with 30 % headroom, then call mates by spare upload (never strict ones for strict viewers, never while they stream or play), then the server, at most two levels below the streamer. A second-level forwarder is fed by a first-level one, main process to main process, over the same `fwd` signalling (`feed`). Stable: a carrier is replaced only when it leaves, its link stays poor, or it is starved.
   - **Hand-over:** a forwarder that leaves, fails or goes silent gives way to the direct copy at once while the streamer reassigns its viewers. A forwarder whose machine struggles drops out by itself: its own encoders CPU-bound, or its main process's event loop lag above 50 ms (p95) for 10 s; it reports no spare upload and the streamer reforwards it as starved.
   - **Encryption (phase 3 of the plan):** every frame of a forwarded stream is encrypted end to end (WebRTC encoded transforms, AES-GCM, `src/renderer/e2ee.ts`), with keys from the streamer over the encrypted chat link, rotated when a viewer leaves. Forwarders, call mates and the server alike, never decrypt: the VP8 header bytes they read stay in the clear. Direct copies stay DTLS-SRTP between the two people.
   - **Audio:** the screen's sound rides with the forwarded copy; voice stays in the mesh.
   - **Spike results (phase 0, one machine):** through one encoder, `L1T3` gave 59.5, 29.7 and 14.9 fps per layer; forwarding added about 1 ms of delay and cost about 2.6 % of one core per viewer at 8 Mbit/s. A call mate's forwarder serves at most 3 viewers (`maxViewers`), since a home line's spare upload carries about 3 copies at 1080p60.
5. **The server as a forwarder. Built, not yet deployed.** The same forwarder runs headless beside the relay (`src/forwarder/main.ts`, `deploy/forwarder.service`), used last, only for viewers no call mate can carry. It serves only the viewers a streamer lists, handles only ciphertext, and has its limits (40 viewers a stream, 12 Mbit/s in, a monthly budget shared with the relay). `HOSTED_FORWARDERS` stays empty until one runs.
   - **Not yet:** cameras through forwarders (same machinery, after screens), voice through forwarders, a server fed by a call mate (a second level on the server), recording, several server regions.

## Security

- **Encryption:** the chat link is encrypted (the DHT's Noise streams) and media is encrypted (WebRTC DTLS-SRTP). Forwarded streams add frame encryption, so a forwarder only handles ciphertext.
- **Sharing:**
  - always goes through an explicit picker; the main process only grants capture of the source the user picked, and refuses any other request;
  - shows a persistent sharing bar;
  - excludes the app's own window;
  - is never recorded.
- **Messages from other people are untrusted:** share announcements are capped, and an upload measurement is answered for at most 4 MB per peer per minute.

## Lightweight

- **Codecs:** hardware encoding and decoding where Chromium has it.
- **Nothing is sent to hidden views:** off-screen thumbnails, minimised and fully covered windows, and a stage hidden with "Hide screens" receive nothing.
- **Upload measurement:** happens only when someone starts a stream, at most once a minute.

## Open questions

- Recording is out of scope unless asked for.
- A music bot (YouTube listen-along) is planned separately and waits until video is settled.
