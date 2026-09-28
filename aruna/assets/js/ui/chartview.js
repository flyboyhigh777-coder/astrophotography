/*
 * Аруна · рисование карт
 * ------------------------------------------------------------------
 * Три представления одной и той же карты:
 *   wheel()        — круг зодиака (для «неба дня»)
 *   northIndian()  — северная сетка: бхавы на месте, раши подписаны
 *   southIndian()  — южная сетка: раши на месте, лагна отмечена
 * Возвращают строку SVG — ни зависимостей, ни сборки.
 */
(function (root) {
  'use strict';

  var D = root.ArunaData;
  var RAD = Math.PI / 180;

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function pt(cx, cy, r, deg) {
    return [cx + r * Math.cos(deg * RAD), cy - r * Math.sin(deg * RAD)];
  }
  function f(n) { return Math.round(n * 100) / 100; }

  /* ----------------------------------------------------------- колесо */
  /**
   * @param {Object} o {grahas: {key:{lon,retro}}, zeroLon, size, ascLon, title}
   *   grahas.lon — сидерическая долгота; zeroLon ставится слева (9 часов),
   *   долготы растут против часовой стрелки.
   */
  function wheel(o) {
    var size = o.size || 380;
    var cx = size / 2, cy = size / 2;
    var rOuter = size * 0.465, rInner = size * 0.335, rMark = size * 0.30;
    var zero = o.zeroLon || 0;
    var ang = function (lon) { return 180 + (lon - zero); };
    var s = [];

    s.push('<svg viewBox="0 0 ' + size + ' ' + size + '" class="wheel" role="img" aria-label="' +
           esc(o.title || 'Круг зодиака с положением грах') + '">');
    s.push('<defs><radialGradient id="wg" cx="50%" cy="45%">' +
           '<stop offset="0%" stop-color="rgba(154,134,224,0.17)"/>' +
           '<stop offset="70%" stop-color="rgba(8,11,22,0)"/></radialGradient></defs>');
    s.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + f(rOuter) + '" fill="url(#wg)"/>');

    // кольцо раши
    s.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + f(rOuter) + '" class="wheel__ring"/>');
    s.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + f(rInner) + '" class="wheel__ring"/>');

    // границы накшатр — тонкие штрихи снаружи
    for (var n = 0; n < 27; n++) {
      var a = ang(n * (360 / 27));
      var p1 = pt(cx, cy, rOuter, a), p2 = pt(cx, cy, rOuter + size * 0.022, a);
      s.push('<line x1="' + f(p1[0]) + '" y1="' + f(p1[1]) + '" x2="' + f(p2[0]) +
             '" y2="' + f(p2[1]) + '" class="wheel__nak"/>');
    }

    // сектора и подписи раши
    for (var i = 0; i < 12; i++) {
      var a0 = ang(i * 30);
      var e0 = pt(cx, cy, rInner, a0), e1 = pt(cx, cy, rOuter, a0);
      s.push('<line x1="' + f(e0[0]) + '" y1="' + f(e0[1]) + '" x2="' + f(e1[0]) +
             '" y2="' + f(e1[1]) + '" class="wheel__spoke"/>');
      var mid = pt(cx, cy, (rInner + rOuter) / 2, ang(i * 30 + 15));
      s.push('<text x="' + f(mid[0]) + '" y="' + f(mid[1] + 4) + '" class="wheel__rashi">' +
             esc(D.RASHIS[i].sa.slice(0, 4)) + '</text>');
      var num = pt(cx, cy, rOuter - size * 0.016, ang(i * 30 + 2.5));
      s.push('<text x="' + f(num[0]) + '" y="' + f(num[1] + 3) + '" class="wheel__num">' + (i + 1) + '</text>');
    }

    // лагна — луч и подпись
    if (typeof o.ascLon === 'number') {
      var la = ang(o.ascLon);
      var l1 = pt(cx, cy, rInner * 0.42, la), l2 = pt(cx, cy, rOuter, la);
      s.push('<line x1="' + f(l1[0]) + '" y1="' + f(l1[1]) + '" x2="' + f(l2[0]) + '" y2="' +
             f(l2[1]) + '" class="wheel__asc"/>');
      var lt = pt(cx, cy, rInner * 0.30, la);
      s.push('<text x="' + f(lt[0]) + '" y="' + f(lt[1] + 4) + '" class="wheel__asclabel">Лг</text>');
    }

    // грахи: разводим по радиусу, если сходятся ближе 9°
    var keys = Object.keys(o.grahas).sort(function (a, b) {
      return o.grahas[a].lon - o.grahas[b].lon;
    });
    var lastLon = -99, level = 0;
    keys.forEach(function (key) {
      var g = o.grahas[key], meta = D.GRAHAS[key];
      if (!meta) return;
      var gap = g.lon - lastLon;
      level = (gap < 9 && gap >= 0) ? (level + 1) % 3 : 0;
      lastLon = g.lon;
      var r = rMark - level * size * 0.062;
      var p = pt(cx, cy, r, ang(g.lon));
      var tick0 = pt(cx, cy, rInner, ang(g.lon)), tick1 = pt(cx, cy, rInner - size * 0.022, ang(g.lon));
      s.push('<line x1="' + f(tick0[0]) + '" y1="' + f(tick0[1]) + '" x2="' + f(tick1[0]) +
             '" y2="' + f(tick1[1]) + '" class="wheel__tick" style="stroke:' + meta.color + '"/>');
      s.push('<g class="wheel__graha"><circle cx="' + f(p[0]) + '" cy="' + f(p[1]) + '" r="' +
             f(size * 0.036) + '" style="fill:' + meta.color + '22;stroke:' + meta.color + '"/>' +
             '<text x="' + f(p[0]) + '" y="' + f(p[1] + 4) + '" style="fill:' + meta.color + '">' +
             esc(meta.short) + '</text>' +
             (g.retro ? '<text x="' + f(p[0] + size * 0.034) + '" y="' + f(p[1] - size * 0.022) +
                        '" class="wheel__retro">R</text>' : '') +
             '<title>' + esc(meta.sa + ' · ' + meta.ru) + '</title></g>');
    });

    s.push('</svg>');
    return s.join('');
  }

  /* ------------------------------------------------ северная сетка (ромб) */
  // Полигоны 12 бхав в единичном квадрате: бхава 1 сверху, дальше против
  // часовой стрелки — классическое северное расположение.
  var NORTH = [
    [[0.5, 0], [0.75, 0.25], [0.5, 0.5], [0.25, 0.25]],          // 1
    [[0, 0], [0.5, 0], [0.25, 0.25]],                            // 2
    [[0, 0], [0.25, 0.25], [0, 0.5]],                            // 3
    [[0, 0.5], [0.25, 0.25], [0.5, 0.5], [0.25, 0.75]],          // 4
    [[0, 0.5], [0.25, 0.75], [0, 1]],                            // 5
    [[0, 1], [0.25, 0.75], [0.5, 1]],                            // 6
    [[0.5, 1], [0.25, 0.75], [0.5, 0.5], [0.75, 0.75]],          // 7
    [[0.5, 1], [0.75, 0.75], [1, 1]],                            // 8
    [[1, 1], [0.75, 0.75], [1, 0.5]],                            // 9
    [[1, 0.5], [0.75, 0.75], [0.5, 0.5], [0.75, 0.25]],          // 10
    [[1, 0.5], [0.75, 0.25], [1, 0]],                            // 11
    [[1, 0], [0.75, 0.25], [0.5, 0]]                             // 12
  ];

  function centroid(poly) {
    var x = 0, y = 0;
    poly.forEach(function (p) { x += p[0]; y += p[1]; });
    return [x / poly.length, y / poly.length];
  }

  function grahaLabels(chart, keys) {
    return keys.map(function (k) {
      var g = chart.grahas[k];
      return D.GRAHAS[k].short + (g.retro ? 'ᴿ' : '') +
             ' ' + Math.floor(g.degInRashi) + '°';
    });
  }

  function gridSvg(cells, size, opts) {
    var s = ['<svg viewBox="0 0 ' + size + ' ' + size + '" class="grid-chart" role="img" aria-label="' +
             esc(opts.label) + '">'];
    s.push('<rect x="1" y="1" width="' + (size - 2) + '" height="' + (size - 2) +
           '" rx="6" class="grid-chart__frame"/>');
    opts.lines.forEach(function (l) {
      s.push('<line x1="' + f(l[0] * size) + '" y1="' + f(l[1] * size) + '" x2="' + f(l[2] * size) +
             '" y2="' + f(l[3] * size) + '" class="grid-chart__line"/>');
    });
    cells.forEach(function (c) {
      var cls = 'grid-chart__cell' + (c.isLagna ? ' is-lagna' : '');
      if (c.poly) {
        s.push('<polygon points="' + c.poly.map(function (p) {
          return f(p[0] * size) + ',' + f(p[1] * size);
        }).join(' ') + '" class="' + cls + '"/>');
      } else {
        s.push('<rect x="' + f(c.box[0] * size) + '" y="' + f(c.box[1] * size) + '" width="' +
               f(c.box[2] * size) + '" height="' + f(c.box[3] * size) + '" class="' + cls + '"/>');
      }
      var x = c.at[0] * size, y = c.at[1] * size;
      s.push('<text x="' + f(x) + '" y="' + f(y - (c.labels.length * 7)) +
             '" class="grid-chart__corner">' + esc(c.corner) + '</text>');
      c.labels.forEach(function (t, i) {
        s.push('<text x="' + f(x) + '" y="' + f(y + 4 + i * 15 - (c.labels.length - 1) * 7 + 7) +
               '" class="grid-chart__graha">' + esc(t) + '</text>');
      });
      if (c.title) s.push('<title>' + esc(c.title) + '</title>');
    });
    s.push('</svg>');
    return s.join('');
  }

  /** Северная сетка: положение бхав постоянно, раши подписываются в углу. */
  function northIndian(chart, size) {
    size = size || 400;
    var cells = chart.bhavas.map(function (b, i) {
      var poly = NORTH[i], c = centroid(poly);
      return {
        poly: poly, at: c, isLagna: i === 0,
        corner: (b.rashi + 1) + ' ' + b.rashiName.slice(0, 4),
        labels: grahaLabels(chart, b.grahas),
        title: b.num + '-я бхава · ' + b.rashiName + ' (' + b.rashiRu + ') · ' + b.meta.title
      };
    });
    return gridSvg(cells, size, {
      label: 'Северная джйотиш-карта: бхавы 1-12 с грахами',
      lines: [[0, 0, 1, 1], [1, 0, 0, 1], [0.5, 0, 1, 0.5], [1, 0.5, 0.5, 1],
              [0.5, 1, 0, 0.5], [0, 0.5, 0.5, 0]]
    });
  }

  /* -------------------------------------------- южная сетка (квадраты) */
  // Раши стоят на своих местах: Мина слева вверху, дальше по часовой.
  var SOUTH_ORDER = [11, 0, 1, 2, 10, null, null, 3, 9, null, null, 4, 8, 7, 6, 5];

  function southIndian(chart, size) {
    size = size || 400;
    var cells = [];
    for (var idx = 0; idx < 16; idx++) {
      var rashi = SOUTH_ORDER[idx];
      if (rashi === null) continue;
      var col = idx % 4, row = Math.floor(idx / 4);
      var b = chart.bhavas.filter(function (x) { return x.rashi === rashi; })[0];
      cells.push({
        box: [col / 4, row / 4, 1 / 4, 1 / 4],
        at: [(col + 0.5) / 4, (row + 0.5) / 4],
        isLagna: b.num === 1,
        corner: (b.num === 1 ? 'Лг · ' : '') + D.RASHIS[rashi].sa.slice(0, 4),
        labels: grahaLabels(chart, b.grahas),
        title: D.RASHIS[rashi].sa + ' (' + D.RASHIS[rashi].ru + ') · ' + b.num + '-я бхава'
      });
    }
    return gridSvg(cells, size, {
      label: 'Южная джйотиш-карта: раши на своих местах',
      lines: [[0.25, 0, 0.25, 1], [0.5, 0, 0.5, 0.25], [0.75, 0, 0.75, 1],
              [0, 0.25, 1, 0.25], [0, 0.5, 0.25, 0.5], [0, 0.75, 1, 0.75],
              [0.5, 0.75, 0.5, 1], [0.75, 0.5, 1, 0.5]]
    });
  }

  root.ArunaChartView = { wheel: wheel, northIndian: northIndian, southIndian: southIndian };
})(typeof globalThis !== 'undefined' ? globalThis : this);
