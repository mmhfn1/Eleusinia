# 5. Activity

Happy path: the watcher finds the game every 10 s, GSI or Bungie adds live details, the parts are merged, filtered by the sharing switches and sent to linked friends. The receiver cleans what arrives and shows it.

```mermaid
flowchart TD
  A0["startActivity apply()<br/>index.ts:189"] -->|sharing on| A1["watchActivity tick every 10 s<br/>activity.ts:198"]
  A0 --> G0["gsi.update: listen if a cfg exists<br/>gsi.ts:164"]
  A1 --> A2["steamNow: reg query / registry.vdf<br/>activity.ts:39"]
  A2 -->|RunningAppID| A3["steamGame: manifest, playtime, achievements<br/>activity.ts:156"]
  A2 -->|none| A4["programGame: tasklist / ps vs KNOWN_GAMES<br/>activity.ts:184"]
  A3 --> A5["store + rarity [HTTP]<br/>activity.ts:96, 112"]
  A3 --> A6["parseVdf / parseKv / achievementsOf<br/>steam.ts"]
  A1 -->|changed| M["send: merge game + live + guardian<br/>index.ts:134"]
  G0 --> G1["POST 127.0.0.1, token check<br/>gsi.ts:100"]
  G1 --> G2["cs2Of / dotaOf<br/>cs2.ts, dota.ts"]
  G2 --> M
  G1 -->|30 s silence| G3["expiry: onData(null)<br/>gsi.ts:130"] --> M
  A1 -->|Destiny 2 and linked| B0["watchDestiny every 5 s<br/>index.ts:173-181"]
  B0 --> B1["bungie.destiny: profile, Manifest, clan [HTTP]<br/>bungie.ts:201"]
  B1 --> B2["destinyOf<br/>destiny.ts"] --> M
  B3["bungie.link: browser OAuth + loopback server<br/>bungie.ts:149"] -.-> B1
  M --> N0["setActivity → shareActivity (2 s debounce)<br/>node.ts:995, 132"]
  N0 --> N1["shareable: by switches<br/>activity.ts:55"]
  N1 --> N2["sendActivity [net]<br/>node.ts:123"]
  N2 --> N3["receiver: cleanActivity → theirs → push<br/>node.ts:323; activity.ts:72"]
  N3 --> R0["ActivityLine / GameGlance / GameCard<br/>Activity.tsx:51, 99, 473"]
  R0 --> R1["eleusinia-art:// → artUrl → art/ cache [HTTP, disk]<br/>index.ts:231"]
  A0 -->|sharing off| A9["stop watcher and GSI, game = null<br/>index.ts:195"]
```

**Depends on:** messaging/transport (`net.send`, `known`), the UI (Settings → Activity, `Connections`).

**Doc drift:** CLAUDE.md says Destiny's `GetProfile` runs every 30 s, but `setInterval(tick, 5000)` is at index.ts:181.
