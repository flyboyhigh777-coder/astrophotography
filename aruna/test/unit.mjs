/*
 * Аруна · модульные тесты расчётного слоя
 * ------------------------------------------------------------------
 * Проверяют инварианты, которые обязаны выполняться всегда, и несколько
 * значений, сверенных с внешними источниками. Астрономическая точность
 * проверяется отдельно: test/validate_ephemeris.py (сверка с pyephem) и
 * test/check_ascendant.mjs (перебор по горизонту).
 *
 * Запуск: node test/unit.mjs
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const dir = path.dirname(new URL(import.meta.url).pathname);
// access.js работает с localStorage — в node его нет, подставляем заглушку
globalThis.localStorage = (() => {
  const mem = new Map();
  return {
    getItem: k => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: k => mem.delete(k)
  };
})();

for (const f of [
  '../assets/js/core/astro.js',
  '../assets/js/core/tz.js',
  '../assets/js/core/access.js',
  '../assets/js/data/jyotish-data.js',
  '../assets/js/data/cities.js',
  '../assets/js/data/verses.js',
  '../assets/js/jyotish/chart.js',
  '../assets/js/jyotish/panchanga.js',
  '../assets/js/jyotish/dasha.js',
  '../assets/js/jyotish/ashtakoota.js',
  '../assets/js/jyotish/yogas.js',
  '../assets/js/jyotish/strength.js',
  '../assets/js/jyotish/forecast.js',
  '../assets/js/jyotish/muhurta.js'
]) {
  vm.runInThisContext(fs.readFileSync(path.join(dir, f), 'utf8'));
}

const A = globalThis.ArunaAstro, C = globalThis.ArunaChart, Tz = globalThis.ArunaTz,
      D = globalThis.ArunaData, P = globalThis.ArunaPanchanga, V = globalThis.ArunaDasha,
      K = globalThis.ArunaAshtakoota, Cities = globalThis.ArunaCities,
      Verses = globalThis.ArunaVerses, Acc = globalThis.ArunaAccess,
      Y = globalThis.ArunaYogas, St = globalThis.ArunaStrength,
      Fc = globalThis.ArunaForecast, Mu = globalThis.ArunaMuhurta;

let passed = 0, failed = 0;
const group = name => console.log('\n— ' + name);
function ok(name, cond, extra) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}
function near(name, got, want, tol, unit) {
  const d = Math.abs(got - want);
  ok(name + ` (${got.toFixed(4)} ≈ ${want}${unit || ''}, Δ${d.toFixed(4)})`, d <= tol,
     `отклонение ${d} больше допуска ${tol}`);
}

const chartAt = (y, mo, d, h, mi, lat, lon, tz) => C.buildChart({
  jd: Tz.msToJd(Tz.zonedToUtcMs(y, mo, d, h, mi, tz)), lat, lon, tz, label: ''
});

/* ------------------------------------------------------------------ время */
group('Время и календарь');
ok('JD 2000-01-01 12:00 UT = 2451545', A.julianDay(2000, 1, 1, 12) === 2451545);
ok('JD 1957-10-04 19:26:24 ≈ 2436116.31 (запуск Спутника, пример из Meeus)',
   Math.abs(A.julianDay(1957, 10, 4, 19.44) - 2436116.31) < 0.01);
ok('1582-10-04 (юлианский) и 1582-10-15 (григорианский) — соседние дни',
   A.julianDay(1582, 10, 4, 0) + 1 === A.julianDay(1582, 10, 15, 0),
   `${A.julianDay(1582, 10, 4, 0)} и ${A.julianDay(1582, 10, 15, 0)}`);
ok('1582-10-04 = JD 2299159,5 (по Meeus)', A.julianDay(1582, 10, 4, 0) === 2299159.5,
   String(A.julianDay(1582, 10, 4, 0)));
{
  let roundTrips = true;
  for (let jd = 2415020.5; jd < 2488070; jd += 997.3) {
    const c = A.fromJulianDay(jd);
    if (Math.abs(A.julianDay(c.y, c.m, c.d, c.hours) - jd) > 1e-6) roundTrips = false;
  }
  ok('JD → дата → JD сходится на всём диапазоне 1900-2100', roundTrips);
}
ok('ΔT(2000) ≈ 63,9 с', Math.abs(A.deltaT(2000) - 63.86) < 0.1);

