/**
 * Проверка добровольной отправки: поднимает сервер на временном каталоге,
 * проходит путь человека в браузере и убеждается, что до согласия ничего не
 * уходит, а лимит суток работает.
 */
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const CHROME =
  process.env.MPGA_CHROME ?? "/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";
const PORT = 3399;
const base = `http://127.0.0.1:${PORT}/`;
const dir = mkdtempSync(join(tmpdir(), "mpga-reports-"));

const problems = [];
const fail = (text) => {
  problems.push(text);
  console.log(`    ✗ ${text}`);
};
const pass = (text) => console.log(`    ✓ ${text}`);

const server = Bun.spawn(["bun", "server/main.ts"], {
  env: { ...process.env, PORT: String(PORT), REPORTS_DIR: dir },
  stdout: "pipe",
  stderr: "pipe",
});

async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try {
      const response = await fetch(`${base}health`);
      if (response.ok) return;
    } catch {
      /* сервер ещё поднимается */
    }
    await Bun.sleep(150);
  }
  throw new Error("сервер не поднялся");
}

const broken = `<!doctype html><html><head><style>
.slide{width:1160px;height:652.5px;position:relative;background:#fff;padding:40px}
.badge{transform:rotate(-7deg);background:#fc0;padding:8px}
</style></head><body><section class="slide"><h2>Проверка отправки</h2>
<div class="badge">Повёрнутый текст</div>
<img src="https://example.invalid/nope.png" width="200" height="120" alt="фото">
</section></body></html>`;

try {
  await waitForServer();

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  const posts = [];
  page.on("request", (r) => {
    if (r.method() === "POST") posts.push(r.url());
  });
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(base, { waitUntil: "load" });

  await page.$$eval("details", (nodes) =>
    nodes.forEach((node) => {
      node.open = true;
    }),
  );
  await page.$eval(
    "#paste",
    (el, value) => {
      el.value = value;
    },
    broken,
  );
  await page.$eval("#convert-paste", (el) => el.click());
  await page.waitForSelector("#report:not([hidden])", { timeout: 40000 });
  pass("форма отправки появляется после конвертации с замечаниями");

  if (posts.length) fail(`до согласия ушло запросов: ${posts.length}`);
  else pass("до галочки наружу не уходит ничего");

  if (!(await page.$eval("#report-send", (el) => el.disabled)))
    fail("кнопка отправки доступна без галочки");
  else pass("кнопка отправки заблокирована без галочки");

  await page.$eval("#report-agree", (el) => el.click());
  if (await page.$eval("#report-send", (el) => el.disabled))
    fail("галочка не разблокировала кнопку");

  await page.$eval("#report-send", (el) => el.click());
  await page.waitForFunction(
    () => document.getElementById("report-state").textContent.includes("принят"),
    { timeout: 15000 },
  );
  if (posts.length !== 1) fail(`запросов на отправку: ${posts.length}, ожидался один`);
  else pass("отправка происходит ровно одним запросом");

  const days = readdirSync(dir).filter((name) => /^\d{4}-/.test(name));
  const saved = days.flatMap((day) =>
    readdirSync(join(dir, day)).filter((f) => f.endsWith(".txt")),
  );
  if (saved.length !== 1) fail(`на диске файлов: ${saved.length}`);
  else pass("файл сохранён на диске вместе с описанием замечаний");

  await browser.close();

  // Лимит суток: пятая отправка проходит, шестая отбивается.
  const payload = (client) =>
    JSON.stringify({
      client,
      source: `<!doctype html><html><body>${"<section class='slide'>x</section>".repeat(20)}</body></html>`,
    });
  const client = "b".repeat(32);
  let accepted = 0;
  let refused = null;
  for (let i = 0; i < 7; i++) {
    const response = await fetch(`${base}api/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload(client),
    });
    const answer = await response.json();
    if (answer.ok) accepted++;
    else refused = answer.reason;
  }
  if (accepted !== 5) fail(`принято ${accepted} файлов вместо 5`);
  else pass(`лимит суток держится: принято 5, дальше отказ («${refused}»)`);

  const big = await fetch(`${base}api/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client: "c".repeat(32),
      source: "<html>" + "x".repeat(6 * 1024 * 1024) + "</html>",
    }),
  });
  if (big.status !== 413) fail(`файл больше 5 МБ принят со статусом ${big.status}`);
  else pass("файл больше 5 МБ отбивается");

  const noToken = await fetch(`${base}api/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: "<html>" + "x".repeat(300) + "</html>" }),
  });
  if (noToken.ok) fail("отправка без опознавательного токена принята");
  else pass("отправка без токена отбивается");

  const asGet = await fetch(`${base}api/report`);
  if (asGet.status !== 405) fail(`GET на приём отвечает ${asGet.status}`);
  else pass("читать присланное через тот же адрес нельзя");

  // Отзыв: только со своим секретом.
  const sent = await fetch(`${base}api/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload("d".repeat(32)),
  }).then((r) => r.json());
  const wrong = await fetch(`${base}api/report/${sent.id}`, {
    method: "DELETE",
    headers: { "X-Report-Secret": "e".repeat(32) },
  });
  if (wrong.status !== 403) fail(`чужой секрет принят со статусом ${wrong.status}`);
  else pass("отозвать чужую отправку нельзя");
  const mine = await fetch(`${base}api/report/${sent.id}`, {
    method: "DELETE",
    headers: { "X-Report-Secret": sent.secret },
  }).then((r) => r.json());
  if (!mine.ok) fail(`своя отправка не отзывается: ${mine.reason}`);
  else pass("свою отправку можно отозвать");
} finally {
  server.kill();
  rmSync(dir, { recursive: true, force: true });
}

console.log("");
if (problems.length) {
  console.log(`ПРОВАЛ (${problems.length}):`);
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}
console.log("добровольная отправка работает и ограничена");
