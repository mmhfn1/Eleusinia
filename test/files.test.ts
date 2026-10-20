import { randomBytes } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { createFiles } from '../src/main/files'
import { CHUNK, type FileRef, autoFetch, evict, inlineKind, mimeOf, safeName, validFileRef, validFiles } from '../src/shared/media'
import type { FileState, Msg, Wire } from '../src/shared/protocol'

const H = 'ab'.repeat(32)
const ref: FileRef = { h: H, n: 'cat.png', s: 10, t: 'image/png' }

test('file references from others are checked strictly', () => {
  expect(validFileRef(ref)).toBe(true)
  expect(validFileRef({ ...ref, th: 'data:image/webp;base64,AAAA' })).toBe(true)
  for (const bad of [{ h: 'xyz' }, { n: '../x' }, { n: 'a\\b' }, { n: '' }, { n: 'x'.repeat(201) }, { s: -1 }, { s: 1.5 }, { t: 'IMAGE/png' }, { th: 'data:image/svg+xml;base64,AA' }]) {
    expect(validFileRef({ ...ref, ...bad })).toBe(false)
  }
  expect(validFiles([])).toBe(false)
  expect(validFiles(Array(11).fill(ref))).toBe(false)
})

test('scripts are never shown inline, and only pictures download by themselves', () => {
  expect(inlineKind('image/png')).toBe('image')
  expect(inlineKind('video/mp4')).toBe('video')
  expect(inlineKind('image/svg+xml')).toBe(null)
  expect(inlineKind('text/html')).toBe(null)
  expect(inlineKind('toString')).toBe(null)
  expect(autoFetch(ref)).toBe(true)
  expect(autoFetch({ ...ref, s: 26 * 2 ** 20 })).toBe(false)
  expect(autoFetch({ ...ref, t: 'video/mp4' })).toBe(false)
  expect(mimeOf('A.JPG')).toBe('image/jpeg')
  expect(mimeOf('setup.exe')).toBe('application/octet-stream')
})

test('names from others are made safe to save on Windows', () => {
  expect(safeName('..\\..\\evil.exe')).toBe('.._.._evil.exe')
  expect(safeName('con.txt')).toBe('_con.txt')
  expect(safeName('notes. . ')).toBe('notes')
  expect(safeName('')).toBe('file')
})

test('the cache drops the least recently used first, only as much as needed', () => {
  const c = [
    { h: 'new', size: 5, at: 3 },
    { h: 'old', size: 5, at: 1 },
    { h: 'mid', size: 5, at: 2 },
  ]
  expect(evict(c, 10)).toEqual(['old'])
  expect(evict(c, 15)).toEqual([])
  expect(evict(c, 0)).toEqual(['old', 'mid', 'new'])
})

// Peers wired to each other in memory, with a hook to tamper with or drop what crosses.
function mesh(names: string[], convMembers: string[]) {
  const peers: Record<string, ReturnType<typeof createFiles>> = {}
  const states: Record<string, Record<string, FileState>> = {}
  const up = new Set(names)
  const net = { tamper: (_from: string, _to: string, w: Wire): Wire | null => w }
  for (const me of names) {
    states[me] = {}
    peers[me] = createFiles({
      dir: mkdtempSync(join(tmpdir(), 'eleusinia-files-')),
      me,
      send(to, w) {
        const v = up.has(me) && up.has(to) ? net.tamper(me, to, w) : null
        if (!v) return
        setImmediate(() => {
          if (!up.has(to)) return
          const p = peers[to] as any
          if (v.t === 'get') p.onGet(me, v.h, v.off)
          if (v.t === 'part') p.onPart(me, v.h, v.off, v.d)
          if (v.t === 'nope') p.onNope(me, v.h)
        })
      },
      linked: (k) => up.has(k) && k !== me,
      relayed: () => false,
      backlog: () => 0,
      members: (conv) => (conv === 'c' ? convMembers : []),
      emit: (f) => (states[me][f.h] = f),
      limitMB: () => undefined,
    })
  }
  const down = (k: string) => (up.delete(k), names.forEach((n) => n !== k && peers[n].closed(k)))
  const back = (k: string) => (up.add(k), names.forEach((n) => n !== k && peers[n].opened(k)))
  return { peers, states, net, down, back }
}
const msgOf = (author: string, f: FileRef): Msg => ({ conv: 'c', author, seq: 1, ts: Date.now(), text: '', files: [f], sig: '' })
const until = (ok: () => boolean) => expect.poll(ok, { timeout: 10000, interval: 20 }).toBe(true)
const bigFile = (bytes: number) => {
  const p = join(mkdtempSync(join(tmpdir(), 'eleusinia-src-')), 'big.bin')
  writeFileSync(p, randomBytes(bytes))
  return p
}

