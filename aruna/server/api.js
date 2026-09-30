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
const Dipa = require('./lib/dipa.js');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 8080);
const DATA = process.env.ARUNA_API_DATA || path.join(__dirname, 'data', 'api.json');

const store = new Store(DATA);
if (!store.data.sessions) store.data.sessions = {};
if (!store.data.codes) store.data.codes = {};
if (!store.data.wallets) store.data.wallets = {};
if (!store.data.talks) store.data.talks = {};

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

/* --------------------------------------------------------- разговоры */

/**
 * Беседа с Дипой. Хранится только сама переписка и заметка наставника —
 * данные рождения на сервер не переезжают: их присылает страница на каждый
 * запрос и мы их не записываем. Это то же обещание, что на страницах.
 */
function talkOf(userId) {
  if (!store.data.talks[userId]) {
    store.data.talks[userId] = { turns: [], note: null, updatedAt: Date.now() };
    store.dirty = true;
  }
  const t = store.data.talks[userId];
  if (!Array.isArray(t.turns)) t.turns = [];
  return t;
}

/** Сколько ответов человек уже получил сегодня. Лимит — от перерасхода. */
function talkQuota(w, kind) {
  const day = new Date().toISOString().slice(0, 10);
  if (!w.talk || w.talk.day !== day) w.talk = { day: day, free: 0, deep: 0 };
  const cfg = Dipa.config();
  const limit = kind === 'deep' ? cfg.deepPerDay : cfg.freePerDay;
  // по подписке короткие ответы тоже не бесконечны, но предел заметно выше
  const mine = w.plan === ACCESS.PLAN.id ? limit * 3 : limit;
  return { used: w.talk[kind] || 0, limit: mine, left: Math.max(0, mine - (w.talk[kind] || 0)) };
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
  'dialog.deep': null,        // считается в /api/talk, там же и оплата

  /* --- западная натальная карта ---
     Тем же способом, что и джйотиш: разбор считается здесь и уходит
     только после проверки оплаты. Система домов приходит из запроса —
     их семь, и выбор за человеком. */
  'natal.houses': (chart) => J.NatalData.PLANET_ORDER
    .filter((k) => chart.planets[k] && chart.planets[k].house)
    .map((k) => ({
      key: k,
      sign: J.Interpret.planetInSign(chart, k),
      house: J.Interpret.planetInHouse(chart, k)
    })),
  'natal.aspects': (chart) => {
    const a = J.NatalAspects.findAll(chart);
    return {
      patterns: a.patterns,
      detail: a.list.slice(0, 14).map((x) => J.Interpret.aspect(chart, x)),
      counts: a.counts
    };
  },
  'natal.dignities': (chart) => {
    const d = J.Dignities.all(chart);
    return {
      rows: d.rows.map((r) => Object.assign({}, r, { line: J.Interpret.dignityLine(r) })),
      almutenAsc: d.almutenAsc, peregrines: d.peregrines, note: d.note
    };
  },
  'natal.shape': (chart) => ({
    pattern: J.Shape.pattern(chart),
    singletons: J.Shape.singletons(chart),
    dispositor: J.Shape.finalDispositor(chart)
  }),
  'natal.transits': (chart) => J.Transits.ahead(chart, J.Tz.msToJd(Date.now()), 12),
  'natal.progress': (chart) => ({
    now: J.Transits.progressed(chart, J.Tz.msToJd(Date.now())),
    nextMoonSign: J.Transits.nextProgressedMoonSign(chart, J.Tz.msToJd(Date.now()))
  }),
  'natal.full': null          // пакет: открывает шесть разборов выше, сам не считается
};

/** Разборы западной карты считаются из другой карты, чем джйотишные. */
const NATAL = /^natal\./;

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

/**
 * Поток событий (SSE). Нужен ровно для одного: чтобы ответ Дипы появлялся
 * по мере того, как пишется, а не падал готовым куском через полминуты.
 * Ничего лишнего: три вида событий и закрытие.
 */
