(() => {
  const FRAME_W = 1920
  const FRAME_H = 1080

  function mountFrame(html) {
    return new Promise((resolve, reject) => {
      const frame = document.createElement('iframe')
      frame.setAttribute('sandbox', 'allow-same-origin allow-scripts')
      frame.setAttribute('aria-hidden', 'true')
      frame.style.cssText =
        `position:fixed;left:-20000px;top:0;width:${FRAME_W}px;height:${FRAME_H}px;border:0;` +
        'background:#fff;visibility:visible;pointer-events:none'
      frame.onload = () => resolve(frame)
      frame.onerror = () => reject(new Error('не удалось открыть файл презентации'))
      frame.srcdoc = html
      document.body.appendChild(frame)
    })
  }

  async function settle(frame) {
    const win = frame.contentWindow
    const doc = win.document
    if (!doc) throw new Error('браузер не дал прочитать содержимое файла')
    try { await doc.fonts.ready } catch (err) { /* шрифты уже готовы */ }
    const images = [...doc.images].filter(img => !img.complete)
    if (images.length) {
      await Promise.race([
        Promise.all(images.map(img => new Promise(done => {
          img.addEventListener('load', done, { once: true })
          img.addEventListener('error', done, { once: true })
        }))),
        new Promise(done => win.setTimeout(done, 4000)),
      ])
    }
    await new Promise(done => win.requestAnimationFrame(() => win.requestAnimationFrame(done)))
    const height = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight, FRAME_H)
    frame.style.height = `${height}px`
    await new Promise(done => win.requestAnimationFrame(() => win.requestAnimationFrame(done)))
  }

  async function convert(htmlText, options = {}) {
    const started = Date.now()
    window.MPGA.drainIconNotes()
    const normalized = window.MPGA.normalize(htmlText)
    if (!normalized.html) {
      const err = new Error('Это не похоже на HTML-файл с презентацией.')
      err.friendly = true
      throw err
    }

    const frame = await mountFrame(normalized.html)
    let ir
    let notes = [...normalized.notes]
    try {
      await settle(frame)
      const win = frame.contentWindow
      if (!win.document.querySelector('.mpga-slide-root')) {
        const err = new Error('В файле не нашлось слайдов: ожидались блоки <section class="slide">.')
        err.friendly = true
        throw err
      }
      window.MPGA.paintIcons(win)
      notes = notes.concat(window.MPGA.drainIconNotes())
      await new Promise(done => win.requestAnimationFrame(() => win.requestAnimationFrame(done)))
      ir = window.MPGA.extract(win, options)
      notes = notes.concat(await window.MPGA.resolveImages(ir))
      const captured = await window.MPGA.captureAll(win, ir, options)
      notes = notes.concat(captured.notes)
      ir.title = (win.document.title || '').trim()
    } finally {
      if (!options.keepFrame) frame.remove()
      else options.onFrame && options.onFrame(frame)
    }

    const warnings = window.MPGA.validate(ir, notes)
    ir.ms = Date.now() - started
    return { ir, warnings, slideSelector: normalized.slideSelector }
  }

  window.MPGA = window.MPGA || {}
  window.MPGA.convert = convert
})()
