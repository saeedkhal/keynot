import { ArrayBufferTarget, Muxer } from 'mp4-muxer'
import { renderFrames } from './exportFrames'
import type { Doc } from './types'

const CODECS = ['avc1.640034', 'avc1.640033', 'avc1.4d0034', 'avc1.420034', 'avc1.42001f']

function even(value: number) {
  const rounded = Math.max(2, Math.round(value))
  return rounded % 2 === 0 ? rounded : rounded - 1
}

async function supportedCodec(width: number, height: number, bitrate: number, fps: number) {
  if (typeof VideoEncoder === 'undefined') return null
  for (const codec of CODECS) {
    const support = await VideoEncoder.isConfigSupported({
      codec,
      width,
      height,
      bitrate,
      framerate: fps,
      avc: { format: 'avc' },
      hardwareAcceleration: 'prefer-software',
    })
    if (support.supported) return codec
  }
  return null
}

export async function encodeMp4(doc: Doc, scale = 2, fps = 50): Promise<Blob> {
  const width = even(doc.width * scale)
  const height = even(doc.height * scale)
  const bitrate = Math.max(4_000_000, Math.round(width * height * 5))
  const codec = await supportedCodec(width, height, bitrate, fps)
  if (!codec) throw new Error('This browser cannot export MP4')
  const target = new ArrayBufferTarget()
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width, height },
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  })
  let failed: Error | null = null
  const durations: number[] = []
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      const duration = durations.shift() ?? chunk.duration ?? 20_000
      if (chunk.duration == null) {
        const data = new Uint8Array(chunk.byteLength)
        chunk.copyTo(data)
        muxer.addVideoChunkRaw(data, chunk.type, chunk.timestamp, duration, meta)
        return
      }
      muxer.addVideoChunk(chunk, meta)
    },
    error: (error) => {
      failed = error instanceof Error ? error : new Error('MP4 export failed')
    },
  })
  encoder.configure({
    codec,
    width,
    height,
    bitrate,
    framerate: fps,
    avc: { format: 'avc' },
    hardwareAcceleration: 'prefer-software',
    latencyMode: 'quality',
  })
  let timestamp = 0
  let sinceKey = fps
  await renderFrames(doc, scale, fps, async (ctx, delayMs) => {
    if (failed) throw failed
    const duration = delayMs * 1000
    const frame = new VideoFrame(ctx.canvas, { timestamp, duration })
    const keyFrame = sinceKey >= fps
    durations.push(duration)
    encoder.encode(frame, { keyFrame })
    frame.close()
    timestamp += duration
    sinceKey = keyFrame ? 1 : sinceKey + 1
    if (encoder.encodeQueueSize > 8) {
      await new Promise((resolve) => encoder.addEventListener('dequeue', () => resolve(undefined), { once: true }))
    }
  }, { width, height })
  if (failed) throw failed
  await encoder.flush()
  if (failed) throw failed
  encoder.close()
  muxer.finalize()
  return new Blob([target.buffer], { type: 'video/mp4' })
}
