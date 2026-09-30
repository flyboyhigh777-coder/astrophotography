/*
 * Аруна · страница дня
 * ------------------------------------------------------------------
 * Выбрал знак — увидел, что сегодня на небе именно для него: где Луна,
 * какие грахи идут легко, какие требуют внимания, что загорожено ведхой,
 * какой стих подходит ко дню и что с этим со всем делать.
 *
 * Всё считается здесь же и меняется само: Луна переходит в новый раши
 * раз в двое с небольшим суток, Солнце — раз в месяц, Гуру и Шани — раз
 * в год и в два с половиной. Поэтому страница «обновляется ежедневно»
 * без всякого обновления: её нечего обновлять, она считает на сейчас.
 *
 * Знак берётся по Луне, а не по Солнцу. Это не придирка: в джйотише
 * дневные приметы всю дорогу читают от Чандра-лагны, и если взять
 * солнечный знак из журналов, посчитается не то, о чём написано в
 * классике. Поэтому знак либо выбирают сами, либо считаем по дате.
 */
(function (root, doc) {
  'use strict';

  var S = root.Aruna, D = root.ArunaData, Gc = root.ArunaGochara,
      Dl = root.ArunaDaily, P = root.ArunaPanchanga, V = root.ArunaVerses,
      Tz = root.ArunaTz, C = root.ArunaChart;

  var KEY = 'aruna.today.rashi';
  var form = null, rashi = null;

  function el(id) { return doc.getElementById(id); }
  var esc = S.esc;

  /** Откуда смотрим на небо: из сохранённого места рождения или из зоны браузера. */
  function place_() {
    var b = S.loadBirth();
    if (b && b.place && b.place.tz) return b.place;
    var tz = 'Europe/Moscow';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz; } catch (e) { /* старый движок */ }
    var city = root.ArunaCities && root.ArunaCities.CITIES.filter(function (c) { return c[3] === tz; })[0];
    return city ? { name: city[0], lat: city[1], lon: city[2], tz: city[3] }
                : { name: 'Москва', lat: 55.7558, lon: 37.6176, tz: tz };
  }

  /* ------------------------------------------------------- выбор знака */

  function signGrid() {
    var host = el('signGrid');
    host.innerHTML = D.RASHIS.map(function (r, i) {
      return '<button type="button" class="sign" role="radio" aria-checked="false" ' +
             'data-rashi="' + i + '">' +
             '<span class="sign__ru">' + esc(r.ru) + '</span>' +
             '<span class="sign__sa">' + esc(r.sa) + '</span></button>';
    }).join('');
    host.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-rashi]');
      if (b) choose(+b.dataset.rashi);
    });
  }

  function choose(i) {
    rashi = i;
    try { root.localStorage.setItem(KEY, String(i)); } catch (e) { /* инкогнито */ }
    S.qa('#signGrid .sign').forEach(function (b, k) {
      b.classList.toggle('is-on', k === i);
      b.setAttribute('aria-checked', String(k === i));
    });
    render();
  }

  /* ------------------------------------------------------------ сборка */

  function houseLine(h) {
    var x = Dl.HOUSES[h];
    return x.loc + ' доме — это про ' + x.about;
  }

  function grahaRow(it) {
    var g = D.GRAHAS[it.graha], v = Dl.VERDICT[it.verdict];
    var blocked = it.verdict === 'blocked';
    return '<li class="gr gr--' + v.tone + '">' +
      '<span class="gr__glyph" aria-hidden="true">' + esc(g.glyph) + '</span>' +
      '<span class="gr__body">' +
        '<span class="gr__name">' + esc(g.ru) + '</span> ' +
        '<span class="gr__where">' + esc(Dl.HOUSES[it.house].loc) + ' доме от знака — про ' +
          esc(Dl.HOUSES[it.house].about) + '</span>' +
        (blocked
          ? '<span class="gr__note">Классика обещает здесь лёгкий проход, но его загораживает ' +
            it.blockedBy.map(function (k) { return esc(D.GRAHAS[k].ru); }).join(' и ') +
            ' из ' + esc(Dl.HOUSES[it.vedhaHouse].gen) + ' дома. Ведха — правило из ' +
            '«Пхаладипики»: загороженный проход не работает ни в плюс, ни в минус.</span>'
          : '') +
      '</span></li>';
  }

  function verseBlock(pan, dateKey, lord) {
    var pick = V.pickVerse({
      varaLord: pan.vara ? pan.vara.lord : null,
      nakshatraLord: pan.nakshatra ? pan.nakshatra.lord : null,
      paksha: pan.tithi.paksha,
      tithiName: pan.tithi.name,
      // Хозяин знака подкрашивает выбор, но не правит им: день важнее.
      themes: [{ tag: lord, weight: 2, why: 'хозяин вашего знака' }],
      spread: 2,
      dateKey: dateKey
    });
    var v = pick.verse;
    return '<div class="panel verse-panel">' +
      '<div class="panel__head"><h2>Стих на сегодня</h2>' +
      '<p class="tiny muted">Выбран по небу дня и хозяину вашего знака</p></div>' +
      '<p class="verse__sa">' + esc(v.sa) + '</p>' +
      '<p class="verse__ru">' + esc(v.ru) + '</p>' +
      '<p class="verse__ref">' + esc(v.src) + ' ' + esc(v.ref) +
        (pick.reasons.length
          ? ' <span class="muted">· почему этот: ' +
            esc(pick.reasons.filter(function (x, i, a) { return a.indexOf(x) === i; }).join(', ')) +
            '</span>'
          : '') +
      '</p></div>';
  }

  function render() {
    if (rashi === null) return;
    var out = el('today');
    var r = D.RASHIS[rashi];
    var now = Date.now();
    /*
     * Место нужно только вару: она меняется на восходе, а не в полночь.
     * Титхи, накшатра, йога и карана от места не зависят вовсе. Если
     * карта рождения сохранена — считаем по ней, иначе по зоне браузера
     * и средней широте: ошибка в варе возможна только в пределах часа
     * вокруг рассвета.
     */
    var place = place_();
    var tz = place.tz;
    var jd = Tz.msToJd(now);
    var dateKey = S.dateRu(now, tz);

    var g = Gc.forRashi(rashi, jd);
    var cb = Gc.chandraBala(rashi, jd);
    var pan = P.panchanga(jd, place.lat, place.lon, tz);
    var paksha = pan.tithi.paksha === 'шукла' ? 'shukla' : 'krishna';

    var good = g.items.filter(function (i) { return i.verdict === 'good'; });
    var hard = g.items.filter(function (i) { return i.verdict === 'hard'; });
    var blocked = g.items.filter(function (i) { return i.verdict === 'blocked'; });

    var slow = g.items.filter(function (i) {
      return ['jupiter', 'saturn', 'rahu', 'ketu'].indexOf(i.graha) >= 0;
    });

    out.innerHTML =
      /* ---------------------------------------------------- заголовок */
      '<div class="panel today-head">' +
        '<div class="panel__head">' +
          '<h2>' + esc(r.ru) + ' · ' + esc(dateKey.replace(/\s*г\.$/, '')) + '</h2>' +
          '<p class="tiny muted">Хозяин знака — ' + esc(D.GRAHAS[r.lord].ru) +
          ' · стихия ' + esc(r.tattva) + '</p>' +
        '</div>' +
        '<p class="today-moon">' + esc(Dl.CHANDRA[cb.level]) + '</p>' +
        '<p class="today-moon__where">Луна ' + esc(houseLine(cb.house)) + '.</p>' +
        '<p class="today-wish">' + esc(Dl.MOON_WISH[cb.house][paksha]) + '</p>' +
        '<p class="tiny muted">' + esc(Dl.VARA_NOTE[pan.vara ? pan.vara.lord : 'sun']) + '</p>' +
      '</div>' +

      /* ------------------------------------------------------- небо дня */
      '<div class="panel">' +
        '<div class="panel__head"><h2>Небо дня</h2>' +
        '<p class="tiny muted">Панчанга — пять примет, общие для всех знаков</p></div>' +
        '<dl class="kv">' +
          '<dt>Вара</dt><dd>' + esc(pan.vara ? pan.vara.sa + ' · ' + pan.vara.ru : '—') + '</dd>' +
          '<dt>Титхи</dt><dd>' + esc(pan.tithi.name + ' · ' + pan.tithi.pakshaRu) + '</dd>' +
          '<dt>Накшатра Луны</dt><dd>' + esc(pan.nakshatra.name + ', пада ' + pan.nakshatra.pada) + '</dd>' +
          '<dt>Йога</dt><dd>' + esc(pan.yoga.name) + '</dd>' +
          '<dt>Карана</dt><dd>' + esc(pan.karana.name) + '</dd>' +
        '</dl>' +
      '</div>' +

      /* -------------------------------------------------------- проход */
      '<div class="panel">' +
        '<div class="panel__head"><h2>Что идёт легко</h2>' +
        '<p class="tiny muted">' + good.length + ' из девяти грах в благоприятных домах от вашего знака</p></div>' +
        (good.length
          ? '<ul class="gr-list">' + good.map(grahaRow).join('') + '</ul>'
          : '<p class="muted">Сегодня ни одна граха не стоит к вашему знаку благоприятно. ' +
            'Так бывает часто: у Шани и Мангала благоприятных домов всего три из двенадцати, ' +
            'и «пусто» здесь значит «обычный день», а не «плохой».</p>') +
      '</div>' +

      (blocked.length
        ? '<div class="panel">' +
            '<div class="panel__head"><h2>Загорожено</h2>' +
            '<p class="tiny muted">Хороший проход, отменённый ведхой</p></div>' +
            '<ul class="gr-list">' + blocked.map(grahaRow).join('') + '</ul>' +
          '</div>'
        : '') +

      '<div class="panel">' +
        '<div class="panel__head"><h2>Что требует внимания</h2>' +
        '<p class="tiny muted">Не беда и не угроза: просто эти области сегодня идут через усилие</p></div>' +
        (hard.length
          ? '<ul class="gr-list">' + hard.map(grahaRow).join('') + '</ul>'
          : '<p class="muted">Сегодня ни одна граха не стоит неудобно — редкий день.</p>') +
      '</div>' +

      /* ------------------------------------------------------ медленное */
      '<div class="panel">' +
        '<div class="panel__head"><h2>Медленное</h2>' +
        '<p class="tiny muted">Гуру, Шани и узлы стоят в одном доме месяцами — это фон, а не день</p></div>' +
        '<ul class="gr-list">' + slow.map(grahaRow).join('') + '</ul>' +
      '</div>' +

      verseBlock(pan, dateKey + '/' + r.ru, r.lord) +

      '<p class="form-note" style="margin-top:18px">' +
        'Таблицы прохода и ведхи — «Пхаладипика» Мантрешвары, глава 26. ' +
        'Расчёт положений идёт в вашем браузере и сверен с независимыми эфемеридами. ' +
        'Здесь не сказано, что случится: сказано, к чему день повёрнут.' +
      '</p>';

    out.hidden = false;
    el('todayEmpty').hidden = true;
    if (S.Glossary) S.Glossary.apply(out);
  }

  /* -------------------------------------------------- знак по рождению */

  function calcFromBirth() {
    var err = el('signError');
    var problem = form.validate();
    if (problem) { err.textContent = problem; err.hidden = false; return; }
    err.hidden = true;
    try {
      var built = S.chartFromBirth(form.getValue());
      var moonRashi = Math.floor(built.chart.grahas.moon.lon / 30);
      choose(moonRashi);
      S.reveal(el('today'));
    } catch (ex) {
      err.textContent = 'Не удалось посчитать: ' + ex.message;
      err.hidden = false;
    }
  }

  function start() {
    if (!el('signGrid')) return;
    signGrid();
    form = S.BirthForm.create(el('signBirth'), { value: S.loadBirth() });
    el('signCalc').addEventListener('click', calcFromBirth);

    // Запомненный знак, а если его нет — знак Луны из сохранённой карты.
    var saved = null;
    try { saved = root.localStorage.getItem(KEY); } catch (e) { /* инкогнито */ }
    if (saved !== null && saved !== '') { choose(+saved); return; }

    var birth = S.loadBirth();
    if (birth) {
      try {
        var built = S.chartFromBirth(birth);
        choose(Math.floor(built.chart.grahas.moon.lon / 30));
      } catch (e) { /* покажем пустое состояние */ }
    }
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
  else start();
})(typeof globalThis !== 'undefined' ? globalThis : this, document);
