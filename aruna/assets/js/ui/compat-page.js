/*
 * Аруна · страница совместимости
 * ------------------------------------------------------------------
 * Считает Аштакуту по двум картам и показывает её так, чтобы человек
 * ушёл с пониманием, а не с оценкой. Сильные стороны и зоны напряжения
 * названы прямо, каждая кута объяснена своими словами.
 */
(function (root, doc) {
  'use strict';

  var S = root.Aruna, C = root.ArunaChart, K = root.ArunaAshtakoota,
      D = root.ArunaData, Tz = root.ArunaTz;

  var KEY = 'aruna.pair.v1';
  var EXAMPLE = {
    a: { date: '1988-04-12', time: '14:25', timeKnown: true,
         place: { name: 'Москва', lat: 55.7558, lon: 37.6176, tz: 'Europe/Moscow' } },
    b: { date: '1991-09-03', time: '08:40', timeKnown: true,
         place: { name: 'Санкт-Петербург', lat: 59.9311, lon: 30.3609, tz: 'Europe/Moscow' } }
  };

  var formA, formB;

  function loadPair() {
    try {
      var raw = root.localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function savePair(p) {
    try { root.localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* инкогнито */ }
  }

  function moonLine(ch) {
    var m = ch.grahas.moon;
    var nak = D.NAKSHATRAS[ch.moonNakshatra];
    return m.rashiName + ' ' + m.dms + ' · ' + nak.sa + ', пада ' + m.pada;
  }

  function report(a, b) {
    var chA = S.chartFromBirth(a).chart, chB = S.chartFromBirth(b).chart;
    var r = K.compare(chA, chB);

    /* ---------------------------------------------------- бесплатная часть */
    // Сумма и очки по каждой куте считаются мгновенно — брать за это деньги
    // было бы странно. Платным сделан разбор: почему столько и что с этим делать.
    var scores = r.kootas.map(function (k) {
      var full = k.points >= k.max * 0.75, low = k.points <= k.max * 0.4;
      return '<div class="koota' + (full ? ' koota--full' : '') + (low ? ' koota--low' : '') + '">' +
        '<div><p class="koota__name">' + S.esc(k.title) + '</p>' +
        '<p class="koota__detail">' + S.esc(k.detail) + '</p></div>' +
        '<p class="koota__note muted">' + (low ? 'зона внимания' : full ? 'опора союза' : 'ровно') + '</p>' +
        '<p class="koota__score">' + k.points + ' / ' + k.max + '</p>' +
      '</div>';
    }).join('');

    var free = '' +
    '<div class="panel">' +
      '<div class="panel__head"><h2>Итог сопоставления</h2>' +
        '<p class="tiny muted">Аштакута · 8 кут · максимум 36 гун</p></div>' +
      '<div class="summary" style="grid-template-columns:auto 1fr;align-items:center;gap:22px">' +
        '<div class="score-ring"><span class="score-ring__num">' + r.total + '</span>' +
          '<span class="score-ring__max">из 36 · ' + S.esc(r.band) + ' совместимость</span></div>' +
        '<div class="stat" style="background:transparent;border:0;padding:0">' +
          '<p class="stat__label">Луна первой карты</p>' +
          '<p class="stat__value" style="font-size:1.05rem">' + S.esc(moonLine(chA)) + '</p>' +
          '<p class="stat__label" style="margin-top:12px">Луна второй карты</p>' +
          '<p class="stat__value" style="font-size:1.05rem">' + S.esc(moonLine(chB)) + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="koota-list" style="margin-top:6px">' + scores + '</div>' +
      '<p class="tiny muted" style="margin-top:14px">' +
      'Сумма гун — не допуск и не запрет. Это один из классических фильтров традиции: ' +
      'он собран вокруг накшатры и раши Луны обоих, то есть говорит про ум, ритм и ' +
      'привычки — самое бытовое в отношениях.</p>' +
    '</div>';

    /* -------------------------------------------------------- платная часть */
    var kootas = r.kootas.map(function (k) {
      var full = k.points >= k.max * 0.75, low = k.points <= k.max * 0.4;
      return '<div class="koota' + (full ? ' koota--full' : '') + (low ? ' koota--low' : '') + '">' +
        '<div><p class="koota__name">' + S.esc(k.title) +
          (k.simplified ? ' <span class="muted" title="в источниках есть разночтения; здесь упрощённая симметричная таблица">*</span>' : '') +
          '</p><p class="koota__detail">' + S.esc(k.detail) + '</p></div>' +
        '<p class="koota__note">' + S.esc(k.note) + '</p>' +
        '<p class="koota__score">' + k.points + ' / ' + k.max + '</p>' +
      '</div>';
    }).join('');

    var extras = (K.extras ? K.extras(chA, chB) : []).map(function (e) {
      return '<div class="extra">' +
        '<span class="extra__mark extra__mark--' + (e.ok ? 'ok' : 'no') + '">' +
          (e.ok ? '✓' : '•') + '</span>' +
        '<div class="extra__name">' + S.esc(e.title) + '<span>' + S.esc(e.detail) + '</span></div>' +
        '<p>' + S.esc(e.note) + '</p>' +
      '</div>';
    }).join('');

    var strengths = r.strengths.length
      ? r.strengths.map(function (k) { return k.title.toLowerCase(); }).join(', ')
      : 'ни одна кута не набрала три четверти — опоры союза стоит искать не в сопоставлении, а в разговоре';
    var tensions = r.tensions.length
      ? r.tensions.map(function (k) { return k.title.toLowerCase(); }).join(', ')
      : 'ни одна кута не провалилась — по классике заметных зон напряжения нет';

    var paidFull = '' +
    '<div class="panel">' +
      '<div class="panel__head"><h2>Разбор по каждой куте</h2>' +
        '<p class="tiny muted">за что отвечает каждый слой</p></div>' +
      '<div class="koota-list">' + kootas + '</div>' +
      '<p class="tiny muted" style="margin-top:14px">' +
      '* Варна, тара, граха-майтри, гана, бхакута и нади считаются по общепринятым ' +
      'таблицам. Вашья и йони в источниках расходятся в деталях — здесь взята ' +
      'упрощённая симметричная матрица, и это честнее, чем выдавать один вариант ' +
      'за единственный.</p>' +
    '</div>' +

    '<div class="panel">' +
      '<div class="panel__head"><h2>Доши и дополнительные проверки</h2>' +
        '<p class="tiny muted">то, что традиция смотрит рядом с 36 гунами</p></div>' +
      '<div class="note-box"><h4>Мангала-доша</h4><p>' + S.esc(r.kuja.note) + '</p></div>' +
      '<h3 class="sub">Раджу, махендра, стри-диргха</h3>' +
      '<div class="extras">' + extras + '</div>' +
      '<p class="tiny muted" style="margin-top:14px">' +
      'Ведха (взаимное «протыкание» накшатр) здесь сознательно не считается: ' +
      'опубликованные таблицы пар расходятся между собой, и выдавать один вариант ' +
      'за единственный было бы нечестно.</p>' +
    '</div>' +

    '<div class="panel">' +
      '<div class="panel__head"><h2>Что с этим делать</h2></div>' +
      '<ul class="ticks" style="margin-top:0">' +
        '<li><b>Опоры союза:</b> ' + S.esc(strengths) + '. На это можно рассчитывать в трудный период.</li>' +
        '<li><b>Зоны внимания:</b> ' + S.esc(tensions) + '. Здесь понадобится договорённость вслух, а не надежда на «само сложится».</li>' +
      '</ul>' +
      '<p>Классика советует читать низкие куты не как препятствие, а как указание ' +
      'места: про здоровье и отдых говорит нади, про деньги и быт — бхакута, про ' +
      'телесный ритм — йони, про скорость реакции — гана. Там, где у пары есть слова, ' +
      'редко нужен приговор.</p>' +
      '<p class="muted">И главное, чего не знает ни одна кута: вашу историю, то, как вы ' +
      'миритесь, и умеете ли вы слушать. Эти три вещи в сумме весят больше тридцати ' +
      'шести гун.</p>' +
    '</div>';

    var paidPreview =
    '<div class="panel">' +
      '<div class="panel__head"><h2>Разбор по каждой куте</h2>' +
        '<p class="tiny muted">за что отвечает каждый слой</p></div>' +
      '<div class="koota-list">' +
        r.kootas.slice(0, 1).map(function (k) {
          return '<div class="koota"><div><p class="koota__name">' + S.esc(k.title) + '</p>' +
            '<p class="koota__detail">' + S.esc(k.detail) + '</p></div>' +
            '<p class="koota__note">' + S.esc(k.note) + '</p>' +
            '<p class="koota__score">' + k.points + ' / ' + k.max + '</p></div>';
        }).join('') +
      '</div>' +
    '</div>';

    return free + S.Paywall.section('compat.full', paidFull, paidPreview);
  }

  function render(pair) {
    var out = doc.getElementById('results');
    out.innerHTML = report(pair.a, pair.b);
    S.Paywall.bind(out, function () { render(pair); });
    var box = doc.getElementById('walletBox');
    if (box) {
      box.innerHTML = S.Paywall.wallet() +
        '<p class="tiny muted" style="margin-top:10px">Полный отчёт открывается один раз ' +
        'и остаётся у вас. <a href="pricing.html">Тарифы</a></p>';
    }
    savePair(pair);
  }

  function start() {
    var hostA = doc.getElementById('formA'), hostB = doc.getElementById('formB');
    if (!hostA) return;
    var saved = loadPair();
    var single = S.loadBirth();

    formA = S.BirthForm.create(hostA, { legend: 'Первая карта', value: (saved && saved.a) || single });
    formB = S.BirthForm.create(hostB, { legend: 'Вторая карта', value: saved && saved.b });

    var err = doc.getElementById('formError');
    doc.getElementById('pairPanel').addEventListener('submit', function (e) {
      e.preventDefault();
      var pa = formA.validate(), pb = formB.validate();
      if (pa || pb) {
        err.textContent = (pa ? 'Первая карта: ' + pa + ' ' : '') + (pb ? 'Вторая карта: ' + pb : '');
        err.hidden = false;
        return;
      }
      err.hidden = true;
      try {
        render({ a: formA.getValue(), b: formB.getValue() });
        doc.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (ex) {
        err.textContent = 'Не удалось сопоставить карты: ' + ex.message;
        err.hidden = false;
        if (root.console) root.console.error(ex);
      }
    });

    doc.getElementById('exampleBtn').addEventListener('click', function () {
      formA.setValue(EXAMPLE.a); formB.setValue(EXAMPLE.b);
      render(EXAMPLE);
    });

    if (saved && saved.a && saved.b) { try { render(saved); } catch (e) { /* пустое состояние */ } }
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
  else start();
})(typeof globalThis !== 'undefined' ? globalThis : this, document);
