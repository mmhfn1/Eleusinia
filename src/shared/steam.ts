// Reading what Steam keeps on this computer: its text files (VDF: libraryfolders.vdf, appmanifest_*.acf,
// localconfig.vdf, registry.vdf), its binary stats files (appcache/stats/*.bin) and the Windows registry as `reg query`
// prints it. Everything here only parses; src/main/activity.ts finds and reads the files.

export type Vdf = { [k: string]: string | Vdf }

// Quoted or bare tokens, braces, and // comments. Escapes as Steam writes them (\\ \" \n \t).
export function parseVdf(text: string): Vdf {
  const root: Vdf = {}
  const stack: Vdf[] = [root]
  let key: string | null = null
  for (const m of text.matchAll(/"((?:[^"\\]|\\.)*)"|([{}])|\/\/[^\n]*|([^\s"{}]+)/g)) {
    if (m[2] === '{') {
      const o: Vdf = {}
      if (key !== null) stack[stack.length - 1][key] = o
      stack.push(o)
      key = null
    } else if (m[2] === '}') {
      if (stack.length > 1) stack.pop()
      key = null
    } else if (m[1] !== undefined || m[3] !== undefined) {
      const tok = m[1] !== undefined ? m[1].replace(/\\(.)/g, (_, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : c)) : m[3]
      if (key === null) key = tok
      else (stack[stack.length - 1][key] = tok), (key = null)
    }
  }
  return root
}

// Steam's keys are not consistently cased between versions (Playtime, playtime), so lookups ignore case.
export function vget(v: Vdf | string | undefined, ...path: string[]): Vdf | string | undefined {
  for (const p of path) {
    if (!v || typeof v === 'string') return undefined
    const k = Object.keys(v).find((x) => x.toLowerCase() === p.toLowerCase())
    v = k === undefined ? undefined : v[k]
  }
  return v
}
export const vnum = (v: Vdf | string | undefined) => (typeof v === 'string' && /^-?\d+$/.test(v) ? Number(v) : undefined)

// The library folders Steam installs games in (libraryfolders.vdf), its own folder included.
export const libraryPaths = (v: Vdf) =>
  Object.values((vget(v, 'libraryfolders') as Vdf) ?? {})
    .map((f) => vget(f, 'path'))
    .filter((p): p is string => typeof p === 'string' && p.length > 0)

// `reg query KEY` output: one "    Name    REG_TYPE    value" line per value. DWORDs come as 0x hex.
export function parseReg(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of text.matchAll(/^\s+(\S+)\s+REG_(\w+)\s+(.*?)\s*$/gm)) out[m[1]] = m[2] === 'DWORD' || m[2] === 'QWORD' ? String(Number(m[3])) : m[3]
  return out
}

// Steam's binary KeyValues: a type byte, a NUL-ended key, then the value; 8 (or 11) ends a level.
export type Kv = { [k: string]: number | string | Kv }
export function parseKv(b: Uint8Array, at = { i: 0 }): Kv {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const text = (): string => {
    const end = b.indexOf(0, at.i)
    if (end < 0) throw new Error('unterminated string')
    const s = new TextDecoder().decode(b.subarray(at.i, end))
    at.i = end + 1
    return s
  }
  const out: Kv = {}
  while (at.i < b.length) {
    const type = b[at.i++]
    if (type === 8 || type === 11) return out
    const key = text()
    if (type === 0) out[key] = parseKv(b, at)
    else if (type === 1) out[key] = text()
    else if (type === 2 || type === 5 || type === 6) (out[key] = view.getInt32(at.i, true)), (at.i += 4)
    else if (type === 3) (out[key] = view.getFloat32(at.i, true)), (at.i += 4)
    else if (type === 7 || type === 10) (out[key] = Number(view.getBigUint64(at.i, true))), (at.i += 8)
    else throw new Error(`unknown KeyValues type ${type}`)
  }
  return out
}

const kget = (v: unknown, ...path: string[]): unknown => path.reduce<unknown>((o, p) => (o && typeof o === 'object' ? (o as Kv)[p] : undefined), v)
// A display string is either one string or one per language.
const localized = (v: unknown) => (typeof v === 'string' ? v : typeof kget(v, 'english') === 'string' ? (kget(v, 'english') as string) : '')

export type SteamAchievement = { id: string; name: string; desc: string; icon: string; at: number } // icon: Steam's file name; at: unix seconds
export type SteamAchievements = { total: number; unlocked: SteamAchievement[] } // unlocked: newest first

// The game's achievements (UserGameStatsSchema_<app>.bin) against one user's progress (UserGameStats_<user>_<app>.bin):
// each achievement is one bit of a stat, set when unlocked, with its unlock time beside it.
export function achievementsOf(schema: Kv, stats: Kv | null): SteamAchievements {
  const app = Object.values(schema).find((v) => typeof v === 'object') as Kv | undefined
  const all: { stat: string; bit: string; a: Kv }[] = []
  for (const [stat, s] of Object.entries((kget(app, 'stats') as Kv) ?? {}))
    for (const [bit, a] of Object.entries((kget(s, 'bits') as Kv) ?? {})) if (a && typeof a === 'object') all.push({ stat, bit, a })
  const unlocked: SteamAchievement[] = []
  for (const { stat, bit, a } of all) {
    const data = kget(stats, 'cache', stat, 'data')
    if (typeof data !== 'number' || !((data >>> Number(bit)) & 1)) continue
    const at = kget(stats, 'cache', stat, 'AchievementTimes', bit)
    const icon = kget(a, 'display', 'icon')
    unlocked.push({
      id: String(kget(a, 'name') ?? ''),
      name: localized(kget(a, 'display', 'name')),
      desc: localized(kget(a, 'display', 'desc')),
      icon: typeof icon === 'string' && /^[0-9a-f]{40}\.(jpg|png)$/.test(icon) ? icon : '',
      at: typeof at === 'number' ? at : 0,
    })
  }
  return { total: all.length, unlocked: unlocked.sort((x, y) => y.at - x.at) }
}

// Running programs, lower-cased file names: `tasklist /fo csv /nh` on Windows, `ps -axo comm=` elsewhere.
export function programsOf(text: string, windows: boolean): string[] {
  const names = windows
    ? [...text.matchAll(/^"([^"]+)"/gm)].map((m) => m[1])
    : text
        .split('\n')
        .map((l) => l.trim().split('/').pop() ?? '')
  return [...new Set(names.map((n) => n.toLowerCase()).filter(Boolean))]
}
