// Finding invite links in text, with no Node imports so the window can use it too (invite.ts parses and checks them).
export const INVITE_PREFIX = 'eleusinia://invite/'
// The payload is 97 or 129 bytes (one or two contacts): 130 or 172 base64url characters, never more
const LINK = /eleusinia:\/\/invite\/[A-Za-z0-9_-]{130}(?:[A-Za-z0-9_-]{42})?(?![A-Za-z0-9_-])/gi

// Every invite link in a message, in order, each once
export const findInvites = (text: string): string[] => [...new Set(text.match(LINK) ?? [])]
// The whole text (trimmed) is one invite link
export const isInviteLink = (text: string) => { const t = text.trim(); return findInvites(t)[0] === t }
