#!/usr/bin/env bash
# Ставит автообновление: юнит, таймер и файл настроек. Запускать от root.
# Повторный запуск ничего не ломает и настройки не перезаписывает.
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)

# Скрипт ставится КОПИЕЙ за пределы репозитория намеренно. Он обновляет тот же
# каталог, в котором лежит сам: откат на коммит, где его ещё не было, оставил
# бы systemd без исполняемого файла и сломал бы механизм обновления целиком.
install -m 0755 "$HERE/update.sh" /usr/local/sbin/mpga-update

install -m 0644 "$HERE/mpga-update.service" /etc/systemd/system/mpga-update.service
install -m 0644 "$HERE/mpga-update.timer" /etc/systemd/system/mpga-update.timer

if [ ! -f /etc/default/mpga-update ]; then
  install -m 0644 "$HERE/mpga-update.env" /etc/default/mpga-update
  echo "настройки: /etc/default/mpga-update"
else
  echo "настройки уже есть, не трогаю: /etc/default/mpga-update"
fi

systemctl daemon-reload
systemctl enable --now mpga-update.timer

cat <<'INFO'

автообновление включено.

  выключить          systemctl disable --now mpga-update.timer
  включить обратно   systemctl enable --now mpga-update.timer
  обновить сейчас    systemctl start mpga-update.service
  что происходит     journalctl -u mpga-update.service -f
  когда следующий    systemctl list-timers mpga-update.timer
  сменить ветку      /etc/default/mpga-update, затем systemctl restart mpga-update.timer

после правки deploy/update.sh повторите установку: sudo deploy/install.sh
INFO
