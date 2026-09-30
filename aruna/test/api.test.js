/*
 * Аруна · тест сервера и API
 * ------------------------------------------------------------------
 * Поднимает настоящий сервер на свободном порту и проходит весь путь:
 * код входа → подтверждение ботом → сессия → кошелёк → пополнение →
 * покупка разбора → получение разбора. Отдельно проверяется главное,
 * ради чего сервер и появился: без оплаты полный разбор не отдаётся.
 *
 * Запуск: node test/api.test.js
 */
'use strict';

process.env.ARUNA_API_DATA = '/tmp/aruna-api-test-' + process.pid + '.json';
process.env.PORT = '0';                       // порт выберет система

const fs = require('node:fs');
const api = require('../server/api.js');

let passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}
function group(n) { console.log('\n— ' + n); }

const BIRTH = {
  date: '1975-06-15', time: '06:00', timeKnown: true,
  place: { name: 'Москва', lat: 55.7558, lon: 37.6176, tz: 'Europe/Moscow' }
};

(async function run() {
  await new Promise((resolve) => api.server.listen(0, resolve));
  const port = api.server.address().port;
  const base = 'http://127.0.0.1:' + port;

  const get = (p, token) => fetch(base + p, {
    headers: token ? { authorization: 'Bearer ' + token } : {}
  });
  const post = (p, body, token) => fetch(base + p, {
    method: 'POST',
    headers: Object.assign({ 'content-type': 'application/json' },
      token ? { authorization: 'Bearer ' + token } : {}),
    body: JSON.stringify(body || {})
  });

  group('Статика');
  {
    const r = await get('/index.html');
    const html = await r.text();
    ok('главная отдаётся', r.status === 200 && /Аруна/.test(html));
    ok('правильный content-type', /text\/html/.test(r.headers.get('content-type')));

    const js = await get('/assets/js/core/astro.js');
    ok('скрипты отдаются', js.status === 200);

    const nope = await get('/server/api.js');
    ok('код сервера наружу не отдаётся', nope.status === 404);

    const up = await get('/../../etc/passwd');
    ok('выход за корень не проходит', up.status === 404 || up.status === 403);
  }

  group('Доступ без входа');
  {
    const w = await get('/api/wallet');
    ok('кошелёк требует входа', w.status === 401);
    const rep = await post('/api/report', { feature: 'chart.yogas', birth: BIRTH });
    ok('разбор требует входа', rep.status === 401);
  }

  group('Вход через бота');
  let token = null;
  {
    const r = await post('/api/auth/start');
    const { code } = await r.json();
    ok('сайт выдал код из шести знаков', /^[A-Z0-9]{6}$/.test(code));

    const pending = await (await get('/api/auth/poll?code=' + code)).json();
    ok('до подтверждения вход в ожидании', pending.pending === true);

    ok('чужой код не подтверждается', api.confirmCode('ZZZZZZ', 42) === false);
    ok('бот подтверждает настоящий код', api.confirmCode(code, 42) === true);
    ok('повторное подтверждение отвергается', api.confirmCode(code, 42) === false);

    const done = await (await get('/api/auth/poll?code=' + code)).json();
    token = done.token;
    ok('после подтверждения выдаётся токен', !!token && done.userId === 'tg:42');

    const again = await get('/api/auth/poll?code=' + code);
    ok('код одноразовый', again.status === 404);

    const bad = await get('/api/wallet', 'fake-token-0000');
    ok('поддельный токен не работает', bad.status === 401);
  }

  group('Кошелёк и покупки');
  {
    const w = await (await get('/api/wallet', token)).json();
    ok('новый кошелёк пуст', w.balance === 0 && w.plan === 'free');

    const poor = await post('/api/unlock', { feature: 'chart.yogas' }, token);
    const poorBody = await poor.json();
    ok('без бидж разбор не открыть', poor.status === 402 && poorBody.need > 0);

    const badPack = await post('/api/purchase', { pack: 999 }, token);
    ok('несуществующий пакет отвергается', badPack.status === 400);

    const buy = await (await post('/api/purchase', { pack: 5 }, token)).json();
    ok('пакет зачисляется', buy.balance === 5);

    const price = api.ACCESS.FEATURES['chart.yogas'].price;
    const un = await (await post('/api/unlock', { feature: 'chart.yogas' }, token)).json();
    ok('покупка списывает ровно цену', un.ok && un.balance === 5 - price);

    const again = await (await post('/api/unlock', { feature: 'chart.yogas' }, token)).json();
    ok('повторно не списывает', again.already === true && again.balance === 5 - price);

    const w2 = await (await get('/api/wallet', token)).json();
    ok('кошелёк помнит открытое', !!w2.unlocked['chart.yogas']);
  }

  group('Выдача разборов');
  {
    const paid = await post('/api/report', { feature: 'chart.yogas', birth: BIRTH }, token);
    const body = await paid.json();
    ok('оплаченный разбор отдаётся', paid.status === 200 && Array.isArray(body.data.list));
    ok('в разборе есть правила йог',
       body.data.list.length > 0 && body.data.list.every((y) => y.rule && y.meaning));

    const unpaid = await post('/api/report', { feature: 'chart.strength', birth: BIRTH }, token);
    ok('неоплаченный разбор НЕ отдаётся', unpaid.status === 402);

    const noBirth = await post('/api/report', { feature: 'chart.yogas' }, token);
    ok('без данных рождения — ошибка', noBirth.status === 400);

    const junk = await post('/api/report', { feature: 'chart.yogas', birth: { date: 'мусор' } }, token);
    ok('мусор в данных не роняет сервер', junk.status === 400);

    const unknown = await post('/api/report', { feature: 'нет.такого', birth: BIRTH }, token);
    ok('неизвестный разбор отвергается', unknown.status === 400);
  }

  group('Подписка открывает всё');
  {
    const w = api.wallet('tg:42');
    w.plan = api.ACCESS.PLAN.id;
    const r = await post('/api/report', { feature: 'chart.strength', birth: BIRTH }, token);
    const body = await r.json();
    ok('по подписке разбор отдаётся без списаний',
       r.status === 200 && Array.isArray(body.data.list) && body.data.list.length === 9);
    w.plan = 'free';
  }

  group('Устойчивость');
  {
    const r = await fetch(base + '/api/unlock', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
      body: 'это не json'
    });
    ok('битый JSON не роняет сервер', r.status >= 400 && r.status < 600);

    const r2 = await get('/api/no-such-method', token);
    ok('несуществующий метод отдаёт 404', r2.status === 404);

    const alive = await get('/api/wallet', token);
    ok('после всех ошибок сервер жив', alive.status === 200);
  }

  /* ------------------------------------------- западная натальная карта */
  group('Западная карта: пакет открывает шесть разборов');
  {
    const st = await (await post('/api/auth/start', {})).json();
    api.confirmCode(st.code, 9090);
    const { token } = await (await get('/api/auth/poll?code=' + st.code)).json();
    const rep = (feature, system) =>
      post('/api/report', { feature, birth: BIRTH, system }, token);

    const locked = await rep('natal.aspects');
    const lockedBody = await locked.json();
    ok('без оплаты разбор не отдаётся', locked.status === 402);
    ok('и сервер называет пакет, который его откроет', lockedBody.pack === 'natal.full');

    await post('/api/purchase', { pack: 12 }, token);
    const buy = await (await post('/api/unlock', { feature: 'natal.full' }, token)).json();
    ok('пакет покупается', buy.ok === true);
    ok('и списывает свою цену, а не сумму частей', buy.balance === 12 - 9, String(buy.balance));

    const parts = ['natal.houses', 'natal.aspects', 'natal.dignities',
                   'natal.shape', 'natal.transits', 'natal.progress'];
    const results = [];
    for (const f of parts) results.push(await rep(f));
    ok('все шесть разборов открылись пакетом', results.every((r) => r.status === 200),
      results.map((r) => r.status).join(','));

    const asp = await (await rep('natal.aspects')).json();
    ok('разбор аспектов содержит фигуры и подробности',
      Array.isArray(asp.data.patterns) && asp.data.detail.length > 0);
    const dig = await (await rep('natal.dignities')).json();
    ok('достоинства считаются на сервере по семи классическим',
      dig.data.rows.length === 7 && dig.data.almutenAsc.winner);
    const tr = await (await rep('natal.transits')).json();
    ok('транзиты приходят с датами', tr.data.events.every((e) => isFinite(e.jd)));

    ok('чужой разбор пакет не открывает', (await rep('chart.yogas')).status === 402);

    const pl = await (await rep('natal.houses', 'placidus')).json();
    const wh = await (await rep('natal.houses', 'whole')).json();
    const hOf = (b, k) => (b.data.filter((x) => x.key === k)[0] || {}).house;
    ok('система домов берётся из запроса',
      JSON.stringify(pl.data.map((x) => x.house.title)) !==
      JSON.stringify(wh.data.map((x) => x.house.title)));
    ok('и планеты при этом те же', pl.data.length === wh.data.length);

    ok('сам пакет через /api/report не отдаётся',
      (await rep('natal.full')).status === 400);
  }

  api.store.close();
  await new Promise((r) => api.server.close(r));
  try { fs.unlinkSync(process.env.ARUNA_API_DATA); } catch (e) { /* уже нет */ }

  console.log('\nпройдено ' + passed + ', провалено ' + failed);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
