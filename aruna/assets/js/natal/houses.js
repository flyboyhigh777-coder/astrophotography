/*
 * Аруна · западная карта: системы домов
 * ==================================================================
 * В джйотише дома — это раши целиком, и спорить не о чем. В западной
 * астрологии систем домов больше десятка, куспиды у них разные, и спор
 * о том, какая верна, идёт тысячу лет. Поэтому здесь считаются семь
 * самых употребимых, а выбор оставлен человеку — с объяснением, чем
 * они отличаются.
 *
 * Как устроены квадрантные системы. Все домовые круги проходят через
 * точки севера и юга горизонта — значит, полюс каждого такого круга
 * лежит на первом вертикале. Отсюда единый приём: находим полюс круга,
 * объявляем его зенитом воображаемого наблюдателя и берём его
 * асцендент. Так Региомонтан и Кампанус считаются одной формулой и
 * различаются только тем, что делят: экватор или первый вертикал.
 *
 *   Плацидус     — суточную дугу самой точки на три равные части по
 *                  времени. Самая распространённая система в мире.
 *   Кох          — суточную дугу, но отсчёт ведётся от MC.
 *   Региомонтан  — небесный экватор на равные части.
 *   Кампанус     — первый вертикал на равные части.
 *   Порфирий     — дугу эклиптики между углами на три части.
 *   Равнодомная  — по 30° от асцендента.
 *   Целознаковая — знак целиком, как бхавы в джйотише.
 *
 * Про высокие широты. Плацидус, Кох, Региомонтан и Кампанус за
 * полярным кругом не определены: там есть точки эклиптики, которые
 * вообще не восходят, и делить их суточную дугу не на что. Мы не
 * подставляем «что-нибудь похожее», а возвращаем failed — страница
 * скажет об этом прямо и предложит систему, которая там работает.
 * Показать двенадцать чисел любой ценой было бы хуже.
 */
