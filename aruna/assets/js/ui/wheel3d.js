/*
 * Аруна · живое колесо натальной карты
 * ==================================================================
 * Поведение объёмного колеса. Разметку рисует natal/wheel.js, здесь
 * только то, что происходит от рук человека:
 *
 *   · карту можно повернуть и наклонить перетаскиванием;
 *   · наведение на планету гасит всё лишнее и оставляет её аспекты;
 *   · щелчок закрепляет выбор, второй — снимает;
 *   · наведение на сектор дома подсвечивает дом и его жильцов;
 *   · аспекты можно отфильтровать: все, только точные, только
 *     напряжённые, никакие;
 *   · транзиты сегодняшнего дня включаются вторым кольцом.
 *
 * Два правила, которым здесь всё подчинено.
 *
 * Первое: колесо — инструмент измерения углов, и перспектива их
 * искажает. Поэтому наклон небольшой, плоский вид всегда в одном
 * щелчке, а на печать карта уходит плоской всегда.
 *
 * Второе: всё, что делается мышью, должно делаться и с клавиатуры.
 * Планеты получают фокус табом, стрелки поворачивают карту.
 */
(function (root, doc) {
  'use strict';

  var S = root.Aruna, D = root.ArunaNatalData;
  var KEY = 'aruna.wheel3d.v1';

  var DEFAULTS = { tilt: 18, spin: 0, flat: false, aspects: 'all', transits: false };

  function load() {
    try {
      var raw = root.localStorage.getItem(KEY);
      if (!raw) return null;
      var v = JSON.parse(raw);
      return v && typeof v === 'object' ? v : null;
    } catch (e) { return null; }
  }
  function save(v) {
    try { root.localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* инкогнито */ }
  }

  function reduced() {
    return root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * Оживляет колесо внутри контейнера.
   *
   * @param {Element} host   узел, куда уже вставлена разметка stage()
   * @param {Object} o {chart, aspects, onSelect}
   * @returns {Object} {setView, destroy, view}
   */
  function attach(host, o) {
    var wheel = host.querySelector('.w3d');
    if (!wheel) return null;

    var saved = load() || {};
    var view = {
      tilt: saved.tilt === undefined ? DEFAULTS.tilt : saved.tilt,
      spin: saved.spin === undefined ? DEFAULTS.spin : saved.spin,
      flat: saved.flat === undefined ? DEFAULTS.flat : saved.flat,
      aspects: saved.aspects || DEFAULTS.aspects,
      transits: saved.transits === undefined ? DEFAULTS.transits : saved.transits
    };
    // при просьбе уменьшить движение объём не навязываем
    if (reduced() && saved.flat === undefined) view.flat = true;

    var selected = null, hovered = null;
    var planets = Array.prototype.slice.call(wheel.querySelectorAll('[data-planet]'));
    var lines = Array.prototype.slice.call(wheel.querySelectorAll('.nw__asp'));
    var sectors = Array.prototype.slice.call(wheel.querySelectorAll('[data-house]'));

    /* ------------------------------------------------------ вид */

    function applyView() {
      var t = view.flat ? 0 : view.tilt;
      wheel.style.setProperty('--tilt', t + 'deg');
      wheel.style.setProperty('--spin', (view.flat ? 0 : view.spin) + 'deg');
      /*
       * При сильном наклоне ближний край колеса подходит к зрителю и
       * перспектива его увеличивает — карта вылезает за свою панель.
       * Измерено: до наклона в 15° выхода нет вовсе, дальше он растёт
       * примерно линейно и на 35° доходит до трети ширины. Поэтому
       * ужимаем ровно с этого места и не больше чем на четверть.
       */
      wheel.style.setProperty('--fit',
        String(1 - Math.min(0.23, Math.max(0, t - 15) * 0.011)));
      wheel.classList.toggle('is-flat', !!view.flat);
      wheel.setAttribute('data-aspects', view.aspects);
      applyAspectFilter();
      save(view);
    }

    function applyAspectFilter() {
      lines.forEach(function (ln) {
        var show =
          view.aspects === 'all' ? true :
          view.aspects === 'none' ? false :
          view.aspects === 'tight' ? ln.hasAttribute('data-tight') :
          view.aspects === 'hard' ? ln.getAttribute('data-nature') === 'hard' : true;
        ln.classList.toggle('is-hidden', !show);
      });
    }

    /* -------------------------------------------------- подсветка */

    function clearMarks() {
      wheel.classList.remove('is-focused');
      planets.forEach(function (p) { p.classList.remove('is-on', 'is-off'); });
      lines.forEach(function (l) { l.classList.remove('is-on', 'is-off'); });
      sectors.forEach(function (s) { s.classList.remove('is-on'); });
    }

    /** Выделить планету: она, её аспекты и партнёры по ним. */
    function markPlanet(key) {
      clearMarks();
      if (!key) { report(null); return; }
      wheel.classList.add('is-focused');
      var partners = {};
      lines.forEach(function (l) {
        var a = l.getAttribute('data-a'), b = l.getAttribute('data-b');
        var mine = (a === key || b === key) && !l.classList.contains('is-hidden');
        l.classList.add(mine ? 'is-on' : 'is-off');
        if (mine) partners[a === key ? b : a] = l;
      });
      planets.forEach(function (p) {
        var k = p.getAttribute('data-planet');
        p.classList.add(k === key || partners[k] ? 'is-on' : 'is-off');
      });
      var pl = o.chart.planets[key];
      if (pl && pl.house) {
        sectors.forEach(function (s) {
          if (+s.getAttribute('data-house') === pl.house) s.classList.add('is-on');
        });
      }
      report(key, partners);
    }

    /** Выделить дом и то, что в нём стоит. */
    function markHouse(num) {
      clearMarks();
      wheel.classList.add('is-focused');
      sectors.forEach(function (s) {
        if (+s.getAttribute('data-house') === num) s.classList.add('is-on');
      });
      var inside = {};
      planets.forEach(function (p) {
        var k = p.getAttribute('data-planet');
        var pl = o.chart.planets[k];
        var yes = pl && pl.house === num;
        if (yes) inside[k] = 1;
        p.classList.add(yes ? 'is-on' : 'is-off');
      });
      lines.forEach(function (l) { l.classList.add('is-off'); });
      reportHouse(num, Object.keys(inside));
    }

    /* ------------------------------------------------- карточка */

    var card = host.querySelector('[data-wheel-card]');

    function html(s) { return S.esc(s); }

    function report(key, partners) {
      if (!card) return;
      if (!key) { card.innerHTML = idleCard(); return; }
      var p = o.chart.planets[key];
      if (!p) { card.innerHTML = idleCard(); return; }
      var meta = p.meta;
      var marks = [];
      if (p.retro) marks.push('идёт вспять');
      if (p.cazimi) marks.push('в сердце Солнца');
      else if (p.combust) marks.push('сожжена');
      else if (p.underBeams) marks.push('под лучами');
      var hs = D.HOUSES[p.house - 1];
      var rows = [
        ['Знак', D.SIGNS[p.sign].ru + ' ' + p.dms],
        ['Дом', p.house + '-й · ' + hs.title],
        ['Скорость', p.speed.toFixed(3) + '°/сут']
      ];
      if (marks.length) rows.push(['Состояние', marks.join(', ')]);
      var list = partners ? Object.keys(partners) : [];
      var asp = list.map(function (k) {
        var l = partners[k];
        var a = D.aspectByKey(l.getAttribute('data-aspect'));
        var name = k === 'asc' ? 'Асцендент' : k === 'mc' ? 'Середина неба'
                 : (D.PLANETS[k] ? D.PLANETS[k].ru : k);
        return '<li class="wc__asp wc__asp--' + html(l.getAttribute('data-nature')) + '">' +
          '<span class="wc__g">' + a.glyph + '︎</span> ' + html(name) +
          ' <span class="tiny muted">орб ' + html(l.getAttribute('data-orb')) + '°</span></li>';
      }).join('');

      card.innerHTML =
        '<p class="wc__t"><span class="wc__glyph">' + meta.glyph + '︎</span> ' +
          html(meta.ru) + '</p>' +
        '<p class="wc__about">' + html(meta.does) + '</p>' +
        '<dl class="kv kv--tight">' + rows.map(function (r) {
          return '<dt>' + html(r[0]) + '</dt><dd>' + html(r[1]) + '</dd>';
        }).join('') + '</dl>' +
        (asp ? '<p class="wc__h">Аспекты</p><ul class="wc__list">' + asp + '</ul>'
             : '<p class="tiny muted">Аспектов в выбранном фильтре нет.</p>');
    }

    function reportHouse(num, inside) {
      if (!card) return;
      var h = D.HOUSES[num - 1];
      var cusp = o.chart.houses.cusps[num];
      var sign = D.SIGNS[D.signOf(cusp)];
      card.innerHTML =
        '<p class="wc__t">' + html(h.ru) + '</p>' +
        '<p class="wc__about">' + html(h.about) + '</p>' +
        '<dl class="kv kv--tight">' +
          '<dt>Куспид</dt><dd>' + html(sign.ru + ' ' + D.dms(D.degInSign(cusp))) + '</dd>' +
          '<dt>Управитель</dt><dd>' + html(D.PLANETS[sign.ruler].ru) + '</dd>' +
        '</dl>' +
        (inside.length
          ? '<p class="wc__h">Внутри</p><ul class="wc__list">' + inside.map(function (k) {
              var p = o.chart.planets[k];
              return '<li><span class="wc__g">' + p.meta.glyph + '︎</span> ' +
                html(p.meta.ru + ' · ' + p.signRu + ' ' + p.dms) + '</li>';
            }).join('') + '</ul>'
          : '<p class="tiny muted">Планет в доме нет — дом читают по управителю.</p>');
    }

    function idleCard() {
      return '<p class="wc__idle">Наведите на планету или на сектор дома — ' +
        'здесь появится разбор, а на карте останутся только её связи. ' +
        'Карту можно повернуть, потянув мышью.</p>';
    }

    /* ---------------------------------------------- события мыши */

    function keyOf(e, attr) {
      var n = e.target.closest ? e.target.closest('[' + attr + ']') : null;
      return n ? n.getAttribute(attr) : null;
    }

    wheel.addEventListener('pointerover', function (e) {
      if (dragging) return;
      var pk = keyOf(e, 'data-planet');
      if (pk) { hovered = pk; if (!selected) markPlanet(pk); return; }
      var hk = keyOf(e, 'data-house');
      if (hk) { hovered = 'h' + hk; if (!selected) markHouse(+hk); }
    });
    wheel.addEventListener('pointerout', function (e) {
      if (e.relatedTarget && wheel.contains(e.relatedTarget)) return;
      hovered = null;
      if (!selected) { clearMarks(); report(null); }
    });
    wheel.addEventListener('click', function (e) {
      if (moved) return;                       // это было перетаскивание, а не щелчок
      var pk = keyOf(e, 'data-planet');
      if (pk) {
        selected = selected === pk ? null : pk;
        if (selected) markPlanet(selected); else { clearMarks(); report(null); }
        if (o.onSelect) o.onSelect(selected);
        return;
      }
      var hk = keyOf(e, 'data-house');
      if (hk) {
        var id = 'h' + hk;
        selected = selected === id ? null : id;
        if (selected) markHouse(+hk); else { clearMarks(); report(null); }
        return;
      }
      selected = null; clearMarks(); report(null);
    });

    // фокус с клавиатуры ведёт себя как наведение
    wheel.addEventListener('focusin', function (e) {
      var pk = keyOf(e, 'data-planet');
      if (pk) markPlanet(pk);
    });
    wheel.addEventListener('keydown', function (e) {
      var step = e.shiftKey ? 15 : 5;
      if (e.key === 'ArrowLeft') { view.spin -= step; applyView(); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { view.spin += step; applyView(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { view.tilt = clampTilt(view.tilt - step); applyView(); e.preventDefault(); }
      else if (e.key === 'ArrowDown') { view.tilt = clampTilt(view.tilt + step); applyView(); e.preventDefault(); }
      else if (e.key === 'Escape') { selected = null; clearMarks(); report(null); }
      else if (e.key === 'Enter' || e.key === ' ') {
        var pk = keyOf(e, 'data-planet');
        if (pk) { selected = selected === pk ? null : pk; markPlanet(selected); e.preventDefault(); }
      }
    });

    function clampTilt(t) { return Math.max(0, Math.min(55, t)); }

    /* ------------------------------------------ поворот мышью */

    var dragging = false, moved = false, x0 = 0, y0 = 0, spin0 = 0, tilt0 = 0;

    wheel.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      dragging = true; moved = false;
      x0 = e.clientX; y0 = e.clientY; spin0 = view.spin; tilt0 = view.tilt;
    });
    wheel.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var dx = e.clientX - x0, dy = e.clientY - y0;
      if (!moved) {
        if (Math.abs(dx) + Math.abs(dy) <= 4) return;
        moved = true;
        wheel.classList.add('is-dragging');
        /* Захватываем указатель только теперь, когда перетаскивание
           действительно началось. Захват на нажатии перенаправляет на
           себя и последующий щелчок — и выбор планеты мышью перестаёт
           работать: щелчок приходит от сцены, а не от глифа. */
        try { wheel.setPointerCapture(e.pointerId); } catch (err) { /* и без захвата идёт */ }
      }
      view.flat = false;
      view.spin = spin0 + dx * 0.3;
      view.tilt = clampTilt(tilt0 + dy * 0.25);
      applyView();
    });
    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      wheel.classList.remove('is-dragging');
      if (moved) {
        try { wheel.releasePointerCapture(e.pointerId); } catch (err) { /* уже отпущен */ }
        // щелчок, которым кончилось перетаскивание, гасим — но только его
        root.setTimeout(function () { moved = false; }, 0);
      }
    }
    wheel.addEventListener('pointerup', endDrag);
    wheel.addEventListener('pointercancel', endDrag);

    /* ------------------------------------------------ управление */

    function bindControls(box) {
      if (!box) return;
      box.addEventListener('click', function (e) {
        var b = e.target.closest('[data-view]');
        if (!b) return;
        var act = b.getAttribute('data-view');
        if (act === 'flat') view.flat = !view.flat;
        else if (act === 'reset') {
          view.tilt = DEFAULTS.tilt; view.spin = 0; view.flat = false;
        }
        applyView();
        syncControls(box);
      });
      box.addEventListener('change', function (e) {
        if (e.target.name === 'aspFilter') { view.aspects = e.target.value; applyView(); }
        else if (e.target.name === 'tilt') {
          view.tilt = +e.target.value; view.flat = false; applyView(); syncControls(box);
        }
      });
      syncControls(box);
    }

    function syncControls(box) {
      var flat = box.querySelector('[data-view="flat"]');
      if (flat) {
        flat.textContent = view.flat ? 'Объём' : 'Плоско';
        flat.setAttribute('aria-pressed', String(!view.flat));
      }
      var slider = box.querySelector('[name="tilt"]');
      if (slider) slider.value = view.flat ? 0 : view.tilt;
      var radios = box.querySelectorAll('[name="aspFilter"]');
      Array.prototype.forEach.call(radios, function (r) { r.checked = r.value === view.aspects; });
    }

    applyView();
    report(null);
    bindControls(host.querySelector('[data-wheel-controls]'));

    return {
      view: view,
      setView: function (v) { Object.keys(v).forEach(function (k) { view[k] = v[k]; }); applyView(); },
      select: function (k) { selected = k; markPlanet(k); },
      clear: function () { selected = null; clearMarks(); report(null); }
    };
  }

  /** Разметка панели управления видом. */
  function controls() {
    return '' +
      '<div class="w3d-ctl" data-wheel-controls>' +
        '<button class="btn btn--quiet btn--sm" type="button" data-view="flat" ' +
          'aria-pressed="true">Плоско</button>' +
        '<label class="w3d-ctl__tilt">' +
          '<span class="sr-only">Наклон карты</span>' +
          '<input type="range" name="tilt" min="0" max="55" step="1" value="18">' +
        '</label>' +
        '<span class="w3d-ctl__seg" role="radiogroup" aria-label="Какие аспекты показывать">' +
          radio('aspFilter', 'all', 'все', true) +
          radio('aspFilter', 'tight', 'точные') +
          radio('aspFilter', 'hard', 'напряжённые') +
          radio('aspFilter', 'none', 'без них') +
        '</span>' +
        '<button class="btn btn--quiet btn--sm" type="button" data-view="reset">Сбросить</button>' +
      '</div>';
  }

  function radio(name, value, label, checked) {
    var id = name + '-' + value;
    return '<input type="radio" name="' + name + '" id="' + id + '" value="' + value + '"' +
      (checked ? ' checked' : '') + '><label for="' + id + '">' + label + '</label>';
  }

  S.Wheel3d = { attach: attach, controls: controls, DEFAULTS: DEFAULTS };
})(typeof globalThis !== 'undefined' ? globalThis : this, document);
