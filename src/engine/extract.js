(() => {
  const SLIDE_W_EMU = 12192000;
  const SLIDE_H_EMU = 6858000;

  const px = (v) => parseFloat(v) || 0;

  function hex(color) {
    if (!color) return null;
    const m = String(color).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const parts = m[1].split(",").map((s) => parseFloat(s));
    const alpha = parts.length > 3 ? parts[3] : 1;
    if (!alpha) return null;
    const value = parts
      .slice(0, 3)
      .map((v) => Math.round(v).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
    return { hex: value, alpha };
  }

  const splitTop = (text) => {
    const out = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      else if (ch === "," && depth === 0) {
        out.push(text.slice(start, i).trim());
        start = i + 1;
      }
    }
    out.push(text.slice(start).trim());
    return out;
  };

  const SIDE_ANGLE = {
    top: 0,
    "top right": 45,
    "right top": 45,
    right: 90,
    "bottom right": 135,
    "right bottom": 135,
    bottom: 180,
    "bottom left": 225,
    "left bottom": 225,
    left: 270,
    "top left": 315,
    "left top": 315,
  };

  function angleOf(word) {
    const deg = word.match(/^(-?[\d.]+)(deg|grad|rad|turn)$/);
    if (deg) {
      const v = parseFloat(deg[1]);
      if (deg[2] === "deg") return v;
      if (deg[2] === "grad") return (v * 360) / 400;
      if (deg[2] === "rad") return (v * 180) / Math.PI;
      return v * 360;
    }
    const to = word.match(/^to\s+(.+)$/);
    if (to) {
      const key = to[1].trim().replace(/\s+/g, " ");
      if (SIDE_ANGLE[key] != null) return SIDE_ANGLE[key];
    }
    return null;
  }

  // linear-gradient / radial-gradient из computed style в описание заливки.
  // Возвращает null, если градиент такой, какого в PowerPoint нет (повторяющийся,
  // конический, с длинами в пикселях) — тогда фон останется картинкой.
  function parseGradient(value) {
    const m = String(value || "")
      .trim()
      .match(/^(linear|radial)-gradient\(([\s\S]*)\)$/);
    if (!m) return null;
    const kind = m[1];
    const parts = splitTop(m[2]);
    if (parts.length < 2) return null;

    let angle = kind === "linear" ? 180 : 0;
    let center = { x: 50, y: 50 };
    let round = false;
    const head = parts[0];
    const isColor = /^rgba?\(/i.test(head);
    if (!isColor) {
      if (kind === "linear") {
        const a = angleOf(head);
        if (a == null) return null;
        angle = a;
      } else {
        round = /\bcircle\b/.test(head);
        const at = head.match(/at\s+([\d.]+)%\s+([\d.]+)%/);
        if (at) center = { x: parseFloat(at[1]), y: parseFloat(at[2]) };
        else if (/\bat\b/.test(head)) return null;
      }
      parts.shift();
    }
    if (parts.length < 2) return null;

    const stops = [];
    for (const part of parts) {
      const cm = part.match(/^(rgba?\([^)]*\))\s*(.*)$/i);
      if (!cm) return null;
      const color = hex(cm[1]);
      if (!color) return null;
      const rest = cm[2].trim();
      let pos = null;
      if (rest) {
        const pm = rest.match(/^([\d.]+)%$/);
        if (!pm) return null;
        pos = parseFloat(pm[1]) / 100;
      }
      stops.push({ hex: color.hex, alpha: color.alpha, pos });
    }
    if (stops[0].pos == null) stops[0].pos = 0;
    if (stops[stops.length - 1].pos == null) stops[stops.length - 1].pos = 1;
    for (let i = 1; i < stops.length - 1; i++) {
      if (stops[i].pos != null) continue;
      let next = i + 1;
      while (stops[next].pos == null) next++;
      const from = stops[i - 1].pos;
      const step = (stops[next].pos - from) / (next - i + 1);
      for (let k = i; k < next; k++) stops[k].pos = from + step * (k - i + 1);
    }
    for (let i = 1; i < stops.length; i++) {
      if (stops[i].pos < stops[i - 1].pos) stops[i].pos = stops[i - 1].pos;
    }
    return { kind, angle: ((angle % 360) + 360) % 360, center, round, stops };
  }

  // box-shadow и text-shadow: берём первую внешнюю тень, внутренние PowerPoint
  // рисует иначе и мы их не обещаем.
  function parseShadow(value) {
    if (!value || value === "none") return null;
    for (const part of splitTop(String(value))) {
      if (/\binset\b/.test(part)) continue;
      const color = hex(part);
      const nums = [...part.matchAll(/(-?[\d.]+)px/g)].map((mm) => parseFloat(mm[1]));
      if (!color || nums.length < 2) continue;
      const [dx, dy, blur = 0, spread = 0] = nums;
      if (!dx && !dy && !blur) continue;
      return { dx, dy, blur, spread, hex: color.hex, alpha: color.alpha };
    }
    return null;
  }

  // clip-path: polygon(...) — в PowerPoint это своя геометрия фигуры,
  // а не обрезка. Считаем вершины в долях от размера блока.
  function parseClip(value, w, h) {
    const m = String(value || "")
      .trim()
      .match(/^polygon\(([^)]*)\)$/i);
    if (!m || !(w > 0) || !(h > 0)) return null;
    const points = [];
    for (const part of m[1].split(",")) {
      const pair = part.trim().split(/\s+/);
      if (pair.length !== 2) return null;
      const axis = (raw, size) => {
        const mm = String(raw).match(/^(-?[\d.]+)(px|%)$/);
        if (!mm) return null;
        const v = parseFloat(mm[1]);
        return mm[2] === "%" ? v / 100 : v / size;
      };
      const x = axis(pair[0], w);
      const y = axis(pair[1], h);
      if (x == null || y == null) return null;
      points.push([x, y]);
    }
    return points.length >= 3 ? points : null;
  }

  const DASH = {
    dashed: "dash",
    dotted: "sysDot",
    double: "solid",
    groove: "solid",
    ridge: "solid",
  };

  function transformInfo(value) {
    if (!value || value === "none") return { rot: 0, simple: true };
    const m = value.match(/matrix\(([^)]+)\)/);
    if (!m) return { rot: 0, simple: false };
    const [a, b, c, d] = m[1].split(",").map(Number);
    const rot = (Math.atan2(b, a) * 180) / Math.PI;
    const scaleX = Math.hypot(a, b);
    const scaleY = Math.hypot(c, d);
    const skew = (Math.atan2(-c, d) * 180) / Math.PI - rot;
    const simple =
      Math.abs(scaleX - 1) < 0.02 && Math.abs(scaleY - 1) < 0.02 && Math.abs(skew) < 0.5;
    return { rot: Math.abs(rot) < 0.2 ? 0 : rot, simple };
  }

  function fontOf(family) {
    const f = String(family || "").toLowerCase();
    if (f.includes("courier") || f.includes("mono")) return "Courier New";
    return "Arial";
  }

  function applyTransform(text, mode) {
    if (mode === "uppercase") return text.toUpperCase();
    if (mode === "lowercase") return text.toLowerCase();
    if (mode === "capitalize") return text.replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase());
    return text;
  }

  function extract(win) {
    const doc = win.document;
    const style = (el) => win.getComputedStyle(el);
    const pseudo = (el, which) => win.getComputedStyle(el, which);
    const warnings = [];
    const warn = (code, text, fix, slide) => {
      const seen = warnings.find((w) => w.code === code && w.slide === slide);
      if (seen) {
        seen.count++;
        return;
      }
      warnings.push({ code, level: "warn", text, fix, slide, count: 1 });
    };

    const slideEls = [...doc.querySelectorAll(".mpga-slide-root")];
    if (!slideEls.length) return { slides: [], warnings, epx: 0 };

    const first = slideEls[0].getBoundingClientRect();
    const epx = SLIDE_W_EMU / first.width;
    const slides = [];
    const restore = [];
    let captureSeq = 0;

    slideEls.forEach((slideEl, si) => {
      const S = slideEl.getBoundingClientRect();
      const ox = S.left;
      const oy = S.top;
      const boxes = [];
      const texts = [];
      const images = [];
      const tables = [];
      const captures = [];
      const skip = new Set();

      if (Math.abs(S.width - first.width) > 1) {
        warn(
          "slide-size",
          `Слайд ${si + 1} другого размера, чем первый — он может обрезаться.`,
          "Сделай все слайды одного размера.",
          si,
        );
      }

      const rasterRoots = new Map();
      const skewRoots = new Set();
      const spins = new Map();
      const order = new Map();
      const anims = new Map();

      // Слой объекта — его место в разметке: кто написан позже, тот выше.
      // ::after получает номер конца всего поддерева, потому что в браузере
      // он рисуется поверх детей, а не под ними.
      const nodes = [slideEl, ...slideEl.querySelectorAll("*")];
      nodes.forEach((node, i) => order.set(node, i * 4));
      const seqOf = (el, shift = 1) => (order.get(el) || 0) + shift;
      const seqAfter = (el) => (order.get(el) || 0) + (el.querySelectorAll("*").length + 1) * 4 - 1;

      const animOf = (el) => {
        for (let node = el; node && node !== slideEl.parentElement; node = node.parentElement) {
          if (!node.hasAttribute || !node.hasAttribute("data-anim")) continue;
          const kind = (node.getAttribute("data-anim") || "").trim().toLowerCase();
          if (!kind) return null;
          if (!anims.has(node)) anims.set(node, anims.size);
          return {
            key: `${si}-${anims.get(node)}`,
            kind,
            dur: Math.max(100, parseInt(node.getAttribute("data-anim-dur"), 10) || 500),
          };
        }
        return null;
      };

      const markRaster = (el, kind) => {
        if (rasterRoots.has(el)) return;
        for (const other of rasterRoots.keys()) if (other.contains(el)) return;
        rasterRoots.set(el, kind);
      };

      const walkAll = (el) => [el, ...el.querySelectorAll("*")];

      // Поворот снимаем до замера: тогда всё внутри меряется прямым, а угол
      // возвращается объектам обратно (applySpin). Так повёрнутая плашка
      // остаётся фигурой с текстом, а не картинкой.
      for (const el of walkAll(slideEl)) {
        if (el === slideEl) continue;
        const st = style(el);
        if (st.display === "none" || st.visibility === "hidden") continue;
        const t = transformInfo(st.transform);
        if (t.rot === 0 || !t.simple) continue;
        const origin = String(st.transformOrigin || "")
          .split(" ")
          .map(px);
        const w = el.offsetWidth || el.getBoundingClientRect().width;
        const h = el.offsetHeight || el.getBoundingClientRect().height;
        if (Math.abs(origin[0] - w / 2) > 1 || Math.abs((origin[1] ?? h / 2) - h / 2) > 1) continue;
        const r = el.getBoundingClientRect();
        spins.set(el, {
          rot: t.rot,
          cx: (r.left + r.right) / 2 - ox,
          cy: (r.top + r.bottom) / 2 - oy,
        });
        el.__mpgaSpin = el.style.transform;
        el.style.transform = "none";
        restore.push(el);
      }

      const spinChain = (el) => {
        const chain = [];
        for (let node = el; node && node !== slideEl; node = node.parentElement) {
          const spin = spins.get(node);
          if (spin) chain.push(spin);
        }
        return chain;
      };

      // Поворот вокруг центра предка: PowerPoint вертит каждую фигуру вокруг
      // её собственного центра, поэтому центр объекта нужно довернуть руками.
      const applySpin = (obj, el) => {
        const chain = spinChain(el);
        if (!chain.length) return obj;
        let cx = obj.x + obj.w / 2;
        let cy = obj.y + obj.h / 2;
        let rot = 0;
        for (const spin of chain) {
          const a = (spin.rot * Math.PI) / 180;
          const dx = cx - spin.cx;
          const dy = cy - spin.cy;
          cx = spin.cx + dx * Math.cos(a) - dy * Math.sin(a);
          cy = spin.cy + dx * Math.sin(a) + dy * Math.cos(a);
          rot += spin.rot;
        }
        obj.x = cx - obj.w / 2;
        obj.y = cy - obj.h / 2;
        obj.rot = (obj.rot || 0) + rot;
        return obj;
      };

      for (const el of walkAll(slideEl)) {
        if (el === slideEl) continue;
        const tag = el.tagName.toLowerCase();
        if (tag === "style" || tag === "script") continue;
        const st = style(el);
        if (st.display === "none" || st.visibility === "hidden" || px(st.opacity) === 0) continue;
        const t = transformInfo(st.transform);
        if (tag === "svg") markRaster(el, "svg");
        else if (["canvas", "video", "iframe", "object", "embed"].includes(tag))
          markRaster(el, "embed");
        else if (el.hasAttribute("data-raster")) markRaster(el, "explicit");
        else if (!t.simple) {
          markRaster(el, "transform");
          skewRoots.add(el);
        }
      }

      const insideRaster = (el) => {
        for (const root of rasterRoots.keys()) if (root !== el && root.contains(el)) return true;
        return false;
      };

      if (skewRoots.size) {
        warn(
          "skewed",
          `Растянутые или скошенные блоки (${skewRoots.size} шт.) вставлены картинкой — текст в них не редактируется.`,
          "Не применяй к блокам с текстом transform: scale и skew — PowerPoint получает их картинкой. " +
            "Поворот (rotate) можно: он переносится как есть.",
          si,
        );
      }

      const consumed = new Set();
      const range = doc.createRange();
      const unionRect = (nodes) => {
        let left = Infinity,
          top = Infinity,
          right = -Infinity,
          bottom = -Infinity;
        for (const node of nodes) {
          let r;
          if (node.nodeType === 3) {
            range.selectNode(node);
            r = range.getBoundingClientRect();
          } else r = node.getBoundingClientRect();
          if (r.width < 0.5 && r.height < 0.5) continue;
          left = Math.min(left, r.left);
          top = Math.min(top, r.top);
          right = Math.max(right, r.right);
          bottom = Math.max(bottom, r.bottom);
        }
        if (left === Infinity) return { width: 0, height: 0 };
        return { left, top, right, bottom, width: right - left, height: bottom - top };
      };

      const addCapture = (el, kind, rect, extra = {}) => {
        const id = `cap-${si}-${captureSeq++}`;
        el.setAttribute("data-mpga-cap", id);
        const w = rect.width;
        const h = rect.height;
        captures.push({ id, kind, w, h, ...extra });
        images.push(
          applySpin(
            {
              seq: seqOf(el),
              anim: animOf(el),
              id,
              kind,
              x: rect.left - ox,
              y: rect.top - oy,
              w,
              h,
            },
            el,
          ),
        );
        return id;
      };

      const pushBoxesFor = (el, st, r, geom, fade) => {
        const bg = hex(st.backgroundColor);
        const hasBgImage = st.backgroundImage && st.backgroundImage !== "none";
        const grad = hasBgImage ? parseGradient(st.backgroundImage) : null;
        const sides = ["Top", "Right", "Bottom", "Left"]
          .map((s) => ({
            w: px(st[`border${s}Width`]),
            c: hex(st[`border${s}Color`]),
            style: st[`border${s}Style`],
            side: s.toLowerCase(),
          }))
          .filter((b) => b.w > 0.4 && b.c && b.style !== "none");
        const uniform =
          sides.length === 4 &&
          sides.every(
            (b) =>
              Math.abs(b.w - sides[0].w) < 0.5 &&
              b.c.hex === sides[0].c.hex &&
              b.style === sides[0].style,
          );

        const corners = ["TopLeft", "TopRight", "BottomRight", "BottomLeft"].map((c) => {
          const raw = String(st[`border${c}Radius`]);
          const value = px(raw);
          return raw.includes("%") ? (Math.min(r.width, r.height) * value) / 100 : value;
        });
        let radius = Math.max(...corners);
        const mixed = corners.some((v) => Math.abs(v - corners[0]) > 1) ? corners : null;
        // Круг — только когда блок и правда круглый. Капсула (широкая плашка со
        // скруглением во всю высоту) в PowerPoint это roundRect с полным радиусом,
        // а не эллипс: иначе таблетка становится яйцом.
        const square = Math.abs(r.width - r.height) < 2;
        const isOval = radius > 0 && square && radius >= r.width / 2 - 1;
        if (radius > 0) radius = Math.min(radius, Math.min(r.width, r.height) / 2);

        if (hasBgImage && !grad) {
          addCapture(el, "background", r, { selfOnly: true });
          return;
        }
        if (!bg && !grad && !sides.length) return;

        const clip = parseClip(st.clipPath, r.width, r.height);
        if (!clip && st.clipPath && st.clipPath !== "none") {
          warn(
            "clip-shape",
            `Слайд ${si + 1}: фигура необычной формы получится прямоугольником.`,
            "Из clip-path переносится только polygon(...) с координатами в % или px. " +
              "Круг задавай border-radius, остальные формы рисуй в inline SVG.",
            si,
          );
        }
        const shadow = parseShadow(st.boxShadow);
        const box = {
          seq: seqOf(el),
          anim: animOf(el),
          x: geom.x,
          y: geom.y,
          w: geom.w,
          h: geom.h,
          fill: bg ? bg.hex : null,
          alpha: (bg ? bg.alpha : 1) * fade,
          radius: isOval ? -1 : radius,
        };
        if (grad) {
          box.grad = grad;
          if (fade < 1)
            box.grad = { ...grad, stops: grad.stops.map((g) => ({ ...g, alpha: g.alpha * fade })) };
        }
        if (shadow) box.shadow = { ...shadow, alpha: shadow.alpha * fade };
        if (clip) box.clip = clip;
        else if (mixed && radius > 0.5)
          box.corners = mixed.map((v) => Math.min(v, Math.min(r.width, r.height) / 2));
        if (geom.rot) box.rot = geom.rot;
        if (uniform) {
          box.stroke = sides[0].c.hex;
          box.strokeW = sides[0].w;
          box.strokeAlpha = sides[0].c.alpha * fade;
          if (DASH[sides[0].style]) box.dash = DASH[sides[0].style];
        }
        boxes.push(box);

        if (!uniform) {
          for (const b of sides) {
            const bar = {
              seq: seqOf(el, 2),
              anim: animOf(el),
              x: geom.x,
              y: geom.y,
              w: geom.w,
              h: geom.h,
              fill: b.c.hex,
              alpha: b.c.alpha * fade,
              radius: 0,
            };
            if (geom.rot) bar.rot = geom.rot;
            if (b.side === "top") bar.h = b.w;
            else if (b.side === "bottom") {
              bar.y = geom.y + geom.h - b.w;
              bar.h = b.w;
            } else if (b.side === "left") bar.w = b.w;
            else if (b.side === "right") {
              bar.x = geom.x + geom.w - b.w;
              bar.w = b.w;
            }
            boxes.push(bar);
          }
        }
      };

      // outline рисуется поверх рамки и не занимает места в раскладке —
      // отдельной фигурой без заливки, отодвинутой на outline-offset.
      const pushOutline = (el, st, geom, fade) => {
        const width = px(st.outlineWidth);
        const color = hex(st.outlineColor);
        if (!(width > 0.4) || !color || st.outlineStyle === "none") return;
        const gap = px(st.outlineOffset) + width / 2;
        boxes.push({
          seq: seqOf(el, 2),
          anim: animOf(el),
          x: geom.x - gap,
          y: geom.y - gap,
          w: geom.w + gap * 2,
          h: geom.h + gap * 2,
          fill: null,
          alpha: 1,
          radius: 0,
          stroke: color.hex,
          strokeW: width,
          strokeAlpha: color.alpha * fade,
          dash: DASH[st.outlineStyle] || "solid",
        });
      };

      const pushPseudo = (el, r, which, fade, seq) => {
        const p = pseudo(el, which);
        if (!p) return;
        const content = p.content;
        if (!content || content === "none" || content === "normal") return;
        const fill = hex(p.backgroundColor);
        if (!fill) return;
        if (p.position !== "absolute" && p.position !== "fixed") return;
        let w = px(p.width);
        let h = px(p.height);
        const has = (v) => v && v !== "auto";
        if (!w && has(p.left) && has(p.right)) w = r.width - px(p.left) - px(p.right);
        if (!h && has(p.top) && has(p.bottom)) h = r.height - px(p.top) - px(p.bottom);
        if (w < 0.5 || h < 0.5) return;
        const x = has(p.left) ? px(p.left) : has(p.right) ? r.width - px(p.right) - w : 0;
        const y = has(p.top) ? px(p.top) : has(p.bottom) ? r.height - px(p.bottom) - h : 0;
        const grad = parseGradient(p.backgroundImage);
        const box = {
          seq,
          anim: animOf(el),
          x: r.left - ox + x,
          y: r.top - oy + y,
          w,
          h,
          fill: fill.hex,
          alpha: fill.alpha * fade,
          radius: px(p.borderTopLeftRadius),
        };
        if (grad) box.grad = grad;
        const shadow = parseShadow(p.boxShadow);
        if (shadow) box.shadow = shadow;
        boxes.push(box);
      };

      // <table> уходит в настоящую таблицу PowerPoint: строки и столбцы
      // остаются строками и столбцами, а не превращаются в россыпь плашек.
      const cellRuns = (cell, cst, fade) => {
        const collected = collectRuns(cell);
        if (collected) {
          const runs = collected.runs.filter((rn) => rn.br || rn.text.trim() !== "");
          if (runs.length) {
            if (fade < 1) for (const run of runs) run.fade = fade;
            return runs;
          }
        }
        const text = cell.textContent.replace(/\s+/g, " ").trim();
        if (!text) return [];
        return [{ ...runStyle(null, cst), text: applyTransform(text, cst.textTransform) }];
      };

      const cellBorders = (cst) =>
        ["Top", "Right", "Bottom", "Left"].map((side) => {
          const w = px(cst[`border${side}Width`]);
          const c = hex(cst[`border${side}Color`]);
          if (!(w > 0.4) || !c || cst[`border${side}Style`] === "none") return null;
          return { w, hex: c.hex, dash: DASH[cst[`border${side}Style`]] || "solid" };
        });

      const tableOf = (el, r, fade) => {
        const rows = [];
        const widths = [];
        const heights = [];
        for (const tr of el.querySelectorAll("tr")) {
          const cells = [...tr.children].filter((c) => /^(td|th)$/i.test(c.tagName));
          if (!cells.length) continue;
          const tst = style(tr);
          if (tst.display === "none") continue;
          const row = [];
          for (const cell of cells) {
            const cst = style(cell);
            const cr = cell.getBoundingClientRect();
            const bg = hex(cst.backgroundColor);
            row.push({
              runs: cellRuns(cell, cst, fade),
              fill: bg ? bg.hex : null,
              fillAlpha: bg ? bg.alpha * fade : 0,
              align: cst.textAlign,
              valign: cst.verticalAlign,
              pad: [
                px(cst.paddingTop),
                px(cst.paddingRight),
                px(cst.paddingBottom),
                px(cst.paddingLeft),
              ],
              borders: cellBorders(cst),
              colspan: parseInt(cell.getAttribute("colspan"), 10) || 1,
              rowspan: parseInt(cell.getAttribute("rowspan"), 10) || 1,
            });
            if (rows.length === 0) widths.push(cr.width);
          }
          heights.push(tr.getBoundingClientRect().height);
          rows.push(row);
        }
        if (!rows.length) return null;
        return {
          seq: seqOf(el),
          anim: animOf(el),
          x: r.left - ox,
          y: r.top - oy,
          w: r.width,
          h: r.height,
          widths,
          heights,
          rows,
        };
      };

      const runStyle = (el, st) => ({
        size: px(st.fontSize),
        bold: st.fontWeight === "bold" || (parseInt(st.fontWeight, 10) || 400) >= 600,
        italic: st.fontStyle === "italic" || st.fontStyle === "oblique",
        underline: st.textDecorationLine.includes("underline"),
        underlineStyle: st.textDecorationStyle,
        underlineColor: (hex(st.textDecorationColor) || {}).hex,
        strike: st.textDecorationLine.includes("line-through"),
        color: (hex(st.color) || { hex: "000000" }).hex,
        spacing: px(st.letterSpacing),
        font: fontOf(st.fontFamily),
        transform: st.textTransform,
        collapse: !String(st.whiteSpace).startsWith("pre"),
      });

      const linkOf = (node) => {
        const anchor = node && node.closest ? node.closest("a[href]") : null;
        if (!anchor || !slideEl.contains(anchor)) return null;
        const href = anchor.getAttribute("href") || "";
        return /^(https?:|mailto:)/i.test(href) ? href : null;
      };

      const makeRun = (text, st, node) => {
        const s = runStyle(null, st);
        let value = s.collapse ? text.replace(/\s+/g, " ") : text;
        value = applyTransform(value, s.transform);
        const link = linkOf(node);
        return link ? { text: value, link, ...s } : { text: value, ...s };
      };

      const collectRuns = (el) => {
        const runs = [];
        const eaten = [];
        const used = [];
        for (const node of el.childNodes) {
          if (node.nodeType === 3) {
            if (!node.textContent.trim() && !runs.length) continue;
            runs.push(makeRun(node.textContent, style(el), el));
            used.push(node);
            continue;
          }
          if (node.nodeType !== 1) continue;
          const tag = node.tagName.toLowerCase();
          if (tag === "br") {
            runs.push({ br: true });
            continue;
          }
          if (tag === "style" || tag === "script") continue;
          if (rasterRoots.has(node)) continue;
          const nst = style(node);
          if (nst.display === "none" || nst.visibility === "hidden") continue;
          if (!nst.display.startsWith("inline")) continue;
          if (node.querySelector("div,p,section,ul,ol,li,table,h1,h2,h3,h4,h5,h6,svg,img"))
            continue;
          if (!node.textContent.trim()) continue;
          runs.push(makeRun(node.textContent, nst, node));
          used.push(node);
          eaten.push(node, ...node.querySelectorAll("*"));
        }
        if (!runs.some((rn) => rn.text && rn.text.trim())) return null;
        return { runs, eaten, used };
      };

      // Маркер списка живёт в ::marker и в DOM его нет: в PowerPoint он станет
      // родным маркером абзаца. Отступ до текста меряем по шрифту самого пункта,
      // чтобы текст остался там же, где был.
      const MARKERS = { disc: "•", circle: "◦", square: "▪", "disc-outside": "•" };
      let ruler = null;
      const textWidth = (value, font) => {
        if (!ruler) ruler = doc.createElement("canvas").getContext("2d");
        if (!ruler) return 0;
        ruler.font = font;
        return ruler.measureText(value).width;
      };

      const bulletOf = (el, st) => {
        if (st.display !== "list-item") return null;
        const kind = String(st.listStyleType || "");
        if (!kind || kind === "none") return null;
        const size = px(st.fontSize) || 16;
        const font = `${size}px Arial, sans-serif`;
        if (MARKERS[kind]) {
          return {
            char: MARKERS[kind],
            indent: textWidth(MARKERS[kind], font) + size * 0.45,
          };
        }
        if (kind === "decimal" || kind === "decimal-leading-zero") {
          const list = el.parentElement;
          const items = list ? [...list.children].filter((n) => n.tagName === el.tagName) : [el];
          const start = parseInt(list && list.getAttribute("start"), 10) || 1;
          const at = start + Math.max(0, items.indexOf(el));
          return { number: at, indent: textWidth(`${at}.`, font) + size * 0.45 };
        }
        return null;
      };

      const directText = (el) => {
        for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) return true;
        return false;
      };

      // overflow: hidden в браузере режет вылезшего ребёнка, в PowerPoint резать
      // нечем — значит, подрезаем сами при замере. Скруглённые фигуры не трогаем:
      // обрезанный круг прямоугольником стал бы приплюснутым яйцом.
      const clipOf = (el) => {
        let box = null;
        for (let node = el.parentElement; node && node !== slideEl; node = node.parentElement) {
          const st = style(node);
          if (st.overflow === "visible" && st.overflowX === "visible" && st.overflowY === "visible")
            continue;
          const r = node.getBoundingClientRect();
          const side = {
            left: r.left - ox + px(st.borderLeftWidth),
            top: r.top - oy + px(st.borderTopWidth),
            right: r.right - ox - px(st.borderRightWidth),
            bottom: r.bottom - oy - px(st.borderBottomWidth),
          };
          box = box
            ? {
                left: Math.max(box.left, side.left),
                top: Math.max(box.top, side.top),
                right: Math.min(box.right, side.right),
                bottom: Math.min(box.bottom, side.bottom),
              }
            : side;
        }
        return box;
      };

      const clampBox = (box, bounds) => {
        if (!bounds || box.rot || box.radius === -1 || box.radius > 0.5 || box.clip) return true;
        const left = Math.max(box.x, bounds.left);
        const top = Math.max(box.y, bounds.top);
        const right = Math.min(box.x + box.w, bounds.right);
        const bottom = Math.min(box.y + box.h, bounds.bottom);
        if (right - left < 0.5 || bottom - top < 0.5) return false;
        box.x = left;
        box.y = top;
        box.w = right - left;
        box.h = bottom - top;
        return true;
      };

      // Прозрачность копится по предкам: opacity на карточке гасит и её фон,
      // и всё, что внутри.
      const fadeOf = (el) => {
        let value = 1;
        for (let node = el; node && node !== slideEl.parentElement; node = node.parentElement) {
          const o = px(style(node).opacity);
          if (o < 1) value *= o;
        }
        return value;
      };

      for (const el of walkAll(slideEl)) {
        const tag = el.tagName.toLowerCase();
        if (tag === "style" || tag === "script" || tag === "br") continue;
        if (insideRaster(el) || skip.has(el)) continue;
        const st = style(el);
        if (st.display === "none" || st.visibility === "hidden" || px(st.opacity) === 0) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        const fade = fadeOf(el);

        if (rasterRoots.has(el)) {
          const kind = rasterRoots.get(el);
          const hasText = tag === "svg" && el.querySelector("text");
          addCapture(el, kind, r, { hideText: !!hasText });
          if (hasText) collectSvgText(el, r);
          continue;
        }

        const geom = { x: r.left - ox, y: r.top - oy, w: r.width, h: r.height, rot: 0 };
        const boxesBefore = boxes.length;
        if (el !== slideEl) pushBoxesFor(el, st, r, geom, fade);
        pushPseudo(el, r, "::before", fade, seqOf(el, 3));
        pushPseudo(el, r, "::after", fade, seqAfter(el));
        pushOutline(el, st, geom, fade);
        const bounds = clipOf(el);
        const kept = [];
        for (let i = boxesBefore; i < boxes.length; i++) {
          if (clampBox(boxes[i], bounds)) kept.push(applySpin(boxes[i], el));
        }
        boxes.length = boxesBefore;
        boxes.push(...kept);

        if (tag === "table") {
          const table = tableOf(el, r, fade);
          if (table) {
            tables.push(applySpin(table, el));
            for (const node of el.querySelectorAll("*")) skip.add(node);
            continue;
          }
        }

        if (tag === "img") {
          const src = el.getAttribute("src") || "";
          const fit = st.objectFit && st.objectFit !== "fill" ? st.objectFit : null;
          images.push(
            applySpin(
              {
                seq: seqOf(el),
                anim: animOf(el),
                id: `img-${si}-${captureSeq++}`,
                kind: "img",
                src,
                fit,
                alt: (el.getAttribute("alt") || "").trim() || null,
                x: r.left - ox,
                y: r.top - oy,
                w: r.width,
                h: r.height,
              },
              el,
            ),
          );
          continue;
        }

        if (consumed.has(el) || !directText(el)) continue;
        const collected = collectRuns(el);
        if (!collected) continue;
        const ink = unionRect(collected.used);
        if (ink.width < 1 || ink.height < 1) continue;
        for (const node of collected.eaten) consumed.add(node);

        const lh = px(st.lineHeight) || px(st.fontSize) * 1.2;
        const lines = Math.max(1, Math.round(ink.height / Math.max(1, lh)));
        const padL = px(st.borderLeftWidth) + px(st.paddingLeft);
        const padR = px(st.borderRightWidth) + px(st.paddingRight);
        const boxX = lines > 1 ? r.left + padL : ink.left;
        const boxW = lines > 1 ? Math.max(ink.width, r.width - padL - padR) : ink.width;
        const shadow = parseShadow(st.textShadow);
        const mode = String(st.writingMode || "");
        const vert = mode.startsWith("vertical-rl")
          ? "vert"
          : mode.startsWith("vertical-lr") || mode.startsWith("sideways-lr")
            ? "vert270"
            : null;
        const columns = Math.min(16, parseInt(st.columnCount, 10) || 0);
        const bullet = bulletOf(el, st);
        const shift = bullet ? bullet.indent : 0;
        const text = {
          seq: seqOf(el),
          anim: animOf(el),
          x: boxX - ox - shift,
          y: ink.top - oy,
          w: boxW + shift,
          h: ink.height,
          align: st.textAlign,
          lh,
          lines,
          runs: collected.runs.filter((rn) => rn.br || rn.text.trim() !== ""),
        };
        if (fade < 1) for (const run of text.runs) run.fade = fade;
        if (shadow) text.shadow = shadow;
        if (bullet) text.bullet = bullet;
        if (vert) text.vert = vert;
        if (columns > 1) text.columns = { count: columns, gap: px(st.columnGap) || 0 };
        texts.push(applySpin(text, el));
      }

      function collectSvgText(svg, sr) {
        const vb = (svg.getAttribute("viewBox") || "").split(/[\s,]+/).map(Number);
        const scale = vb.length === 4 && vb[2] ? sr.width / vb[2] : 1;
        for (const node of svg.querySelectorAll("text")) {
          const tr = node.getBoundingClientRect();
          if (tr.width < 1 || tr.height < 1) continue;
          const tst = style(node);
          const anchor = node.getAttribute("text-anchor") || tst.textAnchor || "start";
          const size = px(tst.fontSize) * scale;
          const weight = node.getAttribute("font-weight") || tst.fontWeight;
          texts.push({
            x: tr.left - ox,
            y: tr.top - oy,
            w: tr.width,
            h: tr.height,
            align: anchor === "middle" ? "center" : anchor === "end" ? "right" : "left",
            lh: size * 1.2,
            lines: 1,
            svgText: true,
            runs: [
              {
                text: node.textContent.replace(/\s+/g, " ").trim(),
                size,
                bold: weight === "bold" || (parseInt(weight, 10) || 400) >= 600,
                italic: false,
                underline: false,
                strike: false,
                color: (hex(tst.fill) || hex(tst.color) || { hex: "000000" }).hex,
                spacing: 0,
                font: fontOf(tst.fontFamily),
              },
            ],
          });
        }
      }

      const aspect = S.height * epx;
      if (Math.abs(aspect - SLIDE_H_EMU) > SLIDE_H_EMU * 0.02) {
        warn(
          "aspect",
          `Слайд ${si + 1} не 16:9 — сверху и снизу останутся поля.`,
          "Делай слайды строго 16:9 (например 1160×652).",
          si,
        );
      }

      const slideStyle = style(slideEl);
      const slideBg = hex(slideStyle.backgroundColor);
      const slideGrad = parseGradient(slideStyle.backgroundImage);
      if (!slideGrad && slideStyle.backgroundImage && slideStyle.backgroundImage !== "none") {
        warn(
          "slide-bg-image",
          `Слайд ${si + 1}: фон слайда — картинка или сложный градиент, он не перенесётся.`,
          "Фон слайда задавай сплошным цветом или простым градиентом " +
            "(linear-gradient / radial-gradient из двух-трёх цветов).",
          si,
        );
      }

      slides.push({
        index: si,
        w: S.width,
        h: S.height,
        background: slideBg && slideBg.alpha > 0.9 ? slideBg.hex : null,
        backgroundGrad: slideGrad,
        transition: (slideEl.getAttribute("data-transition") || "").trim().toLowerCase() || null,
        boxes,
        texts,
        images,
        tables,
        captures,
        offsetY: Math.max(0, (SLIDE_H_EMU / epx - S.height) / 2),
      });
    });

    for (const el of restore) el.style.transform = el.__mpgaSpin || "";
    return { epx, slideW: first.width, slideH: first.height, slides, warnings };
  }

  window.MPGA = window.MPGA || {};
  window.MPGA.extract = extract;
  window.MPGA.EMU = { W: SLIDE_W_EMU, H: SLIDE_H_EMU };
})();
