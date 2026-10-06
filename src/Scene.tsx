import { useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { Guide, Handle, SceneObject } from './types'

const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

function arrowPoints(object: SceneObject): string {
  const angle = Math.atan2(object.y2 - object.y, object.x2 - object.x)
  const length = Math.max(10, (object.strokeWidth || 3) * 4)
  const x = object.x2
  const y = object.y2
  const a = [x - length * Math.cos(angle - Math.PI / 7), y - length * Math.sin(angle - Math.PI / 7)]
  const b = [x - length * Math.cos(angle + Math.PI / 7), y - length * Math.sin(angle + Math.PI / 7)]
  return `${x},${y} ${a[0]},${a[1]} ${b[0]},${b[1]}`
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
  onPointerDownObject?: (event: ReactPointerEvent, id: string) => void
  onDoubleClickObject?: (id: string) => void
  onChangeText?: (id: string, text: string) => void
  onStopEdit?: () => void
  onHandleDown?: (event: ReactPointerEvent, id: string, handle: Handle | 'rotate' | 'start' | 'end') => void
}) {
  const selected = new Set(selectedIds)
  return (
    <div className="stage" data-testid={testId} style={{ width, height, background }}>
      {objects.map((object) => {
        const isSelected = selected.has(object.id)
        if (object.type === 'arrow') {
          return (
            <svg key={object.id} className="arrow" data-object-id={object.id} style={{ opacity: object.opacity }}>
              <line
                x1={object.x}
                y1={object.y}
                x2={object.x2}
                y2={object.y2}
                stroke={object.stroke}
                strokeWidth={Math.max(object.strokeWidth, 10)}
                strokeLinecap="round"
                className="arrow-hit"
                onPointerDown={interactive ? (event) => onPointerDownObject?.(event, object.id) : undefined}
              />
              <line
                x1={object.x}
                y1={object.y}
                x2={object.x2}
                y2={object.y2}
                stroke={object.stroke}
                strokeWidth={object.strokeWidth || 3}
                strokeLinecap="round"
              />
              <polygon points={arrowPoints(object)} fill={object.stroke} />
            </svg>
          )
        }
        const editing = editingId === object.id
        return (
          <div
            key={object.id}
            data-object-id={object.id}
            className={isSelected ? 'obj is-selected' : 'obj'}
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
              border: object.strokeWidth > 0 ? `${object.strokeWidth}px solid ${object.stroke}` : 'none',
              boxShadow: object.shadow ? '0 10px 22px rgba(40, 32, 22, 0.12)' : 'none',
              fontSize: object.fontSize,
              fontFamily: object.font === 'mono' ? 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' : 'system-ui, sans-serif',
              alignItems: object.textVAlign === 'top' ? 'flex-start' : 'center',
              paddingTop: object.textVAlign === 'top' ? 16 : 0,
              zIndex: isSelected ? 4 : 1,
              cursor: object.locked ? 'default' : 'grab',
            }}
            onPointerDown={interactive ? (event) => onPointerDownObject?.(event, object.id) : undefined}
            onDoubleClick={interactive ? () => onDoubleClickObject?.(object.id) : undefined}
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
              {(['start', 'end'] as const).map((end) => (
                <i
                  key={end}
                  className="handle handle-end"
                  style={{ left: (end === 'start' ? object.x : object.x2) - 6, top: (end === 'start' ? object.y : object.y2) - 6 }}
                  onPointerDown={(event) => {
                    event.stopPropagation()
                    onHandleDown?.(event, object.id, end)
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
  const [scale, setScale] = useState(1)
  useEffect(() => {
    if (!slot) return
    const measure = () => {
      const next = Math.max(0.25, Math.min(1, (slot.clientWidth - 40) / width, (slot.clientHeight - 40) / height))
      setScale((current) => (Math.abs(current - next) > 0.005 ? next : current))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(slot)
    return () => observer.disconnect()
  }, [slot, width, height])
  return { setSlot, scale }
}
