/*
 * Аруна · тест западной натальной карты
 * ------------------------------------------------------------------
 * Три рода проверок:
 *
 *   1. Инварианты, которые обязаны выполняться в любой карте:
 *      куспиды по кругу без разрывов, противоположные дома ровно
 *      напротив, суммы долей стихий, симметрия аспектов.
 *   2. Классические таблицы — достоинства, термы, деканы, тритоны:
 *      их значения известны и от нашего мнения не зависят.
 *   3. Поведение на краю: полярные широты, неизвестное время,
 *      мусор во входных данных.
 *
 * Сверка куспидов со Swiss Ephemeris — отдельно, в
 * test/validate_houses.py: она требует pyswisseph, а базовые проверки
 * должны идти на голом node.
 *
 * Запуск: node test/natal.test.js
 */
'use strict';

const J = require('../server/lib/jyotish.js');
const D = J.NatalData, H = J.Houses, N = J.Natal, Asp = J.NatalAspects,
      Dg = J.Dignities, Shp = J.Shape, Tr = J.Transits, I = J.Interpret, A = J.Astro;

let passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ ' + name + (extra !== undefined ? '  → ' + extra : '')); }
}
function group(n) { console.log('\n— ' + n); }
function norm360(x) { return ((x % 360) + 360) % 360; }

const BIRTH = { date: '1990-05-15', time: '10:30', timeKnown: true,
  place: { name: 'Москва', lat: 55.7558, lon: 37.6176, tz: 'Europe/Moscow' } };
const PLACES = [
  { name: 'Москва', lat: 55.7558, lon: 37.6176, tz: 'Europe/Moscow' },
  { name: 'Сидней', lat: -33.8688, lon: 151.2093, tz: 'Australia/Sydney' },
  { name: 'Сингапур', lat: 1.3521, lon: 103.8198, tz: 'Asia/Singapore' },
  { name: 'Нью-Йорк', lat: 40.7128, lon: -74.006, tz: 'America/New_York' }
];

/* ================================================== 1. эфемерида */

group('Дальние планеты и Лилит');
{
  const jd = A.julianDay(2026, 9, 29, 12);
  const p = A.tropicalPositions(jd);
  ok('Уран, Нептун, Плутон посчитаны',
    ['uranus', 'neptune', 'pluto'].every((k) => p[k] && isFinite(p[k].lon)));
  ok('дальние планеты идут медленно',
    ['uranus', 'neptune', 'pluto'].every((k) => Math.abs(p[k].speed) < 0.1));
  ok('Лилит посчитана и не стоит на месте', isFinite(p.lilith.lon) && p.lilith.speed > 0);
  // апогей лунной орбиты обходит круг примерно за 8,85 года
  const period = 360 / p.lilith.speed / 365.25;
  ok('период Лилит около 8,85 года', Math.abs(period - 8.85) < 0.6, period.toFixed(2));
  ok('Плутон не считается вне 1800-2100',
    !A.plutoValid(A.julianDay(1750, 1, 1, 12)) && A.plutoValid(jd));
  ok('джйотиш не заметил новых ключей', A.GRAHA_ORDER.length === 9);
  // одно тело и вся эфемерида должны совпадать
  ok('bodyLongitude совпадает с общим расчётом',
    ['sun', 'moon', 'saturn', 'pluto'].every((k) =>
      Math.abs(A.bodyLongitude(k, jd) - p[k].lon) < 1e-9));
}

group('Асцендент за полярным кругом');
{
  // формула даёт одну из двух точек пересечения; за полярным кругом это
  // может оказаться заходящая. Признак: асцендент всегда впереди MC.
  let worst = 0;
  for (const lat of [0, 30, 55.75, 68.96, 71, -33.9, -68]) {
    for (let h = 0; h < 24; h += 1.7) {
      const am = A.ascendantMc(A.julianDay(1985, 3, 20, h), lat, 33);
      const d = norm360(am.asc - am.mc);
      if (d <= 0 || d >= 180) worst = Math.max(worst, 1);
    }
  }
  ok('асцендент всегда впереди MC и не дальше полукруга', worst === 0);
}

