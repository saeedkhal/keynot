import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  addArrow,
  addCard,
  addLabel,
  fitLabel,
  addSlide,
  alignObjects,
  blankDoc,
  deleteSlide,
  distributeObjects,
  dragTargets,
  marqueeTargets,
  duplicateObjects,
  duplicateSlide,
  moveSlide,
  isDoc,
  normalize,
  orderObjects,
  resized,
  rotateObjects,
  scaleObjects,
  selectionBounds,
  settleBindings,
  snapMove,
  translateObject,
  withObjects,
} from './doc'
import { encodeGif } from './exportGif'
import { encodeMp4 } from './exportMp4'
import { exampleDoc } from './example'
import { frameBetween, sampleAt, segments, totalSeconds } from './magic'
import { insertPoint, nearestBox, pathLength, pathOf, withPath } from './path'
import { SceneView, useFitScale } from './Scene'
import type { Doc, EaseName, Guide, Handle, SceneObject, Transition } from './types'
import './styles.css'

const STORAGE_KEY = 'keynot-doc-v1'

function loadDoc(): Doc {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as unknown
      if (isDoc(parsed)) return normalize(parsed)
    }
  } catch {
    /* keep the example */
  }
  return exampleDoc()
}

type Gesture =
  | { kind: 'move'; ids: string[]; start: Map<string, SceneObject>; x: number; y: number; moved: boolean }
  | { kind: 'resize'; id: string; handle: Handle; start: SceneObject; x: number; y: number }
  | { kind: 'resize-group'; ids: string[]; handle: Handle; starts: Map<string, SceneObject>; x: number; y: number }
  | { kind: 'rotate'; id: string; start: SceneObject; angle: number }
  | { kind: 'rotate-group'; ids: string[]; starts: Map<string, SceneObject>; cx: number; cy: number; angle: number }
  | { kind: 'point'; id: string; index: number; start: SceneObject }

function slideShift(index: number, from: number, to: number, slot: number) {
  if (index === from) return 0
  if (from < to && index > from && index <= to) return -slot
  if (to < from && index >= to && index < from) return slot
  return 0
}

function slideThumbStyle(
  index: number,
  drag: { from: number; to: number; dy: number; slot: number; phase: 'drag' | 'settle' } | null,
) {
  if (!drag) return undefined
  if (drag.from === index) {
    if (drag.phase !== 'settle') return undefined
    return { transform: `translateY(${drag.dy}px)` }
  }
  const shift = slideShift(index, drag.from, drag.to, drag.slot)
  if (!shift) return undefined
  return { transform: `translateY(${shift}px)` }
}

function pointOf(event: { clientX: number; clientY: number }, stage: HTMLDivElement, width: number, height: number) {
  const rect = stage.getBoundingClientRect()
  return {
    x: ((event.clientX - rect.left) / rect.width) * width,
    y: ((event.clientY - rect.top) / rect.height) * height,
  }
}

