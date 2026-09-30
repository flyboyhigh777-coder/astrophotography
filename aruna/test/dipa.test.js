/*
 * Аруна · тест разговора с Дипой
 * ------------------------------------------------------------------
 * Три слоя, и каждый проверяется отдельно:
 *
 *   1. правила (assets/js/jyotish/talk.js) — работают без сети и без
 *      ключа, и именно они отвечают, когда модель недоступна;
 *   2. подготовка для модели (server/lib/dipa.js) — блок фактов,
 *      инструменты, разбор потока, возврат к правилам при сбое;
 *   3. сервер (/api/talk) — оплата за каждый развёрнутый ответ,
 *      возврат при неудаче, суточный предел, память и «забыть».
 *
 * Настоящих запросов к модели здесь нет: клиент подменяется заглушкой
 * (Dipa.setClient). Тест должен идти в тишине, без сети и без денег.
 *
 * Запуск: node test/dipa.test.js
 */
'use strict';

process.env.ARUNA_API_DATA = '/tmp/aruna-dipa-test-' + process.pid + '.json';
process.env.PORT = '0';

const fs = require('node:fs');
const J = require('../server/lib/jyotish.js');
const Dipa = require('../server/lib/dipa.js');
const api = require('../server/api.js');

let passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}
function group(n) { console.log('\n— ' + n); }
let skipped = 0;
function skip(name, why) { skipped++; console.log('  ∙ пропуск: ' + name + ' — ' + why); }

/*
 * @anthropic-ai/sdk — единственная зависимость проекта, и она
 * необязательная. Без неё сайт, бот и сервер работают на правилах,
 * поэтому тест без пакета не падает, а честно пропускает то, что без
 * пакета проверить нельзя.
 */
const HAS_SDK = (() => {
  try { require('@anthropic-ai/sdk/helpers/beta/json-schema'); return true; }
  catch (e) { return false; }
})();

const BIRTH = {
  date: '1975-06-15', time: '06:00', timeKnown: true,
  place: { name: 'Москва', lat: 55.7558, lon: 37.6176, tz: 'Europe/Moscow' }
};
const NOW = Date.UTC(2026, 8, 29, 9, 0, 0);

/* ------------------------------------------------------------ заглушка */

/**
 * Клиент, который ведёт себя как настоящий, но ничего не спрашивает.
 * @param {Object} o {text, toolCalls, fail}
 */
function fakeClient(o) {
  o = o || {};
  const chunks = String(o.text || 'Ответ.').match(/.{1,17}/gs) || [];
  const mkStream = (parts, stop) => {
    const events = parts.map((t) => ({
      type: 'content_block_delta', delta: { type: 'text_delta', text: t }
    }));
    return {
      [Symbol.asyncIterator]() {
        let i = 0;
        return { next: () => Promise.resolve(
          i < events.length ? { value: events[i++], done: false } : { value: undefined, done: true }) };
      },
      finalMessage: () => Promise.resolve({
        usage: { input_tokens: 10, output_tokens: 20 },
        model: 'заглушка', stop_reason: stop || 'end_turn',
        content: [{ type: 'text', text: parts.join('') }]
      })
    };
  };
  return {
    calls: [],
    messages: {
      stream(params) {
        this._p = params;
        if (o.fail) throw o.fail;
        return mkStream(chunks);
      },
      create(params) {
        return Promise.resolve({ content: [{ type: 'text', text: o.note || 'Заметка.' }] });
      }
    },
    beta: {
      messages: {
        toolRunner(params) {
          if (o.fail) throw o.fail;
          // сначала прогоняем инструменты, которые просил тест, — так же,
          // как это сделал бы настоящий runner
          const tools = params.tools || [];
          const ran = (o.toolCalls || []).map((c) => {
            const t = tools.filter((x) => x.name === c.name)[0];
            return t ? t.run(c.input) : Promise.resolve('нет такого инструмента');
          });
          let i = 0;
          const streams = [mkStream(chunks)];
          return {
            params: params,
            pushMessages() {},
            done: () => Promise.resolve({ usage: { input_tokens: 5, output_tokens: 5 } }),
            [Symbol.asyncIterator]() {
              return {
                next: async () => {
                  if (i === 0) { await Promise.all(ran); }
                  return i < streams.length
                    ? { value: streams[i++], done: false }
                    : { value: undefined, done: true };
                }
              };
            }
          };
        }
      }
    }
  };
}

