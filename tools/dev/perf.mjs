import puppeteer from "puppeteer-core";

const CHROME =
  process.env.MPGA_CHROME ?? "/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox"],
});

async function measure(url, label) {
  const page = await browser.newPage();
  const client = await page.createCDPSession();
  await client.send("Network.enable");
  await client.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 200,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (1 * 1024 * 1024) / 8,
  });
  await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.setViewport({ width: 1280, height: 800 });
  let bytes = 0;
  page.on("response", async (response) => {
    try {
      bytes += Number(response.headers()["content-length"] ?? 0);
    } catch {}
  });
  await page.evaluateOnNewDocument(() => {
    window.__lcp = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__lcp = entry.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
  });
  await page.goto(url, { waitUntil: "load" });
  const metrics = await page.evaluate(() => {
    const paint = performance
      .getEntriesByType("paint")
      .find((e) => e.name === "first-contentful-paint");
    const nav = performance.getEntriesByType("navigation")[0];
    return {
      fcp: paint ? Math.round(paint.startTime) : null,
      lcp: Math.round(window.__lcp),
      domReady: Math.round(nav.domContentLoadedEventEnd),
      load: Math.round(nav.loadEventEnd),
      transferred: Math.round(nav.transferSize / 1024),
    };
  });
  const atLoad = bytes;
  await new Promise((done) => setTimeout(done, 6000));
  console.log(
    `  ${label.padEnd(26)} первая отрисовка ${String(metrics.fcp).padStart(4)} мс · ` +
      `главный элемент ${String(metrics.lcp).padStart(4)} мс · ` +
      `получено ${String((atLoad / 1024) | 0).padStart(4)} КБ, через 6 с — ${(bytes / 1024) | 0} КБ`,
  );
  await page.close();
}

console.log("сеть 1,6 Мбит/с с задержкой 200 мс, процессор замедлен вчетверо:");
await measure(process.argv[2] ?? "http://127.0.0.1:3000/", "сайт (движок отдельно)");
await measure((process.argv[2] ?? "http://127.0.0.1:3000/") + "MPGA.html", "один файл (как было)");
await browser.close();