export function App() {
  const [doc, setDoc] = useState<Doc>(loadDoc)
  const [past, setPast] = useState<Doc[]>([])
  const [future, setFuture] = useState<Doc[]>([])
  const [slideIndex, setSlideIndex] = useState(0)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [pathPoint, setPathPoint] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [loop, setLoop] = useState(true)
  const [preview, setPreview] = useState<{ objects: SceneObject[]; label: string; slideIndex: number } | null>(null)
  const [exporting, setExporting] = useState(false)
  const [gifScale, setGifScale] = useState(2)
  const [guides, setGuides] = useState<Guide[]>([])
  const [slideDrag, setSlideDrag] = useState<{ from: number; to: number; dy: number; slot: number; phase: 'drag' | 'settle' } | null>(null)
  const [boundHover, setBoundHover] = useState<string | null>(null)
  const [presenting, setPresenting] = useState(false)
  const [presentObjects, setPresentObjects] = useState<SceneObject[] | null>(null)
  const [presentScale, setPresentScale] = useState({ x: 1, y: 1 })
  const [status, setStatus] = useState('Duplicate a slide, move the same cards, then Play.')
  const [menuOpen, setMenuOpen] = useState(false)
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const live = useRef(doc)
  const presentingRef = useRef(false)
  const advancingRef = useRef(false)
  const advanceFrame = useRef(0)
  const presentRef = useRef<HTMLDivElement>(null)
  const advanceRef = useRef<(direction: 1 | -1) => void>(() => {})
  const gestureStart = useRef<Doc | null>(null)
  const skipSlideClick = useRef(false)
  const slideDragToken = useRef(0)
  const stageRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const fileHandle = useRef<FileSystemFileHandle | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  presentingRef.current = presenting
  const { setSlot, scaleX, scaleY } = useFitScale(doc.width, doc.height)
  live.current = doc
  const index = Math.min(slideIndex, doc.slides.length - 1)
  const slide = doc.slides[index]

  useEffect(() => {
    const id = window.setTimeout(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(doc)), 250)
    return () => window.clearTimeout(id)
  }, [doc])

  useEffect(() => {
    let cancel = false
    document.fonts.load('22px Virgil').then(() => {
      if (cancel) return
      const current = live.current
      let changed = false
      const slides = current.slides.map((slide) => {
        let slideChanged = false
        const objects = slide.objects.map((object) => {
          const next = fitLabel(object)
          if (next !== object) slideChanged = true
          return next
        })
        if (!slideChanged) return slide
        changed = true
        return { ...slide, objects }
      })
      if (changed) replace({ ...current, slides })
    })
    return () => {
      cancel = true
    }
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void saveFile()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function commit(next: Doc) {
    setPast((items) => [...items.slice(-79), live.current])
    setFuture([])
    live.current = next
    setDoc(next)
  }

  function replace(next: Doc) {
    live.current = next
    setDoc(next)
  }

  function undo() {
    setPast((items) => {
      const previous = items[items.length - 1]
      if (!previous) return items
      setFuture((queue) => [...queue, live.current])
      live.current = previous
      setDoc(previous)
      return items.slice(0, -1)
    })
  }

  function redo() {
    setFuture((items) => {
      const next = items[items.length - 1]
      if (!next) return items
      setPast((queue) => [...queue.slice(-79), live.current])
      live.current = next
      setDoc(next)
      return items.slice(0, -1)
    })
  }

  function patchSlide(objects: SceneObject[], record: boolean) {
    const next = withObjects(live.current, index, settleBindings(objects))
    if (record) commit(next)
    else replace(next)
  }

  function updateSelected(patch: Partial<SceneObject>) {
    const ids = new Set(selectedIds)
    patchSlide(
      slide.objects.map((object) => (ids.has(object.id) ? fitLabel({ ...object, ...patch }) : object)),
      true,
    )
  }

  function groupSelected() {
    if (selectedIds.length < 2) return
    updateSelected({ groupId: `g_${Math.random().toString(36).slice(2, 8)}` })
    setStatus('Grouped. Drag one item and the rest follow.')
  }

  function ungroupSelected() {
    if (!selectedIds.length) return
    updateSelected({ groupId: null })
    setStatus('Ungrouped.')
  }

  useEffect(() => {
    if (!playing) {
      setPreview(null)
      return
    }
    let frame = 0
    let last = performance.now()
    let elapsed = 0
    const tick = (now: number) => {
      const current = live.current
      const total = totalSeconds(current)
      elapsed += Math.min(0.05, (now - last) / 1000)
      last = now
      if (elapsed >= total) {
        if (loop) elapsed %= total
        else {
          setPlaying(false)
          setPreview(null)
          setStatus('Playback finished.')
          return
        }
      }
      const sample = sampleAt(current, elapsed)
      setPreview(sample)
      setStatus(sample.label)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, loop])

  advanceRef.current = (direction) => {
    if (!presentingRef.current || advancingRef.current) return
    const from = Math.min(slideIndex, live.current.slides.length - 1)
    const to = from + direction
    if (to < 0 || to >= live.current.slides.length) return
    const current = live.current
    const transition = current.slides[Math.min(from, to)].transition
    const fromSlide = current.slides[from]
    const toSlide = current.slides[to]
    const duration = Math.max(0.05, transition.duration) * 1000
    advancingRef.current = true
    const started = performance.now()
    const step = (now: number) => {
      if (!presentingRef.current) {
        advancingRef.current = false
        setPresentObjects(null)
        return
      }
      const t = Math.min(1, (now - started) / duration)
      setPresentObjects(frameBetween(fromSlide, toSlide, t, transition))
      if (t < 1) {
        advanceFrame.current = requestAnimationFrame(step)
        return
      }
      advancingRef.current = false
      setPresentObjects(null)
      setSlideIndex(to)
      setSelectedIds([])
    }
    advanceFrame.current = requestAnimationFrame(step)
  }

  useEffect(() => {
    if (!presenting) {
      cancelAnimationFrame(advanceFrame.current)
      advancingRef.current = false
      setPresentObjects(null)
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
      return
    }
    const node = presentRef.current
    const fit = () => {
      const box = node?.getBoundingClientRect()
      const width = box?.width || window.innerWidth
      const height = box?.height || window.innerHeight
      setPresentScale({
        x: Math.max(0.2, width / doc.width),
        y: Math.max(0.2, height / doc.height),
      })
    }
    fit()
    let enteredFullscreen = false
    const onFullscreen = () => {
      if (document.fullscreenElement) {
        enteredFullscreen = true
        fit()
        return
      }
      if (enteredFullscreen) setPresenting(false)
    }
    document.addEventListener('fullscreenchange', onFullscreen)
    window.addEventListener('resize', fit)
    node?.requestFullscreen().catch(() => {})
    return () => {
      window.removeEventListener('resize', fit)
      document.removeEventListener('fullscreenchange', onFullscreen)
    }
  }, [presenting, doc.width, doc.height])

  const onKeyRef = useRef<(event: KeyboardEvent) => void>(() => {})
  onKeyRef.current = (event) => {
      if (presentingRef.current) {
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === 'PageDown' || event.key === ' ') {
          event.preventDefault()
          advanceRef.current(1)
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp' || event.key === 'PageUp') {
          event.preventDefault()
          advanceRef.current(-1)
        } else if (event.key === 'Escape') {
          setPresenting(false)
        }
        return
      }
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return
      const meta = event.metaKey || event.ctrlKey
      if (event.key === ' ' ) {
        event.preventDefault()
        setPlaying((value) => !value)
      } else if (meta && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault()
        undo()
      } else if (meta && (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey))) {
        event.preventDefault()
        redo()
      } else if (meta && event.shiftKey && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        const next = duplicateSlide(live.current, index)
        commit(next)
        setSlideIndex(index + 1)
        setSelectedIds([])
      } else if (meta && event.key.toLowerCase() === 'd' && selectedIds.length) {
        event.preventDefault()
        const result = duplicateObjects(slide.objects, selectedIds)
        patchSlide(result.objects, true)
        setSelectedIds(result.ids)
      } else if (meta && event.shiftKey && event.key.toLowerCase() === 'g') {
        event.preventDefault()
        ungroupSelected()
      } else if (meta && event.key.toLowerCase() === 'g' && selectedIds.length > 1) {
        event.preventDefault()
        groupSelected()
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        if (!selectedIds.length) return
        event.preventDefault()
        const only = selectedIds.length === 1 ? slide.objects.find((object) => object.id === selectedIds[0]) : undefined
        if (only?.type === 'arrow' && pathPoint !== null && pathOf(only).length > 2) {
          const points = pathOf(only).filter((_, pointIndex) => pointIndex !== pathPoint)
          patchSlide(
            slide.objects.map((object) => (object.id === only.id ? withPath(object, points) : object)),
            true,
          )
          setPathPoint(null)
          return
        }
        const ids = new Set(selectedIds)
        patchSlide(slide.objects.filter((object) => !ids.has(object.id)), true)
        setSelectedIds([])
      } else if (event.key === 'Escape') {
        setSelectedIds([])
        setEditingId(null)
        setPlaying(false)
      } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) && selectedIds.length) {
        event.preventDefault()
        const step = event.shiftKey ? 10 : 1
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
        const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
        const ids = new Set(selectedIds)
        const locked = slide.objects.some((object) => ids.has(object.id) && object.locked)
        if (locked) return
        patchSlide(
          slide.objects.map((object) => (ids.has(object.id) ? translateObject(object, dx, dy) : object)),
          true,
        )
      }
    }
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      onKeyRef.current(event)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function stagePoint(event: { clientX: number; clientY: number }) {
    const node = stageRef.current
    if (!node) return { x: 0, y: 0 }
    return pointOf(event, node, doc.width, doc.height)
  }

  function beginHistory() {
    gestureStart.current = live.current
  }

  function endHistory() {
    const start = gestureStart.current
    gestureStart.current = null
    if (start && start !== live.current) {
      setPast((items) => [...items.slice(-79), start])
      setFuture([])
    }
  }

  function track(gesture: Gesture) {
    beginHistory()
    function move(event: PointerEvent) {
      const point = stagePoint(event)
      const current = live.current.slides[index].objects
      if (gesture.kind === 'move') {
        const dx = point.x - gesture.x
        const dy = point.y - gesture.y
        if (!gesture.moved && Math.hypot(dx, dy) < 2) return
        gesture.moved = true
        const ids = new Set(gesture.ids)
        const origins = gesture.ids.flatMap((id) => {
          const origin = gesture.start.get(id)
          return origin ? [origin] : []
        })
        const snapped = snapMove(
          origins,
          current.filter((object) => !ids.has(object.id)),
          dx,
          dy,
          { width: live.current.width, height: live.current.height },
        )
        setGuides(snapped.guides)
        patchSlide(
          current.map((object) => {
            const origin = gesture.start.get(object.id)
            if (!origin || !ids.has(object.id)) return object
            return translateObject(origin, snapped.dx, snapped.dy)
          }),
          false,
        )
      } else if (gesture.kind === 'resize-group') {
        const base = current.map((object) => gesture.starts.get(object.id) ?? object)
        patchSlide(scaleObjects(base, gesture.ids, gesture.handle, point.x - gesture.x, point.y - gesture.y), false)
      } else if (gesture.kind === 'rotate-group') {
        let degrees = (Math.atan2(point.y - gesture.cy, point.x - gesture.cx) - gesture.angle) * (180 / Math.PI)
        if (event.shiftKey) degrees = Math.round(degrees / 15) * 15
        const base = current.map((object) => gesture.starts.get(object.id) ?? object)
        patchSlide(rotateObjects(base, gesture.ids, degrees), false)
      } else if (gesture.kind === 'resize') {
        patchSlide(
          current.map((object) =>
            object.id === gesture.id ? resized(gesture.start, gesture.handle, point.x - gesture.x, point.y - gesture.y) : object,
          ),
          false,
        )
      } else if (gesture.kind === 'rotate') {
        const object = gesture.start
        const cx = object.x + object.w / 2
        const cy = object.y + object.h / 2
        let degrees = gesture.start.rotation + (Math.atan2(point.y - cy, point.x - cx) - gesture.angle) * (180 / Math.PI)
        if (event.shiftKey) degrees = Math.round(degrees / 15) * 15
        patchSlide(
          current.map((item) => (item.id === gesture.id ? { ...item, rotation: degrees } : item)),
          false,
        )
      } else if (gesture.kind === 'point') {
        const boxes = current.filter((object) => object.type !== 'arrow')
        const atEnd = gesture.index === 0 || gesture.index === pathOf(gesture.start).length - 1
        const hit = atEnd ? nearestBox(boxes, point, 18) : null
        const binding = hit?.id ?? null
        setBoundHover(binding)
        patchSlide(
          current.map((object) => {
            if (object.id !== gesture.id) return object
            const points = pathOf(gesture.start).map((item, itemIndex) => (itemIndex === gesture.index ? { x: point.x, y: point.y } : item))
            const last = points.length - 1
            const startBound = gesture.index === 0 ? binding : gesture.start.startBound
            const endBound = gesture.index === last ? binding : gesture.start.endBound
            return withPath({ ...gesture.start, startBound, endBound }, points)
          }),
          false,
        )
      }
    }
    function up() {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setGuides([])
      setBoundHover(null)
      endHistory()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function onPointerDownObject(event: ReactPointerEvent, id: string) {
    if (playing) return
    event.stopPropagation()
    const object = slide.objects.find((item) => item.id === id)
    if (!object) return
    const ids = dragTargets(slide.objects, selectedIds, id, event.shiftKey)
    setEditingId(null)
    setSelectedIds(ids)
    if (object.locked) return
    const moving = slide.objects.filter((item) => ids.includes(item.id) && !item.locked)
    if (!moving.length) return
    const point = stagePoint(event)
    const start = new Map(moving.map((item) => [item.id, item]))
    track({ kind: 'move', ids: moving.map((item) => item.id), start, x: point.x, y: point.y, moved: false })
  }

  function onHandleDown(event: ReactPointerEvent, id: string, handle: Handle | 'rotate' | number) {
    if (playing) return
    if (selectedIds.length > 1 && typeof handle === 'string') {
      const members = slide.objects.filter((item) => selectedIds.includes(item.id) && !item.locked)
      if (!members.length) return
      const point = stagePoint(event)
      const starts = new Map(members.map((item) => [item.id, item]))
      const memberIds = members.map((item) => item.id)
      if (handle === 'rotate') {
        const box = selectionBounds(members)
        if (!box) return
        const cx = box.x + box.w / 2
        const cy = box.y + box.h / 2
        track({ kind: 'rotate-group', ids: memberIds, starts, cx, cy, angle: Math.atan2(point.y - cy, point.x - cx) })
      } else {
        track({ kind: 'resize-group', ids: memberIds, handle, starts, x: point.x, y: point.y })
      }
      return
    }
    const object = slide.objects.find((item) => item.id === id)
    if (!object || object.locked) return
    const point = stagePoint(event)
    if (handle === 'rotate') {
      const cx = object.x + object.w / 2
      const cy = object.y + object.h / 2
      track({ kind: 'rotate', id, start: object, angle: Math.atan2(point.y - cy, point.x - cx) })
    } else if (typeof handle === 'number') {
      setPathPoint(handle)
      track({ kind: 'point', id, index: handle, start: object })
    } else {
      track({ kind: 'resize', id, handle, start: object, x: point.x, y: point.y })
    }
  }

  async function onExport(kind: 'gif' | 'mp4') {
    setExporting(true)
    setStatus(kind === 'mp4' ? 'Rendering a 50 fps MP4…' : 'Rendering a 50 fps GIF…')
    await new Promise((resolve) => setTimeout(resolve, 30))
    try {
      const blob = kind === 'mp4' ? await encodeMp4(doc, gifScale) : await encodeGif(doc, gifScale)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = kind === 'mp4' ? 'keynot.mp4' : 'keynot.gif'
      link.click()
      URL.revokeObjectURL(url)
      setStatus(kind === 'mp4' ? 'MP4 downloaded.' : 'GIF downloaded.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : kind === 'mp4' ? 'MP4 export failed.' : 'GIF export failed.')
    } finally {
      setExporting(false)
    }
  }

  async function saveFile() {
    const body = JSON.stringify(live.current)
    const picker = (window as Window & {
      showSaveFilePicker?: (options: { suggestedName?: string; types?: { description?: string; accept: Record<string, string[]> }[] }) => Promise<FileSystemFileHandle>
    }).showSaveFilePicker
    if (picker && !fileHandle.current) {
      try {
        fileHandle.current = await picker({
          suggestedName: 'keynot.json',
          types: [{ description: 'Keynot deck', accept: { 'application/json': ['.json'] } }],
        })
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        fileHandle.current = null
      }
    }
    if (fileHandle.current) {
      try {
        const writable = await fileHandle.current.createWritable()
        await writable.write(body)
        await writable.close()
        setStatus(`Saved ${fileHandle.current.name}.`)
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        fileHandle.current = null
      }
    }
    const blob = new Blob([body], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'keynot.json'
    link.click()
    URL.revokeObjectURL(url)
    setStatus('Saved keynot.json.')
  }

  function openFile(file: File) {
    file.text().then((text) => {
      const parsed = JSON.parse(text) as unknown
      if (!isDoc(parsed)) throw new Error('Not a Keynot file')
      commit(normalize(parsed))
      setSlideIndex(0)
      setSelectedIds([])
      setStatus('Opened file.')
    }).catch(() => setStatus('Could not open that file.'))
  }

  const selected = slide.objects.filter((object) => selectedIds.includes(object.id))
  const single = selected.length === 1 ? selected[0] : null
  const connectIds = [
    ...(!playing && single?.type === 'arrow' ? [single.startBound, single.endBound] : []),
    boundHover,
  ].filter((id): id is string => !!id)
  const shownObjects = playing && preview ? preview.objects : slide.objects
  const liveSlide = playing && preview ? preview.slideIndex : index

  return (
    <div className="app">
      <header className="toolbar">
        <div className="brand">
          <strong>Keynot</strong>
          <span>Magic Move</span>
        </div>
        <button type="button" className="tool" data-tip="Card" aria-label="Card" data-testid="add-card" onClick={() => { const result = addCard(doc, index); commit(result.doc); setSelectedIds([result.id]) }}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="4" y="6" width="16" height="12" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
        </button>
        <button type="button" className="tool" data-tip="Arrow" aria-label="Arrow" data-testid="add-arrow" onClick={() => { const result = addArrow(doc, index); commit(result.doc); setSelectedIds([result.id]) }}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 12 H16 M12 7 L18 12 L12 17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <button type="button" className="tool" data-tip="Label" aria-label="Label" onClick={() => { const result = addLabel(doc, index); commit(result.doc); setSelectedIds([result.id]) }}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M7 18 L12 6 L17 18 M9 14 H15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <i className="sep" />
        <button
          type="button"
          data-testid="duplicate-slide"
          onClick={() => {
            commit(duplicateSlide(doc, index))
            setSlideIndex(index + 1)
            setSelectedIds([])
          }}
        >
          Duplicate slide
        </button>
        <button
          type="button"
          className="tool"
          data-tip="Group"
          aria-label="Group"
          disabled={selectedIds.length < 2}
          onClick={groupSelected}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="3" y="7" width="10" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" /><rect x="11" y="3" width="10" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
        </button>
        <button type="button" disabled={!selected.length} onClick={ungroupSelected}>Ungroup</button>
        <button
          type="button"
          className="tool"
          data-tip={selected.every((object) => object.locked) && selected.length ? 'Unlock' : 'Lock'}
          aria-label={selected.every((object) => object.locked) && selected.length ? 'Unlock' : 'Lock'}
          disabled={!selected.length}
          onClick={() => updateSelected({ locked: !selected.every((object) => object.locked) })}
        >
          {selected.every((object) => object.locked) && selected.length ? (
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M8 11 V8 a4 4 0 0 1 7.2 -2.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M8 11 V8 a4 4 0 0 1 8 0 V11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
          )}
        </button>
        <button
          type="button"
          disabled={!selected.length}
          onClick={() => {
            const ids = new Set(selectedIds)
            patchSlide(slide.objects.filter((object) => !ids.has(object.id)), true)
            setSelectedIds([])
          }}
        >
          Delete
        </button>
        <span className="grow" />
        <div className="menu" ref={menuRef}>
          {menuOpen && <button type="button" className="menu-backdrop" aria-label="Close menu" onClick={() => setMenuOpen(false)} />}
          <button
            type="button"
            className="tool"
            data-testid="app-menu"
            aria-label="Menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 7 H20 M4 12 H20 M4 17 H20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
          {menuOpen && (
            <div className="menu-panel" role="menu">
              <button type="button" role="menuitem" disabled={!past.length} onClick={() => { setMenuOpen(false); undo() }}>Undo</button>
              <button type="button" role="menuitem" disabled={!future.length} onClick={() => { setMenuOpen(false); redo() }}>Redo</button>
              <button type="button" role="menuitem" data-testid="play" onClick={() => { setMenuOpen(false); setPlaying((value) => !value) }}>{playing ? 'Stop' : 'Play'}</button>
              <button type="button" role="menuitem" data-testid="present" onClick={() => { setMenuOpen(false); setPlaying(false); setPresenting(true) }}>Present</button>
              <button type="button" role="menuitem" data-testid="save" onClick={() => { setMenuOpen(false); void saveFile() }}>Save</button>
              <button type="button" role="menuitem" data-testid="export-gif" disabled={exporting} onClick={() => { setMenuOpen(false); void onExport('gif') }}>{exporting ? 'Exporting…' : 'Export GIF'}</button>
              <button type="button" role="menuitem" data-testid="export-mp4" disabled={exporting} onClick={() => { setMenuOpen(false); void onExport('mp4') }}>{exporting ? 'Exporting…' : 'Export MP4'}</button>
            </div>
          )}
        </div>
      </header>
      <div className="workspace">
        <aside className="film">
          {doc.slides.map((item, itemIndex) => (
            <button
              type="button"
              key={item.id}
              className={[
                'thumb',
                itemIndex === liveSlide ? 'is-live' : '',
                slideDrag?.from === itemIndex && slideDrag.phase === 'drag' ? 'is-dragging' : '',
                slideDrag?.from === itemIndex && slideDrag.phase === 'settle' ? 'is-settling' : '',
              ].filter(Boolean).join(' ')}
              style={slideThumbStyle(itemIndex, slideDrag)}
              onPointerDown={(event) => {
                if (playing || event.button !== 0 || slideDragToken.current !== 0) return
                const from = itemIndex
                const startY = event.clientY
                let moved = false
                let dest = from
                let dy = 0
                const node = event.currentTarget
                const film = node.parentElement
                const gap = film ? Number.parseFloat(getComputedStyle(film).rowGap) || 0 : 0
                const slot = node.getBoundingClientRect().height + gap
                const mids = [...(film?.querySelectorAll<HTMLElement>(':scope > .thumb') ?? [])].map((thumb) => {
                  const box = thumb.getBoundingClientRect()
                  return box.top + box.height / 2
                })
                node.setPointerCapture(event.pointerId)
                const move = (pointer: PointerEvent) => {
                  dy = pointer.clientY - startY
                  if (!moved && Math.abs(dy) < 6) return
                  moved = true
                  node.style.transform = `translateY(${dy}px)`
                  let next = 0
                  for (let i = 0; i < mids.length; i += 1) {
                    if (i === from) continue
                    if (pointer.clientY > mids[i]) next += 1
                  }
                  dest = Math.max(0, Math.min(mids.length - 1, next))
                  setSlideDrag((prev) => {
                    if (prev?.phase === 'settle') return prev
                    if (prev && prev.from === from && prev.to === dest && prev.slot === slot) return prev
                    return { from, to: dest, dy: 0, slot, phase: 'drag' }
                  })
                }
                const up = () => {
                  node.removeEventListener('pointermove', move)
                  node.removeEventListener('pointerup', up)
                  if (!moved) return
                  skipSlideClick.current = true
                  window.setTimeout(() => {
                    skipSlideClick.current = false
                  }, 0)
                  const target = (dest - from) * slot
                  const token = ++slideDragToken.current
                  const finish = () => {
                    if (slideDragToken.current !== token) return
                    slideDragToken.current = 0
                    node.style.transform = ''
                    setSlideDrag(null)
                    if (dest === from) return
                    commit(moveSlide(live.current, from, dest))
                    setPlaying(false)
                    setSlideIndex(dest)
                    setSelectedIds([])
                  }
                  if (Math.abs(dy - target) < 1 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                    finish()
                    return
                  }
                  setSlideDrag({ from, to: dest, dy, slot, phase: 'settle' })
                  const onEnd = (pointer: TransitionEvent) => {
                    if (pointer.propertyName !== 'transform') return
                    node.removeEventListener('transitionend', onEnd)
                    finish()
                  }
                  node.addEventListener('transitionend', onEnd)
                  window.setTimeout(() => {
                    node.removeEventListener('transitionend', onEnd)
                    finish()
                  }, 380)
                  window.requestAnimationFrame(() => {
                    window.requestAnimationFrame(() => {
                      if (slideDragToken.current !== token) return
                      setSlideDrag({ from, to: dest, dy: target, slot, phase: 'settle' })
                    })
                  })
                }
                node.addEventListener('pointermove', move)
                node.addEventListener('pointerup', up)
              }}
              onClick={() => {
                if (skipSlideClick.current) return
                setPlaying(false)
                setSlideIndex(itemIndex)
                setSelectedIds([])
              }}
            >
              <span className="thumb-frame" aria-hidden="true">
                <span style={{ transform: `scale(${132 / doc.width})`, transformOrigin: 'top left', display: 'block' }}>
                  <SceneView width={doc.width} height={doc.height} background={doc.background} objects={item.objects} selectedIds={[]} interactive={false} />
                </span>
              </span>
              <em>{itemIndex + 1}. {item.name}</em>
            </button>
          ))}
          <button type="button" className="add-slide" onClick={() => { commit(addSlide(doc, index)); setSlideIndex(index + 1) }}>
            Blank slide
          </button>
        </aside>
        <main className="canvas" data-playing={playing ? 'true' : 'false'}>
          <div className="stage-scale" ref={setSlot}>
            <div
              ref={stageRef}
              style={{ width: doc.width, height: doc.height, transform: `scale(${scaleX}, ${scaleY})`, transformOrigin: 'top left' }}
              onPointerDown={(event) => {
                if (playing || event.button !== 0) return
                const start = stagePoint(event)
                const keep = event.shiftKey ? selectedIds : []
                let dragged = false
                const move = (pointer: PointerEvent) => {
                  const point = stagePoint(pointer)
                  const dx = point.x - start.x
                  const dy = point.y - start.y
                  if (!dragged && Math.hypot(dx, dy) < 4) return
                  dragged = true
                  const box = {
                    x: Math.min(start.x, point.x),
                    y: Math.min(start.y, point.y),
                    w: Math.abs(point.x - start.x),
                    h: Math.abs(point.y - start.y),
                  }
                  setMarquee(box)
                  setEditingId(null)
                  setSelectedIds(marqueeTargets(live.current.slides[index].objects, box, keep))
                }
                const up = () => {
                  window.removeEventListener('pointermove', move)
                  window.removeEventListener('pointerup', up)
                  setMarquee(null)
                  if (!dragged && !event.shiftKey) {
                    setSelectedIds([])
                    setEditingId(null)
                  }
                }
                window.addEventListener('pointermove', move)
                window.addEventListener('pointerup', up)
              }}
            >
              <SceneView
                width={doc.width}
                height={doc.height}
                background={doc.background}
                objects={shownObjects}
                selectedIds={playing ? [] : selectedIds}
                interactive={!playing}
                editingId={editingId}
                testId="stage"
                guides={guides}
                connectIds={connectIds}
                onPointerDownObject={onPointerDownObject}
                onDoubleClickObject={(event, id) => {
                  const object = slide.objects.find((item) => item.id === id)
                  if (object?.type === 'arrow') {
                    event.stopPropagation()
                    const spot = stagePoint(event)
                    patchSlide(
                      slide.objects.map((item) => (item.id === id ? withPath(item, insertPoint(pathOf(item), spot.x, spot.y)) : item)),
                      true,
                    )
                    return
                  }
                  gestureStart.current = live.current
                  setSelectedIds([id])
                  setEditingId(id)
                }}
                onChangeText={(id, text) => {
                  replace(withObjects(live.current, index, live.current.slides[index].objects.map((object) => (object.id === id ? { ...object, text } : object))))
                }}
                onStopEdit={() => {
                  endHistory()
                  setEditingId(null)
                }}
                onHandleDown={onHandleDown}
              />
              {marquee && (
                <div className="marquee" data-testid="marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />
              )}
            </div>
          </div>
        </main>
        <aside className="inspector">
          {selected.length === 0 ? (
          <>
          <label className="field">
            <span>Slide name</span>
            <input
              value={slide.name}
              onChange={(event) =>
                commit({
                  ...doc,
                  slides: doc.slides.map((item, itemIndex) => (itemIndex === index ? { ...item, name: event.target.value } : item)),
                })
              }
            />
          </label>
          <h2>Magic Move to next slide</h2>
          <p className="hint">Cards with the same identity glide. Duplicate a slide before you move one. New cards dissolve in, missing cards dissolve out.</p>
          <TransitionFields
            transition={slide.transition}
            disabled={index === doc.slides.length - 1}
            onChange={(transition) =>
              commit({
                ...doc,
                slides: doc.slides.map((item, itemIndex) => (itemIndex === index ? { ...item, transition } : item)),
              })
            }
          />
          <label className="field">
            <span>Hold before move</span>
            <input
              type="number"
              min={0}
              max={4}
              step={0.05}
              value={slide.transition.delay}
              onChange={(event) =>
                commit({
                  ...doc,
                  slides: doc.slides.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, transition: { ...item.transition, delay: Number(event.target.value) } } : item,
                  ),
                })
              }
            />
          </label>
          <label className="check">
            <input type="checkbox" checked={loop} onChange={(event) => setLoop(event.target.checked)} />
            Loop playback
          </label>
          <label className="field">
            <span>Export quality</span>
            <select data-testid="export-scale" value={String(gifScale)} onChange={(event) => setGifScale(Number(event.target.value))}>
              <option value="3">Max · {doc.width * 3}×{doc.height * 3}</option>
              <option value="2">High · {doc.width * 2}×{doc.height * 2}</option>
              <option value="1">Full · {doc.width}×{doc.height}</option>
              <option value="0.5">Half · {Math.round(doc.width / 2)}×{Math.round(doc.height / 2)}</option>
            </select>
          </label>
          <p className="hint">GIF and MP4 are exported at 50 frames a second. That is the fastest a GIF can play.</p>
          <label className="field">
            <span>Canvas</span>
            <input type="color" value={toHex(doc.background)} onChange={(event) => commit({ ...doc, background: event.target.value })} />
          </label>
          <p className="hint">{totalSeconds(doc).toFixed(1)}s · {segments(doc).length} beats</p>
          <h2>File</h2>
          <div className="row">
            <button type="button" onClick={() => void saveFile()}>Save</button>
            <button type="button" onClick={() => fileRef.current?.click()}>Open</button>
            <button
              type="button"
              onClick={() => {
                commit(blankDoc())
                setSlideIndex(0)
                setSelectedIds([])
              }}
            >
              New
            </button>
            <button
              type="button"
              data-testid="load-example"
              onClick={() => {
                commit(exampleDoc())
                setSlideIndex(0)
                setSelectedIds([])
                setStatus('Example loaded. Press Play.')
              }}
            >
              Example
            </button>
            <button type="button" disabled={doc.slides.length < 2} onClick={() => { commit(deleteSlide(doc, index)); setSlideIndex(Math.max(0, index - 1)) }}>
              Delete slide
            </button>
          </div>
          </>
          ) : (
          <>
          {single && (
            <>
              <h2>{single.type === 'arrow' ? 'Arrow' : 'Card'}</h2>
              <ShapeStyle object={single} onChange={updateSelected} />
              <label className="field">
                <span>Text</span>
                <input value={single.text} onChange={(event) => updateSelected({ text: event.target.value })} />
              </label>
              {single.type !== 'arrow' && (
                <>
                  <div className="grid">
                    <Num label="X" value={single.x} onChange={(x) => updateSelected({ x })} />
                    <Num label="Y" value={single.y} onChange={(y) => updateSelected({ y })} />
                    <Num label="W" value={single.w} onChange={(w) => updateSelected({ w: Math.max(28, w) })} />
                    <Num label="H" value={single.h} onChange={(h) => updateSelected({ h: Math.max(28, h) })} />
                  </div>
                  <Num label="Rotation" value={single.rotation} onChange={(rotation) => updateSelected({ rotation })} />
                  <Num label="Type size" value={single.fontSize} onChange={(fontSize) => updateSelected({ fontSize })} />
                  <label className="check">
                    <input type="checkbox" checked={single.shadow} onChange={(event) => updateSelected({ shadow: event.target.checked })} />
                    Shadow
                  </label>
                  <label className="field">
                    <span>Text align</span>
                    <select value={single.textVAlign} onChange={(event) => updateSelected({ textVAlign: event.target.value as 'center' | 'top' })}>
                      <option value="center">Center</option>
                      <option value="top">Top</option>
                    </select>
                  </label>
                </>
              )}
              <label className="field">
                <span>Text color</span>
                <input type="color" value={toHex(single.textColor)} onChange={(event) => updateSelected({ textColor: event.target.value })} />
              </label>
              {single.type === 'arrow' && (
                <>
                  <label className="field">
                    <span>Light {Math.round(single.light * 100)}%</span>
                    <input
                      data-testid="arrow-light"
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={single.light}
                      onChange={(event) => updateSelected({ light: Number(event.target.value) })}
                    />
                  </label>
                  <p className="hint">Light draws the line. 0 is nothing, 100% is the full {Math.round(pathLength(pathOf(single)))}px. Duplicate the slide and change Light to grow it. Drag an end onto a card and it stays attached.</p>
                  <button
                    type="button"
                    disabled={pathPoint === null || pathOf(single).length <= 2}
                    onClick={() => {
                      if (pathPoint === null) return
                      const points = pathOf(single).filter((_, pointIndex) => pointIndex !== pathPoint)
                      patchSlide(
                        slide.objects.map((object) => (object.id === single.id ? withPath(object, points) : object)),
                        true,
                      )
                      setPathPoint(null)
                    }}
                  >
                    Remove point
                  </button>
                </>
              )}
              <label className="field">
                <span>Opacity</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={single.opacity}
                  onChange={(event) => updateSelected({ opacity: Number(event.target.value) })}
                />
              </label>
            </>
          )}
          {selected.length > 1 && <p className="hint">{selected.length} objects selected. Drag one and the rest follow. Group keeps them together after you click away.</p>}
          {selected.length > 1 && (
            <div className="row">
              {(['left', 'center', 'right', 'top', 'middle', 'bottom'] as const).map((mode) => (
                <button key={mode} type="button" onClick={() => patchSlide(alignObjects(slide.objects, selectedIds, mode), true)}>
                  {mode}
                </button>
              ))}
              <button type="button" onClick={() => patchSlide(distributeObjects(slide.objects, selectedIds, 'h'), true)}>distribute H</button>
              <button type="button" onClick={() => patchSlide(distributeObjects(slide.objects, selectedIds, 'v'), true)}>distribute V</button>
            </div>
          )}
          {selected.length > 0 && (
            <>
              <p className="style-label">Layers</p>
              <div className="style-picks">
                <button type="button" aria-label="Send to back" onClick={() => patchSlide(orderObjects(slide.objects, selectedIds, 'back'), true)}>
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 19 H20 M12 4 V14 M8 11 L12 15 L16 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <button type="button" aria-label="Send backward" onClick={() => patchSlide(orderObjects(slide.objects, selectedIds, 'backward'), true)}>
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 5 V17 M7 13 L12 18 L17 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <button type="button" aria-label="Bring forward" onClick={() => patchSlide(orderObjects(slide.objects, selectedIds, 'forward'), true)}>
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 19 V7 M7 11 L12 6 L17 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <button type="button" aria-label="Bring to front" onClick={() => patchSlide(orderObjects(slide.objects, selectedIds, 'front'), true)}>
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 5 H20 M12 20 V10 M8 13 L12 9 L16 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              </div>
            </>
          )}
          </>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) openFile(file)
              event.target.value = ''
            }}
          />
        </aside>
      </div>
      {presenting && (
        <div
          ref={presentRef}
          className="presenter"
          data-testid="presenter"
          style={{ background: doc.background }}
          onClick={(event) => {
            if (event.target === event.currentTarget) advanceRef.current(1)
          }}
        >
          <div className="presenter-fit" style={{ width: doc.width * presentScale.x, height: doc.height * presentScale.y }}>
            <div style={{ width: doc.width, height: doc.height, transform: `scale(${presentScale.x}, ${presentScale.y})`, transformOrigin: 'top left' }}>
              <SceneView
                width={doc.width}
                height={doc.height}
                background={doc.background}
                objects={presentObjects ?? slide.objects}
                selectedIds={[]}
                interactive={false}
                testId="present-stage"
              />
            </div>
          </div>
          <p className="presenter-count">
            {index + 1} / {doc.slides.length}
            <span>arrows move between slides</span>
          </p>
        </div>
      )}
      <footer className="status">{status} · Present is fullscreen · arrows change slides · Ctrl+D duplicates cards</footer>
    </div>
  )
}