group('Часовые зоны (исторические смещения)');
const tzCase = (y, mo, d, h, tz, expect) => {
  const ms = Tz.zonedToUtcMs(y, mo, d, h, 0, tz);
  const got = Tz.offsetMinutes(ms, tz);
  ok(`${tz} ${d}.${mo}.${y} → ${Tz.offsetLabel(got)}`, got === expect, `ожидалось ${expect} мин`);
};
tzCase(1975, 6, 15, 6, 'Europe/Moscow', 180);   // декретное, летнего ещё нет
tzCase(1985, 6, 15, 6, 'Europe/Moscow', 240);   // летнее время введено в 1981
tzCase(2012, 1, 15, 6, 'Europe/Moscow', 240);   // круглогодичное «летнее»
tzCase(2026, 1, 15, 6, 'Europe/Moscow', 180);   // после отмены
tzCase(1980, 3, 10, 9, 'Asia/Kolkata', 330);    // +5:30
tzCase(2020, 3, 20, 7, 'Pacific/Auckland', 780); // NZDT +13

/* ---------------------------------------------------------------- аянамша */
group('Аянамша Лахири');
near('на J2000 равна 23°51′11″', C.ayanamsa(A.julianDay(2000, 1, 1, 0)), 23.853056, 0.0005, '°');
{
  const a1 = C.ayanamsa(A.julianDay(2000, 1, 1, 0));
  const a2 = C.ayanamsa(A.julianDay(2050, 1, 1, 0));
  near('прирост 50,3″ в год', (a2 - a1) / 50 * 3600, 50.3, 0.5, '″');
}

/* ------------------------------------------------------------------ карта */
group('Построение карты');
const ch = chartAt(1975, 6, 15, 6, 0, 55.7558, 37.6176, 'Europe/Moscow');
ok('9 грах на месте', A.GRAHA_ORDER.every(k => ch.grahas[k] && isFinite(ch.grahas[k].lon)));
ok('каждая граха ровно в одной бхаве', (() => {
  const n = {}; ch.bhavas.forEach(b => b.grahas.forEach(g => n[g] = (n[g] || 0) + 1));
  return Object.keys(n).length === 9 && Object.values(n).every(v => v === 1);
})());
near('Кету ровно напротив Раху', Math.abs(A.diff180(ch.grahas.ketu.lon, ch.grahas.rahu.lon)), 180, 1e-6, '°');
ok('первая бхава — раши лагны', ch.bhavas[0].rashi === ch.asc.rashi);
ok('бхавы идут подряд по раши',
   ch.bhavas.every((b, i) => b.rashi === (ch.asc.rashi + i) % 12));
ok('пада в пределах 1-4', A.GRAHA_ORDER.every(k => ch.grahas[k].pada >= 1 && ch.grahas[k].pada <= 4));
ok('накшатра согласована с долготой', A.GRAHA_ORDER.every(k => {
  const g = ch.grahas[k];
  return g.nakshatra === Math.floor(g.lon / (360 / 27));
}));
ok('Раху и Кету всегда вспять', ch.grahas.rahu.retro && ch.grahas.ketu.retro);
ok('Солнце и Луна никогда не вспять', !ch.grahas.sun.retro && !ch.grahas.moon.retro);

group('Достоинства грах');
ok('Сурья в Меше 10° — экзальтация', C.dignity('sun', 0, 10).code === 'exalted');
ok('Сурья в Туле 10° — дебилитация', C.dignity('sun', 6, 10).code === 'debilitated');
ok('Шани в Тула 20° — экзальтация', C.dignity('saturn', 6, 20).code === 'exalted');
ok('Гуру в Дхану — свой знак', C.dignity('jupiter', 8, 20).code !== 'neutral');
ok('у Раху достоинство не считается', C.dignity('rahu', 3, 5) === null);

group('Лагна на разных широтах');
[['экватор', 0.0], ['юг', -33.87], ['север', 60.0], ['68° с.ш.', 68.0]].forEach(([name, lat]) => {
  const c = chartAt(2001, 7, 7, 13, 0, lat, 30, 'UTC');
  ok(`лагна считается: ${name}`, isFinite(c.asc.lon) && c.asc.lon >= 0 && c.asc.lon < 360);
});
{
  // за сутки лагна обходит весь круг: 12 раши должны встретиться все
  const seen = new Set();
  for (let h = 0; h < 24; h++) seen.add(chartAt(1990, 3, 21, h, 0, 55.75, 37.62, 'UTC').asc.rashi);
  ok('за сутки лагна проходит все 12 раши', seen.size === 12, `встретилось ${seen.size}`);
}

