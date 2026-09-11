#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import puppeteer from 'puppeteer-core'

const args = process.argv.slice(2)
const outFlag = args.indexOf('-o')
const inputs = args.filter((a, i) => !a.startsWith('-') && !(outFlag >= 0 && i === outFlag + 1))
const quiet = args.includes('--quiet')

if (!inputs.length) {
  console.log(`MPGA — HTML-презентация в редактируемый PPTX

  node tools/cli.mjs slides.html [-o out.pptx]
  node tools/cli.mjs *.html

Требует собранный dist/MPGA.html (npm run build) и Chromium.
Путь к браузеру: переменная MPGA_CHROME.`)
  process.exit(inputs.length ? 0 : 1)
}

const app = resolve('dist/MPGA.html')
if (!existsSync(app)) {
  console.error('нет dist/MPGA.html — соберите его: npm run build')
  process.exit(1)
}

const CHROME = process.env.MPGA_CHROME ||
  '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome'
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1400, height: 900 })
await page.goto('file://' + app, { waitUntil: 'load' })

let failed = 0
for (const file of inputs) {
  const source = readFileSync(resolve(file), 'utf8')
  try {
    const result = await page.evaluate(async html => {
      const { ir, warnings } = await window.MPGA.convert(html)
      const blob = await window.MPGA.pptxBlob(ir, { title: ir.title, app: 'MPGA' })
      const bytes = new Uint8Array(await blob.arrayBuffer())
      let binary = ''
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
      return { pptx: btoa(binary), slides: ir.slides.length, warnings }
    }, source)

    const out = outFlag >= 0 && inputs.length === 1
      ? args[outFlag + 1]
      : resolve(file).replace(/\.html?$/i, '.pptx')
    writeFileSync(out, Buffer.from(result.pptx, 'base64'))
    if (!quiet) {
      console.log(`${basename(file)} → ${basename(out)} (${result.slides} слайдов)`)
      for (const w of result.warnings.filter(w => w.level !== 'info')) console.log(`  ! ${w.text}`)
    }
  } catch (err) {
    failed++
    console.error(`${basename(file)}: ${err.message}`)
  }
}

await browser.close()
process.exit(failed ? 1 : 0)
