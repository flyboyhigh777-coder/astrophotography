#!/usr/bin/env node
/*
 * Аруна · сервер сайта и API
 * ------------------------------------------------------------------
 * Зачем он нужен. Пока проверка оплаты живёт в браузере, любой платный
 * разбор открывается правкой страницы — для витрины это нормально, для
 * денег нет. Этот сервер закрывает дыру: полные разборы считаются здесь
 * и отдаются только после проверки покупки.
 *
 * Вход — через телеграм-бота, без почты и паролей: сайт показывает код,
 * человек отправляет его боту, сервер связывает их. Меньше кода, меньше
 * способов потерять доступ и никакой возни с SMTP.
 *
 * Запуск:
 *     node server/api.js            (порт 8080)
 *     PORT=3000 node server/api.js
 *
 * Зависимостей нет.
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { Store } = require('./lib/store.js');
const J = require('./lib/jyotish.js');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 8080);
const DATA = process.env.ARUNA_API_DATA || path.join(__dirname, 'data', 'api.json');

const store = new Store(DATA);
if (!store.data.sessions) store.data.sessions = {};
if (!store.data.codes) store.data.codes = {};
if (!store.data.wallets) store.data.wallets = {};

/* --------------------------------------------------------------- деньги */

// Цены живут в том же файле, что и на сайте: одна правда для витрины и API.
const ACCESS = (() => {
  const vm = require('node:vm');
  const sandbox = { localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(
    fs.readFileSync(path.join(ROOT, 'assets', 'js', 'core', 'access.js'), 'utf8'),
    sandbox, { filename: 'access.js' });
  return sandbox.ArunaAccess;
})();

function wallet(userId) {
  if (!store.data.wallets[userId]) {
    store.data.wallets[userId] = { balance: 0, plan: 'free', unlocked: {}, spent: 0 };
    store.dirty = true;
  }
  return store.data.wallets[userId];
}

/* --------------------------------------------------------------- сессии */

function newToken() { return crypto.randomBytes(24).toString('base64url'); }

function newCode() {
  // без похожих друг на друга символов: ноль и буква O не перепутаются
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += abc[crypto.randomInt(abc.length)];
  return out;
}

function sessionOf(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  const s = store.data.sessions[token];
  if (!s) return null;
  if (Date.now() - s.createdAt > 180 * 24 * 3600 * 1000) {
    delete store.data.sessions[token];
    store.dirty = true;
    return null;
  }
  s.lastSeen = Date.now();
  store.dirty = true;
  return s;
}

/** Чистка просроченных кодов входа — раз в минуту, без таймеров-долгожителей. */
function sweepCodes() {
  const now = Date.now();
  for (const code of Object.keys(store.data.codes)) {
    if (now - store.data.codes[code].createdAt > 10 * 60 * 1000) {
      delete store.data.codes[code];
      store.dirty = true;
    }
  }
}

/* ------------------------------------------------- вызывается из бота */

/**
 * Бот вызывает это, когда человек присылает ему код со страницы входа.
 * @returns {boolean} удалось ли связать
 */
function confirmCode(code, chatId) {
  sweepCodes();
  const rec = store.data.codes[String(code).toUpperCase()];
  if (!rec || rec.confirmed) return false;
  rec.confirmed = true;
  rec.userId = 'tg:' + chatId;
  rec.token = newToken();
  store.data.sessions[rec.token] = {
    userId: rec.userId, createdAt: Date.now(), lastSeen: Date.now()
  };
  wallet(rec.userId);
  store.dirty = true;
  return true;
}

/* ------------------------------------------------------------- разборы */

const REPORTS = {
  'chart.yogas': (chart) => J.Yogas.findAll(chart),
  'chart.strength': (chart) => J.Strength.all(chart),
  'chart.varga': (chart) => ({
    summary: J.Varga.summary(chart),
    vargottama: J.Varga.vargottama(chart),
    charts: J.Varga.ORDER.filter((c) => c !== 'D1' && c !== 'D9')
      .map((c) => J.Varga.buildVarga(chart, c))
  }),
  'chart.forecast': (chart) => J.Forecast.yearAhead(chart, J.Tz.msToJd(Date.now()), 12),
  'chart.sav': (chart) => J.Sarvashtaka.sarva(chart),
  'compat.full': null,        // считается из двух карт, обрабатывается отдельно
  'muhurta.pick': null,
  'rectify.run': null,
  'dialog.deep': null
};

/* ------------------------------------------------------------ маршруты */

function json(res, code, body) {
  const data = JSON.stringify(body);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(data),
    'cache-control': 'no-store'
  });
  res.end(data);
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('слишком большой запрос')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch (e) { reject(new Error('тело запроса не JSON')); }
    });
    req.on('error', reject);
  });
}