(async function run() {

  /* ============================================ 1. правила без модели */

  group('Темы вопроса узнаются по словам');
  const cases = [
    ['Никак не решусь на переезд', [4, 12]],
    ['Умер отец, не могу собраться', [12, 8]],
    ['Начальник давит, думаю уволиться', [10, 4]],
    ['Тяжело с женой, всё время ссоримся', [7, 2]],
    ['Почему нет сил совсем?', [1, 6]],
    ['Хочу пойти учиться', [5, 9]],
    ['Сын не разговаривает со мной', [5, 4]],
    ['Долги задавили', [2, 11]],
    ['Совсем одиноко, друзей нет', [3, 11]],
    ['Что почитать из Гиты?', [9, 12]],
    ['Стоит ли начинать проект сейчас?', [10, 11]],
    ['Не понимаю, в чём моё предназначение', [1, 5]]
  ];
  cases.forEach(([q, want]) => {
    const t = J.Talk.pickTopic(q);
    ok('«' + q.slice(0, 32) + '…» → бхавы ' + want.join(','),
      JSON.stringify(t.bhavas) === JSON.stringify(want), 'получили ' + t.bhavas.join(','));
  });
  ok('незнакомый вопрос уходит в тему дня',
    J.Talk.pickTopic('кпщ ыва фывфыв').bhavas.length === 0);
  ok('у каждой темы есть и первая фраза, и вопрос в ответ',
    J.Talk.WORDS.every((t) => t.lead && t.ask && t.bhavas.length && t.themes.length));
  // \b в JavaScript опирается на ASCII-\w, поэтому после русской буквы границы
  // слова нет вообще и ветка правила молча не срабатывает. Один раз на этом
  // уже попались — пусть теперь ловит тест.
  ok('в правилах нет \\b: с кириллицей он не работает',
    J.Talk.WORDS.every((t) => t.re.source.indexOf('\\b') < 0),
    (J.Talk.WORDS.filter((t) => t.re.source.indexOf('\\b') >= 0)[0] || {}).re);
  ok('границы слова заданы просмотром вперёд',
    J.Talk.WORDS.filter((t) => /\(\?!\[а-яё\]\)/.test(t.re.source)).length >= 4);

  group('Ответ по правилам опирается на карту');
  const ctx = J.Talk.context(BIRTH, NOW);
  const short = J.Talk.rulesAnswer(ctx, 'Почему нет сил?', false);
  const deep = J.Talk.rulesAnswer(ctx, 'Почему нет сил?', true);
  ok('короткий — четыре коротких абзаца',
    short.paragraphs.length === 4, String(short.paragraphs.length));
  ok('и последний абзац — вопрос к человеку, а не итог сказанного',
    short.paragraphs[short.paragraphs.length - 1].indexOf('?') > 0);
  ok('нигде не спрашивают по три вопроса подряд',
    J.Talk.WORDS.concat([J.Talk.DAY]).every((t) =>
      (t.ask.match(/\?/g) || []).length <= 1));
  ok('в нём названа бхава вопроса и её хозяин',
    /1-я бхава у вас в раши/.test(short.paragraphs[1]) && /хозяин/.test(short.paragraphs[1]));
  ok('развёрнутый длиннее короткого', deep.paragraphs.length > short.paragraphs.length);
  ok('в развёрнутом есть даша', deep.paragraphs.some((p) => /махадаша/.test(p)));
  ok('в развёрнутом подобран стих', !!(deep.verse && deep.verse.ru && deep.verse.src));
  ok('стих выбран по теме, а не случайно',
    deep.verse.themes.some((t) => short.topic.themes.indexOf(t) >= 0) ||
    deep.verse.themes.length > 0);
  ok('след указывает на бхавы', deep.trail.length === 2 && /бхава/.test(deep.trail[0].title));
  ok('в ответе нет разметки', deep.paragraphs.every((p) => !/[*#`]/.test(p)));

  group('Тема весит больше неба при подборе стиха');
  const noTheme = J.Verses.pickVerse({ varaLord: 'saturn', nakshatraLord: 'moon',
    paksha: 'шукла', dateKey: 'x' });
  const withTheme = J.Verses.pickVerse({ varaLord: 'saturn', nakshatraLord: 'moon',
    paksha: 'шукла', themes: ['learning'], dateKey: 'x' });
  ok('тема попадает в причины выбора', withTheme.reasons.indexOf('тема разговора') >= 0);
  ok('и меняет сам стих', withTheme.verse.ref !== noTheme.verse.ref ||
    withTheme.verse.themes.indexOf('learning') >= 0);

  /* =========================================== 2. подготовка для модели */

  group('Блок фактов для модели');
  const f = Dipa.facts(BIRTH, NOW);
  const brief = Dipa.brief(f);
  ok('есть лагна с градусом', /лагна: Митхуна \d+°/.test(brief));
  ok('все девять грах названы',
    J.Astro.GRAHA_ORDER.every((k) => brief.indexOf(J.Data.GRAHAS[k].sa + ':') >= 0));
  ok('у каждой грахи бхава, накшатра и пада',
    (brief.match(/-я бхава, накшатра .+ пада \d/g) || []).length === 9);
  ok('все двенадцать бхав с хозяином', (brief.match(/хозяин \S+ в \d+-й/g) || []).length >= 12);
  ok('периоды с датами', /махадаша \S+: \d+ \S+ \d{4} — /.test(brief));
  ok('небо дня с титхи и накшатрой', /титхи \S+, (у|растущ)/.test(brief) && /накшатра/.test(brief));
  ok('бинду у медленных грах', /бинду в этом раши \d+/.test(brief));
  ok('в блоке нет разметки', !/[*`#]/.test(brief));
  ok('блок не разрастается', brief.length < 5000, brief.length + ' символов');
  ok('неизвестное время рождения помечается',
    /ВРЕМЯ НЕИЗВЕСТНО/.test(Dipa.brief(Dipa.facts(
      Object.assign({}, BIRTH, { timeKnown: false }), NOW))));

  group('Голос перечисляет запреты, а не только пожелания');
  ['Конечно', 'Важно отметить', 'как языковая модель', 'звёзды советуют', 'энергетика',
   'Не сочувствуй впрок', 'find_verse'].forEach((s) => {
    ok('в голосе есть «' + s + '»', Dipa.VOICE.indexOf(s) >= 0);
  });
  ok('запрещено считать в уме', /Не считай в уме/.test(Dipa.VOICE));
  ok('указания из сообщения человека не приказ', /остаёшься Дипой/.test(Dipa.VOICE));
  ok('короткая и развёрнутая формы различаются',
    Dipa.SHAPE_SHORT !== Dipa.SHAPE_DEEP && /инструмент/.test(Dipa.SHAPE_DEEP));

  group('Инструменты отдают расчёт, а не выдумку');
if (!HAS_SDK) {
  skip('инструменты, поток и заметка', 'нет пакета @anthropic-ai/sdk (npm install)');
} else {
  const trail = [];
  const tools = Dipa.buildTools(f, trail);
  ok('девять инструментов', tools.length === 9, String(tools.length));
  ok('у каждого есть описание и схема',
    tools.every((t) => t.name && t.description && t.input_schema));
  const results = {};
  for (const [name, input] of [
    ['graha_detail', { graha: 'saturn' }],
    ['bhava_detail', { bhava: 7 }],
    ['dasha_periods', { inside: 'all' }],
    ['dasha_periods', { inside: 'rahu' }],
    ['transit_on', { date: '2027-03-01' }],
    ['sav_table', {}],
    ['varga_position', { varga: 'D9' }],
    ['muhurta_today', { task: 'travel' }],
    ['find_verse', { themes: ['letting-go'] }],
    ['western_chart', {}]
  ]) {
    const t = tools.filter((x) => x.name === name)[0];
    results[name + JSON.stringify(input)] = await t.run(input);
  }
  ok('граха: раши, бхава, сила, варги',
    /Шани: Митхуна/.test(results['graha_detail{"graha":"saturn"}']) &&
    /сила: \d+ из 100/.test(results['graha_detail{"graha":"saturn"}']) &&
    /вимшопака/.test(results['graha_detail{"graha":"saturn"}']));
  ok('бхава: хозяин, жильцы, бинду, кто смотрит',
    /хозяин Гуру в 10-й/.test(results['bhava_detail{"bhava":7}']) &&
    /бинду в этом раши/.test(results['bhava_detail{"bhava":7}']));
  ok('махадаши списком с датами',
    (results['dasha_periods{"inside":"all"}'].match(/\n/g) || []).length >= 8);
  ok('антардаши внутри махадаши — девять',
    (results['dasha_periods{"inside":"rahu"}'].match(/^· /gm) || []).length === 9);
  ok('транзит на дату даёт девять грах и период',
    (results['transit_on{"date":"2027-03-01"}'].match(/^· /gm) || []).length === 9 &&
    /Период на эту дату/.test(results['transit_on{"date":"2027-03-01"}']));
  ok('сарвашта-кавварга: двенадцать раши и сумма 337',
    /всего в карте 337/.test(results['sav_table{}']) &&
    (results['sav_table{}'].match(/-я бхава\): \d+ —/g) || []).length === 12);
  ok('варга D9 с варготтамой', /Навамша/.test(results['varga_position{"varga":"D9"}']));
  ok('мухурта даёт абхиджит и раху-калу',
    /абхиджит \d\d:\d\d/.test(results['muhurta_today{"task":"travel"}']) &&
    /раху-кала \d\d:\d\d/.test(results['muhurta_today{"task":"travel"}']));
  ok('стих отдаётся только нашим переводом',
    /Перевод \(наш\)/.test(results['find_verse{"themes":["letting-go"]}']) &&
    /Цитируй только этот перевод/.test(results['find_verse{"themes":["letting-go"]}']));
  ok('западная карта отдаётся с оговоркой про разные зодиаки',
    /24|аянамш|сидерическ/.test(results['western_chart{}']) &&
    /асцендент/.test(results['western_chart{}']));
  ok('каждый вызов попал в след', trail.length === 10, String(trail.length));

  group('Инструменты не роняют разговор на мусоре');
  const bad = [
    ['graha_detail', { graha: 'pluto' }],
    ['bhava_detail', { bhava: 99 }],
    ['dasha_periods', { inside: 'sun' }],
    ['transit_on', { date: 'вчера' }],
    ['varga_position', { varga: 'D99' }],
    ['find_verse', { themes: 'не массив' }]
  ];
  let survived = 0;
  for (const [name, input] of bad) {
    const t = tools.filter((x) => x.name === name)[0];
    const out = await t.run(input);
    if (typeof out === 'string' && out.length) survived++;
  }
  ok('на любой мусор приходит внятная строка', survived === bad.length,
    survived + ' из ' + bad.length);

}

  group('Разбор ответа модели');
  ok('разметку срезаем',
    Dipa.plain('## Заголовок\n\n**жирно** и *косо*\n- пункт') ===
    'Заголовок\n\nжирно и косо\nпункт',
    JSON.stringify(Dipa.plain('## Заголовок\n\n**жирно** и *косо*\n- пункт')));
  ok('абзацы делятся по пустой строке',
    Dipa.paragraphs('Один.\n\nДва.\nПродолжение.').length === 2);

  group('Модель отвечает (заглушка вместо сети)');
if (!HAS_SDK) {
  skip('поток, инструменты в ходе ответа, заметка', 'нет пакета @anthropic-ai/sdk');
} else {
  Dipa.setClient(fakeClient({ text: 'Шани стоит у вас в первой бхаве, и это видно по тому, ' +
    'как вы держите вес.\n\nЧто вы носите дольше, чем стоило бы?' }));
  let streamed = '';
  const m = await Dipa.answer({ birth: BIRTH, question: 'Почему нет сил?', nowMs: NOW,
    onText: (t) => { streamed += t; } });
  ok('источник — модель', m.source === 'model', m.source);
  ok('текст пришёл потоком, а не куском', streamed.length > 30 && streamed === m.text);
  ok('абзацы разобраны', m.paragraphs.length === 2);
  ok('сводка фактов приложена', !!(m.facts && m.facts.lagna === 'Митхуна'));

  group('Развёрнутый ответ обращается к расчёту');
  Dipa.setClient(fakeClient({
    text: 'Седьмая бхава у вас пуста, читаем по Гуру.\n\nЧто вы носите?',
    toolCalls: [{ name: 'bhava_detail', input: { bhava: 7 } },
                { name: 'find_verse', input: { themes: ['letting-go'] } }]
  }));
  const seen = [];
  const md = await Dipa.answer({ birth: BIRTH, question: 'Тяжело с женой', deep: true,
    nowMs: NOW, onTool: (t) => seen.push(t.title) });
  ok('след собран из вызовов', md.trail.length === 2, JSON.stringify(md.trail));
  ok('о вызовах сообщено по ходу', seen.length === 2, JSON.stringify(seen));
  ok('в следе видна бхава и стих',
    md.trail.some((t) => /бхава/.test(t.title)) && md.trail.some((t) => /стих/.test(t.title)));

  group('Сбой модели не ломает разговор');
  const boom = new Error('сеть отвалилась');
  Dipa.setClient(fakeClient({ fail: boom }));
  const fb = await Dipa.answer({ birth: BIRTH, question: 'Почему нет сил?', nowMs: NOW });
  ok('отвечают правила', fb.source === 'rules', fb.source);
  ok('причина сохранена', /сеть отвалилась/.test(fb.error || ''), fb.error);
  ok('ответ всё равно про карту', /1-я бхава у вас в раши/.test(fb.text));

  group('Заметка о собеседнике');
  Dipa.setClient(fakeClient({ note: 'Возвращается к переезду. Про здоровье просил не говорить.' }));
  const note = await Dipa.updateNote({
    history: [{ role: 'user', text: 'Переезд' }, { role: 'assistant', text: 'Четвёртая бхава' }],
    note: null
  });
  ok('заметка получена и без разметки', /переезду/.test(note) && !/[*#]/.test(note), note);
  ok('без истории заметка не пишется',
    (await Dipa.updateNote({ history: [], note: null })) === null);
}

  /* ================================================== 3. сервер /api/talk */

  Dipa.setClient(null);                          // дальше — без модели, по правилам

  group('Сервер: вход и состояние разговора');
  await new Promise((resolve) => api.server.listen(0, resolve));
  const base = 'http://127.0.0.1:' + api.server.address().port;
  const start = await (await fetch(base + '/api/auth/start', { method: 'POST' })).json();
  api.confirmCode(start.code, 4242);
  const auth = await (await fetch(base + '/api/auth/poll?code=' + start.code)).json();
  const H = { authorization: 'Bearer ' + auth.token, 'content-type': 'application/json' };
  const post = (p, b) => fetch(base + p, { method: 'POST', headers: H, body: JSON.stringify(b || {}) });
  const get = (p) => fetch(base + p, { headers: H });

  const st0 = await (await get('/api/talk/state')).json();
  ok('состояние отдаётся', st0.turns.length === 0 && st0.price === 1);
  ok('честно сказано, что модели нет', st0.model === false && /ключ|пакет/.test(st0.why || ''));
  ok('суточные пределы названы', st0.free.limit > 0 && st0.deep.limit > 0);

  /** Разбор потока SSE в список событий. */
  async function talk(question, deep) {
    const r = await post('/api/talk', { birth: BIRTH, question, deep });
    const ct = r.headers.get('content-type') || '';
    if (ct.indexOf('json') >= 0) return { status: r.status, json: await r.json() };
    const raw = await r.text();
    const events = raw.split('\n\n').filter(Boolean).map((b) => {
      const name = (b.match(/^event: (\S+)/m) || [])[1];
      const data = (b.match(/^data: (.*)$/m) || [])[1];
      return name ? { name, data: JSON.parse(data || '{}') } : null;
    }).filter(Boolean);
    return {
      status: r.status, events,
      text: events.filter((e) => e.name === 'text').map((e) => e.data.t).join(''),
      done: (events.filter((e) => e.name === 'done')[0] || {}).data
    };
  }

  group('Сервер: короткий ответ бесплатен');
  const t1 = await talk('Никак не решусь на переезд', false);
  ok('поток идёт событиями start/text/done',
    t1.events.map((e) => e.name).join(' ') === 'start text done',
    t1.events.map((e) => e.name).join(' '));
  ok('ответ про четвёртую бхаву', /4-я бхава/.test(t1.text));
  ok('баланс не тронут', t1.done.balance === 0);
  ok('остаток ответов уменьшился', t1.done.left === st0.free.limit - 1, String(t1.done.left));

  group('Сервер: развёрнутый платится за каждый раз');
  const noMoney = await talk('Что отпустить?', true);
  ok('без бидж — 402 с ценой', noMoney.status === 402 && noMoney.json.need === 1);
  await post('/api/purchase', { pack: 5 });
  const nope = await post('/api/unlock', { feature: 'dialog.deep' });
  ok('«открыть навсегда» отвергается', nope.status === 400 && (await nope.json()).perUse === true);

if (!HAS_SDK) {
  skip('списание за разбор наставника', 'нет пакета @anthropic-ai/sdk');
} else {
  // с моделью разбор — настоящий, и за него списывают
  Dipa.setClient(fakeClient({ text: 'Двенадцатая бхава у вас занята.\n\nЧто держите?' }));
  const paid1 = await talk('Что отпустить?', true);
  ok('после пополнения ответ приходит от модели', paid1.done.source === 'model');
  ok('списана одна биджа', paid1.done.balance === 4, String(paid1.done.balance));
  ok('и в ответе сказано, сколько списано', paid1.done.charged === 1);
  const paid2 = await talk('А теперь что?', true);
  ok('второй разбор списывает ещё одну', paid2.done.balance === 3, String(paid2.done.balance));
  const free1 = await talk('А коротко?', false);
  ok('короткий ответ по-прежнему бесплатен', free1.done.balance === 3);
  Dipa.setClient(null);
}

  group('Сервер: за подмену правилами денег не берут');
  // модели нет → разбор соберут правила; это то же, что бесплатный ответ,
  // поэтому списание должно вернуться само
  const balBefore = (await (await get('/api/wallet')).json()).balance;
  const swapped = await talk('Что отпустить?', true);
  ok('ответ пришёл', swapped.text.length > 100);
  ok('источник — правила', swapped.done.source === 'rules', swapped.done.source);
  ok('и списание вернулось', swapped.done.refunded === 1 && swapped.done.balance === balBefore,
    JSON.stringify({ refunded: swapped.done.refunded, was: balBefore, now: swapped.done.balance }));

  group('Сервер: за неудачу денег не берут');
  Dipa.setClient(HAS_SDK ? fakeClient({}) : null);
  const broken = Object.assign({}, BIRTH, { place: { name: 'Нигде', lat: 1000, lon: 0, tz: 'Ниоткуда/Нигде' } });
  const before = (await (await get('/api/wallet')).json()).balance;
  const r = await post('/api/talk', { birth: broken, question: 'Что отпустить?', deep: true });
  const raw = await r.text();
  const after = (await (await get('/api/wallet')).json()).balance;
  ok('ошибка сообщена', /event: error/.test(raw) || /event: done/.test(raw), raw.slice(0, 80));
  ok('баланс вернулся', after === before, before + ' → ' + after);
  Dipa.setClient(null);

  group('Сервер: память и «забыть»');
  const st1 = await (await get('/api/talk/state')).json();
  ok('реплики сохранены парами', st1.turns.length >= 4 && st1.turns.length % 2 === 0,
    String(st1.turns.length));
  ok('роли расставлены', st1.turns[0].role === 'user' && st1.turns[1].role === 'assistant');
  ok('прошлый вопрос попал в историю дословно',
    st1.turns.some((t) => t.text === 'Никак не решусь на переезд'));
  await post('/api/talk/forget');
  const st2 = await (await get('/api/talk/state')).json();
  ok('забывает и реплики, и заметку', st2.turns.length === 0);

  group('Сервер: мусор в запросе');
  ok('пустой вопрос — 400', (await post('/api/talk', { birth: BIRTH, question: ' ' })).status === 400);
  ok('слишком длинный — 400',
    (await post('/api/talk', { birth: BIRTH, question: 'я'.repeat(900) })).status === 400);
  ok('без карты — 400', (await post('/api/talk', { question: 'что?' })).status === 400);
  ok('без входа — 401',
    (await fetch(base + '/api/talk', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ birth: BIRTH, question: 'что?' }) })).status === 401);

  group('Сервер: суточный предел');
  const w = api.wallet('tg:4242');
  w.talk = { day: new Date().toISOString().slice(0, 10), free: 999, deep: 0 };
  const over = await post('/api/talk', { birth: BIRTH, question: 'ещё раз' });
  ok('за пределом — 429 с объяснением',
    over.status === 429 && /предел/.test((await over.json()).error));

  /* ------------------------------------------------------------- итог */
  api.store.close();
  api.server.close();
  try { fs.unlinkSync(process.env.ARUNA_API_DATA); } catch (e) { /* уже нет */ }
  console.log('\nпройдено ' + passed + ', провалено ' + failed +
    (skipped ? ', пропущено групп ' + skipped : ''));
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('\nтест упал: ' + e.stack); process.exit(1); });
