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
  isPicture,
  isUsername,
  normHandle,
  type Version,
  versionOf,
} from '../shared/protocol'
import { idSeed, readClaims, signClaim, withClaim, writeClaims } from '../shared/idcard'
import { type FileRef, validFiles } from '../shared/media'
import { type Area, type Report, cleanReport } from '../shared/reports'
import { mergeGroup, missing, signAdd, signLeft, signMsg, validGroup, verifyAdd, verifyMsg } from '../shared/sync'
import { createFiles } from './files'
import { type RelayLimits, RELAY_LIMITS, createNet } from './network'
import { createRelay } from './relay'

type Saved = {
  profile: Profile
  friends: Record<Key, FriendStatus>
  profiles: Record<Key, Profile>
  groups: Record<string, Group>
  acked: Record<string, number> // per conversation: my highest seq some peer has confirmed holding
  settings: Settings
  declined?: Record<Key, number> // when we declined or removed someone: their announced requests are ignored for a while
  accepted?: Record<Key, number> // requests we accepted that they have not yet confirmed over a link
  requestedAt?: Record<Key, number> // when each waiting request arrived, so a full list drops the oldest
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
  strict?: boolean // testing: direct connections fail for real, as behind a strict router, so only a relay links
  relayLimits?: RelayLimits // testing: smaller caps on what we relay for contacts
  inbox?: Key // the developers' inbox, where problem and crash reports go
  version?: string // this app's version, told to everyone we greet
  diag?: (area: Area, text: string) => void // diagnostic events, kept in memory by the caller
}

// Conversations whose messages stay in memory; the open one and a couple being synced.
const KEEP_LOGS = 3

