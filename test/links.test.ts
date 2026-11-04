import DHT from 'hyperdht'
import { expect, test } from 'vitest'
import { cleanLink, firstLink, metaOf, splitLinks } from '../src/shared/links'
import { signMsg, verifyMsg, withLink } from '../src/shared/sync'

test('links are found in text without the punctuation after them', () => {
  expect(splitLinks('see https://example.com/a?b=1, then (https://en.wikipedia.org/wiki/Foo_(bar)).')).toEqual([
    { text: 'see ' },
    { text: 'https://example.com/a?b=1', url: 'https://example.com/a?b=1' },
    { text: ', then (' },
    { text: 'https://en.wikipedia.org/wiki/Foo_(bar)', url: 'https://en.wikipedia.org/wiki/Foo_(bar)' },
    { text: ').' },
  ])
  expect(splitLinks('no links, just javascript:alert(1) and ftp://x')).toEqual([{ text: 'no links, just javascript:alert(1) and ftp://x' }])
  expect(firstLink('a http://x.test/1 b https://y.test')).toBe('http://x.test/1')
})

test('a preview is kept only for a link in the text, with short strings and a small JPEG', () => {
  const text = 'look https://example.com/post'
  expect(cleanLink({ u: 'https://example.com/post', t: '  A   title ', d: 'x'.repeat(500), i: 'data:image/jpeg;base64,AAAA' }, text)).toEqual({
    u: 'https://example.com/post',
    t: 'A title',
    d: 'x'.repeat(300),
    i: 'data:image/jpeg;base64,AAAA',
  })
  expect(cleanLink({ u: 'https://evil.test/', t: 'x' }, text)).toBeNull() // not the link that was written
  expect(cleanLink({ u: 'https://example.com/post', i: 'data:image/svg+xml;base64,AAAA' }, text)).toBeNull() // nothing left to show
  expect(cleanLink({ u: 'javascript:alert(1)', t: 'x' }, 'javascript:alert(1)')).toBeNull()
})

test("a page's preview details are read from its tags", () => {
  const html = `<html><head><title>Fallback &amp; more</title>
    <meta property="og:title" content="The &quot;real&quot; title">
    <meta name='description' content='What it is about'>
    <meta property="og:site_name" content="Example">
    <meta property="og:image" content="/pic.jpg"></head>`
  expect(metaOf(html, 'https://example.com/a/b')).toEqual({ t: 'The "real" title', d: 'What it is about', s: 'Example', image: 'https://example.com/pic.jpg' })
  expect(metaOf('<title>Only &#39;this&#39;</title>', 'https://x.test/')).toEqual({ t: "Only 'this'", d: undefined, s: undefined })
  expect(metaOf('<meta property="og:image" content="javascript:alert(1)">', 'https://x.test/').image).toBeUndefined()
})

test('a link preview is signed by the author, and nobody passing the message on can change it', () => {
  const kp = DHT.keyPair()
  const author = kp.publicKey.toString('hex')
  const m = signMsg({ conv: 'c', author, seq: 1, ts: 1, text: 'https://example.com' }, kp.secretKey)
  const l = withLink(m, { u: 'https://example.com', t: 'Example' }, kp.secretKey)
  expect(verifyMsg(l)).toBe(true)
  expect(verifyMsg({ ...l, link: { ...l.link!, t: 'Log in here' } })).toBe(false)
  expect(verifyMsg({ ...m, link: { u: 'https://example.com', t: 'Unsigned' } })).toBe(false)
  const { link, lsig, ...plain } = l
  expect(verifyMsg(plain)).toBe(true) // what an older copy, which never signs previews, sends
})
