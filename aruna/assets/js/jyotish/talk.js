/*
 * Аруна · разговор: темы и разбор по правилам
 * ------------------------------------------------------------------
 * Тот слой разговора, который считается, а не пишется. Здесь живут:
 *
 *   · таблица тем — по каким словам вопрос относится к каким бхавам;
 *   · предложения о карте — бхава, её хозяин, даша, транзит Луны;
 *   · ответ без языковой модели — он же работает, когда модель
 *     недоступна, и на статичном сайте без сервера.
 *
 * Файл общий для браузера и Node (server/lib/jyotish.js подхватывает
 * его тем же списком, что и остальное ядро): таблица тем не должна
 * жить в двух местах и расходиться.
 *
 * Как читать таблицу WORDS: re — по чему узнаём тему, bhavas — какие
 * бхавы смотреть (первая главная), themes — метки для подбора стиха,
 * lead — первая фраза ответа, ask — вопрос, который наставник
 * возвращает собеседнику. Порядок важен: срабатывает первое совпадение,
 * поэтому «умер отец» попадает в утрату, а не в пятую бхаву.
 */
(function (root) {
  'use strict';

  var A = root.ArunaAstro, C = root.ArunaChart, D = root.ArunaData,
      P = root.ArunaPanchanga, Dsh = root.ArunaDasha, Tz = root.ArunaTz,
      Verses = root.ArunaVerses;

  var WORDS = [
    { bhavas: [4, 12], themes: ['letting-go', 'doubt'],
      re: /переезд|переезж|переехат|квартир|жиль|съём|съем|родин|эмигр|другую стран|новый город/i,
      lead: 'Переезд читается по четвёртой бхаве — дом, корни, покой ума — и по двенадцатой: уход, чужие края, расставание с привычным.',
      ask: 'Назовите три вещи, которые поедут с вами. Не предметы — привычки. Если все три едут, вы уже переехали, осталось перевезти тело.' },

    { bhavas: [12, 8], themes: ['letting-go', 'surrender'],
      re: /отпусти|смири|прошл|обид|вин(?:а|у|ы)|стыд|страх|боюс|тревог|потер|смерт|горе|умер|похорон|депресс/i,
      lead: 'Двенадцатая бхава — про уход и освобождение, восьмая — про перемены, которые приходят не по нашей воле.',
      ask: 'Назовите то, что вы держите только потому, что держали вчера. Отпускать по-настоящему приходится однажды, а решаться — каждый день.' },

    { bhavas: [10, 4], themes: ['action', 'dharma'],
      re: /работ|карьер|начальник|профессия|дел(?:о|а|у|ом)(?![а-яё])|бизнес|увол|должност|повышен|коллег|офис/i,
      lead: 'Дело и положение — десятая бхава. Она стоит напротив четвёртой, дома и покоя: одно всегда держится на другом.',
      ask: 'Спросите себя не «что важнее», а «что сейчас просит внимания, а что просто громче кричит». Это разные вещи.' },

    { bhavas: [7, 2], themes: ['friendship', 'speech', 'equanimity'],
      re: /отношени|партн[её]р|муж|жен|супруг|любл|люб(?:овь|ви)|развод|брак|расста|ссор|конфликт|скандал|ревн|свидан/i,
      lead: 'Седьмая бхава — открытая встреча с другим, вторая — речь и то, чем делятся каждый день.',
      ask: 'Что из невысказанного вы носите дольше месяца? Начните с этого — не с обвинения, а с факта.' },

    { bhavas: [1, 6], themes: ['discipline', 'rest', 'patience'],
      re: /сил(?:а|ы|е|у|ам|ами|ах)?(?![а-яё])|устал|уста[её]|выгор|здоров|болезн|бол(?:ит|ею)|сон(?![а-яё])|бессонн|высып|слабост|измот/i,
      lead: 'Запас сил — первая бхава, тело. Расход — шестая: долги, болезни и чужие дела, взятые на себя.',
      ask: 'Посмотрите на последнюю неделю: где вы тратили силы на чужую шестую бхаву? Часто дело не в отдыхе, а в возврате чужого груза.' },

    { bhavas: [5, 9], themes: ['learning', 'dharma'],
      re: /учи(?:ть|ться|тель)|уч[ёе]б|образован|курс|экзамен|диплом|университет|школ|знани/i,
      lead: 'Пятая бхава — способность схватывать, девятая — учитель и писание. Учёба идёт, когда работают обе.',
      ask: 'Возьмите один текст и одного человека, у кого спросить. Не курс, не программу — один текст и один человек.' },

    { bhavas: [5, 4], themes: ['dharma', 'rest'],
      re: /реб[ёе]н|дет(?:и|ей|ям|ьми)|беремен|сын|доч|родител|мам|отц|мать|отец/i,
      lead: 'Дети и род — пятая бхава: творчество, ученики, заслуга прошлого. Рядом четвёртая, потому что это про дом.',
      ask: 'Что вы хотели бы услышать от них — и говорили ли вы это сами? Обычно это одни и те же слова.' },

    { bhavas: [2, 11], themes: ['action', 'patience'],
      re: /деньг|долг|кредит|зарплат|финанс|бедн|копи|доход|трат|ипотек|накоплен/i,
      lead: 'Вторая бхава — накопленное и речь, одиннадцатая — приход и круг, который его приносит.',
      ask: 'Какая часть трат идёт на то, чем вы пользуетесь, а какая — на то, чем собирались пользоваться? Разделите один раз, и половина вопроса снимется.' },

    { bhavas: [3, 11], themes: ['friendship', 'action'],
      re: /друз|друг(?:а|у|ом)(?![а-яё])|брат|сестр|родств|общени|одинок|компан|команд/i,
      lead: 'Третья бхава — близкие по крови и своё усилие, одиннадцатая — круг, который собирается вокруг.',
      ask: 'Кому вы не писали дольше полугода — не потому, что рассорились, а просто так? С этого и начните.' },

    { bhavas: [9, 12], themes: ['dharma', 'surrender'],
      re: /смысл|бог(?:а|у|е|ом)?(?![а-яё])|духовн|практик|медитац|мантр|садхан|вер(?:а|у|ы|ю|е|ой)(?![а-яё])|молитв|писани|гит[ауеы](?![а-яё])|упанишад|сутр|паломн|почита(?:ть|й)|прочита/i,
      lead: 'Девятая бхава — дхарма, учитель и писание; двенадцатая — то, что уводит внутрь и в тишину.',
      ask: 'Практика держится не на силе, а на малом размере. Сколько минут вы точно выдержите каждый день — не в лучший день, а в худший?' },

    { bhavas: [10, 11], themes: ['action', 'time'],
      re: /начина|начать|запуск|проект|стоит ли|реша(?:ть|юсь)|выбор|решени|риск/i,
      lead: 'Начало дела — десятая бхава, а то, что оно принесёт и кто вокруг соберётся, — одиннадцатая.',
      ask: 'Начинать лучше не «когда звёзды разрешат», а когда готов первый маленький шаг, который не жалко сделать зря. Какой он у вас?' },

    { bhavas: [1, 5], themes: ['dharma', 'learning'],
      re: /кто я|предназначен|талант|творчеств|писа(?:ть|тельств)|рисова|музык|призван/i,
      lead: 'Своё — это первая бхава, «я» и тело, и пятая: то, что рождается изнутри без принуждения.',
      ask: 'Что вы делали в последний раз, забыв про время? Не «что получалось» — что забирало время бесследно.' }
  ];

  /* Тема по умолчанию: разговор о дне. Сюда попадает всё, что не узналось. */
  var DAY = {
    bhavas: [], themes: [],
    lead: 'Тон дня задаёт Луна: она обходит всю карту примерно за месяц и каждые два-три дня меняет бхаву.',
    ask: 'Если день ощущается не так, как написано, — доверяйте себе, а не таблице. Карта описывает погоду, а не ваш выбор.'
  };

  /** Готовые вопросы для начала разговора — то же, что было кнопками. */
  var STARTERS = [
    'Никак не решусь на переезд — всё откладываю.',
    'Что сейчас важнее — дело или семья?',
    'Почему всё время не хватает сил?',
    'Хочу учиться, но не идёт. С чего начать?',
    'Стоит ли начинать дело сейчас?',
    'Тяжело с близким человеком.',
    'Что мне пора отпустить?',
    'О чём мой сегодняшний день?'
  ];

  /** Тема вопроса по словам. Первое совпадение — оно же главное. */
  function pickTopic(question) {
    var q = String(question || '');
    for (var i = 0; i < WORDS.length; i++) if (WORDS[i].re.test(q)) return WORDS[i];
    return DAY;
  }

  /** Карта + небо на сейчас. Всё, на чём стоит разговор. */
  function context(birth, nowMs) {
    var d = String(birth.date).split('-').map(Number);
    var t = String(birth.time || '12:00').split(':').map(Number);
    var utcMs = Tz.zonedToUtcMs(d[0], d[1], d[2], t[0] || 0, t[1] || 0, birth.place.tz);
    var chart = C.buildChart({
      jd: Tz.msToJd(utcMs), lat: birth.place.lat, lon: birth.place.lon,
      tz: birth.place.tz, label: birth.place.name
    });
    var now = nowMs || Date.now(), jd = Tz.msToJd(now), tz = birth.place.tz;
    var pan = P.panchanga(jd, birth.place.lat, birth.place.lon, tz);
    var ayan = C.ayanamsa(jd);
    var moonNow = C.describeLongitude(C.toSidereal(pan.positions.moon.lon, ayan));
    return {
      birth: birth, chart: chart, utcMs: utcMs, now: now, jd: jd, tz: tz,
      pan: pan, ayan: ayan, moonNow: moonNow,
      dasha: Dsh.current(chart.jd, chart.moonNakshatra, chart.grahas.moon.nakFraction, jd),
      moonBhava: C.bhavaOf(moonNow.rashi, chart.asc.rashi)
    };
  }

  /* ------------------------------------------------- предложения о карте */

  function bhavaSentence(ctx, num) {
    var b = ctx.chart.bhavas[num - 1], lord = ctx.chart.grahas[b.lord];
    var s = num + '-я бхава у вас в раши ' + b.rashiName + ', её хозяин — ' + D.GRAHAS[b.lord].sa +
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

  function moonSentence(ctx) {
    return 'Луна сегодня идёт по ' + ctx.moonBhava + '-й бхаве вашей карты — ' +
      D.BHAVAS[ctx.moonBhava - 1].title + ' (' + ctx.moonNow.nakshatraName + '). Титхи — ' +
      ctx.pan.tithi.name + ', ' + ctx.pan.tithi.pakshaRu + '.';
  }

  function dashaSentence(ctx) {
    if (!ctx.dasha) return '';
    var m = D.GRAHAS[ctx.dasha.maha.lord], a = D.GRAHAS[ctx.dasha.antar.lord];
    return 'Сейчас у вас махадаша — ' + m.sa + ' (в карте стоит в ' +
      ctx.chart.grahas[ctx.dasha.maha.lord].bhava + '-й бхаве), антардаша — ' + a.sa + ' (в ' +
      ctx.chart.grahas[ctx.dasha.antar.lord].bhava + '-й). Это тот слой жизни, который громче ' +
      'остальных ближайшие месяцы.';
  }

  /**
   * Ответ по правилам. Короткий доступен всегда; развёрнутый добавляет
   * остальные бхавы, дашу, вопрос в ответ и стих по теме.
   *
   * @returns {{paragraphs:string[], verse:Object|null, trail:Array, topic:Object}}
   */
  function rulesAnswer(ctx, question, deep) {
    var t = pickTopic(question);
    var out = [t.lead];
    if (t.bhavas.length) out.push(bhavaSentence(ctx, t.bhavas[0]));
    out.push(moonSentence(ctx));

    var verse = null;
    if (deep) {
      t.bhavas.slice(1).forEach(function (n) { out.push(bhavaSentence(ctx, n)); });
      var ds = dashaSentence(ctx);
      if (ds) out.push(ds);
      var pick = Verses.pickVerse({
        varaLord: ctx.pan.vara ? ctx.pan.vara.lord : null,
        nakshatraLord: ctx.pan.nakshatra.lord,
        paksha: ctx.pan.tithi.paksha,
        tithiName: ctx.pan.tithi.name,
        themes: t.themes,
        dateKey: String(ctx.now)
      });
      verse = pick.verse;
      out.push(t.ask);
    } else {
      out.push(t.ask);
    }

    return {
      paragraphs: out, verse: verse, topic: t,
      trail: t.bhavas.map(function (n) {
        return { title: n + '-я бхава', detail: ctx.chart.bhavas[n - 1].rashiName };
      })
    };
  }

  root.ArunaTalk = {
    WORDS: WORDS, DAY: DAY, STARTERS: STARTERS,
    pickTopic: pickTopic, context: context, rulesAnswer: rulesAnswer,
    bhavaSentence: bhavaSentence, moonSentence: moonSentence, dashaSentence: dashaSentence
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
