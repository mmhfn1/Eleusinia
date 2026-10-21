import type { Action, Bindings } from './hotkeys'
import type { FileRef } from './media'

export type Key = string // 64 hex chars: ed25519 public key, also the friend code
export type FriendStatus = 'friend' | 'outgoing' | 'incoming'
export type Add = { by: Key; sig: string } // proof that `by` added a member to a group
// left: members who left, each with their own signature, so nobody can be removed by someone else.
export type Group = { id: string; name: string; members: Key[]; updatedAt: number; adds?: Record<Key, Add>; left?: Record<Key, string> }
// files: shared files, referenced by hash (shared/media.ts); text may then be empty.
export type Msg = { conv: string; author: Key; seq: number; ts: number; text: string; files?: FileRef[]; sig: string }
export type Have = Record<Key, number> // highest seq held, per author
// handle: the unique-ish ID friends type, username#1234. avatar: small image data URL, or ''.
export type Profile = { handle: string; name: string; about: string; avatar: string }
// Device labels are kept beside the ids, since an id can change while the name stays (see devices.ts).
// volumes: how loud each person is played in calls, 0 to 1, kept between sessions.
// hotkeys: only those the user bound; none by default.
// outVolume: everything heard in calls, 0 to 2 (default 1). micGate: mic sensitivity in dB, or unset to always send.
export type Settings = {
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
  micGate?: number
  crashReports?: boolean // send crash reports to the developers automatically; on unless turned off
  closeToTray?: boolean // closing the window keeps Eleusinia running in the tray; on unless turned off
  noiseSuppression?: boolean // RNNoise on the microphone; on unless turned off
  relay?: boolean // connect through mutual friends when no direct link works, and relay for them; off unless turned on
  cacheMB?: number // how much room downloaded pictures may take before the oldest are deleted (DEFAULT_CACHE_MB)
}

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

export type Wire =
  // friend: whether the sender counts us as a friend or has asked to be one. Group members who are not friends
  // greet each other too, so a hello alone is not a friend request. Older versions leave it out.
  // app and call: the sender's version and call version (CALL_VERSION); 0.0.1 sent neither.
  // relay: the sender's relay key, only while it relays for its contacts (Settings.relay); older versions never send it.
  | ({ t: 'hello'; friend?: boolean; app?: string; call?: number; relay?: Key } & Profile)
  | { t: 'reach'; key: Key; ok?: boolean } // asking a contact whether it can relay us to `key`, and its answer
  | { t: 'relayed'; by: Key } // sent by whoever dialed: this link goes through `by`'s relay
  | { t: 'who' } // a stranger asking for our profile, to show it in friend search
  | ({ t: 'card' } & Profile)
  | { t: 'group'; g: Group }
  | { t: 'have'; conv: string; have: Have; re?: boolean }
  | { t: 'msg'; m: Msg }
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

export type Event =
  | { type: 'state'; state: State }
  | { type: 'msg'; m: Msg }
  | { type: 'acked'; conv: string; seq: number }
  | { type: 'call'; from: Key; conv: string; data: any }
  | { type: 'hotkey'; action: Action; down: boolean } // from the main process's system-wide key hook
  | { type: 'update'; version: string } // a newer version has downloaded and installs on restart
  | { type: 'window'; maximized: boolean } // the window was maximized or restored, for the title bar's button
  | { type: 'file'; file: FileState }

export const MAX_TEXT = 4000

// Where a shared file stands on this computer. got: bytes held so far. saved: where the user saved it, if they did.
export type FileState = { h: string; state: 'none' | 'waiting' | 'loading' | 'done' | 'failed'; got: number; size: number; saved?: string; why?: string }
export const isKey = (s: unknown): s is Key => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s)
export const isGroupId = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f]{32}$/.test(s)
export const dmId = (a: Key, b: Key) => [a, b].sort().join('_')

// Profiles arrive from other people, so every field is checked and capped before it is stored or shown.
export function cleanProfile(p: any): Profile {
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  const ok = typeof p?.avatar === 'string' && p.avatar.length <= 60000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(p.avatar)
  return { handle: isHandle(p?.handle) ? p.handle : '', name: str(p?.name, 40), about: str(p?.about, 200), avatar: ok ? p.avatar : '' }
}

export const isUsername = (s: unknown): s is string => typeof s === 'string' && /^[a-z0-9_.]{2,20}$/.test(s)
export const isHandle = (s: unknown): s is string => typeof s === 'string' && /^[a-z0-9_.]{2,20}#\d{4}$/.test(s)
// What someone typed, forgiving case and stray spaces.
export const normHandle = (s: string) => s.toLowerCase().replace(/\s+/g, '')

// The picture someone has until they upload one: a colour and a mirrored 5x5 pattern taken from their public key.
export function identicon(key: Key) {
  const byte = (i: number) => parseInt(key.slice(i * 2, i * 2 + 2), 16) || 0
  const cells: boolean[] = []
  for (let row = 0; row < 5; row++) for (let col = 0; col < 5; col++) cells.push(((byte(row) >> Math.min(col, 4 - col)) & 1) === 1)
  return { hue: Math.round(((byte(5) * 256 + byte(6)) / 65536) * 360), cells }
}
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
