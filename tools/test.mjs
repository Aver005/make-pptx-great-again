import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve, join, basename } from 'node:path'
import puppeteer from 'puppeteer-core'

const CHROME = process.env.MPGA_CHROME ||
  '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome'
const OUT = resolve('out/test')
const MAX_DIFF = Number(process.env.MPGA_MAX_DIFF || 9)
const CASES = ['examples/demo.html', 'examples/deck-v7.html', 'examples/deck-deepseek.html']

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const failures = []
const fail = (name, text) => { failures.push(`${name}: ${text}`); console.log(`    ✗ ${text}`) }
const pass = text => console.log(`    ✓ ${text}`)

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 2 })
const errors = []
page.on('pageerror', e => errors.push(e.message))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
await page.goto('file://' + resolve('dist/MPGA.html'), { waitUntil: 'load' })

for (const file of CASES) {
  const name = basename(file, '.html')
  const dir = join(OUT, name)
  mkdirSync(dir, { recursive: true })
  console.log(`\n${name}`)
  errors.length = 0

  const html = readFileSync(resolve(file), 'utf8')
  const data = await page.evaluate(async source => {
    const { ir, warnings } = await window.MPGA.convert(source, {
      keepFrame: true, onFrame: frame => { window.__frame = frame },
    })
    const blob = await window.MPGA.pptxBlob(ir, { title: ir.title, app: 'MPGA test' })
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    return {
      pptx: btoa(binary),
      warnings,
      slides: ir.slides.length,
      slideW: ir.slideW,
      words: ir.slides.flatMap(s => s.texts.flatMap(t => t.runs
        .filter(r => !r.br && !(r.spacing > 0.1))
        .flatMap(r => r.text.split(/\s+/)))).filter(w => w.length >= 8),
      shapes: ir.slides.reduce((n, s) => n + s.boxes.length, 0),
      pictures: ir.slides.reduce((n, s) => n + s.images.filter(i => i.data).length, 0),
      texts: ir.slides.reduce((n, s) => n + s.texts.length, 0),
    }
  }, html)

  const pptxPath = join(dir, `${name}.pptx`)
  writeFileSync(pptxPath, Buffer.from(data.pptx, 'base64'))
  console.log(`    ${data.slides} слайдов · ${data.shapes} фигур · ${data.texts} текстов · ${data.pictures} картинок`)

  if (!data.slides) fail(name, 'слайды не найдены')
  const errorNotes = data.warnings.filter(w => w.level === 'error')
  if (errorNotes.length) fail(name, `ошибки разбора: ${errorNotes.map(w => w.text).join('; ')}`)
  if (errors.length) fail(name, `ошибки в консоли: ${errors.slice(0, 2).join(' | ')}`)
  else pass('без ошибок в консоли')

  const xml = execFileSync('unzip', ['-p', pptxPath, 'ppt/presentation.xml']).toString()
  if (!xml.includes('cx="12192000"')) fail(name, 'размер слайда не 16:9 13,33"')
  else pass('размер слайда 13,33 × 7,5 дюйма')

  const slide1 = execFileSync('unzip', ['-p', pptxPath, 'ppt/slides/slide1.xml']).toString()
  const textBoxes = (slide1.match(/<p:txBody>/g) || []).length
  if (textBoxes < 2) fail(name, `на первом слайде почти нет текстовых блоков (${textBoxes})`)
  else pass(`текст — родные объекты (${textBoxes} блоков на слайде 1)`)

  execFileSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', dir, pptxPath], { stdio: 'ignore' })
  const pdf = join(dir, `${name}.pdf`)
  const pdfText = execFileSync('pdftotext', ['-layout', pdf, '-']).toString()
  const clean = pdfText.replace(/[­]/g, '')
  const broken = [...new Set(data.words)].filter(word => !clean.includes(word)).slice(0, 6)
  const brokenShare = broken.length / Math.max(1, new Set(data.words).size)
  if (brokenShare > 0.02) fail(name, `слова разорваны переносом: ${broken.join(', ')}`)
  else pass('слова не разорваны, текст извлекается как текст')

  execFileSync('pdftoppm', ['-png', '-r', '96', pdf, join(dir, 'got')])
  const pad = String(data.slides).length
  const diffs = []
  for (let i = 0; i < data.slides; i++) {
    const box = await page.evaluate(index => {
      const frame = window.__frame
      const el = frame.contentDocument.querySelectorAll('.mpga-slide-root')[index]
      frame.style.left = '0px'
      frame.style.top = '0px'
      const r = el.getBoundingClientRect()
      return { x: r.left, y: r.top, width: r.width, height: r.height }
    }, i)
    const ref = join(dir, `ref-${i + 1}.png`)
    await page.screenshot({ path: ref, clip: box, captureBeyondViewport: true })
    const got = join(dir, `got-${String(i + 1).padStart(pad, '0')}.png`)
    if (!existsSync(got)) { fail(name, `слайд ${i + 1} не отрисовался`); continue }
    execFileSync('convert', [ref, '-resize', '1160x653!', join(dir, `a-${i + 1}.png`)])
    execFileSync('convert', [got, '-resize', '1160x653!', join(dir, `b-${i + 1}.png`)])
    let raw = '0'
    try {
      raw = String(execFileSync('compare', ['-metric', 'AE', '-fuzz', '8%',
        join(dir, `a-${i + 1}.png`), join(dir, `b-${i + 1}.png`), join(dir, `cmp-${i + 1}.png`)],
        { stdio: ['ignore', 'ignore', 'pipe'] }) || '0')
    } catch (err) { raw = String(err.stderr || '').trim() }
    diffs.push((parseInt(raw.replace(/[^0-9]/g, ''), 10) || 0) / (1160 * 653) * 100)
  }
  const worst = Math.max(...diffs)
  if (worst > MAX_DIFF) fail(name, `слайд отличается от браузера на ${worst.toFixed(1)}% (порог ${MAX_DIFF}%)`)
  else pass(`совпадение с браузером: худший слайд ${worst.toFixed(1)}%, средний ${(diffs.reduce((a, b) => a + b, 0) / diffs.length).toFixed(1)}%`)
}

