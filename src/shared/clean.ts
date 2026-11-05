// Clamps for values from other peers: a finite number in range (rounded), or trimmed text; undefined otherwise.
export const num = (v: unknown, max = 1e6) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v) : undefined)
export const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined)
