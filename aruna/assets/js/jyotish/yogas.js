/*
 * Аруна · йоги карты
 * ------------------------------------------------------------------
 * Классические сочетания грах. Каждая йога возвращает не только «есть /
 * нет», но и ПРАВИЛО, по которому она найдена: без этого список йог —
 * гадание, а с ним — проверяемый расчёт, который можно открыть в любом
 * учебнике и сверить.
 *
 * Правила взяты в наиболее распространённой формулировке (Брихат-Парашара-
 * Хора-Шастра и стоящая на ней традиция). Там, где источники расходятся,
 * выбран строгий вариант: лучше не показать спорную йогу, чем показать
 * несуществующую.
 */
(function (root) {
  'use strict';

  var D = root.ArunaData, C = root.ArunaChart;

  var KENDRA = [1, 4, 7, 10];
  var TRIKONA = [1, 5, 9];
  var DUSTHANA = [6, 8, 12];
  // Для йога-караки первая бхава не в счёт: она и кендра, и трикона сразу,
  // иначе «йога-каракой» оказывался бы почти каждый хозяин лагны. Строгий
  // набор даёт ровно шесть классических лагн: Вришабха и Тула (Шани),
  // Карка и Симха (Мангала), Макара и Кумбха (Шукра).
  var KENDRA_STRICT = [4, 7, 10];
  var TRIKONA_STRICT = [5, 9];

  /** Хозяин N-й бхавы. */
  function lordOf(chart, n) {
    return D.RASHIS[(chart.asc.rashi + n - 1) % 12].lord;
  }
  function bhavaOfGraha(chart, key) { return chart.grahas[key].bhava; }
  /** Бхава грахи, отсчитанная от Луны (чандра-лагна). */
  function fromMoon(chart, key) {
    return C.bhavaOf(chart.grahas[key].rashi, chart.moonRashi);
  }
  function sameRashi(chart, a, b) {
    return chart.grahas[a].rashi === chart.grahas[b].rashi;
  }
  /** Растущая ли Луна: элонгация от Солнца больше 72° (шукла-пакша, окрепшая). */
  function moonIsBenefic(chart) {
    var d = Math.abs(root.ArunaAstro.diff180(chart.grahas.moon.lon, chart.grahas.sun.lon));
    return d > 72;
  }
  /** Натуральные благодетели карты. */
  function benefics(chart) {
    var b = ['jupiter', 'venus', 'mercury'];
    if (moonIsBenefic(chart)) b.push('moon');
    return b;
  }
  function isOwnOrExalted(chart, key) {
    var dg = chart.grahas[key].dignity;
    return dg && (dg.code === 'own' || dg.code === 'exalted' || dg.code === 'moolatrikona');
  }
  function sa(key) { return D.GRAHAS[key].sa; }

  /* ------------------------------------------------ панча-махапуруша */
  var MAHAPURUSHA = {
    mars:    { name: 'Ручака',  gives: 'решимость, физическая выносливость, способность вести за собой' },
    mercury: { name: 'Бхадра',  gives: 'острый ум, речь, умение объяснять и договариваться' },
    jupiter: { name: 'Хамса',   gives: 'уважение, тяга к знанию, умение быть опорой другим' },
    venus:   { name: 'Малавья', gives: 'вкус, обаяние, лёгкость в отношениях и достатке' },
    saturn:  { name: 'Шаша',    gives: 'терпение, власть над обстоятельствами, работа вдолгую' }
  };

  function mahapurusha(chart) {
    var out = [];
    Object.keys(MAHAPURUSHA).forEach(function (key) {
      var g = chart.grahas[key];
      if (KENDRA.indexOf(g.bhava) >= 0 && isOwnOrExalted(chart, key)) {
        out.push({
          id: 'mahapurusha-' + key,
          title: MAHAPURUSHA[key].name + '-йога',
          group: 'Панча-махапуруша',
          rule: sa(key) + ' в кендре (1, 4, 7 или 10) и в своём знаке либо в экзальтации',
          detail: sa(key) + ' в ' + g.bhava + '-й бхаве, ' + g.rashiName + ' — ' + g.dignity.ru,
          meaning: 'Одна из пяти йог великого человека: ' + MAHAPURUSHA[key].gives +
                   '. Черта проявляется не сама по себе, а через ту бхаву, где стоит граха.',
          weight: 3
        });
      }
    });
    return out;
  }

  /* ---------------------------------------------------- парные йоги */
  function pairs(chart) {
    var out = [];

    // Гаджакесари: Гуру в кендре от Луны
    var gk = fromMoon(chart, 'jupiter');
    if (KENDRA.indexOf(gk) >= 0) {
      out.push({
        id: 'gajakesari', title: 'Гаджакесари-йога', group: 'Связки',
        rule: 'Гуру в кендре (1, 4, 7 или 10) от Луны',
        detail: 'Гуру в ' + gk + '-й бхаве от Луны (' + chart.grahas.jupiter.rashiName + ')',
        meaning: 'Ум и знание поддерживают друг друга: человека слушают, и он редко теряет опору ' +
                 'в трудный момент. Сила йоги зависит от того, насколько крепок сам Гуру.',
        weight: 2
      });
    }

    // Будха-адитья: Солнце и Меркурий в одном раши
    if (sameRashi(chart, 'sun', 'mercury')) {
      out.push({
        id: 'budha-aditya', title: 'Будха-адитья-йога', group: 'Связки',
        rule: 'Сурья и Будха в одном раши',
        detail: 'Оба в раши ' + chart.grahas.sun.rashiName + ', бхава ' + chart.grahas.sun.bhava +
                (chart.grahas.mercury.combust ? ' · Будха сожжён, и это ослабляет йогу' : ''),
        meaning: 'Соединение воли и разума: способность быстро схватывать и объяснять. ' +
                 'Если Будха слишком близко к Сурье и сожжён, ум бывает ярким, но нетерпеливым.',
        weight: chart.grahas.mercury.combust ? 1 : 2
      });
    }

    // Чандра-мангала: Луна и Марс в одном раши
    if (sameRashi(chart, 'moon', 'mars')) {
      out.push({
        id: 'chandra-mangala', title: 'Чандра-мангала-йога', group: 'Связки',
        rule: 'Чандра и Мангала в одном раши',
        detail: 'Оба в раши ' + chart.grahas.moon.rashiName + ', бхава ' + chart.grahas.moon.bhava,
        meaning: 'Чувство и действие сцеплены напрямую: человек умеет добывать и защищать своё, ' +
                 'но и переживает горячее, чем показывает.',
        weight: 2
      });
    }

    // Шаката: Луна в 6, 8 или 12 от Гуру
    var moonFromJup = C.bhavaOf(chart.moonRashi, chart.grahas.jupiter.rashi);
    if (DUSTHANA.indexOf(moonFromJup) >= 0) {
      out.push({
        id: 'shakata', title: 'Шаката-йога', group: 'Напряжения',
        rule: 'Луна в 6, 8 или 12 от Гуру',
        detail: 'Луна в ' + moonFromJup + '-й бхаве от Гуру',
        meaning: 'Классика описывает её как «колесо»: подъёмы и спады сменяются волнами, ' +
                 'и устойчивость приходится строить сознательно. Многие авторы снимают эту йогу, ' +
                 'если Луна или Гуру сильны, поэтому смотреть её нужно вместе с силой грах.',
        adverse: true, weight: 1
      });
    }

    // Кемадрума: во 2-й и 12-й от Луны нет грах (кроме Сурьи и узлов)
    var neighbours = ['moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn'].filter(function (k) {
      if (k === 'moon') return false;
      var h = fromMoon(chart, k);
      return h === 2 || h === 12;
    });
    if (!neighbours.length) {
      // Классических снятий у кемадрумы несколько; берём три самых
      // общепринятых, иначе доша «находится» почти у половины карт.
      var cancels = [];
      if (KENDRA.indexOf(chart.grahas.moon.bhava) >= 0) cancels.push('Луна в кендре от лагны');
      if (moonIsBenefic(chart)) cancels.push('Луна растущая и потому сильна');
      var withBenefic = benefics(chart).filter(function (k) {
        return k !== 'moon' && chart.grahas[k].rashi === chart.moonRashi;
      });
      if (withBenefic.length) cancels.push('с Луной стоит ' + withBenefic.map(sa).join(', '));

      out.push({
        id: 'kemadruma', title: 'Кемадрума-йога', group: cancels.length ? 'Снятия' : 'Напряжения',
        rule: 'Ни одной грахи (кроме Сурьи и узлов) во 2-й и 12-й бхаве от Луны',
        detail: 'Соседние с Луной бхавы пусты' +
                (cancels.length ? ' · снятие: ' + cancels.join('; ') : ''),
        meaning: cancels.length
          ? 'Сама расстановка есть, но условия снятия выполнены — традиция в этом случае дошу ' +
            'не считает. Остаётся лёгкий оттенок: опору человек всё-таки предпочитает искать в себе.'
          : 'Луна остаётся без поддержки соседей: труднее опираться на окружение, многое ' +
            'приходится держать самому. Смотреть её нужно вместе с силой Луны.',
        adverse: !cancels.length, weight: 1
      });
    }

    return out;
  }

  /* --------------------------------------------------- групповые йоги */
  function groups(chart) {
    var out = [];
    var ben = benefics(chart);

    // Амала: благодетель в 10-й от лагны или от Луны
    var amala = ben.filter(function (k) {
      return bhavaOfGraha(chart, k) === 10 || fromMoon(chart, k) === 10;
    });
    if (amala.length) {
      out.push({
        id: 'amala', title: 'Амала-йога', group: 'Связки',
        rule: 'Натуральный благодетель в 10-й бхаве от лагны или от Луны',
        detail: amala.map(sa).join(', ') + ' в 10-й бхаве',
        meaning: 'Имя человека держится на поступках, а не на связях: репутация растёт медленно ' +
                 'и потом работает сама.',
        weight: 2
      });
    }

    // Адхи: Будха, Шукра и Гуру — в 6, 7, 8 от Луны
    var adhiSet = ['mercury', 'venus', 'jupiter'];
    if (adhiSet.every(function (k) { return [6, 7, 8].indexOf(fromMoon(chart, k)) >= 0; })) {
      out.push({
        id: 'adhi', title: 'Адхи-йога', group: 'Связки',
        rule: 'Будха, Шукра и Гуру — все в 6-й, 7-й или 8-й бхаве от Луны',
        detail: adhiSet.map(function (k) { return sa(k) + ' → ' + fromMoon(chart, k); }).join(', '),
        meaning: 'Редкое сочетание: трудности разрешаются раньше, чем успевают стать бедой, ' +
                 'а вокруг человека собираются те, кто ему помогает.',
        weight: 3
      });
    }

    // Сарасвати: Будха, Гуру, Шукра в кендрах, триконах или во 2-й
    var good = [1, 2, 4, 5, 7, 9, 10];
    if (adhiSet.every(function (k) { return good.indexOf(bhavaOfGraha(chart, k)) >= 0; })) {
      out.push({
        id: 'sarasvati', title: 'Сарасвати-йога', group: 'Связки',
        rule: 'Будха, Гуру и Шукра — в кендре, триконе или во 2-й бхаве',
        detail: adhiSet.map(function (k) { return sa(k) + ' → ' + bhavaOfGraha(chart, k) + '-я'; }).join(', '),
        meaning: 'Учёба, речь и вкус идут вместе. Такая карта легко даётся тем, кто работает ' +
                 'со словом, текстом и объяснением.',
        weight: 3
      });
    }

    // Чатуссагара: грахи во всех четырёх кендрах
    var occupied = {};
    root.ArunaAstro.GRAHA_ORDER.forEach(function (k) {
      if (k !== 'rahu' && k !== 'ketu') occupied[bhavaOfGraha(chart, k)] = true;
    });
    if (KENDRA.every(function (h) { return occupied[h]; })) {
      out.push({
        id: 'chatussagara', title: 'Чатуссагара-йога', group: 'Связки',
        rule: 'Хотя бы по одной грахе в каждой из четырёх кендр',
        detail: 'Заняты бхавы 1, 4, 7 и 10',
        meaning: 'Опоры расставлены по всем четырём сторонам: тело, дом, отношения и дело ' +
                 'поддерживают друг друга. Жизнь редко проваливается сразу во всём.',
        weight: 2
      });
    }

    // Кала-сарпа: все семь грах по одну сторону оси Раху-Кету
    var rahu = chart.grahas.rahu.lon;
    var seven = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn'];
    var side = seven.map(function (k) {
      return root.ArunaAstro.norm360(chart.grahas[k].lon - rahu) < 180;
    });
    if (side.every(Boolean) || side.every(function (v) { return !v; })) {
      out.push({
        id: 'kala-sarpa', title: 'Кала-сарпа-йога', group: 'Напряжения',
        rule: 'Все семь грах в одной половине круга, между Раху и Кету',
        detail: 'Раху ' + chart.grahas.rahu.rashiName + ' — Кету ' + chart.grahas.ketu.rashiName +
                ', все грахи по одну сторону оси',
        meaning: 'Жизнь долго идёт по одному руслу, и повороты даются рывками, а не плавно. ' +
                 'Это не «проклятие», как пишут в популярных текстах: сильные грахи и хорошая ' +
                 'даша меняют её звучание почти полностью.',
        adverse: true, weight: 2
      });
    }

    return out;
  }

  /* ------------------------------------------------------ раджа-йоги */
  function raja(chart) {
    var out = [], seen = {};

    // йога-карака — по строгому набору бхав
    KENDRA_STRICT.forEach(function (k) {
      TRIKONA_STRICT.forEach(function (t) {
        var lk = lordOf(chart, k), lt = lordOf(chart, t);
        if (lk !== lt) return;
        var id = 'yogakaraka-' + lk;
        if (seen[id]) return; seen[id] = 1;
        out.push({
          id: id, title: 'Йога-карака: ' + sa(lk), group: 'Раджа-йоги',
          rule: 'Одна граха владеет и кендрой (' + k + '), и триконой (' + t + ')',
          detail: sa(lk) + ' — хозяин ' + k + '-й и ' + t + '-й бхав, стоит в ' +
                  bhavaOfGraha(chart, lk) + '-й',
          meaning: 'Самая ценная фигура карты: одна граха отвечает и за опору, и за удачу. ' +
                   'Её периоды в даше обычно и оказываются поворотными.',
          weight: 3
        });
      });
    });

    KENDRA.forEach(function (k) {
      TRIKONA.forEach(function (t) {
        if (k === t) return;
        var lk = lordOf(chart, k), lt = lordOf(chart, t);
        var key, id;
        if (lk === lt) return;
        if (chart.grahas[lk].rashi === chart.grahas[lt].rashi) {
          key = [lk, lt].sort().join('-');
          id = 'raja-conj-' + key;
          if (seen[id]) return; seen[id] = 1;
          out.push({
            id: id, title: 'Раджа-йога: ' + sa(lk) + ' и ' + sa(lt), group: 'Раджа-йоги',
            rule: 'Хозяин кендры (' + k + ') и хозяин триконы (' + t + ') в одном раши',
            detail: 'Оба в ' + chart.grahas[lk].rashiName + ', ' + bhavaOfGraha(chart, lk) + '-я бхава',
            meaning: 'Соединение опоры и удачи: то, что человек делает, получает поддержку ' +
                     'обстоятельств. Работает в периоды этих двух грах.',
            weight: 3
          });
          return;
        }
        if (bhavaOfGraha(chart, lk) === t && bhavaOfGraha(chart, lt) === k) {
          key = [lk, lt].sort().join('-');
          id = 'raja-exch-' + key;
          if (seen[id]) return; seen[id] = 1;
          out.push({
            id: id, title: 'Обмен бхавами: ' + sa(lk) + ' и ' + sa(lt), group: 'Раджа-йоги',
            rule: 'Хозяин ' + k + '-й стоит в ' + t + '-й, а хозяин ' + t + '-й — в ' + k + '-й',
            detail: sa(lk) + ' в ' + t + '-й, ' + sa(lt) + ' в ' + k + '-й (паривартана)',
            meaning: 'Две темы жизни связаны накрепко: одна не идёт без другой. Обмен обычно ' +
                     'чувствуется как «через это — к тому».',
            weight: 3
          });
        }
      });
    });
    return out;
  }

  /* ------------------------------------------------------ дхана-йоги */
  function dhana(chart) {
    var out = [], seen = {};
    [2, 11].forEach(function (w) {
      [1, 5, 9].forEach(function (t) {
        var lw = lordOf(chart, w), lt = lordOf(chart, t);
        if (lw === lt) return;
        if (chart.grahas[lw].rashi !== chart.grahas[lt].rashi) return;
        var id = 'dhana-' + [lw, lt].sort().join('-');
        if (seen[id]) return; seen[id] = 1;
        out.push({
          id: id, title: 'Дхана-йога: ' + sa(lw) + ' и ' + sa(lt), group: 'Достаток',
          rule: 'Хозяин ' + w + '-й (достаток) и хозяин ' + t + '-й в одном раши',
          detail: 'Оба в ' + chart.grahas[lw].rashiName + ', ' + bhavaOfGraha(chart, lw) + '-я бхава',
          meaning: 'Доход приходит не отдельно от жизни, а из того, чем человек и так занят. ' +
                   'Проявляется в периоды этих грах.',
          weight: 2
        });
      });
    });
    return out;
  }

  /* ------------------------------------------ випарита и нича-бханга */
  var VIPARITA = { 6: 'Харша', 8: 'Сарала', 12: 'Вимала' };

  function viparita(chart) {
    var out = [];
    DUSTHANA.forEach(function (h) {
      var l = lordOf(chart, h);
      var at = bhavaOfGraha(chart, l);
      if (DUSTHANA.indexOf(at) >= 0) {
        out.push({
          id: 'viparita-' + h, title: VIPARITA[h] + '-йога', group: 'Випарита',
          rule: 'Хозяин ' + h + '-й бхавы стоит в ' + at + '-й (тоже дустхане)',
          detail: sa(l) + ' — хозяин ' + h + '-й, стоит в ' + at + '-й',
          meaning: 'Випарита-раджа-йога: беда, обращённая в опору. Трудности этой бхавы ' +
                   'со временем оборачиваются преимуществом — обычно через то, что человек ' +
                   'научился с ними жить.',
          weight: 2
        });
      }
    });
    return out;
  }

  function neechaBhanga(chart) {
    var out = [];
    root.ArunaAstro.GRAHA_ORDER.forEach(function (key) {
      var g = chart.grahas[key];
      if (!g.dignity || g.dignity.code !== 'debilitated') return;
      var signLord = D.RASHIS[g.rashi].lord;
      var exaltHere = null;
      Object.keys(D.GRAHAS).forEach(function (k) {
        if (D.GRAHAS[k].exalt && D.GRAHAS[k].exalt.rashi === g.rashi) exaltHere = k;
      });
      var reasons = [];
      [signLord, exaltHere].forEach(function (k) {
        if (!k) return;
        var fromLagna = bhavaOfGraha(chart, k);
        var fromMoonH = fromMoon(chart, k);
        if (KENDRA.indexOf(fromLagna) >= 0) reasons.push(sa(k) + ' в кендре от лагны');
        else if (KENDRA.indexOf(fromMoonH) >= 0) reasons.push(sa(k) + ' в кендре от Луны');
      });
      if (reasons.length) {
        out.push({
          id: 'neecha-bhanga-' + key, title: 'Нича-бханга: ' + sa(key), group: 'Снятия',
          rule: 'Дебилитированная граха, но хозяин её раши или граха, экзальтирующая в нём, ' +
                'стоит в кендре от лагны или от Луны',
          detail: sa(key) + ' в дебилитации (' + g.rashiName + '), снятие: ' + reasons.join('; '),
          meaning: 'Слабое положение не отменяется, но перестаёт быть приговором: то, что ' +
                   'давалось тяжело в начале, часто становится сильной стороной позже.',
          weight: 2
        });
      } else {
        out.push({
          id: 'neecha-' + key, title: 'Дебилитация без снятия: ' + sa(key), group: 'Напряжения',
          rule: 'Граха в раши дебилитации, условий нича-бханги не нашлось',
          detail: sa(key) + ' в ' + g.rashiName + ' ' + g.dms + ', бхава ' + g.bhava,
          meaning: 'Темы этой грахи требуют больше усилий, чем у других. Это не запрет, ' +
                   'а место, где придётся учиться дольше.',
          adverse: true, weight: 1
        });
      }
    });
    return out;
  }

  /**
   * Все найденные йоги, отсортированные по весу.
   * @returns {{list: Array, strong: Array, adverse: Array, counts: Object}}
   */
  function findAll(chart) {
    var list = []
      .concat(mahapurusha(chart))
      .concat(raja(chart))
      .concat(dhana(chart))
      .concat(pairs(chart))
      .concat(groups(chart))
      .concat(viparita(chart))
      .concat(neechaBhanga(chart));

    list.sort(function (a, b) {
      if (!!a.adverse !== !!b.adverse) return a.adverse ? 1 : -1;
      return b.weight - a.weight;
    });

    var counts = {};
    list.forEach(function (y) { counts[y.group] = (counts[y.group] || 0) + 1; });

    return {
      list: list,
      strong: list.filter(function (y) { return y.weight >= 3 && !y.adverse; }),
      adverse: list.filter(function (y) { return y.adverse; }),
      counts: counts
    };
  }

  root.ArunaYogas = {
    findAll: findAll, lordOf: lordOf, benefics: benefics, moonIsBenefic: moonIsBenefic
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
