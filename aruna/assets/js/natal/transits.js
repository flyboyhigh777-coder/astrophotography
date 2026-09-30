/*
 * Аруна · западная карта: транзиты и прогрессии
 * ==================================================================
 * Транзит — планета на небе сегодня в аспекте к точке натальной
 * карты. Прогрессия — символическое движение: один день после
 * рождения приравнивают к одному году жизни (secundum naturam,
 * «вторичные прогрессии»). Два разных языка о будущем, и у обоих
 * одно свойство: они говорят об обстановке, а не о событии.
 *
 * Здесь считаются только медленные транзиты — Юпитер, Сатурн, Уран,
 * Нептун, Плутон и узлы. Быстрые (Луна, Меркурий, Венера, Марс) дают
 * десятки точных аспектов в месяц, и список из них — шум, а не
 * прогноз. Ими занимается страница дня, а не годовой разбор.
 *
 * Дат «когда случится» здесь нет и не будет. Есть даты, когда аспект
 * точен, — это про напряжение, а не про исход.
 */
(function (root) {
  'use strict';

  var A = root.ArunaAstro, D = root.ArunaNatalData, H = root.ArunaHouses, Tz = root.ArunaTz;

  function norm360(x) { return ((x % 360) + 360) % 360; }
  function sep(a, b) { var d = Math.abs(norm360(a - b)); return d > 180 ? 360 - d : d; }

  var SLOW = ['jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
  /* Орбис для транзита уже натального: транзитная планета «включает»
     точку, только подойдя близко. Классика берёт около градуса. */
  var TRANSIT_ORB = { conjunction: 1.5, opposition: 1.5, square: 1.2, trine: 1.2, sextile: 1 };

  /** Долгота транзитной планеты на JD — одно тело, а не вся эфемерида. */
  function lonAt(key, jd) { return A.bodyLongitude(key === 'node' ? 'rahu' : key, jd); }

  /**
   * Трек планеты: долготы на равномерной сетке. Считается один раз на
   * планету, а дальше по нему ищутся все аспекты ко всем точкам карты.
   * Без этого поиск упирался в десятки тысяч лишних вычислений: на
   * каждую пробу считалась вся эфемерида, включая шестидесятичленную
   * Луну, которая здесь вообще не нужна.
   */
  function track(key, jdFrom, jdTo, step) {
    var lons = [], n = Math.ceil((jdTo - jdFrom) / step) + 1;
    for (var i = 0; i < n; i++) lons.push(lonAt(key, jdFrom + i * step));
    return { key: key, from: jdFrom, step: step, lons: lons };
  }

  /** Отклонение от точного аспекта, в пределах ±180. */
  function err(lon, natalLon, angle) {
    return ((norm360(lon - natalLon) - angle + 540) % 360) - 180;
  }

  /**
   * Точные даты аспекта на отрезке. Планета может пройти точку до трёх
   * раз из-за ретроградности — три прохода классика считает тремя
   * заходами одной темы, и показывать надо все.
   *
   * Грубый поиск идёт по готовому треку, уточнение — настоящей
   * функцией: так на весь год выходит несколько десятков вычислений
   * вместо десятков тысяч.
   */
  function exactDates(trk, natalLon, angle, jdFrom, jdTo) {
    var out = [];
    var f = function (t) { return err(lonAt(trk.key, t), natalLon, angle); };
    var prev = err(trk.lons[0], natalLon, angle);
    for (var i = 1; i < trk.lons.length; i++) {
      var cur = err(trk.lons[i], natalLon, angle);
      if ((prev < 0) !== (cur < 0) && Math.abs(prev - cur) < 180) {
        var lo = trk.from + (i - 1) * trk.step, hi = trk.from + i * trk.step;
        var flo = prev;
        for (var k = 0; k < 34; k++) {
          var mid = (lo + hi) / 2, fm = f(mid);
          if ((flo < 0) !== (fm < 0)) hi = mid; else { lo = mid; flo = fm; }
        }
        var jd = (lo + hi) / 2;
        if (jd >= jdFrom && jd <= jdTo) out.push(jd);
      }
      prev = cur;
    }
    return out;
  }

  /**
   * Транзиты медленных планет к натальным точкам на ближайшие месяцы.
   * @param {Object} chart
   * @param {number} jdNow
   * @param {number} months
   */
  function ahead(chart, jdNow, months) {
    months = months || 12;
    var jdTo = jdNow + months * 30.44;
    var targets = [];
    ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn'].forEach(function (k) {
      if (chart.planets[k]) {
        targets.push({ key: k, ru: D.PLANETS[k].ru, lon: chart.planets[k].lon, kind: 'planet' });
      }
    });
    targets.push({ key: 'asc', ru: 'Асцендент', lon: chart.angles.asc.lon, kind: 'angle' });
    targets.push({ key: 'mc', ru: 'Середина неба', lon: chart.angles.mc.lon, kind: 'angle' });

    var events = [];
    SLOW.forEach(function (tk) {
      var trk = track(tk, jdNow, jdTo, 2);
      targets.forEach(function (tgt) {
        D.ASPECTS.forEach(function (asp) {
          if (!asp.major) return;
          var orb = TRANSIT_ORB[asp.key];
          if (!orb) return;
          [asp.angle, asp.angle === 0 || asp.angle === 180 ? null : 360 - asp.angle]
            .filter(function (x) { return x !== null; })
            .forEach(function (ang) {
              var dates = exactDates(trk, tgt.lon, ang, jdNow, jdTo);
              dates.forEach(function (jd) {
                events.push({
                  transit: tk, transitRu: D.PLANETS[tk].ru,
                  target: tgt.key, targetRu: tgt.ru, targetKind: tgt.kind,
                  aspect: asp.key, ru: asp.ru, glyph: asp.glyph,
                  nature: asp.nature, jd: jd,
                  house: chart.houses.cusps ? H.houseOf(tgt.lon, chart.houses.cusps) : null
                });
              });
            });
        });
      });
    });
    events.sort(function (a, b) { return a.jd - b.jd; });

    // три прохода одного и того же аспекта — это одна тема; помечаем
    var seen = {};
    events.forEach(function (e) {
      var id = e.transit + e.aspect + e.target;
      seen[id] = (seen[id] || 0) + 1;
      e.pass = seen[id];
    });
    events.forEach(function (e) {
      var id = e.transit + e.aspect + e.target;
      e.passes = seen[id];
    });

    return {
      from: jdNow, to: jdTo, events: events,
      ingresses: ingresses(chart, jdNow, jdTo),
      returns: returns(chart, jdNow, jdTo)
    };
  }

  /** Переходы медленных планет из знака в знак и из дома в дом. */
  function ingresses(chart, jdFrom, jdTo) {
    var out = [];
    SLOW.concat(['node']).forEach(function (k) {
      var step = 3, prev = lonAt(k, jdFrom);
      for (var t = jdFrom + step; t <= jdTo; t += step) {
        var cur = lonAt(k, t);
        if (Math.floor(prev / 30) !== Math.floor(cur / 30) && Math.abs(cur - prev) < 30) {
          var lo = t - step, hi = t, s0 = Math.floor(prev / 30);
          for (var i = 0; i < 40; i++) {
            var mid = (lo + hi) / 2;
            if (Math.floor(lonAt(k, mid) / 30) === s0) lo = mid; else hi = mid;
          }
          var jd = (lo + hi) / 2, sign = Math.floor(lonAt(k, jd + 0.5) / 30);
          out.push({
            key: k, ru: D.PLANETS[k].ru, jd: jd, sign: sign, signRu: D.SIGNS[sign].ru,
            house: chart.houses.cusps ? H.houseOf(sign * 30 + 1, chart.houses.cusps) : null
          });
        }
        prev = cur;
      }
    });
    out.sort(function (a, b) { return a.jd - b.jd; });
    return out;
  }

  /** Возвращения: Солнца (день рождения) и Сатурна (раз в 29 лет). */
  function returns(chart, jdFrom, jdTo) {
    var out = [];
    [['sun', 'Солнечное возвращение', 'соляр: год от дня рождения до дня рождения'],
     ['jupiter', 'Возвращение Юпитера', 'раз в 12 лет: смена круга и масштаба'],
     ['saturn', 'Возвращение Сатурна', 'раз в 29 лет: срок, когда спрашивают по-взрослому']
    ].forEach(function (row) {
      var k = row[0];
      var dates = exactDates(track(k, jdFrom, jdTo, k === 'sun' ? 1 : 3),
                             chart.planets[k].lon, 0, jdFrom, jdTo);
      dates.forEach(function (jd) {
        out.push({ key: k, ru: row[1], about: row[2], jd: jd });
      });
    });
    out.sort(function (a, b) { return a.jd - b.jd; });
    return out;
  }

  /* ------------------------------------------------------ прогрессии */

  /**
   * Вторичные прогрессии: день за год. Возраст в годах превращается в
   * столько же суток после рождения — и карта на этот момент читается
   * как «внутренний возраст» человека.
   */
  function progressed(chart, jdNow, system) {
    var years = (jdNow - chart.jd) / 365.2422;
    var jdProg = chart.jd + years;                  // сутки за год
    var pos = A.tropicalPositions(jdProg);
    var am = A.ascendantMc(jdProg, chart.lat, chart.lon);
    var out = { years: years, jd: jdProg, planets: {}, asc: null, mc: null };
    ['sun', 'moon', 'mercury', 'venus', 'mars'].forEach(function (k) {
      var lon = norm360(pos[k].lon);
      var s = D.signOf(lon);
      out.planets[k] = {
        key: k, ru: D.PLANETS[k].ru, lon: lon, sign: s, signRu: D.SIGNS[s].ru,
        signIn: D.SIGNS[s].in, deg: D.degInSign(lon), dms: D.dms(D.degInSign(lon)),
        retro: pos[k].speed < 0,
        house: chart.houses.cusps ? H.houseOf(lon, chart.houses.cusps) : null,
        natalSign: chart.planets[k].sign,
        moved: D.signOf(lon) !== chart.planets[k].sign
      };
    });
    var hs = H.houses({ ramc: am.lst, lat: chart.lat, eps: am.obliquity,
                        asc: am.asc, mc: am.mc, system: system || 'placidus' });
    out.asc = { lon: am.asc, sign: D.signOf(am.asc), signRu: D.SIGNS[D.signOf(am.asc)].ru,
                signIn: D.SIGNS[D.signOf(am.asc)].in, dms: D.dms(D.degInSign(am.asc)) };
    out.mc = { lon: am.mc, sign: D.signOf(am.mc), signRu: D.SIGNS[D.signOf(am.mc)].ru,
               signIn: D.SIGNS[D.signOf(am.mc)].in, dms: D.dms(D.degInSign(am.mc)) };
    out.houses = hs;

    /* Прогрессивная Луна обходит круг за 27-28 лет и меняет знак раз в
       два с лишним года — самый читаемый ритм в прогрессиях. */
    var pm = norm360(pos.moon.lon);
    out.moonPhase = lunarPhaseProg(norm360(pos.sun.lon), pm);
    return out;
  }

  function lunarPhaseProg(sunLon, moonLon) {
    var d = norm360(moonLon - sunLon);
    var N = root.ArunaNatal;
    return N ? N.lunarPhase(sunLon, moonLon) : { angle: d };
  }

  /** Когда прогрессивная Луна сменит знак — ближайшая дата. */
  function nextProgressedMoonSign(chart, jdNow) {
    var step = 30;                                   // суток «настоящего» времени
    var cur = progressed(chart, jdNow).planets.moon.sign;
    for (var t = jdNow + step; t < jdNow + 365.25 * 4; t += step) {
      var s = progressed(chart, t).planets.moon.sign;
      if (s !== cur) {
        var lo = t - step, hi = t;
        for (var k = 0; k < 30; k++) {
          var mid = (lo + hi) / 2;
          if (progressed(chart, mid).planets.moon.sign === cur) lo = mid; else hi = mid;
        }
        var jd = (lo + hi) / 2;
        return { jd: jd, from: cur, to: s, fromRu: D.SIGNS[cur].ru, toRu: D.SIGNS[s].ru };
      }
    }
    return null;
  }

  root.ArunaTransits = {
    ahead: ahead, ingresses: ingresses, returns: returns, exactDates: exactDates,
    progressed: progressed, nextProgressedMoonSign: nextProgressedMoonSign,
    SLOW: SLOW, TRANSIT_ORB: TRANSIT_ORB
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
