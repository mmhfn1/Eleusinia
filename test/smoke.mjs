// Drives three real app instances over the DevTools protocol: profile setup, friend search, layout, voice, and DMs and
// group messages with the recipient online and offline. They meet on a local test DHT, so a run depends on nothing
// outside this machine; ELEUSINIA_SMOKE_PUBLIC=1 uses the public DHT instead, for an occasional real-network check.
import { execFileSync, execSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import createTestnet from 'hyperdht/testnet.js'
import { fakeBungie } from './fake-bungie.mjs'

// ELEUSINIA_SMOKE_EXE runs the packaged app instead (for example dist/win-unpacked/Eleusinia.exe after npm run dist).
const packaged = process.env.ELEUSINIA_SMOKE_EXE
const exe = packaged || (await import('electron')).default // path to the Electron binary on any OS
const app = packaged ? [] : [process.argv[2]]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const t0 = Date.now()
const children = []
setTimeout(() => (console.error('FAIL overall timeout'), children.forEach((c) => c.kill()), process.exit(2)), 420000)

const publicDht = process.env.ELEUSINIA_SMOKE_PUBLIC === '1'
// 10 nodes, not 3: for two copies on one machine hyperdht races a LAN shortcut against hole punching, and the side
// being dialed aborts the punch (and with it the stream the dialer already reports open) unless a fresh socket of its
// gets 3 address samples, which 3 nodes often cannot give. Such a link dies silently ~13 s later.
const testnet = publicDht ? null : await createTestnet(10)
const bootstrap = testnet?.bootstrap.map((n) => `${n.host}:${n.port}`).join(',')
// The app reads ELEUSINIA_BOOTSTRAP only when set; in public mode it is removed, in case the shell has one.
const { ELEUSINIA_BOOTSTRAP: _, ...baseEnv } = process.env
// Updates are off, so a run against the packaged app never downloads a real release.
// No picks in groups: Bob and Cy, not friends, meet only in Ann's groups and never link, as most members of a big
// group do not; their group chat, presence and call go through notes and addressed signals (see '--- Groups')
const appEnv = { ...(bootstrap ? { ...baseEnv, ELEUSINIA_BOOTSTRAP: bootstrap } : baseEnv), ELEUSINIA_NO_UPDATES: '1', ELEUSINIA_TEST_GROUP_LINKS: '0', ELEUSINIA_TEST_BACKGROUND: '1' }
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
// ELEUSINIA_SMOKE_HOSTED=1 (with RELAYED): Cy relays for nobody, so Ann and Bob link through a hosted relay this run
// starts on the test DHT (src/relay/main.ts, built into deploy/relay/relay.cjs), which carries screen video too.
const hostedMode = relayedMode && process.env.ELEUSINIA_SMOKE_HOSTED === '1'
// ELEUSINIA_SMOKE_FORWARD=1: a short run where all three are friends (so Bob and Cy link) in a group call; Ann's pretend
// upload (ELEUSINIA_TEST_UPLOAD_KBPS, local test DHT only) carries one copy of her screen, so Bob forwards it to Cy
// ELEUSINIA_SMOKE_FORWARD=server: the same, but Bob cannot forward (ELEUSINIA_TEST_NO_FORWARD), so Ann's one copy feeds a
// server forwarder this run starts on the test DHT (src/forwarder/main.ts, built into deploy/relay/forwarder.cjs)
// ELEUSINIA_SMOKE_FORWARD=large: five windows (Dee and Eve too); Bob forwards to Cy and Dee, and Dee, fed by Bob, to
// Eve: a second level
const forwardMode = !relayedMode && ['1', 'server', 'large'].includes(process.env.ELEUSINIA_SMOKE_FORWARD)
const serverMode = forwardMode && process.env.ELEUSINIA_SMOKE_FORWARD === 'server'
const largeMode = forwardMode && process.env.ELEUSINIA_SMOKE_FORWARD === 'large'
const uploadEnv = (kbps) => (forwardMode ? { ELEUSINIA_TEST_UPLOAD_KBPS: String(kbps) } : {})
if ((hostedMode || serverMode) && publicDht) throw new Error('ELEUSINIA_SMOKE_HOSTED and ELEUSINIA_SMOKE_FORWARD=server need the local test DHT')
// name: relay or forwarder, built by `npm run <name>:build` into deploy/relay/<name>.cjs, started with a temporary
// --data folder and a random port
async function hosted(name) {
  const root = fileURLToPath(new URL('..', import.meta.url))
  execSync(`npm run ${name}:build`, { cwd: root, stdio: 'ignore' })
  const js = join(root, 'deploy', 'relay', `${name}.cjs`)
  const dir = mkdtempSync(join(tmpdir(), `eleusinia-smoke-${name}-`))
  const key = execFileSync(process.execPath, [js, '--data', dir, '--print-key'], { encoding: 'utf8' }).trim() // the public key only
  const child = spawn(process.execPath, [js, '--data', dir], { env: { ...appEnv, [`ELEUSINIA_${name.toUpperCase()}_PORT`]: '0' }, stdio: ['ignore', 'pipe', 'ignore'] })
  children.push(child)
  await new Promise((resolve, reject) => {
    let out = ''
    child.stdout.on('data', (d) => (out += d).includes(`Eleusinia ${name} listening`) && resolve())
    setTimeout(() => reject(new Error(`the hosted ${name} did not start`)), 30000)
  })
  console.log(`hosted ${name} on the test DHT: ${key.slice(0, 8)}…`)
  return key
}
// Every window knows this run's hosted relay and server forwarder or none (set but empty), never the project's real ones
appEnv.ELEUSINIA_RELAYS = hostedMode ? await hosted('relay') : ''
appEnv.ELEUSINIA_FORWARDERS = serverMode ? await hosted('forwarder') : ''

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
  // Every status line the splash shows, from the page's first moments (also after a reload)
  const splashSeen = `window.__splash ??= (setInterval(() => { const t = document.querySelector('.splash-status')?.textContent; if (t && window.__splash.at(-1) !== t) window.__splash.push(t) }, 50), [])`
  ws.send(JSON.stringify({ id: ++id, method: 'Page.addScriptToEvaluateOnNewDocument', params: { source: splashSeen } }))
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
  await ev(splashSeen).catch(() => {})
  for (let i = 0; i < 50 && !title; i++) {
    title = await ev(`document.readyState === 'complete' ? document.title : ''`).catch(() => '')
    if (!title) await sleep(200)
  }
  // Minimised or normal, through the operating system (Electron does not offer this over DevTools). Windows only;
  // elsewhere the window simply stays in the background.
  const windowState = async (state) => {
    if (process.platform !== 'win32') return false
    const show = state === 'minimized' ? 7 : 4 // SW_SHOWMINNOACTIVE, SW_SHOWNOACTIVATE: never takes focus from the user
    const ps = `Add-Type -Name W -Namespace U -MemberDefinition '[DllImport(\"user32.dll\")] public static extern bool ShowWindow(IntPtr h, int c);'; [U.W]::ShowWindow((Get-Process -Id ${child.pid}).MainWindowHandle, ${show}) | Out-Null`
    await new Promise((r) => spawn('powershell', ['-NoProfile', '-Command', ps], { stdio: 'ignore' }).on('exit', r))
    return true
  }
  // A conversation counts as read only in a focused window, and three windows cannot all have focus: each acts as if
  // it had, unless a step turns it off to see an unfocused window.
  // Resolves once DevTools has applied it, so a step right after sees the window as it set it
  const focused = (on) => new Promise((done) => (pending.set(++id, done), ws.send(JSON.stringify({ id, method: 'Emulation.setFocusEmulationEnabled', params: { enabled: on } }))))
  await focused(true)
  // Lets the test read what each call connection actually receives (getStats), without the app exposing anything.
  // Crashes the page as a real renderer crash would (Chromium's own command for it).
  const crash = () => ws.send(JSON.stringify({ id: ++id, method: 'Page.crash' }))
  // ELEUSINIA_SMOKE_SHOTS=<folder>: screenshots of a few views, to look at by eye.
  const shot = (name) =>
    process.env.ELEUSINIA_SMOKE_SHOTS &&
    new Promise((resolve) => {
      pending.set(++id, (m) => (m.result?.data && writeFileSync(join(process.env.ELEUSINIA_SMOKE_SHOTS, name + '.png'), Buffer.from(m.result.data, 'base64')), resolve()))
      ws.send(JSON.stringify({ id, method: 'Page.captureScreenshot' }))
    })
  // Every window starts behind the splash, which closes by itself (nothing here clicks or types) once startup is done
  await ev(splashSeen)
  if (await ev(`!!document.querySelector('.splash:not(.gone)')`)) await shot('splash')
  const closed = await until(`${port}: the splash closes by itself`, () => ev(`!document.querySelector('.splash') && performance.now()`), 30)
  const startup = await ev(`api.call('startup')`)
  if (!startup.ready && !startup.gaveUp) throw new Error('the splash closed before startup was done')
  // What each step said when the splash closed, and what was still pending if it gave up
  console.log(`     ${port}: startup ${startup.ready ? 'ready' : 'GAVE UP'} ${(closed / 1000).toFixed(1)}s after the page opened:`, startup.steps.map((s) => `${s.id}${s.done ? '' : ' (pending)'}: ${s.detail}`).join('; '), startup.pending.length ? `| pending: ${startup.pending.join(', ')}` : '')
  await ev(`(() => { window.__pcs = []; const P = RTCPeerConnection; window.RTCPeerConnection = class extends P { constructor(...a) { super(...a); window.__pcs.push(this) } } })()`)
  return { child, ev, dir, title, windowState, crash, shot, focused, startup, closed }
}

// What one of the live connection's slots has received (see slotsOf in call.ts): 'sound' is the second audio.
const joinStream = `document.querySelector('.stage .screen.invite button').click()`
const received = (slot, field = 'packetsReceived') => `(async () => {
  const pc = window.__pcs.find((p) => p.connectionState === 'connected')
  const ts = pc?.getTransceivers() ?? []
  const audio = ts.filter((x) => x.receiver.track.kind === 'audio')
  const t = { voice: audio[0], screen: ts.filter((x) => x.receiver.track.kind === 'video')[0], camera: ts.filter((x) => x.receiver.track.kind === 'video')[1], sound: audio[1] }['${slot}']
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
  document.querySelector('.rail-mark')?.click()
  for (let i = 0; i < 50; i++) {
    // friends on Home, groups on the rail (by their label)
    const row = [...document.querySelectorAll('.row-button, .rail-group')].find(x => (x.textContent + (x.getAttribute('aria-label') ?? '')).includes('${text}'))
    if (row) return row.click()
    await new Promise(r => setTimeout(r, 100))
  }
  throw new Error('no row for ${text}')
})()`
const say = (text) => `(() => { const f = document.querySelector('form.send'); f.elements.text.value = '${text}'; f.requestSubmit() })()`
const shows = (text) => `!!document.querySelector('.msgs')?.textContent.includes('${text}')`
// Pastes files made in the page into the message box: a 64x48 red PNG drawn on a canvas, plus `mb` MB of random bytes
// as big.bin, then sends them with `text`.
const sendFiles = (mb, text) => `(async () => {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 48
  c.getContext('2d').fillRect(0, 0, 64, 48)
  const dt = new DataTransfer()
  dt.items.add(new File([await new Promise((r) => c.toBlob(r, 'image/png'))], 'red.png', { type: 'image/png' }))
  const b = new Uint8Array(${mb} * 2 ** 20)
  for (let i = 0; i < b.length; i += 65536) crypto.getRandomValues(b.subarray(i, i + 65536))
  dt.items.add(new File([b], 'big.bin'))
  document.querySelector('form.send textarea').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  for (let i = 0; i < 100 && document.querySelectorAll('.attach-chip:not(.quiet)').length < 2; i++) await new Promise((r) => setTimeout(r, 100))
  const f = document.querySelector('form.send')
  f.elements.text.value = '${text}'
  f.requestSubmit()
})()`
const pictureShown = `[...document.querySelectorAll('.msg-image img')].some((i) => i.src.startsWith('eleusinia-file://') && i.naturalWidth === 64)`
// The big file in the open DM with `other`, downloaded to `to` (the save dialog is skipped); resolves to its hash.
const fetchBig = (other, to) => `api.call('state').then(async (s) => {
  const h = (await api.call('history', [s.me, '${other}'].sort().join('_'))).msgs.flatMap((m) => m.files ?? []).find((f) => f.n === 'big.bin').h
  await api.call('download', h, ${JSON.stringify(to)})
  return h
})`
// The sounds a window has played so far (call.ts notes each one in the diagnostics), in order.
const sounds = (p) => p.ev(`api.diagnostics().then((d) => d.events.filter((e) => e.area === 'call' && e.text.startsWith('sound: ')).map((e) => e.text.slice(7)))`)
const pendingMark = `!!document.querySelector('.msgs')?.textContent.includes('pending')`
const body = (text) => `document.body.innerText.includes('${text}')`
// Watches the page for up to ms, true as soon as the condition holds: catches a state that comes and goes (a ring
// that follows the fake microphone's beeps) without depending on when a poll lands.
const seen = (cond, ms) => `new Promise((r) => { const t0 = Date.now(); const i = setInterval(() => { if (${cond}) (clearInterval(i), r(true)); else if (Date.now() - t0 > ${ms}) (clearInterval(i), r(false)) }, 20) })`
// The profile panel that opens beside a clicked person, its button to the full profile, and closing it with Escape.
const pop = (fn) => `(() => { const p = document.querySelector('.profile-pop.placed'); return !!p && (${fn})(p) })()`
const expandPop = `document.querySelector('.profile-pop .pop-expand').click()`
const escape = `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`
// Call controls live in the bars under the rail (mute, deafen, camera, share, Disconnect); joining in the left column
const press = (label) => `[...document.querySelectorAll('.bars button'), ...document.querySelectorAll('aside.voice button')].find(x => x.textContent.includes('${label}')).click()`
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

// Everyone becomes friends with everyone, by key; returns their keys
async function befriendAll() {
  const key = (p) => p.ev(`api.call('state').then((s) => s.me)`)
  const keys = []
  for (const [p] of everyone) keys.push(await key(p))
  for (let i = 0; i < everyone.length; i++)
    for (let j = i + 1; j < everyone.length; j++) {
      const [x, kx, y, ky, names] = [everyone[i][0], keys[i], everyone[j][0], keys[j], `${everyone[i][1]} and ${everyone[j][1]}`]
      await x.ev(`api.call('addFriend', '${ky}')`)
      await until(`${names}: the request arrives`, () => y.ev(`api.call('state').then((s) => s.friends['${kx}'] === 'incoming')`))
      await y.ev(`api.call('addFriend', '${kx}')`)
      await until(`${names} are friends`, () => x.ev(`api.call('state').then((s) => s.friends['${ky}'] === 'friend')`))
    }
  return keys
}

