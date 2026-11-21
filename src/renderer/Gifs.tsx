// The GIF picker, wherever a GIF can go: a chat message, a profile picture or banner, a server's picture or banner.
// KLIPY search (main/klipy.ts; only what is typed goes there), the GIFs starred here, and the GIFs most recently used
// here (sent, received or picked), plus a GIF from the computer. Whatever is picked is a file on this computer by then,
// so it travels by hash like any shared file.
import { useEffect, useRef, useState } from 'react'
import type { FileRef } from '../shared/media'
import { MAX_GIF } from '../shared/protocol'
import { api } from './common'
import { Dialog, Icon } from './ui'

export type Picked = { ref: FileRef; data: Uint8Array }
type Hit = { id: string; title: string; w: number; h: number; preview: string; gif: string }
type Tab = 'search' | 'stars' | 'recent'

// A GIF from the computer, added like a pasted file, with its bytes for a still
export async function gifFile(f: File): Promise<Picked> {
  if (f.size > MAX_GIF) throw new Error('That GIF is over 25 MB')
  const data = new Uint8Array(await f.arrayBuffer())
  const [ref] = await api.attach([{ name: f.name || 'picture.gif', type: 'image/gif', data }])
  return { ref, data }
}

export function GifPicker({ close, pick }: { close: () => void; pick: (g: Picked) => Promise<unknown> | void }) {
  const [canSearch, setCanSearch] = useState<boolean | null>(null)
  const [tab, setTab] = useState<Tab>('recent')
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [more, setMore] = useState(false)
  const [local, setLocal] = useState<{ stars: FileRef[]; recent: FileRef[] }>({ stars: [], recent: [] })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const asked = useRef(0)

  const loadLocal = () => api.call('localGifs').then(setLocal, () => {})
  useEffect(() => {
    loadLocal()
    api.gif('search?').then((on) => (setCanSearch(on), on && setTab('search')))
  }, [])
  // Trending with nothing typed; a pause after typing before asking
  useEffect(() => {
    if (tab !== 'search' || !canSearch) return
    const n = ++asked.current
    const t = setTimeout(() => {
      api.gif('search', q).then(
        (h) => n === asked.current && (setHits(h), setMore(h.length === 24), setErr('')),
        (x) => n === asked.current && setErr(String(x.message ?? x).replace(/^.*Error: /, '')),
      )
    }, q ? 350 : 0)
    return () => clearTimeout(t)
  }, [q, tab, canSearch])

  const choose = (get: () => Promise<Picked>) => {
    if (busy) return
    setBusy(true)
    setErr('')
    get()
      .then(async (g) => (await pick(g), close()))
      .catch((x) => setErr(String(x.message ?? x).replace(/^.*Error: /, '')))
      .finally(() => setBusy(false))
  }
  const star = (h: string, on: boolean) => api.call('starGif', h, on).then(loadLocal)
  const starred = new Set(local.stars.map((f) => f.h))
  const list = tab === 'stars' ? local.stars : local.recent

  return (
    <Dialog label="Choose a GIF" close={close} className="gif-picker">
      <h2>Choose a GIF</h2>
      <div className="segmented" role="tablist" aria-label="GIFs from">
        {canSearch && (
          <button type="button" role="tab" aria-selected={tab === 'search'} className={tab === 'search' ? 'on' : ''} onClick={() => setTab('search')}>
            Search
          </button>
        )}
        <button type="button" role="tab" aria-selected={tab === 'stars'} className={tab === 'stars' ? 'on' : ''} onClick={() => setTab('stars')}>
          Starred
        </button>
        <button type="button" role="tab" aria-selected={tab === 'recent'} className={tab === 'recent' ? 'on' : ''} onClick={() => setTab('recent')}>
          Recent
        </button>
      </div>
      {tab === 'search' && <input type="search" className="gif-search" value={q} placeholder="Search KLIPY" aria-label="Search KLIPY" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} />}
      <div className="gif-grid" aria-busy={busy}>
        {tab === 'search'
          ? hits.map((g) => (
              <button key={g.id} type="button" className="gif-tile" title={g.title} disabled={busy} onClick={() => choose(() => api.gif('pick', g.gif))}>
                <img src={g.preview} alt={g.title} width={g.w} height={g.h} loading="lazy" />
              </button>
            ))
          : list.map((f) => (
              <div key={f.h} className="gif-tile">
                <button type="button" className="gif-use" disabled={busy} aria-label="Use this GIF" onClick={() => choose(() => api.gif('data', f.h))}>
                  <img src={`eleusinia-file://${f.h}`} alt="" loading="lazy" />
                </button>
                <button type="button" className={`icon-button gif-star ${starred.has(f.h) ? 'on' : ''}`} aria-pressed={starred.has(f.h)} aria-label={starred.has(f.h) ? 'Unstar' : 'Star'} onClick={() => star(f.h, !starred.has(f.h))}>
                  <Icon name="star" size={14} />
                </button>
              </div>
            ))}
      </div>
      {tab !== 'search' && !list.length && <p className="hint">{tab === 'stars' ? 'Star a GIF under Recent to keep it here.' : 'GIFs you send, receive or pick show up here.'}</p>}
      {tab === 'search' && more && (
        <button type="button" className="button subtle" onClick={() => api.gif('search', q, hits.length).then((h) => (setHits((x) => [...x, ...h]), setMore(h.length === 24)), () => setMore(false))}>
          More
        </button>
      )}
      {err && (
        <p role="alert" className="form-error">
          {err}
        </p>
      )}
      <div className="gif-foot">
        <label className={`button file-button ${busy ? 'disabled' : ''}`}>
          Upload a GIF
          <input
            type="file"
            accept="image/gif"
            className="visually-hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) choose(() => gifFile(f))
            }}
          />
        </label>
        {busy && <span className="hint">Getting the GIF…</span>}
        {tab === 'search' && <span className="hint gif-credit">Powered by KLIPY</span>}
      </div>
    </Dialog>
  )
}
