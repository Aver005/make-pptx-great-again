/**
 * Добровольная отправка проблемной презентации разработчику.
 *
 * Этот файл собирается ТОЛЬКО в версию для сайта. В офлайн-копии его нет, и
 * там же `connect-src 'none'` запрещает браузеру любые запросы — то есть
 * невозможность отправки в скачанном файле обеспечена не обещанием, а тем,
 * что кода и разрешения в нём попросту нет.
 */
(() => {
  const config = window.MPGA_REPORT;
  if (!config) return;

  const $ = (id) => document.getElementById(id);

  function clientToken() {
    try {
      const saved = localStorage.getItem("mpga-client");
      if (saved && /^[0-9a-f]{32}$/.test(saved)) return saved;
      const token = [...crypto.getRandomValues(new Uint8Array(16))]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      localStorage.setItem("mpga-client", token);
      return token;
    } catch {
      return null;
    }
  }

  function hide() {
    const box = $("report");
    if (box) box.hidden = true;
  }

  function offer(source, stats) {
    const box = $("report");
    if (!box || !source) return;
    const agree = $("report-agree");
    const send = $("report-send");
    const state = $("report-state");

    box.hidden = false;
    agree.checked = false;
    state.textContent = "";
    send.hidden = false;
    send.disabled = true;
    const revoke = $("report-revoke");
    if (revoke) {
      revoke.hidden = true;
      revoke.disabled = false;
    }

    const bytes = new Blob([source]).size;
    if (bytes > config.maxBytes) {
      state.textContent = `Файл больше ${(config.maxBytes / 1024 / 1024) | 0} МБ — столько принять не получится.`;
      agree.disabled = true;
      return;
    }

    agree.disabled = false;
    agree.onchange = () => {
      send.disabled = !agree.checked;
    };

    send.onclick = async () => {
      const token = clientToken();
      if (!token) {
        state.textContent = "Браузер не разрешает запомнить отправку — разрешите хранилище сайта.";
        return;
      }
      send.disabled = true;
      state.textContent = "Отправляю…";
      try {
        const response = await fetch(config.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ client: token, source, stats: stats ?? null }),
        });
        const answer = await response.json().catch(() => ({}));
        if (response.ok && answer.ok) {
          remember(answer.id, answer.secret);
          state.textContent = `Спасибо, файл принят (номер ${answer.id}) и хранится ${answer.keepDays} дней.`;
          agree.disabled = true;
          send.hidden = true;
          showRevoke(answer.id);
        } else {
          state.textContent = answer.reason
            ? `Не отправилось: ${answer.reason}.`
            : "Не отправилось, попробуйте позже.";
          send.disabled = false;
        }
      } catch {
        state.textContent = "Не отправилось: нет связи с сервером.";
        send.disabled = false;
      }
    };
  }

  /**
   * Отзыв. Секрет знает только отправивший — иначе по одному номеру можно было
   * бы удалять чужие файлы перебором.
   */
  function remember(id, secret) {
    try {
      localStorage.setItem(`mpga-report:${id}`, secret);
    } catch {
      /* хранилище недоступно — отозвать получится только письмом */
    }
  }

  function showRevoke(id) {
    const row = $("report-revoke");
    if (!row) return;
    let secret = null;
    try {
      secret = localStorage.getItem(`mpga-report:${id}`);
    } catch {
      secret = null;
    }
    if (!secret) return;
    row.hidden = false;
    row.onclick = async () => {
      row.disabled = true;
      try {
        const response = await fetch(`${config.url}/${id}`, {
          method: "DELETE",
          headers: { "X-Report-Secret": secret },
        });
        const answer = await response.json().catch(() => ({}));
        if (response.ok && answer.ok) {
          try {
            localStorage.removeItem(`mpga-report:${id}`);
          } catch {
            /* уже не важно */
          }
          $("report-state").textContent = "Файл удалён с сервера.";
          row.hidden = true;
        } else {
          $("report-state").textContent = answer.reason
            ? `Не удалось отозвать: ${answer.reason}.`
            : "Не удалось отозвать.";
          row.disabled = false;
        }
      } catch {
        $("report-state").textContent = "Не удалось отозвать: нет связи.";
        row.disabled = false;
      }
    };
  }

  window.MPGA_REPORT_UI = { offer, hide };
})();
