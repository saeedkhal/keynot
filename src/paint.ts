import type { Doc, SceneObject } from './types'

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

function arrowHead(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, width: number) {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const length = Math.max(10, width * 4)
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - length * Math.cos(angle - Math.PI / 7), y2 - length * Math.sin(angle - Math.PI / 7))
  ctx.lineTo(x2 - length * Math.cos(angle + Math.PI / 7), y2 - length * Math.sin(angle + Math.PI / 7))
  ctx.closePath()
}

export function paintScene(ctx: CanvasRenderingContext2D, doc: Doc, objects: SceneObject[]) {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.fillStyle = doc.background
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  const scale = ctx.canvas.width / doc.width
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  for (const object of objects) {
    ctx.save()
    ctx.globalAlpha = Math.max(0, Math.min(1, object.opacity))
    if (object.type === 'arrow') {
      ctx.strokeStyle = object.stroke
      ctx.fillStyle = object.stroke
      ctx.lineWidth = object.strokeWidth || 3
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(object.x, object.y)
      ctx.lineTo(object.x2, object.y2)
      ctx.stroke()
      arrowHead(ctx, object.x, object.y, object.x2, object.y2, object.strokeWidth || 3)
      ctx.fill()
      ctx.restore()
      continue
    }
    const cx = object.x + object.w / 2
    const cy = object.y + object.h / 2
    ctx.translate(cx, cy)
    ctx.rotate((object.rotation * Math.PI) / 180)
    ctx.translate(-cx, -cy)
    const inset = object.strokeWidth > 0 ? object.strokeWidth / 2 : 0
    if (object.fill !== 'transparent') {
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
    if (object.strokeWidth > 0 && object.stroke !== 'transparent') {
      ctx.strokeStyle = object.stroke
      ctx.lineWidth = object.strokeWidth
      roundedRect(ctx, object.x + inset, object.y + inset, Math.max(0, object.w - inset * 2), Math.max(0, object.h - inset * 2), object.radius)
      ctx.stroke()
    }
    if (object.text) {
      ctx.fillStyle = object.textColor
      ctx.font = `${object.fontSize}px ${object.font === 'sans' ? 'sans-serif' : 'monospace'}`
      ctx.textAlign = 'center'
      ctx.textBaseline = object.textVAlign === 'top' ? 'top' : 'middle'
      const ty = object.textVAlign === 'top' ? object.y + 16 : object.y + object.h / 2
      ctx.fillText(object.text, object.x + object.w / 2, ty)
    }
    ctx.restore()
  }
}