/* --------------------------------------------------------------- панчанга */
group('Панчанга');
const jdNow = Tz.msToJd(Tz.zonedToUtcMs(1975, 6, 15, 6, 0, 'Europe/Moscow'));
const pan = P.panchanga(jdNow, 55.7558, 37.6176, 'Europe/Moscow');
ok('титхи в диапазоне 0-29', pan.tithi.index >= 0 && pan.tithi.index <= 29);
ok('йога в диапазоне 0-26', pan.yoga.index >= 0 && pan.yoga.index <= 26);
ok('карана в диапазоне 1-60', pan.karana.index >= 1 && pan.karana.index <= 60);
ok('вара определена', !!pan.vara);
ok('границы титхи, накшатры и йоги различаются',
   new Set([pan.tithi.endJd, pan.nakshatra.endJd, pan.yoga.endJd].map(v => Math.round(v * 1440))).size === 3,
   'совпадение означало бы, что решатель не сошёлся');
ok('все границы впереди и не дальше 2 суток',
   [pan.tithi.endJd, pan.nakshatra.endJd, pan.yoga.endJd, pan.karana.endJd]
     .every(e => e > jdNow && e - jdNow < 2.2));
ok('восход раньше заката', pan.sunrise < pan.sunset);
ok('раху-кала внутри светового дня',
   pan.muhurtas.rahu.from >= pan.sunrise && pan.muhurtas.rahu.to <= pan.sunset + 1e-9);
ok('абхиджит около полудня', (() => {
  const mid = (pan.sunrise + pan.sunset) / 2;
  return Math.abs((pan.muhurtas.abhijit.from + pan.muhurtas.abhijit.to) / 2 - mid) < 0.02;
})());
ok('брахма-мухурта до восхода', pan.muhurtas.brahma.to < pan.sunrise);
{
  // полнолуние: элонгация Луны ≈ 180°, титхи должно быть Пурнима
  const full = P.tithi(A.julianDay(2024, 4, 23, 23.5));
  ok('на полнолуние 23.04.2024 титхи — Пурнима', full.name === 'Пурнима', full.name);
  const nw = P.tithi(A.julianDay(2024, 4, 8, 18.3));
  ok('на новолуние 08.04.2024 титхи — Амавасья', nw.name === 'Амавасья', nw.name);
}
{
  // титхи обязано меняться монотонно по кругу за лунный месяц
  let steps = 0, prev = P.tithi(A.julianDay(2026, 1, 1, 0)).index;
  for (let d = 0.5; d < 30; d += 0.5) {
    const cur = P.tithi(A.julianDay(2026, 1, 1 + d, 0)).index;
    if (cur !== prev) { steps++; prev = cur; }
  }
  ok('за 30 суток титхи сменилось ~30 раз', steps >= 28 && steps <= 31, `смен: ${steps}`);
}

/* ------------------------------------------------------------------ даша */
group('Вимшоттари-даша');
{
  const frac = ch.grahas.moon.nakFraction;
  const list = V.mahadashas(ch.jd, ch.moonNakshatra, frac);
  near('девять периодов = 120 лет', (list[8].to - list[0].from) / V.YEAR, 120, 1e-6, ' лет');
  ok('периоды идут без разрывов',
     list.slice(1).every((p, i) => Math.abs(p.from - list[i].to) < 1e-6));
  ok('первый период — хозяин накшатры Луны',
     list[0].lord === D.NAKSHATRAS[ch.moonNakshatra].lord);
  ok('рождение попадает в первый период', ch.jd >= list[0].from && ch.jd < list[0].to);
  const sub = V.subPeriods(list[0]);
  near('сумма антардаш равна махадаше',
       sub.reduce((s, p) => s + (p.to - p.from), 0), list[0].to - list[0].from, 1e-6, ' сут');
  ok('первая антардаша — тот же хозяин', sub[0].lord === list[0].lord);
  const cur = V.current(ch.jd, ch.moonNakshatra, frac, ch.jd + 1000);
  ok('вложенность маха ⊃ антар ⊃ пратьянтар',
     cur.antar.from >= cur.maha.from && cur.antar.to <= cur.maha.to + 1e-6 &&
     cur.pratyantar.from >= cur.antar.from && cur.pratyantar.to <= cur.antar.to + 1e-6);
}

