import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, basename, join } from "node:path";
import puppeteer from "puppeteer-core";

const CHROME =
  process.env.MPGA_CHROME || "/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";

const args = process.argv.slice(2);
const withRender = args.includes("--render");
const files = args.filter((a) => !a.startsWith("--"));
const input = resolve(files[0] || "examples/deck-v7.html");
const outDir = resolve(files[1] || "out");
const name = basename(input).replace(/\.html?$/i, "");
const workDir = join(outDir, name);
rmSync(workDir, { recursive: true, force: true });
mkdirSync(workDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--font-render-hinting=none"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 2 });
const logs = [];
page.on("console", (m) => {
  if (m.type() === "error") logs.push(m.text());
});
page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));

await page.goto("file://" + resolve("tools/testbed.html"), { waitUntil: "load" });

const html = readFileSync(input, "utf8");
const result = await page.evaluate(async (source) => {
  const t0 = performance.now();
  const { ir, warnings } = await window.MPGA.convert(source, {
    keepFrame: true,
    onFrame: (frame) => {
      window.__frame = frame;
    },
  });
  const blob = await window.MPGA.pptxBlob(ir, { title: ir.title, app: "MPGA 0.1.0" });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return {
    pptx: btoa(binary),
    ms: Math.round(performance.now() - t0),
    warnings,
    epx: ir.epx,
    slideW: ir.slideW,
    slideH: ir.slideH,
    title: ir.title,
    stats: ir.slides.map((s) => ({
      i: s.index + 1,
      boxes: s.boxes.length,
      texts: s.texts.length,
      images: s.images.length,
      missing: s.images.filter((im) => im.missing).length,
      runs: s.texts.reduce((n, t) => n + t.runs.length, 0),
    })),
  };
}, html);

const pptxPath = join(workDir, `${name}.pptx`);
writeFileSync(pptxPath, Buffer.from(result.pptx, "base64"));
writeFileSync(join(workDir, "ir.json"), JSON.stringify({ ...result, pptx: undefined }, null, 2));

console.log(
  `${name}: ${result.stats.length} слайдов, ${result.ms} мс, epx=${result.epx.toFixed(1)}, слайд ${result.slideW}×${result.slideH}`,
);
for (const s of result.stats) {
  console.log(
    `  слайд ${s.i}: фигур ${s.boxes}, текстов ${s.texts} (${s.runs} фрагментов), картинок ${s.images}${s.missing ? `, пустых ${s.missing}` : ""}`,
  );
}
for (const w of result.warnings) console.log(`  [${w.level}] ${w.text}`);
if (logs.length) console.log("  ошибки в консоли:", logs.slice(0, 5).join(" | "));

if (withRender) {
  const refDir = join(workDir, "ref");
  mkdirSync(refDir, { recursive: true });
  const count = await page.evaluate(
    () => window.__frame.contentDocument.querySelectorAll(".mpga-slide-root").length,
  );
  for (let i = 0; i < count; i++) {
    const box = await page.evaluate((index) => {
      const frame = window.__frame;
      const el = frame.contentDocument.querySelectorAll(".mpga-slide-root")[index];
      for (const node of document.querySelectorAll(".wrap, .backdrop"))
        node.style.visibility = "hidden";
      document.body.style.background = "#fff";
      window.scrollTo(0, 0);
      frame.style.left = "0px";
      frame.style.top = "0px";
      frame.style.zIndex = "9999";
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    }, i);
    await page.screenshot({
      path: join(refDir, `ref-${String(i + 1).padStart(2, "0")}.png`),
      clip: { x: box.x, y: box.y, width: box.width, height: box.height },
      captureBeyondViewport: true,
    });
  }
  execFileSync("soffice", ["--headless", "--convert-to", "pdf", "--outdir", workDir, pptxPath], {
    stdio: "ignore",
  });
  execFileSync("pdftoppm", [
    "-png",
    "-r",
    "96",
    join(workDir, `${name}.pdf`),
    join(workDir, "got"),
  ]);
  const pad = String(count).length;

  console.log("  сверка с браузером (0 = идеально):");
  for (let i = 1; i <= count; i++) {
    const n = String(i).padStart(2, "0");
    const ref = join(refDir, `ref-${n}.png`);
    const got = join(workDir, `got-${String(i).padStart(pad, "0")}.png`);
    if (!existsSync(got)) continue;
    const norm = join(workDir, `cmp-${n}.png`);
    execFileSync("convert", [ref, "-resize", "1160x653!", join(workDir, `a-${n}.png`)]);
    execFileSync("convert", [got, "-resize", "1160x653!", join(workDir, `b-${n}.png`)]);
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
            join(workDir, `a-${n}.png`),
            join(workDir, `b-${n}.png`),
            norm,
          ],
          { stdio: ["ignore", "ignore", "pipe"] },
        ) || "0",
      );
    } catch (err) {
      raw = String(err.stderr || "").trim();
    }
    const differing = parseInt(raw.replace(/[^0-9]/g, ""), 10) || 0;
    const share = ((differing / (1160 * 653)) * 100).toFixed(2);
    console.log(`    слайд ${i}: отличается ${share}% пикселей`);
  }
}

await browser.close();
