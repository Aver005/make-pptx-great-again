import puppeteer from "puppeteer-core";

const CHROME =
  process.env.MPGA_CHROME ?? "/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";
const base = (process.argv[2] ?? "https://mpga.kiviuly.ru").replace(/\/$/, "");

const problems = [];
const fail = (text) => {
  problems.push(text);
  console.log(`    ✗ ${text}`);
};
const pass = (text) => console.log(`    ✓ ${text}`);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage();

async function checkPage(path, { expectSchema }) {
  const url = `${base}${path}`;
  console.log(`\n${url}`);
  const response = await page.goto(url, { waitUntil: "load" });
  if (!response.ok()) {
    fail(`страница отвечает ${response.status()}`);
    return;
  }

  const facts = await page.evaluate(() => {
    const meta = (selector) => document.querySelector(selector)?.getAttribute("content") ?? null;
    return {
      title: document.title,
      description: meta('meta[name="description"]'),
      canonical: document.querySelector('link[rel="canonical"]')?.href ?? null,
      ogTitle: meta('meta[property="og:title"]'),
      ogImage: meta('meta[property="og:image"]'),
      ogDescription: meta('meta[property="og:description"]'),
      twitterCard: meta('meta[name="twitter:card"]'),
      lang: document.documentElement.lang,
      h1: [...document.querySelectorAll("h1")].map((h) => h.textContent.trim()),
      h2count: document.querySelectorAll("h2").length,
      imagesWithoutAlt: [...document.images].filter((i) => !i.alt && !i.closest("[aria-hidden]"))
        .length,
      schema: [...document.querySelectorAll('script[type="application/ld+json"]')].map(
        (s) => s.textContent,
      ),
      links: [...document.querySelectorAll("a[href^='/']")].map((a) => a.getAttribute("href")),
      visibleWords: document.body.innerText.split(/\s+/).filter(Boolean).length,
      markupWords: (() => {
        const copy = document.body.cloneNode(true);
        for (const node of copy.querySelectorAll("script, style, template")) node.remove();
        return copy.textContent.split(/\s+/).filter(Boolean).length;
      })(),
    };
  });

  if (!facts.title || facts.title.length < 20)
    fail(`заголовок вкладки слишком короткий: «${facts.title}»`);
  else if (facts.title.length > 70)
    fail(`заголовок вкладки длиннее 70 знаков (${facts.title.length}), в выдаче обрежется`);
  else pass(`заголовок вкладки ${facts.title.length} знаков`);

  if (!facts.description) fail("нет meta description");
  else if (facts.description.length < 70 || facts.description.length > 200) {
    fail(`описание ${facts.description.length} знаков — нужно 70–200`);
  } else pass(`описание ${facts.description.length} знаков`);

  if (facts.canonical !== url && facts.canonical !== `${url}/`)
    fail(`canonical ведёт на ${facts.canonical}`);
  else pass("canonical на себя");

  if (!facts.ogTitle || !facts.ogDescription || !facts.ogImage)
    fail("неполная карточка Open Graph");
  else pass("карточка Open Graph заполнена");
  if (facts.twitterCard !== "summary_large_image") fail("нет twitter:card summary_large_image");

  if (facts.lang !== "ru") fail(`язык страницы объявлен как «${facts.lang}»`);
  if (facts.h1.length !== 1) fail(`заголовков h1: ${facts.h1.length} (нужен ровно один)`);
  else pass(`один h1: «${facts.h1[0].slice(0, 48)}…», подзаголовков h2: ${facts.h2count}`);

  if (facts.imagesWithoutAlt) fail(`картинок без alt: ${facts.imagesWithoutAlt}`);
  // Текст в свёрнутых блоках поисковик видит: он лежит в разметке, а не
  // подставляется скриптом. Поэтому меряем и то, и другое.
  if (facts.markupWords < 450) fail(`текста в разметке всего ${facts.markupWords} слов`);
  else pass(`текста ${facts.markupWords} слов в разметке, ${facts.visibleWords} видно сразу`);

  const types = [];
  for (const raw of facts.schema) {
    try {
      const parsed = JSON.parse(raw);
      const nodes = parsed["@graph"] ?? [parsed];
      for (const node of nodes) types.push(node["@type"]);
    } catch (error) {
      fail(`разметка schema.org не разбирается: ${error.message}`);
    }
  }
  for (const wanted of expectSchema) {
    if (!types.includes(wanted)) fail(`нет разметки ${wanted}`);
  }
  if (types.length) pass(`разметка schema.org: ${types.join(", ")}`);

  for (const href of new Set(facts.links)) {
    const linked = await fetch(`${base}${href}`, { method: "HEAD" });
    if (!linked.ok) fail(`внутренняя ссылка ${href} отвечает ${linked.status}`);
  }
  pass(`внутренние ссылки на месте (${new Set(facts.links).size})`);
}

await checkPage("/", { expectSchema: ["WebApplication", "HowTo", "FAQPage"] });
await checkPage("/guide", { expectSchema: ["TechArticle"] });

console.log("\nслужебные файлы");
const robots = await fetch(`${base}/robots.txt`).then((r) => r.text());
if (!robots.includes("Sitemap:")) fail("в robots.txt нет ссылки на карту сайта");
else pass("robots.txt со ссылкой на карту сайта");

const sitemap = await fetch(`${base}/sitemap.xml`).then((r) => r.text());
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (!urls.length) fail("карта сайта пуста");
else {
  for (const url of urls) {
    const response = await fetch(url, { method: "HEAD" });
    if (!response.ok) fail(`адрес из карты сайта отвечает ${response.status}: ${url}`);
  }
  pass(`в карте сайта ${urls.length} адреса, все отвечают`);
}

const og = await fetch(`${base}/og.png`, { method: "HEAD" });
if (!og.ok) fail("картинка для ссылок недоступна");
else pass(`картинка для ссылок ${(Number(og.headers.get("content-length")) / 1024) | 0} КБ`);

await browser.close();
console.log("");
if (problems.length) {
  console.log(`ПРОВАЛ (${problems.length}):`);
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}
console.log("разметка в порядке");
