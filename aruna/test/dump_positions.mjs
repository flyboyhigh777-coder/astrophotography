/* Считает тропические долготы грах на наборе дат и печатает JSON —
   вход для test/validate_ephemeris.py (сравнение с pyephem). */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
const dir = path.dirname(new URL(import.meta.url).pathname);
vm.runInThisContext(fs.readFileSync(path.join(dir, '../assets/js/core/astro.js'), 'utf8'));
const A = globalThis.ArunaAstro;

const rows = [];
// сетка: каждые ~37 дней с 1930 по 2050 (не кратно периодам планет)
for (let jd = A.julianDay(1930, 1, 1, 0); jd < A.julianDay(2050, 1, 1, 0); jd += 37.3) {
  const p = A.tropicalPositions(jd);
  const rec = { jd };
  for (const k of ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'rahu',
                   'uranus', 'neptune', 'pluto']) {
    rec[k] = p[k].lon;
  }
  rows.push(rec);
}
process.stdout.write(JSON.stringify(rows));
