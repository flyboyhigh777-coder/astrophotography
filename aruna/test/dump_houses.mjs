/* Считает куспиды домов на наборе дат и широт — вход для
   test/validate_houses.py (сравнение со Swiss Ephemeris). */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
const dir = path.dirname(new URL(import.meta.url).pathname);
for (const f of ['../assets/js/core/astro.js', '../assets/js/natal/houses.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(dir, f), 'utf8'));
}
const A = globalThis.ArunaAstro, H = globalThis.ArunaHouses;

const PLACES = [
  { name: 'экватор',    lat: 0,      lon: 30 },
  { name: 'Москва',     lat: 55.7558, lon: 37.6176 },
  { name: 'Лондон',     lat: 51.5074, lon: -0.1278 },
  { name: 'Нью-Йорк',   lat: 40.7128, lon: -74.0060 },
  { name: 'Сидней',     lat: -33.8688, lon: 151.2093 },
  { name: 'Буэнос-Айрес', lat: -34.6037, lon: -58.3816 },
  { name: 'Мурманск',   lat: 68.9585, lon: 33.0827 },
  { name: 'Сингапур',   lat: 1.3521,  lon: 103.8198 }
];
const SYSTEMS = ['placidus', 'koch', 'regiomontanus', 'campanus', 'porphyry', 'equal', 'whole'];

const rows = [];
for (const p of PLACES) {
  // несколько моментов внутри суток и года — чтобы поймать все квадранты
  for (let jd = A.julianDay(1985, 1, 3, 0); jd < A.julianDay(1985, 12, 20, 0); jd += 53.7) {
    for (const hour of [2.4, 9.1, 15.8, 21.3]) {
      const t = Math.floor(jd) + hour / 24;
      const am = A.ascendantMc(t, p.lat, p.lon);
      const rec = { jd: t, lat: p.lat, lon: p.lon, place: p.name,
                    asc: am.asc, mc: am.mc, systems: {} };
      for (const s of SYSTEMS) {
        const r = H.houses({ ramc: am.lst, lat: p.lat, eps: am.obliquity,
                             asc: am.asc, mc: am.mc, system: s });
        rec.systems[s] = { cusps: r.cusps.slice(1, 13), failed: r.failed };
      }
      rows.push(rec);
    }
  }
}
process.stdout.write(JSON.stringify(rows));
