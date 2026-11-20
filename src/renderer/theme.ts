// Ink by night, ivory by day, or whichever the system uses. Kept in this window's storage (a convenience, not shared),
// applied as data-theme on <html> before the first paint (main.tsx), and again when the system switches.
export type Theme = 'ink' | 'ivory' | 'system'
export const CHOICES: [Theme, string][] = [
  ['ink', 'Ink'],
  ['ivory', 'Ivory'],
  ['system', 'Match Windows'],
]
const KEY = 'theme'
const light = matchMedia('(prefers-color-scheme: light)')

export function get(): Theme {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'ivory' || v === 'system' ? v : 'ink'
  } catch {
    return 'ink'
  }
}
function apply() {
  const t = get()
  document.documentElement.dataset.theme = t === 'ivory' || (t === 'system' && light.matches) ? 'light' : 'dark'
}
export function set(t: Theme) {
  try {
    localStorage.setItem(KEY, t)
  } catch {}
  apply()
}
export function start() {
  apply()
  light.addEventListener('change', apply)
}
