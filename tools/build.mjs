import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const VERSION = JSON.parse(readFileSync("package.json", "utf8")).version;
const DATE = new Date().toISOString().slice(0, 10);
const SITE = process.env.MPGA_SITE_URL ?? "https://mpga.kiviuly.ru";

const read = (path) => readFileSync(path, "utf8");
const safe = (js) => js.replace(/<\/script/gi, "<\\/script");
const hash8 = (text) => createHash("sha256").update(text).digest("hex").slice(0, 8);

const ENGINE = [
  "src/engine/icons.js",
  "src/vendor/pptxgen.bundle.js",
  "src/engine/normalize.js",
  "src/engine/extract.js",
  "src/engine/raster.js",
  "src/engine/validate.js",
  "src/engine/pptx.js",
  "src/engine/convert.js",
];

const promptSource = read("ПРОМПТ.md");
const promptMatch = promptSource.match(/^---НАЧАЛО---\s*$([\s\S]*?)^---КОНЕЦ---\s*$/m);
if (!promptMatch) {
  console.error(
    "сборка остановлена: в ПРОМПТ.md не найдены строки-маркеры ---НАЧАЛО--- и ---КОНЕЦ---",
  );
  process.exit(1);
}
const prompt = promptMatch[1].trim();
if (prompt.length < 500) {
  console.error(
    `сборка остановлена: задание для нейросети вырезано неверно — ${prompt.length} символов`,
  );
  process.exit(1);
}

const legal = `
  <div>MPGA ${VERSION} · сборка ${DATE} · <a href="https://github.com/Aver005/make-pptx-great-again">исходный код и обновления</a></div>
  <div>Внутри работают библиотеки с открытыми лицензиями:
    PptxGenJS 4.0.1 (MIT, © Brent Ely), JSZip (MIT, © Stuk),
    набор иконок lucide (ISC, © Lucide Contributors, на основе Feather © Cole Bemis).
    Сам MPGA — лицензия MIT.</div>
`;

const data = `
window.MPGA_BUILD = ${JSON.stringify({ version: VERSION, date: DATE })};
window.MPGA_PROMPT = ${JSON.stringify(prompt)};
window.MPGA_DEMO = ${JSON.stringify(read("examples/demo.html"))};
window.MPGA_LEGAL = ${JSON.stringify(legal)};
`;

const engineCode = ENGINE.map(read).join("\n;\n");
const appCode = `${data}\n${read("src/app/ui.js")}`;
const styles = read("src/app/styles.css");
const template = read("src/app/index.html");
const meta = read("src/app/meta.html")
  .replaceAll("{{SITE}}", SITE)
  .replaceAll("{{VERSION}}", VERSION);

function page({ head, scripts, canonical }) {
  return template
    .replaceAll("{{SITE}}", SITE)
    .replaceAll("{{VERSION}}", VERSION)
    .replace("<!--META-->", () => meta.replace("{{CANONICAL}}", canonical))
    .replace("<!--HEAD-->", () => head)
    .replace("<!--STYLES-->", () => `<style>\n${styles}\n</style>`)
    .replace("<!--SCRIPTS-->", () => scripts);
}

function guard(html, what) {
  const markup = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  const banned = [
    [/\ssrc\s*=\s*["']https?:/i, "внешний ресурс в разметке"],
    [
      /<link\b[^>]*rel\s*=\s*["'](?:stylesheet|preload)[^>]*href\s*=\s*["']https?:/i,
      "внешняя таблица стилей",
    ],
    [/@import/i, "@import в стилях"],
    [/url\(\s*["']?https?:/i, "внешний url() в стилях"],
  ];
  for (const [rule, why] of banned) {
    const hit = rule.exec(markup);
    if (hit) {
      console.error(`сборка остановлена: ${why} в ${what} — ${hit[0]}`);
      process.exit(1);
    }
  }
  for (const rule of [/\bfetch\s*\(\s*["'`]https?:/i, /XMLHttpRequest[\s\S]{0,80}https?:/i]) {
    const hit = rule.exec(html);
    if (hit) {
      console.error(`сборка остановлена: код обращается в сеть в ${what} — ${hit[0].slice(0, 60)}`);
      process.exit(1);
    }
  }
}

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist/site", { recursive: true });

// --- один файл: всё внутри, работает с диска и без сети ---
const offline = page({
  head: "",
  canonical: `${SITE}/`,
  scripts: `<script>\n${safe(engineCode)}\n</script>\n<script>\n${safe(appCode)}\n</script>`,
});
guard(offline, "MPGA.html");
writeFileSync("dist/MPGA.html", offline);
const offlineHash = createHash("sha256").update(offline).digest("hex");
writeFileSync("dist/MPGA.html.sha256", `${offlineHash}  MPGA.html\n`);

// --- сайт: страница лёгкая, движок отдельным файлом с вечным кешем ---
const engineName = `engine-${hash8(engineCode)}.js`;
const appName = `app-${hash8(appCode)}.js`;
writeFileSync(join("dist/site", engineName), engineCode);
writeFileSync(join("dist/site", appName), appCode);

// Движок грузится не сразу: 933 КБ скриптов нужны только тому, кто реально
// собирает презентацию, а большинство пришедших из поиска просто читают
// страницу. Ссылка отдаётся приложению, оно подтягивает движок при первой
// конвертации и тихо, в простое, догружает его для работы без сети.
const online = page({
  head: "",
  canonical: `${SITE}/`,
  scripts:
    `<script>window.MPGA_ENGINE_URL = "/${engineName}";</script>\n` +
    `<script src="/${appName}" defer></script>`,
});
guard(online, "site/index.html");
writeFileSync("dist/site/index.html", online);

copyFileSync("assets/og.png", "dist/site/og.png");

const article = read("src/app/guide.html")
  .replaceAll("{{SITE}}", SITE)
  .replace("<!--META-->", () => meta.replace("{{CANONICAL}}", `${SITE}/guide`))
  .replace("<!--STYLES-->", () => `<style>\n${styles}\n${read("src/app/guide.css")}\n</style>`);
guard(article, "site/guide.html");
writeFileSync("dist/site/guide.html", article);

const pages = [
  { loc: `${SITE}/`, priority: "1.0" },
  { loc: `${SITE}/guide`, priority: "0.8" },
];
writeFileSync(
  "dist/site/sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    pages
      .map(
        (p) =>
          `  <url>\n    <loc>${p.loc}</loc>\n    <lastmod>${DATE}</lastmod>\n    <priority>${p.priority}</priority>\n  </url>`,
      )
      .join("\n") +
    `\n</urlset>\n`,
);
writeFileSync("dist/site/robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);

const size = (path) => (statSync(path).size / 1024).toFixed(0);
console.log(`dist/MPGA.html      ${size("dist/MPGA.html")} КБ — офлайн-копия одним файлом`);
console.log(
  `dist/site/index.html ${size("dist/site/index.html")} КБ + ${engineName} ${size(join("dist/site", engineName))} КБ`,
);
console.log(`sha256 ${offlineHash}`);
