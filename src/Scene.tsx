import { useEffect, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { arrowHeadPath, dashOf, outlinePoints, pathOf, restPath, roughen, smoothSamples, toSvgPath, trimPath } from './path'
import type { Guide, Handle, SceneObject } from './types'

const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

function ArrowShape({ object, interactive, showHidden, zIndex, onPointerDownObject, onDoubleClickObject }: {
  object: SceneObject
  interactive: boolean
  showHidden: boolean
  zIndex: number
  onPointerDownObject?: (event: ReactPointerEvent, id: string) => void
  onDoubleClickObject?: (event: ReactMouseEvent, id: string) => void
}) {
  const seed = object.id.split('').reduce((sum, char) => sum + char.charCodeAt(0), 1)
  const drawn = roughen(trimPath(pathOf(object), object.light), object.roughness ?? 0, seed)
  const hidden = restPath(pathOf(object), object.light)
  const width = object.strokeWidth || 1.5
  const dash = dashOf(object.strokeStyle, width)
  const fullLine = toSvgPath(smoothSamples(pathOf(object)))
  const line = toSvgPath(drawn)
  const hiddenLine = toSvgPath(hidden)
  const show = drawn.length >= 2
  return (
    <svg key={object.id} className="arrow" data-object-id={object.id} style={{ opacity: object.opacity, zIndex }}>
      <path
        d={fullLine}
        stroke={object.stroke}
        strokeWidth={Math.max(width, 14)}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        className="arrow-hit"
        onPointerDown={interactive ? (event) => onPointerDownObject?.(event, object.id) : undefined}
        onDoubleClick={interactive ? (event) => onDoubleClickObject?.(event, object.id) : undefined}
      />
      {showHidden && hidden.length >= 2 && (
        <path className="arrow-rest" d={hiddenLine} stroke={object.stroke} strokeWidth={Math.max(1, width * 0.35)} strokeDasharray="5 6" fill="none" opacity={0.35} />
      )}
      {show && <path className="arrow-line" d={line} stroke={object.stroke} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash || undefined} fill="none" />}
      {show && (
        <path className="arrow-head" d={arrowHeadPath(drawn, width)} stroke={object.stroke} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      )}
    </svg>
  )
}