// Ann and Bob can never link directly; Cy is friends with both and relays, as everyone not strict does. In hosted mode
// Cy relays for nobody and the hosted relay links them instead.
async function relayedRun(ownTitles) {
  const via = hostedMode ? 'the hosted relay' : 'Cy'
  const route = hostedMode ? 'through an Eleusinia relay' : 'through a friend'
  const list = hostedMode ? 'hostedRelayed' : 'relayed'
  console.log(`--- Relayed: Ann and Bob link only through ${via}`)
  const [ka, kb] = await befriendAll()
  // They met only through the DHT, so their names arrive with the first hello over the relayed link.
  await until(`A and B link through ${via} and learn each other's names`, async () =>
    (await a.ev(`api.call('state').then((s) => s.profiles['${kb}']?.name === 'Bob')`)) && b.ev(`api.call('state').then((s) => s.profiles['${ka}']?.name === 'Ann')`), 120)
  await a.ev(open('Bob'))
  await b.ev(open('Ann'))
  await a.ev(say('through the relay'))
  await until(`B shows a DM that could only come through ${via}`, () => b.ev(shows('through the relay')))
  await until(`both see the link goes ${route}`, async () =>
    (await a.ev(`api.call('state').then((s) => s.${list}.includes('${kb}'))`)) && b.ev(`api.call('state').then((s) => s.${list}.includes('${ka}'))`))
  await b.ev(say('reply via the relay'))
  await until('A shows the reply', () => a.ev(shows('reply via the relay')))
  // Any relay carries pictures; through a friend's, a big file waits for a direct connection
  await a.ev(sendFiles(2, 'files via the relay'))
  await until(`B shows the picture that came through ${via}`, () => b.ev(`${shows('files via the relay')} && ${pictureShown}`), 30)
  if (!hostedMode) {
    await b.ev(fetchBig(ka, join(mkdtempSync(join(tmpdir(), 'eleusinia-smoke-dl-')), 'big.bin')))
    await until('B says the big file waits for a direct connection', () => b.ev(body('waiting for a direct connection')), 10)
  }
  await a.ev(`document.querySelector('.chat-person').click()`)
  await until(`Bob's panel says he is online ${route}`, () => a.ev(pop(`(p) => p.textContent.includes('Online ${route}')`)), 10)
  await a.ev(expandPop)
  const card = hostedMode ? 'Online through an Eleusinia relay' : 'Online through a friend: voice and text only'
  await until(`Bob's full card says: ${card}`, () => a.ev(`!!document.querySelector('dialog[open]')?.textContent.includes('${card}')`), 10)
  await a.ev(`[...document.querySelectorAll('dialog[open] button')].find(x => x.textContent === 'Close').click()`)

  console.log(`--- Relayed: a voice call, and ${hostedMode ? 'a screen share' : 'no screen share'}`)
  await a.ev(press('Start call'))
  await until('B sees the call', () => b.ev(`[...document.querySelectorAll('aside.voice button')].some(x => x.textContent.includes('Join call'))`))
  await b.ev(press('Join call'))
  await until('A connected to Bob', () => a.ev(`!!document.querySelector('.caller.state-connected')?.textContent.includes('Bob')`))
  await until('B hears Ann through the relay', async () => (await bobQuiet(b, () => b.ev(received('voice')))) > 50, 30)
  await until(`A's call panel says the call is relayed ${route}`, () => a.ev(`document.querySelector('.callers').textContent.includes('relayed ${route}')`), 10)
  await a.ev(press('Share screen'))
  await until('A sees the share picker', () => a.ev(`document.querySelectorAll('dialog[open] .source').length > 0`), 20)
  await a.ev(`document.querySelector('dialog[open] #share-tab-window').click()`)
  await pickOwn(a, ownTitles[1])
  await a.ev(`[...document.querySelectorAll('dialog[open] button')].find((x) => x.textContent === 'Share').click()`)
  if (hostedMode) {
    // An Eleusinia relay carries video: B joins the stream and it plays
    await until('B is offered the stream, with Join stream', () => b.ev(`document.querySelector('.stage .screen.invite.big button')?.textContent === 'Join stream'`), 20)
    await b.ev(joinStream)
    await until('B plays the shared window through the hosted relay', async () => (await b.ev(received('screen'))) > 100 && b.ev(`document.querySelector('.stage .screen.big video')?.videoHeight > 0`), 30)
    console.log(`ok   screen video crossed the hosted relay (${await b.ev(received('screen'))} packets)`)
    return
  }
  await sleep(8000)
  const screenIn = await b.ev(`(async () => { const pc = window.__pcs.find((p) => p.connectionState === 'connected'); const t = pc?.getTransceivers().filter((x) => x.receiver.track.kind === 'video')[0]; let n = 0; if (t) (await t.receiver.getStats()).forEach((r) => r.type === 'inbound-rtp' && (n = r.packetsReceived ?? 0)); return n })()`)
  if (screenIn > 20) throw new Error(`B received ${screenIn} screen packets through the relay, which carries voice only`)
  console.log(`ok   no screen video crossed the relay (${screenIn} packets)`)
}

// What Cy's window receives of Ann's screen: media packets on the call's own connections (four slots), and frames decoded
// on the forwarded one (e2ee.ts: a video and a sound slot only)
const directScreen = `(async () => { let n = 0; for (const pc of window.__pcs.filter((p) => p.connectionState === 'connected' && p.getTransceivers().length >= 4)) { const t = pc.getTransceivers().filter((x) => x.receiver.track.kind === 'video')[0]; if (t) (await t.receiver.getStats()).forEach((r) => r.type === 'inbound-rtp' && (n += (r.packetsReceived ?? 0) - (r.retransmittedPacketsReceived ?? 0))) } return n })()`
const forwardedFrames = `(async () => { let n = 0; for (const pc of window.__pcs.filter((p) => p.connectionState === 'connected' && p.getTransceivers().length === 2)) (await pc.getStats()).forEach((r) => r.type === 'inbound-rtp' && r.kind === 'video' && (n += r.framesDecoded ?? 0)); return n })()`
const stageSays = (text) => `!!document.querySelector('.stage .screen.big figcaption')?.textContent.includes(${JSON.stringify(text)})`

// Ann's upload fits one copy of her screen (3 Mbit/s, 70 % used), Bob has plenty to spare and Cy little, so forward.ts
// picks Bob to carry Ann's screen to Cy; then Bob leaves and Cy gets it direct again. Server mode: Bob cannot forward,
// so Ann's one copy feeds the server forwarder, which carries it to both.
// Everyone in a group call with Ann, who shares a window of the test's own
async function callAndShare(ownTitles) {
  const [, ...keys] = await befriendAll()
  const gid = await a.ev(`api.call('createGroup', 'Relay race', ${JSON.stringify(keys)})`)
  const others = everyone.slice(1).map(([p]) => p)
  for (const p of others) await until('the group reaches the others', () => p.ev(`api.call('state').then((s) => !!s.groups['${gid}'])`), 30)
  for (const [p] of everyone) await p.ev(open('Relay race'))
  await a.ev(press('Start call'))
  for (const p of others) {
    await until('the call shows', () => p.ev(`[...document.querySelectorAll('aside.voice button')].some(x => x.textContent.includes('Join call'))`), 30)
    await p.ev(press('Join call'))
  }
  const n = others.length
  await until(`all ${n + 1} are connected`, async () => {
    for (const [p] of everyone) if (!(await p.ev(`document.querySelectorAll('.caller.state-connected').length === ${n}`))) return false
    return true
  }, 45)
  await a.ev(press('Share screen'))
  await until('A sees the share picker', () => a.ev(`document.querySelectorAll('dialog[open] .source').length > 0`), 20)
  await a.ev(`document.querySelector('dialog[open] #share-tab-window').click()`)
  await pickOwn(a, ownTitles[1])
  await sleep(1500) // the upload check, which may turn Share into Share anyway
  await a.ev(`[...document.querySelectorAll('dialog[open] button')].find((x) => x.textContent.startsWith('Share')).click()`)
}
const joinOffered = async (p) => {
  await until('the stream is offered', () => p.ev(`document.querySelector('.stage .screen.invite.big button')?.textContent === 'Join stream'`), 20)
  await p.ev(joinStream)
}
const plays = `document.querySelector('.stage .screen.big video')?.videoHeight > 0`
const framesShown = `document.querySelector('.stage .screen.big video')?.getVideoPlaybackQuality().totalVideoFrames ?? 0`
const forwardLines = () => a.ev(`api.diagnostics().then((d) => d.events.filter((e) => e.text.startsWith('forwarding our screen')).map((e) => e.text))`)

async function forwardRun(ownTitles) {
  const via = serverMode ? 'through an Eleusinia server' : 'through Bob'
  console.log(`--- Forwarding: Ann, Bob and Cy in a group call; ${serverMode ? 'a server forwards' : 'Bob forwards'} Ann's screen to Cy`)
  await callAndShare(ownTitles)
  for (const p of [b, c]) await joinOffered(p)
  let t = Date.now()
  await until(`Cy shows Ann's screen ${via}, decoding frames on the forwarded connection`, async () => (await c.ev(stageSays(via))) && (await c.ev(`document.querySelector('.stage .screen.big video')?.videoHeight > 0`)) && (await c.ev(forwardedFrames)) > 0, 60)
  console.log(`      forwarded ${Date.now() - t} ms after joining; Cy decoded ${await c.ev(forwardedFrames)} forwarded frames`)
  if (!serverMode) await until("Bob's call panel says he forwards Ann's stream to 1 person", () => b.ev(`!!document.querySelector('.callers')?.textContent.includes("Forwarding Ann's stream to 1 person")`), 10)
  if (!serverMode) await until('Bob still watches, without a route line in his own window', () => b.ev(`document.querySelector('.stage .screen.big video')?.videoHeight > 0 && !${stageSays('through')}`), 10)
  await sleep(2000) // the direct copy stops within a sample once Cy says the forwarded one plays
  const before = await c.ev(directScreen)
  await sleep(3000)
  const after = await c.ev(directScreen)
  if (after > before + 20) throw new Error(`Ann still sends Cy her screen directly: ${before} -> ${after} media packets in 3 s`)
  console.log(`ok   no screen media on Cy's direct connections while forwarded (${after - before} packets in 3 s)`)
  const lines = await forwardLines()
  console.log('      Ann:', lines.join(' | '))
  if (!lines.some((l) => l.startsWith('forwarding our screen through 1'))) throw new Error('Ann did not log forwarding')
  if (serverMode) return

  console.log('--- Forwarding: Bob leaves; Cy gets Ann\'s screen direct again')
  await b.ev(press('Disconnect'))
  t = Date.now()
  const base = await c.ev(directScreen)
  await until("Cy plays Ann's screen direct again", async () => !(await c.ev(stageSays('through Bob'))) && (await c.ev(`document.querySelector('.stage .screen.big video')?.videoHeight > 0`)) && (await c.ev(directScreen)) > base + 20, 15)
  const back = Date.now() - t
  console.log(`      direct again ${back} ms after Bob left`)
  if (back > 10000) throw new Error(`Cy took ${back} ms to get Ann's screen direct again`)
}

// Five in a call: Ann's upload carries one copy (3 Mbit/s, 70 % used, at about 1.4 Mbit/s a copy), Bob's two (5),
// Dee's one more (4), Cy's and Eve's none. Viewers join one by one, the order forward.ts seats them in: Bob takes
// Ann's copy, Cy and Dee go through Bob, and Eve through Dee, whom Bob feeds (a second level). Frames stay encrypted
// end to end: Bob and Dee pass ciphertext. ELEUSINIA_TEST_NET is not used here: netsim acts on packets relay.ts ferries
// over the chat link, and forwarded media goes over werift's own UDP, which it cannot reach.
async function largeRun(ownTitles) {
  console.log('--- Large call: five in a group call; Bob forwards to Cy and Dee, Dee (fed by Bob) to Eve')
  await callAndShare(ownTitles)
  const t = Date.now()
  await joinOffered(b)
  await until("Bob plays Ann's screen", () => b.ev(plays), 30)
  for (const p of [c, dee]) await joinOffered(p)
  await until("Cy and Dee show Ann's screen through Bob, decoding forwarded frames", async () => {
    for (const p of [c, dee]) if (!((await p.ev(stageSays('through Bob'))) && (await p.ev(plays)) && (await p.ev(forwardedFrames)) > 0)) return false
    return true
  }, 60)
  await joinOffered(eve)
  await until("Eve shows Ann's screen through Dee (second level), decoding forwarded frames", async () => (await eve.ev(stageSays('through Dee'))) && (await eve.ev(plays)) && (await eve.ev(forwardedFrames)) > 0, 60)
  console.log(`      all four watching ${Date.now() - t} ms after Bob joined; Eve decoded ${await eve.ev(forwardedFrames)} frames through two forwarders`)
  await until("Bob's call panel says he forwards Ann's stream to 2 people", () => b.ev(`!!document.querySelector('.callers')?.textContent.includes("Forwarding Ann's stream to 2 people")`), 10)
  await until("Dee's call panel says she forwards Ann's stream to 1 person", () => dee.ev(`!!document.querySelector('.callers')?.textContent.includes("Forwarding Ann's stream to 1 person")`), 10)
  await sleep(2000) // direct copies stop within a sample once each viewer says the forwarded one plays
  const viewers = [b, c, dee, eve]
  const before = [await c.ev(directScreen), await eve.ev(directScreen)]
  const shownBefore = []
  for (const p of viewers) shownBefore.push(await p.ev(framesShown))
  await sleep(3000)
  const after = [await c.ev(directScreen), await eve.ev(directScreen)]
  if (after[0] > before[0] + 20 || after[1] > before[1] + 20) throw new Error(`Ann still sends Cy or Eve her screen directly: ${before} -> ${after} packets in 3 s`)
  console.log(`ok   no screen media on Cy's or Eve's direct connections while forwarded (${after[0] - before[0]}, ${after[1] - before[1]} packets in 3 s)`)
  const shown = []
  for (const p of viewers) shown.push(await p.ev(framesShown))
  const stalled = ['Bob', 'Cy', 'Dee', 'Eve'].filter((_, i) => shown[i] <= shownBefore[i])
  if (stalled.length) throw new Error(`${stalled.join(', ')} stopped playing: ${shownBefore} -> ${shown} frames`)
  console.log(`ok   all four keep playing (${shown.map((f, i) => f - shownBefore[i]).join(', ')} frames in 3 s)`)
  const lines = await forwardLines()
  console.log('      Ann:', lines.join(' | '))
  if (!lines.some((l) => / via /.test(l))) throw new Error('Ann did not log a second-level forwarder')
  await forwardTrouble()
}

