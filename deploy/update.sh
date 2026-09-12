#!/usr/bin/env bash
# Забирает новые коммиты и пересобирает сервис. Запускается таймером systemd.
# Настройки — в /etc/default/mpga-update, выключение — systemctl disable --now mpga-update.timer
set -euo pipefail

CONFIG=/etc/default/mpga-update
[ -f "$CONFIG" ] && . "$CONFIG"

REPO_DIR="${REPO_DIR:-/root/mpga}"
STACK_DIR="${STACK_DIR:-/root}"
BRANCH="${BRANCH:-develop}"
SERVICE="${SERVICE:-mpga}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:7200/health}"
EXPECTED_REMOTE="${EXPECTED_REMOTE:-https://github.com/Aver005/make-pptx-great-again.git}"
REQUIRE_SIGNED="${REQUIRE_SIGNED:-0}"
HEALTH_TRIES="${HEALTH_TRIES:-20}"

cd "$REPO_DIR"

remote_url=$(git remote get-url origin)
if [ "$remote_url" != "$EXPECTED_REMOTE" ]; then
  echo "остановлено: origin указывает на $remote_url вместо $EXPECTED_REMOTE"
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "остановлено: в рабочем каталоге есть несохранённые правки, обновление могло бы их стереть"
  exit 1
fi

git fetch --prune --quiet origin "$BRANCH"

current=$(git rev-parse HEAD)
target=$(git rev-parse "origin/$BRANCH")
if [ "$current" = "$target" ]; then
  exit 0
fi

if ! git merge-base --is-ancestor "$current" "$target"; then
  echo "остановлено: $BRANCH переписан (текущий коммит не предок нового) — нужна ручная проверка"
  exit 1
fi

if [ "$REQUIRE_SIGNED" = "1" ] && ! git verify-commit "$target" >/dev/null 2>&1; then
  echo "остановлено: коммит $target без доверенной подписи"
  exit 1
fi

echo "обновление $(git rev-parse --short HEAD) → $(git rev-parse --short "$target")"
git log --format='  %h %s' "$current..$target" | head -20

git switch --quiet "$BRANCH"
git merge --ff-only --quiet "origin/$BRANCH"

rebuild() {
  docker compose --project-directory "$STACK_DIR" up -d --build "$SERVICE"
}

healthy() {
  for _ in $(seq 1 "$HEALTH_TRIES"); do
    if curl -fsS --max-time 3 "$HEALTH_URL" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

if ! rebuild; then
  echo "сборка не удалась, откатываюсь на $(git rev-parse --short "$current")"
  git reset --hard --quiet "$current"
  echo "старый контейнер продолжает работать: docker compose подменяет его только после успешной сборки"
  exit 1
fi

if healthy; then
  echo "готово: $(git rev-parse --short HEAD) работает, проверка $HEALTH_URL отвечает"
  exit 0
fi

echo "новая версия не отвечает на $HEALTH_URL, откатываюсь на $(git rev-parse --short "$current")"
git reset --hard --quiet "$current"
if rebuild && healthy; then
  echo "откат выполнен, сервис снова отвечает"
else
  echo "ОТКАТ НЕ ПОМОГ — сервис лежит, нужна ручная проверка: docker compose logs $SERVICE"
fi
exit 1
