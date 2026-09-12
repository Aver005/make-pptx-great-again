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
    let captureSeq = 0;

    slideEls.forEach((slideEl, si) => {
      const S = slideEl.getBoundingClientRect();
      const ox = S.left;
      const oy = S.top;
      const boxes = [];
      const texts = [];
      const images = [];
      const captures = [];

      if (Math.abs(S.width - first.width) > 1) {
        warn(
          "slide-size",
          `Слайд ${si + 1} другого размера, чем первый — он может обрезаться.`,
          "Сделай все слайды одного размера.",
          si,
        );
      }

      const rasterRoots = new Map();
      const rotatedRoots = new Set();
      const spunBoxes = new Map();

      const markRaster = (el, kind) => {
        if (rasterRoots.has(el)) return;
        for (const other of rasterRoots.keys()) if (other.contains(el)) return;
        rasterRoots.set(el, kind);
      };

      const walkAll = (el) => [el, ...el.querySelectorAll("*")];

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
        else if (t.rot !== 0 || !t.simple) {
          const plain = t.rot !== 0 && t.simple && !el.children.length && !el.textContent.trim();
          if (plain) spunBoxes.set(el, t.rot);
          else {
            markRaster(el, "transform");
            rotatedRoots.add(el);
          }
        }
      }

      const insideRaster = (el) => {
        for (const root of rasterRoots.keys()) if (root !== el && root.contains(el)) return true;
        return false;
      };

      if (rotatedRoots.size) {
        warn(
          "rotated",
          `Повёрнутые блоки (${rotatedRoots.size} шт.) вставлены картинкой — текст в них не редактируется.`,
          "Не поворачивай блоки через transform: rotate — PowerPoint получает их картинкой.",
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
        captures.push({ id, kind, ...extra });
        const rot = kind === "transform" ? transformInfo(style(el).transform).rot : 0;
        const w = rot ? el.offsetWidth || rect.width : rect.width;
        const h = rot ? el.offsetHeight || rect.height : rect.height;
        images.push({
          id,
          kind,
          rot,
          x: rot ? (rect.left + rect.right) / 2 - ox - w / 2 : rect.left - ox,
          y: rot ? (rect.top + rect.bottom) / 2 - oy - h / 2 : rect.top - oy,
          w,
          h,
        });
        return id;
      };

      const pushBoxesFor = (el, st, r, geom) => {
        const bg = hex(st.backgroundColor);
        const hasBgImage = st.backgroundImage && st.backgroundImage !== "none";
        const sides = ["Top", "Right", "Bottom", "Left"]
          .map((s) => ({
            w: px(st[`border${s}Width`]),
            c: hex(st[`border${s}Color`]),
            side: s.toLowerCase(),
          }))
          .filter((b) => b.w > 0.4 && b.c && st[`border${b.side}Style`] !== "none");
        const uniform =
          sides.length === 4 &&
          sides.every((b) => Math.abs(b.w - sides[0].w) < 0.5 && b.c.hex === sides[0].c.hex);

        let radius = px(st.borderTopLeftRadius);
        if (String(st.borderTopLeftRadius).includes("%"))
          radius = (r.width * px(st.borderTopLeftRadius)) / 100;
        const isOval = radius > 0 && radius >= Math.min(r.width, r.height) / 2 - 1;

        if (hasBgImage) {
          addCapture(el, "background", r, { selfOnly: true });
          return;
        }
        if (!bg && !sides.length) return;

        const box = {
          x: geom.x,
          y: geom.y,
          w: geom.w,
          h: geom.h,
          fill: bg ? bg.hex : null,
          alpha: bg ? bg.alpha : 1,
          radius: isOval ? -1 : radius,
        };
        if (geom.rot) box.rot = geom.rot;
        if (uniform) {
          box.stroke = sides[0].c.hex;
          box.strokeW = sides[0].w;
        }
        boxes.push(box);

        if (!uniform) {
          for (const b of sides) {
            const bar = { x: geom.x, y: geom.y, w: geom.w, h: geom.h, fill: b.c.hex, radius: 0 };
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

      const pushPseudo = (el, r, which) => {
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
        boxes.push({
          x: r.left - ox + x,
          y: r.top - oy + y,
          w,
          h,
          fill: fill.hex,
          alpha: fill.alpha,
          radius: px(p.borderTopLeftRadius),
        });
      };

      const runStyle = (el, st) => ({
        size: px(st.fontSize),
        bold: st.fontWeight === "bold" || (parseInt(st.fontWeight, 10) || 400) >= 600,
        italic: st.fontStyle === "italic" || st.fontStyle === "oblique",
        underline: st.textDecorationLine.includes("underline"),
        strike: st.textDecorationLine.includes("line-through"),
        color: (hex(st.color) || { hex: "000000" }).hex,
        spacing: px(st.letterSpacing),
        font: fontOf(st.fontFamily),
        transform: st.textTransform,
        collapse: !String(st.whiteSpace).startsWith("pre"),
      });

      const makeRun = (text, st) => {
        const s = runStyle(null, st);
        let value = s.collapse ? text.replace(/\s+/g, " ") : text;
        value = applyTransform(value, s.transform);
        return { text: value, ...s };
      };

      const collectRuns = (el) => {
        const runs = [];
        const eaten = [];
        const used = [];
        for (const node of el.childNodes) {
          if (node.nodeType === 3) {
            if (!node.textContent.trim() && !runs.length) continue;
            runs.push(makeRun(node.textContent, style(el)));
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
          if (rasterRoots.has(node) || spunBoxes.has(node)) continue;
          const nst = style(node);
          if (nst.display === "none" || nst.visibility === "hidden") continue;
          if (!nst.display.startsWith("inline")) continue;
          if (node.querySelector("div,p,section,ul,ol,li,table,h1,h2,h3,h4,h5,h6,svg,img"))
            continue;
          if (!node.textContent.trim()) continue;
          runs.push(makeRun(node.textContent, nst));
          used.push(node);
          eaten.push(node, ...node.querySelectorAll("*"));
        }
        if (!runs.some((rn) => rn.text && rn.text.trim())) return null;
        return { runs, eaten, used };
      };

      const directText = (el) => {
        for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) return true;
        return false;
      };

      for (const el of walkAll(slideEl)) {
        const tag = el.tagName.toLowerCase();
        if (tag === "style" || tag === "script" || tag === "br") continue;
        if (insideRaster(el)) continue;
        const st = style(el);
        if (st.display === "none" || st.visibility === "hidden" || px(st.opacity) === 0) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;

        if (rasterRoots.has(el)) {
          const kind = rasterRoots.get(el);
          const hasText = tag === "svg" && el.querySelector("text");
          addCapture(el, kind, r, { hideText: !!hasText });
          if (hasText) collectSvgText(el, r);
          continue;
        }

        const spun = spunBoxes.get(el);
        const geom = spun
          ? {
              x: (r.left + r.right) / 2 - ox - (el.offsetWidth || r.width) / 2,
              y: (r.top + r.bottom) / 2 - oy - (el.offsetHeight || r.height) / 2,
              w: el.offsetWidth || r.width,
              h: el.offsetHeight || r.height,
              rot: spun,
            }
          : { x: r.left - ox, y: r.top - oy, w: r.width, h: r.height, rot: 0 };

        if (el !== slideEl) {
          pushBoxesFor(el, st, r, geom);
          pushPseudo(el, r, "::before");
          pushPseudo(el, r, "::after");
        } else {
          pushPseudo(el, r, "::before");
          pushPseudo(el, r, "::after");
        }

        if (tag === "img") {
          const src = el.getAttribute("src") || "";
          images.push({
            id: `img-${si}-${captureSeq++}`,
            kind: "img",
            src,
            x: r.left - ox,
            y: r.top - oy,
            w: r.width,
            h: r.height,
          });
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
        texts.push({
          x: boxX - ox,
          y: ink.top - oy,
          w: boxW,
          h: ink.height,
          align: st.textAlign,
          lh,
          lines,
          runs: collected.runs.filter((rn) => rn.br || rn.text.trim() !== ""),
        });
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

      slides.push({
        index: si,
        w: S.width,
        h: S.height,
        background: slideBg && slideBg.alpha > 0.9 ? slideBg.hex : null,
        boxes,
        texts,
        images,
        captures,
        offsetY: Math.max(0, (SLIDE_H_EMU / epx - S.height) / 2),
      });
    });

    return { epx, slideW: first.width, slideH: first.height, slides, warnings };
  }

  window.MPGA = window.MPGA || {};
  window.MPGA.extract = extract;
  window.MPGA.EMU = { W: SLIDE_W_EMU, H: SLIDE_H_EMU };
})();
