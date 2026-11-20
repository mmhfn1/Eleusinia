import { type Weave, cleanWeave } from './mark'
import type { ServerBanner } from './server'
import { type Activity, type ActivitySettings, type Showcase, cleanShowcase } from './activity'
import type { Action, Bindings } from './hotkeys'
import type { LinkPreview } from './links'
import type { FileRef } from './media'

export type Key = string // 64 hex chars: ed25519 public key, also the friend code
export type FriendStatus = 'friend' | 'outgoing' | 'incoming'
export type Add = { by: Key; sig: string } // proof that `by` added a member to a group
// adds: for every member but the owner, the signed proof of who added them (shared/sync.ts checks the chain).
// left: members who left, each with their own signature. removed: members the owner removed, signed by the owner.
// owner: who created it; nonce: with the owner, what the id is derived from, so no one else can claim it (groups from
// before owners have neither, and their owner is found once from the copy stored here).
// edit: the member's signature over the name, picture and updatedAt. avatar: a small image data URL like a profile's.
export type Group = {
  id: string
  name: string
  members: Key[]
  updatedAt: number
  adds?: Record<Key, Add>
  left?: Record<Key, string>
  removed?: Record<Key, string>
  owner?: Key
  nonce?: string
  edit?: Add
  avatar?: string
}
// files: shared files, referenced by hash (shared/media.ts); text may then be empty.
// link: a preview of a link in the text, signed apart (lsig) so copies from before previews still verify the message.
export type Msg = { conv: string; author: Key; seq: number; ts: number; text: string; files?: FileRef[]; link?: LinkPreview; lsig?: string; sig: string }
export type Have = Record<Key, number> // highest seq held, per author
// handle: the unique-ish ID friends type, username#1234. avatar: small image data URL, or ''.
// banner: what their banner shows: a weave from their key (shared/mark.ts), their picture softened (`fade`), or a picture
// or GIF of their own (`pic`); without it, their picture softened, else their key's weave. gameArt: false keeps the
// banner while they play instead of the game's art.
export type Banner = Weave | { fade: true } | { pic: string }
// status: a line under their name, until a time (unix ms) or until cleared; quiet: no pokes reach them while it is set
export type Status = { text: string; until?: number; quiet?: true }
export type Profile = { handle: string; name: string; about: string; avatar: string; banner?: Banner; gameArt?: false; status?: Status; showcase?: Showcase }
// Device labels are kept beside the ids, since an id can change while the name stays (see devices.ts).
// volumes: how loud each person is played in calls, 0 to 1, kept between sessions.
// hotkeys: only those the user bound; none by default.
// outVolume: everything heard in calls, 0 to 2 (default 1). micGate: mic sensitivity in dB, or unset to always send.
export type Settings = {
  verified?: Key[] // people whose key we compared in person or on a call: a seal on their profile and messages
  audioKbps: number
  mic: string
  out: string
  micLabel?: string
  outLabel?: string
  volumes?: Record<Key, number>
  hotkeys?: Bindings
  cam?: string
  camLabel?: string
  outVolume?: number
  soundVolume?: number // the app's own sounds (mute, joins, ringing, push to talk), 0 to 1 on top of outVolume; default 1
  micGate?: number
  crashReports?: boolean // send crash reports to the developers automatically; on unless turned off
  shareLogs?: boolean // tester builds: answer a developer's log pull (reports.ts Pull); on unless turned off
  closeToTray?: boolean // closing the window keeps Eleusinia running in the tray; on unless turned off
  noiseSuppression?: boolean // RNNoise on the microphone; on unless turned off
  relay?: boolean // ignored since relaying is always on (strict copies excepted, node.ts applyRelay); older copies stored it
  cacheMB?: number // how much room downloaded pictures may take before the oldest are deleted (DEFAULT_CACHE_MB)
  suggest?: boolean // be suggested to people typing the start of our username (announced while online); off unless turned on
  activity?: ActivitySettings // what we are playing, shared with friends and group members (shared/activity.ts); off unless turned on
  nicknames?: Record<Key, string> // our own names for people, shown instead of theirs; never sent to anyone
  muted?: Record<string, boolean | number> // conversations whose unread count and call notices are hidden; a number is when the mute ends
  pinned?: string[] // direct conversations kept at the top of the rail's list
  closed?: Record<string, number> // direct conversations taken off the rail, and when: one comes back with a newer message
  ignored?: Key[] // people whose DM notifications are silenced (unread off the rail badge, pokes and DM rings quiet); counted in the window
  localMuted?: Key[] // people whose voice we stop playing, for us only
  noVideo?: Key[] // people whose camera and screen we stop receiving
}
// A conversation is muted for good (true) or until a time not yet reached (Settings → muted).
export const mutedNow = (st: Settings, c: string, now = Date.now()) => {
  const m = st.muted?.[c]
  return m === true || (typeof m === 'number' && m > now)
}
export const KEY_SETTINGS = ['ignored', 'localMuted', 'noVideo', 'verified'] as const
export const MAX_KEY_SETTING = 5000
// A key list setting from the window: keys only, no repeats, capped
export const isKeyList = (x: unknown): x is Key[] => Array.isArray(x) && x.length <= MAX_KEY_SETTING && x.every(isKey) && new Set(x).size === x.length

