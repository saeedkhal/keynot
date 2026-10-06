import type { Doc, Guide, Handle, SceneObject, Slide, Transition } from './types'
import { anchorOnBox, pathOf, withPath } from './path'

export const PALETTE = ['#f3d36b', '#8ecae6', '#f4a261', '#95d5b2', '#f28482', '#c9b6ff', '#ffd6a5']

export function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}

export function defaultTransition(): Transition {
  return { duration: 0.75, delay: 0.5, ease: 'easeInOut', fadeUnmatched: true }
}

export function baseObject(partial: Partial<SceneObject> & Pick<SceneObject, 'id' | 'type'>): SceneObject {
  const object: SceneObject = {
    x: 80,
    y: 80,
    w: 180,
    h: 52,
    x2: 260,
    y2: 80,
    rotation: 0,
    opacity: 1,
    fill: 'transparent',
    text: '',
    textColor: '#f8f9fa',
    fontSize: 20,
    font: 'sans',
    radius: 10,
    stroke: '#e9ecef',
    strokeWidth: 1.5,
    strokeStyle: 'solid',
    roughness: 0,
    shadow: false,
    locked: false,
    textVAlign: 'center',
    groupId: null,
    points: [],
    light: 0,
    startBound: null,
    endBound: null,
    ...partial,
  }
  return {
    ...object,
    strokeStyle: object.strokeStyle === 'dashed' || object.strokeStyle === 'dotted' ? object.strokeStyle : 'solid',
    roughness: object.roughness === 1 || object.roughness === 2 ? object.roughness : 0,
    startBound: object.startBound || null,
    endBound: object.endBound || null,
  }
}

export function blankDoc(): Doc {
  return {
    version: 1,
    width: 960,
    height: 540,
    background: '#000000',
    slides: [blankSlide('Slide 1')],
  }
}

export function blankSlide(name: string): Slide {
  return { id: uid(), name, objects: [], transition: defaultTransition() }
}

export function isDoc(value: unknown): value is Doc {
  if (!value || typeof value !== 'object') return false
  const doc = value as Doc
  return doc.version === 1 && typeof doc.width === 'number' && Array.isArray(doc.slides) && doc.slides.length > 0
}

export function normalize(input: Doc): Doc {
  const fallback = defaultTransition()
  return {
    version: 1,
    width: input.width || 960,
    height: input.height || 540,
    background: input.background || '#000000',
    slides: input.slides.map((slide, index) => ({
      id: slide.id || uid(),
      name: slide.name || `Slide ${index + 1}`,
      transition: { ...fallback, ...slide.transition },
      objects: settleBindings(
        (slide.objects ?? []).map((object) =>
          baseObject({
            ...object,
            id: object.id || uid(),
            type: object.type || 'card',
            strokeStyle: object.strokeStyle === 'dashed' || object.strokeStyle === 'dotted' ? object.strokeStyle : 'solid',
            roughness: typeof object.roughness === 'number' ? object.roughness : 0,
          }),
        ).map((object) => fitLabel(object)),
      ),
    })),
  }
}

export function moveSlide(doc: Doc, from: number, to: number): Doc {
  if (from === to || from < 0 || to < 0 || from >= doc.slides.length || to >= doc.slides.length) return doc
  const slides = doc.slides.slice()
  const [slide] = slides.splice(from, 1)
  slides.splice(to, 0, slide)
  return { ...doc, slides }
}

export function addSlide(doc: Doc, index: number): Doc {
  const slides = doc.slides.slice()
  slides.splice(index + 1, 0, blankSlide(`Slide ${doc.slides.length + 1}`))
  return { ...doc, slides }
}

export function duplicateSlide(doc: Doc, index: number): Doc {
  const source = doc.slides[index]
  const copy: Slide = {
    ...structuredClone(source),
    id: uid(),
    name: `${source.name} copy`,
  }
  const slides = doc.slides.slice()
  slides.splice(index + 1, 0, copy)
  return { ...doc, slides }
}

export function deleteSlide(doc: Doc, index: number): Doc {
  if (doc.slides.length <= 1) return doc
  return { ...doc, slides: doc.slides.filter((_, i) => i !== index) }
}

export function withObjects(doc: Doc, index: number, objects: SceneObject[]): Doc {
  return {
    ...doc,
    slides: doc.slides.map((slide, i) => (i === index ? { ...slide, objects } : slide)),
  }
}

function boxCenter(object: SceneObject): { x: number; y: number } {
  return { x: object.x + object.w / 2, y: object.y + object.h / 2 }
}

