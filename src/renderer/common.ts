// Small pieces every screen shares: the IPC bridge, how people are named, and the types passed between screens.
import { type ReactNode } from 'react'
import { type Group, type Key, type Profile } from '../shared/protocol'

export const api = window.api
export const NOBODY: Profile = { handle: '', name: '', about: '', avatar: '' }
// Right-clicking a person opens their profile card instead of the browser's menu.
export const card = (show: (k: Key) => void, k: Key) => (e: { preventDefault: () => void }) => {
  e.preventDefault()
  show(k)
}
export const labelOf = (p: Profile, k: Key) => p.name || p.handle || k.slice(0, 8)
export const groupName = (g: Group) => g.name || 'Unnamed group'

export type Run = (p: Promise<unknown>) => Promise<void>
// What every screen needs to show people: their profile, their name, and their name as a button opening their card.
// show opens a person's profile card, the same one wherever they are clicked.
export type People = { prof: (k: Key) => Profile; name: (k: Key) => string; user: (k: Key) => ReactNode; isOnline: (k: Key) => boolean; show: (k: Key) => void }
export type Modal = { kind: 'card'; k: Key } | { kind: 'settings' } | { kind: 'group' } | { kind: 'delete' } | { kind: 'menu' } | { kind: 'report' } | null
