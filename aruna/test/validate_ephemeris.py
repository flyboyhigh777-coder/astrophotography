#!/usr/bin/env python3
"""Сравнивает эфемериду «Аруны» (JS) с pyephem (libastro/VSOP87+ELP2000).

Запуск:  node test/dump_positions.mjs | python3 test/validate_ephemeris.py
Печатает максимальную и средеквадратичную ошибку по каждой грахе в угловых
секундах. Порог приёмки — в THRESHOLDS (секунды дуги).
"""
import json
import math
import sys

import ephem

# Пороги — чуть выше фактически измеренных максимумов (1930-2050), чтобы тест
# ловил регрессию в коде, а не фиксировал «примерно работает».
# Измерено: Солнце 35″, Луна 14″, Меркурий 94″, Венера 177″,
#           Марс 205″, Юпитер 113″, Сатурн 173″.
THRESHOLDS = {            # угловые секунды
    "sun": 45, "moon": 20, "mercury": 120, "venus": 210,
    "mars": 240, "jupiter": 140, "saturn": 210,
}
BODIES = {
    "sun": ephem.Sun, "moon": ephem.Moon, "mercury": ephem.Mercury,
    "venus": ephem.Venus, "mars": ephem.Mars, "jupiter": ephem.Jupiter,
    "saturn": ephem.Saturn,
}


def ecl_lon(body_cls, d):
    b = body_cls(d)
    eq = ephem.Equatorial(b.g_ra, b.g_dec, epoch=d)
    return math.degrees(ephem.Ecliptic(eq).lon)


def wrap(x):
    x = (x + 180.0) % 360.0 - 180.0
    return x


def main():
    rows = json.load(sys.stdin)
    stats = {k: [] for k in THRESHOLDS}
    for r in rows:
        d = ephem.Date(r["jd"] - 2415020.0)          # ephem считает дни от 1899-12-31 12:00
        for name in BODIES:
            err = wrap(r[name] - ecl_lon(BODIES[name], d)) * 3600.0
            stats[name].append((abs(err), r["jd"]))
    # Раху/Кету — средний восходящий узел Луны, аналитическая формула,
    # сверять с pyephem нечем (там его просто нет).

    print(f"точек: {len(rows)}  диапазон JD {rows[0]['jd']:.1f}..{rows[-1]['jd']:.1f}")
    print(f"{'граха':<9}{'макс, ″':>12}{'СКО, ″':>10}{'порог':>8}   вердикт")
    ok = True
    for name, vals in stats.items():
        mx, mx_jd = max(vals)
        rms = math.sqrt(sum(v * v for v, _ in vals) / len(vals))
        good = mx <= THRESHOLDS[name]
        ok = ok and good
        print(f"{name:<9}{mx:>12.1f}{rms:>10.1f}{THRESHOLDS[name]:>8}   "
              f"{'ok' if good else 'ПРЕВЫШЕН'} (макс при JD {mx_jd:.1f})")
    print("\nИТОГ:", "все грахи в пределах порога" if ok else "есть превышения")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
