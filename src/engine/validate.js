(() => {
  const FIX_HEADER =
    "В презентации, которую ты сделал(а), есть проблемы для переноса в PowerPoint. Исправь их и пришли HTML целиком:\n";

  function check(ir, notes = []) {
    const out = [...notes, ...(ir.warnings || [])];
    const push = (code, level, text, fix, slide) => {
      const same = out.find((w) => w.code === code && w.slide === slide);
      if (same) {
        same.count = (same.count || 1) + 1;
        return;
      }
      out.push({ code, level, text, fix, slide, count: 1 });
    };

    if (!ir.slides || !ir.slides.length) {
      push(
        "no-slides",
        "error",
        "В файле не нашлось слайдов.",
        'Каждый слайд должен быть отдельным блоком <section class="slide">.',
      );
      return sort(out);
    }

    ir.slides.forEach((slide) => {
      const objects = slide.boxes.length + slide.texts.length + slide.images.length;
      if (objects < 2) {
        push(
          "empty-slide",
          "warn",
          `Слайд ${slide.index + 1} получился пустым.`,
          'Проверь, что содержимое слайда лежит внутри <section class="slide">.',
          slide.index,
        );
      }
      if (objects > 400) {
        push(
          "heavy-slide",
          "info",
          `Слайд ${slide.index + 1} очень насыщенный (${objects} объектов) — PowerPoint может тормозить.`,
          null,
          slide.index,
        );
      }
      for (const text of slide.texts) {
        if (text.x + text.w > slide.w + 2 || text.x < -2) {
          push(
            "text-overflow",
            "warn",
            `Слайд ${slide.index + 1}: текст выходит за край слайда и обрежется.`,
            "Сделай так, чтобы весь текст помещался внутри слайда — уменьши шрифт или сократи подпись.",
            slide.index,
          );
          break;
        }
      }
    });

    hidden(ir, push);

    const totalText = ir.slides.reduce((n, s) => n + s.texts.length, 0);
    if (!totalText) {
      push(
        "no-text",
        "error",
        "В презентации не нашлось ни одного текста.",
        "Пиши текст обычными тегами (h1, h2, p, b, span), а не рисуй его картинкой.",
      );
    }

    return sort(out);
  }

  // Текст цвета фона — самая дорогая из тихих поломок: слайд выглядит пустым,
  // и человек узнаёт об этом на защите. Смотрим только сплошные заливки:
  // под градиентом и картинкой судить не о чем.
  function luma(hexValue) {
    const n = parseInt(hexValue, 16);
    if (!Number.isFinite(n)) return null;
    const part = (v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * part((n >> 16) & 255) + 0.7152 * part((n >> 8) & 255) + 0.0722 * part(n & 255);
  }

  function contrast(a, b) {
    const la = luma(a);
    const lb = luma(b);
    if (la == null || lb == null) return null;
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  function hidden(ir, push) {
    for (const slide of ir.slides) {
      if (slide.backgroundGrad) continue;
      for (const text of slide.texts) {
        const run = (text.runs || []).find((r) => !r.br && r.text && r.text.trim());
        if (!run) continue;
        const cx = text.x + text.w / 2;
        const cy = text.y + text.h / 2;
        let under = slide.background || "FFFFFF";
        let covered = false;
        for (const box of slide.boxes) {
          // У линии и произвольного пути рамка — не форма: судить по ней,
          // что лежит под текстом, нельзя.
          if (box.path || box.kind === "line") continue;
          if (box.grad || !box.fill || (box.alpha != null && box.alpha < 0.9)) continue;
          if (cx < box.x || cx > box.x + box.w || cy < box.y || cy > box.y + box.h) continue;
          under = box.fill;
          covered = true;
        }
        for (const image of slide.images) {
          if (cx < image.x || cx > image.x + image.w || cy < image.y || cy > image.y + image.h)
            continue;
          covered = null;
        }
        if (covered === null) continue;
        const ratio = contrast(run.color || "000000", under);
        if (ratio != null && ratio < 1.35) {
          push(
            "invisible-text",
            "warn",
            `Слайд ${slide.index + 1}: текст «${run.text.trim().slice(0, 24)}» сливается с фоном.`,
            "Проверь цвет текста и цвет подложки под ним: на светлом фоне нужен тёмный текст, " +
              "на тёмном — светлый.",
            slide.index,
          );
          break;
        }
      }
    }
  }

  function sort(list) {
    const rank = { error: 0, warn: 1, info: 2 };
    return list.slice().sort((a, b) => (rank[a.level] ?? 3) - (rank[b.level] ?? 3));
  }

  function fixMessage(list) {
    const fixes = [...new Set(list.filter((w) => w.fix).map((w) => w.fix))];
    if (!fixes.length) return null;
    return FIX_HEADER + fixes.map((f, i) => `${i + 1}. ${f}`).join("\n");
  }

  window.MPGA = window.MPGA || {};
  window.MPGA.validate = check;
  window.MPGA.fixMessage = fixMessage;
})();