// Bad lines and overload on forwarders (testFwd, local test DHT only: ELEUSINIA_TEST_NET cannot reach werift's own UDP).
// 1. 10 % loss from Dee's forwarder to Eve: Eve gets the lost packets resent and keeps playing; Cy, fed by Bob, loses
//    nothing. 2. Nothing reaches Dee's forwarder from Bob: Eve leaves Dee within 15 s of silence and plays on. 3. Bob's
//    main process busy 80 ms of every 100: he drops out by himself, Ann benches him, and everyone plays on without him.
async function forwardTrouble() {
  const seen = (p) => p.ev(`(async () => { const o = { lost: 0, nack: 0, resent: 0, frames: 0 }; for (const pc of window.__pcs.filter((p) => p.connectionState === 'connected' && p.getTransceivers().length === 2)) (await pc.getStats()).forEach((r) => { if (r.type === 'inbound-rtp' && r.kind === 'video') { o.lost += r.packetsLost ?? 0; o.nack += r.nackCount ?? 0; o.resent += r.retransmittedPacketsReceived ?? 0; o.frames += r.framesDecoded ?? 0 } }); return o })()`)
  const watchers = [[b, 'Bob'], [c, 'Cy'], [dee, 'Dee'], [eve, 'Eve']]
  const allPlay = async (what) => {
    const before = []
    for (const [p] of watchers) before.push(await p.ev(framesShown))
    await sleep(3000)
    const stalled = []
    for (const [i, [p, n]] of watchers.entries()) if (!(await p.ev(plays)) || (await p.ev(framesShown)) <= before[i]) stalled.push(n)
    if (stalled.length) throw new Error(`${stalled.join(', ')} stopped playing ${what}`)
  }

  console.log('--- Forwarding on a bad line: 10 % loss from Dee to Eve')
  const [eve0, cy0] = [await seen(eve), await seen(c)]
  await dee.ev(`api.call('testFwd', { outbound: 10 })`)
  await sleep(8000)
  const [eve1, cy1] = [await seen(eve), await seen(c)]
  await dee.ev(`api.call('testFwd', {})`)
  console.log(`      Eve: ${eve1.frames - eve0.frames} frames, ${eve1.nack - eve0.nack} resend requests, ${eve1.resent - eve0.resent} resent, ${eve1.lost - eve0.lost} lost; Cy: ${cy1.frames - cy0.frames} frames, ${cy1.lost - cy0.lost} lost`)
  if (eve1.nack - eve0.nack < 5 || eve1.resent - eve0.resent < 5) throw new Error("Eve's lost packets were not asked for and resent by Dee's forwarder")
  if (eve1.frames - eve0.frames < 100) throw new Error('Eve stalled on a lossy line')
  if (cy1.lost - cy0.lost > 5 || cy1.frames - cy0.frames < 100) throw new Error("Cy was hurt by loss on Eve's line")
  if (!(await eve.ev(stageSays('through Dee')))) throw new Error('Eve left Dee over 10 % loss, which resends handle')
  console.log('ok   Eve kept playing through Dee on resends, and Cy lost nothing')

  console.log("--- A forwarder's upstream goes dead: nothing from Bob reaches Dee's forwarder")
  await dee.ev(`api.call('testFwd', { inbound: 100 })`)
  const t = Date.now()
  await until('Eve leaves Dee and plays on', async () => !(await eve.ev(stageSays('through Dee'))) && (await eve.ev(plays)), 30)
  console.log(`      after ${Date.now() - t} ms, Eve's tile: ${await eve.ev(`document.querySelector('.stage .screen.big figcaption')?.textContent`)}`)
  await dee.ev(`api.call('testFwd', {})`)
  await allPlay('after Eve moved')
  console.log("ok   Eve moved off Dee's dead feed and everyone plays")

  console.log('--- A forwarder overloaded: Bob\'s main process busy 80 ms of every 100 for 25 s')
  await b.ev(`api.call('testFwd', { busy: 80, ms: 25000 })`)
  const t2 = Date.now()
  await until('Bob says his computer cannot keep up', () => b.ev(`api.diagnostics().then((d) => d.events.some((e) => e.text.includes('cannot keep up: no longer forwarding')))`), 30)
  await until('Ann benches Bob, and nobody watches through him', async () => {
    if (!(await a.ev(`api.diagnostics().then((d) => d.events.some((e) => e.text.includes('cannot keep up forwarding; their viewers move')))`))) return false
    for (const [p] of watchers) if (await p.ev(stageSays('through Bob'))) return false
    return true
  }, 30)
  console.log(`      Bob dropped out ${Date.now() - t2} ms after his process got busy; tiles: ${(await Promise.all(watchers.map(([p, n]) => p.ev(`document.querySelector('.stage .screen.big figcaption')?.textContent ?? ''`).then((x) => `${n}: ${x}`)))).join(' | ')}`)
  await sleep(Math.max(0, 26000 - (Date.now() - t2))) // until Bob's process is back
  await until('everyone plays again', async () => {
    for (const [p] of watchers) if (!(await p.ev(plays))) return false
    return true
  }, 20)
  await allPlay('after Bob dropped out')
  console.log('ok   Bob dropped out by himself, Ann benched him, and all four play on')
}

