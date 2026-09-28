/*
 * Аруна · год вперёд
 * ------------------------------------------------------------------
 * Три вещи, которые реально можно посчитать на год вперёд и которые
 * действительно меняют тон жизни:
 *
 *   1. смены периодов Вимшоттари (антардаши) — с точными датами;
 *   2. переходы Гуру и Шани из раши в раши — это медленные грахи,
 *      и их вход в новую бхаву чувствуется месяцами;
 *   3. саде-сати: где сейчас Шани относительно вашей Луны, когда
 *      семилетний отрезок начался и когда закончится.
 *
 * Никаких «событий»: расчёт говорит, когда меняется обстановка, а не
 * что в этот день случится.
 */
(function (root) {
  'use strict';

  var A = root.ArunaAstro, C = root.ArunaChart, D = root.ArunaData,
      Dsh = root.ArunaDasha, Tz = root.ArunaTz;

  /** Сидерический раши грахи на момент jd. */
  function rashiAt(key, jd) {
    var lon = key === 'rahu' ? A.meanNode(A.jdToJde(jd))
            : key === 'ketu' ? A.norm360(A.meanNode(A.jdToJde(jd)) + 180)
            : key === 'sun'  ? A.sun(A.jdToJde(jd)).lon
            : key === 'moon' ? A.moon(A.jdToJde(jd)).lon
            : A.planet(key, A.jdToJde(jd)).lon;
    return Math.floor(C.toSidereal(lon, C.ayanamsa(jd)) / 30);
  }

  /** Точный момент смены раши между двумя датами (бисекция). */
  function ingressMoment(key, lo, hi) {
    var start = rashiAt(key, lo);
    for (var i = 0; i < 40; i++) {
      var mid = (lo + hi) / 2;
      if (rashiAt(key, mid) === start) lo = mid; else hi = mid;
    }
    return hi;
  }

  /**
   * Переходы медленной грахи из раши в раши в окне [from, to].
   * Шаг в 4 дня достаточен: Гуру и Шани проходят раши за месяцы.
   */
  function ingresses(key, from, to, chart) {
    var out = [], step = 4;
    var prev = rashiAt(key, from), prevJd = from;
    for (var jd = from + step; jd <= to; jd += step) {
      var cur = rashiAt(key, jd);
      if (cur !== prev) {
        var at = ingressMoment(key, prevJd, jd);
        out.push({
          graha: key, jd: at, rashi: cur,
          rashiName: D.RASHIS[cur].sa,
          fromLagna: C.bhavaOf(cur, chart.asc.rashi),
          fromMoon: C.bhavaOf(cur, chart.moonRashi),
          back: ((cur - prev + 12) % 12) === 11      // попятный вход обратно
        });
        prev = cur;
      }
      prevJd = jd;
    }
    return out;
  }

  /**
   * Саде-сати: Шани в 12-й, 1-й или 2-й бхаве от натальной Луны.
   * Ищем границы отрезка помесячным сканированием в обе стороны.
   */
  function sadeSati(chart, jdNow) {
    var moonRashi = chart.moonRashi;
    var inSade = function (jd) {
      var h = C.bhavaOf(rashiAt('saturn', jd), moonRashi);
      return h === 12 || h === 1 || h === 2;
    };
    var phaseName = function (jd) {
      var h = C.bhavaOf(rashiAt('saturn', jd), moonRashi);
      return h === 12 ? 'первая треть: уходит опора привычного'
           : h === 1 ? 'середина: самое плотное время, спрос идёт к самому человеку'
           : h === 2 ? 'последняя треть: восстановление ресурсов и речи'
           : null;
    };

    var now = inSade(jdNow);
    var month = 30.4;
    var start = null, end = null, next = null;

    if (now) {
      var lo = jdNow;
      while (inSade(lo) && jdNow - lo < 12 * 365) lo -= month;
      start = ingressMoment('saturn', lo, lo + month);
      var hi = jdNow;
      while (inSade(hi) && hi - jdNow < 12 * 365) hi += month;
      end = ingressMoment('saturn', hi - month, hi);
    } else {
      var t = jdNow;
      while (!inSade(t) && t - jdNow < 32 * 365) t += month;
      if (t - jdNow < 32 * 365) next = ingressMoment('saturn', t - month, t);
    }

    return {
      active: now,
      phase: now ? phaseName(jdNow) : null,
      start: start, end: end, next: next,
      saturnHouseFromMoon: C.bhavaOf(rashiAt('saturn', jdNow), moonRashi)
    };
  }

  /**
   * Полный обзор на ближайшие months месяцев.
   */
  function yearAhead(chart, jdNow, months) {
    months = months || 12;
    var to = jdNow + months * 30.44;

    // смены антардаш
    var frac = chart.grahas.moon.nakFraction;
    var maha = Dsh.mahadashas(chart.jd, chart.moonNakshatra, frac);
    var changes = [];
    maha.forEach(function (m) {
      if (m.to < jdNow - 1 || m.from > to) return;
      if (m.from >= jdNow && m.from <= to) {
        changes.push({ kind: 'maha', lord: m.lord, jd: m.from, until: m.to });
      }
      Dsh.subPeriods(m).forEach(function (s) {
        if (s.from >= jdNow && s.from <= to) {
          changes.push({ kind: 'antar', lord: s.lord, maha: m.lord, jd: s.from, until: s.to });
        }
      });
    });
    changes.sort(function (a, b) { return a.jd - b.jd; });

    var slow = ingresses('jupiter', jdNow, to, chart)
      .concat(ingresses('saturn', jdNow, to, chart))
      .concat(ingresses('rahu', jdNow, to, chart));
    slow.sort(function (a, b) { return a.jd - b.jd; });

    // если за год смен не случилось, всё равно показываем ближайшую:
    // «ничего не меняется до такого-то» — это тоже ответ
    var nextChange = null;
    if (!changes.length) {
      maha.forEach(function (m) {
        Dsh.subPeriods(m).forEach(function (sp) {
          if (sp.from > to && (!nextChange || sp.from < nextChange.jd)) {
            nextChange = { kind: 'antar', lord: sp.lord, maha: m.lord, jd: sp.from, until: sp.to };
          }
        });
      });
    }

    return {
      from: jdNow, to: to,
      dashaChanges: changes,
      nextChange: nextChange,
      ingresses: slow,
      sadeSati: sadeSati(chart, jdNow),
      current: Dsh.current(chart.jd, chart.moonNakshatra, frac, jdNow)
    };
  }

  root.ArunaForecast = {
    yearAhead: yearAhead, sadeSati: sadeSati, ingresses: ingresses, rashiAt: rashiAt
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