test('a file downloads piece by piece, resumes after the link drops, and is saved where asked', async () => {
  const { peers, states, net, down, back } = mesh(['a', 'b'], ['a', 'b'])
  const src = bigFile(CHUNK * 20 + 123)
  const f = await peers.a.addPath(src)
  expect(f.t).toBe('application/octet-stream')
  peers.a.note(msgOf('a', f))
  peers.b.note(msgOf('a', f))
  expect(peers.b.status(f.h).state).toBe('none') // not a picture: only on request
  const to = join(mkdtempSync(join(tmpdir(), 'eleusinia-dl-')), 'got.bin')
  // Pieces past the fifth are held back until the link drops, so it drops mid-download.
  net.tamper = (from, to, w) => (w.t === 'part' && w.off >= CHUNK * 5 ? null : w)
  peers.b.fetch(f.h, to)
  await until(() => peers.b.status(f.h).got === CHUNK * 5) // progress events are spaced out; status is exact
  down('a')
  net.tamper = (from, to, w) => w
  await until(() => states.b[f.h]?.state === 'waiting')
  const kept = states.b[f.h].got
  back('a')
  await until(() => states.b[f.h]?.state === 'done')
  expect(states.b[f.h].got).toBeGreaterThan(kept)
  expect(states.b[f.h].saved).toBe(to)
  expect(readFileSync(to).equals(readFileSync(src))).toBe(true)
}, 20000)

test('nobody outside the conversation can fetch a file, and a guessed hash gets the same answer', async () => {
  const { peers, net } = mesh(['a', 'b', 'eve'], ['a', 'b'])
  const f = peers.a.addBytes('cat.png', 'image/png', randomBytes(1000))
  peers.a.note(msgOf('a', f))
  const seen: Wire[] = []
  net.tamper = (from, to, w) => (to === 'eve' && seen.push(w), w)
  ;(peers.a as any).onGet('eve', f.h, 0)
  ;(peers.a as any).onGet('eve', 'cd'.repeat(32), 0)
  await until(() => seen.length === 2)
  expect(seen).toEqual([{ t: 'nope', h: f.h }, { t: 'nope', h: 'cd'.repeat(32) }])
})

test('a picture arrives by itself; a damaged one is thrown away, then taken from another member', async () => {
  const { peers, states, net, down } = mesh(['a', 'b', 'c'], ['a', 'b', 'c'])
  const data = randomBytes(CHUNK + 50)
  const f = peers.a.addBytes('cat.png', 'image/png', data)
  peers.a.note(msgOf('a', f))
  peers.b.note(msgOf('a', f))
  await until(() => states.b[f.h]?.state === 'done')
  expect(readFileSync(peers.b.pathOf(f.h)!.path).equals(data)).toBe(true)

  // A corrupts what it sends to C: the hash check fails, and the retry comes from B.
  net.tamper = (from, to, w) => (from === 'a' && to === 'c' && w.t === 'part' ? { ...w, d: Buffer.alloc(Buffer.from(w.d, 'base64').length).toString('base64') } : w)
  peers.c.note(msgOf('a', f))
  await until(() => states.c[f.h]?.state === 'failed')
  expect(states.c[f.h].why).toMatch(/damaged/)
  down('a')
  net.tamper = (from, to, w) => w
  peers.c.fetch(f.h)
  await until(() => states.c[f.h]?.state === 'done')
  expect(readFileSync(peers.c.pathOf(f.h)!.path).equals(data)).toBe(true)
}, 20000)
