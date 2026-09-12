
window.MPGA_BUILD = {"version":"0.1.0","date":"2026-09-12"};
window.MPGA_PROMPT = "Сделай презентацию на тему: «ВПИШИТЕ ТЕМУ». Количество слайдов: 10.\n\nОтвет дай одним HTML-файлом целиком, без пояснений до и после кода.\nФайл будет превращён в PowerPoint автоматической программой, поэтому строго\nсоблюдай правила ниже — иначе слайды поедут.\n\nПРАВИЛА ФАЙЛА\n1. Один файл: <!doctype html>, весь CSS внутри одного тега <style> в <head>.\n2. Первой строкой в <head> добавь: <meta name=\"mpga-contract\" content=\"1\">\n3. Ничего не подключай из интернета: ни шрифтов, ни библиотек, ни картинок по\n   ссылке. Никаких <script src=...>, <link rel=stylesheet href=...>, <img src=\"http...\">.\n4. Шрифт только такой: font-family: Arial, sans-serif.\n\nСЛАЙДЫ\n5. Каждый слайд — <section class=\"slide\">. Ровно 10 штук подряд, без обёрток\n   вокруг них, кроме одного общего <main>.\n6. Размер слайда задай один раз в CSS:\n   .slide{width:1160px;height:652.5px;position:relative;overflow:hidden;\n   background:#fff;margin:0 auto 24px;padding:44px 62px;box-sizing:border-box}\n   Не используй vw, vh, %, min(), max(), calc() от ширины окна и медиазапросы:\n   размер слайда должен быть постоянным.\n7. Всё содержимое слайда должно помещаться внутрь этих 1160×652.5 с запасом.\n   Не рассчитывай на прокрутку.\n\nЧТО МОЖНО\n8. Текст: h1, h2, p, b, span, small, li. Выделение — <b> внутри абзаца.\n9. Раскладка: display:flex и display:grid, position:absolute внутри слайда.\n10. Фигуры: обычные div с background, border, border-radius.\n11. Иконки: <i data-lucide=\"имя\"></i> — названия из набора lucide\n    (globe, database, library, search, file-text, users, book-open, check,\n    lightbulb, target, settings, chart-line и другие). Ничего подключать не надо.\n12. Схемы и диаграммы: inline <svg viewBox=\"0 0 900 290\"> прямо в слайде.\n    Подписи внутри схемы делай тегом <text> — они останутся редактируемыми.\n\nЧЕГО НЕЛЬЗЯ\n13. Градиенты (linear-gradient), тени (box-shadow), полупрозрачность (rgba с\n    альфой, opacity), фильтры, анимации — их PowerPoint не получит.\n14. transform: rotate/scale у блоков с текстом.\n15. Картинки-фотографии. Иллюстрируй иконками и схемами.\n16. Таблицы через <table> — вместо них сетка из div.\n\nТЕКСТ\n17. Короткие подписи (в карточках, на схемах) пиши так, чтобы они помещались в\n    одну строку своей ширины. Лучше 2–3 слова.\n18. Длинные абзацы — только в широких блоках на всю ширину слайда.\n19. Язык — русский. Никакой латиницы кроме названий и терминов.\n\nСОДЕРЖАНИЕ\n20. Слайд 1 — титульный: тема, подзаголовок, автор.\n21. Слайды 2–9 — раскрытие темы: определения, классификации, схема процесса,\n    примеры, сравнение, выводы. Разнообразь: где-то сетка карточек, где-то\n    список, где-то схема.\n22. Слайд 10 — заключение.\n23. На каждом слайде: короткий заголовок (h2) и не больше 60 слов текста.";
window.MPGA_DEMO = "<!doctype html>\n<html lang=\"ru\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"mpga-contract\" content=\"1\">\n<title>Как работает поиск в интернете</title>\n<style>\n*{box-sizing:border-box}\nbody{margin:0;background:#eef0f2;font-family:Arial,sans-serif;color:#1b2030}\n.slide{width:1160px;height:652.5px;position:relative;overflow:hidden;background:#fff;\n       margin:0 auto 24px;padding:48px 64px;border:1px solid #dcdfe3}\n.slide::before{content:\"\";position:absolute;left:0;top:0;bottom:0;width:8px;background:#254c6e}\n.ey{font-size:11px;font-weight:bold;letter-spacing:.14em;color:#254c6e;text-transform:uppercase;margin-bottom:12px}\nh1{font-size:52px;line-height:1.04;margin:0 0 16px}\nh2{font-size:34px;line-height:1.1;margin:0 0 20px}\np{font-size:17px;line-height:1.45;color:#4a5262;margin:0 0 12px}\n.lead{background:#f5f7fa;border-left:5px solid #254c6e;padding:14px 20px;font-size:15px;color:#4a5262}\n.num{position:absolute;right:32px;bottom:20px;font-size:11px;color:#8b93a1}\n.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:26px}\n.card{background:#f7f9fb;border:1px solid #dbe2e9;padding:22px;height:170px;display:flex;\n      flex-direction:column;align-items:center;justify-content:center;text-align:center}\n.card i{width:26px;height:26px;color:#254c6e;margin-bottom:12px;stroke-width:1.8}\n.card b{font-size:17px}\n.card small{display:block;color:#6b7481;font-size:13px;line-height:1.35;margin-top:8px}\n.author{position:absolute;left:64px;bottom:48px;font-size:14px;color:#6b7481}\n.steps{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:22px}\n.step-item{border:1px solid #dbe2e9;background:#f7f9fb;padding:16px 18px}\n.step-item b{font-size:16px;color:#254c6e}\n.step-item span{display:block;font-size:13px;color:#6b7481;margin-top:5px;line-height:1.35}\n</style>\n</head>\n<body>\n<main>\n\n<section class=\"slide\">\n  <div class=\"ey\">Учебная презентация</div>\n  <h1>Как работает поиск<br>в интернете</h1>\n  <p style=\"font-size:20px;max-width:760px\">От запроса в строке браузера до списка ссылок проходит меньше секунды — и три больших этапа работы.</p>\n  <div class=\"author\">Пример презентации, собранной через MPGA</div>\n  <div class=\"num\">1</div>\n</section>\n\n<section class=\"slide\">\n  <div class=\"ey\">Слайд 2 · Устройство</div>\n  <h2>Три части поисковой системы</h2>\n  <div class=\"lead\">Поисковик не ищет по интернету в момент запроса. Он ищет по своей заранее собранной копии — индексу.</div>\n  <div class=\"cards\">\n    <div class=\"card\"><i data-lucide=\"globe\"></i><b>Робот</b><small>Обходит сайты и скачивает страницы</small></div>\n    <div class=\"card\"><i data-lucide=\"database\"></i><b>Индекс</b><small>Хранит слова и адреса страниц</small></div>\n    <div class=\"card\"><i data-lucide=\"search\"></i><b>Поиск</b><small>Отбирает и ранжирует ответы</small></div>\n  </div>\n  <div class=\"num\">2</div>\n</section>\n\n<section class=\"slide\">\n  <div class=\"ey\">Слайд 3 · Процесс</div>\n  <h2>Путь запроса</h2>\n  <div class=\"lead\">Запрос превращается в набор слов, слова находятся в индексе, а страницы выстраиваются по оценке полезности.</div>\n  <div style=\"margin-top:18px\">\n  <svg viewBox=\"0 0 1000 260\" style=\"width:100%;height:260px\">\n    <rect x=\"10\" y=\"70\" width=\"210\" height=\"110\" rx=\"10\" fill=\"#f5f7fa\" stroke=\"#254c6e\" stroke-width=\"3\"/>\n    <text x=\"115\" y=\"120\" text-anchor=\"middle\" font-size=\"17\" font-weight=\"700\" fill=\"#1b2030\">Запрос</text>\n    <text x=\"115\" y=\"145\" text-anchor=\"middle\" font-size=\"13\" fill=\"#6b7481\">слова пользователя</text>\n    <path d=\"M232 125H288\" stroke=\"#6f8ca4\" stroke-width=\"4\"/><path d=\"M274 112l18 13-18 13\" fill=\"none\" stroke=\"#6f8ca4\" stroke-width=\"4\"/>\n    <rect x=\"300\" y=\"70\" width=\"210\" height=\"110\" rx=\"10\" fill=\"#f5f7fa\" stroke=\"#254c6e\" stroke-width=\"3\"/>\n    <text x=\"405\" y=\"120\" text-anchor=\"middle\" font-size=\"17\" font-weight=\"700\" fill=\"#1b2030\">Индекс</text>\n    <text x=\"405\" y=\"145\" text-anchor=\"middle\" font-size=\"13\" fill=\"#6b7481\">где встречаются слова</text>\n    <path d=\"M522 125H578\" stroke=\"#6f8ca4\" stroke-width=\"4\"/><path d=\"M564 112l18 13-18 13\" fill=\"none\" stroke=\"#6f8ca4\" stroke-width=\"4\"/>\n    <rect x=\"590\" y=\"70\" width=\"210\" height=\"110\" rx=\"10\" fill=\"#f5f7fa\" stroke=\"#254c6e\" stroke-width=\"3\"/>\n    <text x=\"695\" y=\"120\" text-anchor=\"middle\" font-size=\"17\" font-weight=\"700\" fill=\"#1b2030\">Оценка</text>\n    <text x=\"695\" y=\"145\" text-anchor=\"middle\" font-size=\"13\" fill=\"#6b7481\">насколько страница полезна</text>\n    <path d=\"M812 125H868\" stroke=\"#6f8ca4\" stroke-width=\"4\"/><path d=\"M854 112l18 13-18 13\" fill=\"none\" stroke=\"#6f8ca4\" stroke-width=\"4\"/>\n    <circle cx=\"935\" cy=\"125\" r=\"55\" fill=\"#e7eef5\" stroke=\"#254c6e\" stroke-width=\"3\"/>\n    <text x=\"935\" y=\"131\" text-anchor=\"middle\" font-size=\"15\" font-weight=\"700\" fill=\"#1b2030\">Ответ</text>\n  </svg>\n  </div>\n  <div class=\"num\">3</div>\n</section>\n\n<section class=\"slide\">\n  <div class=\"ey\">Слайд 4 · Выводы</div>\n  <h2>Что стоит запомнить</h2>\n  <div class=\"steps\">\n    <div class=\"step-item\"><b>Поиск идёт по индексу</b><span>Страница, которую робот не обошёл, в результатах не появится.</span></div>\n    <div class=\"step-item\"><b>Порядок ссылок — это оценка</b><span>Первое место означает оценку алгоритма, а не истину.</span></div>\n    <div class=\"step-item\"><b>Слова запроса важны</b><span>Точные термины дают точные ответы, общие слова — общие.</span></div>\n    <div class=\"step-item\"><b>Источник нужно проверять</b><span>Автор, дата и происхождение текста важнее позиции в выдаче.</span></div>\n  </div>\n  <div class=\"lead\" style=\"margin-top:24px\">Поисковая система экономит время, но ответственность за выбор источника остаётся на человеке.</div>\n  <div class=\"num\">4</div>\n</section>\n\n</main>\n</body>\n</html>\n";
window.MPGA_LEGAL = "\n  <div>MPGA 0.1.0 · сборка 2026-09-12 · <a href=\"https://github.com/Aver005/make-pptx-great-again\">исходный код и обновления</a></div>\n  <div>Внутри работают библиотеки с открытыми лицензиями:\n    PptxGenJS 4.0.1 (MIT, © Brent Ely), JSZip (MIT, © Stuk),\n    набор иконок lucide (ISC, © Lucide Contributors, на основе Feather © Cole Bemis).\n    Сам MPGA — лицензия MIT.</div>\n";

