import { createHash, randomBytes, randomInt } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  type Event,
  type FriendStatus,
  type Group,
  type Have,
  type Key,
  type Msg,
  type Profile,
  type Settings,
  type State,
  type Wire,
  MAX_TEXT,
  cleanProfile,
  dmId,
  isHandle,
  isKey,
  isUsername,
  normHandle,
} from '../shared/protocol'
import { mergeGroup, missing, signAdd, signMsg, validGroup, verifyAdd, verifyMsg } from '../shared/sync'
import { createNet } from './network'

type Saved = {
  profile: Profile
  friends: Record<Key, FriendStatus>
  profiles: Record<Key, Profile>
  groups: Record<string, Group>
  acked: Record<string, number> // per conversation: my highest seq some peer has confirmed holding
  settings: Settings
}

type Opts = {
  dir: string
  keyPair: { publicKey: Buffer; secretKey: Buffer }
  emit: (e: Event) => void
  dht?: object
  redialMs?: number
}

// Everything except the window: friends, groups, message logs and their sync. No Electron imports, so tests can run it.
export function createNode({ dir, keyPair, emit, dht, redialMs = 15000 }: Opts) {
  const me: Key = keyPair.publicKey.toString('hex')
  const file = join(dir, 'state.json')
  mkdirSync(join(dir, 'msgs'), { recursive: true })
  const s: Saved = {
    profile: { handle: '', name: '', about: '', avatar: '' },
    friends: {},
    profiles: {},
    groups: {},
    acked: {},
    settings: { audioKbps: 32, mic: '', out: '' },
    ...(existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}),
  }
  const save = () => {
    writeFileSync(file + '.tmp', JSON.stringify(s))
    renameSync(file + '.tmp', file) // atomic, so a crash mid-write cannot corrupt the state
  }

  const inGroupWith = (key: Key) => Object.values(s.groups).some((g) => g.members.includes(key))
  const known = (key: Key) => s.friends[key] === 'friend' || inGroupWith(key)
  const wants = (key: Key) => known(key) || s.friends[key] === 'outgoing'

  // Members of a conversation; empty means it is not a conversation we take part in.
  function members(conv: unknown): Key[] {
    if (typeof conv !== 'string') return []
    if (Object.hasOwn(s.groups, conv)) return s.groups[conv].members
    const [a, b] = conv.split('_')
    const other = a === me ? b : a
    return isKey(other) && conv === dmId(me, other) && s.friends[other] === 'friend' ? [me, other] : []
  }

  const state = (): State => ({
    me,
    profile: s.profile,
    friends: s.friends,
    profiles: s.profiles,
    online: net.keys().filter(known),
    groups: s.groups,
    settings: s.settings,
  })
  const push = () => emit({ type: 'state', state: state() })
  const changed = () => {
    save()
    push()
  }

  const logs = new Map<string, { msgs: Msg[]; have: Have }>()
  const logFile = (conv: string) => join(dir, 'msgs', conv + '.jsonl')
  // Callers must pass a conv that members() accepted: it becomes a file name.
  function log(conv: string) {
    let l = logs.get(conv)
    if (l) return l
    l = { msgs: [], have: {} }
    if (existsSync(logFile(conv))) {
      for (const line of readFileSync(logFile(conv), 'utf8').split('\n')) {
        try {
          const m: Msg = JSON.parse(line)
          l.msgs.push(m)
          l.have[m.author] = m.seq
        } catch {} // blank or torn last line
      }
    }
    logs.set(conv, l)
    return l
  }
  function append(m: Msg) {
    const l = log(m.conv)
    l.msgs.push(m)
    l.have[m.author] = m.seq
    appendFileSync(logFile(m.conv), JSON.stringify(m) + '\n')
    emit({ type: 'msg', m })
  }

  const hi = (key: Key) => net.send(key, { t: 'hello', ...s.profile })
  const sendHave = (key: Key, conv: string, re?: boolean) =>
    net.send(key, { t: 'have', conv, have: log(conv).have, re })

  function greet(key: Key) {
    const shared = Object.values(s.groups).filter((g) => g.members.includes(key))
    // Group docs go first: they are how a member who is not our friend learns who we are.
    for (const g of shared) net.send(key, { t: 'group', g })
    hi(key)
    if (s.friends[key] === 'friend') sendHave(key, dmId(me, key))
    for (const g of shared) sendHave(key, g.id)
  }
  function reach(key: Key) {
    if (!net.linked(key)) return net.dial(key)
    greet(key)
  }
  const spread = (g: Group) => g.members.forEach((m) => m !== me && reach(m))

  // Strangers we asked for a profile card during friend search. Only their answer is accepted.
  const asked = new Map<Key, (p: Profile) => void>()
  function card(key: Key, handle: string) {
    if (known(key) && s.profiles[key]) return Promise.resolve({ ...s.profiles[key], handle })
    return new Promise<Profile>((resolve) => {
      const done = (p: Profile) => {
        clearTimeout(timer)
        asked.delete(key)
        if (!wants(key) && s.friends[key] !== 'incoming') net.drop(key)
        resolve({ ...p, handle })
      }
      // No answer still lists the person, with the picture generated from their key.
      const timer = setTimeout(() => done(cleanProfile(null)), 5000)
      asked.set(key, done)
      if (net.linked(key)) net.send(key, { t: 'who' })
      else net.dial(key)
    })
  }

  function onMsg(key: Key, w: Wire) {
    if (w.t === 'who') return net.send(key, { t: 'card', ...s.profile })
    if (w.t === 'card') return asked.get(key)?.(cleanProfile(w))
    if (w.t === 'hello') {
      if (typeof w.name !== 'string') return
      const st = s.friends[key]
      if (st === 'outgoing') {
        s.friends[key] = 'friend'
        greet(key)
      } else if (!st && !known(key)) {
        if (Object.values(s.friends).filter((f) => f === 'incoming').length >= 50) return
        s.friends[key] = 'incoming'
      }
      s.profiles[key] = cleanProfile(w)
      return changed()
    }
    if (w.t === 'group') {
      const g = w.g
      if (!validGroup(g) || !g.members.includes(key) || !g.members.includes(me)) return
      // A member we have never met may hand us the group, but only with proof that one of our friends added us.
      const add = g.adds?.[me]
      if (!known(key) && !(add && s.friends[add.by] === 'friend' && verifyAdd(g.id, me, add))) return
      const merged = mergeGroup(s.groups[g.id], g)
      if (JSON.stringify(merged) === JSON.stringify(s.groups[g.id])) return
      s.groups[g.id] = merged
      changed()
      return spread(merged)
    }
    if (!known(key)) return

    if (w.t === 'have') {
      if (!members(w.conv).includes(key) || !w.have || typeof w.have !== 'object') return
      const l = log(w.conv)
      for (const m of missing(l.msgs, w.have)) net.send(key, { t: 'msg', m })
      if (!w.re) sendHave(key, w.conv, true)
      const seq = Math.min(Number(w.have[me]) || 0, l.have[me] ?? 0)
      if (seq > (s.acked[w.conv] ?? 0)) {
        s.acked[w.conv] = seq
        save()
        emit({ type: 'acked', conv: w.conv, seq })
      }
    } else if (w.t === 'msg') {
      const m = w.m
      const ms = members(m?.conv)
      if (!ms.includes(key) || !ms.includes(m.author)) return
      const next = (log(m.conv).have[m.author] ?? 0) + 1
      if (m.seq < next) return // already have it
      if (m.seq > next) return sendHave(key, m.conv, true) // gap: ask for what we lack
      if (!verifyMsg(m)) return
      append(m)
      sendHave(key, m.conv, true) // delivery receipt
      for (const k of ms) if (k !== me && k !== key && k !== m.author) net.send(k, { t: 'msg', m })
    } else if (w.t === 'call') {
      if (members(w.conv).includes(key)) emit({ type: 'call', from: key, conv: w.conv, data: w.data })
    }
  }

  const net = createNet(
    keyPair,
    {
      open(key) {
        if (wants(key)) greet(key)
        if (asked.has(key)) net.send(key, { t: 'who' })
        push()
      },
      close: push,
      msg: onMsg,
    },
    dht,
  )

  const redial = () => {
    const keys = new Set(Object.values(s.groups).flatMap((g) => g.members))
    for (const [k, st] of Object.entries(s.friends)) if (st !== 'incoming') keys.add(k)
    keys.delete(me)
    for (const k of keys) net.dial(k)
  }
  redial()
  const timer = setInterval(redial, redialMs)

  const topic = (id: string) => createHash('sha256').update('eleusinia:' + id).digest()
  const announce = () => (s.profile.handle ? net.announce(topic(s.profile.handle)) : Promise.resolve())
  const ready = announce()
  const announcer = setInterval(announce, 5 * 60000)

  return {
    state,
    ready,
    // The first call also takes a username and fixes the handle for good; later calls cannot change it.
    async setProfile(p: Partial<Profile> & { username?: string }) {
      const clean = cleanProfile({ ...p, handle: s.profile.handle })
      if (!clean.name) throw new Error('Please enter a display name')
      const fresh = !clean.handle
      if (fresh) {
        const username = normHandle(String(p.username ?? ''))
        if (!isUsername(username)) throw new Error('Usernames are 2 to 20 characters: letters, numbers, dots and underscores')
        // Re-rolled if someone online already uses that exact ID. People who are offline cannot be checked.
        for (let i = 0; i < 5; i++) {
          clean.handle = username + '#' + String(randomInt(10000)).padStart(4, '0')
          if (!(await net.lookup(topic(clean.handle))).length) break
        }
      }
      s.profile = clean
      changed()
      for (const k of net.keys()) if (wants(k)) hi(k)
      if (fresh) await announce() // so the ID can be found as soon as setup finishes
    },
    // Everyone online who holds this friend ID, with their profile. Nothing central keeps IDs unique,
    // so there can be several: the caller shows them all and the user picks one.
    async findFriend(code: string) {
      const handle = normHandle(String(code))
      if (!isHandle(handle)) throw new Error('Enter a friend ID like name#1234')
      const found = (await net.lookup(topic(handle))).filter((k) => k !== me).slice(0, 10)
      if (!found.length) {
        if (handle === s.profile.handle) throw new Error('That is your own ID')
        throw new Error('Nobody with that ID is online right now. Ask them to open the app, then try again.')
      }
      return Promise.all(found.map(async (key) => ({ key, profile: await card(key, handle) })))
    },
    // Sends a friend request to one exact person, or accepts theirs. `profile` labels the pending request.
    addFriend(key: Key, profile?: Profile) {
      if (!isKey(key) || key === me) throw new Error('That is not someone you can add')
      if (profile) s.profiles[key] ??= cleanProfile(profile)
      if (s.friends[key] === 'incoming') s.friends[key] = 'friend'
      else if (!s.friends[key]) s.friends[key] = 'outgoing'
      changed()
      reach(key)
    },
    removeFriend(key: Key) {
      delete s.friends[key]
      if (!known(key)) {
        delete s.profiles[key]
        net.drop(key)
      }
      changed()
    },
    createGroup(name: string, others: Key[]) {
      const id = randomBytes(16).toString('hex')
      const members = [...new Set(others.filter((k) => s.friends[k] === 'friend'))]
      const adds = Object.fromEntries(members.map((k) => [k, signAdd(id, k, keyPair)]))
      const g = mergeGroup(undefined, { id, name: String(name).slice(0, 100), members: [me, ...members], updatedAt: Date.now(), adds })
      s.groups[id] = g
      changed()
      spread(g)
      return g.id
    },
    addToGroup(id: string, key: Key) {
      const g = Object.hasOwn(s.groups, id) ? s.groups[id] : undefined
      if (!g || s.friends[key] !== 'friend' || g.members.includes(key)) return
      const adds = { ...g.adds, [key]: signAdd(id, key, keyPair) }
      s.groups[id] = mergeGroup(undefined, { ...g, members: [...g.members, key], updatedAt: Date.now(), adds })
      changed()
      spread(s.groups[id])
    },
    history(conv: string) {
      if (!members(conv).length) return { msgs: [], acked: 0 }
      return { msgs: log(conv).msgs, acked: s.acked[conv] ?? 0 }
    },
    // Works with nobody online: the message is logged now and synced whenever a member connects.
    send(conv: string, text: string) {
      const ms = members(conv)
      if (!ms.length || typeof text !== 'string' || !text || text.length > MAX_TEXT) throw new Error('Cannot send that')
      const m = signMsg({ conv, author: me, seq: (log(conv).have[me] ?? 0) + 1, ts: Date.now(), text }, keyPair.secretKey)
      append(m)
      for (const k of ms) if (k !== me) net.send(k, { t: 'msg', m })
    },
    signal(conv: string, to: Key | null, data: unknown) {
      for (const k of members(conv)) if (k !== me && (!to || to === k)) net.send(k, { t: 'call', conv, data })
    },
    setSettings(p: Partial<Settings>) {
      Object.assign(s.settings, p)
      changed()
    },
    async destroy() {
      clearInterval(timer)
      clearInterval(announcer)
      await net.destroy()
    },
  }
}
