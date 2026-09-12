import { mkdirSync } from "node:fs";
import puppeteer from "puppeteer-core";

const CHROME =
  process.env.MPGA_CHROME ?? "/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";
const [url, out, width] = process.argv.slice(2);
mkdirSync(out.replace(/\/[^/]+$/, ""), { recursive: true });
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: Number(width ?? 1280), height: 900 });
await page.goto(url, { waitUntil: "load" });
await new Promise((r) => setTimeout(r, 600));
await page.evaluate(() => {
  const back = document.querySelector(".backdrop");
  if (back) {
    back.style.position = "absolute";
    back.style.height = document.documentElement.scrollHeight + "px";
  }
});
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(out);
