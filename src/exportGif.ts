import { GIFEncoder, applyPalette, quantize } from 'gifenc'
import { renderFrames } from './exportFrames'
import type { Doc } from './types'

export async function encodeGif(doc: Doc, scale = 2, fps = 50): Promise<Blob> {
  const gif = GIFEncoder()
  let frameIndex = 0
  await renderFrames(doc, scale, fps, (ctx, delay) => {
    const { width, height } = ctx.canvas
    const { data } = ctx.getImageData(0, 0, width, height)
    const palette = quantize(data, 256, { format: 'rgb565' })
    const index = applyPalette(data, palette, 'rgb565')
    gif.writeFrame(index, width, height, {
      palette,
      delay,
      repeat: frameIndex === 0 ? 0 : undefined,
    })
    frameIndex += 1
  })
  gif.finish()
  const bytes = gif.bytes()
  return new Blob([new Uint8Array(bytes)], { type: 'image/gif' })
}
