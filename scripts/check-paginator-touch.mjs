// Run: CARTA_BROWSER_CHANNEL=chrome node --test scripts/check-paginator-touch.mjs
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { after, before, test } from 'node:test'
import { chromium } from '@playwright/test'

let server, browser, page
before(async () => {
  const source = await readFile(process.env.CARTA_PAGINATOR_SOURCE ?? new URL('../node_modules/foliate-js/paginator.js', import.meta.url), 'utf8')
  server = createServer((req, res) => {
    res.setHeader('Content-Type', req.url === '/paginator.js' ? 'text/javascript' : 'text/html')
    res.end(req.url === '/paginator.js' ? source : '<body style="margin:0"></body>')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  browser = await chromium.launch({ headless: true, ...(process.env.CARTA_BROWSER_CHANNEL ? { channel: process.env.CARTA_BROWSER_CHANNEL } : {}) })
  page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true })
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  await page.evaluate(async () => {
    const { Paginator } = await import('/paginator.js')
    const reader = new Paginator()
    reader.style.cssText = 'display:block;width:390px;height:844px'
    reader.addEventListener('relocate', ({ detail }) => { window.visibleText = detail.range.toString() })
    reader.setAttribute('animated', '')
    reader.setAttribute('max-column-count', '1')
    document.body.append(reader)
    const html = `<html><body>${Array.from({ length: 180 }, (_, i) => `<p>Paragraph ${i}. Reading content for testing page turns and touch gestures.</p>`).join('')}</body></html>`
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
    reader.open({ dir: 'ltr', sections: [{ load: async () => url }] })
    await reader.goTo({ index: 0, anchor: 0 })
    window.reader = reader
    window.touch = (type, x) => {
      const point = new Touch({ identifier: 1, target: reader, screenX: x, screenY: 300, clientX: x, clientY: 300 })
      reader.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [point], changedTouches: [point], bubbles: true, cancelable: true }))
    }
  })
})
after(async () => {
  await browser?.close()
  await new Promise(resolve => server ? server.close(resolve) : resolve())
})

test('thumb wobble within the tap tolerance does not drag or snap the page', async () => {
  const result = await page.evaluate(async () => {
    const start = reader.start
    touch('touchstart', 320)
    touch('touchmove', 308)
    const moved = reader.start
    touch('touchend', 308)
    await new Promise(resolve => setTimeout(resolve, 400))
    return { start, moved, settled: reader.start }
  })
  assert.equal(result.moved, result.start)
  assert.equal(result.settled, result.start)
})

test('repeated tap turns with finger wobble each settle on new content', async () => {
  const results = await page.evaluate(async () => {
    const results = []
    for (let i = 0; i < 8; i++) {
      const before = reader.page
      const beforeText = window.visibleText
      touch('touchstart', 320)
      touch('touchmove', 310)
      const turning = reader.next()
      touch('touchend', 310)
      await turning
      await new Promise(resolve => setTimeout(resolve, 40))
      results.push({ before, after: reader.page, beforeText, afterText: window.visibleText })
    }
    return results
  })
  for (const result of results) {
    assert.equal(result.after, result.before + 1)
    assert.ok(result.afterText.length > 0)
    assert.notEqual(result.afterText, result.beforeText)
  }
})

test('a real drag still advances and a following tap does not snap backwards', async () => {
  const result = await page.evaluate(async () => {
    const before = reader.page
    touch('touchstart', 340)
    await new Promise(resolve => setTimeout(resolve, 20))
    touch('touchmove', 80)
    touch('touchend', 80)
    await new Promise(resolve => setTimeout(resolve, 400))
    const swiped = reader.page
    touch('touchstart', 320)
    const turning = reader.next()
    touch('touchend', 320)
    await turning
    await new Promise(resolve => setTimeout(resolve, 40))
    return { before, swiped, tapped: reader.page }
  })
  assert.equal(result.swiped, result.before + 1)
  assert.equal(result.tapped, result.swiped + 1)
})