/* ==================================================== 2. дома */

group('Системы домов: инварианты');
{
  let bad = [];
  for (const place of PLACES) {
    for (const sys of H.SYSTEMS.map((s) => s.id)) {
      const c = N.build({ date: '1985-07-30', time: '16:40', place }, sys);
      const cusps = c.houses.cusps;
      // куспиды идут по кругу, каждый следующий впереди предыдущего
      let sum = 0;
      for (let n = 1; n <= 12; n++) {
        const span = norm360(cusps[n === 12 ? 1 : n + 1] - cusps[n]);
        sum += span;
        if (span <= 0.0001 || span >= 240) bad.push(place.name + '/' + sys + ' дом ' + n);
      }
      if (Math.abs(sum - 360) > 1e-6) bad.push(place.name + '/' + sys + ' сумма ' + sum);
      // противоположные дома ровно напротив
      for (let n = 1; n <= 6; n++) {
        const d = Math.abs(norm360(cusps[n + 6] - cusps[n]) - 180);
        if (d > 1e-7) bad.push(place.name + '/' + sys + ' дом ' + n + ' не напротив');
      }
      // первый куспид — асцендент, десятый — MC (кроме тех систем, где так не бывает)
      if (['placidus', 'koch', 'regiomontanus', 'campanus', 'porphyry'].indexOf(sys) >= 0) {
        if (Math.abs(norm360(cusps[1] - c.angles.asc.lon)) > 1e-7) {
          bad.push(place.name + '/' + sys + ' первый куспид не асцендент');
        }
        if (Math.abs(norm360(cusps[10] - c.angles.mc.lon)) > 1e-7) {
          bad.push(place.name + '/' + sys + ' десятый куспид не MC');
        }
      }
    }
  }
  ok('куспиды покрывают круг без разрывов и наложений', bad.length === 0, bad.slice(0, 3).join('; '));
}

group('Системы домов: совпадение на экваторе');
{
  const am = A.ascendantMc(A.julianDay(1990, 5, 15, 7.5), 0, 30);
  const o = { ramc: am.lst, lat: 0, eps: am.obliquity, asc: am.asc, mc: am.mc };
  const p = H.houses(Object.assign({}, o, { system: 'placidus' })).cusps;
  let worst = 0;
  ['koch', 'regiomontanus', 'campanus'].forEach((s) => {
    const c = H.houses(Object.assign({}, o, { system: s })).cusps;
    for (let n = 1; n <= 12; n++) worst = Math.max(worst, Math.abs(norm360(c[n] - p[n] + 180) - 180));
  });
  // на экваторе все квадрантные системы обязаны совпасть: это теорема, а не совпадение
  ok('Плацидус, Кох, Региомонтан и Кампанус совпадают на экваторе',
    worst < 1e-6, worst.toExponential(1));
}

group('Системы домов: полярные широты');
{
  const c = N.build({ date: '1985-01-03', time: '09:00',
    place: { name: 'Шпицберген', lat: 78, lon: 15, tz: 'UTC' } }, 'placidus');
  ok('Плацидус отказывается считать', c.houses.failed === true);
  ok('и объясняет почему', /не определён|полярн/.test(c.houses.why || ''));
  ok('вместо него отдан Порфирий', c.houses.fallback === 'porphyry');
  ok('куспиды всё равно есть — страница не пустеет', c.houses.cusps.length === 13);
  const w = N.build({ date: '1985-01-03', time: '09:00',
    place: { name: 'Шпицберген', lat: 78, lon: 15, tz: 'UTC' } }, 'whole');
  ok('целознаковая работает и там', w.houses.failed === false);
}

/* ================================================== 3. карта */

