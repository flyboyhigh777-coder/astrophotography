/*
 * Сарати · сопоставление карт (Аштакута, 36 гун)
 * ------------------------------------------------------------------
 * Восемь кут по накшатре и раши Луны обоих партнёров: варна, вашья,
 * тара, йони, граха-майтри, гана, бхакута, нади. Плюс отдельно —
 * мангала-доша и классические исключения.
 *
 * Честно о границах модели: варна, граха-майтри, гана, бхакута, тара и
 * нади считаются по общепринятым таблицам без разночтений. Вашья и йони
 * в источниках расходятся в деталях; здесь взята симметричная
 * упрощённая матрица — это отмечено и в отчёте на странице.
 *
 * И главное: сумма гун — не приговор и не допуск. Это один из
 * классических фильтров, который показывает, где союзу легко, а где
 * потребуется внимание.
 */
(function (root) {
  'use strict';

  var D = root.SarathiData;

  /* --------------------------------------------------------- 1. варна (1) */
  // 0 Меша .. 11 Мина -> ранг варны
  var VARNA_BY_RASHI = [3, 2, 1, 4, 3, 2, 1, 4, 3, 2, 1, 4];
  var VARNA_RU = { 4: 'брахмана', 3: 'кшатрия', 2: 'вайшья', 1: 'шудра' };

  function varna(groom, bride) {
    var g = VARNA_BY_RASHI[groom.moonRashi], b = VARNA_BY_RASHI[bride.moonRashi];
    return {
      key: 'varna', title: 'Варна', max: 1, points: g >= b ? 1 : 0,
      detail: VARNA_RU[g] + ' и ' + VARNA_RU[b],
      note: g >= b
        ? 'Уровень внутренней работы совпадает или дополняется — по этой куте вопросов нет.'
        : 'Классика ставит здесь ноль. На практике это не о «хуже/лучше», а о разном темпе духовной работы: договаривайтесь о том, что для каждого важно.'
    };
  }

  /* -------------------------------------------------------- 2. вашья (2) */
  var VASHYA_GROUP = ['chatushpada', 'chatushpada', 'manava', 'jalachara', 'vanachara',
                      'manava', 'manava', 'keeta', 'manava', 'jalachara', 'manava', 'jalachara'];
  var VASHYA_RU = {
    chatushpada: 'четвероногие', manava: 'человеческие',
    jalachara: 'водные', vanachara: 'лесные', keeta: 'ползучие'
  };
  // симметричная упрощённая матрица (см. примечание в шапке файла)
  var VASHYA_MATRIX = {
    chatushpada: { chatushpada: 2, manava: 1,   jalachara: 1,   vanachara: 0,   keeta: 1 },
    manava:      { chatushpada: 1, manava: 2,   jalachara: 0.5, vanachara: 0,   keeta: 1 },
    jalachara:   { chatushpada: 1, manava: 0.5, jalachara: 2,   vanachara: 1,   keeta: 1 },
    vanachara:   { chatushpada: 0, manava: 0,   jalachara: 1,   vanachara: 2,   keeta: 1 },
    keeta:       { chatushpada: 1, manava: 1,   jalachara: 1,   vanachara: 1,   keeta: 2 }
  };

  function vashya(groom, bride) {
    var g = VASHYA_GROUP[groom.moonRashi], b = VASHYA_GROUP[bride.moonRashi];
    var p = VASHYA_MATRIX[g][b];
    return {
      key: 'vashya', title: 'Вашья', max: 2, points: p,
      detail: VASHYA_RU[g] + ' и ' + VASHYA_RU[b],
      note: p >= 1.5 ? 'Естественное взаимное влияние: никто никого не перетягивает.'
          : p >= 0.5 ? 'Влияние скорее односторонее — важно вслух проговаривать, кто в каком решении ведёт.'
          : 'Разные природы влияния: решения лучше принимать явно, а не «само сложится».',
      simplified: true
    };
  }

  /* ----------------------------------------------------- 3. тара/дина (3) */
  function taraCount(from, to) {
    var n = ((to - from + 27) % 27) + 1;   // счёт включительно
    var r = n % 9;
    return { n: n, rem: r === 0 ? 9 : r };
  }

  function tara(groom, bride) {
    var a = taraCount(bride.moonNakshatra, groom.moonNakshatra);
    var b = taraCount(groom.moonNakshatra, bride.moonNakshatra);
    var bad = [3, 5, 7];
    var pa = bad.indexOf(a.rem) >= 0 ? 0 : 1.5;
    var pb = bad.indexOf(b.rem) >= 0 ? 0 : 1.5;
    return {
      key: 'tara', title: 'Тара', max: 3, points: pa + pb,
      detail: 'тары ' + a.rem + ' и ' + b.rem,
      note: pa + pb === 3 ? 'Взаимные тары благоприятны в обе стороны — обычный признак лёгкого бытового согласия.'
          : pa + pb === 1.5 ? 'В одну сторону тара напряжённая: один из двоих чаще будет чувствовать себя «догоняющим».'
          : 'Обе тары из напряжённого набора (3, 5, 7). Традиция советует не игнорировать это, а сознательно строить ритм: меньше резких общих решений на подъёме эмоций.'
    };
  }

  /* --------------------------------------------------------- 4. йони (4) */
  var YONI_NATURE = {           // для упрощённой оценки «свой круг / чужой круг»
    cow: 'tame', buffalo: 'tame', sheep: 'tame', horse: 'tame', elephant: 'tame',
    dog: 'tame', cat: 'tame', rat: 'wild', serpent: 'wild', mongoose: 'wild',
    tiger: 'wild', lion: 'wild', monkey: 'wild', deer: 'wild'
  };
  var YONI_ENEMIES = [
    ['cow', 'tiger'], ['elephant', 'lion'], ['horse', 'buffalo'], ['dog', 'deer'],
    ['monkey', 'sheep'], ['cat', 'rat'], ['serpent', 'mongoose']
  ];

  function yoniEnemies(a, b) {
    for (var i = 0; i < YONI_ENEMIES.length; i++) {
      var p = YONI_ENEMIES[i];
      if ((p[0] === a && p[1] === b) || (p[1] === a && p[0] === b)) return true;
    }
    return false;
  }

  function yoni(groom, bride) {
    var a = D.NAKSHATRAS[groom.moonNakshatra].yoni;
    var b = D.NAKSHATRAS[bride.moonNakshatra].yoni;
    var p;
    if (a === b) p = 4;
    else if (yoniEnemies(a, b)) p = 0;
    else p = YONI_NATURE[a] === YONI_NATURE[b] ? 3 : 2;
    return {
      key: 'yoni', title: 'Йони', max: 4, points: p,
      detail: D.YONI_RU[a] + ' и ' + D.YONI_RU[b],
      note: p === 4 ? 'Одна йони: телесная и бытовая совместимость по этой куте максимальная.'
          : p === 0 ? 'Йони из классической пары противников. Речь о разном телесном ритме — сне, еде, близости, темпе. Это решается договорённостями, но само не рассасывается.'
          : p === 3 ? 'Близкие по природе йони — расхождения в ритме есть, но небольшие.'
          : 'Разные по природе йони: бытовой ритм придётся согласовывать осознанно.',
      simplified: true
    };
  }

  /* ------------------------------------------------- 5. граха-майтри (5) */
  function relation(a, b) {                 // как a относится к b
    if (a === b) return 'same';
    var g = D.GRAHAS[a];
    if (!g) return 'neutral';
    if (g.friends.indexOf(b) >= 0) return 'friend';
    if (g.enemies.indexOf(b) >= 0) return 'enemy';
    return 'neutral';
  }

  function grahaMaitri(groom, bride) {
    var lg = D.RASHIS[groom.moonRashi].lord, lb = D.RASHIS[bride.moonRashi].lord;
    var r1 = relation(lg, lb), r2 = relation(lb, lg);
    var p;
    if (lg === lb) p = 5;
    else if (r1 === 'friend' && r2 === 'friend') p = 5;
    else if ((r1 === 'friend' && r2 === 'neutral') || (r1 === 'neutral' && r2 === 'friend')) p = 4;
    else if (r1 === 'neutral' && r2 === 'neutral') p = 3;
    else if ((r1 === 'friend' && r2 === 'enemy') || (r1 === 'enemy' && r2 === 'friend')) p = 1;
    else if ((r1 === 'neutral' && r2 === 'enemy') || (r1 === 'enemy' && r2 === 'neutral')) p = 0.5;
    else p = 0;
    return {
      key: 'maitri', title: 'Граха-майтри', max: 5, points: p,
      detail: D.GRAHAS[lg].sa + ' и ' + D.GRAHAS[lb].sa,
      note: p >= 4 ? 'Хозяева лунных раши дружат — умы легко находят общий язык без перевода.'
          : p >= 3 ? 'Нейтралитет: понимание есть, но его надо строить словами, а не ожидать «с полуслова».'
          : 'Хозяева лунных раши расходятся. Самая частая форма — разное представление о том, что считать важным. Помогает прямой разговор вместо догадок.'
    };
  }

  /* --------------------------------------------------------- 6. гана (6) */
  var GANA_MATRIX = {
    deva:     { deva: 6, manushya: 5, rakshasa: 1 },
    manushya: { deva: 5, manushya: 6, rakshasa: 0 },
    rakshasa: { deva: 1, manushya: 0, rakshasa: 6 }
  };

  function gana(groom, bride) {
    var a = D.NAKSHATRAS[groom.moonNakshatra].gana;
    var b = D.NAKSHATRAS[bride.moonNakshatra].gana;
    var p = GANA_MATRIX[a][b];
    return {
      key: 'gana', title: 'Гана', max: 6, points: p,
      detail: D.GANA_RU[a] + ' и ' + D.GANA_RU[b],
      note: p === 6 ? 'Один темперамент: реакции на одни и те же события схожи.'
          : p === 5 ? 'Темпераменты разные, но совместимые — обычно это даже помогает.'
          : 'Темпераменты контрастные. Это не про «плохого» и «хорошего», а про разную скорость реакции: один вспыхивает, другой обдумывает.'
    };
  }

  /* ----------------------------------------------------- 7. бхакута (7) */
  function bhakoot(groom, bride) {
    var d1 = ((bride.moonRashi - groom.moonRashi + 12) % 12) + 1;
    var d2 = ((groom.moonRashi - bride.moonRashi + 12) % 12) + 1;
    var pairs = [[6, 8], [5, 9], [2, 12]];
    var bad = null;
    pairs.forEach(function (p) {
      if ((d1 === p[0] && d2 === p[1]) || (d1 === p[1] && d2 === p[0])) bad = p;
    });
    var axisRu = { '6,8': 'шаданшта (6/8)', '5,9': 'навам-панчама (5/9)', '2,12': 'двир-двадаша (2/12)' };
    return {
      key: 'bhakoot', title: 'Бхакута', max: 7, points: bad ? 0 : 7,
      detail: d1 + '/' + d2 + (bad ? ' · ' + axisRu[bad.join(',')] : ''),
      note: !bad ? 'Лунные раши стоят в согласии — общий быт и общие планы складываются без внутреннего сопротивления.'
          : bad[0] === 5 ? 'Ось 5/9 классика считает дошей, хотя по смыслу это ось дхармы: сильная взаимная симпатия и притяжение, но разные представления о «правильном». Многие традиции снимают эту дошу, если хозяева раши дружны.'
          : bad[0] === 6 ? 'Ось 6/8 (шаданшта): напряжение вокруг здоровья, денег и чувства безопасности. Не запрет, а предупреждение: такие пары держатся на честной договорённости о быте.'
          : 'Ось 2/12: один склонен давать, другой брать, и роли легко закрепляются. Помогает следить за балансом, а не терпеть.'
    };
  }

  /* --------------------------------------------------------- 8. нади (8) */
  function nadi(groom, bride) {
    var a = D.NAKSHATRAS[groom.moonNakshatra].nadi;
    var b = D.NAKSHATRAS[bride.moonNakshatra].nadi;
    var same = a === b;
    var sameNak = groom.moonNakshatra === bride.moonNakshatra;
    var sameRashi = groom.moonRashi === bride.moonRashi;
    // классическое исключение: одна накшатра, но разные раши (или наоборот)
    var cancelled = same && sameNak && !sameRashi;
    return {
      key: 'nadi', title: 'Нади', max: 8, points: same && !cancelled ? 0 : 8,
      detail: D.NADI_RU[a] + ' и ' + D.NADI_RU[b] + (cancelled ? ' · исключение снимает дошу' : ''),
      note: !same ? 'Разные нади — по этой куте, самой весомой из восьми, всё в порядке.'
          : cancelled ? 'Нади совпадают, но срабатывает классическое исключение: одна накшатра при разных раши. Доша считается снятой.'
          : 'Нади совпадают. Традиция придаёт этому большой вес и говорит о схожей конституции: одни и те же слабости обостряются у обоих одновременно. Это довод внимательнее отнестись к здоровью и отдыху, а не отказываться от союза.'
    };
  }

  /* ------------------------------------------------------ мангала-доша */
  function kujaDosha(chart) {
    var b = chart.grahas.mars.bhava;
    var houses = [1, 4, 7, 8, 12];
    return { present: houses.indexOf(b) >= 0, bhava: b };
  }

  /**
   * Полный отчёт по паре.
   * @param {Object} groomChart карта из SarathiChart.buildChart
   * @param {Object} brideChart
   */
  function compare(groomChart, brideChart) {
    var g = { moonRashi: groomChart.moonRashi, moonNakshatra: groomChart.moonNakshatra };
    var b = { moonRashi: brideChart.moonRashi, moonNakshatra: brideChart.moonNakshatra };

    var kootas = [varna(g, b), vashya(g, b), tara(g, b), yoni(g, b),
                  grahaMaitri(g, b), gana(g, b), bhakoot(g, b), nadi(g, b)];
    var total = kootas.reduce(function (s, k) { return s + k.points; }, 0);

    var kg = kujaDosha(groomChart), kb = kujaDosha(brideChart);
    var band = total >= 32 ? 'высокая' : total >= 26 ? 'хорошая' : total >= 18 ? 'рабочая' : 'низкая';

    return {
      kootas: kootas,
      total: Math.round(total * 2) / 2,
      max: 36,
      band: band,
      strengths: kootas.filter(function (k) { return k.points >= k.max * 0.75; }),
      tensions: kootas.filter(function (k) { return k.points <= k.max * 0.4; }),
      kuja: {
        groom: kg, bride: kb,
        mutual: kg.present && kb.present,
        note: kg.present && kb.present
          ? 'Мангала-доша есть у обоих — классика считает, что в этом случае она взаимно снимается.'
          : (kg.present || kb.present)
          ? 'Мангала-доша у одного из двоих: Мангала в ' +
            (kg.present ? kg.bhava : kb.bhava) + '-й бхаве от лагны. Традиция советует не спешить с решениями в конфликте и не проверять друг друга на прочность.'
          : 'Мангала-доши ни у одного из двоих нет.'
      },
      moonAxis: {
        groomRashi: D.RASHIS[g.moonRashi].sa,
        brideRashi: D.RASHIS[b.moonRashi].sa,
        groomNak: D.NAKSHATRAS[g.moonNakshatra].sa,
        brideNak: D.NAKSHATRAS[b.moonNakshatra].sa
      }
    };
  }

  root.SarathiAshtakoota = { compare: compare, relation: relation, kujaDosha: kujaDosha };
})(typeof globalThis !== 'undefined' ? globalThis : this);
