/*
 * Аруна · тест телеграм-бота
 * ------------------------------------------------------------------
 * Настоящий Telegram здесь не нужен: подменяем единственный метод,
 * который ходит в сеть (tg.call), и проигрываем весь разговор — от
 * /start до утренней рассылки. Так проверяется то, что ломается чаще
 * всего: разбор дат, состояния диалога и тексты, которые собираются
 * из расчётов.
 *
 * Запуск: node test/bot.test.js
 */
'use strict';

process.env.ARUNA_BOT_TOKEN = 'test:token';
process.env.ARUNA_DATA = '/tmp/aruna-bot-test-' + process.pid + '.json';

const assert = require('node:assert');
const fs = require('node:fs');

const bot = require('../server/bot.js');
const J = require('../server/lib/jyotish.js');

let passed = 0, failed = 0;
const sent = [];

function ok(name, cond, extra) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}
function group(n) { console.log('\n— ' + n); }

// подменяем сеть
bot.tg.call = async function (method, payload) {
  sent.push({ method, payload });
  if (method === 'getMe') return { username: 'aruna_test_bot', first_name: 'Аруна' };
  if (method === 'sendMessage') return { message_id: sent.length, chat: { id: payload.chat_id } };
  return true;
};
const last = () => sent[sent.length - 1];
const lastText = () => (last() && last().payload && last().payload.text) || '';
const msg = (text, chatId = 555) =>
  bot.onMessage({ chat: { id: chatId }, from: { id: chatId, first_name: 'Тест' }, text });
const cb = (data, chatId = 555) =>
  bot.onCallback({ id: 'q' + sent.length, data, message: { chat: { id: chatId }, message_id: 1 } });

