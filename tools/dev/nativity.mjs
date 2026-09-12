// Мера «родности»: сколько площади слайда унесено картинкой вместо объектов.
// Запуск: bun tools/dev/nativity.mjs examples/deck-effects.html [ещё.html ...]
import { readFileSync } from "node:fs";
import { resolve, basename } from "node:path";
import puppeteer from "puppeteer-core";

const CHROME =
  process.env.MPGA_CHROME || "/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";
const files = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!files.length) files.push("examples/deck-effects.html");

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 2 });
const logs = [];
page.on("pageerror", (e) => logs.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") logs.push(m.text());
});
await page.goto("file://" + resolve("tools/testbed.html"), { waitUntil: "load" });

const totals = { area: 0, raster: 0, native: 0, pics: 0 };
for (const file of files) {
  const html = readFileSync(resolve(file), "utf8");
  const data = await page.evaluate(async (source) => {
    const { ir, warnings } = await window.MPGA.convert(source);
    return {
      slides: ir.slides.map((s) => ({
        i: s.index + 1,
        w: s.w,
        h: s.h,
        boxes: s.boxes.length,
        texts: s.texts.length,
        tables: (s.tables || []).length,
        lines: (s.lines || []).length,
        pics: s.images.length,
        rasterArea: s.images.reduce((n, im) => n + im.w * im.h, 0),
      })),
      warnings: warnings.map((w) => `${w.level}: ${w.text}`),
    };
  }, html);

  console.log(`\n${basename(file)}`);
  for (const s of data.slides) {
    const area = s.w * s.h;
    const share = (100 * Math.min(area, s.rasterArea)) / area;
    totals.area += area;
    totals.raster += Math.min(area, s.rasterArea);
    totals.native += s.boxes + s.texts + s.tables + s.lines;
    totals.pics += s.pics;
    console.log(
      `  слайд ${String(s.i).padStart(2)}: фигур ${String(s.boxes).padStart(3)}` +
        ` · текстов ${String(s.texts).padStart(3)}` +
        ` · таблиц ${s.tables} · линий ${String(s.lines).padStart(2)}` +
        ` · картинок ${String(s.pics).padStart(2)}` +
        ` · в растре ${share.toFixed(1).padStart(5)}% площади`,
    );
  }
  for (const w of data.warnings) console.log(`  [${w}]`);
}

console.log(
  `\nитого: родных объектов ${totals.native}, картинок ${totals.pics}, ` +
    `площади в растре ${((100 * totals.raster) / totals.area).toFixed(1)}%`,
);
if (logs.length) console.log("ошибки в консоли:", logs.slice(0, 5).join(" | "));
await browser.close();
