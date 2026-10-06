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
