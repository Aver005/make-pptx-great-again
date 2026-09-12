import pkg from "../package.json";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";
const DIST = new URL("../dist/", import.meta.url);

const pageFile = Bun.file(new URL("MPGA.html", DIST));
if (!(await pageFile.exists())) {
  console.error("нет dist/MPGA.html — соберите его: bun run build");
  process.exit(1);
}

// Страница читается в память один раз: она неизменна внутри образа, а так
// каждый запрос отдаётся без обращения к диску.
const page = await pageFile.bytes();
const hash = new Bun.CryptoHasher("sha256").update(page).digest("hex");
const etag = `"${hash.slice(0, 32)}"`;
const fileName = `MPGA-${pkg.version}.html`;

const BASE = {
  "Content-Type": "text/html; charset=utf-8",
  // Страницу нужно перевыпускать сразу: у неё один URL на все версии, и
  // закешированная навсегда копия означала бы, что исправленный баг
  // до человека не доедет. ETag делает повторный заход дешёвым.
  "Cache-Control": "no-cache",
  ETag: etag,
};

function servePage(request: Request, extra: Record<string, string> = {}): Response {
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": "no-cache" } });
  }
  const headers = { ...BASE, ...extra };
  if (request.method === "HEAD") {
    return new Response(null, { headers: { ...headers, "Content-Length": String(page.length) } });
  }
  return new Response(page, { headers });
}

const server = Bun.serve({
  port: PORT,
  hostname: HOST,
  fetch(request) {
    const { pathname } = new URL(request.url);

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("только GET", { status: 405 });
    }

    if (pathname === "/" || pathname === "/index.html" || pathname === "/MPGA.html") {
      return servePage(request);
    }

    if (pathname === "/download") {
      return servePage(request, {
        "Content-Disposition": `attachment; filename="${fileName}"`,
      });
    }

    if (pathname === "/MPGA.html.sha256") {
      return new Response(`${hash}  MPGA.html\n`, {
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" },
      });
    }

    // Иконка вшита в страницу как data:-ссылка, но браузер всё равно один раз
    // спрашивает /favicon.ico и пишет 404 в консоль.
    if (pathname === "/favicon.ico") {
      return new Response(null, { status: 204 });
    }

    if (pathname === "/health") {
      return new Response("ok", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }

    return new Response("нет такой страницы", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  },
});

console.log(`MPGA ${pkg.version} на http://${server.hostname}:${server.port} · ${(page.length / 1024) | 0} КБ`);
