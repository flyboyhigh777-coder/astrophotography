/*
 * Аруна · западная карта: достоинства планет
 * ==================================================================
 * Эссенциальные достоинства — самая старая и самая проверяемая часть
 * западной астрологии: это таблицы, а не мнения. Планета в своём
 * знаке действует свободно, в изгнании — через силу, в падении —
 * не своим способом. Пять уровней, от сильного к слабому:
 *
 *   обитель (5 очков) — знак, которым планета управляет
 *   экзальтация (4)   — знак, где её природа усилена
 *   тритон (3)        — стихия, по секте: день, ночь, участвующий
 *   терм (2)          — египетские границы внутри знака
 *   декан/лик (1)     — халдейский ряд по десяти градусам
 *
 * Планета без единого достоинства называется перегрин: она не
 * опирается ни на что своё. Это не приговор — это про способ.
 *
 * Альмутен — планета, набравшая больше всех очков в точке. Считается
 * для градуса, чаще всего для асцендента: классика видит в нём
 * распорядителя всей карты.
 *
 * Акцидентальные достоинства — про положение, а не про знак: угловой
 * дом, скорость, сожжение, направление движения. Их складывают с
 * эссенциальными только на глаз: единой шкалы у традиции нет, и
 * делать вид, что есть, мы не будем.
 */
