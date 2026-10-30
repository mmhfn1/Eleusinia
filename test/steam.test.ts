import { expect, test } from 'vitest'
import { achievementsOf, libraryPaths, parseKv, parseReg, parseVdf, programsOf, vget, vnum } from '../src/shared/steam'

test('VDF: nesting, escaped paths, comments, keys in any case', () => {
  const v = parseVdf(`"libraryfolders"
{
	// a comment "with quotes"
	"0"
	{
		"path"		"C:\\\\Program Files (x86)\\\\Steam"
		"apps" { "730" "123" }
	}
	"1" { "path" "D:\\\\Steam Library" }
}`)
  expect(libraryPaths(v)).toEqual(['C:\\Program Files (x86)\\Steam', 'D:\\Steam Library'])
  expect(vget(v, 'LIBRARYFOLDERS', '0', 'Apps', '730')).toBe('123')
  expect(vnum(vget(v, 'libraryfolders', '0', 'apps', '730'))).toBe(123)
  expect(vget(v, 'libraryfolders', 'nope', 'path')).toBeUndefined()
  expect(parseVdf('"a" "b" }}} "c" { "d" "e"')).toEqual({ a: 'b', c: { d: 'e' } }) // broken files do not throw
})

test('the registry as reg query prints it: DWORDs as numbers, paths as they are', () => {
  const r = parseReg(`
HKEY_CURRENT_USER\\Software\\Valve\\Steam
    SteamPath    REG_SZ    c:/program files (x86)/steam
    RunningAppID    REG_DWORD    0x2da
    Language    REG_SZ    english
`)
  expect(r).toMatchObject({ SteamPath: 'c:/program files (x86)/steam', RunningAppID: '730', Language: 'english' })
})

// Binary KeyValues as Steam writes them: type byte, NUL-ended key, value; 8 closes a level.
function kv(o: Record<string, any>): number[] {
  const out: number[] = []
  const text = (s: string) => out.push(...new TextEncoder().encode(s), 0)
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === 'object') out.push(0), text(k), out.push(...kv(v))
    else if (typeof v === 'string') out.push(1), text(k), text(v)
    else {
      out.push(2)
      text(k)
      const b = new Uint8Array(4)
      new DataView(b.buffer).setInt32(0, v, true)
      out.push(...b)
    }
  }
  return [...out, 8]
}
const bin = (o: Record<string, any>) => new Uint8Array(kv(o))

test('binary KeyValues: nested levels, strings, numbers, and an unknown type refused', () => {
  expect(parseKv(bin({ a: { b: 'c', n: -5 }, d: 7 }))).toEqual({ a: { b: 'c', n: -5 }, d: 7 })
  expect(() => parseKv(new Uint8Array([42, 97, 0]))).toThrow()
})

test('achievements: each one is a bit of a stat, newest first, with names and icons from the schema', () => {
  const ach = (name: string, english: string) => ({ name, display: { name: { english, german: 'x' }, desc: { english: english + '!' }, hidden: 0, icon: 'a'.repeat(40) + '.jpg' } })
  const schema = bin({ 570: { stats: { 1: { type: 4, bits: { 0: ach('FIRST', 'First'), 1: ach('SECOND', 'Second'), 31: ach('LAST', 'Last') } }, 2: { type: 1 } } } })
  // Bits 0 and 31 set: -2147483647 is 0x80000001 as a signed int32.
  const stats = bin({ cache: { crc: 1, 1: { data: -2147483647, AchievementTimes: { 0: 1000, 31: 2000 } } } })
  const a = achievementsOf(parseKv(schema), parseKv(stats))
  expect(a.total).toBe(3)
  expect(a.unlocked.map((u) => [u.id, u.name, u.desc, u.at])).toEqual([
    ['LAST', 'Last', 'Last!', 2000],
    ['FIRST', 'First', 'First!', 1000],
  ])
  expect(a.unlocked[0].icon).toBe('a'.repeat(40) + '.jpg')
  expect(achievementsOf(parseKv(schema), null)).toEqual({ total: 3, unlocked: [] }) // never played: nothing unlocked
})

test('running programs from tasklist and ps, lower-cased and once each', () => {
  expect(programsOf('"System Idle Process","0","Services","0","8 K"\r\n"cs2.exe","4242","Console","1","1,024 K"\r\n"CS2.exe","1","Console","1","1 K"\r\n', true)).toEqual(['system idle process', 'cs2.exe'])
  expect(programsOf('/usr/lib/systemd/systemd\n/home/a/.steam/steamapps/common/Counter-Strike Global Offensive/game/bin/linuxsteamrt64/cs2\n', false)).toEqual(['systemd', 'cs2'])
})
