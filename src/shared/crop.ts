// Where a square portrait is cut from a picture the user has moved and zoomed. No DOM imports, so it can be unit tested.
// zoom 1: the picture's short side just fills the frame. offset: the picture's centre relative to the frame's, in frame pixels.

export type Offset = { x: number; y: number }

// Frame pixels per picture pixel.
const scale = (w: number, h: number, frame: number, zoom: number) => (frame / Math.min(w, h)) * zoom

// Keeps the frame covered by the picture, so the portrait never has empty edges.
export function clampOffset(w: number, h: number, frame: number, zoom: number, o: Offset): Offset {
  const s = scale(w, h, frame, zoom)
  const [mx, my] = [(w * s - frame) / 2, (h * s - frame) / 2]
  return { x: Math.max(-mx, Math.min(mx, o.x)), y: Math.max(-my, Math.min(my, o.y)) }
}

// The square of the picture under the frame, in picture pixels.
export function cropRect(w: number, h: number, frame: number, zoom: number, o: Offset) {
  const s = scale(w, h, frame, zoom)
  const size = frame / s
  return { x: w / 2 - o.x / s - size / 2, y: h / 2 - o.y / s - size / 2, size }
}
