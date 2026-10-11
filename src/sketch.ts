import rough from 'roughjs'
import type { Options } from 'roughjs/bin/core'
import { arrowHeadPoints, pathOf, trimPath, type Point } from './path'
import type { SceneObject } from './types'

const generator = rough.generator()

export type Sketch = { fill: string; stroke: string }

export function sketchSeed(id: string): number {
  let seed = 1
  for (let index = 0; index < id.length; index += 1) seed = (Math.imul(seed, 33) + id.charCodeAt(index)) >>> 0
  return seed || 1
}

function adjustRoughness(roughness: number, width: number, height: number, round: boolean, linear: boolean): number {
  const maxSize = Math.max(width, height)
  const minSize = Math.min(width, height)
  if ((minSize >= 20 && maxSize >= 50) || (round && minSize >= 15) || (linear && maxSize >= 50)) return roughness
  return Math.min(roughness / (maxSize < 10 ? 3 : 2), 2.5)
}

function roughOptions(object: SceneObject, width: number, height: number, round: boolean, linear: boolean, continuous: boolean): Options {
  const solid = object.strokeStyle === 'solid'
  const roughness = adjustRoughness(object.roughness ?? 0, width, height, round, linear)
  const strokeWidth = object.strokeWidth || 1.5
  return {
    seed: sketchSeed(object.id),
    roughness,
    strokeWidth: solid ? strokeWidth : strokeWidth + 0.5,
    disableMultiStroke: !solid,
    preserveVertices: continuous || roughness < 2,
    fillWeight: strokeWidth / 2,
    hachureGap: strokeWidth * 4,
    strokeLineDash: solid ? undefined : object.strokeStyle === 'dotted' ? [1.5, 6 + strokeWidth] : [8, 8 + strokeWidth],
  }
}

function sketchOf(drawable: ReturnType<typeof generator.rectangle>): Sketch {
  const fill = drawable.sets.find((set) => set.type === 'fillPath')
  const stroke = drawable.sets.filter((set) => set.type === 'path')
  return {
    fill: fill ? generator.opsToPath(fill) : '',
    stroke: stroke.map((set) => generator.opsToPath(set)).join(' '),
  }
}

function roundedPath(width: number, height: number, radius: number): string {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2))
  return `M ${r} 0 L ${width - r} 0 Q ${width} 0, ${width} ${r} L ${width} ${height - r} Q ${width} ${height}, ${width - r} ${height} L ${r} ${height} Q 0 ${height}, 0 ${height - r} L 0 ${r} Q 0 0, ${r} 0`
}

export function shapeSketch(object: SceneObject): Sketch | null {
  if ((object.roughness ?? 0) < 0.5 || object.type === 'arrow') return null
  const round = object.radius >= 1
  const options = roughOptions(object, object.w, object.h, round, false, round)
  if (object.fill !== 'transparent') {
    options.fill = object.fill
    options.fillStyle = 'solid'
  }
  const drawable = round
    ? generator.path(roundedPath(object.w, object.h, object.radius), options)
    : generator.rectangle(0, 0, object.w, object.h, options)
  return sketchOf(drawable)
}

function decimate(points: Point[], spacing: number): Point[] {
  if (points.length <= 2) return points
  const next = [points[0]]
  let run = 0
  for (let index = 1; index < points.length - 1; index += 1) {
    run += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y)
    if (run >= spacing) {
      next.push(points[index])
      run = 0
    }
  }
  next.push(points[points.length - 1])
  return next
}

export function arrowSketch(object: SceneObject): Sketch | null {
  if ((object.roughness ?? 0) < 0.5 || object.light <= 0) return null
  const source = pathOf(object)
  const drawn = object.light >= 1 ? source : decimate(trimPath(source, object.light), 32)
  if (drawn.length < 2) return null
  const width = Math.max(Math.abs(drawn[drawn.length - 1].x - drawn[0].x), Math.abs(drawn[drawn.length - 1].y - drawn[0].y), 1)
  const options = roughOptions(object, width, width, false, true, false)
  const body = drawn.length === 2
    ? generator.line(drawn[0].x, drawn[0].y, drawn[1].x, drawn[1].y, options)
    : generator.curve(drawn.map((point) => [point.x, point.y]), options)
  const tips = arrowHeadPoints(drawn, object.strokeWidth || 1.5)
  const headOptions: Options = {
    ...options,
    roughness: Math.min(1, options.roughness || 0),
    strokeLineDash: undefined,
  }
  const heads = tips
    ? [generator.line(tips[1].x, tips[1].y, tips[0].x, tips[0].y, headOptions), generator.line(tips[2].x, tips[2].y, tips[0].x, tips[0].y, headOptions)]
    : []
  return {
    fill: '',
    stroke: [body, ...heads].map((drawable) => generator.opsToPath(drawable.sets[0])).join(' '),
  }
}

export function roughStrokeWidth(object: SceneObject): number {
  const width = object.strokeWidth || 1.5
  return object.strokeStyle === 'solid' ? width : width + 0.5
}