(function (root) {
  'use strict';

  var D = root.ArunaNatalData;

  function norm360(x) { return ((x % 360) + 360) % 360; }

  /** Управитель знака по номеру. */
  function rulerOf(sign) { return D.SIGNS[sign].ruler; }

  /** Терм, в который попал градус. */
  function termOf(sign, deg) {
    var t = D.TERMS[D.SIGNS[sign].key];
    for (var i = 0; i < t.length; i++) if (deg < t[i][0]) return t[i][1];
    return t[t.length - 1][1];
  }

  /** Декан (лик) по халдейскому ряду: 36 декад подряд от Овна. */
  function faceOf(sign, deg) {
    var idx = sign * 3 + Math.floor(deg / 10);
    return D.CHALDEAN[idx % 7];
  }

  /** Тритон стихии: дневной, ночной или участвующий. */
  function triplicityOf(sign, byDay) {
    var tri = D.TRIPLICITY[D.SIGNS[sign].element];
    return byDay ? tri[0] : tri[1];
  }

  function participating(sign) {
    return D.TRIPLICITY[D.SIGNS[sign].element][2];
  }

  /**
   * Все достоинства и слабости планеты в точке.
   * @param {string} key   планета
   * @param {number} lon   долгота
   * @param {boolean} byDay дневная ли карта
   */
  function essential(key, lon, byDay) {
    var sign = D.signOf(lon), deg = D.degInSign(lon);
    var s = D.SIGNS[sign];
    var have = [], score = 0;

    if (s.ruler === key) { have.push({ kind: 'ruler', ru: 'обитель', score: 5 }); score += 5; }
    if (s.exalt === key) { have.push({ kind: 'exalt', ru: 'экзальтация', score: 4 }); score += 4; }
    if (triplicityOf(sign, byDay) === key) {
      have.push({ kind: 'triplicity', ru: byDay ? 'тритон (дневной)' : 'тритон (ночной)', score: 3 });
      score += 3;
    } else if (participating(sign) === key) {
      have.push({ kind: 'triplicity', ru: 'тритон (участвующий)', score: 3 });
      score += 3;
    }
    if (termOf(sign, deg) === key) { have.push({ kind: 'term', ru: 'терм', score: 2 }); score += 2; }
    if (faceOf(sign, deg) === key) { have.push({ kind: 'face', ru: 'декан', score: 1 }); score += 1; }

    var weak = [];
    if (s.detriment === key) weak.push({ kind: 'detriment', ru: 'изгнание', score: -5 });
    if (s.fall === key) weak.push({ kind: 'fall', ru: 'падение', score: -4 });

    var total = score + weak.reduce(function (a, w) { return a + w.score; }, 0);
    return {
      key: key, sign: sign, signRu: s.ru, signIn: s.in, deg: deg,
      dignities: have, debilities: weak,
      score: score, total: total,
      peregrine: have.length === 0 && weak.length === 0,
      // краткий вердикт для таблицы
      band: total >= 5 ? 'сильна' : total >= 1 ? 'с опорой'
          : total === 0 ? 'перегрин' : total >= -4 ? 'без опоры' : 'слаба'
    };
  }

  /**
   * Альмутен точки: кто набирает больше очков в этом градусе.
   * Считают для асцендента, для Солнца, для жребиев — всюду, где
   * нужен «распорядитель».
   */
  function almuten(lon, byDay) {
    var sign = D.signOf(lon), deg = D.degInSign(lon);
    var tally = {};
    function add(k, n, why) {
      if (!k) return;
      if (!tally[k]) tally[k] = { key: k, score: 0, why: [] };
      tally[k].score += n;
      tally[k].why.push(why);
    }
    add(rulerOf(sign), D.DIGNITY_SCORE.ruler, 'обитель');
    add(D.SIGNS[sign].exalt, D.DIGNITY_SCORE.exalt, 'экзальтация');
    add(triplicityOf(sign, byDay), D.DIGNITY_SCORE.triplicity, 'тритон');
    add(termOf(sign, deg), D.DIGNITY_SCORE.term, 'терм');
    add(faceOf(sign, deg), D.DIGNITY_SCORE.face, 'декан');
    var list = Object.keys(tally).map(function (k) { return tally[k]; })
      .sort(function (a, b) { return b.score - a.score; });
    return { winner: list[0] || null, list: list };
  }

  /* --------------------------------------- акцидентальные достоинства */

  /*
   * Положение планеты в карте, а не в знаке. Здесь традиция расходится
   * в мелочах, и вместо выдуманной единой шкалы мы просто перечисляем
   * то, что нашли, с кратким «за» или «против».
   */
  function accidental(chart, key) {
    var p = chart.planets[key];
    if (!p) return null;
    var out = [];
    var h = p.house;

    if (h === 1 || h === 4 || h === 7 || h === 10) {
      out.push({ good: true, ru: 'в угловом доме', why: 'угловой дом даёт планете голос: её видно в жизни сразу' });
    } else if (h === 2 || h === 5 || h === 8 || h === 11) {
      out.push({ good: null, ru: 'в последующем доме', why: 'действует ровно, но не первой' });
    } else if (h) {
      out.push({ good: false, ru: 'в падающем доме', why: 'проявляется через обстоятельства, а не напрямую' });
    }
    if (h === 6 || h === 8 || h === 12) {
      out.push({ good: false, ru: 'в трудном доме', why: 'классика зовёт шестой, восьмой и двенадцатый тёмными: там планете нет опоры' });
    }

    if (p.cazimi) {
      out.push({ good: true, ru: 'в сердце Солнца (казими)', why: 'ближе 17′ к Солнцу — не сожжение, а трон: редчайшее усиление' });
    } else if (p.combust) {
      out.push({ good: false, ru: 'сожжена', why: 'ближе 8,5° к Солнцу: собственный голос планеты перекрыт' });
    } else if (p.underBeams) {
      out.push({ good: false, ru: 'под лучами', why: 'ближе 15° к Солнцу: слышно, но приглушённо' });
    }

    if (p.retro && key !== 'node' && key !== 'southnode') {
      out.push({ good: false, ru: 'идёт вспять', why: 'дело этой планеты делается не с первого раза и не наружу, а внутрь' });
    }
    var meta = D.PLANETS[key];
    if (meta && meta.speed && !p.retro && Math.abs(p.speed) > meta.speed * 1.1) {
      out.push({ good: true, ru: 'быстрее обычного', why: 'планета идёт скоро: её дела делаются охотно' });
    } else if (meta && meta.speed && !p.retro && Math.abs(p.speed) < meta.speed * 0.5) {
      out.push({ good: false, ru: 'почти стоит', why: 'у станции планета сильна, но неповоротлива' });
    }

    return out;
  }

  /** Достоинства всех планет разом плюс альмутен асцендента. */
  function all(chart) {
    /* Только семь классических: таблицы достоинств старше открытия
       дальних планет, и называть Уран «перегрином» значило бы делать
       вид, что он в этих таблицах отсутствует по существу, а не по
       возрасту. */
    var rows = D.CLASSICAL.map(function (k) {
      var e = essential(k, chart.planets[k].lon, chart.byDay);
      e.ru = D.PLANETS[k].ru;
      e.house = chart.planets[k].house;
      e.accidental = accidental(chart, k);
      return e;
    });
    var sorted = rows.slice().sort(function (a, b) { return b.total - a.total; });
    return {
      rows: rows, sorted: sorted,
      strongest: sorted[0], weakest: sorted[sorted.length - 1],
      peregrines: rows.filter(function (r) { return r.peregrine; }),
      almutenAsc: almuten(chart.angles.asc.lon, chart.byDay),
      // классика: только семь видимых имеют достоинства, дальние их не имеют
      note: 'Уран, Нептун и Плутон в классических таблицах достоинств не участвуют: ' +
            'таблицы старше их открытия. Мы их и не подставляем.'
    };
  }

  root.ArunaDignities = {
    essential: essential, almuten: almuten, accidental: accidental, all: all,
    rulerOf: rulerOf, termOf: termOf, faceOf: faceOf, triplicityOf: triplicityOf
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
