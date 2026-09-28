/*
 * Сарати · страница карты и гороскопа дня
 * ------------------------------------------------------------------
 * Собирает из расчётных модулей всё, что видит человек: карту, таблицу
 * грах, бхавы, панчангу и мухурту дня, транзиты над натальной картой,
 * стих и Вимшоттари-дашу.
 */
(function (root, doc) {
  'use strict';

  var S = root.Sarathi, A = root.SarathiAstro, C = root.SarathiChart,
      P = root.SarathiPanchanga, Dsh = root.SarathiDasha, D = root.SarathiData,
      Tz = root.SarathiTz, View = root.SarathiChartView, Verses = root.SarathiVerses;

  var EXAMPLE = {
    date: '1975-06-15', time: '06:00', timeKnown: true,
    place: { name: 'Москва', lat: 55.7558, lon: 37.6176, tz: 'Europe/Moscow' }
  };

  var form, state = null, chartMode = 'north';

  /* ------------------------------------------------------------ помощники */
  function hm(jd, tz) { return Tz.jdToLocalHm(jd, tz); }
  function span(a, b, tz) { return hm(a, tz) + ' — ' + hm(b, tz); }
  function grahaDot(key) {
    return '<span class="graha-dot" style="background:' + D.GRAHAS[key].color + '"></span>';
  }
  function yearsRu(y) {
    var n = Math.round(y * 10) / 10;
    var i = Math.floor(n) % 100, j = i % 10;
    var word = (i > 10 && i < 20) || j === 0 || j > 4 ? 'лет' : (j === 1 ? 'год' : 'года');
    return n.toLocaleString('ru-RU') + ' ' + word;
  }
  function dateOfJd(jd) {
    return S.dateRu(Tz.jdToMs(jd), 'UTC', { day: 'numeric', month: 'short', year: 'numeric' })
            .replace(/\s*г\.$/, '');
  }

  /* ---------------------------------------------------------------- блоки */

  function summaryHtml(ch, birth, dasha) {
    var moon = ch.grahas.moon, sun = ch.grahas.sun;
    var cards = [
      ['Лагна', ch.asc.rashiName + ' ' + ch.asc.dms,
       ch.asc.nakshatraName + ', пада ' + ch.asc.pada +
       (birth.timeKnown ? '' : ' · время приблизительное')],
      ['Луна · раши', moon.rashiName + ' ' + moon.dms,
       moon.nakshatraName + ', пада ' + moon.pada],
      ['Солнце · раши', sun.rashiName + ' ' + sun.dms, sun.nakshatraName],
      ['Текущая даша', D.GRAHAS[dasha.maha.lord].sa + ' / ' + D.GRAHAS[dasha.antar.lord].sa,
       dateOfJd(dasha.antar.from) + ' — ' + dateOfJd(dasha.antar.to)]
    ];
    return '<div class="summary">' + cards.map(function (c) {
      return '<div class="stat"><p class="stat__label">' + S.esc(c[0]) + '</p>' +
             '<p class="stat__value">' + S.esc(c[1]) + '</p>' +
             '<p class="stat__sub">' + S.esc(c[2]) + '</p></div>';
    }).join('') + '</div>';
  }

  function chartPanelHtml(ch, birth, offsetLabel) {
    return '<div class="panel">' +
      '<div class="panel__head">' +
        '<h2>Карта рождения</h2>' +
        '<div class="chart-switch" role="group" aria-label="Вид карты">' +
          '<button type="button" data-mode="north" aria-pressed="' + (chartMode === 'north') + '">Северная</button>' +
          '<button type="button" data-mode="south" aria-pressed="' + (chartMode === 'south') + '">Южная</button>' +
          '<button type="button" data-mode="wheel" aria-pressed="' + (chartMode === 'wheel') + '">Круг</button>' +
        '</div>' +
      '</div>' +
      '<div class="chart-box"><div class="chart-box__canvas" id="chartCanvas"></div>' +
        '<p class="tiny muted" style="text-align:center">' +
          S.esc(birth.place.name) + ' · ' +
          S.esc(S.dateRu(state.utcMs, birth.place.tz).replace(/\s*г\.$/, '')) + ', ' +
          S.esc(birth.timeKnown ? S.timeRu(state.utcMs, birth.place.tz) : '12:00 (время неизвестно)') +
          ' · ' + S.esc(offsetLabel) + ' · аянамша ' + S.esc(ch.ayanamsaDms) +
        '</p>' +
      '</div></div>';
  }

  function drawChart(ch) {
    var host = doc.getElementById('chartCanvas');
    if (!host) return;
    if (chartMode === 'north') host.innerHTML = View.northIndian(ch, 420);
    else if (chartMode === 'south') host.innerHTML = View.southIndian(ch, 420);
    else {
      var g = {};
      A.GRAHA_ORDER.forEach(function (k) {
        g[k] = { lon: ch.grahas[k].lon, retro: ch.grahas[k].retro };
      });
      host.innerHTML = View.wheel({ grahas: g, size: 420, zeroLon: ch.asc.lon, ascLon: ch.asc.lon,
                                    title: 'Круг зодиака вашей карты' });
    }
  }

  function grahasTableHtml(ch) {
    var rows = A.GRAHA_ORDER.map(function (k) {
      var g = ch.grahas[k], meta = D.GRAHAS[k];
      var flags = [];
      if (g.retro) flags.push('<span class="tag tag--retro">ретро</span>');
      if (g.combust) flags.push('<span class="tag tag--weak">сожжён</span>');
      if (g.dignity) {
        flags.push('<span class="tag tag--' + g.dignity.tone + '">' + S.esc(g.dignity.ru) + '</span>');
      }
      return '<tr>' +
        '<td><span class="graha-name">' + grahaDot(k) + '<b>' + S.esc(meta.sa) + '</b> ' +
          '<span class="muted small">' + S.esc(meta.ru) + '</span></span></td>' +
        '<td>' + S.esc(g.rashiName) + '</td>' +
        '<td class="num">' + S.esc(g.dms) + '</td>' +
        '<td>' + S.esc(g.nakshatraName) + ' <span class="muted small">пада ' + g.pada + '</span></td>' +
        '<td class="num">' + g.bhava + '</td>' +
        '<td>' + flags.join(' ') + '</td>' +
      '</tr>';
    }).join('');

    return '<div class="panel"><div class="panel__head"><h2>Грахи</h2>' +
      '<p class="tiny muted">Градус — внутри своего раши</p></div>' +
      '<div class="table-wrap"><table class="data">' +
      '<thead><tr><th>Граха</th><th>Раши</th><th>Градус</th><th>Накшатра</th><th>Бхава</th><th></th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '<p class="tiny muted" style="margin-top:12px">' +
      'Сожжение (астангата) отмечено при сближении с Солнцем по обычным для традиции границам. ' +
      'Раху и Кету всегда идут вспять, поэтому «ретро» у них не признак, а свойство.</p></div>';
  }

  function bhavasHtml(ch) {
    var items = ch.bhavas.map(function (b) {
      var grahas = b.grahas.map(function (k) {
        return D.GRAHAS[k].sa + (ch.grahas[k].retro ? ' (R)' : '');
      }).join(', ');
      return '<div class="bhava">' +
        '<div class="bhava__num">' + b.num + '</div>' +
        '<div><p class="bhava__title">' + S.esc(b.meta.title) + '</p>' +
        '<p class="bhava__meta">' + S.esc(b.rashiName) + ' · хозяин ' + S.esc(D.GRAHAS[b.lord].sa) + '</p>' +
        (grahas ? '<p class="bhava__grahas">' + S.esc(grahas) + '</p>' : '') +
        '</div></div>';
    }).join('');
    return '<div class="panel"><div class="panel__head"><h2>Бхавы</h2>' +
      '<p class="tiny muted">Целыми раши, от лагны</p></div>' +
      '<div class="bhava-list">' + items + '</div></div>';
  }

  function dayHtml(ch, birth) {
    var now = Date.now(), jd = Tz.msToJd(now), tz = birth.place.tz;
    var pan = P.panchanga(jd, birth.place.lat, birth.place.lon, tz);
    var ayan = C.ayanamsa(jd);

    var rows = [
      ['Вара', pan.vara ? pan.vara.sa + ' · ' + pan.vara.ru : '—'],
      ['Титхи', pan.tithi.name + ' · ' + pan.tithi.pakshaRu +
        (pan.tithi.endJd ? ' <span class="muted small">до ' + hm(pan.tithi.endJd, tz) + '</span>' : '')],
      ['Накшатра Луны', pan.nakshatra.name + ', пада ' + pan.nakshatra.pada +
        (pan.nakshatra.endJd ? ' <span class="muted small">до ' + hm(pan.nakshatra.endJd, tz) + '</span>' : '')],
      ['Йога', pan.yoga.name +
        (pan.yoga.endJd ? ' <span class="muted small">до ' + hm(pan.yoga.endJd, tz) + '</span>' : '')],
      ['Карана', pan.karana.name]
    ];

    var muh = '';
    if (pan.muhurtas) {
      var m = pan.muhurtas;
      var boxes = [
        ['Восход', hm(pan.sunrise, tz), 'начало ведических суток', ''],
        ['Закат', hm(pan.sunset, tz), 'длина дня ' + S.span(pan.sunset - pan.sunrise), ''],
        ['Брахма-мухурта', span(m.brahma.from, m.brahma.to, tz), 'лучшее время для тишины и чтения', 'good'],
        ['Абхиджит', span(m.abhijit.from, m.abhijit.to, tz), 'короткое благоприятное окно в середине дня', 'good'],
        ['Раху-кала', span(m.rahu.from, m.rahu.to, tz), 'новых дел лучше не начинать', 'avoid'],
        ['Ямаганда', span(m.yamaganda.from, m.yamaganda.to, tz), 'традиция советует переждать', 'avoid'],
        ['Гулика-кала', span(m.gulika.from, m.gulika.to, tz), 'то, что начато, склонно повторяться', 'avoid']
      ];
      muh = '<div class="muhurta-grid" style="margin-top:16px">' + boxes.map(function (b) {
        return '<div class="muhurta' + (b[3] ? ' muhurta--' + b[3] : '') + '">' +
          '<h4>' + S.esc(b[0]) + '</h4><time>' + S.esc(b[1]) + '</time>' +
          '<p>' + S.esc(b[2]) + '</p></div>';
      }).join('') + '</div>';
    }

    // транзиты над натальной картой
    var tr = A.GRAHA_ORDER.map(function (k) {
      var lon = C.toSidereal(pan.positions[k].lon, ayan);
      var info = C.describeLongitude(lon);
      var fromLagna = C.bhavaOf(info.rashi, ch.asc.rashi);
      var fromMoon = C.bhavaOf(info.rashi, ch.moonRashi);
      return { key: k, info: info, fromLagna: fromLagna, fromMoon: fromMoon,
               retro: (k === 'rahu' || k === 'ketu') ? true :
                      (k === 'sun' || k === 'moon') ? false : pan.positions[k].speed < 0 };
    });

    var trRows = tr.map(function (t) {
      return '<tr><td><span class="graha-name">' + grahaDot(t.key) + S.esc(D.GRAHAS[t.key].sa) +
        (t.retro ? ' <span class="tag tag--retro">R</span>' : '') + '</span></td>' +
        '<td>' + S.esc(t.info.rashiName) + ' <span class="num muted">' + S.esc(t.info.dms) + '</span></td>' +
        '<td>' + S.esc(t.info.nakshatraName) + '</td>' +
        '<td class="num">' + t.fromLagna + '</td><td class="num">' + t.fromMoon + '</td></tr>';
    }).join('');

    // классические замечания по транзитам — только то, что прямо считается
    var notes = [];
    var moonT = tr.filter(function (t) { return t.key === 'moon'; })[0];
    notes.push('Луна сегодня идёт по <b>' + moonT.fromLagna + '-й бхаве</b> от вашей лагны — ' +
               D.BHAVAS[moonT.fromLagna - 1].title + '. Это тон дня, он меняется каждые два-три дня.');
    var satT = tr.filter(function (t) { return t.key === 'saturn'; })[0];
    if ([12, 1, 2].indexOf(satT.fromMoon) >= 0) {
      notes.push('Шани проходит <b>' + satT.fromMoon + '-ю бхаву от вашей Луны</b> — это период, который традиция называет <b>саде-сати</b>: семь с половиной лет на то, чтобы навести порядок в опорах. Не наказание, а долгая уборка.');
    } else if ([4, 7, 10].indexOf(satT.fromMoon) >= 0) {
      notes.push('Шани в <b>' + satT.fromMoon + '-й бхаве от Луны</b> (кантака-шани): нагрузка ложится на дом, работу и отношения — там, где вы держите вес.');
    }
    var jupT = tr.filter(function (t) { return t.key === 'jupiter'; })[0];
    notes.push('Гуру в <b>' + jupT.fromLagna + '-й бхаве</b> от лагны — там, где сейчас легче расти и учиться.');

    return { html:
      '<div class="panel"><div class="panel__head"><h2>Небо дня</h2>' +
        '<p class="tiny muted">' + S.esc(S.dateRu(now, tz).replace(/\s*г\.$/, '')) + ' · ' +
        S.esc(birth.place.name) + '</p></div>' +
        '<dl class="kv">' + rows.map(function (r) {
          return '<dt>' + S.esc(r[0]) + '</dt><dd>' + r[1] + '</dd>';
        }).join('') + '</dl>' + muh +
        '<p class="tiny muted" style="margin-top:14px">Отрезки мухурты считаются от восхода и заката ' +
        'для места рождения. Если вы живёте в другом городе, время сдвинется — это нормально.</p>' +
      '</div>' +
      '<div class="panel"><div class="panel__head"><h2>Транзиты над вашей картой</h2>' +
        '<p class="tiny muted">Бхавы — от лагны и от Луны</p></div>' +
        '<div class="table-wrap"><table class="data"><thead><tr>' +
        '<th>Граха</th><th>Сегодня в раши</th><th>Накшатра</th><th>От лагны</th><th>От Луны</th>' +
        '</tr></thead><tbody>' + trRows + '</tbody></table></div>' +
        '<ul class="ticks" style="margin-top:16px">' +
        notes.map(function (n) { return '<li>' + n + '</li>'; }).join('') + '</ul>' +
      '</div>', pan: pan, now: now, tz: tz };
  }

  function verseHtml(pan, now, tz) {
    var pick = Verses.pickVerse({
      varaLord: pan.vara ? pan.vara.lord : null,
      nakshatraLord: pan.nakshatra.lord,
      paksha: pan.tithi.paksha,
      tithiName: pan.tithi.name,
      dateKey: S.dayKey(now, tz)
    });
    var why = [];
    if (pan.vara) why.push('вара ' + D.GRAHAS[pan.vara.lord].sa);
    why.push('накшатра ' + pan.nakshatra.name);
    why.push(pan.tithi.pakshaRu);
    return '<div class="panel"><div class="panel__head"><h2>Стих дня</h2>' +
      '<p class="tiny muted">Выбран по небу, а не случайно</p></div>' +
      '<figure class="verse" style="margin:0">' +
        '<blockquote class="verse__sa">' + S.esc(pick.verse.sa) + '</blockquote>' +
        '<p class="verse__ru">' + S.esc(pick.verse.ru) + '</p>' +
        '<figcaption class="verse__meta"><cite>' + S.esc(pick.verse.src + ' ' + pick.verse.ref) + '</cite>' +
        '<span class="verse__why">выбран по: ' + S.esc(why.join(' · ')) + '</span></figcaption>' +
      '</figure></div>';
  }

  function dashaHtml(ch, jdNow) {
    var frac = ch.grahas.moon.nakFraction;
    var list = Dsh.mahadashas(ch.jd, ch.moonNakshatra, frac).slice(0, 9);
    var cur = Dsh.current(ch.jd, ch.moonNakshatra, frac, jdNow);
    var bal = Dsh.balanceAtBirth(ch.moonNakshatra, frac);

    var now3 = [['Махадаша', cur.maha], ['Антардаша', cur.antar], ['Пратьянтардаша', cur.pratyantar]]
      .map(function (p) {
        return '<div class="stat"><p class="stat__label">' + p[0] + '</p>' +
          '<p class="stat__value">' + S.esc(D.GRAHAS[p[1].lord].sa) + '</p>' +
          '<p class="stat__sub">' + dateOfJd(p[1].from) + ' — ' + dateOfJd(p[1].to) + '</p></div>';
      }).join('');

    var bars = list.map(function (p) {
      var isNow = jdNow >= p.from && jdNow < p.to;
      var pct = isNow ? Math.round((jdNow - p.from) / (p.to - p.from) * 100) : (jdNow >= p.to ? 100 : 0);
      return '<div class="dasha-row' + (isNow ? ' is-now' : '') + '">' +
        '<span>' + grahaDot(p.lord) + ' ' + S.esc(D.GRAHAS[p.lord].sa) + '</span>' +
        '<span class="dasha-row__track"><span class="dasha-row__fill" style="background:' +
          D.GRAHAS[p.lord].color + ';right:' + (100 - pct) + '%"></span></span>' +
        '<span class="dasha-row__years">' + dateOfJd(p.from) + ' — ' + dateOfJd(p.to) + '</span>' +
      '</div>';
    }).join('');

    return '<div class="panel"><div class="panel__head"><h2>Вимшоттари-даша</h2>' +
      '<p class="tiny muted">От накшатры Луны · цикл 120 лет</p></div>' +
      '<div class="dasha-now">' + now3 + '</div>' +
      '<div class="dasha-bar">' + bars + '</div>' +
      '<p class="tiny muted" style="margin-top:12px">При рождении оставалось ' +
      S.esc(yearsRu(bal.years)) + ' периода ' + S.esc(D.GRAHAS[bal.lord].sa) + ': ' +
      'столько, сколько Луне оставалось пройти по своей накшатре. Год здесь — 365,2425 суток.</p></div>';
  }

  /* ------------------------------------------------------------- отрисовка */
  function render(birth) {
    var out = doc.getElementById('results');
    var built = S.chartFromBirth(birth);
    state = { birth: birth, chart: built.chart, utcMs: built.utcMs, offsetLabel: built.offsetLabel };

    var ch = built.chart;
    var jdNow = Tz.msToJd(Date.now());
    var cur = Dsh.current(ch.jd, ch.moonNakshatra, ch.grahas.moon.nakFraction, jdNow);
    var day = dayHtml(ch, birth);

    out.innerHTML =
      summaryHtml(ch, birth, cur) +
      chartPanelHtml(ch, birth, built.offsetLabel) +
      day.html +
      verseHtml(day.pan, day.now, day.tz) +
      grahasTableHtml(ch) +
      bhavasHtml(ch) +
      dashaHtml(ch, jdNow);

    drawChart(ch);

    S.qa('.chart-switch button', out).forEach(function (b) {
      b.addEventListener('click', function () {
        chartMode = b.dataset.mode;
        S.qa('.chart-switch button', out).forEach(function (x) {
          x.setAttribute('aria-pressed', String(x.dataset.mode === chartMode));
        });
        drawChart(ch);
      });
    });

    S.saveBirth(birth);
  }

  /* ---------------------------------------------------------------- старт */
  function start() {
    var host = doc.getElementById('birthForm');
    if (!host) return;
    var saved = S.loadBirth();
    form = S.BirthForm.create(host, { value: saved });

    var panel = doc.getElementById('birthPanel');
    var err = doc.getElementById('formError');

    panel.addEventListener('submit', function (e) {
      e.preventDefault();
      var problem = form.validate();
      if (problem) { err.textContent = problem; err.hidden = false; return; }
      err.hidden = true;
      try {
        render(form.getValue());
        if (root.innerWidth < 940) {
          doc.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      } catch (ex) {
        err.textContent = 'Не удалось построить карту: ' + ex.message;
        err.hidden = false;
        if (root.console) root.console.error(ex);
      }
    });

    doc.getElementById('exampleBtn').addEventListener('click', function () {
      form.setValue(EXAMPLE);
      render(EXAMPLE);
      if (root.innerWidth < 940) {
        doc.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });

    if (saved) { try { render(saved); } catch (e) { /* покажем пустое состояние */ } }
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
  else start();
})(typeof globalThis !== 'undefined' ? globalThis : this, document);
