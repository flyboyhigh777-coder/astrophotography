/*
 * Аруна · форма данных рождения
 * ------------------------------------------------------------------
 * Одна и та же форма нужна на странице карты (одна) и на странице
 * совместимости (две), поэтому она собирается из JS. Место ищется по
 * встроенной базе городов; если города нет — есть ручной ввод координат
 * и выбор зоны из полного списка IANA, который знает браузер.
 */
(function (root, doc) {
  'use strict';

  var S = root.Aruna, Cities = root.ArunaCities, Tz = root.ArunaTz;
  var seq = 0;

  function tzOptions(selected) {
    var list = null;
    try { if (Intl.supportedValuesOf) list = Intl.supportedValuesOf('timeZone'); } catch (e) { list = null; }
    if (!list || !list.length) {
      list = Cities.CITIES.map(function (c) { return c[3]; }).filter(function (v, i, a) {
        return a.indexOf(v) === i;
      }).sort();
    }
    if (selected && list.indexOf(selected) < 0) list = [selected].concat(list);
    return list.map(function (t) {
      return '<option value="' + S.esc(t) + '"' + (t === selected ? ' selected' : '') + '>' +
             S.esc(t) + '</option>';
    }).join('');
  }

  /**
   * Создаёт форму внутри контейнера.
   * @param {Element} host
   * @param {Object} o {legend, value, onChange}
   * @returns {Object} {getValue, setValue, validate, el}
   */
  function create(host, o) {
    o = o || {};
    var id = 'bf' + (++seq);
    var place = (o.value && o.value.place) || null;

    host.innerHTML =
      (o.legend ? '<p class="fieldset__legend">' + S.esc(o.legend) + '</p>' : '') +
      '<div class="field">' +
        '<label for="' + id + 'date">Дата рождения</label>' +
        '<input class="input" type="date" id="' + id + 'date" required ' +
               'min="1900-01-01" max="2100-12-31">' +
      '</div>' +
      '<div class="row-2">' +
        '<div class="field">' +
          '<label for="' + id + 'time">Время</label>' +
          '<input class="input" type="time" id="' + id + 'time" value="12:00">' +
        '</div>' +
        '<div class="field">' +
          '<label for="' + id + 'place">Место рождения</label>' +
          '<input class="input" type="text" id="' + id + 'place" autocomplete="off" ' +
                 'placeholder="Начните вводить город" role="combobox" aria-expanded="false" ' +
                 'aria-autocomplete="list" aria-controls="' + id + 'list">' +
          '<div class="place-list" id="' + id + 'list" role="listbox"></div>' +
        '</div>' +
      '</div>' +
      '<label class="check"><input type="checkbox" id="' + id + 'unknown">' +
        // формулировка общая для обеих астрологий: форма одна и та же и на
        // джйотиш-странице, и на западной, а «раши» там ни о чём не говорят
        '<span>Точное время неизвестно — считать на полдень. Положения планет почти не сдвинутся, ' +
        'а дома и восходящий градус будут приблизительными.</span></label>' +
      '<details class="field">' +
        '<summary class="form-note" style="cursor:pointer">Города нет в списке — ввести координаты</summary>' +
        '<div class="row-2" style="margin-top:10px">' +
          '<div class="field"><label for="' + id + 'lat">Широта, °</label>' +
            '<input class="input" type="number" step="0.0001" min="-90" max="90" id="' + id + 'lat" placeholder="55.7558"></div>' +
          '<div class="field"><label for="' + id + 'lon">Долгота, ° (в.д. +)</label>' +
            '<input class="input" type="number" step="0.0001" min="-180" max="180" id="' + id + 'lon" placeholder="37.6176"></div>' +
        '</div>' +
        '<div class="field" style="margin-top:10px"><label for="' + id + 'tz">Часовая зона</label>' +
          '<select class="input" id="' + id + 'tz">' + tzOptions(place ? place.tz : 'Europe/Moscow') + '</select></div>' +
      '</details>' +
      '<p class="form-note form-note--zone" id="' + id + 'hint"></p>';

    var el = {
      date: doc.getElementById(id + 'date'),
      time: doc.getElementById(id + 'time'),
      place: doc.getElementById(id + 'place'),
      list: doc.getElementById(id + 'list'),
      unknown: doc.getElementById(id + 'unknown'),
      lat: doc.getElementById(id + 'lat'),
      lon: doc.getElementById(id + 'lon'),
      tz: doc.getElementById(id + 'tz'),
      hint: doc.getElementById(id + 'hint')
    };

    var active = -1, matches = [];

    function closeList() {
      el.list.classList.remove('is-open');
      el.place.setAttribute('aria-expanded', 'false');
      active = -1;
    }

    function openList(items) {
      matches = items;
      if (!items.length) {
        el.list.innerHTML = '<p class="place-list__empty">Не нашли такой город. ' +
          'Введите координаты вручную — раздел ниже.</p>';
      } else {
        el.list.innerHTML = items.map(function (c, i) {
          return '<button type="button" role="option" data-i="' + i + '">' +
                 '<span class="place-list__city">' + S.esc(c.name) + '</span>' +
                 '<span class="place-list__country">' + S.esc(c.country || c.region) +
                 '</span></button>';
        }).join('');
      }
      el.list.classList.add('is-open');
      el.place.setAttribute('aria-expanded', 'true');
    }

    function choose(c) {
      place = c;
      el.place.value = c.name;
      el.lat.value = c.lat;
      el.lon.value = c.lon;
      if (el.tz.querySelector('option[value="' + c.tz + '"]')) el.tz.value = c.tz;
      closeList();
      updateHint();
      if (o.onChange) o.onChange();
    }

    /*
     * Подсказка: какое смещение получится на выбранную дату.
     *
     * Пока города нет, здесь стоит не пустота, а обещание. Пустая
     * строка схлопывалась, а когда город находился — разворачивалась
     * на три строки и толкала кнопку «Построить карту» вниз ровно в
     * тот момент, когда к ней тянулся палец. Человек попадал по
     * галочке «время неизвестно», а кнопка казалась мёртвой. Поэтому
     * текст здесь есть всегда, а высота закреплена в стилях.
     */
    var HINT_IDLE = 'Часовой пояс покажем, как выберете город: со всеми ' +
                    'историческими сдвигами.';

    function updateHint() {
      var v = getValue();
      if (!v) { el.hint.textContent = HINT_IDLE; return; }
      try {
        var d = v.date.split('-').map(Number), t = v.time.split(':').map(Number);
        var ms = Tz.zonedToUtcMs(d[0], d[1], d[2], t[0], t[1], v.place.tz);
        el.hint.textContent = v.place.tz + ' · на эту дату ' +
          Tz.offsetLabel(Tz.offsetMinutes(ms, v.place.tz)) +
          ' — с декретным и летним временем.';
      } catch (e) { el.hint.textContent = HINT_IDLE; }
    }

    updateHint();

    /*
     * Что делать, если человек набрал город и сразу нажал «Построить
     * карту», не ткнув в подсказку. На телефоне это обычное дело:
     * список закрывает клавиатура, и до него просто не добираются.
     * Раньше выбор считался несделанным и форма отвечала «выберите
     * город из списка» — кнопка выглядела сломанной. Теперь набранное
     * имя засчитывается само, если оно совпало с городом целиком или
     * подошёл ровно один.
     */
    function resolveTyped() {
      if (place) return place;
      var q = el.place.value.trim();
      if (q.length < 2) return null;
      var hits = Cities.search(q, 9);
      var key = q.toLowerCase().replace(/ё/g, 'е');
      for (var i = 0; i < hits.length; i++) {
        if (hits[i].name.toLowerCase().replace(/ё/g, 'е') === key) return hits[i];
      }
      return hits.length === 1 ? hits[0] : null;
    }

    el.place.addEventListener('input', function () {
      var q = el.place.value.trim();
      place = null;
      if (q.length < 2) { closeList(); return; }
      openList(Cities.search(q, 8));
    });
    /*
     * Ушли из поля — договариваем за человека, что он имел в виду. Но не
     * тогда, когда уход вызван тычком в саму подсказку: там уже идёт
     * выбор, и закрывать список под пальцем нельзя — нажатие не дойдёт.
     */
    var picking = false;
    el.list.addEventListener('pointerdown', function () { picking = true; });
    el.place.addEventListener('blur', function () {
      if (picking) { picking = false; return; }
      var c = resolveTyped();
      if (c) choose(c);
      else closeList();
    });
    el.place.addEventListener('keydown', function (e) {
      if (!el.list.classList.contains('is-open') || !matches.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length;
        S.qa('button', el.list).forEach(function (b, i) { b.classList.toggle('is-active', i === active); });
      } else if (e.key === 'Enter' && active >= 0) {
        e.preventDefault(); choose(matches[active]);
      } else if (e.key === 'Escape') { closeList(); }
    });
    el.list.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-i]');
      if (b) choose(matches[+b.dataset.i]);
    });
    doc.addEventListener('click', function (e) {
      if (!host.contains(e.target)) closeList();
    });

    el.unknown.addEventListener('change', function () {
      el.time.disabled = el.unknown.checked;
      if (el.unknown.checked) el.time.value = '12:00';
      updateHint();
      if (o.onChange) o.onChange();
    });
    [el.date, el.time, el.lat, el.lon, el.tz].forEach(function (n) {
      n.addEventListener('change', function () { updateHint(); if (o.onChange) o.onChange(); });
    });

    /*
     * Календарь и часы — по тапу в любое место поля.
     *
     * Сам по себе type=date открывает системный выбор только с крошечной
     * иконки справа; в остальное поле палец попадает между «днём» и
     * «месяцем» и правит дату рождения по сегменту — на телефоне это
     * мучение. Поэтому на сенсорном экране тап в любое место открывает
     * системный выбор целиком.
     *
     * Только на сенсорном: мышью дату чаще набирают с клавиатуры, и
     * всплывающий календарь там мешал бы. showPicker() есть в Chrome,
     * Яндексе, Edge и Opera; в Safari и Firefox его нет — там поле
     * ведёт себя как прежде, поэтому вызов и обёрнут.
     */
    var coarse = root.matchMedia && root.matchMedia('(pointer: coarse)').matches;
    if (coarse) {
      [el.date, el.time].forEach(function (n) {
        if (!n.showPicker) return;
        n.addEventListener('click', function () {
          if (n.disabled || n.readOnly) return;
          try { n.showPicker(); } catch (e) { /* жест не тот — откроется сам */ }
        });
      });
    }

    /** Собранное значение или null, если данных не хватает. */
    function getValue() {
      var date = el.date.value;
      if (!date) return null;
      var p = place || resolveTyped();
      if (!p) {
        var lat = parseFloat(el.lat.value), lon = parseFloat(el.lon.value);
        if (isNaN(lat) || isNaN(lon)) return null;
        p = { name: el.place.value.trim() || 'Без названия', lat: lat, lon: lon, tz: el.tz.value };
      }
      return {
        date: date,
        time: el.unknown.checked ? '12:00' : (el.time.value || '12:00'),
        timeKnown: !el.unknown.checked,
        place: p
      };
    }

    function setValue(b) {
      if (!b) return;
      el.date.value = b.date || '';
      el.time.value = b.time || '12:00';
      el.unknown.checked = b.timeKnown === false;
      el.time.disabled = el.unknown.checked;
      if (b.place) {
        place = b.place;
        el.place.value = b.place.name || '';
        el.lat.value = b.place.lat;
        el.lon.value = b.place.lon;
        if (!el.tz.querySelector('option[value="' + b.place.tz + '"]')) {
          el.tz.insertAdjacentHTML('afterbegin',
            '<option value="' + S.esc(b.place.tz) + '">' + S.esc(b.place.tz) + '</option>');
        }
        el.tz.value = b.place.tz;
      }
      updateHint();
    }

    /** Текст ошибки или null. */
    function validate() {
      if (!el.date.value) return 'Укажите дату рождения.';
      var y = +el.date.value.slice(0, 4);
      if (y < 1800 || y > 2200) return 'Дата вне диапазона расчёта (1800-2200).';
      var v = getValue();
      if (!v) return 'Выберите город из списка или введите координаты вручную.';
      if (Math.abs(v.place.lat) > 89.5) return 'Для полярных широт лагна не определяется: горизонт не пересекает эклиптику обычным образом.';
      return null;
    }

    if (o.value) setValue(o.value);
    return { el: el, getValue: getValue, setValue: setValue, validate: validate, updateHint: updateHint };
  }

  S.BirthForm = { create: create };
})(typeof globalThis !== 'undefined' ? globalThis : this, document);
