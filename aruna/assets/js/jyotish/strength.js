/*
 * Аруна · сила грах
 * ------------------------------------------------------------------
 * ЧЕСТНО О МЕТОДЕ. Это не классическая Шад-бала: там шесть источников
 * силы, арифметика в вирупах и десятки частных правил, и любая её
 * реализация «на глазок» была бы враньём. Здесь — сводный индекс из
 * пяти составляющих, каждая из которых считается по однозначному
 * правилу и показывается отдельно:
 *
 *   стхана  — достоинство в раши (экзальтация … дебилитация)
 *   диг     — дигбала: насколько граха далеко от своей лучшей бхавы
 *   чешта   — движение: попятное движение традиция считает силой
 *   бхава   — где стоит: кендра и трикона держат, дустхана размывает
 *   шуддхи  — сожжение Солнцем и близость к нему
 *
 * Индекс имеет смысл ВНУТРИ одной карты: он говорит, какая граха здесь
 * крепче других, а не «сколько силы» в абсолютных единицах.
 */
(function (root) {
  'use strict';

  var D = root.ArunaData, A = root.ArunaAstro;

  /** Бхава, в которой граха получает полную дигбалу. */
  var DIG_HOUSE = {
    sun: 10, mars: 10,        // сила в зените — там, где виден труд
    jupiter: 1, mercury: 1,   // сила на восходе — там, где виден ум
    moon: 4, venus: 4,        // сила в надире — там, где дом и покой
    saturn: 7,                // сила на закате — там, где другой
    rahu: 3, ketu: 12         // узлы классической дигбалы не имеют; берём
  };                          // упачаю для Раху и мокшу для Кету как ориентир

  var DIGNITY_SCORE = {
    exalted: 1.00, moolatrikona: 0.88, own: 0.80,
    friend: 0.62, neutral: 0.46, enemy: 0.28, debilitated: 0.12
  };

  function circHouseDist(a, b) {
    var d = Math.abs(a - b) % 12;
    return d > 6 ? 12 - d : d;
  }

  /** Разбор силы одной грахи: части и итог 0..100. */
  function grahaStrength(chart, key) {
    var g = chart.grahas[key];
    var parts = [];

    // 1. стхана — достоинство
    var st = g.dignity ? (DIGNITY_SCORE[g.dignity.code] || 0.46) : 0.5;
    parts.push({ code: 'sthana', title: 'Достоинство', value: st,
      note: g.dignity ? g.dignity.ru + ' в раши ' + g.rashiName
                      : 'у узлов достоинство не считается, взято среднее' });

    // 2. дигбала
    var best = DIG_HOUSE[key];
    var dist = circHouseDist(g.bhava, best);
    var dig = 1 - dist / 6;
    parts.push({ code: 'dig', title: 'Дигбала', value: dig,
      note: 'полная сила в ' + best + '-й бхаве, граха в ' + g.bhava + '-й — ' +
            (dist === 0 ? 'точное попадание'
                        : 'в ' + dist + (dist === 1 ? ' бхаве' : ' бхавах') + ' от неё') });

    // 3. чешта — движение
    var ch;
    if (key === 'rahu' || key === 'ketu') {
      ch = 0.6;
      parts.push({ code: 'chesta', title: 'Движение', value: ch, note: 'узлы всегда идут вспять' });
    } else if (key === 'sun') {
      ch = 0.6;
      parts.push({ code: 'chesta', title: 'Движение', value: ch, note: 'Сурья движется ровно' });
    } else if (key === 'moon') {
      var elong = Math.abs(A.diff180(g.lon, chart.grahas.sun.lon));
      ch = 0.25 + 0.75 * (elong / 180);
      parts.push({ code: 'chesta', title: 'Пакша-бала', value: ch,
        note: 'удаление от Солнца ' + elong.toFixed(0) + '° — ' +
              (elong > 120 ? 'Луна почти полная и сильна'
                           : elong < 60 ? 'Луна близка к новолунию и слаба' : 'средняя фаза') });
    } else {
      ch = g.retro ? 0.9 : 0.55;
      parts.push({ code: 'chesta', title: 'Движение', value: ch,
        note: g.retro ? 'попятное движение — традиция считает его силой' : 'прямое движение' });
    }

    // 4. бхава — положение в карте
    var bh;
    if ([1, 4, 7, 10].indexOf(g.bhava) >= 0) bh = 0.9;
    else if ([5, 9].indexOf(g.bhava) >= 0) bh = 0.85;
    else if ([2, 11].indexOf(g.bhava) >= 0) bh = 0.65;
    else if ([3].indexOf(g.bhava) >= 0) bh = 0.55;
    else bh = 0.3;                                    // 6, 8, 12
    parts.push({ code: 'bhava', title: 'Бхава', value: bh,
      note: g.bhava + '-я бхава — ' +
            ([1, 4, 7, 10].indexOf(g.bhava) >= 0 ? 'кендра, опора карты'
             : [5, 9].indexOf(g.bhava) >= 0 ? 'трикона, место удачи'
             : [6, 8, 12].indexOf(g.bhava) >= 0 ? 'дустхана, силы уходят на преодоление'
             : 'обычное положение') });

    // 5. шуддхи — чистота от сожжения
    var sh = 1;
    var note = 'вдали от Солнца';
    if (key !== 'sun' && typeof g.fromSun === 'number') {
      if (g.combust) { sh = 0.3; note = 'сожжён: ' + g.fromSun.toFixed(1) + '° от Солнца'; }
      else if (g.fromSun < 30) { sh = 0.75; note = 'близко к Солнцу: ' + g.fromSun.toFixed(0) + '°'; }
      else note = g.fromSun.toFixed(0) + '° от Солнца';
    } else if (key === 'sun') {
      note = 'к самому Сурье не применяется';
    }
    parts.push({ code: 'shuddhi', title: 'Чистота', value: sh, note: note });

    // итог: веса подобраны так, чтобы достоинство и бхава решали больше
    var W = { sthana: 0.30, dig: 0.20, chesta: 0.15, bhava: 0.20, shuddhi: 0.15 };
    var total = parts.reduce(function (s, p) { return s + p.value * W[p.code]; }, 0);

    return {
      key: key, parts: parts,
      score: Math.round(total * 100),
      band: total >= 0.72 ? 'сильная' : total >= 0.55 ? 'рабочая' : total >= 0.4 ? 'слабее среднего' : 'слабая'
    };
  }

  /** Сила всех девяти грах, отсортированная по убыванию. */
  function all(chart) {
    var list = A.GRAHA_ORDER.map(function (k) { return grahaStrength(chart, k); });
    var sorted = list.slice().sort(function (a, b) { return b.score - a.score; });
    return {
      list: list,
      sorted: sorted,
      strongest: sorted[0],
      weakest: sorted[sorted.length - 1],
      /** Хозяин лагны — отдельно: от него зависит общий тонус карты. */
      lagnaLord: grahaStrength(chart, D.RASHIS[chart.asc.rashi].lord)
    };
  }

  root.ArunaStrength = { all: all, grahaStrength: grahaStrength, DIG_HOUSE: DIG_HOUSE };
})(typeof globalThis !== 'undefined' ? globalThis : this);
