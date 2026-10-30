# Roadmap: activity (games and music)

What a person is doing, shown to their friends in as much detail as each source gives, and only the details they
choose to share. Quality over quantity: every integration goes as deep as its source allows before the next starts.

Items marked **verify** are from documentation or community knowledge and must be checked against the real source
before building on them.

**Decided:** linking an account (Bungie, Riot, Last.fm, …) is fine wherever it gives data that is not available
otherwise. Destiny 2 always signs in through bungie.net. League of Legends and TFT ship with the client's local API
(lobby, queue, champion select, rank) as well as the live match data; Valorant is left out.

**Done:** steps 0 and 1 (`src/shared/activity.ts`, `src/shared/steam.ts`, `src/main/activity.ts`,
`src/renderer/Activity.tsx`). Verified on a real Steam install: library folders, game names, playtime, and the binary
achievement files (names, descriptions, icons, unlock times); global rarity from Steam's public stats endpoint.
Still to see on a real machine: a Steam game running (only the registry value was read here, with none running), and
macOS's `registry.vdf`.

**Done:** step 2 (`src/shared/cs2.ts`, `src/main/gsi.ts`). Settings → Activity → Set up writes
`gamestate_integration_eleusinia.cfg` (port and token kept in `gsi.json`); the smoke run drives that button and posts
a match the way the game does. Still to see with the real game: the exact payload CS2 sends today (Premier's mode
name, `map_round_wins`, `phase_countdowns`), checked against the format Valve's own integration file on a real
install uses. Skins are not shown: their names live in the game's own files.

