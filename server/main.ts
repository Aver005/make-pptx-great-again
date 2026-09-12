import { readdirSync } from "node:fs";
import { join } from "node:path";
import pkg from "../package.json";
import { clientAddress, handleReport, handleRevoke, prune } from "./reports";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";
const DIST = "dist";
const SITE = join(DIST, "site");

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

// Файлы с хешем в имени можно кешировать навсегда: новая сборка — новое имя.
// Всё остальное перевыпускается, поэтому браузер обязан переспрашивать.
const FOREVER = "public, max-age=31536000, immutable";
const REVALIDATE = "no-cache";

type Asset = { body: Uint8Array; type: string; cache: string; etag: string };

async function load(path: string, cache: string): Promise<Asset> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    console.error(`нет ${path} — соберите сайт: bun run build`);
    process.exit(1);
  }
  const body = await file.bytes();
  const dot = path.lastIndexOf(".");
  return {
    body,
    type: TYPES[path.slice(dot)] ?? "application/octet-stream",
    cache,
    etag: `"${new Bun.CryptoHasher("sha256").update(body).digest("hex").slice(0, 32)}"`,
  };
}

const routes = new Map<string, Asset>();
for (const name of readdirSync(SITE)) {
  const hashed = /-[0-9a-f]{8}\.(js|css)$/.test(name);
  routes.set(`/${name}`, await load(join(SITE, name), hashed ? FOREVER : REVALIDATE));
}

const index = routes.get("/index.html")!;
routes.set("/", index);
const guide = routes.get("/guide.html");
if (guide) routes.set("/guide", guide);

const offline = await load(join(DIST, "MPGA.html"), REVALIDATE);
const checksum = new Bun.CryptoHasher("sha256").update(offline.body).digest("hex");
routes.set("/MPGA.html", offline);
routes.set("/MPGA.html.sha256", {
  body: new TextEncoder().encode(`${checksum}  MPGA.html\n`),
  type: TYPES[".txt"],
  cache: REVALIDATE,
  etag: `"${checksum.slice(0, 32)}"`,
});

function send(request: Request, asset: Asset, extra: Record<string, string> = {}): Response {
  if (request.headers.get("if-none-match") === asset.etag) {
    return new Response(null, {
      status: 304,
      headers: { ETag: asset.etag, "Cache-Control": asset.cache },
    });
  }
  const headers = {
    "Content-Type": asset.type,
    "Cache-Control": asset.cache,
    ETag: asset.etag,
    ...extra,
  };
  if (request.method === "HEAD") {
    return new Response(null, {
      headers: { ...headers, "Content-Length": String(asset.body.length) },
    });
  }
  return new Response(asset.body, { headers });
}

const REPORTS = process.env.REPORTS_ENABLED !== "0";

const server = Bun.serve({
  port: PORT,
  hostname: HOST,
  fetch(request, connection) {
    const { pathname } = new URL(request.url);

    if (pathname === "/api/report" || pathname.startsWith("/api/report/")) {
      if (!REPORTS) return new Response("приём файлов выключен", { status: 404 });
      if (pathname === "/api/report" && request.method === "POST") {
        return handleReport(
          request,
          clientAddress(request, connection.requestIP(request)?.address ?? "?"),
        );
      }
      if (pathname !== "/api/report" && request.method === "DELETE") {
        return handleRevoke(pathname.slice("/api/report/".length), request);
      }
      return new Response("только POST или DELETE", { status: 405 });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("только GET", { status: 405 });
    }

    if (pathname === "/download") {
      return send(request, offline, {
        "Content-Disposition": `attachment; filename="MPGA-${pkg.version}.html"`,
      });
    }

    const asset = routes.get(pathname);
    if (asset) return send(request, asset);

    // Иконка вшита в страницы как data:-ссылка, но браузер всё равно
    // один раз спрашивает /favicon.ico и пишет 404 в консоль.
    if (pathname === "/favicon.ico") return new Response(null, { status: 204 });

    if (pathname === "/health") {
      return new Response("ok", { headers: { "Content-Type": TYPES[".txt"] } });
    }

    return new Response("нет такой страницы", {
      status: 404,
      headers: { "Content-Type": TYPES[".txt"] },
    });
  },
});

if (REPORTS) {
  // Уборка идёт при старте и раз в сутки: контейнер живёт долго, а обещание
  // «хранится до двух недель» должен кто-то исполнять.
  prune().catch(() => {});
  setInterval(() => prune().catch(() => {}), 24 * 60 * 60 * 1000).unref();
}

console.log(
  `MPGA ${pkg.version} на http://${server.hostname}:${server.port} · ` +
    `страница ${(index.body.length / 1024) | 0} КБ, офлайн-копия ${(offline.body.length / 1024) | 0} КБ`,
);