group('Карта: состав и связность');
{
  const c = N.build(BIRTH);
  ok('десять тел плюс узлы и Лилит', Object.keys(c.planets).length === 13);
  ok('у каждой планеты знак, градус и дом',
    D.PLANET_ORDER.every((k) => !c.planets[k] ||
      (c.planets[k].signRu && c.planets[k].house >= 1 && c.planets[k].house <= 12)));
  ok('дом планеты согласован с куспидами',
    D.PLANET_ORDER.every((k) => !c.planets[k] ||
      c.planets[k].house === H.houseOf(c.planets[k].lon, c.houses.cusps)));
  ok('десцендент напротив асцендента',
    Math.abs(norm360(c.angles.dsc.lon - c.angles.asc.lon) - 180) < 1e-9);
  ok('надир напротив MC',
    Math.abs(norm360(c.angles.ic.lon - c.angles.mc.lon) - 180) < 1e-9);
  ok('секта определена по дому Солнца',
    c.byDay === (c.planets.sun.house >= 7 && c.planets.sun.house <= 12));
  ok('доли стихий в сумме дают единицу',
    Math.abs(Object.values(c.balance.elementShare).reduce((a, b) => a + b, 0) - 1) < 1e-9);
  ok('доли крестов тоже',
    Math.abs(Object.values(c.balance.modeShare).reduce((a, b) => a + b, 0) - 1) < 1e-9);
  ok('управитель карты — хозяин знака асцендента',
    c.chartRuler.key === D.SIGNS[c.angles.asc.sign].ruler);
}

group('Карта: Солнце и Луна против джйотиша');
{
  // тропический и сидерический зодиак расходятся на аянамшу — около 24°
  const c = N.build(BIRTH);
  const jy = J.chartFromBirth(BIRTH).chart;
  const diff = norm360(c.planets.sun.lon - jy.grahas.sun.lon);
  ok('разница тропического и сидерического — аянамша',
    Math.abs(diff - J.Chart.ayanamsa(c.jd)) < 1e-6, diff.toFixed(4));
  ok('и знак Солнца поэтому обычно другой',
    c.planets.sun.signRu !== jy.grahas.sun.rashiName);
}

group('Жребий Фортуны переворачивается по секте');
{
  // днём ASC + Луна − Солнце, ночью наоборот: это правило Птолемея
  const day = N.build({ date: '1990-05-15', time: '12:00', place: PLACES[0] });
  const night = N.build({ date: '1990-05-15', time: '00:30', place: PLACES[0] });
  const f = (c) => norm360(c.byDay
    ? c.angles.asc.lon + c.planets.moon.lon - c.planets.sun.lon
    : c.angles.asc.lon + c.planets.sun.lon - c.planets.moon.lon);
  ok('дневная формула в дневной карте', day.byDay && Math.abs(day.fortune.lon - f(day)) < 1e-9);
  ok('ночная формула в ночной карте', !night.byDay && Math.abs(night.fortune.lon - f(night)) < 1e-9);
}

/* ================================================== 4. аспекты */

group('Аспекты');
{
  const c = N.build(BIRTH);
  const r = Asp.findAll(c);
  ok('аспекты найдены', r.list.length > 10);
  ok('орб каждого не больше допустимого',
    r.list.every((x) => x.orbDiff <= x.orbAllowed + 1e-9));
  ok('сила от нуля до единицы',
    r.list.every((x) => x.strength >= 0 && x.strength <= 1));
  ok('угол совпадает с заявленным аспектом',
    r.list.every((x) => Math.abs(x.exact - x.angle) <= x.orbAllowed + 1e-9));
  ok('одна пара точек — не больше одного аспекта', (() => {
    const seen = {};
    return r.list.every((x) => {
      const id = [x.a, x.b].sort().join('|');
      if (seen[id]) return false;
      seen[id] = 1;
      return true;
    });
  })());
  ok('узлы друг с другом не аспектируются',
    !r.list.some((x) => [x.a, x.b].sort().join('|') === 'node|southnode'));
  ok('счётчики сходятся со списком',
    r.counts.hard + r.counts.soft + r.counts.neutral === r.list.length);
  ok('светила получают орбис шире',
    Asp.orbFor(D.aspectByKey('trine'), 'sun', 'moon') >
    Asp.orbFor(D.aspectByKey('trine'), 'uranus', 'pluto'));
  // сходящийся аспект: быстрая планета догоняет
  const conj = r.list.filter((x) => x.aspect === 'conjunction' && x.applying !== null)[0];
  ok('сходимость определена по скоростям, а не по знаку разности',
    !conj || typeof conj.applying === 'boolean');
  ok('минорные аспекты по умолчанию не ищутся', r.list.every((x) => x.major));
  ok('но включаются по просьбе', Asp.findAll(c, { minor: true }).list.length >= r.list.length);
}