(function (root) {
  'use strict';

  var DEG = Math.PI / 180;
  function sin(x) { return Math.sin(x * DEG); }
  function cos(x) { return Math.cos(x * DEG); }
  function tan(x) { return Math.tan(x * DEG); }
  function asin(x) { return Math.asin(Math.max(-1, Math.min(1, x))) / DEG; }
  function atan(x) { return Math.atan(x) / DEG; }
  function atan2(y, x) { return Math.atan2(y, x) / DEG; }
  function norm360(x) { return ((x % 360) + 360) % 360; }
  /** Разница в пределах ±180. */
  function delta180(a, b) { return ((a - b + 540) % 360) - 180; }

  var SYSTEMS = [
    { id: 'placidus', title: 'Плацидус', quadrant: true, polar: false,
      about: 'Суточная дуга каждой точки делится на три равные части по времени. ' +
             'Самая распространённая система: её видят в девяти картах из десяти.' },
    { id: 'koch', title: 'Кох', quadrant: true, polar: false,
      about: 'Тоже по времени, но отсчёт ведётся от середины неба. ' +
             'Основная в немецкой школе; иногда её зовут системой «домов рождения».' },
    { id: 'regiomontanus', title: 'Региомонтан', quadrant: true, polar: false,
      about: 'Небесный экватор делится на двенадцать равных частей. ' +
             'Средневековая система, в хорарной астрологии — основная.' },
    { id: 'campanus', title: 'Кампанус', quadrant: true, polar: false,
      about: 'На равные части делится первый вертикал — круг через восток, ' +
             'зенит и запад. Геометрически самая наглядная из квадрантных.' },
    { id: 'porphyry', title: 'Порфирий', quadrant: true, polar: true,
      about: 'Дуга эклиптики между углами делится на три равные части. ' +
             'Древнейшая из квадрантных и единственная, что работает на любой широте.' },
    { id: 'equal', title: 'Равнодомная', quadrant: false, polar: true,
      about: 'По 30° от асцендента. Углы, кроме первого, перестают быть куспидами, ' +
             'зато система не ломается нигде и ничего не искажает.' },
    { id: 'whole', title: 'Целознаковая', quadrant: false, polar: true,
      about: 'Дом равен знаку целиком — ровно как бхавы в джйотише. ' +
             'Древнейшая из всех: именно ею пользовались эллинистические астрологи.' }
  ];

  function systemById(id) {
    for (var i = 0; i < SYSTEMS.length; i++) if (SYSTEMS[i].id === id) return SYSTEMS[i];
    return SYSTEMS[0];
  }

  /* ------------------------------------------------------- основа */

  /**
   * Асцендент для наблюдателя на широте pole при звёздном времени oa.
   * Та же формула, что и для настоящего асцендента, — и в этом смысл:
   * домовой круг это горизонт воображаемого наблюдателя.
   */
  function ascAt(oa, pole, eps) {
    return norm360(atan2(cos(oa), -(sin(oa) * cos(eps) + tan(pole) * sin(eps))));
  }

  /** Точка эклиптики с заданным прямым восхождением. */
  function lonFromRa(ra, eps) { return norm360(atan2(sin(ra), cos(ra) * cos(eps))); }

  /** Склонение точки эклиптики. */
  function decOf(lon, eps) { return asin(sin(eps) * sin(lon)); }

  /**
   * Куспид по полюсу домового круга. Полюс задан склонением и часовым
   * углом; переводим его в «звёздное время воображаемого наблюдателя»
   * и берём асцендент.
   */
  function cuspByPole(ramc, decPole, haPole, eps) {
    return ascAt(norm360(ramc - haPole), decPole, eps);
  }

  /* --------------------------------------------------- Региомонтан */

  /*
   * Домовой круг пересекает экватор при часовом угле h. Полюс круга —
   * векторное произведение направления на север горизонта и этой точки
   * экватора. Отсюда сразу склонение и часовой угол полюса.
   */
  function regiomontanusPole(h, lat) {
    // север горизонта в экваториальных: склонение 90−φ, часовой угол 180
    var nx = -sin(lat), nz = cos(lat);
    var px = cos(h), py = sin(h), pz = 0;
    var vx = 0 * pz - nz * py, vy = nz * px - nx * pz, vz = nx * py - 0 * px;
    var len = Math.sqrt(vx * vx + vy * vy + vz * vz);
    return { dec: asin(vz / len), ha: atan2(vy, vx) };
  }

  /* ----------------------------------------------------- Кампанус */

  /*
   * Полюс домового круга лежит на первом вертикале, на угле ψ+90 от
   * точки востока. Переводим направление из горизонтальных координат
   * в экваториальные — и дальше всё то же самое.
   */
  function campanusPole(psi, lat) {
    // в горизонтальных (x — север, y — восток, z — зенит): (0, sinψ, cosψ)
    var y = sin(psi), z = cos(psi);
    var ex = z * cos(lat), ey = -y, ez = z * sin(lat);
    var len = Math.sqrt(ex * ex + ey * ey + ez * ez);
    return { dec: asin(ez / len), ha: atan2(ey, ex) };
  }

  /* ----------------------------------------------------- Плацидус */

  /**
   * Куспид Плацидуса. Ищем точку эклиптики, которая прошла нужную долю
   * своей полудуги. Уравнение неявное — решаем итерацией с релаксацией.
   *
   * @param {number} f      доля полудуги: 1/3 или 2/3
   * @param {boolean} below true — дома 2 и 3 (под горизонтом)
   * @returns {number|null} долгота или null, если точка не восходит
   */
  function placidusCusp(ramc, lat, eps, f, below) {
    var ra = norm360(ramc + (below ? 90 + 90 * f : 90 * f));
    for (var k = 0; k < 80; k++) {
      var dec = decOf(lonFromRa(ra, eps), eps);
      var t = tan(lat) * tan(dec);
      if (Math.abs(t) >= 1) return null;          // точка не восходит
      var ad = asin(t);                            // разность восхождения
      var sad = 90 + ad, san = 90 - ad;            // дневная и ночная полудуги
      var target = below ? ramc + sad + san * f : ramc + f * sad;
      var d = delta180(target, ra);
      ra = norm360(ra + 0.85 * d);
      if (Math.abs(d) < 1e-10) break;
    }
    return lonFromRa(ra, eps);
  }

  /* --------------------------------------------------------- Кох */

  /**
   * Кох. Каждый куспид — настоящий асцендент места рождения, взятый на
   * сдвинутое звёздное время; за это систему и зовут «домами рождения».
   * Сдвиг — треть разности восхождения середины неба, и берётся он
   * именно от MC, а не от асцендента: сверено со Swiss Ephemeris.
   *
   * Итераций не нужно: в отличие от Плацидуса, здесь уравнение явное.
   */
  function kochCusps(ramc, lat, eps, asc, mc) {
    var t = tan(lat) * tan(decOf(mc, eps));
    if (Math.abs(t) >= 1) return null;             // у MC нет суточной дуги
    var k = asin(t) / 3;                           // треть разности восхождения MC
    var c = new Array(13);
    c[1] = asc; c[10] = mc;
    c[11] = ascAt(norm360(ramc - 60 - 2 * k), lat, eps);
    c[12] = ascAt(norm360(ramc - 30 - k), lat, eps);
    c[2] = ascAt(norm360(ramc + 30 + k), lat, eps);
    c[3] = ascAt(norm360(ramc + 60 + 2 * k), lat, eps);
    return mirror(c);
  }

  /* ------------------------------------------------------- сборка */

  /**
   * Противоположные куспиды. Считаем всегда шесть — 10, 11, 12, 1, 2, 3, —
   * а остальные ровно напротив: во всех системах здесь это так.
   * Отдельная функция, потому что цикл «по порядку» однажды уже затёр
   * посчитанные куспиды теми, которых ещё не было.
   */
  function mirror(c) {
    c[4] = norm360(c[10] + 180);
    c[5] = norm360(c[11] + 180);
    c[6] = norm360(c[12] + 180);
    c[7] = norm360(c[1] + 180);
    c[8] = norm360(c[2] + 180);
    c[9] = norm360(c[3] + 180);
    return c;
  }

  /**
   * Куспиды всех двенадцати домов.
   *
   * @param {Object} o {ramc, lat, eps, asc, mc, system}
   * @returns {{cusps:number[], system:Object, failed:boolean, why:string|null,
   *            fallback:string|null}}
   *   cusps[1..12]; cusps[0] не используется — дома считают с единицы,
   *   и сдвигать нумерацию ради нуля значило бы спорить с предметом.
   */
  function houses(o) {
    var sys = systemById(o.system);
    var ramc = norm360(o.ramc), lat = o.lat, eps = o.eps;
    var asc = norm360(o.asc), mc = norm360(o.mc);
    var c = new Array(13), n;

    function finish(cusps) {
      return { cusps: cusps, system: sys, failed: false, why: null, fallback: null };
    }
    function fail(why) {
      // Порфирий определён везде: если квадрантная система не сложилась,
      // честно говорим об этом и отдаём то, что посчиталось.
      var alt = houses({ ramc: ramc, lat: lat, eps: eps, asc: asc, mc: mc, system: 'porphyry' });
      return { cusps: alt.cusps, system: sys, failed: true, why: why, fallback: 'porphyry' };
    }

    if (sys.id === 'whole') {
      var start = Math.floor(asc / 30) * 30;
      for (n = 1; n <= 12; n++) c[n] = norm360(start + 30 * (n - 1));
      return finish(c);
    }

    if (sys.id === 'equal') {
      for (n = 1; n <= 12; n++) c[n] = norm360(asc + 30 * (n - 1));
      return finish(c);
    }

    if (sys.id === 'porphyry') {
      // дуга от MC до асцендента делится на три, и так в каждом квадранте
      var q1 = norm360(asc - mc) / 3;
      c[10] = mc; c[11] = norm360(mc + q1); c[12] = norm360(mc + 2 * q1); c[1] = asc;
      var ic = norm360(mc + 180);
      var q2 = norm360(ic - asc) / 3;
      c[2] = norm360(asc + q2); c[3] = norm360(asc + 2 * q2);
      return finish(mirror(c));
    }

    if (Math.abs(lat) >= 90 - eps) {
      return fail('Широта за полярным кругом: есть точки эклиптики, которые здесь ' +
                  'не восходят вовсе, и делить их суточную дугу не на что.');
    }

    if (sys.id === 'placidus') {
      var p11 = placidusCusp(ramc, lat, eps, 1 / 3, false);
      var p12 = placidusCusp(ramc, lat, eps, 2 / 3, false);
      var p2 = placidusCusp(ramc, lat, eps, 1 / 3, true);
      var p3 = placidusCusp(ramc, lat, eps, 2 / 3, true);
      if (p11 === null || p12 === null || p2 === null || p3 === null) {
        return fail('Плацидус на этой широте не определён: куспид попадает на точку ' +
                    'эклиптики, которая здесь не восходит.');
      }
      c[1] = asc; c[10] = mc; c[11] = p11; c[12] = p12; c[2] = p2; c[3] = p3;
      return finish(mirror(c));
    }

    if (sys.id === 'koch') {
      var k = kochCusps(ramc, lat, eps, asc, mc);
      if (!k) {
        return fail('Кох на этой широте не определён: у середины неба здесь нет ' +
                    'суточной дуги, а сдвиг куспидов считается именно от неё.');
      }
      return finish(k);
    }

    // Региомонтан и Кампанус — одна формула, разные полюса
    var poleOf = sys.id === 'campanus'
      ? function (num) { return campanusPole(30 * (num - 1), lat); }
      : function (num) { return regiomontanusPole(-90 - 30 * (num - 1), lat); };

    c[1] = asc; c[10] = mc;
    [11, 12, 2, 3].forEach(function (num) {
      var p = poleOf(num);
      c[num] = cuspByPole(ramc, p.dec, p.ha, eps);
    });
    return finish(mirror(c));
  }

  /** Номер дома, в котором лежит долгота. Куспиды идут по кругу. */
  function houseOf(lon, cusps) {
    lon = norm360(lon);
    for (var n = 1; n <= 12; n++) {
      var a = cusps[n], b = cusps[n === 12 ? 1 : n + 1];
      var span = norm360(b - a);
      if (norm360(lon - a) < span || (span === 0 && norm360(lon - a) < 30)) return n;
    }
    return 1;
  }

  /** Насколько точка продвинулась внутри своего дома, 0..1. */
  function houseFraction(lon, cusps, num) {
    var a = cusps[num], b = cusps[num === 12 ? 1 : num + 1];
    var span = norm360(b - a) || 30;
    return norm360(lon - a) / span;
  }

  root.ArunaHouses = {
    SYSTEMS: SYSTEMS, systemById: systemById, houses: houses,
    houseOf: houseOf, houseFraction: houseFraction,
    ascAt: ascAt, lonFromRa: lonFromRa, decOf: decOf
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
