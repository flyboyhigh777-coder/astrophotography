/*
 * Аруна · подсказка по времени рождения (ректификация)
 * ------------------------------------------------------------------
 * ЧЕСТНО О ТОМ, ЧТО ЭТО. Настоящая ректификация — работа астролога на
 * несколько часов, и однозначного ответа она не даёт почти никогда.
 * Здесь считается более скромная вещь: перебор времени по минутам и
 * проверка каждого варианта на согласие с уже случившимися событиями.
 *
 * Логика проста и проверяема. Событие относится к своим бхавам (свадьба —
 * седьмая, работа — десятая, переезд — четвёртая). Если в год события шла
 * даша грахи, которая владеет такой бхавой или стоит в ней, и если по ней
 * же проходили Гуру или Шани — этот вариант времени получает очки.
 *
 * Чего расчёт НЕ делает: не утверждает, что нашёл верное время. Он
 * сужает круг и показывает, какая лагна согласуется с вашей жизнью лучше
 * остальных. Решение остаётся за человеком и за живым астрологом.
 */
(function (root) {
  'use strict';

  var A = root.ArunaAstro, C = root.ArunaChart, D = root.ArunaData,
      Dsh = root.ArunaDasha, Tz = root.ArunaTz;

  /* --------------------------------------------------------- события */
  var EVENTS = [
    { id: 'marriage', title: 'Свадьба или начало серьёзных отношений',
      bhavas: [7, 2, 11], about: 'седьмая бхава — партнёр, вторая — семья, одиннадцатая — обретение' },
    { id: 'child', title: 'Рождение ребёнка',
      bhavas: [5, 9, 2], about: 'пятая бхава — дети, девятая — продолжение дхармы' },
    { id: 'job', title: 'Новая работа или своё дело',
      bhavas: [10, 6, 11], about: 'десятая — дело, шестая — служба, одиннадцатая — доход' },
    { id: 'move', title: 'Переезд в другой город или страну',
      bhavas: [4, 12, 3], about: 'четвёртая — дом, двенадцатая — чужие края, третья — движение' },
    { id: 'loss', title: 'Уход близкого человека',
      bhavas: [8, 4, 9, 12], about: 'восьмая — переход, четвёртая и девятая — мать и отец' },
    { id: 'illness', title: 'Тяжёлая болезнь или травма',
      bhavas: [6, 8, 1], about: 'шестая — болезни, восьмая — кризис, первая — тело' },
    { id: 'study', title: 'Поступление или начало большой учёбы',
      bhavas: [4, 5, 9], about: 'четвёртая — образование, пятая — способность, девятая — учитель' },
    { id: 'money', title: 'Крупная покупка или заметный доход',
      bhavas: [2, 11, 4], about: 'вторая — накопленное, одиннадцатая — приход, четвёртая — недвижимость' }
  ];

  function eventById(id) {
    for (var i = 0; i < EVENTS.length; i++) if (EVENTS[i].id === id) return EVENTS[i];
    return null;
  }

  function lordOf(chart, n) {
    return D.RASHIS[(chart.asc.rashi + n - 1) % 12].lord;
  }

  /* ------------------------------------------- небо на дату события */
  /** Медленные грахи на дату события: от времени рождения они не зависят. */
  function eventSky(jd) {
    var ayan = C.ayanamsa(jd);
    var out = {};
    ['jupiter', 'saturn'].forEach(function (k) {
      out[k] = Math.floor(C.toSidereal(A.planet(k, A.jdToJde(jd)).lon, ayan) / 30);
    });
    out.rahu = Math.floor(C.toSidereal(A.meanNode(A.jdToJde(jd)), ayan) / 30);
    return out;
  }

  /* ---------------------------------------------------------- оценка */
  var MAX_PER_EVENT = 16;

  function scoreEvent(chart, ev, sky, frac) {
    var meta = eventById(ev.type);
    if (!meta) return { score: 0, why: [] };
    var bh = meta.bhavas;
    var score = 0, why = [];

    var d = Dsh.current(chart.jd, chart.moonNakshatra, frac, ev.jd);
    if (d) {
      [['махадаша', d.maha, 3], ['антардаша', d.antar, 3]].forEach(function (p) {
        var label = p[0], lord = p[1].lord, w = p[2];
        var isNode = lord === 'rahu' || lord === 'ketu';
        if (!isNode) {
          for (var i = 0; i < bh.length; i++) {
            if (lordOf(chart, bh[i]) === lord) {
              score += w;
              why.push({ w: w, t: label + ' ' + D.GRAHAS[lord].sa + ' — хозяин ' + bh[i] + '-й бхавы' });
              break;
            }
          }
        }
        var at = chart.grahas[lord].bhava;
        if (bh.indexOf(at) >= 0) {
          score += w - 1;
          why.push({ w: w - 1, t: label + ' ' + D.GRAHAS[lord].sa + ' стоит в ' + at + '-й бхаве' });
        }
      });
    }

    ['jupiter', 'saturn'].forEach(function (k) {
      var r = sky[k];
      var fromLagna = C.bhavaOf(r, chart.asc.rashi);
      if (bh.indexOf(fromLagna) >= 0) {
        score += 2;
        why.push({ w: 2, t: D.GRAHAS[k].sa + ' шёл по ' + fromLagna + '-й бхаве от лагны' });
      }
      var fromMoon = C.bhavaOf(r, chart.moonRashi);
      if (bh.indexOf(fromMoon) >= 0) {
        score += 1;
        why.push({ w: 1, t: D.GRAHAS[k].sa + ' шёл по ' + fromMoon + '-й бхаве от Луны' });
      }
    });

    return { score: score, why: why, max: MAX_PER_EVENT };
  }

  /* ------------------------------------------------------------ перебор */
  function candidateAt(birth, minutes, events, skies) {
    var d = birth.date.split('-').map(Number);
    var utcMs = Tz.zonedToUtcMs(d[0], d[1], d[2], 0, 0, birth.place.tz) + minutes * 60000;
    var chart = C.buildChart({
      jd: Tz.msToJd(utcMs), lat: birth.place.lat, lon: birth.place.lon,
      tz: birth.place.tz, label: birth.place.name
    });
    var frac = chart.grahas.moon.nakFraction;

    var total = 0, per = [];
    events.forEach(function (ev, i) {
      var r = scoreEvent(chart, ev, skies[i], frac);
      total += r.score;
      per.push({ event: ev, score: r.score, why: r.why });
    });

    return {
      minutes: minutes, utcMs: utcMs, chart: chart,
      lagna: chart.asc.rashi, lagnaName: chart.asc.rashiName,
      lagnaDms: chart.asc.dms,
      moonNak: chart.moonNakshatra,
      score: total, per: per,
      max: events.length * MAX_PER_EVENT
    };
  }

  /**
   * Перебор времени рождения.
   * @param {Object} o {birth: {date, place}, events: [{type, date}],
   *                    fromMinutes, toMinutes, coarseStep, fineStep}
   * @returns {Object} результат с кандидатами, группировкой по лагне и разбросом
   */
  function run(o) {
    var events = (o.events || []).filter(function (e) { return e.type && e.date; })
      .map(function (e) {
        var p = e.date.split('-').map(Number);
        return { type: e.type, date: e.date, jd: A.julianDay(p[0], p[1], p[2], 12) };
      });
    if (!events.length) return null;

    var skies = events.map(function (e) { return eventSky(e.jd); });

    var from = o.fromMinutes === undefined ? 0 : o.fromMinutes;
    var to = o.toMinutes === undefined ? 24 * 60 : o.toMinutes;
    var coarse = o.coarseStep || 10;
    var fine = o.fineStep || 2;

    // первый проход — грубый
    var rough = [];
    for (var m = from; m < to; m += coarse) {
      rough.push(candidateAt(o.birth, m, events, skies));
    }
    var best = rough.reduce(function (a, b) { return b.score > a.score ? b : a; }, rough[0]);

    // второй проход — мелкий вокруг лучших зон
    var peaks = rough.filter(function (c) { return c.score >= best.score - 2; });
    var fineList = [];
    peaks.forEach(function (p) {
      for (var m = Math.max(from, p.minutes - coarse); m <= Math.min(to, p.minutes + coarse); m += fine) {
        fineList.push(candidateAt(o.birth, m, events, skies));
      }
    });

    // Один и тот же момент мог попасть в мелкий проход дважды (окна вокруг
    // соседних пиков перекрываются) — оставляем по одному варианту на минуту.
    var seenMinutes = {};
    var all = rough.concat(fineList).filter(function (c) {
      if (seenMinutes[c.minutes]) return false;
      seenMinutes[c.minutes] = true;
      return true;
    });
    all.sort(function (a, b) { return b.score - a.score || a.minutes - b.minutes; });

    // Группировка по лагне. Лагна идёт непрерывными отрезками, поэтому
    // собираем именно отрезки, а не минимум с максимумом: иначе лагна,
    // которая захватывает полночь, показала бы окно «весь день».
    var runs = [];
    rough.forEach(function (c) {
      var last = runs[runs.length - 1];
      if (last && last.lagna === c.lagna) {
        last.to = c.minutes + coarse;
        last.best = Math.max(last.best, c.score);
        last.n += 1; last.sum += c.score;
      } else {
        runs.push({ lagna: c.lagna, lagnaName: c.lagnaName,
                    from: c.minutes, to: c.minutes + coarse,
                    best: c.score, n: 1, sum: c.score });
      }
    });
    // отрезок через полночь: если день просмотрен целиком и края — одна лагна
    if (runs.length > 1 && from === 0 && to >= 24 * 60 &&
        runs[0].lagna === runs[runs.length - 1].lagna) {
      var head = runs.shift();
      var tail = runs[runs.length - 1];
      tail.to = head.to + 24 * 60;              // «23:10 — 00:40» вместо «00:00 — 00:00»
      tail.best = Math.max(tail.best, head.best);
      tail.n += head.n; tail.sum += head.sum;
    }
    var byLagna = runs.map(function (g) {
      g.avg = Math.round(g.sum / g.n * 10) / 10;
      return g;
    }).sort(function (a, b) { return b.best - a.best || b.avg - a.avg; });

    var scores = rough.map(function (c) { return c.score; });
    var max = Math.max.apply(null, scores), min = Math.min.apply(null, scores);
    var mean = scores.reduce(function (a, b) { return a + b; }, 0) / scores.length;

    return {
      events: events,
      candidates: all.slice(0, 12),
      byLagna: byLagna,
      best: all[0],
      maxPossible: events.length * MAX_PER_EVENT,
      spread: { max: max, min: min, mean: Math.round(mean * 10) / 10 },
      // Насколько ответ вообще различим: если лучший вариант лишь немного
      // лучше среднего, перебор ничего не показал, и честно так и сказать.
      confident: max - mean >= Math.max(3, events.length * 1.5),
      checked: rough.length + fineList.length
    };
  }

  root.ArunaRectify = {
    EVENTS: EVENTS, eventById: eventById, run: run,
    scoreEvent: scoreEvent, eventSky: eventSky, MAX_PER_EVENT: MAX_PER_EVENT
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