export type State = {
  me: Key
  profile: Profile
  friends: Record<Key, FriendStatus>
  profiles: Record<Key, Profile>
  online: Key[]
  groups: Record<string, Group>
  settings: Settings
  reports: number // problem and crash reports waiting to reach the developers' inbox
  versions: Record<Key, Version> // what each person we have greeted runs; memory only
  relayed: Key[] // online people whose link goes through a mutual friend's relay: voice and text only
  hostedRelayed: Key[] // online people whose link goes through one of the project's hosted relays: carries everything
  present: Key[] // group members online but not linked with us, known from their presence notes
  // People we could not link with for now: a direct dial and a round of relay asks both failed (node.ts relayFailed).
  // Shown as "can't connect" only for someone known to be online (present, or in our call); for anyone else it just
  // means offline. Tried again with a growing wait.
  unreachable: Key[]
  activity: Record<Key, Activity> // what contacts are doing now, memory only; ours as they see it, under our own key
  chats: Record<string, { unread: number; at: number }> // conversations with at least one message, server channels included: unread messages and missed calls, last activity
  blocked: Key[]
  servers: Record<string, ServerView> // servers we are in, for the window (main/servers.ts)
  // Peer forwarding (shared/fwdproto.ts): online people whose copy can forward (hello.fwd), those behind strict
  // routers (hello.nat), and the streams we forward now, by streamer, with how many people each goes to
  canForward: Key[]
  strict: Key[]
  forwarding: Record<Key, number>
  fwdServers: Record<Key, number | null> // the project's server forwarders by handshake time in ms, null: no answer
}
export type ServerPerm = string // a name from PERMS in src/shared/server.ts
// What the window gets of a server we are in. roles: index = rank, @everyone (id = server id) at 0. channels: those
// we may view (a category only with a visible child or when we may view it), or all of them with manageChannels.
// mine: our rank (the owner's is 1e9), server-wide permissions, and per visible channel.
export type ServerView = {
  id: string
  name: string
  avatar: string
  banner?: ServerBanner
  owner: Key
  roles: { id: string; name: string; color: number; hoist: boolean; perms: ServerPerm[] }[]
  members: Record<Key, { roles: string[]; nick?: string; joinedAt: number }>
  channels: { id: string; name: string; kind: 'text' | 'voice' | 'category'; parent?: string; topic?: string; userLimit?: number; position: number; overrides: Record<string, { allow: ServerPerm[]; deny: ServerPerm[] }> }[]
  invites: Record<string, { id: string; by: Key; expires?: number; maxUses?: number; uses: number; revoked: boolean }>
  bans: Key[]
  voice: Record<Key, { mute?: true; deafen?: true }> // server mute and deafen (voice.mute / voice.deafen ops)
  mine: { rank: number; perms: ServerPerm[]; channels: Record<string, ServerPerm[]> }
}

// How calls are set up (slot order and signals). Raised only by a change older copies cannot follow: copies on
// different call versions do not try to connect, and each says who needs to update. 0.0.1 sent none: version 1.
export const CALL_VERSION = 1
export type Version = { app: string; call: number }
// What a hello says about the sender's version, checked like everything else from another peer.
export const versionOf = (w: { app?: unknown; call?: unknown }): Version => ({
  app: typeof w.app === 'string' && /^\d+\.\d+\.\d+$/.test(w.app) ? w.app : '0.0.1 or older',
  call: Number.isInteger(w.call) && (w.call as number) > 0 && (w.call as number) < 1000 ? (w.call as number) : 1,
})

