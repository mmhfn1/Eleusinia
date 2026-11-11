import { createHash, randomBytes, randomInt } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
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
  isGroupId,
  isHandle,
  isKey,
  isPicture,
  isUsername,
  normHandle,
  type Version,
  versionOf,
} from '../shared/protocol'
import DHT from 'hyperdht'
import { idSeed, readClaims, signClaim, withClaim, writeClaims } from '../shared/idcard'
import { type FileRef, validFiles } from '../shared/media'
import { cleanLink } from '../shared/links'
import { type Area, type Report, cleanReport } from '../shared/reports'
import { EDIT_AHEAD_MS, groupIdOf, heldFrom, mergeGroup, missing, ownerOf, signAdd, signEdit, signLeft, signMsg, profileVersion, signRemoved, validGroup, verifyAdd, verifyMsg, withLink } from '../shared/sync'
import { openRequest, requestSeed, sealRequest } from '../shared/sealed'
import { createImpairment, parseNetSim } from '../shared/netsim'
import { createPresence } from './presence'
import { createServers } from './servers'
import { type InviteLink, type JoinReason, askOrder, checkJoinAsk, isJoinAnswer, isJoinAsk, joinTopic, limiter, makeInvite, newInvite, parseInvite, serverTopic } from '../shared/invite'
import { joinProof } from '../shared/server'
import { createFiles } from './files'
import { type Activity, type Game, cleanActivity, shareable } from '../shared/activity'
import { type RelayLimits, RELAY_LIMITS, createNet } from './network'
import { createRelay } from './relay'

type Saved = {
  unread?: Record<string, number> // per conversation: messages from others and missed calls since it was last read
  lastAt?: Record<string, number> // per conversation: when its newest message arrived here
  blocked?: Record<Key, number> // people we blocked, and when: no friend requests, no links, their messages uncounted
  joinedAt?: Record<string, number> // per group: when it reached us; history written before that is not unread
  profileV?: Record<Key, string> // the profile version (profileVersion) we hold of each person, from a greeting or their card
  profile: Profile
  friends: Record<Key, FriendStatus>
  profiles: Record<Key, Profile>
  groups: Record<string, Group>
  acked: Record<string, number> // per conversation: my highest seq some peer has confirmed holding
  settings: Settings
  declined?: Record<Key, number> // when we declined or removed someone: their announced requests are ignored for a while
  accepted?: Record<Key, number> // requests we accepted that they have not yet confirmed over a link
  // When a friend told us over a link that they removed us. Their old acceptance can stay announced on the DHT for a
  // while; it is not believed in that time (an acceptance over a link always is).
  unfriended?: Record<Key, number>
  requestedAt?: Record<Key, number> // when each waiting request arrived, so a full list drops the oldest
  // Per conversation and peer: the most of each author's messages that peer has ever confirmed holding. What they
  // confirmed is never sent to them again, so someone who steals a key cannot ask friends for the old history.
  confirmed?: Record<string, Record<Key, Have>>
}

type Opts = {
  dir: string
  keyPair: { publicKey: Buffer; secretKey: Buffer }
  emit: (e: Event) => void
  dht?: object
  redialMs?: number
  noDirect?: boolean // testing: withhold ICE candidates so calls can only connect through the relay
  links?: (key: Key) => boolean // testing: refuse direct links to some peers, as two strict routers would
  maxRequests?: number // testing: a smaller cap on waiting friend requests
  netsim?: string // testing: a simulated bad line on relayed call packets (ELEUSINIA_TEST_NET, shared/netsim.ts)
  thumbnail?: (avatar: string) => Buffer | null // a JPEG of the picture under 1 KB for search (index.ts, Electron's nativeImage)
  strict?: boolean // testing: direct connections fail for real, as behind a strict router, so only a relay links
  relayLimits?: RelayLimits // testing: smaller caps on what we relay for contacts
  inbox?: Key // the developers' inbox, where problem and crash reports go
  version?: string // this app's version, told to everyone we greet
  diag?: (area: Area, text: string) => void // diagnostic events, kept in memory by the caller
  forwardTo?: number // how many members a group message is passed on to; testing: 0, so only asking delivers
  groupLinks?: number // how many members of each group we dial ourselves (besides friends and people in our call)
  // Conversations kept in memory: as many recently used ones as fit in this many messages (the one in use always
  // stays), so a server's busy channels are not read back from disk for every catch-up page. Testing: a few.
  keepMsgs?: number
}

// Conversations whose messages stay in memory; the open one and a couple being synced.
const CATCHUP_PAGE = 200 // messages sent per catch-up round
// A new member of a group syncs only each author's newest this many; older ones come a page at a time on request
const SHALLOW = 100
const CATCHUP_BACKLOG = 1 << 20 // no new round while this much is still unsent on the link
// shortcut: one bucket per author and conversation, 20 a second after a burst of 400; servers want per-channel
// slow mode on top, set by their roles
const FLOOD = { burst: 400, perSecond: 20 }