const STROKE_COLORS = ['#f8f9fa', '#ff8787', '#69db7c', '#4dabf7', '#ffa94d', '#ffd43b', '#ced4da']
const FILL_COLORS = ['transparent', '#2b2d42', '#5c2b2b', '#1e3d2f', '#1c314d', '#4a3520']

function ShapeStyle({ object, onChange }: { object: SceneObject; onChange: (patch: Partial<SceneObject>) => void }) {
  const widths = object.type === 'label' ? [0, 1, 2, 4] : [1, 2, 4]
  const width = object.strokeWidth < 0.5 ? 0 : [1, 2, 4].reduce((best, item) => (Math.abs(item - object.strokeWidth) < Math.abs(best - object.strokeWidth) ? item : best), 1)
  const rough = object.roughness >= 1.5 ? 2 : object.roughness >= 0.5 ? 1 : 0
  const kind = object.strokeStyle === 'dashed' || object.strokeStyle === 'dotted' ? object.strokeStyle : 'solid'
  const round = object.radius > 0
  return (
    <div className="shape-style">
      <p className="style-label">Stroke</p>
      <div className="swatches">
        {STROKE_COLORS.map((color) => (
          <button key={color} type="button" className={object.stroke.toLowerCase() === color ? 'swatch is-on' : 'swatch'} style={{ background: color }} aria-label={`Stroke ${color}`} onClick={() => onChange({ stroke: color })} />
        ))}
      </div>
      {object.type !== 'arrow' && (
        <>
          <p className="style-label">Background</p>
          <div className="swatches">
            {FILL_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={object.fill === color ? 'swatch is-on' : 'swatch'}
                style={{ background: color === 'transparent' ? 'repeating-conic-gradient(#3a3632 0% 25%, #171512 0% 50%) 0 0 / 8px 8px' : color }}
                aria-label={`Background ${color}`}
                onClick={() => onChange({ fill: color })}
              />
            ))}
          </div>
        </>
      )}
      <p className="style-label">Stroke width</p>
      <div className="style-picks" data-testid="stroke-width">
        {widths.map((item) => (
          <button key={item} type="button" className={width === item ? 'is-on' : ''} aria-label={item === 0 ? 'No border' : `Stroke width ${item}`} onClick={() => onChange({ strokeWidth: item })}>
            {item === 0 ? (
              <svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true">
                <circle cx="9" cy="9" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
                <path d="M5 13 L13 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            ) : (
              <i style={{ height: item, width: 16, display: 'block', background: 'currentColor', borderRadius: 99 }} />
            )}
          </button>
        ))}
      </div>
      <p className="style-label">Stroke style</p>
      <div className="style-picks">
        {(['solid', 'dashed', 'dotted'] as const).map((item) => (
          <button key={item} type="button" className={kind === item ? 'is-on' : ''} aria-label={`Stroke ${item}`} onClick={() => onChange({ strokeStyle: item })}>
            <i className={`dash dash-${item}`} />
          </button>
        ))}
      </div>
      <p className="style-label">Sloppiness</p>
      <div className="style-picks">
        {[0, 1, 2].map((item) => (
          <button key={item} type="button" className={rough === item ? 'is-on' : ''} aria-label={`Sloppiness ${item}`} onClick={() => onChange({ roughness: item })}>
            <svg viewBox="0 0 24 10" width="22" height="10" aria-hidden="true">
              <path d={item === 0 ? 'M1 5 H23' : item === 1 ? 'M1 6 Q6 2 12 5 T23 4' : 'M1 7 Q4 1 8 6 T16 3 T23 6'} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        ))}
      </div>
      {object.type !== 'arrow' && (
        <>
          <p className="style-label">Edges</p>
          <div className="style-picks">
            <button type="button" className={round ? '' : 'is-on'} aria-label="Sharp edges" onClick={() => onChange({ radius: 0 })}>
              <i className="edge edge-sharp" />
            </button>
            <button type="button" className={round ? 'is-on' : ''} aria-label="Round edges" onClick={() => onChange({ radius: object.radius > 0 ? object.radius : 10 })}>
              <i className="edge edge-round" />
            </button>
          </div>
          {round && (
            <label className="field">
              <span>Round {Math.round(object.radius)}</span>
              <input
                data-testid="round-edge"
                type="range"
                min={1}
                max={Math.max(8, Math.round(Math.min(object.w, object.h) / 2))}
                step={1}
                value={Math.max(1, Math.min(object.radius, Math.min(object.w, object.h) / 2))}
                onChange={(event) => onChange({ radius: Number(event.target.value) })}
              />
            </label>
          )}
        </>
      )}
    </div>
  )
}

