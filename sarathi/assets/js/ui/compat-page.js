/*
 * Сарати · страница совместимости
 * ------------------------------------------------------------------
 * Считает Аштакуту по двум картам и показывает её так, чтобы человек
 * ушёл с пониманием, а не с оценкой. Сильные стороны и зоны напряжения
 * названы прямо, каждая кута объяснена своими словами.
 */
(function (root, doc) {
  'use strict';

  var S = root.Sarathi, C = root.SarathiChart, K = root.SarathiAshtakoota,
      D = root.SarathiData, Tz = root.SarathiTz;

  var KEY = 'sarathi.pair.v1';
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

    var strengths = r.strengths.length
      ? r.strengths.map(function (k) { return k.title.toLowerCase(); }).join(', ')
      : 'ни одна кута не набрала три четверти — опоры союза стоит искать не в сопоставлении, а в разговоре';
    var tensions = r.tensions.length
      ? r.tensions.map(function (k) { return k.title.toLowerCase(); }).join(', ')
      : 'ни одна кута не провалилась — по классике заметных зон напряжения нет';

    return '' +
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
      '<ul class="ticks" style="margin-bottom:0">' +
        '<li><b>Сильные стороны:</b> ' + S.esc(strengths) + '.</li>' +
        '<li><b>Зоны внимания:</b> ' + S.esc(tensions) + '.</li>' +
        '<li><b>Мангала-доша:</b> ' + S.esc(r.kuja.note) + '</li>' +
      '</ul>' +
    '</div>' +

    '<div class="panel">' +
      '<div class="panel__head"><h2>Восемь кут по отдельности</h2>' +
        '<p class="tiny muted">Каждая отвечает за свой слой отношений</p></div>' +
      '<div class="koota-list">' + kootas + '</div>' +
      '<p class="tiny muted" style="margin-top:14px">' +
      '* Варна, тара, граха-майтри, гана, бхакута и нади считаются по общепринятым таблицам. ' +
      'Вашья и йони в источниках расходятся в деталях — здесь взята упрощённая симметричная ' +
      'матрица, и это честнее, чем выдавать один вариант за единственный.</p>' +
    '</div>' +

    '<div class="panel">' +
      '<div class="panel__head"><h2>Как это читать</h2></div>' +
      '<p>Аштакута — один из фильтров традиции, а не приговор и не гарантия. Он собран вокруг ' +
      'накшатры и раши Луны обоих, то есть говорит про ум, ритм и привычки — самое бытовое ' +
      'в отношениях. Он ничего не знает про вашу историю, про то, как вы миритесь и как умеете ' +
      'слушать.</p>' +
      '<p class="muted">Классика советует смотреть на низкие куты не как на препятствие, а как на ' +
      'место, где паре понадобится договорённость вслух: про здоровье и отдых (нади), про деньги ' +
      'и быт (бхакута), про телесный ритм (йони), про темп реакции (гана). Там, где есть слова, ' +
      'редко нужен приговор.</p>' +
    '</div>';
  }

  function render(pair) {
    doc.getElementById('results').innerHTML = report(pair.a, pair.b);
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