**Done:** step 3 (`src/shared/dota.ts`, the same server in `src/main/gsi.ts`: both games share one port and token,
told apart by `provider.appid`). Shown: hero portrait and name, level, game state, day or night, kills per side with
our side marked, the match clock ticking locally (paused shows frozen), K/D/A, LH/DN, GPM/XPM, kill streak; with the
live switch (off by default) gold, health and mana bars, items, backpack and neutral item with icons, buyback,
Aghanim's scepter and shard, "Dead · respawning in 0:23". Settings checks Steam's `localconfig.vdf` for the
`-gamestateintegration` launch option Dota has needed since March 2022, and says how to add it when it is missing
(the app never edits Steam's files). A game that is sending live details counts as running even before the watcher
has seen it. Not done yet: abilities and talents, the draft during hero selection, Roshan and Aegis (`buildings`,
`events`), net worth. Still to see with the real game: the payload Dota sends today; Dota 2 is not installed on the
machine this was written on.

## Principles

- **Read only, never inside a game.** Every source is a file, the registry, an official local API, or a public web
  API. No memory reading, no injection, no overlays drawn into games: nothing an anti-cheat (VAC, Vanguard,
  BattlEye, Easy Anti-Cheat) could object to.
- **A switch per source and per detail.** Game activity is on by default; the store details, and anything that would
  help an opponent (such as CS2's live state), are off until turned on. Settings has a switch per integration, and
  inside each one a switch per group of details (for CS2: score, own stats, loadout, money). A live preview shows exactly what friends
  will see.
- **Friends and group members only.** Activity travels over existing links, never on the DHT, never in the public
  profile card. Per-person "hide my activity from" list.
- **Everything from a peer is untrusted.** The `activity` wire message is validated and capped like profiles
  (`cleanProfile`): known kinds only, strings capped, numbers bounded, at most 1 update a second per peer.
- **Pictures never come from a URL a peer sends.** Peers send ids (Steam app id, Dota hero name, Bungie activity
  hash, League champion key, a cover's hash); the receiving app builds the URL itself from an allowlisted host
  (Steam, Bungie, Riot Data Dragon, Discord, iTunes) or gets the cover from the sender over the link. So a friend can
  never make our app fetch a tracking URL. The page's CSP stays as it is: images are fetched by the main process,
  cached on disk, and served to the page through a protocol like `eleusinia-file:` (`eleusinia-art:`).
- **Time moves on the receiving side.** Updates carry start times and positions with a timestamp; the progress bar,
  match clock and round timer tick locally, so nothing is resent every second.

## Architecture

| Path | Role |
|---|---|
| `src/shared/activity.ts` | The `Activity` types (one per kind: `steam`, `cs2`, `dota2`, `destiny2`, `league`, `rpc`, `music`, `game`), `cleanActivity` (validation and caps, unit tested), `shareable(activity, settings)` (removes the details a user turned off; unit tested so a switch can never leak) |
| `src/shared/activity/*.ts` | Pure parsers per source, each unit tested from recorded samples: GSI payloads, VDF/ACF files, Bungie responses, League JSON, Discord RPC frames, media sessions |
| `src/main/activity/*.ts` | The watchers per source (files, registry, local servers, polling), each starting only while its switch is on, feeding one `current()` in main |
| `src/main/node.ts` | Sends `{ t: 'activity', a }` to linked friends and group members on change (at most every 2 s, only fields that changed) and on greet; keeps each contact's in `State.activity` |
| `src/renderer/Activity.tsx` | The cards: one layout per kind, in three sizes (one line in lists, a card in the profile popover and the Oculus, a full panel when clicked) |

`Settings → Activity` lists the sources, each with its switches, its status (connected, waiting for the game, needs
setup) and the preview. Diagnostics get an `activity` area.

## 0. Foundation (first)

- Types, validation, `shareable`, the wire message, `State.activity`, the three card sizes, the settings page with
  the preview, `eleusinia-art:` with its allowlist and disk cache (capped, e.g. 200 MB, oldest first).
- **Any game, by program name**: the running programs every 15 s (`tasklist /fo csv /nh` on Windows, `ps -axo comm`
  elsewhere) against a built-in list (program name to game name and Steam app id), editable by the user ("Add a
  game"). Shows "Playing X" with elapsed time for anything not covered by a richer source below.
- Tests: `cleanActivity` against hostile input; `shareable` for every switch; a node test that activity reaches a
  friend, never a stranger, and stops when the switch goes off.

## 1. Steam, from local files and the registry

Detail available without any key:

- **The game being played now**: `RunningAppID` (Windows registry `HKCU\Software\Valve\Steam`, Linux
  `~/.steam/registry.vdf`; macOS **verify**). Exact for every Steam game, including ones not on our list. Start time
  from when it first appeared.
- **Name, art, details**: `steamapps/appmanifest_<id>.acf` (name, install size, build), found through
  `libraryfolders.vdf`. Art from Steam's public CDN by app id (`header.jpg`, `library_600x900.jpg`, `logo.png`,
  `library_hero.jpg`). Genre, developer, short description from the public store endpoint `appdetails` (cached for a
  week; **verify** rate limits).
- **Total playtime and last played**: `userdata/<account>/config/localconfig.vdf` (**verify** field names).
- **Achievements, locally**: Steam keeps each user's progress in `appcache/stats/UserGameStats_<account>_<app>.bin`
  and names and icons in `UserGameStatsSchema_<app>.bin` (binary KeyValues). Decoded, that gives "23 of 50
  achievements", the newest unlocked with its icon, and a toast to friends when one unlocks. **Verify** the format
  on real files before committing to this.
- **Buttons**: "View in store" (`steam://store/<id>`), "Open profile", "Launch" when the friend has it installed.
  "Join" only where a source gives a server or lobby (CS2 and Dota 2 below).
- Not available: Steam's own rich presence text and friends' Steam status (only the Steam client reads them;
  getting them means logging in as the user, which we do not do).

Card: header art, game name, "for 1 h 12 min", total hours, achievement bar and newest achievement.

## 2. Counter-Strike 2, Game State Integration

Valve's official feed: `game/csgo/cfg/gamestate_integration_eleusinia.cfg` makes the game POST JSON to a local
server we run on `127.0.0.1` with a random port and a secret token in the file (checked on every request).
Settings offers to write the file (folder found through `libraryfolders.vdf`, app id 730) and to remove it.

Components to request (**verify** the full list and field names against a real payload):

- `provider`: the game, version, our SteamID (ties it to the Steam layer).
- `map`: map name, mode (competitive, premier, wingman, deathmatch, casual), phase (warmup, live, intermission,
  gameover), round number, team scores and names, timeouts left, round wins history (`map_round_wins`: how each
  round was won: elimination, bomb, defuse, time).
- `round`: phase (freezetime, live, over), bomb state, winning team.
- `player_id`, `player_state`: health, armor, helmet, flashed, smoked, burning, money, round kills, round headshots,
  equipment value.
- `player_match_stats`: kills, assists, deaths, MVPs, score.
- `player_weapons`: every weapon with ammo, the active one, skins by name.
- `phase_countdowns`: time left in the round, bomb timer.
- While spectating or watching a demo only: `allplayers_*`, `bomb`, `grenades` (the whole scoreboard). While playing
  the game gives only our own data, which is also why this cannot be used to cheat.

Shown (each group behind its switch): map art and name, mode, score with the round history strip, round timer
ticking locally, own K/A/D, MVPs, money, health and armor, active weapon with skin, "Dead / alive", warmup or
halftime. Premier rating and Faceit level are not in GSI.

Card sizes: list line "CS2 · Mirage · 9–7"; card with the round strip and own stats; full panel with loadout.

## 3. Dota 2, Game State Integration

Same mechanism: `game/dota/cfg/gamestate_integration/gamestate_integration_eleusinia.cfg`, app id 570.

Components (**verify**): `provider`, `map` (clock, day or night, game state from hero selection to post game,
Radiant and Dire scores, winning team, ward purchase cooldowns, Roshan state where present), `player` (kills,
deaths, assists, last hits, denies, kill streak, gold, GPM, XPM), `hero` (name, level, alive, respawn time, health,
mana, buyback cost and cooldown, Aghanim's scepter and shard, talents, silenced, stunned, smoked), `abilities`
(each with level and cooldown, ultimate ready), `items` (inventory, backpack, neutral item, charges, cooldowns),
`draft` (picks and bans during hero selection), `buildings` and `events` (Roshan, Aegis, courier) where present.

Shown: hero portrait (from Valve's public CDN by hero name), level, K/D/A, LH/DN, GPM/XPM, net worth, items with
icons, Aghanim's status, score and clock ticking locally, draft during hero selection, "Dead, back in 23 s".

## 4. Music: Spotify, YouTube Music, Apple Music and the rest

One layer reads what the system says is playing; enrichers add what each service gives on top.

**The system layer** (works for any player):

- Windows: Global System Media Transport Controls (the panel above the volume slider). Electron cannot read it
  itself; start with a long-running hidden PowerShell process that uses the WinRT API and prints JSON lines on every
  change (title, artist, album, album artist, track number, cover, position, length, playing or paused, which app).
  No new dependency. If that proves slow or unreliable, move to a small native module.
- macOS: AppleScript to the Spotify app (name, artist, album, track id, cover URL, position, duration, popularity,
  disc and track number) and the Music app (name, artist, album, genre, year, duration, position, loved, play count,
  cover as raw data). Asks once for Automation permission.
- Linux: MPRIS over D-Bus (`xesam:title`, `artist`, `album`, `artUrl`, `mpris:length`, `mpris:trackid`, position).

**Per service:**

- **Spotify.** Mac and Linux give the track id: exact "Play on Spotify" (`spotify:track:<id>`), cover from Spotify's
  public oEmbed by track id (**verify**). Windows gives only title and artist: the button opens a Spotify search.
  Spotify's Web API is not used (5 users per app since 2026), so no synced Listen Along: instead "Play this too"
  opens the same track for the friend, and "Sync" seeks it to the sharer's position where the system allows seeking
  (**verify** for Spotify on Windows).
- **YouTube Music.** In a browser or the unofficial desktop app it reaches the system layer like any player. The
  desktop app's API plugin can also give the video id, likes and the queue on a local port (**verify**); with it,
  "Play on YouTube Music" opens the exact song; without it, a search.
- **Apple Music.** Mac through the Music app (above); Windows through the Apple Music app's media session.
- **Every song, enriched**: the public iTunes Search API (no key) by title and artist gives a 600 px cover, genre,
  release year, explicit flag and the Apple Music link; the public song.link API (**verify** limits) turns one link
  into links for Spotify, YouTube Music, Apple Music, Tidal and Deezer, so each friend gets a button for their own
  service. Results cached per song.
- **Phones (optional)**: a Last.fm username in Settings; Last.fm's public API shows what is playing on any device
  that scrobbles.

Shown: cover, song, artist, album, year, a progress bar ticking locally, paused state, the player's icon (Spotify,
YouTube Music, Apple Music, browser), "Play on …" buttons per service, "Play this too". Per-app hiding (share Spotify,
never the browser).

## 5. Discord rich presence channel

Many games (and some music and coding apps) send their status to Discord through a local channel: named pipes
`\\.\pipe\discord-ipc-0` to `-9` on Windows, sockets `discord-ipc-0` to `-9` under `$XDG_RUNTIME_DIR` or `$TMPDIR`
elsewhere. Frames are an 8-byte header (opcode and length, little endian) and JSON. We answer the handshake with a
`READY` and take `SET_ACTIVITY`: `details`, `state`, start and end times, party size, the large and small images
with their hover text, buttons. The game's name and icon come from Discord's public application endpoint by its
client id, image keys from its public asset list (**verify** both).

- Games try `-0` first, so with Discord itself running, Discord gets them. We listen on the first free number; this
  works when Discord is not running, and Settings says so.
- Shown: the game's own text ("Ranked · In match", "Party of 3 of 5"), its art, elapsed or remaining time, its
  buttons (opened only after a click, and only http/https).

## 6. League of Legends and TFT: Live Client Data and the client

- **Live Client Data API** (official, no key, only during a match): `https://127.0.0.1:2999/liveclientdata/allgamedata`,
  signed with Riot's own certificate (pin `riotgames.pem`, do not turn off checking). Gives the game mode and time,
  our champion's level, stats, abilities, runes and gold, every player's champion, skin, summoner spells, items,
  K/D/A, CS, ward score, dead and respawn timer, and events (kills, multikills, dragons, barons, towers, inhibitors,
  ace). Polled every 2 s while the game runs.
- Images from Riot's public Data Dragon (champions, items, spells, runes) at the matching patch.
- **The client (lobby, queue, champion select, rank)**: the League client's local API through its `lockfile` (port and
  password, its own certificate). "In lobby (Ranked Flex, 3 of 5)", "In queue (Ranked Solo) 2:14", champion select
  with picks and bans, rank, LP and recent results. TFT the same way: queue, rank, and during a match the live data
  the game gives.
- **Valorant**: left out.

Shown: champion splash, level, K/D/A, CS and CS per minute, items, gold, game clock ticking locally, team kills,
objectives taken, "Dead, back in 12 s".

## 7. Destiny 2: Bungie.net API

Needs a Bungie application (registered by the project owner at bungie.net: API key and an OAuth client). The key
ships in the app, as is usual for Bungie apps.

- **Linking**: the user signs in through bungie.net (OAuth) in their browser, as other Destiny apps do; the app
  learns their memberships from `GetMembershipsForCurrentUser`. Every component is then readable whatever the
  privacy settings. **Verify** before building: whether a public client gets a refresh token (if not, the
  confidential client type with the sign-in finished in the app, so nobody signs in again every hour).
- **Polled every 60 s while Destiny 2 runs** (found by the Steam or program layer, so nothing is polled otherwise):
  `GetProfile` with components 100 (profile), 200 (characters: class, light level, emblem, title), 204 (character
  activities: current activity, its mode, playlist, start time), 205 (equipment), 1000 (transitory: fireteam
  members, the current activity's score where it has one, joinability).
- **Names and art from the Manifest** (downloaded once per version, kept on disk): activity name, destination,
  planet, its picture (`pgcrImage`), mode icon, item names and icons for the loadout, emblem art.
- Shown: activity art, "Crucible · Control · Altar of Flame", "Raid · Salvation's Edge" with time in it, fireteam
  of 4 of 6 with their names, class and light level, emblem, equipped weapons and exotic armor, score where the
  activity has one. "In orbit" when between activities.

## 8. Ubisoft Connect: Rainbow Six Siege and other Ubisoft games

Ubisoft has no public API and no live match feed for Siege. What it has is Ubisoft Services, the web API its own
launcher and site use; it is unofficial for us, and community libraries (r6api.js, siegeapi, @rainbow6/sdk) show its
shape. So this step is: detect the game locally, and with the user's Ubisoft account linked, show their stats.

- **Detecting the game.** Siege bought on Steam is already found exactly by step 1 (app 359550, with its Steam
  achievements). Bought on Ubisoft Connect: the running programs (`RainbowSix.exe`, `RainbowSix_Vulkan.exe`,
  `RainbowSix_BE.exe`, and the other Ubisoft games' programs), the installs Ubisoft Connect records
  (`HKLM\SOFTWARE\WOW6432Node\Ubisoft\Launcher\Installs\<id>\InstallDir`; **verify**: empty on the one PC checked,
  where Siege is a Steam install) and its cache of game names and art (**verify** the files).
- **Linking the account** (Settings → Activity → Ubisoft, offered when a Ubisoft game is first found):
  - The sign-in happens on Ubisoft's own page in a separate window, so the password is typed into Ubisoft, never into
    Eleusinia; the app keeps only the session it is given, encrypted with `safeStorage`, renews it, and forgets it
    on "Unlink". **Verify** that the session can be taken from that page; if not, the fallback the community
    libraries use is a sign-in form in Eleusinia that sends the email and password straight to Ubisoft and stores
    neither. Two-step verification must work either way.
  - Said plainly in the app: this is not an official Ubisoft integration, it may stop working when Ubisoft changes
    something, and Ubisoft's terms do not cover third-party apps.
- **Siege, with the account linked** (**verify** every field against the live API before building): the current
  season's rank with its icon, rank points, best rank this season, wins and losses, win rate, kills, deaths, K/D,
  level, total playtime, most played operators with their icons and stats, and the result of the last match (win or
  loss, rank points gained or lost), found by comparing stats after each match. Polled every 3 minutes while Siege
  runs and once when it closes, never otherwise, to stay well under Ubisoft's limits.
- **Other Ubisoft games** (The Division 2, Assassin's Creed, Far Cry, The Crew Motorfest and the rest): name, art,
  playtime and Ubisoft Connect achievements where the services give them (**verify**).
- Shown: "Rainbow Six Siege · Ranked · Emerald II", the rank icon and points, the season's record and K/D, top
  operators, the last match's result; for other games their art, playtime and achievements.
- Not possible: live round, score, operator or map during a match (Siege offers no feed; Overwolf's game events only
  work inside Overwolf apps).

## Order and size

| Step | Size | Needs from you |
|---|---|---|
| 0 Foundation and program names | large | — |
| 1 Steam local | medium (achievements: medium more) | — |
| 2 CS2 GSI | medium | — |
| 3 Dota 2 GSI | medium | — |
| 4 Music | large (the Windows helper is most of it) | — |
| 5 Discord channel | medium | — |
| 6 League and TFT | medium | — |
| 7 Destiny 2 | large | registering the Bungie application (API key and OAuth client) |
| 8 Ubisoft Connect (Siege and others) | large | — (each user links their own Ubisoft account) |

Each step ships on its own, with its parser tests from recorded real data, a node test where it touches the network,
and a check on a real machine with the game or player running before it counts as done.

## Testing

- Recorded payloads from real sessions (GSI posts, Bungie responses, League JSON, RPC frames, media sessions) as
  fixtures; parsers tested against them and against hostile versions.
- A fake source per kind in the smoke run: two windows, one sharing a recorded CS2 match and a song, the other
  showing the cards; checks that turned-off details never arrive.
- Real-machine checks per step, since games and players cannot run in CI.

## Not possible, said plainly in the app

- Steam's own rich presence text, Spotify Listen Along with control, Premier rating and Faceit levels, Valorant
  (unless allowed), anything about a game that offers no data (most launchers outside Steam).
