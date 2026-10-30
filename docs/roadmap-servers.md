# Eleusinia servers: Discord-style communities, peer to peer

Status: planned, not started.

## Context

Eleusinia has friends, direct messages and groups (one chat plus one call, up to 100 members, everyone equal). This
plan adds Discord-style **servers**:
- several text and voice channels;
- custom-named roles with assignable privileges (owner, admins, regular members and so on);
- channels that can be limited to certain roles;
- everything else that makes a Discord server work.

The hard part is that there is no server. Nobody sits in the middle to enforce who may do what, so every member's app
has to reach the same answer on its own.

Decisions made:
- **Groups stay**, as Discord-style group DMs. Servers are a new thing beside them.
- **Up to ~200 members** per server.
- **Role-limited channels are end-to-end encrypted**: only members allowed in can read them.
- **People join with invite links**, which can expire or be single-use. Friendship is not needed.

## The core idea: a server is a signed history of changes

A server is not a document that gets overwritten (as groups are today, by `mergeGroup` in `src/shared/sync.ts`). It is
an **append-only log of signed operations**:
- create the server;
- add a role, rename it, change its permissions;
- give someone a role;
- create a channel or limit it to roles;
- make an invite, join with one;
- kick, ban;
- and so on.

Each member's app replays the log **in one agreed order** (a counter each change carries, then the author's key as a
tie-break, as elsewhere in the app). It accepts each change only if its author had the permission at that point in the
replay.

Everyone with the same changes therefore ends up with the same server, whatever order the changes arrived in. Nobody
can grant themselves powers: a change without permission is simply ignored by every member. The log is also the
**audit log**, for free.

This reuses what already works:
- **Storage and sync:** the log syncs exactly like a conversation's messages, with per-author sequence numbers, no
  gaps, `have`/`missing` and gossip between members (`node.ts`, `sync.ts`).
- **Signing:** like `signMsg`/`verifyMsg` and the signed group adds and leaves (`signAdd`, `signLeft`).
- **Text channels:** each is its own message log, like a group's chat today.
- **Voice channels:** each is a call, using `call.ts` as it is with the channel as the conversation. That includes the
  sounds, the Oculus and the recovery work.

### Permissions (a Discord-like set)

The owner is above everything. **Administrator** grants every permission. The rest are:

