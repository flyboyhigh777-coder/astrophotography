/*
 * Аруна · построение джйотиш-карты
 * ------------------------------------------------------------------
 * Сидерический (нираяна) зодиак, аянамша Лахири (читрапакша).
 * Бхавы — целыми раши (раши-бхава), как в классической индийской
 * традиции: первая бхава = весь раши лагны. Это снимает спор о системах
 * домов и совпадает с тем, что рисуют в северной и южной картах.
 */
(function (root) {
  'use strict';

  var A = root.ArunaAstro, D = root.ArunaData;

  /**
   * Аянамша Лахири (читрапакша), градусы.
   * Накопленная общая прецессия в долготе (IAU 2006) от J2000, привязанная
   * к значению Лахири на J2000 = 23°51′11″. Расхождение с точной эфемеридой
   * Лахири — единицы угловых секунд на интервале 1800-2100.
   */
  function ayanamsa(jd) {
    var T = (A.jdToJde(jd) - 2451545.0) / 36525;
    var precession = (5028.796195 * T + 1.1054348 * T * T) / 3600;
    return 23.853056 + precession;
  }

  /** Тропическая долгота -> сидерическая. */
  function toSidereal(lon, ayan) { return A.norm360(lon - ayan); }

  /** Разбор сидерической долготы на раши / накшатру / паду. */
  function describeLongitude(lon) {
    lon = A.norm360(lon);
    var rashi = Math.floor(lon / 30);
    var degInRashi = lon - rashi * 30;
    var nakSize = 360 / 27;                 // 13°20′
    var nak = Math.floor(lon / nakSize);
    var inNak = lon - nak * nakSize;
    var pada = Math.floor(inNak / (nakSize / 4)) + 1;
    return {
      lon: lon,
      rashi: rashi,
      rashiName: D.RASHIS[rashi].sa,
      rashiRu: D.RASHIS[rashi].ru,
      degInRashi: degInRashi,
      dms: formatDms(degInRashi),
      nakshatra: nak,
      nakshatraName: D.NAKSHATRAS[nak].sa,
      nakshatraLord: D.NAKSHATRAS[nak].lord,
      pada: pada,
      nakFraction: inNak / nakSize          // доля пройденной накшатры
    };
  }

  /** 12.3456° -> «12°20′44″». */
  function formatDms(deg) {
    var d = Math.floor(deg);
    var mFloat = (deg - d) * 60;
    var m = Math.floor(mFloat);
    var s = Math.round((mFloat - m) * 60);
    if (s === 60) { s = 0; m += 1; }
    if (m === 60) { m = 0; d += 1; }
    return d + '°' + String(m).padStart(2, '0') + '′' + String(s).padStart(2, '0') + '″';
  }

  /** Достоинство грахи в раши: экзальтация, дебилитация, свой знак, мулатрикона. */
  function dignity(key, rashi, degInRashi) {
    var g = D.GRAHAS[key];
    if (!g || key === 'rahu' || key === 'ketu') return null;
    if (g.exalt && g.exalt.rashi === rashi) return { code: 'exalted', ru: 'экзальтация', tone: 'strong' };
    if (g.debil && g.debil.rashi === rashi) return { code: 'debilitated', ru: 'дебилитация', tone: 'weak' };
    if (g.moola && g.moola.rashi === rashi &&
        degInRashi >= g.moola.from && degInRashi <= g.moola.to) {
      return { code: 'moolatrikona', ru: 'мулатрикона', tone: 'strong' };
    }
    if (g.own.indexOf(rashi) >= 0) return { code: 'own', ru: 'свой знак', tone: 'strong' };
    var lord = D.RASHIS[rashi].lord;
    if (lord === key) return { code: 'own', ru: 'свой знак', tone: 'strong' };
    if (g.friends.indexOf(lord) >= 0) return { code: 'friend', ru: 'у друга', tone: 'ok' };
    if (g.enemies.indexOf(lord) >= 0) return { code: 'enemy', ru: 'у недруга', tone: 'weak' };
    return { code: 'neutral', ru: 'нейтрально', tone: 'plain' };
  }

  /** Номер бхавы (1-12) для раши при данной лагне. */
  function bhavaOf(rashi, ascRashi) { return ((rashi - ascRashi + 12) % 12) + 1; }

  /**
   * Полная карта.
   * @param {Object} birth {jd: JD(UT), lat, lon (в.д. +), tz, label}
   */
  function buildChart(birth) {
    var jd = birth.jd;
    var ayan = ayanamsa(jd);
    var trop = A.tropicalPositions(jd);
    var horizon = A.ascendantMc(jd, birth.lat, birth.lon);

    var asc = describeLongitude(toSidereal(horizon.asc, ayan));
    var mc = describeLongitude(toSidereal(horizon.mc, ayan));

    var grahas = {};
    A.GRAHA_ORDER.forEach(function (key) {
      var t = trop[key];
      var info = describeLongitude(toSidereal(t.lon, ayan));
      info.key = key;
      info.speed = t.speed;
      // Раху и Кету всегда идут вспять; Солнце и Луна — никогда
      info.retro = (key === 'rahu' || key === 'ketu') ? true :
                   (key === 'sun' || key === 'moon') ? false : t.speed < 0;
      info.bhava = bhavaOf(info.rashi, asc.rashi);
      info.dignity = dignity(key, info.rashi, info.degInRashi);
      info.combust = false;
      grahas[key] = info;
    });

    // Сожжение (астангата): близость к Солнцу. Порог по традиции различается
    // для планет; берём умеренный общепринятый набор.
    var burnLimits = { moon: 12, mercury: 14, venus: 10, mars: 17, jupiter: 11, saturn: 15 };
    Object.keys(burnLimits).forEach(function (k) {
      var sep = Math.abs(A.diff180(grahas[k].lon, grahas.sun.lon));
      grahas[k].combust = sep < burnLimits[k];
      grahas[k].fromSun = sep;
    });

    // Бхавы целыми раши
    var bhavas = [];
    for (var i = 0; i < 12; i++) {
      var rashi = (asc.rashi + i) % 12;
      bhavas.push({
        num: i + 1,
        rashi: rashi,
        rashiName: D.RASHIS[rashi].sa,
        rashiRu: D.RASHIS[rashi].ru,
        lord: D.RASHIS[rashi].lord,
        meta: D.BHAVAS[i],
        grahas: A.GRAHA_ORDER.filter(function (k) { return grahas[k].rashi === rashi; })
      });
    }

    return {
      birth: birth,
      jd: jd,
      ayanamsa: ayan,
      ayanamsaDms: formatDms(ayan),
      lst: horizon.lst,
      asc: asc,
      mc: mc,
      grahas: grahas,
      bhavas: bhavas,
      // накшатра Луны — основа для даши и сопоставления карт
      moonNakshatra: grahas.moon.nakshatra,
      moonRashi: grahas.moon.rashi
    };
  }

  /** Аспекты (дришти): кто смотрит на какую бхаву. */
  function drishti(chart) {
    var out = [];
    A.GRAHA_ORDER.forEach(function (key) {
      var from = chart.grahas[key].bhava;
      var houses = [7].concat(D.GRAHAS[key].drishti || []);
      houses.forEach(function (h) {
        out.push({ graha: key, from: from, to: ((from - 1 + h - 1) % 12) + 1, special: h !== 7 });
      });
    });
    return out;
  }

  root.ArunaChart = {
    ayanamsa: ayanamsa, toSidereal: toSidereal, describeLongitude: describeLongitude,
    formatDms: formatDms, dignity: dignity, bhavaOf: bhavaOf,
    buildChart: buildChart, drishti: drishti
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
