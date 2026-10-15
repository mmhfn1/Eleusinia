// Which screens and windows the share picker offers. No Electron imports, so the rule can be unit tested.

export type SourceKind = 'screen' | 'window'

// Electron's source ids are "screen:..." for whole screens and "window:..." for application windows.
export const kindOf = (id: string): SourceKind => (id.startsWith('screen:') ? 'screen' : 'window')

// Overlays and system windows that Windows lists as shareable but nobody means to share. Matched by whole name,
// ignoring case. Add new ones here.
export const HIDDEN_WINDOWS = [
  'NVIDIA GeForce Overlay',
  'NVIDIA Overlay',
  'Xbox Game Bar',
  'Steam Overlay',
  'Program Manager',
  'Windows Input Experience',
  'Microsoft Text Input Application',
]
const hidden = new Set(HIDDEN_WINDOWS.map((n) => n.toLowerCase()))

// Whether to offer a source. A source with no thumbnail at all cannot be captured; black thumbnails are kept, since
// minimised windows show black too (and the NVIDIA overlay, black but not empty, is caught by name instead).
export function shareable(s: { id: string; name: string; emptyThumb: boolean }) {
  if (s.emptyThumb) return false
  if (kindOf(s.id) === 'screen') return true
  const name = s.name.trim()
  return name !== '' && !hidden.has(name.toLowerCase())
}
