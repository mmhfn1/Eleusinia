# Plan: relay through anyone who can reach them

**Goal:** someone in your server or call who can't connect to you directly still appears online, joins voice and
gets your messages. The connection goes through any member who can reach both of you, not only a lucky pick, and
when nobody can, the app says so instead of showing "connecting" forever.

## What the 0.1.3 reports show

Three reports from 12 Nov (two from …A87141's side, one from …EAC4F8's) tell the same story:

- Direct links fail between some pairs: …658122, …d8568a, …461ca4 and …82a236 are never linked from one machine,
  while others reach them. Ping between the testers is 170 to 220 ms, so they are far apart, behind routers that
  don't hole-punch to each other.
- The relay fallback almost never works:
  - `asking 1 contact to relay for …658122`, `linking with …658122 through …a87141`, then nothing, then
    `asking 0 contacts`, `no contact could relay … yet`.
  - The other side logs why: `can't relay for …a87141 to …d8568a: not linked with them` (and the same for …461ca4
    and …82a236).
  - A relayer must already be linked to the target. With bounded links (`linkPick`, 8 per group) and failing
    routers, the few relaying peers we ask (3, picked at random in `tryRelay`) rarely are, even when someone else in
    the call is.
- What users see:
  - a friend shown offline while online, since a friend counts as online only while linked (`state().online`);
  - a server invite stuck pending (it goes as a DM message, which needs a link);
  - a voice-channel member stuck on "connecting" (call signals need a link);
  - "more than 4 users cannot be present in a server": no cap exists, it is how many each person can reach.

## Status

- **Phases 1 and 2: done.**
  - Answers wait 10 s, not 6, and the asker 12 s, because a hole punch to a strict router took 8 to 9 s on the test
    network.
  - Added along the way: a contact whose dial reaches us while we are unlinked is dialed back (`incoming` in
    network.ts). A relay could otherwise never link with someone whose router accepts nothing in, though their own
    dials out work.
  - Tests: `test/relaypick.test.ts`, and "a relay asked to reach someone it is not linked with links to them first"
    in `test/node.test.ts`.
- **Phases 3 and 4: done.**
  - Relays carry 8 pairs, 4 per contact (`RELAY_LIMITS`).
  - `State.unreachable` drives "Online, connecting…" and "Online, can't connect yet" in the friends list, the profile card and a
    DM's pending messages, and "Can't connect yet" on a call tile.
  - Not built: a separate notice under a pending server invite. It is a DM message, so the DM's pending line covers it.
  - Test: "a friend seen online through presence notes whom neither a direct dial nor a relay reaches is listed as
    unreachable" in `test/node.test.ts`. The new caps have no test of their own; the existing caps test still checks
    they are enforced.
- **Phase 5: done.**
  - The phase 1 test fails with the relay's own dial taken out (checked). Phase 4's wording moved to
    `src/shared/reach.ts` so `test/reach.test.ts` can check it without a window.
  - Not added: the smoke step with Cy starting unlinked from Bob. The node test covers the same thing end to end,
    and arranging an unlinked friend in the smoke run would need a new test-only switch.
  - Not added: an integration test with 5 relays where only the 5th can reach the target. All 5 are asked now (up to
    6), and the order is covered by `test/relaypick.test.ts`.
- **Phase 6: local checks done** (typecheck, `npm test`, three smoke modes). The field check waits for a release:
  run `npm run logs` during a group call and look for `relaying for … linking with them first` and relayed links
    where 0.1.3 logged `no contact could relay`.

## Phase 1: a relayer links to the target when asked

**How this serves the goal:** most refusals are "not linked with them"; the relayer usually can link, it just
hasn't.

- `node.ts`, the `reach` handler:
  - when the target is `known` but not linked, dial it (`net.dial`), wait up to 6 s for the link, then answer `ok`;
  - answer `false` at once only for relaying off, an unknown target, too many asks, or an old version.
  - Keep the 10 asks a minute cap; add at most 4 dials in flight for others, so one asker can't make us dial a whole
    server.
