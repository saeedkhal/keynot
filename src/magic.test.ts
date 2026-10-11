import { alignObjects, baseObject, dragTargets, marqueeTargets, measureLabel, orderObjects, resized, rotateObjects, scaleObjects, settleBindings, snapMove, translateObject } from './doc'
import { arrowSketch, shapeSketch } from './sketch'
import { exampleDoc } from './example'
import { applyEase, frameBetween, parseColor, sampleAt, totalSeconds } from './magic'
import { insertPoint, pathLength, pathOf, restPath, trimPath, withPath } from './path'
import type { Slide } from './types'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

const easeMid = applyEase(0.5, 'easeInOut')
assert(Math.abs(easeMid - 0.5) < 0.001, 'ease in & out is centered')
assert(applyEase(0.5, 'easeIn') > 0.7, 'ease in arrives slowly, so halfway in time is far along')
assert(applyEase(0.5, 'easeOut') < 0.3, 'ease out leaves slowly')
assert(applyEase(0, 'none') === 0 && applyEase(1, 'none') === 1, 'linear endpoints')

const slideA: Slide = {
  id: 'a',
  name: 'A',
  transition: { duration: 1, delay: 0, ease: 'none', fadeUnmatched: true },
  objects: [
    baseObject({ id: 'card', type: 'card', x: 0, y: 0, w: 100, h: 40, fill: '#000000', opacity: 1, rotation: 350 }),
    baseObject({ id: 'gone', type: 'card', x: 10, y: 10, opacity: 1 }),
  ],
}
const slideB: Slide = {
  id: 'b',
  name: 'B',
  transition: { duration: 1, delay: 0, ease: 'none', fadeUnmatched: true },
  objects: [
    baseObject({ id: 'card', type: 'card', x: 100, y: 50, w: 140, h: 40, fill: '#ffffff', opacity: 1, rotation: 10 }),
    baseObject({ id: 'fresh', type: 'card', x: 20, y: 20, opacity: 1 }),
  ],
}

const mid = frameBetween(slideA, slideB, 0.5, slideA.transition)
const card = mid.find((object) => object.id === 'card')
assert(!!card && Math.abs(card.x - 50) < 0.01 && Math.abs(card.y - 25) < 0.01, 'position lerps')
assert(!!card && Math.abs(card.w - 120) < 0.01, 'size lerps')
assert(!!card && Math.abs((((card.rotation % 360) + 360) % 360)) < 0.01, 'rotation takes the short path')
const rgb = parseColor(card?.fill ?? '')
assert(rgb[0] === 128 && rgb[1] === 128 && rgb[2] === 128, 'fill color lerps')
const gone = mid.find((object) => object.id === 'gone')
const fresh = mid.find((object) => object.id === 'fresh')
assert(!!gone && Math.abs(gone.opacity - 0.5) < 0.01, 'removed card fades out')
assert(!!fresh && Math.abs(fresh.opacity - 0.5) < 0.01, 'new card fades in')

const cut = frameBetween(slideA, slideB, 0.5, { ...slideA.transition, fadeUnmatched: false })
assert(!cut.some((object) => object.id === 'gone'), 'without fade, the old card is already gone')
assert(cut.some((object) => object.id === 'fresh' && object.opacity === 1), 'without fade, the new card pops in')

const grown = resized(baseObject({ id: 's', type: 'card', x: 0, y: 0, w: 100, h: 40, fontSize: 20 }), 'e', 20, 0)
assert(Math.abs(grown.w - 120) < 0.01 && Math.abs(grown.x) < 0.01, 'east resize keeps the left edge')
assert(grown.fontSize === 20, 'card text stays the same size when the box grows')
const label = resized(baseObject({ id: 'l', type: 'label', text: 'Label', x: 0, y: 0, w: 100, h: 40, fontSize: 20 }), 'se', 100, 40)
const fitted = measureLabel('Label', 40, label.strokeWidth)
assert(Math.abs(label.fontSize - 40) < 0.01 && Math.abs(label.w - fitted.w) < 0.01 && Math.abs(label.h - fitted.h) < 0.01, 'label text grows and the box hugs the word')
assert(Math.abs(label.x) < 0.01 && Math.abs(label.y) < 0.01, 'resizing a label keeps the opposite corner')

const aligned = alignObjects(
  [
    baseObject({ id: 'a', type: 'card', x: 0, y: 0, w: 10, h: 10 }),
    baseObject({ id: 'b', type: 'card', x: 40, y: 5, w: 10, h: 10 }),
    baseObject({ id: 'c', type: 'label', x: 5, y: 5, w: 10, h: 10 }),
  ],
  ['a', 'b'],
  'left',
)
assert(aligned.find((object) => object.id === 'b')?.x === 0, 'align ignores objects outside the selection')
assert(aligned.find((object) => object.id === 'c')?.x === 5, 'unselected object stays put')

