import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import puppeteer from "puppeteer-core";

const CHROME =
  process.env.MPGA_CHROME ?? "/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";
mkdirSync("assets", { recursive: true });

const card = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;background:#0c0a0a;color:#f2f1ef;
  font:400 16px/1.5 -apple-system,"Segoe UI",Roboto,Arial,sans-serif;position:relative;overflow:hidden}
.grid{position:absolute;inset:-20%;background-image:
  linear-gradient(to right,rgba(255,255,255,.04) 1px,transparent 1px),
  linear-gradient(to bottom,rgba(255,255,255,.04) 1px,transparent 1px);
  background-size:96px 54px;transform:rotate(0deg)}
.aura{position:absolute;width:900px;height:900px;top:-380px;left:-260px;border-radius:50%;
  background:radial-gradient(circle,rgba(255,77,46,.22),rgba(255,77,46,0) 62%)}
.wrap{position:relative;padding:74px 80px;height:100%;display:flex;flex-direction:column;justify-content:space-between}
.logo{font-size:30px;font-weight:700;letter-spacing:-.035em;display:flex;align-items:center;gap:6px}
.logo i{width:11px;height:11px;border-radius:50%;background:#ff4d2e;display:block}
h1{font-size:66px;line-height:1.06;letter-spacing:-.03em;font-weight:700;max-width:15ch}
h1 em{font-style:normal;color:#ff4d2e}
p{font-size:25px;color:#b3afab;max-width:30ch;margin-top:22px}
.deck{position:absolute;right:76px;top:196px;width:330px;height:250px}
.mini{position:absolute;width:300px;height:169px;border-radius:12px;
  background:linear-gradient(160deg,#fbfbfa,#e7e6e3);box-shadow:0 24px 60px rgba(0,0,0,.55)}
.m1{transform:rotate(-8deg) translate(-26px,26px);opacity:.45}
.m2{transform:rotate(-3deg) translate(-10px,10px);opacity:.7}
.m3{transform:rotate(4deg);background:#fff}
.m3 .bar{position:absolute;left:26px;top:30px;width:96px;height:10px;border-radius:5px;background:#ff4d2e}
.m3 .l1{position:absolute;left:26px;top:58px;width:190px;height:8px;border-radius:4px;background:#cfcdc9}
.m3 .l2{position:absolute;left:26px;top:76px;width:140px;height:8px;border-radius:4px;background:#dedcd8}
.m3 .sq{position:absolute;top:104px;width:76px;height:38px;border-radius:7px;background:#e8e6e2}
.foot{font-size:22px;color:#918c86}
.foot b{color:#f2f1ef;font-weight:600}
</style></head><body>
<div class="grid"></div><div class="aura"></div>
<div class="wrap">
  <div class="logo">MPGA<i></i></div>
  <div>
    <h1>Презентация из нейросети — <em>в настоящий PowerPoint</em></h1>
    <p>Текст и фигуры остаются объектами, а не картинкой</p>
  </div>
  <div class="foot"><b>mpga.kiviuly.ru</b> · бесплатно, без установки, без интернета</div>
</div>
<div class="deck">
  <div class="mini m1"></div><div class="mini m2"></div>
  <div class="mini m3"><div class="bar"></div><div class="l1"></div><div class="l2"></div>
    <div class="sq" style="left:26px"></div><div class="sq" style="left:112px"></div><div class="sq" style="left:198px"></div></div>
</div>
</body></html>`;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
await page.setContent(card, { waitUntil: "load" });
await page.screenshot({ path: resolve("assets/og.png") });
await browser.close();
console.log("assets/og.png готов");
