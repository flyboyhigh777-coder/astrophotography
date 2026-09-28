/*
 * Аруна · подбор времени
 * ------------------------------------------------------------------
 * «Когда лучше» — не мистика, а сложение нескольких проверяемых правил.
 * Каждое из них классическое, каждое считается по таблице, и каждое
 * показывается отдельно: человек видит не «3 звезды из 5», а из чего
 * эта оценка сложилась.
 *
 * Что складывается:
 *   отрезки дня  — раху-кала, ямаганда, гулика (минус), абхиджит (плюс)
 *   титхи        — нанда, бхадра, джая, рикта, пурна
 *   накшатра     — дхрува, чара, угра, мишра, кшипра, мриду, тикшна
 *   вара         — хозяин дня против природы задачи
 *   тара-бала    — счёт от накшатры вашей Луны до сегодняшней
 *   чандра-бала  — бхава транзитной Луны от вашей натальной Луны
 *
 * Без карты рождения считаются первые четыре: это общий день. С картой
 * добавляются тара- и чандра-бала — и день становится вашим.
 */
(function (root) {
  'use strict';

  var A = root.ArunaAstro, C = root.ArunaChart, D = root.ArunaData,
      P = root.ArunaPanchanga;

  /* --------------------------------------------------- классы накшатр */
  var NAK_CLASS = {};
  (function () {
    var map = {
      dhruva:  [3, 11, 20, 25],
      chara:   [6, 14, 21, 22, 23],
      ugra:    [1, 9, 10, 19, 24],
      mishra:  [2, 15],
      kshipra: [0, 7, 12],
      mridu:   [4, 13, 16, 26],
      tikshna: [5, 8, 17, 18]
    };
    Object.keys(map).forEach(function (cls) {
      map[cls].forEach(function (i) { NAK_CLASS[i] = cls; });
    });
  })();

  var NAK_CLASS_RU = {
    dhruva: 'дхрува — устойчивая', chara: 'чара — подвижная', ugra: 'угра — резкая',
    mishra: 'мишра — смешанная', kshipra: 'кшипра — быстрая', mridu: 'мриду — мягкая',
    tikshna: 'тикшна — острая'
  };

  /* ----------------------------------------------------- классы титхи */
  var TITHI_CLASS_RU = {
    nanda: 'нанда — радостная', bhadra: 'бхадра — добрая', jaya: 'джая — победная',
    rikta: 'рикта — пустая', purna: 'пурна — полная'
  };
  function tithiClass(numberInPaksha) {
    var m = numberInPaksha % 5;
    return m === 1 ? 'nanda' : m === 2 ? 'bhadra' : m === 3 ? 'jaya'
         : m === 4 ? 'rikta' : 'purna';
  }

  /* ------------------------------------------------------------ задачи */
  // nak — вес классов накшатр, vara — вес хозяев дня
  var TASKS = [
    { id: 'start', title: 'Начать дело',
      about: 'подписание, запуск, первый шаг в новом',
      nak: { dhruva: 2, kshipra: 2, mridu: 1, chara: 0, mishra: 0, tikshna: -2, ugra: -2 },
      vara: { sun: 0, moon: 1, mars: -1, mercury: 2, jupiter: 2, venus: 1, saturn: -2 } },
    { id: 'talk', title: 'Важный разговор',
      about: 'переговоры, просьба, объяснение',
      nak: { mridu: 2, kshipra: 1, dhruva: 1, mishra: 0, chara: 0, tikshna: -1, ugra: -2 },
      vara: { mercury: 2, jupiter: 2, venus: 1, moon: 1, sun: 0, mars: -2, saturn: -1 } },
    { id: 'travel', title: 'Поездка',
      about: 'дорога, переезд, отъезд',
      nak: { chara: 2, kshipra: 2, mridu: 1, dhruva: -1, mishra: 0, tikshna: -1, ugra: -2 },
      vara: { moon: 2, mercury: 1, venus: 1, jupiter: 1, sun: -1, mars: -2, saturn: -2 } },
    { id: 'money', title: 'Покупка и вложение',
      about: 'крупная трата, договор о деньгах',
      nak: { dhruva: 2, mridu: 1, kshipra: 1, mishra: 0, chara: -1, tikshna: -1, ugra: -2 },
      vara: { jupiter: 2, venus: 2, mercury: 1, moon: 1, sun: 0, saturn: -1, mars: -2 } },
    { id: 'health', title: 'Здоровье и лечение',
      about: 'процедура, начало курса, операция',
      nak: { mridu: 2, dhruva: 1, kshipra: 1, mishra: 0, chara: 0, ugra: -1, tikshna: -2 },
      vara: { mercury: 2, moon: 1, jupiter: 1, venus: 0, sun: 0, mars: -1, saturn: -2 } },
    { id: 'sadhana', title: 'Практика и учёба',
      about: 'начало садханы, обет, первый урок',
      nak: { dhruva: 2, mridu: 2, mishra: 1, kshipra: 1, chara: 0, tikshna: -1, ugra: -1 },
      vara: { jupiter: 2, moon: 1, mercury: 1, venus: 1, sun: 1, saturn: 0, mars: -1 } }
  ];

  function taskById(id) {
    for (var i = 0; i < TASKS.length; i++) if (TASKS[i].id === id) return TASKS[i];
    return TASKS[0];
  }

  /* -------------------------------------------------- тара и чандра-бала */
  var TARA_RU = [
    null, 'джанма — своя, смешанная', 'сампат — достаток', 'випат — потери',
    'кшема — благополучие', 'пратьяри — противодействие', 'садхака — достижение',
    'вадха — препятствие', 'митра — дружеская', 'ати-митра — лучшая'
  ];
  var TARA_SCORE = [0, 0, 2, -2, 2, -2, 2, -3, 2, 3];

  function taraBala(natalNak, todayNak) {
    var n = ((todayNak - natalNak + 27) % 27) + 1;
    var r = n % 9 || 9;
    return { index: r, title: TARA_RU[r], score: TARA_SCORE[r] };
  }

  /** Чандра-бала: транзитная Луна в 1, 3, 6, 7, 10, 11 от натальной — хорошо. */
  var CHANDRA_GOOD = [1, 3, 6, 7, 10, 11];
  function chandraBala(natalMoonRashi, todayMoonRashi) {
    var h = C.bhavaOf(todayMoonRashi, natalMoonRashi);
    var good = CHANDRA_GOOD.indexOf(h) >= 0;
    return {
      house: h, good: good, score: good ? 2 : (h === 4 || h === 8 || h === 12 ? -3 : -1),
      title: 'Луна в ' + h + '-й бхаве от вашей натальной Луны — ' +
             (good ? 'чандра-бала есть' : 'чандра-бала слабая')
    };
  }

  /* ------------------------------------------------------------- оценка */
  function inSpan(jd, span) { return span && jd >= span.from && jd < span.to; }

  /**
   * Разбор дня по получасовым отрезкам.
   * @param {Object} o {jd — любой момент нужного дня, lat, lon, tz, task, chart?}
   */
  function scoreDay(o) {
    var task = taskById(o.task);
    var pan = P.panchanga(o.jd, o.lat, o.lon, o.tz);
    if (!pan.sunrise || !pan.sunset) return null;

    var slots = [];
    var step = 30 / 1440;                       // полчаса
    var from = pan.sunrise, to = pan.sunset;

    for (var t = from; t < to; t += step) {
      var mid = t + step / 2;
      var reasons = [], score = 0;

      // отрезки дня
      if (pan.muhurtas) {
        if (inSpan(mid, pan.muhurtas.rahu)) { score -= 5; reasons.push({ w: -5, t: 'раху-кала' }); }
        if (inSpan(mid, pan.muhurtas.yamaganda)) { score -= 3; reasons.push({ w: -3, t: 'ямаганда' }); }
        if (inSpan(mid, pan.muhurtas.gulika)) { score -= 2; reasons.push({ w: -2, t: 'гулика-кала' }); }
        if (inSpan(mid, pan.muhurtas.abhijit)) { score += 4; reasons.push({ w: 4, t: 'абхиджит-мухурта' }); }
      }

      // титхи и накшатра — берём действующие на середину отрезка
      var th = P.tithi(mid), nk = P.moonNakshatra(mid);
      var tc = tithiClass(((th.index % 15) + 1));
      var tScore = tc === 'rikta' ? -3 : tc === 'purna' ? 1 : tc === 'jaya' ? 2 : 1;
      score += tScore;
      reasons.push({ w: tScore, t: 'титхи ' + th.name + ' (' + TITHI_CLASS_RU[tc] + ')' });

      var cls = NAK_CLASS[nk.index];
      var nScore = task.nak[cls] || 0;
      score += nScore;
      reasons.push({ w: nScore, t: 'накшатра ' + nk.name + ' (' + NAK_CLASS_RU[cls] + ')' });

      // вара
      if (pan.vara) {
        var vScore = task.vara[pan.vara.lord] || 0;
        score += vScore;
        reasons.push({ w: vScore, t: 'вара ' + pan.vara.sa + ' (' + D.GRAHAS[pan.vara.lord].sa + ')' });
      }

      // личные правила — только если известна карта
      if (o.chart) {
        var tb = taraBala(o.chart.moonNakshatra, nk.index);
        score += tb.score;
        reasons.push({ w: tb.score, t: 'тара-бала: ' + tb.title });

        var ayan = C.ayanamsa(mid);
        var moonRashi = Math.floor(C.toSidereal(A.moon(A.jdToJde(mid)).lon, ayan) / 30);
        var cb = chandraBala(o.chart.moonRashi, moonRashi);
        score += cb.score;
        reasons.push({ w: cb.score, t: cb.title });
      }

      slots.push({ from: t, to: Math.min(t + step, to), score: score, reasons: reasons });
    }

    // склеиваем соседние отрезки с одинаковой оценкой в окна
    var windows = [];
    slots.forEach(function (s) {
      var last = windows[windows.length - 1];
      if (last && last.score === s.score && Math.abs(last.to - s.from) < 1e-6) last.to = s.to;
      else windows.push({ from: s.from, to: s.to, score: s.score, reasons: s.reasons });
    });

    var scores = slots.map(function (s) { return s.score; });
    var best = Math.max.apply(null, scores), worst = Math.min.apply(null, scores);

    return {
      panchanga: pan, task: task, slots: slots, windows: windows,
      best: windows.filter(function (w) { return w.score === best; }),
      worst: windows.filter(function (w) { return w.score === worst; }),
      range: { best: best, worst: worst },
      personal: !!o.chart
    };
  }

  root.ArunaMuhurta = {
    TASKS: TASKS, scoreDay: scoreDay, taskById: taskById,
    taraBala: taraBala, chandraBala: chandraBala,
    NAK_CLASS: NAK_CLASS, NAK_CLASS_RU: NAK_CLASS_RU, tithiClass: tithiClass,
    TITHI_CLASS_RU: TITHI_CLASS_RU
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
