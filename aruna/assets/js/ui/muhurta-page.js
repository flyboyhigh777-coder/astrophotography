/*
 * Аруна · страница подбора времени
 * ------------------------------------------------------------------
 * Сегодняшний день разбирается бесплатно — это и демонстрация, и
 * настоящая польза. Любая другая дата — отдельный разбор за биджу:
 * граница простая и её не нужно объяснять отдельной таблицей.
 */
(function (root, doc) {
  'use strict';

  var S = root.Aruna, M = root.ArunaMuhurta, Tz = root.ArunaTz,
      Cities = root.ArunaCities, D = root.ArunaData, Acc = root.ArunaAccess;

  var place = null, chart = null;

  function todayKey(tz) { return S.dayKey(Date.now(), tz); }

  function hm(jd, tz) { return Tz.jdToLocalHm(jd, tz); }

  /** Полоса дня: цвет отрезка по оценке. */
  function bar(r, tz) {
    var from = r.slots[0].from, to = r.slots[r.slots.length - 1].to;
    var span = to - from;
    return '<div class="daybar" role="img" aria-label="Оценка дня по получасовым отрезкам">' +
      r.windows.map(function (w) {
        var pct = (w.to - w.from) / span * 100;
        var level = w.score >= 4 ? 'a' : w.score >= 2 ? 'b' : w.score >= 0 ? 'c' : w.score >= -2 ? 'd' : 'e';
        return '<span class="daybar__seg daybar__seg--' + level + '" style="width:' + pct + '%" ' +
               'title="' + S.esc(hm(w.from, tz) + '—' + hm(w.to, tz) + ', балл ' + w.score) + '"></span>';
      }).join('') +
    '</div>' +
    '<div class="daybar__scale"><span>' + hm(from, tz) + '</span><span>' + hm(to, tz) + '</span></div>';
  }

  function windowCard(w, tz, kind) {
    return '<div class="win win--' + kind + '">' +
      '<p class="win__time">' + hm(w.from, tz) + ' — ' + hm(w.to, tz) +
        '<span class="win__score">' + (w.score > 0 ? '+' : '') + w.score + '</span></p>' +
      '<ul class="win__why">' + w.reasons.filter(function (x) { return x.w !== 0; })
        .sort(function (a, b) { return b.w - a.w; })
        .map(function (x) {
          return '<li class="' + (x.w > 0 ? 'plus' : 'minus') + '">' +
                 (x.w > 0 ? '+' : '') + x.w + ' · ' + S.esc(x.t) + '</li>';
        }).join('') + '</ul>' +
    '</div>';
  }

  function reportHtml(r, tz, dateLabel) {
    var pan = r.panchanga;
    var head = '<div class="panel"><div class="panel__head">' +
      '<h2>' + S.esc(r.task.title) + ' · ' + S.esc(dateLabel) + '</h2>' +
      '<p class="tiny muted">' + (r.personal ? 'с учётом вашей карты' : 'общий день, без карты') + '</p>' +
      '</div>';

    var facts = '<dl class="kv">' +
      '<dt>Вара</dt><dd>' + (pan.vara ? S.esc(pan.vara.sa + ' · ' + pan.vara.ru) : '—') + '</dd>' +
      '<dt>Титхи</dt><dd>' + S.esc(pan.tithi.name + ' · ' + pan.tithi.pakshaRu) + '</dd>' +
      '<dt>Накшатра</dt><dd>' + S.esc(pan.nakshatra.name) + '</dd>' +
      '<dt>Восход · закат</dt><dd>' + hm(pan.sunrise, tz) + ' · ' + hm(pan.sunset, tz) + '</dd>' +
      '</dl>';

    return head + facts + bar(r, tz) +
      '<h3 class="sub">Лучшее время</h3>' +
      '<div class="win-list">' + r.best.map(function (w) { return windowCard(w, tz, 'good'); }).join('') + '</div>' +
      '<h3 class="sub">Чего лучше избежать</h3>' +
      '<div class="win-list">' + r.worst.map(function (w) { return windowCard(w, tz, 'bad'); }).join('') + '</div>' +
      '<h3 class="sub">Весь день по отрезкам</h3>' +
      '<div class="win-list win-list--all">' +
        r.windows.map(function (w) {
          return '<div class="win win--plain"><p class="win__time">' + hm(w.from, tz) + ' — ' +
            hm(w.to, tz) + '<span class="win__score">' + (w.score > 0 ? '+' : '') + w.score +
            '</span></p></div>';
        }).join('') +
      '</div>' +
      '<p class="tiny muted" style="margin-top:16px">' +
      'Оценка — сумма правил, а не предсказание. Она говорит, где небо помогает, ' +
      'а где придётся грести самому: решение всё равно ваше.</p>' +
      '</div>';
  }

  function previewHtml(r, tz, dateLabel) {
    var pan = r.panchanga;
    return '<div class="panel"><div class="panel__head">' +
      '<h2>' + S.esc(r.task.title) + ' · ' + S.esc(dateLabel) + '</h2>' +
      '<p class="tiny muted">' + (r.personal ? 'с учётом вашей карты' : 'общий день') + '</p></div>' +
      '<dl class="kv"><dt>Вара</dt><dd>' + (pan.vara ? S.esc(pan.vara.sa) : '—') + '</dd>' +
      '<dt>Титхи</dt><dd>' + S.esc(pan.tithi.name) + '</dd></dl>' +
      bar(r, tz) + '</div>';
  }

  /* ------------------------------------------------------------ отрисовка */
  function run() {
    var out = doc.getElementById('results');
    var err = doc.getElementById('mError');
    var dateStr = doc.getElementById('mDate').value;
    if (!place) { err.textContent = 'Выберите место из списка.'; err.hidden = false; return; }
    if (!dateStr) { err.textContent = 'Укажите дату.'; err.hidden = false; return; }
    err.hidden = true;

    var d = dateStr.split('-').map(Number);
    var utcMs = Tz.zonedToUtcMs(d[0], d[1], d[2], 12, 0, place.tz);
    var r = M.scoreDay({
      jd: Tz.msToJd(utcMs), lat: place.lat, lon: place.lon, tz: place.tz,
      task: doc.getElementById('mTask').value, chart: chart
    });
    if (!r) {
      out.innerHTML = '<div class="empty-state"><h3>В этот день солнце не восходит или не заходит</h3>' +
        '<p>На полярных широтах отрезки дня по восходу и закату не строятся.</p></div>';
      return;
    }

    var label = S.dateRu(utcMs, place.tz).replace(/\s*г\.$/, '');
    var isToday = dateStr === todayKey(place.tz);

    if (isToday) {
      out.innerHTML =
        '<div class="note-box"><h4>Сегодня — бесплатно</h4>' +
        '<p>Разбор текущего дня открыт всегда и полностью. Другие даты считаются ' +
        'отдельно — так понятнее, за что берут деньги.</p></div>' +
        reportHtml(r, place.tz, label);
    } else {
      out.innerHTML = S.Paywall.section('muhurta.pick',
        reportHtml(r, place.tz, label), previewHtml(r, place.tz, label));
      S.Paywall.bind(out, run);
      if (S.Glossary) S.Glossary.apply(out);
    }
    renderWallet();
  }

  function renderWallet() {
    var box = doc.getElementById('walletBox');
    if (!box) return;
    box.innerHTML = S.Paywall.wallet() +
      '<p class="tiny muted" style="margin-top:10px">Сегодняшний день бесплатный, ' +
      'любой другой — ' + Acc.seeds(Acc.feature('muhurta.pick').price) +
      '. <a href="pricing.html">Тарифы</a></p>';
  }

  /* ----------------------------------------------------------- поиск места */
  function setupPlace() {
    var input = doc.getElementById('mPlace'), list = doc.getElementById('mList');
    var matches = [], active = -1;

    function close() { list.classList.remove('is-open'); input.setAttribute('aria-expanded', 'false'); active = -1; }
    function choose(c) {
      place = c; input.value = c.name; close(); updateHint();
    }
    input.addEventListener('input', function () {
      var q = input.value.trim();
      place = null;
      if (q.length < 2) { close(); return; }
      matches = Cities.search(q, 8);
      list.innerHTML = matches.length
        ? matches.map(function (c, i) {
            return '<button type="button" role="option" data-i="' + i + '">' +
              S.esc(c.name) + '<span>' + S.esc(c.region) + '</span></button>';
          }).join('')
        : '<p class="place-list__empty">Такого города нет в списке.</p>';
      list.classList.add('is-open');
      input.setAttribute('aria-expanded', 'true');
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

  function updateHint() {
    var hint = doc.getElementById('mHint');
    if (!hint) return;
    var parts = [];
    if (place) parts.push(place.tz);
    parts.push(chart ? 'ваша карта учитывается: добавлены тара- и чандра-бала'
                     : 'карта не задана — считается общий день; постройте карту, и разбор станет личным');
    hint.textContent = parts.join(' · ');
  }

  function start() {
    var sel = doc.getElementById('mTask');
    if (!sel) return;
    sel.innerHTML = M.TASKS.map(function (t) {
      return '<option value="' + t.id + '">' + S.esc(t.title) + '</option>';
    }).join('');
    sel.addEventListener('change', function () {
      doc.getElementById('mTaskAbout').textContent = M.taskById(sel.value).about;
    });
    doc.getElementById('mTaskAbout').textContent = M.TASKS[0].about;

    var saved = S.loadBirth();
    if (saved) {
      try { chart = S.chartFromBirth(saved).chart; } catch (e) { chart = null; }
      place = saved.place;
      doc.getElementById('mPlace').value = saved.place.name;
    } else {
      place = S.guessPlace();
      doc.getElementById('mPlace').value = place.name;
    }

    var now = Tz.utcMsToZoned(Date.now(), place.tz);
    doc.getElementById('mDate').value = now.y + '-' + String(now.m).padStart(2, '0') +
      '-' + String(now.d).padStart(2, '0');

    setupPlace();
    updateHint();
    renderWallet();

    doc.getElementById('muhurtaPanel').addEventListener('submit', function (e) {
      e.preventDefault();
      try { run(); }
      catch (ex) {
        var err = doc.getElementById('mError');
        err.textContent = 'Не удалось разобрать день: ' + ex.message;
        err.hidden = false;
        if (root.console) root.console.error(ex);
      }
    });

    run();
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
  else start();
})(typeof globalThis !== 'undefined' ? globalThis : this, document);
