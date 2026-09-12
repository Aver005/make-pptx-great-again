(() => {
  // Схемы и иконки — это inline SVG, и до сих пор они целиком уезжали картинкой.
  // Между тем прямоугольник, круг, линия и путь в PowerPoint есть свои. Здесь
  // SVG разбирается на такие фигуры; если попалось то, чего в формате нет
  // (градиент по ссылке, маска, фильтр), разбор отказывается целиком — и слайд
  // честно получает картинку, как раньше.

  const NUM = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;

  const numbers = (text) => (String(text || "").match(NUM) || []).map(Number);

  // ---------- разбор d="" ----------

  const ARGS = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };

  function parsePath(d) {
    const tokens = String(d || "").match(/[a-z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
    if (!tokens) return null;
    const subs = [];
    let sub = null;
    let x = 0;
    let y = 0;
    let startX = 0;
    let startY = 0;
    let prevC = null;
    let prevQ = null;
    let i = 0;
    let command = null;

    const open = (px, py) => {
      sub = { start: [px, py], segs: [], closed: false };
      subs.push(sub);
    };

    while (i < tokens.length) {
      if (/[a-z]/i.test(tokens[i])) {
        command = tokens[i];
        i++;
      } else if (!command) {
        return null;
      } else if (command === "M") {
        command = "L";
      } else if (command === "m") {
        command = "l";
      }
      const key = command.toLowerCase();
      const need = ARGS[key];
      if (need == null) return null;
      const rel = command !== command.toUpperCase();
      const args = [];
      for (let k = 0; k < need; k++) {
        const value = Number(tokens[i++]);
        if (!Number.isFinite(value)) return null;
        args.push(value);
      }

      if (key === "z") {
        if (sub) sub.closed = true;
        x = startX;
        y = startY;
        prevC = prevQ = null;
        continue;
      }
      if (!sub && key !== "m") open(x, y);

      if (key === "m") {
        x = rel ? x + args[0] : args[0];
        y = rel ? y + args[1] : args[1];
        startX = x;
        startY = y;
        open(x, y);
        prevC = prevQ = null;
        continue;
      }
      if (key === "l" || key === "h" || key === "v") {
        if (key === "l") {
          x = rel ? x + args[0] : args[0];
          y = rel ? y + args[1] : args[1];
        } else if (key === "h") {
          x = rel ? x + args[0] : args[0];
        } else {
          y = rel ? y + args[0] : args[0];
        }
        sub.segs.push({ type: "L", to: [x, y] });
        prevC = prevQ = null;
        continue;
      }
      if (key === "c" || key === "s") {
        let c1;
        let c2;
        if (key === "c") {
          c1 = [rel ? x + args[0] : args[0], rel ? y + args[1] : args[1]];
          c2 = [rel ? x + args[2] : args[2], rel ? y + args[3] : args[3]];
          x = rel ? x + args[4] : args[4];
          y = rel ? y + args[5] : args[5];
        } else {
          c1 = prevC ? [2 * x - prevC[0], 2 * y - prevC[1]] : [x, y];
          c2 = [rel ? x + args[0] : args[0], rel ? y + args[1] : args[1]];
          x = rel ? x + args[2] : args[2];
          y = rel ? y + args[3] : args[3];
        }
        sub.segs.push({ type: "C", c1, c2, to: [x, y] });
        prevC = c2;
        prevQ = null;
        continue;
      }
      if (key === "q" || key === "t") {
        let c;
        const fromX = x;
        const fromY = y;
        if (key === "q") {
          c = [rel ? x + args[0] : args[0], rel ? y + args[1] : args[1]];
          x = rel ? x + args[2] : args[2];
          y = rel ? y + args[3] : args[3];
        } else {
          c = prevQ ? [2 * x - prevQ[0], 2 * y - prevQ[1]] : [x, y];
          x = rel ? x + args[0] : args[0];
          y = rel ? y + args[1] : args[1];
        }
        // Квадратичная кривая поднимается до кубической: в OOXML обе есть,
        // но одна форма проще, чем две.
        sub.segs.push({
          type: "C",
          c1: [fromX + (2 / 3) * (c[0] - fromX), fromY + (2 / 3) * (c[1] - fromY)],
          c2: [x + (2 / 3) * (c[0] - x), y + (2 / 3) * (c[1] - y)],
          to: [x, y],
        });
        prevQ = c;
        prevC = null;
        continue;
      }
      if (key === "a") {
        const [rx, ry, rot, large, sweep] = args;
        const toX = rel ? x + args[5] : args[5];
        const toY = rel ? y + args[6] : args[6];
        for (const seg of arcToCurves(x, y, rx, ry, rot, large, sweep, toX, toY)) {
          sub.segs.push(seg);
        }
        x = toX;
        y = toY;
        prevC = prevQ = null;
        continue;
      }
      return null;
    }
    return subs.filter((s) => s.segs.length);
  }

  // Дуга SVG задана концами, дуга OOXML — центром и углами. Проще не
  // пересчитывать между ними, а разложить дугу на кубические кривые:
  // ошибка меньше десятой доли пикселя, а формы совпадают на любом движке.
  function arcToCurves(x1, y1, rx, ry, rotation, large, sweep, x2, y2) {
    if (!rx || !ry) return [{ type: "L", to: [x2, y2] }];
    const angle = ((rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dx = (x1 - x2) / 2;
    const dy = (y1 - y2) / 2;
    const px = cos * dx + sin * dy;
    const py = -sin * dx + cos * dy;
    let ax = Math.abs(rx);
    let ay = Math.abs(ry);
    const fix = (px * px) / (ax * ax) + (py * py) / (ay * ay);
    if (fix > 1) {
      ax *= Math.sqrt(fix);
      ay *= Math.sqrt(fix);
    }
    const sign = large === sweep ? -1 : 1;
    const top = ax * ax * ay * ay - ax * ax * py * py - ay * ay * px * px;
    const bottom = ax * ax * py * py + ay * ay * px * px;
    const scale = sign * Math.sqrt(Math.max(0, top / bottom));
    const cxp = (scale * ax * py) / ay;
    const cyp = (-scale * ay * px) / ax;
    const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
    const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
    const start = Math.atan2((py - cyp) / ay, (px - cxp) / ax);
    const end = Math.atan2((-py - cyp) / ay, (-px - cxp) / ax);
    let sweepAngle = end - start;
    if (!sweep && sweepAngle > 0) sweepAngle -= 2 * Math.PI;
    if (sweep && sweepAngle < 0) sweepAngle += 2 * Math.PI;

    const steps = Math.max(1, Math.ceil(Math.abs(sweepAngle) / (Math.PI / 2)));
    const step = sweepAngle / steps;
    const k = (4 / 3) * Math.tan(step / 4);
    const point = (t) => {
      const ct = Math.cos(t);
      const st = Math.sin(t);
      return [cx + ax * cos * ct - ay * sin * st, cy + ax * sin * ct + ay * cos * st];
    };
    const slope = (t) => {
      const ct = Math.cos(t);
      const st = Math.sin(t);
      return [-ax * cos * st - ay * sin * ct, -ax * sin * st + ay * cos * ct];
    };

    const out = [];
    for (let i = 0; i < steps; i++) {
      const t0 = start + i * step;
      const t1 = t0 + step;
      const p0 = point(t0);
      const p1 = point(t1);
      const d0 = slope(t0);
      const d1 = slope(t1);
      out.push({
        type: "C",
        c1: [p0[0] + k * d0[0], p0[1] + k * d0[1]],
        c2: [p1[0] - k * d1[0], p1[1] - k * d1[1]],
        to: p1,
      });
    }
    return out;
  }

  // ---------- разбор фигур ----------

  const SHAPES = new Set(["rect", "circle", "ellipse", "line", "polyline", "polygon", "path"]);
  const SKIP = new Set(["title", "desc", "metadata", "style", "script", "text", "tspan"]);
  const PASS = new Set(["svg", "g", "a", "switch"]);

  function attr(el, name, fallback = 0) {
    const value = el.getAttribute(name);
    if (value == null || value === "") return fallback;
    const num = parseFloat(value);
    return Number.isFinite(num) ? num : fallback;
  }

  function paintOf(win, el, name) {
    const value = win.getComputedStyle(el).getPropertyValue(name);
    if (!value || value === "none") return null;
    if (/url\(/i.test(value)) return "unsupported";
    return value;
  }

  // Точка из системы координат SVG в пиксели страницы.
  function mapper(el) {
    const m = el.getScreenCTM ? el.getScreenCTM() : null;
    if (!m) return null;
    // Поворот и скос внутри SVG не переносим: фигуры PowerPoint встали бы косо.
    if (Math.abs(m.b) > 0.001 || Math.abs(m.c) > 0.001) return null;
    return {
      point: (x, y) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f],
      scale: (Math.abs(m.a) + Math.abs(m.d)) / 2,
    };
  }

  function shapesOf(win, svg, limit = 400) {
    const out = [];
    const nodes = [svg, ...svg.querySelectorAll("*")];
    if (nodes.length > limit) return null;

    for (const el of nodes) {
      const tag = el.tagName.toLowerCase();
      if (PASS.has(tag) || SKIP.has(tag)) continue;
      if (tag === "defs" || el.closest("defs")) continue;
      if (!SHAPES.has(tag)) return null;

      const style = win.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const map = mapper(el);
      if (!map) return null;

      const fill = paintOf(win, el, "fill");
      const stroke = paintOf(win, el, "stroke");
      if (fill === "unsupported" || stroke === "unsupported") return null;
      const strokeWidth = parseFloat(style.strokeWidth) || 0;
      const shape = {
        fill,
        fillAlpha: parseFloat(style.fillOpacity || "1"),
        stroke,
        strokeAlpha: parseFloat(style.strokeOpacity || "1"),
        strokeW: stroke ? strokeWidth * map.scale : 0,
        dash: style.strokeDasharray && style.strokeDasharray !== "none" ? "dash" : null,
        cap:
          style.strokeLinecap === "round" ? "rnd" : style.strokeLinecap === "square" ? "sq" : null,
        join: style.strokeLinejoin === "round" ? "rnd" : null,
        opacity: parseFloat(style.opacity || "1"),
      };
      if (!shape.fill && !shape.stroke) continue;

      if (tag === "rect") {
        const [x, y] = map.point(attr(el, "x"), attr(el, "y"));
        const [x2, y2] = map.point(
          attr(el, "x") + attr(el, "width"),
          attr(el, "y") + attr(el, "height"),
        );
        const radius = Math.max(attr(el, "rx"), attr(el, "ry")) * map.scale;
        out.push({ ...shape, kind: "rect", x, y, w: x2 - x, h: y2 - y, radius });
        continue;
      }
      if (tag === "circle" || tag === "ellipse") {
        const rx = tag === "circle" ? attr(el, "r") : attr(el, "rx");
        const ry = tag === "circle" ? attr(el, "r") : attr(el, "ry");
        const [x, y] = map.point(attr(el, "cx") - rx, attr(el, "cy") - ry);
        const [x2, y2] = map.point(attr(el, "cx") + rx, attr(el, "cy") + ry);
        out.push({ ...shape, kind: "ellipse", x, y, w: x2 - x, h: y2 - y });
        continue;
      }
      if (tag === "line") {
        const [x1, y1] = map.point(attr(el, "x1"), attr(el, "y1"));
        const [x2, y2] = map.point(attr(el, "x2"), attr(el, "y2"));
        out.push({ ...shape, kind: "line", from: [x1, y1], to: [x2, y2] });
        continue;
      }
      if (tag === "polyline" || tag === "polygon") {
        const flat = numbers(el.getAttribute("points"));
        if (flat.length < 4) continue;
        const points = [];
        for (let i = 0; i + 1 < flat.length; i += 2) points.push(map.point(flat[i], flat[i + 1]));
        out.push({
          ...shape,
          kind: "path",
          subs: [
            {
              start: points[0],
              segs: points.slice(1).map((p) => ({ type: "L", to: p })),
              closed: tag === "polygon",
            },
          ],
        });
        continue;
      }
      const subs = parsePath(el.getAttribute("d"));
      if (!subs || !subs.length) return null;
      const mapped = subs.map((sub) => ({
        start: map.point(sub.start[0], sub.start[1]),
        closed: sub.closed,
        segs: sub.segs.map((seg) =>
          seg.type === "L"
            ? { type: "L", to: map.point(seg.to[0], seg.to[1]) }
            : {
                type: "C",
                c1: map.point(seg.c1[0], seg.c1[1]),
                c2: map.point(seg.c2[0], seg.c2[1]),
                to: map.point(seg.to[0], seg.to[1]),
              },
        ),
      }));
      out.push({ ...shape, kind: "path", subs: mapped });
    }
    return out.length ? out : null;
  }

  // Путь нормируется в долю от своей рамки: так фигура тянется вместе с рамкой,
  // как и положено фигуре PowerPoint.
  function boxOf(shape) {
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    const eat = ([x, y]) => {
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    };
    for (const sub of shape.subs) {
      eat(sub.start);
      for (const seg of sub.segs) {
        eat(seg.to);
        if (seg.type === "C") {
          eat(seg.c1);
          eat(seg.c2);
        }
      }
    }
    return { x: left, y: top, w: Math.max(0.5, right - left), h: Math.max(0.5, bottom - top) };
  }

  function normalize(shape) {
    const box = boxOf(shape);
    const at = ([x, y]) => [(x - box.x) / box.w, (y - box.y) / box.h];
    return {
      ...box,
      path: shape.subs.map((sub) => ({
        start: at(sub.start),
        closed: sub.closed,
        segs: sub.segs.map((seg) =>
          seg.type === "L"
            ? { type: "L", to: at(seg.to) }
            : { type: "C", c1: at(seg.c1), c2: at(seg.c2), to: at(seg.to) },
        ),
      })),
    };
  }

  window.MPGA = window.MPGA || {};
  window.MPGA.svgShapes = shapesOf;
  window.MPGA.svgNormalize = normalize;
  window.MPGA.svgParsePath = parsePath;
})();
