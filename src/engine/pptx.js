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

  function build(ir, meta = {}) {
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    pptx.title = meta.title || "Презентация";
    pptx.company = meta.app || "MPGA";
    pptx.author = meta.author || "";

    const toIn = (px) => (px * ir.epx) / EMU_PER_INCH;

    for (const slide of ir.slides) {
      const s = pptx.addSlide();
      const dy = slide.offsetY || 0;
      if (slide.background) s.background = { color: slide.background };

      for (const box of slide.boxes) {
        const w = Math.max(0.01, toIn(box.w));
        const h = Math.max(0.01, toIn(box.h));
        const opts = { x: toIn(box.x), y: toIn(box.y + dy), w, h };

        if (box.fill) {
          opts.fill = { color: box.fill };
          if (box.alpha != null && box.alpha < 1)
            opts.fill.transparency = Math.round((1 - box.alpha) * 100);
        } else {
          opts.fill = { color: "FFFFFF", transparency: 100 };
        }
        if (box.stroke)
          opts.line = { color: box.stroke, width: Math.max(0.25, box.strokeW * 0.75) };
        if (box.rot) opts.rotate = box.rot;

        let shape = "rect";
        if (box.radius === -1) shape = "ellipse";
        else if (box.radius > 0.5) {
          shape = "roundRect";
          opts.rectRadius = Math.min(toIn(box.radius), Math.min(w, h) / 2);
        }
        s.addShape(shape, opts);
      }

      for (const image of slide.images) {
        const opts = {
          x: toIn(image.x),
          y: toIn(image.y + dy),
          w: Math.max(0.01, toIn(image.w)),
          h: Math.max(0.01, toIn(image.h)),
        };
        if (image.rot) opts.rotate = image.rot;
        if (image.data) s.addImage({ data: image.data, ...opts });
        else
          s.addShape("rect", {
            ...opts,
            fill: { color: "F2F2F2" },
            line: { color: "BFBFBF", width: 1 },
          });
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

        const items = [];
        for (let i = 0; i < runs.length; i++) {
          const run = runs[i];
          if (run.br) {
            if (items.length) items[items.length - 1].options.breakLine = true;
            continue;
          }
          items.push({
            text: run.text,
            options: {
              fontFace: run.font || "Arial",
              fontSize: +(run.size * 0.75).toFixed(1),
              bold: !!run.bold,
              italic: !!run.italic,
              underline: run.underline ? { style: "sng" } : undefined,
              strike: run.strike ? "sngStrike" : undefined,
              color: run.color || "000000",
              charSpacing: run.spacing > 0.1 ? +(run.spacing * 0.75).toFixed(2) : undefined,
              breakLine: false,
            },
          });
        }
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
        const ratio = text.lh / size;
        if (ratio > 1.05 && ratio < 4) opts.lineSpacingMultiple = +ratio.toFixed(2);
        s.addText(items, opts);
      }
    }

    return pptx;
  }

  async function toBlob(ir, meta) {
    const pptx = build(ir, meta);
    return pptx.write({ outputType: "blob" });
  }

  window.MPGA = window.MPGA || {};
  window.MPGA.buildPptx = build;
  window.MPGA.pptxBlob = toBlob;
})();