// A strict router (symmetric NAT) picks a new port per destination: two of them never hole-punch, nor relay for others
export type Nat = 'strict' | 'ok'

export type Wire =
  // friend: whether the sender counts us as a friend or has asked to be one. Group members who are not friends
  // greet each other too, so a hello alone is not a friend request. Older versions leave it out.
  // app and call: the sender's version and call version (CALL_VERSION); 0.0.1 sent neither.
  // relay: the sender's relay key, only while it relays for its contacts (never while strict); older versions never send it.
  // nat: whether the sender is behind a strict router (dht.randomized); older versions never send it.
  // via: the sender accepts links through a friend's relay (from 0.0.45; older versions only while relaying themselves).
  // fwd: 1 when the sender can forward a call mate's stream (main/forwarder.ts); older versions never send it.
  | ({ t: 'hello'; friend?: boolean; app?: string; call?: number; relay?: Key; via?: boolean; nat?: Nat; fwd?: 1 } & Profile)
  | { t: 'reach'; key: Key; ok?: boolean } // asking a contact whether it can relay us to `key`, and its answer
  | { t: 'relayed'; by: Key } // sent by whoever dialed: this link goes through `by`'s relay (a friend's identity key, or a hosted relay's key)
  | { t: 'group'; g: Group }
  | { t: 'have'; conv: string; have: Have; re?: boolean; held?: Have; tail?: boolean } // held: what the receiver already confirmed holding, which is not sent again; tail: a new member, who takes only recent history
  | { t: 'older'; conv: string; upTo: Have } // asking for messages at or below these, the newest first (a new member scrolling back)
  | { t: 'msg'; m: Msg; start?: boolean } // start: the first of a new member's shallow start for that author, past a gap on purpose
  | { t: 'call'; conv: string; data: unknown }
  | { t: 'pkt'; d: string } // a relayed call packet too big for a datagram, base64
  | { t: 'gone' } // the sender deleted their account
  | { t: 'probe'; id: number; d?: string; end?: boolean } // filler for measuring the sender's upload speed
  | { t: 'probed'; id: number } // all of that probe arrived
  | { t: 'report'; r: unknown } // a problem or crash report, only ever sent to the developers' inbox (shared/reports.ts)
  | { t: 'reportAck'; id: string } // the inbox holds that report; the sender deletes its copy
  | { t: 'get'; h: string; off: number } // a piece of a shared file, from offset `off` (see main/files.ts)
  | { t: 'part'; h: string; off: number; d: string } // that piece, base64
  | { t: 'nope'; h: string } // the sender does not have that file, or not for us
  | { t: 'activity'; a: unknown } // what the sender is doing (shared/activity.ts), checked by cleanActivity
  | { t: 'presence'; p: unknown } // someone's signed "I am online" note, passed along between group members (sync.ts)
  | { t: 'sops'; server: string; have: Have; re?: boolean } // a server's ops we hold, per author (main/servers.ts); re: a reply or receipt, not an ask
  | { t: 'sop'; op: unknown } // one signed server op (shared/server.ts)
  // Joining a server by invite link (shared/invite.ts): a stranger's ask to a member, and the member's answer
  | { t: 'joinAsk'; server: string; invite: string; key: Key; proof: string; profile?: Profile }
  | { t: 'joinOk'; server: string }
  | { t: 'joinNo'; server: string; why: string }
  | { t: 'poke'; server: string; channel: string } // a member asks us to join that voice channel's call; never logged
  // An invite card for a link: asked of a linked contact named in it, with the join proof, so only link holders learn it
  | { t: 'inviteInfo'; server: string; invite: string; key: Key; proof: string }
  | { t: 'inviteCard'; server: string; card: unknown }
  | ({ t: 'fwd' } & Record<string, unknown>) // peer forwarding signalling, checked by cleanFwd (shared/fwdproto.ts)

