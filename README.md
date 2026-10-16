<p align="center"><img src="build/icon.png" alt="" width="112"></p>

# Eleusinia

Peer-to-peer chat and voice calls for desktop, with no central server. A Discord/TeamSpeak-style app where every message and call goes directly between the people involved.

**Status:** early. Friends, direct and group text chat (including delivery to people who were offline), voice calls and screen sharing work. Cameras are not built yet.

## Features

- **No accounts, no server.** Your identity is a key pair created on first launch and stored encrypted on your computer.
- **Friends by ID.** You pick a username and get a random number, giving a friend ID like `name#1234`. Search an ID to see who holds it, with their picture and Unique Key (the last characters of their key), then send a request.
- **Profiles.** Display name, about line and picture. You can move, zoom and rotate a picture to line it up before it is saved. Until you upload one you get a pattern generated from your key.
- **Direct and group chat.** Text messages, signed by their author.
- **Offline delivery.** You can send while the recipient is offline; it shows as pending and arrives when they are next online with you. In groups, any member who has a message passes it on.
- **Voice calls.** 1:1 and group, audio sent directly between participants, with mute and deafen (shown to everyone in the call as an icon beside your name), a volume slider for each person from 0 to 200% (remembered between sessions), a ring around whoever is speaking, and a bitrate slider and microphone/speaker selection in Settings. A call that drops after a network blip or switch reconnects by itself. If your chosen headset or speakers are unplugged mid-call, the call moves to the system default and back when they return. A wifi sign next to **Voice Connected** shows your connection: green when good and stable, orange when degraded, red when poor; hover or focus it to see your ping to each person (or to the network when you are alone in the call). Measurements are kept in memory only. Audio stays light: Opus sends almost nothing while you are silent, with its error correction kept on.
- **Hotkeys.** Optional shortcuts for mute, deafen and push to talk, set in Settings by pressing the keys. They work while Eleusinia is in the background or minimised, and none are set unless you set them. With push to talk set, your microphone only sends while you hold it.
- **Screen sharing.** Share a screen or window in any call, picked from **Screens** and **Applications** tabs (overlays such as the NVIDIA and Xbox Game Bar ones, and system windows, are left out). A shared screen can be watched full screen; the button switches to **Exit full screen**, and Esc works too. Streams start at 720p and 30 fps; the streaming menu goes as high as your system allows (for example 4K at 120 fps), and your choice is always applied. You can switch to another screen or window mid-stream without stopping; your quality carries over as far as the new source allows. On Windows you can share your computer's sound with it: everything you hear except Eleusinia itself, so nobody in the call hears themselves back. A stream only starts if your measured upload can carry it to everyone and nobody already streaming is short of bandwidth; otherwise a notice explains why. Viewers receive full quality for the stream they show large, a small copy for thumbnails, and nothing while the window is hidden or the screens are hidden.
- **Cameras.** Turn your camera on in any call. Camera settings shows a preview and offers resolution and frame rate up to what your camera can do (720p at 30 fps by default). With only cameras on, everyone appears in a grid; with a screen shared, cameras sit beside it. The same upload check as screen sharing applies.
- **Resizable layout.** Groups sidebar, friends list split into online and offline, and in a conversation a voice sidebar, the chat and a members sidebar.

## How it works

