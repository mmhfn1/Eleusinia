// A conversation's messages: history, live updates, delivery marks and the message box.
import { type ClipboardEvent, type DragEvent, type FormEvent, type KeyboardEvent, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { type FileRef, MAX_FILES, inlineKind, sizeLabel } from '../shared/media'
import { type FileState, type Msg, type State, MAX_TEXT, stack } from '../shared/protocol'
import * as call from './call'
import { Avatar, Dialog, Emblem, GroupEmblem, Icon } from './ui'
import { type People, type Run, api } from './common'

const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString()
const dayLabel = (ts: number) =>
  sameDay(ts, Date.now()) ? 'Today' : sameDay(ts, Date.now() - 864e5) ? 'Yesterday' : new Date(ts).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const clock = (ts: number) => new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

type ChatProps = { st: State; conv: string; title: string; people: People; run: Run; home: () => void; stage: ReactNode }

// Messages a conversation opens with; older ones load on request, so a long history costs nothing until wanted.
const PAGE = 200

export function Chat({ st, conv, title, people, run, home, stage }: ChatProps) {
  const [leaving, setLeaving] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [acked, setAcked] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [total, setTotal] = useState(0)
  const [more, setMore] = useState({ conv, limit: PAGE })
  const limit = more.conv === conv ? more.limit : PAGE
  const kept = useRef<number | null>(null) // the list's height before older messages were added above
  const [length, setLength] = useState(0)
  const list = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  const box = useRef<HTMLTextAreaElement>(null)
  const { prof, name, user, isOnline, show } = people
  const [attached, setAttached] = useState<FileRef[]>([])
  const [preparing, setPreparing] = useState(0)
  const [files, setFiles] = useState<Record<string, FileState>>({})
  const asked = useRef(new Set<string>())
  const [viewing, setViewing] = useState<FileRef | null>(null)

  useEffect(() => {
    api.call('history', conv, limit).then((h) => {
      setMsgs(h.msgs)
      setAcked(h.acked)
      setTotal(h.total)
      setLoaded(true)
    })
    return api.on((e) => {
      if (e.type === 'msg' && e.m.conv === conv) {
        setMsgs((m) => [...m, e.m])
        setTotal((t) => t + 1)
      }
      if (e.type === 'acked' && e.conv === conv) setAcked(e.seq)
      if (e.type === 'file') setFiles((f) => ({ ...f, [e.file.h]: e.file }))
    })
  }, [conv, limit])
  // Where each shown file stands (downloaded, loading, …), asked once per file; events keep it current after that.
  useEffect(() => {
    const hs = msgs.flatMap((m) => m.files?.map((f) => f.h) ?? []).filter((h) => !asked.current.has(h))
    if (!hs.length) return
    hs.forEach((h) => asked.current.add(h))
    api.call('fileStatus', hs).then((list: FileState[]) => setFiles((f) => ({ ...Object.fromEntries(list.map((x) => [x.h, x])), ...f })))
  }, [msgs])
  useEffect(() => setAttached([]), [conv])

  // Files picked, dropped or pasted: pictures are re-encoded without their metadata before they are attached.
  function attach(items: Parameters<typeof api.attach>[0] | null) {
    if (!items?.length) return
    setPreparing((n) => n + 1)
    run(
      api
        .attach(items)
        .then((refs) => setAttached((a) => [...a, ...refs].slice(0, MAX_FILES)))
        .finally(() => setPreparing((n) => n - 1)),
    )
  }
  const fromFiles = (list: FileList) =>
    Promise.all(
      [...list].map(async (f) => {
        const path = api.pathOf(f)
        return path ? { path } : { name: f.name || 'pasted.png', type: f.type, data: new Uint8Array(await f.arrayBuffer()) }
      }),
    )
  function drop(e: DragEvent) {
    if (!e.dataTransfer.files.length) return
    e.preventDefault()
    fromFiles(e.dataTransfer.files).then(attach)
  }
  function paste(e: ClipboardEvent) {
    if (!e.clipboardData.files.length) return
    e.preventDefault()
    fromFiles(e.clipboardData.files).then(attach)
  }
  // Follow new messages only if the reader was already at the bottom, or wrote the newest one themselves.
  useLayoutEffect(() => {
    const el = list.current
    if (el && kept.current !== null) (el.scrollTop += el.scrollHeight - kept.current), (kept.current = null) // stay on what was being read
    else if (el && (atBottom.current || msgs[msgs.length - 1]?.author === st.me)) el.scrollTop = el.scrollHeight
  }, [msgs, st.me])

  const group = st.groups[conv]
  const other = conv.split('_').find((k) => k !== st.me)!
  const addable = group ? Object.keys(st.friends).filter((k) => st.friends[k] === 'friend' && !group.members.includes(k) && !group.left?.[k]) : []
  const sorted = [...msgs].sort((a, b) => a.ts - b.ts)
  const lastDelivered = [...sorted].reverse().find((m) => m.author === st.me && m.seq <= acked)

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const input = e.currentTarget.elements.namedItem('text') as HTMLTextAreaElement
    if ((!input.value.trim() && !attached.length) || preparing) return
    run(api.call('send', conv, input.value.trim() ? input.value : '', attached))
    input.value = ''
    setAttached([])
    grow()
  }
  // The composer grows with its text up to a few lines, then scrolls.
  function grow() {
    const el = box.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
    setLength(el.value.length)
  }
  function keys(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      e.currentTarget.form?.requestSubmit()
    }
  }

  // Consecutive messages by the same author within five minutes share one header (see stack), never across days.
  const rows: ReactNode[] = []
  stack(msgs).forEach(({ m, first }, i, all) => {
    const prev = all[i - 1]?.m
    const newDay = !prev || !sameDay(prev.ts, m.ts)
    if (newDay) rows.push(<DayRule key={'d' + m.ts} ts={m.ts} />)
    const continued = !first && !newDay
    const mine = m.author === st.me
    const pending = mine && m.seq > acked
    rows.push(
      <div key={m.author + m.seq} className={`msg ${mine ? 'mine' : ''} ${continued ? 'continued' : ''}`}>
        <div className="msg-gutter">{continued ? <time className="msg-hover-time">{clock(m.ts)}</time> : <Avatar k={m.author} p={prof(m.author)} size={36} />}</div>
        <div className="msg-main">
          {!continued && (
            <div className="msg-head">
              {user(m.author)}
              <time dateTime={new Date(m.ts).toISOString()} title={new Date(m.ts).toLocaleString()}>
                {clock(m.ts)}
              </time>
            </div>
          )}
          {m.text && <p className="msg-text">{m.text}</p>}
          {m.files && (
            <div className="msg-files">
              {m.files.map((f) => (
                <Attachment key={f.h} f={f} st={files[f.h]} view={() => setViewing(f)} />
              ))}
            </div>
          )}
          {pending && (
            <span className="msg-status pending" title="Not delivered yet. It will be sent automatically when they are online.">
              <Icon name="clock" size={12} /> pending, sends when they are online
            </span>
          )}
          {m === lastDelivered && (
            <span className="msg-status delivered">
              <Icon name="check" size={12} /> Delivered
            </span>
          )}
        </div>
      </div>,
    )
  })

  return (
    <main className="workspace chat" onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()} onDrop={drop}>
      <header className="chat-head">
        {group ? (
          <>
            <GroupEmblem g={group} size={32} />
            <div className="row-text">
              <h1>{title}</h1>
              <span className="row-sub">{`${group.members.length} members · ${group.members.filter(isOnline).length} online`}</span>
            </div>
          </>
        ) : (
          <button className="chat-person" onClick={() => show(other)} aria-label={`Open ${title}'s profile`}>
            <Avatar k={other} p={prof(other)} size={32} online={isOnline(other)} />
            <span className="row-text">
              <span className="chat-title">{title}</span>
              <span className="row-sub">
                {prof(other).handle} · {isOnline(other) ? 'Online' : 'Offline'}
              </span>
            </span>
          </button>
        )}
        {addable.length > 0 && (
          <label className="add-member">
            <Icon name="userPlus" size={16} />
            <select aria-label="Add a member" value="" onChange={(e) => run(api.call('addToGroup', conv, e.target.value))}>
              <option value="">Add member…</option>
              {addable.map((k) => (
                <option key={k} value={k}>
                  {name(k)}
                </option>
              ))}
            </select>
          </label>
        )}
        {group && (
          <button className="icon-button" aria-label="Leave group" title="Leave group" onClick={() => setLeaving(true)}>
            <Icon name="leave" size={18} />
          </button>
        )}
      </header>
      {leaving && (
        <Dialog label="Leave group" close={() => setLeaving(false)}>
          <h1>Leave {title}?</h1>
          <p>Its messages are deleted from this computer, and you cannot be added back to this group.</p>
          <div className="form-actions">
            <button className="button" onClick={() => setLeaving(false)}>
              Cancel
            </button>
            <button
              className="button danger"
              onClick={() => {
                if (call.conv === conv) call.leave()
                run(api.call('leaveGroup', conv))
                home()
              }}
            >
              <Icon name="leave" size={16} /> Leave group
            </button>
          </div>
        </Dialog>
      )}

      {viewing && (
        <Dialog label={viewing.n} close={() => setViewing(null)} className="image-view">
          <img src={`eleusinia-file://${viewing.h}`} alt={viewing.n} />
          <p className="quiet">
            {viewing.n} · {sizeLabel(viewing.s)}
          </p>
        </Dialog>
      )}
      {stage}
      <div className="msgs" ref={list} onScroll={(e) => (atBottom.current = e.currentTarget.scrollHeight - e.currentTarget.scrollTop - e.currentTarget.clientHeight < 40)}>
        {loaded && !sorted.length && (
          <div className="empty-state">
            <Emblem size={84} className="faint" />
            <p className="empty-title">No messages yet</p>
            <p className="quiet">
              {group
                ? `Messages here travel directly between the members of ${title}. Members who are offline receive them when they return.`
                : `Messages travel directly between you and ${title}. If they are offline, yours wait and arrive when you are both online.`}
            </p>
          </div>
        )}
        {total > msgs.length && (
          <button
            className="button subtle earlier"
            onClick={() => {
              kept.current = list.current!.scrollHeight
              setMore({ conv, limit: limit + PAGE })
            }}
          >
            Show earlier messages
          </button>
        )}
        {rows}
      </div>

      <form className="send composer" onSubmit={submit}>
        {(attached.length > 0 || preparing > 0) && (
          <ul className="attach-list" aria-label="Attached files">
            {attached.map((f, i) => (
              <li key={f.h + i} className="attach-chip">
                {f.th ? <img src={f.th} alt="" /> : <Icon name="file" size={16} />}
                <span className="attach-name">{f.n}</span>
                <span className="attach-size">
                  {sizeLabel(f.s)}
                  {/* Only JPEG and PNG are re-encoded; other pictures keep whatever details they carry. */}
                  {inlineKind(f.t) === 'image' && f.t !== 'image/jpeg' && f.t !== 'image/png' && ' · sent as it is'}
                </span>
                <button type="button" className="icon-button" aria-label={`Remove ${f.n}`} onClick={() => setAttached((a) => a.filter((_, j) => j !== i))}>
                  <Icon name="close" size={14} />
                </button>
              </li>
            ))}
            {preparing > 0 && <li className="attach-chip quiet">Preparing…</li>}
          </ul>
        )}
        <button
          type="button"
          className="icon-button attach-button"
          aria-label="Attach files"
          title="Attach files (you can also drop or paste them)"
          disabled={attached.length >= MAX_FILES}
          onClick={() => run(api.pickFiles().then((refs) => setAttached((a) => [...a, ...refs].slice(0, MAX_FILES))))}
        >
          <Icon name="attach" size={18} />
        </button>
        <textarea
          ref={box}
          name="text"
          rows={1}
          aria-label={`Message ${title}`}
          placeholder={`Message ${title}`}
          maxLength={MAX_TEXT}
          onInput={grow}
          onKeyDown={keys}
          onPaste={paste}
          autoFocus
        />
        {length > MAX_TEXT - 500 && (
          <span className="counter" aria-live="polite">
            {MAX_TEXT - length} left
          </span>
        )}
        <button className="send-button" aria-label="Send message" title="Send (Enter). New line: Shift+Enter" disabled={(!length && !attached.length) || preparing > 0}>
          <Icon name="send" size={18} />
        </button>
      </form>
    </main>
  )
}

