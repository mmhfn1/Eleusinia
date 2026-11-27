// Turns the smoke run's UI audit (test/audit.mjs, ELEUSINIA_SMOKE_AUDIT=design/audit) into tables:
//   node scripts/audit-report.mjs [design/audit] [before|after]
// text-<name>.md (every distinct type style, where it is used), type-roles.md (every text element by its job),
// buttons-<name>.md and buttons-<name>.html (every clickable look, grouped by kind, with its state pictures).
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2] ?? 'design/audit'
const name = process.argv[3] ?? 'before'
const pics = name === 'before' ? 'buttons' : `buttons-${name}` // test/audit.mjs: each run's state pictures
const texts = JSON.parse(readFileSync(join(dir, `text-${name}.json`), 'utf8'))
const clicks = JSON.parse(readFileSync(join(dir, `buttons-${name}.json`), 'utf8'))

const tail = (p, n = 2) => p.split(' > ').slice(-n).join(' > ')
const typeOf = (t) => `${t.family} ${t.size} ${t.weight}${t.italic ? ' italic' : ''}`
const count = (xs, key) => { const m = new Map(); for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1]) }
const uniq = (xs) => [...new Set(xs)]
const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ')

// What each text element is for, read from its markup. First match wins; order matters.
const JOBS = [
  ['screen-reader only (not visible)', (t) => /visually-hidden/.test(t.path)],
  ['wordmark', (t) => /wordmark|splash-word/.test(t.path)],
  ['input text and placeholders', (t) => t.input],
  ['badge count', (t) => /rail-count|channel-count|dm-count|side-count|unread|game-card-live|call-chip|\bkbd\b|keep-chip|span\.count|shelf-title > span$|person-volume-pct/.test(t.path)],
  ['code, keys and IDs (mono)', (t) => /Mono|Cascadia|Google Sans Code|Consolas/.test(t.family) || /\bcode\b|tail|id-plate|cs2-clock/.test(t.path)],
  ['big number (score, light level)', (t) => /score|cs2-team > b|destiny-light/.test(t.path)],
  ['empty-state title', (t) => /empty-title/.test(t.path)],
  ['screen title', (t) => /(page-head|chat-head|settings-pane|settings-index|form\.profile\.panel|row-text) > h1|chat-title|group-name|side-title|home\.back|titlebar-place/.test(t.path)],
  ['server name on its banner', (t) => /server-name/.test(t.path)],
  ['person name, large (cards)', (t) => /pop-name|card > h1|preview-name|person-name|game-card-who|figcaption > span\.row-title|cs2-map|destiny-activity-name|activity-body > h3/.test(t.path) && parseFloat(t.size) >= 15],
  ['section heading', (t) => /settings-section > h2|shelf-title|theme-edit > h3|role-edit > h2|section-head > h2|role-list > h2|dialog-body > h2/.test(t.path) && !/span$/.test(t.path)],
  ['group label (quiet heading above a list or field)', (t) => /side-cat|> h2$|> h3$|field-label|play-days > h3|theme-label|person-section > h3|members > h2|chamber > h2|settings-preview > h2|context-head|achievement-head|activity-kicker|day-rule|access-col|range-ends|dt$|game-card-game|weave-tones/.test(t.path)],
  ['button label', (t) => /button\.button|segmented|theme-card|tri-|weave-kind|file-button|link-button|connection-name|button\[radio\] > span/.test(t.path)],
  ['menu and navigation item', (t) => /context-item|settings-index-row|settings-page|titlebar-find|titlebar-call/.test(t.path)],
  ['timestamp and delivery state', (t) => /msg-head > time|msg-status|\btime\b/.test(t.path)],
  ['person or row name (lists)', (t) => /row-title|channel-name|msg-head > button\.user|> b$|\.user$|notice-text > b|role-pick|access-role|connection-game-head|figcaption$|person-tile > span\.person-name/.test(t.path)],
  ['link', (t) => /msg-link|link-title|> a\b/.test(t.path)],
  ['tooltip and popover', (t) => /play-tip|tooltip|info-pop/.test(t.path)],
  ['hint, help and empty-state text', (t) => /hint|quiet|empty-state|theme-hint|play-empty|key-hint|connection-note|splash-detail/.test(t.path)],
  ['body text (messages, about lines, toasts)', (t) => /msg-text|about|toast|link-desc|splash-status|person-section > p|check-row|setting > label|mic-gate > label|li > span|signal-text/.test(t.path)],
  ['secondary line (under a name, meta)', (t) => /row-sub|activity-line|glance|pop-handle|pop-presence|page-sub|voice-line|voice-where|activity-facts|destiny|cs2|stage-bar|link-site|gsi-state|connection-state|server-count|play-sum|output|label > b|dd$|span > span$|notice-text|achievement-desc/.test(t.path)],
]
const jobOf = (t) => JOBS.find(([, f]) => f(t))?.[0] ?? 'unsorted'
for (const t of texts) t.job = jobOf(t)
const visible = texts.filter((t) => t.job !== 'screen-reader only (not visible)')

