(() => {
  const FIX_HEADER = 'В презентации, которую ты сделал(а), есть проблемы для переноса в PowerPoint. Исправь их и пришли HTML целиком:\n'

  function check(ir, notes = []) {
    const out = [...notes, ...(ir.warnings || [])]
    const push = (code, level, text, fix, slide) => {
      const same = out.find(w => w.code === code && w.slide === slide)
      if (same) { same.count = (same.count || 1) + 1; return }
      out.push({ code, level, text, fix, slide, count: 1 })
    }

    if (!ir.slides || !ir.slides.length) {
      push('no-slides', 'error',
        'В файле не нашлось слайдов.',
        'Каждый слайд должен быть отдельным блоком <section class="slide">.')
      return sort(out)
    }

    ir.slides.forEach(slide => {
      const objects = slide.boxes.length + slide.texts.length + slide.images.length
      if (objects < 2) {
        push('empty-slide', 'warn', `Слайд ${slide.index + 1} получился пустым.`,
          'Проверь, что содержимое слайда лежит внутри <section class="slide">.', slide.index)
      }
      if (objects > 400) {
        push('heavy-slide', 'info', `Слайд ${slide.index + 1} очень насыщенный (${objects} объектов) — PowerPoint может тормозить.`,
          null, slide.index)
      }
      for (const text of slide.texts) {
        if (text.x + text.w > slide.w + 2 || text.x < -2) {
          push('text-overflow', 'warn',
            `Слайд ${slide.index + 1}: текст выходит за край слайда и обрежется.`,
            'Сделай так, чтобы весь текст помещался внутри слайда — уменьши шрифт или сократи подпись.',
            slide.index)
          break
        }
      }
    })

    const totalText = ir.slides.reduce((n, s) => n + s.texts.length, 0)
    if (!totalText) {
      push('no-text', 'error', 'В презентации не нашлось ни одного текста.',
        'Пиши текст обычными тегами (h1, h2, p, b, span), а не рисуй его картинкой.')
    }

    return sort(out)
  }

  function sort(list) {
    const rank = { error: 0, warn: 1, info: 2 }
    return list.slice().sort((a, b) => (rank[a.level] ?? 3) - (rank[b.level] ?? 3))
  }

  function fixMessage(list) {
    const fixes = [...new Set(list.filter(w => w.fix).map(w => w.fix))]
    if (!fixes.length) return null
    return FIX_HEADER + fixes.map((f, i) => `${i + 1}. ${f}`).join('\n')
  }

  window.MPGA = window.MPGA || {}
  window.MPGA.validate = check
  window.MPGA.fixMessage = fixMessage
})()