// One shared file in a message. Pictures show inline (a tiny preview until they arrive); videos and sounds play
// inline once downloaded; anything else is a card to download and then find in its folder.
function Attachment({ f, st, view }: { f: FileRef; st?: FileState; view: () => void }) {
  const kind = inlineKind(f.t)
  const done = st?.state === 'done'
  const src = `eleusinia-file://${f.h}`
  const pct = st && st.size ? Math.floor((st.got / st.size) * 100) : 0
  const save = () => api.saveFile(f.h, f.n)
  const line =
    st?.state === 'loading' ? `Downloading ${pct}%` : st?.state === 'waiting' ? `Waiting: ${st.why}` : st?.state === 'failed' ? `Failed: ${st.why}` : ''
  if (kind === 'image' && (done || f.th)) {
    return (
      <figure className="msg-image">
        {done ? (
          <button className="image-button" onClick={view} aria-label={`View ${f.n}`}>
            <img src={src} alt={f.n} loading="lazy" />
          </button>
        ) : (
          <img className="image-preview" src={f.th} alt={f.n} />
        )}
        {!done && (
          <figcaption>
            {line || sizeLabel(f.s)}
            {(!st || st.state === 'none' || st.state === 'failed') && (
              <button className="button subtle" onClick={() => api.call('download', f.h)}>
                <Icon name="download" size={14} /> {st?.state === 'failed' ? 'Try again' : 'Load picture'}
              </button>
            )}
          </figcaption>
        )}
      </figure>
    )
  }
  if (done && (kind === 'video' || kind === 'audio')) {
    return (
      <figure className={`msg-media ${kind}`}>
        {kind === 'video' ? <video src={src} controls preload="metadata" /> : <audio src={src} controls preload="metadata" />}
        <figcaption>
          {f.n} · {sizeLabel(f.s)}
        </figcaption>
      </figure>
    )
  }
  return (
    <div className="file-card">
      <Icon name="file" size={22} />
      <span className="row-text">
        <span className="row-title">{f.n}</span>
        <span className="row-sub">{line || sizeLabel(f.s)}</span>
      </span>
      {st?.state === 'loading' && <progress max={100} value={pct} aria-label={`Downloading ${f.n}`} />}
      {done && st?.saved && (
        <button className="button subtle" onClick={() => api.showFile(f.h)}>
          <Icon name="folder" size={14} /> Show in folder
        </button>
      )}
      {(!st || st.state === 'none' || st.state === 'failed') && (
        <button className="button subtle" onClick={save}>
          <Icon name="download" size={14} /> {st?.state === 'failed' ? 'Try again' : 'Download'}
        </button>
      )}
    </div>
  )
}

function DayRule({ ts }: { ts: number }) {
  return (
    <div className="day-rule" role="separator" aria-label={dayLabel(ts)}>
      <span />
      <b>{dayLabel(ts)}</b>
      <span />
    </div>
  )
}
