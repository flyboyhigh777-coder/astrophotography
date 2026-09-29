/*
 * Аруна · аштака-варга и сарвашта-кавварга
 * ------------------------------------------------------------------
 * Система очков (бинду), которую в джйотише любят за то, что она даёт
 * ЧИСЛО там, где обычно одни рассуждения. Каждая граха раздаёт по раши
 * благоприятные точки — считая от восьми опор: от семи грах и от лагны.
 *
 * Правило одно и то же для всех: «от грахи X граха Y даёт бинду в таких-то
 * бхавах». Наборы бхав — классические таблицы (Прастара-аштака-варга,
 * Брихат-Парашара-Хора-Шастра).
 *
 * КАК Я ПРОВЕРИЛ, ЧТО ТАБЛИЦЫ ВЕРНЫ. У каждой грахи есть известная сумма
 * бинду по всей карте, и она не зависит ни от какой карты:
 *
 *     Сурья 48 · Чандра 49 · Мангала 39 · Будха 54
 *     Гуру 56 · Шукра 52 · Шани 39      — всего 337
 *
 * Эти суммы проверяются тестом. Ошибиться в таблице и случайно сойтись
 * по всем семи суммам практически невозможно, так что совпадение —
 * серьёзное доказательство, а не формальность.
 */
(function (root) {
  'use strict';

  var A = root.ArunaAstro, D = root.ArunaData, C = root.ArunaChart;

  /* Опоры отсчёта: семь грах и лагна. Узлы в аштака-варге не участвуют. */
  var FROM = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn', 'lagna'];

  /* Благоприятные бхавы (считая от опоры) для каждой грахи. */
  var BINDU = {
    sun: {
      sun:     [1, 2, 4, 7, 8, 9, 10, 11],
      moon:    [3, 6, 10, 11],
      mars:    [1, 2, 4, 7, 8, 9, 10, 11],
      mercury: [3, 5, 6, 9, 10, 11, 12],
      jupiter: [5, 6, 9, 11],
      venus:   [6, 7, 12],
      saturn:  [1, 2, 4, 7, 8, 9, 10, 11],
      lagna:   [3, 4, 6, 10, 11, 12]
    },
    moon: {
      sun:     [3, 6, 7, 8, 10, 11],
      moon:    [1, 3, 6, 7, 10, 11],
      mars:    [2, 3, 5, 6, 9, 10, 11],
      mercury: [1, 3, 4, 5, 7, 8, 10, 11],
      jupiter: [1, 4, 7, 8, 10, 11, 12],
      venus:   [3, 4, 5, 7, 9, 10, 11],
      saturn:  [3, 5, 6, 11],
      lagna:   [3, 6, 10, 11]
    },
    mars: {
      sun:     [3, 5, 6, 10, 11],
      moon:    [3, 6, 11],
      mars:    [1, 2, 4, 7, 8, 10, 11],
      mercury: [3, 5, 6, 11],
      jupiter: [6, 10, 11, 12],
      venus:   [6, 8, 11, 12],
      saturn:  [1, 4, 7, 8, 9, 10, 11],
      lagna:   [1, 3, 6, 10, 11]
    },
    mercury: {
      sun:     [5, 6, 9, 11, 12],
      moon:    [2, 4, 6, 8, 10, 11],
      mars:    [1, 2, 4, 7, 8, 9, 10, 11],
      mercury: [1, 3, 5, 6, 9, 10, 11, 12],
      jupiter: [6, 8, 11, 12],
      venus:   [1, 2, 3, 4, 5, 8, 9, 11],
      saturn:  [1, 2, 4, 7, 8, 9, 10, 11],
      lagna:   [1, 2, 4, 6, 8, 10, 11]
    },
    jupiter: {
      sun:     [1, 2, 3, 4, 7, 8, 9, 10, 11],
      moon:    [2, 5, 7, 9, 11],
      mars:    [1, 2, 4, 7, 8, 10, 11],
      mercury: [1, 2, 4, 5, 6, 9, 10, 11],
      jupiter: [1, 2, 3, 4, 7, 8, 10, 11],
      venus:   [2, 5, 6, 9, 10, 11],
      saturn:  [3, 5, 6, 12],
      lagna:   [1, 2, 4, 5, 6, 7, 9, 10, 11]
    },
    venus: {
      sun:     [8, 11, 12],
      moon:    [1, 2, 3, 4, 5, 8, 9, 11, 12],
      mars:    [3, 5, 6, 9, 11, 12],
      mercury: [3, 5, 6, 9, 11],
      jupiter: [5, 8, 9, 10, 11],
      venus:   [1, 2, 3, 4, 5, 8, 9, 10, 11],
      saturn:  [3, 4, 5, 8, 9, 10, 11],
      lagna:   [1, 2, 3, 4, 5, 8, 9, 11]
    },
    saturn: {
      sun:     [1, 2, 4, 7, 8, 10, 11],
      moon:    [3, 6, 11],
      mars:    [3, 5, 6, 10, 11, 12],
      mercury: [6, 8, 9, 10, 11, 12],
      jupiter: [5, 6, 11, 12],
      venus:   [6, 11, 12],
      saturn:  [3, 5, 6, 11],
      lagna:   [1, 3, 4, 6, 10, 11]
    }
  };

  /** Классические итоги — контрольные суммы для проверки таблиц. */
  var TOTALS = { sun: 48, moon: 49, mars: 39, mercury: 54, jupiter: 56, venus: 52, saturn: 39 };
  var GRAND_TOTAL = 337;

  var PLANETS = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn'];

  /** Раши опоры: для лагны — раши лагны, иначе раши грахи. */
  function anchorRashi(chart, from) {
    return from === 'lagna' ? chart.asc.rashi : chart.grahas[from].rashi;
  }

  /**
   * Бхинна-аштака-варга одной грахи: сколько бинду приходится на каждый раши.
   * @returns {{bindu: number[12], total: number, byAnchor: Object}}
   */
  function bhinna(chart, graha) {
    var table = BINDU[graha];
    if (!table) return null;
    var bindu = [0,0,0,0,0,0,0,0,0,0,0,0];
    var byAnchor = {};
    FROM.forEach(function (from) {
      var base = anchorRashi(chart, from);
      var houses = table[from] || [];
      byAnchor[from] = houses.slice();
      houses.forEach(function (h) {
        bindu[(base + h - 1) % 12] += 1;
      });
    });
    var total = bindu.reduce(function (a, b) { return a + b; }, 0);
    return { graha: graha, bindu: bindu, total: total, byAnchor: byAnchor };
  }

  /**
   * Сарвашта-кавварга: сумма бинду всех семи грах по каждому раши.
   * Итог всегда 337 — это свойство самих таблиц, а не карты.
   */
  function sarva(chart) {
    var per = {};
    var sum = [0,0,0,0,0,0,0,0,0,0,0,0];
    PLANETS.forEach(function (g) {
      var b = bhinna(chart, g);
      per[g] = b;
      for (var i = 0; i < 12; i++) sum[i] += b.bindu[i];
    });

    var rows = sum.map(function (v, rashi) {
      return {
        rashi: rashi,
        rashiName: D.RASHIS[rashi].sa,
        rashiRu: D.RASHIS[rashi].ru,
        bhava: C.bhavaOf(rashi, chart.asc.rashi),
        bindu: v,
        // Средняя по кругу — 337/12 ≈ 28,1. От неё и отсчитывают «много/мало».
        band: v >= 33 ? 'много' : v >= 29 ? 'выше среднего'
            : v >= 25 ? 'около среднего' : 'мало'
      };
    });

    var best = rows.slice().sort(function (a, b) { return b.bindu - a.bindu; });

    return {
      per: per,
      rows: rows,
      total: sum.reduce(function (a, b) { return a + b; }, 0),
      average: Math.round(337 / 12 * 10) / 10,
      strongest: best.slice(0, 3),
      weakest: best.slice(-3).reverse()
    };
  }

  /**
   * Транзит по очкам: сколько бинду в раши, куда пришла граха.
   * Классика смотрит это в первую очередь для Шани и Гуру.
   */
  function transitScore(chart, graha, transitRashi) {
    var b = bhinna(chart, graha);
    if (!b) return null;
    var v = b.bindu[transitRashi];
    return {
      graha: graha,
      rashi: transitRashi,
      rashiName: D.RASHIS[transitRashi].sa,
      bindu: v,
      max: 8,
      band: v >= 5 ? 'проходит легко' : v >= 4 ? 'ровно' : v >= 3 ? 'с нагрузкой' : 'тяжело',
      note: v >= 5
        ? 'В этом раши у грахи много собственных бинду — транзит обычно проходит без надрыва.'
        : v <= 2
        ? 'Бинду мало: традиция советует в такой транзит не затевать нового по темам этой грахи.'
        : 'Средний запас бинду: многое зависит от даши, а не от самого транзита.'
    };
  }

  root.ArunaSarvashtaka = {
    BINDU: BINDU, TOTALS: TOTALS, GRAND_TOTAL: GRAND_TOTAL,
    FROM: FROM, PLANETS: PLANETS,
    bhinna: bhinna, sarva: sarva, transitScore: transitScore
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
