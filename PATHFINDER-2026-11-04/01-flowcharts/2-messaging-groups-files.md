# 2. Messaging, groups and files

Happy path: send → sign → log → send to members → receiver verifies, appends, forwards (groups) → receipts → missing-message sync.

```mermaid
flowchart TD
  B1["send<br/>node.ts:907"] --> B2["check members, text, files<br/>node.ts:909-911"]
  B2 -- error --> B2e["throw"]
  B2 --> B3["signMsg<br/>sync.ts:25"]
  B3 --> B4["cleanLink + withLink (lsig)<br/>node.ts:921, sync.ts:32"]
  B4 --> B5["append: log [disk] + emit<br/>node.ts:193"]
  B5 --> B5b["files.note<br/>files.ts:161"]
  B5 --> B6["net.send msg to members [net]<br/>node.ts:924"]
  B6 --> B7["onMsg msg (receiver)<br/>node.ts:374"]
  B7 -- "seq gap" --> B8["sendHave re=true: ask<br/>node.ts:381"]
  B7 --> B9["verifyMsg<br/>sync.ts:38"]
  B9 -- invalid --> B9e["dropped"]
  B9 --> B10["append [disk] + receipt<br/>node.ts:383-384"]
  B10 --> B11["forward to 3 random members [net]<br/>node.ts:388"]
  B10 --> B12["sendReceipts every 5 s [net]<br/>node.ts:233"]
  B12 --> B13["have: confirmed, held, missing, ask<br/>node.ts:333"]
  B13 --> B14["missing → resend [net]<br/>sync.ts:68, node.ts:358"]
  B13 --> B15["acked: save + emit<br/>node.ts:368"]
  B13 --> B16["heldFrom → skip line [disk]<br/>sync.ts:59, node.ts:352"]
  G1["createGroup / addToGroup / removeFromGroup / leaveGroup<br/>node.ts:865, 888, 928, 936"] --> G2["signAdd / signRemoved / signLeft / signEdit<br/>sync.ts:13, 74, 21, 81"]
  G2 --> G3["mergeGroup [disk via changed]<br/>sync.ts:127"] --> G4["spread [net]<br/>node.ts:252"]
  G4 --> G5["onMsg group: validGroup, mergeGroup<br/>node.ts:307, sync.ts:89"]
  F1["attach → addBytes / addPath [disk]<br/>index.ts:582, files.ts:183, 171"] --> B1
  B5b --> F2["fetch / pump: 4 gets in flight [net]<br/>files.ts:146, 94"]
  F2 --> F3["onGet: serve, nope if not a member<br/>files.ts:212"] --> F4["onPart: append .part [disk]<br/>files.ts:232"]
  F4 --> F5["finish: hash check, rename [disk]<br/>files.ts:112"]
  F2 -- "20 s stall / nope" --> F6["giveUp: next source<br/>files.ts:246"]
  L1["previewLink [HTTP]<br/>links.ts:46"] --> L2["read / metaOf / thumb<br/>links.ts:36"] --> B4
```

**Depends on:** friends (`members()` needs `friend` state), transport (`net.send`, `backlog`, `relayed` for files), the IPC bridge (index.ts:513).

**Gaps:** the renderer side (`useLinkDraft`, `Chat.tsx`) was not traced.
