(() => {
  const SLIDE_SELECTORS = [
    'section.slide', '.slide', 'section.mpga-slide', '[data-slide]',
    '.page', 'section.page', 'article.slide', 'div.slide',
  ]

  const SAFE_FONTS = 'Arial, "Liberation Sans", Helvetica, sans-serif'
  const SAFE_MONO = '"Courier New", "Liberation Mono", monospace'

  const BASE_CSS = `
    *, *::before, *::after {
      font-family: ${SAFE_FONTS} !important;
      transition: none !important;
      animation: none !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    code, pre, kbd, samp, tt { font-family: ${SAFE_MONO} !important }
    html, body { margin: 0 !important; padding: 0 !important; background: #fff !important;
                 overflow: visible !important; height: auto !important }
    ::selection { background: transparent }
    .mpga-slide-root {
      display: block !important; visibility: visible !important; opacity: 1 !important;
      position: relative !important; left: auto !important; top: auto !important;
      right: auto !important; bottom: auto !important;
      margin: 0 auto 20px !important; float: none !important;
      filter: none !important; clip-path: none !important;
      scale: none !important; translate: none !important; rotate: none !important;
    }
  `

  function findSlides(doc) {
    for (const sel of SLIDE_SELECTORS) {
      const found = [...doc.querySelectorAll(sel)]
      if (found.length) return { selector: sel, nodes: found }
    }
    return { selector: null, nodes: [] }
  }

  function iconSvg(doc, name, icons) {
    const body = icons[name]
    if (!body) return null
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('class', `lucide lucide-${name}`)
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('fill', 'none')
    svg.setAttribute('stroke', 'currentColor')
    svg.setAttribute('stroke-width', '2')
    svg.setAttribute('stroke-linecap', 'round')
    svg.setAttribute('stroke-linejoin', 'round')
    svg.innerHTML = body
    return svg
  }

  const iconNotes = []

  function paintIcons(win, notes = iconNotes) {
    const doc = win.document || win
    const view = win.document ? win : (doc.defaultView || window)
    const icons = window.MPGA_ICONS || {}
    const missing = new Set()
    let done = 0
    const targets = [...doc.querySelectorAll('[data-lucide], [data-icon], [data-mpga-icon]')]
    for (const el of targets) {
      const name = (el.getAttribute('data-lucide') || el.getAttribute('data-icon') ||
                    el.getAttribute('data-mpga-icon') || '').trim().toLowerCase()
      let svg = iconSvg(doc, name, icons)
      if (!svg) {
        missing.add(name || '(пусто)')
        svg = iconSvg(doc, 'circle-help', icons) || iconSvg(doc, 'circle', icons)
      }
      if (!svg) continue

      const st = view.getComputedStyle(el)
      const rect = el.getBoundingClientRect()
      const size = rect.width >= 4 ? rect.width : (parseFloat(st.fontSize) || 24)
      const height = rect.height >= 4 ? rect.height : size
      svg.setAttribute('width', size)
      svg.setAttribute('height', height)
      if (st.color) svg.style.color = st.color
      const strokeWidth = st.getPropertyValue('stroke-width')
      if (strokeWidth && parseFloat(strokeWidth) > 0 && parseFloat(strokeWidth) !== 1) {
        svg.setAttribute('stroke-width', parseFloat(strokeWidth))
      }
      for (const attr of el.attributes) {
        if (attr.name.startsWith('data-')) continue
        if (attr.name === 'class') svg.setAttribute('class', `${svg.getAttribute('class')} ${attr.value}`)
        else if (attr.name === 'style') svg.setAttribute('style', `${svg.getAttribute('style') || ''};${attr.value}`)
        else svg.setAttribute(attr.name, attr.value)
      }
      el.replaceWith(svg)
      done++
    }
    if (done) {
      notes.push({ code: 'icons', level: 'info',
        text: `Иконки (${done} шт.) взяты из встроенного набора — интернет не нужен.` })
    }
    if (missing.size) {
      const list = [...missing].slice(0, 8).join(', ')
      notes.push({ code: 'icon-missing', level: 'warn',
        text: `Не нашлось иконок: ${list}. На их месте — знак вопроса.`,
        fix: `В презентации есть иконки, которых нет в наборе lucide: ${list}. ` +
             `Замени их на существующие имена иконок lucide.` })
    }
    return notes
  }

  function stripExternal(doc, notes) {
    const cut = { scripts: 0, styles: 0, fonts: 0 }
    for (const el of [...doc.querySelectorAll('script[src]')]) {
      if (/^https?:/i.test(el.getAttribute('src') || '')) { el.remove(); cut.scripts++ }
    }
    for (const el of [...doc.querySelectorAll('link[rel~="stylesheet" i], link[rel="preload"][as="style"]')]) {
      const href = el.getAttribute('href') || ''
      if (!/^https?:/i.test(href)) continue
      el.remove()
      if (/fonts\.(googleapis|gstatic)|fontshare|typekit/i.test(href)) cut.fonts++
      else cut.styles++
    }
    for (const st of [...doc.querySelectorAll('style')]) {
      const css = st.textContent || ''
      if (/@import\s+(url\()?["']?https?:/i.test(css)) {
        st.textContent = css.replace(/@import[^;]+;/gi, '')
        cut.fonts++
      }
    }
    if (cut.scripts) {
      notes.push({ code: 'ext-script', level: 'info',
        text: `Убрано подключений из интернета: ${cut.scripts}. Всё нужное уже внутри MPGA.` })
    }
    if (cut.styles) {
      notes.push({ code: 'ext-style', level: 'warn',
        text: `Убрано внешних таблиц стилей: ${cut.styles}. Оформление может отличаться.`,
        fix: 'Не подключай CSS-библиотеки по ссылке (Tailwind, Bootstrap и т. п.). ' +
             'Весь CSS должен быть внутри файла в теге <style>.' })
    }
    if (cut.fonts) {
      notes.push({ code: 'ext-font', level: 'info',
        text: 'Шрифты из интернета заменены на Arial — так презентация выглядит одинаково везде.' })
    }
  }

  function checkImages(doc, notes) {
    const remote = []
    for (const img of doc.querySelectorAll('img')) {
      const src = img.getAttribute('src') || ''
      if (/^https?:/i.test(src)) remote.push(src)
      else if (!/^data:/i.test(src) && src) remote.push(src)
    }
    const bgUrls = []
    for (const st of doc.querySelectorAll('style')) {
      for (const m of (st.textContent || '').matchAll(/url\(\s*["']?(https?:[^"')]+)/gi)) bgUrls.push(m[1])
    }
    if (remote.length || bgUrls.length) {
      notes.push({ code: 'remote-image', level: 'warn',
        text: `Картинок по ссылке из интернета: ${remote.length + bgUrls.length}. ` +
              'Они могут не попасть в PPTX — их не разрешает читать браузер.',
        fix: 'Не вставляй картинки по ссылке (<img src="https://...">). ' +
             'Рисуй иллюстрации через inline SVG или используй иконки lucide.' })
    }
  }

  function addIconShim(doc) {
    const shim = doc.createElement('script')
    shim.textContent =
      'window.lucide = window.lucide || { createIcons: function () {' +
      ' try { window.parent.MPGA.paintIcons(document) } catch (e) {} }, replace: function () {' +
      ' try { window.parent.MPGA.paintIcons(document) } catch (e) {} } };'
    doc.head ? doc.head.insertBefore(shim, doc.head.firstChild) : doc.body.prepend(shim)
  }

  function forceSlidesVisible(doc, slides) {
    for (const el of slides) el.classList.add('mpga-slide-root')
  }

  function normalize(htmlText) {
    const notes = []
    const doc = new DOMParser().parseFromString(htmlText, 'text/html')
    if (!doc.body || !doc.body.children.length) {
      return { doc: null, html: null, notes, slideSelector: null, slideCount: 0 }
    }

    stripExternal(doc, notes)
    addIconShim(doc)
    checkImages(doc, notes)

    const { selector, nodes } = findSlides(doc)
    forceSlidesVisible(doc, nodes)

    const style = doc.createElement('style')
    style.id = 'mpga-base'
    style.textContent = BASE_CSS
    doc.head ? doc.head.appendChild(style) : doc.body.prepend(style)

    return {
      html: '<!doctype html>' + doc.documentElement.outerHTML,
      notes,
      slideSelector: selector,
      slideCount: nodes.length,
    }
  }

  window.MPGA = window.MPGA || {}
  window.MPGA.normalize = normalize
  window.MPGA.paintIcons = (win, notes) => paintIcons(win, notes)
  window.MPGA.drainIconNotes = () => iconNotes.splice(0, iconNotes.length)
  window.MPGA.findSlides = findSlides
  window.MPGA.SLIDE_SELECTORS = SLIDE_SELECTORS
})()
