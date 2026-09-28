/*
 * Аруна · Вимшоттари-даша
 * ------------------------------------------------------------------
 * 120-летний цикл периодов, отсчитанный от накшатры Луны при рождении:
 * сколько накшатры Луна уже прошла — столько первого периода уже истекло.
 * Длина года — 365,2425 суток (как в большинстве современных программ).
 */
(function (root) {
  'use strict';

  var D = root.ArunaData;
  var YEAR = 365.2425;

  function order(from) {
    var i = D.DASHA_ORDER.indexOf(from);
    var out = [];
    for (var k = 0; k < 9; k++) out.push(D.DASHA_ORDER[(i + k) % 9]);
    return out;
  }

  /**
   * Махадаши от рождения.
   * @param {number} birthJd
   * @param {number} moonNakIndex индекс накшатры Луны (0-26)
   * @param {number} traversed доля пройденной накшатры (0-1)
   */
  function mahadashas(birthJd, moonNakIndex, traversed) {
    var first = D.NAKSHATRAS[moonNakIndex].lord;
    var seq = order(first);
    var elapsed = traversed * D.DASHA_YEARS[first];       // лет уже прошло
    var cursor = birthJd - elapsed * YEAR;                 // условное начало
    var out = [];
    for (var cycle = 0; cycle < 2; cycle++) {              // 240 лет с запасом
      for (var i = 0; i < 9; i++) {
        var key = seq[i], years = D.DASHA_YEARS[key];
        out.push({ lord: key, years: years, from: cursor, to: cursor + years * YEAR });
        cursor += years * YEAR;
      }
    }
    return out;
  }

  /** Подпериоды внутри периода: те же 9 хозяев, пропорционально их годам. */
  function subPeriods(period) {
    var seq = order(period.lord);
    var span = period.to - period.from;
    var cursor = period.from, out = [];
    for (var i = 0; i < 9; i++) {
      var len = span * D.DASHA_YEARS[seq[i]] / 120;
      out.push({ lord: seq[i], years: period.years * D.DASHA_YEARS[seq[i]] / 120,
                 from: cursor, to: cursor + len });
      cursor += len;
    }
    return out;
  }

  function find(list, jd) {
    for (var i = 0; i < list.length; i++) {
      if (jd >= list[i].from && jd < list[i].to) return list[i];
    }
    return null;
  }

  /**
   * Действующая цепочка периодов на момент jd: маха -> антар -> пратьянтар.
   */
  function current(birthJd, moonNakIndex, traversed, jd) {
    var maha = find(mahadashas(birthJd, moonNakIndex, traversed), jd);
    if (!maha) return null;
    var antar = find(subPeriods(maha), jd);
    var praty = antar ? find(subPeriods(antar), jd) : null;
    return { maha: maha, antar: antar, pratyantar: praty };
  }

  /** Баланс первого периода на момент рождения, в годах. */
  function balanceAtBirth(moonNakIndex, traversed) {
    var lord = D.NAKSHATRAS[moonNakIndex].lord;
    return { lord: lord, years: (1 - traversed) * D.DASHA_YEARS[lord] };
  }

  root.ArunaDasha = {
    YEAR: YEAR, order: order, mahadashas: mahadashas, subPeriods: subPeriods,
    current: current, balanceAtBirth: balanceAtBirth
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
