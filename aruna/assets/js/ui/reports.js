/*
 * Аруна · отрисовка платных разборов
 * ------------------------------------------------------------------
 * Каждый разбор строится в двух видах: полный и короткий (preview).
 * Короткий — то, что видно до оплаты: он честно показывает начало
 * настоящего разбора, а не размытую картинку. Полный в DOM до оплаты
 * не попадает.
 *
 * ВАЖНО для будущего бэкенда: пока проверка доступа живёт в браузере,
 * и её можно обойти, отредактировав страницу. Это нормально для
 * витрины, но когда подключите оплату — полные тексты должны приходить
 * с сервера после проверки покупки, а не считаться здесь.
 */
(function (root, doc) {
  'use strict';

  var S = root.Aruna, D = root.ArunaData, A = root.ArunaAstro,
      Y = root.ArunaYogas, St = root.ArunaStrength, F = root.ArunaForecast,
      Tz = root.ArunaTz;

  function dateShort(jd) {
    var c = A.fromJulianDay(jd);
    var m = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    return c.d + ' ' + m[c.m - 1] + ' ' + c.y;
  }
  function dot(key) {
    return '<span class="graha-dot" style="background:' + D.GRAHAS[key].color + '"></span>';
  }

  /* --------------------------------------------------------------- йоги */
  function yogaCard(y) {
    return '<article class="yoga' + (y.adverse ? ' yoga--adverse' : '') + '">' +
      '<div class="yoga__head">' +
        '<h4>' + S.esc(y.title) + '</h4>' +
        '<span class="chip' + (y.adverse ? '' : ' chip--gold') + '">' + S.esc(y.group) + '</span>' +
      '</div>' +
      '<p class="yoga__rule"><b>Правило:</b> ' + S.esc(y.rule) + '</p>' +
      '<p class="yoga__detail">' + S.esc(y.detail) + '</p>' +
      '<p class="yoga__meaning">' + S.esc(y.meaning) + '</p>' +
    '</article>';
  }

  function yogas(chart) {
    var r = Y.findAll(chart);
    var head =
      '<div class="panel__head"><h2>Йоги карты</h2>' +
      '<p class="tiny muted">найдено ' + r.list.length + ' · сильных ' + r.strong.length +
      ' · напряжённых ' + r.adverse.length + '</p></div>';

    var full = '<div class="panel">' + head +
      '<div class="yoga-list">' + r.list.map(yogaCard).join('') + '</div>' +
      '<p class="tiny muted" style="margin-top:14px">' +
      'Раджа-йоги встречаются чаще, чем принято думать: важен не сам факт, а сила ' +
      'участвующих грах и то, идёт ли сейчас их период в даше. Смотрите этот список ' +
      'вместе с разбором силы грах.</p></div>';

    var preview = '<div class="panel">' + head +
      '<div class="yoga-list">' + r.list.slice(0, 1).map(yogaCard).join('') + '</div></div>';

    return { full: full, preview: preview, count: r.list.length };
  }

  /* ---------------------------------------------------------- сила грах */
  function strengthRow(g) {
    var meta = D.GRAHAS[g.key];
    return '<div class="str">' +
      '<div class="str__name">' + dot(g.key) + ' ' + S.esc(meta.sa) + '</div>' +
      '<div class="str__track"><span class="str__fill" style="width:' + g.score + '%;background:' +
        meta.color + '"></span></div>' +
      '<div class="str__score">' + g.score + '</div>' +
      '<div class="str__band muted small">' + S.esc(g.band) + '</div>' +
      '<div class="str__parts">' + g.parts.map(function (p) {
        return '<span title="' + S.esc(p.note) + '">' + S.esc(p.title) + ' ' +
               Math.round(p.value * 100) + '</span>';
      }).join('') + '</div>' +
      '<p class="str__why tiny muted">' + g.parts.map(function (p) {
        return S.esc(p.title) + ': ' + S.esc(p.note);
      }).join(' · ') + '</p>' +
    '</div>';
  }

  function strength(chart) {
    var r = St.all(chart);
    var head = '<div class="panel__head"><h2>Сила грах</h2>' +
      '<p class="tiny muted">сводный индекс, не классическая Шад-бала</p></div>';

    var full = '<div class="panel">' + head +
      '<ul class="ticks" style="margin-top:0">' +
        '<li>Крепче всех — <b>' + S.esc(D.GRAHAS[r.strongest.key].sa) + '</b> (' + r.strongest.score +
          '): её темы даются легче остальных, а её период в даше обычно проходит ровно.</li>' +
        '<li>Слабее всех — <b>' + S.esc(D.GRAHAS[r.weakest.key].sa) + '</b> (' + r.weakest.score +
          '): здесь придётся добирать усилием то, что другим достаётся само.</li>' +
        '<li>Хозяин лагны — <b>' + S.esc(D.GRAHAS[r.lagnaLord.key].sa) + '</b> (' + r.lagnaLord.score +
          '): по нему судят об общем тонусе карты.</li>' +
      '</ul>' +
      '<div class="str-list">' + r.sorted.map(strengthRow).join('') + '</div>' +
      '<p class="tiny muted" style="margin-top:14px">' +
      'Составляющие: достоинство в раши, дигбала (насколько граха далеко от своей лучшей ' +
      'бхавы), движение, положение по бхавам и близость к Солнцу. Индекс сравнивает грахи ' +
      'внутри одной карты, между разными картами его складывать не стоит.</p></div>';

    var preview = '<div class="panel">' + head +
      '<div class="str-list">' + r.sorted.slice(0, 2).map(strengthRow).join('') + '</div></div>';

    return { full: full, preview: preview };
  }

  /* ---------------------------------------------------------- год вперёд */
  function forecast(chart, jdNow) {
    var f = F.yearAhead(chart, jdNow, 12);
    var head = '<div class="panel__head"><h2>Год вперёд</h2>' +
      '<p class="tiny muted">' + dateShort(f.from) + ' — ' + dateShort(f.to) + '</p></div>';

    var ss = f.sadeSati;
    var ssHtml = '<div class="note-box' + (ss.active ? ' note-box--warn' : '') + '">' +
      '<h4>Саде-сати</h4>' +
      (ss.active
        ? '<p>Идёт сейчас: Шани в <b>' + ss.saturnHouseFromMoon + '-й бхаве от вашей Луны</b>. ' +
          S.esc(ss.phase) + '.</p>' +
          '<p class="tiny muted">Отрезок начался ' + dateShort(ss.start) + ' и закончится ' +
          dateShort(ss.end) + '. Традиция описывает его не как наказание, а как долгую ' +
          'уборку: то, что держалось на честном слове, придётся переложить на настоящую опору.</p>'
        : '<p>Сейчас не идёт. Шани стоит в ' + ss.saturnHouseFromMoon + '-й бхаве от вашей Луны.</p>' +
          (ss.next ? '<p class="tiny muted">Следующий отрезок начнётся около ' + dateShort(ss.next) +
                     ' — это известно заранее, потому что Шани движется медленно и предсказуемо.</p>' : '')) +
      '</div>';

    var dash;
    if (f.dashaChanges.length) {
      dash = '<ul class="timeline">' + f.dashaChanges.map(function (c) {
        return '<li><span class="timeline__date">' + dateShort(c.jd) + '</span>' +
          '<span class="timeline__what">' + dot(c.lord) + ' ' +
          (c.kind === 'maha' ? 'начинается махадаша ' : 'начинается антардаша ') +
          '<b>' + S.esc(D.GRAHAS[c.lord].sa) + '</b>' +
          (c.maha ? ' <span class="muted">внутри махи ' + S.esc(D.GRAHAS[c.maha].sa) + '</span>' : '') +
          '</span></li>';
      }).join('') + '</ul>';
    } else {
      dash = '<p>За ближайший год периоды не сменятся: идёт антардаша ' +
        '<b>' + S.esc(D.GRAHAS[f.current.antar.lord].sa) + '</b> внутри махадаши ' +
        '<b>' + S.esc(D.GRAHAS[f.current.maha.lord].sa) + '</b> — до ' +
        dateShort(f.current.antar.to) + '.</p>' +
        (f.nextChange ? '<p class="tiny muted">Ближайшая смена — ' + dateShort(f.nextChange.jd) +
          ', начнётся антардаша ' + S.esc(D.GRAHAS[f.nextChange.lord].sa) + '.</p>' : '');
    }

    var ing = f.ingresses.length
      ? '<ul class="timeline">' + f.ingresses.map(function (i) {
          var slow = i.graha === 'jupiter' || i.graha === 'saturn';
          return '<li><span class="timeline__date">' + dateShort(i.jd) + '</span>' +
            '<span class="timeline__what">' + dot(i.graha) + ' <b>' +
            S.esc(D.GRAHAS[i.graha].sa) + '</b> входит в ' + S.esc(i.rashiName) +
            ' — это <b>' + i.fromLagna + '-я бхава</b> от вашей лагны и ' + i.fromMoon +
            '-я от Луны' + (slow && i.back ? ' <span class="muted">(попятным движением, назад)</span>' : '') +
            '<br><span class="muted small">' + S.esc(D.BHAVAS[i.fromLagna - 1].about) + '</span>' +
            '</span></li>';
        }).join('') + '</ul>'
      : '<p class="muted">Гуру, Шани и Раху за этот год раши не меняют — обстановка держится ровной.</p>';

    var full = '<div class="panel">' + head +
      ssHtml +
      '<h3 class="sub">Смены периодов</h3>' + dash +
      '<h3 class="sub">Переходы медленных грах</h3>' + ing +
      '<p class="tiny muted" style="margin-top:14px">' +
      'Даты переходов посчитаны по эфемериде и не зависят от толкования. Что именно ' +
      'произойдёт — расчёт не знает и знать не может: он показывает, когда меняется ' +
      'обстановка, а не что вы в ней сделаете.</p></div>';

    var preview = '<div class="panel">' + head + ssHtml + '</div>';

    return { full: full, preview: preview };
  }

  S.Reports = { yogas: yogas, strength: strength, forecast: forecast, dateShort: dateShort };
})(typeof globalThis !== 'undefined' ? globalThis : this, document);