export function SceneView({
  width,
  height,
  background,
  objects,
  selectedIds,
  interactive,
  editingId,
  testId,
  guides,
  connectIds,
  onPointerDownObject,
  onDoubleClickObject,
  onChangeText,
  onStopEdit,
  onHandleDown,
}: {
  width: number
  height: number
  background: string
  objects: SceneObject[]
  selectedIds: string[]
  interactive: boolean
  editingId?: string | null
  testId?: string
  guides?: Guide[]
  connectIds?: string[]
  onPointerDownObject?: (event: ReactPointerEvent, id: string) => void
  onDoubleClickObject?: (event: ReactMouseEvent, id: string) => void
  onChangeText?: (id: string, text: string) => void
  onStopEdit?: () => void
  onHandleDown?: (event: ReactPointerEvent, id: string, handle: Handle | 'rotate' | number) => void
}) {
  const selected = new Set(selectedIds)
  const connected = new Set(connectIds ?? [])
  return (
    <div
      className="stage"
      data-testid={testId}
      style={{
        width,
        height,
        backgroundColor: background,
        backgroundImage: 'linear-gradient(rgba(233,236,239,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(233,236,239,0.08) 1px, transparent 1px)',
        backgroundSize: '20px 20px',
      }}
    >
      {objects.map((object, index) => {
        const isSelected = selected.has(object.id)
        const zIndex = index + 1
        if (object.type === 'arrow') {
          return (
            <ArrowShape
              key={object.id}
              object={object}
              interactive={interactive}
              showHidden={interactive}
              zIndex={zIndex}
              onPointerDownObject={onPointerDownObject}
              onDoubleClickObject={onDoubleClickObject}
            />
          )
        }
        const editing = editingId === object.id
        const rough = (object.roughness ?? 0) >= 0.5
        const seed = object.id.split('').reduce((sum, char) => sum + char.charCodeAt(0), 3)
        const outline = toSvgPath(roughen(outlinePoints(object.w, object.h, object.radius), object.roughness ?? 0, seed))
        const kind = object.strokeStyle === 'dashed' ? 'dashed' : object.strokeStyle === 'dotted' ? 'dotted' : 'solid'
        return (
          <div
            key={object.id}
            data-object-id={object.id}
            className={['obj', object.type === 'label' ? 'is-label' : '', isSelected ? 'is-selected' : '', connected.has(object.id) ? 'is-connect' : ''].filter(Boolean).join(' ')}
            style={{
              left: object.x,
              top: object.y,
              width: object.w,
              height: object.h,
              transform: `rotate(${object.rotation}deg)`,
              opacity: object.opacity,
              background: object.fill === 'transparent' ? 'transparent' : object.fill,
              color: object.textColor,
              borderRadius: object.radius,
              border: !rough && object.strokeWidth > 0 ? `${object.strokeWidth}px ${kind} ${object.stroke}` : 'none',
              boxShadow: object.shadow ? '0 10px 22px rgba(40, 32, 22, 0.12)' : 'none',
              fontSize: object.fontSize,
              fontFamily: 'Virgil, system-ui, sans-serif',
              alignItems: object.textVAlign === 'top' ? 'flex-start' : 'center',
              paddingTop: object.textVAlign === 'top' ? 16 : 0,
              zIndex,
              cursor: object.locked ? 'default' : 'grab',
            }}
            onPointerDown={interactive ? (event) => onPointerDownObject?.(event, object.id) : undefined}
            onDoubleClick={interactive ? (event) => onDoubleClickObject?.(event, object.id) : undefined}
          >
            {rough && object.strokeWidth > 0 && (
              <svg className="obj-stroke" viewBox={`0 0 ${object.w} ${object.h}`} width={object.w} height={object.h}>
                <path d={outline} stroke={object.stroke} strokeWidth={object.strokeWidth} strokeDasharray={dashOf(kind, object.strokeWidth) || undefined} strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
            )}
            {editing ? (
              <input
                className="obj-edit"
                value={object.text}
                autoFocus
                onChange={(event) => onChangeText?.(object.id, event.target.value)}
                onPointerDown={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  event.stopPropagation()
                  if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur()
                }}
                onBlur={() => onStopEdit?.()}
              />
            ) : (
              <span>{object.text}</span>
            )}
            {interactive && isSelected && !object.locked && selectedIds.length === 1 && (
              <>
                {HANDLES.map((handle) => (
                  <i
                    key={handle}
                    className={`handle handle-${handle}`}
                    onPointerDown={(event) => {
                      event.stopPropagation()
                      onHandleDown?.(event, object.id, handle)
                    }}
                  />
                ))}
                <i
                  className="handle handle-rotate"
                  onPointerDown={(event) => {
                    event.stopPropagation()
                    onHandleDown?.(event, object.id, 'rotate')
                  }}
                />
              </>
            )}
          </div>
        )
      })}
      {interactive &&
        objects
          .filter((object) => object.type === 'arrow' && selected.has(object.id) && !object.locked)
          .map((object) => (
            <div key={`${object.id}-ends`}>
              {pathOf(object).map((point, index, points) => {
                const tip = index === 0 || index === points.length - 1
                const size = tip ? 12 : 8
                return (
                <i
                  key={`${object.id}-${index}`}
                  className={tip ? 'handle handle-end' : 'handle handle-end handle-end-mid'}
                  style={{ left: point.x - size / 2, top: point.y - size / 2 }}
                  onPointerDown={(event) => {
                    event.stopPropagation()
                    onHandleDown?.(event, object.id, index)
                  }}
                />
                )
              })}
            </div>
          ))}
      {(guides ?? []).map((guide) => (
        <i
          key={`${guide.axis}-${guide.at}`}
          className={guide.axis === 'v' ? 'guide guide-v' : 'guide guide-h'}
          style={guide.axis === 'v' ? { left: guide.at } : { top: guide.at }}
        />
      ))}
    </div>
  )
}

export function useFitScale(width: number, height: number) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const [scale, setScale] = useState({ x: 1, y: 1 })
  useEffect(() => {
    if (!slot || width <= 0 || height <= 0) return
    const measure = () => {
      const nextX = slot.clientWidth / width
      const nextY = slot.clientHeight / height
      if (!(nextX > 0) || !(nextY > 0)) return
      setScale((current) => {
        const driftX = Math.abs(current.x * width - slot.clientWidth)
        const driftY = Math.abs(current.y * height - slot.clientHeight)
        return driftX > 0.5 || driftY > 0.5 ? { x: nextX, y: nextY } : current
      })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(slot)
    return () => observer.disconnect()
  }, [slot, width, height])
  return { setSlot, scaleX: scale.x, scaleY: scale.y }
}
