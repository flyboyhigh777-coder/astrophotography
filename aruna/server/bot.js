#!/usr/bin/env node
/*
 * Аруна · телеграм-бот
 * ------------------------------------------------------------------
 * Запуск:
 *     ARUNA_BOT_TOKEN=<токен от @BotFather> node server/bot.js
 * или положите токен в server/config.json и просто:
 *     node server/bot.js
 *
 * Проверить, что токен рабочий, не запуская бота:
 *     node server/bot.js --check
 *
 * Зависимостей нет. Данные лежат в server/data/bot.json обычным JSON —
 * его можно открыть и посмотреть глазами.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { Telegram, sleep } = require('./lib/telegram.js');
const { Store } = require('./lib/store.js');
const T = require('./lib/texts.js');
const J = require('./lib/jyotish.js');
const Dipa = require('./lib/dipa.js');

const esc = Telegram.esc;
const ROOT = __dirname;

/* ------------------------------------------------------------ настройки */

function loadConfig() {
  const file = path.join(ROOT, 'config.json');
  let cfg = {};
  if (fs.existsSync(file)) {
    try { cfg = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (e) { console.error('config.json не читается: ' + e.message); }
  }
  return {
    token: process.env.ARUNA_BOT_TOKEN || cfg.botToken || '',
    site: process.env.ARUNA_SITE || cfg.site || '',
    // ARUNA_DATA пригодится для тестов и для нескольких ботов на одной машине
    dataFile: process.env.ARUNA_DATA || cfg.dataFile || path.join(ROOT, 'data', 'bot.json'),
    admin: Number(process.env.ARUNA_ADMIN || cfg.adminChatId || 0)
  };
}

const CFG = loadConfig();

if (!CFG.token) {
  console.error([
    '',
    'Нет токена бота. Что сделать:',
    '',
    '  1. Откройте Telegram и напишите @BotFather',
    '  2. Команда /newbot, дальше он спросит имя и адрес бота',
    '  3. Он пришлёт строку вида 1234567890:AAH...  — это токен',
    '  4. Запустите так:',
    '',
    '       ARUNA_BOT_TOKEN=ваш_токен node server/bot.js',
    '',
    '     или создайте файл server/config.json:',
    '',
    '       { "botToken": "ваш_токен", "site": "https://ваш-сайт" }',
    ''
  ].join('\n'));
  process.exit(1);
}

const tg = new Telegram(CFG.token);
const store = new Store(CFG.dataFile);

/* --------------------------------------------------------------- команды */

/* Связь с сайтом. Когда бот и сайт подняты одной командой (server/index.js),
   бот может подтверждать вход на сайте — так человеку не нужны ни почта,
   ни пароль. Если сайт не запущен рядом, /login честно об этом говорит. */
let apiLink = null;
function linkApi(api) { apiLink = api; }

const COMMANDS = [
  { command: 'today', description: 'День: панчанга, Луна по вашей карте, стих' },
  { command: 'ask', description: 'Спросить Дипу своими словами' },
  { command: 'chart', description: 'Ваша карта рождения' },
  { command: 'dasha', description: 'Периоды Вимшоттари' },
  { command: 'muhurta', description: 'Хорошее и плохое время сегодня' },
  { command: 'navamsha', description: 'Навамша (D9)' },
  { command: 'sav', description: 'Сарвашта-кавварга: очки по раши' },
  { command: 'mood', description: 'Отметить, как прошёл день' },
  { command: 'stats', description: 'Дневник: на какие бхавы падают тяжёлые дни' },
  { command: 'digest', description: 'Утренняя сводка: включить или выключить' },
  { command: 'birth', description: 'Ввести или изменить данные рождения' },
  { command: 'forget', description: 'Забыть разговор с Дипой' },
  { command: 'login', description: 'Подтвердить вход на сайте по коду' },
  { command: 'help', description: 'Что умеет бот' }
];

const HELP = [
  '<b>Что я умею</b>',
  '',
  'Считаю вашу джйотиш-карту и говорю о дне, глядя на неё.',
  '',
  'Спрашивайте прямо в чат своими словами — отвечу, глядя на вашу карту. ' +
  'Или командой: /ask почему нет сил.',
  '',
  '/today — небо дня над вашей картой и стих',
  '/chart — карта рождения: лагна, грахи по бхавам, йоги',
  '/dasha — периоды Вимшоттари с датами',
  '/muhurta — что сегодня сделать в какое время',
  '/navamsha — навамша, вторая по важности карта',
  '/sav — сарвашта-кавварга, очки бинду по раши',
  '',
  '/mood — отметить день одной кнопкой',
  '/stats — статистика: на какие бхавы Луны падают ваши тяжёлые дни',
  '',
  '/digest — утренняя сводка в 7 утра по вашему времени',
  '/birth — изменить данные рождения',
  '/forget — забыть разговор с Дипой',
  '',
  '<i>Расчёт сидерический, аянамша Лахири, бхавы целыми раши. ' +
  'Точность эфемериды проверена: Луна лучше 15″, планеты в пределах 3,5′.</i>'
].join('\n');

/* --------------------------------------------------- ввод данных рождения */

function askBirth(chatId, user) {
  user.state = 'await_date';
  user.draft = {};
  store.save(user);
  return tg.send(chatId,
    '<b>Начнём с рождения</b>\n\n' +
    'Пришлите дату в виде <code>15.06.1975</code>.\n\n' +
    '<i>Дальше спрошу время и город. Данные нужны только для расчёта.</i>');
}

function parseDate(text) {
  const m = String(text).trim().match(/^(\d{1,2})[.\-/\s](\d{1,2})[.\-/\s](\d{4})$/);
  if (!m) return null;
  const d = +m[1], mo = +m[2], y = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null;
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCDate() !== d || check.getUTCMonth() !== mo - 1) return null;
  return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

function parseTime(text) {
  const t = String(text).trim().toLowerCase();
  if (/^(не ?знаю|неизвестно|-|нет)$/.test(t)) return { time: '12:00', known: false };
  const m = t.match(/^(\d{1,2})[:.\s](\d{2})$/);
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  if (h > 23 || mi > 59) return null;
  return { time: String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0'), known: true };
}

function cityKeyboard(matches) {
  return {
    inline_keyboard: matches.map((c, i) => ([{
      text: c.name + ' · ' + c.region,
      callback_data: 'city:' + i + ':' + c.name
    }]))
  };
}

async function handleBirthFlow(chatId, user, text) {
  if (user.state === 'await_date') {
    const date = parseDate(text);
    if (!date) {
      return tg.send(chatId, 'Не разобрал дату. Нужен вид <code>15.06.1975</code>.');
    }
    user.draft.date = date;
    user.state = 'await_time';
    store.save(user);
    return tg.send(chatId,
      'Теперь время — <code>06:00</code>.\n\n' +
      'Если не знаете, напишите <b>не знаю</b>: посчитаю на полдень. ' +
      'Раши и накшатры почти не сдвинутся, а лагна будет приблизительной.');
  }

  if (user.state === 'await_time') {
    const t = parseTime(text);
    if (!t) {
      return tg.send(chatId, 'Не разобрал время. Нужен вид <code>06:00</code> — или напишите «не знаю».');
    }
    user.draft.time = t.time;
    user.draft.timeKnown = t.known;
    user.state = 'await_city';
    store.save(user);
    return tg.send(chatId, 'И город рождения — просто названием.');
  }

  if (user.state === 'await_city') {
    const matches = J.Cities.search(text, 6);
    if (!matches.length) {
      return tg.send(chatId,
        'Такого города нет в моём списке. Попробуйте ближайший крупный — ' +
        'разница в несколько десятков километров на карту почти не влияет.');
    }
    user.draft.matches = matches;
    store.save(user);
    return tg.send(chatId, 'Выберите:', { reply_markup: cityKeyboard(matches) });
  }

  return null;
}

async function finishBirth(chatId, user, city) {
  user.birth = {
    date: user.draft.date,
    time: user.draft.time,
    timeKnown: user.draft.timeKnown !== false,
    place: { name: city.name, lat: city.lat, lon: city.lon, tz: city.tz }
  };
  user.state = 'idle';
  user.draft = {};
  // при первом расчёте запоминаем текущее состояние неба, чтобы потом
  // сообщать именно об изменениях, а не о том, что было всегда
  T.alerts(user, Date.now()).forEach((a) => { user.notified[a.key] = a.value; });
  store.save(user);

  await tg.send(chatId, '✅ Карта построена.\n\n' + T.chartSummary(user));
  await tg.send(chatId,
    'Дальше: /today — небо сегодняшнего дня, /dasha — периоды, /muhurta — время дня.\n\n' +
    'Включить утреннюю сводку — /digest.' +
    (CFG.site ? '\n\nПодробные разборы — на сайте: ' + CFG.site : ''));
}

/* --------------------------------------------------------- разговор */

/*
 * Дипа в боте. Здесь то же, что на сайте, только короче: мессенджер
 * читают на ходу.
 *
 * Короткий ответ бесплатен. Развёрнутый — за биджу, и списывает её тот
 * же кошелёк, что на сайте: если человек вошёл на сайт через бота, у него
 * один баланс на два места. Кошелька рядом нет (бот запущен один) —
 * говорим об этом прямо, а не делаем вид, что кнопка сломалась.
 */

const TALK_FREE_PER_DAY = 10;

function talkOf(user) {
  if (!user.talk || !Array.isArray(user.talk.turns)) {
    user.talk = { turns: [], note: null, day: null, free: 0, deep: 0 };
  }
  const today = T.dayKey(Date.now(), user.birth ? user.birth.place.tz : 'Europe/Moscow');
  if (user.talk.day !== today) { user.talk.day = today; user.talk.free = 0; user.talk.deep = 0; }
  return user.talk;
}

/** Кошелёк с сайта, если сайт поднят рядом. Иначе null. */
function walletOf(chatId) {
  if (!apiLink || !apiLink.wallet) return null;
  try { return apiLink.wallet('tg:' + chatId); } catch (e) { return null; }
}

function deepPrice() {
  return apiLink && apiLink.ACCESS ? apiLink.ACCESS.FEATURES['dialog.deep'].price : 1;
}

/** Ответ Дипы в чат. deep — развёрнутый разбор вместо короткого. */
async function dipaReply(chatId, user, question, deep) {
  const talk = talkOf(user);

  if (!deep && talk.free >= TALK_FREE_PER_DAY) {
    return tg.send(chatId,
      'На сегодня десять ответов — это предел, он стоит от перерасхода, а не ' +
      'против вас. Возвращайтесь завтра: /today работает всегда.');
  }

  let charged = 0, w = null;
  if (deep) {
    w = walletOf(chatId);
    const price = deepPrice();
    const bySub = w && apiLink.ACCESS && w.plan === apiLink.ACCESS.PLAN.id;
    if (!w) {
      return tg.send(chatId,
        'Развёрнутый разбор считает сайт — он сейчас не запущен рядом со мной. ' +
        'Короткий ответ у вас уже есть, а разбор будет, когда поднимется ' +
        '<code>node server/index.js</code>.');
    }
    if (!bySub) {
      if (w.balance < price) {
        return tg.send(chatId,
          'Развёрнутый разбор — ' + price + ' биджа, а в кошельке ' + w.balance + '.\n\n' +
          'Пополнить можно на сайте' + (CFG.site ? ': ' + esc(CFG.site) + '/pricing.html' : '') +
          '. Короткие ответы остаются бесплатными.');
      }
      w.balance -= price;
      w.spent = (w.spent || 0) + price;
      charged = price;
    }
  }

  await tg.chatAction(chatId);
  let r;
  try {
    r = await Dipa.answer({
      birth: user.birth, question, deep,
      history: talk.turns.slice(-12), note: talk.note
    });
  } catch (e) {
    if (charged && w) { w.balance += charged; w.spent -= charged; }
    return tg.send(chatId, 'Не получилось ответить: ' + esc(e.message) +
      (charged ? '. Списанное вернулось.' : '.'));
  }

  talk.turns.push({ role: 'user', text: question, at: Date.now() });
  talk.turns.push({ role: 'assistant', text: r.text, at: Date.now() });
  if (talk.turns.length > 24) talk.turns = talk.turns.slice(-24);
  talk[deep ? 'deep' : 'free'] += 1;
  user.lastQuestion = question;
  store.save(user);

  const body = r.paragraphs.map((p) => esc(p)).join('\n\n');
  const tail = [];
  if (r.source === 'rules') {
    tail.push('<i>Собрано по правилам: языковая модель сейчас не отвечает.</i>');
  }
  if (r.trail && r.trail.length) {
    tail.push('<i>Смотрел: ' + r.trail.map((t) => esc(t.title)).join(', ') + '.</i>');
  }
  if (charged) tail.push('<i>Списана ' + charged + ' биджа, осталось ' + w.balance + '.</i>');

  const extra = deep ? {} : {
    reply_markup: { inline_keyboard: [[{
      text: '⤵ Развернуть за ' + deepPrice() + ' биджу', callback_data: 'deep'
    }]] }
  };
  await tg.send(chatId, body + (tail.length ? '\n\n' + tail.join('\n') : ''), extra);

  // Заметку наставник переписывает после ответа — человека это не задерживает.
  if (Dipa.available() && talk.turns.length >= 4 && talk.turns.length % 6 === 0) {
    Dipa.updateNote({ history: talk.turns, note: talk.note }).then((note) => {
      if (note) { talk.note = note; store.save(user); }
    }).catch(() => {});
  }
}

/* ------------------------------------------------------------- дневник */

const MOOD_KEYBOARD = {
  inline_keyboard: [[
    { text: '🙂 легко', callback_data: 'mood:1' },
    { text: '😐 обычно', callback_data: 'mood:0' },
    { text: '😮‍💨 тяжело', callback_data: 'mood:-1' }
  ]]
};

/* ---------------------------------------------------------- обработчики */

function needBirth(chatId, user) {
  if (user.birth) return false;
  tg.send(chatId, 'Сначала нужна ваша карта. Команда /birth — это полминуты.');
  return true;
}

async function onMessage(msg) {
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();
  const user = store.user(chatId);
  if (msg.from && msg.from.first_name && !user.name) {
    user.name = msg.from.first_name;
    store.save(user);
  }

  if (text.startsWith('/')) {
    const cmd = text.split(/[\s@]/)[0].slice(1).toLowerCase();

    if (cmd === 'start') {
      await tg.send(chatId,
        'Здравствуйте' + (user.name ? ', ' + esc(user.name) : '') + '.\n\n' +
        'Я считаю джйотиш-карту и говорю о дне, глядя именно на неё, а не на ' +
        '«знак месяца».\n\n' + HELP);
      if (!user.birth) return askBirth(chatId, user);
      return;
    }

    if (cmd === 'help') return tg.send(chatId, HELP);
    if (cmd === 'birth') return askBirth(chatId, user);

    if (cmd === 'today') {
      if (needBirth(chatId, user)) return;
      return tg.send(chatId, T.digest(user));
    }
    if (cmd === 'chart') {
      if (needBirth(chatId, user)) return;
      return tg.send(chatId, T.chartSummary(user));
    }
    if (cmd === 'dasha') {
      if (needBirth(chatId, user)) return;
      return tg.send(chatId, T.dashaText(user));
    }
    if (cmd === 'navamsha' || cmd === 'd9') {
      if (needBirth(chatId, user)) return;
      return tg.send(chatId, T.navamshaText(user));
    }
    if (cmd === 'sav') {
      if (needBirth(chatId, user)) return;
      return tg.send(chatId, T.savText(user));
    }
    if (cmd === 'muhurta') {
      if (needBirth(chatId, user)) return;
      return tg.send(chatId, T.muhurtaText(user, 'start'), {
        reply_markup: {
          inline_keyboard: J.Muhurta.TASKS.map((t) => ([{
            text: t.title, callback_data: 'task:' + t.id
          }]))
        }
      });
    }

    if (cmd === 'ask' || cmd === 'dipa') {
      if (needBirth(chatId, user)) return;
      const q = text.replace(/^\/\S+\s*/, '').trim();
      if (!q) {
        return tg.send(chatId,
          'Спрашивайте прямо в чат, командой не обязательно: «почему нет сил», ' +
          '«стоит ли переезжать», «что мне пора отпустить». Отвечу, глядя на вашу карту.');
      }
      return dipaReply(chatId, user, q, false);
    }

    if (cmd === 'forget') {
      user.talk = { turns: [], note: null, day: null, free: 0, deep: 0 };
      store.save(user);
      return tg.send(chatId, 'Разговор забыл: и реплики, и свою заметку. Карта на месте.');
    }

    if (cmd === 'mood') {
      if (needBirth(chatId, user)) return;
      return tg.send(chatId, 'Как прошёл день?', { reply_markup: MOOD_KEYBOARD });
    }
    if (cmd === 'stats') {
      if (needBirth(chatId, user)) return;
      return tg.send(chatId, T.moodStats(user));
    }

    if (cmd === 'digest') {
      if (needBirth(chatId, user)) return;
      user.digest = !user.digest;
      store.save(user);
      return tg.send(chatId, user.digest
        ? '✅ Утренняя сводка включена — буду писать около 7 утра по вашему времени ' +
          '(' + esc(user.birth.place.tz) + ').\n\nВыключить — той же командой /digest.'
        : 'Утренняя сводка выключена. Включить обратно — /digest.');
    }

    if (cmd === 'login') {
      const code = (text.split(/\s+/)[1] || '').toUpperCase();
      if (!code) {
        return tg.send(chatId,
          'Откройте сайт, нажмите «Войти» — он покажет код. Пришлите мне его так:\n\n' +
          '<code>/login ABC123</code>');
      }
      if (!apiLink) {
        return tg.send(chatId,
          'Сайт сейчас не запущен рядом со мной, подтвердить вход не могу. ' +
          'Это чинится запуском <code>node server/index.js</code> — там бот и сайт ' +
          'поднимаются вместе.');
      }
      const okLogin = apiLink.confirmCode(code, chatId);
      return tg.send(chatId, okLogin
        ? '✅ Вход подтверждён. Вернитесь на сайт — страница уже открыта под вами.'
        : 'Код не подошёл: он либо устарел (живёт 10 минут), либо уже использован. ' +
          'Обновите страницу входа и пришлите новый.');
    }

    if (cmd === 'reset') {
      user.birth = null; user.state = 'idle'; user.draft = {};
      user.mood = []; user.notified = {}; user.digest = false;
      store.save(user);
      return tg.send(chatId, 'Всё удалил: карту, дневник и настройки. Заново — /birth.');
    }

    if (cmd === 'stats_admin' && CFG.admin && chatId === CFG.admin) {
      const s = store.stats();
      return tg.send(chatId, '<b>Статистика</b>\n· всего: ' + s.total +
        '\n· с картой: ' + s.withBirth + '\n· со сводкой: ' + s.digest +
        '\n· отметок в дневниках: ' + s.moodEntries);
    }

    return tg.send(chatId, 'Такой команды нет. Что умею — /help');
  }

  // не команда: возможно, идёт ввод данных рождения
  if (user.state !== 'idle') {
    const handled = await handleBirthFlow(chatId, user, text);
    if (handled !== null) return;
  }

  if (!user.birth) return askBirth(chatId, user);

  // Обычный текст — это вопрос Дипе. Так и должно быть: человек пришёл
  // говорить, а не вспоминать список команд.
  return dipaReply(chatId, user, text, false);
}

async function onCallback(cb) {
  const chatId = cb.message.chat.id;
  const user = store.user(chatId);
  const data = cb.data || '';

  if (data.startsWith('city:')) {
    const idx = Number(data.split(':')[1]);
    const city = (user.draft.matches || [])[idx];
    if (!city) {
      await tg.answerCallback(cb.id, 'Список устарел, введите город ещё раз');
      return;
    }
    await tg.answerCallback(cb.id, city.name);
    await tg.editText(chatId, cb.message.message_id, 'Место: <b>' + esc(city.name) + '</b>');
    return finishBirth(chatId, user, city);
  }

  if (data.startsWith('mood:')) {
    if (!user.birth) { await tg.answerCallback(cb.id, 'Сначала /birth'); return; }
    const value = Number(data.split(':')[1]);
    const today = T.dayKey(Date.now(), user.birth.place.tz);
    user.mood = (user.mood || []).filter((e) => e.date !== today);
    user.mood.push({ date: today, value, moonBhava: T.moonBhavaOn(user, today) });
    if (user.mood.length > 1000) user.mood = user.mood.slice(-1000);
    store.save(user);
    const label = value > 0 ? 'легко' : value < 0 ? 'тяжело' : 'обычно';
    await tg.answerCallback(cb.id, 'Записал: ' + label);
    return tg.editText(chatId, cb.message.message_id,
      'Записал: <b>' + label + '</b>. Отметок всего: ' + user.mood.length +
      '.\n\nСтатистика — /stats');
  }

  if (data === 'deep') {
    if (!user.birth) { await tg.answerCallback(cb.id, 'Сначала /birth'); return; }
    const q = user.lastQuestion;
    if (!q) { await tg.answerCallback(cb.id, 'Вопрос потерялся, спросите снова'); return; }
    await tg.answerCallback(cb.id, 'Разворачиваю');
    // кнопку убираем, чтобы её нельзя было нажать дважды и заплатить дважды
    await tg.call('editMessageReplyMarkup', {
      chat_id: chatId, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [] }
    }).catch(() => null);
    return dipaReply(chatId, user, q, true);
  }

  if (data.startsWith('task:')) {
    if (!user.birth) { await tg.answerCallback(cb.id, 'Сначала /birth'); return; }
    const task = data.split(':')[1];
    await tg.answerCallback(cb.id);
    return tg.editText(chatId, cb.message.message_id, T.muhurtaText(user, task), {
      reply_markup: cb.message.reply_markup
    });
  }

  return tg.answerCallback(cb.id);
}

/* ------------------------------------------------ рассылка и уведомления */

async function tick() {
  const now = Date.now();
  for (const user of store.all()) {
    if (!user.birth) continue;
    const tz = user.birth.place.tz;
    let z;
    try { z = J.Tz.utcMsToZoned(now, tz); } catch (e) { continue; }
    const today = T.dayKey(now, tz);

    // утренняя сводка
    if (user.digest && z.h === (user.digestHour || 7) && user.lastDigest !== today) {
      user.lastDigest = today;
      store.save(user);
      try {
        await tg.send(user.chatId, T.digest(user, now), { reply_markup: MOOD_KEYBOARD });
      } catch (e) {
        if (e.blocked) { user.digest = false; store.save(user); }
        else console.error('[digest] ' + user.chatId + ': ' + e.message);
      }
      await sleep(120);                      // не долбим API пачкой
    }

    // уведомления о сменах — раз в день, в тот же час
    if (z.h === (user.digestHour || 7) && user.lastAlertCheck !== today) {
      user.lastAlertCheck = today;
      const list = T.alerts(user, now);
      for (const a of list) {
        user.notified[a.key] = a.value;
        if (a.silent || !a.text) continue;
        if (!user.digest) continue;          // без подписки не беспокоим
        try { await tg.send(user.chatId, a.text); }
        catch (e) { if (e.blocked) { user.digest = false; } }
        await sleep(120);
      }
      store.save(user);
    }
  }
}

/* --------------------------------------------------------------- запуск */

async function check() {
  const me = await tg.call('getMe');
  console.log('Токен рабочий. Бот: @' + me.username + ' (' + me.first_name + ')');
  const s = store.stats();
  console.log('В базе: ' + s.total + ' пользователей, из них с картой ' + s.withBirth + '.');
  process.exit(0);
}

async function main() {
  if (process.argv.includes('--check')) return check();

  const me = await tg.call('getMe');
  await tg.setCommands(COMMANDS);
  console.log('Аруна · бот @' + me.username + ' запущен.');
  console.log('Данные: ' + CFG.dataFile);
  console.log('Остановить — Ctrl+C.');

  const shutdown = () => {
    console.log('\nСохраняю и выхожу.');
    store.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  setInterval(() => { tick().catch((e) => console.error('[tick] ' + e.message)); }, 60000);
  tick().catch(() => {});

  for (;;) {
    try {
      const updates = await tg.poll();
      for (const u of updates) {
        try {
          if (u.message) await onMessage(u.message);
          else if (u.callback_query) await onCallback(u.callback_query);
        } catch (e) {
          if (!e.blocked) console.error('[update] ' + e.message);
        }
      }
    } catch (e) {
      console.error('[poll] ' + e.message);
      await sleep(3000);
    }
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error('Не удалось запустить: ' + e.message);
    process.exit(1);
  });
}

module.exports = {
  parseDate, parseTime, onMessage, onCallback, tick, store, tg,
  linkApi, main, COMMANDS, dipaReply, talkOf
};
