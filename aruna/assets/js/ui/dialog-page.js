/*
 * Аруна · диалог
 * ------------------------------------------------------------------
 * Ответы собираются из карты собеседника: бхава вопроса, её хозяин и
 * его положение, действующая даша, транзит Луны — и стих, подобранный
 * по теме и по небу дня. Языковой модели здесь нет, и на странице об
 * этом сказано прямо: иначе демонстрация выдавала бы себя за то, чем
 * не является.
 *
 * «Помнит прошлые беседы» здесь тоже настоящее, хоть и скромное:
 * история тем лежит в localStorage, и Дипа к ней возвращается.
 */
(function (root, doc) {
  'use strict';

  var S = root.Aruna, Acc = root.ArunaAccess, C = root.ArunaChart, P = root.ArunaPanchanga,
      Dsh = root.ArunaDasha, D = root.ArunaData, Tz = root.ArunaTz,
      Verses = root.ArunaVerses;

  var HKEY = 'aruna.talk.v1';
  var EXAMPLE = {
    date: '1975-06-15', time: '06:00', timeKnown: true,
    place: { name: 'Москва', lat: 55.7558, lon: 37.6176, tz: 'Europe/Moscow' }
  };

  /* Темы: бхавы, к которым относится вопрос, и слова для ответа.
     ask — то, что наставник возвращает собеседнику: вопрос, а не совет. */
  var TOPICS = [
    { id: 'move', q: 'Никак не решусь на переезд — всё откладываю.',
      bhavas: [4, 12], themes: ['letting-go', 'doubt'],
      lead: 'Переезд — это четвёртая бхава: дом, корни, покой ума. И двенадцатая: уход, чужие края, расставание с привычным.',
      ask: 'Назовите три вещи, которые поедут с вами. Не предметы — привычки. Если все три едут, вы уже переехали, осталось перевезти тело.' },
    { id: 'work-family', q: 'Что сейчас важнее — дело или семья?',
      bhavas: [10, 4], themes: ['action', 'dharma'],
      lead: 'Десятая бхава — дело и положение, четвёртая — дом и покой. Они стоят напротив друг друга не случайно: одно держится на другом.',
      ask: 'Спросите себя не «что важнее», а «что сейчас просит внимания, а что просто громче кричит». Это разные вещи.' },
    { id: 'strength', q: 'Почему всё время не хватает сил?',
      bhavas: [1, 6], themes: ['discipline', 'rest', 'patience'],
      lead: 'Первая бхава — тело и запас сил, шестая — то, что их тратит: долги, болезни, взятые на себя чужие дела.',
      ask: 'Посмотрите на последнюю неделю: где вы тратили силы на чужую шестую бхаву? Часто дело не в отдыхе, а в возврате чужого груза.' },
    { id: 'study', q: 'Хочу учиться, но не идёт. С чего начать?',
      bhavas: [5, 9], themes: ['learning', 'dharma'],
      lead: 'Пятая бхава — способность схватывать и творить, девятая — учитель и писание. Учёба идёт, когда работают обе: своя голова и чужой опыт.',
      ask: 'Возьмите один текст и одного человека, у кого спросить. Не курс, не программу — один текст и один человек.' },
    { id: 'start', q: 'Стоит ли начинать дело сейчас?',
      bhavas: [10, 11], themes: ['action', 'time'],
      lead: 'Десятая бхава — само дело, одиннадцатая — то, что оно принесёт и кто вокруг соберётся.',
      ask: 'Начинать лучше не «когда звёзды разрешат», а когда готов первый маленький шаг, который не жалко сделать зря. Какой он у вас?' },
    { id: 'partner', q: 'Тяжело с близким человеком.',
      bhavas: [7, 2], themes: ['friendship', 'speech', 'equanimity'],
      lead: 'Седьмая бхава — партнёр и открытая встреча с другим, вторая — речь и то, чем вы делитесь каждый день.',
      ask: 'Что из невысказанного вы носите дольше месяца? Начните с этого — не с обвинения, а с факта.' },
    { id: 'let-go', q: 'Что мне пора отпустить?',
      bhavas: [12, 8], themes: ['letting-go', 'surrender'],
      lead: 'Двенадцатая бхава — про уход и освобождение, восьмая — про перемены, которые приходят не по нашей воле.',
      ask: 'Назовите то, что вы держите только потому, что держали вчера. Отпускать по-настоящему приходится однажды, а решаться — каждый день.' },
    { id: 'today', q: 'О чём мой сегодняшний день?',
      bhavas: [], themes: [],
      lead: 'Тон дня задаёт Луна: она обходит всю карту примерно за месяц и каждые два-три дня меняет бхаву.',
      ask: 'Если день ощущается не так, как написано, — доверяйте себе, а не таблице. Карта описывает погоду, а не ваш выбор.' }
  ];

  var state = null;

  function loadHistory() {
    try { return JSON.parse(root.localStorage.getItem(HKEY)) || []; } catch (e) { return []; }
  }
  function saveHistory(h) {
    try { root.localStorage.setItem(HKEY, JSON.stringify(h.slice(-20))); } catch (e) { /* инкогнито */ }
  }

  /** Контекст карты + неба, из которого строятся ответы. */
  function context(birth) {
    var built = S.chartFromBirth(birth);
    var ch = built.chart;
    var now = Date.now(), jd = Tz.msToJd(now), tz = birth.place.tz;
    var pan = P.panchanga(jd, birth.place.lat, birth.place.lon, tz);
    var ayan = C.ayanamsa(jd);
    var moonNow = C.describeLongitude(C.toSidereal(pan.positions.moon.lon, ayan));
    var dasha = Dsh.current(ch.jd, ch.moonNakshatra, ch.grahas.moon.nakFraction, jd);
    return {
      birth: birth, chart: ch, pan: pan, now: now, tz: tz, dasha: dasha,
      moonNow: moonNow, moonBhavaNow: C.bhavaOf(moonNow.rashi, ch.asc.rashi)
    };
  }

  /** Описание бхавы в карте: раши, хозяин, где он стоит, кто внутри. */
  function bhavaSentence(ctx, num) {
    var b = ctx.chart.bhavas[num - 1];
    var lordKey = b.lord, lord = ctx.chart.grahas[lordKey];
    var s = num + '-я бхава у вас в раши ' + b.rashiName + ', её хозяин — ' + D.GRAHAS[lordKey].sa +
            ', и он стоит в ' + lord.bhava + '-й бхаве';
    if (lord.dignity && lord.dignity.code !== 'neutral') s += ' (' + lord.dignity.ru + ')';
    s += '.';
    if (b.grahas.length) {
      s += ' Внутри самой бхавы — ' + b.grahas.map(function (k) {
        return D.GRAHAS[k].sa + (ctx.chart.grahas[k].retro ? ' (вспять)' : '');
      }).join(', ') + '.';
    } else {
      s += ' Грах в ней нет — значит, читаем по хозяину, а не по жильцам.';
    }
    return s;
  }

  function dashaSentence(ctx) {
    var m = D.GRAHAS[ctx.dasha.maha.lord], a = D.GRAHAS[ctx.dasha.antar.lord];
    var mb = ctx.chart.grahas[ctx.dasha.maha.lord].bhava;
    var ab = ctx.chart.grahas[ctx.dasha.antar.lord].bhava;
    return 'Сейчас у вас махадаша — ' + m.sa + ' (в карте стоит в ' + mb + '-й бхаве), ' +
           'антардаша — ' + a.sa + ' (в ' + ab + '-й). Это тот слой жизни, который громче ' +
           'остальных ближайшие месяцы.';
  }

  function moonSentence(ctx) {
    return 'Луна сегодня идёт по ' + ctx.moonBhavaNow + '-й бхаве вашей карты — ' +
           D.BHAVAS[ctx.moonBhavaNow - 1].title + ' (' + ctx.moonNow.nakshatraName + '). ' +
           'Титхи — ' + ctx.pan.tithi.name + ', ' + ctx.pan.tithi.pakshaRu + '.';
  }

  /**
   * Ответ строится в двух глубинах.
   * Короткий доступен всегда: он уже опирается на карту, а не на общие слова.
   * Развёрнутый добавляет остальные бхавы, дашу, вопрос в ответ и стих.
   */
  function answer(ctx, topic) {
    var short = [topic.lead];
    if (topic.bhavas.length) short.push(bhavaSentence(ctx, topic.bhavas[0]));
    short.push(moonSentence(ctx));

    var deep = [];
    topic.bhavas.slice(1).forEach(function (n) { deep.push(bhavaSentence(ctx, n)); });
    deep.push(dashaSentence(ctx));
    deep.push(topic.ask);

    var pick = Verses.pickVerse({
      varaLord: ctx.pan.vara ? ctx.pan.vara.lord : null,
      nakshatraLord: ctx.pan.nakshatra.lord,
      paksha: ctx.pan.tithi.paksha,
      tithiName: ctx.pan.tithi.name,
      dateKey: S.dayKey(ctx.now, ctx.tz) + '/' + topic.id
    });
    return { short: short, deep: deep, verse: pick.verse };
  }

  /* --------------------------------------------------------------- вывод */
  function bubble(html, who, badge) {
    var cls = who === 'me' ? 'talk__msg talk__msg--me' : 'talk__msg talk__msg--sa';
    var head = who === 'me' ? '' :
      '<p class="talk__who">Дипа' + (badge ? '<span class="talk__badge">' + S.esc(badge) + '</span>' : '') + '</p>';
    return '<div class="' + cls + '">' + head + html + '</div>';
  }

  function push(html, toStart) {
    var talk = doc.getElementById('talk');
    talk.insertAdjacentHTML('beforeend', html);
    var last = talk.lastElementChild;
    // длинный ответ читают с начала, поэтому подкручиваем к его верху,
    // а короткую реплику собеседника — просто вниз
    talk.scrollTop = (toStart && last)
      ? Math.max(0, last.offsetTop - talk.offsetTop - 10)
      : talk.scrollHeight;
  }

  function answerHtml(a, topic, deep) {
    var html = a.short.map(function (p) { return '<p>' + p + '</p>'; }).join('');
    if (deep) {
      html += a.deep.map(function (p) { return '<p>' + p + '</p>'; }).join('') +
        '<p class="talk__verse">' + S.esc(a.verse.ru) + '<br><span class="tiny muted">' +
        S.esc(a.verse.src + ' ' + a.verse.ref) + '</span></p>';
    } else {
      var f = Acc.feature('dialog.deep');
      html += '<p class="talk__more">' +
        '<button class="btn btn--ghost btn--sm" type="button" data-deep="' + S.esc(topic.id) + '">' +
          'Развернуть: остальные бхавы, даша и стих — <span class="seed">' +
          Acc.seeds(f.price) + '</span>' +
        '</button></p>';
    }
    return html;
  }

  function ask(topic) {
    if (!state) return;
    push(bubble('<p>' + S.esc(topic.q) + '</p>', 'me'));
    var a = answer(state, topic);
    var deep = Acc.has('dialog.deep');
    root.setTimeout(function () {
      push(bubble(answerHtml(a, topic, deep), 'sa',
                  'бхавы ' + (topic.bhavas.join(', ') || 'транзит Луны')), true);
    }, 260);

    var h = loadHistory();
    h.push({ id: topic.id, q: topic.q, at: Date.now() });
    saveHistory(h);
  }

  /** Разворот короткого ответа в подробный — по кнопке внутри реплики. */
  function expand(btn) {
    var topic = null;
    TOPICS.forEach(function (t) { if (t.id === btn.dataset.deep) topic = t; });
    if (!topic || !state) return;
    var bubbleEl = btn.closest('.talk__msg');
    var go = function () {
      var a = answer(state, topic);
      var who = bubbleEl.querySelector('.talk__who');
      bubbleEl.innerHTML = (who ? who.outerHTML : '') + answerHtml(a, topic, true);
    };
    if (Acc.has('dialog.deep')) { go(); return; }
    var r = Acc.unlock('dialog.deep');
    if (r.ok) go();
    else S.Paywall.open('dialog.deep', go);
  }

  function greeting(ctx) {
    var h = loadHistory();
    var last = h.length ? h[h.length - 1] : null;
    var lines = [];
    lines.push('Здравствуйте. Я вижу вашу карту: лагна — ' + ctx.chart.asc.rashiName +
               ', Луна — ' + ctx.chart.grahas.moon.rashiName + ', накшатра ' +
               D.NAKSHATRAS[ctx.chart.moonNakshatra].sa + '. ' + moonSentence(ctx));
    if (last) {
      var when = S.dateRu(last.at, ctx.tz, { day: 'numeric', month: 'long' });
      lines.push('В прошлый раз, ' + when + ', вы спрашивали: «' + S.esc(last.q) +
                 '» Если это ещё живо — вернёмся к нему. Если отпустило, тоже скажите.');
    } else {
      lines.push('Спрашивайте о том, что сейчас занимает. Я буду отвечать, глядя на вашу карту, ' +
                 'а не вообще.');
    }
    return bubble(lines.map(function (l) { return '<p>' + l + '</p>'; }).join(''), 'sa',
                  'видит вашу карту');
  }

  function renderWho(ctx) {
    var rows = [
      ['Лагна', ctx.chart.asc.rashiName + ' ' + ctx.chart.asc.dms],
      ['Луна', ctx.chart.grahas.moon.rashiName + ' · ' + D.NAKSHATRAS[ctx.chart.moonNakshatra].sa],
      ['Даша', D.GRAHAS[ctx.dasha.maha.lord].sa + ' / ' + D.GRAHAS[ctx.dasha.antar.lord].sa],
      ['Рождение', S.dateRu(S.chartFromBirth(ctx.birth).utcMs, ctx.tz).replace(/\s*г\.$/, '') +
                   ', ' + ctx.birth.place.name]
    ];
    doc.getElementById('whoRows').innerHTML = rows.map(function (r) {
      return '<dt>' + S.esc(r[0]) + '</dt><dd>' + S.esc(r[1]) + '</dd>';
    }).join('');
    doc.getElementById('skyLine').textContent =
      (ctx.pan.vara ? ctx.pan.vara.sa + ' · ' : '') + ctx.pan.tithi.name + ' · накшатра ' +
      ctx.pan.nakshatra.name;
  }

  function renderPrompts() {
    doc.getElementById('prompts').innerHTML = TOPICS.map(function (t, i) {
      return '<button class="prompt-btn" type="button" data-i="' + i + '">' + S.esc(t.q) + '</button>';
    }).join('');
  }

  function boot(birth) {
    state = context(birth);
    renderWho(state);
    doc.getElementById('talk').innerHTML = greeting(state);
    renderPrompts();
  }

  function noChart() {
    doc.getElementById('talk').innerHTML =
      bubble('<p>Чтобы говорить не вообще, а о вас, мне нужна ваша карта: дата, время и ' +
             'место рождения. Это займёт полминуты.</p>' +
             '<p><a class="btn btn--gold btn--sm" href="chart.html">Построить карту</a></p>', 'sa');
    doc.getElementById('prompts').innerHTML = '';
  }

  function start() {
    var talk = doc.getElementById('talk');
    if (!talk) return;
    var saved = S.loadBirth();
    if (saved) { try { boot(saved); } catch (e) { noChart(); } } else noChart();

    doc.getElementById('prompts').addEventListener('click', function (e) {
      var b = e.target.closest('.prompt-btn');
      if (b) ask(TOPICS[+b.dataset.i]);
    });
    talk.addEventListener('click', function (e) {
      var b = e.target.closest('[data-deep]');
      if (b) expand(b);
    });
    doc.getElementById('exampleBtn').addEventListener('click', function () {
      S.saveBirth(EXAMPLE);
      boot(EXAMPLE);
    });
    doc.getElementById('clearBtn').addEventListener('click', function () {
      saveHistory([]);
      if (state) { doc.getElementById('talk').innerHTML = greeting(state); }
    });
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
  else start();
})(typeof globalThis !== 'undefined' ? globalThis : this, document);
