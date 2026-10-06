import { settleBindings } from './doc'
import type { Doc, EaseName, SceneObject, Slide, Transition } from './types'
import { lerpPoints, pathOf, withPath } from './path'

export function applyEase(t: number, ease: EaseName): number {
  const x = Math.min(1, Math.max(0, t))
  if (ease === 'none') return x
  if (ease === 'easeIn') return 1 - (1 - x) ** 3
  if (ease === 'easeOut') return x ** 3
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2
}

export function parseColor(input: string): [number, number, number, number] {
  const value = input.trim().toLowerCase()
  if (value === 'transparent') return [0, 0, 0, 0]
  const hex = value.match(/^#([0-9a-f]{3,8})$/)
  if (hex) {
    let raw = hex[1]
    if (raw.length === 3 || raw.length === 4) raw = raw.split('').map((c) => c + c).join('')
    const r = parseInt(raw.slice(0, 2), 16)
    const g = parseInt(raw.slice(2, 4), 16)
    const b = parseInt(raw.slice(4, 6), 16)
    const a = raw.length >= 8 ? parseInt(raw.slice(6, 8), 16) : 255
    return [r, g, b, a]
  }
  const rgb = value.match(/^rgba?\(([^)]+)\)$/)
  if (rgb) {
    const parts = rgb[1].split(',').map((part) => part.trim())
    const r = Number(parts[0]) || 0
    const g = Number(parts[1]) || 0
    const b = Number(parts[2]) || 0
    const a = parts[3] === undefined ? 255 : Math.round(Number(parts[3]) * 255)
    return [r, g, b, a]
  }
  return [0, 0, 0, 255]
}

