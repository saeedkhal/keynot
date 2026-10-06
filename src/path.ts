import type { SceneObject } from './types'

export function lighten(color: string, amount: number): string {
  const hex = color.trim().match(/^#([0-9a-f]{6})$/i)
  const rgb = color.trim().match(/rgba?\(([^)]+)\)/i)
  let base = [28, 25, 21]
  if (hex) {
    base = [parseInt(hex[1].slice(0, 2), 16), parseInt(hex[1].slice(2, 4), 16), parseInt(hex[1].slice(4, 6), 16)]
  } else if (rgb) {
    const parts = rgb[1].split(',').map((part) => Number(part.trim()))
    base = [parts[0] || 0, parts[1] || 0, parts[2] || 0]
  }
  const mix = (channel: number) => Math.round(channel + (255 - channel) * amount)
  return `rgb(${mix(base[0])}, ${mix(base[1])}, ${mix(base[2])})`
}

export type Point = { x: number; y: number }

export function pathOf(object: SceneObject): Point[] {
  if (object.points.length >= 2) return object.points
  return [
    { x: object.x, y: object.y },
    { x: object.x2, y: object.y2 },
  ]
}

export function withPath(object: SceneObject, points: Point[]): SceneObject {
  const safe = points.length >= 2 ? points : pathOf(object)
  const first = safe[0]
  const last = safe[safe.length - 1]
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const point of safe) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }
  return {
    ...object,
    points: safe,
    x: first.x,
    y: first.y,
    x2: last.x,
    y2: last.y,
    w: Math.max(1, maxX - minX),
    h: Math.max(1, maxY - minY),
  }
}

function catmull(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const t2 = t * t
  const t3 = t2 * t
  return {
    x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  }
}

export function smoothSamples(points: Point[], perSegment = 16): Point[] {
  if (points.length < 2) return points.slice()
  if (points.length === 2) return points.slice()
  const samples: Point[] = []
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(points.length - 1, i + 2)]
    const steps = perSegment
    for (let step = 0; step < steps; step += 1) samples.push(catmull(p0, p1, p2, p3, step / steps))
  }
  samples.push(points[points.length - 1])
  return samples
}

export function dashOf(style: string, width: number): string {
  if (style === 'dashed') return `${Math.max(8, width * 4)} ${Math.max(5, width * 2.5)}`
  if (style === 'dotted') return `${Math.max(1, width * 0.35)} ${Math.max(5, width * 2.6)}`
  return ''
}

export function roughen(points: Point[], roughness: number, seed = 1): Point[] {
  if (roughness < 0.5 || points.length < 2) return points
  const amp = roughness < 1.5 ? 1.4 : 2.8
  return points.map((point, index) => {
    if (index === 0 || index === points.length - 1) return point
    const prev = points[index - 1]
    const next = points[Math.min(points.length - 1, index + 1)]
    const dx = next.x - prev.x
    const dy = next.y - prev.y
    const length = Math.hypot(dx, dy) || 1
    const wobble = Math.sin(seed * 0.17 + index * 1.7) * amp
    return { x: point.x + (-dy / length) * wobble, y: point.y + (dx / length) * wobble }
  })
}

export function outlinePoints(width: number, height: number, radius: number): Point[] {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2))
  if (r < 1) return [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }, { x: 0, y: 0 }]
  const corner = (cx: number, cy: number, start: number) => {
    const points: Point[] = []
    for (let step = 0; step <= 5; step += 1) {
      const angle = start + (Math.PI / 2) * (step / 5)
      points.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r })
    }
    return points
  }
  return [
    ...corner(r, r, Math.PI),
    ...corner(width - r, r, Math.PI * 1.5),
    ...corner(width - r, height - r, 0),
    ...corner(r, height - r, Math.PI / 2),
    { x: 0, y: r },
  ]
}

export function toSvgPath(points: Point[]): string {
  if (points.length === 0) return ''
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
}

export function offsetPath(points: Point[], distance: number): Point[] {
  if (points.length < 2 || distance === 0) return points.slice()
  return points.map((point, index) => {
    const prev = points[Math.max(0, index - 1)]
    const next = points[Math.min(points.length - 1, index + 1)]
    const dx = next.x - prev.x
    const dy = next.y - prev.y
    const length = Math.hypot(dx, dy) || 1
    return { x: point.x + (-dy / length) * distance, y: point.y + (dx / length) * distance }
  })
}

export function pathLength(points: Point[]): number {
  const samples = smoothSamples(points, 8)
  let length = 0
  for (let i = 1; i < samples.length; i += 1) length += Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y)
  return length
}

export function trimPath(points: Point[], amount: number): Point[] {
  const samples = smoothSamples(points)
  const t = Math.min(1, Math.max(0, amount))
  if (samples.length < 2 || t <= 0) return []
  if (t >= 1) return samples
  const walked = [0]
  for (let i = 1; i < samples.length; i += 1) {
    walked.push(walked[i - 1] + Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y))
  }
  const total = walked[walked.length - 1]
  if (total <= 0) return []
  const target = total * t
  for (let i = 1; i < samples.length; i += 1) {
    if (walked[i] + 0.001 < target) continue
    const span = walked[i] - walked[i - 1] || 1
    const u = (target - walked[i - 1]) / span
    return [
      ...samples.slice(0, i),
      {
        x: samples[i - 1].x + (samples[i].x - samples[i - 1].x) * u,
        y: samples[i - 1].y + (samples[i].y - samples[i - 1].y) * u,
      },
    ]
  }
  return samples
}

