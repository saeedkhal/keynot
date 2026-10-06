import { GIFEncoder, applyPalette, quantize } from 'gifenc'
import { sampleAt, segments } from './magic'
import { paintScene } from './paint'
import type { Doc } from './types'

export async function encodeGif(doc: Doc, scale = 2, fps = 30): Promise<Blob> {
  const width = Math.max(1, Math.round(doc.width * scale))
  const height = Math.max(1, Math.round(doc.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Could not draw the GIF')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  const gif = GIFEncoder()
  const list = segments(doc)
  const frameDelay = Math.max(20, Math.round(1000 / fps))
  let frameIndex = 0
  const write = (delay: number) => {
    const { data } = ctx.getImageData(0, 0, width, height)
    const palette = quantize(data, 256, { format: 'rgb565' })
    const index = applyPalette(data, palette, 'rgb565')
    gif.writeFrame(index, width, height, {
      palette,
      delay,
      repeat: frameIndex === 0 ? 0 : undefined,
    })
    frameIndex += 1
  }
  for (const segment of list) {
    const before = list.slice(0, list.indexOf(segment)).reduce((sum, item) => sum + item.seconds, 0)
    if (segment.kind === 'hold') {
      paintScene(ctx, doc, sampleAt(doc, before).objects)
      write(Math.max(frameDelay, Math.round(segment.seconds * 1000)))
      await new Promise((resolve) => setTimeout(resolve, 0))
      continue
    }
    const count = Math.max(2, Math.round(segment.seconds * fps))
    for (let i = 0; i < count; i += 1) {
      const u = i / (count - 1)
      paintScene(ctx, doc, sampleAt(doc, before + u * segment.seconds).objects)
      write(frameDelay)
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }
  gif.finish()
  const bytes = gif.bytes()
  return new Blob([new Uint8Array(bytes)], { type: 'image/gif' })
}