// Everything except the window: friends, groups, message logs and their sync. No Electron imports, so tests can run it.
export function createNode({ dir, keyPair, emit, dht, redialMs = 15000, noDirect = false, inbox, diag = () => {}, version = '0.0.0', links, strict, relayLimits, maxRequests = 200 }: Opts) {
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
    relayed: net.keys().filter((k) => known(k) && relayedVia.has(k)),
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
      ...(relayKey && { relay: relayKey }),
    })
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
    if (!net.linked(key)) return need(key), net.dial(key)
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
      // Kept a couple of minutes, so sending them a request right after the search needs no new connection.
      setTimeout(() => !wants(key) && s.friends[key] !== 'incoming' && net.drop(key), 120000)
      resolve(p)
    }
    asking.set(key, { done, promise })
    if (net.linked(key)) net.send(key, { t: 'who' })
    else net.dial(key)
    return promise
  }

  // At most 200 waiting requests. New identities cost nothing, so a full list drops its oldest rather than refusing new
  // ones: a flood of made-up requests can never block real ones for good, and Decline all clears it.
  const declinedRecently = (k: Key) => (s.declined?.[k] ?? 0) > Date.now() - 30 * 864e5
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
      } else if (asks && !st && !declinedRecently(key)) {
        takeRequest(key) // a declined request stays declined, however it arrives
      } else if (said && !asks && st === 'friend') {
        s.friends[key] = 'outgoing' // they removed us: still wanted on our side, but no longer mutual
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

    if (w.t === 'get') return files.onGet(key, w.h, w.off)
    if (w.t === 'part') return files.onPart(key, w.h, w.off, w.d)
    if (w.t === 'nope') return files.onNope(key, w.h)
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
      used.set(key, Date.now())
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
      used.set(key, Date.now())
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
    } else if (w.t === 'reach') {
      if (!isKey(w.key)) return
      if (typeof w.ok === 'boolean') return reaching.get(w.key)?.(key, w.ok)
      // Yes only for two of our contacts, with the target linked to us and relaying too (so its version can).
      const n = (asked.get(key) ?? 0) + 1
      asked.set(key, n)
      const ok = !!relayKey && n <= 10 && w.key !== key && known(w.key) && net.linked(w.key) && relayKeys.has(w.key)
      if (!ok) diag('network', `can't relay for …${key.slice(-6)} to …${w.key.slice(-6)}: ${!relayKey ? 'relaying off' : !known(w.key) ? 'not a contact' : !net.linked(w.key) ? 'not linked with them' : !relayKeys.has(w.key) ? 'they do not relay' : 'too many asks'}`)
      net.send(key, { t: 'reach', key: w.key, ok })
    } else if (w.t === 'relayed') {
      if (!isKey(w.by) || !known(w.by) || !relayKey) return
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
  const RETRY = redialMs * 2 // first backoff after a failed attempt: 30 s in use, doubling up to 20 times that
  let relayKey: Key | null = null // ours, while relaying is on
  const relayKeys = new Map<Key, Key>() // contacts that relay, by the relay key their hello gave
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
  const need = (k: Key) => void (relayKey && k !== me && !net.linked(k) && !demand.has(k) && demand.set(k, Date.now()))

  function relayFailed(k: Key, by?: Key) {
    attempting.delete(k)
    pendingVia.delete(k)
    const n = (fails.get(k) ?? 0) + 1
    fails.set(k, n)
    retryAt.set(k, Date.now() + RETRY * Math.min(2 ** (n - 1), 20))
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
    diag('network', `asking ${cands.length} contact${cands.length === 1 ? '' : 's'} to relay for …${k.slice(-6)}`)
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
    // Nobody to ask, or nobody able yet (often a mutual friend still linking with them): asked again on the next tick,
    // without backing off, since asking costs a few small messages. Only a relayed dial that fails backs off.
    if (!by || !relayKeys.has(by)) return diag('network', `no contact could relay for …${k.slice(-6)} yet`), void attempting.delete(k)
    diag('network', `linking with …${k.slice(-6)} through …${by.slice(-6)}`)
    pendingVia.set(k, by)
    net.dial(k, relayKeys.get(by))
  }
  function relayTick() {
    if (!relayKey) return
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
    relayKey = await net.setRelay(!!s.settings.relay, known, relayLimits ?? RELAY_LIMITS)
    if (!relayKey) for (const k of relayedVia.keys()) net.drop(k)
    for (const k of net.keys()) if (wants(k)) hi(k)
  }

  const net = createNet(
    keyPair,
    {
      open(key) {
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
        diag('network', `linked with …${key.slice(-6)}${by ? ' through a friend' : ''}${known(key) ? '' : key === inbox ? ' (developers inbox)' : ' (not a friend)'}`)
        if (key === inbox) deliver()
        if (wants(key)) greet(key)
        if (asking.has(key)) net.send(key, { t: 'who' })
        if (known(key)) files.opened(key)
        push()
      },
      close(key) {
        diag('network', `link closed with …${key.slice(-6)}`)
        relay.close(key)
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
  const relay = createRelay((key, b) => net.packet(key, b))
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
  })

  // Someone offline is dialled less and less often (15 s, doubling to 5 minutes in use): every dial is a DHT lookup,
  // and many offline friends would otherwise cost a steady stream of them. Coming back online, they dial us anyway.
  const retries = new Map<Key, { n: number; next: number }>()
  let joined = false
  net.listening.then(() => (joined = true), () => {})
  // Not while relaying is on: a relay needs its contacts linked as soon as they can be, or pairs wait minutes.
  const due = (k: Key) => !!relayKey || (retries.get(k)?.next ?? 0) <= Date.now()
  function backOff(k: Key) {
    const n = (retries.get(k)?.n ?? 0) + 1
    retries.set(k, { n, next: Date.now() + Math.min(redialMs * 2 ** (n - 1), redialMs * 20) })
  }
  const redial = () => {
    relayTick()
    const keys = new Set(ours().flatMap((g) => g.members))
    for (const [k, st] of Object.entries(s.friends)) if (st !== 'incoming') keys.add(k)
    keys.delete(me)
    for (const k of keys) if (due(k)) net.dial(k)
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
  // Friend requests do not depend on a direct link, which two strict routers may never manage. Asking someone announces
  // us on a topic only they watch, and accepting announces back; each side looks at its own topic every 30 seconds.
  // Our profile card (no picture) is published as a record signed by our key, so a request or a search result shows
  // who it is without connecting. The direct link, when there is one, still carries everything at once.
  const requestTopic = (key: Key) => createHash('sha256').update('eleusinia-request:' + key).digest()
  const ACCEPT_FOR = 7 * 864e5 // an acceptance is announced until they confirm it, at most this long
  function requesting() {
    // Acceptances past their time, or for someone no longer a friend, are dropped so the saved state does not grow.
    for (const [k, at] of Object.entries(s.accepted ?? {})) if (s.friends[k] !== 'friend' || at <= Date.now() - ACCEPT_FOR) delete s.accepted![k]
    return [...Object.keys(s.friends).filter((k) => s.friends[k] === 'outgoing'), ...Object.keys(s.accepted ?? {})]
  }
  let published = 0
  function publishCard() {
    if (!s.profile.handle) return
    published = Math.max(published + 1, Math.floor(Date.now() / 1000))
    const { name, handle, about } = s.profile
    net.publish(Buffer.from(JSON.stringify({ name, handle, about })), published)
  }
  async function fetchCard(key: Key): Promise<Profile | null> {
    const value = await Promise.race([net.fetch(key), new Promise<null>((r) => setTimeout(() => r(null), 6000))])
    try {
      const p = cleanProfile({ ...JSON.parse(String(value)), avatar: '' })
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

  let checking = false
  async function checkRequests() {
    if (checking || !s.profile.handle) return
    checking = true
    try {
      let change = false
      for (const k of await net.lookup(requestTopic(me)).catch(() => [] as Key[])) {
        if (k === me || !isKey(k)) continue
        const st = s.friends[k]
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
    }
  }
  const announce = async () => {
    if (!s.profile.handle) return
    if (Date.now() / 1000 - published > 6 * 3600) publishCard() // records last 48 hours
    if (Date.now() - idPublished > 6 * 3600e3) publishId().then(keepFriendsFindable).catch(() => {})
    await Promise.all([...topicsOf(s.profile.handle), ...requesting().map(requestTopic)].map(net.announce))
  }
  const ready = Promise.all([applyRelay(), announce().then(checkRequests)])
  const announcer = setInterval(announce, 5 * 60000)
  const watcher = setInterval(checkRequests, redialMs * 2) // every 30 s in use

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
      publishCard()
      for (const k of net.keys()) if (wants(k)) hi(k)
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
      const [around, owners] = await Promise.all([net.lookup(exact ? topic(q) : prefixTopic(user)), exact ? idOwners(q) : Promise.resolve([] as Key[])])
      const keys = [...new Set([...around, ...owners])].filter((k) => k !== me).slice(0, 8)
      // Their card over a link (with their picture) and their published record (without) are asked for together:
      // the record answers even when no link can be made.
      // linked: false means only the record answered so far (no picture); asking again may find the link made.
      const best = async (key: Key) => {
        const [viaLink, record] = await Promise.all([card(key), fetchCard(key)])
        return viaLink.handle ? { profile: viaLink, linked: true } : { profile: record ?? viaLink, linked: false }
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
      if (!isKey(key) || key === me) throw new Error('That is not someone you can add')
      if (profile) s.profiles[key] ??= cleanProfile(profile)
      if (s.declined) delete s.declined[key]
      delete s.requestedAt?.[key]
      if (s.friends[key] === 'incoming') {
        s.friends[key] = 'friend'
        s.accepted = { ...s.accepted, [key]: Date.now() }
      } else if (!s.friends[key]) s.friends[key] = 'outgoing'
      changed()
      reach(key)
      net.announce(requestTopic(key)) // reaches them even if no direct link can be made
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
      const id = randomBytes(16).toString('hex')
      const members = [...new Set(others.filter((k) => s.friends[k] === 'friend'))]
      const adds = Object.fromEntries(members.map((k) => [k, signAdd(id, k, keyPair)]))
      const g = mergeGroup(undefined, { id, name: String(name).slice(0, 100), members: [me, ...members], updatedAt: Date.now(), adds })
      s.groups[id] = g
      changed()
      spread(g)
      return g.id
    },
    // A new picture for a group (or '' to go back to its letter), told to every member like any other change.
    setGroupPicture(id: string, avatar: string) {
      const g = Object.hasOwn(s.groups, id) ? s.groups[id] : undefined
      if (!g || !g.members.includes(me)) throw new Error('You are not in that group')
      if (avatar !== '' && !isPicture(avatar)) throw new Error('That picture cannot be used')
      const { avatar: _old, ...rest } = g
      s.groups[id] = mergeGroup(undefined, { ...rest, ...(avatar && { avatar }), updatedAt: Math.max(Date.now(), g.updatedAt + 1) })
      changed()
      spread(s.groups[id])
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
      members(conv).forEach(need) // looking at a conversation is a reason to reach its people
      const all = msgsOf(conv)
      const n = Math.max(1, Number(limit) || 1)
      return { msgs: all.length > n ? [...all].sort((a, b) => a.ts - b.ts).slice(-n) : all, acked: s.acked[conv] ?? 0, total: all.length }
    },
    // Works with nobody online: the message is logged now and synced whenever a member connects.
    // refs: files added with addFile or addBytes first, so we can hand them to whoever asks.
    send(conv: string, text: string, refs?: FileRef[]) {
      const ms = members(conv)
      const withFiles = refs !== undefined && refs.length > 0
      if (withFiles && (!validFiles(refs) || refs.some((f) => files.status(f.h).state !== 'done'))) throw new Error('Cannot send those files')
      if (!ms.length || typeof text !== 'string' || (!text && !withFiles) || text.length > MAX_TEXT) throw new Error('Cannot send that')
      const base = { conv, author: me, seq: (haveOf(conv)[me] ?? 0) + 1, ts: Date.now(), text }
      const m = signMsg(withFiles ? { ...base, files: refs.map(({ h, n, s, t, th }) => ({ h, n, s, t, ...(th && { th }) })) } : base, keyPair.secretKey)
      append(m)
      for (const k of ms) if (k !== me) net.send(k, { t: 'msg', m }), used.set(k, Date.now()), need(k)
    },
    // Leaving is signed and permanent. The group's messages are deleted from this computer.
    leaveGroup(id: string) {
      const g = Object.hasOwn(s.groups, id) ? s.groups[id] : undefined
      if (!g || !g.members.includes(me)) return
      s.groups[id] = mergeGroup(undefined, { ...g, left: { ...g.left, [me]: signLeft(id, keyPair) } })
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
      for (const f of ['state.json', 'state.json.tmp', 'identity.json', 'msgs', 'files']) rmSync(join(dir, f), { recursive: true, force: true })
    },
    signal(conv: string, to: Key | null, data: unknown) {
      if (noDirect && (data as { k?: string })?.k === 'ice') return
      for (const k of members(conv)) if (k !== me && (!to || to === k)) net.send(k, { t: 'call', conv, data }), used.set(k, Date.now()), need(k)
    },
    // A UDP port on this machine that carries a call with `key` over the peer link (see relay.ts).
    relayOpen: (key: Key) => (known(key) ? relay.open(key) : null),
    relayClose: (key: Key) => relay.close(key),
    ping: () => net.ping(),
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
    async setSettings(p: Partial<Settings>) {
      const was = !!s.settings.relay
      Object.assign(s.settings, p)
      changed()
      if (p.cacheMB !== undefined) files.trim()
      if (was !== !!s.settings.relay) await applyRelay(), push()
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
    async destroy() {
      clearInterval(timer)
      clearInterval(delivery)
      clearInterval(announcer)
      clearInterval(watcher)
      clearInterval(probeReset)
      relay.closeAll()
      files.destroy()
      await net.destroy()
    },
  }
}
