import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  addArrow,
  addCard,
  addLabel,
  addSlide,
  alignObjects,
  blankDoc,
  deleteSlide,
  distributeObjects,
  duplicateObjects,
  duplicateSlide,
  isDoc,
  normalize,
  orderObjects,
  resized,
  snapMove,
  translateObject,
  withObjects,
} from './doc'
import { encodeGif } from './exportGif'
import { exampleDoc } from './example'
import { frameBetween, sampleAt, segments, totalSeconds } from './magic'
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
  | { kind: 'rotate'; id: string; start: SceneObject; angle: number }
  | { kind: 'end'; id: string; start: SceneObject; which: 'start' | 'end' }

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
  const [editingId, setEditingId] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [loop, setLoop] = useState(true)
  const [preview, setPreview] = useState<{ objects: SceneObject[]; label: string; slideIndex: number } | null>(null)
  const [exporting, setExporting] = useState(false)
  const [gifScale, setGifScale] = useState(0.5)
  const [guides, setGuides] = useState<Guide[]>([])
  const [presenting, setPresenting] = useState(false)
  const [presentObjects, setPresentObjects] = useState<SceneObject[] | null>(null)
  const [presentScale, setPresentScale] = useState(1)
  const [status, setStatus] = useState('Duplicate a slide, move the same cards, then Play.')
  const live = useRef(doc)
  const presentingRef = useRef(false)
  const advancingRef = useRef(false)
  const advanceFrame = useRef(0)
  const presentRef = useRef<HTMLDivElement>(null)
  const advanceRef = useRef<(direction: 1 | -1) => void>(() => {})
  const gestureStart = useRef<Doc | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  presentingRef.current = presenting
  const { setSlot, scale } = useFitScale(doc.width, doc.height)
  live.current = doc
  const index = Math.min(slideIndex, doc.slides.length - 1)
  const slide = doc.slides[index]

  useEffect(() => {
    const id = window.setTimeout(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(doc)), 250)
    return () => window.clearTimeout(id)
  }, [doc])

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
    const next = withObjects(live.current, index, objects)
    if (record) commit(next)
    else replace(next)
  }

  function updateSelected(patch: Partial<SceneObject>) {
    const ids = new Set(selectedIds)
    patchSlide(
      slide.objects.map((object) => (ids.has(object.id) ? { ...object, ...patch } : object)),
      true,
    )
  }

  function selectObject(id: string, shift: boolean) {
    const object = slide.objects.find((item) => item.id === id)
    if (!object) return
    const group = object.groupId ? slide.objects.filter((item) => item.groupId === object.groupId).map((item) => item.id) : [id]
    setEditingId(null)
    setSelectedIds((current) => {
      if (!shift) return group
      const next = new Set(current)
      const allOn = group.every((item) => next.has(item))
      group.forEach((item) => (allOn ? next.delete(item) : next.add(item)))
      return [...next]
    })
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
      const next = Math.min((window.innerWidth - 64) / doc.width, (window.innerHeight - 64) / doc.height)
      setPresentScale(Math.max(0.2, next))
    }
    fit()
    let enteredFullscreen = false
    const onFullscreen = () => {
      if (document.fullscreenElement) {
        enteredFullscreen = true
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
        updateSelected({ groupId: null })
      } else if (meta && event.key.toLowerCase() === 'g' && selectedIds.length > 1) {
        event.preventDefault()
        updateSelected({ groupId: `g_${Math.random().toString(36).slice(2, 8)}` })
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        if (!selectedIds.length) return
        event.preventDefault()
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
      } else if (gesture.kind === 'end') {
        patchSlide(
          current.map((object) => {
            if (object.id !== gesture.id) return object
            return gesture.which === 'start' ? { ...gesture.start, x: point.x, y: point.y } : { ...gesture.start, x2: point.x, y2: point.y }
          }),
          false,
        )
      }
    }
    function up() {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setGuides([])
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
    selectObject(id, event.shiftKey)
    const ids = object.groupId ? slide.objects.filter((item) => item.groupId === object.groupId).map((item) => item.id) : [id]
    const moving = new Set(event.shiftKey ? [...selectedIds, ...ids] : ids)
    if (slide.objects.some((item) => moving.has(item.id) && item.locked)) return
    const point = stagePoint(event)
    const start = new Map(slide.objects.filter((item) => moving.has(item.id)).map((item) => [item.id, item]))
    track({ kind: 'move', ids: [...moving], start, x: point.x, y: point.y, moved: false })
  }

  function onHandleDown(event: ReactPointerEvent, id: string, handle: Handle | 'rotate' | 'start' | 'end') {
    if (playing) return
    const object = slide.objects.find((item) => item.id === id)
    if (!object || object.locked) return
    const point = stagePoint(event)
    if (handle === 'rotate') {
      const cx = object.x + object.w / 2
      const cy = object.y + object.h / 2
      track({ kind: 'rotate', id, start: object, angle: Math.atan2(point.y - cy, point.x - cx) })
    } else if (handle === 'start' || handle === 'end') {
      track({ kind: 'end', id, start: object, which: handle })
    } else {
      track({ kind: 'resize', id, handle, start: object, x: point.x, y: point.y })
    }
  }

  async function onExport() {
    setExporting(true)
    setStatus('Rendering GIF…')
    await new Promise((resolve) => setTimeout(resolve, 30))
    try {
      const blob = await encodeGif(doc, gifScale)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'keynot.gif'
      link.click()
      URL.revokeObjectURL(url)
      setStatus('GIF downloaded.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'GIF export failed.')
    } finally {
      setExporting(false)
    }
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
  const shownObjects = playing && preview ? preview.objects : slide.objects
  const liveSlide = playing && preview ? preview.slideIndex : index

  return (
    <div className="app">
      <header className="toolbar">
        <div className="brand">
          <strong>Keynot</strong>
          <span>Magic Move</span>
        </div>
        <button type="button" data-testid="add-card" onClick={() => { const result = addCard(doc, index); commit(result.doc); setSelectedIds([result.id]) }}>Card</button>
        <button type="button" data-testid="add-arrow" onClick={() => { const result = addArrow(doc, index); commit(result.doc); setSelectedIds([result.id]) }}>Arrow</button>
        <button type="button" onClick={() => { const result = addLabel(doc, index); commit(result.doc); setSelectedIds([result.id]) }}>Label</button>
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
          disabled={selectedIds.length < 2}
          onClick={() => updateSelected({ groupId: `g_${Math.random().toString(36).slice(2, 8)}` })}
        >
          Group
        </button>
        <button type="button" disabled={!selected.length} onClick={() => updateSelected({ groupId: null })}>Ungroup</button>
        <button type="button" disabled={!selected.length} onClick={() => updateSelected({ locked: !selected.every((object) => object.locked) })}>
          {selected.every((object) => object.locked) && selected.length ? 'Unlock' : 'Lock'}
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
        <button type="button" disabled={!past.length} onClick={undo}>Undo</button>
        <button type="button" disabled={!future.length} onClick={redo}>Redo</button>
        <button type="button" data-testid="play" className="primary" onClick={() => setPlaying((value) => !value)}>
          {playing ? 'Stop' : 'Play'}
        </button>
        <button
          type="button"
          data-testid="present"
          className="primary"
          onClick={() => {
            setPlaying(false)
            setPresenting(true)
          }}
        >
          Present
        </button>
        <button type="button" data-testid="export-gif" className="primary" disabled={exporting} onClick={onExport}>
          {exporting ? 'Exporting…' : 'Export GIF'}
        </button>
      </header>
      <div className="workspace">
        <aside className="film">
          {doc.slides.map((item, itemIndex) => (
            <button
              type="button"
              key={item.id}
              className={itemIndex === liveSlide ? 'thumb is-live' : 'thumb'}
              onClick={() => {
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
        <main className="canvas" ref={setSlot} data-playing={playing ? 'true' : 'false'}>
          <div className="stage-scale" style={{ width: doc.width * scale, height: doc.height * scale }}>
            <div
              ref={stageRef}
              style={{ width: doc.width, height: doc.height, transform: `scale(${scale})`, transformOrigin: 'top left' }}
              onPointerDown={() => {
                if (!playing) {
                  setSelectedIds([])
                  setEditingId(null)
                }
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
                onPointerDownObject={onPointerDownObject}
                onDoubleClickObject={(id) => {
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
            </div>
          </div>
        </main>
        <aside className="inspector">
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
            <span>GIF size</span>
            <select value={String(gifScale)} onChange={(event) => setGifScale(Number(event.target.value))}>
              <option value="0.5">Half</option>
              <option value="1">Full</option>
            </select>
          </label>
          <label className="field">
            <span>Canvas</span>
            <input type="color" value={toHex(doc.background)} onChange={(event) => commit({ ...doc, background: event.target.value })} />
          </label>
          <p className="hint">{totalSeconds(doc).toFixed(1)}s · {segments(doc).length} beats</p>
          {single && (
            <>
              <h2>{single.type === 'arrow' ? 'Arrow' : 'Card'}</h2>
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
                  <Num label="Corner" value={single.radius} onChange={(radius) => updateSelected({ radius })} />
                  <Num label="Type size" value={single.fontSize} onChange={(fontSize) => updateSelected({ fontSize })} />
                  <label className="field">
                    <span>Fill</span>
                    <input type="color" value={toHex(single.fill)} onChange={(event) => updateSelected({ fill: event.target.value })} />
                  </label>
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
              <label className="field">
                <span>{single.type === 'arrow' ? 'Color' : 'Border'}</span>
                <input type="color" value={toHex(single.stroke)} onChange={(event) => updateSelected({ stroke: event.target.value })} />
              </label>
              <Num label="Border width" value={single.strokeWidth} onChange={(strokeWidth) => updateSelected({ strokeWidth: Math.max(0, strokeWidth) })} />
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
          {selected.length > 1 && <p className="hint">{selected.length} objects selected. Drag moves the group together.</p>}
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
            <div className="row">
              <button type="button" onClick={() => patchSlide(orderObjects(slide.objects, selectedIds, 'back'), true)}>Back</button>
              <button type="button" onClick={() => patchSlide(orderObjects(slide.objects, selectedIds, 'backward'), true)}>Backward</button>
              <button type="button" onClick={() => patchSlide(orderObjects(slide.objects, selectedIds, 'forward'), true)}>Forward</button>
              <button type="button" onClick={() => patchSlide(orderObjects(slide.objects, selectedIds, 'front'), true)}>Front</button>
            </div>
          )}
          <h2>File</h2>
          <div className="row">
            <button
              type="button"
              onClick={() => {
                const blob = new Blob([JSON.stringify(doc)], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const link = document.createElement('a')
                link.href = url
                link.download = 'keynot.json'
                link.click()
                URL.revokeObjectURL(url)
              }}
            >
              Save
            </button>
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
          onClick={(event) => {
            if (event.target === event.currentTarget) advanceRef.current(1)
          }}
        >
          <div style={{ width: doc.width * presentScale, height: doc.height * presentScale }}>
            <div style={{ width: doc.width, height: doc.height, transform: `scale(${presentScale})`, transformOrigin: 'top left' }}>
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
