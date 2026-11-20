<p align="center"><img src="build/icon.png" alt="" width="112"></p>

<h1 align="center">Eleusinia</h1>

<p align="center">
  Peer-to-peer chat, voice and screen sharing for desktop.<br>
  A Discord-style app where every message and call goes directly between the people involved.
</p>

<p align="center">
  <a href="https://mmhfn1.github.io/Eleusinia/">Download</a> ·
  <a href="https://github.com/mmhfn1/Eleusinia/releases">Releases</a> ·
  <a href="docs/roadmap-servers.md">Servers roadmap</a> ·
  <a href="docs/roadmap-video.md">Video roadmap</a>
</p>

---

**Status:** tester builds (0.1.x) for Windows, macOS and Linux, updating themselves. Chat, files, voice, screen sharing, cameras, game activity and Discord-style servers all work. Problems can be reported from inside the app.

## Why Eleusinia

- **No accounts.** Your identity is a key pair made on first launch and kept encrypted on your computer.
- **No central server for your data.** Messages, files and calls travel between the people in the conversation. Nobody in the middle can read them.
- **Works on hard networks.** When two routers won't connect directly, a mutual friend or an Eleusinia relay carries the encrypted link.
- **Big calls without a big upload.** When your upload can't send your screen to everyone, people in the call pass it on, encrypted end to end.

## Features

### Friends and profiles
- Friend IDs like `name#1234`. Search finds people even while they're offline, and requests wait until they're back.
- Requests are sealed, so nobody watching can tell who is asking whom.
- Profiles with a name, about line, picture and a banner. Without an uploaded picture, everyone gets one built from their key (an arch, steps, a split disc), so the same person always looks the same and a copy looks different. Banners can be your picture softened, a pattern woven from your key in tones you pick, or a picture or GIF you upload; pictures can be GIFs too (up to about 300 KB each). While you play, friends see the game's art as your banner unless you turn that off. Click anyone to open their profile beside them, with what they're playing and a box to message them.
- Nicknames, pins, mutes and blocking, all from a right-click.

### Chat and files
- Direct and group chat. Every message is signed by its author; hover one for its seal. A DM's header says why it is private and how it travels (direct, or through a relay).
- Messages reach people who were offline once you're both online. In groups, any member passes them on.
- Files of any size: paste, drop or attach. Pictures show inline. Other files download on click, from anyone in the conversation who has them.
- Link previews are made by the sender, so readers' apps fetch nothing.
- Photos have their location and camera details stripped before sending.

### Voice calls
- 1:1 and group calls with mute, deafen and a volume per person. Everyone stands as a tall banner; whoever talks is lit, with a seam of light as long as their voice is loud.
- Noise suppression on by default (RNNoise, running locally).
- Push to talk and global hotkeys that work while a game is in front.
- Calls hold up on bad lines: spare voice copies, a jitter buffer that adapts, and reconnecting by itself after a network switch.
- A connection sign shows the ping to each person and how steady it is.

### Screen sharing and cameras
- Share a screen or window, up to what your system allows (for example 4K at 120 fps), with your computer's sound on Windows.
- Streams are offered, not pushed: viewers join when they want to watch, and get nothing until they do.
- Cameras with a preview, and a row of people along the bottom of a stream.
- An upload check warns before a stream would strain the call.
- **Forwarding:** when your upload runs short, call mates pass your stream on, and an Eleusinia server does as a last resort. Forwarders only ever handle encrypted frames. The tile says who it came through.

### Servers
- Text and voice channels in categories, roles with colours and permissions, channels limited to some roles.
- A banner behind the server's name: woven from the server's key, a picture, or a game's art.
- Invite links with an expiry and a use limit, and invite cards that join in one click.
- Pokes to invite members into a voice channel.
- Moderation: kick, ban, server mute and deafen, move, disconnect, and an audit log.
- No server behind them: a server is a signed history that every member's app replays the same way, so nobody can give themselves powers.

### Game activity
- What you're playing, shown to friends and group members only, with each detail behind its own switch.
- Steam games with art, playtime and achievements.
- Live **Counter-Strike 2** and **Dota 2** matches through Valve's Game State Integration: map, score and your stats. Health, money and items stay private unless you turn them on.
- **Destiny 2** through your Bungie.net account: activity, guardian, fireteam and loadout.
- Nothing reads a game's memory, so anti-cheat has nothing to object to.

### The app
- Opens on a short splash that waits until your friends are linked and missed messages have arrived, and installs any update first.
- Its own title bar, a tray icon, mouse back and forward buttons, and resizable columns.
- The rail holds your servers and groups. Home opens on friends in game, as art cards with the live match, then live calls and everyone online; its column has a live feed of what friends are doing (right-click to join them) and your direct messages, which stay beside any open conversation.
- A DM shows the other person beside it: their status, what they play, a week of play, their showcase, your time together and the pictures you shared.
- Profiles: a status that can clear itself and hold back pokes, a showcase of up to three favourite games or achievements, an accent colour taken from the banner, and a seal for people whose key you compared in person.
- Settings has an index of its sections and a preview of what others see as you change your profile.
- The look: Ink by night, muted ivory by day, or whichever Windows uses (Settings, General), set in Commissioner.
- **Report a problem** sends a bug report to the developers. You preview it first, and nothing identifying is included ([docs/reports.md](docs/reports.md)).

