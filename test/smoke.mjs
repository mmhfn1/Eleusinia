// Drives three real app instances over the DevTools protocol and the public DHT:
// profile setup, friend search, layout, voice, and DMs and group messages with the recipient online and offline.
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const app = process.argv[2]
const exe = (await import('electron')).default // path to the Electron binary on any OS
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const t0 = Date.now()
const children = []
setTimeout(() => (console.error('FAIL overall timeout'), children.forEach((c) => c.kill()), process.exit(2)), 420000)

async function launch(port, dir = mkdtempSync(join(tmpdir(), 'eleusinia-smoke-'))) {
  const flags = [`--remote-debugging-port=${port}`, '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
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
  return { child, ev, dir, title }
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

// Goes Home first, since friends and groups are only listed there.
const open = (text) => `(() => { document.querySelector('button.home')?.click(); [...document.querySelectorAll('.row-button')].find(x => x.textContent.includes('${text}')).click() })()`
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
    await until(`typing "${typed}" suggests ${n}: ${n === 'Cy' ? 'generated' : 'uploaded'} picture, ID, key ending ${tail}`, () =>
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
  await until('B clicking the name opens Ann card with picture, about, ID and key ending', () =>
    b.ev(`(() => { const d = document.querySelector('dialog[open]'); return !!d && d.textContent.includes('I am Ann') && d.textContent.includes('anntester#') && d.textContent.includes('Key ending') && !!d.querySelector('.avatar img') })()`))
  await b.ev(`[...document.querySelectorAll('dialog button')].find(x => x.textContent === 'Close').click()`)

  console.log('--- Voice call from the left sidebar')
  await a.ev(press('Start call'))
  await until('B sees the call in its sidebar', () => b.ev(`[...document.querySelectorAll('aside.voice button')].some(x => x.textContent.includes('Join call (1)'))`))
  await b.ev(press('Join call'))
  await until('A connected to Bob', () => a.ev(`!!document.querySelector('.caller.state-connected')?.textContent.includes('Bob')`))
  await until('B connected to Ann', () => b.ev(`!!document.querySelector('.caller.state-connected')?.textContent.includes('Ann')`))
  // ELEUSINIA_NO_DIRECT=1 withholds direct routes, as two strict routers would; the call must then go through the relay.
  const forced = process.env.ELEUSINIA_NO_DIRECT === '1'
  await until(`call is ${forced ? 'relayed through the chat link' : 'direct'}`, async () =>
    (await a.ev(`document.querySelector('.callers').textContent.includes('relayed')`)) === forced &&
    (await b.ev(`document.querySelector('.callers').textContent.includes('relayed')`)) === forced, 10)
  await a.ev(press('Mute'))
  await until('A shows muted', () => a.ev(`document.querySelector('.callers').textContent.includes('Muted')`))
  await a.ev(press('Deafen'))
  await until('A deafened: Deafened shown, both buttons pressed, Bob silenced locally', () =>
    a.ev(`document.querySelector('.callers').textContent.includes('Deafened') && [...document.querySelectorAll('aside.voice button[aria-pressed=true]')].length === 2 && [...document.querySelectorAll('audio')].every(x => x.muted)`), 5)
  await a.ev(press('Undeafen'))
  await until('A undeafened: back to muted only', () => a.ev(`!document.querySelector('.callers').textContent.includes('Deafened') && document.querySelector('.callers').textContent.includes('Muted')`), 5)
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
  await until('A shows the group message', async () => (await a.ev(open('Trio')), a.ev(shows('group while bob offline'))))
  await until('A members sidebar shows Bob offline', () => a.ev(`document.querySelector('aside.members').textContent.includes('Offline (1)')`))

  console.log('--- Bob comes back')
  b = await launch(9234, b.dir)
  await until('B is straight on Home (profile kept)', () => b.ev(`!!document.querySelector('main.home')`))
  await until('B received the offline DM', async () => (await b.ev(open('Ann')), b.ev(shows('dm while offline'))), 120)
  await until('B received the offline group message', async () => (await b.ev(open('Trio')), b.ev(shows('group while bob offline'))), 120)
  await until('A shows the DM delivered', async () => (await a.ev(open('Bob')), a.ev(`${shows('dm while offline')} && !${pendingMark}`)), 120)

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
