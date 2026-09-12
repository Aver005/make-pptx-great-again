import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, join, basename } from "node:path";
import puppeteer from "puppeteer-core";

const CHROME =
  process.env.MPGA_CHROME || "/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";
const OUT = resolve("out/test");
const MAX_DIFF = Number(process.env.MPGA_MAX_DIFF || 9);
// Порог у стенда эффектов свой: слайд, целиком залитый градиентом, LibreOffice
// растягивает по своей шкале, и попиксельно он расходится с браузером даже
// когда выглядит так же. Структуру такого слайда проверяем по XML, а не по цвету.
const CASES = [
  { file: "examples/demo.html" },
  { file: "examples/deck-v7.html" },
  { file: "examples/deck-deepseek.html" },
  {
    file: "examples/deck-effects.html",
    maxDiff: 26,
    // что обязано доехать родным объектом, а не картинкой и не пустотой
    xml: [
      ["slide1.xml", /<a:gradFill/, "градиентная заливка титула"],
      ["slide1.xml", /<p:transition[^>]*><p:fade\/>/, "переход слайда"],
      ["slide2.xml", /<a:outerShdw/, "тень карточки"],
      ["slide2.xml", /prstDash val="dash"/, "пунктирная рамка"],
      ["slide3.xml", /<a:tbl>/, "таблица родным объектом"],
      ["slide4.xml", /<p:timing>/, "анимация появления"],
      ["slide5.xml", /<a:custGeom>/, "срез через clip-path своей геометрией"],
      ["slide6.xml", /rot="-3[0-9]{5}"/, "повёрнутая плашка"],
      ["slide8.xml", /<a:path path="circle"/, "радиальный градиент фона"],
    ],
    // ни одной картинки там, где раньше уезжал целый слайд
    maxPictures: 4,
  },
  {
    file: "examples/deck-fine.html",
    xml: [
      ["slide1.xml", /<a:buChar char="&#x2022;"\/>/, "маркер списка"],
      ["slide1.xml", /<a:buAutoNum type="arabicPeriod"/, "нумерация списка"],
      ["slide1.xml", /hlinkClick/, "кликабельная ссылка"],
      ["slide1.xml", /prstDash val="dash"/, "обводка через outline"],
      ["slide2.xml", /<a:arcTo/, "разные радиусы по углам"],
      ["slide3.xml", /numCol="2"/, "текст в две колонки"],
      ["slide3.xml", /vert="vert"/, "вертикальная подпись"],
    ],
    maxPictures: 0,
  },
];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const failures = [];
const fail = (name, text) => {
  failures.push(`${name}: ${text}`);
  console.log(`    ✗ ${text}`);
};
const pass = (text) => console.log(`    ✓ ${text}`);

