// Drives three real app instances over the DevTools protocol: profile setup, friend search, layout, voice, and DMs and
// group messages with the recipient online and offline. They meet on a local test DHT, so a run depends on nothing
// outside this machine; ELEUSINIA_SMOKE_PUBLIC=1 uses the public DHT instead, for an occasional real-network check.
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import createTestnet from 'hyperdht/testnet.js'

// ELEUSINIA_SMOKE_EXE runs the packaged app instead (for example dist/win-unpacked/Eleusinia.exe after npm run dist).
const packaged = process.env.ELEUSINIA_SMOKE_EXE
const exe = packaged || (await import('electron')).default // path to the Electron binary on any OS
const app = packaged ? [] : [process.argv[2]]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const t0 = Date.now()
const children = []
setTimeout(() => (console.error('FAIL overall timeout'), children.forEach((c) => c.kill()), process.exit(2)), 420000)

const publicDht = process.env.ELEUSINIA_SMOKE_PUBLIC === '1'
const testnet = publicDht ? null : await createTestnet(3)
const bootstrap = testnet?.bootstrap.map((n) => `${n.host}:${n.port}`).join(',')
// The app reads ELEUSINIA_BOOTSTRAP only when set; in public mode it is removed, in case the shell has one.
const { ELEUSINIA_BOOTSTRAP: _, ...baseEnv } = process.env
// Updates are off, so a run against the packaged app never downloads a real release.
const appEnv = { ...(bootstrap ? { ...baseEnv, ELEUSINIA_BOOTSTRAP: bootstrap } : baseEnv), ELEUSINIA_NO_UPDATES: '1' }
console.log(publicDht ? 'DHT: public (ELEUSINIA_SMOKE_PUBLIC=1)' : `DHT: local test network at ${bootstrap}`)

// A developers' inbox of the test's own, never the real one, which every app below sends its reports to. No GitHub
// token is given, so it only keeps them as files.
const inboxDir = mkdtempSync(join(tmpdir(), 'eleusinia-inbox-'))
const inboxProc = spawn(exe, [...app, '--inbox'], { env: { ...appEnv, ELEUSINIA_INBOX_DIR: inboxDir, GITHUB_TOKEN: '', ELEUSINIA_REPORTS_REPO: '' }, stdio: ['ignore', 'pipe', 'ignore'] })
children.push(inboxProc)
appEnv.ELEUSINIA_INBOX = await new Promise((resolve, reject) => {
  let out = ''
  inboxProc.stdout.on('data', (d) => {
    out += d
    const m = out.match(/Eleusinia inbox ([0-9a-f]{64})/)
    if (m) resolve(m[1])
  })
  setTimeout(() => reject(new Error('the test inbox did not start')), 30000)
})
const inboxed = () => {
  const d = join(inboxDir, 'reports')
  return existsSync(d) ? readdirSync(d).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(d, f), 'utf8')).report) : []
}

// ELEUSINIA_SMOKE_RELAYED=1: Ann and Bob behave as behind strict routers and withhold direct call routes, so their chat
// and call can only go through Cy, the mutual friend, relaying. A shorter run of its own (see relayedRun).
const relayedMode = process.env.ELEUSINIA_SMOKE_RELAYED === '1'
const strictEnv = relayedMode ? { ELEUSINIA_STRICT: '1', ELEUSINIA_NO_DIRECT: '1' } : {}

async function launch(port, dir = mkdtempSync(join(tmpdir(), 'eleusinia-smoke-')), extraEnv = {}) {
  // The windows overlap, and Windows reports a covered window as hidden; the app then (rightly) asks not to be sent
  // video. Occlusion detection is off so every window counts as visible.
  const flags = [`--remote-debugging-port=${port}`, '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--disable-features=CalculateNativeWinOcclusion']
  const child = spawn(exe, [...app, ...flags], { env: { ...appEnv, ...extraEnv, ELEUSINIA_DATA: dir }, stdio: 'ignore' })
  children.push(child)
  let page
  for (let i = 0; i < 50 && !page; i++) {
    await sleep(300)
    page = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json()).then((l) => l.find((p) => p.type === 'page'), () => null)
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r) => (ws.onopen = r))
  let id = 1
  const pending = new Map()
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }))
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.method === 'Runtime.exceptionThrown') console.error(port, m.params.exceptionDetails.exception?.description)
    pending.get(m.id)?.(m)
  }
  // gesture: run as if the user clicked, which full screen requires.
  const ev = (expression, gesture = false) =>
    new Promise((resolve, reject) => {
      pending.set(++id, (m) => {
        const ex = m.result?.exceptionDetails
        ex ? reject(new Error(ex.exception?.description ?? ex.text)) : resolve(m.result.result.value)
      })
      ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true, userGesture: gesture } }))
    })
  // DevTools lists the page before it has loaded, when its title is still empty; read it once loading is done.
  let title = ''
  for (let i = 0; i < 50 && !title; i++) {
    title = await ev(`document.readyState === 'complete' ? document.title : ''`).catch(() => '')
    if (!title) await sleep(200)
  }
  // Minimised or normal, through the operating system (Electron does not offer this over DevTools). Windows only;
  // elsewhere the window simply stays in the background.
  const windowState = async (state) => {
    if (process.platform !== 'win32') return false
    const show = state === 'minimized' ? 6 : 9 // SW_MINIMIZE, SW_RESTORE
    const ps = `Add-Type -Name W -Namespace U -MemberDefinition '[DllImport(\"user32.dll\")] public static extern bool ShowWindow(IntPtr h, int c);'; [U.W]::ShowWindow((Get-Process -Id ${child.pid}).MainWindowHandle, ${show}) | Out-Null`
    await new Promise((r) => spawn('powershell', ['-NoProfile', '-Command', ps], { stdio: 'ignore' }).on('exit', r))
    return true
  }
  // Lets the test read what each call connection actually receives (getStats), without the app exposing anything.
  // Crashes the page as a real renderer crash would (Chromium's own command for it).
  const crash = () => ws.send(JSON.stringify({ id: ++id, method: 'Page.crash' }))
  await ev(`(() => { window.__pcs = []; const P = RTCPeerConnection; window.RTCPeerConnection = class extends P { constructor(...a) { super(...a); window.__pcs.push(this) } } })()`)
  return { child, ev, dir, title, windowState, crash }
}

// What one of the live connection's slots has received (see slotsOf in call.ts): 'sound' is the second audio.
const received = (slot, field = 'packetsReceived') => `(async () => {
  const pc = window.__pcs.find((p) => p.connectionState === 'connected')
  const ts = pc?.getTransceivers() ?? []
  const audio = ts.filter((x) => x.receiver.track.kind === 'audio')
  const t = { voice: audio[0], camera: ts.filter((x) => x.receiver.track.kind === 'video')[1], sound: audio[1] }['${slot}']
  let n = 0
  if (t) (await t.receiver.getStats()).forEach((r) => r.type === 'inbound-rtp' && (n = r.${field} ?? 0))
  return n
})()`

