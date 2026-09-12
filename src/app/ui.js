(() => {
  const PRISTINE = "<!doctype html>\n" + document.documentElement.outerHTML;
  const $ = (id) => document.getElementById(id);
  const BUILD = window.MPGA_BUILD || { version: "dev", date: "" };
  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let current = null;

  /* ---------- иконки ---------- */

  function iconMarkup(name, cls) {
    const body = (window.MPGA_UI_ICONS || {})[name] ?? (window.MPGA_ICONS || {})[name];
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
      if (fold.open) fold.classList.add("open-anim");

      summary.addEventListener("click", (event) => {
        event.preventDefault();

        if (REDUCED) {
          fold.open = !fold.open;
          fold.classList.toggle("open-anim", fold.open);
          return;
        }

        if (fold.open) {
          fold.classList.remove("open-anim");
          let closed = false;
          const finish = () => {
            if (closed) return;
            closed = true;
            fold.open = false;
            body.removeEventListener("transitionend", finish);
          };
          body.addEventListener("transitionend", finish);
          setTimeout(finish, 420);
          return;
        }

        // Содержимое сначала появляется схлопнутым и начинает расти со
        // следующего кадра: браузер не умеет переходить от «содержимого нет»
        // к «есть», и без этой пары кадров первое раскрытие идёт рывком, а
        // все последующие — плавно.
        fold.open = true;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => fold.classList.add("open-anim"));
        });
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

  function gradCss(grad) {
    const stops = grad.stops
      .map(
        (s) =>
          `rgba(${hexRgb(s.hex)},${s.alpha != null ? s.alpha : 1}) ${(s.pos * 100).toFixed(1)}%`,
      )
      .join(",");
    return grad.kind === "radial"
      ? `radial-gradient(${grad.round ? "circle " : ""}at ${grad.center.x}% ${grad.center.y}%,${stops})`
      : `linear-gradient(${grad.angle}deg,${stops})`;
  }

  function hexRgb(value) {
    const n = parseInt(value, 16);
    return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  }

  // Фигуры из SVG показываем тем же SVG: в превью важно, чтобы человек увидел
  // ровно то, что уедет в файл.
  function svgNode(box) {
    const host = document.createElement("div");
    host.style.cssText = `left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px`;
    const at = ([x, y]) => `${(x * box.w).toFixed(2)} ${(y * box.h).toFixed(2)}`;
    const d = box.path
      ? box.path
          .map(
            (sub) =>
              `M${at(sub.start)}` +
              sub.segs
                .map((seg) =>
                  seg.type === "L"
                    ? `L${at(seg.to)}`
                    : `C${at(seg.c1)} ${at(seg.c2)} ${at(seg.to)}`,
                )
                .join("") +
              (sub.closed ? "Z" : ""),
          )
          .join(" ")
      : box.flip
        ? `M0 ${box.h}L${box.w} 0`
        : `M0 0L${box.w} ${box.h}`;
    host.innerHTML =
      `<svg width="${box.w}" height="${box.h}" viewBox="0 0 ${box.w} ${box.h}" ` +
      'style="overflow:visible;display:block">' +
      `<path d="${esc(d)}" fill="${box.fill ? "#" + box.fill : "none"}" ` +
      `stroke="${box.stroke ? "#" + box.stroke : "none"}" stroke-width="${box.strokeW || 0}" ` +
      `stroke-linecap="${box.cap === "rnd" ? "round" : "butt"}" ` +
      `stroke-linejoin="${box.join === "rnd" ? "round" : "miter"}"/></svg>`;
    return host;
  }

  function tableNode(table) {
    const host = document.createElement("div");
    host.style.cssText = `left:${table.x}px;top:${table.y}px;width:${table.w}px;height:${table.h}px`;
    const grid = document.createElement("table");
    grid.style.cssText = "width:100%;height:100%;border-collapse:collapse;table-layout:fixed";
    for (const row of table.rows) {
      const tr = document.createElement("tr");
      for (const cell of row) {
        const td = document.createElement("td");
        const first = cell.runs.find((r) => !r.br) || {};
        td.textContent = cell.runs.map((r) => (r.br ? " " : r.text)).join("");
        td.style.cssText =
          `padding:${cell.pad.map((v) => `${v}px`).join(" ")};text-align:${cell.align};` +
          `font:${first.bold ? "700" : "400"} ${first.size || 14}px Arial,sans-serif;` +
          `color:#${first.color || "000"};` +
          (cell.fill ? `background:#${cell.fill};` : "") +
          cell.borders
            .map((b, i) =>
              b ? `border-${["top", "right", "bottom", "left"][i]}:${b.w}px solid #${b.hex};` : "",
            )
            .join("");
        if (cell.colspan > 1) td.colSpan = cell.colspan;
        if (cell.rowspan > 1) td.rowSpan = cell.rowspan;
        tr.appendChild(td);
      }
      grid.appendChild(tr);
    }
    host.appendChild(grid);
    return host;
  }

  // Оформление тянет жребий здесь, а не в чате: у нейросети случайности нет,
  // и по одному и тому же заданию она делает одну и ту же колоду.
  function rollStyle() {
    const base = window.MPGA_PROMPT || "";
    const style = window.MPGA_STYLE ? window.MPGA_STYLE.draw(10) : null;
    $("prompt-text").value = style ? `${base}\n\n${style.text}` : base;
    const label = $("style-name");
    if (label && style) label.textContent = style.theme;
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
      if (slide.backgroundGrad) stage.style.backgroundImage = gradCss(slide.backgroundGrad);

      // Порядок тот же, что в файле: по месту в разметке, текст сверху.
      const layer = [
        ...slide.boxes.map((box) => ({ seq: box.seq || 0, box })),
        ...slide.images.map((image) => ({ seq: image.seq || 0, image })),
        ...(slide.tables || []).map((table) => ({ seq: table.seq || 0, table })),
      ].sort((a, b) => a.seq - b.seq);

      for (const item of layer) {
        if (item.box) {
          const box = item.box;
          if (box.path || box.kind === "line") {
            stage.appendChild(svgNode(box));
            continue;
          }
          const node = document.createElement("div");
          let css = `left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px;`;
          if (box.fill) css += `background:#${box.fill};`;
          if (box.alpha != null && box.alpha < 1) css += `opacity:${box.alpha};`;
          if (box.grad) css += `background-image:${gradCss(box.grad)};`;
          if (box.stroke)
            css += `border:${box.strokeW}px ${box.dash === "dash" ? "dashed" : box.dash === "sysDot" ? "dotted" : "solid"} #${box.stroke};`;
          if (box.corners) css += `border-radius:${box.corners.map((v) => `${v}px`).join(" ")};`;
          else if (box.radius === -1) css += "border-radius:50%;";
          else if (box.radius > 0) css += `border-radius:${box.radius}px;`;
          if (box.rot) css += `transform:rotate(${box.rot}deg);`;
          if (box.shadow)
            css += `box-shadow:${box.shadow.dx}px ${box.shadow.dy}px ${box.shadow.blur}px rgba(0,0,0,${box.shadow.alpha});`;
          if (box.clip)
            css += `clip-path:polygon(${box.clip.map(([x, y]) => `${x * 100}% ${y * 100}%`).join(",")});`;
          node.style.cssText = css;
          stage.appendChild(node);
          continue;
        }
        if (item.image) {
          const image = item.image;
          if (!image.data) continue;
          const node = document.createElement("img");
          node.src = image.data;
          node.alt = "";
          node.style.cssText =
            `left:${image.x}px;top:${image.y}px;width:${image.w}px;height:${image.h}px` +
            (image.rot ? `;transform:rotate(${image.rot}deg)` : "");
          stage.appendChild(node);
          continue;
        }
        stage.appendChild(tableNode(item.table));
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
        if (text.rot) node.style.transform = `rotate(${text.rot}deg)`;
        if (text.vert) node.style.writingMode = "vertical-rl";
        if (text.columns) {
          node.style.columnCount = text.columns.count;
          node.style.columnGap = `${text.columns.gap}px`;
        }
        const marker = text.bullet
          ? `<span style="display:inline-block;width:${text.bullet.indent}px">${
              text.bullet.number ? `${text.bullet.number}.` : esc(text.bullet.char)
            }</span>`
          : "";
        node.innerHTML =
          "<span>" +
          marker +
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
    // Приём файлов живёт отдельным файлом и попадает только в ту сборку,
    // которую отдаёт сайт: офлайн-копия про него не знает вовсе.
    if (window.MPGA_REPORT_UI) window.MPGA_REPORT_UI.hide();
    setStatus(`Собираю презентацию${label ? ` из ${esc(label)}` : ""}…`, true);
    await new Promise((done) => setTimeout(done, 30));
    try {
      await ensureEngine();
      const { ir, warnings } = await window.MPGA.convert(source);
      current = {
        ir,
        warnings,
        stats: {
          slides: ir.slides.length,
          slideW: Math.round(ir.slideW),
          slideH: Math.round(ir.slideH),
          codes: warnings.filter((w) => w.level !== "info").map((w) => w.code),
        },
      };
      renderPreview(ir);
      renderNotes(warnings);
      renderSummary(ir);
      $("demo-mark").hidden = !isDemo;
      $("save-as").textContent = `Сохранится как «${fileName(ir.title)}» в «Загрузки»`;
      setStatus("");
      $("step-3-waiting").hidden = true;
      for (const id of ["step-1", "step-2"]) $(id).classList.add("spent");
      $("result").classList.add("on");
      $("result").scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "start" });
      if (window.MPGA_REPORT_UI && !isDemo && warnings.some((w) => w.level !== "info")) {
        window.MPGA_REPORT_UI.offer(source, current.stats);
      }
    } catch (err) {
      setStatus(
        `<b>Не получилось.</b> ${esc(err.friendly ? err.message : "Это не похоже на презентацию: " + err.message)}` +
          "<br>Попросите нейросеть прислать страницу целиком, одним файлом <code>.html</code>, и загрузите снова.",
        false,
        true,
      );
      if (window.MPGA_REPORT_UI && !isDemo) {
        window.MPGA_REPORT_UI.offer(source, { failed: String(err.message).slice(0, 200) });
      }
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

    rollStyle();
    $("reroll").onclick = () => rollStyle();
    $("copy-prompt").onclick = (event) =>
      copy($("prompt-text").value, event.currentTarget, "Скопировано — вставьте в чат");
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
      "<span>потом откроется даже без интернета</span>" +
      `<button class="btn ghost" id="save-offline">${iconMarkup("hard-drive-download")}<span>Сохранить страницу себе</span></button>`;
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
