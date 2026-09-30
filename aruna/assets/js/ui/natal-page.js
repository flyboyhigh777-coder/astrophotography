/*
 * Аруна · страница натальной карты
 * ==================================================================
 * Граница платного здесь та же, что во всём проекте: считается —
 * бесплатно, разбирается — за биджи.
 *
 *   бесплатно: колесо, положения, куспиды во всех семи системах,
 *              список аспектов с орбисами, стихии и кресты, три опоры;
 *   за биджи:  планеты по домам, разбор аспектов и фигур, достоинства,
 *              рисунок карты, транзиты на год, прогрессии.
 *
 * Тяжёлое (транзиты, прогрессии) не считается, пока разбор не открыт:
 * незачем греть браузер ради того, что человек не увидит.
 */
(function (root, doc) {
  'use strict';

  var S = root.Aruna, Acc = root.ArunaAccess, D = root.ArunaNatalData,
      N = root.ArunaNatal, H = root.ArunaHouses, Asp = root.ArunaAspects, A = root.ArunaAstro,
      Dg = root.ArunaDignities, Shp = root.ArunaShape, Tr = root.ArunaTransits,
      I = root.ArunaInterpret, W = root.ArunaNatalWheel, Tz = root.ArunaTz;

  var SKEY = 'aruna.natal.system.v1';
  var EXAMPLE = {
    date: '1990-05-15', time: '10:30', timeKnown: true,
    place: { name: 'Москва', lat: 55.7558, lon: 37.6176, tz: 'Europe/Moscow' }
  };

  var form = null, state = null, live = null;

  function esc(s) { return S.esc(s); }
  function el(id) { return doc.getElementById(id); }

  function system() {
    var sel = el('houseSystem');
    return sel ? sel.value : 'placidus';
  }

  /* ------------------------------------------------------------ вывод */

  function block(title, text, rule) {
    return '<div class="nb">' +
      (title ? '<p class="nb__t">' + esc(title) + '</p>' : '') +
      '<p>' + esc(text) + '</p>' +
      (rule ? '<p class="nb__rule">' + esc(rule) + '</p>' : '') +
      '</div>';
  }

  function renderOpening(free) {
    // заголовок первого блока совпадает с заголовком панели — не дублируем
    el('openingBox').innerHTML =
      free.opening.map(function (o, i) {
        return block(i === 0 ? null : o.title, o.text, o.rule);
      }).join('') +
      block(free.sun.title, free.sun.text, free.sun.rule) +
      block(free.moon.title, free.moon.text, free.moon.rule) +
      block(free.asc.title, free.asc.text, free.asc.rule);
  }

  function renderPositions(chart) {
    var rows = D.PLANET_ORDER.filter(function (k) { return chart.planets[k]; })
      .map(function (k) {
        var p = chart.planets[k];
        var marks = [];
        if (p.retro) marks.push('<abbr title="ретроградна — идёт вспять">℞</abbr>');
        if (p.cazimi) marks.push('<abbr title="в сердце Солнца: ближе 17′">казими</abbr>');
        else if (p.combust) marks.push('<abbr title="ближе 8,5° к Солнцу">сожжена</abbr>');
        else if (p.underBeams) marks.push('<abbr title="ближе 15° к Солнцу">под лучами</abbr>');
        return '<tr><td><span class="glyph">' + p.meta.glyph + '</span> ' + esc(p.meta.ru) + '</td>' +
          '<td>' + esc(D.SIGNS[p.sign].glyph + ' ' + p.signRu) + '</td>' +
          '<td class="num">' + esc(p.dms) + '</td>' +
          '<td class="num">' + (p.house || '—') + '</td>' +
          '<td class="num tiny">' + p.speed.toFixed(3) + '°</td>' +
          '<td class="tiny muted">' + marks.join(' ') + '</td></tr>';
      }).join('');
    var angles = [chart.angles.asc, chart.angles.mc, chart.fortune].map(function (a) {
      return '<tr class="row--soft"><td>' + esc(a.ru) + '</td><td>' +
        esc(D.SIGNS[a.sign].glyph + ' ' + a.signRu) + '</td><td class="num">' +
        esc(a.dms) + '</td><td colspan="3"></td></tr>';
    }).join('');
    el('posTable').innerHTML =
      '<thead><tr><th>Планета</th><th>Знак</th><th>Градус</th><th>Дом</th>' +
      '<th>Скорость</th><th></th></tr></thead><tbody>' + rows + angles + '</tbody>';
  }

  function renderHouses(chart) {
    var hs = chart.houses;
    el('housesMeta').textContent = hs.system.title +
      (hs.failed ? ' — не определена здесь, показан Порфирий' : '') +
      ' · ' + hs.system.about;
    var rows = '';
    for (var n = 1; n <= 12; n++) {
      var c = hs.cusps[n], sign = D.signOf(c);
      var meta = D.HOUSES[n - 1];
      var inside = D.PLANET_ORDER.filter(function (k) {
        return chart.planets[k] && chart.planets[k].house === n;
      }).map(function (k) { return chart.planets[k].meta.glyph; }).join(' ');
      rows += '<tr' + (meta.angular ? ' class="row--strong"' : '') + '>' +
        '<td>' + n + '<span class="tiny muted"> · ' + esc(meta.title) + '</span></td>' +
        '<td>' + esc(D.SIGNS[sign].glyph + ' ' + D.SIGNS[sign].ru) + '</td>' +
        '<td class="num">' + esc(D.dms(D.degInSign(c))) + '</td>' +
        '<td>' + esc(D.PLANETS[D.SIGNS[sign].ruler].ru) + '</td>' +
        '<td class="glyph">' + inside + '</td></tr>';
    }
    el('housesTable').innerHTML =
      '<thead><tr><th>Дом</th><th>Знак куспида</th><th>Градус</th><th>Управитель</th>' +
      '<th>Внутри</th></tr></thead><tbody>' + rows + '</tbody>';

    if (hs.failed) {
      el('housesTable').insertAdjacentHTML('beforebegin',
        '<p class="note-box">' + esc(hs.why) + ' Показана система Порфирия — ' +
        'она определена на любой широте.</p>');
    }

    // платный разбор: планеты по домам
    var full = D.PLANET_ORDER.filter(function (k) {
      return chart.planets[k] && chart.planets[k].house && D.PLANETS[k];
    }).map(function (k) {
      var a = I.planetInSign(chart, k), b = I.planetInHouse(chart, k);
      return block(b.title, b.text, b.rule) + (a ? block(null, a.text, a.rule) : '');
    }).join('');
    el('housesReport').innerHTML = S.Paywall.section('natal.houses', full,
      full.split('</div>').slice(0, 2).join('</div>') + '</div>');
  }

  function renderAspects(chart, asp) {
    el('aspectsMeta').textContent = asp.list.length + ' аспектов: напряжённых ' +
      asp.counts.hard + ', гармоничных ' + asp.counts.soft +
      ', нейтральных ' + asp.counts.neutral;
    var rows = asp.list.map(function (x) {
      return '<tr><td>' + esc(x.aRu) + '</td>' +
        '<td class="glyph asp-' + x.nature + '">' + x.glyph + '</td>' +
        '<td>' + esc(x.bRu) + '</td>' +
        '<td class="num">' + x.orbDiff.toFixed(2) + '°</td>' +
        '<td class="tiny muted">' + (x.applying === true ? 'сходится'
          : x.applying === false ? 'расходится' : '—') + '</td></tr>';
    }).join('');
    el('aspTable').innerHTML =
      '<thead><tr><th></th><th></th><th></th><th>Орб</th><th></th></tr></thead>' +
      '<tbody>' + rows + '</tbody>';

    var patterns = asp.patterns.map(function (p) {
      return block(p.ru + (p.where ? ' в ' + p.where : ''),
        p.about, 'Участники: ' + (p.names || []).join(', ') + '.');
    }).join('') || '<p class="muted">Классических фигур в этой карте не сложилось — ' +
      'это обычное дело и ни о чём плохом не говорит.</p>';
    var detail = asp.list.slice(0, 14).map(function (x) {
      var t = I.aspect(chart, x);
      return block(t.title, t.text, t.rule);
    }).join('');
    el('aspectsReport').innerHTML = S.Paywall.section('natal.aspects',
      '<h3 class="nb__h">Фигуры</h3>' + patterns + '<h3 class="nb__h">Аспекты по одному</h3>' + detail,
      '<h3 class="nb__h">Фигуры</h3>' + (asp.patterns.length
        ? block(asp.patterns[0].ru, asp.patterns[0].about.slice(0, 120) + '…', null)
        : block(null, 'Разбор начинается с фигур, если они есть, и дальше идёт по аспектам.', null)));
  }

  function renderDignities(chart) {
    var dg = Dg.all(chart);
    var rows = dg.rows.map(function (r) {
      var good = r.dignities.map(function (d) { return d.ru; }).join(', ');
      var bad = r.debilities.map(function (d) { return d.ru; }).join(', ');
      return '<tr><td>' + esc(r.ru) + '</td><td>' + esc(r.signIn) + '</td>' +
        '<td class="num">' + r.total + '</td>' +
        '<td>' + esc(r.band) + '</td>' +
        '<td class="tiny">' + esc([good, bad].filter(Boolean).join(' · ') || '—') + '</td></tr>';
    }).join('');
    var table = '<div class="table-wrap"><table class="data">' +
      '<thead><tr><th>Планета</th><th>Знак</th><th>Очки</th><th></th><th>Достоинства</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>';
    var alm = dg.almutenAsc.winner;
    var extra = block('Альмутен асцендента: ' + D.PLANETS[alm.key].ru,
      'Эта планета набирает больше всех очков в градусе асцендента (' +
      alm.score + ' по ' + alm.why.join(' и ') + '). Классика видит в ней ' +
      'распорядителя всей карты: её положение и состояние задают тон остальному.',
      'Очки: обитель 5, экзальтация 4, тритон 3, терм 2, декан 1.') +
      dg.rows.map(function (r) {
        var acc = (r.accidental || []).map(function (a) { return a.ru; }).join(', ');
        return block(r.ru, I.dignityLine(r) + (acc ? ' По положению: ' + acc + '.' : ''),
          (r.accidental || []).map(function (a) { return a.why; }).join(' '));
      }).join('') +
      '<p class="tiny muted">' + esc(dg.note) + '</p>';
    el('dignitiesReport').innerHTML = table +
      S.Paywall.section('natal.dignities', extra, block(null,
        'Разбор объясняет каждую строку таблицы и добавляет альмутена, ' +
        'сожжение, скорость и положение по домам.', null));
  }

  function renderShape(chart) {
    var sh = Shp.pattern(chart);
    var sing = Shp.singletons(chart);
    var disp = Shp.finalDispositor(chart);
    var b = chart.balance;
    var freeBit = block('Стихии и кресты',
      Object.keys(b.elementShare).map(function (k) {
        return D.ELEMENTS[k].ru + ' ' + Math.round(b.elementShare[k] * 100) + '%';
      }).join(', ') + '. Кресты: ' + Object.keys(b.modeShare).map(function (k) {
        return D.MODES[k].ru + ' ' + Math.round(b.modeShare[k] * 100) + '%';
      }).join(', ') + '.',
      'Веса: светила 3, личные планеты 2, социальные 1,5, дальние 0,5.');
    var paid = (sh ? block('Фигура: ' + sh.ru, sh.about,
        'Занятая дуга ' + sh.span.toFixed(0) + '°, наибольший разрыв ' +
        sh.gaps[0].size.toFixed(0) + '°, ведёт ' + sh.leadName + '.') : '') +
      sing.map(function (x) { return block(x.ru + ' — одиночка', x.about, null); }).join('') +
      block('Финальный диспозитор', disp.about,
        'Цепочка строится так: планета → управитель её знака → и дальше, пока не придёт ' +
        'к планете в своём знаке.');
    el('shapeReport').innerHTML = freeBit +
      S.Paywall.section('natal.shape', paid,
        block(null, 'Разбор называет фигуру карты по Джонсу, её ведущую планету и ручку, ' +
          'одиночек по стихиям и крестам и финального диспозитора.', null));
  }

  function fmtDate(jd) {
    return S.dateRu(Tz.jdToMs(jd), state.chart.tz, { day: 'numeric', month: 'long', year: 'numeric' })
      .replace(/\s*г\.$/, '');
  }

  function renderTransits(chart) {
    var host = el('transitsReport');
    if (!Acc.has('natal.transits')) {
      host.innerHTML = S.Paywall.section('natal.transits', '<div id="transitsInner"></div>',
        block(null, 'Считаются медленные планеты — Юпитер, Сатурн, Уран, Нептун, Плутон — ' +
          'к точкам вашей карты: даты, когда аспект точен, все три прохода при ' +
          'ретроградности, переходы по знакам и домам и возвращения.', null));
      return;
    }
    var now = Tz.msToJd(Date.now());
    var t = Tr.ahead(chart, now, 12);
    var rows = t.events.map(function (e) {
      return '<tr><td class="num tiny">' + esc(fmtDate(e.jd)) + '</td>' +
        '<td>' + esc(e.transitRu) + '</td>' +
        '<td class="glyph asp-' + e.nature + '">' + e.glyph + '</td>' +
        '<td>' + esc(e.targetRu) + '</td>' +
        '<td class="tiny muted">' + (e.passes > 1 ? 'проход ' + e.pass + ' из ' + e.passes : '') +
        '</td></tr>';
    }).join('') || '<tr><td colspan="5" class="muted">В ближайший год точных аспектов ' +
      'от медленных планет нет — спокойный отрезок.</td></tr>';
    var ing = t.ingresses.map(function (i) {
      return block(i.ru + ' переходит в ' + D.SIGNS[i.sign].in,
        fmtDate(i.jd) + '. В вашей карте это ' + i.house + '-й дом — ' +
        D.HOUSES[i.house - 1].title + ': ' + D.HOUSES[i.house - 1].about + '.',
        null);
    }).join('');
    var ret = t.returns.map(function (r) {
      return block(r.ru, fmtDate(r.jd) + ' — ' + r.about + '.', null);
    }).join('');
    host.innerHTML =
      '<div class="table-wrap"><table class="data"><thead><tr><th>Когда точно</th>' +
      '<th>Транзит</th><th></th><th>К точке карты</th><th></th></tr></thead><tbody>' +
      rows + '</tbody></table></div>' +
      (ing ? '<h3 class="nb__h">Переходы</h3>' + ing : '') +
      (ret ? '<h3 class="nb__h">Возвращения</h3>' + ret : '') +
      '<p class="tiny muted">Дата — это когда аспект точен, а не когда «случится». ' +
      'Карта показывает обстановку, а не событие: так написано во всех разделах ' +
      'этого сайта, и здесь тоже.</p>';
  }

  function renderProgress(chart) {
    var host = el('progressReport');
    if (!Acc.has('natal.progress')) {
      host.innerHTML = S.Paywall.section('natal.progress', '<div></div>',
        block(null, 'Вторичные прогрессии: один день после рождения приравнивается к ' +
          'одному году жизни. Прогрессивные Солнце, Луна, асцендент и MC, фаза ' +
          'прогрессивной Луны и дата, когда она сменит знак.', null));
      return;
    }
    var now = Tz.msToJd(Date.now());
    var pr = Tr.progressed(chart, now, system());
    var rows = Object.keys(pr.planets).map(function (k) {
      var p = pr.planets[k];
      return '<tr><td>' + esc(p.ru) + '</td><td>' + esc(p.signIn) + '</td>' +
        '<td class="num">' + esc(p.dms) + '</td><td class="num">' + (p.house || '—') + '</td>' +
        '<td class="tiny muted">' + (p.moved ? 'знак сменился' : '') + '</td></tr>';
    }).join('');
    var nx = Tr.nextProgressedMoonSign(chart, now);
    host.innerHTML =
      '<p class="tiny muted">Возраст ' + pr.years.toFixed(1) + ' лет — значит, ' +
      'смотрим карту на ' + esc(fmtDate(pr.jd)) + ', то есть столько же суток после рождения.</p>' +
      '<div class="table-wrap"><table class="data"><thead><tr><th>Планета</th><th>Знак</th>' +
      '<th>Градус</th><th>Дом</th><th></th></tr></thead><tbody>' + rows +
      '<tr class="row--soft"><td>Асцендент</td><td>' + esc(pr.asc.signIn) + '</td>' +
      '<td class="num">' + esc(pr.asc.dms) + '</td><td colspan="2"></td></tr>' +
      '<tr class="row--soft"><td>Середина неба</td><td>' + esc(pr.mc.signIn) + '</td>' +
      '<td class="num">' + esc(pr.mc.dms) + '</td><td colspan="2"></td></tr>' +
      '</tbody></table></div>' +
      block('Фаза прогрессивной Луны: ' + pr.moonPhase.ru, pr.moonPhase.about,
        'Прогрессивная Луна обходит круг примерно за 27 лет и меняет знак раз в два с ' +
        'половиной года.') +
      (nx ? block('Смена знака', 'Прогрессивная Луна перейдёт из ' + nx.fromRu + ' в ' +
        D.SIGNS[nx.to].in + ' — ' + fmtDate(nx.jd) + '.', null) : '');
  }

  /** Транзиты сегодняшнего дня — вторым кольцом снаружи. */
  function todayTransits() {
    var pos = A.tropicalPositions(Tz.msToJd(Date.now()));
    return ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn',
            'uranus', 'neptune', 'pluto'].map(function (k) {
      return { key: k, lon: pos[k].lon, retro: pos[k].speed < 0 };
    });
  }

  function renderWheel(chart, asp) {
    var box = el('wheelBox');
    var opts = { aspects: asp, size: 620, transits: showTransits() ? todayTransits() : null };
    // Без модуля поведения объёмное колесо не повернуть и не подсветить —
    // тогда честнее нарисовать плоское, оно самодостаточно.
    if (!S.Wheel3d) {
      box.innerHTML = W.draw(chart, opts);
      el('wheelLegend').innerHTML = '';
      return;
    }
    box.innerHTML = W.stage(chart, opts);
    // панель управления рисуется самим модулем: разметка и поведение
    // должны жить рядом, иначе они разъезжаются при первой же правке
    var ctl = el('wheelCtl');
    if (ctl) ctl.innerHTML = S.Wheel3d.controls();
    el('wheelLegend').innerHTML =
      '<span><i class="lg lg--hard"></i>напряжённые</span>' +
      '<span><i class="lg lg--soft"></i>гармоничные</span>' +
      '<span><i class="lg lg--neutral"></i>соединения</span>' +
      '<span class="tiny muted">толщина линии — точность аспекта</span>';
    live = S.Wheel3d.attach(el('wheelWrap'), { chart: chart, aspects: asp });
  }

  function showTransits() {
    var b = el('transitToggle');
    return !!(b && b.getAttribute('aria-pressed') === 'true');
  }

  /** Кошелёк в боковой колонке — цена не должна быть сюрпризом. */
  function renderWallet() {
    var box = el('walletBox');
    if (!box || !S.Paywall) return;
    box.innerHTML = S.Paywall.wallet() +
      '<p class="tiny muted" style="margin-top:10px">' +
      (Acc.isDemo()
        ? 'Оплата пока не подключена: биджи начисляются и списываются по-настоящему, ' +
          'но денег ни с кого не берут.'
        : 'Баланс и открытые разборы хранятся в вашем аккаунте.') +
      ' <a href="pricing.html">Тарифы</a></p>';
  }

  /* ---------------------------------------------------------- сборка */

  function draw(birth) {
    var chart = N.build(birth, system());
    var asp = Asp.findAll(chart);
    var shape = Shp.pattern(chart);
    state = { chart: chart, asp: asp, shape: shape, birth: birth };

    el('empty').hidden = true;
    el('results').hidden = false;
    var pb = el('printBtn');
    if (pb) pb.hidden = false;

    var howto = el('natalHowto');
    if (howto && S.Howto && !howto.dataset.filled) {
      howto.innerHTML = S.Howto.panel('natal', 'Как читать эту карту', [
        { what: 'Сначала три опоры',
          why: 'Солнце — про то, ради чего; Луна — про то, чем живётся изнутри; ' +
               'асцендент — про то, как вас встречают. Остальное их уточняет.' },
        { what: 'Линии внутри круга — аспекты',
          why: 'Углы между планетами: красные напряжённые, синие согласные. ' +
               'Толщина линии — насколько угол точен.' },
        { what: 'Колесо поворачивается',
          why: 'Потяните мышью или пальцем. Наведите на планету — на карте останутся ' +
               'только её связи, а рядом появится разбор.' },
        { what: 'Система домов меняет дома, а не планеты',
          why: 'Переключите её и посмотрите: положения планет те же, границы домов разные. ' +
               'Это и есть разница между школами.' },
        { what: 'Это западная астрология, не джйотиш',
          why: 'Здесь тропический зодиак, отсчёт от равноденствия. Знак Солнца тут обычно ' +
               'другой, чем в джйотиш-карте, и это не ошибка.' }
      ]);
      howto.dataset.filled = '1';
    }

    el('chartMeta').textContent =
      S.dateRu(chart.utcMs, chart.tz).replace(/\s*г\.$/, '') + ', ' +
      S.timeRu(chart.utcMs, chart.tz) + ' · ' + S.placeLabel(birth.place) + ' · ' +
      (chart.byDay ? 'дневная карта' : 'ночная карта') + ' · ' + chart.houses.system.title;

    renderWheel(chart, asp);
    renderOpening(I.free(chart, asp, shape));
    renderPositions(chart);
    renderHouses(chart);
    renderAspects(chart, asp);
    renderDignities(chart);
    renderShape(chart);
    renderTransits(chart);
    renderProgress(chart);
    S.Paywall.bind(el('results'), function () { draw(state.birth); });
    renderWallet();
    // панели собраны — размечаем в них непонятные слова
    if (S.Glossary) S.Glossary.apply(el('results'));
  }

  function fillSystems() {
    var sel = el('houseSystem');
    if (!sel) return;
    var saved = null;
    try { saved = root.localStorage.getItem(SKEY); } catch (e) { /* инкогнито */ }
    sel.innerHTML = H.SYSTEMS.map(function (s) {
      return '<option value="' + esc(s.id) + '"' +
        (s.id === (saved || 'placidus') ? ' selected' : '') + '>' + esc(s.title) + '</option>';
    }).join('');
    var about = function () {
      var s = H.systemById(sel.value);
      el('systemAbout').textContent = s.about;
    };
    about();
    sel.addEventListener('change', function () {
      about();
      try { root.localStorage.setItem(SKEY, sel.value); } catch (e) { /* инкогнито */ }
      // Смена системы видна только в самой карте, а на телефоне она под
      // формой: без этого кажется, что выбор ни на что не влияет.
      if (state) { draw(state.birth); S.reveal(el('results')); }
    });
  }

  function start() {
    var host = el('birthForm');
    if (!host) return;
    form = S.BirthForm.create(host, { value: S.loadBirth() });
    fillSystems();

    el('birthPanel').addEventListener('submit', function (e) {
      e.preventDefault();
      // validate() возвращает текст ошибки или null — не объект.
      var problem = form.validate();
      var err = el('formError');
      if (problem) { err.textContent = problem; err.hidden = false; return; }
      err.hidden = true;
      var birth = form.getValue();
      try {
        S.saveBirth(birth);
        draw(birth);
      } catch (ex) {
        err.textContent = 'Не удалось построить карту: ' + ex.message;
        err.hidden = false;
        if (root.console) root.console.error(ex);
        return;
      }
      S.reveal(el('results'));
    });
    var tt = el('transitToggle');
    if (tt) {
      tt.addEventListener('click', function () {
        var on = tt.getAttribute('aria-pressed') === 'true';
        tt.setAttribute('aria-pressed', String(!on));
        tt.classList.toggle('is-on', !on);
        if (state) renderWheel(state.chart, state.asp);
      });
    }

    el('exampleBtn').addEventListener('click', function () {
      form.setValue(EXAMPLE);
      S.saveBirth(EXAMPLE);
      draw(EXAMPLE);
      S.reveal(el('results'));
    });

    renderWallet();
    var saved = S.loadBirth();
    if (saved) { try { draw(saved); } catch (e) { /* покажем пустое состояние */ } }
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
  else start();
})(typeof globalThis !== 'undefined' ? globalThis : this, document);
