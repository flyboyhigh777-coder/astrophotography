/*
 * Аруна · западная карта: рисунок карты
 * ==================================================================
 * Как планеты разложены по кругу — отдельный слой чтения, введённый
 * Марком Эдмундом Джонсом в 1940-х. Смысл прост: прежде чем читать
 * отдельные положения, стоит посмотреть на карту издали.
 *
 * Семь фигур различаются по одному признаку — где в круге пустота:
 *
 *   Пучок     все планеты в трети круга
 *   Чаша      в половине
 *   Корзина   чаша плюс одна планета напротив (ручка)
 *   Локомотив в двух третях, треть пуста
 *   Качели    две группы напротив друг друга
 *   Праща     равномерно, но с одним большим разрывом
 *   Всплеск   равномерно и без разрывов
 *
 * Считается по семи классическим планетам плюс трём дальним — то
 * есть по десяти телам, как у Джонса. Узлы и Лилит в рисунок не
 * входят: это не тела, и они всегда напротив друг друга.
 */
(function (root) {
  'use strict';

  var D = root.ArunaNatalData;
  var BODIES = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter',
                'saturn', 'uranus', 'neptune', 'pluto'];

  function norm360(x) { return ((x % 360) + 360) % 360; }

  /**
   * Рисунок карты.
   * @returns {{key,ru,about,span,gaps,handle,leadName}}
   */
  function pattern(chart) {
    var pts = BODIES
      .filter(function (k) { return chart.planets[k]; })
      .map(function (k) { return { key: k, lon: chart.planets[k].lon, ru: D.PLANETS[k].ru }; })
      .sort(function (a, b) { return a.lon - b.lon; });
    if (pts.length < 6) return null;

    var n = pts.length;
    var gaps = [];
    for (var i = 0; i < n; i++) {
      var next = pts[(i + 1) % n];
      gaps.push({ from: pts[i], to: next, size: norm360(next.lon - pts[i].lon) });
    }
    var sorted = gaps.slice().sort(function (a, b) { return b.size - a.size; });
    var biggest = sorted[0], second = sorted[1];
    var span = 360 - biggest.size;              // занятая дуга
    // ведущая планета — первая по ходу зодиака после самого большого разрыва
    var lead = biggest.to;

    function make(key, ru, about, extra) {
      var r = { key: key, ru: ru, about: about, span: span, gaps: sorted.slice(0, 3),
                lead: lead, leadName: lead.ru, points: pts };
      if (extra) for (var k in extra) r[k] = extra[k];
      return r;
    }

    if (span <= 120) {
      return make('bundle', 'Пучок',
        'Все планеты умещаются в треть круга. Жизнь собрана вокруг немногого и ' +
        'идёт вглубь, а не вширь: сильная сосредоточенность и узкий обзор. ' +
        'Ведёт ' + lead.ru + ' — с неё начинается любое движение.');
    }

    // корзина: чаша с одной планетой напротив
    if (span <= 190) {
      var handle = findHandle(pts, gaps);
      if (handle) {
        return make('bucket', 'Корзина',
          'Планеты в половине круга, и одна стоит напротив — ' + handle.ru + '. ' +
          'Она и есть ручка: через неё выходит всё остальное, и её тема ' +
          'оказывается важнее, чем кажется по одному её положению.',
          { handle: handle, handleName: handle.ru });
      }
      return make('bowl', 'Чаша',
        'Планеты занимают половину круга, вторая пуста. Человек отчётливо ' +
        'знает свою сторону и так же отчётливо не видит противоположную — ' +
        'её обычно приносят другие люди.');
    }

    if (span <= 250 && biggest.size >= 110) {
      return make('locomotive', 'Локомотив',
        'Занято две трети круга, треть пуста. Это фигура тяги: ' + lead.ru +
        ' идёт первой и тянет остальное за собой. Обычно даёт напор и ' +
        'умение доводить начатое.');
    }

    // качели: два сгустка напротив, два больших разрыва
    if (second && second.size >= 60 && biggest.size >= 60) {
      var mid1 = norm360(biggest.from.lon + biggest.size / 2);
      var mid2 = norm360(second.from.lon + second.size / 2);
      var apart = Math.abs(norm360(mid1 - mid2) - 180);
      if (apart < 50) {
        return make('seesaw', 'Качели',
          'Две группы планет стоят друг против друга. Жизнь всё время ' +
          'взвешивает две стороны, и решение редко бывает окончательным — ' +
          'зато человек умеет видеть обе правды.');
      }
    }

    if (biggest.size >= 60) {
      return make('splay', 'Праща',
        'Планеты разбросаны неровно: есть сгустки и есть заметный пустой ' +
        'участок. Такая карта плохо укладывается в чужие схемы — и это её ' +
        'свойство, а не изъян.');
    }

    return make('splash', 'Всплеск',
      'Планеты разбросаны по всему кругу почти ровно. Широкий охват и много ' +
      'интересов; трудность обратная пучку — трудно на чём-то остановиться.');
  }

  /** Ручка корзины: одинокая планета по ту сторону от основной группы. */
  function findHandle(pts, gaps) {
    for (var i = 0; i < pts.length; i++) {
      var prev = gaps[(i - 1 + gaps.length) % gaps.length].size;
      var next = gaps[i].size;
      if (prev >= 60 && next >= 60) return pts[i];
    }
    return null;
  }

  /**
   * Одиночка — планета, одна представляющая свою стихию или крест.
   * Классика считает такую планету непропорционально громкой.
   */
  function singletons(chart) {
    var out = [];
    ['element', 'mode'].forEach(function (field) {
      var groups = {};
      BODIES.forEach(function (k) {
        var p = chart.planets[k];
        if (!p) return;
        var g = D.SIGNS[p.sign][field];
        (groups[g] = groups[g] || []).push(k);
      });
      Object.keys(groups).forEach(function (g) {
        if (groups[g].length !== 1) return;
        var k = groups[g][0];
        var label = field === 'element' ? D.ELEMENTS[g].ru : D.MODES[g].ru;
        out.push({
          key: k, ru: D.PLANETS[k].ru, field: field, group: g, label: label,
          about: D.PLANETS[k].ru + ' — единственная планета в ' +
                 (field === 'element' ? 'стихии «' + label + '»' : label + ' кресте') +
                 '. Одиночка звучит громче, чем ей положено по силе: через неё ' +
                 'проходит вся эта сторона жизни.'
        });
      });
    });
    return out;
  }

  /** Финальный диспозитор: куда приводит цепочка управителей знаков. */
  function finalDispositor(chart) {
    var seven = D.CLASSICAL;
    var res = [];
    seven.forEach(function (start) {
      var seen = {}, cur = start, path = [start];
      for (var i = 0; i < 20; i++) {
        if (!chart.planets[cur]) break;
        var ruler = D.SIGNS[chart.planets[cur].sign].ruler;
        if (ruler === cur) { res.push({ key: cur, from: start, path: path, loop: false }); break; }
        if (seen[ruler]) { res.push({ key: ruler, from: start, path: path, loop: true }); break; }
        seen[cur] = 1;
        cur = ruler;
        path.push(cur);
      }
    });
    var finals = {};
    res.forEach(function (r) { if (!r.loop) finals[r.key] = (finals[r.key] || 0) + 1; });
    var keys = Object.keys(finals);
    if (!keys.length) {
      return { key: null, ru: null, mutual: true,
        about: 'Цепочка управителей замыкается в кольцо и не приходит к одной планете. ' +
               'Такая карта не имеет единого распорядителя: власть в ней разделена.' };
    }
    var best = keys.sort(function (a, b) { return finals[b] - finals[a]; })[0];
    return {
      key: best, ru: D.PLANETS[best].ru, count: finals[best], mutual: false,
      about: D.PLANETS[best].ru + ' стоит в своём знаке, и к ней приводит цепочка ' +
             'управителей от большинства планет. Это распорядитель карты: её тема ' +
             'подчиняет себе остальные.'
    };
  }

  root.ArunaShape = {
    pattern: pattern, singletons: singletons, finalDispositor: finalDispositor, BODIES: BODIES
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