| Part | Technology | What it carries |
|---|---|---|
| Finding and linking peers | [HyperDHT](https://github.com/holepunchto/hyperdht) (public DHT, encrypted streams) | Presence, friend requests, profiles, group membership, messages, call signaling |
| Voice | WebRTC (Chromium, inside Electron), full mesh; falls back to the DHT link when no direct route exists (`src/main/relay.ts`) | Opus audio |
| Storage | JSON and `.jsonl` files in the app's data folder | Friends, groups, settings, message logs |

The only outside infrastructure is the public DHT's bootstrap nodes and a public STUN server, used to find peers and open direct connections. They never see messages or audio.

- `src/main/network.ts`: one encrypted stream per peer, found by public key.
- `src/main/node.ts`: friends, groups, message logs and their sync. No Electron imports, so the tests run it directly.
- `src/shared/`: wire types, validation, signing and merge logic, and the per-peer call decisions (`callstate.ts`: early ICE candidates, reconnect timing).
- `src/renderer/`: the React UI (`App.tsx`) and voice calls (`call.ts`).

## Getting started

Requires [Node.js](https://nodejs.org) 22 or newer.

```bash
npm install
npm run dev
```

`npm install` also downloads the Electron app binary (about 100 MB, cached after the first time). If `npm run dev` says `Electron uninstall`, the install was run with scripts disabled; run `npx install-electron` once.

### Trying it with two identities on one computer

Each instance needs its own data folder. Start the first normally, then in a second terminal:

```bash
ELEUSINIA_DATA=/tmp/eleusinia-b npm run dev
```

On Windows PowerShell: `$env:ELEUSINIA_DATA = "C:\temp\eleusinia-b"; npm run dev`

Both people must have the app open when one searches for the other's ID.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Run the app with hot reload |
| `npm run build` | Build into `out/` |
| `npm start` | Run the built app |
| `npm test` | Unit and integration tests on a local test DHT |
| `npm run typecheck` | TypeScript check |
| `npm run smoke` | Builds, then drives three real app windows on a local test DHT through setup, friend search, chat, a voice call, screen sharing (of its own windows only, with computer sound on Windows), a camera and offline delivery (about a minute, opens windows) |
| `ELEUSINIA_NO_DIRECT=1 npm run smoke` | Same, but direct call routes are withheld, so the call must go through the relay |
| `ELEUSINIA_SMOKE_PUBLIC=1 npm run smoke` | Same, over the public DHT: an occasional real-network check, slower and sometimes flaky when the DHT is |

## Known limits

- **Friend IDs are not guaranteed unique.** Nothing central can reserve a name. Two people can hold the same `name#1234`; search lists both and shows each one's Unique Key so you can pick the right person. The Unique Key shown is the last 6 characters of the person's public key: it stops accidents, not a determined impostor.
- **Both people must be online to find each other by ID**, and a direct message needs sender and recipient online at the same time at some point.
- **Your profile is visible to anyone who knows your ID**, since search fetches it before you are friends.
- **Strict networks.** When routers block a direct call connection, the call is carried over the same encrypted link chat uses (shown as "relayed through the chat link"). This adds a little delay, and a call still fails if the two people cannot reach each other for chat either. The fallback needs a network address on your machine (IPv4, or IPv6 when there is no IPv4); without one, the call panel says the fallback is unavailable.
- **Groups have no admin or kick.** Any member can add their own friends. Members can leave; leaving is permanent and that person cannot be added back.
- **Deleting an account only erases it from your computer.** Friends who are offline at the time keep you in their list, and everyone keeps the messages you already sent them.
- **Computer sound with a share is Windows only**, and mono. Calls of more than about 6 to 8 full-quality streams (screens and cameras together) need peer forwarding, which is not built yet (see the roadmap).
- **Hotkeys use a system-wide keyboard hook** ([uiohook-napi](https://github.com/SnosMe/uiohook-napi)), running only while a hotkey is set or being recorded. Keys are only compared in memory, never stored or sent. On macOS it needs Accessibility permission; on Linux it needs X11 (not Wayland).
- **Text only:** no attachments, edits, deletes, reactions or unread markers.
- **Desktop only, one device per identity,** and no installer yet.

## Roadmap

Screen sharing and cameras for calls of up to 15 to 20 people with no cap on sharers: per-viewer quality in the peer-to-peer mesh, and well-connected participants forwarding end-to-end encrypted video when needed. See [docs/roadmap-video.md](docs/roadmap-video.md).
