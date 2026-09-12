import puppeteer from "puppeteer-core";

const CHROME =
  process.env.MPGA_CHROME ?? "/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";
const url = process.argv[2] ?? "http://127.0.0.1:3000/";
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
await page.goto(url, { waitUntil: "load" });

async function probe(label) {
  const samples = await page.evaluate(async () => {
    const fold = document.querySelector(".faq details.fold");
    const body = fold.querySelector(".fold-body");
    fold.querySelector("summary").click();
    const heights = [];
    for (let i = 0; i < 26; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      heights.push(Math.round(body.getBoundingClientRect().height));
    }
    return heights;
  });
  const unique = new Set(samples).size;
  const jump = samples[0] > 0 && samples[0] === samples.at(-1);
  console.log(
    `  ${label}: ${samples[0]} → ${samples.at(-1)} px, промежуточных значений ${unique}` +
      (jump ? " — РЫВОК" : unique > 4 ? " — плавно" : " — подозрительно"),
  );
  await new Promise((r) => setTimeout(r, 700));
}

await probe("первое раскрытие");
await probe("закрытие       ");
await probe("второе раскрытие");
await browser.close();