/* ---------------------------------------------------------- совместимость */
group('Аштакута');
{
  const a = chartAt(1988, 4, 12, 14, 25, 55.7558, 37.6176, 'Europe/Moscow');
  const b = chartAt(1991, 9, 3, 8, 40, 59.9311, 30.3609, 'Europe/Moscow');
  const r = K.compare(a, b);
  ok('сумма максимумов = 36', r.kootas.reduce((s, k) => s + k.max, 0) === 36);
  ok('очки не выходят за максимум', r.kootas.every(k => k.points >= 0 && k.points <= k.max));
  ok('итог равен сумме кут',
     Math.abs(r.total - r.kootas.reduce((s, k) => s + k.points, 0)) < 1e-9);
  ok('у каждой куты есть пояснение', r.kootas.every(k => k.note && k.note.length > 20));

  // одинаковые карты: нади и бхакута ведут себя по классике
  const same = K.compare(a, a);
  ok('у одинаковых карт бхакута полная (1/1)',
     same.kootas.find(k => k.key === 'bhakoot').points === 7);
  ok('у одинаковых карт нади обнуляется (одна нади)',
     same.kootas.find(k => k.key === 'nadi').points === 0);

  let bad = 0, min = 99, max = 0;
  for (let i = 0; i < 300; i++) {
    const c1 = chartAt(1950 + (i % 60), 1 + (i % 12), 1 + (i % 28), i % 24, 0, 55, 37, 'Europe/Moscow');
    const c2 = chartAt(1955 + (i % 50), 1 + ((i * 7) % 12), 1 + ((i * 3) % 28), (i * 5) % 24, 0, 19, 72, 'Asia/Kolkata');
    const rr = K.compare(c1, c2);
    if (!(rr.total >= 0 && rr.total <= 36)) bad++;
    min = Math.min(min, rr.total); max = Math.max(max, rr.total);
  }
  ok(`300 пар без выхода за диапазон (${min}…${max})`, bad === 0);
}

/* ------------------------------------------------------------ данные и стихи */
group('Справочники');
ok('12 раши, 27 накшатр, 12 бхав',
   D.RASHIS.length === 12 && D.NAKSHATRAS.length === 27 && D.BHAVAS.length === 12);
ok('хозяева накшатр идут циклом Вимшоттари',
   D.NAKSHATRAS.every((n, i) => n.lord === D.DASHA_ORDER[i % 9]));
ok('сумма лет даши = 120',
   D.DASHA_ORDER.reduce((s, k) => s + D.DASHA_YEARS[k], 0) === 120);
ok('гана и нади делятся по 9', (() => {
  const c = f => Object.values(D.NAKSHATRAS.reduce((a, n) => (a[n[f]] = (a[n[f]] || 0) + 1, a), {}));
  return c('gana').every(v => v === 9) && c('nadi').every(v => v === 9);
})());
// Натуральная дружба в классике несимметрична, и это не опечатка:
// Чандра считает Будху другом, а Будха Чандру — недругом. Ровно это и
// проверяем, иначе «исправление» сломало бы граха-майтри.
ok('Чандра дружит с Будхой, Будха считает Чандру недругом',
   D.GRAHAS.moon.friends.indexOf('mercury') >= 0 &&
   D.GRAHAS.mercury.enemies.indexOf('moon') >= 0);
ok('друг не числится одновременно и врагом у той же грахи',
   Object.keys(D.GRAHAS).every(k =>
     (D.GRAHAS[k].friends || []).every(f => (D.GRAHAS[k].enemies || []).indexOf(f) < 0)));
ok('все зоны городов валидны для Intl', Cities.CITIES.every(c => {
  try { new Intl.DateTimeFormat('ru', { timeZone: c[3] }); return true; } catch (e) { return false; }
}));
ok('координаты городов в допустимых пределах',
   Cities.CITIES.every(c => Math.abs(c[1]) <= 90 && Math.abs(c[2]) <= 180));

