# 1. Identity, friends and discovery

Happy path: identity load → profile → published card and ID card → friend request (direct link or sealed DHT announcement) → accepted → linked.

```mermaid
flowchart TD
  A1["loadIdentity<br/>index.ts:84"] --> A2["createNode: load state.json<br/>node.ts:81"]
  A1 -. "write identity.json / unreadable: rename, new or quit<br/>index.ts:116, :95, :107" .-> A1
  A2 --> A3["setProfile + cleanProfile<br/>node.ts:780"]
  A3 --> A4["idOwners: re-roll a taken handle<br/>node.ts:700"]
  A3 --> A5["publishCard [DHT put]<br/>node.ts:653"]
  A3 --> A6["publishId [DHT get+put]<br/>node.ts:681"]
  A6 --> A6b["signClaim / withClaim / readClaims<br/>idcard.ts:15,43,21"]
  A2 --> A7["announce every 5 min [DHT announce]<br/>node.ts:752"]
  A7 --> A5
  A7 --> A6
  A6 --> A8["keepFriendsFindable [DHT put]<br/>node.ts:689"]
  A9["findFriend<br/>node.ts:802"] --> A4
  A9 --> A10["lookup prefixTopic [DHT get]<br/>node.ts:807"]
  A9 --> A11["fetchCard [DHT get, 6 s timeout]<br/>node.ts:664"]
  A12["addFriend<br/>node.ts:826"] --> A13["announceRequest [DHT put+announce]<br/>node.ts:627"]
  A13 --> A13b["sealRequest<br/>sealed.ts:18"]
  A12 --> A14["reach: dial or greet [net]<br/>node.ts:248"]
  A14 --> A15["hello over the link<br/>node.ts:277"]
  A15 --> A16["takeRequest / state change [disk]<br/>node.ts:257, :305"]
  A17["checkRequests: every 30 s or ring [DHT lookup]<br/>node.ts:718"] --> A18["senderOf [DHT get]<br/>node.ts:635"]
  A18 --> A18b["openRequest<br/>sealed.ts:28"]
  A18 --> A19{"sender's state"}
  A19 -- outgoing --> A20["now friends + reach<br/>node.ts:734"]
  A19 -- unknown --> A16
  A16 --> A11
  A16 --> A21["incoming request; user accepts<br/>node.ts:826"] --> A12
  A20 --> A22["changed: saveSoon + push [disk]<br/>node.ts:155"]
```

**Depends on:** transport (`net.dial`, `lookup`, `announce`, `putShared`; network.ts:218-240), `thumbnail` (index.ts:446), messaging (`hi`/`greet` send the DM's `have`).

**Gaps:** network.ts internals were only grepped.