export function settleBindings(objects: SceneObject[]): SceneObject[] {
  const byId = new Map(objects.map((object) => [object.id, object]))
  return objects.map((object) => {
    if (object.type !== 'arrow') return object
    const points = pathOf(object).map((point) => ({ ...point }))
    if (points.length < 2) return { ...object, startBound: null, endBound: null }
    const startBox = object.startBound ? byId.get(object.startBound) : undefined
    const endBox = object.endBound ? byId.get(object.endBound) : undefined
    const startBound = startBox && startBox.type !== 'arrow' ? startBox.id : null
    const endBound = endBox && endBox.type !== 'arrow' ? endBox.id : null
    if (startBound && startBox) {
      const from = points.length === 2 && endBox && endBox.type !== 'arrow' ? boxCenter(endBox) : points[1]
      points[0] = anchorOnBox(startBox, from)
    }
    if (endBound && endBox) {
      const from = points.length === 2 && startBox && startBox.type !== 'arrow' ? boxCenter(startBox) : points[points.length - 2]
      points[points.length - 1] = anchorOnBox(endBox, from)
    }
    if (!startBound && !endBound && !object.startBound && !object.endBound) return object
    return withPath({ ...object, startBound, endBound }, points)
  })
}

export function translateObject(object: SceneObject, dx: number, dy: number): SceneObject {
  const next = { ...object, x: object.x + dx, y: object.y + dy }
  if (object.type === 'arrow') {
    return withPath(
      next,
      pathOf(object).map((point) => ({ x: point.x + dx, y: point.y + dy })),
    )
  }
  return next
}

export function objectBounds(object: SceneObject): { x: number; y: number; w: number; h: number } {
  if (object.type === 'arrow') {
    const points = pathOf(object)
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const point of points) {
      minX = Math.min(minX, point.x)
      minY = Math.min(minY, point.y)
      maxX = Math.max(maxX, point.x)
      maxY = Math.max(maxY, point.y)
    }
    return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) }
  }
  return { x: object.x, y: object.y, w: object.w, h: object.h }
}

function nearestSnap(edges: number[], targets: number[], threshold: number): { delta: number; at: number } | null {
  let best: { delta: number; at: number } | null = null
  for (const edge of edges) {
    for (const target of targets) {
      const delta = target - edge
      if (Math.abs(delta) > threshold) continue
      if (!best || Math.abs(delta) < Math.abs(best.delta)) best = { delta, at: target }
    }
  }
  return best
}

export function snapMove(
  moving: SceneObject[],
  stationary: SceneObject[],
  dx: number,
  dy: number,
  canvas: { width: number; height: number },
  threshold = 6,
): { dx: number; dy: number; guides: Guide[] } {
  const box = selectionBounds(moving.map((object) => translateObject(object, dx, dy)))
  if (!box) return { dx, dy, guides: [] }
  const xTargets = [0, canvas.width / 2, canvas.width]
  const yTargets = [0, canvas.height / 2, canvas.height]
  for (const object of stationary) {
    const bounds = objectBounds(object)
    xTargets.push(bounds.x, bounds.x + bounds.w / 2, bounds.x + bounds.w)
    yTargets.push(bounds.y, bounds.y + bounds.h / 2, bounds.y + bounds.h)
  }
  const xSnap = nearestSnap([box.x, box.x + box.w / 2, box.x + box.w], xTargets, threshold)
  const ySnap = nearestSnap([box.y, box.y + box.h / 2, box.y + box.h], yTargets, threshold)
  const guides: Guide[] = []
  if (xSnap) guides.push({ axis: 'v', at: xSnap.at })
  if (ySnap) guides.push({ axis: 'h', at: ySnap.at })
  return { dx: dx + (xSnap?.delta ?? 0), dy: dy + (ySnap?.delta ?? 0), guides }
}

