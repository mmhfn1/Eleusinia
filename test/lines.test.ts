import { expect, test } from 'vitest'
import { lineReader } from '../src/main/network'

test('a character split across two chunks arrives whole', () => {
  const line = Buffer.from(JSON.stringify({ t: 'msg', text: 'hi 👋 こんにちは é' }) + '\n')
  const read = lineReader()
  // Every possible split point, including inside each multi-byte character.
  for (let cut = 1; cut < line.length; cut++) {
    const got = [...read(line.subarray(0, cut))!, ...read(line.subarray(cut))!]
    expect(got.map((l) => JSON.parse(l).text)).toEqual(['hi 👋 こんにちは é'])
  }
})

test('lines are split on newlines, the unfinished one is kept, and an endless line is refused', () => {
  const read = lineReader()
  expect(read(Buffer.from('a\nb\nc'))).toEqual(['a', 'b'])
  expect(read(Buffer.from('d\n'))).toEqual(['cd'])
  expect(read(Buffer.alloc((1 << 20) + 1, 'x'))).toBeNull()
})
