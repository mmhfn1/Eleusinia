# Roadmap: screen sharing and camera

Status: plan only, nothing built yet. Quality controls are open to everyone: no tiers or locked settings. The only limits shown are the honest physical ones (your upload speed, the other person's download).

## Where we start

- Calls are a full mesh: everyone sends their audio straight to everyone else (`src/renderer/call.ts`), with no host.
- Each call has offer/answer/ICE signaling, reconnect logic (`src/shared/callstate.ts`), a relay fallback over the chat link (`src/main/relay.ts`) and an in-memory quality sampler (`src/shared/quality.ts`).
- Video changes the maths. In a mesh each sender uploads one copy per viewer: a 2.5 Mbps screen share to 4 people is 10 Mbps of upload. That is fine for small calls and is the reason a host appears in phase 5.

## Phase 1: screen share in the mesh

- **Picking what to share:** a picker for whole screens or single windows, using Electron's `desktopCapturer` with `session.setDisplayMediaRequestHandler`. System audio is shared on Windows when chosen.
- **Sending:** the shared screen is a video track added to each existing connection. Adding a track means renegotiating; keep the current rule that the smaller key makes offers, so two people starting a share at once cannot collide.
- **Watching:** a stage area that takes over the middle of the conversation while someone shares, with chat collapsible beside it, plus full screen and pop-out window.
- **Controls:** a Share screen button in the voice panel, a Stop sharing button, and a visible "You are sharing" marker.
- **Quality controls (sender side, changed live without restarting the share):**
  - Presets: Text and detail (high resolution, 5 to 15 fps), Balanced, Smooth motion (lower resolution, 30 to 60 fps).
  - Custom: resolution cap (720p, 1080p, 1440p, source), frame rate (5, 15, 30, 60) and max bitrate slider.
  - Applied with `RTCRtpSender.setParameters` (`maxBitrate`, `maxFramerate`, `scaleResolutionDownBy`) and the track's `contentHint` ('detail' or 'motion').
  - An estimate of your upload ("about 7.5 Mbps to 3 viewers") next to the controls, using the bitrate times the number of viewers.
- **Tests:** pure logic (preset to parameters, upload estimate) in `src/shared/` with unit tests; the smoke run gains a screen share using Chromium's fake capture devices, checking resolution and frame rate through `getStats`.

## Phase 2: camera

- Camera on/off in the voice panel, a camera picker in Audio and video settings, and unplug/replug following like microphones (reuse `src/shared/devices.ts`).
- Video tiles for people with cameras on; people without show their portrait as today.
- The same quality controls as screen share, with camera presets (360p, 720p, 1080p at 15 or 30 fps).
- Only visible tiles are rendered, and receiving is paused (transceiver direction) for tiles that are off screen or while the window is minimised, to keep memory and CPU low.

## Phase 3: keeping big calls usable in the mesh

- A cap on simultaneous video senders per call (default 3, changeable by anyone in the call), first come first served. Audio stays uncapped.
- Use the quality sampler to step a sender's video down automatically when a link turns orange or red, and back up when it recovers. The user's chosen setting remains the ceiling.
- Prefer VP9 for screen content (sharp text at low bitrates) and let Chromium pick hardware codecs for camera where available.

## Phase 4: video over the relay

- The relay sends packets of up to 1000 bytes as datagrams and larger ones over the reliable chat stream. Video packets are about 1200 bytes, so relayed video would mostly travel the reliable path and stutter on loss.
- Measure first. If needed, raise the datagram limit to what HyperDHT's UDX carries (around 1200 bytes) or cap relayed video at a lower resolution and say so in the call panel.

## Phase 5: a host for large calls, with automatic hand-over

Only if real use shows the mesh is not enough (roughly more than 5 or 6 people with video on).

- One participant's app receives each stream once and forwards it to the others (an SFU running in the Electron main process). Senders then upload one copy instead of one per viewer.
- **Choosing the host:** the sampler already measures each link every 2 seconds. Members share a small fitness score (median round trip, loss, upload headroom), kept in memory only as now. The best-scoring member hosts.
- **Hand-over:** if the host's score stays below the threshold for about 90 seconds, or the host leaves, every member computes the same next host from the shared scores (ties broken by key order, as elsewhere) and reconnects to them. Expect a brief freeze during the switch.
- Audio can stay in the mesh even then, so a host problem never silences the call.

## Open questions

- Should viewers be able to ask a sharer for higher or lower quality, or is the sender's choice final?
- Recording is out of scope unless asked for.