console.log('\nнезависимость от окна браузера')
const probe = readFileSync(resolve('examples/deck-deepseek.html'), 'utf8')
const shots = []
for (const view of [{ width: 1400, height: 900 }, { width: 900, height: 600 }, { width: 1366, height: 768, deviceScaleFactor: 1.25 }]) {
  await page.setViewport(view)
  await page.goto('file://' + resolve('dist/MPGA.html'), { waitUntil: 'load' })
  shots.push(await page.evaluate(async html => {
    const { ir } = await window.MPGA.convert(html)
    return {
      epx: Math.round(ir.epx),
      slideW: Math.round(ir.slideW),
      slides: ir.slides.length,
      texts: ir.slides.reduce((n, s) => n + s.texts.length, 0),
      firstText: ir.slides[0].texts.length ? Math.round(ir.slides[0].texts[0].x) : -1,
    }
  }, probe))
  console.log(`    окно ${view.width}×${view.height}${view.deviceScaleFactor ? ` (масштаб ${view.deviceScaleFactor})` : ''}: epx=${shots.at(-1).epx}, слайд ${shots.at(-1).slideW}px, текстов ${shots.at(-1).texts}`)
}
const same = shots.every(s => JSON.stringify(s) === JSON.stringify(shots[0]))
if (!same) fail('окно', 'результат зависит от размера окна браузера')
else pass('результат одинаковый при любом размере окна и масштабе')

await browser.close()

console.log('')
if (failures.length) {
  console.log(`ПРОВАЛ (${failures.length}):`)
  for (const f of failures) console.log(`  ${f}`)
  process.exit(1)
}
console.log('все проверки пройдены')