group('Стихи');
ok('у каждого стиха есть источник, санскрит, перевод и темы',
   Verses.VERSES.every(v => v.src && v.sa && v.ru && v.themes.length));
ok('выбор детерминирован для одной даты', (() => {
  const sky = { varaLord: 'jupiter', nakshatraLord: 'moon', paksha: 'шукла',
                tithiName: 'Экадаши', dateKey: '2026-09-28' };
  return Verses.pickVerse(sky).verse.ref === Verses.pickVerse(sky).verse.ref;
})());
ok('за 60 дней подбирается не меньше 12 разных стихов', (() => {
  const seen = new Set();
  for (let d = 1; d <= 60; d++) {
    seen.add(Verses.pickVerse({
      varaLord: D.DASHA_ORDER[d % 9], nakshatraLord: D.DASHA_ORDER[(d * 3) % 9],
      paksha: d % 30 < 16 ? 'шукла' : 'кришна',
      tithiName: ['', 'Экадаши', 'Пурнима', 'Амавасья'][d % 4], dateKey: '2026-10-' + d
    }).verse.ref);
  }
  return seen.size >= 12;
})());

/* ------------------------------------------------------------------ йоги */
group('Йоги');
{
  const yogaChart = chartAt(1975, 6, 15, 6, 0, 55.7558, 37.6176, 'Europe/Moscow');
  const r = Y.findAll(yogaChart);
  ok('у каждой йоги есть правило, детали и смысл',
     r.list.every(y => y.rule && y.detail && y.meaning && y.id && y.title));
  ok('напряжённые йоги стоят в конце списка', (() => {
    const firstAdverse = r.list.findIndex(y => y.adverse);
    return firstAdverse === -1 || r.list.slice(firstAdverse).every(y => y.adverse);
  })());

  // йога-карака бывает ровно у шести лагн: Вришабха, Симха, Карка, Тула, Макара, Кумбха
  const withYK = new Set(), lagnas = new Set();
  for (let i = 0; i < 1200; i++) {
    const c = chartAt(1960 + (i % 50), 1 + (i % 12), 1 + ((i * 7) % 28), (i * 3) % 24, 0, 55, 37, 'UTC');
    lagnas.add(c.asc.rashi);
    if (Y.findAll(c).list.some(y => y.id.startsWith('yogakaraka'))) withYK.add(c.asc.rashi);
  }
  ok(`йога-карака ровно у 6 лагн из 12 (встретилось лагн: ${lagnas.size})`, withYK.size === 6,
     [...withYK].map(i => D.RASHIS[i].sa).join(', '));
  ok('это именно классические шесть лагн',
     [...withYK].sort((a, b) => a - b).join(',') === '1,3,4,6,9,10',
     [...withYK].sort((a, b) => a - b).map(i => D.RASHIS[i].sa).join(', '));

  // гаджакесари: Гуру в кендре от Луны — должно быть около трети карт
  let gk = 0, n = 0;
  for (let i = 0; i < 600; i++) {
    const c = chartAt(1950 + (i % 70), 1 + (i % 12), 1 + ((i * 5) % 28), (i * 7) % 24, 0, 50, 40, 'UTC');
    n++; if (Y.findAll(c).list.some(y => y.id === 'gajakesari')) gk++;
  }
  const gkPct = gk / n * 100;
  ok(`гаджакесари примерно у трети карт (${gkPct.toFixed(0)}%)`, gkPct > 25 && gkPct < 42);
}

/* ------------------------------------------------------------ сила грах */
group('Сила грах');
{
  const c = chartAt(1988, 4, 12, 14, 25, 55.76, 37.62, 'Europe/Moscow');
  const s2 = St.all(c);
  ok('индекс каждой грахи в диапазоне 0-100',
     s2.list.every(g => g.score >= 0 && g.score <= 100));
  ok('у каждой грахи пять составляющих с пояснениями',
     s2.list.every(g => g.parts.length === 5 && g.parts.every(p => p.note && p.title)));
  ok('сортировка по убыванию',
     s2.sorted.every((g, i) => i === 0 || s2.sorted[i - 1].score >= g.score));
  // дигбала: граха в своей лучшей бхаве должна получать по этой части единицу
  ok('дигбала максимальна в «своей» бхаве', (() => {
    for (const key of Object.keys(St.DIG_HOUSE)) {
      const best = St.DIG_HOUSE[key];
      const fake = JSON.parse(JSON.stringify(c));
      fake.grahas[key].bhava = best;
      const dig = St.grahaStrength(fake, key).parts.find(p => p.code === 'dig');
      if (Math.abs(dig.value - 1) > 1e-9) return false;
    }
    return true;
  })());
}

