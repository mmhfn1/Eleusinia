// Who is online among the group members we are not linked with (no Electron imports, like node.ts). In a big group
// each member links with only a few others (node.ts `linkPick`), so everyone sends a signed "online" note
// (shared/sync.ts Presence) every minute and whenever they join or leave a group call, and members pass each note on.
// A note is kept 3 minutes. It also carries the author's call, which the page hears as their join or leave, and
// their profile version, so a new name or picture is fetched from their card.
import { type Event, type Key, type Profile, type Wire } from '../shared/protocol'
import { type Presence, profileVersion, signPresence, verifyPresence } from '../shared/sync'

export const PRESENCE_TTL = 3 * 60000

type Opts = {
  keyPair: { publicKey: Buffer; secretKey: Buffer }
  net: { keys(): Key[]; linked(k: Key): boolean; send(k: Key, w: Wire): void }
  emit: (e: Event) => void
  few: (ks: Key[], n: number) => Key[]
  tell: (id: string, text: string) => void
  ownProfile: () => Profile
  around: (k: Key) => Set<Key> // members of our groups that `k` is in
  inCall: (conv: string, k: Key) => boolean // `k` is a member of that conversation
  accepts: (k: Key) => boolean // a group mate we have not blocked
  version: (k: Key) => string | undefined // the profile version we hold of them
  // Their card fetched again: 'stored' when it was new, 'same' when it was the copy we have (not yet updated on the
  // DHT), 'skip' when it no longer matters (no card, linked, not a contact)
  card: (k: Key, v: string) => Promise<'stored' | 'same' | 'skip'>
  changed: () => void
}

export function createPresence({ keyPair, net, emit, few, tell, ownProfile, around, inCall, accepts, version, card, changed }: Opts) {
  const me = keyPair.publicKey.toString('hex')
  const present = new Map<Key, Presence>()
  // When our own link with someone closes, they count as gone at once: their last note stays only so that copies of
  // it still going round cannot bring them back, and a newer note from them does.
  const gone = new Set<Key>()
  let ourCall: string | null = null

  // To linked members of the groups the author is in: that set once per note, not every link against every group
  const pass = (p: Presence, from: Key | null) => {
    const near = around(p.key)
    const to = net.keys().filter((k) => k !== from && k !== p.key && near.has(k))
    for (const k of from ? few(to, 3) : to) net.send(k, { t: 'presence', p })
  }
  const note = () => signPresence(Date.now(), ourCall, profileVersion(ownProfile()), keyPair)
  const announce = () => pass(note(), null)
  // A group reached us or gained someone: a note now, so its new members see us online without waiting up to a minute.
  // At most one in 2 s, as a burst of changes would otherwise send a burst of notes.
  let soon: ReturnType<typeof setTimeout> | null = null
  const announceSoon = () => void (soon ??= setTimeout(() => ((soon = null), announce()), 2000))

  // Someone not linked with us moved between group calls: the page hears it as their join or leave signal, and from
  // there links up with them as with anyone in its call.
  function callMoved(k: Key, from: string | null, to: string | null) {
    if (from === to) return
    if (from && inCall(from, k)) emit({ type: 'call', from: k, conv: from, data: { k: 'leave' } })
    if (to && inCall(to, k)) emit({ type: 'call', from: k, conv: to, data: { k: 'join' } })
  }

  // Their card again when their profile version differs from ours. A new version is fetched at most every 10 s per
  // person (a later one waits for that, once), the same one again only after 5 minutes; an unchanged card (the new one
  // not yet out on the DHT) is tried again in 10 s, three times.
  type Refresh = { at: number; v: string; tries: number; later?: ReturnType<typeof setTimeout> }
  const refreshed = new Map<Key, Refresh>()
  function refresh(k: Key, v: string) {
    const r = refreshed.get(k)
    const wait = !r ? 0 : r.v === v ? r.at + 300000 - Date.now() : r.at + 10000 - Date.now()
    if (wait > 0) {
      if (r && r.v !== v && !r.later) r.later = setTimeout(() => ((r.later = undefined), refresh(k, v)), wait)
      return
    }
    const entry: Refresh = { at: Date.now(), v, tries: r?.v === '' ? r.tries : 0 }
    refreshed.set(k, entry)
    tell(`card:${k}`, `…${k.slice(-6)} has a new profile; fetching their card`)
    card(k, v).then((got) => {
      tell(`card:${k}`, `…${k.slice(-6)}'s card: ${got === 'stored' ? 'new' : got === 'same' ? 'not new yet' : 'not needed'}`)
      if (got !== 'same' || ++entry.tries > 3) return
      entry.v = ''
      entry.later ??= setTimeout(() => ((entry.later = undefined), refresh(k, v)), 10000)
    })
  }

  return {
    note,
    announce,
    announceSoon,
    // Our own group call, told in our note so members not linked with us see it too. Never a direct call.
    inGroupCall(conv: string | null) {
      ourCall = conv
      announce()
    },
    receive(from: Key, p: unknown) {
      if (!verifyPresence(p) || p.key === me || p.at <= Date.now() - PRESENCE_TTL || !accepts(p.key)) return
      const was = present.get(p.key)
      // Newer only: at most every 20 s, every 10 s when their profile changed, every second when their call did. Each
      // note is passed on by everyone, so these limits are what keeps one member from flooding all the others.
      if (was && p.at < was.at + (p.call !== was.call ? 1000 : p.v !== was.v ? 10000 : 20000)) return
      const before = was && !gone.has(p.key) && was.at > Date.now() - PRESENCE_TTL ? was.call : null
      present.set(p.key, p)
      gone.delete(p.key)
      pass(p, from)
      // A newer note's call always counts, linked or not: a linked person's join signal may never come (their link to
      // a restarted copy is replaced, not closed, so they never see it go offline), and a copy passed on by someone
      // else may be stale (it was rate-limited there). A repeated join is harmless.
      callMoved(p.key, before, p.call)
      if (!net.linked(p.key) && version(p.key) !== p.v) refresh(p.key, p.v)
      changed()
    },
    closed: (k: Key) => void (present.has(k) && gone.add(k)),
    expire() {
      for (const [k, p] of present) {
        if (p.at > Date.now() - PRESENCE_TTL) continue
        present.delete(k)
        if (gone.delete(k)) continue
        if (!net.linked(k)) callMoved(k, p.call, null)
        changed()
      }
    },
    // Ours and the live notes we hold of members `k` shares a group or server with, sent when a link opens, so a freshly
    // started copy learns who is online and in which call from its first link instead of over the next minute
    snapshot(k: Key): Presence[] {
      const near = around(k)
      const live = [...present.values()].filter((p) => p.key !== k && near.has(p.key) && !gone.has(p.key) && p.at > Date.now() - PRESENCE_TTL)
      return [note(), ...live.slice(0, 200)]
    },
    // Who is in which call by their live notes (linked or not)
    calls: () => [...present.values()].filter((p) => p.call && !gone.has(p.key) && p.at > Date.now() - PRESENCE_TTL).map((p) => [p.key, p.call!] as const),
    // Online by note, not linked with us
    online: () => [...present.values()].filter((p) => p.at > Date.now() - PRESENCE_TTL && !gone.has(p.key) && !net.linked(p.key)).map((p) => p.key),
    forget(k: Key) {
      clearTimeout(refreshed.get(k)?.later)
      refreshed.delete(k)
    },
    destroy() {
      refreshed.forEach((r) => clearTimeout(r.later))
      if (soon) clearTimeout(soon)
    },
  }
}