function TransitionFields({
  transition,
  disabled,
  onChange,
}: {
  transition: Transition
  disabled: boolean
  onChange: (transition: Transition) => void
}) {
  return (
    <>
      <label className="field">
        <span>Duration</span>
        <input
          data-testid="duration"
          type="number"
          min={0.05}
          max={4}
          step={0.05}
          disabled={disabled}
          value={transition.duration}
          onChange={(event) => onChange({ ...transition, duration: Number(event.target.value) })}
        />
      </label>
      <label className="field">
        <span>Acceleration</span>
        <select
          data-testid="ease"
          disabled={disabled}
          value={transition.ease}
          onChange={(event) => onChange({ ...transition, ease: event.target.value as EaseName })}
        >
          <option value="easeInOut">Ease In & Ease Out</option>
          <option value="easeIn">Ease In</option>
          <option value="easeOut">Ease Out</option>
          <option value="none">None</option>
        </select>
      </label>
      <label className="check">
        <input
          type="checkbox"
          disabled={disabled}
          checked={transition.fadeUnmatched}
          onChange={(event) => onChange({ ...transition, fadeUnmatched: event.target.checked })}
        />
        Fade unmatched objects
      </label>
      <EasePreview ease={transition.ease} />
    </>
  )
}

function EasePreview({ ease }: { ease: EaseName }) {
  const curve = ease === 'none' ? 'linear' : ease === 'easeIn' ? 'cubic-bezier(0.22, 1, 0.36, 1)' : ease === 'easeOut' ? 'cubic-bezier(0.55, 0, 1, 0.45)' : 'cubic-bezier(0.65, 0, 0.35, 1)'
  return (
    <div className="ease">
      <i style={{ animationTimingFunction: curve }} />
    </div>
  )
}

function Num({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" value={Math.round(value * 10) / 10} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  )
}

function toHex(color: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color
  return '#1c1915'
}
