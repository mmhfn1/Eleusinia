# Roadmap: screen sharing and cameras

Goals: peer-to-peer (no server), lightweight, secure, calls of up to 15 to 20 people, and **no fixed limit** on how many people share a screen or camera.

**Status:** phases 1 to 3 (screen sharing, cameras and shared screen sound, in the mesh) are built. Phases 4 and 5 are planned.

## Rules

- **The streamer has the final say on quality.** Streams default to 720p at 30 fps. The streaming menu offers every resolution and frame rate the streamer's system can deliver (for example 1080p at 60 fps, or 4K at 120 fps), and whatever they choose is applied as chosen, including mid-stream.
- **Soft cap, worked out on the fly.** When someone starts a stream, the app checks two things:
  - **Their upload:** it must carry their chosen quality to everyone in the call. The upload is measured live by sending about 1 MB to the best-connected person in the call and timing its arrival.
  - **Nobody already streaming may be short of bandwidth.** This is read from WebRTC's own report of what limits each stream.

  If either fails, the stream does not start, and a notification explains why: the numbers for their upload, or that another stream would lower the quality of the call for others. They can pick a lower quality or try again later.
- **Viewers only receive what they show.** A stream shown large gets exactly the streamer's chosen quality. A thumbnail gets a small copy, and a hidden, minimised or fully covered window gets nothing. This never changes what the streamer picked; it only avoids sending video nobody is looking at.

## The core problem

Calls are a full mesh: everyone sends their audio straight to everyone else (`src/renderer/call.ts`). Video in a mesh means each sender uploads one copy per viewer, and also encodes one copy per viewer, since each connection has its own encoder.

| Stream | Typical bitrate | 1 sender to 19 viewers |
|---|---|---|
| Camera thumbnail (180p) | ~150 kbps | ~2.9 Mbps upload |
| Camera (360p) | ~400 kbps | ~7.6 Mbps |
| Camera (720p) | ~1.2 Mbps | ~23 Mbps |
| Screen, sharp text (720p, 30 fps) | ~1.4 Mbps | ~26 Mbps |

A pure mesh therefore holds up to about 6 to 8 full-quality streams on ordinary home connections. Beyond that, the soft cap stops new streams unless peers forward (phase 5).

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
4. **Forwarder spike (go/no-go, 2 to 3 days):** forwarding needs a WebRTC stack in the main process. The candidate is `werift`, a pure-TypeScript library with no native module and the one new dependency. It must forward Chromium VP8/VP9 simulcast between 3 machines before anything is built on it.
5. **Peer forwarding with end-to-end frame encryption:**
   - **Who forwards and how:** when the soft cap would block a stream, the best-connected participants (ranked by `src/shared/quality.ts`) forward it. The sender uploads one copy as three quality layers (simulcast), and the forwarder picks a layer per viewer without decoding.
   - **Hand-over:** if a forwarder's connection stays poor for about 90 s, or it leaves, a replacement is chosen by the same rule on every member.
   - **Encryption:** every video frame is encrypted end to end (WebRTC encoded transforms, AES-GCM). Keys are sent over the encrypted chat link and rotated on join and leave, so a forwarder only handles ciphertext.
   - **Audio:** stays in the mesh.

## Security

- **Encryption:** the chat link is encrypted (the DHT's Noise streams) and media is encrypted (WebRTC DTLS-SRTP). Phase 5 adds frame encryption before any forwarding exists.
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
