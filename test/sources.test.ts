import { expect, test } from 'vitest'
import { HIDDEN_WINDOWS, kindOf, shareable } from '../src/shared/sources'

const win = (name: string, emptyThumb = false) => ({ id: 'window:1234:0', name, emptyThumb })
const scr = (name: string, emptyThumb = false) => ({ id: 'screen:0:0', name, emptyThumb })

test('kind comes from the source id', () => {
  expect(kindOf('screen:0:0')).toBe('screen')
  expect(kindOf('window:66022:0')).toBe('window')
})

test('ordinary screens and windows are offered', () => {
  expect(shareable(scr('Entire screen'))).toBe(true)
  expect(shareable(scr('Screen 2'))).toBe(true)
  expect(shareable(win('Visual Studio Code'))).toBe(true)
})

test('a source with an empty thumbnail is dropped, screen or window', () => {
  expect(shareable(scr('Screen 1', true))).toBe(false)
  expect(shareable(win('Notepad', true))).toBe(false)
})

test('a window with an empty or blank name is dropped', () => {
  expect(shareable(win(''))).toBe(false)
  expect(shareable(win('   '))).toBe(false)
})

test('every known overlay and system window is dropped, whatever its case', () => {
  for (const name of HIDDEN_WINDOWS) {
    expect(shareable(win(name))).toBe(false)
    expect(shareable(win(name.toUpperCase()))).toBe(false)
    expect(shareable(win(` ${name.toLowerCase()} `))).toBe(false)
  }
})

test('only whole names match, so real windows that mention them stay', () => {
  expect(shareable(win('NVIDIA Overlay settings - Notepad'))).toBe(true)
  expect(shareable(win('Steam'))).toBe(true)
})

test('the NVIDIA overlay is caught by name although its thumbnail is not empty', () => {
  expect(shareable(win('NVIDIA GeForce Overlay', false))).toBe(false)
})