/* ---------------------------------------------------------------- мухурта */
group('Мухурта');
{
  ok('все 27 накшатр отнесены к классу',
     [...Array(27).keys()].every(i => Mu.NAK_CLASS[i]));
  ok('рикта-титхи — это 4, 9 и 14',
     [...Array(15).keys()].map(i => i + 1).filter(n => Mu.tithiClass(n) === 'rikta').join(',') === '4,9,14');
  ok('шесть задач, у каждой есть веса накшатр и вар',
     Mu.TASKS.length === 6 && Mu.TASKS.every(t => t.nak && t.vara && t.about));

  const c = chartAt(1975, 6, 15, 6, 0, 55.7558, 37.6176, 'Europe/Moscow');
  const day = Mu.scoreDay({
    jd: Tz.msToJd(Date.UTC(2026, 9, 15, 9, 0)),
    lat: 55.7558, lon: 37.6176, tz: 'Europe/Moscow', task: 'start', chart: c
  });
  ok('день разбит на окна внутри светового дня',
     day.windows.length > 0 &&
     day.windows[0].from >= day.panchanga.sunrise - 1e-9 &&
     day.windows[day.windows.length - 1].to <= day.panchanga.sunset + 1e-9);
  ok('окна идут подряд без разрывов',
     day.windows.every((w, i) => i === 0 || Math.abs(day.windows[i - 1].to - w.from) < 1e-6));
  ok('лучшее окно не хуже худшего', day.range.best >= day.range.worst);
  ok('с картой факторов больше, чем без неё', (() => {
    const без = Mu.scoreDay({ jd: Tz.msToJd(Date.UTC(2026, 9, 15, 9, 0)),
      lat: 55.7558, lon: 37.6176, tz: 'Europe/Moscow', task: 'start' });
    return без.windows[0].reasons.length < day.windows[0].reasons.length && !без.personal;
  })());
  ok('раху-кала всегда уводит оценку вниз', (() => {
    const m = day.panchanga.muhurtas;
    const inRahu = day.slots.filter(s => s.from >= m.rahu.from && s.to <= m.rahu.to);
    return inRahu.length > 0 && inRahu.every(s => s.reasons.some(r => r.t === 'раху-кала' && r.w < 0));
  })());
}

/* --------------------------------------------------------------- прогноз */
group('Год вперёд');
{
  const c = chartAt(1975, 6, 15, 6, 0, 55.7558, 37.6176, 'Europe/Moscow');
  const jd = Tz.msToJd(Date.UTC(2026, 8, 29));
  const f = Fc.yearAhead(c, jd, 12);
  ok('переходы упорядочены по времени и попадают в окно',
     f.ingresses.every((g, i) => (i === 0 || f.ingresses[i - 1].jd <= g.jd) &&
                                  g.jd >= f.from && g.jd <= f.to));
  ok('бхавы переходов в диапазоне 1-12',
     f.ingresses.every(g => g.fromLagna >= 1 && g.fromLagna <= 12 &&
                            g.fromMoon >= 1 && g.fromMoon <= 12));
  ok('если смен даш нет, показана ближайшая',
     f.dashaChanges.length > 0 || !!f.nextChange);
  const ss = f.sadeSati;
  ok('саде-сати: либо идёт с границами, либо известна следующая',
     (ss.active && ss.start && ss.end) || (!ss.active && ss.next));
  if (ss.active) {
    const years = (ss.end - ss.start) / 365.2425;
    ok(`длительность саде-сати около 7,5 лет (${years.toFixed(1)})`, years > 6.5 && years < 8.5);
  } else {
    // проверим длительность на карте, где саде-сати идёт
    const c2 = chartAt(1990, 1, 1, 12, 0, 55.76, 37.62, 'Europe/Moscow');
    let found = null;
    for (let y = 2000; y < 2040 && !found; y += 1) {
      const t = Tz.msToJd(Date.UTC(y, 0, 1));
      const s3 = Fc.sadeSati(c2, t);
      if (s3.active) found = s3;
    }
    if (found) {
      const years = (found.end - found.start) / 365.2425;
      ok(`длительность саде-сати около 7,5 лет (${years.toFixed(1)})`, years > 6.5 && years < 8.5);
    } else {
      ok('саде-сати найдена хотя бы на одной карте за 40 лет', false);
    }
  }
}

