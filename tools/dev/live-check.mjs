import { mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import puppeteer from "puppeteer-core";

const url = process.argv[2] ?? "https://mpga.kiviuly.ru/";
const downloads = resolve("out/live");
rmSync(downloads, { recursive: true, force: true });
mkdirSync(downloads, { recursive: true });

const browser = await puppeteer.launch({
  executablePath:
    process.env.MPGA_CHROME ?? "/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome",
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
const errors = [];
const external = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("request", (r) => {
  if (!r.url().startsWith(url) && !/^(data|blob|about):/.test(r.url())) external.push(r.url());
});

const client = await page.createCDPSession();
await client.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: downloads });

const started = Date.now();
await page.goto(url, { waitUntil: "load" });
console.log(`  страница открыта за ${Date.now() - started} мс`);

await page.click("#demo");
await page.waitForSelector("#result.on", { timeout: 30000 });
console.log(
  "  конвертация:",
  (await page.$eval("#summary", (el) => el.textContent)).replace(/\s+/g, " ").trim(),
);

await page.click("#download");
await new Promise((done) => setTimeout(done, 2500));
const files = readdirSync(downloads).filter((f) => f.endsWith(".pptx"));
console.log(
  files.length
    ? `  файл скачан: ${files[0]}, ${(statSync(join(downloads, files[0])).size / 1024) | 0} КБ`
    : "  ФАЙЛ НЕ СКАЧАЛСЯ",
);
console.log(
  `  запросов на другие адреса: ${external.length}${external.length ? " — " + external.slice(0, 3).join(", ") : ""}`,
);
console.log(
  `  ошибок: ${errors.length}${errors.length ? " — " + errors.slice(0, 2).join(" | ") : ""}`,
);

await browser.close();
process.exit(files.length && !external.length && !errors.length ? 0 : 1);