// Picks one of the test's own windows in the open share picker's visible tab, matched by exact title. Never falls
// back to anything else on the machine: if it is not offered, the run fails and says what was.
async function pickOwn(p, title) {
  const pick = `(() => { const s = [...document.querySelectorAll('dialog[open] [role=tabpanel] .source')].find((x) => x.textContent.trim() === ${JSON.stringify(title)}); return s ? (s.click(), true) : false })()`
  await until(`the picker offers the test's own window "${title}"`, () => p.ev(pick), 10).catch(async () => {
    const listed = await p.ev(`[...document.querySelectorAll('dialog[open] [role=tabpanel] .source')].map((x) => x.textContent.trim())`)
    throw new Error(`the test's own window "${title}" is not offered, so nothing else is shared instead; listed: ${JSON.stringify(listed)}`)
  })
  if (!(await p.ev(`document.querySelector('dialog[open] .source.chosen span')?.textContent.trim() === ${JSON.stringify(title)}`))) throw new Error(`"${title}" was not selected`)
}

async function until(label, fn, secs = 90) {
  const start = Date.now()
  for (let i = 0; i < secs * 2; i++) {
    const v = await fn().catch(() => false)
    if (v) return console.log(`ok   ${label} (${((Date.now() - start) / 1000).toFixed(1)}s)`), v
    await sleep(500)
  }
  throw new Error('timed out: ' + label)
}

// Goes Home first, since friends and groups are only listed there, and waits for the row: the Home list
// is drawn after the click returns.
const open = (text) => `(async () => {
  document.querySelector('button.home')?.click()
  for (let i = 0; i < 50; i++) {
    const row = [...document.querySelectorAll('.row-button')].find(x => x.textContent.includes('${text}'))
    if (row) return row.click()
    await new Promise(r => setTimeout(r, 100))
  }
  throw new Error('no row for ${text}')
})()`
const say = (text) => `(() => { const f = document.querySelector('form.send'); f.elements.text.value = '${text}'; f.requestSubmit() })()`
const shows = (text) => `!!document.querySelector('.msgs')?.textContent.includes('${text}')`
const pendingMark = `!!document.querySelector('.msgs')?.textContent.includes('pending')`
const body = (text) => `document.body.innerText.includes('${text}')`
// Watches the page for up to ms, true as soon as the condition holds: catches a state that comes and goes (a ring
// that follows the fake microphone's beeps) without depending on when a poll lands.
const seen = (cond, ms) => `new Promise((r) => { const t0 = Date.now(); const i = setInterval(() => { if (${cond}) (clearInterval(i), r(true)); else if (Date.now() - t0 > ${ms}) (clearInterval(i), r(false)) }, 20) })`
const press = (label) => `[...document.querySelectorAll('aside.voice button')].find(x => x.textContent.includes('${label}')).click()`
// Chromium's fake microphones beep the same tone at the same moments, so with both ends live Ann's echo canceller
// can take her beep for an echo of Bob's and remove it. Bob stays muted while a check needs to hear Ann.
async function bobQuiet(p, fn) {
  await p.ev(press('Mute'))
  await sleep(500)
  try {
    return await fn()
  } finally {
    await p.ev(press('Unmute'))
  }
}
// A tiny real PNG, run through the same shrink path a picked file takes.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

// Ann and Bob can never link directly; Cy is friends with both and relays. Turned on from Settings, as a person would.
async function relayedRun(ownTitles) {
  console.log('--- Relayed: Ann and Bob link only through Cy')
  for (const [p, n] of [[a, 'Ann'], [b, 'Bob'], [c, 'Cy']]) {
    await p.ev(`document.querySelector('.rail-item[aria-label="Settings"]').click()`)
    await until(`${n} turns on connecting through mutual friends in Settings`, () =>
      p.ev(`(() => { const l = [...document.querySelectorAll('dialog[open] label')].find((x) => x.textContent.includes('Connect through mutual friends')); if (!l) return false; const i = l.querySelector('input'); if (!i.checked) i.click(); return i.checked })()`), 10)
    await p.ev(`document.querySelector('dialog[open] .dialog-close').click()`)
  }
  const key = (p) => p.ev(`api.call('state').then((s) => s.me)`)
  const [ka, kb, kc] = [await key(a), await key(b), await key(c)]
  for (const [x, kx, y, ky, names] of [[a, ka, b, kb, 'Ann and Bob'], [a, ka, c, kc, 'Ann and Cy'], [b, kb, c, kc, 'Bob and Cy']]) {
    await x.ev(`api.call('addFriend', '${ky}')`)
    await until(`${names}: the request arrives`, () => y.ev(`api.call('state').then((s) => s.friends['${kx}'] === 'incoming')`))
    await y.ev(`api.call('addFriend', '${kx}')`)
    await until(`${names} are friends`, () => x.ev(`api.call('state').then((s) => s.friends['${ky}'] === 'friend')`))
  }
  // They met only through the DHT, so their names arrive with the first hello over the relayed link.
  await until('A and B link through Cy and learn each other\'s names', async () =>
    (await a.ev(`api.call('state').then((s) => s.profiles['${kb}']?.name === 'Bob')`)) && b.ev(`api.call('state').then((s) => s.profiles['${ka}']?.name === 'Ann')`), 120)
  await a.ev(open('Bob'))
  await b.ev(open('Ann'))
  await a.ev(say('through cy'))
  await until('B shows a DM that could only come through Cy', () => b.ev(shows('through cy')))
  await until('both see the link goes through a friend', async () =>
    (await a.ev(`api.call('state').then((s) => s.relayed.includes('${kb}'))`)) && b.ev(`api.call('state').then((s) => s.relayed.includes('${ka}'))`))
  await b.ev(say('reply via cy'))
  await until('A shows the reply', () => a.ev(shows('reply via cy')))
  await a.ev(`document.querySelector('.chat-person').click()`)
  await until("Bob's card says online through a friend, voice and text only", () => a.ev(`!!document.querySelector('dialog[open]')?.textContent.includes('Online through a friend')`), 10)
  await a.ev(`[...document.querySelectorAll('dialog[open] button')].find(x => x.textContent === 'Close').click()`)

  console.log('--- Relayed: a voice call, and no screen share')
  await a.ev(press('Start call'))
  await until('B sees the call', () => b.ev(`[...document.querySelectorAll('aside.voice button')].some(x => x.textContent.includes('Join call'))`))
  await b.ev(press('Join call'))
  await until('A connected to Bob', () => a.ev(`!!document.querySelector('.caller.state-connected')?.textContent.includes('Bob')`))
  await until('B hears Ann through the relay', async () => (await bobQuiet(b, () => b.ev(received('voice')))) > 50, 30)
  await a.ev(press('Share screen'))
  await until('A sees the share picker', () => a.ev(`document.querySelectorAll('dialog[open] .source').length > 0`), 20)
  await a.ev(`document.querySelector('dialog[open] #share-tab-window').click()`)
  await pickOwn(a, ownTitles[1])
  await a.ev(`[...document.querySelectorAll('dialog[open] button')].find((x) => x.textContent === 'Share').click()`)
  await sleep(8000)
  const screenIn = await b.ev(`(async () => { const pc = window.__pcs.find((p) => p.connectionState === 'connected'); const t = pc?.getTransceivers().filter((x) => x.receiver.track.kind === 'video')[0]; let n = 0; if (t) (await t.receiver.getStats()).forEach((r) => r.type === 'inbound-rtp' && (n = r.packetsReceived ?? 0)); return n })()`)
  if (screenIn > 20) throw new Error(`B received ${screenIn} screen packets through the relay, which carries voice only`)
  console.log(`ok   no screen video crossed the relay (${screenIn} packets)`)
}

