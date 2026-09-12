/**
 * Приём добровольно присланных презентаций.
 *
 * Главное свойство: сюда попадает только то, что человек отправил сам,
 * поставив галочку. Офлайн-копия страницы этого кода не содержит вовсе, а её
 * `Content-Security-Policy` запрещает любые сетевые запросы — то есть
 * невозможность отправки там не обещание, а свойство файла.
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, statfs, writeFile } from "node:fs/promises";
import { join } from "node:path";

const DIR = process.env.REPORTS_DIR ?? "/var/lib/mpga/reports";
const LIMITS_FILE = join(DIR, "limits.json");

export const MAX_SOURCE = 5 * 1024 * 1024;
const MAX_BODY = 6 * 1024 * 1024;
const PER_CLIENT = Number(process.env.REPORTS_PER_CLIENT ?? 5);
const PER_IP = Number(process.env.REPORTS_PER_IP ?? 20);
const PER_DAY = Number(process.env.REPORTS_PER_DAY ?? 200);
const BYTES_PER_DAY = Number(process.env.REPORTS_BYTES_PER_DAY ?? 200 * 1024 * 1024);
const FREE_SPACE_FLOOR = Number(process.env.REPORTS_FREE_FLOOR ?? 2 * 1024 * 1024 * 1024);
const KEEP_DAYS = Number(process.env.REPORTS_KEEP_DAYS ?? 14);
const ORIGIN = process.env.REPORTS_ORIGIN ?? "";

type Counters = {
  day: string;
  salt: string;
  clients: Record<string, number>;
  ips: Record<string, number>;
  total: number;
  bytes: number;
};

let counters: Counters = { day: "", salt: "", clients: {}, ips: {}, total: 0, bytes: 0 };
let ready = false;

const today = () => new Date().toISOString().slice(0, 10);
const freshDay = (salt?: string): Counters => ({
  day: today(),
  salt: salt ?? randomUUID(),
  clients: {},
  ips: {},
  total: 0,
  bytes: 0,
});

/** Адрес нужен только как ключ лимита, поэтому хранится хешем со суточной солью. */
const ipKey = (address: string) =>
  createHash("sha256").update(`${counters.salt}:${address}`).digest("hex").slice(0, 16);

