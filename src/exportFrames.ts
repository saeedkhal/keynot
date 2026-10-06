import { sampleAt, segments } from './magic'
import { paintScene } from './paint'
import type { Doc } from './types'

export async function renderFrames(
  doc: Doc,
  scale: number,
  fps: number,
  write: (ctx: CanvasRenderingContext2D, delayMs: number) => Promise<void> | void,
  size?: { width: number; height: number },
): Promise<void> {
  const width = size?.width ?? Math.max(1, Math.round(doc.width * scale))
  const height = size?.height ?? Math.max(1, Math.round(doc.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Could not draw the export')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  await document.fonts.load('20px Virgil')
  const list = segments(doc)
  const frameDelay = Math.max(2, Math.round(100 / fps)) * 10
  for (const segment of list) {
    const before = list.slice(0, list.indexOf(segment)).reduce((sum, item) => sum + item.seconds, 0)
    if (segment.kind === 'hold') {
      paintScene(ctx, doc, sampleAt(doc, before).objects)
      await write(ctx, Math.max(frameDelay, Math.round(segment.seconds * 1000)))
      await new Promise((resolve) => setTimeout(resolve, 0))
      continue
    }
    const count = Math.max(2, Math.round((segment.seconds * 1000) / frameDelay))
    for (let i = 0; i < count; i += 1) {
      const u = i / (count - 1)
      paintScene(ctx, doc, sampleAt(doc, before + u * segment.seconds).objects)
      await write(ctx, frameDelay)
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }
}
