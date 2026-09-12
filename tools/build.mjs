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
  "src/engine/svg.js",
  "src/engine/extract.js",
  "src/engine/raster.js",
  "src/engine/validate.js",
  "src/engine/ooxml.js",
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

// Интерфейсу иконки нужны сразу, а весь набор lucide уезжает в лениво
// загружаемый движок. Поэтому в страницу вшивается только то, что рисует
// сам интерфейс: имена собираются из разметки и из ui.js, промах здесь
// означал бы пустой квадрат на видном месте.
const uiSource = read("src/app/ui.js");
const uiNames = new Set();
for (const [, name] of read("src/app/index.html").matchAll(/data-ui-icon="([a-z0-9-]+)"/g))
  uiNames.add(name);
for (const [, name] of uiSource.matchAll(/iconMarkup\(\s*["']([a-z0-9-]+)["']/g)) uiNames.add(name);
for (const [, block] of uiSource.matchAll(/NOTE_ICON = \{([^}]+)\}/g)) {
  for (const [, name] of block.matchAll(/["']([a-z0-9-]+)["']/g)) uiNames.add(name);
}

const ICONS = new Function(
  `${read("src/engine/icons.js").replace(/^window\./gm, "globalThis.")}; return globalThis.MPGA_ICONS;`,
)();
const uiIcons = {};
for (const name of [...uiNames].sort()) {
  if (!ICONS[name]) {
    console.error(
      `сборка остановлена: интерфейс просит иконку «${name}», которой нет в наборе lucide`,
    );
    process.exit(1);
  }
  uiIcons[name] = ICONS[name];
}
const appCode = `window.MPGA_UI_ICONS = ${JSON.stringify(uiIcons)};\n${data}\n${read("src/app/themes.js")}\n${uiSource}`;
const siteAppCode = `${appCode}\n${read("src/app/report.js")}`;
const styles = read("src/app/styles.css");
const template = read("src/app/index.html");
const meta = read("src/app/meta.html")
  .replaceAll("{{SITE}}", SITE)
  .replaceAll("{{VERSION}}", VERSION);

const CSP_BASE =
  "default-src 'none'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; " +
  "script-src 'self' 'unsafe-inline'; font-src 'self' data:; form-action 'none'; " +
  "frame-src 'self' data: blob:; base-uri 'none'";

function page({ head, scripts, canonical, report, connect, extraCss }) {
  return template
    .replaceAll("{{SITE}}", SITE)
    .replaceAll("{{VERSION}}", VERSION)
    .replace(
      "<!--CSP-->",
      () =>
        `<meta http-equiv="Content-Security-Policy" content="${CSP_BASE}; connect-src ${connect}">`,
    )
    .replace("<!--META-->", () => meta.replace("{{CANONICAL}}", canonical))
    .replace("<!--HEAD-->", () => head)
    .replace("<!--REPORT-->", () => report)
    .replace("<!--PRIVACY--> ", () => "")
    .replace("<!--PRIVACY-->", () =>
      report ? " Отправить файл мне можно только вручную — галочкой под замечаниями." : "",
    )
    .replace("<!--STYLES-->", () => `<style>\n${styles}\n${extraCss ?? ""}\n</style>`)
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

function assertOffline(html) {
  for (const [rule, why] of [
    [/\/api\/report/, "в офлайн-копии остался адрес приёма файлов"],
    [/report-agree/, "в офлайн-копии осталась форма отправки"],
    [/MPGA_REPORT_UI\s*=/, "в офлайн-копии остался код отправки"],
    [/MPGA_REPORT\s*=/, "в офлайн-копии осталась настройка приёма"],
    [/connect-src 'self'/, "офлайн-копии разрешена сеть"],
    [/id="report"/, "в офлайн-копии осталась форма отправки"],
  ]) {
    if (rule.test(html)) {
      console.error(`сборка остановлена: ${why}`);
      process.exit(1);
    }
  }
}

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist/site", { recursive: true });

// --- один файл: всё внутри, работает с диска и без сети ---
// Офлайн-копия не умеет отправлять ничего и никуда: кода приёма в ней нет, а
// `connect-src 'none'` запрещает браузеру любые запросы. Это не обещание в
// тексте, а свойство файла, которое видно в его исходнике.
const offline = page({
  head: "",
  canonical: `${SITE}/`,
  report: "",
  connect: "'none'",
  scripts: `<script>\n${safe(engineCode)}\n</script>\n<script>\n${safe(appCode)}\n</script>`,
});
guard(offline, "MPGA.html");
assertOffline(offline);
writeFileSync("dist/MPGA.html", offline);
const offlineHash = createHash("sha256").update(offline).digest("hex");
writeFileSync("dist/MPGA.html.sha256", `${offlineHash}  MPGA.html\n`);

// --- сайт: страница лёгкая, движок отдельным файлом с вечным кешем ---
const engineName = `engine-${hash8(engineCode)}.js`;
const appName = `app-${hash8(siteAppCode)}.js`;
writeFileSync(join("dist/site", engineName), engineCode);
writeFileSync(join("dist/site", appName), siteAppCode);

// Движок грузится не сразу: 933 КБ скриптов нужны только тому, кто реально
// собирает презентацию, а большинство пришедших из поиска просто читают
// страницу. Ссылка отдаётся приложению, оно подтягивает движок при первой
// конвертации и тихо, в простое, догружает его для работы без сети.
const online = page({
  head: "",
  report: read("src/app/report.html"),
  extraCss: read("src/app/report.css"),
  connect: "'self'",
  canonical: `${SITE}/`,
  scripts:
    `<script>window.MPGA_ENGINE_URL = "/${engineName}";` +
    `window.MPGA_REPORT = ${JSON.stringify({ url: "/api/report", maxBytes: 5 * 1024 * 1024, keepDays: 14 })};` +
    `</script>\n` +
    `<script src="/${appName}" defer></script>`,
});
guard(online, "site/index.html");
writeFileSync("dist/site/index.html", online);

copyFileSync("assets/og.png", "dist/site/og.png");

const article = read("src/app/guide.html")
  .replaceAll("{{SITE}}", SITE)
  .replace(
    "<!--CSP-->",
    () => `<meta http-equiv="Content-Security-Policy" content="${CSP_BASE}; connect-src 'none'">`,
  )
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
