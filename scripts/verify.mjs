import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' })
await page.getByText('call stack').first().waitFor()

await page.getByTestId('present').click()
await page.getByTestId('presenter').waitFor()
const presentStart = await page.locator('[data-testid="present-stage"] [data-object-id="card-main"]').evaluate((node) => node.style.left)
await page.keyboard.press('ArrowRight')
await page.waitForTimeout(250)
const presentMid = await page.locator('[data-testid="present-stage"] [data-object-id="card-main"]').evaluate((node) => node.style.left)
if (presentStart === presentMid) throw new Error(`present mode did not move the card (${presentStart})`)
await page.waitForTimeout(900)
const presentCount = await page.locator('.presenter-count').innerText()
if (!presentCount.startsWith('2')) throw new Error(`expected slide 2, saw ${presentCount}`)
await page.keyboard.press('Escape')
await page.getByTestId('presenter').waitFor({ state: 'hidden' })

const before = await page.locator('[data-testid="stage"] [data-object-id="card-main"]').evaluate((node) => node.style.left)
await page.getByTestId('play').click()
await page.waitForTimeout(800)
const during = await page.locator('[data-testid="stage"] [data-object-id="card-main"]').evaluate((node) => node.style.left)
if (before === during) throw new Error(`card did not move during play (${before})`)
await page.getByTestId('play').click()

await page.getByTestId('duplicate-slide').click()
const thumbs = await page.locator('.thumb').count()
if (thumbs !== 5) throw new Error(`expected 5 slides, saw ${thumbs}`)

await page.getByTestId('add-card').click()
const cards = await page.locator('[data-testid="stage"] .obj').count()
if (cards < 5) throw new Error(`expected a new card, saw ${cards} objects`)

const box = await page.locator('[data-testid="stage"] [data-object-id="card-main"]').boundingBox()
if (!box) throw new Error('card has no box')
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
await page.mouse.down()
await page.mouse.move(box.x + box.width / 2 + 140, box.y + box.height / 2, { steps: 8 })
await page.mouse.up()
const dragged = await page.locator('[data-testid="stage"] [data-object-id="card-main"]').evaluate((node) => Number.parseFloat(node.style.left))
if (!(dragged > 100)) throw new Error(`drag did not move the card (${dragged})`)

await page.getByTestId('ease').selectOption('easeIn')
const ease = await page.getByTestId('ease').inputValue()
if (ease !== 'easeIn') throw new Error(`ease did not stick (${ease})`)

const handle = page.locator('[data-testid="stage"] .handle-e')
await handle.waitFor()
const handleBox = await handle.boundingBox()
if (!handleBox) throw new Error('resize handle missing')
const widthBefore = await page.locator('[data-testid="stage"] .is-selected').evaluate((node) => Number.parseFloat(node.style.width))
await page.mouse.move(handleBox.x + 4, handleBox.y + 4)
await page.mouse.down()
await page.mouse.move(handleBox.x + 80, handleBox.y + 4, { steps: 6 })
await page.mouse.up()
const widthAfter = await page.locator('[data-testid="stage"] .is-selected').evaluate((node) => Number.parseFloat(node.style.width))
if (!(widthAfter > widthBefore + 20)) throw new Error(`resize failed (${widthBefore} -> ${widthAfter})`)

await page.locator('[data-testid="stage"] .is-selected').dblclick()
const editor = page.locator('[data-testid="stage"] .obj-edit')
await editor.fill('setTimeout')
await editor.press('Enter')
const label = await page.locator('[data-testid="stage"] .is-selected span').innerText()
if (label !== 'setTimeout') throw new Error(`text edit failed (${label})`)