// Ann's game stands in for what main/activity.ts would find (ELEUSINIA_TEST_ACTIVITY), shared once she turns it on.
const annGame = {
  name: 'Counter-Strike 2',
  source: 'steam',
  app: 730,
  played: 6000,
  genres: ['Action', 'Free To Play'],
  developer: 'Valve',
  achievements: { got: 1, total: 50, recent: [{ name: 'A New Beginning', desc: 'Played a match', icon: 'f75dd04fa12445a8ec43be65fa16ff1b8d2bf82e.jpg', at: Date.now() - 3600e3, rarity: 61.2 }] },
}
// And a folder standing in for CS2's cfg folder, where Settings → Set up writes the game's file.
const annGsiCfg = mkdtempSync(join(tmpdir(), 'eleusinia-smoke-gsi-')) // one subfolder per game
const annEnv = { ...strictEnv, ...uploadEnv(3000), ELEUSINIA_TEST_ACTIVITY: JSON.stringify(annGame), ELEUSINIA_TEST_GSI_CFG: annGsiCfg }
let a = await launch(9231, undefined, annEnv)
// Bob plays Destiny 2 and links a stand-in for bungie.net (test/fake-bungie.mjs) that approves at once.
const bobGame = { name: 'Destiny 2', source: 'steam', app: 1085660, played: 211683 }
const bungieFake = await fakeBungie()
// In forwarding mode Bob plays nothing: someone in a game is never asked to forward
let b = await launch(9232, undefined, { ...strictEnv, ...uploadEnv(largeMode ? 5000 : 20000), ...(serverMode && { ELEUSINIA_TEST_NO_FORWARD: '1' }), ...(!forwardMode && { ELEUSINIA_TEST_ACTIVITY: JSON.stringify(bobGame) }), ELEUSINIA_TEST_BUNGIE: bungieFake.base })
const c = await launch(9233, undefined, { ...(hostedMode && { ELEUSINIA_TEST_NO_RELAY: '1' }), ...uploadEnv(500) })
const dee = largeMode ? await launch(9245, undefined, uploadEnv(4000)) : null
const eve = largeMode ? await launch(9246, undefined, uploadEnv(500)) : null
const everyone = [[a, 'Ann'], [b, 'Bob'], [c, 'Cy'], ...(largeMode ? [[dee, 'Dee'], [eve, 'Eve']] : [])]
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
  for (const [p, n] of everyone) {
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
  else if (largeMode) await largeRun(ownTitles)
  else if (forwardMode) await forwardRun(ownTitles)
  else {
  const ids = {}
  for (const [p, n] of [[b, 'Bob'], [c, 'Cy']]) {
    ids[n] = await p.ev(`document.querySelector('.friend-id b').textContent`)
    console.log(`     ${n} friend ID: ${ids[n]}`)
    if (!new RegExp('^' + n.toLowerCase() + 'tester#\\d{4}$').test(ids[n])) throw new Error('unexpected friend ID ' + ids[n])
  }

  console.log('--- Friend ID and Settings sections, bitrate (i)')
  await a.ev(`document.querySelector('.user-bar button[title="Settings"]').click()`)
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
  // The theme: Ivory switches the whole window, and Ink brings it back (theme.ts, kept in this window's storage)
  const themeTo = (label) => a.ev(`[...document.querySelectorAll('dialog[open] [role=radiogroup][aria-label=Theme] [role=radio]')].find((x) => x.textContent === '${label}').click()`)
  await themeTo('Ivory')
  await until('Ivory switches the window to the light theme', () => a.ev(`document.documentElement.dataset.theme === 'light' && getComputedStyle(document.body).backgroundColor !== 'rgb(11, 13, 17)'`), 5)
  await a.ev(`document.activeElement.blur(); document.querySelector('dialog[open] .dialog-close').click()`)
  await sleep(300)
  await a.shot('home-ivory')
  await a.ev(`document.querySelector('.user-bar button[title="Settings"]').click()`)
  await themeTo('Ink')
  await until('and Ink brings the dark theme back', () => a.ev(`document.documentElement.dataset.theme === 'dark'`), 5)
  await a.ev(`document.activeElement.blur(); document.querySelector('dialog[open] .dialog-close').click()`)

  // Chromium's fake microphone beeps a steady tone, which noise suppression rightly removes as noise: the checks
  // that listen for that beep run without it, and noise suppression gets a check of its own in the call below.
  for (const p of [a, b, c]) await p.ev(`api.call('setSettings', { noiseSuppression: false })`)

  console.log('--- Friend search suggestions')
  await b.ev(`api.call('setSettings', { suggest: true })`) // only those who turn it on are suggested; Cy is found by exact ID
  for (const [p, n] of [[b, 'Bob'], [c, 'Cy']]) {
    const tail = await p.ev(`api.call('state').then(s => s.me.slice(-6).toUpperCase())`)
    // Type the first 4 letters of the username, as a person would, and wait for the suggestion.
    const typed = n === 'Bob' ? ids[n].slice(0, 4).toUpperCase() : ids[n].toUpperCase()
    await a.ev(`(() => { const i = document.querySelector('.search-box input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '${typed}'); i.dispatchEvent(new Event('input', { bubbles: true })) })()`)
    // Strangers cannot link: pictures come from the thumbnail published with the card
    const pic = n === 'Cy' ? '.avatar svg' : '.avatar img'
    await until(`typing "${typed}" suggests ${n}: ${n === 'Cy' ? 'generated' : 'uploaded'} picture, ID, Unique Key ${tail}`, () =>
      a.ev(`(() => { const r = document.querySelectorAll('.result'); return r.length === 1 && !!r[0].querySelector('${pic}') && r[0].textContent.includes('${ids[n]}') && r[0].querySelector('.tail').textContent === '${tail}' })()`))
    await a.ev(`document.querySelector('.result .add-friend').click()`)
    // Served as eleusinia-pic:// (node.ts keeps pictures out of the state), and it must actually load
    await until(`${n} sees the request with Ann's picture`, () => p.ev(`[...document.querySelectorAll('.request')].some(r => { const i = r.querySelector('.avatar img'); return r.textContent.includes('Ann') && i?.src.startsWith('eleusinia-pic://') && i.complete && i.naturalWidth > 0 })`))
    await p.ev(`[...document.querySelectorAll('.request button')].find(x => x.textContent === 'Accept').click()`)
  }

  console.log('--- Home: online and offline friends')
  await until('A lists Bob and Cy under Online, nobody under Offline', () => a.ev(`document.querySelectorAll('.online .row-button').length === 2 && document.querySelectorAll('.offline .row-button').length === 0`))

  console.log('--- Activity: what Ann is playing')
  const annRow = `[...document.querySelectorAll('.online .row-button')].find((x) => x.textContent.includes('Ann'))`
  const annMe = await a.ev(`api.call('state').then((s) => s.me)`)
  const bobSees = (test) => `api.call('state').then((s) => { const g = s.activity['${annMe}']?.game; return ${test} })`
  // On by default: Ann's game reaches Bob without her touching Settings, but not the store details
  await until('B gets what Ann plays by default, without store details', () => b.ev(bobSees('!!g && g.played > 0 && g.developer === undefined')))
  await a.ev(`api.call('setSettings', { activity: { games: false } })`)
  await until('turning it off reaches B', () => b.ev(bobSees('!g')))
  await a.ev(`api.call('setSettings', { activity: { games: true, details: true } })`)
  await until('B lists Ann as playing Counter-Strike 2', () => b.ev(`${annRow}?.querySelector('.activity-line')?.textContent.includes('Counter-Strike 2')`))
  await b.ev(`${annRow}.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))`)
  await until("Ann's panel shows only the cliff notes of her game, with its art in the banner", () =>
    b.ev(pop((p) => p.querySelector('.glance-game')?.textContent === 'Counter-Strike 2' && p.textContent.includes('1 of 50 achievements') && !p.querySelector('.activity-card') && p.querySelector('.pop-banner.game img')?.getAttribute('src') === 'eleusinia-art://steam/730/header')), 10)
  await b.ev(expandPop)
  await until("Ann's card shows the game: art, playtime, genres, achievements with rarity, Steam buttons", () =>
    b.ev(`(() => { const c = document.querySelector('dialog[open] .activity-card'); return !!c && c.querySelector('.activity-art')?.getAttribute('src') === 'eleusinia-art://steam/730/header' && c.textContent.includes('100 h in total') && c.textContent.includes('Action, Free To Play') && c.textContent.includes('1 of 50') && c.textContent.includes('A New Beginning') && c.textContent.includes('61% of players') && c.textContent.includes('Play on Steam') })()`), 10)
  // Fetched from Steam by B's own app through eleusinia-art:, built from the app id and icon name alone
  await until('the game art and achievement icon load', () => b.ev(`[...document.querySelectorAll('dialog[open] .activity-card img')].every((i) => i.complete && i.naturalWidth > 0)`), 30)
  await b.ev(`[...document.querySelectorAll('dialog[open] button')].find(x => x.textContent === 'Close').click()`)
  // A direct chat has a members sidebar like a group's, where the game replaces the friend ID, ours included
  const dmSide = (who, game) => `(() => { const r = [...document.querySelectorAll('aside.members .member')].find((x) => x.textContent.includes('${who}')); return !!r && r.textContent.includes('Playing ${game}') })()`
  await b.ev(`${annRow}.click()`)
  await until("B's chat with Ann lists both, Ann playing Counter-Strike 2", () => b.ev(`document.querySelectorAll('aside.members .member').length === 2 && ${dmSide('Ann', 'Counter-Strike 2')}`))
  const bobRow = `[...document.querySelectorAll('.online .row-button')].find((x) => x.textContent.includes('Bob'))`
  await a.ev(`${bobRow}.click()`)
  await until("A's chat with Bob shows Ann (you) playing Counter-Strike 2, and Bob playing Destiny 2", () => a.ev(`${dmSide('(you)', 'Counter-Strike 2')} && ${dmSide('Bob', 'Destiny 2')}`))
  for (const p of [a, b]) await p.ev(`document.querySelector('.home.back').click()`)

  console.log('--- Activity: a CS2 match, through Game State Integration')
  await a.ev(`document.querySelector('.user-bar button[title="Settings"]').click()`)
  // Settings → Activity: the Steam tile opens a switch per game
  await until('Settings shows the Steam and Bungie.net tiles', () => a.ev(`!!document.querySelector('.connection[data-k="steam"]') && !!document.querySelector('.connection[data-k="bungie"]')`), 10)
  await a.ev(`document.querySelector('.connection[data-k="steam"]').click()`)
  const cs2Switch = `document.querySelector('input[aria-label="Counter-Strike 2 live match details"]')`
  await until('the Steam panel offers CS2', () => a.ev(`!!${cs2Switch} && !${cs2Switch}.disabled && !${cs2Switch}.checked`), 10)
  await a.ev(`${cs2Switch}.click()`)
  await until("turning CS2 on writes the game's file and shows its switches", () => a.ev(`(() => { const g = document.querySelector('.connection-game[data-game="cs2"]'); return ${cs2Switch}.checked && g.querySelector('.gsi-state')?.textContent === 'Start or restart CS2' && g.querySelectorAll('.activity-details input[role="switch"]').length === 3 })()`), 10)
  await a.ev(`document.querySelector('.connections').scrollIntoView()`)
  await a.shot('settings-activity')
  await a.ev(`document.querySelector('dialog[open] .dialog-close').click()`)
  const gsi = readFileSync(join(annGsiCfg, 'cs2', 'gamestate_integration_eleusinia.cfg'), 'utf8')
  const gsiUrl = /"uri" "([^"]+)"/.exec(gsi)[1]
  const match = {
    provider: { name: 'Counter-Strike: Global Offensive', appid: 730, steamid: '76561198000000001', timestamp: 1 },
    map: { mode: 'competitive', name: 'de_mirage', phase: 'live', round: 11, team_ct: { score: 7 }, team_t: { score: 4 }, round_wins: { 1: 'ct_win_elimination', 2: 't_win_bomb', 3: 'ct_win_defuse' } },
    round: { phase: 'live' },
    player: {
      steamid: '76561198000000001',
      team: 'CT',
      activity: 'playing',
      match_stats: { kills: 12, assists: 3, deaths: 6, mvps: 2, score: 31 },
      state: { health: 76, armor: 100, helmet: true, money: 4350, round_kills: 2, round_killhs: 1, equip_value: 5200 },
      weapons: { weapon_1: { name: 'weapon_m4a1_silencer', state: 'active' } },
    },
    phase_countdowns: { phase: 'live', phase_ends_in: '85.0' },
    auth: { token: /"token" "([0-9a-f]+)"/.exec(gsi)[1] },
  }
  // As the game does: again and again while the match runs
  const postMatch = () => fetch(gsiUrl, { method: 'POST', body: JSON.stringify(match) }).catch(() => {})
  await postMatch()
  const posting = setInterval(postMatch, 2000)
  try {
    await until('B lists Ann on Mirage, her side 7–4', () => b.ev(`${annRow}?.querySelector('.activity-line')?.textContent.includes('Mirage 7–4')`), 20)
    await b.ev(`${annRow}.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))`)
    await until("Ann's panel glances at the match: map, mode and her side's score", () => b.ev(pop((p) => p.querySelector('.glance-place')?.textContent === 'Mirage · Competitive' && p.querySelector('.glance-score.ahead')?.textContent === '7–4')), 10)
    await sleep(400) // its opening is over
    await b.shot('profile-panel')
    await b.ev(expandPop)
    const cs2Card = `document.querySelector('dialog[open] .cs2')`
    await until("Ann's card shows the match: map, mode, round, score, round strip, clock, her K/A/D", () =>
      b.ev(`(() => { const c = ${cs2Card}; return !!c && c.querySelector('.cs2-map').textContent === 'Mirage' && c.textContent.includes('Competitive · Round 12') && c.querySelector('.cs2-team.ct b').textContent === '7' && c.querySelector('.cs2-team.ct.ours') && c.querySelectorAll('.cs2-rounds li').length === 3 && c.querySelectorAll('.cs2-rounds li.t').length === 1 && /1:2\\d|1:1\\d/.test(c.querySelector('.cs2-clock').textContent) && c.textContent.includes('12 / 3 / 6') })()`), 10)
    if (await b.ev(`${cs2Card}.textContent.includes('Money')`)) throw new Error('health, money and weapon were shared without being turned on')
    console.log('ok   her health, money and weapon stay hidden until she turns them on')
    await a.ev(`api.call('state').then((s) => api.call('setSettings', { activity: { ...s.settings.activity, cs2: { state: true } } }))`)
    await b.shot('card-cs2')
    await until('turned on, B sees her health, money and weapon', () => b.ev(`(() => { const c = ${cs2Card}; return !!c && c.textContent.includes('76 · 100 + helmet') && c.textContent.includes('$4,350') && c.textContent.includes('M4A1-S') && c.textContent.includes('2 kills, 1 HS') })()`), 10)
    await b.ev(`document.querySelector('dialog[open] .activity-achievements')?.scrollIntoView()`)
    await b.shot('card-cs2-state')
    await b.ev(`[...document.querySelectorAll('dialog[open] button')].find(x => x.textContent === 'Close').click()`)
    await b.shot('home-cs2')
    // Settings shows CS2 as live while the game sends
    await a.ev(`document.querySelector('.user-bar button[title="Settings"]').click()`)
    await until('Settings has the Steam tile', () => a.ev(`!!document.querySelector('.connection[data-k="steam"]')`), 10)
    await a.ev(`document.querySelector('.connection[data-k="steam"]').click()`)
    await until('the Steam panel shows CS2 as live', () => a.ev(`document.querySelector('.connection-game[data-game="cs2"] .gsi-state.live')?.textContent === 'Live'`), 10)
    await a.ev(`document.querySelector('.connections').scrollIntoView()`)
    await a.shot('settings-cs2-live')
    await a.ev(`document.querySelector('dialog[open] .dialog-close').click()`)
  } finally {
    clearInterval(posting)
  }

  console.log('--- Activity: a Dota 2 match, through the same Game State Integration server')
  await a.ev(`document.querySelector('.user-bar button[title="Settings"]').click()`)
  await until('Settings shows the Steam tile with CS2 live', () => a.ev(`document.querySelector('.connection[data-k="steam"] .connection-state')?.textContent === 'CS2'`), 10)
  await a.ev(`document.querySelector('.connection[data-k="steam"]').click()`)
  const dotaSwitch = `document.querySelector('input[aria-label="Dota 2 live match details"]')`
  await until('the Steam panel offers Dota 2', () => a.ev(`!!${dotaSwitch} && !${dotaSwitch}.disabled && !${dotaSwitch}.checked`), 10)
  await a.ev(`${dotaSwitch}.click()`)
  // Steam here has no Dota launch option for it (or no Steam at all), so Settings says to add it
  await until('turning Dota 2 on writes the file and asks for the launch option', () => a.ev(`(() => { const g = document.querySelector('.connection-game[data-game="dota"]'); return ${dotaSwitch}.checked && g.querySelector('.connection-note code')?.textContent === '-gamestateintegration' })()`), 10)
  await a.ev(`document.querySelector('.connections').scrollIntoView()`)
  await a.shot('settings-dota')
  await a.ev(`document.querySelector('dialog[open] .dialog-close').click()`)
  const dotaCfg = readFileSync(join(annGsiCfg, 'dota', 'gamestate_integration_eleusinia.cfg'), 'utf8')
  if (/"uri" "([^"]+)"/.exec(dotaCfg)[1] !== gsiUrl) throw new Error('Dota 2 and CS2 were given different servers')
  const dota = {
    provider: { name: 'Dota 2', appid: 570, version: 47, timestamp: 1 },
    map: { name: 'start', clock_time: 1234, daytime: false, radiant_score: 21, dire_score: 14, game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS', paused: false, win_team: 'none' },
    player: { steamid: '76561198000000001', activity: 'playing', kills: 9, deaths: 2, assists: 11, last_hits: 212, denies: 14, kill_streak: 4, team_name: 'dire', gold: 2310, gpm: 612, xpm: 701 },
    hero: { name: 'npc_dota_hero_antimage', level: 19, alive: true, buyback_cost: 1520, buyback_cooldown: 0, health: 1650, max_health: 2100, mana: 410, max_mana: 780, aghanims_shard: true },
    items: { slot0: { name: 'item_bfury' }, slot1: { name: 'item_manta' }, slot2: { name: 'empty' }, slot3: { name: 'item_power_treads' }, slot4: { name: 'item_blink' }, slot5: { name: 'empty' }, slot6: { name: 'item_magic_wand' }, neutral0: { name: 'item_mysterious_hat' } },
    auth: { token: /"token" "([0-9a-f]+)"/.exec(dotaCfg)[1] },
  }
  const postDota = () => fetch(gsiUrl, { method: 'POST', body: JSON.stringify(dota) }).catch(() => {})
  await postDota()
  const postingDota = setInterval(postDota, 2000)
  try {
    // The game sending its details is running, so it replaces the one the watcher saw
    await until('B lists Ann as Anti-Mage, her side (Dire) first: 14–21', () => b.ev(`${annRow}?.querySelector('.activity-line')?.textContent.includes('Dota 2 · Anti-Mage 14–21')`), 20)
    await b.ev(`${annRow}.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))`)
    await until("Ann's panel glances at the match: hero, level and her side behind", () => b.ev(pop((p) => p.querySelector('.glance-place')?.textContent === 'Anti-Mage · level 19' && p.querySelector('.glance-score.behind')?.textContent === '14–21')), 10)
    await b.ev(expandPop)
    const dotaCard = `document.querySelector('dialog[open] .dota')`
    await until("Ann's card shows the match: hero, level, night, the kills per side, the clock, her numbers", () =>
      b.ev(`(() => { const c = ${dotaCard}; return !!c && c.querySelector('.cs2-map').textContent === 'Anti-Mage' && c.textContent.includes('Level 19 · Playing · Night') && c.querySelector('.cs2-team.radiant b').textContent === '21' && c.querySelector('.cs2-team.dire.ours') && /^20:[34]\\d/.test(c.querySelector('.cs2-clock').textContent) && c.textContent.includes('9 / 2 / 11') && c.textContent.includes('212 / 14') && c.textContent.includes('612 / 701') })()`), 10)
    if (await b.ev(`${dotaCard}.textContent.includes('Gold')`)) throw new Error('gold and items were shared without being turned on')
    console.log('ok   her gold, items and health stay hidden until she turns them on')
    await a.ev(`api.call('state').then((s) => api.call('setSettings', { activity: { ...s.settings.activity, dota: { live: true } } }))`)
    await until('turned on, B sees her items, health, mana, gold and buyback', () =>
      b.ev(`(() => { const c = ${dotaCard}; return !!c && c.querySelectorAll('.dota-items ul[aria-label="Items"] img').length === 4 && c.querySelector('.dota-items .neutral img') && c.querySelector('.dota-bar.health').textContent.includes('1,650 / 2,100') && c.textContent.includes('2,310') && c.textContent.includes('Ready, 1,520 gold') && c.textContent.includes('Shard') })()`), 10)
    // The hero and item pictures come from Steam's Dota 2 folders, through eleusinia-art:
    await until('the hero and item pictures load', () => b.ev(`[...document.querySelectorAll('dialog[open] .dota img')].every((i) => i.complete && i.naturalWidth > 0)`), 30)
    await b.shot('card-dota')
    await b.ev(`[...document.querySelectorAll('dialog[open] button')].find(x => x.textContent === 'Close').click()`)
  } finally {
    clearInterval(postingDota)
  }
  // Remove drops the live details at once, and Ann is back to the game the watcher found
  await a.ev(`window.api.gsi('dota', 'remove')`)
  await until('after Remove, B lists Ann on CS2 again', () => b.ev(`${annRow}?.querySelector('.activity-line')?.textContent.includes('Counter-Strike 2')`), 10)

  console.log('--- Activity: Destiny 2, with a linked Bungie.net account')
  const bobRowA = `[...document.querySelectorAll('.online .row-button')].find((x) => x.textContent.includes('Bob'))`
  await b.ev(`document.querySelector('.user-bar button[title="Settings"]').click()`)
  const bungieTile = `document.querySelector('.connection[data-k="bungie"]')`
  await until('Settings offers to link Bungie.net', () => b.ev(`${bungieTile}?.textContent.includes('Link')`), 10)
  await b.ev(`${bungieTile}.click()`)
  // The sign-in goes through bungie.net's authorize page and back to the app's own server on 127.0.0.1
  await until('B is linked: the tile names the account and its switches open', () => b.ev(`(() => { const p = document.querySelector('.connection-panel'); return ${bungieTile}.textContent.includes('Guardian#0042') && !!p && p.querySelectorAll('input[role="switch"]').length === 4 && [...p.querySelectorAll('button')].some((x) => x.textContent === 'Unlink') })()`), 15)
  if (bungieFake.seen.authorize !== 1 || bungieFake.seen.token[0] !== 'authorization_code') throw new Error('linking did not go through the authorize page and the token exchange')
  await b.ev(`document.querySelector('.connections').scrollIntoView()`)
  await b.shot('settings-bungie')
  await b.ev(`document.querySelector('dialog[open] .dialog-close').click()`)
  await until('A lists Bob in the raid', () => a.ev(`${bobRowA}?.querySelector('.activity-line')?.textContent.includes("Destiny 2 · Raid · Salvation's Edge")`), 20)
  await a.ev(`${bobRowA}.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))`)
  await until("Bob's panel glances at the raid", () => a.ev(pop((p) => p.querySelector('.glance-game')?.textContent === 'Destiny 2' && p.querySelector('.glance-place')?.textContent === "Raid · Salvation's Edge")), 10)
  await a.ev(expandPop)
  const destinyCard = `document.querySelector('dialog[open] .destiny')`
  await until("Bob's card shows the activity, his guardian, the fireteam and the loadout", () =>
    a.ev(`(() => { const c = ${destinyCard}; return !!c && c.querySelector('.destiny-activity-name').textContent === "Salvation's Edge" && c.querySelector('.destiny-activity-mode').textContent === 'Raid' && c.querySelector('.destiny-activity-light').textContent === '1990' && c.querySelector('.destiny-where').textContent.startsWith('The Pale Heart') && !document.querySelector('dialog[open] .activity-art') && c.textContent.includes('Warlock Rivensbane') && c.querySelector('.destiny-light').textContent === '2010' && c.querySelector('.destiny-clan')?.textContent.trim() === '[LW] The Last Wardens' && c.textContent.includes('Guardian Rank 7') && c.textContent.includes('Fireteam 3/6 · 3 open') && ['Ann', 'Osiris', 'Saint'].every((n) => c.querySelector('.destiny-fireteam').textContent.includes(n)) && c.querySelectorAll('.destiny-loadout li').length === 5 && c.querySelectorAll('.destiny-loadout li.exotic').length === 4 })()`), 10)
  // The activity's picture and Gjallarhorn's icon are real bungie.net files, fetched through eleusinia-art:
  const pictureLoads = `new Promise((ok) => { const i = new Image(); i.onload = () => ok(i.naturalWidth > 0); i.onerror = () => ok(false); i.src = ${destinyCard}.querySelector('.destiny-activity').style.backgroundImage.slice(5, -2) })`
  await until('the activity picture and the exotic icon load from bungie.net', () => a.ev(`${pictureLoads}.then((art) => { const g = ${destinyCard}.querySelector('.destiny-loadout img[alt="Gjallarhorn"]'); return art && g.complete && g.naturalWidth > 0 })`), 30)
  await a.shot('card-destiny')
  await a.ev(`${destinyCard}.querySelector('.destiny-loadout').scrollIntoView()`)
  await a.shot('card-destiny-loadout')
  await a.ev(`[...document.querySelectorAll('dialog[open] button')].find(x => x.textContent === 'Close').click()`)
  await b.ev(`api.call('state').then((s) => api.call('setSettings', { activity: { ...s.settings.activity, destiny: { loadout: false, fireteam: false } } }))`)
  await until('turning the loadout and fireteam off removes them from what A gets', () => a.ev(`api.call('state').then((s) => { const d = s.activity[Object.keys(s.activity).find((k) => s.activity[k]?.game?.app === 1085660)]?.game?.destiny; return !!d?.activity && !d.loadout && !d.fireteam })`), 10)

  await a.ev(`api.call('setSettings', { activity: { games: true, details: true, achievements: false, playtime: false } })`)
  await until('turning details off removes them from what B gets', () => b.ev(bobSees('!!g && !g.achievements && g.played === undefined && g.developer === "Valve"')))
  await a.ev(`api.call('setSettings', { activity: { games: false } })`)
  await until('turning sharing off removes the game from B', () => b.ev(`${bobSees('!g')}.then((gone) => gone && !${annRow}.querySelector('.activity-line'))`))

  console.log('--- DM, recipient online')
  await a.ev(open('Bob'))
  await b.ev(open('Ann'))
  await a.ev(say('dm online'))
  await until('B shows it', () => b.ev(shows('dm online')))
  await until('A shows it delivered', () => a.ev(`!${pendingMark}`))
  await a.ev(say('second line'))
  await until('B stacks the second message under the first (one name, one picture)', () =>
    b.ev(`[...document.querySelectorAll('.msg.continued')].some(p => p.textContent.includes('second line')) && document.querySelectorAll('.msg:not(.continued)').length === 1`))

  console.log('--- Sharing files')
  await a.ev(sendFiles(8, 'files here'))
  await until('B shows the pasted picture inline, re-encoded and fetched by itself', () => b.ev(`${shows('files here')} && ${pictureShown}`), 30)
  await until('B shows big.bin as a card to download, not fetched', () => b.ev(`[...document.querySelectorAll('.file-card')].some((x) => x.textContent.includes('big.bin') && x.textContent.includes('Download'))`), 5)
  const saved = join(mkdtempSync(join(tmpdir(), 'eleusinia-smoke-dl-')), 'big.bin')
  const bigHash = await b.ev(fetchBig(await a.ev(`api.call('state').then((s) => s.me)`), saved))
  await until('B downloads it and can show it in its folder', () => b.ev(`[...document.querySelectorAll('.file-card')].some((x) => x.textContent.includes('Show in folder'))`), 60)
  if (createHash('sha256').update(readFileSync(saved)).digest('hex') !== bigHash) throw new Error('the saved file does not match')
  console.log('ok   the saved file matches what Ann sent, byte for byte')

  console.log('--- Links')
  // A page on this machine stands in for a site. B's own app reads it while B types the link; Ann's app fetches nothing.
  const jpeg = Buffer.from(await b.ev(`(() => { const c = document.createElement('canvas'); c.width = 400; c.height = 200; const x = c.getContext('2d'); x.fillStyle = '#425a6b'; x.fillRect(0, 0, 400, 200); return c.toDataURL('image/jpeg').split(',')[1] })()`), 'base64')
  const hits = []
  const site = createServer((req, res) => {
    hits.push(req.url)
    if (req.url === '/pic.jpg') return res.writeHead(200, { 'Content-Type': 'image/jpeg' }).end(jpeg)
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end('<html><head><title>fallback</title><meta property="og:title" content="A page about fog"><meta property="og:description" content="Mist over stone, all day."><meta property="og:image" content="/pic.jpg"></head><body></body></html>')
  })
  await new Promise((r) => site.listen(0, '127.0.0.1', r))
  const page = `http://127.0.0.1:${site.address().port}/fog`
  await b.ev(`(() => { const t = document.querySelector('form.send textarea'); t.value = 'have a look: ${page}, it is good'; t.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await until('while B types, the composer shows the preview its own app made', () => b.ev(`(() => { const c = document.querySelector('.composer .link-card'); return !!c && c.querySelector('.link-title')?.textContent === 'A page about fog' && c.textContent.includes('Mist over stone') && !!c.querySelector('.link-image img') })()`), 15)
  await b.ev(`document.querySelector('form.send').requestSubmit()`)
  const linkShown = `(() => { const m = [...document.querySelectorAll('.msg')].find((x) => x.textContent.includes('have a look')); const a = m?.querySelector('.msg-link'); return !!a && a.getAttribute('href') === '${page}' && a.textContent === '${page}' && m.querySelector('.link-card .link-title')?.textContent === 'A page about fog' && !!m.querySelector('.link-card img') })()`
  await until('Ann gets the message with its link clickable and the preview, signed by B', () => a.ev(linkShown), 15)
  if (!(await b.ev(linkShown))) throw new Error("B's own copy lacks the link or its preview")
  await a.shot('link-preview')
  if (hits.length !== 2) throw new Error(`the page was fetched ${hits.length} times, not once by B for the page and once for its picture: ${hits}`)
  console.log("ok   only B's app fetched the page and its picture; Ann's showed the preview it was sent")
  await new Promise((r) => site.close(r))

  console.log('--- Profile panel')
  // Clicking a person opens their panel beside them: picture over a banner of their own picture, name, friend ID and
  // about, and a box to message them; the full card, with the Unique Key and their version, opens from it.
  const annPop = pop((p) => p.textContent.includes('I am Ann') && p.textContent.includes('anntester#') && !!p.querySelector('.pop-portrait .avatar img') && !!p.querySelector('.pop-banner img') && !!p.querySelector('.pop-note input'))
  const beside = (sel) => `(() => { const p = document.querySelector('.profile-pop').getBoundingClientRect(); const r = document.querySelector('${sel}').getBoundingClientRect(); return p.left >= r.right || p.right <= r.left })()`
  await b.ev(`document.querySelector('.msg .user').click()`)
  await until("B clicking Ann's name in the chat opens her panel beside it", async () => (await b.ev(annPop)) && b.ev(beside('.msg .user')), 5)
  await b.ev(`document.querySelector('.msg .user').click()`)
  await until('clicking her name again closes it', () => b.ev(`!document.querySelector('.profile-pop')`), 5)
  await b.ev(`document.querySelector('.msg .user').click()`)
  await until('and again opens it', () => b.ev(annPop), 5)
  await b.ev(expandPop)
  await until('its expand button opens the full card, with the Unique Key and her version', () =>
    b.ev(`(() => { const d = document.querySelector('dialog[open].card-dialog'); return !!d && d.textContent.includes('I am Ann') && d.textContent.includes('Unique Key') && /Eleusinia \\d+\\.\\d+\\.\\d+/.test(d.textContent) && !!d.querySelector('.pop-banner') })()`), 5)
  await b.ev(`[...document.querySelectorAll('dialog[open] button')].find(x => x.textContent === 'Close').click()`)
  if (!(await b.ev(`(() => { const h = document.querySelector('.chat-person'); return !!h?.querySelector('.avatar') && h.textContent.includes('Ann') && h.textContent.includes('anntester#') })()`))) throw new Error('the DM header lacks the picture, name or friend ID')
  // Messaging from the panel: it lands in the DM, and the panel says so
  await b.ev(`document.querySelector('.chat-person').click()`)
  await until('clicking the DM header opens the same panel', () => b.ev(annPop), 5)
  await b.ev(`(() => { const i = document.querySelector('.pop-note input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'from the panel'); i.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await b.ev(`document.querySelector('.pop-note').requestSubmit()`)
  await until('a message sent from the panel reaches Ann, and the panel says it was sent', async () => (await a.ev(shows('from the panel'))) && b.ev(pop((p) => !!p.querySelector('.pop-sent'))), 15)
  await b.ev(escape)
  await until('Escape closes the panel', () => b.ev(`!document.querySelector('.profile-pop')`), 5)
  await b.ev(`document.querySelector('aside.members .person-head').click()`)
  await until('clicking her in the profile column beside the chat opens the same panel', () => b.ev(annPop), 5)
  await b.ev(`document.querySelector('.msgs').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`)
  await until('a click elsewhere closes it', () => b.ev(`!document.querySelector('.profile-pop')`), 5)
  await b.ev(`document.querySelector('.rail-mark').click()`)
  await b.ev(`[...document.querySelectorAll('.online .row-button')].find((x) => x.textContent.includes('Ann')).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))`)
  await until('right-clicking Ann in the friends list opens the same panel', () => b.ev(annPop), 5)
  await b.ev(escape)
  // Mouse 4 and 5 (back and forward) move through where you have been.
  const mouse = (button) => `window.dispatchEvent(new MouseEvent('mouseup', { button: ${button}, bubbles: true }))`
  await b.ev(open('Ann'))
  await until('B is back in the DM', () => b.ev(`!!document.querySelector('.chat-person')`), 5)
  await b.ev(mouse(3))
  await until('mouse 4 goes back: Home', () => b.ev(`!!document.querySelector('main.home')`), 5)
  await b.ev(mouse(4))
  await until('mouse 5 goes forward: the DM again', () => b.ev(`!!document.querySelector('.chat-person')`), 5)

  console.log('--- Rail: direct conversations and the emblem')
  const railDm = `document.querySelector('.dm-row[aria-label^="Ann"]')` // the DMs now sit in the Home column, not on the rail
  await until('the DM with Ann, opened earlier, sits on the rail', () => b.ev(`!!${railDm}`), 5)
  await b.ev(`document.querySelector('.rail-mark').click()`)
  await until('clicking the emblem goes Home, and it is marked as where we are', () => b.ev(`!!document.querySelector('main.home') && document.querySelector('.rail-mark').classList.contains('active')`), 5)
  await b.ev(`${railDm}.click()`)
  await until("clicking Ann on the rail opens the DM", () => b.ev(`!!document.querySelector('.chat-person') && ${railDm}.classList.contains('active')`), 5)
  await b.ev(`document.querySelector('.rail-mark').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))`)
  await until('right-clicking the emblem opens its menu, with no shortcut advertised', () => b.ev(`!!document.querySelector('dialog[open].menu-dialog') && !document.querySelector('dialog[open].menu-dialog kbd') && !document.querySelector('.rail-tip')?.textContent.includes('Ctrl')`), 5)
  await b.ev(`document.querySelector('dialog[open].menu-dialog').close()`)
  // Right-click: a menu in sections, read and pin first, the person next, calls, closing, and the drastic ones last
  const menuOf = `[...document.querySelectorAll('.context-menu .context-section')].map((s) => [...s.querySelectorAll('[role=menuitem]')].map((i) => i.textContent))`
  const item = (label) => `[...document.querySelectorAll('.context-menu [role=menuitem]')].find((i) => i.textContent.startsWith('${label}')).click()`
  const rightClick = (sel) => `${sel}.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 60, clientY: 140 }))`
  await b.ev(rightClick(railDm))
  const sections = await until("right-clicking Ann on the rail opens her menu, in sections", () => b.ev(`(() => { const m = ${menuOf}; return m.length === 5 && m })()`), 5)
  console.log('     ', JSON.stringify(sections))
  // No groups yet at this point of the run, so no Invite to group
  const want = [['Mute', 'Pin'], ['Profile', 'Copy friend ID', 'Add nickname'], ['Start a call'], ['Close DM'], ['Remove friend', 'Block']]
  if (JSON.stringify(sections) !== JSON.stringify(want)) throw new Error('the DM menu is not as expected')
  await b.ev(`document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`)
  await until('a click elsewhere closes it', () => b.ev(`!document.querySelector('.context-menu')`), 5)
  // A nickname, seen only here
  await b.ev(rightClick(railDm))
  await b.ev(item('Add nickname'))
  await b.ev(`(() => { const i = document.querySelector('dialog[open] input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Annie'); i.dispatchEvent(new Event('input', { bubbles: true })); i.form.requestSubmit() })()`)
  await until('a nickname replaces her name on the rail and in the chat', () => b.ev(`!!document.querySelector('.dm-row[aria-label^="Annie"]') && [...document.querySelectorAll('.msg .user')].some((u) => u.textContent === 'Annie')`), 5)
  await b.ev(rightClick(`document.querySelector('.dm-row[aria-label^="Annie"]')`))
  await b.ev(item('Change nickname'))
  await b.ev(`(() => { const i = document.querySelector('dialog[open] input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })); i.form.requestSubmit() })()`)
  await until('an empty nickname gives her own name back', () => b.ev(`!!${railDm}`), 5)
  // Close DM takes it off the rail until something new arrives, which then counts as unread
  await b.ev(rightClick(railDm))
  await b.ev(item('Close DM'))
  await until('Close DM takes Ann off the rail and goes Home', () => b.ev(`!${railDm} && !!document.querySelector('main.home')`), 5)
  await a.ev(say('are you there'))
  await until("Ann's new message brings her back, with a count of 1", () => b.ev(`${railDm}?.querySelector('.dm-count')?.textContent === '1'`), 15)
  await a.ev(say('hello?'))
  await until('a second message makes it 2', () => b.ev(`${railDm}?.querySelector('.dm-count')?.textContent === '2'`), 15)
  await sleep(400) // past the rail's and the page's transitions
  await b.shot('rail')
  // A call that comes and goes while B is elsewhere counts too
  await a.ev(press('Start call'))
  await until('B sees Ann calling', () => b.ev(`!!${railDm}?.querySelector('.dm-badge')`), 15)
  await a.ev(press('Disconnect'))
  await until('the missed call makes it 3', () => b.ev(`${railDm}?.querySelector('.dm-count')?.textContent === '3'`), 15)
  await b.ev(rightClick(railDm))
  await b.ev(item('Mute'))
  await until('muting hides the count', () => b.ev(`!!${railDm} && !${railDm}.querySelector('.dm-count')`), 5)
  await b.ev(rightClick(railDm))
  await b.ev(item('Unmute'))
  await until('unmuting shows it again', () => b.ev(`${railDm}?.querySelector('.dm-count')?.textContent === '3'`), 5)
  // Ignore (the person menu's): an ignored person's DM leaves the rail counts; un-ignoring brings it back
  await b.ev(`api.call('setSettings', { ignored: ['${await a.ev(`api.call('state').then((s) => s.me)`)}'] })`)
  await until("ignoring Ann takes her DM's count off the rail", () => b.ev(`!!${railDm} && !${railDm}.querySelector('.dm-count')`), 5)
  await b.ev(`api.call('setSettings', { ignored: [] })`)
  await until('un-ignoring brings it back', () => b.ev(`${railDm}?.querySelector('.dm-count')?.textContent === '3'`), 5)
  await b.ev(`${railDm}.click()`)
  await until('opening the DM reads it: the count is gone', () => b.ev(`!!document.querySelector('.chat-person') && !${railDm}.querySelector('.dm-count')`), 5)
  // Shown but not focused (on a second screen during a game) is not read. The page is told it has no focus, so the
  // step does not depend on which window the system happens to focus
  await b.ev(`document.hasFocus = () => false`)
  await a.ev(say('still there?'))
  await until('in an unfocused window, the open DM still counts a new message', () => b.ev(`${railDm}?.querySelector('.dm-count')?.textContent === '1'`), 15)
  await b.ev(`delete document.hasFocus`) // back to the real one, which focus emulation answers with true
  await b.ev(`window.dispatchEvent(new Event('focus'))`)
  await until('focusing the window reads it', () => b.ev(`!${railDm}.querySelector('.dm-count')`), 5)

  console.log('--- Voice call from the left sidebar')
  const joinsBefore = (await sounds(a)).filter((x) => x === 'join').length // the missed call above played one
  await a.ev(press('Start call'))
  const sign = (p) => p.ev(`(() => { const s = document.querySelector('.signal'); const tip = document.getElementById('ping-tip'); document.querySelector('.signal-icon').focus(); return s ? [s.className, s.textContent.includes('Voice Connected'), tip.textContent, getComputedStyle(tip).display] : null })()`)
  const graded = (s) => !!s && /\b(good|fair|poor)\b/.test(s[0]) && s[1] && s[3] === 'block'
  const alone = await until('A alone in the call: Voice Connected, coloured, ping to the network on focus', async () => {
    const s = await sign(a)
    return graded(s) && /Ping: \d+ ms/.test(s[2]) && s
  }, 20)
  console.log('     ', JSON.stringify(alone))
  await until('B sees the call in its sidebar', () => b.ev(`[...document.querySelectorAll('aside.voice button')].some(x => x.textContent.includes('Join call (1)'))`))
  await until('A plays the caller tune while waiting, and B rings', async () => (await sounds(a)).includes('calling') && (await sounds(b)).includes('ring'), 10)
  await b.ev(press('Join call'))
  await until('A connected to Bob', () => a.ev(`!!document.querySelector('.caller.state-connected')?.textContent.includes('Bob')`))
  await until('A hears Bob join (its own join, then his)', async () => (await sounds(a)).filter((x) => x === 'join').length === joinsBefore + 2, 10)
  await until('A sends voice ahead of video when the link is short of room', () =>
    a.ev(`(() => { const pc = window.__pcs.find((p) => p.connectionState === 'connected'); const e = pc?.getTransceivers().find((t) => t.receiver.track.kind === 'audio')?.sender.getParameters().encodings?.[0]; return e?.priority === 'high' && e?.networkPriority === 'high' })()`), 10)
  await until('B connected to Ann', () => b.ev(`!!document.querySelector('.caller.state-connected')?.textContent.includes('Ann')`))
  await b.ev(`document.querySelector('.caller.state-connected .caller-who').click()`)
  await until('clicking Ann in the call opens her panel beside it: in your call, her volume, a message box', () => b.ev(pop((p) => /in your call/i.test(p.textContent) && !!p.querySelector('.pop-volume input[type=range]') && !!p.querySelector('.pop-note input'))), 5)
  await sleep(400)
  await b.shot('profile-panel-call')
  await b.ev(escape)
  await b.ev(`[...document.querySelectorAll('.oculus-who')].find((x) => x.getAttribute('aria-label').includes('Ann')).click()`)
  await until('so does her picture above the chat', () => b.ev(pop((p) => /in your call/i.test(p.textContent))), 5)
  await b.ev(escape)
  const both = await until('A sign now measures the link to Bob', async () => {
    const s = await sign(a)
    return graded(s) && /Bob: \d+ ms(steady|(varies|unstable) ±\d+ ms)/.test(s[2]) && s
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
  // As on Discord: a stream is offered, not pushed. Until B joins, A sends B none of it
  await until('B is offered the stream where it will play, with Join stream', () => b.ev(`document.querySelector('.stage .screen.invite.big button')?.textContent === 'Join stream'`), 20)
  await until('the Join stream tile shows a still of the shared window', () => b.ev(`document.querySelector('.stage .screen.invite.big img.invite-preview')?.src.startsWith('data:image/jpeg;base64,')`), 15)
  // Chromium's bandwidth probes are resends with no payload, landing on whichever video slot it picks: only packets
  // carrying media count
  const media = async () => (await b.ev(received('screen'))) - (await b.ev(received('screen', 'retransmittedPacketsReceived')))
  const unjoined = await media()
  await sleep(3000)
  const unjoinedAfter = await media()
  const unjoinedBytes = await b.ev(received('screen', 'bytesReceived'))
  if (unjoinedAfter > unjoined + 20) throw new Error(`A sent its screen to B before B joined: ${unjoined} -> ${unjoinedAfter} media packets, ${unjoinedBytes} bytes in all`)
  // Computer sound is on by default (Windows): it too waits for B to join
  if ((await b.ev(received('sound'))) > 0) throw new Error('A sent its computer sound to B before B joined')
  console.log('ok   nothing of the stream reaches B before B joins')
  await b.ev(joinStream)
  await until("B shows the shared window large, at 720p", () => b.ev(`document.querySelector('.stage .screen.big video')?.videoHeight === 720`), 30)
  const heardSound = (p, s) => p.ev(`api.diagnostics().then((d) => d.events.some((e) => e.text.startsWith('sound: ${s}')))`)
  await until('B heard the stream start, and A heard a viewer join it', async () => (await heardSound(b, 'stream')) && (await heardSound(a, 'viewerJoin')), 10)
  // Picture in picture: going Home, B keeps watching in a corner; Back to call brings the stage back
  await b.ev(`document.querySelector('.rail-mark').click()`)
  await until('on Home, the stream plays on in the floating player', () => b.ev(`document.querySelector('.pip video')?.videoHeight > 0`), 10)
  await b.shot('pip')
  await b.ev(`document.querySelector('.pip .pip-back').click()`)
  await until('Back to call brings the stage back, and the floating player goes', () => b.ev(`!!document.querySelector('.stage .screen.big video') && !document.querySelector('.pip')`), 10)
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
  const peopleRow = `document.querySelector('.stage .screen.big .people-row')`
  await until("under the stream, B sees a tile for each person in the call: Ann and itself", () => b.ev(`${peopleRow}?.querySelectorAll('.person-tile').length === 2`), 5)
  await until('A, sharing, sees its own screen large with the same row', () => a.ev(`${peopleRow}?.querySelectorAll('.person-tile').length === 2`), 5)
  await b.ev(`${peopleRow}.querySelector('.people-toggle').click()`)
  await until('the button folds the row away', () => b.ev(`${peopleRow}.classList.contains('folded') && !${peopleRow}.querySelector('.person-tile')`), 5)
  await b.ev(`${peopleRow}.querySelector('.people-toggle').click()`)
  await until('and brings it back', () => b.ev(`${peopleRow}.querySelectorAll('.person-tile').length === 2`), 5)
  // A camera on while sharing fills its tile, and can be turned off without stopping the share
  await a.ev(press('Turn on camera'))
  await until('the camera dialog is ready', () => a.ev(`document.querySelector('dialog[open] .camera-preview video')?.videoHeight > 0`), 15)
  await a.ev(`[...document.querySelectorAll('dialog[open] button')].find((x) => x.textContent === 'Turn on camera').click()`)
  await until("Ann's camera plays in her tile under the stream on B", () => b.ev(`[...${peopleRow}.querySelectorAll('.person-tile')].some((t) => t.querySelector('video')?.videoHeight > 0)`), 30)
  await b.shot('people-row')
  await until('sharing with a camera on, A can see its Turn off camera control', () =>
    a.ev(`(() => { const b = [...document.querySelectorAll('.voice-bar button')].find((x) => x.textContent.includes('Turn off camera')); if (!b) return false; const r = b.getBoundingClientRect(), p = document.querySelector('.bars').getBoundingClientRect(); return r.width > 0 && r.left >= p.left && r.right <= p.right })()`), 5)
  await a.ev(`[...document.querySelectorAll('.stage button')].find((x) => x.textContent.includes('Turn off camera')).click()`)
  await until('the stage bar turns the camera off, and the share goes on', async () =>
    !(await a.ev(`!!${peopleRow}.querySelector('.person-tile video')`)) && (await a.ev(`!!document.querySelector('.stage .sharing-badge')`)) && b.ev(`document.querySelector('.stage .screen.big video')?.videoHeight > 0`), 10)
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
  // The title and controls fade a second after the last mouse move over the screen, and come back on the next one
  await until("the screen's title and controls fade when the mouse is still", () => b.ev(`(() => { const f = document.querySelector('.stage .screen.big'); return f.classList.contains('idle') && getComputedStyle(f.querySelector('figcaption')).opacity === '0' })()`), 5)
  await b.ev(`document.querySelector('.stage .screen.big').dispatchEvent(new PointerEvent('pointermove', { bubbles: true }))`)
  await until('moving the mouse brings them back', () => b.ev(`!document.querySelector('.stage .screen.big').classList.contains('idle')`), 2)
  await b.ev(`[...document.querySelectorAll('.stage button')].find((x) => x.textContent === 'Hide video').click()`)
  await until('B hides the screens (so A stops sending them)', () => b.ev(`!document.querySelector('.stage .screen') && document.querySelector('.stage').classList.contains('collapsed')`), 5)
  await b.ev(`[...document.querySelectorAll('.stage button')].find((x) => x.textContent === 'Show video').click()`)
  await until('B shows them again and frames flow', () => b.ev(`document.querySelector('.stage .screen.big video')?.videoHeight > 0`), 30)
  // Leaving the stream stops it reaching B and offers it again, and A hears its viewer go
  const viewerLeaves = async () => (await sounds(a)).filter((x) => x.startsWith('viewerLeave')).length
  const leavesBefore = await viewerLeaves()
  await b.ev(`[...document.querySelectorAll('.stage button')].find((x) => x.textContent === 'Leave stream').click()`)
  await until('B leaves the stream: Join stream again, no video playing', () => b.ev(`!!document.querySelector('.stage .screen.invite.big') && !document.querySelector('.stage .screen video')`), 5)
  const left = await b.ev(received('screen'))
  await sleep(3000)
  if ((await b.ev(received('screen'))) > left + 30) throw new Error('A kept sending its screen after B left the stream')
  console.log('ok   after leaving, the stream no longer reaches B')
  await until('A heard its viewer leave the stream', async () => (await viewerLeaves()) > leavesBefore, 5)
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
  // Disable video (the person menu's): Bob's camera stops reaching A, and comes back once turned off again
  const camFrames = () => a.ev(received('camera', 'framesReceived'))
  const camFlowing = async () => { const n = await camFrames(); await sleep(1500); return (await camFrames()) > n + 5 }
  await a.ev(`api.call('setSettings', { noVideo: ['${await b.ev(`api.call('state').then((s) => s.me)`)}'] })`)
  await until("with Bob's video disabled, his camera frames stop arriving at A", async () => !(await camFlowing()), 15)
  await a.ev(`api.call('setSettings', { noVideo: [] })`)
  await until('enabled again, they arrive again', camFlowing, 30)
  await until('B sees itself, mirrored', () => b.ev(`!!document.querySelector('.stage .screen.mirror video')`), 5)
  await b.ev(press('Turn off camera'))
  await until("Bob turns his camera off; A's stage closes", () => a.ev(`!document.querySelector('.stage')`), 10)

  if (process.platform === 'win32') {
    console.log('--- Computer sound with a share (Windows)')
    await a.ev(press('Share screen'))
    await a.ev(`document.querySelector('dialog[open] #share-tab-window').click()`)
    await pickOwn(a, ownTitles[1])
    // On by default; checked here so the run fails if that ever changes
    if (!(await a.ev(`document.querySelector('dialog[open] .sound-row input').checked`))) throw new Error('computer sound is not on by default')
    await a.ev(`[...document.querySelectorAll('dialog[open] button')].find((x) => x.textContent === 'Share').click()`)
    const how = await until('A shares with computer sound, or says why it cannot', () =>
      a.ev(`(() => { const badge = document.querySelector('.stage .sharing-badge')?.textContent ?? ''; const note = [...document.querySelectorAll('.call-notice')].some((n) => n.textContent.includes('sound is not being shared')); return badge.includes('with sound') ? 'sound' : note ? 'refused' : false })()`), 20)
    if (how === 'sound') {
      await until('B is offered the stream with sound', () => b.ev(`!!document.querySelector('.stage .screen.invite.big figcaption')?.textContent.includes('with sound')`), 20)
      await b.ev(joinStream)
      await until('B sees the share is with sound, and its sound arrives on its own slot', async () =>
        (await b.ev(`!!document.querySelector('.stage .screen.big figcaption')?.textContent.includes('with sound')`)) && (await b.ev(received('sound'))) > 0, 20)
      await b.ev(`(() => { const r = document.querySelector('.screen.big .screen-controls .screen-volume input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(r, '50'); r.dispatchEvent(new Event('input', { bubbles: true })) })()`)
      await until("B turns the stream down to 50% with the slider beside the full screen button", () =>
        b.ev(`(() => { const c = document.querySelector('.screen.big .screen-controls'); return c.querySelector('.screen-volume input').value === '50' && c.lastElementChild.classList.contains('screen-full') })()`), 5)
      // The speaker icon mutes the stream and unmutes it back to where it was
      const volBtn = `document.querySelector('.screen.big .screen-volume button')`
      await b.ev(`${volBtn}.click()`)
      await until('the speaker icon mutes the stream', () => b.ev(`${volBtn}.getAttribute('aria-pressed') === 'true' && document.querySelector('.screen.big .screen-volume input').value === '0'`), 5)
      await b.ev(`${volBtn}.click()`)
      await until('and unmutes it back to 50%', () => b.ev(`${volBtn}.getAttribute('aria-pressed') === 'false' && document.querySelector('.screen.big .screen-volume input').value === '50'`), 5)
      // With the video hidden (as when the window is minimised), the stream's sound still arrives
      await b.ev(`[...document.querySelectorAll('.stage button')].find((x) => x.textContent === 'Hide video').click()`)
      const before = await b.ev(received('sound'))
      await until('with the video hidden, the screen sound keeps arriving', async () => (await b.ev(received('sound'))) > before + 50, 10)
      await b.ev(`[...document.querySelectorAll('.stage button')].find((x) => x.textContent === 'Show video').click()`)
    } else console.log("      this system could not leave Eleusinia's own audio out, so no sound was shared, as intended")
    await a.ev(press('Stop sharing'))
    await until('A stops; the stage closes for B', () => b.ev(`!document.querySelector('.stage')`), 10)
  }
  // ELEUSINIA_NO_DIRECT=1 withholds direct routes, as two strict routers would; the call must then go through the relay.
  const forced = process.env.ELEUSINIA_NO_DIRECT === '1'
  await until(`call is ${forced ? 'relayed through the chat link' : 'direct'}`, async () =>
    (await a.ev(`document.querySelector('.callers').textContent.includes('relayed')`)) === forced &&
    (await b.ev(`document.querySelector('.callers').textContent.includes('relayed')`)) === forced, 10)
  // and the reports say so, from the route in use rather than the first one that answered
  await until(`A's diagnostics log the route as ${forced ? 'through the chat link' : 'direct'}`, () =>
    a.ev(`api.diagnostics().then((d) => d.events.some((e) => e.text.includes(${forced ? "'goes through the chat link'" : "'goes direct ('"})))`), 10)
  const annKey = await a.ev(`api.call('state').then((s) => s.me)`)
  if (!forced) {
    // A chat link that closes mid-call, as in a network blip, leaves the call alone while its own connection still works:
    // Bob stays in Ann's call and his voice keeps arriving, rather than Ann dropping him at once.
    const bobKey = await b.ev(`api.call('state').then((s) => s.me)`)
    await a.ev(`api.call('dropLink', '${bobKey}')`)
    await until("A's chat link with Bob closes", () => a.ev(`api.diagnostics().then((d) => d.events.some((e) => e.text === 'link closed with …${bobKey.slice(-6)}'))`), 5)
    const voice = await a.ev(received('voice', 'bytesReceived'))
    await sleep(5000)
    if (!(await a.ev(`[...document.querySelectorAll('.caller')].some((c) => c.textContent.includes('Bob'))`))) throw new Error('A dropped Bob from the call when only the chat link closed')
    if (!((await a.ev(received('voice', 'bytesReceived'))) > voice)) throw new Error("A stopped receiving Bob's voice when only the chat link closed")
    console.log("ok   with the chat link closed, Bob stays in A's call and his voice keeps arriving")
    await until('the chat link comes back', () => a.ev(`api.call('state').then((s) => s.online.includes('${bobKey}'))`), 60)
  }
  // Per-person volume: B turns Ann down; it is saved, and checked again after B restarts below.
  await b.ev(`(() => { const r = document.querySelector('.caller input[aria-label="Volume for Ann"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(r, '40'); r.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await until('B turns Ann down to 40%, and it is saved', () =>
    b.ev(`api.call('state').then((s) => s.settings.volumes?.['${annKey}'] === 0.4 && document.querySelector('.caller .person-volume-pct').textContent === '40%')`), 10)
  await until('the voice panel no longer holds the audio devices; they are in Settings', () =>
    b.ev(`!document.querySelector('aside.voice').textContent.includes('Audio devices')`), 5)
  // Hotkeys, pressed as real system-wide key events while A's window is minimised. F23 and F24 exist on no ordinary
  // keyboard, so injecting them cannot type into anything else on this machine.
  console.log('--- Noise suppression')
  await a.ev(`api.call('setSettings', { noiseSuppression: true })`)
  const diagText = (p) => p.ev(`api.diagnostics().then((d) => d.events.map((e) => e.text).join(' | '))`)
  await until('A turns noise suppression on mid-call: RNNoise starts, with no error', async () => {
    const t = await diagText(a)
    if (t.includes('noise suppression could not start')) throw new Error(t.split(' | ').find((l) => l.includes('could not start')))
    return t.includes('noise suppression on')
  }, 15).catch(async (e) => {
    throw new Error(e.message + ' | A diagnostics: ' + (await diagText(a)).slice(-1500))
  })
  const before = await b.ev(received('voice'))
  await sleep(3000)
  if (!((await b.ev(received('voice'))) > before)) throw new Error("B stopped receiving A's voice stream once it was cleaned")
  console.log("ok   B still receives A's (now cleaned) voice stream")
  const offs = (await diagText(a)).split('noise suppression off').length
  await a.ev(`api.call('setSettings', { noiseSuppression: false })`)
  await until("A turns it off again: the microphone is reopened with Chromium's own filter", async () => (await diagText(a)).split('noise suppression off').length > offs, 15)
  await sleep(1000)

  console.log('--- Hotkeys (none bound by default)')
  const { uIOhook, UiohookKey } = createRequire(import.meta.url)('uiohook-napi')
  const key = async (code, down) => (uIOhook.keyToggle(code, down ? 'down' : 'up'), sleep(150))
  const you = () => a.ev(`[...document.querySelectorAll('.caller')][0].textContent`)
  if (await a.ev(`api.call('state').then((s) => !!Object.keys(s.settings.hotkeys ?? {}).length)`)) throw new Error('a hotkey was bound by default')
  console.log('ok   no hotkeys are bound by default')
  // Set them the way a person would: Settings, Set, press the keys.
  await a.ev(`document.querySelector('.user-bar button[title="Settings"]').click()`)
  const order = await a.ev(`(() => { const t = document.querySelector('.audio-settings').textContent; return ['Speakers', 'Master volume', 'Sound volume', 'Microphone', 'Mic sensitivity', 'Voice bitrate'].map((x) => t.indexOf(x)) })()`)
  if (order.some((n, i) => n < 0 || (i && n < order[i - 1]))) throw new Error('Audio settings are not in the order Speakers, Master volume, Sound volume, Microphone, Mic sensitivity, Voice bitrate: ' + order)
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
  await a.focused(false) // emulated focus would also keep the page visible
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
    await until('push to talk ticked when held and when let go', async () => { const l = await sounds(a); return l.includes('talk') && l.includes('untalk') }, 5)
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
  await a.focused(true)
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
  if (!(await sounds(a)).includes('mute')) throw new Error('no mute sound')
  await until('B sees a muted mark to the right of Ann', () => b.ev(`(() => { const r = [...document.querySelectorAll('.caller')].find((x) => x.textContent.includes('Ann')); return !!r?.querySelector('.row-title .voice-mark[title=Muted]') })()`), 10)
  await a.ev(press('Deafen'))
  await until('A deafened: Deafened shown, both buttons pressed, Bob silenced locally', () =>
    a.ev(`document.querySelector('.callers').textContent.includes('Deafened') && [...document.querySelectorAll('.user-bar button[aria-pressed=true]')].length === 2 && [...document.querySelectorAll('audio')].every(x => x.muted)`), 5)
  await until('B sees a deafened mark instead', () => b.ev(`!!document.querySelector('.caller .row-title .voice-mark[title=Deafened]')`), 10)
  await a.ev(press('Undeafen'))
  await until('A undeafened: back to muted only', () => a.ev(`!document.querySelector('.callers').textContent.includes('Deafened') && document.querySelector('.callers').textContent.includes('Muted')`), 5)
  await until('B sees muted again', () => b.ev(`!!document.querySelector('.caller .row-title .voice-mark[title=Muted]') && !document.querySelector('.caller .voice-mark[title=Deafened]')`), 10)
  const played = await sounds(a)
  if (!['deafen', 'undeafen'].every((x) => played.includes(x))) throw new Error('no deafen or undeafen sound')
  console.log('ok   A heard each change: ' + played.join(', '))
  await a.ev(press('Disconnect'))
  await until('B sees Ann leave', () => b.ev(`document.querySelector('.callers')?.textContent.includes('Waiting')`))
  await until('B hears her leave', async () => (await sounds(b)).includes('leave'), 5)
  await b.ev(press('Disconnect'))

  console.log('--- Groups')
  await a.ev(`document.querySelector('.rail-mark').click()`)
  for (const g of ['Trio', 'Second']) {
    await a.ev(`document.querySelector('.rail-add').click()`)
    await a.ev(`[...document.querySelectorAll('.context-menu [role=menuitem]')].find((i) => i.textContent === 'Create a group').click()`)
    await a.ev(`(() => { const f = document.querySelector('form.new-group'); f.elements.name.value = '${g}'; f.querySelectorAll('[name=member]').forEach(x => x.checked = true); f.requestSubmit() })()`)
    await sleep(500)
    await a.ev(`document.querySelector('.rail-mark')?.click()`)
  }
  await until('A, B and C list both groups on the rail', async () => {
    for (const p of [a, b, c]) {
      await p.ev(`document.querySelector('.rail-mark')?.click()`)
      if (!(await p.ev(`['Trio','Second'].every(g => [...document.querySelectorAll('.rail-group')].some(x => x.getAttribute('aria-label').includes(g)))`))) return false
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
  await b.ev(`[...document.querySelectorAll('aside.members .member')].find((x) => x.textContent.includes('Ann')).click()`)
  await until('clicking anywhere on Ann in the members list opens her panel beside her row', async () => (await b.ev(pop((p) => p.textContent.includes('I am Ann')))) && b.ev(beside('aside.members .member')), 5)
  await b.ev(escape)
  await until('Escape closes it', () => b.ev(`!document.querySelector('.profile-pop')`), 5)
  await b.ev(`[...document.querySelectorAll('aside.members .member')].find((x) => x.textContent.includes('Cy')).click()`)
  await until("Cy, not B's friend, gets a panel offering to add him instead of a message box", () => b.ev(pop((p) => p.textContent.includes('Add friend') && !p.querySelector('.pop-note'))), 5)
  await b.ev(escape)
  // Renaming in place: click the name, type, Enter; Escape would keep the old one
  await b.ev(`document.querySelector('.group-name').click()`)
  await b.ev(`(() => { const i = document.querySelector('.group-name-edit'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Trio for now'); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })()`)
  await until('Escape keeps the old name', () => b.ev(`document.querySelector('.group-name')?.textContent === 'Trio'`), 5)
  await b.ev(`document.querySelector('.group-name').click()`)
  await b.ev(`(() => { const i = document.querySelector('.group-name-edit'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'The Trio'); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })()`)
  await until('B renames the group, and A and Cy see the new name', async () =>
    (await b.ev(`document.querySelector('.group-name')?.textContent === 'The Trio'`)) && (await a.ev(`document.querySelector('.group-name')?.textContent === 'The Trio'`)) && c.ev(`document.querySelector('.group-name')?.textContent === 'The Trio'`), 15)
  // Bob and Cy have no link (no picks, not friends): Bob saw Cy online above from Cy's presence note. Cy starts a call
  // in the group; Bob learns of it from the note, and his join, addressed to Cy, links them for the call.
  await c.ev(press('Start call'))
  await until("B sees Cy's call in the group, through Cy's presence note", () => b.ev(`[...document.querySelectorAll('aside.voice button')].some(x => x.textContent.includes('Join call (1)'))`), 30)
  await b.ev(press('Join call'))
  await until('B and Cy, never linked before, connect for the call', async () =>
    (await b.ev(`!!document.querySelector('.caller.state-connected')?.textContent.includes('Cy')`)) && c.ev(`!!document.querySelector('.caller.state-connected')?.textContent.includes('Bob')`), 45)
  await b.ev(press('Disconnect'))
  await c.ev(press('Disconnect'))

  await a.shot('conversation')
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
  const after = await a.ev(`[document.querySelector('aside.voice').getBoundingClientRect().width, document.querySelector('aside.members').getBoundingClientRect().width, localStorage.getItem('width-conv-left'), localStorage.getItem('width-conv-right')]`)
  console.log('     ', JSON.stringify(widths), '->', JSON.stringify(after))
  if (!(after[0] === 316 && after[1] === 336 && after[2] === '316' && after[3] === '336')) throw new Error('sidebars did not resize and persist')
  console.log('ok   voice and members sidebars grew by 16px and the widths were saved')
  await a.ev(`document.querySelector('.rail-mark').click()`)
  const home = await a.ev(`(() => { const s = document.querySelector('.splitter'); s.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); return new Promise(r => setTimeout(() => r(document.querySelector('aside').getBoundingClientRect().width), 200)) })()`)
  if (home !== 316) throw new Error('home sidebar did not resize: ' + home)
  console.log('ok   home sidebar resized independently (300 -> 316)')

  console.log('--- Bob goes offline (process killed)')
  b.child.kill()
  await until('A lists Bob under Offline after a divider', () => a.ev(`document.querySelector('.rail-mark').click(); [...document.querySelectorAll('.offline .row-button')].some(x => x.textContent.includes('Bob')) && !!document.querySelector('main.home hr')`), 60)
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
  await a.ev(`document.querySelector('.user-bar button[title="Settings"]').click()`)
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

  console.log('--- Servers')
  await a.ev(`document.querySelectorAll('dialog[open]').forEach((d) => d.close())`)
  await a.ev(`document.querySelector('.rail-mark').click()`)
  await until('out of a call, the user bar sits under the rail and the left column, and no voice bar', () =>
    a.ev(`(() => { const u = document.querySelector('.user-bar')?.getBoundingClientRect(), s = document.querySelector('aside.side').getBoundingClientRect(); return !!u && Math.abs(u.right - s.right) < 2 && u.left < 2 && !document.querySelector('.voice-bar') && !document.querySelector('.rail-item[aria-label="Settings"]') })()`), 5)
  await a.shot('bars-home')
  const menuItem = (label) => `[...document.querySelectorAll('.context-menu [role^=menuitem]')].find((i) => i.textContent === '${label}').click()`
  const typeIn = (sel, v) => `(() => { const i = document.querySelector('${sel}'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(v)}); i.dispatchEvent(new Event('input', { bubbles: true })); i.form.requestSubmit() })()`
  const channel = (name) => `[...document.querySelectorAll('.channel')].find((x) => x.querySelector('.channel-name')?.textContent === '${name}')`
  const headIs = (name) => `document.querySelector('.chat-head h1')?.textContent === '${name}'`
  await a.ev(`document.querySelector('.rail-add').click()`)
  await until('the rail\'s + opens a menu: Create a server, Join with an invite | Create a group', () =>
    a.ev(`JSON.stringify([...document.querySelectorAll('.context-menu .context-section')].map((s) => [...s.querySelectorAll('[role=menuitem]')].map((i) => i.textContent))) === '[["Create a server","Join with an invite"],["Create a group"]]'`), 5)
  await sleep(200) // past the menu's opening animation
  await a.shot('rail-add-menu')
  await a.ev(menuItem('Create a server'))
  await a.ev(typeIn('dialog[open] input[name=name]', 'Smoke Server'))
  await until('Ann creates a server; it opens on #general, with a voice channel, Lounge', () =>
    a.ev(`document.querySelector('.server-name')?.textContent === 'Smoke Server' && ${headIs('general')} && !!${channel('Lounge')} && !!document.querySelector('.rail-server.active')`), 15)
  await a.ev(`document.querySelector('.server-head').click()`)
  await a.ev(menuItem('Create a channel'))
  await a.ev(typeIn('dialog[open] input[name=name]', 'plans'))
  await until('Ann adds a text channel, #plans, listed before the voice channel, and it opens', () =>
    a.ev(`${headIs('plans')} && [...document.querySelectorAll('.channel-name')].map((x) => x.textContent).join() === 'general,plans,Lounge'`), 15)
  await a.ev(`document.querySelector('.server-head').click()`)
  await a.ev(menuItem('Invite people'))
  await a.ev(`[...document.querySelectorAll('dialog[open] button')].find((x) => x.textContent === 'Create link').click()`)
  const link = await until('Ann makes an invite link', () => a.ev(`document.querySelector('dialog[open] .invite-link b')?.textContent`), 10)
  await a.ev(`[...document.querySelectorAll('dialog[open] button')].find((x) => x.textContent === 'Done').click()`)
  await b.ev(`document.querySelector('.rail-add').click()`)
  await b.ev(menuItem('Join with an invite'))
  await b.ev(typeIn('dialog[open] .invite-input', link))
  await until('Bob joins with the link, and the server opens for him', () => b.ev(`document.querySelector('.server-name')?.textContent === 'Smoke Server'`), 60)
  await until('Bob sees #plans', () => b.ev(`!!${channel('plans')}`), 30)
  await b.ev(`${channel('plans')}.click()`)
  await b.ev(say('hello server'))
  await until("Ann sees Bob's message in #plans", () => a.ev(shows('hello server')), 30)
  await a.ev(say('welcome bob'))
  await until("Bob sees Ann's answer", () => b.ev(shows('welcome bob')), 30)
  await until('both are listed online in the members list', () => a.ev(`(() => { const m = document.querySelector('aside.members'); return !!m && m.textContent.includes('Online — 2') && ['Ann', 'Bob'].every((n) => m.textContent.includes(n)) })()`), 30)
  await until("Ann's message shows delivered once Bob's receipt is back", () => a.ev(`!!document.querySelector('.msgs .msg') && !document.querySelector('.msgs .msg-status.pending')`), 20)
  await a.shot('server')
  // A channel not being looked at counts on the server's rail tile and is bold until opened
  await a.ev(`${channel('general')}.click()`)
  await until('Ann opens #general', () => a.ev(headIs('general')), 5)
  await b.ev(say('plans for friday'))
  await until("Ann's server tile counts Bob's message in #plans, and #plans is bold with a count", () =>
    a.ev(`document.querySelector('.rail-server .rail-count')?.textContent === '1' && ${channel('plans')}.classList.contains('unread') && ${channel('plans')}.querySelector('.channel-count')?.textContent === '1'`), 30)
  await a.shot('server-unread')
  // Right-click a channel: its menu, with Mute channel folded until clicked
  await a.ev(`${channel('general')}.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 160, clientY: 160 }))`)
  await until('right-clicking #general shows Mark as read, Mute channel ▸, Copy link, Edit, Duplicate, Invite people and Delete channel', () =>
    a.ev(`JSON.stringify([...document.querySelectorAll('.context-menu .context-section')].map((s) => [...s.querySelectorAll('[role=menuitem]')].map((i) => i.textContent))) === '[["Mute channel ▸","Copy link"],["Edit channel","Duplicate channel","Invite people"],["Delete channel"]]'`), 5)
  await a.ev(menuItem('Mute channel ▸'))
  await until('Mute channel unfolds its times', () => a.ev(`['15 minutes', '1 hour', '8 hours', 'Until I turn it back on'].every((l) => [...document.querySelectorAll('.context-menu [role=menuitem]')].some((i) => i.textContent === l))`), 5)
  await sleep(200)
  await a.shot('menu-channel')
  await a.ev(menuItem('1 hour'))
  await until('muting #general for an hour is saved with its end time', () => a.ev(`api.call('state').then((s) => Object.values(s.settings.muted ?? {}).some((v) => typeof v === 'number' && v > Date.now() + 3500e3))`), 5)
  await a.ev(`${channel('plans')}.click()`)
  await until('opening #plans reads it: the count and the bold are gone', () => a.ev(`!document.querySelector('.rail-server .rail-count') && !${channel('plans')}.classList.contains('unread')`), 10)
  await b.ev(`document.querySelector('.channel-tools button[aria-label^="Open Lounge"]').click()`)
  await until("Bob opens Lounge's own text chat without joining its call", () =>
    b.ev(`${headIs('Lounge')} && document.querySelector('.msgs').textContent.includes("Lounge's text chat is new") && !document.querySelector('.voice-bar')`), 5)
  await b.ev(`${channel('Lounge')}.click()`)
  await until('clicking Lounge joins its call: Bob gets the Voice connected panel and is listed under it', () =>
    b.ev(`!!document.querySelector('.voice-bar') && !!document.querySelector('.voice-people')?.textContent.includes('Bob')`), 15)
  await until('Ann sees Bob in Lounge, with no ringing as for a direct call', () =>
    a.ev(`!!document.querySelector('.voice-people')?.textContent.includes('Bob') && !document.querySelector('.incoming-calls')`), 30)
  await b.shot('server-voice')
  await until('in a call, Bob has the voice bar above his user bar, saying In voice', () =>
    b.ev(`!!document.querySelector('.voice-bar .voice-where')?.textContent.includes('Lounge · Smoke Server') && document.querySelector('.user-bar').textContent.includes('In voice')`), 5)
  await b.shot('bars-call')
  // Right-click a person in a voice channel: Ann, the owner, may server mute Bob
  await a.ev(`document.querySelector('.voice-person').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 160, clientY: 300 }))`)
  await until("Ann's menu on Bob in Lounge has User volume, Mute, Ignore and Server mute, Server deafen, Move to, Disconnect", () =>
    a.ev(`(() => { const t = [...document.querySelectorAll('.context-menu [role^=menuitem]')].map((i) => i.textContent); return ['Profile', 'Mute', 'Disable video', 'Ignore', 'Server mute', 'Server deafen', 'Disconnect'].every((l) => t.includes(l)) && !!document.querySelector('.context-menu .person-volume') })()`), 5)
  await sleep(200)
  await a.shot('menu-person')
  await a.ev(`document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`)
  await b.ev(press('Disconnect'))
  await until('Bob leaves; Lounge is empty again for Ann', () => a.ev(`!document.querySelector('.voice-people')`), 30)
  // Invite to voice channel is a poke to a member, not a link: Bob gets a toast to join
  await a.ev(`document.querySelector('.channel-tools button[aria-label="Invite to voice channel"]').click()`)
  await a.ev(`[...document.querySelectorAll('dialog[open] .poke-row')].find((r) => r.textContent.includes('Bob')).querySelector('button').click()`)
  await a.shot('poke-picker')
  await until('Ann pokes Bob into Lounge from its hover button', () => a.ev(`!!document.querySelector('dialog[open] .poke-row [role=status]')?.textContent.includes('Poked Bob')`), 20)
  await until('Bob sees the poke as a toast with Join', () => b.ev(`document.querySelector('.poke-toast span')?.textContent === 'Ann invites you to Lounge in Smoke Server' && [...document.querySelectorAll('.poke-toast button')].some((x) => x.textContent === 'Join')`), 20)
  await sleep(300) // past the toast's rising animation
  await b.shot('poke-toast')
  await b.ev(`document.querySelector('.poke-toast button[aria-label=Dismiss]').click()`)
  await a.ev(`[...document.querySelectorAll('dialog[open] button')].find((x) => x.textContent === 'Done').click()`)
  // Server settings opens from the server menu, and every page draws without an error
  await a.ev(`document.querySelector('.server-head').click()`)
  await a.ev(`[...document.querySelectorAll('.context-menu [role^=menuitem]')].find((x) => x.textContent === 'Server settings').click()`)
  await until('Server settings opens from the server menu', () => a.ev(`!!document.querySelector('dialog[open] .settings-nav')`), 10)
  for (const page of ['Overview', 'Roles', 'Members', 'Channels', 'Invites', 'Bans', 'Audit log']) {
    await a.ev(`[...document.querySelectorAll('dialog[open] .settings-page')].find((x) => x.textContent.trim() === '${page}').click()`)
    await until(`its ${page} page shows`, () => a.ev(`document.querySelector('dialog[open] .settings-page.active')?.textContent.trim() === '${page}'`), 5)
    if (page === 'Roles' || page === 'Channels') await sleep(200), await a.shot('server-settings-' + page.toLowerCase())
  }
  await until('the audit log lists the server being made', () => a.ev(`(document.querySelector('dialog[open]')?.textContent ?? '').includes('Ann')`), 10)
  await a.shot('server-settings')
  // The server's banner: a game's art, saved, shows behind the name for Ann and for Bob (server.edit's banner)
  await a.ev(`[...document.querySelectorAll('dialog[open] .settings-page')].find((x) => x.textContent.trim() === 'Overview').click()`)
  await a.ev(`[...document.querySelectorAll('dialog[open] [aria-label="Banner from"] [role=radio]')].find((x) => x.textContent === "A game's art").click()`)
  await a.ev(`[...document.querySelectorAll('dialog[open] .banner-games button')].find((x) => x.textContent === 'Dota 2').click()`)
  await a.ev(`[...document.querySelectorAll('dialog[open] button')].find((x) => x.textContent === 'Save changes').click()`)
  const banner570 = `document.querySelector('.server-head .server-banner img')?.getAttribute('src') === 'eleusinia-art://steam/570/header'`
  await until("Ann sets the server's banner to Dota 2's art", () => a.ev(banner570), 10)
  await until('and it reaches Bob with the server', () => b.ev(`api.call('state').then((s) => Object.values(s.servers).some((v) => v.banner?.app === 570))`), 30)
  await a.shot('server-banner')
  await a.ev(`document.querySelector('dialog[open] .dialog-close').click()`)

  console.log('--- Opening the app beside a voice channel, and restarting in one')
  // Cy joins the server too, so two people are in Lounge when Ann opens the app
  await a.ev(`document.querySelector('.server-head').click()`)
  await a.ev(menuItem('Invite people'))
  await a.ev(`[...document.querySelectorAll('dialog[open] button')].find((x) => x.textContent === 'Create link').click()`)
  const link2 = await until('Ann makes another invite link', () => a.ev(`document.querySelector('dialog[open] .invite-link b')?.textContent`), 10)
  await a.ev(`[...document.querySelectorAll('dialog[open] button')].find((x) => x.textContent === 'Done').click()`)
  // Sent in a DM, the link shows as an invite card, which joins in one click
  const cyKey = await c.ev(`api.call('state').then((s) => s.me)`)
  await a.ev(`api.call('state').then((s) => api.call('send', [s.me, '${cyKey}'].sort().join('_'), 'come in ${link2}'))`)
  await c.ev(`document.querySelector('.rail-mark').click()`) // the DMs are listed in the Home column
  await until("Cy gets Ann's DM in the Home column", () => c.ev(`!!document.querySelector('.dm-row[aria-label^="Ann"]')`), 30)
  await c.ev(`document.querySelector('.dm-row[aria-label^="Ann"]').click()`)
  await until('the link shows as an invite card: Smoke Server, its members, Join; the link text itself is not repeated', () =>
    c.ev(`(() => { const k = document.querySelector('.invite-card'); return !!k && k.textContent.includes('Smoke Server') && /\\d+ members?, \\d+ online/.test(k.textContent) && k.querySelector('button').textContent === 'Join' && !document.querySelector('.msgs').textContent.includes('eleusinia://') && document.querySelector('.msgs').textContent.includes('come in') })()`), 30)
  await c.shot('invite-card')
  await c.ev(`document.querySelector('.invite-card button').click()`)
  await until('Cy joins the server from the card, and it opens', () => c.ev(`document.querySelector('.server-name')?.textContent === 'Smoke Server'`), 60)
  await until('Cy sees Lounge', () => c.ev(`!!${channel('Lounge')}`), 30)
  const inLounge = (p, ...names) => p.ev(`${JSON.stringify(names)}.every((n) => !!document.querySelector('.voice-people')?.textContent.includes(n))`)
  const diagLines = (p, start) => p.ev(`api.diagnostics().then((d) => d.events.map((e) => e.text).filter((t) => t.startsWith('${start}')))`)
  // Each connected call connection has received voice: every person in the call is heard
  const hearsAll = (n) => `(async () => {
    const live = window.__pcs.filter((p) => p.connectionState === 'connected')
    if (live.length < ${n}) return false
    for (const pc of live) {
      let got = 0
      ;(await pc.getStats()).forEach((r) => r.type === 'inbound-rtp' && r.kind === 'audio' && (got += r.packetsReceived ?? 0))
      if (!got) return false
    }
    return true
  })()`
  // Opened (or restarted) on the server: events that arrive while the window loads must wait for it, and the
  // people in Lounge show as soon as Ann is linked with them
  const restartAnn = async (port) => {
    a.child.kill()
    a = await launch(port, a.dir, annEnv)
    // A restart has real work behind the splash (links, presence, catch-up): it must finish, not give up, and show it
    if (!a.startup.ready || a.closed > 15000) throw new Error(`the splash on Ann's restart did not get ready well within 20 s: ${JSON.stringify(a.startup.pending)} ${JSON.stringify(await diagLines(a, 'startup'))}`)
    // Linked with both and caught up is real work, but it can finish before the page paints, so the splash may show
    // only Ready: what it showed is logged, not counted
    if (!/^linked with 2 of 2/.test(a.startup.steps.find((s) => s.id === 'links').detail)) throw new Error('the restart was ready before linking with Bob and Cy')
    console.log('ok   the splash showed', (await a.ev('window.__splash')).join(' → '))
    await until('Ann is back on Home', () => a.ev(`!!document.querySelector('main.home')`), 30)
    await a.ev(`document.querySelector('.rail-server').click()`)
    await until('Ann links with someone', async () => (await diagLines(a, 'linked with')).length > 0, 30)
  }
  await b.ev(`${channel('Lounge')}.click()`)
  await c.ev(`${channel('Lounge')}.click()`)
  await until('Ann sees Bob and Cy in Lounge', () => inLounge(a, 'Bob', 'Cy'), 30)
  await restartAnn(9235)
  await until('as soon as she is linked, the freshly opened Ann sees Bob and Cy in Lounge and online, without joining', async () =>
    (await inLounge(a, 'Bob', 'Cy')) && (await a.ev(`!document.querySelector('.voice-bar') && !!document.querySelector('aside.members')?.textContent.includes('Online — 3')`)), 3)
  console.log('     ', (await diagLines(a, 'first person shown'))[0])
  // A normal join keeps its first connections: nobody takes it for a restart (only a different known session is one)
  const restarts = (p) => p.ev(`api.diagnostics().then((d) => d.events.filter((e) => e.text.includes('restarted: dropping the old connection')).length)`)
  const restartsBC = async () => (await restarts(b)) + (await restarts(c))
  const seenRestarts = await restartsBC()
  let t = Date.now()
  await a.ev(`${channel('Lounge')}.click()`)
  await until('Ann joins Lounge and hears Bob and Cy at once', () => a.ev(hearsAll(2)), 4)
  if ((await restarts(a)) || (await restartsBC()) > seenRestarts) throw new Error('a normal join was taken for a restart and its connection dropped')
  console.log('ok   the normal join was not taken for a restart')
  console.log(`      heard both ${Date.now() - t} ms after clicking join;`, (await diagLines(a, 'joined:')).join(', '))
  // Bob and Cy still hold connections to Ann's old copy that look alive; her new copy's join replaces them at once
  // A window that reloaded since it was launched (the crash step) has lost the connection counter: put it back
  const track = `window.__pcs || (() => { window.__pcs = []; const P = RTCPeerConnection; window.RTCPeerConnection = class extends P { constructor(...a) { super(...a); window.__pcs.push(this) } } })(), window.__pcs.length`
  const pcsBefore = [await b.ev(track), await c.ev(track)]
  const renewed = (n) => `window.__pcs.slice(${n}).some((p) => p.connectionState === 'connected')`
  await restartAnn(9236)
  t = Date.now()
  await a.ev(`${channel('Lounge')}.click()`)
  await until('Ann restarts in the call, rejoins, and all three are connected again on new connections, hearing each other', async () =>
    (await a.ev(hearsAll(2))) && (await b.ev(renewed(pcsBefore[0]))) && (await c.ev(renewed(pcsBefore[1]))) && (await inLounge(a, 'Bob', 'Cy')) && (await inLounge(b, 'Ann', 'Cy')), 15)
  console.log(`      reconnected and heard both ${Date.now() - t} ms after rejoining`)
  // Bob ranks below Ann, so his menu on her has no server mute
  await b.ev(`[...document.querySelectorAll('.voice-person')].find((x) => x.textContent.includes('Ann')).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 160, clientY: 300 }))`)
  await until("Bob's menu on Ann in Lounge has Profile and Mute, and no Server mute", () =>
    b.ev(`(() => { const t = [...document.querySelectorAll('.context-menu [role^=menuitem]')].map((i) => i.textContent); return t.includes('Profile') && t.includes('Mute') && !t.includes('Server mute') && !t.includes('Disconnect') })()`), 5)
  await b.ev(`document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`)
  for (const p of [a, b, c]) await p.ev(press('Disconnect'))
  }
} catch (e) {
  failed = true
  console.error('FAIL', e.message)
  const all = [['A', a], ['B', b], ['C', c], ...(largeMode ? [['D', dee], ['E', eve]] : [])]
  for (const [n, p] of all) console.error(n, (await p.ev(`document.body.innerText`).catch(String)).replace(/\n+/g, ' | '))
  for (const [n, p] of all) console.error(n, 'DIAG', JSON.stringify(await p.ev(`api.diagnostics().then((d) => d.events.filter((e) => e.area === 'network' || e.area === 'call').map((e) => e.area[0] + ' ' + e.text).slice(-40))`).catch(String)))
} finally {
  children.forEach((ch) => ch.kill())
  await testnet?.destroy().catch(() => {})
}
console.log(`total ${((Date.now() - t0) / 1000).toFixed(0)}s`)
process.exit(failed ? 1 : 0)
