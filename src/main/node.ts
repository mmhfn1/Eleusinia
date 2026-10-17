import { createHash, randomBytes, randomInt } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CALL_VERSION,
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
  type Version,
  versionOf,
} from '../shared/protocol'
import { type Area, type Report, cleanReport } from '../shared/reports'
import { mergeGroup, missing, signAdd, signLeft, signMsg, validGroup, verifyAdd, verifyMsg } from '../shared/sync'
import { createNet } from './network'
import { createRelay } from './relay'

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
  noDirect?: boolean // testing: withhold ICE candidates so calls can only connect through the relay
  inbox?: Key // the developers' inbox, where problem and crash reports go
  version?: string // this app's version, told to everyone we greet
  diag?: (area: Area, text: string) => void // diagnostic events, kept in memory by the caller
}

// Conversations whose messages stay in memory; the open one and a couple being synced.
const KEEP_LOGS = 3

// Everything except the window: friends, groups, message logs and their sync. No Electron imports, so tests can run it.
export function createNode({ dir, keyPair, emit, dht, redialMs = 15000, noDirect = false, inbox, diag = () => {}, version = '0.0.0' }: Opts) {
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

  // Groups we are in. Groups we left stay stored, so the notice of leaving keeps reaching their members.
  const ours = () => Object.values(s.groups).filter((g) => g.members.includes(me))
  const inGroupWith = (key: Key) => ours().some((g) => g.members.includes(key))
  const known = (key: Key) => s.friends[key] === 'friend' || inGroupWith(key)
  const wants = (key: Key) => known(key) || s.friends[key] === 'outgoing'

  // Members of a conversation; empty means it is not a conversation we take part in.
  function members(conv: unknown): Key[] {
    if (typeof conv !== 'string') return []
    if (Object.hasOwn(s.groups, conv)) return s.groups[conv].members.includes(me) ? s.groups[conv].members : []
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
    groups: Object.fromEntries(ours().map((g) => [g.id, g])),
    settings: s.settings,
    reports: outgoing().length,
    versions: Object.fromEntries([...versions].filter(([k]) => known(k))),
  })
  const push = () => emit({ type: 'state', state: state() })
  const changed = () => {
    save()
    push()
  }

  // Message logs live on disk. Only the few most recently used conversations stay in memory, so long histories
  // cost nothing while unused; what each author has sent so far (`have`) is tiny and always kept.
  const logs = new Map<string, Msg[]>() // least recently used first
  const haves = new Map<string, Have>()
  const logFile = (conv: string) => join(dir, 'msgs', conv + '.jsonl')
  // Callers must pass a conv that members() accepted: it becomes a file name.
  function msgsOf(conv: string) {
    let msgs = logs.get(conv)
    if (msgs) logs.delete(conv)
    else {
      msgs = []
      const have: Have = {}
      if (existsSync(logFile(conv))) {
        for (const line of readFileSync(logFile(conv), 'utf8').split('\n')) {
          try {
            const m: Msg = JSON.parse(line)
            msgs.push(m)
            have[m.author] = m.seq
          } catch {} // blank or torn last line
        }
      }
      haves.set(conv, have)
    }
    logs.set(conv, msgs)
    for (const old of logs.keys()) if (logs.size > KEEP_LOGS) logs.delete(old)
    return msgs
  }
  const haveOf = (conv: string) => haves.get(conv) ?? (msgsOf(conv), haves.get(conv)!)
  function forget(conv: string) {
    logs.delete(conv)
    haves.delete(conv)
  }
  function append(m: Msg) {
    haveOf(m.conv)[m.author] = m.seq
    logs.get(m.conv)?.push(m)
    appendFileSync(logFile(m.conv), JSON.stringify(m) + '\n')
    emit({ type: 'msg', m })
  }

  // Reports for the developers wait here, on disk, until their inbox confirms it holds them.
  const outbox = join(dir, 'outbox')
  const outgoing = () => (existsSync(outbox) ? readdirSync(outbox).filter((f) => f.endsWith('.json')) : [])
  function deliver() {
    if (!inbox || !outgoing().length) return
    if (!net.linked(inbox)) return net.dial(inbox)
    for (const f of outgoing()) {
      try {
        net.send(inbox, { t: 'report', r: JSON.parse(readFileSync(join(outbox, f), 'utf8')) })
      } catch {} // a torn file: dropped below once the inbox has the rest
    }
  }

  const versions = new Map<Key, Version>()
  const hi = (key: Key) =>
    net.send(key, { t: 'hello', ...s.profile, friend: s.friends[key] === 'friend' || s.friends[key] === 'outgoing', app: version, call: CALL_VERSION })
  const sendHave = (key: Key, conv: string, re?: boolean) =>
    net.send(key, { t: 'have', conv, have: haveOf(conv), re })

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

  // Profile cards we asked strangers for during friend search. Only their answers are accepted.
  const asking = new Map<Key, { done: (p: Profile) => void; promise: Promise<Profile> }>()
  function card(key: Key): Promise<Profile> {
    if (known(key) && s.profiles[key]) return Promise.resolve(s.profiles[key])
    const pending = asking.get(key)
    if (pending) return pending.promise
    let resolve!: (p: Profile) => void
    const promise = new Promise<Profile>((r) => (resolve = r))
    // No answer still lets the caller list the person, with the picture generated from their key.
    const timer = setTimeout(() => done(cleanProfile(null)), 4000)
    function done(p: Profile) {
      clearTimeout(timer)
      asking.delete(key)
      if (!wants(key) && s.friends[key] !== 'incoming') net.drop(key)
      resolve(p)
    }
    asking.set(key, { done, promise })
    if (net.linked(key)) net.send(key, { t: 'who' })
    else net.dial(key)
    return promise
  }

  function onMsg(key: Key, w: Wire) {
    if (key === inbox && w.t === 'reportAck') {
      if (typeof w.id !== 'string' || !/^[0-9a-f]{16}$/.test(w.id) || !existsSync(join(outbox, w.id + '.json'))) return
      rmSync(join(outbox, w.id + '.json'), { force: true })
      diag('app', 'a report reached the developers')
      if (!outgoing().length && !wants(key)) net.drop(key)
      return push()
    }
    if (w.t === 'who') return net.send(key, { t: 'card', ...s.profile })
    if (w.t === 'card') return asking.get(key)?.done(cleanProfile(w))
    if (w.t === 'hello') {
      if (typeof w.name !== 'string') return
      const st = s.friends[key]
      // Older versions do not say; they greeted only friends and people they asked, plus fellow group members.
      const said = typeof w.friend === 'boolean'
      const asks = said ? w.friend : !inGroupWith(key)
      if (asks && st === 'outgoing') {
        s.friends[key] = 'friend' // they accepted, or asked us at the same time
        greet(key)
      } else if (asks && !st) {
        if (Object.values(s.friends).filter((f) => f === 'incoming').length >= 50) return
        s.friends[key] = 'incoming'
      } else if (said && !asks && st === 'friend') {
        s.friends[key] = 'outgoing' // they removed us: still wanted on our side, but no longer mutual
      } else if (said && !asks && st === 'incoming') {
        delete s.friends[key] // they cancelled their request
      }
      if (!known(key) && !s.friends[key]) return // a stranger who is not asking anything
      versions.set(key, versionOf(w))
      s.profiles[key] = cleanProfile(w)
      return changed()
    }
    if (w.t === 'group') {
      const g = w.g
      // The sender is a member, or a member who just left (their signed notice is checked by validGroup).
      if (!validGroup(g) || !(g.members.includes(key) || g.left?.[key]) || !(g.members.includes(me) || s.groups[g.id])) return
      // A member we have never met may hand us the group, but only with proof that one of our friends added us.
      const add = g.adds?.[me]
      if (!known(key) && !(add && s.friends[add.by] === 'friend' && verifyAdd(g.id, me, add))) return
      const merged = mergeGroup(s.groups[g.id], g)
      // They are behind (for example, they have not heard that someone left): send them ours.
      if (JSON.stringify(merged) !== JSON.stringify(mergeGroup(undefined, g))) net.send(key, { t: 'group', g: merged })
      if (JSON.stringify(merged) === JSON.stringify(s.groups[g.id])) return
      s.groups[g.id] = merged
      changed()
      return spread(merged)
    }
    if (!known(key)) return

    if (w.t === 'have') {
      if (!members(w.conv).includes(key) || !w.have || typeof w.have !== 'object') return
      const have = haveOf(w.conv)
      // Read the log only when they lack something; a receipt for what they already hold costs nothing.
      if (Object.entries(have).some(([a, n]) => n > (Number(w.have[a]) || 0))) {
        for (const m of missing(msgsOf(w.conv), w.have)) net.send(key, { t: 'msg', m })
      }
      if (!w.re) sendHave(key, w.conv, true)
      const seq = Math.min(Number(w.have[me]) || 0, have[me] ?? 0)
      if (seq > (s.acked[w.conv] ?? 0)) {
        s.acked[w.conv] = seq
        save()
        emit({ type: 'acked', conv: w.conv, seq })
      }
    } else if (w.t === 'msg') {
      const m = w.m
      const ms = members(m?.conv)
      if (!ms.includes(key) || !ms.includes(m.author)) return
      const next = (haveOf(m.conv)[m.author] ?? 0) + 1
      if (m.seq < next) return // already have it
      if (m.seq > next) return sendHave(key, m.conv, true) // gap: ask for what we lack
      if (!verifyMsg(m)) return
      append(m)
      sendHave(key, m.conv, true) // delivery receipt
      for (const k of ms) if (k !== me && k !== key && k !== m.author) net.send(k, { t: 'msg', m })
    } else if (w.t === 'call') {
      if (members(w.conv).includes(key)) emit({ type: 'call', from: key, conv: w.conv, data: w.data })
    } else if (w.t === 'gone') {
      delete s.friends[key]
      if (!known(key)) delete s.profiles[key]
      changed()
    } else if (w.t === 'pkt') {
      if (typeof w.d === 'string') relay.deliver(key, Buffer.from(w.d, 'base64'))
    } else if (w.t === 'probe') {
      // Answer a finished probe, unless this peer has been sending probes far beyond what a measurement needs.
      const used = (probed.get(key) ?? 0) + (typeof w.d === 'string' ? w.d.length : 0)
      probed.set(key, used)
      if (w.end && used <= PROBE_LIMIT && Number.isSafeInteger(w.id)) net.send(key, { t: 'probed', id: w.id })
    } else if (w.t === 'probed') {
      probes.get(w.id)?.()
    }
  }

  // Upload measurement: bytes of probe filler received per peer (reset every minute), and our probes awaiting an answer.
  const PROBE_BYTES = 1 << 20
  const PROBE_LIMIT = 4 * PROBE_BYTES
  const probed = new Map<Key, number>()
  const probes = new Map<number, () => void>()
  let probeId = 0
  const probeReset = setInterval(() => probed.clear(), 60000)

  const net = createNet(
    keyPair,
    {
      open(key) {
        diag('network', `linked with …${key.slice(-6)}${known(key) ? '' : key === inbox ? ' (developers inbox)' : ' (not a friend)'}`)
        if (key === inbox) deliver()
        if (wants(key)) greet(key)
        if (asking.has(key)) net.send(key, { t: 'who' })
        push()
      },
      close(key) {
        diag('network', `link closed with …${key.slice(-6)}`)
        relay.close(key)
        push()
      },
      msg: onMsg,
      packet: (key, b) => known(key) && relay.deliver(key, b),
    },
    dht,
  )
  const relay = createRelay((key, b) => net.packet(key, b))

  const redial = () => {
    const keys = new Set(ours().flatMap((g) => g.members))
    for (const [k, st] of Object.entries(s.friends)) if (st !== 'incoming') keys.add(k)
    keys.delete(me)
    for (const k of keys) net.dial(k)
  }
  redial()
  const timer = setInterval(redial, redialMs)
  const delivery = setInterval(deliver, redialMs) // only dials while reports are waiting, like redialing an offline friend
  deliver()

  const topic = (id: string) => createHash('sha256').update('eleusinia:' + id).digest()
  const prefixTopic = (prefix: string) => createHash('sha256').update('eleusinia-prefix:' + prefix).digest()
  // The exact ID, plus every username prefix from 4 letters up so people can be suggested while their ID is typed.
  function topicsOf(handle: string) {
    const user = handle.split('#')[0]
    const topics = [topic(handle)]
    for (let n = 4; n <= user.length; n++) topics.push(prefixTopic(user.slice(0, n)))
    return topics
  }
  const announce = async () => {
    if (s.profile.handle) await Promise.all(topicsOf(s.profile.handle).map(net.announce))
  }
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
    // People online matching what has been typed so far: an exact friend ID, or (from 4 letters) usernames
    // starting with it. Nothing central keeps IDs unique, so one ID can match several people; the user picks.
    async findFriend(text: string) {
      const q = normHandle(String(text)).slice(0, 25)
      const user = q.split('#')[0]
      const exact = isHandle(q)
      if (!exact && (user.length < 4 || !isUsername(user))) return []
      const keys = (await net.lookup(exact ? topic(q) : prefixTopic(user))).filter((k) => k !== me).slice(0, 8)
      const found = await Promise.all(
        // Found by exact ID we know which ID they announced; found by prefix we only have their own word for it.
        keys.map(async (key) => ({ key, profile: exact ? { ...(await card(key)), handle: q } : await card(key) })),
      )
      return exact ? found : found.filter((f) => f.profile.handle.startsWith(q))
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
      } else hi(key) // still linked through a group: tell them, so they stop treating us as a friend
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
    // The newest `limit` messages by time, and how many there are in all, so the window only holds what it shows.
    history(conv: string, limit = Infinity) {
      if (!members(conv).length) return { msgs: [], acked: 0, total: 0 }
      const all = msgsOf(conv)
      const n = Math.max(1, Number(limit) || 1)
      return { msgs: all.length > n ? [...all].sort((a, b) => a.ts - b.ts).slice(-n) : all, acked: s.acked[conv] ?? 0, total: all.length }
    },
    // Works with nobody online: the message is logged now and synced whenever a member connects.
    send(conv: string, text: string) {
      const ms = members(conv)
      if (!ms.length || typeof text !== 'string' || !text || text.length > MAX_TEXT) throw new Error('Cannot send that')
      const m = signMsg({ conv, author: me, seq: (haveOf(conv)[me] ?? 0) + 1, ts: Date.now(), text }, keyPair.secretKey)
      append(m)
      for (const k of ms) if (k !== me) net.send(k, { t: 'msg', m })
    },
    // Leaving is signed and permanent. The group's messages are deleted from this computer.
    leaveGroup(id: string) {
      const g = Object.hasOwn(s.groups, id) ? s.groups[id] : undefined
      if (!g || !g.members.includes(me)) return
      s.groups[id] = mergeGroup(undefined, { ...g, left: { ...g.left, [me]: signLeft(id, keyPair) } })
      forget(id)
      rmSync(logFile(id), { force: true })
      changed()
      for (const k of g.members) if (k !== me) net.send(k, { t: 'group', g: s.groups[id] })
    },
    // Leaves every group, tells online friends, then erases this account's identity, friends, groups and
    // messages from this computer. The caller restarts the app afterwards.
    async deleteAccount() {
      for (const g of ours()) this.leaveGroup(g.id)
      for (const k of net.keys()) if (s.friends[k] === 'friend') net.send(k, { t: 'gone' })
      await new Promise((r) => setTimeout(r, 1500)) // let those notices leave before the links close
      await this.destroy()
      for (const f of ['state.json', 'state.json.tmp', 'identity.json', 'msgs']) rmSync(join(dir, f), { recursive: true, force: true })
    },
    signal(conv: string, to: Key | null, data: unknown) {
      if (noDirect && (data as { k?: string })?.k === 'ice') return
      for (const k of members(conv)) if (k !== me && (!to || to === k)) net.send(k, { t: 'call', conv, data })
    },
    // A UDP port on this machine that carries a call with `key` over the peer link (see relay.ts).
    relayOpen: (key: Key) => (known(key) ? relay.open(key) : null),
    relayClose: (key: Key) => relay.close(key),
    ping: () => net.ping(),
    // Upload speed in kbps: about 1 MB of filler sent to a call member over the chat link, timed until they confirm
    // it all arrived. Bounded by their download too, which is what a stream to them would face. Null if they do not answer.
    async probe(key: Key) {
      if (!known(key) || !net.linked(key)) return null
      const id = ++probeId
      const chunk = randomBytes(48 * 1024).toString('base64')
      const start = performance.now()
      const done = new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => (probes.delete(id), resolve(false)), 15000)
        probes.set(id, () => (clearTimeout(timer), probes.delete(id), resolve(true)))
      })
      let sent = 0
      while (sent < PROBE_BYTES) {
        net.send(key, { t: 'probe', id, d: chunk })
        sent += chunk.length
      }
      net.send(key, { t: 'probe', id, end: true })
      if (!(await done)) return null
      return Math.round((sent * 8) / (performance.now() - start))
    },
    setSettings(p: Partial<Settings>) {
      Object.assign(s.settings, p)
      changed()
    },
    // Queues a problem or crash report for the developers. It is checked and scrubbed here (shared/reports.ts) as
    // well as at the inbox, then sent whenever the inbox is reachable.
    report(r: Omit<Report, 'id' | 'at'>) {
      const clean = cleanReport({ ...r, id: randomBytes(8).toString('hex'), at: Date.now() })
      if (!clean) throw new Error('That report cannot be sent')
      mkdirSync(outbox, { recursive: true })
      writeFileSync(join(outbox, clean.id + '.json'), JSON.stringify(clean))
      push()
      deliver()
      return clean.id
    },
    async destroy() {
      clearInterval(timer)
      clearInterval(delivery)
      clearInterval(announcer)
      clearInterval(probeReset)
      relay.closeAll()
      await net.destroy()
    },
  }
}