(() => {
  const PRISTINE = "<!doctype html>\n" + document.documentElement.outerHTML;
  const $ = (id) => document.getElementById(id);
  const BUILD = window.MPGA_BUILD || { version: "dev", date: "" };
  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let current = null;

  /* ---------- иконки ---------- */

  function iconMarkup(name, cls) {
    const body = (window.MPGA_ICONS || {})[name];
    if (!body) return "";
    return (
      `<svg class="${cls || ""}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"` +
      ' fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"' +
      ` stroke-linejoin="round" aria-hidden="true">${body}</svg>`
    );
  }

  function paintUiIcons(root = document) {
    for (const node of root.querySelectorAll("[data-ui-icon]")) {
      const markup = iconMarkup(node.getAttribute("data-ui-icon"), node.className);
      if (!markup) {
        node.remove();
        continue;
      }
      const holder = document.createElement("div");
      holder.innerHTML = markup;
      node.replaceWith(holder.firstElementChild);
    }
  }

  /* ---------- мелочи ---------- */

  function esc(text) {
    return String(text).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  }

  function plural(n, one, few, many) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
    return many;
  }

  function setStatus(text, busy, alarming) {
    const box = $("status");
    box.classList.toggle("on", !!text);
    box.classList.toggle("bad", !!alarming);
    box.setAttribute("aria-live", alarming ? "assertive" : "polite");
    box.innerHTML = text
      ? (busy ? '<div class="track"></div>' : "") +
        (alarming ? iconMarkup("circle-alert") : "") +
        (alarming ? `<div>${text}</div>` : text)
      : "";
  }

  function fileName(title) {
    const clean = (title || "Презентация")
      .replace(/[\\/:*?"<>|]+/g, " ")
      .trim()
      .slice(0, 60);
    return `${clean || "Презентация"}.pptx`;
  }

  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function copy(text, button, label) {
    const old = button.innerHTML;
    button.style.minWidth = `${button.getBoundingClientRect().width}px`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    button.classList.add("copied");
    button.innerHTML = `${iconMarkup("check")}<span>${esc(label || "Скопировано")}</span>`;
    setTimeout(() => {
      button.innerHTML = old;
      button.classList.remove("copied");
      button.style.minWidth = "";
    }, 2200);
  }

  /* ---------- плавное раскрытие ---------- */

  function bindFolds() {
    for (const fold of document.querySelectorAll("details.fold")) {
      const summary = fold.querySelector("summary");
      const body = fold.querySelector(".fold-body");
      summary.addEventListener("click", (event) => {
        if (REDUCED || !fold.open) return;
        event.preventDefault();
        fold.classList.add("closing");
        let closed = false;
        const done = () => {
          if (closed) return;
          closed = true;
          fold.open = false;
          fold.classList.remove("closing");
          body.removeEventListener("transitionend", done);
        };
        body.addEventListener("transitionend", done);
        setTimeout(done, 420);
      });
    }
  }

  /* ---------- результат ---------- */

  function layoutPreview() {
    const host = $("slides");
    const ir = current && current.ir;
    if (!ir) return;
    const first = host.querySelector(".frame");
    if (!first) return;
    const width = first.clientWidth;
    if (!width) return;
    const scale = width / ir.slideW;
    for (const frame of host.querySelectorAll(".frame")) {
      frame.style.height = `${Math.round(ir.slideH * scale)}px`;
      frame.firstElementChild.style.transform = `scale(${scale})`;
    }
  }

  function renderPreview(ir) {
    const host = $("slides");
    host.innerHTML = "";
    ir.slides.forEach((slide, index) => {
      const card = document.createElement("div");
      card.className = "thumb";
      card.style.setProperty("--i", Math.min(index, 12));
      const frame = document.createElement("div");
      frame.className = "frame";
      const stage = document.createElement("div");
      stage.className = "stage";
      stage.style.cssText =
        `width:${ir.slideW}px;height:${ir.slideH}px;` +
        `background:${slide.background ? "#" + slide.background : "#fff"}`;

      for (const box of slide.boxes) {
        const node = document.createElement("div");
        let css = `left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px;`;
        if (box.fill) css += `background:#${box.fill};`;
        if (box.stroke) css += `border:${box.strokeW}px solid #${box.stroke};`;
        if (box.radius === -1) css += "border-radius:50%;";
        else if (box.radius > 0) css += `border-radius:${box.radius}px;`;
        if (box.rot) css += `transform:rotate(${box.rot}deg);`;
        node.style.cssText = css;
        stage.appendChild(node);
      }
      for (const image of slide.images) {
        if (!image.data) continue;
        const node = document.createElement("img");
        node.src = image.data;
        node.alt = "";
        node.style.cssText =
          `left:${image.x}px;top:${image.y}px;width:${image.w}px;height:${image.h}px` +
          (image.rot ? `;transform:rotate(${image.rot}deg)` : "");
        stage.appendChild(node);
      }
      for (const text of slide.texts) {
        const node = document.createElement("div");
        node.className = "t";
        const first = text.runs.find((r) => !r.br) || {};
        node.style.cssText =
          `left:${text.x}px;top:${text.y}px;width:${text.w}px;height:${text.h}px;` +
          `font:${first.bold ? "700" : "400"} ${first.size}px/${text.lh}px Arial,sans-serif;` +
          `color:#${first.color || "000"};text-align:${text.align};` +
          `display:flex;align-items:center;justify-content:${
            text.align === "center"
              ? "center"
              : text.align === "right" || text.align === "end"
                ? "flex-end"
                : "flex-start"
          };`;
        node.innerHTML =
          "<span>" +
          text.runs
            .map((run) =>
              run.br
                ? "<br>"
                : `<span style="font-weight:${run.bold ? 700 : 400};font-size:${run.size}px;color:#${run.color};` +
                  `${run.italic ? "font-style:italic;" : ""}${run.spacing > 0.1 ? `letter-spacing:${run.spacing}px;` : ""}">` +
                  esc(run.text) +
                  "</span>",
            )
            .join("") +
          "</span>";
        stage.appendChild(node);
      }
      frame.appendChild(stage);
      card.appendChild(frame);
      const num = document.createElement("div");
      num.className = "no";
      num.textContent = slide.index + 1;
      card.appendChild(num);
      host.appendChild(card);
    });
    requestAnimationFrame(layoutPreview);
  }

  const NOTE_ICON = {
    error: "circle-alert",
    warn: "triangle-alert",
    info: "info",
    good: "circle-check",
  };

  function renderNotes(warnings) {
    const host = $("notes");
    host.innerHTML = "";
    const visible = warnings.filter((w) => w.level !== "info" || w.always);
    const fix = window.MPGA.fixMessage(warnings);
    let index = 0;

    const add = (level, html) => {
      const item = document.createElement("li");
      item.className = `note ${level}`;
      item.style.setProperty("--i", index++);
      item.innerHTML = iconMarkup(NOTE_ICON[level] || "info") + `<div>${html}</div>`;
      host.appendChild(item);
      return item;
    };

    if (!visible.length)
      add(
        "good",
        "Ничего не потерялось: весь текст и все картинки со страницы попали в презентацию.",
      );
    for (const note of visible) {
      add(
        note.level === "error" ? "error" : "warn",
        esc(note.text) + (note.count > 1 ? ` <span class="count">(${note.count} раза)</span>` : ""),
      );
    }
    if (fix) {
      const item = add(
        "info",
        "Что-то перенеслось не так? Скопируйте замечания и отправьте в тот же чат — нейросеть пришлёт исправленный файл." +
          `<div class="fix"><button class="btn" id="copy-fix">${iconMarkup("clipboard-copy")}<span>Скопировать замечания</span></button></div>`,
      );
      item.querySelector("#copy-fix").onclick = (event) =>
        copy(fix, event.currentTarget, "Скопировано — вставьте в чат");
    }
  }

  function renderSummary(ir) {
    const slides = ir.slides.length;
    const texts = ir.slides.reduce((n, s) => n + s.texts.length, 0);
    const shapes = ir.slides.reduce((n, s) => n + s.boxes.length, 0);
    const chips = [
      ["layers", slides, plural(slides, "слайд", "слайда", "слайдов")],
      ["shapes", texts + shapes, plural(texts + shapes, "объект", "объекта", "объектов")],
    ];
    $("summary").className = "stats";
    $("summary").innerHTML =
      chips
        .map(
          ([icon, value, word]) =>
            `<span class="stat">${iconMarkup(icon)}<b>${value}</b> ${word}</span>`,
        )
        .join("") +
      '<span class="stat promise">' +
      iconMarkup("pencil") +
      "каждый правится мышкой</span>";
  }

  /* ---------- конвертация ---------- */

  let enginePromise = null;

  function ensureEngine() {
    if (window.MPGA && window.MPGA.convert) return Promise.resolve();
    if (!window.MPGA_ENGINE_URL) return Promise.reject(new Error("движок не найден"));
    if (!enginePromise) {
      enginePromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = window.MPGA_ENGINE_URL;
        script.addEventListener("load", resolve, { once: true });
        script.addEventListener(
          "error",
          () => {
            enginePromise = null;
            const error = new Error(
              "не удалось загрузить движок — проверьте связь и обновите страницу",
            );
            error.friendly = true;
            reject(error);
          },
          { once: true },
        );
        document.head.append(script);
      });
    }
    return enginePromise;
  }

  async function run(source, label, isDemo) {
    $("result").classList.remove("on");
    setStatus(`Собираю презентацию${label ? ` из ${esc(label)}` : ""}…`, true);
    await new Promise((done) => setTimeout(done, 30));
    try {
      await ensureEngine();
      const { ir, warnings } = await window.MPGA.convert(source);
      current = { ir, warnings };
      renderPreview(ir);
      renderNotes(warnings);
      renderSummary(ir);
      $("demo-mark").hidden = !isDemo;
      $("save-as").textContent = `Сохранится как «${fileName(ir.title)}» в папку «Загрузки»`;
      setStatus("");
      $("step-3-waiting").hidden = true;
      for (const id of ["step-1", "step-2"]) $(id).classList.add("spent");
      $("result").classList.add("on");
      $("result").scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "start" });
    } catch (err) {
      setStatus(
        `<b>Не получилось.</b> ${esc(err.friendly ? err.message : "Это не похоже на презентацию: " + err.message)}` +
          "<br>Попросите нейросеть прислать страницу целиком, одним файлом <code>.html</code>, и загрузите снова.",
        false,
        true,
      );
    }
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("файл не читается"));
      reader.readAsText(file, "utf-8");
    });
  }

  /* ---------- сборка страницы ---------- */

  function bind() {
    paintUiIcons();
    bindFolds();

    $("prompt-text").value = window.MPGA_PROMPT || "";

    $("copy-prompt").onclick = (event) =>
      copy(window.MPGA_PROMPT || "", event.currentTarget, "Скопировано — вставьте в чат");
    $("pick").onclick = () => $("file").click();
    $("file").onchange = async (event) => {
      const file = event.target.files[0];
      if (file) run(await readFile(file), file.name);
      event.target.value = "";
    };
    $("demo").onclick = () => run(window.MPGA_DEMO || "", "примера", true);
    $("convert-paste").onclick = () => {
      const value = $("paste").value.trim();
      if (value.length < 40) {
        setStatus(
          "Вставьте код презентации целиком — он начинается с <code>&lt;!doctype html&gt;</code>.",
        );
        return;
      }
      run(value, "вставленного кода");
    };

    const drop = $("drop");
    let dragDepth = 0;
    drop.addEventListener("dragenter", (event) => {
      event.preventDefault();
      dragDepth++;
      drop.classList.add("over");
    });
    drop.addEventListener("dragover", (event) => {
      event.preventDefault();
      drop.classList.add("over");
    });
    drop.addEventListener("dragleave", (event) => {
      event.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth) drop.classList.remove("over");
    });
    drop.addEventListener("drop", async (event) => {
      event.preventDefault();
      dragDepth = 0;
      drop.classList.remove("over");
      const file = event.dataTransfer.files[0];
      if (file) run(await readFile(file), file.name);
    });

    $("download").onclick = async (event) => {
      if (!current) return;
      const button = event.currentTarget;
      const old = button.innerHTML;
      button.disabled = true;
      button.innerHTML = `${iconMarkup("loader", "spin")}<span>Собираю файл…</span>`;
      try {
        const blob = await window.MPGA.pptxBlob(current.ir, {
          title: current.ir.title,
          app: `MPGA ${BUILD.version}`,
        });
        saveBlob(blob, fileName(current.ir.title));
        button.innerHTML = `${iconMarkup("check")}<span>Скачать ещё раз</span>`;
      } catch {
        button.innerHTML = old;
        setStatus(
          "<b>Не получилось собрать файл.</b> Попробуйте ещё раз или перезагрузите страницу.",
        );
      }
      button.disabled = false;
    };

    $("offline-line").innerHTML =
      `<button class="btn ghost" id="save-offline">${iconMarkup("hard-drive-download")}<span>Сохранить страницу себе</span></button>` +
      "<span>потом откроется даже без интернета</span>";
    $("save-offline").onclick = () => {
      saveBlob(new Blob([PRISTINE], { type: "text/html" }), `MPGA-${BUILD.version}.html`);
    };
    $("legal").innerHTML = window.MPGA_LEGAL || "";

    // Движок нужен не сразу, но нужен наверняка: страницу могут открыть, увести
    // ноутбук в аудиторию и собрать презентацию уже без сети.
    const warmUp = () => {
      ensureEngine().catch(() => {});
    };
    if (window.requestIdleCallback) requestIdleCallback(warmUp, { timeout: 4000 });
    else setTimeout(warmUp, 2500);

    let pending = 0;
    new ResizeObserver(() => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(layoutPreview);
    }).observe($("slides"));

    window.addEventListener("error", (event) => {
      setStatus(
        `<b>Что-то пошло не так.</b> ${esc(event.message || "")}<br>` +
          "Попробуйте другой файл или перезагрузите страницу.",
      );
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
