// Drives three real app instances over the DevTools protocol and the public DHT:
// profile setup, friend search, layout, voice, and DMs and group messages with the recipient online and offline.
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const app = process.argv[2]
const exe = (await import('electron')).default // path to the Electron binary on any OS
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const t0 = Date.now()
const children = []
setTimeout(() => (console.error('FAIL overall timeout'), children.forEach((c) => c.kill()), process.exit(2)), 420000)

async function launch(port, dir = mkdtempSync(join(tmpdir(), 'eleusinia-smoke-'))) {
  // The windows overlap, and Windows reports a covered window as hidden; the app then (rightly) asks not to be sent
  // video. Occlusion detection is off so every window counts as visible.
  const flags = [`--remote-debugging-port=${port}`, '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--disable-features=CalculateNativeWinOcclusion']
  const child = spawn(exe, [app, ...flags], { env: { ...process.env, ELEUSINIA_DATA: dir }, stdio: 'ignore' })
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
  const ev = (expression) =>
    new Promise((resolve, reject) => {
      pending.set(++id, (m) => {
        const ex = m.result?.exceptionDetails
        ex ? reject(new Error(ex.exception?.description ?? ex.text)) : resolve(m.result.result.value)
      })
      ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
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
  return { child, ev, dir, title, windowState }
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
const press = (label) => `[...document.querySelectorAll('aside.voice button')].find(x => x.textContent.includes('${label}')).click()`
// A tiny real PNG, run through the same shrink path a picked file takes.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const a = await launch(9231)
let b = await launch(9232)
const c = await launch(9233)
let failed = false
try {
  console.log('--- Profile setup')
  console.log('     window title:', a.title)
  if (a.title !== 'Eleusinia') throw new Error('wrong title')
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
    const tip = document.getElementById('bitrate-tip'), icon = document.querySelector('.info-icon')
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
    await a.ev(`document.querySelector('.result').click()`)
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
  const src = await until('A sees the screens and windows it can share', () =>
    a.ev(`(() => { const b = [...document.querySelectorAll('dialog[open] .source')]; return b.length > 0 && b.map((x) => x.textContent) })()`), 20)
  console.log('     ', src.length, 'sources, first:', src[0])
  await a.ev(`document.querySelector('dialog[open] .source').click()`)
  const menu = await until('the streaming menu defaults to 720p at 30 fps, and offers what the system allows', () =>
    a.ev(`(() => { const s = [...document.querySelectorAll('dialog[open] .quality select')]; return s.length === 3 && [s[0].value, s[1].value, [...s[0].options].map((o) => o.textContent), [...s[1].options].map((o) => o.value)] })()`), 10)
  console.log('     ', JSON.stringify(menu))
  if (menu[0] !== '720' || menu[1] !== '30') throw new Error('stream quality did not default to 720p at 30 fps')
  await a.ev(`[...document.querySelectorAll('dialog[open] button')].find((x) => x.textContent === 'Share').click()`)
  await until('B shows A screen large, at 720p', () => b.ev(`document.querySelector('.stage .screen.big video')?.videoHeight === 720`), 30)
  await until('A sees that it is sharing, with a stop button', () => a.ev(`document.querySelector('.stage .sharing-badge')?.textContent.includes('You are sharing') && !!document.querySelector('.stage .button.danger')`))
  if (menu[2].some((t) => t.startsWith('1080p'))) {
    await a.ev(press('Stream settings'))
    await until('the quality menu opens on the current choice', () => a.ev(`document.querySelector('dialog[open] .quality select')?.value === '720'`), 5)
    await a.ev(`(() => { const s = document.querySelector('dialog[open] .quality select'); s.value = '1080'; s.dispatchEvent(new Event('change', { bubbles: true })) })()`)
    await a.ev(`[...document.querySelectorAll('dialog[open] button')].find((x) => x.textContent === 'Apply').click()`)
    await until('B now receives 1080p, as the streamer chose', () => b.ev(`document.querySelector('.stage .screen.big video')?.videoHeight === 1080`), 30)
  }
  if (src.length > 1) {
    const height = await b.ev(`document.querySelector('.stage .screen.big video').videoHeight`)
    await a.ev(`[...document.querySelectorAll('.stage button')].find((x) => x.textContent.includes('Switch screen')).click()`)
    await until('the switch dialog lists the sources, marking the one being shared', () =>
      a.ev(`(() => { const l = [...document.querySelectorAll('dialog[open] .source')]; return l.length > 1 && l.some((x) => x.textContent.startsWith('Now sharing')) })()`), 10)
    await a.ev(`document.querySelectorAll('dialog[open] .source')[1].click()`)
    await a.ev(`[...document.querySelectorAll('dialog[open] button')].find((x) => x.textContent === 'Switch').click()`)
    await until(`A switched to "${src[1]}" without stopping, keeping its quality, and B still sees it`, async () =>
      (await a.ev(`document.querySelector('.stage .sharing-badge')?.textContent.includes(${JSON.stringify(src[1])})`)) &&
      (await b.ev(`document.querySelector('.stage .screen.big video')?.videoHeight === ${height} && document.querySelector('.stage .screen.big figcaption').textContent.includes(${JSON.stringify(src[1])})`)), 30)
  }
  await b.ev(`[...document.querySelectorAll('.stage button')].find((x) => x.textContent === 'Hide screens').click()`)
  await until('B hides the screens (so A stops sending them)', () => b.ev(`!document.querySelector('.stage .screen') && document.querySelector('.stage').classList.contains('collapsed')`), 5)
  await b.ev(`[...document.querySelectorAll('.stage button')].find((x) => x.textContent === 'Show screens').click()`)
  await until('B shows them again and frames flow', () => b.ev(`document.querySelector('.stage .screen.big video')?.videoHeight > 0`), 30)
  await a.ev(`[...document.querySelectorAll('.stage button')].find((x) => x.textContent === 'Stop sharing').click()`)
  await until('A stops; the stage closes for B', () => b.ev(`!document.querySelector('.stage')`), 10)
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
  await key(UiohookKey.F24, true)
  await until('holding F24 with A minimised: Talking', async () => (await you()).includes('Talking'), 5)
  await key(UiohookKey.F24, false)
  await until('releasing it: back to push to talk', async () => (await you()).includes('Push to talk: hold F24'), 5)
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

  await a.ev(press('Mute'))
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
} catch (e) {
  failed = true
  console.error('FAIL', e.message)
  for (const [n, p] of [['A', a], ['B', b], ['C', c]]) console.error(n, (await p.ev(`document.body.innerText`).catch(String)).replace(/\n+/g, ' | '))
} finally {
  children.forEach((ch) => ch.kill())
}
console.log(`total ${((Date.now() - t0) / 1000).toFixed(0)}s`)
process.exit(failed ? 1 : 0)