const a = await launch(9231, undefined, strictEnv)
let b = await launch(9232, undefined, strictEnv)
const c = await launch(9233)
let failed = false
try {
  console.log('--- Profile setup')
  console.log('     window title:', a.title)
  if (a.title !== 'Eleusinia') throw new Error('wrong title')
  // Titles unique to this run, so the share step can pick a window of its own and never another app (or another
  // Eleusinia the person has open). The window title is what the share picker lists as the source name.
  const run = Date.now().toString(36)
  const ownTitles = [`Eleusinia smoke ${run} B`, `Eleusinia smoke ${run} C`]
  await b.ev(`document.title = ${JSON.stringify(ownTitles[0])}`)
  await c.ev(`document.title = ${JSON.stringify(ownTitles[1])}`)
  for (const [p, n] of [[a, 'Ann'], [b, 'Bob'], [c, 'Cy']]) {
    await until(`${n} sees setup first, with a generated picture`, () => p.ev(`${body('Create your account')} && !document.querySelector('aside') && !!document.querySelector('.portrait-pick .avatar svg rect')`))
    // Cy keeps the generated picture; Ann and Bob upload one.
    await p.ev(`(async () => {
      const f = document.querySelector('form.profile')
      if ('${n}' !== 'Cy') {
        const file = new File([Uint8Array.from(atob('${PNG}'), ch => ch.charCodeAt(0))], 'a.png', { type: 'image/png' })
        const dt = new DataTransfer(); dt.items.add(file)
        const input = f.querySelector('input[type=file]'); input.files = dt.files
        input.dispatchEvent(new Event('change', { bubbles: true }))
        await new Promise(r => setTimeout(r, 500))
        // The cropper opens; nudge the picture once, then keep it.
        const frame = document.querySelector('dialog[open] .crop-frame')
        frame.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
        ;[...document.querySelectorAll('dialog[open] button')].find(x => x.textContent.includes('Use picture')).click()
        await new Promise(r => setTimeout(r, 300))
      }
      f.elements.username.value = '${n}tester'; f.elements.name.value = '${n}'; f.elements.about.value = 'I am ${n}'; f.requestSubmit()
    })()`)
    await until(`${n} lands on Home`, () => p.ev(`!!document.querySelector('main.home')`))
  }
  if (relayedMode) await relayedRun(ownTitles)
  else {
  const ids = {}
  for (const [p, n] of [[b, 'Bob'], [c, 'Cy']]) {
    ids[n] = await p.ev(`document.querySelector('.friend-id b').textContent`)
    console.log(`     ${n} friend ID: ${ids[n]}`)
    if (!new RegExp('^' + n.toLowerCase() + 'tester#\\d{4}$').test(ids[n])) throw new Error('unexpected friend ID ' + ids[n])
  }

  console.log('--- Friend ID and Settings sections, bitrate (i)')
  await a.ev(`document.querySelector('.rail-item[aria-label="Settings"]').click()`)
  const layout = await a.ev(`(() => {
    const sec = document.querySelector('section.friend-id'), set = document.querySelector('dialog[open]')
    const tip = document.getElementById('bitrate-tip'), icon = document.querySelector('.info-icon[aria-describedby=bitrate-tip]')
    const hidden = getComputedStyle(tip).display
    icon.focus()
    const shown = getComputedStyle(tip).display
    const r = icon.getBoundingClientRect(), l = document.querySelector('label[for=bitrate]').getBoundingClientRect()
    return { idSection: !!sec && !sec.closest('dialog'), summary: set.querySelector('h1').textContent, hidden, shown, rightOfLabel: r.left >= l.right - 1 && Math.abs(r.top - l.top) < 12, tip: tip.textContent.slice(0, 60) }
  })()`)
  console.log('     ', JSON.stringify(layout))
  if (!(layout.idSection && layout.summary === 'Settings' && layout.hidden === 'none' && layout.shown === 'block' && layout.rightOfLabel)) throw new Error('settings layout wrong')
  console.log('ok   friend ID is its own section; Settings separate; (i) sits right of the bitrate and shows its tip on focus')
  await a.ev(`document.activeElement.blur(); document.querySelector('dialog[open] .dialog-close').click()`)

  console.log('--- Friend search suggestions')
  for (const [p, n] of [[b, 'Bob'], [c, 'Cy']]) {
    const tail = await p.ev(`api.call('state').then(s => s.me.slice(-6).toUpperCase())`)
    // Type the first 4 letters of the username, as a person would, and wait for the suggestion.
    const typed = n === 'Bob' ? ids[n].slice(0, 4).toUpperCase() : ids[n].toUpperCase()
    await a.ev(`(() => { const i = document.querySelector('.search-box input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '${typed}'); i.dispatchEvent(new Event('input', { bubbles: true })) })()`)
    const pic = n === 'Cy' ? '.avatar svg' : '.avatar img'
    await until(`typing "${typed}" suggests ${n}: ${n === 'Cy' ? 'generated' : 'uploaded'} picture, ID, Unique Key ${tail}`, () =>
      a.ev(`(() => { const r = document.querySelectorAll('.result'); return r.length === 1 && !!r[0].querySelector('${pic}') && r[0].textContent.includes('${ids[n]}') && r[0].querySelector('.tail').textContent === '${tail}' })()`))
    await a.ev(`document.querySelector('.result .add-friend').click()`)
    await until(`${n} sees the request with Ann's picture`, () => p.ev(`[...document.querySelectorAll('.request')].some(r => r.textContent.includes('Ann wants') && r.querySelector('.avatar img'))`))
    await p.ev(`[...document.querySelectorAll('.request button')].find(x => x.textContent === 'Accept').click()`)
  }

  console.log('--- Home: online and offline friends')
  await until('A lists Bob and Cy under Online, nobody under Offline', () => a.ev(`document.querySelectorAll('.online .row-button').length === 2 && document.querySelectorAll('.offline .row-button').length === 0`))

  console.log('--- DM, recipient online')
  await a.ev(open('Bob'))
  await b.ev(open('Ann'))
  await a.ev(say('dm online'))
  await until('B shows it', () => b.ev(shows('dm online')))
  await until('A shows it delivered', () => a.ev(`!${pendingMark}`))
  await a.ev(say('second line'))
  await until('B stacks the second message under the first (one name, one picture)', () =>
    b.ev(`[...document.querySelectorAll('.msg.continued')].some(p => p.textContent.includes('second line')) && document.querySelectorAll('.msg:not(.continued)').length === 1`))

  console.log('--- Profile card')
  await b.ev(`document.querySelector('.msg .user').click()`)
  await until('B clicking the name opens Ann card with picture, about, ID and Unique Key', () =>
    b.ev(`(() => { const d = document.querySelector('dialog[open]'); return !!d && d.textContent.includes('I am Ann') && d.textContent.includes('anntester#') && d.textContent.includes('Unique Key') && !!d.querySelector('.avatar img') })()`))
  await b.ev(`[...document.querySelectorAll('dialog button')].find(x => x.textContent === 'Close').click()`)
  // The same card from the DM header (picture, name and friend ID) and from a right-click in the friends list.
  const annCard = `(() => { const d = document.querySelector('dialog[open].card-dialog'); return !!d && d.textContent.includes('I am Ann') && d.textContent.includes('anntester#') && !!d.querySelector('.avatar img') && /Eleusinia \\d+\\.\\d+\\.\\d+/.test(d.textContent) })()`
  const closeCard = `[...document.querySelectorAll('dialog[open] button')].find(x => x.textContent === 'Close').click()`
  if (!(await b.ev(`(() => { const h = document.querySelector('.chat-person'); return !!h?.querySelector('.avatar') && h.textContent.includes('Ann') && h.textContent.includes('anntester#') })()`))) throw new Error('the DM header lacks the picture, name or friend ID')
  await b.ev(`document.querySelector('.chat-person').click()`)
  await until('clicking the DM header opens the same card', () => b.ev(annCard), 5)
  await b.ev(closeCard)
  await b.ev(`document.querySelector('button.home').click()`)
  await b.ev(`[...document.querySelectorAll('.online .row-button')].find((x) => x.textContent.includes('Ann')).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))`)
  await until('right-clicking Ann in the friends list opens the same card', () => b.ev(annCard), 5)
  await b.ev(closeCard)
  // Mouse 4 and 5 (back and forward) move through where you have been.
  const mouse = (button) => `window.dispatchEvent(new MouseEvent('mouseup', { button: ${button}, bubbles: true }))`
  await b.ev(open('Ann'))
  await until('B is back in the DM', () => b.ev(`!!document.querySelector('.chat-person')`), 5)
  await b.ev(mouse(3))
  await until('mouse 4 goes back: Home', () => b.ev(`!!document.querySelector('main.home')`), 5)
  await b.ev(mouse(4))
  await until('mouse 5 goes forward: the DM again', () => b.ev(`!!document.querySelector('.chat-person')`), 5)

  console.log('--- Voice call from the left sidebar')
  await a.ev(press('Start call'))
  const sign = (p) => p.ev(`(() => { const s = document.querySelector('.signal'); const tip = document.getElementById('ping-tip'); document.querySelector('.signal-icon').focus(); return s ? [s.className, s.textContent.includes('Voice Connected'), tip.textContent, getComputedStyle(tip).display] : null })()`)
  const graded = (s) => !!s && /\b(good|fair|poor)\b/.test(s[0]) && s[1] && s[3] === 'block'
  const alone = await until('A alone in the call: Voice Connected, coloured, ping to the network on focus', async () => {
    const s = await sign(a)
    return graded(s) && /Ping: \d+ ms/.test(s[2]) && s
  }, 20)
  console.log('     ', JSON.stringify(alone))
  await until('B sees the call in its sidebar', () => b.ev(`[...document.querySelectorAll('aside.voice button')].some(x => x.textContent.includes('Join call (1)'))`))
  await b.ev(press('Join call'))
  await until('A connected to Bob', () => a.ev(`!!document.querySelector('.caller.state-connected')?.textContent.includes('Bob')`))
  await until('B connected to Ann', () => b.ev(`!!document.querySelector('.caller.state-connected')?.textContent.includes('Ann')`))
  const both = await until('A sign now measures the link to Bob', async () => {
    const s = await sign(a)
    return graded(s) && /Bob: \d+ ms/.test(s[2]) && s
  }, 20)
  console.log('     ', JSON.stringify(both))
  await a.ev(`document.activeElement.blur()`)

  console.log('--- Screen sharing')
  await a.ev(press('Share screen'))
  // The Screens tab must list screens, but the test never captures one: it only ever shares its own windows.
  const src = await until('A sees the screens it could share', () =>
    a.ev(`(() => { const b = [...document.querySelectorAll('dialog[open] .source')]; return b.length > 0 && b.map((x) => x.textContent) })()`), 20)
  console.log('     ', src.length, 'screens listed (none captured), first:', src[0])
  const tabs = await a.ev(`[...document.querySelectorAll('dialog[open] [role=tab]')].map((t) => t.textContent + ':' + t.getAttribute('aria-selected'))`)
  if (JSON.stringify(tabs) !== '["Screens:true","Applications:false"]') throw new Error('picker tabs wrong: ' + JSON.stringify(tabs))
  await a.ev(`document.querySelector('dialog[open] #share-tab-window').click()`)
  const apps = await until('the Applications tab lists windows, or says there are none', () =>
    a.ev(`(() => { const d = document.querySelector('dialog[open] [role=tabpanel]'); const l = [...d.querySelectorAll('.source')].map((x) => x.textContent); return l.length ? l : d.textContent.includes('No application windows open') && [] })()`), 10)
  const hiddenNames = ['nvidia geforce overlay', 'nvidia overlay', 'xbox game bar', 'steam overlay', 'program manager', 'windows input experience', 'microsoft text input application']
  if ([...src, ...apps].some((n) => hiddenNames.includes(n.trim().toLowerCase()))) throw new Error('an overlay or system window is offered')
  console.log('ok   two tabs, Screens first;', apps.length, 'application windows; no overlays or system windows')
  await pickOwn(a, ownTitles[1])
  const menu = await until('the streaming menu defaults to 720p at 30 fps, and offers what the system allows', () =>
    a.ev(`(() => { const s = [...document.querySelectorAll('dialog[open] .quality select')]; return s.length === 3 && [s[0].value, s[1].value, [...s[0].options].map((o) => o.textContent), [...s[1].options].map((o) => o.value)] })()`), 10)
  console.log('     ', JSON.stringify(menu))
  if (menu[0] !== '720' || menu[1] !== '30') throw new Error('stream quality did not default to 720p at 30 fps')
  await a.ev(`[...document.querySelectorAll('dialog[open] button')].find((x) => x.textContent === 'Share').click()`)
  await until("B shows the shared window large, at 720p", () => b.ev(`document.querySelector('.stage .screen.big video')?.videoHeight === 720`), 30)
  // Full screen: the button enters it, and follows the document when it ends another way (Esc, F11).
  const fullBtn = `document.querySelector('.stage .screen.big .screen-full')`
  await b.ev(`${fullBtn}.click()`, true)
  await until('B enters full screen from the button, which now offers to exit', () =>
    b.ev(`!!document.fullscreenElement && ${fullBtn}.getAttribute('aria-label') === 'Exit full screen' && ${fullBtn}.title === 'Exit full screen'`), 5)
  await b.ev(`document.exitFullscreen()`)
  await until('B leaves full screen another way, and the button offers full screen again', () =>
    b.ev(`!document.fullscreenElement && ${fullBtn}.getAttribute('aria-label') === 'Full screen'`), 5)
  await b.ev(`${fullBtn}.click()`, true)
  await until('B enters again', () => b.ev(`!!document.fullscreenElement && ${fullBtn}.getAttribute('aria-label') === 'Exit full screen'`), 5)
  await b.ev(`${fullBtn}.click()`)
  await until('the same button exits', () => b.ev(`!document.fullscreenElement && ${fullBtn}.getAttribute('aria-label') === 'Full screen'`), 5)
  await until('A sees that it is sharing, with a stop button', () => a.ev(`document.querySelector('.stage .sharing-badge')?.textContent.includes('You are sharing') && !!document.querySelector('.stage .button.danger')`))
  if (menu[2].some((t) => t.startsWith('1080p'))) {
    await a.ev(press('Stream settings'))
    await until('the quality menu opens on the current choice', () => a.ev(`document.querySelector('dialog[open] .quality select')?.value === '720'`), 5)
    await a.ev(`(() => { const s = document.querySelector('dialog[open] .quality select'); s.value = '1080'; s.dispatchEvent(new Event('change', { bubbles: true })) })()`)
    await a.ev(`[...document.querySelectorAll('dialog[open] button')].find((x) => x.textContent === 'Apply').click()`)
    // A window can be shorter than 1080 pixels, so the picture grows to 1080p or the window's own height.
    await until('B now receives more than 720p, up to 1080p, as the streamer chose', () =>
      b.ev(`(() => { const h = document.querySelector('.stage .screen.big video')?.videoHeight; return h > 720 && h <= 1080 })()`), 30)
  }
  // Switching to the test's other window without stopping. Frames arriving is checked rather than their height, since
  // the two windows need not match.
  await a.ev(`[...document.querySelectorAll('.stage button')].find((x) => x.textContent.includes('Switch screen')).click()`)
  await until('the switch dialog opens on Applications, the tab of the window being shared, marking it', () =>
    a.ev(`document.querySelector('dialog[open] #share-tab-window')?.getAttribute('aria-selected') === 'true' && !!document.querySelector('dialog[open] .source.chosen')?.textContent.startsWith('Now sharing')`), 10)
  const arrow = (from, key) => a.ev(`(() => { const t = document.querySelector('dialog[open] #share-tab-${from}'); t.focus(); t.dispatchEvent(new KeyboardEvent('keydown', { key: '${key}', bubbles: true })) })()`)
  await arrow('window', 'ArrowLeft')
  await until('ArrowLeft moves to Screens and focuses it; screens listed, nothing chosen there', () =>
    a.ev(`document.activeElement?.id === 'share-tab-screen' && document.activeElement.getAttribute('aria-selected') === 'true' && !!document.querySelector('dialog[open] [role=tabpanel] .source') && !document.querySelector('dialog[open] .source.chosen') && document.querySelector('dialog[open] .button.primary').disabled`), 10)
  await arrow('screen', 'ArrowRight')
  await until('ArrowRight goes back to Applications, where the shared window is chosen again', () =>
    a.ev(`document.activeElement?.id === 'share-tab-window' && !!document.querySelector('dialog[open] .source.chosen')?.textContent.startsWith('Now sharing')`), 5)
  await pickOwn(a, ownTitles[0])
  await a.ev(`[...document.querySelectorAll('dialog[open] button')].find((x) => x.textContent === 'Switch').click()`)
  await until(`A switched to "${ownTitles[0]}" without stopping, and B still sees it`, async () =>
    (await a.ev(`document.querySelector('.stage .sharing-badge')?.textContent.includes(${JSON.stringify(ownTitles[0])})`)) &&
    (await b.ev(`document.querySelector('.stage .screen.big video')?.videoHeight > 0 && document.querySelector('.stage .screen.big figcaption').textContent.includes(${JSON.stringify(ownTitles[0])})`)), 30)
  await b.ev(`[...document.querySelectorAll('.stage button')].find((x) => x.textContent === 'Hide video').click()`)
  await until('B hides the screens (so A stops sending them)', () => b.ev(`!document.querySelector('.stage .screen') && document.querySelector('.stage').classList.contains('collapsed')`), 5)
  await b.ev(`[...document.querySelectorAll('.stage button')].find((x) => x.textContent === 'Show video').click()`)
  await until('B shows them again and frames flow', () => b.ev(`document.querySelector('.stage .screen.big video')?.videoHeight > 0`), 30)
  await a.ev(`[...document.querySelectorAll('.stage button')].find((x) => x.textContent === 'Stop sharing').click()`)
  await until('A stops; the stage closes for B', () => b.ev(`!document.querySelector('.stage')`), 10)

  console.log('--- Camera')
  await b.ev(press('Turn on camera'))
  const camMenu = await until('the camera dialog previews the camera, defaulting to 720p and 30 fps', () =>
    b.ev(`(() => { const s = [...document.querySelectorAll('dialog[open] .quality select')]; const v = document.querySelector('dialog[open] .camera-preview video'); return s.length === 3 && v?.videoHeight > 0 && [s[1].value, s[2].value, v.videoWidth + 'x' + v.videoHeight, [...s[1].options].map((o) => o.value), [...s[2].options].map((o) => +o.value)] })()`), 15)
  console.log('     ', JSON.stringify(camMenu))
  // 720p and 30 fps, or the closest the camera offers (Chromium's test camera stops below 30 fps).
  const fps = Math.max(camMenu[4][0], ...camMenu[4].filter((f) => f <= 30))
  if (camMenu[0] !== (camMenu[3].includes('720') ? '720' : camMenu[3][0]) || +camMenu[1] !== fps) throw new Error('the camera did not default to 720p at 30 fps, or the closest it offers')
  await b.ev(`[...document.querySelectorAll('dialog[open] button')].find((x) => x.textContent === 'Turn on camera').click()`)
  await until("A sees Bob's camera in the stage grid", () => a.ev(`document.querySelector('.stage .video-grid video')?.videoHeight > 0`), 30)
  // A camera starts small while the connection measures its bandwidth, then climbs to the chosen quality.
  await until("Bob's camera reaches A at the chosen 720p", () => a.ev(`document.querySelector('.stage .video-grid video')?.videoHeight === 720`), 30)
  if (!(await a.ev(received('camera')))) throw new Error('no camera packets arrived')
  await until('B sees itself, mirrored', () => b.ev(`!!document.querySelector('.stage .screen.mirror video')`), 5)
  await b.ev(press('Turn off camera'))
  await until("Bob turns his camera off; A's stage closes", () => a.ev(`!document.querySelector('.stage')`), 10)

  if (process.platform === 'win32') {
    console.log('--- Computer sound with a share (Windows)')
    await a.ev(press('Share screen'))
    await a.ev(`document.querySelector('dialog[open] #share-tab-window').click()`)
    await pickOwn(a, ownTitles[1])
    await a.ev(`document.querySelector('dialog[open] .sound-row input').click()`)
    await a.ev(`[...document.querySelectorAll('dialog[open] button')].find((x) => x.textContent === 'Share').click()`)
    const how = await until('A shares with computer sound, or says why it cannot', () =>
      a.ev(`(() => { const badge = document.querySelector('.stage .sharing-badge')?.textContent ?? ''; const note = [...document.querySelectorAll('.call-notice')].some((n) => n.textContent.includes('sound is not being shared')); return badge.includes('with sound') ? 'sound' : note ? 'refused' : false })()`), 20)
    if (how === 'sound') {
      await until('B sees the share is with sound, and its sound arrives on its own slot', async () =>
        (await b.ev(`!!document.querySelector('.stage .screen.big figcaption')?.textContent.includes('with sound')`)) && (await b.ev(received('sound'))) > 0, 20)
      await b.ev(`(() => { const r = document.querySelector('.screen.big .screen-controls .screen-volume input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(r, '50'); r.dispatchEvent(new Event('input', { bubbles: true })) })()`)
      await until("B turns the stream down to 50% with the slider beside the full screen button", () =>
        b.ev(`(() => { const c = document.querySelector('.screen.big .screen-controls'); return c.querySelector('.screen-volume input').value === '50' && c.lastElementChild.classList.contains('screen-full') })()`), 5)
    } else console.log("      this system could not leave Eleusinia's own audio out, so no sound was shared, as intended")
    await a.ev(press('Stop sharing'))
    await until('A stops; the stage closes for B', () => b.ev(`!document.querySelector('.stage')`), 10)
  }
  // ELEUSINIA_NO_DIRECT=1 withholds direct routes, as two strict routers would; the call must then go through the relay.
  const forced = process.env.ELEUSINIA_NO_DIRECT === '1'
  await until(`call is ${forced ? 'relayed through the chat link' : 'direct'}`, async () =>
    (await a.ev(`document.querySelector('.callers').textContent.includes('relayed')`)) === forced &&
    (await b.ev(`document.querySelector('.callers').textContent.includes('relayed')`)) === forced, 10)
  // Per-person volume: B turns Ann down; it is saved, and checked again after B restarts below.
  const annKey = await a.ev(`api.call('state').then((s) => s.me)`)
  await b.ev(`(() => { const r = document.querySelector('.caller input[aria-label="Volume for Ann"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(r, '40'); r.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await until('B turns Ann down to 40%, and it is saved', () =>
    b.ev(`api.call('state').then((s) => s.settings.volumes?.['${annKey}'] === 0.4 && document.querySelector('.caller .person-volume-pct').textContent === '40%')`), 10)
  await until('the voice panel no longer holds the audio devices; they are in Settings', () =>
    b.ev(`!document.querySelector('aside.voice').textContent.includes('Audio devices')`), 5)
  // Hotkeys, pressed as real system-wide key events while A's window is minimised. F23 and F24 exist on no ordinary
  // keyboard, so injecting them cannot type into anything else on this machine.
  console.log('--- Hotkeys (none bound by default)')
  const { uIOhook, UiohookKey } = createRequire(import.meta.url)('uiohook-napi')
  const key = async (code, down) => (uIOhook.keyToggle(code, down ? 'down' : 'up'), sleep(150))
  const you = () => a.ev(`[...document.querySelectorAll('.caller')][0].textContent`)
  if (await a.ev(`api.call('state').then((s) => !!Object.keys(s.settings.hotkeys ?? {}).length)`)) throw new Error('a hotkey was bound by default')
  console.log('ok   no hotkeys are bound by default')
  // Set them the way a person would: Settings, Set, press the keys.
  await a.ev(`document.querySelector('.rail-item[aria-label="Settings"]').click()`)
  const order = await a.ev(`(() => { const t = document.querySelector('.audio-settings').textContent; return ['Speakers', 'Output volume', 'Microphone', 'Mic sensitivity', 'Voice bitrate'].map((x) => t.indexOf(x)) })()`)
  if (order.some((n, i) => n < 0 || (i && n < order[i - 1]))) throw new Error('Audio settings are not in the order Speakers, Output volume, Microphone, Mic sensitivity, Voice bitrate: ' + order)
  console.log('ok   Settings: Speakers then output volume, Microphone then mic sensitivity, then bitrate')
  const row = (name) => `[...document.querySelectorAll('.hotkey')].find((x) => x.querySelector('.row-title').textContent === '${name}')`
  const setKey = async (name, code) => {
    await a.ev(`${row(name)}.querySelector('button').click()`)
    await until(`${name}: waiting for keys`, () => a.ev(`${row(name)}.querySelector('kbd').textContent.startsWith('Press keys')`), 5)
    await key(code, true)
    await key(code, false)
  }
  await setKey('Mute', UiohookKey.F23)
  await until('Mute recorded as F23', () => a.ev(`${row('Mute')}.querySelector('kbd').textContent === 'F23'`), 5)
  await setKey('Push to talk', UiohookKey.F24)
  await until('Push to talk recorded as F24', () => a.ev(`${row('Push to talk')}.querySelector('kbd').textContent === 'F24'`), 5)
  await setKey('Deafen', UiohookKey.F23)
  await until('the same key for Deafen is refused, naming Mute', () =>
    a.ev(`document.querySelector('.hotkeys [role=alert]')?.textContent.includes('F23 is already the hotkey for Mute') && ${row('Deafen')}.querySelector('kbd').textContent === 'Not set'`), 5)
  await a.ev(`document.querySelector('dialog[open] .dialog-close').click()`)
  await until('A shows push to talk with its key', async () => (await you()).includes('Push to talk: hold F24'), 5)
  if (await a.windowState('minimized')) await until('A is minimised', () => a.ev('document.hidden'), 10)
  // B must actually receive A's voice only while the key is held, not just see the label change. Bytes, not audio
  // energy, since a remote voice plays through Web Audio and its receiver reports no energy; a disabled microphone
  // sends only Opus's tiny silence frames.
  const heard = () => b.ev(received('voice', 'bytesReceived'))
  const sent = async () => { const e = await heard(); await sleep(2500); return (await heard()) - e }
  const [silentBefore, held, silentAfter] = await bobQuiet(b, async () => {
    const before = await sent()
    await key(UiohookKey.F24, true)
    await until('holding F24 with A minimised: Talking', async () => (await you()).includes('Talking'), 5)
    const during = await sent()
    await key(UiohookKey.F24, false)
    await until('releasing it: back to push to talk', async () => (await you()).includes('Push to talk: hold F24'), 5)
    await sleep(500)
    return [before, during, await sent()]
  })
  if (!(held > 10 * Math.max(silentBefore, silentAfter, 50))) throw new Error(`B did not receive A's voice only while push to talk was held (bytes in 2.5 s: ${silentBefore} before, ${held} holding, ${silentAfter} after)`)
  console.log('ok   B hears A only while F24 is held, with A minimised')
  await key(UiohookKey.F23, true)
  await key(UiohookKey.F23, false)
  await until('F23 mutes A while minimised, and B sees it', async () =>
    (await a.ev(`!!document.querySelector('.callers .voice-mark[title=Muted]')`)) && b.ev(`!!document.querySelector('.caller .row-title .voice-mark[title=Muted]')`), 5)
  await key(UiohookKey.F23, true)
  await key(UiohookKey.F23, false)
  await until('F23 again unmutes', () => a.ev(`!document.querySelector('.callers .voice-mark')`), 5)
  await a.windowState('normal')
  await a.ev(`api.call('setSettings', { hotkeys: {} })`)
  await key(UiohookKey.F23, true)
  await key(UiohookKey.F23, false)
  await sleep(500)
  if (await a.ev(`!!document.querySelector('.callers .voice-mark')`)) throw new Error('a cleared hotkey still acted')
  console.log('ok   once cleared, the key does nothing')

  // Mic sensitivity: at 0 dB nothing (not even the fake beep) is loud enough to send; at -70 dB everything is.
  await a.ev(`api.call('setSettings', { micGate: 0 })`)
  const [gated, opened] = await bobQuiet(b, async () => {
    await sleep(500)
    const shut = await sent()
    await a.ev(`api.call('setSettings', { micGate: -70 })`)
    await sleep(500)
    return [shut, await sent()]
  })
  await a.ev(`api.call('setSettings', { micGate: undefined })`)
  if (!(opened > 10 * Math.max(gated, 50))) throw new Error(`mic sensitivity did not hold the voice back (bytes in 2.5 s: ${gated} above every level, ${opened} at the lowest)`)
  console.log('ok   mic sensitivity: B receives nothing while A is quieter than the level, and A once louder')

  // Chromium's fake microphone beeps, so both sides should see Ann's speaking ring.
  const annSpeaking = `[...document.querySelectorAll('.caller.speaking')].some((x) => x.textContent.includes('Ann'))`
  const ownSpeaking = `!!document.querySelector('.callers > .caller:first-child.speaking')`
  // 20 s is many beeps' worth; with checks every 20 ms and the ring held for 250 ms, a beep that arrives cannot be missed.
  await bobQuiet(b, async () => {
    if (!(await b.ev(seen(annSpeaking, 20000)))) throw new Error('B never saw Ann speaking')
    console.log('ok   B sees the speaking ring on Ann')
    if (!(await a.ev(seen(ownSpeaking, 20000)))) throw new Error('A never saw its own speaking ring')
    console.log('ok   A sees its own speaking ring')
  })
  await a.ev(press('Mute'))
  await sleep(500) // a ring lit just before muting may hold for its hang time
  if (await a.ev(seen(ownSpeaking, 3000))) throw new Error("A's own ring lit while muted")
  if (await b.ev(seen(annSpeaking, 3000))) throw new Error('B saw Ann speaking while she is muted')
  console.log('ok   muted: no ring for Ann on either side')
  await until('A shows muted', () => a.ev(`!!document.querySelector('.callers .voice-mark[title=Muted]')`))
  await until('B sees a muted mark to the right of Ann', () => b.ev(`(() => { const r = [...document.querySelectorAll('.caller')].find((x) => x.textContent.includes('Ann')); return !!r?.querySelector('.row-title .voice-mark[title=Muted]') })()`), 10)
  await a.ev(press('Deafen'))
  await until('A deafened: Deafened shown, both buttons pressed, Bob silenced locally', () =>
    a.ev(`document.querySelector('.callers').textContent.includes('Deafened') && [...document.querySelectorAll('aside.voice button[aria-pressed=true]')].length === 2 && [...document.querySelectorAll('audio')].every(x => x.muted)`), 5)
  await until('B sees a deafened mark instead', () => b.ev(`!!document.querySelector('.caller .row-title .voice-mark[title=Deafened]')`), 10)
  await a.ev(press('Undeafen'))
  await until('A undeafened: back to muted only', () => a.ev(`!document.querySelector('.callers').textContent.includes('Deafened') && document.querySelector('.callers').textContent.includes('Muted')`), 5)
  await until('B sees muted again', () => b.ev(`!!document.querySelector('.caller .row-title .voice-mark[title=Muted]') && !document.querySelector('.caller .voice-mark[title=Deafened]')`), 10)
  await a.ev(press('Leave call'))
  await until('B sees Ann leave', () => b.ev(`document.querySelector('.callers')?.textContent.includes('Waiting')`))
  await b.ev(press('Leave call'))

  console.log('--- Groups')
  await a.ev(`document.querySelector('button.home').click()`)
  for (const g of ['Trio', 'Second']) {
    await a.ev(`document.querySelector('.rail-item[aria-label="Create a group"]').click()`)
    await a.ev(`(() => { const f = document.querySelector('form.new-group'); f.elements.name.value = '${g}'; f.querySelectorAll('[name=member]').forEach(x => x.checked = true); f.requestSubmit() })()`)
    await sleep(500)
    await a.ev(`document.querySelector('button.home')?.click()`)
  }
  await until('A, B and C list both groups in the Home sidebar', async () => {
    for (const p of [a, b, c]) {
      await p.ev(`document.querySelector('button.home')?.click()`)
      if (!(await p.ev(`['Trio','Second'].every(g => [...document.querySelectorAll('aside .item')].some(x => x.textContent.includes(g)))`))) return false
    }
    return true
  })
  await b.ev(open('Trio'))
  await c.ev(open('Trio'))
  await c.ev(say('group online from cy'))
  await until('B (not a friend of Cy) shows it', () => b.ev(shows('group online from cy')))
  await until('B members sidebar lists Ann, Bob and Cy as online', () => b.ev(`(() => { const m = document.querySelector('aside.members'); return !!m && m.querySelector('h2').textContent === 'Online (3)' && ['Ann','Bob','Cy'].every(n => m.textContent.includes(n)) })()`))
  await a.ev(open('Trio'))
  await until('A shows it', () => a.ev(shows('group online from cy')))
  await b.ev(`[...document.querySelectorAll('aside.members .member')].find((x) => x.textContent.includes('Ann')).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))`)
  await until('right-clicking Ann in the members list opens the same card', () => b.ev(annCard), 5)
  await b.ev(closeCard)

  console.log('--- Resizable sidebars')
  const widths = await a.ev(`(() => {
    const out = {}
    for (const s of document.querySelectorAll('.splitter')) {
      const side = s.getAttribute('aria-label').includes('voice') ? s.previousElementSibling : s.nextElementSibling
      const before = side.getBoundingClientRect().width
      s.dispatchEvent(new KeyboardEvent('keydown', { key: s.getAttribute('aria-label').includes('voice') ? 'ArrowRight' : 'ArrowLeft', bubbles: true }))
      out[s.getAttribute('aria-label')] = [before, side.getBoundingClientRect().width]
    }
    return out
  })()`)
  await sleep(300)
  const after = await a.ev(`[document.querySelector('aside.voice').getBoundingClientRect().width, document.querySelector('aside.members').getBoundingClientRect().width, localStorage.getItem('width-voice'), localStorage.getItem('width-members')]`)
  console.log('     ', JSON.stringify(widths), '->', JSON.stringify(after))
  if (!(after[0] === 336 && after[1] === 246 && after[2] === '336' && after[3] === '246')) throw new Error('sidebars did not resize and persist')
  console.log('ok   voice and members sidebars grew by 16px and the widths were saved')
  await a.ev(`document.querySelector('button.home').click()`)
  const home = await a.ev(`(() => { const s = document.querySelector('.splitter'); s.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); return new Promise(r => setTimeout(() => r(document.querySelector('aside').getBoundingClientRect().width), 200)) })()`)
  if (home !== 276) throw new Error('home sidebar did not resize: ' + home)
  console.log('ok   home sidebar resized independently (260 -> 276), narrower than the voice sidebar')

  console.log('--- Bob goes offline (process killed)')
  b.child.kill()
  await until('A lists Bob under Offline after a divider', () => a.ev(`document.querySelector('.rail-item[aria-label^="Home"]').click(); [...document.querySelectorAll('.offline .row-button')].some(x => x.textContent.includes('Bob')) && !!document.querySelector('main.home hr')`), 60)
  await a.ev(open('Bob'))
  await a.ev(say('dm while offline'))
  await until('A shows the DM as pending', () => a.ev(pendingMark), 5)
  await c.ev(say('group while bob offline'))
  await a.ev(open('Trio'))
  await until('A shows the group message', () => a.ev(shows('group while bob offline')))
  await until('A members sidebar shows Bob offline', () => a.ev(`document.querySelector('aside.members').textContent.includes('Offline (1)')`))

  console.log('--- Bob comes back')
  b = await launch(9234, b.dir)
  await until('B is straight on Home (profile kept)', () => b.ev(`!!document.querySelector('main.home')`))
  await until("B still has Ann at 40% after restarting", () => b.ev(`api.call('state').then((s) => s.settings.volumes?.['${annKey}'] === 0.4)`), 5)
  // Each chat is opened once, then watched: new messages and receipts show live in an open chat.
  await b.ev(open('Ann'))
  await until('B received the offline DM', () => b.ev(shows('dm while offline')), 120)
  await b.ev(open('Trio'))
  await until('B received the offline group message', () => b.ev(shows('group while bob offline')), 120)
  await a.ev(open('Bob'))
  await until('A shows the DM delivered', () => a.ev(`${shows('dm while offline')} && !${pendingMark}`), 120)

  console.log('--- Leaving a group')
  await a.ev(`document.querySelector('.rail-item[aria-label^="Second"]').click()`)
  await a.ev(`document.querySelector('button[aria-label="Leave group"]').click()`)
  await until('A sees the leave confirmation', () => a.ev(`!!document.querySelector('dialog[open]')?.textContent.includes('Leave Second?')`), 5)
  await a.ev(`[...document.querySelectorAll('dialog button')].find(x => x.textContent.includes('Leave group')).click()`)
  await until('A is back home and Second is gone from the rail', () => a.ev(`!!document.querySelector('main.home') && !document.querySelector('.rail-item[aria-label^="Second"]')`), 10)
  await b.ev(`document.querySelector('.rail-item[aria-label^="Second"]').click()`)
  await until('B sees Second without Ann', () => b.ev(`(() => { const m = document.querySelector('aside.members'); return !!m && !m.textContent.includes('Ann') && m.textContent.includes('Bob') })()`), 30)

  console.log('--- A long conversation')
  // The window holds only the newest 200 messages; older ones load on request without losing the reader's place.
  const [annId, cyId] = await Promise.all([a, c].map((p) => p.ev(`api.call('state').then((s) => s.me)`)))
  const ac = [annId, cyId].sort().join('_')
  await a.ev(`(async () => { for (let i = 1; i <= 205; i++) await api.call('send', '${ac}', 'long ' + i) })()`)
  await until('C has all 205 messages', () => c.ev(`api.call('history', '${ac}').then((h) => h.total === 205)`), 60)
  await c.ev(open('Ann'))
  const count = `document.querySelectorAll('.msgs .msg').length`
  const has = (text) => `[...document.querySelectorAll('.msgs .msg-text')].some((x) => x.textContent === '${text}')`
  await until('C opens it with the newest 200 and a "Show earlier messages" button', () =>
    c.ev(`${count} === 200 && ${has('long 205')} && !${has('long 5')} && !!document.querySelector('.msgs .earlier')`), 10)
  await c.ev(`(() => { const l = document.querySelector('.msgs'); l.scrollTop = 0; l.querySelector('.earlier').click() })()`)
  await until('the earlier five appear above, the button goes, and the view stays where it was', () =>
    c.ev(`${count} === 205 && ${has('long 5')} && !document.querySelector('.msgs .earlier') && document.querySelector('.msgs').scrollTop > 0`), 10)

  console.log('--- Problem and crash reports')
  const bobId = await b.ev(`api.call('state').then((s) => s.me)`)
  const handles = await Promise.all([a, b, c].map((p) => p.ev(`api.call('state').then((s) => s.profile.handle)`)))
  const leaks = (text) => [annId, bobId, cyId, ...handles].filter((x) => text.includes(x))
  await a.ev(`document.querySelector('.rail-item[aria-label="Settings"]').click()`)
  await a.ev(`[...document.querySelectorAll('dialog[open] button')].find((x) => x.textContent === 'Report a problem').click()`)
  await until('A opens Report a problem, all diagnostics chosen for a problem', () =>
    a.ev(`(() => { const d = document.querySelector('dialog.report-dialog[open]'); return !!d && [...d.querySelectorAll('.report-share input')].slice(0, 4).every((x) => x.checked) })()`), 5)
  const type = (sel, text) => `(() => { const el = document.querySelector('dialog.report-dialog[open] ${sel}'); Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, ${JSON.stringify(text)}); el.dispatchEvent(new Event('input', { bubbles: true })) })()`
  await a.ev(type('input[maxlength="120"]', 'Smoke test report'))
  await a.ev(type('textarea', 'Typed by the smoke test.'))
  const preview = await a.ev(`document.querySelector('dialog.report-dialog[open] .report-preview pre').textContent`)
  if (!preview.includes('[bug] Smoke test report') || !preview.includes(' call ') || !preview.includes(' network ')) throw new Error('the preview does not show the report with its call and connection events: ' + preview.slice(0, 300))
  if (leaks(preview).length) throw new Error('the preview contains a full key or friend ID: ' + leaks(preview))
  console.log('ok   the preview shows the report with its events, and no full keys or friend IDs')
  await a.ev(`[...document.querySelectorAll('dialog.report-dialog[open] button')].find((x) => x.textContent === 'Send report').click()`)
  await until('A sees it is on its way', () => a.ev(`!!document.querySelector('dialog[open]')?.textContent.includes('on its way')`), 5)
  const report = await until('the inbox receives it, and A no longer holds it', async () =>
    (await a.ev(`api.call('state').then((s) => s.reports === 0)`)) && inboxed().find((r) => r.title === 'Smoke test report'), 120)
  if (leaks(JSON.stringify(report)).length || report.contact) throw new Error('the received report contains a full key or friend ID')
  if (!report.meta?.version || !report.events?.some((e) => e.area === 'call')) throw new Error('the received report lacks its app details or call events')
  console.log('ok   what arrived holds app details and events, and nothing identifying')
  await a.ev(`document.querySelector('dialog[open] .button.primary').click()`)
  // Bob was killed earlier in this run: on his restart the app noticed and sent that on its own (diagnostics died with it).
  await until("Bob's abrupt end earlier was reported by itself on his restart", async () => (await b.ev(`api.call('state').then((s) => s.reports === 0)`)) && inboxed().some((r) => r.kind === 'crash' && r.title === 'Eleusinia closed unexpectedly last time' && !r.events?.length), 90)


  c.crash()
  const crashReport = await until("C's window crashes: a crash report reaches the inbox by itself", async () => inboxed().find((r) => r.kind === 'crash' && r.title === 'The window crashed'), 120)
  if (leaks(JSON.stringify(crashReport)).length) throw new Error('the crash report contains a full key or friend ID')
  await until("C's window comes back by itself", async () => {
    const page = await fetch('http://127.0.0.1:9233/json').then((r) => r.json()).then((l) => l.find((p) => p.type === 'page'), () => null)
    if (!page) return false
    const ws = new WebSocket(page.webSocketDebuggerUrl)
    await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)))
    const back = await new Promise((r) => {
      ws.onmessage = (e) => r(JSON.parse(e.data).result?.result?.value)
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: `!!document.querySelector('.rail')`, returnByValue: true } }))
    })
    ws.close()
    return back
  }, 20)
  }
} catch (e) {
  failed = true
  console.error('FAIL', e.message)
  for (const [n, p] of [['A', a], ['B', b], ['C', c]]) console.error(n, (await p.ev(`document.body.innerText`).catch(String)).replace(/\n+/g, ' | '))
  for (const [n, p] of [['A', a], ['B', b], ['C', c]]) console.error(n, 'DIAG', JSON.stringify(await p.ev(`api.diagnostics().then((d) => d.events.filter((e) => e.area === 'network').map((e) => e.text))`).catch(String)))
} finally {
  children.forEach((ch) => ch.kill())
  await testnet?.destroy().catch(() => {})
}
console.log(`total ${((Date.now() - t0) / 1000).toFixed(0)}s`)
process.exit(failed ? 1 : 0)