// ---------- text-<name>.md ----------
const fams = uniq(visible.map((t) => t.family)), sizes = uniq(visible.map((t) => t.size)).sort((a, b) => parseFloat(a) - parseFloat(b))
const weights = uniq(visible.map((t) => t.weight)).sort()
let md = `# Text inventory (${name})\n\nFrom \`text-${name}.json\`: every visible text element on every screen the smoke run stops at (${uniq(texts.map((t) => t.screen)).length} screens, Ann, Bob and Cy's windows, Ink and Ivory), read with \`getComputedStyle\`. Screen-reader-only text (${texts.length - visible.length}) is left out of the counts.\n\n`
md += `| | ${name} |\n|---|---|\n| Text elements | ${visible.length} |\n| Families | ${fams.length}: ${fams.join(', ')} |\n| Sizes | ${sizes.length}: ${sizes.join(', ')} |\n| Weights | ${weights.length}: ${weights.join(', ')} |\n| Family, size and weight combinations | ${count(visible, typeOf).length} |\n| Line heights | ${uniq(visible.map((t) => t.lineHeight)).length} |\n| Letter spacings | ${uniq(visible.map((t) => t.letterSpacing)).length} |\n| Text colours | ${uniq(visible.map((t) => t.color)).length} |\n\n`
md += `## Every combination\n\n| Count | Family, size, weight | Line heights | Jobs it does | Where (elements) |\n|---|---|---|---|---|\n`
for (const [k, n] of count(visible, typeOf)) {
  const of = visible.filter((t) => typeOf(t) === k)
  md += `| ${n} | ${k} | ${uniq(of.map((t) => t.lineHeight)).slice(0, 4).join(', ')} | ${esc(uniq(of.map((t) => t.job)).join('; '))} | ${esc(count(of, (t) => tail(t.path)).slice(0, 4).map(([p, c]) => `\`${p}\` ${c}`).join(', '))} |\n`
}
writeFileSync(join(dir, `text-${name}.md`), md)

// ---------- type-roles.md (before only: the roles the system will name) ----------
if (name === 'before') {
  let roles = `# Type roles\n\nEvery visible text element from \`text-before.json\` (${visible.length}), sorted by the job it does, read from its markup (\`scripts/audit-report.mjs\`, \`JOBS\`). Each job becomes one role in the type system; today most jobs are set in several styles at once, which is the problem the roles fix.\n\n| Role | Elements | Styles in use today | Screens |\n|---|---|---|---|\n`
  const byJob = count(visible, (t) => t.job)
  for (const [job, n] of byJob) {
    const of = visible.filter((t) => t.job === job)
    roles += `| ${job} | ${n} | ${count(of, typeOf).length} | ${uniq(of.map((t) => t.screen)).length} |\n`
  }
  for (const [job] of byJob) {
    const of = visible.filter((t) => t.job === job)
    roles += `\n## ${job}\n\nStyles today: ${count(of, typeOf).map(([k, c]) => `${k} (${c})`).join('; ')}.\n\n| Element | Count | Example | Style | Screens |\n|---|---|---|---|---|\n`
    for (const [p, c] of count(of, (t) => tail(t.path, 2))) {
      const e = of.filter((t) => tail(t.path, 2) === p)
      roles += `| \`${esc(p)}\` | ${c} | ${esc(e[0].text)} | ${esc(uniq(e.map(typeOf)).join('; '))} | ${esc(uniq(e.map((t) => t.screen)).slice(0, 5).join(', '))}${uniq(e.map((t) => t.screen)).length > 5 ? ', …' : ''} |\n`
    }
  }
  writeFileSync(join(dir, 'type-roles.md'), roles)
}

