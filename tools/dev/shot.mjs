import { mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import puppeteer from "puppeteer-core";

const CHROME =
  process.env.MPGA_CHROME || "/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";
const dir = resolve(process.argv[2] || "out/shots");
mkdirSync(dir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox"],
});

async function shoot(name, view, steps = async () => {}) {
  const page = await browser.newPage();
  await page.setViewport(view);
  await page.goto("file://" + resolve("dist/MPGA.html"), { waitUntil: "load" });
  await new Promise((r) => setTimeout(r, 400));
  await steps(page);
  await page.evaluate(() => {
    const back = document.querySelector(".backdrop");
    back.style.position = "absolute";
    back.style.height = document.documentElement.scrollHeight + "px";
    for (const node of document.querySelectorAll("*")) {
      node.style.animationPlayState = "paused";
      node.style.animationDelay = "0s";
    }
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: join(dir, `${name}.png`), fullPage: view.full !== false });
  await page.close();
}

await shoot("desktop-idle", { width: 1280, height: 900 });
await shoot("desktop-result", { width: 1280, height: 900 }, async (page) => {
  await page.click("#demo");
  await page.waitForSelector("#result.on", { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1500));
});
await shoot("desktop-open", { width: 1280, height: 900 }, async (page) => {
  await page.click("#prompt-box summary");
  await new Promise((r) => setTimeout(r, 600));
});
await shoot("mobile-idle", { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 });
await shoot(
  "mobile-result",
  { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 },
  async (page) => {
    await page.click("#demo");
    await page.waitForSelector("#result.on", { timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1500));
  },
);
await browser.close();
console.log("снимки в", dir);
