# Eleusinia

Peer-to-peer chat and voice calls for desktop with no central server: a Discord/TeamSpeak-style app
where every message and call goes directly between the people involved. Electron + React + TypeScript.
See `README.md` for features, known limits and the roadmap.

## Commands

| Command | Use |
|---|---|
| `npm install` | Install; the postinstall also downloads the Electron binary (~100 MB). If `npm run dev` says `Electron uninstall`, run `npx install-electron` |
| `npm run dev` | Run with hot reload |
| `npm run typecheck` | `tsc --noEmit` over `src` and `test` |
| `npm test` | Vitest: `test/node.test.ts` runs the whole node layer against a local test DHT, no Electron; `test/callstate.test.ts` covers call reconnect decisions with a fake connection; `video.test.ts`, `quality.test.ts`, `devices.test.ts`, `relay.test.ts`, `hotkeys.test.ts` cover the other pure logic |
| `npm run smoke` | Builds, then drives three real app windows on a **local test DHT** (passed to the app as `ELEUSINIA_BOOTSTRAP`, which is off unless set): setup, friend search, chat, a voice call, hotkeys, screen sharing (with computer sound on Windows), a camera, offline delivery (~1.5 min, opens windows; the microphone and camera are Chromium's fake devices, and screen sharing only ever captures the test's own windows; what each connection receives is read with `getStats` through a wrapped `RTCPeerConnection`; hotkeys are tested by injecting F23/F24 key presses system-wide, keys no ordinary keyboard has) |
| `ELEUSINIA_NO_DIRECT=1 npm run smoke` | Same, but direct call routes are withheld so the call must go through the relay |
| `ELEUSINIA_SMOKE_PUBLIC=1 npm run smoke` | Same, over the **public** DHT, for an occasional real-network check (slower, and flaky when the DHT is) |

Two identities on one machine: give each its own data folder with `ELEUSINIA_DATA`
(PowerShell: `$env:ELEUSINIA_DATA = "C:\temp\eleusinia-b"; npm run dev`).

Before calling a change done, run typecheck and `npm test`; for anything touching calls or connection
setup, also run both smoke modes.

## Architecture

| Path | Role |
|---|---|
| `src/main/index.ts` | Electron main: window, identity (ed25519 key, encrypted with `safeStorage` when available), and one IPC handler `call(method, ...args)` that forwards to the node |
| `src/main/node.ts` | Friends, groups, message logs and their sync, settings, call signaling (`signal`, `relayOpen`, `relayClose`). Logs stay on disk with only the 3 most recently used conversations in memory (`KEEP_LOGS`); `history(conv, limit)` returns the newest messages. **No Electron imports**, so tests run it directly |
| `src/main/network.ts` | One encrypted HyperDHT stream per peer, found by public key. Newline-delimited JSON `Wire` messages; `packet()` sends call datagrams (≤1000 B unreliable, larger over the stream) |
| `src/main/relay.ts` | Fallback when routers block direct WebRTC: a local UDP port offered to WebRTC as a low-priority `relay` candidate, with packets ferried over the peer link. Media stays DTLS-SRTP encrypted |
| `src/shared/protocol.ts` | Wire, state and event types; validation (`isKey`, `cleanProfile`, …); message stacking |
| `src/shared/sync.ts` | Signing and verification, group merge, missing-message calculation |
| `src/shared/callstate.ts` | Per-peer call decisions with no WebRTC imports: buffers early ICE candidates, decides when to restart ICE or rebuild (smaller key acts, with backoff). Tested in `test/callstate.test.ts` |
| `src/renderer/App.tsx`, `ui.tsx` | React UI |
| `src/renderer/call.ts` | Calls: full-mesh `RTCPeerConnection` per participant, offer/answer/ICE over `signal`, mute/deafen, device and bitrate changes, connection sampling, screen sharing and cameras. Every connection has fixed slots from its first offer, found by order (`slotsOf`): voice, screen video, camera video, screen sound; `share`/`camera`/`want` signals |
| `src/shared/video.ts` | Screen and camera decisions: quality choices up to the source's limits, bitrate, per-viewer encodings, the soft cap (`canStream`), what a camera can do (`cameraSource`). Plan for cameras and forwarding: `docs/roadmap-video.md` |
| `src/shared/hotkeys.ts` | Global hotkeys from raw key codes: when mute/deafen fire and push to talk starts or stops, and recording a combination. `src/main/index.ts` feeds it from `uiohook-napi` (a native system-wide key hook with prebuilt binaries; it is needed because Electron's own global shortcuts cannot see key releases, which push to talk needs) |
| `src/shared/speaking.ts` | Speaking ring decision: RMS level against a threshold, with 250 ms hang time; mic sensitivity (`gate`, a threshold in dB with 400 ms hang). `call.ts` feeds it from an `AnalyserNode` per voice in one shared `AudioContext`, where voices also play through a per-person `GainNode` (0–200%) |
| `src/shared/sources.ts` | Which screens and windows the share picker offers: `kind` from the source id, and the filter for empty thumbnails, unnamed windows and known overlay/system windows (`HIDDEN_WINDOWS`, extend there). Applied in `src/main/index.ts` |
| `src/preload/index.ts` | Exposes `window.api.call`, `window.api.on`, `screens`/`chooseScreen` for the screen picker, `recordHotkey`/`stopRecording`, and `isAdmin`/`restartAsAdmin` (Windows: relaunch elevated so hotkeys reach games run as administrator; all handled in `src/main/index.ts`) |

Data lives in the app's data folder as `state.json` plus per-conversation `.jsonl` message logs.

Key ideas worth keeping intact:

- A `Key` is a 64-hex ed25519 public key; it is the identity and the address on the DHT.
- Everything from another peer is untrusted: validate and cap it (see `cleanProfile`, `validGroup`, `verifyMsg`).
- Messages and group changes are signed by their author; a member's leave can only be signed by themselves.
- Tie-breaks use key order: when both sides dial or offer at once, the smaller key wins.
- Call signals are processed one at a time (`onSignal` queue) so ICE candidates never overtake their offer.

## Conventions

- No semicolons, single quotes, 2-space indent, trailing commas in multi-line literals.
- Short functions; comments are brief and explain *why*, not what.
- Keep `node.ts` free of Electron and DOM imports; put pure logic in `src/shared/` so it can be unit tested.
- Prefer no new runtime dependencies; native modules need a good reason (they complicate packaging).
- Update `README.md` when a feature, limit or command changes.