/* -------------------------------------------------- доступ и биджи */
group('Доступ и биджи');
{
  Acc.reset();
  ok('склонение: 1 биджа, 3 биджи, 7 бидж',
     Acc.plural(1) === 'биджа' && Acc.plural(3) === 'биджи' && Acc.plural(7) === 'бидж' &&
     Acc.plural(11) === 'бидж' && Acc.plural(21) === 'биджа');
  ok('у каждого разбора есть цена, описание и бесплатная часть',
     Object.keys(Acc.FEATURES).every(id => {
       const f = Acc.feature(id);
       return f.price > 0 && f.about && f.title && f.free;
     }));
  ok('пакеты идут по возрастанию и выгода растёт',
     Acc.PACKS.every((p, i) => i === 0 ||
       (p.seeds > Acc.PACKS[i - 1].seeds && p.price / p.seeds <= Acc.PACKS[i - 1].price / Acc.PACKS[i - 1].seeds)));

  const before = Acc.balance();
  const price = Acc.feature('chart.yogas').price;
  ok('до покупки разбор закрыт', !Acc.has('chart.yogas'));
  const r1 = Acc.unlock('chart.yogas');
  ok('покупка списывает ровно цену', r1.ok && Acc.balance() === before - price);
  ok('после покупки разбор открыт', Acc.has('chart.yogas'));
  const r2 = Acc.unlock('chart.yogas');
  ok('повторная покупка не списывает второй раз',
     r2.ok && r2.by === 'already' && Acc.balance() === before - price);

  Acc.reset();
  // тратим всё до нуля и проверяем отказ
  let guard = 0;
  while (Acc.balance() >= 1 && guard++ < 50) {
    const id = Object.keys(Acc.FEATURES).find(k => !Acc.has(k) && Acc.feature(k).price <= Acc.balance());
    if (!id) break;
    Acc.unlock(id);
  }
  const need = Object.keys(Acc.FEATURES).find(k => !Acc.has(k) && Acc.feature(k).price > Acc.balance());
  if (need) {
    const r3 = Acc.unlock(need);
    ok('без бидж разбор не открывается', !r3.ok && r3.reason === 'not-enough');
  } else {
    ok('без бидж разбор не открывается (все разборы уже открыты — пропуск)', true);
  }

  Acc.reset();
  Acc.setPlan(Acc.PLAN.id);
  ok('подписка открывает всё без списаний',
     Object.keys(Acc.FEATURES).every(id => Acc.has(id)));
  Acc.setPlan('free');
  Acc.reset();
}

/* -------------------------------------- дополнительные проверки пары */
group('Раджу, махендра, стри-диргха');
{
  const CLASSIC = 'пада кати набхи кантха широ кантха набхи кати пада'.split(' ');
  ok('раджу совпадает с классической раскладкой',
     [...Array(27).keys()].every(i =>
       K.RAJJU_NAMES[K.rajjuOf(i)].split(' ')[0] === CLASSIC[i % 9]));
  ok('широ-раджу ровно у трёх накшатр: Мригашира, Читра, Дхаништха',
     [...Array(27).keys()].filter(i => K.rajjuOf(i) === 4)
       .map(i => D.NAKSHATRAS[i].sa).join(', ') === 'Мригашира, Читра, Дхаништха');
  const a2 = chartAt(1988, 4, 12, 14, 25, 55.76, 37.62, 'Europe/Moscow');
  const b2 = chartAt(1991, 9, 3, 8, 40, 59.93, 30.36, 'Europe/Moscow');
  const ex = K.extras(a2, b2);
  ok('три дополнительные проверки с пояснениями',
     ex.length === 3 && ex.every(e => e.title && e.note && typeof e.ok === 'boolean'));
}

console.log(`\nпройдено ${passed}, провалено ${failed}`);
process.exit(failed ? 1 : 0);
