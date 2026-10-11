import type { Doc, SceneObject } from './types'
import { arrowHeadPath, dashOf, pathOf, trimPath } from './path'
import { arrowSketch, roughStrokeWidth, shapeSketch } from './sketch'

function tracePath(ctx: CanvasRenderingContext2D, points: { x: number; y: number }[]) {
  ctx.beginPath()
  points.forEach((point, index) => (index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)))
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number) {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export function paintScene(ctx: CanvasRenderingContext2D, doc: Doc, objects: SceneObject[]) {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = doc.background
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  const scale = ctx.canvas.width / doc.width
  ctx.save()
  ctx.strokeStyle = 'rgba(233, 236, 239, 0.08)'
  ctx.lineWidth = 1
  const grid = 20 * scale
  for (let x = grid; x < ctx.canvas.width; x += grid) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, ctx.canvas.height)
    ctx.stroke()
  }
  for (let y = grid; y < ctx.canvas.height; y += grid) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(ctx.canvas.width, y)
    ctx.stroke()
  }
  ctx.restore()
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  for (const object of objects) {
    ctx.save()
    ctx.globalAlpha = Math.max(0, Math.min(1, object.opacity))
    if (object.type === 'arrow') {
      const width = object.strokeWidth || 1.5
      const samples = trimPath(pathOf(object), object.light)
      const sketch = arrowSketch(object)
      if (samples.length >= 2) {
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.strokeStyle = object.stroke
        ctx.lineWidth = sketch ? roughStrokeWidth(object) : width
        if (sketch?.stroke) {
          ctx.setLineDash([])
          ctx.stroke(new Path2D(sketch.stroke))
        } else {
          const dash = dashOf(object.strokeStyle, width)
          ctx.setLineDash(dash ? dash.split(' ').map(Number) : [])
          tracePath(ctx, samples)
          ctx.stroke()
          ctx.setLineDash([])
          const head = arrowHeadPath(samples, width)
          if (head) {
            const nums = head.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? []
            ctx.beginPath()
            ctx.moveTo(nums[0], nums[1])
            ctx.lineTo(nums[2], nums[3])
            ctx.lineTo(nums[4], nums[5])
            ctx.stroke()
          }
        }
      }
      ctx.restore()
      continue
    }
    const cx = object.x + object.w / 2
    const cy = object.y + object.h / 2
    ctx.translate(cx, cy)
    ctx.rotate((object.rotation * Math.PI) / 180)
    ctx.translate(-cx, -cy)
    const inset = object.strokeWidth > 0 ? object.strokeWidth / 2 : 0
    const sketch = shapeSketch(object)
    if (sketch?.fill) {
      ctx.save()
      ctx.translate(object.x, object.y)
      ctx.fillStyle = object.fill
      ctx.fill(new Path2D(sketch.fill))
      ctx.restore()
    } else if (object.fill !== 'transparent') {
      if (object.shadow) {
        ctx.shadowColor = 'rgba(40, 32, 22, 0.14)'
        ctx.shadowBlur = 16
        ctx.shadowOffsetY = 8
      }
      ctx.fillStyle = object.fill
      roundedRect(ctx, object.x + inset, object.y + inset, object.w - inset * 2, object.h - inset * 2, object.radius)
      ctx.fill()
      ctx.shadowColor = 'transparent'
    }
    if (sketch?.stroke && object.strokeWidth > 0 && object.stroke !== 'transparent') {
      ctx.save()
      ctx.translate(object.x, object.y)
      ctx.strokeStyle = object.stroke
      ctx.lineWidth = roughStrokeWidth(object)
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.setLineDash([])
      ctx.stroke(new Path2D(sketch.stroke))
      ctx.restore()
    } else if (!sketch && object.strokeWidth > 0 && object.stroke !== 'transparent') {
      ctx.strokeStyle = object.stroke
      ctx.lineWidth = object.strokeWidth
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      const dash = dashOf(object.strokeStyle, object.strokeWidth)
      ctx.setLineDash(dash ? dash.split(' ').map(Number) : [])
      roundedRect(ctx, object.x + inset, object.y + inset, Math.max(0, object.w - inset * 2), Math.max(0, object.h - inset * 2), object.radius)
      ctx.stroke()
      ctx.setLineDash([])
    }
    if (object.text) {
      ctx.fillStyle = object.textColor
      ctx.font = `${object.fontSize}px Virgil, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = object.textVAlign === 'top' ? 'top' : 'middle'
      const ty = object.textVAlign === 'top' ? object.y + 16 : object.y + object.h / 2
      ctx.fillText(object.text, object.x + object.w / 2, ty)
    }
    ctx.restore()
  }
}
