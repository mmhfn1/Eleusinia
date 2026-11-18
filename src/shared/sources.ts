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

// Whether to offer a source. A screen with no thumbnail cannot be captured. A window without one is still offered:
// games drawn with DirectX, minimised ones included, often give no thumbnail yet capture fine, and hiding them was why
// testers could not find their game (the NVIDIA overlay, black but not empty, is caught by name instead).
export function shareable(s: { id: string; name: string; emptyThumb: boolean }) {
  if (kindOf(s.id) === 'screen') return !s.emptyThumb
  const name = s.name.trim()
  return name !== '' && !hidden.has(name.toLowerCase())
}