async function api(req, res, url) {
  const route = url.pathname.slice(5);           // после /api/

  /* ---- вход через бота ---- */
  if (route === 'auth/start' && req.method === 'POST') {
    sweepCodes();
    const code = newCode();
    store.data.codes[code] = { createdAt: Date.now(), confirmed: false };
    store.dirty = true;
    return json(res, 200, { code, hint: 'Отправьте боту: /login ' + code });
  }

  if (route === 'auth/poll' && req.method === 'GET') {
    const code = String(url.searchParams.get('code') || '').toUpperCase();
    const rec = store.data.codes[code];
    if (!rec) return json(res, 404, { error: 'код не найден или устарел' });
    if (!rec.confirmed) return json(res, 200, { pending: true });
    delete store.data.codes[code];
    store.dirty = true;
    return json(res, 200, { token: rec.token, userId: rec.userId });
  }

  /* ---- всё остальное требует сессии ---- */
  const session = sessionOf(req);
  if (!session) return json(res, 401, { error: 'нужен вход' });
  const w = wallet(session.userId);

  if (route === 'wallet' && req.method === 'GET') {
    return json(res, 200, {
      balance: w.balance, plan: w.plan, unlocked: w.unlocked, demo: ACCESS.DEMO
    });
  }

  if (route === 'purchase' && req.method === 'POST') {
    const body = await readBody(req);
    const pack = ACCESS.PACKS.filter((p) => p.seeds === Number(body.pack))[0];
    if (!pack) return json(res, 400, { error: 'нет такого пакета' });
    if (!ACCESS.DEMO) {
      // Здесь будет создание платежа у провайдера и ожидание webhook.
      return json(res, 501, { error: 'приём оплаты ещё не подключён' });
    }
    w.balance += pack.seeds;
    store.dirty = true;
    return json(res, 200, { balance: w.balance, demo: true });
  }

  if (route === 'unlock' && req.method === 'POST') {
    const body = await readBody(req);
    const f = ACCESS.FEATURES[body.feature];
    if (!f) return json(res, 400, { error: 'нет такого разбора' });
    if (w.plan === ACCESS.PLAN.id || w.unlocked[body.feature]) {
      return json(res, 200, { ok: true, already: true, balance: w.balance });
    }
    if (w.balance < f.price) {
      return json(res, 402, { error: 'не хватает бидж', need: f.price - w.balance });
    }
    w.balance -= f.price;
    w.spent += f.price;
    w.unlocked[body.feature] = Date.now();
    store.dirty = true;
    return json(res, 200, { ok: true, balance: w.balance });
  }

  if (route === 'report' && req.method === 'POST') {
    const body = await readBody(req);
    const feature = body.feature;
    const build = REPORTS[feature];
    if (!build) return json(res, 400, { error: 'этот разбор через API пока не отдаётся' });
    const allowed = w.plan === ACCESS.PLAN.id || !!w.unlocked[feature];
    if (!allowed) return json(res, 402, { error: 'разбор не оплачен' });
    if (!body.birth || !body.birth.date || !body.birth.place) {
      return json(res, 400, { error: 'нужны данные рождения' });
    }
    try {
      const { chart } = J.chartFromBirth(body.birth);
      return json(res, 200, { feature, data: build(chart) });
    } catch (e) {
      return json(res, 400, { error: 'не удалось посчитать: ' + e.message });
    }
  }

  return json(res, 404, { error: 'нет такого метода' });
}

/* ------------------------------------------------------- статика сайта */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8'
};

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';

  // защита от выхода за корень: нормализуем и проверяем результат
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT + path.sep) && file !== ROOT) {
    res.writeHead(403); res.end('403'); return;
  }
  // сервер и данные наружу не отдаём
  if (file.startsWith(path.join(ROOT, 'server'))) {
    res.writeHead(404); res.end('404'); return;
  }

  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end('Не найдено'); return; }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'content-length': st.size,
      'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
      'x-content-type-options': 'nosniff'
    });
    fs.createReadStream(file).pipe(res);
  });
}

/* --------------------------------------------------------------- сервер */

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  if (url.pathname.startsWith('/api/')) {
    api(req, res, url).catch((e) => json(res, 500, { error: e.message }));
    return;
  }
  serveStatic(req, res, url);
});

function start() {
  server.listen(PORT, () => {
    console.log('Аруна · сайт и API на http://127.0.0.1:' + PORT);
    console.log('Данные: ' + DATA);
    console.log(ACCESS.DEMO
      ? 'Режим демонстрации: биджи начисляются бесплатно (ACCESS.DEMO = true в assets/js/core/access.js).'
      : 'Боевой режим: пополнение отдаёт 501, пока не подключён платёжный провайдер.');
  });
  const stop = () => { store.close(); server.close(() => process.exit(0)); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

if (require.main === module) start();

module.exports = { server, store, confirmCode, wallet, ACCESS, start, PORT };
