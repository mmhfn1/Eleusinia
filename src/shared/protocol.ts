export type Key = string // 64 hex chars: ed25519 public key, also the friend code
export type FriendStatus = 'friend' | 'outgoing' | 'incoming'
export type Add = { by: Key; sig: string } // proof that `by` added a member to a group
export type Group = { id: string; name: string; members: Key[]; updatedAt: number; adds?: Record<Key, Add> }
export type Msg = { conv: string; author: Key; seq: number; ts: number; text: string; sig: string }
export type Have = Record<Key, number> // highest seq held, per author
// handle: the unique-ish ID friends type, username#1234. avatar: small image data URL, or ''.
export type Profile = { handle: string; name: string; about: string; avatar: string }
export type Settings = { audioKbps: number; mic: string; out: string }

export type State = {
  me: Key
  profile: Profile
  friends: Record<Key, FriendStatus>
  profiles: Record<Key, Profile>
  online: Key[]
  groups: Record<string, Group>
  settings: Settings
}

export type Wire =
  | ({ t: 'hello' } & Profile)
  | { t: 'who' } // a stranger asking for our profile, to show it in friend search
  | ({ t: 'card' } & Profile)
  | { t: 'group'; g: Group }
  | { t: 'have'; conv: string; have: Have; re?: boolean }
  | { t: 'msg'; m: Msg }
  | { t: 'call'; conv: string; data: unknown }

export type Event =
  | { type: 'state'; state: State }
  | { type: 'msg'; m: Msg }
  | { type: 'acked'; conv: string; seq: number }
  | { type: 'call'; from: Key; conv: string; data: any }

export const MAX_TEXT = 4000
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
export const keyTail = (key: Key) => '…' + key.slice(-6).toUpperCase()