export type Event =
  | { type: 'state'; state: State }
  | { type: 'msg'; m: Msg }
  | { type: 'acked'; conv: string; seq: number }
  | { type: 'call'; from: Key; conv: string; data: any }
  | { type: 'fwd'; from: Key; data: import('./fwdproto').Fwd } // forwarding signals for the window: streamer or viewer
  | { type: 'hotkey'; action: Action; down: boolean } // from the main process's system-wide key hook
  | { type: 'update'; version: string } // a newer version has downloaded and installs on restart
  | { type: 'window'; maximized: boolean } // the window was maximized or restored, for the title bar's button
  | { type: 'file'; file: FileState }
  | { type: 'poke'; from: Key; server: string; channel: string } // a checked poke (Wire 'poke'), memory only
  // A voice.move or voice.disconnect aimed at us, accepted while we run (never from old history replayed at start)
  | { type: 'voiceOrder'; server: string; kind: 'move' | 'disconnect'; channel?: string; by: Key }
  // Startup checks for the splash (shared/startup.ts), at most every 200 ms until ready or given up
  | { type: 'startup'; steps: StartupStep[]; ready: boolean; gaveUp: boolean; pending: string[] }
export type StartupStep = { id: 'account' | 'network' | 'updates' | 'links' | 'presence' | 'catchup' | 'memory'; label: string; detail: string; done: boolean }

export const MAX_TEXT = 4000

// Where a shared file stands on this computer. got: bytes held so far. saved: where the user saved it, if they did.
export type FileState = { h: string; state: 'none' | 'waiting' | 'loading' | 'done' | 'failed'; got: number; size: number; saved?: string; why?: string }
export const isKey = (s: unknown): s is Key => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s)
export const isGroupId = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f]{32}$/.test(s)
export const dmId = (a: Key, b: Key) => [a, b].sort().join('_')

// Profiles arrive from other people, so every field is checked and capped before it is stored or shown.
// A small picture as a data URL: JPEG, PNG or WebP only (never SVG, which can carry scripts), and capped in size.
export const isPicture = (v: unknown): v is string => typeof v === 'string' && v.length <= 60000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v)
// A profile's own picture or banner, GIFs included. Small enough that a greeting carrying both stays under the wire's
// 1 MiB line (network.ts MAX_LINE).
export const MAX_MEDIA = 400_000
export const isMedia = (v: unknown): v is string => typeof v === 'string' && v.length <= MAX_MEDIA && /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v)
// Their status while it lasts: one past its time is shown as none
export const statusOf = (p: Pick<Profile, 'status'> | undefined, now = Date.now()) => (p?.status && (!p.status.until || p.status.until > now) ? p.status : undefined)
export function cleanBanner(v: any): Banner | undefined {
  if (v?.fade === true) return { fade: true }
  if (isMedia(v?.pic)) return { pic: v.pic }
  return cleanWeave(v)
}
export function cleanProfile(p: any): Profile {
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  const ok = isMedia(p?.avatar)
  const banner = cleanBanner(p?.banner)
  const showcase = cleanShowcase(p?.showcase)
  const st = p?.status
  const text = typeof st?.text === 'string' ? st.text.trim().slice(0, 60) : ''
  const status: Status | undefined = text ? { text, ...(Number.isSafeInteger(st.until) && st.until > 0 && { until: st.until }), ...(st.quiet === true && { quiet: true as const }) } : undefined
  return { handle: isHandle(p?.handle) ? p.handle : '', name: str(p?.name, 40), about: str(p?.about, 200), avatar: ok ? p.avatar : '', ...(banner && { banner }), ...(p?.gameArt === false && { gameArt: false as const }), ...(status && { status }), ...(showcase && { showcase }) }
}

export const isUsername = (s: unknown): s is string => typeof s === 'string' && /^[a-z0-9_.]{2,20}$/.test(s)
export const isHandle = (s: unknown): s is string => typeof s === 'string' && /^[a-z0-9_.]{2,20}#\d{4}$/.test(s)
// What someone typed, forgiving case and stray spaces.
export const normHandle = (s: string) => s.toLowerCase().replace(/\s+/g, '')

// Shown next to a person so two people with the same friend ID can be told apart. Public key only.
export const keyTail = (key: Key) => key.slice(-6).toUpperCase()

// Messages in time order, with a run of messages from one person (each within 5 minutes of the last)
// stacked under a single name and picture. Equal times keep arrival order.
export function stack(msgs: Msg[]) {
  const sorted = [...msgs].sort((a, b) => a.ts - b.ts)
  return sorted.map((m, i) => {
    const prev = sorted[i - 1]
    return { m, first: !prev || prev.author !== m.author || m.ts - prev.ts > 5 * 60000 }
  })
}
