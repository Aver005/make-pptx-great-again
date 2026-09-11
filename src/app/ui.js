(() => {
  const PRISTINE = '<!doctype html>\n' + document.documentElement.outerHTML
  const $ = id => document.getElementById(id)
  const BUILD = window.MPGA_BUILD || { version: 'dev', date: '' }

  let current = null

  function setStatus(text, busy) {
    const box = $('status')
    box.classList.toggle('on', !!text)
    box.innerHTML = text ? (busy ? '<span class="spinner"></span>' : '') + text : ''
  }

  function fileName(title) {
    const clean = (title || 'Презентация').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60)
    return `${clean || 'Презентация'}.pptx`
  }

  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
  }

  function esc(text) {
    return String(text).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
  }

  function renderPreview(ir) {
    const host = $('slides')
    host.innerHTML = ''
    const width = 230
    const scale = width / ir.slideW
    for (const slide of ir.slides) {
      const card = document.createElement('div')
      card.className = 'thumb'
      const frame = document.createElement('div')
      frame.className = 'frame'
      frame.style.height = `${Math.round(ir.slideH * scale)}px`
      const stage = document.createElement('div')
      stage.className = 'stage'
      stage.style.cssText =
        `width:${ir.slideW}px;height:${ir.slideH}px;transform:scale(${scale});` +
        `background:${slide.background ? '#' + slide.background : '#fff'}`

      for (const box of slide.boxes) {
        const node = document.createElement('div')
        let css = `left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px;`
        if (box.fill) css += `background:#${box.fill};`
        if (box.stroke) css += `border:${box.strokeW}px solid #${box.stroke};`
        if (box.radius === -1) css += 'border-radius:50%;'
        else if (box.radius > 0) css += `border-radius:${box.radius}px;`
        if (box.rot) css += `transform:rotate(${box.rot}deg);`
        node.style.cssText = css
        stage.appendChild(node)
      }
      for (const image of slide.images) {
        if (!image.data) continue
        const node = document.createElement('img')
        node.src = image.data
        node.style.cssText = `left:${image.x}px;top:${image.y}px;width:${image.w}px;height:${image.h}px`
        stage.appendChild(node)
      }
      for (const text of slide.texts) {
        const node = document.createElement('div')
        node.className = 't'
        const first = text.runs.find(r => !r.br) || {}
        node.style.cssText =
          `left:${text.x}px;top:${text.y}px;width:${text.w}px;height:${text.h}px;` +
          `font:${first.bold ? '700' : '400'} ${first.size}px/${text.lh}px Arial,sans-serif;` +
          `color:#${first.color || '000'};text-align:${text.align};` +
          `display:flex;align-items:center;justify-content:${
            text.align === 'center' ? 'center' : text.align === 'right' || text.align === 'end' ? 'flex-end' : 'flex-start'};`
        node.innerHTML = '<span>' + text.runs.map(run => run.br ? '<br>' :
          `<span style="font-weight:${run.bold ? 700 : 400};font-size:${run.size}px;color:#${run.color};` +
          `${run.italic ? 'font-style:italic;' : ''}${run.spacing > 0.1 ? `letter-spacing:${run.spacing}px;` : ''}">` +
          esc(run.text) + '</span>').join('') + '</span>'
        stage.appendChild(node)
      }
      frame.appendChild(stage)
      card.appendChild(frame)
      const num = document.createElement('div')
      num.className = 'no'
      num.textContent = slide.index + 1
      card.appendChild(num)
      host.appendChild(card)
    }
  }

  function renderNotes(warnings) {
    const host = $('notes')
    host.innerHTML = ''
    const visible = warnings.filter(w => w.level !== 'info' || w.always)
    const fix = window.MPGA.fixMessage(warnings)
    if (!visible.length) {
      const ok = document.createElement('li')
      ok.className = 'note'
      ok.innerHTML = '✅ Всё перенеслось без потерь.'
      host.appendChild(ok)
    }
    for (const note of visible) {
      const item = document.createElement('li')
      item.className = `note ${note.level}`
      item.innerHTML = esc(note.text) + (note.count > 1 ? ` <span style="color:#6b7280">(${note.count} раза)</span>` : '')
      host.appendChild(item)
    }
    if (fix) {
      const item = document.createElement('li')
      item.className = 'note'
      item.innerHTML = 'Хотите переделать? Скопируйте замечания и отправьте их той же нейросети — она пришлёт исправленный файл.' +
        '<div class="fix"><button class="primary" id="copy-fix">Скопировать замечания для нейросети</button></div>'
      host.appendChild(item)
      item.querySelector('#copy-fix').onclick = evt => copy(fix, evt.target, 'Скопировано — вставьте в чат')
    }
  }

  async function copy(text, button, label) {
    const old = button.textContent
    try {
      await navigator.clipboard.writeText(text)
    } catch (err) {
      const area = document.createElement('textarea')
      area.value = text
      document.body.appendChild(area)
      area.select()
      document.execCommand('copy')
      area.remove()
    }
    button.textContent = label || 'Скопировано'
    setTimeout(() => { button.textContent = old }, 2200)
  }

  async function run(source, label) {
    $('result').classList.remove('on')
    setStatus(`Собираю презентацию${label ? ` из ${esc(label)}` : ''}…`, true)
    await new Promise(done => setTimeout(done, 30))
    try {
      const { ir, warnings } = await window.MPGA.convert(source)
      current = { ir, warnings }
      renderPreview(ir)
      renderNotes(warnings)
      const texts = ir.slides.reduce((n, s) => n + s.texts.length, 0)
      $('summary').textContent =
        `${ir.slides.length} ${plural(ir.slides.length, 'слайд', 'слайда', 'слайдов')}, ` +
        `${texts} ${plural(texts, 'текстовый блок', 'текстовых блока', 'текстовых блоков')} — всё редактируется в PowerPoint.`
      setStatus('')
      $('result').classList.add('on')
      $('result').scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch (err) {
      setStatus(`<b>Не получилось.</b> ${esc(err.friendly ? err.message : 'Файл не похож на презентацию: ' + err.message)}` +
        '<br>Попросите нейросеть прислать HTML целиком, одним файлом, и попробуйте снова.')
    }
  }

  function plural(n, one, few, many) {
    const mod10 = n % 10
    const mod100 = n % 100
    if (mod10 === 1 && mod100 !== 11) return one
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
    return many
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('файл не читается'))
      reader.readAsText(file, 'utf-8')
    })
  }

  function bind() {
    $('version').textContent = `версия ${BUILD.version}${BUILD.date ? ` · ${BUILD.date}` : ''}`
    $('prompt-text').value = window.MPGA_PROMPT || ''

    $('copy-prompt').onclick = evt => copy(window.MPGA_PROMPT || '', evt.target, 'Скопировано — вставьте в чат')
    $('pick').onclick = () => $('file').click()
    $('file').onchange = async evt => {
      const file = evt.target.files[0]
      if (file) run(await readFile(file), file.name)
      evt.target.value = ''
    }
    $('demo').onclick = () => run(window.MPGA_DEMO || '', 'примера')
    $('convert-paste').onclick = () => {
      const value = $('paste').value.trim()
      if (value.length < 40) { setStatus('Вставьте код презентации целиком — он начинается с <code>&lt;!doctype html&gt;</code>.'); return }
      run(value, 'вставленного кода')
    }

    const drop = $('drop')
    for (const type of ['dragenter', 'dragover']) {
      drop.addEventListener(type, evt => { evt.preventDefault(); drop.classList.add('over') })
    }
    for (const type of ['dragleave', 'drop']) {
      drop.addEventListener(type, evt => { evt.preventDefault(); drop.classList.remove('over') })
    }
    drop.addEventListener('drop', async evt => {
      const file = evt.dataTransfer.files[0]
      if (file) run(await readFile(file), file.name)
    })

    $('download').onclick = async evt => {
      if (!current) return
      const button = evt.target
      button.disabled = true
      button.textContent = 'Собираю файл…'
      try {
        const blob = await window.MPGA.pptxBlob(current.ir, {
          title: current.ir.title, app: `MPGA ${BUILD.version}`,
        })
        saveBlob(blob, fileName(current.ir.title))
        button.textContent = 'Скачать ещё раз'
      } catch (err) {
        button.textContent = 'Не получилось собрать файл'
      }
      button.disabled = false
    }

    const offline = $('offline-line')
    offline.innerHTML = '<button class="ghost" id="save-offline">Сохранить эту страницу на компьютер</button> ' +
      '— чтобы работала без интернета и когда сайт недоступен.'
    $('save-offline').onclick = () => {
      saveBlob(new Blob([PRISTINE], { type: 'text/html' }), `MPGA-${BUILD.version}.html`)
    }
    $('legal').innerHTML = window.MPGA_LEGAL || ''

    window.addEventListener('error', evt => {
      setStatus(`<b>Что-то пошло не так.</b> ${esc(evt.message || '')}<br>` +
        'Попробуйте другой файл или перезагрузите страницу.')
    })
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind)
  else bind()
})()
