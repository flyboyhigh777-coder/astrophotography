/*
 * Аруна · западная карта: колесо
 * ==================================================================
 * Обычный для западной традиции чертёж: асцендент слева, дальше
 * против часовой стрелки. Рисуется в двух видах из одних и тех же
 * частей:
 *
 *   draw()  — одна плоская SVG. Нужна для печати, для PDF и как
 *             запасной вариант, если объёмный вид не собрался.
 *   stage() — те же части, разложенные по слоям: каждый слой —
 *             отдельная SVG, а объём им даёт CSS-перспектива.
 *
 * Зачем слои. Не ради красоты: в плоском колесе сетка аспектов
 * лежит в одной плоскости с кольцами и превращается в клубок линий.
 * Разведённые по глубине, кольца уходят назад, планеты выступают
 * вперёд, и сетка читается сама собой. Наклон при этом небольшой и
 * его можно выключить одним щелчком — колесо всё-таки инструмент
 * измерения углов, и перспектива их искажает.
 *
 * Все подписи и глифы остаются в плоскости своего слоя: текст,
 * повёрнутый в перспективе, читается плохо.
 *
 * Ни зависимостей, ни сборки — как и всё остальное на этом сайте.
 */
(function (root) {
  'use strict';

  var D = root.ArunaNatalData;
  var RAD = Math.PI / 180;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function f(n) { return Math.round(n * 100) / 100; }
  function norm360(x) { return ((x % 360) + 360) % 360; }

  /*
   * Знаки зодиака и планеты лежат в юникоде в том же блоке, что и эмодзи,
   * и браузер по умолчанию рисует их цветными картинками — колесо
   * превращается в россыпь кружочков. U+FE0E (селектор начертания)
   * требует текстового вида, и глиф снова становится знаком.
   */
  function textGlyph(g) { return g + '︎'; }

  var NATURE_CLASS = { hard: 'asp--hard', soft: 'asp--soft', neutral: 'asp--neutral' };

  /** Радиусы колец. Одни и те же для плоского и объёмного вида. */
  function geometry(size) {
    var R = size / 2;
    return {
      size: size, R: R, cx: R, cy: R,
      signOut: R * 0.90, signIn: R * 0.785,
      planet: R * 0.685,
      houseOut: R * 0.565, houseIn: R * 0.515,
      asp: R * 0.505,
      angle: R * 0.955,
      transit: R * 0.965
    };
  }

  /** Части колеса — каждая отдельной строкой SVG-содержимого. */
  function parts(chart, o) {
    o = o || {};
    var g = geometry(o.size || 620);
    var cusps = chart.houses.cusps;
    var zero = chart.angles.asc.lon;            // асцендент слева

    function ang(lon) { return 180 + norm360(lon - zero); }
    function pt(r, lon) {
      var a = ang(lon) * RAD;
      return [g.cx + r * Math.cos(a), g.cy - r * Math.sin(a)];
    }
    function line(r1, r2, lon, cls) {
      var p1 = pt(r1, lon), p2 = pt(r2, lon);
      return '<line x1="' + f(p1[0]) + '" y1="' + f(p1[1]) + '" x2="' + f(p2[0]) +
             '" y2="' + f(p2[1]) + '" class="' + cls + '"/>';
    }
    function ring(r, cls) {
      return '<circle cx="' + g.cx + '" cy="' + g.cy + '" r="' + f(r) + '" class="' + cls + '"/>';
    }
    /**
     * @param {string} [attrs] дополнительные атрибуты, без угловых скобок
     * @param {string} [title] всплывающая подсказка
     */
    function text(r, lon, cls, body, attrs, title) {
      var p = pt(r, lon);
      return '<text x="' + f(p[0]) + '" y="' + f(p[1]) + '" class="' + cls +
             '" text-anchor="middle" dominant-baseline="central"' + (attrs || '') + '>' +
             (title ? '<title>' + title + '</title>' : '') + body + '</text>';
    }

    /* ------------------------------------------------------- подложка */
    var backdrop =
      '<defs><radialGradient id="nwg" cx="50%" cy="50%">' +
        '<stop offset="0%" stop-color="rgba(224,180,101,0.06)"/>' +
        '<stop offset="62%" stop-color="rgba(154,134,224,0.09)"/>' +
        '<stop offset="100%" stop-color="rgba(8,11,22,0)"/></radialGradient>' +
      '<radialGradient id="nwd" cx="50%" cy="50%">' +
        '<stop offset="70%" stop-color="rgba(0,0,0,0)"/>' +
        '<stop offset="100%" stop-color="rgba(0,0,0,0.45)"/></radialGradient></defs>' +
      '<circle cx="' + g.cx + '" cy="' + g.cy + '" r="' + f(g.signOut) + '" fill="url(#nwg)"/>' +
      '<circle cx="' + g.cx + '" cy="' + g.cy + '" r="' + f(g.signOut) + '" fill="url(#nwd)"/>';

    /* --------------------------------------------------- кольцо знаков */
    var signs = [ring(g.signOut, 'nw__ring'), ring(g.signIn, 'nw__ring')];
    for (var i = 0; i < 12; i++) {
      var start = i * 30, sg = D.SIGNS[i];
      signs.push(line(g.signIn, g.signOut, start, 'nw__signline'));
      signs.push(text((g.signOut + g.signIn) / 2, start + 15,
        'nw__glyph nw__glyph--' + sg.element, textGlyph(sg.glyph),
        ' data-sign="' + i + '"',
        esc(sg.ru + ' — ' + D.ELEMENTS[sg.element].ru + ', ' + D.MODES[sg.mode].ru +
            ', управитель ' + D.PLANETS[sg.ruler].ru)));
      for (var d10 = 10; d10 < 30; d10 += 10) {
        signs.push(line(g.signIn, g.signIn + g.R * 0.022, start + d10, 'nw__tick'));
      }
      for (var d5 = 5; d5 < 30; d5 += 5) {
        if (d5 % 10 === 0) continue;
        signs.push(line(g.signIn, g.signIn + g.R * 0.012, start + d5, 'nw__tick nw__tick--fine'));
      }
    }
    [['asc', chart.angles.asc], ['mc', chart.angles.mc],
     ['dsc', chart.angles.dsc], ['ic', chart.angles.ic]].forEach(function (pair) {
      signs.push(text(g.angle, pair[1].lon, 'nw__angle', esc(pair[1].short)));
    });

    /* ---------------------------------------------------- кольцо домов */
    var houses = [ring(g.houseOut, 'nw__ring'), ring(g.houseIn, 'nw__ring nw__ring--faint')];
    for (var hn = 1; hn <= 12; hn++) {
      var c1 = cusps[hn], c2 = cusps[hn === 12 ? 1 : hn + 1];
      var angular = hn === 1 || hn === 4 || hn === 7 || hn === 10;
      var span = norm360(c2 - c1);
      // сектор дома — прозрачная область под курсор, подсветка через CSS
      houses.push(sector(g, pt, c1, span, hn));
      houses.push(line(g.houseIn, g.signIn, c1,
        angular ? 'nw__cuspline nw__cuspline--angle' : 'nw__cuspline'));
      houses.push(text((g.houseOut + g.houseIn) / 2, c1 + span / 2, 'nw__house', String(hn)));
    }

    /* -------------------------------------------------------- аспекты */
    var aspects = [ring(g.asp, 'nw__ring nw__ring--faint')];
    if (o.aspects) {
      o.aspects.list.forEach(function (x) {
        if (!x.major && !o.minorLines) return;
        var pa = lonOfPoint(chart, x.a), pb = lonOfPoint(chart, x.b);
        if (pa === null || pb === null) return;
        var q1 = pt(g.asp, pa), q2 = pt(g.asp, pb);
        aspects.push('<line x1="' + f(q1[0]) + '" y1="' + f(q1[1]) + '" x2="' + f(q2[0]) +
          '" y2="' + f(q2[1]) + '" class="nw__asp ' + NATURE_CLASS[x.nature] +
          '" stroke-width="' + f(0.6 + 1.9 * x.strength) + '"' +
          ' data-a="' + esc(x.a) + '" data-b="' + esc(x.b) +
          '" data-aspect="' + esc(x.aspect) + '" data-nature="' + esc(x.nature) +
          '" data-orb="' + x.orbDiff.toFixed(2) + '"' +
          (x.orbDiff <= 1 ? ' data-tight="1"' : '') + '>' +
          '<title>' + esc(x.aRu + ' ' + x.ru.toLowerCase() + ' ' + x.bRu + ', орб ' +
            x.orbDiff.toFixed(1) + '°') + '</title></line>');
      });
    }

    /* -------------------------------------------------------- планеты */
    var placed = spread(chart, g.planet, g.R);
    var planets = [];
    placed.forEach(function (p) {
      var stem = line(g.houseOut, g.planet - g.R * 0.045, p.lon, 'nw__stem');
      var gl = pt(g.planet, p.drawLon);
      var lp = pt(g.planet - g.R * 0.072, p.drawLon);
      var house = chart.planets[p.key] ? chart.planets[p.key].house : null;
      planets.push(
        '<g class="nw__p" data-planet="' + esc(p.key) + '" tabindex="0" role="button" ' +
        'aria-label="' + esc(p.meta.ru + ', ' + p.signRu + ' ' + p.dms +
          (house ? ', ' + house + '-й дом' : '') + (p.retro ? ', вспять' : '')) + '">' +
        stem +
        '<circle cx="' + f(gl[0]) + '" cy="' + f(gl[1]) + '" r="' + f(g.R * 0.045) +
          '" class="nw__hit"/>' +
        '<text x="' + f(gl[0]) + '" y="' + f(gl[1]) + '" class="nw__planet' +
          (p.retro ? ' nw__planet--retro' : '') + '" text-anchor="middle" ' +
          'dominant-baseline="central">' + textGlyph(p.meta.glyph) + '</text>' +
        '<text x="' + f(lp[0]) + '" y="' + f(lp[1]) + '" class="nw__deg" text-anchor="middle" ' +
          'dominant-baseline="central">' + Math.floor(p.deg) + (p.retro ? '℞' : '') + '</text>' +
        '</g>');
    });

    /* ------------------------------------------------------- транзиты */
    var transits = [];
    if (o.transits && o.transits.length) {
      transits.push(ring(g.transit - g.R * 0.055, 'nw__ring nw__ring--faint'));
      var spreadT = spreadPoints(o.transits, 7);
      spreadT.forEach(function (p) {
        var meta = D.PLANETS[p.key];
        if (!meta) return;
        transits.push(
          '<g class="nw__t" data-transit="' + esc(p.key) + '">' +
          line(g.transit - g.R * 0.055, g.transit - g.R * 0.03, p.lon, 'nw__stem nw__stem--t') +
          '<text x="' + f(pt(g.transit, p.drawLon)[0]) + '" y="' + f(pt(g.transit, p.drawLon)[1]) +
            '" class="nw__planet nw__planet--transit' + (p.retro ? ' nw__planet--retro' : '') +
            '" text-anchor="middle" dominant-baseline="central">' +
            '<title>' + esc('транзит: ' + meta.ru + ' в ' + D.SIGNS[D.signOf(p.lon)].in +
            ' ' + D.dms(D.degInSign(p.lon))) + '</title>' + textGlyph(meta.glyph) + '</text>' +
          '</g>');
      });
    }

    return {
      geometry: g,
      backdrop: backdrop,
      signs: signs.join(''),
      houses: houses.join(''),
      aspects: aspects.join(''),
      planets: planets.join(''),
      transits: transits.join('')
    };
  }

  /** Сектор дома — дуга под курсор; подсветка включается классом. */
  function sector(g, pt, from, span, num) {
    var a = pt(g.houseIn, from), b = pt(g.signIn, from);
    var c = pt(g.signIn, from + span), d = pt(g.houseIn, from + span);
    var big = span > 180 ? 1 : 0;
    return '<path class="nw__sector" data-house="' + num + '" d="' +
      'M' + f(a[0]) + ' ' + f(a[1]) +
      'L' + f(b[0]) + ' ' + f(b[1]) +
      'A' + f(g.signIn) + ' ' + f(g.signIn) + ' 0 ' + big + ' 0 ' + f(c[0]) + ' ' + f(c[1]) +
      'L' + f(d[0]) + ' ' + f(d[1]) +
      'A' + f(g.houseIn) + ' ' + f(g.houseIn) + ' 0 ' + big + ' 1 ' + f(a[0]) + ' ' + f(a[1]) +
      'Z"/>';
  }

  function svg(cls, size, inner, extra) {
    return '<svg viewBox="0 0 ' + size + ' ' + size + '" class="' + cls + '" ' +
      (extra || 'aria-hidden="true" focusable="false"') + '>' + inner + '</svg>';
  }

  /* ------------------------------------------------ плоское колесо */

  /**
   * Одна SVG со всем сразу. Для печати и как запасной вариант.
   */
  function draw(chart, o) {
    o = o || {};
    var p = parts(chart, o);
    var size = p.geometry.size;
    return svg('natal-wheel', size,
      p.backdrop + p.houses + p.aspects + p.signs + p.planets + p.transits,
      'role="img" aria-label="' + esc(o.title ||
        'Натальная карта: круг знаков, дома, планеты и аспекты') + '"');
  }

  /* ----------------------------------------------- объёмное колесо */

  /**
   * Те же части, разложенные по слоям. Каждый слой — отдельная SVG,
   * поднятая по оси Z: подложка глубже всех, планеты выше всех.
   * Глубину и наклон задаёт CSS, поэтому без него разметка остаётся
   * обычным стопкой лежащим колесом, а не ломается.
   *
   * @param {Object} o {size, aspects, transits, tilt, spin}
   */
  function stage(chart, o) {
    o = o || {};
    var p = parts(chart, o);
    var size = p.geometry.size;
    var L = [];
    L.push(svg('w3d__layer w3d__layer--back', size, p.backdrop));
    L.push(svg('w3d__layer w3d__layer--houses', size, p.houses));
    L.push(svg('w3d__layer w3d__layer--aspects', size, p.aspects));
    L.push(svg('w3d__layer w3d__layer--signs', size, p.signs));
    if (p.transits) L.push(svg('w3d__layer w3d__layer--transits', size, p.transits));
    L.push(svg('w3d__layer w3d__layer--planets', size, p.planets,
      'role="img" aria-label="' + esc('Планеты натальной карты') + '"'));

    return '<div class="w3d" data-tilt="' + (o.tilt === undefined ? 18 : o.tilt) + '" ' +
      'data-spin="' + (o.spin || 0) + '">' +
      '<div class="w3d__stage">' + L.join('') + '</div>' +
      '</div>';
  }

  function lonOfPoint(chart, key) {
    if (key === 'asc') return chart.angles.asc.lon;
    if (key === 'mc') return chart.angles.mc.lon;
    if (key === 'fortune') return chart.fortune.lon;
    return chart.planets[key] ? chart.planets[key].lon : null;
  }

  /**
   * Развести слипшиеся глифы. Планеты в пределах нескольких градусов
   * рисуются с искусственным зазором — иначе соединение выглядит как
   * один глиф поверх другого. Настоящая долгота не трогается: она
   * остаётся и в подписи, и в ножке к кольцу домов.
   */
  function spread(chart, rPlanet, R) {
    var list = D.PLANET_ORDER
      .filter(function (k) { return chart.planets[k]; })
      .map(function (k) {
        var p = chart.planets[k];
        return { key: k, lon: p.lon, drawLon: p.lon, deg: p.deg, dms: p.dms,
                 signRu: p.signRu, retro: p.retro, meta: p.meta };
      });
    return spreadPoints(list, 7);
  }

  /** Расталкивание по кругу: несколько проходов, просто и устойчиво. */
  function spreadPoints(list, minGap) {
    var arr = list.slice().sort(function (a, b) { return a.lon - b.lon; });
    arr.forEach(function (p) { if (p.drawLon === undefined) p.drawLon = p.lon; });
    var n = arr.length;
    if (!n) return arr;
    for (var pass = 0; pass < 60; pass++) {
      var moved = false;
      for (var i = 0; i < n; i++) {
        var a = arr[i], b = arr[(i + 1) % n];
        var gap = norm360(b.drawLon - a.drawLon);
        if (gap < minGap) {
          var push = (minGap - gap) / 2;
          a.drawLon = norm360(a.drawLon - push);
          b.drawLon = norm360(b.drawLon + push);
          moved = true;
        }
      }
      if (!moved) break;
    }
    return arr;
  }

  root.ArunaNatalWheel = {
    draw: draw, stage: stage, parts: parts, geometry: geometry,
    spread: spread, spreadPoints: spreadPoints, lonOfPoint: lonOfPoint
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