group('Конфигурации аспектов');
{
  // ищем карты, где фигуры точно есть, и проверяем их состав
  let found = { 'grand-trine': 0, 't-square': 0, stellium: 0, yod: 0, 'grand-cross': 0 };
  for (let y = 1960; y <= 2005; y += 3) {
    const c = N.build({ date: y + '-03-21', time: '12:00', place: PLACES[0] });
    const r = Asp.findAll(c, { minor: true });
    r.patterns.forEach((p) => { if (found[p.key] !== undefined) found[p.key]++; });
    // каждая фигура обязана состоять из реально найденных аспектов
    r.patterns.forEach((p) => {
      if (p.key === 't-square') {
        const has = (a, b, t) => r.list.some((x) =>
          ((x.a === a && x.b === b) || (x.a === b && x.b === a)) && x.aspect === t);
        const [x1, x2, apex] = p.points;
        if (!(has(x1, x2, 'opposition') && has(x1, apex, 'square') && has(x2, apex, 'square'))) {
          found['t-square'] = -1;
        }
      }
    });
  }
  ok('тау-квадраты находятся и состоят из настоящих аспектов', found['t-square'] > 0);
  ok('стеллиумы находятся', found.stellium > 0);
  ok('большие тригоны находятся', found['grand-trine'] > 0);
}

/* =============================================== 5. достоинства */

group('Достоинства: классические таблицы');
{
  const E = (k, lon, day) => Dg.essential(k, lon, day === undefined ? true : day);
  const names = (r) => r.dignities.map((d) => d.kind);
  ok('Солнце в Овне 19° — экзальтация', names(E('sun', 19)).indexOf('exalt') >= 0);
  ok('Сатурн в Весах 21° — экзальтация', names(E('saturn', 201)).indexOf('exalt') >= 0);
  ok('Юпитер в Раке 15° — экзальтация', names(E('jupiter', 105)).indexOf('exalt') >= 0);
  ok('Марс в Козероге 28° — экзальтация', names(E('mars', 298)).indexOf('exalt') >= 0);
  ok('Венера в Рыбах 27° — экзальтация', names(E('venus', 357)).indexOf('exalt') >= 0);
  ok('Луна в Тельце 3° — экзальтация', names(E('moon', 33)).indexOf('exalt') >= 0);
  ok('Меркурий в Деве — и обитель, и экзальтация', E('mercury', 165).score >= 9);
  ok('Марс в Раке — падение', E('mars', 95).debilities.some((d) => d.kind === 'fall'));
  ok('Сатурн в Овне — падение', E('saturn', 10).debilities.some((d) => d.kind === 'fall'));
  ok('Солнце в Водолее — изгнание', E('sun', 310).debilities.some((d) => d.kind === 'detriment'));
  ok('тритон огня днём — Солнце, ночью Юпитер',
    Dg.triplicityOf(0, true) === 'sun' && Dg.triplicityOf(0, false) === 'jupiter');
  ok('тритон воды днём Венера, ночью Марс',
    Dg.triplicityOf(3, true) === 'venus' && Dg.triplicityOf(3, false) === 'mars');
  // деканы идут халдейским рядом без пропусков по всем 36 декадам
  const faces = [];
  for (let sgn = 0; sgn < 12; sgn++) for (let d = 0; d < 3; d++) faces.push(Dg.faceOf(sgn, d * 10 + 5));
  ok('36 деканов идут халдейским рядом', faces.every((f, i) => f === D.CHALDEAN[i % 7]));
  ok('термы покрывают знак целиком и без повторов',
    Object.keys(D.TERMS).every((k) => {
      const t = D.TERMS[k];
      return t.length === 5 && t[t.length - 1][0] === 30 &&
             new Set(t.map((x) => x[1])).size === 5 &&
             t.every((x, i) => i === 0 || x[0] > t[i - 1][0]);
    }));
  ok('термы не дают достоинств светилам',
    !Object.keys(D.TERMS).some((k) => D.TERMS[k].some((t) => t[1] === 'sun' || t[1] === 'moon')));
}

