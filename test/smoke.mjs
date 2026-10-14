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
  return { child, ev, dir, title: page.title }
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
const open = (text) => `(() => { document.querySelector('button.home')?.click(); [...document.querySelectorAll('.item')].find(x => x.textContent.includes('${text}')).click() })()`
const say = (text) => `(() => { const f = document.querySelector('form.send'); f.elements.text.value = '${text}'; f.requestSubmit() })()`
const shows = (text) => `!!document.querySelector('.msgs')?.textContent.includes('${text}')`
const pendingMark = `!!document.querySelector('.msgs')?.textContent.includes('pending')`
const body = (text) => `document.body.innerText.includes('${text}')`
const press = (label) => `[...document.querySelectorAll('aside.voice button')].find(x => x.textContent.startsWith('${label}')).click()`
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
    await until(`${n} sees setup first, with a generated picture`, () => p.ev(`${body('Welcome to Eleusinia')} && !document.querySelector('aside') && !!document.querySelector('svg.avatar.big rect')`))
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
      f.elements.username.value = '${n}'; f.elements.name.value = '${n}'; f.elements.about.value = 'I am ${n}'; f.requestSubmit()
    })()`)
    await until(`${n} lands on Home`, () => p.ev(`!!document.querySelector('main.home')`))
  }
  const ids = {}
  for (const [p, n] of [[b, 'Bob'], [c, 'Cy']]) {
    ids[n] = await p.ev(`document.querySelector('aside details input[readonly]').value`)
    console.log(`     ${n} friend ID: ${ids[n]}`)
    if (!new RegExp('^' + n.toLowerCase() + '#\\d{4}$').test(ids[n])) throw new Error('unexpected friend ID ' + ids[n])
  }

  console.log('--- Friend search dropdown')
  for (const [p, n] of [[b, 'Bob'], [c, 'Cy']]) {
    const tail = await p.ev(`api.call('state').then(s => '…' + s.me.slice(-6).toUpperCase())`)
    await a.ev(`(() => { const f = document.querySelector('form.search'); f.elements.code.value = '${ids[n].toUpperCase()}'; f.requestSubmit() })()`)
    const pic = n === 'Cy' ? 'svg.avatar' : 'img.avatar'
    await until(`A's search lists ${n}: ${n === 'Cy' ? 'generated' : 'uploaded'} picture, ID, key ending ${tail}`, () =>
      a.ev(`(() => { const r = document.querySelectorAll('.result'); return r.length === 1 && !!r[0].querySelector('${pic}') && r[0].textContent.includes('${ids[n]}') && r[0].querySelector('.tail').textContent === '${tail}' })()`))
    await a.ev(`document.querySelector('.result').click()`)
    await until(`${n} sees the request with Ann's picture`, () => p.ev(`[...document.querySelectorAll('.row')].some(r => r.textContent.includes('Ann wants') && r.querySelector('img.avatar'))`))
    await p.ev(`[...document.querySelectorAll('.row button')].find(x => x.textContent === 'Accept').click()`)
  }

  console.log('--- Home: online and offline friends')
  await until('A lists Bob and Cy under Online, nobody under Offline', () => a.ev(`document.querySelectorAll('.online .item').length === 2 && document.querySelectorAll('.offline .item').length === 0`))

  console.log('--- DM, recipient online')
  await a.ev(open('Bob'))
  await b.ev(open('Ann'))
  await a.ev(say('dm online'))
  await until('B shows it', () => b.ev(shows('dm online')))
  await until('A shows it delivered', () => a.ev(`!${pendingMark}`))

  console.log('--- Profile card')
  await b.ev(`document.querySelector('.msg .user').click()`)
  await until('B clicking the name opens Ann card with picture, about, ID and key ending', () =>
    b.ev(`(() => { const d = document.querySelector('dialog[open]'); return !!d && d.textContent.includes('I am Ann') && d.textContent.includes('ann#') && d.textContent.includes('Key ending') && !!d.querySelector('img.avatar.big') })()`))
  await b.ev(`[...document.querySelectorAll('dialog button')].find(x => x.textContent === 'Close').click()`)

  console.log('--- Voice call from the left sidebar')
  await a.ev(press('Start call'))
  await until('B sees the call in its sidebar', () => b.ev(`[...document.querySelectorAll('aside.voice button')].some(x => x.textContent.startsWith('Join call (1)'))`))
  await b.ev(press('Join call'))
  await until('A connected to Bob', () => a.ev(`document.querySelector('.callers')?.textContent.includes('Bob: connected')`))
  await until('B connected to Ann', () => b.ev(`document.querySelector('.callers')?.textContent.includes('Ann: connected')`))
  await a.ev(press('Mute'))
  await until('A shows muted', () => a.ev(`document.querySelector('.callers').textContent.includes('You (muted)')`))
  await a.ev(press('Leave call'))
  await until('B sees Ann leave', () => b.ev(`document.querySelector('.callers')?.textContent.includes('Waiting')`))
  await b.ev(press('Leave call'))

  console.log('--- Groups')
  await a.ev(`document.querySelector('button.home').click()`)
  for (const g of ['Trio', 'Second']) {
    await a.ev(`(() => { const f = document.querySelector('aside details form'); f.elements.name.value = '${g}'; f.querySelectorAll('[name=member]').forEach(x => x.checked = true); f.requestSubmit() })()`)
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
  if (!(after[0] === 336 && after[1] === 236 && after[2] === '336' && after[3] === '236')) throw new Error('sidebars did not resize and persist')
  console.log('ok   voice and members sidebars grew by 16px and the widths were saved')
  await a.ev(`document.querySelector('button.home').click()`)
  const home = await a.ev(`(() => { const s = document.querySelector('.splitter'); s.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); return new Promise(r => setTimeout(() => r(document.querySelector('aside').getBoundingClientRect().width), 200)) })()`)
  if (home !== 256) throw new Error('home sidebar did not resize: ' + home)
  console.log('ok   home sidebar resized independently (240 -> 256), narrower than the voice sidebar')

  console.log('--- Bob goes offline (process killed)')
  b.child.kill()
  await until('A lists Bob under Offline after a divider', () => a.ev(`[...document.querySelectorAll('.offline .item')].some(x => x.textContent.includes('Bob')) && !!document.querySelector('main.home hr')`), 60)
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
} catch (e) {
  failed = true
  console.error('FAIL', e.message)
  for (const [n, p] of [['A', a], ['B', b], ['C', c]]) console.error(n, (await p.ev(`document.body.innerText`).catch(String)).replace(/\n+/g, ' | '))
} finally {
  children.forEach((ch) => ch.kill())
}
console.log(`total ${((Date.now() - t0) / 1000).toFixed(0)}s`)
process.exit(failed ? 1 : 0)