export function restPath(points: Point[], amount: number): Point[] {
  const samples = smoothSamples(points)
  const t = Math.min(1, Math.max(0, amount))
  if (samples.length < 2 || t >= 1) return []
  if (t <= 0) return samples
  const walked = [0]
  for (let i = 1; i < samples.length; i += 1) {
    walked.push(walked[i - 1] + Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y))
  }
  const total = walked[walked.length - 1]
  if (total <= 0) return []
  const target = total * t
  for (let i = 1; i < samples.length; i += 1) {
    if (walked[i] + 0.001 < target) continue
    const span = walked[i] - walked[i - 1] || 1
    const u = (target - walked[i - 1]) / span
    return [
      {
        x: samples[i - 1].x + (samples[i].x - samples[i - 1].x) * u,
        y: samples[i - 1].y + (samples[i].y - samples[i - 1].y) * u,
      },
      ...samples.slice(i),
    ]
  }
  return []
}

function toLocal(box: SceneObject, point: Point): Point {
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  const rad = (-box.rotation * Math.PI) / 180
  const dx = point.x - cx
  const dy = point.y - cy
  return {
    x: dx * Math.cos(rad) - dy * Math.sin(rad) + box.w / 2,
    y: dx * Math.sin(rad) + dy * Math.cos(rad) + box.h / 2,
  }
}

function toWorld(box: SceneObject, point: Point): Point {
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  const rad = (box.rotation * Math.PI) / 180
  const dx = point.x - box.w / 2
  const dy = point.y - box.h / 2
  return {
    x: cx + dx * Math.cos(rad) - dy * Math.sin(rad),
    y: cy + dx * Math.sin(rad) + dy * Math.cos(rad),
  }
}

export function distanceToBox(box: SceneObject, point: Point): number {
  const local = toLocal(box, point)
  const ox = local.x < 0 ? -local.x : local.x > box.w ? local.x - box.w : 0
  const oy = local.y < 0 ? -local.y : local.y > box.h ? local.y - box.h : 0
  return Math.hypot(ox, oy)
}

export function anchorOnBox(box: SceneObject, from: Point): Point {
  const local = toLocal(box, from)
  const cx = box.w / 2
  const cy = box.h / 2
  let dx = local.x - cx
  let dy = local.y - cy
  if (Math.hypot(dx, dy) < 0.001) {
    dx = 1
    dy = 0
  }
  const tx = dx === 0 ? Infinity : (dx > 0 ? box.w - cx : -cx) / dx
  const ty = dy === 0 ? Infinity : (dy > 0 ? box.h - cy : -cy) / dy
  const scale = Math.min(tx > 0 ? tx : Infinity, ty > 0 ? ty : Infinity)
  return toWorld(box, { x: cx + dx * scale, y: cy + dy * scale })
}

export function nearestBox(boxes: SceneObject[], point: Point, maxDist: number): SceneObject | null {
  let best: SceneObject | null = null
  let bestDist = maxDist
  let bestArea = Infinity
  for (const box of boxes) {
    if (box.type === 'arrow') continue
    const dist = distanceToBox(box, point)
    const area = box.w * box.h
    if (dist < bestDist - 0.01 || (Math.abs(dist - bestDist) <= 0.01 && area < bestArea)) {
      best = box
      bestDist = dist
      bestArea = area
    }
  }
  return best
}

export function arrowHeadPath(samples: Point[], width: number): string {
  if (samples.length < 2) return ''
  const end = samples[samples.length - 1]
  const before = samples[Math.max(0, samples.length - 2)]
  const angle = Math.atan2(end.y - before.y, end.x - before.x)
  const length = Math.max(11, width * 6)
  const spread = Math.PI / 6.5
  const ax = end.x - length * Math.cos(angle - spread)
  const ay = end.y - length * Math.sin(angle - spread)
  const bx = end.x - length * Math.cos(angle + spread)
  const by = end.y - length * Math.sin(angle + spread)
  return `M ${ax} ${ay} L ${end.x} ${end.y} L ${bx} ${by}`
}

function projectSegment(start: Point, end: Point, x: number, y: number): { point: Point; dist: number } {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const len2 = dx * dx + dy * dy || 1
  const t = Math.min(1, Math.max(0, ((x - start.x) * dx + (y - start.y) * dy) / len2))
  const point = { x: start.x + dx * t, y: start.y + dy * t }
  return { point, dist: Math.hypot(point.x - x, point.y - y) }
}

export function insertPoint(points: Point[], x: number, y: number): Point[] {
  if (points.length < 2) return [...points, { x, y }]
  let best = { dist: Infinity, index: 1, point: { x, y } }
  for (let i = 0; i < points.length - 1; i += 1) {
    const hit = projectSegment(points[i], points[i + 1], x, y)
    if (hit.dist < best.dist) best = { dist: hit.dist, index: i + 1, point: hit.point }
  }
  const next = points.slice()
  next.splice(best.index, 0, best.point)
  return next
}

export function lerpPoints(from: Point[], to: Point[], t: number): Point[] {
  if (from.length === to.length) {
    return from.map((point, index) => ({
      x: point.x + (to[index].x - point.x) * t,
      y: point.y + (to[index].y - point.y) * t,
    }))
  }
  const count = Math.max(from.length, to.length)
  const at = (points: Point[], index: number) => {
    if (points.length === 1) return points[0]
    const u = count === 1 ? 0 : index / (count - 1)
    const scaled = u * (points.length - 1)
    const i = Math.min(points.length - 2, Math.floor(scaled))
    const local = scaled - i
    return {
      x: points[i].x + (points[i + 1].x - points[i].x) * local,
      y: points[i].y + (points[i + 1].y - points[i].y) * local,
    }
  }
  return Array.from({ length: count }, (_, index) => {
    const a = at(from, index)
    const b = at(to, index)
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
  })
}
