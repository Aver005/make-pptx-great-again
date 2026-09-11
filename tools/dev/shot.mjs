import { resolve } from 'node:path'
import puppeteer from 'puppeteer-core'
const browser = await puppeteer.launch({ executablePath: '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome', headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1000, height: 1400, deviceScaleFactor: 1 })
await page.goto('file://' + resolve('dist/MPGA.html'), { waitUntil: 'load' })
await page.screenshot({ path: process.argv[2] || 'out/app.png' })
if (process.argv[3] === 'demo') {
  await page.click('#demo')
  await page.waitForSelector('#result.on', { timeout: 30000 })
  await new Promise(r => setTimeout(r, 500))
  await page.screenshot({ path: (process.argv[2] || 'out/app.png').replace('.png', '-result.png'), fullPage: true })
}
await browser.close()
