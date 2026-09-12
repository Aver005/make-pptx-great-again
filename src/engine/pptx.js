(() => {
  const EMU_PER_INCH = 914400;

  const ALIGN = {
    left: "left",
    start: "left",
    center: "center",
    right: "right",
    end: "right",
    justify: "justify",
  };

  const VALIGN = { top: "top", middle: "middle", bottom: "bottom", baseline: "middle" };

  const UNDERLINE = {
    solid: "sng",
    double: "dbl",
    dotted: "dotted",
    dashed: "dash",
    wavy: "wavy",
  };

  // Эффектов, которых нет в API PptxGenJS (градиент, анимация, переход),
  // добьёмся правкой XML уже собранного файла — фигуре достаточно дать имя.
  const objName = (kind, si, n) => `mpga-${kind}-${si}-${n}`;

  function build(ir, meta = {}) {
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    pptx.title = meta.title || "Презентация";
    pptx.company = meta.app || "MPGA";
    pptx.author = meta.author || "";

    const toIn = (px) => (px * ir.epx) / EMU_PER_INCH;
    const patches = [];

    for (const slide of ir.slides) {
      const s = pptx.addSlide();
      const si = slide.index;
      const dy = slide.offsetY || 0;
      let marked = 0;
      const groups = new Map();
      if (slide.background) s.background = { color: slide.background };

      if (slide.backgroundGrad) {
        const name = objName("grad", si, marked++);
        let grad = slide.backgroundGrad;
        // radial-gradient(circle …) — настоящий круг, а заливка по пути в
        // PowerPoint всегда повторяет форму фигуры. Значит, фигура должна быть
        // квадратом: лишнее уйдёт за край слайда и не помешает.
        let box = { x: 0, y: 0, w: ir.slideW, h: ir.slideH + 2 * dy };
        if (grad.kind === "radial" && grad.round) {
          const cx = (grad.center.x / 100) * box.w;
          const cy = (grad.center.y / 100) * box.h;
          const reach = Math.max(
            Math.hypot(cx, cy),
            Math.hypot(box.w - cx, cy),
            Math.hypot(cx, box.h - cy),
            Math.hypot(box.w - cx, box.h - cy),
          );
          box = { x: cx - reach, y: cy - reach, w: reach * 2, h: reach * 2 };
          grad = { ...grad, center: { x: 50, y: 50 } };
        }
        s.addShape("rect", {
          x: toIn(box.x),
          y: toIn(box.y),
          w: toIn(box.w),
          h: toIn(box.h),
          fill: { color: grad.stops[0].hex },
          line: { type: "none" },
          objectName: name,
        });
        patches.push({ slide: si, name, grad });
      }

      // Фигуры, картинки и таблицы кладутся в порядке разметки: кто позже
      // написан, тот выше. Иначе схема накрывает карточки, поверх которых
      // она нарисована в браузере.
      const layer = [
        ...slide.boxes.map((box) => ({ seq: box.seq || 0, box })),
        ...slide.images.map((image) => ({ seq: image.seq || 0, image })),
        ...(slide.tables || []).map((table) => ({ seq: table.seq || 0, table })),
      ].sort((a, b) => a.seq - b.seq);

      for (const item of layer) {
        if (item.box) {
          const box = item.box;
          const w = Math.max(0.01, toIn(box.w));
          const h = Math.max(0.01, toIn(box.h));
          const opts = { x: toIn(box.x), y: toIn(box.y + dy), w, h };

          if (box.grad) {
            const name = objName("grad", si, marked++);
            opts.objectName = name;
            opts.fill = { color: box.grad.stops[0].hex };
            patches.push({ slide: si, name, grad: box.grad, anim: box.anim });
          } else if (box.fill) {
            opts.fill = { color: box.fill };
            if (box.alpha != null && box.alpha < 1)
              opts.fill.transparency = Math.round((1 - box.alpha) * 100);
          } else {
            opts.fill = { color: "FFFFFF", transparency: 100 };
          }

          if (box.stroke) {
            opts.line = { color: box.stroke, width: Math.max(0.25, box.strokeW * 0.75) };
            if (box.dash && box.dash !== "solid") opts.line.dashType = box.dash;
            if (box.strokeAlpha != null && box.strokeAlpha < 1)
              opts.line.transparency = Math.round((1 - box.strokeAlpha) * 100);
          }
          if (box.flip) opts.flipV = true;
          if (box.rot) opts.rotate = box.rot;
          if (box.shadow) opts.shadow = shadowOpts(box.shadow);

          if (box.group) {
            opts.objectName = objName("part", si, marked++);
            const known = groups.get(box.group);
            if (known) known.names.push(opts.objectName);
            else groups.set(box.group, { names: [opts.objectName] });
          }
          if (box.path) {
            if (!opts.objectName) opts.objectName = objName("path", si, marked++);
            patches.push({
              slide: si,
              name: opts.objectName,
              path: box.path,
              cap: box.cap,
              join: box.join,
              anim: box.anim,
            });
            s.addShape("rect", opts);
            continue;
          }
          if (box.kind === "line") {
            if (box.cap || box.join) {
              if (!opts.objectName) opts.objectName = objName("line", si, marked++);
              patches.push({ slide: si, name: opts.objectName, cap: box.cap, join: box.join });
            }
            s.addShape("line", opts);
            continue;
          }

          if (box.clip || box.corners) {
            if (!opts.objectName) opts.objectName = objName("clip", si, marked++);
            patches.push({
              slide: si,
              name: opts.objectName,
              clip: box.clip,
              corners: box.corners ? box.corners.map((v) => v * ir.epx) : null,
              size: { w: box.w * ir.epx, h: box.h * ir.epx },
              anim: box.anim,
            });
          } else if (box.anim && !opts.objectName) {
            opts.objectName = objName("anim", si, marked++);
            patches.push({ slide: si, name: opts.objectName, anim: box.anim });
          }

          let shape = "rect";
          if (box.radius === -1) shape = "ellipse";
          else if (box.radius > 0.5) {
            shape = "roundRect";
            opts.rectRadius = Math.min(toIn(box.radius), Math.min(w, h) / 2);
          }
          s.addShape(shape, opts);
          continue;
        }

        if (item.image) {
          const image = item.image;
          const opts = {
            x: toIn(image.x),
            y: toIn(image.y + dy),
            w: Math.max(0.01, toIn(image.w)),
            h: Math.max(0.01, toIn(image.h)),
          };
          if (image.rot) opts.rotate = image.rot;
          if (image.anim) {
            opts.objectName = objName("anim", si, marked++);
            patches.push({ slide: si, name: opts.objectName, anim: image.anim });
          }
          if (image.alt) opts.altText = image.alt;
          if (image.fit === "cover" || image.fit === "contain") {
            opts.sizing = { type: image.fit, w: opts.w, h: opts.h };
          }
          if (image.data) s.addImage({ data: image.data, ...opts });
          else
            s.addShape("rect", {
              ...opts,
              fill: { color: "F2F2F2" },
              line: { color: "BFBFBF", width: 1 },
            });
          continue;
        }

        addTable(s, item.table, toIn, dy);
      }

      for (const [key, group] of groups) {
        if (group.names.length > 1) patches.push({ slide: si, group: key, names: group.names });
      }

      for (const text of slide.texts) {
        const runs = text.runs || [];
        if (!runs.length) continue;
        const first = runs.find((r) => !r.br) || {};
        const size = first.size || 16;
        const wrap = (text.lines || 1) > 1;
        const padX = wrap ? 2 : 8;
        const align = ALIGN[text.align] || "left";

        let left = text.x - padX / 2;
        if (align === "right") left = text.x - padX;
        if (align === "left") left = text.x - 1;

        const items = runs
          .map((run) => (run.br ? { br: true } : { text: run.text, options: runOpts(run) }))
          .reduce((acc, item) => {
            if (item.br) {
              if (acc.length) acc[acc.length - 1].options.breakLine = true;
              return acc;
            }
            acc.push(item);
            return acc;
          }, []);
        if (!items.length) continue;

        const opts = {
          x: toIn(left),
          y: toIn(text.y - 1 + dy),
          w: Math.max(0.05, toIn(text.w + padX)),
          h: Math.max(0.05, toIn(text.h + 2)),
          margin: 0,
          valign: "middle",
          align,
          wrap,
          isTextBox: true,
          fit: "shrink",
          fontFace: first.font || "Arial",
          fontSize: +(size * 0.75).toFixed(1),
          color: first.color || "000000",
        };
        if (text.bullet) {
          opts.bullet = text.bullet.number
            ? { type: "number", style: "arabicPeriod", startAt: text.bullet.number }
            : { code: text.bullet.char.codePointAt(0).toString(16).toUpperCase().padStart(4, "0") };
          opts.bullet.indent = +(text.bullet.indent * 0.75).toFixed(1);
          opts.align = "left";
        }
        if (text.rot) opts.rotate = text.rot;
        if (text.anim || text.vert || text.columns) {
          opts.objectName = objName("text", si, marked++);
          patches.push({
            slide: si,
            name: opts.objectName,
            anim: text.anim,
            body: {
              vert: text.vert,
              numCol: text.columns ? text.columns.count : 0,
              spcCol: text.columns ? Math.round(text.columns.gap * ir.epx) : 0,
            },
          });
        }
        if (text.shadow) opts.shadow = shadowOpts(text.shadow);
        // Межстрочный задаётся в пунктах, а не множителем: множитель PowerPoint
        // считает от «одинарного» интервала шрифта (у Arial это ~1,2 кегля),
        // и строки расходились тем сильнее, чем плотнее было в браузере.
        if (text.lh > 1 && text.lines > 1) opts.lineSpacing = +(text.lh * 0.75).toFixed(1);
        s.addText(items, opts);
      }
    }

    pptx.mpgaPatches = patches;
    return pptx;
  }

  function runOpts(run) {
    const opts = {
      fontFace: run.font || "Arial",
      fontSize: +(run.size * 0.75).toFixed(1),
      bold: !!run.bold,
      italic: !!run.italic,
      underline: run.underline
        ? { style: UNDERLINE[run.underlineStyle] || "sng", color: run.underlineColor }
        : undefined,
      strike: run.strike ? "sngStrike" : undefined,
      color: run.color || "000000",
      charSpacing: Math.abs(run.spacing) > 0.1 ? +(run.spacing * 0.75).toFixed(2) : undefined,
      breakLine: false,
    };
    if (run.fade != null && run.fade < 1) opts.transparency = Math.round((1 - run.fade) * 100);
    if (run.link) opts.hyperlink = { url: run.link };
    return opts;
  }

  // PptxGenJS переписывает объект тени на месте (градусы становятся
  // шестидесятитысячными), поэтому каждой фигуре — свой свежий объект.
  function shadowOpts(shadow) {
    const dist = Math.hypot(shadow.dx, shadow.dy);
    const angle =
      ((Math.round((Math.atan2(shadow.dy, shadow.dx) * 180) / Math.PI) % 360) + 360) % 360;
    return {
      type: "outer",
      color: shadow.hex,
      opacity: Math.max(0.05, Math.min(1, shadow.alpha)),
      blur: +(shadow.blur * 0.75).toFixed(2),
      offset: +(dist * 0.75).toFixed(2),
      angle,
    };
  }

  function addTable(slide, table, toIn, dy) {
    const rows = table.rows.map((row) =>
      row.map((cell) => {
        const opts = {
          align: ALIGN[cell.align] || "left",
          valign: VALIGN[cell.valign] || "middle",
          margin: cell.pad.map((v) => +(v * 0.75).toFixed(1)),
        };
        if (cell.fill && cell.fillAlpha > 0.02) {
          opts.fill = { color: cell.fill };
          if (cell.fillAlpha < 1) opts.fill.transparency = Math.round((1 - cell.fillAlpha) * 100);
        }
        if (cell.colspan > 1) opts.colspan = cell.colspan;
        if (cell.rowspan > 1) opts.rowspan = cell.rowspan;
        opts.border = cell.borders.map((b) =>
          b
            ? {
                type: b.dash === "solid" ? "solid" : "dash",
                pt: +(b.w * 0.75).toFixed(2),
                color: b.hex,
              }
            : { type: "none" },
        );
        const first = cell.runs.find((r) => !r.br);
        if (first) {
          opts.fontFace = first.font || "Arial";
          opts.fontSize = +(first.size * 0.75).toFixed(1);
          opts.color = first.color || "000000";
          opts.bold = !!first.bold;
        }
        return {
          text: cell.runs.map((run) => ({ text: run.text, options: runOpts(run) })),
          options: opts,
        };
      }),
    );

    slide.addTable(rows, {
      x: toIn(table.x),
      y: toIn(table.y + dy),
      w: toIn(table.w),
      colW: table.widths.map((v) => toIn(v)),
      rowH: table.heights.map((v) => toIn(v)),
      autoPage: false,
    });
  }

  async function toBlob(ir, meta) {
    const pptx = build(ir, meta);
    const blob = await pptx.write({ outputType: "blob" });
    if (!window.MPGA.applyOoxml) return blob;
    return window.MPGA.applyOoxml(blob, ir, pptx.mpgaPatches);
  }

  window.MPGA = window.MPGA || {};
  window.MPGA.buildPptx = build;
  window.MPGA.pptxBlob = toBlob;
})();
