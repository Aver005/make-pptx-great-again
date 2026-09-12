(() => {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const XHTML_NS = "http://www.w3.org/1999/xhtml";

  const SVG_PROPS = [
    "fill",
    "fill-opacity",
    "fill-rule",
    "stroke",
    "stroke-width",
    "stroke-opacity",
    "stroke-linecap",
    "stroke-linejoin",
    "stroke-dasharray",
    "stroke-dashoffset",
    "opacity",
    "color",
    "display",
    "visibility",
    "font-family",
    "font-size",
    "font-weight",
    "font-style",
    "text-anchor",
    "letter-spacing",
    "paint-order",
  ];

  function bakeSvg(win, src, clone) {
    const pairs = [[src, clone]];
    const srcNodes = src.querySelectorAll("*");
    const cloneNodes = clone.querySelectorAll("*");
    for (let i = 0; i < srcNodes.length && i < cloneNodes.length; i++) {
      pairs.push([srcNodes[i], cloneNodes[i]]);
    }
    for (const [a, b] of pairs) {
      const st = win.getComputedStyle(a);
      let css = "";
      for (const prop of SVG_PROPS) {
        const value = st.getPropertyValue(prop);
        if (value && value !== "auto") css += `${prop}:${value};`;
      }
      b.setAttribute("style", css);
    }
  }

  function bakeDom(win, src, clone) {
    const pairs = [[src, clone]];
    const srcNodes = src.querySelectorAll("*");
    const cloneNodes = clone.querySelectorAll("*");
    for (let i = 0; i < srcNodes.length && i < cloneNodes.length; i++) {
      pairs.push([srcNodes[i], cloneNodes[i]]);
    }
    for (const [a, b] of pairs) {
      if (b.nodeName === "SCRIPT" || b.nodeName === "STYLE") {
        b.remove();
        continue;
      }
      const st = win.getComputedStyle(a);
      let css = "";
      for (let i = 0; i < st.length; i++) {
        const prop = st[i];
        css += `${prop}:${st.getPropertyValue(prop)};`;
      }
      b.setAttribute("style", css);
    }
  }

  function svgToUrl(markup) {
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(markup);
  }

  function drawToPng(url, w, h, scale) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        let empty = true;
        try {
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          for (let i = 3; i < data.length; i += 4) {
            if (data[i] > 8) {
              empty = false;
              break;
            }
          }
          resolve({ url: canvas.toDataURL("image/png"), empty });
        } catch (err) {
          resolve({ url: null, empty: true, error: String(err) });
        }
      };
      img.onerror = () => reject(new Error("не удалось нарисовать картинку"));
      img.src = url;
    });
  }

  async function captureSvg(win, el, rect, hideText, scale) {
    const clone = el.cloneNode(true);
    bakeSvg(win, el, clone);
    if (hideText) {
      for (const node of clone.querySelectorAll("text")) node.setAttribute("style", "display:none");
    }
    clone.setAttribute("xmlns", SVG_NS);
    clone.setAttribute("width", rect.width);
    clone.setAttribute("height", rect.height);
    if (!clone.getAttribute("viewBox")) {
      const box = el.getBBox ? el.getBBox() : null;
      if (box)
        clone.setAttribute(
          "viewBox",
          `0 0 ${Math.max(1, box.width + box.x)} ${Math.max(1, box.height + box.y)}`,
        );
    }
    const markup = new XMLSerializer().serializeToString(clone);
    return drawToPng(svgToUrl(markup), rect.width, rect.height, scale);
  }

  async function captureDom(win, el, rect, selfOnly, scale) {
    const clone = el.cloneNode(true);
    bakeDom(win, el, clone);
    if (selfOnly) {
      for (const node of clone.querySelectorAll("*")) {
        node.setAttribute("style", `${node.getAttribute("style") || ""};visibility:hidden`);
      }
    }
    clone.setAttribute(
      "style",
      `${clone.getAttribute("style") || ""};margin:0;transform:none;position:static;` +
        `width:${rect.width}px;height:${rect.height}px;box-sizing:border-box`,
    );
    const holder = document.createElementNS(XHTML_NS, "div");
    holder.setAttribute("xmlns", XHTML_NS);
    holder.appendChild(clone);
    const markup =
      `<svg xmlns="${SVG_NS}" width="${rect.width}" height="${rect.height}">` +
      `<foreignObject x="0" y="0" width="${rect.width}" height="${rect.height}">` +
      new XMLSerializer().serializeToString(holder) +
      "</foreignObject></svg>";
    return drawToPng(svgToUrl(markup), rect.width, rect.height, scale);
  }

  async function captureAll(win, ir, options = {}) {
    const scale = options.scale || 2;
    const shots = {};
    const notes = [];
    for (const slide of ir.slides) {
      for (const cap of slide.captures) {
        const el = win.document.querySelector(`[data-mpga-cap="${cap.id}"]`);
        if (!el) continue;
        let rect = el.getBoundingClientRect();
        if (cap.kind === "transform" && el.offsetWidth) {
          rect = { width: el.offsetWidth, height: el.offsetHeight };
        }
        try {
          const isSvg = el.tagName.toLowerCase() === "svg";
          const shot = isSvg
            ? await captureSvg(win, el, rect, cap.hideText, scale)
            : await captureDom(win, el, rect, cap.selfOnly, scale);
          if (shot.url && !shot.empty) shots[cap.id] = shot.url;
          else
            notes.push({
              code: "empty-raster",
              level: "warn",
              slide: slide.index,
              text: `Слайд ${slide.index + 1}: часть графики не удалось перерисовать — она пропала.`,
              fix: "Рисуй схемы через inline SVG без внешних картинок и без фоновых изображений по ссылке.",
            });
        } catch (err) {
          notes.push({
            code: "raster-failed",
            level: "warn",
            slide: slide.index,
            text: `Слайд ${slide.index + 1}: не получилось перерисовать графику (${err.message}).`,
          });
        }
      }
      slide.images = slide.images.filter((im) => im.kind === "img" || shots[im.id]);
      for (const im of slide.images) if (shots[im.id]) im.data = shots[im.id];
    }
    return { shots, notes };
  }

  async function resolveImages(ir) {
    const notes = [];
    for (const slide of ir.slides) {
      for (const im of slide.images) {
        if (im.kind !== "img") continue;
        if (/^data:/i.test(im.src)) {
          im.data = im.src;
          continue;
        }
        try {
          const res = await fetch(im.src, { mode: "cors" });
          const blob = await res.blob();
          im.data = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });
        } catch {
          im.missing = true;
          notes.push({
            code: "image-unreachable",
            level: "warn",
            slide: slide.index,
            text: `Слайд ${slide.index + 1}: картинку по ссылке вставить не удалось, на её месте будет пустая рамка.`,
            fix:
              "Не вставляй картинки по ссылке из интернета — браузер не даёт их прочитать. " +
              "Используй иконки или нарисуй иллюстрацию через inline SVG.",
          });
        }
      }
      slide.images = slide.images.filter((im) => im.kind !== "img" || im.data || im.missing);
    }
    return notes;
  }

  window.MPGA = window.MPGA || {};
  window.MPGA.captureAll = captureAll;
  window.MPGA.resolveImages = resolveImages;
})();