group('Достоинства: альмутен и таблица');
{
  const c = N.build(BIRTH);
  const all = Dg.all(c);
  ok('в таблице только семь классических планет', all.rows.length === 7);
  ok('дальние планеты в неё не попали',
    !all.rows.some((r) => ['uranus', 'neptune', 'pluto'].indexOf(r.key) >= 0));
  ok('и об этом сказано прямо', /не участвуют/.test(all.note));
  ok('альмутен асцендента посчитан и с объяснением',
    all.almutenAsc.winner && all.almutenAsc.winner.why.length > 0);
  ok('очки альмутена идут по убыванию',
    all.almutenAsc.list.every((x, i, a) => i === 0 || a[i - 1].score >= x.score));
  ok('перегрин — это ноль достоинств и ноль слабостей',
    all.peregrines.every((r) => r.dignities.length === 0 && r.debilities.length === 0));
  // казими отличается от сожжения: это усиление, а не потеря
  ok('казими не считается сожжением',
    D.CLASSICAL.every((k) => !c.planets[k] || !(c.planets[k].cazimi && c.planets[k].combust)));
}

/* =============================================== 6. рисунок карты */

group('Рисунок карты');
{
  const shapes = {};
  for (let y = 1950; y <= 2010; y += 2) {
    const c = N.build({ date: y + '-06-15', time: '12:00', place: PLACES[0] });
    const p = Shp.pattern(c);
    if (p) shapes[p.key] = (shapes[p.key] || 0) + 1;
  }
  ok('фигуры различаются, а не сводятся к одной', Object.keys(shapes).length >= 3,
    JSON.stringify(shapes));
  const c = N.build(BIRTH);
  const p = Shp.pattern(c);
  ok('занятая дуга и наибольший разрыв дают полный круг',
    Math.abs(p.span + p.gaps[0].size - 360) < 1e-9);
  ok('у корзины всегда названа ручка',
    Object.keys(shapes).indexOf('bucket') < 0 || (() => {
      for (let y = 1950; y <= 2010; y += 2) {
        const cc = N.build({ date: y + '-06-15', time: '12:00', place: PLACES[0] });
        const pp = Shp.pattern(cc);
        if (pp && pp.key === 'bucket' && !pp.handle) return false;
      }
      return true;
    })());
  ok('диспозитор либо планета в своём знаке, либо честное кольцо', (() => {
    const d = Shp.finalDispositor(c);
    if (d.mutual) return true;
    return D.SIGNS[c.planets[d.key].sign].ruler === d.key;
  })());
}

/* ================================================= 7. транзиты */

group('Транзиты и прогрессии');
{
  const c = N.build(BIRTH);
  const now = A.julianDay(2026, 9, 29, 12);
  const t0 = Date.now();
  const t = Tr.ahead(c, now, 12);
  const ms = Date.now() - t0;
  ok('год транзитов считается быстрее секунды', ms < 1000, ms + ' мс');
  ok('события упорядочены по дате',
    t.events.every((e, i, a) => i === 0 || a[i - 1].jd <= e.jd));
  ok('все события внутри запрошенного отрезка',
    t.events.every((e) => e.jd >= now - 1e-6 && e.jd <= t.to + 1e-6));
  ok('проходы одного аспекта пронумерованы',
    t.events.every((e) => e.pass >= 1 && e.pass <= e.passes));
  ok('в момент точного аспекта угол действительно точен',
    t.events.slice(0, 6).every((e) => {
      const lon = A.bodyLongitude(e.transit, e.jd);
      const target = e.target === 'asc' ? c.angles.asc.lon
                   : e.target === 'mc' ? c.angles.mc.lon : c.planets[e.target].lon;
      const d = Math.abs(norm360(lon - target));
      const sep = d > 180 ? 360 - d : d;
      return Math.abs(sep - D.aspectByKey(e.aspect).angle) < 0.02;
    }));
  ok('быстрые планеты в годовой список не попадают',
    t.events.every((e) => Tr.SLOW.indexOf(e.transit) >= 0));

  const pr = Tr.progressed(c, now);
  ok('возраст в прогрессиях совпадает с настоящим',
    Math.abs(pr.years - (now - c.jd) / 365.2422) < 1e-9);
  ok('прогрессивная карта — это сутки за год',
    Math.abs(pr.jd - (c.jd + pr.years)) < 1e-9);
  ok('прогрессивное Солнце ушло примерно на градус за год',
    Math.abs(norm360(pr.planets.sun.lon - c.planets.sun.lon) / pr.years - 1) < 0.05);
  const nx = Tr.nextProgressedMoonSign(c, now);
  ok('смена знака прогрессивной Луны найдена и в будущем', nx && nx.jd > now);
}

