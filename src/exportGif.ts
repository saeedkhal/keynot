import { GIFEncoder, applyPalette, quantize } from 'gifenc'
import { sampleAt, segments } from './magic'
import { paintScene } from './paint'
import type { Doc } from './types'

export async function encodeGif(doc: Doc, scale = 0.5, fps = 12): Promise<Blob> {
  const width = Math.round(doc.width * scale)
  const height = Math.round(doc.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Could not draw the GIF')
  const gif = GIFEncoder()
  const list = segments(doc)
  const delay = Math.round(1000 / fps)
  let frameIndex = 0
  for (const segment of list) {
    const count = Math.max(segment.kind === 'hold' ? 1 : 2, Math.round(segment.seconds * fps))
    for (let i = 0; i < count; i += 1) {
      const before = list.slice(0, list.indexOf(segment)).reduce((sum, item) => sum + item.seconds, 0)
      const u = count === 1 ? 0 : i / (count - 1)
      const sample = sampleAt(doc, before + u * segment.seconds)
      paintScene(ctx, doc, sample.objects)
      const { data } = ctx.getImageData(0, 0, width, height)
      const palette = quantize(data, 256)
      const index = applyPalette(data, palette)
      gif.writeFrame(index, width, height, {
        palette,
        delay,
        repeat: frameIndex === 0 ? 0 : undefined,
      })
      frameIndex += 1
      if (frameIndex % 2 === 0) await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }
  gif.finish()
  const bytes = gif.bytes()
  return new Blob([new Uint8Array(bytes)], { type: 'image/gif' })
}
