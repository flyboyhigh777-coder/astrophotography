#!/usr/bin/env bash
#
# Аруна · переименование
# ---------------------------------------------------------------------
# Названия в проекте живут в трёх независимых слоях, и менять их можно
# по отдельности:
#
#   platform — имя платформы, видное посетителю (логотип, <title>, подвал)
#   mentor   — имя наставника в диалоге
#   ns       — префикс пространства имён в JS (ArunaAstro, ArunaChart, …)
#              и ключи localStorage (aruna.birth.v1)
#
# Примеры:
#   ./tools/rename.sh platform Аруна Ратха
#   ./tools/rename.sh mentor Дипа Сарати
#   ./tools/rename.sh ns Aruna Ratha
#
# После любого прогона обязательно: ./test/run_all.sh

set -eu
cd "$(dirname "$0")/.."

usage() {
  echo "Использование: $0 {platform|mentor|ns} <старое> <новое>" >&2
  exit 1
}
[ $# -eq 3 ] || usage

layer="$1"; old="$2"; new="$3"

# Файлы проекта, кроме служебных каталогов
files() {
  find . -type f \
    \( -name '*.html' -o -name '*.css' -o -name '*.js' -o -name '*.mjs' \
       -o -name '*.md' -o -name '*.py' -o -name '*.sh' \) \
    -not -path './.git/*' -not -path './node_modules/*'
}

count=$(files | xargs grep -l -- "$old" 2>/dev/null | wc -l || true)

case "$layer" in
  platform|mentor)
    # Кириллические имена меняются как есть: они встречаются только в текстах
    files | xargs sed -i "s/${old}/${new}/g"
    ;;
  ns)
    # Пространство имён: и сам префикс, и ключи хранилища в нижнем регистре
    lower_old=$(printf '%s' "$old" | tr '[:upper:]' '[:lower:]')
    lower_new=$(printf '%s' "$new" | tr '[:upper:]' '[:lower:]')
    upper_old=$(printf '%s' "$old" | tr '[:lower:]' '[:upper:]')
    upper_new=$(printf '%s' "$new" | tr '[:lower:]' '[:upper:]')
    files | xargs sed -i \
      -e "s/${old}/${new}/g" \
      -e "s/'${lower_old}\./'${lower_new}./g" \
      -e "s/${upper_old}_/${upper_new}_/g"
    echo "Внимание: ключи localStorage сменились — сохранённые у посетителей"
    echo "карты и балансы после такой правки не найдутся. Для живого сайта"
    echo "сначала напишите миграцию старых ключей в новые."
    ;;
  *) usage ;;
esac

echo "Слой «${layer}»: ${old} → ${new}, затронуто файлов: ${count}"
echo "Теперь прогоните проверки: ./test/run_all.sh"
