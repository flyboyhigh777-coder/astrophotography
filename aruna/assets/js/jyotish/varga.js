/*
 * Аруна · варга-карты (дробные карты)
 * ------------------------------------------------------------------
 * Раши-карта показывает, ЧТО есть. Варги показывают, НАСКОЛЬКО прочно:
 * граха может стоять в раши в экзальтации и рассыпаться в навамше — и
 * наоборот. Без навамши серьёзный разговор о карте не начинают.
 *
 * Здесь посчитана саптаварга (D1, D2, D3, D7, D9, D12, D30) плюс D10,
 * которую все смотрят по работе. Остальные варги шодашаварги (D16, D20,
 * D24, D27, D40, D45, D60) сознательно не включены: правила их построения
 * в источниках расходятся сильнее, и лучше не считать, чем считать
 * наугад.
 *
 * Правила построения (классические):
 *   D2  хора      — половины по 15°: у нечётных раши первая половина
 *                   Симха, вторая Карка; у чётных наоборот
 *   D3  дреккана  — трети по 10°: сам раши, 5-й от него, 9-й от него
 *   D7  саптамша  — по 30/7°: нечётные считают от себя, чётные с 7-го
 *   D9  навамша   — по 3°20′ подряд по всему кругу
 *   D10 дашамша   — по 3°: нечётные от себя, чётные с 9-го
 *   D12 двадашамша— по 2°30′ от самого раши
 *   D30 тримшамша — неравные доли, отданные Мангале, Шани, Гуру, Будхе
 *                   и Шукре; у чётных раши порядок обратный
 */