// ---------- buttons-<name>.md and .html ----------
const KINDS = [
  ['primary button', (c) => /button\.primary|button\.button\.primary/.test(c.path)],
  ['destructive button', (c) => /button\.danger|context-item\.danger|\.leave\b/.test(c.path)],
  ['quiet button', (c) => /button\.subtle|link-button/.test(c.path)],
  ['secondary button', (c) => /(^|> )(button|label)\.button(\.|$| )/.test(c.path.split(' > ').at(-1) + ' ')],
  ['icon button', (c) => /icon-button|\.round\b|pop-expand|dialog-close|ib\b|send-button|pop-send|info-icon|signal-icon|people-toggle|role-grip/.test(c.path)],
  ['select (dropdown)', (c) => c.tag === 'select'],
  ['chip and notice', (c) => /keep-chip|notice/.test(c.path)],
  ['inline edit (rename in place)', (c) => /group-name/.test(c.path)],
  ['picture or preview (opens it)', (c) => /image-button|link-image/.test(c.path)],
  ['toggle (switch, checkbox)', (c) => c.role === 'switch' || c.type === 'checkbox' || c.role === 'checkbox' || c.role === 'menuitemcheckbox'],
  ['segmented control and choice cards', (c) => /segmented|theme-card|tri-|weave-kind|banner-games|\[radio\]$/.test(c.path) || c.role === 'radio'],
  ['tab', (c) => c.role === 'tab'],
  ['slider', (c) => c.type === 'range'],
  ['menu item', (c) => /menuitem/.test(c.role) || /context-item/.test(c.path)],
  ['navigation row (rail, channels, lists, settings index)', (c) => /rail-|channel|side-row|row-button|dm-row|settings-index-row|settings-page|role-pick|home\.back|voice-where|server-head|button\.member|caller-who/.test(c.path)],
  ['link', (c) => c.tag === 'a'],
  ['title bar control', (c) => /titlebar/.test(c.path)],
  ['person or card (opens a profile)', (c) => /user|avatar|person|pop-glance|game-card|seat|tile|connection/.test(c.path)],
  ['disclosure (summary)', (c) => c.tag === 'summary'],
]
const kindOf = (c) => KINDS.find(([, f]) => f(c))?.[0] ?? 'other'
const key = (c) => [c.tag === 'input' ? c.type : c.role || c.tag, ...Object.values(c.look)].join('|')
const looks = new Map()
for (const c of clicks) {
  const k = key(c)
  const v = looks.get(k) ?? { kind: kindOf(c), n: 0, look: c.look, examples: [], screens: new Set(), shots: null }
  v.n++
  if (v.examples.length < 4 && !v.examples.some((e) => e.text === c.text)) v.examples.push({ text: c.text, path: tail(c.path) })
  v.screens.add(c.screen)
  if (c.shots && !v.shots) v.shots = c.shots
  looks.set(k, v)
}
const byKind = count([...looks.values()], (v) => v.kind)
const flags = (l) => [l.shadow && 'shadow', l.image && 'gradient or image', l.clip && 'clip-path', l.border && !/^0px/.test(l.border) && 'border'].filter(Boolean)
let bmd = `# Clickable inventory (${name})\n\nFrom \`buttons-${name}.json\`: ${clicks.length} clickable things seen on screen (buttons, links, menu items, tabs, switches, sliders, rows), with ${looks.size} distinct looks (tag or role, font, colours, border, radius, shadow, clip-path, height, padding). One of each look is pictured at rest, hover, pressed and focus (forced through DevTools, nothing clicked): [buttons-${name}.html](buttons-${name}.html).\n\n| Kind | Distinct looks | Seen |\n|---|---|---|\n`
for (const [kind, n] of byKind) bmd += `| ${kind} | ${n} | ${[...looks.values()].filter((v) => v.kind === kind).reduce((s, v) => s + v.n, 0)} |\n`
const extras = [...looks.values()].filter((v) => flags(v.look).length)
bmd += `\nLooks with a shadow, gradient, clip-path or border: ${extras.length} of ${looks.size}.\n`
for (const [kind] of byKind) {
  bmd += `\n## ${kind}\n\n| Seen | Example | Font | Colour on background | Radius | Height | Extras | States |\n|---|---|---|---|---|---|---|---|\n`
  for (const v of [...looks.values()].filter((v) => v.kind === kind).sort((a, b) => b.n - a.n))
    bmd += `| ${v.n} | ${esc(v.examples.map((e) => `${e.text || '(icon)'} \`${e.path}\``).slice(0, 2).join('; '))} | ${v.look.family} ${v.look.size} ${v.look.weight} | ${v.look.color} on ${v.look.background} | ${v.look.radius} | ${v.look.height} | ${esc(flags(v.look).join(', '))} | ${v.shots?.filter((s) => s.endsWith('.png')).map((s) => `[${s.split('-').pop().replace('.png', '')}](buttons/${s})`).join(' ') ?? ''} |\n`
}
writeFileSync(join(dir, `buttons-${name}.md`), bmd)

let html = `<!doctype html><meta charset="utf-8"><title>Clickable looks (${name})</title><style>body{font:13px system-ui;background:#2b2a28;color:#eee;margin:24px}h2{font:600 18px system-ui;margin:28px 0 8px}table{border-collapse:collapse}td{padding:6px 10px;border-bottom:1px solid #444;vertical-align:middle}td.s{background:#888;text-align:center}img{display:block;max-height:80px;max-width:280px;image-rendering:auto}small{color:#aaa}</style><h1>Clickable looks (${name}): ${looks.size}</h1>`
for (const [kind, n] of byKind) {
  html += `<h2>${kind} (${n})</h2><table><tr><td></td><td>rest</td><td>hover</td><td>pressed</td><td>focus</td></tr>`
  for (const v of [...looks.values()].filter((v) => v.kind === kind).sort((a, b) => b.n - a.n)) {
    const imgs = ['rest', 'hover', 'pressed', 'focus'].map((s) => { const f = v.shots?.find((x) => x.endsWith(`-${s}.png`)); return `<td class="s">${f ? `<img src="${pics}/${f}">` : ''}</td>` }).join('')
    html += `<tr><td><b>${esc(v.examples[0]?.text || '(icon)')}</b><br><small>${esc(v.examples[0]?.path ?? '')} · seen ${v.n} · ${v.look.size} ${v.look.weight} · r ${v.look.radius}${flags(v.look).length ? ' · ' + flags(v.look).join(', ') : ''}</small></td>${imgs}</tr>`
  }
  html += `</table>`
}
writeFileSync(join(dir, `buttons-${name}.html`), html)
// The same, about 40 looks a page, small enough to photograph whole
const head = html.slice(0, html.indexOf('<h1>'))
const rows = []
for (const [kind] of byKind)
  for (const v of [...looks.values()].filter((v) => v.kind === kind).sort((a, b) => b.n - a.n)) rows.push([kind, v])
for (let p = 0; p * 40 < rows.length; p++) {
  let page = head + `<h1>Clickable looks (${name}), page ${p + 1} of ${Math.ceil(rows.length / 40)}</h1><table>`
  let last = ''
  for (const [kind, v] of rows.slice(p * 40, p * 40 + 40)) {
    if (kind !== last) page += `<tr><td colspan="5"><h2>${kind}</h2></td></tr><tr><td></td><td>rest</td><td>hover</td><td>pressed</td><td>focus</td></tr>`
    last = kind
    const imgs = ['rest', 'hover', 'pressed', 'focus'].map((s) => { const f = v.shots?.find((x) => x.endsWith(`-${s}.png`)); return `<td class="s">${f ? `<img src="${pics}/${f}">` : ''}</td>` }).join('')
    page += `<tr><td><b>${esc(v.examples[0]?.text || '(icon)')}</b><br><small>${esc(v.examples[0]?.path ?? '')} · seen ${v.n} · ${v.look.size} ${v.look.weight} · r ${v.look.radius}${flags(v.look).length ? ' · ' + flags(v.look).join(', ') : ''}</small></td>${imgs}</tr>`
  }
  writeFileSync(join(dir, `buttons-${name}-${p + 1}.html`), page + '</table>')
}
console.log(`${visible.length} text elements, ${fams.length} families, ${sizes.length} sizes, ${count(visible, typeOf).length} combinations; ${clicks.length} clickable, ${looks.size} looks in ${byKind.length} kinds; unsorted text: ${visible.filter((t) => t.job === 'unsorted').length}, other clickables: ${[...looks.values()].filter((v) => v.kind === 'other').length}`)
