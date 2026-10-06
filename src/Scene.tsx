import { useEffect, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { arrowHeadPoints, pathOf, smoothSamples, toSvgPath, trimPath } from './path'
import type { Guide, Handle, SceneObject } from './types'

const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

function ArrowShape({ object, interactive, selected, onPointerDownObject, onDoubleClickObject }: {
  object: SceneObject
  interactive: boolean
  selected: boolean
  onPointerDownObject?: (event: ReactPointerEvent, id: string) => void
  onDoubleClickObject?: (event: ReactMouseEvent, id: string) => void
}) {
  const full = smoothSamples(pathOf(object))
  const drawn = trimPath(pathOf(object), object.light)
  const width = object.strokeWidth || 3
  const fullLine = toSvgPath(full)
  const line = toSvgPath(drawn)
  const show = drawn.length >= 2
  return (
    <svg key={object.id} className="arrow" data-object-id={object.id} style={{ opacity: object.opacity, zIndex: selected ? 5 : 2 }}>
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
      {selected && object.light < 0.995 && (
        <path className="arrow-rest" d={fullLine} stroke={object.stroke} strokeWidth={Math.max(1, width * 0.35)} strokeDasharray="5 6" fill="none" opacity={0.45} />
      )}
      {show && <path className="arrow-line" d={line} stroke={object.stroke} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" fill="none" />}
      {show && <polygon className="arrow-head" points={arrowHeadPoints(drawn, width)} fill={object.stroke} />}
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
    <div className="stage" data-testid={testId} style={{ width, height, background }}>
      {objects.map((object) => {
        const isSelected = selected.has(object.id)
        if (object.type === 'arrow') {
          return (
            <ArrowShape
              key={object.id}
              object={object}
              interactive={interactive}
              selected={isSelected}
              onPointerDownObject={onPointerDownObject}
              onDoubleClickObject={onDoubleClickObject}
            />
          )
        }
        const editing = editingId === object.id
        return (
          <div
            key={object.id}
            data-object-id={object.id}
            className={['obj', isSelected ? 'is-selected' : '', connected.has(object.id) ? 'is-connect' : ''].filter(Boolean).join(' ')}
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
              border: object.strokeWidth > 0 ? `${object.strokeWidth}px ${object.strokeStyle === 'dashed' ? 'dashed' : 'solid'} ${object.stroke}` : 'none',
              boxShadow: object.shadow ? '0 10px 22px rgba(40, 32, 22, 0.12)' : 'none',
              fontSize: object.fontSize,
              fontFamily: object.font === 'mono' ? 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' : 'system-ui, sans-serif',
              alignItems: object.textVAlign === 'top' ? 'flex-start' : 'center',
              paddingTop: object.textVAlign === 'top' ? 16 : 0,
              zIndex: isSelected ? 4 : 1,
              cursor: object.locked ? 'default' : 'grab',
            }}
            onPointerDown={interactive ? (event) => onPointerDownObject?.(event, object.id) : undefined}
            onDoubleClick={interactive ? (event) => onDoubleClickObject?.(event, object.id) : undefined}
          >
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
              {pathOf(object).map((point, index) => (
                <i
                  key={`${object.id}-${index}`}
                  className="handle handle-end"
                  style={{ left: point.x - 6, top: point.y - 6 }}
                  onPointerDown={(event) => {
                    event.stopPropagation()
                    onHandleDown?.(event, object.id, index)
                  }}
                />
              ))}
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
