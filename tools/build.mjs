import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const VERSION = JSON.parse(readFileSync('package.json', 'utf8')).version
const DATE = new Date().toISOString().slice(0, 10)

const read = path => readFileSync(path, 'utf8')
const safe = js => js.replace(/<\/script/gi, '<\\/script')

const ENGINE = [
  'src/engine/icons.js',
  'src/vendor/pptxgen.bundle.js',
  'src/engine/normalize.js',
  'src/engine/extract.js',
  'src/engine/raster.js',
  'src/engine/validate.js',
  'src/engine/pptx.js',
  'src/engine/convert.js',
]

const promptSource = read('ПРОМПТ.md')
const prompt = promptSource.split('---НАЧАЛО---')[1].split('---КОНЕЦ---')[0].trim()
const demo = read('examples/demo.html')

const legal = `
  <div>MPGA ${VERSION} · сборка ${DATE} · <a href="https://github.com/mpga-tool/mpga">исходный код и обновления</a></div>
  <div>Внутри работают библиотеки с открытыми лицензиями:
    PptxGenJS 4.0.1 (MIT, © Brent Ely), JSZip (MIT, © Stuk),
    набор иконок lucide (ISC, © Lucide Contributors, на основе Feather © Cole Bemis).
    Сам MPGA — лицензия MIT.</div>
`

const data = `
window.MPGA_BUILD = ${JSON.stringify({ version: VERSION, date: DATE })};
window.MPGA_PROMPT = ${JSON.stringify(prompt)};
window.MPGA_DEMO = ${JSON.stringify(demo)};
window.MPGA_LEGAL = ${JSON.stringify(legal)};
`

const scripts = [
  ...ENGINE.map(path => `<script>\n${safe(read(path))}\n</script>`),
  `<script>${safe(data)}</script>`,
  `<script>\n${safe(read('src/app/ui.js'))}\n</script>`,
].join('\n')

const page = read('src/app/index.html')
  .replace('<!--STYLES-->', () => `<style>\n${read('src/app/styles.css')}\n</style>`)
  .replace('<!--SCRIPTS-->', () => scripts)

const markup = page.replace(/<script[\s\S]*?<\/script>/gi, '')
const banned = [
  [/\ssrc\s*=\s*["']https?:/i, 'внешний ресурс в разметке'],
  [/<link\b[^>]*href\s*=\s*["']https?:/i, 'внешняя таблица стилей'],
  [/@import/i, '@import в стилях'],
  [/url\(\s*["']?https?:/i, 'внешний url() в стилях'],
]
for (const [rule, what] of banned) {
  const hit = rule.exec(markup)
  if (hit) {
    console.error(`сборка остановлена: ${what} — ${hit[0]}`)
    process.exit(1)
  }
}
for (const rule of [/\bfetch\s*\(\s*["'`]https?:/i, /XMLHttpRequest[\s\S]{0,80}https?:/i]) {
  const hit = rule.exec(page)
  if (hit) {
    console.error(`сборка остановлена: код обращается в сеть — ${hit[0].slice(0, 60)}`)
    process.exit(1)
  }
}

mkdirSync('dist', { recursive: true })
writeFileSync('dist/MPGA.html', page)
const size = statSync('dist/MPGA.html').size
const hash = createHash('sha256').update(page).digest('hex')
writeFileSync('dist/MPGA.html.sha256', `${hash}  MPGA.html\n`)

console.log(`dist/MPGA.html — ${(size / 1024 / 1024).toFixed(2)} МБ, версия ${VERSION}, ${DATE}`)
console.log(`sha256 ${hash}`)
