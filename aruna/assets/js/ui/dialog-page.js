/*
 * Аруна · страница диалога
 * ==================================================================
 * Здесь разговор с Дипой. Две дороги, и человек не должен о них думать:
 *
 *   · рядом поднят сервер (есть вход) → вопрос уходит на /api/talk,
 *     отвечает языковая модель, ответ появляется по мере того, как
 *     пишется, а рядом видно, к какому расчёту она обращалась;
 *   · сервера нет (статичный сайт, файл на диске) → отвечает разбор
 *     по правилам из assets/js/jyotish/talk.js. Он тоже опирается на
 *     карту, просто набор ответов у него конечный.
 *
 * Обе дороги ведут к одному: ответ привязан к этой карте, а не к
 * «знаку месяца». Про то, что истолкование пишет модель, на странице
 * сказано прямо — врать об этом было бы и глупо, и незаконно.
 *
 * Пока Дипа обращается к расчёту, человек видит не «печатает…», а что
 * именно сейчас смотрится: «7-я бхава», «транзит на 2027-03-01»,
 * «сарвашта-кавварга». Это и ожидание скрашивает, и держит главное
 * обещание проекта: рядом с выводом видно правило.
 */
(function (root, doc) {
  'use strict';

  var S = root.Aruna, Acc = root.ArunaAccess, D = root.ArunaData, Talk = root.ArunaTalk;

  var HKEY = 'aruna.talk.v2';
  var EXAMPLE = {
    date: '1975-06-15', time: '06:00', timeKnown: true,
    place: { name: 'Москва', lat: 55.7558, lon: 37.6176, tz: 'Europe/Moscow' }
  };

  var state = null;          // контекст карты
  var busy = false;          // один вопрос за раз
  var server = { on: false, price: 1, model: false, why: null, left: null, plan: 'free' };

  /* ------------------------------------------------------- история */

  function loadHistory() {
    try { return JSON.parse(root.localStorage.getItem(HKEY)) || []; } catch (e) { return []; }
  }
  function saveHistory(h) {
    try { root.localStorage.setItem(HKEY, JSON.stringify(h.slice(-24))); } catch (e) { /* инкогнито */ }
  }
  function remember(role, text) {
    var h = loadHistory();
    h.push({ role: role, text: text, at: Date.now() });
    saveHistory(h);
  }

  /* --------------------------------------------------------- вывод */

  function el(html) {
    var d = doc.createElement('div');
    d.innerHTML = html.trim();
    return d.firstElementChild;
  }

  function talkBox() { return doc.getElementById('talk'); }

  function scrollTo(node, toStart) {
    var box = talkBox();
    if (!box) return;
    box.scrollTop = (toStart && node)
      ? Math.max(0, node.offsetTop - box.offsetTop - 10)
      : box.scrollHeight;
  }

  function addMine(text) {
    var node = el('<div class="talk__msg talk__msg--me"><p>' + S.esc(text) + '</p></div>');
    talkBox().appendChild(node);
    scrollTo(node);
    return node;
  }

  /** Пузырь Дипы: заголовок, место под текст, место под след расчёта. */
  function addDipa(badge) {
    var node = el(
      '<div class="talk__msg talk__msg--sa">' +
        '<p class="talk__who">Дипа' +
          (badge ? '<span class="talk__badge">' + S.esc(badge) + '</span>' : '') +
        '</p>' +
        '<div class="talk__work" hidden><span class="talk__pulse"></span><span class="talk__step">смотрит в карту</span></div>' +
        '<div class="talk__body"></div>' +
        '<div class="talk__trail" hidden></div>' +
        '<div class="talk__foot"></div>' +
      '</div>');
    talkBox().appendChild(node);
    scrollTo(node);
    return {
      root: node,
      work: node.querySelector('.talk__work'),
      step: node.querySelector('.talk__step'),
      body: node.querySelector('.talk__body'),
      trail: node.querySelector('.talk__trail'),
      foot: node.querySelector('.talk__foot')
    };
  }

  /** Текст кладём абзацами: модель отдаёт поток, а читается он абзацами. */
  function paint(box, text) {
    var parts = String(text).split(/\n{2,}/);
    var html = '';
    parts.forEach(function (p) {
      p = p.replace(/\n/g, ' ').trim();
      if (p) html += '<p>' + S.esc(p) + '</p>';
    });
    box.innerHTML = html;
  }

  function showWork(ui, label) {
    ui.work.hidden = false;
    ui.step.textContent = label;
  }
  function hideWork(ui) { ui.work.hidden = true; }

  /** След расчёта: к чему Дипа обращалась, пока писала ответ. */
  function addTrail(ui, items) {
    if (!items || !items.length) return;
    ui.trail.hidden = false;
    ui.trail.innerHTML =
      '<details class="trail"><summary>Откуда это: ' + items.length +
        (items.length === 1 ? ' обращение к расчёту' : ' обращения к расчёту') + '</summary>' +
      '<ul>' + items.map(function (t) {
        return '<li><b>' + S.esc(t.title) + '</b>' +
               (t.detail ? ' — ' + S.esc(t.detail) : '') + '</li>';
      }).join('') + '</ul>' +
      '<p class="tiny muted">Дипа истолковывает расчёт, а не придумывает положения: ' +
      'каждая цифра выше посчитана кодом.</p></details>';
  }

  /* ----------------------------------------------- кнопка «развернуть» */

  function deepButton(ui, question) {
    var f = Acc.feature('dialog.deep');
    var bySub = Acc.has('dialog.deep');
    var label = bySub ? 'Развернуть — по подписке' : 'Развернуть за ' + Acc.seeds(f.price);
    var btn = el('<p class="talk__more">' +
      '<button class="btn btn--ghost btn--sm" type="button">' + S.esc(label) + '</button>' +
      '<span class="tiny muted talk__more-why">разбор по бхавам, связь с дашей и стих</span>' +
      '</p>');
    ui.foot.appendChild(btn);
    btn.querySelector('button').addEventListener('click', function () {
      btn.remove();
      ask(question, true);
    });
  }

  /* --------------------------------------------------- разговор: сервер */

  /**
   * Поток событий с сервера. EventSource не годится — он умеет только GET,
   * а вопрос уходит телом POST; поэтому читаем поток руками.
   */
  function talkServer(question, deep, ui) {
    var acc = '', trail = [], finished = false;

    var onEvent = function (name, data) {
      if (name === 'start') {
        showWork(ui, data.model ? 'смотрит в карту' : 'собирает ответ по правилам');
        if (typeof data.balance === 'number') Acc.setBalance(data.balance);
      } else if (name === 'tool') {
        trail.push(data);
        showWork(ui, 'смотрит: ' + data.title);
      } else if (name === 'text') {
        acc += data.t;
        hideWork(ui);
        paint(ui.body, acc);
        scrollTo(ui.root, deep);
      } else if (name === 'done') {
        finished = true;
        hideWork(ui);
        paint(ui.body, acc);
        if (typeof data.balance === 'number') Acc.setBalance(data.balance);
        server.left = data.left;
        addTrail(ui, (data.trail && data.trail.length) ? data.trail : trail);
        if (data.source === 'rules') {
          ui.foot.appendChild(el('<p class="tiny muted">Ответ собран по правилам: ' +
            'языковая модель сейчас недоступна.' +
            (data.refunded ? ' Списанное вернулось — за это платить не нужно.' : '') +
            '</p>'));
        } else if (data.partial) {
          ui.foot.appendChild(el('<p class="tiny muted">Ответ оборвался на середине: ' +
            S.esc(data.error || 'связь с моделью прервалась') + '. Спросите снова.</p>'));
        }
        if (!deep) deepButton(ui, question);
        remember('assistant', acc);
        renderQuota();
      } else if (name === 'error') {
        finished = true;
        hideWork(ui);
        paint(ui.body, acc || ('Не получилось ответить: ' + (data.error || 'сервер молчит') +
          '. Попробуйте ещё раз — списанное вернулось.'));
        if (typeof data.balance === 'number') Acc.setBalance(data.balance);
      }
    };

    var parse = function (chunk) {
      // блоки событий разделены пустой строкой
      chunk.split('\n\n').forEach(function (block) {
        var name = null, data = '';
        block.split('\n').forEach(function (line) {
          if (line.indexOf('event: ') === 0) name = line.slice(7).trim();
          else if (line.indexOf('data: ') === 0) data += line.slice(6);
        });
        if (!name) return;
        try { onEvent(name, data ? JSON.parse(data) : {}); } catch (e) { /* битый блок пропускаем */ }
      });
    };

    return Acc.apiFetch('/api/talk', {
      method: 'POST',
      body: JSON.stringify({ birth: state.birth, question: question, deep: deep })
    }).then(function (res) {
      if (res.status === 402) {
        return res.json().then(function (b) {
          ui.root.remove();
          S.Paywall.open('dialog.deep', function () { ask(question, true); });
          return { paywall: true, body: b };
        });
      }
      if (res.status === 429) {
        return res.json().then(function (b) {
          hideWork(ui);
          paint(ui.body, b.error || 'На сегодня предел ответов.');
          return { limited: true };
        });
      }
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (b) {
          hideWork(ui);
          paint(ui.body, 'Сервер отказал: ' + (b.error || res.status) + '.');
          return { failed: true };
        });
      }
      if (!res.body || !res.body.getReader) {
        // поток не поддерживается — читаем целиком, ответ появится разом
        return res.text().then(function (t) { parse(t); return {}; });
      }
      var reader = res.body.getReader(), dec = new TextDecoder(), buf = '';
      var pump = function () {
        return reader.read().then(function (r) {
          if (r.done) {
            if (buf.trim()) parse(buf);
            if (!finished) { hideWork(ui); paint(ui.body, acc); }
            return {};
          }
          buf += dec.decode(r.value, { stream: true });
          // отдаём готовые блоки, недописанный остаток держим в буфере
          var cut = buf.lastIndexOf('\n\n');
          if (cut >= 0) {
            parse(buf.slice(0, cut));
            buf = buf.slice(cut + 2);
          }
          return pump();
        });
      };
      return pump();
    });
  }

  /* --------------------------------------------------- разговор: правила */

  function talkLocal(question, deep, ui) {
    if (deep && !Acc.has('dialog.deep')) {
      var r = Acc.ADAPTER.localUnlock('dialog.deep');
      if (!r || !r.ok) {
        ui.root.remove();
        S.Paywall.open('dialog.deep', function () { ask(question, true); });
        return Promise.resolve();
      }
    }
    return new Promise(function (done) {
      showWork(ui, 'смотрит в карту');
      // небольшая пауза не для вида: без неё ответ появляется раньше,
      // чем человек успевает увидеть свою же реплику
      root.setTimeout(function () {
        var a = Talk.rulesAnswer(state, question, deep);
        var parts = a.paragraphs.slice();
        hideWork(ui);
        paint(ui.body, parts.join('\n\n'));
        if (a.verse) {
          ui.body.appendChild(el('<p class="talk__verse">' + S.esc(a.verse.ru) +
            '<br><span class="tiny muted">' + S.esc(a.verse.src + ' ' + a.verse.ref) +
            '</span></p>'));
        }
        addTrail(ui, a.trail);
        if (!deep) deepButton(ui, question);
        remember('assistant', parts.join('\n\n'));
        scrollTo(ui.root, deep);
        renderQuota();
        done();
      }, 420);
    });
  }

  /* ------------------------------------------------------------ спросить */

  function ask(question, deep) {
    if (!state || busy) return;
    question = String(question || '').trim();
    if (!question) return;

    busy = true;
    setComposer(false, 'Дипа отвечает…');
    if (!deep) { addMine(question); remember('user', question); }

    var badge = deep ? 'разбор' : null;
    var ui = addDipa(badge);
    var run = (server.on ? talkServer : talkLocal)(question, deep, ui);
    run.catch(function (e) {
      hideWork(ui);
      paint(ui.body, 'Связь прервалась: ' + (e && e.message ? e.message : 'неизвестно') +
        '. Вопрос никуда не делся — спросите снова.');
    }).then(function () {
      busy = false;
      setComposer(true);
    });
  }

  /* ------------------------------------------------------------ композер */

  function setComposer(on, label) {
    var field = doc.getElementById('askField'), btn = doc.getElementById('askBtn');
    if (!field) return;
    field.disabled = !on;
    btn.disabled = !on;
    btn.textContent = label || 'Спросить';
    if (on) field.focus();
  }

  function grow(field) {
    field.style.height = 'auto';
    field.style.height = Math.min(160, field.scrollHeight) + 'px';
  }

  function renderQuota() {
    var n = doc.getElementById('quotaLine');
    if (!n) return;
    var bits = [];
    if (server.on && server.left != null) {
      bits.push('ответов сегодня осталось ' + server.left);
    }
    if (Acc.has('dialog.deep')) bits.push('разборы по подписке');
    else bits.push('развёрнутый ответ — ' + Acc.seeds(Acc.feature('dialog.deep').price) +
                   ', в кошельке ' + Acc.seeds(Acc.balance()));
    n.textContent = bits.join(' · ');
  }

  /* -------------------------------------------------------------- панели */

  function renderWho(ctx) {
    var built = { utcMs: ctx.utcMs };
    var rows = [
      ['Лагна', ctx.chart.asc.rashiName + ' ' + ctx.chart.asc.dms],
      ['Луна', ctx.chart.grahas.moon.rashiName + ' · ' +
               D.NAKSHATRAS[ctx.chart.moonNakshatra].sa],
      ['Даша', ctx.dasha
        ? D.GRAHAS[ctx.dasha.maha.lord].sa + ' / ' + D.GRAHAS[ctx.dasha.antar.lord].sa
        : '—'],
      ['Рождение', S.dateRu(built.utcMs, ctx.tz).replace(/\s*г\.$/, '') + ', ' + ctx.birth.place.name]
    ];
    doc.getElementById('whoRows').innerHTML = rows.map(function (r) {
      return '<dt>' + S.esc(r[0]) + '</dt><dd>' + S.esc(r[1]) + '</dd>';
    }).join('');
    doc.getElementById('skyLine').textContent =
      (ctx.pan.vara ? ctx.pan.vara.sa + ' · ' : '') + ctx.pan.tithi.name + ' · накшатра ' +
      ctx.pan.nakshatra.name;
  }

  function renderStarters() {
    var box = doc.getElementById('prompts');
    if (!box) return;
    box.innerHTML = Talk.STARTERS.map(function (q) {
      return '<button class="prompt-btn" type="button">' + S.esc(q) + '</button>';
    }).join('');
  }

  /** Честная строка о том, чем отвечает Дипа прямо сейчас. */
  function renderMode() {
    var n = doc.getElementById('modeNote');
    if (!n) return;
    if (server.on && server.model) {
      n.innerHTML = 'Расчёт — карта, периоды, транзиты, стихи — считается кодом; ' +
        'эфемерида сверена с независимой. Истолкование пишет языковая модель, и ей ' +
        'запрещено называть положения, которых нет в расчёте: за каждым ответом ' +
        'виден след — к чему она обращалась. Мы говорим это прямо, потому что ' +
        'проверяемость здесь важнее впечатления.';
    } else if (server.on && !server.model) {
      n.innerHTML = 'Языковая модель сейчас не отвечает (' + S.esc(server.why || 'нет ключа') +
        '), поэтому ответы собираются из вашей карты по правилам: бхава вопроса, её хозяин, ' +
        'идущая даша, небо дня.';
    } else {
      n.innerHTML = 'Это витрина без сервера: ответы собираются из вашей карты по правилам — ' +
        'бхава вопроса, её хозяин, идущая даша, небо дня. Поэтому они разные у разных людей, ' +
        'но набор их конечен. С сервером на этом месте отвечает наставник с языковой моделью, ' +
        'памятью беседы и обращением к расчёту.';
    }
  }

  /* ----------------------------------------------------------- приветствие */

  function greeting(ctx) {
    var h = loadHistory();
    var last = null;
    for (var i = h.length - 1; i >= 0; i--) if (h[i].role === 'user') { last = h[i]; break; }
    var lines = [
      'Здравствуйте. Я вижу вашу карту: лагна — ' + ctx.chart.asc.rashiName + ', Луна — ' +
      ctx.chart.grahas.moon.rashiName + ', накшатра ' +
      D.NAKSHATRAS[ctx.chart.moonNakshatra].sa + '. ' + Talk.moonSentence(ctx)
    ];
    if (last) {
      lines.push('В прошлый раз, ' + S.dateRu(last.at, ctx.tz, { day: 'numeric', month: 'long' }) +
        ', вы спрашивали: «' + last.text + '» Если это ещё живо — вернёмся к нему. Если ' +
        'отпустило, тоже скажите.');
    } else {
      lines.push('Спрашивайте своими словами о том, что сейчас занимает. Я буду отвечать, ' +
        'глядя на вашу карту, а не вообще.');
    }
    var ui = addDipa('видит вашу карту');
    paint(ui.body, lines.join('\n\n'));
  }

  /* ---------------------------------------------------------------- запуск */

  function boot(birth) {
    state = Talk.context(birth);
    renderWho(state);
    talkBox().innerHTML = '';
    greeting(state);
    renderStarters();
    renderMode();
    renderQuota();
    setComposer(true);
  }

  function noChart() {
    talkBox().innerHTML = '';
    var ui = addDipa(null);
    paint(ui.body, 'Чтобы говорить не вообще, а о вас, мне нужна ваша карта: дата, время и ' +
      'место рождения. Это займёт полминуты.');
    ui.foot.appendChild(el('<p><a class="btn btn--gold btn--sm" href="chart.html">' +
      'Построить карту</a></p>'));
    var p = doc.getElementById('prompts');
    if (p) p.innerHTML = '';
    setComposer(false);
    renderMode();
  }

  /** Состояние разговора с сервера: доступна ли модель, сколько осталось. */
  function syncServer() {
    if (!Acc.isServerMode() || !root.fetch) return Promise.resolve();
    server.on = true;
    return Acc.apiFetch('/api/talk/state').then(function (r) {
      if (!r.ok) { server.on = false; return null; }
      return r.json();
    }).then(function (b) {
      if (!b) { server.on = false; renderMode(); return; }
      server.model = !!b.model;
      server.why = b.why;
      server.left = b.free ? b.free.left : null;
      server.price = b.price;
      server.plan = b.plan;
      if (typeof b.balance === 'number') Acc.setBalance(b.balance);
      // сервер помнит беседу — подхватываем её как свою
      if (b.turns && b.turns.length) saveHistory(b.turns);
      renderMode();
      renderQuota();
    }).catch(function () { server.on = false; renderMode(); });
  }

  function forget() {
    saveHistory([]);
    var after = function () {
      if (state) { talkBox().innerHTML = ''; greeting(state); }
    };
    if (server.on) {
      Acc.apiFetch('/api/talk/forget', { method: 'POST' }).then(after).catch(after);
    } else after();
  }

  function start() {
    var box = talkBox();
    if (!box) return;

    var saved = S.loadBirth();
    if (saved) { try { boot(saved); } catch (e) { noChart(); } } else noChart();
    syncServer();

    var prompts = doc.getElementById('prompts');
    if (prompts) {
      prompts.addEventListener('click', function (e) {
        var b = e.target.closest('.prompt-btn');
        if (b) ask(b.textContent, false);
      });
    }

    var form = doc.getElementById('askForm');
    var field = doc.getElementById('askField');
    if (form && field) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var q = field.value.trim();
        if (!q) return;
        field.value = '';
        grow(field);
        ask(q, false);
      });
      field.addEventListener('input', function () { grow(field); });
      field.addEventListener('keydown', function (e) {
        // Enter отправляет, Shift+Enter — новая строка: так ведут себя мессенджеры
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          form.dispatchEvent(new Event('submit', { cancelable: true }));
        }
      });
    }

    var ex = doc.getElementById('exampleBtn');
    if (ex) ex.addEventListener('click', function () { S.saveBirth(EXAMPLE); boot(EXAMPLE); });
    var cl = doc.getElementById('clearBtn');
    if (cl) cl.addEventListener('click', forget);

    Acc.onChange(renderQuota);
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
  else start();
})(typeof globalThis !== 'undefined' ? globalThis : this, document);