export function selectionBounds(objects: SceneObject[]): { x: number; y: number; w: number; h: number } | null {
  if (objects.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const object of objects) {
    const box = objectBounds(object)
    minX = Math.min(minX, box.x)
    minY = Math.min(minY, box.y)
    maxX = Math.max(maxX, box.x + box.w)
    maxY = Math.max(maxY, box.y + box.h)
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export function alignObjects(
  objects: SceneObject[],
  ids: string[],
  mode: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom',
): SceneObject[] {
  const picked = objects.filter((object) => ids.includes(object.id))
  const box = selectionBounds(picked)
  if (!box || picked.length < 2) return objects
  const selected = new Set(ids)
  return objects.map((object) => {
    if (!selected.has(object.id)) return object
    const bounds = objectBounds(object)
    let dx = 0
    let dy = 0
    if (mode === 'left') dx = box.x - bounds.x
    if (mode === 'center') dx = box.x + box.w / 2 - (bounds.x + bounds.w / 2)
    if (mode === 'right') dx = box.x + box.w - (bounds.x + bounds.w)
    if (mode === 'top') dy = box.y - bounds.y
    if (mode === 'middle') dy = box.y + box.h / 2 - (bounds.y + bounds.h / 2)
    if (mode === 'bottom') dy = box.y + box.h - (bounds.y + bounds.h)
    return translateObject(object, dx, dy)
  })
}

export function distributeObjects(objects: SceneObject[], ids: string[], axis: 'h' | 'v'): SceneObject[] {
  const picked = objects.filter((object) => ids.includes(object.id))
  if (picked.length < 3) return objects
  const sorted = picked.slice().sort((a, b) => (axis === 'h' ? objectBounds(a).x - objectBounds(b).x : objectBounds(a).y - objectBounds(b).y))
  const first = objectBounds(sorted[0])
  const last = objectBounds(sorted[sorted.length - 1])
  const span = axis === 'h' ? last.x + last.w - first.x : last.y + last.h - first.y
  const total = sorted.reduce((sum, object) => sum + (axis === 'h' ? objectBounds(object).w : objectBounds(object).h), 0)
  const gap = (span - total) / (sorted.length - 1)
  let cursor = axis === 'h' ? first.x : first.y
  const shifts = new Map<string, number>()
  for (const object of sorted) {
    const bounds = objectBounds(object)
    const start = axis === 'h' ? bounds.x : bounds.y
    shifts.set(object.id, cursor - start)
    cursor += (axis === 'h' ? bounds.w : bounds.h) + gap
  }
  return objects.map((object) => {
    const delta = shifts.get(object.id)
    if (delta === undefined) return object
    return axis === 'h' ? translateObject(object, delta, 0) : translateObject(object, 0, delta)
  })
}

let labelMeasure: CanvasRenderingContext2D | null = null

export function measureLabel(text: string, fontSize: number, strokeWidth = 0): { w: number; h: number } {
  const content = text.length > 0 ? text : ' '
  let textWidth = content.length * fontSize * 0.52
  if (typeof document !== 'undefined') {
    if (!labelMeasure) labelMeasure = document.createElement('canvas').getContext('2d')
    if (labelMeasure) {
      labelMeasure.font = `${fontSize}px Virgil, system-ui, sans-serif`
      textWidth = labelMeasure.measureText(content).width
    }
  }
  return {
    w: Math.max(fontSize, textWidth + 20 + strokeWidth),
    h: Math.max(fontSize, fontSize * 1.45 + 8 + strokeWidth),
  }
}

export function fitLabel(object: SceneObject): SceneObject {
  if (object.type !== 'label') return object
  const box = measureLabel(object.text, object.fontSize, object.strokeWidth)
  if (Math.abs(object.w - box.w) < 0.5 && Math.abs(object.h - box.h) < 0.5) return object
  const cx = object.x + object.w / 2
  const cy = object.y + object.h / 2
  return { ...object, w: box.w, h: box.h, x: cx - box.w / 2, y: cy - box.h / 2 }
}

export function resized(start: SceneObject, handle: Handle, worldDx: number, worldDy: number): SceneObject {
  const rad = (-start.rotation * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const ldx = worldDx * cos - worldDy * sin
  const ldy = worldDx * sin + worldDy * cos
  const cx = start.x + start.w / 2
  const cy = start.y + start.h / 2
  let left = -start.w / 2
  let right = start.w / 2
  let top = -start.h / 2
  let bottom = start.h / 2
  if (handle.includes('e')) right += ldx
  if (handle.includes('w')) left += ldx
  if (handle.includes('s')) bottom += ldy
  if (handle.includes('n')) top += ldy
  const min = 28
  if (right - left < min) {
    if (handle.includes('w')) left = right - min
    else right = left + min
  }
  if (bottom - top < min) {
    if (handle.includes('n')) top = bottom - min
    else bottom = top + min
  }
  let newW = right - left
  let newH = bottom - top
  let fontSize = start.fontSize
  if (start.type === 'label' && start.w > 0 && start.h > 0) {
    const scale = Math.hypot(newW, newH) / Math.hypot(start.w, start.h)
    fontSize = Math.max(1, start.fontSize * scale)
    const fitted = measureLabel(start.text, fontSize, start.strokeWidth)
    if (handle.includes('e')) left = handle.includes('w') ? -fitted.w / 2 : -start.w / 2
    else if (handle.includes('w')) left = start.w / 2 - fitted.w
    else left = -fitted.w / 2
    right = left + fitted.w
    if (handle.includes('s')) top = handle.includes('n') ? -fitted.h / 2 : -start.h / 2
    else if (handle.includes('n')) top = start.h / 2 - fitted.h
    else top = -fitted.h / 2
    bottom = top + fitted.h
    newW = fitted.w
    newH = fitted.h
  }
  const localCx = (left + right) / 2
  const localCy = (top + bottom) / 2
  const rot = (start.rotation * Math.PI) / 180
  const shiftX = localCx * Math.cos(rot) - localCy * Math.sin(rot)
  const shiftY = localCx * Math.sin(rot) + localCy * Math.cos(rot)
  return {
    ...start,
    w: newW,
    h: newH,
    x: cx + shiftX - newW / 2,
    y: cy + shiftY - newH / 2,
    fontSize,
  }
}

export function orderObjects(objects: SceneObject[], ids: string[], direction: 'front' | 'forward' | 'backward' | 'back'): SceneObject[] {
  const selected = new Set(ids)
  const picked = objects.filter((object) => selected.has(object.id))
  const rest = objects.filter((object) => !selected.has(object.id))
  if (picked.length === 0) return objects
  if (direction === 'front') return [...rest, ...picked]
  if (direction === 'back') return [...picked, ...rest]
  const next = objects.slice()
  if (direction === 'forward') {
    for (let i = next.length - 2; i >= 0; i -= 1) {
      if (selected.has(next[i].id) && !selected.has(next[i + 1].id)) {
        const swap = next[i]
        next[i] = next[i + 1]
        next[i + 1] = swap
      }
    }
  } else {
    for (let i = 1; i < next.length; i += 1) {
      if (selected.has(next[i].id) && !selected.has(next[i - 1].id)) {
        const swap = next[i]
        next[i] = next[i - 1]
        next[i - 1] = swap
      }
    }
  }
  return next
}

export function duplicateObjects(objects: SceneObject[], ids: string[]): { objects: SceneObject[]; ids: string[] } {
  const selected = new Set(ids)
  const groupMap = new Map<string, string>()
  const created: SceneObject[] = []
  for (const object of objects) {
    if (!selected.has(object.id)) continue
    let groupId = object.groupId
    if (groupId) {
      if (!groupMap.has(groupId)) groupMap.set(groupId, `g_${uid()}`)
      groupId = groupMap.get(groupId) ?? null
    }
    created.push(translateObject({ ...object, id: uid(), groupId }, 20, 20))
  }
  return { objects: [...objects, ...created], ids: created.map((object) => object.id) }
}

export function addCard(doc: Doc, index: number): { doc: Doc; id: string } {
  const slide = doc.slides[index]
  const id = uid()
  const n = slide.objects.length
  const object = baseObject({
    id,
    type: 'card',
    x: doc.width / 2 - 90 + (n % 4) * 16,
    y: doc.height / 2 - 26 + (n % 4) * 16,
    w: 180,
    h: 52,
    fill: 'transparent',
    text: 'label',
    textColor: '#f8f9fa',
    font: 'sans',
    radius: 10,
    stroke: '#e9ecef',
    strokeWidth: 1.5,
    shadow: false,
  })
  return { doc: withObjects(doc, index, [...slide.objects, object]), id }
}

export function addLabel(doc: Doc, index: number): { doc: Doc; id: string } {
  const slide = doc.slides[index]
  const id = uid()
  const object = fitLabel(baseObject({
    id,
    type: 'label',
    x: 48,
    y: 24,
    w: 220,
    h: 36,
    fill: 'transparent',
    text: 'Label',
    font: 'sans',
    fontSize: 22,
    shadow: false,
    radius: 0,
    strokeWidth: 0,
  }))
  return { doc: withObjects(doc, index, [...slide.objects, object]), id }
}

export function addArrow(doc: Doc, index: number): { doc: Doc; id: string } {
  const slide = doc.slides[index]
  const id = uid()
  const object = withPath(
    baseObject({
      id,
      type: 'arrow',
      stroke: '#e9ecef',
      strokeWidth: 1.5,
      fill: '#ffffff',
      shadow: false,
      light: 1,
      points: [
        { x: doc.width / 2 - 120, y: doc.height / 2 },
        { x: doc.width / 2, y: doc.height / 2 - 70 },
        { x: doc.width / 2 + 80, y: doc.height / 2 },
      ],
    }),
    [
      { x: doc.width / 2 - 120, y: doc.height / 2 },
      { x: doc.width / 2, y: doc.height / 2 - 70 },
      { x: doc.width / 2 + 80, y: doc.height / 2 },
    ],
  )
  return { doc: withObjects(doc, index, [...slide.objects, object]), id }
}
