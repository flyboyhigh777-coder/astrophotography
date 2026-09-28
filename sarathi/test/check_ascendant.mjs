/* Независимая проверка замкнутой формулы лагны: точка эклиптики, которая
   в этот момент находится на восточном горизонте (высота 0 и поднимается).
   Ищем перебором по эклиптической долготе — совсем другой путь, чем
   формула в astro.js. Расхождение должно быть в пределах шага поиска. */
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
const dir = path.dirname(new URL(import.meta.url).pathname);
vm.runInThisContext(fs.readFileSync(path.join(dir, '../assets/js/core/astro.js'), 'utf8'));
const A = globalThis.SarathiAstro, DEG = Math.PI / 180;

function altOfEcliptic(lon, jd, lat, lonEast) {
  const T = (jd - 2451545.0) / 36525;
  const eps = A.meanObliquity(T) + A.nutation(T).deps;
  const ra = Math.atan2(Math.sin(lon * DEG) * Math.cos(eps * DEG), Math.cos(lon * DEG)) / DEG;
  const dec = Math.asin(Math.sin(eps * DEG) * Math.sin(lon * DEG)) / DEG;
  const H = A.localSiderealTime(jd, lonEast) - ra;
  return Math.asin(Math.sin(lat * DEG) * Math.sin(dec * DEG) +
                   Math.cos(lat * DEG) * Math.cos(dec * DEG) * Math.cos(H * DEG)) / DEG;
}

const cases = [
  ['Москва',        A.julianDay(1975, 6, 15, 3.0),  55.7558,  37.6176],
  ['Москва',        A.julianDay(2026, 9, 28, 18.0), 55.7558,  37.6176],
  ['Лондон',        A.julianDay(2000, 1, 1, 0.0),   51.5074,  -0.1278],
  ['Мумбаи',        A.julianDay(1984, 11, 3, 7.25), 19.0760,  72.8777],
  ['Кито (экватор)',A.julianDay(2010, 4, 4, 11.0),  -0.1807, -78.4678],
  ['Сидней (юг)',   A.julianDay(1993, 12, 25, 14.5),-33.8688, 151.2093],
  ['Мурманск (69°)',A.julianDay(2001, 7, 7, 1.0),   68.9585,  33.0827]
];

let worst = 0;
for (const [name, jd, lat, lonE] of cases) {
  const formula = A.ascendantMc(jd, lat, lonE).asc;
  // перебор: ищем восходящую точку (alt пересекает 0 снизу вверх по времени,
  // что при движении неба соответствует убыванию alt по долготе на востоке)
  let best = null, bestErr = 1e9;
  for (let lon = 0; lon < 360; lon += 0.001) {
    const a = altOfEcliptic(lon, jd, lat, lonE);
    if (Math.abs(a) < bestErr) {
      // на горизонте две точки: восходящая и заходящая. Восходящая — та,
      // чья высота через минуту станет положительной.
      const later = altOfEcliptic(lon, jd + 1 / 1440, lat, lonE);
      if (later > a) { bestErr = Math.abs(a); best = lon; }
    }
  }
  const err = Math.abs(A.diff180(formula, best)) * 3600;
  worst = Math.max(worst, err);
  console.log(`${name.padEnd(16)} формула ${formula.toFixed(4).padStart(9)}°  перебор ${best.toFixed(4).padStart(9)}°  Δ ${err.toFixed(1).padStart(6)}″`);
}
console.log(`\nмаксимальное расхождение: ${worst.toFixed(1)}″ — ${worst < 10 ? 'формула верна' : 'РАСХОЖДЕНИЕ'}`);
process.exit(worst < 10 ? 0 : 1);
