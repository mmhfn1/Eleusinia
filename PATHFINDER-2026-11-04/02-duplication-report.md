# Duplication report

Sources: the three tracers' reports. Every claim kept below was re-checked with grep in this session.

Overall: the codebase is already mostly single-path. There is one store per kind of data, one transport, one validation layer in `src/shared/`, and one dialog component. The accidental duplication is small.

## Accidental: worth merging

### D1. Value-clamping helpers copied across the shared parsers
- `num` is the same in all three:
  - `src/shared/cs2.ts:39`
  - `src/shared/dota.ts:50`
  - `src/shared/destiny.ts:44`

  The definition: `(v, max = 1e6) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v) : undefined`.
- `str` / `text` are the same, trim then slice or `undefined`:
  - `src/shared/activity.ts:67`
  - `src/shared/destiny.ts:43`
- Variants with a reason:
  - `src/shared/links.ts:41` also collapses whitespace;
  - `src/shared/reports.ts:53` returns an empty string, not `undefined`;
  - `src/shared/activity.ts:68` `int` takes a minimum.
- **Why they diverged:** each parser was written separately, one game at a time.
- **Verdict:** accidental. The three copies of `num` must stay the same, because together they define what "a number from a peer" means.

### D2. Two exponential backoffs in `node.ts`
- `backOff`, `src/main/node.ts:595-597`: `retries.set(k, { n, next: now + min(redialMs * 2^(n-1), redialMs * 20) })`.
- `relayFailed`, `src/main/node.ts:458-464`: `fails.set(k, n); retryAt.set(k, now + RETRY * min(2^(n-1), 20))`.
- **Why they diverged:** relaying was added later, with its own maps.
- **Verdict:** accidental. It's the same formula and the same cap, kept in different shapes: one map of `{ n, next }` against two maps.

## Legitimate specialisation: leave alone

| Concern | Locations | Why they differ |
|---|---|---|
| Friend request intake | over the link `node.ts:283-295`; over the DHT `node.ts:733-744` | Two channels, because strict routers can't link. Both already share `takeRequest` and `declinedRecently` |
| Validation on send and on receive | `node.ts:910-911` and `sync.ts:47-48` | The same shared validators (`validFiles`, `MAX_TEXT`) at two trust boundaries. The sender fails early with a message |
| `cleanReport` three times | `Settings.tsx:441`, `node.ts:1012`, `inbox.ts:58` | The preview, the sender and the inbox are different trust boundaries |
| Update signature checks | `index.ts:279-288` (Windows hook), `selfupdate.ts:40-51` | electron-updater owns the Windows download. Both already call `verifyUpdate` |
| Local HTTP servers | `gsi.ts:100`, `bungie.ts:155` | A long-lived server where the game posts with a token, against a one-shot OAuth return |
| safeStorage sealing | `index.ts:90, 114-116` (identity), `index.ts:167-168` (Bungie) | Different saved formats; merging them would need a migration of identity files for no gain |
| Hex regexes | `sync.ts:10` (128), `files.ts:213` (64), `gsi.ts:69` (48), `node.ts:271` (16) and others | Different lengths for different things; `isKey` already covers keys |
| Per-peer call cleanup | `call.ts:379` `close`, `:391` `drop`, `:974` `leave` | Layered, not copied: `leave` calls `drop`, and `drop` calls `close` |
| Polling timers | `activity.ts:213`, `index.ts:181`, `gsi.ts:130`, `inbox.ts:95`, `node.ts:607-608` | Different sources and cadences. A shared scheduler would add a layer |

## Not duplication, but found on the way
- **No fetch timeout:**
  - Steam store and rarity: `activity.ts:96, 112`.
  - Bungie API: `bungie.ts:68`.
  - Art: `index.ts:231`.

  Only `links.ts` (`AbortSignal.timeout(5000)`) and `updateFirst` (6 s race) have one. The watcher's `busy` guard (`activity.ts:197`) means one hung store request would stop activity updates until it ends. Not verified against Electron's `net.fetch` default timeout.
- **Doc drift:** CLAUDE.md says Destiny polls every 30 s; the code is 5 s (`index.ts:181`).
