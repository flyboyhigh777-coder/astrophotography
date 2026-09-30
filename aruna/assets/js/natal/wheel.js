/*
 * Аруна · западная карта: колесо
 * ==================================================================
 * Обычный для западной традиции чертёж: асцендент слева, дальше
 * против часовой стрелки. Три кольца снаружи внутрь —
 *
 *   знаки с глифами и границами,
 *   планеты с градусами и пометкой ретроградности,
 *   дома с номерами,
 *
 * а в середине сетка аспектов. Цвет линии говорит о природе аспекта,
 * толщина — о точности: точный аспект виден издали, широкий едва.
 *
 * Планеты, стоящие вплотную, разводятся по кругу, иначе глифы
 * наезжают друг на друга и карта становится нечитаемой. Разведение
 * только рисовальное: подписанный градус всегда настоящий.
 *
 * Возвращается строка SVG. Ни зависимостей, ни сборки — как и всё
 * остальное на этом сайте.
 */
(function (root) {
  'use strict';

  var D = root.ArunaNatalData, H = root.ArunaHouses;
  var RAD = Math.PI / 180;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function f(n) { return Math.round(n * 100) / 100; }
  function norm360(x) { return ((x % 360) + 360) % 360; }

  /*
   * Знаки зодиака и планеты лежат в юникоде в том же блоке, что и эмодзи,
   * и браузер по умолчанию рисует их цветными картинками — колесо
   * превращается в россыпь кружочков. U+FE0E (селектор начертания)
   * требует текстового вида, и глиф снова становится знаком.
   */
  function textGlyph(g) { return g + '\uFE0E'; }

  /* Аспектные цвета: напряжённые красным, гармоничные синим —
     договорённость старая и узнаваемая, менять её незачем. */
  var NATURE_CLASS = { hard: 'asp--hard', soft: 'asp--soft', neutral: 'asp--neutral' };

  /**
   * Колесо натальной карты.
   * @param {Object} chart карта из natal/chart.js
   * @param {Object} [o] {size, aspects, showAspects, title, transits}
   */
  function draw(chart, o) {
    o = o || {};
    var size = o.size || 620;
    var cx = size / 2, cy = size / 2;
    var R = size / 2;

    var rSignOut = R * 0.90, rSignIn = R * 0.785;   // кольцо знаков
    var rPlanet = R * 0.685;                         // где стоят глифы планет
    var rHouseOut = R * 0.565, rHouseIn = R * 0.515; // кольцо домов
    var rAsp = R * 0.505;                            // круг аспектов
    var rAngle = R * 0.955;                          // подписи углов снаружи

    var cusps = chart.houses.cusps;
    // асцендент — слева; долготы растут против часовой стрелки
    var zero = chart.angles.asc.lon;
    function ang(lon) { return 180 + norm360(lon - zero); }
    function pt(r, lon) {
      var a = ang(lon) * RAD;
      return [cx + r * Math.cos(a), cy - r * Math.sin(a)];
    }
    function line(r1, r2, lon, cls) {
      var p1 = pt(r1, lon), p2 = pt(r2, lon);
      return '<line x1="' + f(p1[0]) + '" y1="' + f(p1[1]) + '" x2="' + f(p2[0]) +
             '" y2="' + f(p2[1]) + '" class="' + cls + '"/>';
    }

    var s = [];
    s.push('<svg viewBox="0 0 ' + size + ' ' + size + '" class="natal-wheel" role="img" aria-label="' +
           esc(o.title || 'Натальная карта: круг знаков, дома, планеты и аспекты') + '">');
    s.push('<defs><radialGradient id="nwg" cx="50%" cy="50%">' +
           '<stop offset="0%" stop-color="rgba(224,180,101,0.05)"/>' +
           '<stop offset="65%" stop-color="rgba(154,134,224,0.07)"/>' +
           '<stop offset="100%" stop-color="rgba(8,11,22,0)"/></radialGradient></defs>');
    s.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + f(rSignOut) + '" fill="url(#nwg)"/>');

    /* --- кольцо знаков --- */
    s.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + f(rSignOut) + '" class="nw__ring"/>');
    s.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + f(rSignIn) + '" class="nw__ring"/>');
    for (var i = 0; i < 12; i++) {
      var start = i * 30;
      s.push(line(rSignIn, rSignOut, start, 'nw__signline'));
      var mid = start + 15;
      var g = pt((rSignOut + rSignIn) / 2, mid);
      var sg = D.SIGNS[i];
      s.push('<text x="' + f(g[0]) + '" y="' + f(g[1]) + '" class="nw__glyph nw__glyph--' +
             sg.element + '" text-anchor="middle" dominant-baseline="central">' +
             textGlyph(sg.glyph) + '</text>');
      // штрихи по 10° внутри знака — глазу проще оценить градус
      for (var d10 = 10; d10 < 30; d10 += 10) {
        s.push(line(rSignIn, rSignIn + R * 0.022, start + d10, 'nw__tick'));
      }
      for (var d5 = 5; d5 < 30; d5 += 5) {
        if (d5 % 10 === 0) continue;
        s.push(line(rSignIn, rSignIn + R * 0.012, start + d5, 'nw__tick nw__tick--fine'));
      }
    }

    /* --- дома --- */
    s.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + f(rHouseOut) + '" class="nw__ring"/>');
    s.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + f(rHouseIn) + '" class="nw__ring nw__ring--faint"/>');
    for (var hnum = 1; hnum <= 12; hnum++) {
      var c1 = cusps[hnum], c2 = cusps[hnum === 12 ? 1 : hnum + 1];
      var angular = hnum === 1 || hnum === 4 || hnum === 7 || hnum === 10;
      s.push(line(rHouseIn, rSignIn, c1, angular ? 'nw__cuspline nw__cuspline--angle' : 'nw__cuspline'));
      var midH = c1 + norm360(c2 - c1) / 2;
      var hp = pt((rHouseOut + rHouseIn) / 2, midH);
      s.push('<text x="' + f(hp[0]) + '" y="' + f(hp[1]) + '" class="nw__house" ' +
             'text-anchor="middle" dominant-baseline="central">' + hnum + '</text>');
    }

    /* --- углы: подписи ASC / MC / DSC / IC --- */
    [['asc', chart.angles.asc], ['mc', chart.angles.mc],
     ['dsc', chart.angles.dsc], ['ic', chart.angles.ic]].forEach(function (pair) {
      var a = pair[1];
      var p = pt(rAngle, a.lon);
      s.push('<text x="' + f(p[0]) + '" y="' + f(p[1]) + '" class="nw__angle" ' +
             'text-anchor="middle" dominant-baseline="central">' + esc(a.short) + '</text>');
    });

    /* --- планеты --- */
    var placed = spread(chart, rPlanet, R);
    placed.forEach(function (p) {
      // тонкая ножка от глифа к настоящему градусу
      s.push(line(rHouseOut, rPlanet - R * 0.045, p.lon, 'nw__stem'));
      var g = pt(rPlanet, p.drawLon);
      s.push('<text x="' + f(g[0]) + '" y="' + f(g[1]) + '" class="nw__planet' +
             (p.retro ? ' nw__planet--retro' : '') + '" text-anchor="middle" ' +
             'dominant-baseline="central">' + textGlyph(p.meta.glyph) + '</text>');
      var lp = pt(rPlanet - R * 0.072, p.drawLon);
      s.push('<text x="' + f(lp[0]) + '" y="' + f(lp[1]) + '" class="nw__deg" ' +
             'text-anchor="middle" dominant-baseline="central">' +
             Math.floor(p.deg) + (p.retro ? '℞' : '') + '</text>');
    });

    /* --- аспекты --- */
    s.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + f(rAsp) + '" class="nw__ring nw__ring--faint"/>');
    if (o.aspects && o.showAspects !== false) {
      o.aspects.list.forEach(function (x) {
        if (!x.major && !o.minorLines) return;
        var pa = lonOfPoint(chart, x.a), pb = lonOfPoint(chart, x.b);
        if (pa === null || pb === null) return;
        var q1 = pt(rAsp, pa), q2 = pt(rAsp, pb);
        var w = 0.6 + 1.9 * x.strength;
        s.push('<line x1="' + f(q1[0]) + '" y1="' + f(q1[1]) + '" x2="' + f(q2[0]) +
               '" y2="' + f(q2[1]) + '" class="nw__asp ' + NATURE_CLASS[x.nature] +
               '" stroke-width="' + f(w) + '"><title>' +
               esc(x.aRu + ' ' + x.ru.toLowerCase() + ' ' + x.bRu + ', орб ' +
                   x.orbDiff.toFixed(1) + '°') + '</title></line>');
      });
    }

    s.push('</svg>');
    return s.join('');
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
    var minGap = 7;                       // градусов между глифами
    var list = D.PLANET_ORDER
      .filter(function (k) { return chart.planets[k]; })
      .map(function (k) {
        var p = chart.planets[k];
        return { key: k, lon: p.lon, drawLon: p.lon, deg: p.deg, retro: p.retro, meta: p.meta };
      })
      .sort(function (a, b) { return a.lon - b.lon; });

    var n = list.length;
    if (!n) return list;
    // несколько проходов расталкивания по кругу — просто и устойчиво
    for (var pass = 0; pass < 60; pass++) {
      var moved = false;
      for (var i = 0; i < n; i++) {
        var a = list[i], b = list[(i + 1) % n];
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
    return list;
  }

  /**
   * Двойное колесо: натальная карта внутри, транзиты снаружи.
   * Нужно там, где смотрят «что сейчас над картой».
   */
  function dual(chart, outer, o) {
    o = o || {};
    var size = o.size || 620;
    var inner = draw(chart, Object.assign({}, o, { size: size }));
    if (!outer || !outer.length) return inner;
    var cx = size / 2, cy = size / 2, R = size / 2;
    var zero = chart.angles.asc.lon;
    var rOut = R * 0.805;
    var add = [];
    outer.forEach(function (p) {
      var a = (180 + norm360(p.lon - zero)) * RAD;
      var x = cx + rOut * Math.cos(a), y = cy - rOut * Math.sin(a);
      add.push('<text x="' + f(x) + '" y="' + f(y) + '" class="nw__planet nw__planet--transit' +
               (p.retro ? ' nw__planet--retro' : '') + '" text-anchor="middle" ' +
               'dominant-baseline="central">' +
               (D.PLANETS[p.key] ? textGlyph(D.PLANETS[p.key].glyph) : '·') + '</text>');
    });
    return inner.replace('</svg>', add.join('') + '</svg>');
  }

  root.ArunaNatalWheel = { draw: draw, dual: dual, spread: spread };
})(typeof globalThis !== 'undefined' ? globalThis : this);