/** В описание присланного пишется только подсеть: точный адрес хранить незачем. */
function coarseAddress(address: string): string {
  if (address.includes(":")) return `${address.split(":").slice(0, 4).join(":")}::/56`;
  const parts = address.split(".");
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.0/24` : "?";
}

async function load() {
  if (ready) return;
  ready = true;
  try {
    const saved = JSON.parse(await readFile(LIMITS_FILE, "utf8")) as Counters;
    counters = saved.day === today() ? saved : freshDay();
  } catch {
    counters = freshDay();
  }
  prune().catch(() => {});
}

async function save() {
  try {
    await writeFile(LIMITS_FILE, JSON.stringify(counters));
  } catch (error) {
    console.error("не удалось сохранить счётчики отправок:", String(error));
  }
}

function rollover() {
  if (counters.day !== today()) counters = freshDay();
}

/**
 * Уборка. Обещание «хранится до двух недель» должен кто-то исполнять, иначе
 * это просто строчка в ответе.
 */
export async function prune() {
  const edge = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString().slice(0, 10);
  let removed = 0;
  for (const name of await readdir(DIR).catch(() => [])) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(name) || name >= edge) continue;
    await rm(join(DIR, name), { recursive: true, force: true }).catch(() => {});
    removed++;
  }
  if (removed) console.log(`убрано папок с присланными файлами: ${removed}`);
}

/** Свободное место спрашивается у файловой системы, а не считается по памяти. */
async function freeBytes(): Promise<number> {
  try {
    const fs = await statfs(DIR);
    return Number(fs.bavail) * Number(fs.bsize);
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function clientAddress(request: Request, fallback: string): string {
  const chain = request.headers.get("x-forwarded-for");
  if (!chain) return fallback;
  // Доверять можно только последнему значению: его дописывает Caddy, всё, что
  // стоит раньше, мог подставить клиент.
  const parts = chain
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.at(-1) ?? fallback;
}

const answer = (body: object, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
const refuse = (reason: string, status = 400) => answer({ ok: false, reason }, status);

function sameOrigin(request: Request): boolean {
  if (!ORIGIN) return true;
  const origin = request.headers.get("origin");
  return !origin || origin === ORIGIN;
}

export async function handleReport(request: Request, address: string): Promise<Response> {
  await load();
  rollover();

  if (!sameOrigin(request)) return refuse("запрос пришёл с чужой страницы", 403);

  const length = Number(request.headers.get("content-length") ?? 0);
  if (!length) return refuse("не указан размер", 411);
  if (length > MAX_BODY) return refuse("файл больше 5 МБ", 413);
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    return refuse("ожидается application/json", 415);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return refuse("тело запроса не разбирается");
  }

  const body = payload as { client?: unknown; source?: unknown; note?: unknown; stats?: unknown };
  const client =
    typeof body.client === "string" && /^[0-9a-f]{32}$/.test(body.client) ? body.client : null;
  const source = typeof body.source === "string" ? body.source : null;
  if (!client) return refuse("нет опознавательного токена");
  if (!source) return refuse("нет файла");
  if (source.length > MAX_SOURCE) return refuse("файл больше 5 МБ", 413);
  if (source.length < 200) return refuse("это не похоже на презентацию");
  if (!/<html|<!doctype|<section/i.test(source)) return refuse("это не похоже на HTML-страницу");

  if ((await freeBytes()) < FREE_SPACE_FLOOR + source.length) {
    return refuse("на сервере кончается место, попробуйте позже", 507);
  }
  if (counters.bytes + source.length > BYTES_PER_DAY)
    return refuse("на сегодня принято достаточно, попробуйте завтра", 429);
  if (counters.total >= PER_DAY)
    return refuse("сегодня принято слишком много файлов, попробуйте завтра", 429);
  if ((counters.clients[client] ?? 0) >= PER_CLIENT) {
    return refuse(`можно отправить не больше ${PER_CLIENT} файлов в сутки`, 429);
  }
  const addressKey = ipKey(address);
  if ((counters.ips[addressKey] ?? 0) >= PER_IP) {
    return refuse("с этого адреса сегодня отправлено слишком много файлов", 429);
  }

  const day = today();
  const id = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  const secret = randomUUID().replace(/-/g, "");
  const folder = join(DIR, day);
  try {
    await mkdir(folder, { recursive: true });
    // Расширение намеренно .txt: присланное никогда никому не отдаётся, но если
    // каталог однажды окажется под веб-сервером, это будет текст, а не страница.
    await writeFile(join(folder, `${id}.txt`), source, "utf8");
    await writeFile(
      join(folder, `${id}.json`),
      JSON.stringify(
        {
          id,
          at: new Date().toISOString(),
          client,
          // Секрет нужен, чтобы человек мог отозвать отправку, не имея аккаунта.
          secret: createHash("sha256").update(secret).digest("hex"),
          network: coarseAddress(address),
          agent: (request.headers.get("user-agent") ?? "").slice(0, 200),
          note: typeof body.note === "string" ? body.note.slice(0, 500) : "",
          stats: typeof body.stats === "object" && body.stats ? body.stats : null,
          bytes: source.length,
        },
        null,
        2,
      ),
      "utf8",
    );
  } catch (error) {
    console.error("не удалось сохранить присланный файл:", String(error));
    return refuse("не получилось сохранить, попробуйте позже", 500);
  }

  counters.clients[client] = (counters.clients[client] ?? 0) + 1;
  counters.ips[addressKey] = (counters.ips[addressKey] ?? 0) + 1;
  counters.total += 1;
  counters.bytes += source.length;
  await save();

  console.log(`принят файл ${id}: ${(source.length / 1024) | 0} КБ, за сутки ${counters.total}`);
  return answer({ ok: true, id, secret, keepDays: KEEP_DAYS }, 201);
}

/** Отзыв отправки: по номеру и секрету, который знает только отправивший. */
export async function handleRevoke(id: string, request: Request): Promise<Response> {
  if (!/^[0-9a-z]+-[0-9a-f]{8}$/.test(id)) return refuse("неверный номер", 400);
  const secret = request.headers.get("x-report-secret") ?? "";
  if (!/^[0-9a-f]{32}$/.test(secret)) return refuse("нет секрета отправки", 401);
  const digest = createHash("sha256").update(secret).digest("hex");

  for (const day of await readdir(DIR).catch(() => [])) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const meta = join(DIR, day, `${id}.json`);
    if (!(await stat(meta).catch(() => null))) continue;
    try {
      const saved = JSON.parse(await readFile(meta, "utf8")) as { secret?: string };
      if (saved.secret !== digest) return refuse("секрет не подходит", 403);
      await rm(join(DIR, day, `${id}.txt`), { force: true });
      await rm(meta, { force: true });
      console.log(`отозван файл ${id}`);
      return answer({ ok: true });
    } catch {
      return refuse("не получилось удалить, попробуйте позже", 500);
    }
  }
  return refuse("такого номера нет", 404);
}

export function reportsLimits() {
  return { perClient: PER_CLIENT, maxSource: MAX_SOURCE, keepDays: KEEP_DAYS };
}
