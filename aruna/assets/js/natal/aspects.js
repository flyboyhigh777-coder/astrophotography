/*
 * Аруна · западная карта: аспекты и конфигурации
 * ==================================================================
 * Аспект — угловое расстояние между планетами, попавшее в допуск
 * (орбис). Споров об орбисах почти столько же, сколько о домах,
 * поэтому здесь они устроены прозрачно и на виду:
 *
 *   орбис = базовый для аспекта  ×  поправка на участников
 *
 * Базовый — в natal-data.js. Поправка: светила расширяют орбис,
 * дальние планеты и точки сужают. Это распространённый подход, и он
 * лучше плоской таблицы: соединение Солнца с Луной действительно
 * «слышно» дальше, чем соединение Урана с Лилит.
 *
 * Сходящийся аспект (applying) — тот, что ещё только складывается:
 * классика считает его действеннее расходящегося. Определяется по
 * скоростям, а не по знаку разности, иначе ретроградность всё путает.
 */
(function (root) {
  'use strict';

  var D = root.ArunaNatalData;

  function norm360(x) { return ((x % 360) + 360) % 360; }
  function sep(a, b) { var d = Math.abs(norm360(a - b)); return d > 180 ? 360 - d : d; }

  /* Множитель орбиса по участнику. Светила слышно дальше всех. */
  var ORB_FACTOR = {
    sun: 1.35, moon: 1.35,
    mercury: 1, venus: 1, mars: 1, jupiter: 1, saturn: 1,
    uranus: 0.85, neptune: 0.85, pluto: 0.85,
    node: 0.7, southnode: 0.7, lilith: 0.6,
    asc: 1.2, mc: 1.2, dsc: 1.2, ic: 1.2, fortune: 0.7
  };

  function orbFor(aspect, a, b) {
    var fa = ORB_FACTOR[a] === undefined ? 1 : ORB_FACTOR[a];
    var fb = ORB_FACTOR[b] === undefined ? 1 : ORB_FACTOR[b];
    return aspect.orb * (fa + fb) / 2;
  }

  /**
   * Все аспекты карты.
   * @param {Object} chart карта из natal/chart.js
   * @param {Object} [o] {minor:false, angles:true, fortune:false}
   */
  function findAll(chart, o) {
    o = o || {};
    var useMinor = !!o.minor;
    var useAngles = o.angles !== false;

    var points = [];
    D.ASPECTING.forEach(function (k) {
      var p = chart.planets[k];
      if (p) points.push({ key: k, ru: p.meta.ru, lon: p.lon, speed: p.speed, kind: 'planet' });
    });
    if (useAngles) {
      points.push({ key: 'asc', ru: 'Асцендент', lon: chart.angles.asc.lon, speed: 360, kind: 'angle' });
      points.push({ key: 'mc', ru: 'Середина неба', lon: chart.angles.mc.lon, speed: 360, kind: 'angle' });
    }
    if (o.fortune) {
      points.push({ key: 'fortune', ru: 'Жребий Фортуны', lon: chart.fortune.lon, speed: 13, kind: 'point' });
    }

    var list = [];
    for (var i = 0; i < points.length; i++) {
      for (var j = i + 1; j < points.length; j++) {
        var a = points[i], b = points[j];
        // узлы всегда в оппозиции друг к другу — сообщать об этом нечего
        if ((a.key === 'node' && b.key === 'southnode') ||
            (a.key === 'southnode' && b.key === 'node')) continue;
        var found = match(a, b, useMinor);
        if (found) list.push(found);
      }
    }
    list.sort(function (x, y) { return x.orbDiff - y.orbDiff; });
    return {
      list: list,
      byPoint: index(list),
      patterns: patterns(list, chart),
      counts: counts(list)
    };
  }

  function match(a, b, useMinor) {
    var s = sep(a.lon, b.lon);
    for (var i = 0; i < D.ASPECTS.length; i++) {
      var asp = D.ASPECTS[i];
      if (!asp.major && !useMinor) continue;
      var allow = orbFor(asp, a.key, b.key);
      var diff = Math.abs(s - asp.angle);
      if (diff <= allow) {
        return {
          a: a.key, b: b.key, aRu: a.ru, bRu: b.ru,
          aspect: asp.key, ru: asp.ru, glyph: asp.glyph, angle: asp.angle,
          nature: asp.nature, major: asp.major,
          exact: s, orbDiff: diff, orbAllowed: allow,
          strength: 1 - diff / allow,
          applying: applying(a, b, asp),
          // соединение светил с планетой и аспекты к углам весят больше
          weight: weight(a, b, asp, diff, allow)
        };
      }
    }
    return null;
  }

  /**
   * Сходится аспект или расходится. Смотрим, уменьшается ли разница
   * угла со временем: берём производную расстояния по скоростям.
   * Для углов (ASC, MC) понятие не применимо — они «движутся» сутками.
   */
  function applying(a, b, asp) {
    if (a.kind === 'angle' || b.kind === 'angle') return null;
    var d = norm360(b.lon - a.lon);
    var rel = b.speed - a.speed;                  // скорость сближения по долготе
    // текущее отклонение от точного аспекта, со знаком
    var target = asp.angle;
    var cand = [target, 360 - target];
    var best = null;
    cand.forEach(function (t) {
      var delta = norm360(d - t);
      if (delta > 180) delta -= 360;
      if (best === null || Math.abs(delta) < Math.abs(best)) best = delta;
    });
    if (Math.abs(rel) < 1e-9) return null;
    // отклонение уменьшается → сходится
    return (best > 0) === (rel < 0);
  }

  function weight(a, b, asp, diff, allow) {
    var w = (asp.major ? 2 : 1) * (1 - diff / allow);
    if (a.key === 'sun' || a.key === 'moon' || b.key === 'sun' || b.key === 'moon') w *= 1.3;
    if (a.kind === 'angle' || b.kind === 'angle') w *= 1.25;
    return Math.round(w * 100) / 100;
  }

  function index(list) {
    var by = {};
    list.forEach(function (x) {
      (by[x.a] = by[x.a] || []).push(x);
      (by[x.b] = by[x.b] || []).push(x);
    });
    return by;
  }

  function counts(list) {
    var c = { hard: 0, soft: 0, neutral: 0, major: 0, minor: 0, applying: 0, separating: 0 };
    list.forEach(function (x) {
      c[x.nature]++;
      if (x.major) c.major++; else c.minor++;
      if (x.applying === true) c.applying++;
      else if (x.applying === false) c.separating++;
    });
    return c;
  }

  /* ------------------------------------------------- конфигурации */

  /**
   * Фигуры из нескольких аспектов. Они читаются как целое, а не как
   * сумма частей: тау-квадрат — это не «два квадрата и оппозиция»,
   * а один узел напряжения с понятным выходом.
   */
  function patterns(list, chart) {
    var out = [];
    var has = {};
    list.forEach(function (x) {
      has[x.a + '|' + x.b] = x;
      has[x.b + '|' + x.a] = x;
    });
    function link(p, q, type) {
      var x = has[p + '|' + q];
      return x && x.aspect === type ? x : null;
    }
    var keys = {};
    list.forEach(function (x) { keys[x.a] = 1; keys[x.b] = 1; });
    var pts = Object.keys(keys);
    var name = function (k) {
      return k === 'asc' ? 'Асцендент' : k === 'mc' ? 'Середина неба'
           : (D.PLANETS[k] ? D.PLANETS[k].ru : k);
    };

    /* Стеллиум: три и больше тела в одном знаке. Считаем по знаку, а не
       по цепочке соединений: цепочка может растянуться на полкруга. */
    var bySign = {};
    D.ASPECTING.forEach(function (k) {
      var p = chart.planets[k];
      if (!p) return;
      (bySign[p.sign] = bySign[p.sign] || []).push(k);
    });
    Object.keys(bySign).forEach(function (s) {
      if (bySign[s].length >= 3) {
        out.push({
          key: 'stellium', ru: 'Стеллиум', where: D.SIGNS[s].ru,
          points: bySign[s], names: bySign[s].map(name),
          about: 'Три и больше планеты в одном знаке: эта часть карты перевешивает ' +
                 'остальные, и жизнь долго крутится вокруг её тем.'
        });
      }
    });

    for (var i = 0; i < pts.length; i++) {
      for (var j = i + 1; j < pts.length; j++) {
        for (var k = j + 1; k < pts.length; k++) {
          var p = pts[i], q = pts[j], r = pts[k];

          if (link(p, q, 'trine') && link(q, r, 'trine') && link(p, r, 'trine')) {
            out.push({ key: 'grand-trine', ru: 'Большой тригон', points: [p, q, r],
              names: [p, q, r].map(name),
              about: 'Три тригона замкнуты в треугольник: способность, которая даётся ' +
                     'даром и потому редко используется — всё и так неплохо.' });
          }
          if (link(p, q, 'sextile') && link(q, r, 'sextile') && link(p, r, 'trine')) {
            out.push({ key: 'wedge', ru: 'Малый треугольник', points: [p, q, r],
              names: [p, q, r].map(name),
              about: 'Тригон, соединённый двумя секстилями: лёгкость, у которой ' +
                     'есть точка приложения.' });
          }
          // тау-квадрат: оппозиция и общий квадрат к третьей точке
          var opp = link(p, q, 'opposition');
          if (opp && link(p, r, 'square') && link(q, r, 'square')) {
            out.push({ key: 't-square', ru: 'Тау-квадрат', points: [p, q, r], apex: r,
              names: [p, q, r].map(name), apexName: name(r),
              about: 'Две противоположности и точка, куда бьёт их напряжение (' + name(r) + '). ' +
                     'Выход — не в борьбе сторон, а в противоположном градусе: дом ' +
                     'напротив вершины остаётся пустым и там же лежит решение.' });
          }
          if (link(p, q, 'quincunx') && link(p, r, 'quincunx') && link(q, r, 'sextile')) {
            out.push({ key: 'yod', ru: 'Йод', points: [p, q, r], apex: p,
              names: [p, q, r].map(name), apexName: name(p),
              about: 'Два квиконса к одной вершине (' + name(p) + '). Фигура вечной ' +
                     'подстройки: то, что здесь просится, не совмещается напрямую ни с чем.' });
          }
        }
      }
    }

    /* Большой крест: две оппозиции, связанные четырьмя квадратами. */
    for (var a1 = 0; a1 < pts.length; a1++) {
      for (var b1 = a1 + 1; b1 < pts.length; b1++) {
        for (var c1 = b1 + 1; c1 < pts.length; c1++) {
          for (var d1 = c1 + 1; d1 < pts.length; d1++) {
            var P = [pts[a1], pts[b1], pts[c1], pts[d1]];
            var combos = [[0, 1, 2, 3], [0, 2, 1, 3], [0, 3, 1, 2]];
            for (var m = 0; m < combos.length; m++) {
              var o1 = combos[m][0], o2 = combos[m][1], o3 = combos[m][2], o4 = combos[m][3];
              if (link(P[o1], P[o2], 'opposition') && link(P[o3], P[o4], 'opposition') &&
                  link(P[o1], P[o3], 'square') && link(P[o1], P[o4], 'square') &&
                  link(P[o2], P[o3], 'square') && link(P[o2], P[o4], 'square')) {
                out.push({ key: 'grand-cross', ru: 'Большой крест', points: P,
                  names: P.map(name),
                  about: 'Четыре точки, связанные двумя оппозициями и четырьмя квадратами. ' +
                         'Напряжение замкнуто и не имеет лёгкого выхода — зато даёт ' +
                         'выносливость, которой у других нет.' });
              }
            }
          }
        }
      }
    }

    // одинаковых фигур не показываем дважды
    var seen = {}, uniq = [];
    out.forEach(function (x) {
      var id = x.key + ':' + (x.points || []).slice().sort().join(',');
      if (seen[id]) return;
      seen[id] = 1;
      uniq.push(x);
    });
    return uniq;
  }

  /** Самый точный аспект карты — с него обычно и начинают чтение. */
  function tightest(res, n) {
    return res.list.slice(0, n || 3);
  }

  root.ArunaAspects = {
    findAll: findAll, sep: sep, orbFor: orbFor, ORB_FACTOR: ORB_FACTOR, tightest: tightest
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
