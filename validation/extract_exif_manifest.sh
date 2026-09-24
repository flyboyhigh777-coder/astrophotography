#!/usr/bin/env bash
# Готовит папку с НАСТОЯЩИМИ фотографиями для RealPhotoValidation.kt:
#  1. Конвертирует HEIC/HEIF в PNG через ImageMagick (javax.imageio без
#     дополнительных плагинов не читает HEIC/HEIF - см. docs/TESTING_PLAN.md).
#     JPEG/PNG просто копирует как есть.
#  2. Строит EXIF-манифест (имя_файла=секунды_эпохи, по одной строке на файл)
#     через exiftool, включая доли секунды (SubSecTimeOriginal), если камера
#     их записывает.
#
# Требует: exiftool (apt install libimage-exiftool-perl), ImageMagick
# (`convert`, обычно уже есть), python3. Все три уже установлены в этой
# песочнице на момент написания.
#
# Использование:
#   ./validation/extract_exif_manifest.sh <папка_с_оригиналами> <папка_для_результата>
#
# После этого:
#   kotlinc -cp build/core-main.jar validation/RealPhotoValidation.kt \
#           -include-runtime -d validation/harness.jar
#   java -Xmx6g -cp validation/harness.jar:build/core-main.jar RealPhotoValidationKt \
#        <папка_для_результата> - <папка_для_результата>/exif_manifest.txt \
#        <путь_к_результату.png>
#
# (Второй аргумент "-" - тёмные кадры; если они есть, положите их в отдельную
# папку и передайте её вместо "-" - см. docs/TESTING_PLAN.md.)

set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Использование: $0 <папка_с_оригиналами> <папка_для_результата>" >&2
  exit 1
fi

SRC_DIR="$1"
OUT_DIR="$2"
MANIFEST="$OUT_DIR/exif_manifest.txt"

mkdir -p "$OUT_DIR"
: > "$MANIFEST"

shopt -s nullglob nocaseglob
for src in "$SRC_DIR"/*.{jpg,jpeg,png,heic,heif}; do
  base="$(basename "$src")"
  ext="${base##*.}"
  ext_lower="$(echo "$ext" | tr '[:upper:]' '[:lower:]')"

  if [ "$ext_lower" = "heic" ] || [ "$ext_lower" = "heif" ]; then
    dest_name="${base%.*}.png"
    dest="$OUT_DIR/$dest_name"
    echo "Конвертация $base -> $dest_name (ImageMagick)..."
    convert "$src" "$dest"
  else
    dest_name="$base"
    dest="$OUT_DIR/$dest_name"
    cp "$src" "$dest"
  fi

  # DateTimeOriginal читаем из ОРИГИНАЛА (до конвертации - ImageMagick при
  # конвертации в PNG обычно не переносит EXIF). Часовой пояс сознательно
  # фиксирован на UTC при переводе в epoch-секунды - см. тот же приём и то же
  # обоснование в ImageDecoding.kt (важна только РАЗНИЦА между кадрами одной
  # серии, а не абсолютное время).
  datetime="$(exiftool -s -s -s -DateTimeOriginal "$src" 2>/dev/null || true)"
  subsec="$(exiftool -s -s -s -SubSecTimeOriginal "$src" 2>/dev/null || true)"

  if [ -n "$datetime" ]; then
    epoch="$(python3 -c "
import sys, datetime as dt
s = sys.argv[1].strip()
sub = sys.argv[2].strip()
try:
    d = dt.datetime.strptime(s, '%Y:%m:%d %H:%M:%S')
    epoch = d.replace(tzinfo=dt.timezone.utc).timestamp()
    if sub:
        epoch += float('0.' + sub)
    print(f'{epoch:.3f}')
except Exception:
    pass
" "$datetime" "$subsec")"
    if [ -n "$epoch" ]; then
      echo "${dest_name}=${epoch}" >> "$MANIFEST"
    fi
  fi
done

echo "Готово: $(wc -l < "$MANIFEST") строк EXIF-времени записано в $MANIFEST"
echo "Кадры для проверки лежат в: $OUT_DIR"
