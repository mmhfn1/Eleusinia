// Global hotkeys from raw key codes, with no Electron or DOM imports so they can be unit tested.
// src/main/index.ts feeds it the system-wide key events (uiohook) and sends the results to the call.

export type Action = 'mute' | 'deafen' | 'ptt'
export type Hotkey = { keys: number[]; label: string } // keys: every key of the combination, sorted
export type Bindings = Partial<Record<Action, Hotkey>>
export const ACTIONS: Action[] = ['mute', 'deafen', 'ptt']

export const sameKeys = (a: number[], b: number[]) => a.length === b.length && a.every((k, i) => k === b[i])

// Which actions start or stop as keys go down and up. A combination fires once when its last key goes down
// (held keys auto-repeat, which is ignored); push to talk also reports when any of its keys is released.
export function createMatcher(bindings: () => Bindings) {
  const held = new Set<number>()
  const on = new Set<Action>()
  const update = () => {
    const out: { action: Action; down: boolean }[] = []
    for (const action of ACTIONS) {
      const keys = bindings()[action]?.keys
      const now = !!keys?.length && keys.every((k) => held.has(k))
      if (now === on.has(action)) continue
      if (now) on.add(action)
      else on.delete(action)
      if (now || action === 'ptt') out.push({ action, down: now })
    }
    return out
  }
  return {
    down(key: number) {
      if (held.has(key)) return [] // auto-repeat
      held.add(key)
      return update()
    },
    up(key: number) {
      held.delete(key)
      return update()
    },
    // Forget held keys (recording a new combination, or the hook restarting) without firing anything,
    // except releasing push to talk so the microphone never stays open.
    reset() {
      held.clear()
      const out = on.has('ptt') ? [{ action: 'ptt' as const, down: false }] : []
      on.clear()
      return out
    },
  }
}

// Records one combination: every key pressed until all of them are released. Escape alone cancels.
export const ESCAPE = 1
export function createRecorder() {
  const held = new Set<number>()
  const seen = new Set<number>()
  return {
    // Returns the finished combination once every key is up, 'cancel' for a lone Escape, otherwise null.
    down(key: number) {
      held.add(key)
      seen.add(key)
      return null
    },
    up(key: number): number[] | 'cancel' | null {
      held.delete(key)
      if (held.size || !seen.size) return null
      if (seen.size === 1 && seen.has(ESCAPE)) return 'cancel'
      return [...seen].sort((a, b) => a - b)
    },
  }
}
