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
# 6. natal.test.js        — западная карта: дома, аспекты, достоинства, транзиты
# 7. validate_houses      — куспиды против Swiss Ephemeris  (нужен: pip install pyswisseph)
# 8. validate_ephemeris   — сверка эфемериды с pyephem      (нужен: pip install ephem)
# 9. browser_check.mjs    — страницы в настоящем Chromium    (нужен: playwright + порт 8099)
#10. engines_check.mjs   — те же страницы в WebKit и Firefox (нужны: playwright install webkit firefox)
#11. touch_check.mjs     — цели под палец и шрифт полей на телефоне
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
run "Западная натальная карта"        node test/natal.test.js

if python3 -c "import swisseph" 2>/dev/null; then
  echo
  echo "=============================================================="
  echo "  Куспиды домов против Swiss Ephemeris"
  echo "=============================================================="
  if node test/dump_houses.mjs | python3 test/validate_houses.py; then
    echo "  → ок"
  else
    echo "  → ПРОВАЛ"; fail=1
  fi
else
  echo
  echo "· сверка домов пропущена: нет pyswisseph (pip install pyswisseph)"
fi

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
  run "Цели под палец на телефоне" node test/touch_check.mjs
  # WebKit — движок Safari и всех браузеров на айфоне; ставится отдельно
  if [ -d "$(ls -d "${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"/webkit-* 2>/dev/null | head -1)" ]; then
    run "Страницы в WebKit и Firefox" node test/engines_check.mjs
  else
    echo
    echo "· прогон по WebKit и Firefox пропущен: движки не установлены"
    echo "  (npx playwright install webkit firefox)"
  fi
  kill "$srv" 2>/dev/null
else
  echo
  echo "· проверка страниц пропущена: нет playwright"
fi

echo
[ "$fail" = 0 ] && echo "ИТОГ: все проверки пройдены" || echo "ИТОГ: есть провалы"
exit "$fail"
