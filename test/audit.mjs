// The UI audit (ELEUSINIA_SMOKE_AUDIT=<folder>): at every screen the smoke run photographs, record each visible text
// element's computed type and colour, and each clickable thing's look; at the end, write them out and photograph one
// of every distinct clickable look in its states (CSS.forcePseudoState: no events, so nothing is clicked or opened).
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const auditDir = process.env.ELEUSINIA_SMOKE_AUDIT
const texts = []
const clicks = []

// Runs in the page: what is on screen now. Elements get a data-audit id so their state pictures can be taken later.
const collect = `(() => {
  const vis = (el) => el.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) ?? true
  const inView = (r) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth
  const path = (el) => {
    const out = []
    for (let e = el; e && e !== document.body && out.length < 4; e = e.parentElement) {
      const cls = [...e.classList].filter((c) => !/^(on|open|placed|sel|active|unread|online|speaking|paused|from-)/.test(c)).slice(0, 3).join('.')
      out.unshift(e.tagName.toLowerCase() + (cls ? '.' + cls : '') + (e.getAttribute('role') ? '[' + e.getAttribute('role') + ']' : ''))
    }
    return out.join(' > ')
  }
  const style = (el) => {
    const c = getComputedStyle(el)
    return { family: c.fontFamily.split(',')[0].replace(/["']/g, '').trim(), size: c.fontSize, weight: c.fontWeight, lineHeight: c.lineHeight, letterSpacing: c.letterSpacing, color: c.color, italic: c.fontStyle === 'italic', transform: c.textTransform }
  }
  const texts = []
  const seen = new Set()
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement
    if (!el || seen.has(el) || !n.textContent.trim() || /^(SCRIPT|STYLE|OPTION)$/.test(el.tagName)) continue
    seen.add(el)
    if (!vis(el)) continue
    const r = el.getBoundingClientRect()
    if (!inView(r)) continue
    texts.push({ text: n.textContent.trim().slice(0, 48), path: path(el), ...style(el) })
  }
  for (const el of document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]):not([type=hidden]), textarea')) {
    const r = el.getBoundingClientRect()
    if (!vis(el) || !inView(r)) continue
    texts.push({ text: (el.value || el.placeholder || '').slice(0, 48), path: path(el), input: true, placeholder: !el.value, ...style(el) })
  }
  const clicks = []
  const sel = 'button, a[href], summary, [role=button], [role=tab], [role=menuitem], [role=menuitemcheckbox], [role=menuitemradio], [role=switch], [role=radio], [role=checkbox], [role=option], input[type=checkbox], input[type=radio], input[type=range], select'
  let n = Number(document.body.dataset.auditNext ?? 0)
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect()
    if (!vis(el) || !inView(r)) continue
    const c = getComputedStyle(el)
    if (!el.dataset.audit) el.dataset.audit = String(++n)
    clicks.push({
      id: el.dataset.audit, path: path(el), text: (el.textContent.trim() || el.getAttribute('aria-label') || el.title || '').slice(0, 40),
      tag: el.tagName.toLowerCase(), role: el.getAttribute('role') ?? '', type: el.getAttribute('type') ?? '', disabled: el.matches(':disabled, [aria-disabled=true]'),
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      look: { family: c.fontFamily.split(',')[0].replace(/["']/g, '').trim(), size: c.fontSize, weight: c.fontWeight, color: c.color, background: c.backgroundColor, image: c.backgroundImage !== 'none' ? c.backgroundImage.slice(0, 60) : '', border: c.borderTopWidth + ' ' + c.borderTopStyle + ' ' + c.borderTopColor, radius: c.borderTopLeftRadius, shadow: c.boxShadow !== 'none' ? c.boxShadow.slice(0, 60) : '', clip: c.clipPath !== 'none' ? c.clipPath.slice(0, 40) : '', height: Math.round(r.height), padding: c.paddingLeft + ' ' + c.paddingRight },
    })
  }
  document.body.dataset.auditNext = String(n)
  return { texts, clicks, theme: document.documentElement.dataset.theme ?? '' }
})()`

// A clickable thing's look, minus where it is and what it says: things sharing one are one variant
export const lookKey = (c) => [c.tag === 'input' ? c.type : c.role || c.tag, ...Object.values(c.look)].join('|')

export async function audit(win, screen, ev, cdp) {
  if (!auditDir) return
  const got = await ev(collect).catch(() => null)
  if (!got) return
  for (const t of got.texts) texts.push({ screen, window: win, theme: got.theme, ...t })
  const fresh = new Set(clicks.map(lookKey))
  for (const c of got.clicks) {
    const key = lookKey(c)
    // one of each look gets its state pictures, taken now while it is on screen
    if (!fresh.has(key)) {
      fresh.add(key)
      c.shots = await states(c, cdp, ev).catch((e) => [`failed: ${e.message}`])
    }
    clicks.push({ screen, window: win, theme: got.theme, ...c })
  }
}

let shotNo = 0
async function states(c, cdp, ev) {
  if (!c.rect.w || !c.rect.h) return []
  // each run's state pictures in its own folder, so an after run never overwrites the before pictures
  const run = process.env.ELEUSINIA_SMOKE_AUDIT_NAME ?? 'before'
  const dir = join(auditDir, run === 'before' ? 'buttons' : `buttons-${run}`)
  mkdirSync(dir, { recursive: true })
  await cdp('DOM.enable')
  await cdp('CSS.enable')
  const { root } = await cdp('DOM.getDocument', { depth: 0 })
  const { nodeId } = await cdp('DOM.querySelector', { nodeId: root.nodeId, selector: `[data-audit="${c.id}"]` })
  if (!nodeId) return []
  const pad = 6
  const clip = { x: Math.max(0, c.rect.x - pad), y: Math.max(0, c.rect.y - pad), width: c.rect.w + pad * 2, height: c.rect.h + pad * 2, scale: 2 }
  const out = []
  const no = ++shotNo
  for (const [state, forced] of [['rest', []], ['hover', ['hover']], ['pressed', ['hover', 'active']], ['focus', ['focus', 'focus-visible']]]) {
    await cdp('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: forced })
    await ev(`new Promise((r) => requestAnimationFrame(() => setTimeout(r, 260)))`) // past transitions
    const { data } = await cdp('Page.captureScreenshot', { clip })
    const file = `${String(no).padStart(3, '0')}-${state}.png`
    writeFileSync(join(dir, file), Buffer.from(data, 'base64'))
    out.push(file)
  }
  await cdp('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] })
  if (c.disabled) out.push('(disabled at rest)')
  return out
}

export function writeAudit(name = 'before') {
  if (!auditDir) return
  mkdirSync(auditDir, { recursive: true })
  writeFileSync(join(auditDir, `text-${name}.json`), JSON.stringify(texts, null, 1))
  writeFileSync(join(auditDir, `buttons-${name}.json`), JSON.stringify(clicks, null, 1))
  console.log(`audit: ${texts.length} text elements and ${clicks.length} clickable ones written to ${auditDir}`)
}
