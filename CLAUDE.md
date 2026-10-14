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
| `npm test` | Vitest: `test/node.test.ts` runs the whole node layer against a local test DHT, no Electron |
| `npm run smoke` | Builds, then drives three real app windows over the **public** DHT: setup, friend search, chat, a voice call, offline delivery (~40 s, opens windows) |
| `ELEUSINIA_NO_DIRECT=1 npm run smoke` | Same, but direct call routes are withheld so the call must go through the relay |

Two identities on one machine: give each its own data folder with `ELEUSINIA_DATA`
(PowerShell: `$env:ELEUSINIA_DATA = "C:\temp\eleusinia-b"; npm run dev`).

Before calling a change done, run typecheck and `npm test`; for anything touching calls or connection
setup, also run both smoke modes.

## Architecture

| Path | Role |
|---|---|
| `src/main/index.ts` | Electron main: window, identity (ed25519 key, encrypted with `safeStorage` when available), and one IPC handler `call(method, ...args)` that forwards to the node |
| `src/main/node.ts` | Friends, groups, message logs and their sync, settings, call signaling (`signal`, `relayOpen`, `relayClose`). **No Electron imports**, so tests run it directly |
| `src/main/network.ts` | One encrypted HyperDHT stream per peer, found by public key. Newline-delimited JSON `Wire` messages; `packet()` sends call datagrams (≤1000 B unreliable, larger over the stream) |
| `src/main/relay.ts` | Fallback when routers block direct WebRTC: a local UDP port offered to WebRTC as a low-priority `relay` candidate, with packets ferried over the peer link. Media stays DTLS-SRTP encrypted |
| `src/shared/protocol.ts` | Wire, state and event types; validation (`isKey`, `cleanProfile`, …); message stacking |
| `src/shared/sync.ts` | Signing and verification, group merge, missing-message calculation |
| `src/renderer/App.tsx`, `ui.tsx` | React UI |
| `src/renderer/call.ts` | Voice: full-mesh `RTCPeerConnection` per participant, offer/answer/ICE over `signal`, mute/deafen, device and bitrate changes |
| `src/preload/index.ts` | Exposes `window.api.call` and `window.api.on` |

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