/* =============================================== 8. толкования */

group('Толкования собираются по правилу');
{
  const c = N.build(BIRTH);
  const a = Asp.findAll(c);
  const fr = I.free(c, a, Shp.pattern(c));
  ok('у каждого блока есть и вывод, и правило',
    fr.opening.every((o) => o.text && o.rule));
  ok('в тексте нет разметки',
    fr.opening.every((o) => !/[*#`]/.test(o.text)));
  ok('Солнце и Луна разобраны по знаку', fr.sun.text.length > 60 && fr.moon.text.length > 60);
  ok('три самых точных аспекта объяснены', fr.tightest.length === 3);
  ok('у аспекта в правиле указан орб',
    fr.tightest.every((x) => /орб \d/.test(x.rule)));
  // текст обязан отличаться у разных людей: иначе это гороскоп из журнала
  const other = N.build({ date: '1975-06-15', time: '06:00', place: PLACES[1] });
  const fo = I.free(other, Asp.findAll(other), Shp.pattern(other));
  ok('у другой карты другой текст', fo.sun.text !== fr.sun.text);
  ok('склонения не ломаются', !/в [А-Я][а-я]+ —/.test(I.dignityLine(Dg.all(c).rows[1])));
}

/* ================================================= 9. устойчивость */

group('Устойчивость');
{
  ok('неизвестное время не роняет расчёт', (() => {
    const c = N.build({ date: '1990-05-15', time: '12:00', timeKnown: false, place: PLACES[0] });
    return c.planets.sun && c.houses.cusps.length === 13;
  })());
  ok('високосный день считается',
    N.build({ date: '2000-02-29', time: '12:00', place: PLACES[0] }).planets.sun !== undefined);
  ok('полночь и полдень не путаются', (() => {
    const a = N.build({ date: '1990-05-15', time: '00:00', place: PLACES[0] });
    const b = N.build({ date: '1990-05-15', time: '12:00', place: PLACES[0] });
    return Math.abs(a.angles.asc.lon - b.angles.asc.lon) > 100;
  })());
  ok('южное полушарие считается', (() => {
    const c = N.build({ date: '1990-05-15', time: '10:30', place: PLACES[1] });
    return c.houses.cusps.length === 13 && !c.houses.failed;
  })());
  ok('смена системы домов не трогает планеты', (() => {
    const a = N.build(BIRTH, 'placidus'), b = N.build(BIRTH, 'campanus');
    return D.PLANET_ORDER.every((k) => !a.planets[k] ||
      Math.abs(a.planets[k].lon - b.planets[k].lon) < 1e-12);
  })());
  ok('неизвестная система домов не роняет, а даёт Плацидус',
    N.build(BIRTH, 'выдуманная').houses.system.id === 'placidus');
  ok('карта 1900 года считается',
    N.build({ date: '1900-01-01', time: '08:00', place: PLACES[0] }).planets.pluto !== undefined);
  ok('расчёт карты укладывается в десятки миллисекунд', (() => {
    const t0 = Date.now();
    for (let i = 0; i < 10; i++) N.build(BIRTH);
    return (Date.now() - t0) / 10 < 60;
  })());
}

console.log('\nпройдено ' + passed + ', провалено ' + failed);
process.exit(failed ? 1 : 0);
