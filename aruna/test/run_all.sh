#!/usr/bin/env bash
# Аруна · все проверки разом.
#
#   ./test/run_all.sh
#
# 1. unit.mjs             — инварианты расчётного слоя (только node)
# 2. check_ascendant.mjs  — формула лагны против перебора по горизонту (только node)
# 3. bot.test.js          — весь диалог телеграм-бота без настоящего телеграма
# 4. api.test.js          — сервер, вход через бота, оплата и выдача разборов
# 5. dipa.test.js         — разговор: правила, блок фактов, инструменты, /api/talk
# 6. validate_ephemeris   — сверка эфемериды с pyephem      (нужен: pip install ephem)
# 7. browser_check.mjs    — страницы в настоящем Chromium    (нужен: playwright + порт 8099)
#
# Пункты 3 и 4 пропускаются, если их зависимостей нет: базовые проверки
# должны проходить на голом node.

set -u
cd "$(dirname "$0")/.."
fail=0
run() {
  echo
  echo "=============================================================="
  echo "  $1"
  echo "=============================================================="
  shift
  if "$@"; then echo "  → ок"; else echo "  → ПРОВАЛ"; fail=1; fi
}

run "Модульные тесты расчётного слоя" node test/unit.mjs
run "Лагна: формула против перебора"  node test/check_ascendant.mjs
run "Телеграм-бот: весь диалог"       node test/bot.test.js
run "Сервер: вход, оплата, разборы"   node test/api.test.js
run "Дипа: разговор и оплата за раз"  node test/dipa.test.js

if python3 -c "import ephem" 2>/dev/null; then
  echo
  echo "=============================================================="
  echo "  Эфемерида против pyephem (1930-2050)"
  echo "=============================================================="
  if node test/dump_positions.mjs | python3 test/validate_ephemeris.py; then
    echo "  → ок"
  else
    echo "  → ПРОВАЛ"; fail=1
  fi
else
  echo
  echo "· сверка с pyephem пропущена: нет модуля ephem (pip install ephem)"
fi

if command -v npx >/dev/null 2>&1 && [ -d "$(npm root -g)/playwright" ]; then
  npx --yes http-server -p 8099 -s -c-1 . >/tmp/aruna-http.log 2>&1 &
  srv=$!
  sleep 2
  run "Страницы в Chromium" node test/browser_check.mjs
  kill "$srv" 2>/dev/null
else
  echo
  echo "· проверка страниц пропущена: нет playwright"
fi

echo
[ "$fail" = 0 ] && echo "ИТОГ: все проверки пройдены" || echo "ИТОГ: есть провалы"
exit "$fail"
