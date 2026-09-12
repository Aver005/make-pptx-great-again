import { mkdirSync, readFileSync, rmSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import puppeteer from "puppeteer-core";

const CHROME =
  process.env.MPGA_CHROME || "/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";
const downloads = resolve(process.argv[2] || "out/e2e");
rmSync(downloads, { recursive: true, force: true });
mkdirSync(downloads, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
const blocked = [];
const errors = [];
await page.setRequestInterception(true);
page.on("request", (req) => {
  const url = req.url();
  if (/^(file|data|blob|about):/.test(url)) req.continue();
  else {
    blocked.push(url);
    req.abort();
  }
});
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

const client = await page.createCDPSession();
await client.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: downloads });

await page.goto("file://" + resolve("dist/MPGA.html"), { waitUntil: "load" });
console.log("страница открыта с диска");

const steps = [];
const log = (line) => {
  steps.push(line);
  console.log("  " + line);
};

// 1. демонстрационный пример
await page.click("#demo");
await page.waitForSelector("#result.on", { timeout: 30000 });
log("пример сконвертирован: " + (await page.$eval("#summary", (el) => el.textContent)));

// 2. скачивание
await page.click("#download");
await new Promise((done) => setTimeout(done, 2500));
const files = readdirSync(downloads).filter((f) => f.endsWith(".pptx"));
log(
  files.length
    ? `файл скачан: ${files[0]}, ${(statSync(join(downloads, files[0])).size / 1024).toFixed(0)} КБ`
    : "ФАЙЛ НЕ СКАЧАЛСЯ",
);

// 3. загрузка реального файла студента
const input = await page.$("#file");
await input.uploadFile(resolve("examples/deck-deepseek.html"));
await page.waitForFunction(() => document.getElementById("summary").textContent.includes("10"), {
  timeout: 40000,
});
log("файл из чата: " + (await page.$eval("#summary", (el) => el.textContent)));
const thumbs = await page.$$eval(".thumb", (nodes) => nodes.length);
log(`превью слайдов: ${thumbs}`);
const notes = await page.$$eval(".note", (nodes) =>
  nodes.map((n) => n.textContent.trim().slice(0, 70)),
);

// 4. вставка кода из чата
await page.$$eval("details", (nodes) =>
  nodes.forEach((n) => {
    n.open = true;
  }),
);
await page.$eval("#paste", (el) => {
  el.value =
    '<!doctype html><html><head><style>.slide{width:1160px;height:652.5px;background:#fff;padding:40px}</style></head><body><section class="slide"><h2>Проверка вставки</h2><p>Текст из чата</p></section></body></html>';
});
await page.$eval("#convert-paste", (el) => el.click());
try {
  await page.waitForFunction(
    () => document.getElementById("summary").textContent.includes("1 слайд"),
    { timeout: 20000 },
  );
} catch (err) {
  console.log(
    "  состояние при сбое:",
    JSON.stringify(await page.$eval("#summary", (el) => el.textContent)),
    "| статус:",
    JSON.stringify(await page.$eval("#status", (el) => el.textContent.slice(0, 120))),
  );
  throw err;
}
log("вставленный код: " + (await page.$eval("#summary", (el) => el.textContent)));

console.log("  замечания в интерфейсе:", notes.join(" | ") || "нет");

// Офлайн-копия не должна содержать даже возможности что-то отправить.
const offlineSource = readFileSync(resolve("dist/MPGA.html"), "utf8");
const forbidden = ["/api/report", "report-agree", "MPGA_REPORT_UI =", "mpga-client"].filter(
  (needle) => offlineSource.includes(needle),
);
console.log(
  forbidden.length
    ? `  В ОФЛАЙН-КОПИИ ОСТАЛОСЬ: ${forbidden.join(", ")}`
    : "  в офлайн-копии нет кода отправки файлов",
);
console.log(
  `  сетевых запросов наружу: ${blocked.length}${blocked.length ? " — " + blocked.slice(0, 3).join(", ") : " (ни одного)"}`,
);
console.log(
  `  ошибок в консоли: ${errors.length}${errors.length ? " — " + errors.slice(0, 3).join(" | ") : ""}`,
);

await browser.close();
process.exit(blocked.length || forbidden.length || !readdirSync(downloads).length ? 1 : 0);