const example = exampleDoc()
assert(example.slides.length === 4, 'example has four beats')
assert(totalSeconds(example) > 3, 'example has hold and move time')
const opening = sampleAt(example, 0)
assert(opening.objects.some((object) => object.id === 'card-main' && object.x === 80), 'playback starts on the stack')
const moving = sampleAt(example, example.slides[0].transition.delay + example.slides[0].transition.duration / 2)
const traveling = moving.objects.find((object) => object.id === 'card-main')
assert(!!traveling && traveling.x > 80 && traveling.x < 385, 'the same card is between stack and web API')

const parked = baseObject({ id: 'parked', type: 'card', x: 100, y: 40, w: 80, h: 40 })
const dragged = baseObject({ id: 'dragged', type: 'card', x: 0, y: 0, w: 80, h: 40 })
const snapped = snapMove([dragged], [parked], 96, 0, { width: 960, height: 540 })
assert(Math.abs(snapped.dx - 100) < 0.01 && snapped.guides.some((guide) => guide.axis === 'v' && guide.at === 100), 'alignment guide snaps a card to the next card')
const free = snapMove([dragged], [parked], 40, 30, { width: 960, height: 540 })
assert(free.dx === 40 && free.dy === 30 && free.guides.length === 0, 'a far drag does not snap')

const bent = insertPoint([{ x: 0, y: 0 }, { x: 100, y: 0 }], 50, 8)
assert(bent.length === 3 && Math.abs(bent[1].x - 50) < 0.01, 'a path point can be inserted on a line')
assert(Math.abs(pathLength([{ x: 0, y: 0 }, { x: 100, y: 0 }]) - 100) < 1, 'straight path length is the distance')

const straight = [{ x: 0, y: 0 }, { x: 100, y: 0 }]
assert(trimPath(straight, 0).length === 0, 'zero light draws nothing')
const half = trimPath(straight, 0.5)
assert(half.length >= 2 && Math.abs(half[half.length - 1].x - 50) < 1, 'half light draws half the line')
assert(Math.abs((trimPath(straight, 1).at(-1)?.x ?? 0) - 100) < 0.01, 'full light draws the whole line')
const hidden = restPath(straight, 0.5)
assert(hidden.length >= 2 && Math.abs(hidden[0].x - 50) < 1 && Math.abs(hidden[hidden.length - 1].x - 100) < 1, 'the undrawn half stays available')
assert(restPath(straight, 0).length >= 2 && restPath(straight, 1).length === 0, 'zero light keeps the whole ghost and full light hides it')

const box = baseObject({ id: 'box', type: 'card', x: 200, y: 200, w: 100, h: 60 })
const arrow = withPath(
  baseObject({
    id: 'arr',
    type: 'arrow',
    light: 1,
    endBound: 'box',
    points: [
      { x: 40, y: 230 },
      { x: 250, y: 230 },
    ],
  }),
  [
    { x: 40, y: 230 },
    { x: 250, y: 230 },
  ],
)
const stuck = settleBindings([box, arrow])
const stuckArrow = stuck.find((object) => object.id === 'arr')
const stuckEnd = pathOf(stuckArrow!)
assert(!!stuckArrow && Math.abs(stuckEnd[1].x - 200) < 1 && Math.abs(stuckEnd[1].y - 230) < 1, 'arrow end connects to the card edge')
const followed = settleBindings([translateObject(box, 40, 0), stuckArrow!])
const followedEnd = pathOf(followed.find((object) => object.id === 'arr')!)
assert(Math.abs(followedEnd[1].x - 240) < 1 && Math.abs(followedEnd[1].y - 230) < 1, 'connected end follows the card')
const released = settleBindings([stuckArrow!])
assert(released[0]?.endBound === null, 'a missing card lets the arrow go')

const grownArrow = frameBetween(
  { ...slideA, objects: [baseObject({ id: 'arr', type: 'arrow', light: 0, points: straight })] },
  { ...slideB, objects: [baseObject({ id: 'arr', type: 'arrow', light: 1, points: straight })] },
  0.5,
  slideA.transition,
).find((object) => object.id === 'arr')
assert(!!grownArrow && Math.abs(grownArrow.light - 0.5) < 0.01, 'light length lerps so the line can grow')

const stack = [
  baseObject({ id: 'a', type: 'card', x: 0, y: 0 }),
  baseObject({ id: 'b', type: 'card', x: 10, y: 10 }),
  baseObject({ id: 'c', type: 'card', x: 20, y: 20 }),
]
const idsOf = (objects: { id: string }[]) => objects.map((object) => object.id).join(',')
assert(idsOf(orderObjects(stack, ['b'], 'forward')) === 'a,c,b', 'forward moves one step toward the front')
assert(idsOf(orderObjects(stack, ['b'], 'backward')) === 'b,a,c', 'backward moves one step toward the back')
assert(idsOf(orderObjects(stack, ['b'], 'front')) === 'a,c,b', 'front puts the selection on top')
assert(idsOf(orderObjects(stack, ['b'], 'back')) === 'b,a,c', 'back puts the selection behind everything')