if (!existsSync("dist/MPGA.html")) {
  console.error("нет dist/MPGA.html — сначала соберите: bun run build");
  process.exit(1);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 2 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
await page.goto("file://" + resolve("dist/MPGA.html"), { waitUntil: "load" });

for (const item of CASES) {
  const file = item.file;
  const name = basename(file, ".html");
  const dir = join(OUT, name);
  mkdirSync(dir, { recursive: true });
  console.log(`\n${name}`);
  errors.length = 0;

  const html = readFileSync(resolve(file), "utf8");
  const data = await page.evaluate(async (source) => {
    const { ir, warnings } = await window.MPGA.convert(source, {
      keepFrame: true,
      onFrame: (frame) => {
        window.__frame = frame;
      },
    });
    const blob = await window.MPGA.pptxBlob(ir, { title: ir.title, app: "MPGA test" });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return {
      pptx: btoa(binary),
      warnings,
      slides: ir.slides.length,
      slideW: ir.slideW,
      words: ir.slides
        .flatMap((s) =>
          s.texts.flatMap((t) =>
            t.runs.filter((r) => !r.br && !(r.spacing > 0.1)).flatMap((r) => r.text.split(/\s+/)),
          ),
        )
        .filter((w) => w.length >= 8),
      shapes: ir.slides.reduce((n, s) => n + s.boxes.length, 0),
      pictures: ir.slides.reduce((n, s) => n + s.images.filter((i) => i.data).length, 0),
      texts: ir.slides.reduce((n, s) => n + s.texts.length, 0),
    };
  }, html);

  const pptxPath = join(dir, `${name}.pptx`);
  writeFileSync(pptxPath, Buffer.from(data.pptx, "base64"));
  console.log(
    `    ${data.slides} слайдов · ${data.shapes} фигур · ${data.texts} текстов · ${data.pictures} картинок`,
  );

  if (!data.slides) fail(name, "слайды не найдены");
  const errorNotes = data.warnings.filter((w) => w.level === "error");
  if (errorNotes.length) fail(name, `ошибки разбора: ${errorNotes.map((w) => w.text).join("; ")}`);
  if (errors.length) fail(name, `ошибки в консоли: ${errors.slice(0, 2).join(" | ")}`);
  else pass("без ошибок в консоли");

  const xml = execFileSync("unzip", ["-p", pptxPath, "ppt/presentation.xml"]).toString();
  if (!xml.includes('cx="12192000"')) fail(name, 'размер слайда не 16:9 13,33"');
  else pass("размер слайда 13,33 × 7,5 дюйма");

  const slide1 = execFileSync("unzip", ["-p", pptxPath, "ppt/slides/slide1.xml"]).toString();
  const textBoxes = (slide1.match(/<p:txBody>/g) || []).length;
  if (textBoxes < 2) fail(name, `на первом слайде почти нет текстовых блоков (${textBoxes})`);
  else pass(`текст — родные объекты (${textBoxes} блоков на слайде 1)`);

  for (const [part, rule, what] of item.xml || []) {
    const source = execFileSync("unzip", ["-p", pptxPath, `ppt/slides/${part}`]).toString();
    if (!rule.test(source)) fail(name, `${what} не доехала до файла (${part})`);
    else pass(what);
  }
  if (item.maxPictures != null) {
    if (data.pictures > item.maxPictures)
      fail(name, `картинок ${data.pictures}, ожидалось не больше ${item.maxPictures}`);
    else pass(`в растр ушло не больше ${item.maxPictures} элементов (${data.pictures})`);
  }

  execFileSync("soffice", ["--headless", "--convert-to", "pdf", "--outdir", dir, pptxPath], {
    stdio: "ignore",
  });
  const pdf = join(dir, `${name}.pdf`);
  const pdfText = execFileSync("pdftotext", ["-layout", pdf, "-"]).toString();
  // Перенос по дефису — обычная работа переносчика строк, а не разорванное
  // слово: «writing-» на одной строке и «mode» на другой склеиваем обратно.
  const clean = pdfText.replace(/[­]/g, "").replace(/-[ \t]*\r?\n[ \t]*/g, "-");
  const broken = [...new Set(data.words)].filter((word) => !clean.includes(word)).slice(0, 6);
  const brokenShare = broken.length / Math.max(1, new Set(data.words).size);
  if (brokenShare > 0.02) fail(name, `слова разорваны переносом: ${broken.join(", ")}`);
  else pass("слова не разорваны, текст извлекается как текст");

  execFileSync("pdftoppm", ["-png", "-r", "96", pdf, join(dir, "got")]);
  const pad = String(data.slides).length;
  const diffs = [];
  for (let i = 0; i < data.slides; i++) {
    const box = await page.evaluate((index) => {
      const frame = window.__frame;
      const el = frame.contentDocument.querySelectorAll(".mpga-slide-root")[index];
      for (const node of document.querySelectorAll(".wrap, .backdrop"))
        node.style.visibility = "hidden";
      document.body.style.background = "#fff";
      window.scrollTo(0, 0);
      frame.style.left = "0px";
      frame.style.top = "0px";
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    }, i);
    const ref = join(dir, `ref-${i + 1}.png`);
    await page.screenshot({ path: ref, clip: box, captureBeyondViewport: true });
    const got = join(dir, `got-${String(i + 1).padStart(pad, "0")}.png`);
    if (!existsSync(got)) {
      fail(name, `слайд ${i + 1} не отрисовался`);
      continue;
    }
    execFileSync("convert", [ref, "-resize", "1160x653!", join(dir, `a-${i + 1}.png`)]);
    execFileSync("convert", [got, "-resize", "1160x653!", join(dir, `b-${i + 1}.png`)]);
    let raw = "0";
    try {
      raw = String(
        execFileSync(
          "compare",
          [
            "-metric",
            "AE",
            "-fuzz",
            "8%",
            join(dir, `a-${i + 1}.png`),
            join(dir, `b-${i + 1}.png`),
            join(dir, `cmp-${i + 1}.png`),
          ],
          { stdio: ["ignore", "ignore", "pipe"] },
        ) || "0",
      );
    } catch (err) {
      raw = String(err.stderr || "").trim();
    }
    diffs.push(((parseInt(raw.replace(/[^0-9]/g, ""), 10) || 0) / (1160 * 653)) * 100);
  }
  const worst = Math.max(...diffs);
  const limit = item.maxDiff || MAX_DIFF;
  if (worst > limit)
    fail(name, `слайд отличается от браузера на ${worst.toFixed(1)}% (порог ${limit}%)`);
  else
    pass(
      `совпадение с браузером: худший слайд ${worst.toFixed(1)}%, средний ${(diffs.reduce((a, b) => a + b, 0) / diffs.length).toFixed(1)}%`,
    );
}

console.log("\nнезависимость от окна браузера");
const probe = readFileSync(resolve("examples/deck-deepseek.html"), "utf8");
const shots = [];
for (const view of [
  { width: 1400, height: 900 },
  { width: 900, height: 600 },
  { width: 1366, height: 768, deviceScaleFactor: 1.25 },
]) {
  await page.setViewport(view);
  await page.goto("file://" + resolve("dist/MPGA.html"), { waitUntil: "load" });
  shots.push(
    await page.evaluate(async (html) => {
      const { ir } = await window.MPGA.convert(html);
      return {
        epx: Math.round(ir.epx),
        slideW: Math.round(ir.slideW),
        slides: ir.slides.length,
        texts: ir.slides.reduce((n, s) => n + s.texts.length, 0),
        firstText: ir.slides[0].texts.length ? Math.round(ir.slides[0].texts[0].x) : -1,
      };
    }, probe),
  );
  console.log(
    `    окно ${view.width}×${view.height}${view.deviceScaleFactor ? ` (масштаб ${view.deviceScaleFactor})` : ""}: epx=${shots.at(-1).epx}, слайд ${shots.at(-1).slideW}px, текстов ${shots.at(-1).texts}`,
  );
}
const same = shots.every((s) => JSON.stringify(s) === JSON.stringify(shots[0]));
if (!same) fail("окно", "результат зависит от размера окна браузера");
else pass("результат одинаковый при любом размере окна и масштабе");

await browser.close();

console.log("");
if (failures.length) {
  console.log(`ПРОВАЛ (${failures.length}):`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log("все проверки пройдены");