function sse(req, res) {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    connection: 'keep-alive',
    // nginx иначе буферизует поток и весь смысл теряется
    'x-accel-buffering': 'no'
  });
  let closed = false;
  req.on('close', () => { closed = true; });
  return {
    send(event, data) {
      if (closed || res.writableEnded) return false;
      res.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n');
      return true;
    },
    get closed() { return closed; },
    end() { if (!res.writableEnded) res.end(); }
  };
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
    if (f.perUse) {
      // Разовые разборы оплачиваются там, где делается работа (см. /api/talk):
      // «открыть навсегда» их нельзя, и списывать заранее незачем.
      return json(res, 400, {
        error: 'этот разбор платится за каждый раз, отдельная покупка не нужна',
        perUse: true, price: f.price
      });
    }
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

  /* ---- разговор с Дипой ---- */

  if (route === 'talk/state' && req.method === 'GET') {
    const t = talkOf(session.userId);
    return json(res, 200, {
      turns: t.turns.slice(-24).map((x) => ({ role: x.role, text: x.text, at: x.at })),
      model: Dipa.available(),
      why: Dipa.available() ? null : Dipa.whyUnavailable(),
      free: talkQuota(w, 'free'),
      deep: talkQuota(w, 'deep'),
      price: ACCESS.FEATURES['dialog.deep'].price,
      balance: w.balance,
      plan: w.plan
    });
  }

  if (route === 'talk/forget' && req.method === 'POST') {
    // «Забудьте» должно забывать по-настоящему: и реплики, и заметку.
    store.data.talks[session.userId] = { turns: [], note: null, updatedAt: Date.now() };
    store.dirty = true;
    return json(res, 200, { ok: true });
  }

  if (route === 'talk' && req.method === 'POST') {
    const body = await readBody(req);
    const question = String(body.question || '').trim();
    const deep = !!body.deep;
    if (!question) return json(res, 400, { error: 'вопрос пустой' });
    if (question.length > Dipa.config().maxQuestion) {
      return json(res, 400, { error: 'вопрос длиннее ' + Dipa.config().maxQuestion + ' символов' });
    }
    if (!body.birth || !body.birth.date || !body.birth.place) {
      return json(res, 400, { error: 'нужны данные рождения' });
    }

    const quota = talkQuota(w, deep ? 'deep' : 'free');
    if (quota.left <= 0) {
      return json(res, 429, {
        error: 'на сегодня предел: ' + quota.limit + ' ответов. Это защита от перерасхода, ' +
               'а не наказание — вернитесь завтра.'
      });
    }

    // Развёрнутый ответ платится за каждый раз. Списываем до ответа, чтобы
    // нельзя было получить его и не заплатить; если ответа не вышло —
    // возвращаем (см. refund ниже).
    const price = ACCESS.FEATURES['dialog.deep'].price;
    const bySub = w.plan === ACCESS.PLAN.id;
    let charged = 0;
    if (deep && !bySub) {
      if (w.balance < price) {
        return json(res, 402, { error: 'развёрнутый ответ стоит ' + price + ' биджу',
                                need: price - w.balance, feature: 'dialog.deep' });
      }
      w.balance -= price;
      w.spent = (w.spent || 0) + price;
      charged = price;
      store.dirty = true;
    }

    const talk = talkOf(session.userId);
    const stream = sse(req, res);
    let out = '';

    stream.send('start', {
      deep: deep, model: Dipa.available(), balance: w.balance,
      left: quota.left - 1, charged: charged
    });

    try {
      const r = await Dipa.answer({
        birth: body.birth,
        question: question,
        deep: deep,
        history: talk.turns.slice(-Dipa.config().historyTurns * 2),
        note: talk.note,
        onText: (chunk) => { out += chunk; stream.send('text', { t: chunk }); },
        onTool: (t) => stream.send('tool', t)
      });

      // поток мог не открыться (модели нет) — тогда текст ушёл разом
      if (!out && r.text) stream.send('text', { t: r.text });

      // Заплатили за разбор наставника, а ответили правила — значит, человек
      // получил то, что и так бесплатно. Возвращаем: списывать за подмену
      // нельзя, даже если ответ сам по себе неплохой.
      let refunded = 0;
      if (charged && r.source !== 'model') {
        w.balance += charged;
        w.spent -= charged;
        refunded = charged;
        charged = 0;
        store.dirty = true;
      }

      w.talk[deep ? 'deep' : 'free'] = (w.talk[deep ? 'deep' : 'free'] || 0) + 1;
      talk.turns.push({ role: 'user', text: question, at: Date.now() });
      talk.turns.push({ role: 'assistant', text: r.text, at: Date.now(), deep: deep });
      if (talk.turns.length > 40) talk.turns = talk.turns.slice(-40);
      talk.updatedAt = Date.now();
      store.dirty = true;

      stream.send('done', {
        source: r.source, trail: r.trail || [], facts: r.facts || null,
        balance: w.balance, error: r.error || null, partial: !!r.partial,
        refunded: refunded, charged: charged,
        left: talkQuota(w, deep ? 'deep' : 'free').left
      });
      stream.end();

      // Заметку наставник переписывает после ответа, уже не задерживая человека.
      if (Dipa.available() && talk.turns.length >= 4 && talk.turns.length % 6 === 0) {
        Dipa.updateNote({ history: talk.turns, note: talk.note }).then((note) => {
          if (note) { talk.note = note; talk.updatedAt = Date.now(); store.dirty = true; }
        }).catch(() => {});
      }
      return;
    } catch (e) {
      // Ответа не вышло — деньги возвращаем. Иначе это просто обман.
      if (charged) { w.balance += charged; w.spent -= charged; store.dirty = true; }
      stream.send('error', { error: e.message, balance: w.balance });
      stream.end();
      return;
    }
  }

  if (route === 'report' && req.method === 'POST') {
    const body = await readBody(req);
    const feature = body.feature;
    const build = REPORTS[feature];
    if (!build) return json(res, 400, { error: 'этот разбор через API пока не отдаётся' });
    const parent = ACCESS.partOf ? ACCESS.partOf(feature) : null;
    const allowed = w.plan === ACCESS.PLAN.id || !!w.unlocked[feature] ||
                    (parent && !!w.unlocked[parent]);
    if (!allowed) return json(res, 402, { error: 'разбор не оплачен', feature, pack: parent });
    if (!body.birth || !body.birth.date || !body.birth.place) {
      return json(res, 400, { error: 'нужны данные рождения' });
    }
    try {
      const chart = NATAL.test(feature)
        ? J.Natal.build(body.birth, body.system || 'placidus')
        : J.chartFromBirth(body.birth).chart;
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
  '.md': 'text/markdown; charset=utf-8',
  // без этого типа браузер манифест не примет и установку не предложит
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp'
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
