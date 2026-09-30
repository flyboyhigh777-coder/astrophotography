/*
 * Аруна · страница подсказки по времени рождения
 * ------------------------------------------------------------------
 * Главное в этой странице — не результат, а честность формулировок.
 * Перебор может ничего не различить, и тогда так и написано: вариантов
 * несколько, выбирайте с живым астрологом.
 */
(function (root, doc) {
  'use strict';

  var S = root.Aruna, R = root.ArunaRectify, D = root.ArunaData,
      Cities = root.ArunaCities, Acc = root.ArunaAccess;

  var place = null, rows = [];

  var EXAMPLE = {
    date: '1975-06-15',
    place: { name: 'Москва', lat: 55.7558, lon: 37.6176, tz: 'Europe/Moscow' },
    events: [
      { type: 'marriage', date: '2001-08-18' },
      { type: 'child', date: '2004-03-11' },
      { type: 'job', date: '2009-09-01' },
      { type: 'move', date: '2014-05-20' }
    ]
  };

  function hm(minutes) {
    var m = Math.round(minutes);
    return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  }

  /* --------------------------------------------------------- события */
  function renderEvents() {
    var host = doc.getElementById('eventList');
    host.innerHTML = rows.map(function (r, i) {
      return '<div class="event-row" data-i="' + i + '">' +
        '<select class="input" data-role="type" aria-label="Что произошло">' +
          R.EVENTS.map(function (e) {
            return '<option value="' + e.id + '"' + (e.id === r.type ? ' selected' : '') + '>' +
              S.esc(e.title) + '</option>';
          }).join('') +
        '</select>' +
        '<input class="input" type="date" data-role="date" value="' + S.esc(r.date || '') +
          '" min="1900-01-01" max="2100-12-31" aria-label="Когда">' +
        '<button class="btn btn--quiet btn--sm" type="button" data-role="del" ' +
          'aria-label="Убрать событие">×</button>' +
      '</div>';
    }).join('') || '<p class="muted small">Пока ни одного события. Добавьте хотя бы три.</p>';
  }

  function readEvents() {
    S.qa('.event-row').forEach(function (el) {
      var i = +el.dataset.i;
      rows[i].type = S.q('[data-role="type"]', el).value;
      rows[i].date = S.q('[data-role="date"]', el).value;
    });
    return rows.filter(function (r) { return r.type && r.date; });
  }

  /* ------------------------------------------------------------ вывод */
  function resultHtml(res, windowLabel) {
    var maxLagna = res.byLagna[0];
    var second = res.byLagna[1];
    var gap = second ? maxLagna.best - second.best : maxLagna.best;

    var verdict;
    if (!res.confident) {
      verdict = '<div class="note-box note-box--warn"><h4>Перебор не различил вариантов</h4>' +
        '<p>Разброс очков слишком мал: лучший вариант почти не отличается от среднего. ' +
        'Это бывает, когда событий мало или они относятся к близким бхавам. ' +
        'Добавьте ещё событий — и особенно разнородных: работу, переезд, рождение ребёнка.</p></div>';
    } else if (gap >= 4) {
      verdict = '<div class="note-box"><h4>Один вариант заметно впереди</h4>' +
        '<p>Лагна <b>' + S.esc(maxLagna.lagnaName) + '</b> согласуется с вашими событиями ' +
        'лучше остальных: ' + maxLagna.best + ' очков против ' + (second ? second.best : 0) +
        ' у следующей. Это хорошая рабочая гипотеза — но проверьте её с живым астрологом ' +
        'по событиям, которых здесь нет.</p></div>';
    } else {
      verdict = '<div class="note-box"><h4>Два близких варианта</h4>' +
        '<p>Впереди <b>' + S.esc(maxLagna.lagnaName) + '</b> (' + maxLagna.best + '), ' +
        'но <b>' + S.esc(second.lagnaName) + '</b> (' + second.best + ') отстаёт немного. ' +
        'Различить их по этим событиям нельзя — нужны ещё даты или разбор человеком.</p></div>';
    }

    var lagnaRows = res.byLagna.map(function (g) {
      var pct = Math.round(g.best / res.maxPossible * 100);
      return '<div class="str">' +
        '<div class="str__name">' + S.esc(g.lagnaName) + '</div>' +
        '<div class="str__track"><span class="str__fill" style="width:' + pct +
          '%;background:var(--gold)"></span></div>' +
        '<div class="str__score">' + g.best + '</div>' +
        '<div class="str__band muted small">' + hm(g.from) + ' — ' + hm(g.to) + '</div>' +
        '<p class="str__why tiny muted">средний балл по окну ' + g.avg +
          ', максимум возможного ' + res.maxPossible + '</p>' +
      '</div>';
    }).join('');

    var best = res.best;
    var perEvent = best.per.map(function (p) {
      var meta = R.eventById(p.event.type);
      return '<div class="yoga">' +
        '<div class="yoga__head"><h4>' + S.esc(meta.title) + '</h4>' +
          '<span class="chip' + (p.score >= 8 ? ' chip--gold' : '') + '">' +
            p.score + ' / ' + R.MAX_PER_EVENT + '</span></div>' +
        '<p class="yoga__rule"><b>Бхавы события:</b> ' + meta.bhavas.join(', ') +
          ' — ' + S.esc(meta.about) + '</p>' +
        (p.why.length
          ? '<ul class="win__why" style="margin-top:8px">' + p.why.map(function (w) {
              return '<li class="plus">+' + w.w + ' · ' + S.esc(w.t) + '</li>';
            }).join('') + '</ul>'
          : '<p class="tiny muted" style="margin-top:8px">Совпадений не нашлось: ни даша, ' +
            'ни переходы Гуру и Шани не легли на бхавы этого события.</p>') +
      '</div>';
    }).join('');

    var alts = res.candidates.slice(0, 6).map(function (c) {
      return '<div class="win win--plain"><p class="win__time">' + hm(c.minutes) +
        '<span class="win__score">' + c.score + '</span></p>' +
        '<p class="tiny muted" style="margin:6px 0 0">' + S.esc(c.lagnaName) + ' ' +
        S.esc(c.lagnaDms) + '</p></div>';
    }).join('');

    return '<div class="panel">' +
      '<div class="panel__head"><h2>Что показал перебор</h2>' +
        '<p class="tiny muted">' + res.checked + ' вариантов · ' + S.esc(windowLabel) + '</p></div>' +
      verdict +
      '<h3 class="sub">Лагны по согласию с событиями</h3>' +
      '<div class="str-list">' + lagnaRows + '</div>' +
      '<h3 class="sub">Лучший вариант: ' + hm(best.minutes) + ', лагна ' +
        S.esc(best.lagnaName) + ' ' + S.esc(best.lagnaDms) + '</h3>' +
      '<div class="yoga-list">' + perEvent + '</div>' +
      '<h3 class="sub">Другие близкие варианты</h3>' +
      '<div class="win-list win-list--all">' + alts + '</div>' +
      '<p class="tiny muted" style="margin-top:16px">' +
      'Ещё раз о главном: это сужение круга, а не доказательство. Настоящая ректификация ' +
      'учитывает больше событий, варга-карты и то, как человек их пережил — а этого ' +
      'перебор не знает. Возьмите результат как рабочую гипотезу и проверьте её на ' +
      'событиях, которых здесь не было.</p>' +
    '</div>';
  }

  function previewHtml(res) {
    return '<div class="panel">' +
      '<div class="panel__head"><h2>Что показал перебор</h2>' +
        '<p class="tiny muted">' + res.checked + ' вариантов проверено</p></div>' +
      '<div class="note-box"><h4>Результат готов</h4>' +
        '<p>Перебор нашёл ' + res.byLagna.length + ' вариантов лагны. Лучший набрал <b>' +
        res.best.score + '</b> очков из ' + res.maxPossible + ' при среднем ' + res.spread.mean +
        ' — ' + (res.confident ? 'разброс достаточный, чтобы вариант был различим'
                               : 'разброс небольшой, вариантов может быть несколько') + '.</p>' +
      '</div></div>';
  }

  /* ------------------------------------------------------------ запуск */
  function run() {
    var err = doc.getElementById('rError');
    var out = doc.getElementById('results');
    var date = doc.getElementById('rDate').value;
    var events = readEvents();

    if (!date) { err.textContent = 'Укажите дату рождения.'; err.hidden = false; return; }
    if (!place) { err.textContent = 'Выберите место рождения из списка.'; err.hidden = false; return; }
    if (events.length < 2) {
      err.textContent = 'Нужно хотя бы два события с датами — иначе перебору не на что опереться.';
      err.hidden = false; return;
    }
    err.hidden = true;

    var win = doc.getElementById('rWindow');
    var parts = win.value.split('-').map(Number);
    var res = R.run({
      birth: { date: date, place: place },
      events: events,
      fromMinutes: parts[0], toMinutes: parts[1]
    });
    if (!res) { out.innerHTML = ''; return; }

    var label = win.options[win.selectedIndex].text;
    out.innerHTML = S.Paywall.section('rectify.run', resultHtml(res, label), previewHtml(res));
    S.Paywall.bind(out, run);
    if (S.Glossary) S.Glossary.apply(out);
    renderWallet();
    out.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderWallet() {
    var box = doc.getElementById('walletBox');
    if (!box) return;
    box.innerHTML = S.Paywall.wallet() +
      '<p class="tiny muted" style="margin-top:10px">Подсказка по времени — ' +
      Acc.seeds(Acc.feature('rectify.run').price) + ', самый трудоёмкий разбор. ' +
      '<a href="pricing.html">Тарифы</a></p>';
  }

  /* ------------------------------------------------------- поиск места */
  function setupPlace() {
    var input = doc.getElementById('rPlace'), list = doc.getElementById('rList');
    var matches = [], active = -1;
    function close() { list.classList.remove('is-open'); input.setAttribute('aria-expanded', 'false'); active = -1; }
    function choose(c) { place = c; input.value = c.name; close(); }
    input.addEventListener('input', function () {
      var q = input.value.trim(); place = null;
      if (q.length < 2) { close(); return; }
      matches = Cities.search(q, 8);
      list.innerHTML = matches.length
        ? matches.map(function (c, i) {
            return '<button type="button" role="option" data-i="' + i + '">' +
              S.esc(c.name) + '<span>' + S.esc(c.region) + '</span></button>';
          }).join('')
        : '<p class="place-list__empty">Такого города нет в списке.</p>';
      list.classList.add('is-open'); input.setAttribute('aria-expanded', 'true');
    });
    input.addEventListener('keydown', function (e) {
      if (!list.classList.contains('is-open') || !matches.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length;
        S.qa('button', list).forEach(function (b, i) { b.classList.toggle('is-active', i === active); });
      } else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(matches[active]); }
      else if (e.key === 'Escape') close();
    });
    list.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-i]');
      if (b) choose(matches[+b.dataset.i]);
    });
    doc.addEventListener('click', function (e) {
      if (e.target !== input && !list.contains(e.target)) close();
    });
  }

  function start() {
    var panel = doc.getElementById('rectPanel');
    if (!panel) return;

    var saved = S.loadBirth();
    if (saved) {
      doc.getElementById('rDate').value = saved.date;
      place = saved.place;
      doc.getElementById('rPlace').value = saved.place.name;
    }

    rows = [{ type: 'marriage', date: '' }, { type: 'job', date: '' }, { type: 'move', date: '' }];
    renderEvents();
    setupPlace();
    renderWallet();

    doc.getElementById('addEvent').addEventListener('click', function () {
      readEvents();
      rows.push({ type: R.EVENTS[0].id, date: '' });
      renderEvents();
    });
    doc.getElementById('eventList').addEventListener('click', function (e) {
      var b = e.target.closest('[data-role="del"]');
      if (!b) return;
      readEvents();
      rows.splice(+b.closest('.event-row').dataset.i, 1);
      renderEvents();
    });

    panel.addEventListener('submit', function (e) {
      e.preventDefault();
      try { run(); }
      catch (ex) {
        var err = doc.getElementById('rError');
        err.textContent = 'Не удалось перебрать время: ' + ex.message;
        err.hidden = false;
        if (root.console) root.console.error(ex);
      }
    });

    doc.getElementById('exampleBtn').addEventListener('click', function () {
      doc.getElementById('rDate').value = EXAMPLE.date;
      place = EXAMPLE.place;
      doc.getElementById('rPlace').value = EXAMPLE.place.name;
      rows = EXAMPLE.events.slice();
      renderEvents();
      run();
    });
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
  else start();
})(typeof globalThis !== 'undefined' ? globalThis : this, document);
