# 3. Transport and relay

Happy path: a direct dial succeeds and is adopted. When it fails, the peer is reached through a relaying friend. Call packets are ferried over the link when WebRTC can't connect directly.

```mermaid
flowchart TD
  A1["createNet + listen<br/>network.ts:49, 108"] --> A2["redial every 15 s + relayTick<br/>node.ts:600, 607"]
  A2 -->|due| A3["net.dial direct<br/>network.ts:167"]
  A3 -->|"dht.connect [net]"| A4{"open?"}
  A4 -->|yes| A5["adopt: race, keepalive 5 s, timeout 20 s<br/>network.ts:56"]
  A4 -->|no| A6["failed → directFailed + backOff<br/>node.ts:561, 595"]
  A5 --> A7["3 s no-bytes check, redial once [timer]<br/>network.ts:186"]
  A5 --> A8["open: hello, relayedVia if via<br/>node.ts:529, 217"]
  A8 --> A9["linked: msg / pkt traffic<br/>network.ts:75, 248"]
  A6 --> B1["need / reach → demand<br/>node.ts:456, 248"]
  B1 --> B2["relayTick: demand + directFailed + retryAt<br/>node.ts:497"]
  B2 --> B3["tryRelay: ask 3 contacts, 3 s [timer]<br/>node.ts:471"]
  B3 -->|"reach [net]"| B4["responder: relayKey, known, linked, ≤10/min<br/>node.ts:407-415"]
  B3 -->|ok| B5["net.dial(k, relayKey)<br/>node.ts:495"]
  B5 --> A3
  B5 -->|fail| B7["relayFailed: backoff, avoid 10 min<br/>node.ts:458"]
  A8 -->|"relayed [net]"| B8["relayedVia; relayed handler<br/>node.ts:416"]
  B8 --> B9["relayTick: drop when direct found or idle 10 min<br/>node.ts:499-502"]
  S1["setRelay / serveRelay<br/>network.ts:213, 113"] --> S2["refuse: pairs, per contact, ban<br/>network.ts:145"]
  S1 --> S3["measure 5 s: cut >24 KB/s, ban 10 min [timer]<br/>network.ts:130"]
  P1["relay.open UDP per call peer<br/>relay.ts:50"] --> P2["message → toPeer<br/>relay.ts:38"]
  P2 --> P3["createImpairment (test only)<br/>netsim.ts, node.ts:574"]
  P3 --> P4["net.packet: ≤1000 B datagram, else pkt over the stream<br/>network.ts:248"]
  P4 --> P5["remote relay.deliver<br/>node.ts:399, 566; relay.ts:62"]
```

**Depends on:** friends (`admit` = `known` or `outgoing`, node.ts:522), calls (`relayOpen`/`relayClose` over IPC, node.ts:960-961).

**Checked:** `createNet(keyPair, handlers, dht, links, strict)` (node.ts:514-571) matches the signature `(keyPair, on, dhtOpts, allow, strict)` (network.ts:49). The tracer's suspicion that the arguments were off by one was wrong.
