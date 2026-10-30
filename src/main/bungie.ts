import { randomBytes } from 'node:crypto'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { type Server, createServer } from 'node:http'
import { join } from 'node:path'
import { type Defs, type Destiny, destinyOf, neededDefs } from '../shared/destiny'

// Linking a Bungie.net account (docs/roadmap-activity.md, step 7). Bungie wants the sign-in in the user's own browser,
// never in a window of ours: we open bungie.net's authorize page there, Bungie sends the browser to the app's
// registered return page, which hands the code to a server here on 127.0.0.1 (its port is in `state`, with a random
// part we check). A confidential client gets a refresh token (90 days), so nobody signs in again every hour. The
// tokens are kept sealed (safeStorage in index.ts) in bungie.json. No Electron imports.

export type BungieConfig = { key: string; clientId: string; secret: string; base?: string } // base: testing only, a stand-in for https://www.bungie.net
export type BungieStatus = { configured: boolean; linked: boolean; waiting?: boolean; name?: string; marathon?: boolean; error?: string }
type Saved = {
  access: string
  accessUntil: number
  refresh: string
  refreshUntil: number
  name: string
  destiny: { type: number; id: string } | null
  marathon: boolean
}
type Opts = {
  dir: string
  config: BungieConfig | null
  fetch: (url: string, init?: RequestInit) => Promise<Response>
  open: (url: string) => Promise<unknown> // the user's browser
  seal: (text: string) => string
  unseal: (text: string) => string
  diag: (text: string) => void
}
const COMPONENTS = '100,200,204,205,1000' // profile, characters, activities, equipment, transitory (fireteam, score)
const MAX_DEFS = 5000
const DAY = 864e5

