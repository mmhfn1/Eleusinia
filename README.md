<p align="center"><img src="build/icon.png" alt="" width="112"></p>

# Eleusinia

Peer-to-peer chat and voice calls for desktop, with no central server. A Discord/TeamSpeak-style app where every message and call goes directly between the people involved.

**Status:** tester build (0.0.2 and up, updating itself). Friends, direct and group text chat (including delivery to people who were offline), voice calls, screen sharing and cameras work. Problems can be reported from inside the app.

## Features

- **No accounts, no server.** Your identity is a key pair created on first launch and stored encrypted on your computer.
- **Friends by ID.** You pick a username and get a random number, giving a friend ID like `name#1234`. Search an ID to see who holds it, with their picture and Unique Key (the last characters of their key), then send a request. Searching an exact friend ID also finds people who are offline: everyone publishes a small signed ID card on the DHT (where anyone can read it, but nobody can fake someone else's entry), refreshed every 6 hours and kept alive by their friends, so the request waits for them and arrives when they are back. Each result has an **Add friend** button on its left. A request reaches them even when your two networks never allow a direct connection: it is announced on the DHT where only they look (every 30 seconds), and your name and ID come from a card you publish there, signed by your key; accepting travels back the same way. A desktop notification tells them a request arrived. Up to 200 requests wait at once (the oldest drops off if more arrive), **Decline all** clears them, and a declined request stays declined for 30 days.
- **Profiles.** Display name, about line and picture. You can move, zoom and rotate a picture to line it up before it is saved. Until you upload one you get a pattern generated from your key. Anyone's profile card opens from their name in chat, the top of a DM (picture, name and friend ID), or a right-click on them in the friends list or a group's members.
- **Direct and group chat.** Text messages, signed by their author. A conversation opens at its newest 200 messages; **Show earlier messages** loads more, so long histories stay light.
- **Sharing files.** Attach any file, of any size, with the paperclip, by dropping it on a conversation or by pasting it (up to 10 per message). Pictures show in the chat; videos and sounds play there once downloaded; anything else is a card with **Download** and then **Show in folder**. Only the message (with each file's name, size and fingerprint) travels like text: the file itself is fetched from whoever has it, the sender or, in a group, any member who already downloaded it, so it stays available after the sender goes offline. Pictures up to 25 MB download by themselves; everything else only when you click, to a place you choose. JPEG and PNG pictures are re-encoded before sending, which removes location and camera details. Files you send are not copied (a moved or edited file can no longer be fetched), and downloaded pictures are kept within a cache limit set in Settings → Storage (1 GB by default, oldest deleted first). Through a mutual friend's relay only pictures travel; bigger files wait for a direct connection. Nobody outside a conversation can fetch its files, and SVG and HTML files are never shown in the chat.
- **Sounds.** Short, distinct sounds for muting, unmuting, deafening, undeafening, and someone joining or leaving your call. A direct call (not a group's) rings for the person called and plays a caller tune for the caller, each for up to 40 seconds; after that the call simply carries on until someone joins or leaves, it is never ended for lack of an answer. Sounds play on your chosen speakers at your output volume; joining and leaving are silent while you are deafened.
- **Offline delivery.** You can send while the recipient is offline; it shows as pending and arrives when they are next online with you. In groups, any member who has a message passes it on.
- **Voice calls.** 1:1 and group, audio sent directly between participants, with mute and deafen (shown to everyone in the call as an icon beside your name), a volume slider for each person from 0 to 200% (remembered between sessions), a ring around whoever is speaking, and in Settings: speakers and an output volume for everything you hear, then microphone, noise suppression (on by default: RNNoise, a small neural network running on your CPU during calls, removes taps, keyboards, fans and hum; voices in the room are speech and pass through) and mic sensitivity (only send while you are louder than a level you set, with your live level shown during a call), then the bitrate. A call that drops after a network blip or switch reconnects by itself; while someone's voice is still arriving the connection is left alone rather than restarted (restarting is what you would hear as a gap), and links to other continents get longer before a restart. Voice goes ahead of screen sharing and cameras when the connection is short of room, and on an uneven link the player keeps a little more audio in hand so words are not stretched or clipped. If your chosen headset or speakers are unplugged mid-call, the call moves to the system default and back when they return. A wifi sign next to **Voice Connected** shows your connection: green when good and stable, orange when degraded, red when poor (judged on lost and late audio first: a call to another continent is not marked down for distance alone); hover or focus it to see your ping to each person (or to the network when you are alone in the call): the typical value over the last minute, and whether it is steady or varies (±, judged against the ping itself, so a far but even link counts as steady). Measurements are kept in memory only. Audio stays light: Opus sends almost nothing while you are silent, with its error correction kept on.
- **Hotkeys.** Optional shortcuts for mute, deafen and push to talk, set in Settings by pressing the keys. They work while Eleusinia is in the background or minimised, and none are set unless you set them. For games that run as administrator, Settings has **Restart App as Administrator** (Windows). With push to talk set, your microphone only sends while you hold it.
- **Screen sharing.** Share a screen or window in any call, picked from **Screens** and **Applications** tabs (overlays such as the NVIDIA and Xbox Game Bar ones, and system windows, are left out). A shared screen can be watched full screen, and a share with sound has its own volume slider beside the full screen button; the button switches to **Exit full screen**, and Esc works too. Streams start at 720p and 30 fps; the streaming menu goes as high as your system allows (for example 4K at 120 fps), and your choice is always applied. You can switch to another screen or window mid-stream without stopping; your quality carries over as far as the new source allows. On Windows you can share your computer's sound with it: everything you hear except Eleusinia itself, so nobody in the call hears themselves back. Before a stream or camera starts, Eleusinia checks your measured upload can carry it to everyone and nobody already streaming is short of bandwidth; if not, a warning explains why, and you can lower the quality or start anyway. Viewers receive full quality for the stream they show large, a small copy for thumbnails, and nothing while the window is hidden or the screens are hidden.
- **Cameras.** Turn your camera on in any call. Camera settings shows a preview and offers resolution and frame rate up to what your camera can do (720p at 30 fps by default). With only cameras on, everyone appears in a grid; with a screen shared, cameras sit beside it. The same upload check as screen sharing applies.
- **Connecting through a mutual friend (experimental, off by default).** When two people's routers never allow a direct connection, Settings → General → **Connect through mutual friends** lets a friend you both have carry the link. That friend's app pairs your two encrypted streams without being able to read them: it sees that you are talking, when, and how much, never what is said. It is only used after a direct connection fails, only when there is something to send or the conversation is open, and it closes after 10 idle minutes. Voice, text and pictures only: screen sharing, cameras and other files are not sent through a friend, and their profile card says **Online through a friend**. Each person relays for at most 4 pairs at a time (2 involving the same friend), at up to 48 KB/s a pair, and only for their own friends and group members. The switch covers both directions: off, you neither relay nor are relayed.
- **Runs in the tray.** Closing the window keeps Eleusinia running beside the clock, so calls, messages, hotkeys and updates carry on; click the icon to bring it back, or right-click it to quit. Settings → General turns this off, so closing the window quits. Opening Eleusinia again while it runs brings the same window back.
- **Back and forward** with the mouse's side buttons (mouse 4 and 5), through the conversations you have opened.
- **Problem and crash reports.** Settings → Help and feedback → **Report a problem** sends a bug report, feedback or an idea to the developers, with diagnostics you choose and preview first; crash reports go by themselves unless turned off. They travel peer to peer to the developers' inbox, with no account and no server; nothing identifying is included (see [docs/reports.md](docs/reports.md)).
- **Resizable layout.** Groups sidebar, friends list split into online and offline (with message and call buttons on each friend, and live calls and friend requests beside it on wide windows), and in a conversation a voice sidebar, the chat and a members sidebar.
- **The look: Ink and fog.** Black and white like the emblem, over a cold fog gradient sampled from the Shattered Throne's art; Bricolage Grotesque for titles and Instrument Sans for text, both bundled. In a call everyone appears above the chat under a pool of light, the person talking lifted with a slow glow; call controls are round icon buttons. A direct call you have not joined shows a bar to join, join muted or silence the ringing. Motion is short and stops when the system asks for reduced motion.
- **Its own title bar.** The window's top strip is part of the app: it shows where you are, a way back to a call you are in elsewhere, and quiet minimize, maximize and close buttons; it still drags, snaps and maximizes on double-click like any window. The installer refreshes Windows' icon cache, so the taskbar shows the current icon after an update.
- **The emblem menu.** The emblem at the top of the rail (or Ctrl K) opens a small menu: go to any friend or group by typing, copy your friend ID, check for updates, report a problem, or quit.

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

## Installing

Testers: download the latest `Eleusinia-Setup-<version>.exe` from [Releases](https://github.com/mmhfn1/Eleusinia/releases) and run it. It is not code-signed yet, so Windows shows "Windows protected your PC" the first time: choose **More info → Run anyway**. Your data stays in `%APPDATA%\Eleusinia` and is kept if you uninstall.

**Updates are automatic** from 0.0.2 on. Every time Eleusinia starts it first checks for a newer release (for a few seconds at most, so being offline never holds it up); if there is one, it downloads and installs it, then opens the new version. While running it checks every 4 hours and offers **Restart now**, or installs the next time you close it. Anyone on 0.0.1 installs 0.0.2 by hand once.

**Releases** are made by GitHub itself: every push to `main` that changes the app (not only docs or tests) is type-checked, unit-tested, built and published as the next version (`.github/workflows/release.yml`). The version counts up by itself from the one in `package.json` (0.0.2, 0.0.3, …); raise its first two parts there for a bigger step. Keep unfinished work on other branches: whatever reaches `main` reaches every tester within hours.

**Mixed versions:** everyone's profile card shows the Eleusinia version they run. Copies whose calls cannot work together do not try to connect, and the call panel says who needs to update.

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
| `npm run smoke` | Builds, then drives three real app windows on a local test DHT through setup, friend search, chat, a voice call, screen sharing (of its own windows only, with computer sound on Windows), a camera, offline delivery, and problem and crash reports to a test inbox (about two minutes, opens windows) |
| `ELEUSINIA_NO_DIRECT=1 npm run smoke` | Same, but direct call routes are withheld, so the call must go through the relay |
| `ELEUSINIA_SMOKE_RELAYED=1 npm run smoke` | A shorter run where two windows behave as behind strict routers (`ELEUSINIA_STRICT=1`, testing only): their chat and a voice call go through the third window, a mutual friend relaying, and screen sharing is held back |
| `npm run dist` | Builds the Windows installer into `dist/` (`Eleusinia-Setup-<version>.exe`) |
| `ELEUSINIA_SMOKE_EXE=dist/win-unpacked/Eleusinia.exe node test/smoke.mjs` | The same smoke run against the packaged app, after `npm run dist` |
| `npm run inbox` | Runs the developers' inbox, which receives problem and crash reports and files them as GitHub issues (see [docs/reports.md](docs/reports.md)) |
| `npm run installer-art` | Redraws the installer's sidebar and header pictures in the app's look |
| `ELEUSINIA_SMOKE_PUBLIC=1 npm run smoke` | Same, over the public DHT: an occasional real-network check, slower and sometimes flaky when the DHT is |

## Known limits

- **Friend IDs are not guaranteed unique.** Nothing central can reserve a name. Two people can hold the same `name#1234`; search lists both and shows each one's Unique Key so you can pick the right person. The Unique Key shown is the last 6 characters of the person's public key: it stops accidents, not a determined impostor.
- **Both people must be online to find each other by ID**, and a direct message needs sender and recipient online at the same time at some point.
- **Your profile is visible to anyone who knows your ID**, since search fetches it before you are friends.
- **Strict networks.** When routers block a direct call connection, the call is carried over the same encrypted link chat uses (shown as "relayed through the chat link"). This adds a little delay, and a call still fails if the two people cannot reach each other for chat either. When even chat cannot link, a mutual friend can relay (see Features); that needs a friend you both have who is online with the setting on, and carries voice, text and pictures only. The fallback needs a network address on your machine (IPv4, or IPv6 when there is no IPv4); without one, the call panel says the fallback is unavailable.
- **Groups have no admin or kick.** Any member can add their own friends. Members can leave; leaving is permanent and that person cannot be added back.
- **Deleting an account only erases it from your computer.** Friends who are offline at the time keep you in their list, and everyone keeps the messages you already sent them.
- **Computer sound with a share is Windows only**, and mono. Calls of more than about 6 to 8 full-quality streams (screens and cameras together) need peer forwarding, which is not built yet (see the roadmap).
- **Hotkeys use a system-wide keyboard hook** ([uiohook-napi](https://github.com/SnosMe/uiohook-napi)), running only while a hotkey is set or being recorded. Keys are only compared in memory, never stored or sent. On Windows, keys pressed while a program running as administrator is in front (some games, launchers and anti-cheat tools) never reach it; **Settings → Restart App as Administrator** fixes that until Eleusinia is closed. On macOS it needs Accessibility permission; on Linux it needs X11 (not Wayland).
- **No edits, deletes, reactions or unread markers.** A shared file can only be fetched while someone who has it is online, and JPEG pictures arrive without their rotation tag (a phone photo may show sideways). GIF and WebP pictures are sent as they are, with any details they carry.
- **Desktop only, one device per identity.** The installer and updates are Windows only, and unsigned.
- **Reports reach the developers only while their inbox is running**; until then they wait on your computer.

## Roadmap

Screen sharing and cameras for calls of up to 15 to 20 people with no cap on sharers: per-viewer quality in the peer-to-peer mesh, and well-connected participants forwarding end-to-end encrypted video when needed. See [docs/roadmap-video.md](docs/roadmap-video.md).
