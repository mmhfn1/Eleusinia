# Eleusinia — feature inventory (2026-11-04)

Boundaries come from CLAUDE.md's architecture table, the import graph, and file names. Line counts are low because lines are long.

| # | Feature | Entry points | Core files | Purpose |
|---|---|---|---|---|
| 1 | Identity, friends and discovery | `src/main/index.ts` (identity load), `node.ts` `createNode` | `src/main/node.ts` (friends, requests, cards, presence), `src/shared/idcard.ts`, `src/shared/sealed.ts`, `src/shared/protocol.ts` (`cleanProfile`) | Ed25519 identity, friend requests (direct and sealed DHT announcements), published profile cards, offline ID cards, search |
| 2 | Messaging, groups and files | `node.ts` `send`, the sync handlers | `src/main/node.ts` (logs, sync, receipts, forwarding), `src/shared/sync.ts`, `src/main/files.ts`, `src/shared/media.ts`, `src/shared/links.ts`, `src/main/links.ts`, `src/renderer/Chat.tsx` | Signed message logs and their sync, groups with signed membership, file transfer by hash, link previews |
| 3 | Transport and relay | `src/main/network.ts` `dial`/`setRelay` | `src/main/network.ts`, relaying in `node.ts` (`need`, `relayTick`, `reach`), `src/main/relay.ts`, `src/shared/netsim.ts` | HyperDHT streams per peer, blind relay through friends, a UDP relay candidate for WebRTC |
| 4 | Calls and media | `src/renderer/call.ts` | `call.ts`, `src/shared/callstate.ts`, `quality.ts`, `video.ts`, `speaking.ts`, `jingles.ts`, `hotkeys.ts`, `devices.ts`, `sources.ts`, `src/renderer/Media.tsx` | Mesh WebRTC voice, screen and camera; reconnects; quality; sounds; hotkeys |
| 5 | Activity | `src/main/activity.ts` watcher, `src/main/gsi.ts`, `src/main/bungie.ts` | `src/shared/activity.ts`, `steam.ts`, `cs2.ts`, `dota.ts`, `destiny.ts`, `src/renderer/Activity.tsx` | What friends are playing: Steam, CS2 and Dota GSI, Destiny 2 through Bungie.net |
| 6 | Reports, updates and app shell | `src/main/index.ts` | `src/shared/reports.ts`, `src/main/inbox.ts`, `src/shared/updatesig.ts`, `src/main/selfupdate.ts`, `src/preload/index.ts` | Diagnostics, problem and crash reports to the inbox, signed self-updates, the IPC surface |
| 7 | UI shell | `src/renderer/main.tsx` → `App.tsx` | `App.tsx`, `Profile.tsx`, `Settings.tsx`, `ui.tsx`, `common.ts` | Navigation, cards and panels, settings |

Excluded: `test/`, `dist/`, `out/`, `build/` (packaging scripts).