export function createBungie({ dir, config, fetch, open, seal, unseal, diag }: Opts) {
  const file = join(dir, 'bungie.json')
  const defsFile = join(dir, 'bungie-defs.json')
  const base = config?.base ?? 'https://www.bungie.net'
  let saved: Saved | null = null
  try {
    saved = JSON.parse(unseal(readFileSync(file, 'utf8')))
  } catch {}
  let error = ''
  const save = (s: Saved | null) => {
    saved = s
    if (s) writeFileSync(file, seal(JSON.stringify(s)))
    else rmSync(file, { force: true })
  }
  // Tokens without an account: left by a link that failed halfway in earlier versions
  if (saved && !saved.name && !saved.destiny) save(null)
  let said = '' // Bungie's last ErrorStatus, for messages

  async function token(body: Record<string, string>) {
    const r = await fetch(`${base}/platform/app/oauth/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${Buffer.from(`${config!.clientId}:${config!.secret}`).toString('base64')}` },
      body: new URLSearchParams(body).toString(),
    })
    const t: any = await r.json().catch(() => null)
    if (!r.ok || typeof t?.access_token !== 'string' || typeof t.refresh_token !== 'string') throw new Error(t?.error_description || t?.error || `Bungie.net said ${r.status}`)
    const now = Date.now()
    const secs = (v: unknown, def: number) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : def)
    return { member: String(t.membership_id ?? ''), access: t.access_token as string, accessUntil: now + (secs(t.expires_in, 3600) - 60) * 1000, refresh: t.refresh_token as string, refreshUntil: now + secs(t.refresh_expires_in, 7776000) * 1000 }
  }
  // A call to the Platform API; null when Bungie is down for maintenance or throttling us.
  async function api(path: string, auth = true): Promise<any> {
    if (auth && saved && Date.now() > saved.accessUntil) {
      if (Date.now() > saved.refreshUntil) return unlinked('The link with Bungie.net expired. Link it again.')
      try {
        save({ ...saved, ...(await token({ grant_type: 'refresh_token', refresh_token: saved.refresh })) })
      } catch (e: any) {
        return unlinked(`Bungie.net did not renew the link (${e.message}). Link it again.`)
      }
    }
    const r = await fetch(`${base}/Platform${path}`, { headers: { 'X-API-Key': config!.key, ...(auth && saved && { Authorization: `Bearer ${saved.access}` }) } })
    const j: any = await r.json().catch(() => null)
    if (r.status === 401) return unlinked('Bungie.net no longer accepts the link. Link it again.')
    if (!j || j.ErrorCode !== 1) {
      said = j?.ErrorStatus ?? `HTTP ${r.status}`
      diag(`Bungie.net: ${said}`)
      return null
    }
    return j.Response
  }
  const unlinked = (why: string) => {
    error = why
    diag(`Bungie.net: ${why}`)
    save(null)
    return null
  }

  // Definitions from the Manifest, kept on disk until Bungie's Manifest version changes (looked at once a day).
  let defs: { version: string; checked: number; defs: Defs } = { version: '', checked: 0, defs: {} }
  try {
    defs = JSON.parse(readFileSync(defsFile, 'utf8'))
  } catch {}
  async function definitions(profile: any) {
    if (Date.now() - defs.checked > DAY) {
      const m = await api('/Destiny2/Manifest/', false)
      if (typeof m?.version === 'string') defs = { version: m.version, checked: Date.now(), defs: m.version === defs.version ? defs.defs : {} }
    }
    let added = false
    for (let round = 0; round < 2; round++) {
      const want = neededDefs(profile, defs.defs)
      if (!want.length) break
      await Promise.all(
        want.map(async (k) => {
          const [table, hash] = k.split(':')
          const d = await api(`/Destiny2/Manifest/${table}/${hash}/`, false)
          defs.defs[k] = d && typeof d === 'object' ? d : null // null: asked, not found; not asked again until the next version
          added = true
        }),
      )
    }
    if (Object.keys(defs.defs).length > MAX_DEFS) defs.defs = {}
    if (added) writeFileSync(defsFile, JSON.stringify(defs))
    return defs.defs
  }

  let pending: { server: Server; done: (e?: Error) => void } | null = null
  function cancel() {
    pending?.done(new Error('cancelled'))
  }

  return {
    status: (): BungieStatus => ({
      configured: !!config,
      linked: !!saved,
      ...(pending && { waiting: true }),
      ...(saved && { name: saved.name, marathon: saved.marathon }),
      ...(error && { error }),
    }),
    // Opens bungie.net in the browser and waits (up to 10 min) for the user to approve there.
    async link(): Promise<BungieStatus> {
      if (!config) throw new Error('This copy of Eleusinia was built without a Bungie.net app key')
      cancel()
      const secret = randomBytes(16).toString('hex')
      let state = ''
      const code = await new Promise<string>((resolve, reject) => {
        const server = createServer((req, res) => {
          const u = new URL(req.url ?? '/', 'http://127.0.0.1')
          if (u.pathname !== '/bungie' || u.searchParams.get('state') !== state) return void res.writeHead(404).end()
          const c = u.searchParams.get('code')
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(`<!doctype html><title>Eleusinia</title><body style="font:16px system-ui;background:#0d1013;color:#f4f5f6;display:grid;place-items:center;height:90vh">${c ? 'Linked with Eleusinia. You can close this tab.' : 'Linking was cancelled. You can close this tab.'}</body>`)
          c ? resolve(c) : reject(new Error('Linking was cancelled on bungie.net'))
        })
        const timer = setTimeout(() => pending?.done(new Error('Linking timed out. Try again.')), 10 * 60000)
        pending = {
          server,
          done: (e) => {
            clearTimeout(timer)
            server.close()
            pending = null
            if (e) reject(e)
          },
        }
        server.on('error', (e) => pending?.done(e))
        server.listen(0, '127.0.0.1', () => {
          state = `${(server.address() as { port: number }).port}-${secret}`
          open(`${base}/en/oauth/authorize?client_id=${encodeURIComponent(config.clientId)}&response_type=code&state=${state}`).catch((e) => pending?.done(e))
        })
      }).finally(() => pending?.done())
      const { member, ...t } = await token({ grant_type: 'authorization_code', code })
      // The accounts come from the public lookup by Bungie.net id (254), which needs no extra scope; nothing is kept
      // until they are known.
      const m = /^\d{1,20}$/.test(member) ? await api(`/User/GetMembershipsById/${member}/254/`, false) : null
      if (!m) throw new Error(`Bungie.net did not say which accounts are yours${said ? ` (${said})` : ''}. Try again later.`)
      const all = (Array.isArray(m.destinyMemberships) ? m.destinyMemberships : []) as any[]
      // Cross save: the primary membership holds the characters
      const d = all.find((x) => x.membershipId === m.primaryMembershipId) ?? all.find((x) => x.crossSaveOverride === x.membershipType) ?? all[0]
      const u = m.bungieNetUser ?? {}
      const name = u.cachedBungieGlobalDisplayName ? `${u.cachedBungieGlobalDisplayName}#${String(u.cachedBungieGlobalDisplayNameCode ?? '').padStart(4, '0')}` : (u.displayName ?? d?.displayName ?? '')
      error = ''
      save({ ...t, name: String(name).slice(0, 60), destiny: d ? { type: Number(d.membershipType), id: String(d.membershipId) } : null, marathon: !!m.marathonMembershipId })
      diag('Bungie.net linked')
      return this.status()
    },
    cancel,
    unlink() {
      cancel()
      error = ''
      save(null)
    },
    // What the linked account's guardian is doing now; null when not linked, not playing, or Bungie cannot say.
    async destiny(): Promise<Destiny | null> {
      if (!config || !saved?.destiny) return null
      const { type, id } = saved.destiny
      const p = await api(`/Destiny2/${type}/Profile/${encodeURIComponent(id)}/?components=${COMPONENTS}`)
      if (!p) return null
      return destinyOf(p, await definitions(p))
    },
    stop: cancel,
  }
}
