// Frame encryption on a connection's senders and receivers (design/plan-stream-forwarding.md, phase 3), the format and
// keys in src/shared/streamkeys.ts. Uses createEncodedStreams: in Electron 44 RTCRtpScriptTransform passes no frames on
// the sending side, so plaintext would go out (spike, phase 0).
// shortcut: runs on the window's thread rather than a Worker (the streams are transferable, but bundling a worker that
// imports streamkeys.ts needs a Vite `?worker` import the build does not use yet); WebCrypto does the AES work off the
// thread anyway, so only the frame plumbing is here. Move it to a Worker if profiles show it costing the window.
import type { Media, Opener, Sealer } from '../shared/streamkeys'

type Frame = { data: ArrayBuffer; type?: string } // video frames carry `type` (key, delta), audio frames do not
type Encoded = { createEncodedStreams(): { readable: ReadableStream<Frame>; writable: WritableStream<Frame> } }

export const e2eeStats = { sealed: 0, opened: 0, dropped: 0 } // dropped: frames that failed to encrypt or decrypt

// Every sender and receiver of such a connection must have its frames piped through, or its media stalls, so only
// connections made for forwarded streams have it; the mesh's connections stay as they are.
export const e2eeConnection = (config: RTCConfiguration) => new RTCPeerConnection({ ...config, encodedInsertableStreams: true } as RTCConfiguration)

const mediaOf = (f: Frame): Media => ('type' in f ? 'video' : 'audio')

function pipe(end: RTCRtpSender | RTCRtpReceiver, fn: (data: Uint8Array<ArrayBuffer>, media: Media) => Promise<Uint8Array<ArrayBuffer> | null>, done: 'sealed' | 'opened') {
  const { readable, writable } = (end as unknown as Encoded).createEncodedStreams()
  const transform = async (f: Frame, out: TransformStreamDefaultController<Frame>) => {
    const data = await fn(new Uint8Array(f.data), mediaOf(f)).catch(() => null)
    if (!data) return void e2eeStats.dropped++ // never passed on as plaintext or garbage
    f.data = data.buffer
    e2eeStats[done]++
    out.enqueue(f)
  }
  readable.pipeThrough(new TransformStream({ transform })).pipeTo(writable).catch(() => {}) // ends with the connection
}

// Call right after the sender is added (and the receiver in ontrack), on a connection from e2eeConnection.
export const encrypt = (sender: RTCRtpSender, sealer: Sealer) => pipe(sender, (d, m) => sealer.seal(d, m), 'sealed')
export const decrypt = (receiver: RTCRtpReceiver, opener: Opener) => pipe(receiver, (d, m) => opener.open(d, m), 'opened')
