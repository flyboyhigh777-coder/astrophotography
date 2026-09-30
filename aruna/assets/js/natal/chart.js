/*
 * Аруна · западная натальная карта
 * ==================================================================
 * Тропический зодиак (в отличие от джйотиша на этом же сайте, где
 * зодиак сидерический — разница около 24°, и это не мелочь: почти у
 * всех знак Солнца получается разный). Дома — на выбор из семи
 * систем. Планеты — семь классических плюс Уран, Нептун, Плутон, узлы
 * и Лилит.
 *
 * Здесь только расчёт и то, что из него следует прямо: положения,
 * дома, стихии, кресты, полушария, секта, фаза Луны, жребий Фортуны.
 * Аспекты, достоинства и рисунок карты — в соседних файлах.
 */
(function (root) {
  'use strict';

  var A = root.ArunaAstro, H = root.ArunaHouses, D = root.ArunaNatalData, Tz = root.ArunaTz;

  function norm360(x) { return ((x % 360) + 360) % 360; }

  /**
   * Натальная карта.
   * @param {Object} b {date:'1990-05-15', time:'10:30', timeKnown, place:{name,lat,lon,tz}}
   * @param {string} [system] система домов, по умолчанию Плацидус
   */
  function build(b, system) {
    var d = String(b.date).split('-').map(Number);
    var t = String(b.time || '12:00').split(':').map(Number);
    var utcMs = Tz.zonedToUtcMs(d[0], d[1], d[2], t[0] || 0, t[1] || 0, b.place.tz);
    var jd = Tz.msToJd(utcMs);

    var am = A.ascendantMc(jd, b.place.lat, b.place.lon);
    var pos = A.tropicalPositions(jd);
    var hs = H.houses({
      ramc: am.lst, lat: b.place.lat, eps: am.obliquity,
      asc: am.asc, mc: am.mc, system: system || 'placidus'
    });

    var planets = {};
    D.PLANET_ORDER.forEach(function (k) {
      var raw = k === 'node' ? pos.rahu
              : k === 'southnode' ? pos.ketu
              : pos[k];
      if (!raw) return;
      var lon = norm360(raw.lon);
      var sign = D.signOf(lon);
      planets[k] = {
        key: k, lon: lon, sign: sign, signKey: D.SIGNS[sign].key, signRu: D.SIGNS[sign].ru,
        deg: D.degInSign(lon), dms: D.dms(D.degInSign(lon)),
        speed: raw.speed,
        // узлы всегда идут вспять, светила — никогда
        retro: (k === 'node' || k === 'southnode') ? true
             : (k === 'sun' || k === 'moon' || k === 'lilith') ? false
             : raw.speed < 0,
        house: hs.cusps ? H.houseOf(lon, hs.cusps) : null,
        meta: D.PLANETS[k]
      };
    });

    /* Секта: дневная карта, если Солнце над горизонтом. От неё зависят
       тритоны в достоинствах и вообще тон чтения — классика делит
       планеты на дневную и ночную свиту. */
    var sunHouse = planets.sun.house;
    var byDay = sunHouse >= 7 && sunHouse <= 12;

    /* Сожжение и «в сердце Солнца». Cazimi — очень редкое и, в отличие
       от сожжения, считается усилением: планета не сгорает, а сидит
       на троне. Разделять их обязательно. */
    ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'moon'].forEach(function (k) {
      if (!planets[k]) return;
      var sep = Math.abs(A.diff180(planets[k].lon, planets.sun.lon));
      planets[k].fromSun = sep;
      planets[k].cazimi = sep < 17 / 60;
      planets[k].combust = !planets[k].cazimi && sep < 8.5;
      planets[k].underBeams = !planets[k].combust && !planets[k].cazimi && sep < 15;
    });

    var asc = am.asc, mc = am.mc;
    var angles = {
      asc: pointInfo(asc, 'Асцендент', 'ASC'),
      mc: pointInfo(mc, 'Середина неба', 'MC'),
      dsc: pointInfo(norm360(asc + 180), 'Десцендент', 'DSC'),
      ic: pointInfo(norm360(mc + 180), 'Надир', 'IC')
    };

    /* Жребий Фортуны: днём ASC + Луна − Солнце, ночью ASC + Солнце − Луна.
       Переворот по секте — не украшение: без него жребий в ночной карте
       указывает не туда, и это старейший спор, решённый ещё Птолемеем. */
    var fortune = byDay
      ? norm360(asc + planets.moon.lon - planets.sun.lon)
      : norm360(asc + planets.sun.lon - planets.moon.lon);

    var chart = {
      birth: b, jd: jd, utcMs: utcMs, lat: b.place.lat, lon: b.place.lon, tz: b.place.tz,
      obliquity: am.obliquity, ramc: am.lst,
      planets: planets, angles: angles, houses: hs, byDay: byDay,
      fortune: pointInfo(fortune, 'Жребий Фортуны', '⊗'),
      lunarPhase: lunarPhase(planets.sun.lon, planets.moon.lon),
      balance: balance(planets),
      hemispheres: hemispheres(planets),
      chartRuler: null
    };
    chart.chartRuler = chartRuler(chart);
    return chart;
  }

  function pointInfo(lon, ru, short) {
    var sign = D.signOf(lon);
    return {
      lon: lon, ru: ru, short: short, sign: sign,
      signKey: D.SIGNS[sign].key, signRu: D.SIGNS[sign].ru,
      deg: D.degInSign(lon), dms: D.dms(D.degInSign(lon))
    };
  }

  /* --------------------------------------------------------- фаза Луны */

  var PHASES = [
    { to: 45,  key: 'new', ru: 'новолуние', about: 'начало цикла: замысел ещё без формы, и это нормально' },
    { to: 90,  key: 'crescent', ru: 'молодая Луна', about: 'первое усилие: замысел приходится защищать' },
    { to: 135, key: 'firstq', ru: 'первая четверть', about: 'кризис действия: надо решать, а не готовиться' },
    { to: 180, key: 'gibbous', ru: 'растущая выпуклая', about: 'доводка: видно, чего не хватает' },
    { to: 225, key: 'full', ru: 'полнолуние', about: 'полная видимость: становится ясно, что вышло' },
    { to: 270, key: 'disseminating', ru: 'убывающая выпуклая', about: 'время отдавать и объяснять' },
    { to: 315, key: 'lastq', ru: 'последняя четверть', about: 'кризис смысла: пересматривают основания' },
    { to: 360, key: 'balsamic', ru: 'бальзамическая', about: 'отпускание: копится то, что прорастёт позже' }
  ];

  function lunarPhase(sunLon, moonLon) {
    var d = norm360(moonLon - sunLon);
    for (var i = 0; i < PHASES.length; i++) {
      if (d < PHASES[i].to) {
        return { angle: d, key: PHASES[i].key, ru: PHASES[i].ru, about: PHASES[i].about,
                 illum: (1 - Math.cos(d * Math.PI / 180)) / 2 };
      }
    }
    return { angle: d, key: 'new', ru: 'новолуние', about: PHASES[0].about, illum: 0 };
  }

  /* ------------------------------------------- стихии, кресты, полушария */

  /* Веса: светила тяжелее прочих, дальние планеты легче — они стоят в
     знаке годами и у целого поколения одинаковы, поэтому судить по ним
     о человеке нельзя. Это и есть причина, по которой простой подсчёт
     «сколько планет в огне» вводит в заблуждение. */
  var WEIGHT = {
    sun: 3, moon: 3, mercury: 2, venus: 2, mars: 2,
    jupiter: 1.5, saturn: 1.5, uranus: 0.5, neptune: 0.5, pluto: 0.5
  };

  function balance(planets) {
    var el = { fire: 0, earth: 0, air: 0, water: 0 };
    var md = { cardinal: 0, fixed: 0, mutable: 0 };
    var total = 0;
    Object.keys(WEIGHT).forEach(function (k) {
      if (!planets[k]) return;
      var s = D.SIGNS[planets[k].sign], w = WEIGHT[k];
      el[s.element] += w; md[s.mode] += w; total += w;
    });
    function pct(o) {
      var out = {};
      Object.keys(o).forEach(function (k) { out[k] = total ? o[k] / total : 0; });
      return out;
    }
    var elp = pct(el), mdp = pct(md);
    return {
      elements: el, modes: md, total: total,
      elementShare: elp, modeShare: mdp,
      strongElement: topKey(elp), weakElement: lowKey(elp),
      strongMode: topKey(mdp), weakMode: lowKey(mdp),
      // «пусто» — это когда доля меньше половины равномерной
      missingElements: Object.keys(elp).filter(function (k) { return elp[k] < 0.125; }),
      missingModes: Object.keys(mdp).filter(function (k) { return mdp[k] < 0.167; })
    };
  }

  function topKey(o) {
    return Object.keys(o).reduce(function (a, b) { return o[b] > o[a] ? b : a; });
  }
  function lowKey(o) {
    return Object.keys(o).reduce(function (a, b) { return o[b] < o[a] ? b : a; });
  }

  function hemispheres(planets) {
    var east = 0, west = 0, north = 0, south = 0, n = 0;
    Object.keys(WEIGHT).forEach(function (k) {
      var p = planets[k];
      if (!p || !p.house) return;
      n++;
      // дома 10-12 и 1-3 — восток; 4-9 — запад
      if (p.house >= 10 || p.house <= 3) east++; else west++;
      // дома 7-12 — над горизонтом
      if (p.house >= 7) south++; else north++;
    });
    return {
      east: east, west: west, above: south, below: north, counted: n,
      leaning: !n ? null
        : east >= n * 0.7 ? 'восток'
        : west >= n * 0.7 ? 'запад'
        : south >= n * 0.7 ? 'верх'
        : north >= n * 0.7 ? 'низ' : null
    };
  }

  /** Управитель карты — хозяин знака асцендента. */
  function chartRuler(chart) {
    var ascSign = D.SIGNS[chart.angles.asc.sign];
    var key = ascSign.ruler;
    var p = chart.planets[key];
    return p ? {
      key: key, ru: D.PLANETS[key].ru, sign: p.signRu, house: p.house,
      why: 'хозяин знака асцендента (' + ascSign.ru + ')'
    } : null;
  }

  /** Пересчёт карты под другую систему домов — без пересчёта эфемериды. */
  function withSystem(chart, system) {
    return build(chart.birth, system);
  }

  root.ArunaNatal = {
    build: build, withSystem: withSystem, lunarPhase: lunarPhase,
    balance: balance, hemispheres: hemispheres, PHASES: PHASES, WEIGHT: WEIGHT
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
