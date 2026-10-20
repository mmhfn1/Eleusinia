import { createHash } from 'node:crypto'
import { appendFileSync, closeSync, copyFileSync, createReadStream, existsSync, mkdirSync, openSync, readSync, renameSync, rmSync, statSync, writeFileSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { CHUNK, DEFAULT_CACHE_MB, type FileRef, autoFetch, evict, isMime, mimeOf } from '../shared/media'
import type { FileState, Key, Msg, Wire } from '../shared/protocol'

// Shared files. A message only carries each file's hash, name, size and type; the bytes are pulled in 64 KB pieces
// from a member of the conversation who has them (the sender first), a few pieces at a time so chat and call signals
// on the same link never wait long behind a big file. A download resumes from its .part file, and the whole file must
// match its hash before it is kept. We only serve files from conversations the asker is in.
//
// Kept on disk: pictures we send (copied without their metadata) and pictures downloaded by themselves, in files/,
// within the cache limit; other files we send stay where they are (only their path is noted), and files someone
// downloads go where they chose to save them.

type Entry = {
  size: number
  type: string
  by: Key // who sent it first; asked first
  convs: string[]
  at: number // last used, for the cache's oldest-first eviction
  path?: string // where the whole, checked file is
  mtime?: number // for a file we shared from where it was: changed since means it is no longer that file
  cache?: boolean // path is in files/, so it may be evicted
  mine?: boolean // we sent it: never evicted
  want?: boolean // a download was asked for and is not done yet (resumed after a restart)
  saveTo?: string
}
type Job = { from: Key | null; tried: Set<Key>; next: number; got: number; last: number; shown: number; failed?: string; checking?: boolean }

type Opts = {
  dir: string
  me: Key
  send: (key: Key, w: Wire) => void
  linked: (key: Key) => boolean
  relayed: (key: Key) => boolean
  backlog: (key: Key) => number // bytes waiting to leave on that link
  members: (conv: string) => Key[]
  emit: (f: FileState) => void
  limitMB: () => number | undefined
}

const WINDOW = 4 // pieces in flight per download
const STALL = 20000 // a sender quiet this long is given up on, and the next one asked
const BACKLOG = 4 * 2 ** 20 // past this much unsent to one peer, its requests wait (they are asked again)

export const hashFile = (path: string) =>
  new Promise<string>((resolve, reject) => {
    const h = createHash('sha256')
    createReadStream(path)
      .on('data', (d) => h.update(d))
      .on('end', () => resolve(h.digest('hex')))
      .on('error', reject)
  })

export function createFiles({ dir, me, send, linked, relayed, backlog, members, emit, limitMB }: Opts) {
  const root = join(dir, 'files')
  mkdirSync(root, { recursive: true })
  const indexFile = join(root, 'index.json')
  const entries: Record<string, Entry> = existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, 'utf8')) : {}
  const save = () => {
    writeFileSync(indexFile + '.tmp', JSON.stringify(entries))
    renameSync(indexFile + '.tmp', indexFile)
  }
  const jobs = new Map<string, Job>()
  const part = (h: string) => join(root, h + '.part')
  const sizeOf = (p: string) => (existsSync(p) ? statSync(p).size : 0)
  const isOwn = (h: string) => Object.hasOwn(entries, h)

  function status(h: string): FileState {
    const e = isOwn(h) ? entries[h] : undefined
    if (!e) return { h, state: 'none', got: 0, size: 0 }
    if (e.path) return { h, state: 'done', got: e.size, size: e.size, ...(!e.cache && !e.mine && { saved: e.path }) }
    const j = jobs.get(h)
    if (!j) return { h, state: 'none', got: sizeOf(part(h)), size: e.size }
    if (j.failed) return { h, state: 'failed', got: j.got, size: e.size, why: j.failed }
    if (j.from) return { h, state: 'loading', got: j.got, size: e.size }
    const onlyRelayed = sources(h, true).length > 0
    return { h, state: 'waiting', got: j.got, size: e.size, why: onlyRelayed ? 'waiting for a direct connection' : 'waiting for someone who has it to be online' }
  }
  const tell = (h: string) => emit(status(h))

  // Members linked to us who may have it: the sender first. A relayed link (a mutual friend's bandwidth) only carries
  // pictures small enough to download by themselves.
  function sources(h: string, relayedOnly = false) {
    const e = entries[h]
    const j = jobs.get(h)
    const all = [...new Set(e.convs.flatMap(members))].filter((k) => k !== me && linked(k) && !j?.tried.has(k))
    const ok = (k: Key) => !relayed(k) || autoFetch({ h, n: 'x', s: e.size, t: e.type })
    const list = all.filter((k) => (relayedOnly ? !ok(k) : ok(k)))
    return list.sort((a, b) => +(b === e.by) - +(a === e.by))
  }

  function pump(h: string) {
    const j = jobs.get(h)
    const e = entries[h]
    if (!j || !e || j.failed || j.checking) return
    if (j.got >= e.size) return finish(h)
    if (!j.from || !linked(j.from)) {
      j.from = sources(h)[0] ?? null
      j.next = j.got
      j.last = Date.now()
      tell(h)
      if (!j.from) return
    }
    while (j.next < e.size && j.next - j.got < WINDOW * CHUNK) {
      send(j.from, { t: 'get', h, off: j.next })
      j.next += CHUNK
    }
  }

  async function finish(h: string) {
    const j = jobs.get(h)!
    const e = entries[h]
    j.checking = true
    if (!existsSync(part(h))) writeFileSync(part(h), '') // an empty file has no pieces
    const ok = (await hashFile(part(h)).catch(() => '')) === h
    j.checking = false
    if (!isOwn(h)) return // forgotten meanwhile
    if (!ok) {
      rmSync(part(h), { force: true })
      j.failed = 'the file arrived damaged'
      j.got = 0
      return tell(h)
    }
    const to = e.saveTo ?? join(root, h)
    try {
      try {
        renameSync(part(h), to)
      } catch {
        copyFileSync(part(h), to) // another drive
        rmSync(part(h), { force: true })
      }
    } catch {
      j.failed = 'it could not be saved there'
      return tell(h)
    }
    jobs.delete(h)
    Object.assign(e, { path: to, cache: !e.saveTo, at: Date.now(), want: undefined, saveTo: undefined, ...(e.saveTo && { mtime: statSync(to).mtimeMs }) })
    save()
    tell(h)
    trim()
  }

  // Starts (or resumes, or retries) a download. saveTo: where the user chose to save it; otherwise into the cache.
  function fetch(h: string, saveTo?: string) {
    const e = isOwn(h) ? entries[h] : undefined
    if (!e || e.path) return
    if (saveTo) e.saveTo = saveTo
    e.want = true
    save()
    const got = sizeOf(part(h))
    const j = jobs.get(h)
    if (j && !j.failed) return pump(h)
    jobs.set(h, { from: null, tried: new Set(), next: got, got, last: Date.now(), shown: 0 })
    pump(h)
  }

  // Every file a message refers to, sent or received: noted with its conversation (which decides who may ask us for
  // it), and pictures small enough start downloading.
  function note(m: Msg) {
    for (const f of m.files ?? []) {
      const e = (entries[f.h] ??= { size: f.s, type: f.t, by: m.author, convs: [], at: m.ts })
      if (!e.convs.includes(m.conv)) e.convs.push(m.conv)
    }
    if (m.files) save()
    for (const f of m.files ?? []) if (autoFetch(f) && !entries[f.h].path) fetch(f.h)
  }

  // A file the user is sending from where it is: not copied, only hashed. It is served for as long as it stays unchanged.
  async function addPath(path: string): Promise<FileRef> {
    const st = statSync(path)
    if (!st.isFile()) throw new Error('Only files can be sent')
    const h = await hashFile(path)
    const n = basename(path)
    const e = (entries[h] ??= { size: st.size, type: mimeOf(n), by: me, convs: [], at: Date.now() })
    if (!e.path || e.cache) Object.assign(e, { path, mtime: st.mtimeMs, cache: false })
    e.mine = true
    save()
    return { h, n, s: st.size, t: e.type }
  }
  // A file the user is sending as bytes (a picture re-encoded without its metadata, or pasted): kept in files/.
  function addBytes(name: string, type: string, data: Uint8Array): FileRef {
    const h = createHash('sha256').update(data).digest('hex')
    const t = isMime(type) ? type : mimeOf(name)
    if (!existsSync(join(root, h))) writeFileSync(join(root, h), data)
    const e = (entries[h] ??= { size: data.byteLength, type: t, by: me, convs: [], at: Date.now() })
    Object.assign(e, { path: join(root, h), cache: true, mine: true, mtime: undefined })
    save()
    return { h, n: name, s: data.byteLength, t }
  }

  // The checked file behind a hash, for showing it; marks it used.
  function pathOf(h: string) {
    const e = isOwn(h) ? entries[h] : undefined
    if (!e?.path || !fresh(e)) return null
    e.at = Date.now()
    return { path: e.path, type: e.type }
  }
  // A file outside files/ may have been moved or edited since: then it is no longer the file with this hash.
  function fresh(e: Entry) {
    try {
      const st = statSync(e.path!)
      if (st.size === e.size && (e.cache || !e.mtime || st.mtimeMs === e.mtime)) return true
    } catch {}
    e.path = undefined
    e.cache = undefined
    save()
    return false
  }

  function onGet(key: Key, h: unknown, off: unknown) {
    if (typeof h !== 'string' || !/^[0-9a-f]{64}$/.test(h)) return
    // The same answer whether we lack it or it is not theirs to ask for, so nobody learns what we hold by guessing.
    const e = isOwn(h) ? entries[h] : undefined
    if (!e || !e.convs.some((c) => members(c).includes(key)) || !Number.isSafeInteger(off) || (off as number) < 0 || (off as number) >= e.size) return send(key, { t: 'nope', h })
    if (backlog(key) > BACKLOG) return // asked again once the stalled sender is given up on, or the link drains
    if (!e.path || !fresh(e)) return send(key, { t: 'nope', h })
    const buf = Buffer.alloc(Math.min(CHUNK, e.size - (off as number)))
    let fd: number | undefined
    try {
      fd = openSync(e.path, 'r')
      readSync(fd, buf, 0, buf.length, off as number)
    } catch {
      return send(key, { t: 'nope', h })
    } finally {
      if (fd !== undefined) closeSync(fd)
    }
    send(key, { t: 'part', h, off: off as number, d: buf.toString('base64') })
  }

  function onPart(key: Key, h: unknown, off: unknown, d: unknown) {
    const j = typeof h === 'string' ? jobs.get(h) : undefined
    if (!j || j.from !== key || off !== j.got || typeof d !== 'string' || j.checking) return // stale: from an earlier sender
    const e = entries[h as string]
    const buf = Buffer.from(d, 'base64')
    if (buf.length !== Math.min(CHUNK, e.size - j.got)) return giveUp(h as string)
    appendFileSync(part(h as string), buf)
    j.got += buf.length
    j.last = Date.now()
    if (j.got >= e.size || j.last - j.shown > 300) (j.shown = j.last), tell(h as string)
    pump(h as string)
  }

  // That sender cannot give us this file: the next one is asked.
  function giveUp(h: string) {
    const j = jobs.get(h)
    if (!j?.from) return
    j.tried.add(j.from)
    j.from = null
    pump(h)
  }
  const onNope = (key: Key, h: unknown) => typeof h === 'string' && jobs.get(h)?.from === key && giveUp(h)

  // Someone came online: worth asking again, including if they could not help before.
  function opened(key: Key) {
    for (const [h, j] of jobs) {
      j.tried.delete(key)
      if (!j.from && !j.failed) pump(h)
    }
  }
  function closed(key: Key) {
    for (const [h, j] of jobs) if (j.from === key) (j.from = null), pump(h)
  }
  const stall = setInterval(() => {
    for (const [h, j] of jobs) if (j.from && !j.checking && Date.now() - j.last > STALL) giveUp(h)
  }, 5000)

  function drop(h: string) {
    const e = entries[h]
    if (e.cache && e.path) rmSync(e.path, { force: true })
    rmSync(part(h), { force: true })
    jobs.delete(h)
    delete entries[h]
  }
  // Leaving a conversation: files only it referred to are forgotten, and deleted if they were in files/.
  function forgetConv(conv: string) {
    for (const [h, e] of Object.entries(entries)) {
      e.convs = e.convs.filter((c) => c !== conv)
      if (!e.convs.length && !e.mine) drop(h)
    }
    save()
  }
  // Downloaded pictures past the limit, oldest first. Never what we sent.
  function trim(limitBytes = (limitMB() ?? DEFAULT_CACHE_MB) * 2 ** 20) {
    const cached = Object.entries(entries).filter(([, e]) => e.cache && !e.mine && e.path)
    for (const h of evict(cached.map(([h, e]) => ({ h, size: e.size, at: e.at })), limitBytes)) {
      rmSync(entries[h].path!, { force: true })
      entries[h].path = undefined
      entries[h].cache = undefined
      tell(h)
    }
    save()
  }
  const cacheBytes = () => Object.values(entries).reduce((n, e) => n + (e.cache && !e.mine && e.path ? e.size : 0), 0)

  // Downloads asked for before a restart carry on.
  for (const [h, e] of Object.entries(entries)) if (e.want && !e.path) fetch(h)
  trim()

  return {
    note,
    addPath,
    addBytes,
    fetch,
    status,
    pathOf,
    onGet,
    onPart,
    onNope,
    opened,
    closed,
    forgetConv,
    trim,
    cacheBytes,
    clearCache: () => trim(0),
    destroy: () => clearInterval(stall),
  }
}
