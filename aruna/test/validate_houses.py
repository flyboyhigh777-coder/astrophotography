#!/usr/bin/env python3
"""Сравнивает куспиды домов «Аруны» со Swiss Ephemeris — эталоном отрасли.

Запуск:  node test/dump_houses.mjs | python3 test/validate_houses.py

Swiss Ephemeris стоит отдельно (pip install pyswisseph) и в обязательные
зависимости проекта не входит: это инструмент проверки, а не работы.
Порог — в THRESHOLD; куспид — величина, которую астролог читает с точностью
до минуты, поэтому порог строгий.
"""
import json
import sys

try:
    import swisseph as swe
except ImportError:
    print("pyswisseph не установлен — проверка пропущена (pip install pyswisseph)")
    sys.exit(0)

THRESHOLD = 1.0 / 60          # одна угловая минута
CODES = {
    "placidus": b'P', "koch": b'K', "regiomontanus": b'R',
    "campanus": b'C', "porphyry": b'O', "equal": b'E', "whole": b'W',
}


def wrap(x):
    return (x + 180.0) % 360.0 - 180.0


def main():
    rows = json.load(sys.stdin)
    stats = {k: {"max": 0.0, "n": 0, "where": None, "skipped": 0} for k in CODES}
    for r in rows:
        for name, code in CODES.items():
            ours = r["systems"][name]
            if ours["failed"]:
                stats[name]["skipped"] += 1
                continue
            cusps, _ = swe.houses(r["jd"], r["lat"], r["lon"], code)
            for i in range(12):
                d = abs(wrap(ours["cusps"][i] - cusps[i]))
                stats[name]["n"] += 1
                if d > stats[name]["max"]:
                    stats[name]["max"] = d
                    stats[name]["where"] = (r["place"], round(r["jd"], 3), i + 1)

    print("система        сравнений   макс, ′   вердикт")
    bad = 0
    for name in CODES:
        s = stats[name]
        arcmin = s["max"] * 60
        ok = s["max"] <= THRESHOLD
        if not ok:
            bad += 1
        note = "ok" if ok else "РАСХОЖДЕНИЕ"
        where = ""
        if s["where"] and not ok:
            where = "  (%s, JD %.3f, дом %d)" % s["where"]
        skip = ("  пропущено %d" % s["skipped"]) if s["skipped"] else ""
        print("%-14s %8d %9.3f   %s%s%s" % (name, s["n"], arcmin, note, where, skip))
    print()
    print("ИТОГ: все системы совпали со Swiss Ephemeris" if not bad
          else "ИТОГ: расходятся систем — %d" % bad)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