(async function run() {
  group('Разбор дат и времени');
  ok('15.06.1975 → 1975-06-15', bot.parseDate('15.06.1975') === '1975-06-15');
  ok('05/03/1990 тоже понимается', bot.parseDate('05/03/1990') === '1990-03-05');
  ok('31.02.1990 отвергается (такого дня нет)', bot.parseDate('31.02.1990') === null);
  ok('13.13.1990 отвергается', bot.parseDate('13.13.1990') === null);
  ok('1800 год вне диапазона', bot.parseDate('01.01.1800') === null);
  ok('«вчера» не дата', bot.parseDate('вчера') === null);
  ok('06:00 разбирается', bot.parseTime('06:00').time === '06:00' && bot.parseTime('06:00').known);
  ok('«не знаю» → полдень без точного времени',
     bot.parseTime('не знаю').time === '12:00' && bot.parseTime('не знаю').known === false);
  ok('25:00 отвергается', bot.parseTime('25:00') === null);

  group('Диалог: от /start до карты');
  await msg('/start');
  ok('на /start бот здоровается и просит дату', /дату/i.test(lastText()));

  await msg('абракадабра');
  ok('мусор вместо даты не ломает диалог', /Не разобрал дату/.test(lastText()));

  await msg('15.06.1975');
  ok('после даты спрашивает время', /время/i.test(lastText()));

  await msg('06:00');
  ok('после времени спрашивает город', /город/i.test(lastText()));

  await msg('Мосва');
  ok('неизвестный город не ломает диалог', /нет в моём списке/.test(lastText()));

  await msg('Москва');
  ok('на город приходит клавиатура выбора',
     !!(last().payload.reply_markup && last().payload.reply_markup.inline_keyboard.length));

  const before = sent.length;
  await cb('city:0');
  const after = sent.slice(before).map((s) => s.payload.text || '').join('\n');
  ok('после выбора города строится карта', /Карта построена/.test(after));
  ok('в карте есть лагна', /лагна/.test(after));
  ok('в карте есть йоги', /Йоги/.test(after));

  const user = bot.store.user(555);
  ok('данные рождения сохранены',
     user.birth && user.birth.date === '1975-06-15' && user.birth.place.name === 'Москва');
  ok('состояние вернулось в покой', user.state === 'idle');
  ok('исходное небо запомнено для будущих уведомлений',
     user.notified && user.notified.antar && user.notified.saturn);

  group('Команды');
  await msg('/today');
  ok('/today говорит про Луну и бхаву', /Луна в/.test(lastText()) && /бхава/.test(lastText()));
  ok('/today содержит стих', /Бхагавад-гита|Бхагаватам/.test(lastText()));

  await msg('/dasha');
  ok('/dasha показывает текущий период и список', /Вимшоттари/.test(lastText()) && /▶/.test(lastText()));

  await msg('/navamsha');
  ok('/navamsha даёт лагну навамши', /Навамша/.test(lastText()) && /Лагна навамши/.test(lastText()));

  await msg('/sav');
  ok('/sav показывает бинду и итог 337', /бинду/i.test(lastText()) && /337/.test(lastText()));

  await msg('/muhurta');
  ok('/muhurta даёт лучшее и худшее время',
     /Лучшее время/.test(lastText()) && /переждать/.test(lastText()));
  ok('у мухурты есть выбор задачи',
     !!(last().payload.reply_markup && last().payload.reply_markup.inline_keyboard.length === 6));

  await msg('/help');
  ok('/help перечисляет команды', /\/today/.test(lastText()) && /\/mood/.test(lastText()));

  await msg('/несуществующая');
  ok('неизвестная команда не ломает бота', /Такой команды нет/.test(lastText()));

  group('Дневник');
  await msg('/mood');
  ok('/mood предлагает три кнопки',
     last().payload.reply_markup.inline_keyboard[0].length === 3);
  await cb('mood:-1');
  ok('оценка записана', bot.store.user(555).mood.length === 1);
  ok('вместе с оценкой записана бхава Луны',
     bot.store.user(555).mood[0].moonBhava >= 1 && bot.store.user(555).mood[0].moonBhava <= 12);
  await cb('mood:1');
  ok('повторная оценка за тот же день заменяет прежнюю',
     bot.store.user(555).mood.length === 1 && bot.store.user(555).mood[0].value === 1);

  await msg('/stats');
  ok('при малом числе отметок статистика честно молчит', /мало отметок/.test(lastText()));

  // набиваем дневник и проверяем, что статистика собирается
  const u = bot.store.user(555);
  u.mood = [];
  for (let i = 0; i < 40; i++) {
    const d = new Date(Date.UTC(2026, 0, 1 + i));
    const key = d.toISOString().slice(0, 10);
    u.mood.push({ date: key, value: (i % 3) - 1, moonBhava: (i % 12) + 1 });
  }
  bot.store.save(u);
  await msg('/stats');
  ok('на сорока отметках статистика появляется',
     /Легче всего/.test(lastText()) && /Тяжелее всего/.test(lastText()));

  group('Подписка и рассылка');
  await msg('/digest');
  ok('сводка включается', bot.store.user(555).digest === true && /включена/.test(lastText()));
  await msg('/digest');
  ok('и выключается', bot.store.user(555).digest === false);
  await msg('/digest');

  // подводим часы пользователя к часу рассылки
  const u2 = bot.store.user(555);
  u2.lastDigest = null;
  u2.digestHour = J.Tz.utcMsToZoned(Date.now(), u2.birth.place.tz).h;
  bot.store.save(u2);
  const before2 = sent.length;
  await bot.tick();
  const digestSent = sent.slice(before2).some((s) => /Панчанга/.test(s.payload.text || ''));
  ok('в свой час приходит утренняя сводка', digestSent);

  const before3 = sent.length;
  await bot.tick();
  ok('второй раз за день сводка не дублируется', sent.length === before3);

  group('Дипа: разговор своими словами');
  // модель в тестах не спрашиваем — отвечают правила из talk.js
  await msg('Никак не решусь на переезд, всё откладываю');
  ok('обычный текст — это вопрос, а не «не понял команду»',
     /4-я бхава/.test(lastText()) && !/понимаю команды/.test(lastText()));
  ok('под ответом кнопка «развернуть» с ценой',
     !!(last().payload.reply_markup &&
        /Развернуть за \d+ биджу/.test(last().payload.reply_markup.inline_keyboard[0][0].text)));
  ok('сказано, что собрано по правилам, а не моделью',
     /по правилам/.test(lastText()));
  ok('реплики легли в память бота',
     bot.talkOf(bot.store.user(555)).turns.length === 2);

  await msg('/ask почему всё время не хватает сил');
  ok('/ask с вопросом отвечает про первую бхаву', /1-я бхава/.test(lastText()));
  await msg('/ask');
  ok('/ask без вопроса объясняет, как спрашивать', /Спрашивайте прямо в чат/.test(lastText()));

  group('Дипа: развёрнутый разбор без кошелька рядом');
  await cb('deep');
  ok('честно сказано, что сайт не запущен рядом',
     /не запущен рядом со мной/.test(lastText()));

  group('Дипа: развёрнутый разбор с кошельком');
  // подставляем кошелёк, как это делает server/index.js, когда сайт и бот
  // поднимаются вместе
  const fakeWallets = { 'tg:555': { balance: 2, plan: 'free', unlocked: {}, spent: 0 } };
  bot.linkApi({
    wallet: (id) => fakeWallets[id],
    ACCESS: { PLAN: { id: 'sadhana' }, FEATURES: { 'dialog.deep': { price: 1 } } },
    confirmCode: () => false
  });
  await msg('Что мне пора отпустить?');
  await cb('deep');
  ok('разбор пришёл', /12-я бхава/.test(lastText()));
  ok('списана одна биджа', fakeWallets['tg:555'].balance === 1,
     String(fakeWallets['tg:555'].balance));
  ok('о списании сказано в ответе', /Списана 1 биджа/.test(lastText()));
  await msg('А дальше что?');
  await cb('deep');
  ok('вторая биджа тоже списана', fakeWallets['tg:555'].balance === 0);
  await msg('И ещё?');
  await cb('deep');
  ok('на нуле предлагают пополнить, а не молчат',
     /в кошельке 0/.test(lastText()) && /Пополнить/.test(lastText()));
  ok('баланс не ушёл в минус', fakeWallets['tg:555'].balance === 0);

  fakeWallets['tg:555'].plan = 'sadhana';
  await msg('А по подписке?');
  await cb('deep');
  ok('по подписке разбор без списания',
     fakeWallets['tg:555'].balance === 0 && !/Списана/.test(lastText()));

  group('Дипа: забыть разговор');
  await msg('/forget');
  ok('память очищена', bot.talkOf(bot.store.user(555)).turns.length === 0);
  ok('и об этом сказано', /забыл/.test(lastText()));

  group('Сброс');
  await msg('/reset');
  ok('после сброса карты нет', bot.store.user(555).birth === null);
  await msg('/today');
  ok('без карты команды просят её ввести', /Сначала нужна ваша карта/.test(lastText()));

  bot.store.close();
  try { fs.unlinkSync(process.env.ARUNA_DATA); } catch (e) { /* уже нет */ }

  console.log('\nпройдено ' + passed + ', провалено ' + failed);
  process.exit(failed ? 1 : 0);
})();