const grouped = [
  baseObject({ id: 'a', type: 'card', x: 0, y: 0, w: 100, h: 40, groupId: 'g' }),
  baseObject({ id: 'b', type: 'card', x: 200, y: 0, w: 100, h: 40, groupId: 'g' }),
  baseObject({ id: 'c', type: 'card', x: 0, y: 80, w: 40, h: 40, groupId: null }),
]
assert(dragTargets(grouped, [], 'a', false).join(',') === 'a,b', 'clicking one grouped item targets the whole group')
assert(dragTargets(grouped, ['a', 'c'], 'a', false).join(',') === 'a,b,c', 'dragging a selection keeps every selected item and its group')
assert(dragTargets(grouped, ['c'], 'a', false).join(',') === 'a,b', 'clicking outside the selection selects the group')
assert(dragTargets(grouped, ['a', 'b', 'c'], 'a', true).join(',') === 'c', 'shift-click removes the whole group from the selection')
const loose = [
  baseObject({ id: 'p', type: 'card', x: 0, y: 0, w: 40, h: 40 }),
  baseObject({ id: 'q', type: 'card', x: 80, y: 0, w: 40, h: 40 }),
  baseObject({ id: 'locked', type: 'card', x: 0, y: 0, w: 300, h: 80, locked: true }),
  baseObject({ id: 'g1', type: 'card', x: 0, y: 100, w: 30, h: 30, groupId: 'g' }),
  baseObject({ id: 'g2', type: 'card', x: 80, y: 100, w: 30, h: 30, groupId: 'g' }),
]
assert(marqueeTargets(loose, { x: -4, y: -4, w: 50, h: 50 }).join(',') === 'p', 'a drag box selects the card it covers')
assert(marqueeTargets(loose, { x: -4, y: -4, w: 130, h: 50 }).join(',') === 'p,q', 'a drag box selects every card it covers')
assert(!marqueeTargets(loose, { x: -4, y: -4, w: 260, h: 50 }).includes('locked'), 'a drag box skips locked items')
assert(marqueeTargets(loose, { x: -4, y: 90, w: 40, h: 40 }).join(',') === 'g1,g2', 'a drag box selects the whole group when it touches one member')
assert(marqueeTargets(loose, { x: 70, y: -4, w: 60, h: 50 }, ['p']).join(',') === 'p,q', 'shift-drag keeps what was already selected')
const scaled = scaleObjects(grouped, ['a', 'b'], 'se', 100, 40)
const scaledA = scaled.find((object) => object.id === 'a')
const scaledB = scaled.find((object) => object.id === 'b')
assert(!!scaledA && Math.abs(scaledA.w - 400 / 3) < 0.01 && Math.abs(scaledA.h - 80) < 0.01, 'group resize scales the first card from the opposite corner')
assert(!!scaledB && Math.abs(scaledB.x - 800 / 3) < 0.01 && scaledCStays(scaled), 'group resize moves the second card and leaves the outsider')
const turned = rotateObjects(grouped, ['a', 'b'], 180)
const turnedA = turned.find((object) => object.id === 'a')
const turnedB = turned.find((object) => object.id === 'b')
assert(!!turnedA && Math.abs(turnedA.x - 200) < 0.01 && Math.abs(turnedA.y) < 0.01 && turnedA.rotation === 180, 'group rotate spins the first card around the selection')
assert(!!turnedB && Math.abs(turnedB.x) < 0.01 && turned.find((object) => object.id === 'c')?.x === 0, 'group rotate swaps the second card and leaves the outsider')

const cleanSketch = shapeSketch(baseObject({ id: 'box', type: 'card', w: 180, h: 52, roughness: 0, radius: 0 }))
assert(cleanSketch === null, 'sloppiness 0 stays a clean stroke')
const artist = shapeSketch(baseObject({ id: 'box', type: 'card', w: 180, h: 52, roughness: 1, radius: 0, strokeWidth: 2 }))
const cartoon = shapeSketch(baseObject({ id: 'box', type: 'card', w: 180, h: 52, roughness: 2, radius: 0, strokeWidth: 2 }))
assert(!!artist && artist.stroke.includes('C') && artist.stroke.split('M').length > 5, 'sloppiness 1 bows each edge and draws a second stroke')
assert(!!artist && !!cartoon && cartoon.stroke !== artist.stroke, 'sloppiness 2 sketches a different, looser stroke')
const roundSketch = shapeSketch(baseObject({ id: 'round', type: 'card', w: 180, h: 52, roughness: 1, radius: 10, fill: '#2b2d42' }))
assert(!!roundSketch && roundSketch.fill.startsWith('M') && roundSketch.stroke.includes('C'), 'a filled round card gets a sketch fill and a bowed stroke')
const sloppyArrow = arrowSketch(baseObject({ id: 'arr', type: 'arrow', roughness: 1, light: 1, strokeWidth: 2, points: [{ x: 0, y: 0 }, { x: 120, y: 40 }] }))
assert(!!sloppyArrow && sloppyArrow.stroke.split('M').length >= 4, 'a sloppy arrow sketches the shaft and both sides of the head')

function scaledCStays(objects: { id: string; x: number }[]) {
  return objects.find((object) => object.id === 'c')?.x === 0
}

console.log('magic tests passed')