await page.getByTestId('add-arrow').click()
const ends = page.locator('[data-testid="stage"] .handle-end')
if ((await ends.count()) !== 3) throw new Error(`expected 3 path points, saw ${await ends.count()}`)
await page.getByTestId('arrow-light').fill('0')
if ((await page.locator('[data-testid="stage"] .arrow-line').count()) !== 0) throw new Error('zero light still drew the arrow')
await page.getByTestId('arrow-light').fill('1')
const fullLength = await page.locator('[data-testid="stage"] .arrow-line').evaluate((node) => node.getTotalLength())
await page.getByTestId('arrow-light').fill('0.45')
const partLength = await page.locator('[data-testid="stage"] .arrow-line').evaluate((node) => node.getTotalLength())
if (!(partLength > fullLength * 0.2 && partLength < fullLength * 0.7)) throw new Error(`light did not shorten the line (${partLength} of ${fullLength})`)
await page.getByTestId('arrow-light').fill('1')
const middle = await ends.nth(1).boundingBox()
if (!middle) throw new Error('middle path point missing')
await page.mouse.move(middle.x + 5, middle.y + 5)
await page.mouse.down()
await page.mouse.move(middle.x + 40, middle.y + 70, { steps: 6 })
await page.mouse.up()
const moved = await ends.nth(1).boundingBox()
if (!moved || !(moved.x > middle.x + 15 && moved.y > middle.y + 25)) throw new Error(`path point did not move (${middle.x},${middle.y} -> ${moved?.x},${moved?.y})`)
const bendA = await ends.nth(0).boundingBox()
const bendB = await ends.nth(1).boundingBox()
if (!bendA || !bendB) throw new Error('path points missing before bend')
await page.mouse.dblclick((bendA.x + bendB.x) / 2 + 5, (bendA.y + bendB.y) / 2 + 5)
if ((await ends.count()) !== 4) throw new Error(`double-click did not add a bend (${await ends.count()} points)`)

const card = page.locator('[data-testid="stage"] .obj').last()
const cardBox = await card.boundingBox()
const endHandle = ends.nth((await ends.count()) - 1)
const endBox = await endHandle.boundingBox()
if (!cardBox || !endBox) throw new Error('card or arrow end missing')
await page.mouse.move(endBox.x + 5, endBox.y + 5)
await page.mouse.down()
await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2, { steps: 8 })
await page.mouse.up()
const attached = await endHandle.evaluate((node) => ({ x: Number.parseFloat(node.style.left) + 6, y: Number.parseFloat(node.style.top) + 6 }))
const cardDoc = await card.evaluate((node) => ({
  x: Number.parseFloat(node.style.left),
  y: Number.parseFloat(node.style.top),
  w: Number.parseFloat(node.style.width),
  h: Number.parseFloat(node.style.height),
}))
const edge = Math.min(
  Math.abs(attached.x - cardDoc.x),
  Math.abs(attached.x - (cardDoc.x + cardDoc.w)),
  Math.abs(attached.y - cardDoc.y),
  Math.abs(attached.y - (cardDoc.y + cardDoc.h)),
)
const onCard = attached.x >= cardDoc.x - 1 && attached.x <= cardDoc.x + cardDoc.w + 1 && attached.y >= cardDoc.y - 1 && attached.y <= cardDoc.y + cardDoc.h + 1
if (!onCard || edge > 2) throw new Error(`arrow did not connect to the card (${attached.x},${attached.y} edge ${edge})`)
const cardAt = await card.boundingBox()
if (!cardAt) throw new Error('connected card missing')
await page.mouse.move(cardAt.x + 24, cardAt.y + 24)
await page.mouse.down()
await page.mouse.move(cardAt.x + 90, cardAt.y + 24, { steps: 6 })
await page.mouse.up()
const followed = await page.locator('[data-testid="stage"] .arrow-line').evaluate((node) => {
  const nums = (node.getAttribute('d') || '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? []
  return { x: nums[nums.length - 2] ?? 0, y: nums[nums.length - 1] ?? 0 }
})
const cardNow = await card.evaluate((node) => ({
  x: Number.parseFloat(node.style.left),
  y: Number.parseFloat(node.style.top),
  w: Number.parseFloat(node.style.width),
  h: Number.parseFloat(node.style.height),
}))
const stillOn = followed.x >= cardNow.x - 1 && followed.x <= cardNow.x + cardNow.w + 1 && followed.y >= cardNow.y - 1 && followed.y <= cardNow.y + cardNow.h + 1
const stillEdge = Math.min(
  Math.abs(followed.x - cardNow.x),
  Math.abs(followed.x - (cardNow.x + cardNow.w)),
  Math.abs(followed.y - cardNow.y),
  Math.abs(followed.y - (cardNow.y + cardNow.h)),
)
if (!(cardNow.x > cardDoc.x + 8) || !stillOn || stillEdge > 2) {
  throw new Error(`connected arrow did not follow the card (${attached.x},${attached.y} -> ${followed.x},${followed.y}; card ${cardDoc.x} -> ${cardNow.x})`)
}

const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 60000 }),
  page.getByTestId('export-gif').click(),
])
const path = await download.path()
const size = path ? (await import('node:fs')).statSync(path).size : 0
if (size < 1000) throw new Error(`gif too small (${size})`)

if (errors.length) throw new Error(errors.join('\n'))
console.log(`browser checks passed (gif ${size} bytes, card ${before} -> ${during}, dragged to ${dragged}, resized ${widthBefore} -> ${widthAfter})`)
await browser.close()