(function (root) {
  'use strict';

  var D = root.ArunaData, C = root.ArunaChart, A = root.ArunaAstro;

  function isOdd(rashi) { return rashi % 2 === 0; }   // Меша — нечётный раши

  /* ---------------------------------------------------- правила варг */
  var RULES = {
    D1: { title: 'Раши', about: 'сама жизнь, тело и обстоятельства',
      of: function (rashi) { return rashi; } },

    D2: { title: 'Хора', about: 'достаток и то, как приходят ресурсы',
      of: function (rashi, deg) {
        var first = deg < 15;
        return isOdd(rashi) ? (first ? 4 : 3) : (first ? 3 : 4);
      } },

    D3: { title: 'Дреккана', about: 'братья, сёстры, собственное усилие',
      of: function (rashi, deg) {
        var part = Math.min(2, Math.floor(deg / 10));
        return (rashi + part * 4) % 12;
      } },

    D7: { title: 'Саптамша', about: 'дети и продолжение себя',
      of: function (rashi, deg) {
        var part = Math.min(6, Math.floor(deg / (30 / 7)));
        var start = isOdd(rashi) ? rashi : (rashi + 6) % 12;
        return (start + part) % 12;
      } },

    D9: { title: 'Навамша', about: 'прочность всего: супруг(а), дхарма, вторая половина жизни',
      of: function (rashi, deg) {
        var part = Math.min(8, Math.floor(deg / (30 / 9)));
        return (rashi * 9 + part) % 12;
      } },

    D10: { title: 'Дашамша', about: 'дело, положение, поступки на виду',
      of: function (rashi, deg) {
        var part = Math.min(9, Math.floor(deg / 3));
        var start = isOdd(rashi) ? rashi : (rashi + 8) % 12;
        return (start + part) % 12;
      } },

    D12: { title: 'Двадашамша', about: 'родители и то, что пришло от рода',
      of: function (rashi, deg) {
        var part = Math.min(11, Math.floor(deg / 2.5));
        return (rashi + part) % 12;
      } },

    D30: { title: 'Тримшамша', about: 'беды, слабые места, откуда приходит вред',
      of: function (rashi, deg) {
        // Доли: 5° Мангала, 5° Шани, 8° Гуру, 7° Будха, 5° Шукра.
        // Карка и Симха в тримшамше не появляются вовсе: доли розданы только
        // пяти грахам, у Чандры и Сурьи своей доли нет. Это не ошибка расчёта.
        var odd = [[5, 0], [10, 10], [18, 8], [25, 2], [30, 6]];   // раши-знаки хозяев
        var even = [[5, 1], [12, 5], [20, 11], [25, 9], [30, 7]];
        var table = isOdd(rashi) ? odd : even;
        for (var i = 0; i < table.length; i++) {
          if (deg < table[i][0]) return table[i][1];
        }
        return table[table.length - 1][1];
      } }
  };

  var ORDER = ['D1', 'D2', 'D3', 'D7', 'D9', 'D10', 'D12', 'D30'];

  /* --------------------------------------------- вимшопака (шадварга) */
  // Классические веса шадварги: сумма 20.
  var VIMSHOPAKA_WEIGHT = { D1: 6, D2: 2, D3: 4, D9: 5, D12: 2, D30: 1 };
  // Доля веса по достоинству грахи в этой варге.
  var DIGNITY_SHARE = {
    exalted: 1, moolatrikona: 1, own: 1, friend: 0.75,
    neutral: 0.5, enemy: 0.25, debilitated: 0
  };

  /** Раши грахи в указанной варге. */
  function vargaRashi(code, lon) {
    var rashi = Math.floor(A.norm360(lon) / 30);
    var deg = A.norm360(lon) - rashi * 30;
    return RULES[code].of(rashi, deg);
  }

  /**
   * Варга-карта целиком: позиции девяти грах и лагны.
   * Бхавы в варге считаются от варга-лагны, тоже целыми раши.
   */
  function buildVarga(chart, code) {
    var ascRashi = vargaRashi(code, chart.asc.lon);
    var grahas = {};
    A.GRAHA_ORDER.forEach(function (k) {
      var r = vargaRashi(code, chart.grahas[k].lon);
      grahas[k] = {
        key: k, rashi: r,
        rashiName: D.RASHIS[r].sa,
        bhava: C.bhavaOf(r, ascRashi),
        dignity: C.dignity(k, r, 15),          // градус внутри варги условный
        retro: chart.grahas[k].retro,
        degInRashi: 15, dms: '—',
        vargottama: r === chart.grahas[k].rashi && code !== 'D1'
      };
    });

    var bhavas = [];
    for (var i = 0; i < 12; i++) {
      var r = (ascRashi + i) % 12;
      bhavas.push({
        num: i + 1, rashi: r,
        rashiName: D.RASHIS[r].sa, rashiRu: D.RASHIS[r].ru,
        lord: D.RASHIS[r].lord, meta: D.BHAVAS[i],
        grahas: A.GRAHA_ORDER.filter(function (k) { return grahas[k].rashi === r; })
      });
    }

    return {
      code: code, title: RULES[code].title, about: RULES[code].about,
      asc: { rashi: ascRashi, rashiName: D.RASHIS[ascRashi].sa, dms: '—', lon: 0,
             nakshatraName: '', pada: 0 },
      grahas: grahas, bhavas: bhavas,
      moonRashi: grahas.moon.rashi, moonNakshatra: chart.moonNakshatra,
      jd: chart.jd, ayanamsaDms: chart.ayanamsaDms
    };
  }

  /**
   * Вимшопака-бала по шадварге: 20 очков максимум.
   * Доля веса берётся по достоинству грахи в каждой из шести варг.
   */
  function vimshopaka(chart, key) {
    // Вимшопаку классика считает для семи грах: у Раху и Кету нет владений
    // и достоинств, и подставлять им среднее значило бы рисовать число
    // на пустом месте.
    if (key === 'rahu' || key === 'ketu') return null;
    var total = 0, parts = [];
    Object.keys(VIMSHOPAKA_WEIGHT).forEach(function (code) {
      var r = vargaRashi(code, chart.grahas[key].lon);
      var dg = C.dignity(key, r, 15);
      var share = dg ? (DIGNITY_SHARE[dg.code] !== undefined ? DIGNITY_SHARE[dg.code] : 0.5) : 0.5;
      var got = VIMSHOPAKA_WEIGHT[code] * share;
      total += got;
      parts.push({
        code: code, title: RULES[code].title, rashi: r, rashiName: D.RASHIS[r].sa,
        dignity: dg ? dg.ru : 'не считается', weight: VIMSHOPAKA_WEIGHT[code],
        got: Math.round(got * 100) / 100
      });
    });
    var score = Math.round(total * 100) / 100;
    return {
      key: key, score: score, max: 20, parts: parts,
      band: score >= 15 ? 'очень крепко' : score >= 10 ? 'крепко'
          : score >= 5 ? 'средне' : 'слабо'
    };
  }

  /** Граха стоит в одном раши в D1 и D9 — варготтама, классический признак силы. */
  function vargottama(chart) {
    return A.GRAHA_ORDER.filter(function (k) {
      return vargaRashi('D9', chart.grahas[k].lon) === chart.grahas[k].rashi;
    });
  }

  /** Сводка по всем варгам: где граха в своём знаке или экзальтирует. */
  function summary(chart) {
    return A.GRAHA_ORDER.map(function (k) {
      var strong = [], weak = [];
      ORDER.forEach(function (code) {
        var r = vargaRashi(code, chart.grahas[k].lon);
        var dg = C.dignity(k, r, 15);
        if (!dg) return;
        if (dg.code === 'exalted' || dg.code === 'own' || dg.code === 'moolatrikona') strong.push(code);
        if (dg.code === 'debilitated') weak.push(code);
      });
      return {
        key: k, strongIn: strong, weakIn: weak,
        vargottama: vargaRashi('D9', chart.grahas[k].lon) === chart.grahas[k].rashi,
        vimshopaka: vimshopaka(chart, k)      // null у Раху и Кету
      };
    });
  }

  root.ArunaVarga = {
    ORDER: ORDER, RULES: RULES, VIMSHOPAKA_WEIGHT: VIMSHOPAKA_WEIGHT,
    vargaRashi: vargaRashi, buildVarga: buildVarga,
    vimshopaka: vimshopaka, vargottama: vargottama, summary: summary
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