export function lerpColor(from: string, to: string, t: number): string {
  const a = parseColor(from)
  const b = parseColor(to)
  const mix = a.map((channel, index) => Math.round(channel + (b[index] - channel) * t))
  return `rgba(${mix[0]}, ${mix[1]}, ${mix[2]}, ${(mix[3] / 255).toFixed(3)})`
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function bindingAt(from: string | null, to: string | null, t: number): string | null {
  if (from && from === to) return from
  return t >= 0.5 ? to || null : from || null
}

function lerpAngle(a: number, b: number, t: number): number {
  const delta = ((((b - a) % 360) + 540) % 360) - 180
  return a + delta * t
}

function lerpObject(from: SceneObject, to: SceneObject, t: number): SceneObject {
  const swapped = t >= 0.5
  const next: SceneObject = {
    ...from,
    x: lerp(from.x, to.x, t),
    y: lerp(from.y, to.y, t),
    w: lerp(from.w, to.w, t),
    h: lerp(from.h, to.h, t),
    x2: lerp(from.x2, to.x2, t),
    y2: lerp(from.y2, to.y2, t),
    rotation: lerpAngle(from.rotation, to.rotation, t),
    opacity: lerp(from.opacity, to.opacity, t),
    fontSize: lerp(from.fontSize, to.fontSize, t),
    radius: lerp(from.radius, to.radius, t),
    strokeWidth: lerp(from.strokeWidth, to.strokeWidth, t),
    light: lerp(from.light ?? 0, to.light ?? 0, t),
    fill: lerpColor(from.fill, to.fill, t),
    textColor: lerpColor(from.textColor, to.textColor, t),
    stroke: lerpColor(from.stroke, to.stroke, t),
    strokeStyle: (swapped ? to.strokeStyle : from.strokeStyle) === 'dashed' ? 'dashed' : 'solid',
    text: swapped ? to.text : from.text,
    font: swapped ? to.font : from.font,
    shadow: swapped ? to.shadow : from.shadow,
    textVAlign: swapped ? to.textVAlign : from.textVAlign,
    type: swapped ? to.type : from.type,
    locked: from.locked,
    groupId: swapped ? to.groupId : from.groupId,
    startBound: bindingAt(from.startBound, to.startBound, t),
    endBound: bindingAt(from.endBound, to.endBound, t),
  }
  if (from.type === 'arrow' || to.type === 'arrow') return withPath(next, lerpPoints(pathOf(from), pathOf(to), t))
  return next
}

export function frameBetween(from: Slide, to: Slide, t: number, transition: Transition): SceneObject[] {
  const eased = applyEase(t, transition.ease)
  const fromIndex = new Map(from.objects.map((object, index) => [object.id, index]))
  const toIndex = new Map(to.objects.map((object, index) => [object.id, index]))
  const ids = [...from.objects.map((object) => object.id), ...to.objects.map((object) => object.id).filter((id) => !fromIndex.has(id))]
  const frames: { object: SceneObject; order: number }[] = []
  for (const id of ids) {
    const a = from.objects.find((object) => object.id === id)
    const b = to.objects.find((object) => object.id === id)
    let object: SceneObject | null = null
    if (a && b) object = lerpObject(a, b, eased)
    else if (a && !b) {
      object = transition.fadeUnmatched ? { ...a, opacity: a.opacity * (1 - eased) } : t === 0 ? { ...a } : null
    } else if (b && !a) {
      object = transition.fadeUnmatched ? { ...b, opacity: b.opacity * eased } : t === 0 ? null : { ...b }
    }
    if (!object || object.opacity < 0.004) continue
    const ai = fromIndex.get(id)
    const bi = toIndex.get(id)
    const order = (ai ?? bi ?? 0) + ((bi ?? ai ?? 0) - (ai ?? bi ?? 0)) * eased
    frames.push({ object, order })
  }
  frames.sort((a, b) => a.order - b.order)
  return settleBindings(frames.map((frame) => frame.object))
}

export type Segment =
  | { kind: 'hold'; index: number; slide: Slide; seconds: number }
  | { kind: 'move'; fromIndex: number; toIndex: number; from: Slide; to: Slide; seconds: number; transition: Transition }

export function segments(doc: Doc): Segment[] {
  const out: Segment[] = []
  doc.slides.forEach((slide, index) => {
    if (slide.transition.delay > 0) out.push({ kind: 'hold', index, slide, seconds: slide.transition.delay })
    if (index < doc.slides.length - 1) {
      out.push({
        kind: 'move',
        fromIndex: index,
        toIndex: index + 1,
        from: slide,
        to: doc.slides[index + 1],
        seconds: Math.max(0.05, slide.transition.duration),
        transition: slide.transition,
      })
    }
  })
  if (out.length === 0 && doc.slides[0]) out.push({ kind: 'hold', index: 0, slide: doc.slides[0], seconds: 0.4 })
  return out
}

export function totalSeconds(doc: Doc): number {
  return segments(doc).reduce((sum, segment) => sum + segment.seconds, 0)
}

export function sampleAt(doc: Doc, elapsed: number): { objects: SceneObject[]; label: string; slideIndex: number } {
  const list = segments(doc)
  let time = Math.max(0, elapsed)
  for (const segment of list) {
    const last = segment === list[list.length - 1]
    if (time <= segment.seconds || last) {
      const u = segment.seconds <= 0 ? 1 : Math.min(1, time / segment.seconds)
      if (segment.kind === 'hold') {
        return { objects: segment.slide.objects.map((object) => ({ ...object })), label: segment.slide.name, slideIndex: segment.index }
      }
      const slideIndex = u < 0.5 ? segment.fromIndex : segment.toIndex
      return {
        objects: frameBetween(segment.from, segment.to, u, segment.transition),
        label: `${segment.from.name} → ${segment.to.name}`,
        slideIndex,
      }
    }
    time -= segment.seconds
  }
  const last = doc.slides[doc.slides.length - 1]
  return { objects: last.objects.map((object) => ({ ...object })), label: last.name, slideIndex: doc.slides.length - 1 }
}