// Everything except the window: friends, groups, message logs and their sync. No Electron imports, so tests can run it.
export function createNode({ dir, keyPair, emit, dht, redialMs = 15000, noDirect = false, inbox, diag = () => {}, version = '0.0.0', links, strict, relayLimits, maxRequests = 200, netsim, thumbnail, forwardTo = 3, groupLinks = 8, keepMsgs = 50000 }: Opts) {
  const me: Key = keyPair.publicKey.toString('hex')
  const file = join(dir, 'state.json')
  mkdirSync(join(dir, 'msgs'), { recursive: true })
  // Pictures (ours, everyone's and the groups') are kept apart in pictures/<id>, named by their hash, and state.json
  // holds only `pic:<id>`: at 200 members they would be several MB, rewritten with every change. The window gets them
  // as eleusinia-pic://<id> (index.ts) for the same reason, instead of inside every state push.
  const pics = join(dir, 'pictures')
  mkdirSync(pics, { recursive: true })
  const picIds = new Map<string, string>() // data URL -> id, so each picture is hashed once
  const kept = new Set<string>() // ids state.json points to, read at start; others are deleted then
  function picId(data: string) {
    let id = picIds.get(data)
    if (id) return id
    id = createHash('sha256').update(data).digest('hex').slice(0, 32)
    if (!existsSync(join(pics, id))) writeFileSync(join(pics, id), data)
    picIds.set(data, id)
    return id
  }
  const toRef = (v: unknown) => (typeof v === 'string' && v.startsWith('data:') ? 'pic:' + picId(v) : v)
  function fromRef(v: unknown) {
    if (typeof v !== 'string' || !/^pic:[0-9a-f]{32}$/.test(v)) return v
    kept.add(v.slice(4))
    return existsSync(join(pics, v.slice(4))) ? readFileSync(join(pics, v.slice(4)), 'utf8') : ''
  }
  const picUrl = (p: Profile): Profile => (p.avatar ? { ...p, avatar: 'eleusinia-pic://' + picId(p.avatar) } : p)
  const s: Saved = {
    profile: { handle: '', name: '', about: '', avatar: '' },
    friends: {},
    profiles: {},
    groups: {},
    acked: {},
    settings: { audioKbps: 32, mic: '', out: '' },
    ...(existsSync(file) ? JSON.parse(readFileSync(file, 'utf8'), (k, v) => (k === 'avatar' ? fromRef(v) : v)) : {}),
  }
  const save = () => {
    writeFileSync(file + '.tmp', JSON.stringify(s, function (k, v) { return this === s && k === 'confirmed' ? undefined : k === 'avatar' ? toRef(v) : v }))
    renameSync(file + '.tmp', file) // atomic, so a crash mid-write cannot corrupt the state
  }
  // Groups from before owners: their owner is found once, from the copy on this computer, and kept from then on, so a
  // member's later made-up copies cannot change who it is.
  for (const g of Object.values(s.groups)) if (!g.owner) g.owner = ownerOf(g) ?? undefined
  // Pictures nothing points to any more (changed or forgotten), unless state.json is from before pictures were apart
  if (kept.size) for (const f of readdirSync(pics)) if (!kept.has(f)) rmSync(join(pics, f), { force: true })
  if (!s.lastAt) {
    s.lastAt = {}
    for (const f of existsSync(join(dir, 'msgs')) ? readdirSync(join(dir, 'msgs')) : [])
      if (f.endsWith('.jsonl')) s.lastAt[f.slice(0, -6)] = statSync(join(dir, 'msgs', f)).mtimeMs
  }
  // What each member confirmed holding (`confirmed`) is kept apart in confirmed/<conv>.jsonl: it grows to members ×
  // authors (about 600 KB for a full group) and changes with every receipt, so inside state.json it would rewrite
  // all of that every 2 s. A receipt appends only the authors it raised; each file is compacted at start.
  const confDir = join(dir, 'confirmed')
  mkdirSync(confDir, { recursive: true })
  const confFile = (conv: string) => join(confDir, conv + '.jsonl')
  const writeConfirmed = (conv: string) => {
    const peers = s.confirmed?.[conv] ?? {}
    writeFileSync(confFile(conv) + '.tmp', Object.entries(peers).map(([k, h]) => JSON.stringify({ k, h }) + '\n').join(''))
    renameSync(confFile(conv) + '.tmp', confFile(conv))
  }
  for (const f of readdirSync(confDir)) {
    if (!f.endsWith('.jsonl')) continue
    const peers = ((s.confirmed ??= {})[f.slice(0, -6)] ??= {})
    for (const line of readFileSync(join(confDir, f), 'utf8').split('\n')) {
      try {
        const { k, h } = JSON.parse(line)
        for (const [a, n] of Object.entries(h as Have)) (peers[k] ??= {})[a] = Math.max(peers[k]?.[a] ?? 0, n)
      } catch {} // blank or torn last line
    }
  }
  for (const conv of Object.keys(s.confirmed ?? {})) writeConfirmed(conv) // also moves an older state.json's copy out

  // Groups we are in. Groups we left stay stored, so the notice of leaving keeps reaching their members.
  const ours = () => Object.values(s.groups).filter((g) => g.members.includes(me))
  // Everyone in a group with us, as one set: asked for every link, message and state push, which scanning each
  // group's members would make cost groups × members. Rebuilt when any group's member list changes (a merge always
  // makes a new list; nothing changes one in place).
  let matesOf: unknown[] = []
  let mates = new Set<Key>()
  function inGroupWith(key: Key) {
    const gs = Object.values(s.groups)
    if (gs.length !== matesOf.length || gs.some((g, i) => g.members !== matesOf[i])) {
      matesOf = gs.map((g) => g.members)
      mates = new Set(gs.filter((g) => g.members.includes(me)).flatMap((g) => g.members))
    }
    return mates.has(key)
  }
  const known = (key: Key) => s.friends[key] === 'friend' || inGroupWith(key) || servers.knows(key)
  const wants = (key: Key) => known(key) || s.friends[key] === 'outgoing'

  // Members of a conversation; empty means it is not a conversation we take part in.
  function members(conv: unknown): Key[] {
    if (typeof conv !== 'string') return []
    if (Object.hasOwn(s.groups, conv)) return s.groups[conv].members.includes(me) ? s.groups[conv].members : []
    const channel = servers.channelMembers(conv)
    if (channel) return channel
    const [a, b] = conv.split('_')
    const other = a === me ? b : a
    return isKey(other) && conv === dmId(me, other) && s.friends[other] === 'friend' ? [me, other] : []
  }
  // Who takes part in a conversation's call: a server channel's are those who may connect to that voice channel
  const callers = (conv: unknown): Key[] => servers.callMembers(conv) ?? members(conv)

  // Activity (shared/activity.ts): ours as found by main/activity.ts, and each linked contact's as they last sent it.
  // Memory only. Ours goes to friends and group members, minus anyone hidden, at most every 2 s, only when it changed.
  let mine: Game | null = null
  const theirs = new Map<Key, Activity>()
  const sentActivity = new Map<Key, string>()
  const ourActivity = () => shareable({ now: Date.now(), ...(mine && { game: mine }) }, s.settings.activity)
  function sendActivity(key: Key) {
    if (!known(key) || !net.linked(key)) return
    const a = s.settings.activity?.hidden?.includes(key) ? { now: Date.now() } : ourActivity()
    const body = JSON.stringify(a.game ?? null)
    if (sentActivity.get(key) === body) return
    sentActivity.set(key, body)
    net.send(key, { t: 'activity', a })
  }
  let sharing: ReturnType<typeof setTimeout> | null = null
  const shareActivity = () => (sharing ??= setTimeout(() => ((sharing = null), net.keys().forEach(sendActivity)), 2000))
  // A burst of updates (several friends starting games) is one state push to the window.
  let pushing: ReturnType<typeof setTimeout> | null = null
  const pushSoon = () => (pushing ??= setTimeout(() => ((pushing = null), push()), 100))

  const state = (): State => ({
    me,
    profile: s.profile,
    friends: s.friends,
    profiles: Object.fromEntries(Object.entries(s.profiles).map(([k, p]) => [k, picUrl(p)])),
    online: net.keys().filter(known),
    groups: Object.fromEntries(ours().map((g) => [g.id, g])),
    settings: s.settings,
    reports: outgoing().length,
    versions: Object.fromEntries([...versions].filter(([k]) => known(k))),
    relayed: net.keys().filter((k) => known(k) && relayedVia.has(k)),
    activity: { ...Object.fromEntries([...theirs].filter(([k]) => known(k) && net.linked(k))), [me]: ourActivity() },
    chats: Object.fromEntries(Object.entries(s.lastAt ?? {}).filter(([c]) => members(c).length).map(([c, at]) => [c, { unread: s.unread?.[c] ?? 0, at }])),
    blocked: Object.keys(s.blocked ?? {}),
    present: presence.online().filter(known),
    servers: servers.summary(),
  })
  const push = () => emit({ type: 'state', state: state() })
  // For frequent small changes (receipts in a busy group): written within 2 s rather than once per message.
  let saving: ReturnType<typeof setTimeout> | null = null
  const saveSoon = () => (saving ??= setTimeout(() => ((saving = null), save()), 2000))
  // The whole state is rewritten, so many changes at once (contacts coming online at start) share one write.
  const changed = () => {
    saveSoon()
    pushSoon()
  }

  // Message logs live on disk. Only the few most recently used conversations stay in memory, so long histories
  // cost nothing while unused; what each author has sent so far (`have`) is tiny and always kept.
  const logs = new Map<string, Msg[]>() // least recently used first
  const sorted = new Map<string, Msg[]>() // a cached log in time order, for history; dropped when a message is added
  const haves = new Map<string, Have>()
  const logFile = (conv: string) => join(dir, 'msgs', conv + '.jsonl')
  // Callers must pass a conv that members() accepted: it becomes a file name.
  function msgsOf(conv: string) {
    let msgs = logs.get(conv)
    if (msgs) logs.delete(conv)
    else {
      msgs = []
      const have: Have = {}
      const tail: Have = {}
      if (existsSync(logFile(conv))) {
        const text = readFileSync(logFile(conv), 'utf8')
        // A write cut short (power lost) leaves a torn last line: end it, or the next message would be glued to it and lost
        if (text && !text.endsWith('\n')) appendFileSync(logFile(conv), '\n')
        for (const line of text.split('\n')) {
          try {
            const m: Msg | { skip: Have } | { tail: Have } = JSON.parse(line)
            if ('skip' in m) for (const [a, n] of Object.entries(m.skip)) have[a] = Math.max(have[a] ?? 0, n)
            else if ('tail' in m) for (const [a, n] of Object.entries(m.tail)) (have[a] = Math.max(have[a] ?? 0, n)), (tail[a] = n)
            else msgs.push(m), (have[m.author] = Math.max(have[m.author] ?? 0, m.seq)) // older ones come later in the file
          } catch {} // blank or torn last line
        }
      }
      haves.set(conv, have)
      for (const a of Object.keys(tail)) if (!tail[a]) delete tail[a]
      tails.set(conv, tail)
    }
    logs.set(conv, msgs)
    let total = 0
    for (const l of logs.values()) total += l.length
    for (const [old, l] of logs) {
      if (total <= keepMsgs || old === conv) break
      logs.delete(old)
      sorted.delete(old)
      total -= l.length
    }
    return msgs
  }
  const haveOf = (conv: string) => haves.get(conv) ?? (msgsOf(conv), haves.get(conv)!)
  // Per author, the newest message never fetched because we joined after it (`{ tail }` lines): everything at or below
  // it is older history, fetched only on request (`older`), newest first, each step lowering it by one.
  const tails = new Map<string, Have>()
  const tailOf = (conv: string) => tails.get(conv) ?? (msgsOf(conv), tails.get(conv)!)
  function setTail(conv: string, a: Key, n: number) {
    const t = tailOf(conv)
    if (n > 0) t[a] = n
    else delete t[a]
    appendFileSync(logFile(conv), JSON.stringify({ tail: { [a]: n } }) + '\n')
  }
  // Only a group that reached us after this came in (joinedAt) takes a shallow start: a member of an older group, or
  // a friend's DM, still gets everything, as before.
  const shallow = (conv: string) => Object.hasOwn(s.groups, conv) && !!s.joinedAt?.[conv]
  function forget(conv: string) {
    logs.delete(conv)
    tails.delete(conv)
    sorted.delete(conv)
    haves.delete(conv)
    delete s.confirmed?.[conv]
    rmSync(confFile(conv), { force: true })
  }
  // History written before a group reached us, or before we joined a server, is not unread
  const since = (conv: string) => s.joinedAt?.[conv] ?? ((servers.isChannel(conv) && servers.state(conv.split('.')[0])?.members[me]?.joinedAt) || 0)
  function append(m: Msg, old = false) {
    if (!old) s.lastAt = { ...s.lastAt, [m.conv]: Date.now() }
    if (m.author !== me && !s.blocked?.[m.author] && m.ts >= since(m.conv)) s.unread = { ...s.unread, [m.conv]: (s.unread?.[m.conv] ?? 0) + 1 }
    saveSoon()
    pushSoon()
    haveOf(m.conv)[m.author] = Math.max(haveOf(m.conv)[m.author] ?? 0, m.seq)
    logs.get(m.conv)?.push(m)
    sorted.delete(m.conv)
    appendFileSync(logFile(m.conv), JSON.stringify(m) + '\n')
    emit({ type: 'msg', m })
    if (m.files) files.note(m)
  }

  // Reports for the developers wait here, on disk, until their inbox confirms it holds them.
  const outbox = join(dir, 'outbox')
  const outgoing = () => (existsSync(outbox) ? readdirSync(outbox).filter((f) => f.endsWith('.json')) : [])
  function deliver() {
    if (!inbox || !outgoing().length) return
    if (!net.linked(inbox)) return due(inbox) && net.dial(inbox)
    for (const f of outgoing()) {
      try {
        net.send(inbox, { t: 'report', r: JSON.parse(readFileSync(join(outbox, f), 'utf8')) })
      } catch {} // a torn file: dropped below once the inbox has the rest
    }
  }

  const versions = new Map<Key, Version>()
  const hi = (key: Key) =>
    net.send(key, {
      t: 'hello',
      ...s.profile,
      friend: s.friends[key] === 'friend' || s.friends[key] === 'outgoing',
      app: version,
      call: CALL_VERSION,
      via: true,
      ...(relayKey && { relay: relayKey }),
    })
  const sendHave = (key: Key, conv: string, re?: boolean) =>
    net.send(key, { t: 'have', conv, have: haveOf(conv), re, ...(shallow(conv) && { tail: true }) })
  // Group receipts also go, at most every 5 s per group, to a few random linked members (whoever passed a message on
  // got one already), so over a few rounds each of them knows what we hold and never sends it to our key again (see
  // `confirmed`), and one that missed a message asks for it. To every member, a big group would send members² a round.
  const receipts = new Set<string>()
  const askedFor = new Map<string, number>()
  const flood = new Map<string, { left: number; at: number }>()
  const askedOlder = new Map<Key, number>()
  const floodRetry = new Map<string, ReturnType<typeof setTimeout>>()
  const sentUpTo = new Map<string, { have: Have; at: number }>() // per link and conversation: what catch-up just sent
  const few = (ks: Key[], n = forwardTo) => ks.sort(() => Math.random() - 0.5).slice(0, n)
  const sendReceipts = () => {
    for (const conv of receipts) for (const k of few(members(conv).filter((k) => k !== me && net.linked(k)), 3)) sendHave(k, conv, true)
    receipts.clear()
  }
  const receiptTimer = setInterval(sendReceipts, 5000)

  function greet(key: Key) {
    const shared = Object.values(s.groups).filter((g) => g.members.includes(key))
    // Group docs go first: they are how a member who is not our friend learns who we are.
    for (const g of shared) net.send(key, { t: 'group', g })
    hi(key)
    if (s.friends[key] === 'friend') sendHave(key, dmId(me, key))
    for (const g of shared) sendHave(key, g.id)
    servers.greet(key)
    for (const conv of servers.channelsWith(key)) sendHave(key, conv)
    if (shared.length || servers.shares(key)) net.send(key, { t: 'presence', p: presence.note() })
    sendActivity(key)
  }
  function reach(key: Key) {
    if (!net.linked(key)) return need(key), net.dial(key)
    greet(key)
  }
  const spread = (g: Group) => g.members.forEach((m) => m !== me && reach(m))

  // At most 200 waiting requests. New identities cost nothing, so a full list drops its oldest rather than refusing new
  // ones: a flood of made-up requests can never block real ones for good, and Decline all clears it.
  const declinedRecently = (k: Key) => !!s.blocked?.[k] || (s.declined?.[k] ?? 0) > Date.now() - 30 * 864e5
  function takeRequest(k: Key) {
    const waiting = Object.keys(s.friends).filter((f) => s.friends[f] === 'incoming')
    if (waiting.length >= maxRequests) {
      const oldest = waiting.reduce((a, b) => ((s.requestedAt?.[a] ?? 0) <= (s.requestedAt?.[b] ?? 0) ? a : b))
      delete s.friends[oldest]
      delete s.requestedAt?.[oldest]
      if (!known(oldest)) delete s.profiles[oldest]
    }
    s.friends[k] = 'incoming'
    s.requestedAt = { ...s.requestedAt, [k]: Date.now() }
  }

  function onMsg(key: Key, w: Wire) {
    if (key === inbox && w.t === 'reportAck') {
      if (typeof w.id !== 'string' || !/^[0-9a-f]{16}$/.test(w.id) || !existsSync(join(outbox, w.id + '.json'))) return
      rmSync(join(outbox, w.id + '.json'), { force: true })
      diag('app', 'a report reached the developers')
      if (!outgoing().length && !wants(key)) net.drop(key)
      return push()
    }
    if (w.t === 'hello') {
      if (typeof w.name !== 'string') return
      const st = s.friends[key]
      // Older versions do not say; they greeted only friends and people they asked, plus fellow group members.
      const said = typeof w.friend === 'boolean'
      const asks = said ? w.friend : !inGroupWith(key)
      if (asks && st === 'outgoing') {
        s.friends[key] = 'friend' // they accepted, or asked us at the same time
        if (s.unfriended) delete s.unfriended[key]
        greet(key)
      } else if (asks && !st && !declinedRecently(key)) {
        takeRequest(key) // a declined request stays declined, however it arrives
      } else if (said && !asks && st === 'friend') {
        s.friends[key] = 'outgoing' // they removed us: still wanted on our side, but no longer mutual
        s.unfriended = { ...s.unfriended, [key]: Date.now() }
      } else if (said && !asks && st === 'incoming') {
        delete s.friends[key] // they cancelled their request
      }
      if (asks && s.friends[key] === 'friend' && s.accepted?.[key]) delete s.accepted[key] // they know we accepted
      if (!known(key) && !s.friends[key]) return // a stranger who is not asking anything
      versions.set(key, versionOf(w))
      if (isKey(w.relay)) {
        if (!relayKeys.has(key)) retryAt.clear() // someone new who might relay: waiting peers may try again now
        relayKeys.set(key, w.relay)
      } else relayKeys.delete(key)
      if (w.via === true) reachable.add(key)
      else reachable.delete(key)
      // Every link opening greets: only a changed profile is written and sent to the window
      const profile = cleanProfile(w)
      if (s.profileV?.[key] !== profileVersion(profile)) s.profileV = { ...s.profileV, [key]: profileVersion(profile) }
      if (JSON.stringify(profile) === JSON.stringify(s.profiles[key])) return pushSoon()
      s.profiles[key] = profile
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
      if (!s.groups[g.id]) s.joinedAt = { ...s.joinedAt, [g.id]: Date.now() }
      if (merged.members.includes(me) && merged.members.some((k) => !s.groups[g.id]?.members.includes(k))) presence.announceSoon()
      s.groups[g.id] = merged
      changed()
      // Passed on to a few linked members, like messages: each member passing it to all would be members² copies.
      // Anyone it misses gets it when they next link with someone (greet), or back from a member who is ahead.
      for (const k of few(merged.members.filter((k) => k !== me && k !== key && net.linked(k)), 3)) net.send(k, { t: 'group', g: merged })
      return
    }
    // Join asks come from strangers (let in by lookJoiner) and answers from members we asked, so before the gate
    if (w.t === 'joinAsk') return answerJoin(key, w)
    if (w.t === 'joinOk' || w.t === 'joinNo') return joinAnswered(key, w)
    if (!known(key)) return
    if (w.t === 'poke') return takePoke(key, w)
    if (w.t === 'activity') {
      const a = cleanActivity(w.a)
      if (a?.game) theirs.set(key, a)
      else theirs.delete(key)
      return pushSoon()
    }

    if (w.t === 'sops' || w.t === 'sop') return servers.receive(key, w)
    if (w.t === 'get') return files.onGet(key, w.h, w.off)
    if (w.t === 'part') return files.onPart(key, w.h, w.off, w.d)
    if (w.t === 'nope') return files.onNope(key, w.h)
    if (w.t === 'have') {
      if (!members(w.conv).includes(key) || !w.have || typeof w.have !== 'object') return
      const have = haveOf(w.conv)
      const was = s.confirmed?.[w.conv]?.[key] ?? {}
      const now: Have = { ...was }
      for (const a of Object.keys(have)) now[a] = Math.max(was[a] ?? 0, Math.min(Number(w.have[a]) || 0, have[a]))
      const raised = Object.keys(now).filter((a) => now[a] !== was[a])
      if (raised.length) {
        ;((s.confirmed ??= {})[w.conv] ??= {})[key] = now
        appendFileSync(confFile(w.conv), JSON.stringify({ k: key, h: Object.fromEntries(raised.map((a) => [a, now[a]])) }) + '\n')
      }
      // Asking again for what it had confirmed: lost data or someone else with that key. Either way it is not sent
      // again; it is told where to carry on from, so new messages still reach it.
      if (Object.keys(was).some((a) => (Number(w.have[a]) || 0) < was[a])) {
        diag('network', `…${key.slice(-6)} asked again for messages it had confirmed; not sent again`)
        net.send(key, { t: 'have', conv: w.conv, have, re: true, held: was })
      }
      // We are told we confirmed holding more than we have (our messages were lost): carry on after them. Logged as a
      // skip line, so the gap stays known after a restart.
      const held = heldFrom(w.held, key, me, w.have, have, s.acked[w.conv] ?? 0)
      if (held.length) {
        const skip = Object.fromEntries(held)
        for (const [a, n] of held) have[a] = n
        appendFileSync(logFile(w.conv), JSON.stringify({ skip }) + '\n')
        diag('network', `…${key.slice(-6)} says we already had ${held.length === 1 ? 'some messages' : 'messages'} we no longer hold; carrying on after them`)
        sendHave(key, w.conv, true)
      }
      // Read the log only when they lack something; a receipt for what they already hold costs nothing. What this link
      // already carried is not sent again: receipts come per message, so a long catch-up would resend its tail each time.
      // A page at a time (CATCHUP_PAGE), the next when their receipts show this one arrived, and none while the link
      // still has a lot unsent: a new member of a busy group would otherwise be sent its whole history in one burst.
      // What was sent holds back only receipts, for 10 s: when they ask (a page they turned away, FLOOD), they get it.
      const sent = sentUpTo.get(key + w.conv)
      const from: Have = { ...now }
      if (sent && w.re && sent.at > Date.now() - 10000) for (const [a, n] of Object.entries(sent.have)) from[a] = Math.max(from[a] ?? 0, n)
      // A new member holding nothing of an author starts at that author's newest SHALLOW; the first one says so (start)
      const starts = new Set<string>()
      if (w.tail === true) for (const [a, n] of Object.entries(have)) if (!(Number(w.have[a]) > 0) && !(from[a] > 0) && n > SHALLOW) (from[a] = n - SHALLOW), starts.add(a)
      if (net.backlog(key) < CATCHUP_BACKLOG && Object.entries(have).some(([a, n]) => n > (from[a] ?? 0))) {
        const upTo = { ...from }
        for (const m of missing(msgsOf(w.conv), from).slice(0, CATCHUP_PAGE))
          net.send(key, { t: 'msg', m, ...(starts.has(m.author) && m.seq === from[m.author] + 1 && { start: true }) }), (upTo[m.author] = Math.max(upTo[m.author] ?? 0, m.seq))
        sentUpTo.set(key + w.conv, { have: upTo, at: Date.now() })
      }
      if (!w.re) sendHave(key, w.conv, true)
      // Their receipt shows messages we lack (passing on missed us): ask, and they send them. At most every 5 s per
      // peer, since what they hold back from us (see `confirmed`) would otherwise be asked for over and over.
      else if (Object.keys(w.have).some((a) => members(w.conv).includes(a) && (Number(w.have[a]) || 0) > (have[a] ?? 0)) && (askedFor.get(key + w.conv) ?? 0) < Date.now() - 5000) {
        if (askedFor.size > 1000) askedFor.clear()
        askedFor.set(key + w.conv, Date.now())
        sendHave(key, w.conv)
      }
      const seq = Math.min(Number(w.have[me]) || 0, have[me] ?? 0)
      if (seq > (s.acked[w.conv] ?? 0)) {
        s.acked[w.conv] = seq
        saveSoon() // every confirmed message: written within 2 s, and flushed when the node stops
        emit({ type: 'acked', conv: w.conv, seq })
      }
    } else if (w.t === 'msg') {
      used.set(key, Date.now())
      const m = w.m
      const ms = members(m?.conv)
      if (!ms.includes(key) || !ms.includes(m.author)) return
      const next = (haveOf(m.conv)[m.author] ?? 0) + 1
      // A channel message from someone who may no longer write there (it may have been written just before they lost
      // the right) is not kept, but stepped over as a skip line: refusing it would leave their later messages waiting
      // behind a gap that never fills.
      if (!servers.maySend(m.conv, m.author)) {
        if (m.seq === next && verifyMsg(m)) appendFileSync(logFile(m.conv), JSON.stringify({ skip: { [m.author]: m.seq } }) + '\n'), (haveOf(m.conv)[m.author] = m.seq), sendHave(key, m.conv, true)
        return
      }
      const t = Number.isSafeInteger(m.seq) ? tailOf(m.conv)[m.author] : undefined
      const old = !!t && m.seq === t // the next older one, asked for with `older`
      if (m.seq < next && !old) return // already have it
      // gap: ask for what we lack, unless it is the start a member sent us on purpose because we are new here and hold
      // nothing of this author. Never for a message that merely overtook earlier ones (gossip, everyone talking at once).
      if (m.seq > next && !(w.start === true && next === 1 && shallow(m.conv) && verifyMsg(m) && m.ts <= Date.now() + EDIT_AHEAD_MS)) return sendHave(key, m.conv, true)
      if (!verifyMsg(m)) return
      // Dated far ahead it would stay pinned below everything for good: turned away until its time comes (it is asked
      // for again then, so only the author's own later messages wait behind it)
      if (m.ts > Date.now() + EDIT_AHEAD_MS) return
      // A member's messages count against a bucket per author and conversation (FLOOD); past it they are turned away
      // and come again when asked, so a burst from an honest catch-up only slows down, while a flood cannot outrun it.
      const b = flood.get(m.author + m.conv) ?? { left: FLOOD.burst, at: Date.now() }
      b.left = Math.min(FLOOD.burst, b.left + ((Date.now() - b.at) / 1000) * FLOOD.perSecond)
      b.at = Date.now()
      if (b.left < 1) {
        flood.set(m.author + m.conv, b)
        // Asked for again once the bucket has refilled a little, or a direct chat, with no regular receipts, would stall
        if (!floodRetry.has(m.author + m.conv)) floodRetry.set(m.author + m.conv, setTimeout(() => (floodRetry.delete(m.author + m.conv), sendHave(key, m.conv)), 2000))
        return
      }
      b.left--
      if (flood.size > 5000) flood.clear()
      flood.set(m.author + m.conv, b)
      if (old) return void (append(m, true), setTail(m.conv, m.author, m.seq - 1))
      if (m.seq > next) setTail(m.conv, m.author, m.seq - 1), (haveOf(m.conv)[m.author] = m.seq - 1)
      append(m)
      sendHave(key, m.conv, true) // delivery receipt
      if (Object.hasOwn(s.groups, m.conv) || servers.isChannel(m.conv)) receipts.add(m.conv)
      // Passed on to a few linked members, not all: in a big group that would be members² sends per message. Anyone
      // it misses learns of it from the receipts within 5 s and asks (see `have`).
      const on = ms.filter((k) => k !== me && k !== key && k !== m.author && net.linked(k))
      for (const k of few(on)) net.send(k, { t: 'msg', m })
    } else if (w.t === 'call') {
      used.set(key, Date.now())
      if (callers(w.conv).includes(key)) emit({ type: 'call', from: key, conv: w.conv, data: w.data })
    } else if (w.t === 'gone') {
      delete s.friends[key]
      s.declined = { ...s.declined, [key]: Date.now() } // their old request, still announced for a while, must not come back
      if (!known(key)) delete s.profiles[key]
      changed()
    } else if (w.t === 'older') {
      // A page of older history for a member who joined after it: per author, at or below what they asked, the newest
      // first; at most one page a second per peer
      if (!members(w.conv).includes(key) || !w.upTo || typeof w.upTo !== 'object' || (askedOlder.get(key) ?? 0) > Date.now() - 1000) return
      askedOlder.set(key, Date.now())
      const upTo = w.upTo as Record<string, unknown>
      // Each author's run by number, newest first, so a page never skips one (they take only the next one down); the
      // runs are merged by time, so the page is the conversation's newest older stretch
      const runs = new Map<string, Msg[]>()
      for (const m of msgsOf(w.conv)) if (Number(upTo[m.author]) >= m.seq) (runs.get(m.author) ?? runs.set(m.author, []).get(m.author)!).push(m)
      for (const r of runs.values()) r.sort((x, y) => y.seq - x.seq)
      for (let n = 0; n < CATCHUP_PAGE && runs.size; n++) {
        const [a, r] = [...runs].reduce((x, y) => (y[1][0].ts > x[1][0].ts ? y : x))
        net.send(key, { t: 'msg', m: r.shift()! })
        if (!r.length) runs.delete(a)
      }
    } else if (w.t === 'presence') {
      presence.receive(key, w.p)
    } else if (w.t === 'pkt') {
      if (typeof w.d === 'string') relay.deliver(key, Buffer.from(w.d, 'base64'))
    } else if (w.t === 'probe') {
      // Answer a finished probe, unless this peer has been sending probes far beyond what a measurement needs.
      const used = (probed.get(key) ?? 0) + (typeof w.d === 'string' ? w.d.length : 0)
      probed.set(key, used)
      if (w.end && used <= PROBE_LIMIT && Number.isSafeInteger(w.id)) net.send(key, { t: 'probed', id: w.id })
    } else if (w.t === 'probed') {
      probes.get(w.id)?.()
    } else if (w.t === 'reach') {
      if (!isKey(w.key)) return
      if (typeof w.ok === 'boolean') return reaching.get(w.key)?.(key, w.ok)
      // Yes only for two of our contacts, with the target linked to us and on a version that accepts relayed links.
      const n = (asked.get(key) ?? 0) + 1
      asked.set(key, n)
      const ok = !!relayKey && n <= 10 && w.key !== key && known(w.key) && net.linked(w.key) && (reachable.has(w.key) || relayKeys.has(w.key))
      if (!ok) tell(`cant:${key}:${w.key}`, `can't relay for …${key.slice(-6)} to …${w.key.slice(-6)}: ${!relayKey ? 'relaying off' : !known(w.key) ? 'not a contact' : !net.linked(w.key) ? 'not linked with them' : !(reachable.has(w.key) || relayKeys.has(w.key)) ? 'their version cannot be reached through a friend' : 'too many asks'}`)
      net.send(key, { t: 'reach', key: w.key, ok })
    } else if (w.t === 'relayed') {
      if (!isKey(w.by) || !known(w.by)) return
      relayedVia.set(key, { by: w.by, path: net.path(key), at: Date.now() })
      push()
    }
  }

  // Upload measurement: bytes of probe filler received per peer (reset every minute), and our probes awaiting an answer.
  const PROBE_BYTES = 1 << 20
  const PROBE_LIMIT = 4 * PROBE_BYTES
  const probed = new Map<Key, number>()
  const probes = new Map<number, () => void>()
  let probeId = 0
  const asked = new Map<Key, number>() // reach questions per contact this minute
  const probeReset = setInterval(() => (probed.clear(), asked.clear()), 60000)

  // Relaying through a mutual contact, for peers no direct dial reaches (both behind strict routers). The relay
  // pairs our encrypted stream with theirs and sees only ciphertext, plus who talks to whom, when and how much.
  // Only tried on demand, after a direct dial failed, and closed again when idle.
  const IDLE = 10 * 60000
  // Relay attempts repeat every tick for as long as someone is unreachable; each line goes to the diagnostics once
  // until it changes, so the repeats do not push everything else out of a problem report.
  const told = new Map<string, string>()
  const tell = (id: string, text: string) => told.get(id) !== text && (told.set(id, text), diag('network', text))
  const RETRY = redialMs * 2 // first backoff after a failed attempt: 30 s in use, doubling up to 20 times that
  let relayKey: Key | null = null // ours, while relaying is on
  const relayKeys = new Map<Key, Key>() // contacts that relay, by the relay key their hello gave
  const reachable = new Set<Key>() // contacts whose version accepts links through a friend (hello.via), relaying or not
  const relayedVia = new Map<Key, { by: Key; path: string; at: number }>() // relayed links and whose relay
  const demand = new Map<Key, number>() // peers we have something for, since when
  const used = new Map<Key, number>() // last message or call signal per peer, for the idle close
  const directFailed = new Set<Key>()
  const attempting = new Set<Key>()
  const pendingVia = new Map<Key, Key>()
  const reaching = new Map<Key, (from: Key, ok: boolean) => void>()
  const fails = new Map<Key, number>()
  const retryAt = new Map<Key, number>()
  const avoid = new Map<string, number>() // relay+peer pairs that just failed, for 10 minutes
  const lastGood = new Map<Key, Key>()
  // Anyone can be reached through a relaying friend; only relaying for others is the setting. Only friends are sought
  // out this way: in a big group, every unlinked member would cost relay asks each tick. Group members link through them.
  const need = (k: Key) => void (k !== me && s.friends[k] === 'friend' && !net.linked(k) && !demand.has(k) && demand.set(k, Date.now()))

  // A signed change to a group's name or picture, merged here and spread to every member.
  function editGroup(id: string, next: (g: Group) => { name: string; avatar: string }) {
    const g = Object.hasOwn(s.groups, id) ? s.groups[id] : undefined
    if (!g || !g.members.includes(me)) throw new Error('You are not in that group')
    const { name, avatar } = next(g)
    const { avatar: _old, ...rest } = g
    const look = { id, name, ...(avatar && { avatar }), updatedAt: Math.max(Date.now(), g.updatedAt + 1) }
    s.groups[id] = mergeGroup(g, { ...rest, ...look, edit: signEdit(look, keyPair) })
    changed()
    spread(s.groups[id])
  }
  // Doubling waits after each failure, capped at 20 times the first.
  const later = (n: number, base: number) => Date.now() + base * Math.min(2 ** (n - 1), 20)
  function relayFailed(k: Key, by?: Key) {
    attempting.delete(k)
    pendingVia.delete(k)
    const n = (fails.get(k) ?? 0) + 1
    fails.set(k, n)
    retryAt.set(k, later(n, RETRY))
    if (by) avoid.set(by + k, Date.now() + 600000)
  }
  // Ask up to 3 relaying contacts, the last one that worked first; dial through the first that says yes.
  async function tryRelay(k: Key) {
    attempting.add(k)
    const now = Date.now()
    const cands = net
      .keys()
      .filter((c) => c !== k && relayKeys.has(c) && known(c) && (avoid.get(c + k) ?? 0) <= now)
      .sort(() => Math.random() - 0.5)
      .sort((a, b) => +(b === lastGood.get(k)) - +(a === lastGood.get(k)))
      .slice(0, 3)
    tell(`ask:${k}`, `asking ${cands.length} contact${cands.length === 1 ? '' : 's'} to relay for …${k.slice(-6)}`)
    const by = await new Promise<Key | null>((resolve) => {
      let left = cands.length
      if (!left) return resolve(null)
      const timer = setTimeout(() => resolve(null), 3000)
      reaching.set(k, (from, ok) => {
        if (!cands.includes(from)) return
        if (ok || !--left) clearTimeout(timer), resolve(ok ? from : null)
      })
      for (const c of cands) net.send(c, { t: 'reach', key: k })
    })
    reaching.delete(k)
    if (net.linked(k)) return void attempting.delete(k)
    // Nobody to ask, or nobody able yet (often a mutual friend still linking with them): backs off like a failed relayed
    // dial, as asking every tick adds up over many unreachable people. A contact who starts relaying resets the waits.
    if (!by || !relayKeys.has(by)) return tell(`none:${k}`, `no contact could relay for …${k.slice(-6)} yet`), relayFailed(k)
    told.delete(`none:${k}`)
    diag('network', `linking with …${k.slice(-6)} through …${by.slice(-6)}`)
    pendingVia.set(k, by)
    net.dial(k, relayKeys.get(by))
  }
  function relayTick() {
    const now = Date.now()
    for (const [k, r] of relayedVia) {
      if (!net.linked(k)) relayedVia.delete(k)
      else if (net.path(k) !== r.path) relayedVia.delete(k), push() // hyperdht found a direct path after all
      else if (now - Math.max(used.get(k) ?? 0, r.at) > IDLE) net.drop(k)
    }
    for (const [k, at] of demand) {
      if (net.linked(k) || now - at > IDLE) demand.delete(k)
      else if (directFailed.has(k) && !attempting.has(k) && (retryAt.get(k) ?? 0) <= now) tryRelay(k)
    }
  }
  async function applyRelay() {
    relayKey = await net.setRelay(s.settings.relay !== false, known, relayLimits ?? RELAY_LIMITS)
    for (const k of net.keys()) if (wants(k)) hi(k)
  }

  // Joining a server by invite link (shared/invite.ts). The joiner is a stranger to every member, so they announce
  // themselves on the server's join topic, then dial; a member they knock on looks there and, finding them, lets them
  // link for 2 minutes to ask (a banned key too, so it hears why). Only the server id gets them that far: anyone holding
  // it already sees members online on serverTopic. The proof is checked on the ask, and nothing else from them is taken.
  const JOIN_WAIT = 60000
  const JOIN_NO: Record<JoinReason, string> = {
    server: 'That invite is for another server',
    unknown: 'That invite is not known to the server',
    proof: 'That invite link is not valid',
    revoked: 'That invite was revoked',
    expired: 'That invite has expired',
    used: 'That invite has been used up',
    banned: 'You are banned from that server',
    member: 'You are already a member',
    full: 'That server is full',
    busy: 'The server is busy, try again',
  }
  type Joining = { link: InviteLink; to: Key[]; no: Map<Key, JoinReason>; why?: JoinReason; done: (err?: Error) => void }
  const pending = new Map<string, Joining>() // servers we are joining, by id
  const joiners = new Map<Key, number>() // strangers found on a join topic, and when
  const joining = (k: Key) => (joiners.get(k) ?? 0) > Date.now() - 120000
  const lookEach = limiter(5000)
  const lookAny = limiter(500) // DHT looks cost: a flood of fresh keys knocking gets two a second, whoever they are
  const askEach = limiter(2000)
  async function lookJoiner(k: Key) {
    if (joining(k) || !lookEach(k, Date.now()) || !lookAny('', Date.now())) return
    const ours = servers.list().slice(0, 10)
    const found = await Promise.all(ours.map((v) => net.lookup(joinTopic(v.id)).catch(() => [] as Key[])))
    if (!found.some((ks) => ks.includes(k)) || s.blocked?.[k]) return
    if (joiners.size > 1000) joiners.clear()
    joiners.set(k, Date.now())
    setTimeout(() => !known(k) && net.drop(k), 120000).unref?.() // a stranger who never joins does not stay linked
  }
  function askJoin(j: Joining, k: Key) {
    if (!net.linked(k)) return void net.dial(k)
    const { server, invite, secret } = j.link
    net.send(k, { t: 'joinAsk', server, invite, key: me, proof: joinProof(server, invite, me, secret) })
  }
  // A member writes the join only when the replay would accept it; otherwise the asker hears why.
  function answerJoin(k: Key, w: unknown) {
    if (!isJoinAsk(w) || w.key !== k || s.blocked?.[k]) return
    const sv = servers.state(w.server)
    if (!sv || !Object.hasOwn(sv.members, me)) return // not a server of ours: nothing said about it
    const no = (why: JoinReason) => net.send(k, { t: 'joinNo', server: w.server, why })
    if (!askEach(k, Date.now())) return no('busy')
    let why = checkJoinAsk(sv, w, Date.now())
    if (why === 'ok') {
      try {
        servers.act(w.server, 'join', { invite: w.invite, key: k, proof: w.proof })
        diag('network', `…${k.slice(-6)} joined a server through an invite`)
      } catch {
        why = 'busy'
      }
    }
    if (why !== 'ok' && why !== 'member') return no(why)
    net.send(k, { t: 'joinOk', server: w.server })
    greet(k)
    pushSoon()
  }
  // Pokes (Invite to voice channel): ephemeral, from a fellow member we may both call with in that voice channel.
  // A peer could send them in a loop, so one per sender per 30 s and 10 a minute in all; anything else is dropped.
  const POKE_WAIT = 120000
  const pokeEach = limiter(30000)
  const poked: number[] = []
  const toPoke = new Map<Key, { w: Wire; sent: () => void }[]>() // waiting for a link with their recipient
  function takePoke(k: Key, w: { server: unknown; channel: unknown }) {
    const now = Date.now()
    while (poked.length && now - poked[0] > 60000) poked.shift()
    if (!isGroupId(w.server) || !isGroupId(w.channel) || s.blocked?.[k] || !servers.callMembers(`${w.server}.${w.channel}`)?.includes(k)) return
    if (poked.length >= 10 || !pokeEach(k, now)) return
    poked.push(now)
    emit({ type: 'poke', from: k, server: w.server, channel: w.channel })
  }
  function joinAnswered(k: Key, w: unknown) {
    const j = isJoinAnswer(w) ? pending.get(w.server) : undefined
    if (!j || !isJoinAnswer(w) || !j.to.includes(k)) return
    if (w.t === 'joinOk') {
      servers.expect(j.link.server, k)
      return reach(k)
    }
    if (w.why === 'busy') return // asked again on the next tick
    j.no.set(k, (j.why = w.why))
    if (j.to.every((x) => j.no.has(x))) j.done(new Error(JOIN_NO[w.why]))
  }

  const net = createNet(
    keyPair,
    {
      // Friends, fellow group members and people we asked. A stranger, even one sending a request (it arrives through
      // the DHT instead), cannot link, so cannot learn our address or see that we are online by dialing.
      // Someone we asked dialing us has most likely accepted: look now, which matters when the link itself cannot form
      // (two strict routers) and the acceptance only travels through the DHT. They dial as they accept, so their
      // announcement may land a moment later: one more look follows in 3 s.
      // Also someone found on one of our servers' join topics a moment ago (lookJoiner), so they can ask to join.
      admit: (key) => !s.blocked?.[key] && (s.friends[key] === 'outgoing' && ring(key, 3000), known(key) || s.friends[key] === 'outgoing' || joining(key)),
      // A stranger dialing is how a new request rings: they announce it first, then dial, so looking now finds it at
      // once instead of at the next 30 s check.
      knock: (key) => !s.friends[key] && !declinedRecently(key) && (ring(key), lookJoiner(key)),
      open(key, replaced) {
        const by = pendingVia.get(key)
        if (by) {
          pendingVia.delete(key)
          attempting.delete(key)
          fails.delete(key)
          lastGood.set(key, by)
          relayedVia.set(key, { by, path: net.path(key), at: Date.now() })
          net.send(key, { t: 'relayed', by })
        } else directFailed.delete(key)
        retries.delete(key)
        diag('network', `linked with …${key.slice(-6)}${replaced ? ' again, replacing its old link' : ''}${by ? ' through a friend' : ''}${known(key) ? '' : key === inbox ? ' (developers inbox)' : ' (not a friend)'}`)
        if (key === inbox) deliver()
        if (wants(key)) greet(key)
        for (const j of pending.values()) if (j.to.includes(key)) askJoin(j, key)
        for (const p of toPoke.get(key) ?? []) net.send(key, p.w), p.sent()
        toPoke.delete(key)
        if (known(key)) files.opened(key)
        push()
      },
      close(key) {
        diag('network', `link closed with …${key.slice(-6)}`)
        presence.closed(key)
        servers.closed(key)
        for (const k of sentUpTo.keys()) if (k.startsWith(key)) sentUpTo.delete(k)
        theirs.delete(key)
        sentActivity.delete(key)
        // The call's relay port stays: the link comes back within seconds and WebRTC keeps using that candidate.
        // call.ts closes it with the call (relayClose), destroy with the app.
        relayedVia.delete(key)
        files.closed(key)
        // A relay went away: everyone linked through it is dropped now and retried through someone else.
        for (const [k, r] of relayedVia) {
          if (r.by !== key) continue
          net.drop(k)
          avoid.set(key + k, Date.now() + 600000)
          fails.delete(k)
          retryAt.delete(k)
          demand.set(k, Date.now())
        }
        push()
      },
      failed(key, via) {
        if (!via) directFailed.add(key), joined && backOff(key) // dials before we are on the DHT say nothing about them
        else if (pendingVia.has(key)) relayFailed(key, pendingVia.get(key))
      },
      msg: onMsg,
      packet: (key, b) => known(key) && relay.deliver(key, b),
    },
    dht,
    links,
    strict,
  )
  // Group members we are not linked with, online by their presence notes (presence.ts)
  const presence = createPresence({
    keyPair,
    net,
    emit,
    few,
    tell,
    ownProfile: () => s.profile,
    around: (k) => new Set([...ours().filter((g) => g.members.includes(k)).flatMap((g) => g.members), ...servers.around(k)]),
    inCall: (conv, k) => callers(conv).includes(k),
    accepts: (k) => (inGroupWith(k) || servers.knows(k)) && !s.blocked?.[k],
    version: (k) => s.profileV?.[k],
    async card(k, v) {
      const c = await fetchCard(k)
      if (!c || !known(k) || net.linked(k)) return 'skip'
      if (JSON.stringify(c) === JSON.stringify(s.profiles[k])) return 'same'
      s.profiles[k] = c
      s.profileV = { ...s.profileV, [k]: v }
      changed()
      return 'stored'
    },
    changed: () => pushSoon(),
  })
  // Servers' op logs and their sync (servers.ts). A channel we can newly read is asked for from members we are linked with.
  const servers = createServers({
    dir,
    keyPair,
    net,
    few,
    changed(convs) {
      for (const conv of convs) for (const k of members(conv)) if (k !== me && net.linked(k)) sendHave(k, conv)
      for (const j of pending.values()) if (servers.members(j.link.server).includes(me)) net.announce(serverTopic(j.link.server)), j.done()
      pushSoon()
    },
  })
  // Testing only: a simulated bad line on the relayed call path (shared/netsim.ts).
  const sim = parseNetSim(netsim)
  const impair = sim && createImpairment(sim)
  const relay = createRelay((key, b) => (impair ? impair(() => net.packet(key, b)) : net.packet(key, b)))
  const files = createFiles({
    dir,
    me,
    send: net.send,
    linked: net.linked,
    relayed: (k) => relayedVia.has(k),
    backlog: net.backlog,
    members,
    emit: (file) => emit({ type: 'file', file }),
    limitMB: () => s.settings.cacheMB,
    // Dialled with the next redial (it takes demand), and through a relaying friend if a direct dial fails
    want: (k) => void (k !== me && known(k) && !net.linked(k) && !demand.has(k) && demand.set(k, Date.now())),
  })

  // Someone offline is dialled less and less often (15 s, doubling to 5 minutes in use): every dial is a DHT lookup,
  // and many offline friends would otherwise cost a steady stream of them. Coming back online, they dial us anyway.
  const retries = new Map<Key, { n: number; next: number }>()
  let joined = false
  net.listening.then(() => (joined = true), () => {})
  // While relaying, the first few retries skip the wait (a relay needs its contacts linked as soon as they can be, or
  // pairs wait minutes); after that it backs off too, or with relaying on by default nobody offline ever would.
  const due = (k: Key) => (retries.get(k)?.next ?? 0) <= Date.now() || (!!relayKey && (retries.get(k)?.n ?? 0) < 3)
  function backOff(k: Key) {
    const n = (retries.get(k)?.n ?? 0) + 1
    retries.set(k, { n, next: later(n, redialMs) })
  }
  // Who we dial ourselves: friends, whoever we have something for (a call signal), and a few members of each group,
  // picked by a hash of both keys so each member picks different ones. With everyone dialing everyone, a group of
  // 200 would be 20,000 links; this way each member has about 2 × groupLinks, and messages, receipts and presence
  // notes travel along them. Links others make to us are kept.
  // Down that list until groupLinks of them are linked or still being tried for the first time, so offline picks (a
  // dial that failed) do not leave us cut off; at most 3 times as many, each backing off while offline. Counting
  // first tries keeps a burst of dials at start from reaching 3 × groupLinks.
  function linkPick(list: Key[]) {
    const order = list
      .filter((k) => k !== me)
      .map((k) => [createHash('sha256').update(me + k).digest('hex'), k])
      .sort()
    const out: Key[] = []
    for (const [, k] of order) {
      if (out.filter((p) => net.linked(p) || !retries.get(p)?.n).length >= groupLinks || out.length >= groupLinks * 3) break
      out.push(k)
    }
    return out
  }
  // A link we dialed for something passing (a group change, a call, a file) and no longer need is closed after 10
  // minutes, or extra links would pile up into everyone linked with everyone again. Never a friend, one of our picks,
  // someone we still have something for, or anyone a call is using (its relay port).
  const signalled = new Map<Key, number>() // when we last sent someone a call signal
  function closeIdle(picked: Set<Key>) {
    for (const k of net.keys()) {
      const at = net.ours(k)
      if (at === null || s.friends[k] || picked.has(k) || demand.has(k) || k === inbox || relay.has(k) || files.busy(k) || net.backlog(k) > 0) continue
      if (Date.now() - Math.max(at, signalled.get(k) ?? 0) > IDLE) net.drop(k), signalled.delete(k)
    }
  }
  // What we keep about people only while they share something with us: their profile (also those who left one of our
  // groups, whose old messages still show their name, and blocked people, for the Blocked list) and, per
  // conversation, what each member confirmed holding. Links come and go with bounded links, so without this both
  // would grow with everyone ever seen, and state.json is rewritten with every change.
  function prune() {
    let gone = false
    const leavers = new Set(ours().flatMap((g) => [...Object.keys(g.left ?? {}), ...Object.keys(g.removed ?? {})]))
    for (const k of Object.keys(s.profiles))
      if (!s.friends[k] && !inGroupWith(k) && !servers.knows(k) && !leavers.has(k) && !s.blocked?.[k]) delete s.profiles[k], delete s.profileV?.[k], presence.forget(k), (gone = true)
    for (const [conv, peers] of Object.entries(s.confirmed ?? {})) {
      const ms = members(conv)
      if (!ms.length) delete s.confirmed![conv], rmSync(confFile(conv), { force: true })
      else if (Object.keys(peers).some((k) => !ms.includes(k))) {
        for (const k of Object.keys(peers)) if (!ms.includes(k)) delete peers[k]
        writeConfirmed(conv)
      }
    }
    if (gone) saveSoon(), pushSoon()
    // Memory only, one entry per peer ever linked: kept while they are linked or still a contact
    for (const m of [used, signalled]) for (const k of m.keys()) if (!net.linked(k)) m.delete(k)
    for (const k of versions.keys()) if (!net.linked(k) && !known(k)) versions.delete(k)
    for (const [id, b] of flood) if (Date.now() - b.at > 60000) flood.delete(id) // long since refilled
  }
  const redial = () => {
    relayTick()
    presence.expire()
    prune()
    const picked = new Set([...ours().map((g) => g.members), ...servers.lists()].flatMap(linkPick))
    closeIdle(picked)
    const keys = new Set([...picked, ...demand.keys()])
    for (const [k, st] of Object.entries(s.friends)) if (st !== 'incoming') keys.add(k)
    keys.delete(me)
    for (const k of keys) if (due(k)) net.dial(k)
  }
  redial()
  const timer = setInterval(redial, redialMs)
  const delivery = setInterval(deliver, redialMs) // only dials while reports are waiting, like redialing an offline friend
  deliver()

  const prefixTopic = (prefix: string) => createHash('sha256').update('eleusinia-prefix:' + prefix).digest()
  // Only with Settings → suggest: every username prefix from 4 letters up, so people can be suggested while typing.
  // The exact ID is no longer announced (it said whether that ID was online to anyone asking); search finds people
  // by exact ID through their ID card instead.
  function topicsOf(handle: string) {
    const user = handle.split('#')[0]
    const topics: Buffer[] = []
    if (s.settings.suggest) for (let n = 4; n <= user.length; n++) topics.push(prefixTopic(user.slice(0, n)))
    return topics
  }
  // Friend requests do not depend on a direct link, which two strict routers may never manage, and strangers cannot
  // link at all. Asking someone announces a sealed request on a topic only they watch (shared/sealed.ts: observers see
  // a one-off key, not who asks), and accepting announces back; each side looks at its own topic every 30 seconds.
  // Our profile card (no picture) is published as a record signed by our key, so a request or a search result shows
  // who it is without connecting. The direct link, when there is one, still carries everything at once.
  const requestTopic = (key: Key) => createHash('sha256').update('eleusinia-request:' + key).digest()
  async function announceRequest(to: Key) {
    const seed = requestSeed(keyPair, to)
    await net.putShared(seed, sealRequest(keyPair, to, DHT.keyPair(seed).publicKey), Math.floor(Date.now() / 1000))
    await net.announce(requestTopic(to), seed)
  }
  // Who is behind each one-off key on our request topic, from the sealed record under it.
  // Not found is retried after 10 minutes: the record may not have spread yet.
  const senders = new Map<Key, { from: Key | null; at: number }>()
  async function senderOf(k: Key): Promise<Key | null> {
    const got = senders.get(k)
    if (got && (got.from || got.at > Date.now() - 600000)) return got.from
    const from = openRequest(keyPair, Buffer.from(k, 'hex'), await withTimeout(net.fetch(k), null))
    if (senders.size >= 1000) senders.clear()
    senders.set(k, { from, at: Date.now() })
    return from
  }
  const ACCEPT_FOR = 7 * 864e5 // an acceptance is announced until they confirm it, at most this long
  function requesting() {
    // Acceptances past their time, or for someone no longer a friend, are dropped so the saved state does not grow.
    for (const [k, at] of Object.entries(s.accepted ?? {})) if (s.friends[k] !== 'friend' || at <= Date.now() - ACCEPT_FOR) delete s.accepted![k]
    return [...Object.keys(s.friends).filter((k) => s.friends[k] === 'outgoing'), ...Object.keys(s.accepted ?? {})]
  }
  let published = 0
  // Search and requests show a stranger's picture without a link: a small thumbnail is published in a record of its
  // own (a key pair only we hold, which the signed card points to); the full picture arrives once linked.
  const thumbSeed = createHash('sha256').update('eleusinia-thumb:').update(keyPair.secretKey).digest()
  function publishCard() {
    if (!s.profile.handle) return
    published = Math.max(published + 1, Math.floor(Date.now() / 1000))
    const { name, handle } = s.profile
    const thumb = s.profile.avatar ? thumbnail?.(s.profile.avatar) : null
    if (thumb) net.putShared(thumbSeed, thumb, published)
    const card = (about: string) => Buffer.from(JSON.stringify({ name, handle, about, ...(thumb && { thumb: DHT.keyPair(thumbSeed).publicKey.toString('hex') }) }))
    let about = s.profile.about
    while (card(about).length > 1000) about = about.slice(0, -10) // records hold 1000 bytes; friends get it whole
    net.publish(card(about), published)
  }
  async function fetchCard(key: Key): Promise<Profile | null> {
    const value = await withTimeout(net.fetch(key), null)
    try {
      const card = JSON.parse(String(value))
      const thumb = isKey(card.thumb) ? await withTimeout(net.fetch(card.thumb), null) : null
      const avatar = thumb && thumb[0] === 0xff && thumb[1] === 0xd8 ? 'data:image/jpeg;base64,' + thumb.toString('base64') : ''
      const p = cleanProfile({ ...card, avatar })
      return p.name && p.handle ? p : null
    } catch {
      return null
    }
  }
  // Our ID card (shared/idcard.ts), so search finds us by friend ID while we are offline. Written with our claim first
  // every 6 hours (records last 48); friends' cards are kept alive the same way, so someone away for days stays
  // findable while any of their friends is online.
  let idPublished = 0
  const withTimeout = <T>(p: Promise<T>, fallback: T) => Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), 6000))])
  async function publishId() {
    const h = s.profile.handle
    if (!h) return
    idPublished = Date.now()
    const r = await withTimeout(net.getShared(idSeed(h)), null)
    const claims = withClaim(signClaim(h, keyPair), r ? readClaims(h, r.value) : [])
    await net.putShared(idSeed(h), writeClaims(claims), Math.max((r?.seq ?? 0) + 1, Math.floor(Date.now() / 1000)))
  }
  async function keepFriendsFindable() {
    for (const k of Object.keys(s.friends)) {
      const h = s.friends[k] === 'friend' ? s.profiles[k]?.handle : undefined
      if (!h) continue
      const r = await withTimeout(net.getShared(idSeed(h)), null)
      const claims = r ? readClaims(h, r.value) : []
      // Only rewritten with their own claim in it, and only with claims that verify: nothing they did not sign spreads.
      if (r && claims.some((c) => c.key === k)) await net.putShared(idSeed(h), writeClaims(claims), r.seq + 1)
    }
  }
  // Everyone whose signed claim to this friend ID is on the DHT, online or not.
  async function idOwners(handle: string): Promise<Key[]> {
    const r = await withTimeout(net.getShared(idSeed(handle)), null)
    return r ? readClaims(handle, r.value).map((c) => c.key) : []
  }

  // At most one look per person per 5 s, and looks never overlap (checkRequests reruns once if rung meanwhile).
  const STALE_ACCEPT = 30 * 60000 // longer than a DHT announcement lives
  const NEW_PER_LOOK = 20
  const knocks = new Map<Key, number>()
  function ring(key: Key, again?: number) {
    if ((knocks.get(key) ?? 0) > Date.now() - 5000) return
    knocks.set(key, Date.now())
    if (knocks.size > 1000) knocks.clear()
    checkRequests()
    if (again) setTimeout(() => s.friends[key] === 'outgoing' && checkRequests(), again)
  }
  let checking = false
  let again = false
  async function checkRequests() {
    if (checking) return void (again = true)
    if (!s.profile.handle) return
    checking = true
    try {
      let change = false
      // Keys not yet known each cost DHT reads, so a look takes a random few of them, all at once: junk keys
      // flooding our topic slow real requests down a little but cannot hold them back.
      const oneOffs = (await net.lookup(requestTopic(me)).catch(() => [] as Key[])).filter(isKey)
      const known = (k: Key) => !!senders.get(k)?.from || (senders.get(k)?.at ?? 0) > Date.now() - 600000
      const unknown = oneOffs.filter((k) => !known(k)).sort(() => Math.random() - 0.5).slice(0, NEW_PER_LOOK)
      for (const k of await Promise.all([...oneOffs.filter(known), ...unknown].map(senderOf))) {
        if (!k || k === me) continue
        const st = s.friends[k]
        if (st === 'outgoing' && (s.unfriended?.[k] ?? 0) > Date.now() - STALE_ACCEPT) continue // an acceptance from before they removed us
        if (st === 'outgoing') {
          s.friends[k] = 'friend' // they accepted
          diag('network', `request to …${k.slice(-6)} accepted`)
          change = true
          reach(k)
        } else if (!st && !declinedRecently(k)) {
          takeRequest(k)
          diag('network', `request from …${k.slice(-6)} found`)
          change = true
          const card = await fetchCard(k)
          if (card && !s.profiles[k]?.name) s.profiles[k] = card
        }
      }
      if (change) changed()
    } finally {
      checking = false
      if (again) (again = false), checkRequests() // a knock arrived during this look
    }
  }
  const announce = async () => {
    if (!s.profile.handle) return
    if (Date.now() / 1000 - published > 6 * 3600) publishCard() // records last 48 hours
    // Our ID card is now the only way search finds us, so it is written before startup counts as ready.
    const card = Date.now() - idPublished > 6 * 3600e3 ? publishId().catch(() => {}) : null
    card?.then(keepFriendsFindable).catch(() => {})
    await Promise.all([card,...topicsOf(s.profile.handle).map((t) => net.announce(t)), ...requesting().map(announceRequest), ...servers.list().map((v) => net.announce(serverTopic(v.id)))])
  }
  const ready = Promise.all([applyRelay(), announce().then(checkRequests)])
  const announcer = setInterval(announce, 5 * 60000)
  const presenceTimer = setInterval(() => presence.announce(), 60000)
  const watcher = setInterval(checkRequests, redialMs * 2) // every 30 s in use
  // A group member we have never linked with (two strict routers) would show as their key: their published card
  // names them. A few at a time, each at most hourly.
  const carded = new Map<Key, number>()
  async function nameUnlinked() {
    const keys = [...new Set([...ours().flatMap((g) => g.members), ...servers.list().flatMap((v) => Object.keys(v.members))])].filter((k) => k !== me && !s.profiles[k]?.name && !net.linked(k) && (carded.get(k) ?? 0) < Date.now() - 3600e3)
    for (const k of keys.slice(0, 5)) {
      carded.set(k, Date.now())
      const card = await fetchCard(k)
      if (card && known(k) && !s.profiles[k]?.name) (s.profiles[k] = card), changed()
    }
  }
  const namer = setInterval(nameUnlinked, redialMs * 2)
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
          if (!(await idOwners(clean.handle)).length) break
        }
      }
      s.profile = clean
      changed()
      publishCard()
      for (const k of net.keys()) if (wants(k)) hi(k)
      presence.announce() // members not linked with us see the new version and fetch the card
      if (fresh) await Promise.all([announce(), publishId().catch(() => {})]) // so the ID can be found as soon as setup finishes
    },
    // People matching what has been typed so far: an exact friend ID (online, or offline through their ID card), or
    // (from 4 letters) usernames of people online starting with it. Nothing central keeps IDs unique, so one ID can
    // match several people; the user picks.
    async findFriend(text: string) {
      const q = normHandle(String(text)).slice(0, 25)
      const user = q.split('#')[0]
      const exact = isHandle(q)
      if (!exact && (user.length < 4 || !isUsername(user))) return []
      const [around, owners] = await Promise.all([exact ? [] : net.lookup(prefixTopic(user)), exact ? idOwners(q) : Promise.resolve([] as Key[])])
      const keys = [...new Set([...around, ...owners])].filter((k) => k !== me).slice(0, 8)
      // Contacts as we know them; anyone else from their published card, with its thumbnail (strangers cannot link,
      // and dialing them would only ring their door before any request exists). linked: whether we have a link now.
      const best = async (key: Key) => {
        const profile = (known(key) && s.profiles[key]) || (await fetchCard(key)) || cleanProfile(null)
        return { profile, linked: net.linked(key) }
      }
      const found = await Promise.all(
        // Found by exact ID we know which ID they announced; found by prefix we only have their own word for it.
        keys.map(async (key) => {
          const { profile, linked } = await best(key)
          return { key, linked, profile: exact ? { ...profile, handle: q } : profile }
        }),
      )
      return exact ? found : found.filter((f) => f.profile.handle.startsWith(q))
    },
    idOwners: (handle: string) => (isHandle(handle) ? idOwners(handle) : Promise.resolve([] as Key[])),
    // Sends a friend request to one exact person, or accepts theirs. `profile` labels the pending request.
    addFriend(key: Key, profile?: Profile) {
      if (s.blocked?.[key]) delete s.blocked[key]
      if (!isKey(key) || key === me) throw new Error('That is not someone you can add')
      if (profile) s.profiles[key] ??= cleanProfile(profile)
      if (s.declined) delete s.declined[key]
      delete s.requestedAt?.[key]
      const accepting = s.friends[key] === 'incoming'
      if (accepting) {
        s.friends[key] = 'friend'
        s.accepted = { ...s.accepted, [key]: Date.now() }
      } else if (!s.friends[key]) s.friends[key] = 'outgoing'
      changed()
      // Accepting: they let us in (we are someone they asked), so the link and the friendship are immediate. Asking: the
      // request is announced first (it also reaches them when no link ever can), then our dial rings their door.
      const announced = announceRequest(key).catch(() => {})
      if (accepting) reach(key)
      else announced.then(() => reach(key))
    },
    // Declines every waiting request at once, as after a flood of made-up ones; they stay ignored for 30 days.
    declineAll() {
      for (const k of Object.keys(s.friends)) {
        if (s.friends[k] !== 'incoming') continue
        delete s.friends[k]
        s.declined = { ...s.declined, [k]: Date.now() }
        if (!known(k)) delete s.profiles[k], net.drop(k)
      }
      s.requestedAt = {}
      changed()
    },
    removeFriend(key: Key) {
      delete s.friends[key]
      delete s.requestedAt?.[key]
      if (s.accepted) delete s.accepted[key]
      s.declined = { ...s.declined, [key]: Date.now() } // their still-announced request must not come back
      if (!known(key)) {
        delete s.profiles[key]
        net.drop(key)
      } else hi(key) // still linked through a group: tell them, so they stop treating us as a friend
      changed()
    },
    createGroup(name: string, others: Key[]) {
      const nonce = randomBytes(16).toString('hex')
      const id = groupIdOf(me, nonce)
      const members = [...new Set(others.filter((k) => s.friends[k] === 'friend'))]
      if (members.length >= 100) throw new Error('A group can have at most 100 members') // every peer rejects a bigger one (validGroup)
      const adds = Object.fromEntries(members.map((k) => [k, signAdd(id, k, keyPair)]))
      const look = { id, name: String(name).slice(0, 100), updatedAt: Date.now() }
      const g = mergeGroup(undefined, { ...look, members: [me, ...members], adds, owner: me, nonce, edit: signEdit(look, keyPair) })
      s.groups[id] = g
      changed()
      spread(g)
      return g.id
    },
    // A new picture for a group (or '' to go back to its letter), told to every member like any other change.
    setGroupPicture(id: string, avatar: string) {
      if (avatar !== '' && !isPicture(avatar)) throw new Error('That picture cannot be used')
      editGroup(id, (g) => ({ name: g.name, avatar }))
    },
    // A new name, signed and spread like a picture change; any member may rename, as any may change the picture.
    renameGroup(id: string, name: string) {
      const n = typeof name === 'string' ? name.trim().slice(0, 100) : ''
      if (!n) throw new Error('A group needs a name')
      editGroup(id, (g) => ({ name: n, avatar: g.avatar ?? '' }))
    },
    addToGroup(id: string, key: Key) {
      const g = Object.hasOwn(s.groups, id) ? s.groups[id] : undefined
      if (!g || s.friends[key] !== 'friend' || g.members.includes(key) || g.removed?.[key]) return
      if (g.members.length >= 100) throw new Error('A group can have at most 100 members')
      const adds = { ...g.adds, [key]: signAdd(id, key, keyPair) }
      s.groups[id] = mergeGroup(g, { ...g, members: [...g.members, key], adds })
      changed()
      spread(s.groups[id])
    },
    // The newest `limit` messages by time, and how many there are in all, so the window only holds what it shows.
    // Everything in a conversation counts as read: its messages and missed calls.
    markRead(conv: string) {
      if (!s.unread?.[conv]) return
      delete s.unread[conv]
      saveSoon()
      push()
    },
    // A call in a conversation that came and went without us (call.ts sees it): counted like an unread message.
    missedCall(conv: string) {
      if (!members(conv).length) return
      s.unread = { ...s.unread, [conv]: (s.unread?.[conv] ?? 0) + 1 }
      s.lastAt = { ...s.lastAt, [conv]: Date.now() }
      saveSoon()
      push()
    },
    // Blocking ends a friendship, turns away their requests and links, and leaves their messages uncounted
    // (the page hides them). In a shared group they stay a member: only the owner can remove them.
    block(key: Key) {
      if (!isKey(key) || key === me) throw new Error('Cannot block that')
      if (s.friends[key]) this.removeFriend(key)
      s.blocked = { ...s.blocked, [key]: Date.now() }
      if (!inGroupWith(key)) net.drop(key)
      changed()
    },
    unblock(key: Key) {
      if (!s.blocked?.[key]) return
      delete s.blocked[key]
      delete s.declined?.[key]
      changed()
    },
    // Older history of a group we joined after it, from up to two linked members; it arrives as messages.
    older(conv: string) {
      const upTo = members(conv).length ? tailOf(conv) : {}
      if (!Object.keys(upTo).length) return false
      for (const k of few(members(conv).filter((k) => k !== me && net.linked(k)), 2)) net.send(k, { t: 'older', conv, upTo })
      return true
    },
    // A picture the window was given as eleusinia-pic://<id>, for index.ts to serve.
    picture: (id: string) => (/^[0-9a-f]{32}$/.test(id) && existsSync(join(pics, id)) ? readFileSync(join(pics, id), 'utf8') : null),
    history(conv: string, limit = Infinity) {
      if (!members(conv).length) return { msgs: [], acked: 0, total: 0 }
      members(conv).forEach(need) // looking at a conversation is a reason to reach its people
      const all = msgsOf(conv)
      const n = Math.max(1, Number(limit) || 1)
      const earlier = Object.keys(tailOf(conv)).length > 0 // older history on other members' computers, by request
      if (all.length <= n) return { msgs: all, acked: s.acked[conv] ?? 0, total: all.length, earlier }
      // Sorted once per change, not on every look (opening the chat, loading earlier messages)
      let byTime = sorted.get(conv)
      if (!byTime) sorted.set(conv, (byTime = [...all].sort((a, b) => a.ts - b.ts)))
      return { msgs: byTime.slice(-n), acked: s.acked[conv] ?? 0, total: all.length, earlier }
    },
    // Works with nobody online: the message is logged now and synced whenever a member connects.
    // refs: files added with addFile or addBytes first, so we can hand them to whoever asks.
    // link: a preview of a link in the text (main's previewLink), signed with the message.
    send(conv: string, text: string, refs?: FileRef[], link?: unknown) {
      const ms = members(conv)
      const withFiles = refs !== undefined && refs.length > 0
      if (withFiles && (!validFiles(refs) || refs.some((f) => files.status(f.h).state !== 'done'))) throw new Error('Cannot send those files')
      if (!ms.length || !servers.maySend(conv, me) || typeof text !== 'string' || (!text && !withFiles) || text.length > MAX_TEXT) throw new Error('Cannot send that')
      // A friend confirmed more of ours than the log holds: it was lost. Carry on after those, or the next message
      // would take a number they already have and be dropped.
      const have = haveOf(conv)
      if ((have[me] ?? 0) < (s.acked[conv] ?? 0)) {
        have[me] = s.acked[conv]
        appendFileSync(logFile(conv), JSON.stringify({ skip: { [me]: have[me] } }) + '\n')
      }
      const base = { conv, author: me, seq: (have[me] ?? 0) + 1, ts: Date.now(), text }
      const signed = signMsg(withFiles ? { ...base, files: refs.map(({ h, n, s, t, th }) => ({ h, n, s, t, ...(th && { th }) })) } : base, keyPair.secretKey)
      const preview = link === undefined ? null : cleanLink(link, text)
      const m = preview ? withLink(signed, preview, keyPair.secretKey) : signed
      append(m)
      for (const k of ms) if (k !== me) net.send(k, { t: 'msg', m }), used.set(k, Date.now()), need(k)
    },
    // Servers (servers.ts): ours, a new one, and any change to one as a signed op (shared/server.ts kinds and bodies).
    // A channel's messages (text or voice) go through send and history with `${serverId}.${channelId}` as the conversation.
    servers: () => servers.list(),
    createServer(name: string) {
      const id = servers.create(name)
      net.announce(serverTopic(id))
      return id
    },
    // Accepted ops, newest first (at most 500), for the settings page; empty without viewAuditLog
    serverAudit: (id: string) => servers.audit(String(id)),
    serverAct(id: string, kind: string, body: unknown) {
      servers.act(String(id), String(kind), body)
      pushSoon()
    },
    // A new invite in the log and its link: us and one other member we are linked with as the contacts.
    createInvite(id: string, opts: { expires?: number; maxUses?: number } = {}) {
      const { body, secret } = newInvite({ expires: opts?.expires, maxUses: opts?.maxUses })
      servers.act(String(id), 'invite.add', body)
      pushSoon()
      const other = servers.members(String(id)).find((k) => k !== me && net.linked(k))
      return makeInvite({ server: String(id), invite: body.id, secret, contacts: other ? [me, other] : [me] })
    },
    // Resolves once we are a member, or fails with why the members said no (or that nobody answered within a minute).
    joinServer(text: string): Promise<{ server: string }> {
      const link = parseInvite(text)
      if (!link) return Promise.reject(new Error('That is not an invite link'))
      const joined = { server: link.server }
      if (servers.members(link.server).includes(me)) return Promise.resolve(joined)
      if (pending.has(link.server)) return Promise.reject(new Error('Already joining that server'))
      return new Promise((resolve, reject) => {
        const tick = () => j.to.forEach((k) => !j.no.has(k) && askJoin(j, k))
        const timer = setInterval(tick, 2000)
        const stop = setTimeout(() => j.done(new Error(j.why ? JOIN_NO[j.why] : 'No member of that server answered')), JOIN_WAIT)
        const j: Joining = {
          link,
          to: askOrder(link.contacts, [], me),
          no: new Map(),
          done(err) {
            clearInterval(timer)
            clearTimeout(stop)
            pending.delete(link.server)
            if (err) reject(err)
            else resolve(joined)
          },
        }
        pending.set(link.server, j)
        // Announced before the first dial: the member we knock on looks for us there
        net.announce(joinTopic(link.server)).then(tick)
        net.lookup(serverTopic(link.server)).then((found) => ((j.to = askOrder(j.to, found, me)), tick()), () => {})
      })
    },
    // Asks a fellow member to join a voice channel's call with us. True once sent; false when they could not be
    // reached within 2 minutes (dialled like a call signal's recipient meanwhile).
    poke(server: string, channel: string, key: Key): Promise<boolean> {
      if (key === me || !servers.callMembers(`${server}.${channel}`)?.includes(key)) throw new Error('They cannot join that voice channel')
      const w: Wire = { t: 'poke', server, channel }
      if (net.linked(key)) return net.send(key, w), Promise.resolve(true)
      return new Promise((resolve) => {
        const p = { w, sent: () => (clearTimeout(timer), resolve(true)) }
        const timer = setTimeout(() => {
          const left = (toPoke.get(key) ?? []).filter((x) => x !== p)
          if (left.length) toPoke.set(key, left)
          else toPoke.delete(key)
          resolve(false)
        }, POKE_WAIT)
        toPoke.set(key, [...(toPoke.get(key) ?? []), p])
        demand.set(key, demand.get(key) ?? Date.now())
        if (due(key)) net.dial(key)
      })
    },
    // Only the owner can remove someone; like leaving, it is signed and permanent. Everyone, the removed member
    // included, is told, and anyone only they had added drops out with them until a member adds them again.
    removeFromGroup(id: string, key: Key) {
      const g = Object.hasOwn(s.groups, id) ? s.groups[id] : undefined
      if (!g || g.owner !== me || key === me || !g.members.includes(key)) return
      s.groups[id] = mergeGroup(g, { ...g, removed: { ...g.removed, [key]: signRemoved(id, key, keyPair) } })
      changed()
      for (const k of g.members) if (k !== me) net.send(k, { t: 'group', g: s.groups[id] })
    },
    // Leaving is signed and permanent. The group's messages are deleted from this computer.
    leaveGroup(id: string) {
      const g = Object.hasOwn(s.groups, id) ? s.groups[id] : undefined
      if (!g || !g.members.includes(me)) return
      s.groups[id] = mergeGroup(g, { ...g, left: { ...g.left, [me]: signLeft(id, keyPair) } })
      forget(id)
      rmSync(logFile(id), { force: true })
      files.forgetConv(id)
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
      for (const f of ['state.json', 'state.json.tmp', 'identity.json', 'msgs', 'files', 'pictures', 'confirmed', 'servers']) rmSync(join(dir, f), { recursive: true, force: true })
    },
    signal(conv: string, to: Key | null, data: unknown) {
      if (noDirect && (data as { k?: string })?.k === 'ice') return
      const ms = callers(conv)
      if (!ms.includes(me)) return
      for (const k of ms) if (k !== me && (!to || to === k)) net.send(k, { t: 'call', conv, data }), used.set(k, Date.now()), need(k)
      if (to) signalled.set(to, Date.now())
      // Whoever a signal is addressed to is in the call with us: sought out even when not a friend, and dialled now.
      if (to && to !== me && ms.includes(to) && !net.linked(to)) {
        demand.set(to, demand.get(to) ?? Date.now())
        if (due(to)) net.dial(to)
      }
      // Our own group or voice channel call, told in our presence note so members not linked with us see it too. Never a direct call.
      const k = (data as { k?: string })?.k
      if (!to && (k === 'join' || k === 'leave')) presence.inGroupCall(k === 'join' && (Object.hasOwn(s.groups, conv) || servers.isChannel(conv)) ? conv : null)
    },
    // A UDP port on this machine that carries a call with `key` over the peer link (see relay.ts).
    relayOpen: (key: Key) => (known(key) ? relay.open(key) : null),
    relayClose: (key: Key) => relay.close(key),
    ping: () => net.ping(),
    // Testing only (index.ts allows it on a local test DHT): closes the chat link with a peer, as a network blip does.
    dropLink: (key: Key) => net.drop(key),
    // Upload speed in kbps: about 1 MB of filler sent to a call member over the chat link, timed until they confirm
    // it all arrived. Bounded by their download too, which is what a stream to them would face. Null if they do not answer.
    async probe(key: Key) {
      if (!known(key) || !net.linked(key) || relayedVia.has(key)) return null // a relay would refuse the burst
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
    // Shared files: sending one from where it is, or as bytes (a picture without its metadata, or pasted).
    addFile: (path: string) => files.addPath(String(path)),
    addBytes: (name: string, type: string, data: Uint8Array) => files.addBytes(String(name), String(type), data),
    // saveTo: where the user chose to save it (asked in the main process); without one it goes to the picture cache.
    download: (h: string, saveTo?: string) => files.fetch(String(h), saveTo),
    fileStatus: (hs: string[]) => (Array.isArray(hs) ? hs.slice(0, 500).map((h) => files.status(String(h))) : []),
    filePath: (h: string) => files.pathOf(String(h)),
    cacheSize: () => files.cacheBytes(),
    clearCache: () => files.clearCache(),
    // What we are playing now, from main/activity.ts (null: nothing).
    setActivity(game: Game | null) {
      mine = game
      shareActivity()
      pushSoon()
    },
    async setSettings(p: Partial<Settings>) {
      const was = s.settings.relay !== false
      Object.assign(s.settings, p)
      changed()
      if (p.activity) shareActivity()
      if (p.cacheMB !== undefined) files.trim()
      if (was !== (s.settings.relay !== false)) await applyRelay(), push()
      if (p.suggest) announce().catch(() => {}) // turned off, the announcements lapse within about 20 minutes
    },
    // Queues a problem or crash report for the developers. It is checked and scrubbed here (shared/reports.ts) as
    // well as at the inbox, then sent whenever the inbox is reachable.
    report(r: Omit<Report, 'id' | 'at'>) {
      const clean = cleanReport({ ...r, id: randomBytes(8).toString('hex'), at: Date.now() })
      if (!clean) throw new Error('That report cannot be sent')
      mkdirSync(outbox, { recursive: true })
      writeFileSync(join(outbox, clean.id + '.json'), JSON.stringify(clean))
      push()
      if (inbox) retries.delete(inbox) // a new report is worth trying at once
      deliver()
      return clean.id
    },
    // Writes pending changes now, for when the app is ended without destroy (Windows shutting down).
    flush: () => saving && (clearTimeout(saving), (saving = null), save()),
    async destroy() {
      if (saving) clearTimeout(saving), save()
      if (sharing) clearTimeout(sharing)
      if (pushing) clearTimeout(pushing)
      clearInterval(timer)
      clearInterval(delivery)
      clearInterval(announcer)
      clearInterval(presenceTimer)
      for (const t of floodRetry.values()) clearTimeout(t)
      presence.destroy()
      servers.destroy()
      for (const j of pending.values()) j.done(new Error('Closed'))
      clearInterval(watcher)
      clearInterval(namer)
      clearInterval(probeReset)
      clearInterval(receiptTimer)
      relay.closeAll()
      files.destroy()
      await net.destroy()
    },
  }
}