| Area | Permissions |
|---|---|
| Server | Manage server (name, picture), Manage roles, Manage channels, Create invites, View audit log |
| Members | Kick, Ban, Change own nickname, Manage nicknames |
| Text | View channel, Send messages, Manage messages (delete others'), Mention everyone |
| Voice | Connect, Speak, Mute and deafen others, Move members |

Roles have:
- a custom name, a colour, and an option to show members separately in the member list;
- an order. You can only manage roles below your own highest role, as on Discord, so an admin cannot demote the owner
  or another admin above them.

Every server starts with an **@everyone** role (the default permissions) and the **owner**. Each channel can override
permissions per role: allow, deny, or as the role says. That is how a channel is limited: deny View channel to
@everyone, allow it to the chosen roles.

### Role-limited channels, end to end encrypted

- Each limited channel has a **channel key**. Messages in it are encrypted with that key before they leave the sender.
  Members who are not allowed may pass messages along but cannot read them.
- The key is shared by encrypting it for each allowed member's own key. The author of the change that alters who has
  access publishes a new key in the log.
- When someone gains access, an allowed member who is online grants them the current key and earlier ones, so they can
  read the history.
- When someone loses access, the key is replaced, so they cannot read anything new.

Encryption uses sodium's sealed boxes, from `sodium-universal`, which is already installed with hyperdht. No new
dependency.

### Joining, membership and bans

- **Invites:** a member with Create invites adds an invite to the log. The log holds only a fingerprint of the invite's
  secret, its expiry and its use limit.
- **Joining:**
  - The invite link carries the server, someone to contact and the secret.
  - The new member reaches any online member, proves the secret and signs a join.
  - Every app checks the join against the invite: not expired, not over its uses, not banned.
- **Kick and ban:** these are log entries too. Members stop syncing with, and refuse links from, someone who was kicked
  or banned, and the keys of limited channels are replaced.
  - A banned person keeps what they already had on their computer, which nothing can take back.
  - They cannot read anything new, and their changes are ignored from then on.

### ~200 members without a server

- **Links:**
  - Today, every group member links to every other one. That is fine at 10, not at 200.
  - A server member keeps links to friends, to people in the same voice channel, and to a handful of other members,
    about 8, chosen to cover the server.
  - Messages, log entries and presence pass along those links (gossip), as group messages already do.
- **Finding members online:** a DHT topic per server, as friend search uses topics today.
- **Presence:** small signed "online" notes passed along the gossip links, which expire after a few minutes. This
  replaces needing a link to everyone.
- **Voice channels** stay full-mesh calls. The existing soft cap and quality logic apply (comfortable up to ~15 people
  per channel; voice still works well beyond that). Each channel can have a user limit.

## UI (Ink and fog, familiar to Discord users)

- **Rail:** servers, with their pictures, below Home, then groups, then **+** with **Create a server** or **Join with an
  invite**.
- **Server view:**
  - **Left:** the server's name with a menu: invite people, server settings, create a channel, leave.
  - **Then the channels:** grouped in categories you can fold, text first, then voice. A lock marks limited channels.
    Voice channels show who is in them, with speaking rings.
  - **Middle:** the chat, with the existing composer, files and so on, and the channel topic in the header.
  - **Right:** members grouped by shown roles, in role colours, online first.
- **Server settings:** Overview (name and picture); Roles (create and rename, colour, permission switches, drag to
  reorder); Members (assign roles, nickname, kick, ban); Channels (name, topic, user limit, access per role); Invites
  (list and revoke, with expiry and use options); Bans (unban); Audit log (who changed what, and when, read from the log).
- **Right-click a member:** profile, give or remove roles, server mute or deafen and move in voice, kick, ban. Only the
  items you have permission for show.

## Phases

1. **Foundation** (largest): the log and its replay, with the permission engine, as pure, heavily unit-tested logic in
   a new `src/shared/server.ts`; storage and sync in `node.ts`; create a server; invites and joining; text channels and
   categories; roles, permissions and assigning them; the server view and basic settings.
2. **Voice and moderation:** voice channels and their member lists; user limits; kick and ban, with refusing banned
   members; server mute, deafen and move (honoured by every member's app; the person's own app can still choose to
   ignore them); the member list by role; gossip presence and the bounded links for ~200.
3. **Limited channels:** channel keys, end-to-end encryption, key replacement and grants, history for new members.
4. **The rest of what makes it Discord:** nicknames, role colours and @role and @everyone mentions, unread markers and
   per-channel notification settings, pinned messages, moderators deleting messages, slow mode, the audit log view,
   transferring ownership, a default channel for new members.

**Later, not in this scope:** threads, reactions, custom emoji, events, stage channels, AFK channels, bots and webhooks,
server discovery. **Message edits** and **reactions** are missing in groups too; they fit the same log design and could
come with phase 4.

## What a server without a server cannot do (said plainly in the UI and README)

- **Changes reach people as they come online,** not instantly for everyone. Until they sync, two members can briefly see
  different roles.
- **A demoted admin's changes made at the same moment as the demotion are decided by the agreed order.** Everyone ends
  up the same, but a change made just before the demotion reached them can stand. The owner can undo anything through
  the log.
- **Bans cannot erase what someone already has on their computer.** They only stop anything new.
- **If every member is offline, the server waits.** It lives only on members' computers. The owner leaving does not end
  it, since ownership can be transferred and the log stays with everyone.

## Files

New: `src/shared/server.ts` (operation types, signing, the replay and the permission engine),
`src/shared/channelkeys.ts` (phase 3), `src/renderer/Server.tsx`, `src/renderer/ServerSettings.tsx`.

Changed: `src/main/node.ts` (storing and syncing server logs, channel logs, invites and joining, links and presence),
`src/main/network.ts` (the server topic), `src/shared/protocol.ts` (new wire messages and state),
`src/renderer/App.tsx` (the rail and routing), `src/renderer/call.ts` (voice channel access and moderation signals),
`README.md`, `CLAUDE.md`.

Copies that are not updated never see servers, but keep working for everything else. Servers need everyone on the new
version, which the startup update ensures. `CALL_VERSION` changes only if voice channel moderation changes how calls
signal.

## Verification

- Unit tests for `src/shared/server.ts`: the same set of changes, shuffled many ways, always replays to the same server;
  changes without permission are ignored; the role order is respected; invite expiry and use limits hold; banned members
  are refused; the demotion race resolves the same way everywhere.
- Channel keys: only allowed members can open messages; replaced keys lock out removed members; grants give history.
- Node tests on the local test DHT, with 4 to 6 nodes: create a server, invite, join; limit a channel, and check that a
  member without the role cannot read it; kick and ban; a member offline during changes catches up and ends up with the
  same server.
- Smoke run: a new server section that creates a server, adds a role and a limited channel, joins through an invite
  link, checks who sees which channels, and holds a voice channel call. All three existing smoke modes stay green.