- `tryRelay`: wait 8 s instead of 3 s for answers, since a yes may now need a dial first.
- Log `relaying for …X to …Y: linking with them first` once per pair (`tell`).

## Phase 2: ask the peers most likely to reach them

**How this serves the goal:** today 3 random relaying peers are asked, so the one member linked with the target is
often missed.

- `tryRelay` candidates, in this order, up to 6 (not 3):
  1. the last relay that worked for this target (`lastGood`, as now);
  2. peers in the same call as the target (from presence notes, `presence.calls()`), since they have a live call
     with them;
  3. peers who share the target's server or group (`servers.knows`, `inGroupWith`);
  4. other relaying peers.
- Ask them all at once; take the first yes (as now).
- `need()`: also cover call mates and members of a server channel we have a message for, not only friends. Call
  mates already get demand from `callMates()`; this makes the rule explicit and logged.

## Phase 3: room on relays during calls

**How this serves the goal:** in a 6-person server where several pairs can't link, one well-connected member
carries several pairs and hits today's caps.

- `RELAY_LIMITS` (`network.ts`): pairs 4 → 8 and perContact 2 → 4. Keep the 24 KB/s per direction per pair:
  relayed links carry voice only (`State.relayed`), about 8 KB/s.
- Close idle relayed pairs after 10 minutes as now, so capacity frees up.

## Phase 4: say what is happening

**How this serves the goal:** "offline" and an endless "connecting" make people think the app is broken when it
is the network.

- A friend with a live presence note counts as online (`state().online`, plus `presence.online()` for friends),
  shown as "online, connecting" until linked.
- A call tile whose connection never formed shows "Can't connect to you" once direct and relay attempts are both
  over (`relayFailed` with no candidates left), not "connecting".
- A DM message or server invite waiting for a link says "waiting to connect" under it rather than nothing.
- Keep the new `link failed: <code>` lines and add `relayed link with …X through …Y: linked` on success. Pulled logs
  (`npm run logs`) then show the whole picture.

## Phase 5: tests

**How this serves the goal:** each phase gets a test that fails without it.

- `test/node.test.ts` (strict tests, `links` option refusing direct pairs):
  1. A and C can't link directly. B is linked to A only, not yet to C. A reaches C through B, with B dialing C on
     request (Phase 1).
  2. A has 5 relaying peers, and only the 5th is linked to C. A still links with C (Phase 2: all candidates asked,
     call mates first).
  3. A relay carrying 6 pairs accepts the 7th (Phase 3).
  4. A friend unlinked but with a live presence note is in `state().online` (Phase 4).
- `test/callstate.test.ts` or the call panel: the "Can't connect to you" state after relay attempts are over.
- Smoke: the relayed mode already proves Ann and Bob talk through Cy. Add one step where Cy starts unlinked from
  Bob and still relays when Ann asks (Phase 1 end to end).

## Phase 6: verify

**How this serves the goal:** proof in the field, not only on the local test network.

- `npm run typecheck`, `npm test`, then the three smoke modes one after another.
- After the release: run `npm run logs` while the same group is in a call. The issue should show
  `relayed link … linked` lines where the 0.1.3 logs showed `no contact could relay`, and no member left on
  "connecting".

## Not now

- A relay server we run: it would end "no central server", and only matters if no member at all can reach someone.
- Video through relays: the relayed links stay voice only, as each pair is capped at 24 KB/s.
- Forwarding call signals hop by hop without a link: a relayed link already carries them, so it's not needed.

## Risks

- Phase 1 makes relayers dial people they weren't linked with. That's bounded by the 10 asks a minute and 4 dials in
  flight, and only for people they already know (`known`).
- More relayed pairs spend members' bandwidth. That's capped per pair and still only voice. Members can turn relaying
  off in Settings.
- Older copies refuse relays as today. A mixed group works as well as it does now, then better as people update.