## Connecting on strict networks

Some routers, common on mobile data and carrier-grade NAT, never allow a direct connection. Eleusinia tries these routes in order:

1. **Direct.**
2. **A mutual friend or server member relaying.** Voice, text and pictures only. Their profile card says *Online through a friend*.
3. **An Eleusinia relay**, run by the project. It carries everything, video included, and shows as *Online through an Eleusinia relay*.

A relay only handles encrypted data. It can see who connects to whom, when and how much, but never what is said. Only friends, group and server members, and the project's own relays ever relay for you.

A network that blocks UDP entirely (some offices and schools) can't connect, since there is no TCP route.

## How it works

| Part | Technology |
|---|---|
| Finding and linking people | [HyperDHT](https://github.com/holepunchto/hyperdht): a public DHT and encrypted streams, found by public key |
| Calls | WebRTC in Electron, full mesh, with peer forwarding for screens ([werift](https://github.com/shinyoshiaki/werift-webrtc)) |
| Storage | JSON and `.jsonl` files in your data folder |
| App | Electron, React and TypeScript |

The only outside services are the DHT's bootstrap nodes, a public STUN server, and the project's relay and forwarder. None of them can read messages or hear calls. Developer notes on the architecture are in [CLAUDE.md](CLAUDE.md).

## Installing

Download from the [download page](https://mmhfn1.github.io/Eleusinia/) or [Releases](https://github.com/mmhfn1/Eleusinia/releases). Builds aren't signed by Microsoft or Apple yet, so each system asks once:

- **Windows 10 or 11:** run `Eleusinia-Setup-<version>.exe`. At *Windows protected your PC*, choose **More info → Run anyway**.
- **macOS 11 or later:** open the `.dmg` (`arm64` for Apple Silicon, `x64` for Intel) and drag Eleusinia into Applications. The first time, right-click it and choose **Open**. On macOS 15, use **Open Anyway** in System Settings → Privacy & Security.
- **Linux:** make the `.AppImage` executable and run it from a folder you can write to. Hotkeys need X11.

**Updates are automatic.** Eleusinia checks on start, hourly, and when a friend runs a newer version. Every update is signed with Eleusinia's own key and checked before it is installed.

## Development

Requires [Node.js](https://nodejs.org) 22 or newer.

```bash
npm install
npm run dev
```

If `npm run dev` says `Electron uninstall`, run `npx install-electron` once.

To run two identities on one computer, give the second its own data folder. In PowerShell:

```powershell
$env:ELEUSINIA_DATA = "C:\temp\eleusinia-b"; npm run dev
```

| Command | What it does |
|---|---|
| `npm run typecheck` | TypeScript check |
| `npm test` | Unit and integration tests on a local test DHT |
| `npm run smoke` | Builds, then drives three real app windows through chat, calls, screen sharing and more (about 2 minutes) |
| `npm run dist` | Windows installer into `dist/` |
| `npm run relay` | The hosted relay ([server setup](docs/oracle-setup.md)) |
| `npm run inbox` | The developers' inbox for problem reports ([docs/reports.md](docs/reports.md)) |

The smoke run has modes for relayed, strict-network and forwarded calls. They are listed in [CLAUDE.md](CLAUDE.md).

**Releases:** work happens on `test`. Each push there is checked and built on all three systems. Merging into `main` publishes the next version to every tester.

## Known limits

- **Friend IDs aren't unique.** Two people can hold the same `name#1234`. Search shows each one's Unique Key so you can pick the right one.
- **Your name, about line and a picture thumbnail are public** to anyone who knows your friend ID.
- **One device per identity**, desktop only.
- **No message edits, deletes or reactions yet.**
- **A file can only be fetched while someone who has it is online.**
- **Groups hold up to 100 members** and have one owner, who can't hand ownership over yet.
- **Forwarding covers screens only.** Cameras still go person to person.
- **Computer sound with a share is Windows only.**
- **Hotkeys** use a system-wide keyboard hook that runs only while a hotkey is set. On Windows, keys pressed in a game running as administrator need **Restart App as Administrator**.
- **Deleting your account** only erases it from your computer.

## Roadmap

- **Servers:** encryption for limited channels next ([docs/roadmap-servers.md](docs/roadmap-servers.md)).
- **Video:** forwarding tried across real networks, and cameras forwarded too ([docs/roadmap-video.md](docs/roadmap-video.md)).
- **Activity:** League of Legends, TFT, Rainbow Six Siege, and music from Spotify and others ([docs/roadmap-activity.md](docs/roadmap-activity.md)).
