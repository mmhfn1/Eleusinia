// Small pieces every screen shares: the IPC bridge, how people are named, and the types passed between screens.
import { type ReactNode } from 'react'
import { type Group, type Key, type Profile } from '../shared/protocol'

export const api = window.api
export const NOBODY: Profile = { handle: '', name: '', about: '', avatar: '' }
// Right-clicking a person opens their profile beside them instead of the browser's menu.
export const card = (show: People['show'], k: Key) => (e: { preventDefault: () => void; currentTarget: EventTarget }) => {
  e.preventDefault()
  show(k, e.currentTarget as HTMLElement)
}
export const labelOf = (p: Profile, k: Key) => p.name || p.handle || k.slice(0, 8)
export const groupName = (g: Group) => g.name || 'Unnamed group'

export type Run = (p: Promise<unknown>) => Promise<void>
// What every screen needs to show people: their profile, their name, and their name as a button opening their card.
// show opens a person's profile: beside `from` (what was clicked) as a small panel, or without it as the full card.
export type People = { prof: (k: Key) => Profile; name: (k: Key) => string; user: (k: Key) => ReactNode; isOnline: (k: Key) => boolean; show: (k: Key, from?: HTMLElement) => void }
export type Modal = { kind: 'card'; k: Key } | { kind: 'pop'; k: Key; from: HTMLElement } | { kind: 'settings' } | { kind: 'group' } | { kind: 'server' } | { kind: 'join' } | { kind: 'delete' } | { kind: 'menu' } | { kind: 'report' } | null
