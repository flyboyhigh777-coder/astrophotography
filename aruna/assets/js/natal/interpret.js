/*
 * Аруна · западная карта: толкования
 * ==================================================================
 * Почему здесь нет готовых абзацев вида «Солнце в Овне». Их нужно
 * было бы или написать больше тысячи, или у кого-то взять. Первое —
 * месяцы работы ради текста, который всё равно читается как гороскоп
 * из журнала; второе — чужое авторское право.
 *
 * Поэтому текст собирается из опорных слов по правилу:
 *
 *   планета  — что она в человеке делает и в чём её тень
 *   знак     — каким способом она это делает
 *   дом      — в какой области жизни это видно
 *   аспект   — на каких условиях она работает с другой планетой
 *   достоинство — свободно ей это даётся или через силу
 *
 * Правило показывается рядом с выводом: видно, из чего он получился.
 * Это та же честность, что и в джйотише на этом сайте, где рядом с
 * йогой стоит формулировка, по которой её нашли.
 *
 * Такой текст не притворяется живым астрологом. Он и не должен: на
 * странице прямо сказано, что это сборка по правилам, а разговор
 * живыми словами — отдельно, у Дипы.
 */
(function (root) {
  'use strict';

  var D = root.ArunaNatalData;

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  /* ------------------------------------------------- планета в знаке */

  function planetInSign(chart, key) {
    var p = chart.planets[key];
    if (!p) return null;
    var m = p.meta, s = D.SIGNS[p.sign];
    var el = D.ELEMENTS[s.element], md = D.MODES[s.mode];
    return {
      title: m.ru + ' в ' + s.in,
      rule: m.ru + ' — ' + m.does + '. ' + s.ru + ' — ' + el.ru + ', ' + md.ru + ' знак: ' +
            s.about + '.',
      text: cap(m.need) + ' — и способ здесь ' + s.style + '. ' + cap(m.does) + ' — ' +
            'но так, как это делает ' + s.ru + ': ' + s.about + '. ' +
            'Тень этого сочетания — ' + m.shadow + '.',
      keys: s.keys
    };
  }

  /* -------------------------------------------------- планета в доме */

  function planetInHouse(chart, key) {
    var p = chart.planets[key];
    if (!p || !p.house) return null;
    var m = p.meta, h = D.HOUSES[p.house - 1];
    return {
      title: m.ru + ' в ' + p.house + '-м доме',
      rule: h.ru + ' — ' + h.title + ': ' + h.about + '.',
      text: 'Область, где это заметнее всего, — ' + h.title + ': ' + h.about + '. ' +
            cap(m.domain) + ' у вас читается прежде всего отсюда.' +
            (h.angular ? ' Дом угловой — значит, видно сразу и другим людям тоже.' : '')
    };
  }

  /* ------------------------------------------------------- аспект */

  var NATURE_WORD = {
    hard: 'Аспект напряжённый: эти две стороны не складываются сами и требуют работы.',
    soft: 'Аспект гармоничный: связь даётся легко — и потому легко остаётся неиспользованной.',
    neutral: 'Аспект смешанный: всё зависит от того, что за планеты сошлись.'
  };

  function aspect(chart, x) {
    var am = D.PLANETS[x.a], bm = D.PLANETS[x.b];
    var aName = am ? am.ru : x.aRu, bName = bm ? bm.ru : x.bRu;
    var aDoes = am ? am.does : 'задаёт направление жизни';
    var bDoes = bm ? bm.does : 'задаёт направление жизни';
    var asp = D.aspectByKey(x.aspect);
    var tight = x.orbDiff < 1 ? ' Орб меньше градуса — аспект точный, и слышно его отчётливо.'
              : x.orbDiff > x.orbAllowed * 0.75 ? ' Орб широкий: аспект есть, но фоном.' : '';
    return {
      title: aName + ' ' + x.glyph + ' ' + bName,
      rule: 'Угол ' + x.exact.toFixed(1) + '° при ожидаемых ' + x.angle + '°, ' +
            'орб ' + x.orbDiff.toFixed(1) + '° из допустимых ' + x.orbAllowed.toFixed(1) + '°.',
      text: cap(aDoes) + '; ' + bDoes + '. ' + asp.about.charAt(0).toUpperCase() +
            asp.about.slice(1) + '. ' + NATURE_WORD[x.nature] + tight +
            (x.applying === true ? ' Аспект сходящийся: его тема ещё набирает силу.'
             : x.applying === false ? ' Аспект расходящийся: его тема уже прозвучала и работает как данность.' : '')
    };
  }

  /* --------------------------------------------------- общий портрет */

  /**
   * Первые фразы о карте: то, с чего астролог начинает, глядя издали.
   * Ровно четыре вещи — светила, асцендент, стихии, рисунок.
   */
  function opening(chart, shape) {
    var out = [];
    var sun = chart.planets.sun, moon = chart.planets.moon;
    var asc = chart.angles.asc;
    out.push({
      title: 'Три опоры',
      text: 'Солнце в ' + D.SIGNS[sun.sign].in + ' — это про то, ради чего; ' +
            'Луна в ' + D.SIGNS[moon.sign].in + ' — про то, чем человек живёт изо дня в день; ' +
            'асцендент в ' + D.SIGNS[asc.sign].in + ' — про то, каким его встречают. ' +
            'Эти три знака и есть скелет карты, всё остальное — подробности.',
      rule: 'Солнце, Луна и асцендент — классическая тройка, с которой начинают чтение.'
    });

    var b = chart.balance;
    var strong = D.ELEMENTS[b.strongElement], weak = D.ELEMENTS[b.weakElement];
    var miss = b.missingElements.map(function (k) { return D.ELEMENTS[k].ru; });
    out.push({
      title: 'Стихии и кресты',
      text: 'Больше всего ' + strong.ru + ' — ' + strong.about + '. ' +
            (miss.length
              ? 'Почти нет: ' + miss.join(', ') + '. Недостающая стихия обычно приходит через ' +
                'других людей и через то, что человек в себе не замечает.'
              : 'Явного перекоса нет: стихии разложены довольно ровно.') +
            ' Крест по большей части ' + D.MODES[b.strongMode].ru + ' — он ' +
            D.MODES[b.strongMode].about + '.',
      rule: 'Доли считаются по весам: светила весят 3, личные планеты 2, социальные 1,5, ' +
            'дальние 0,5 — иначе поколенческие планеты перетянут картину на себя.'
    });

    if (shape) {
      out.push({ title: 'Рисунок карты: ' + shape.ru, text: shape.about,
        rule: 'Занятая дуга ' + shape.span.toFixed(0) + '°, наибольший разрыв ' +
              shape.gaps[0].size.toFixed(0) + '°.' });
    }

    var h = chart.hemispheres;
    if (h.leaning) {
      var lean = {
        'восток': 'Планеты собраны в восточной половине: человек чаще начинает сам, ' +
                  'чем отзывается на чужое.',
        'запад': 'Планеты собраны в западной половине: многое приходит через других, ' +
                 'и это не слабость, а устройство.',
        'верх': 'Планеты над горизонтом: жизнь идёт на виду, и признание значит много.',
        'низ': 'Планеты под горизонтом: главное происходит внутри и в близком кругу.'
      }[h.leaning];
      out.push({ title: 'Полушария', text: lean,
        rule: 'Перекос считается от семи десятых: восток ' + h.east + ', запад ' + h.west +
              ', над горизонтом ' + h.above + ', под ' + h.below + '.' });
    }
    return out;
  }

  /** Достоинство словами. */
  function dignityLine(row) {
    if (row.peregrine) {
      return row.ru + ' перегрин: ни одного достоинства в этом градусе. ' +
             'Планета работает без собственной опоры — по обстоятельствам, а не по своей природе.';
    }
    var good = row.dignities.map(function (d) { return d.ru; });
    var bad = row.debilities.map(function (d) { return d.ru; });
    var s = row.ru + ' в ' + (row.signIn || row.signRu) + ': ';
    if (good.length) s += good.join(', ') + ' (' + row.score + ' очк.)';
    if (bad.length) s += (good.length ? '; но ' : '') + bad.join(' и ') +
      ' — здесь планета делает своё дело чужим способом';
    return s + '.';
  }

  /* ------------------------------------------------- бесплатный слой */

  /**
   * Что показывается всем: это расчёт и прямые выводы из него.
   * Граница та же, что во всём проекте: считается — бесплатно,
   * разбирается — за биджи.
   */
  function free(chart, aspects, shape) {
    return {
      opening: opening(chart, shape),
      sun: planetInSign(chart, 'sun'),
      moon: planetInSign(chart, 'moon'),
      asc: {
        title: 'Асцендент в ' + D.SIGNS[chart.angles.asc.sign].in,
        rule: 'Асцендент — знак, восходивший на востоке в минуту рождения.',
        text: 'Первое, что о вас считывают: ' + D.SIGNS[chart.angles.asc.sign].about + '. ' +
              'Управитель карты — ' + (chart.chartRuler ? chart.chartRuler.ru + ', и он стоит в ' +
              chart.chartRuler.house + '-м доме: туда и смотрит вся карта.' : '—')
      },
      tightest: aspects.list.slice(0, 3).map(function (x) { return aspect(chart, x); })
    };
  }

  root.ArunaInterpret = {
    planetInSign: planetInSign, planetInHouse: planetInHouse, aspect: aspect,
    opening: opening, dignityLine: dignityLine, free: free
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
