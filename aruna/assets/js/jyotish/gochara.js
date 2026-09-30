/*
 * Аруна · гочара — небо дня относительно вашего знака
 * ------------------------------------------------------------------
 * То, что в газетах печатают как «гороскоп на сегодня», в джйотише
 * считается, а не сочиняется. Правило простое: смотрят, в каком доме
 * от вашего знака Луны стоит сегодня каждая граха. Для каждой грахи
 * классика перечисляет дома, где её проход идёт легко.
 *
 * Источник таблиц — «Пхаладипика» Мантрешвары, глава 26 (шлоки 2-8).
 * Оттуда же взято то, что почти всегда выбрасывают: ведха.
 *
 * Ведха — «загораживание». Хороший проход перестаёт работать, если
 * другая граха стоит в определённом доме напротив. Без этого правила
 * таблица врёт: она обещает удачу там, где классика её уже отменила.
 * Две пары друг друга не загораживают: Солнце с Шани (отец и сын) и
 * Луна с Будхой (мать и сын).
 *
 * Чего здесь нет и не будет: предсказаний событий. Расчёт говорит,
 * какая обстановка, а не что случится.
 */
(function (root) {
  'use strict';

  var A = root.ArunaAstro, C = root.ArunaChart;

  /* Дома от вашего раши, где проход грахи идёт легко. */
  var GOOD = {
    sun:     [3, 6, 10, 11],
    moon:    [1, 3, 6, 7, 10, 11],
    mars:    [3, 6, 11],
    mercury: [2, 4, 6, 8, 10, 11],
    jupiter: [2, 5, 7, 9, 11],
    venus:   [1, 2, 3, 4, 5, 8, 9, 11, 12],   // кроме 6, 7 и 10
    saturn:  [3, 6, 11],
    rahu:    [3, 6, 10, 11],                   // «как у Солнца» — шлока 2
    ketu:    [3, 6, 10, 11]
  };

  /* Что загораживает что: дом прохода → дом, откуда его гасят. */
  var VEDHA = {
    sun:     { 3: 9, 6: 12, 10: 4, 11: 5 },
    moon:    { 1: 5, 3: 9, 6: 12, 7: 2, 10: 4, 11: 8 },
    mars:    { 3: 12, 6: 9, 11: 5 },
    mercury: { 2: 5, 4: 3, 6: 9, 8: 1, 10: 8, 11: 12 },
    jupiter: { 2: 12, 5: 4, 7: 3, 9: 10, 11: 8 },
    venus:   { 1: 8, 2: 7, 3: 1, 4: 10, 5: 9, 8: 5, 9: 11, 11: 3, 12: 6 },
    saturn:  { 3: 12, 6: 9, 11: 5 },
    rahu:    { 3: 9, 6: 12, 10: 4, 11: 5 },
    ketu:    { 3: 9, 6: 12, 10: 4, 11: 5 }
  };

  /*
   * Кто кого не загораживает.
   *
   * Первые две пары — прямо из классики: Солнце и Шани, Луна и Будха.
   *
   * Третью пришлось добавить, иначе правило самоуничтожается. Раху и
   * Кету всегда ровно в шести домах друг от друга — это геометрия, а не
   * обстоятельство. А ведха у обоих ставится как раз на шестой дом от
   * каждого хорошего: 3→9, 6→12, 10→4, 11→5. Значит, ни один хороший
   * проход узлов никогда бы не сработал — вся их строка была бы мёртвой.
   * Ведха говорит о том, что кто-то мог встать и загородить; там, где
   * «мог» заменяется на «всегда стоит», правило теряет смысл.
   */
  var IMMUNE = {
    sun: ['saturn'], saturn: ['sun'],
    moon: ['mercury'], mercury: ['moon'],
    rahu: ['ketu'], ketu: ['rahu']
  };

  var KEYS = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn', 'rahu', 'ketu'];

  /** Сидерический раши грахи (0-11) на момент jd. */
  function rashiAt(key, jd) {
    var jde = A.jdToJde(jd), lon;
    if (key === 'rahu') lon = A.meanNode(jde);
    else if (key === 'ketu') lon = A.norm360(A.meanNode(jde) + 180);
    else if (key === 'sun') lon = A.sun(jde).lon;
    else if (key === 'moon') lon = A.moon(jde).lon;
    else lon = A.planet(key, jde).lon;
    return Math.floor(A.norm360(C.toSidereal(lon, C.ayanamsa(jd))) / 30);
  }

  /** Дом (1-12), в котором раши `from` видит раши `to`. */
  function houseFrom(from, to) {
    return ((to - from + 12) % 12) + 1;
  }

  /**
   * Проход всех девяти грах относительно знака.
   *
   * @param {number} rashi ваш раши, 0-11 (0 — Овен)
   * @param {number} jd     юлианский день
   * @returns {Object} {rashi, jd, items[], score, good, hard}
   */
  function forRashi(rashi, jd) {
    var where = {};
    KEYS.forEach(function (k) { where[k] = rashiAt(k, jd); });

    // кто в каком доме от знака — чтобы проверить ведху
    var inHouse = {};
    KEYS.forEach(function (k) {
      var h = houseFrom(rashi, where[k]);
      (inHouse[h] || (inHouse[h] = [])).push(k);
    });

    var items = KEYS.map(function (k) {
      var house = houseFrom(rashi, where[k]);
      var favourable = GOOD[k].indexOf(house) >= 0;
      var vedhaHouse = VEDHA[k][house];
      var blockers = [];
      if (vedhaHouse && inHouse[vedhaHouse]) {
        blockers = inHouse[vedhaHouse].filter(function (o) {
          return o !== k && (IMMUNE[k] || []).indexOf(o) < 0;
        });
      }
      var blocked = blockers.length > 0;
      return {
        graha: k,
        rashi: where[k],
        house: house,
        favourable: favourable,
        vedhaHouse: vedhaHouse || null,
        blockedBy: blockers,
        // Ведха гасит и хорошее, и плохое: классика говорит о
        // «загораживании прохода», а не о смене знака на обратный.
        verdict: blocked ? 'blocked' : (favourable ? 'good' : 'hard')
      };
    });

    var good = items.filter(function (i) { return i.verdict === 'good'; });
    var hard = items.filter(function (i) { return i.verdict === 'hard'; });

    return {
      rashi: rashi, jd: jd, items: items,
      good: good, hard: hard,
      // Разница, а не сумма: одна цифра, по которой дни сравнимы между собой.
      score: good.length - hard.length
    };
  }

  /**
   * Чандра-бала — где Луна относительно знака.
   * Самый быстрый слой: Луна меняет раши примерно раз в двое с лишним суток.
   */
  function chandraBala(rashi, jd) {
    var h = houseFrom(rashi, rashiAt('moon', jd));
    // 1, 3, 6, 7, 10, 11 — сильная; 4, 8, 12 — слабая; прочее — средняя
    var strong = [1, 3, 6, 7, 10, 11].indexOf(h) >= 0;
    var weak = [4, 8, 12].indexOf(h) >= 0;
    return { house: h, level: strong ? 'strong' : (weak ? 'weak' : 'mid') };
  }

  root.ArunaGochara = {
    GOOD: GOOD, VEDHA: VEDHA, KEYS: KEYS,
    rashiAt: rashiAt, houseFrom: houseFrom,
    forRashi: forRashi, chandraBala: chandraBala
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
