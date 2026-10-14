<p align="center"><img src="build/icon.png" alt="" width="112"></p>

# Eleusinia

Peer-to-peer chat and voice calls for desktop, with no central server. A Discord/TeamSpeak-style app where every message and call goes directly between the people involved.

**Status:** early. Friends, direct and group text chat (including delivery to people who were offline) and voice calls work. Camera and screen sharing are not built yet.

## Features

- **No accounts, no server.** Your identity is a key pair created on first launch and stored encrypted on your computer.
- **Friends by ID.** You pick a username and get a random number, giving a friend ID like `name#1234`. Search an ID to see who holds it, with their picture and key ending, then send a request.
- **Profiles.** Display name, about line and picture. Until you upload a picture you get a pattern generated from your key.
- **Direct and group chat.** Text messages, signed by their author.
- **Offline delivery.** You can send while the recipient is offline; it shows as pending and arrives when they are next online with you. In groups, any member who has a message passes it on.
- **Voice calls.** 1:1 and group, audio sent directly between participants, with mute, deafen, a bitrate slider and microphone/speaker selection.
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
- `src/shared/`: wire types, validation, signing and merge logic.
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
| `npm run smoke` | Builds, then drives three real app windows over the public DHT through setup, friend search, chat, a voice call and offline delivery (about 40 seconds, opens windows) |

## Known limits

- **Friend IDs are not guaranteed unique.** Nothing central can reserve a name. Two people can hold the same `name#1234`; search lists both and shows each one's key ending so you can pick the right person. A 6-character key ending stops accidents, not a determined impostor.
- **Both people must be online to find each other by ID**, and a direct message needs sender and recipient online at the same time at some point.
- **Your profile is visible to anyone who knows your ID**, since search fetches it before you are friends.
- **Strict networks.** When routers block a direct call connection, the call is carried over the same encrypted link chat uses (shown as "relayed through the chat link"). This adds a little delay, and a call still fails if the two people cannot reach each other for chat either.
- **Groups have no admin or kick.** Any member can add their own friends. Members can leave; leaving is permanent and that person cannot be added back.
- **Deleting an account only erases it from your computer.** Friends who are offline at the time keep you in their list, and everyone keeps the messages you already sent them.
- **Text only:** no attachments, edits, deletes, reactions or unread markers.
- **Desktop only, one device per identity,** and no installer yet.

## Roadmap

1. Screen share and camera in calls, with video bitrate controls and a cap on simultaneous senders.
2. If needed for large video calls: one participant relays streams, with automatic hand-over when they leave.
