# 4. Calls and media

Happy path: join → signals queued in order → the smaller key offers → answer → ICE → connected → sampling. The watchdog restarts or rebuilds; leaving drops everything.

```mermaid
flowchart TD
  C1["hotkey uIOhook → IPC event<br/>index.ts:657, 640"] --> C2["onHotkey: ptt / mute / deafen<br/>call.ts:1022"]
  D1["join: mic, context, intervals<br/>call.ts:942"] -->|"signal join [IPC + net]"| D2["send → node.signal → net.send call<br/>call.ts:148; node.ts:955"]
  D2 --> D3["onSignal → serial queue → handle<br/>App.tsx:63; call.ts:1149, 1057"]
  D3 --> D4{"kind"}
  D4 -->|join| D5["offers(me, them)? offer : echo join<br/>callstate.ts:20; call.ts:1085"]
  D5 --> D6["connect: RTCPeerConnection + watchdog<br/>call.ts:401"]
  D6 --> D7["createOffer, SDP tweaks, send offer<br/>call.ts:494"]
  D4 -->|offer| D8["describe: remote, flush ICE, addRelay<br/>call.ts:517, 450"]
  D8 -->|"relayOpen [IPC]"| D9["relay candidate<br/>callstate.ts:160"]
  D8 --> D10["createAnswer, send answer<br/>call.ts:1099"]
  D4 -->|answer| D11["stale-id check, describe<br/>call.ts:1103"]
  D4 -->|ice| D12["candidates.add buffer<br/>callstate.ts:42"]
  D4 -->|share / camera / preview / voice / want| D13["validate + cap, applyLevel<br/>call.ts:1112-1128, 525"]
  D6 --> E1["connectionstatechange → watchdog<br/>call.ts:426"]
  E1 -->|connected| E2["bitrate, voice, share, level<br/>call.ts:429"]
  E1 -->|disconnected| E3["restartSoon → ICE restart [timer]<br/>callstate.ts:100; call.ts:506"]
  E1 -->|failed| E4["rebuildLater 2/5/10/15 s → offer<br/>callstate.ts:99"]
  E2 --> F1["measure every 2 s [timer]<br/>call.ts:838"]
  F1 --> F2["signal() grade → VoiceSignal<br/>call.ts:873; Media.tsx:21"]
  E2 --> G1["listenAll every 50 ms: speaking, gate<br/>call.ts:354"]
  H1["startShare / capture / use<br/>call.ts:639, 595"] --> H2["replaceTrack + share + previews<br/>call.ts:609, 616"]
  H3["Stage level → call.show → want<br/>Media.tsx:583; call.ts:731"] --> D13
  I1["onState offline → away, 15 s grace<br/>call.ts:1175; callstate.ts:115"] --> I2["drop: close pc, relayClose<br/>call.ts:391"]
  I3["leave: send leave, drop all, clear timers<br/>call.ts:974"] --> I4["no call"]
  J1["restartForUpdate: localStorage, 3 min<br/>call.ts:1157"] --> J2["rejoinAfterUpdate → join<br/>call.ts:1163"]
```

**Depends on:** transport (signals over `net.send`, the UDP relay), friends (`members` check in `node.signal`, node.ts:955).

**Checked:** `drop` (call.ts:391) adds the call-level cleanup on top of `close` (call.ts:379), and `leave` (call.ts:974) calls `drop` per peer, then clears the call-wide state. That's layering, not duplicated cleanup.
