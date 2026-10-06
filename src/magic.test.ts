import { alignObjects, baseObject, resized, snapMove } from './doc'
import { exampleDoc } from './example'
import { applyEase, frameBetween, parseColor, sampleAt, totalSeconds } from './magic'
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

const grown = resized(baseObject({ id: 's', type: 'card', x: 0, y: 0, w: 100, h: 40 }), 'e', 20, 0)
assert(Math.abs(grown.w - 120) < 0.01 && Math.abs(grown.x) < 0.01, 'east resize keeps the left edge')

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

console.log('magic tests passed')
