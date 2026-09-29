/*
 * Аруна · доступ, кошелёк и платные разборы
 * ------------------------------------------------------------------
 * Граница проходит не по «сколько дать бесплатно», а по природе работы:
 *
 *   бесплатно — всё, что СЧИТАЕТСЯ: карта, панчанга, мухурта дня,
 *               транзиты, даша, сумма по восьми кутам;
 *   за биджи  — всё, что РАЗБИРАЕТСЯ: йоги, сила грах, полный парный
 *               отчёт, год вперёд, подбор времени под задачу.
 *
 * Так честнее: цифры, которые машина выдаёт мгновенно, не должны стоить
 * денег, а долгий разбор — это уже продукт.
 *
 * Приём оплаты пока не подключён. Весь модуль написан так, чтобы это
 * была одна точка замены: ADAPTER. Сейчас там локальная заглушка
 * (localStorage + демонстрационный баланс), потом на её место встаёт
 * реальный бэкенд — остальной код не меняется.
 */
(function (root) {
  'use strict';

  /** Пока true — баланс демонстрационный, списания ничего не стоят. */
  var DEMO = true;

  var KEY = 'aruna.wallet.v1';

  /* --------------------------------------------------------- валюта */
  var CURRENCY = {
    one: 'биджа', few: 'биджи', many: 'бидж',
    about: 'биджа — семя: одно семя открывает один разбор и остаётся у вас навсегда'
  };

  /** «1 биджа», «3 биджи», «7 бидж». */
  function plural(n) {
    var a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return CURRENCY.many;
    if (b > 1 && b < 5) return CURRENCY.few;
    if (b === 1) return CURRENCY.one;
    return CURRENCY.many;
  }
  function seeds(n) { return n + ' ' + plural(n); }

  /* -------------------------------------------------------- пакеты */
  var PACKS = [
    { seeds: 1,  price: 149,  save: 0 },
    { seeds: 5,  price: 690,  save: 7 },
    { seeds: 12, price: 1490, save: 17 },
    { seeds: 30, price: 3290, save: 26 }
  ];

  var PLAN = {
    id: 'sadhana', title: 'Садхана',
    month: 590, year: 4900,
    about: 'Все разборы без счёта, неограниченный диалог, карты близких в одном аккаунте.'
  };

  /* ------------------------------------------------------- разборы */
  // price — в биджах; free — то, что остаётся открытым рядом с замком,
  // чтобы человек видел, за что платит, а не покупал кота в мешке.
  var FEATURES = {
    'chart.yogas': {
      title: 'Йоги карты',
      price: 3,
      about: 'Классические сочетания: панча-махапуруша, гаджакесари, раджа- и дхана-йоги, ' +
             'випарита, кемадрума и другие — с указанием правила, по которому каждая найдена.',
      free: 'Сколько йог найдено и какие из них сильные — видно и так.'
    },
    'chart.strength': {
      title: 'Сила грах',
      price: 2,
      about: 'Дигбала, достоинство в раши, сожжение, движение и участие в бхавах — ' +
             'сведённые в один индекс с расшифровкой каждой составляющей.',
      free: 'Достоинство каждой грахи показано в таблице бесплатно.'
    },
    'chart.varga': {
      title: 'Варги и вимшопака',
      price: 3,
      about: 'Восемь дробных карт — хора, дреккана, саптамша, дашамша, двадашамша, ' +
             'тримшамша — и вимшопака-бала по шадварге: насколько прочно каждая граха ' +
             'держится не только в раши, но и в глубине.',
      free: 'Навамша (D9) — вторая по важности карта — открыта бесплатно.'
    },
    'chart.sav': {
      title: 'Сарвашта-кавварга',
      price: 2,
      about: 'Очки бинду по каждому раши: где у вашей карты запас прочности, а где ' +
             'тонко — и сколько бинду в тех раши, куда сейчас пришли Шани и Гуру.',
      free: 'Сумма всегда 337 — это свойство самих таблиц; первые строки видны и так.'
    },
    'chart.forecast': {
      title: 'Год вперёд',
      price: 3,
      about: 'Смены даш на ближайшие 12 месяцев, переходы Гуру и Шани по вашим бхавам, ' +
             'начало и конец саде-сати — с датами.',
      free: 'Действующая даша и сегодняшние транзиты открыты всегда.'
    },
    'compat.full': {
      title: 'Полный парный отчёт',
      price: 5,
      about: 'Разбор каждой куты, доши и правила их снятия, раджу, махендра и стри-диргха, ' +
             'сильные стороны союза и что делать с зонами напряжения.',
      free: 'Сумма по 36 гунам и очки всех восьми кут считаются бесплатно.'
    },
    'muhurta.pick': {
      title: 'Подбор времени',
      price: 1,
      about: 'Разбор выбранной даты по часам: где благоприятные окна под вашу задачу, ' +
             'а какие часы традиция советует переждать.',
      free: 'Мухурта сегодняшнего дня показана бесплатно на странице карты.'
    },
    'rectify.run': {
      title: 'Подсказка по времени рождения',
      price: 8,
      about: 'Перебор времени по минутам и проверка каждого варианта на согласие ' +
             'с вашими событиями: какая лагна ложится на вашу жизнь лучше остальных ' +
             'и почему — с разбором по каждому событию.',
      free: 'Без точного времени карта всё равно строится: раши и накшатры почти не сдвинутся.'
    },
    'dialog.deep': {
      title: 'Развёрнутый ответ',
      price: 1,
      /*
       * Единственный разбор с оплатой за каждый раз, а не навсегда. Причина
       * прямая: остальные разборы — это расчёт, он одинаков и его честно
       * открыть однажды. Развёрнутый ответ Дипы каждый раз пишется заново,
       * с обращением к расчёту, и каждый раз стоит нам денег. Так что
       * «купил один раз и говори без конца» тут было бы нечестным
       * обещанием, которое рано или поздно пришлось бы отобрать.
       *
       * По подписке — без счёта (с суточным пределом, он указан в тарифах).
       */
      perUse: true,
      about: 'Длинный ответ наставника: разбор по нескольким бхавам, связь с идущей ' +
             'дашей и небом дня, обращение к расчёту за подробностями и стих с пояснением.',
      free: 'Короткие ответы по вашей карте — без ограничений и бесплатно.'
    }
  };

  /* -------------------------------------------------- серверный режим */
  /*
   * Пока сайт живёт один, кошелёк лежит в браузере и его можно подделать —
   * для витрины это честно и написано на страницах. Как только рядом
   * поднят server/api.js, источником правды становится он: баланс,
   * списания и право на разбор проверяются там.
   */
  var TOKEN_KEY = 'aruna.token.v1';
  var remote = { token: null, ready: false };

  function token() {
    if (remote.token) return remote.token;
    try { remote.token = root.localStorage.getItem(TOKEN_KEY); } catch (e) { remote.token = null; }
    return remote.token;
  }

  function setToken(t) {
    remote.token = t;
    try {
      if (t) root.localStorage.setItem(TOKEN_KEY, t);
      else root.localStorage.removeItem(TOKEN_KEY);
    } catch (e) { /* инкогнито */ }
  }

  function isServerMode() { return !!token(); }

  function apiFetch(path, opts) {
    opts = opts || {};
    var headers = Object.assign({ 'content-type': 'application/json' }, opts.headers || {});
    var t = token();
    if (t) headers.authorization = 'Bearer ' + t;
    return root.fetch(path, Object.assign({}, opts, { headers: headers }));
  }

  /** Подтянуть кошелёк с сервера в локальный кэш. */
  function syncFromServer() {
    if (!isServerMode() || !root.fetch) return Promise.resolve(null);
    return apiFetch('/api/wallet').then(function (r) {
      if (r.status === 401) { setToken(null); return null; }
      if (!r.ok) return null;
      return r.json();
    }).then(function (w) {
      if (!w) return null;
      var s = get();
      s.balance = w.balance;
      s.plan = w.plan;
      s.unlocked = w.unlocked || {};
      s.demo = w.demo;
      s.server = true;
      set(s);
      remote.ready = true;
      return w;
    }).catch(function () { return null; });
  }

  /* ------------------------------------------------------- адаптер */
  /**
   * Единственное место, которое поменяется при подключении оплаты.
   * Любой метод может вернуть промис — вызывающий код это учитывает.
   */
  var ADAPTER = {
    load: function () {
      try {
        var raw = root.localStorage.getItem(KEY);
        if (raw) return JSON.parse(raw);
      } catch (e) { /* инкогнито или заблокированное хранилище */ }
      // первый приход: немного демонстрационных бидж, чтобы было чем
      // открыть разбор и понять, за что вообще предлагают платить
      return { plan: 'free', balance: DEMO ? 6 : 0, unlocked: {}, demo: DEMO };
    },
    save: function (state) {
      try { root.localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* пусто */ }
    },
    /** Пополнение: на сервере — через API, без сервера — локальная демонстрация. */
    buy: function (pack) {
      if (isServerMode()) {
        return apiFetch('/api/purchase', {
          method: 'POST', body: JSON.stringify({ pack: pack.seeds })
        }).then(function (r) { return r.json(); })
          .then(function (b) {
            if (b && typeof b.balance === 'number') {
              var s = get(); s.balance = b.balance; set(s);
              return { ok: true, demo: !!b.demo };
            }
            return { ok: false, reason: b && b.error ? b.error : 'не удалось' };
          })
          .catch(function () { return { ok: false, reason: 'сервер недоступен' }; });
      }
      if (!DEMO) return { ok: false, reason: 'payment-not-connected' };
      var s = get();
      s.balance += pack.seeds;
      set(s);
      return { ok: true, demo: true };
    },
    /** Покупка разбора: на сервере списывает он, локально — мы сами. */
    unlock: function (id) {
      if (isServerMode()) {
        return apiFetch('/api/unlock', {
          method: 'POST', body: JSON.stringify({ feature: id })
        }).then(function (r) { return r.json().then(function (b) { return { r: r, b: b }; }); })
          .then(function (x) {
            if (x.r.ok && x.b.ok) {
              var s = get();
              s.balance = x.b.balance;
              s.unlocked[id] = Date.now();
              set(s);
              return { ok: true, by: x.b.already ? 'already' : 'seeds' };
            }
            return { ok: false, reason: x.r.status === 402 ? 'not-enough' : (x.b.error || 'ошибка'),
                     need: x.b.need };
          })
          .catch(function () { return { ok: false, reason: 'сервер недоступен' }; });
      }
      return localUnlock(id);
    },
    /** Локальное списание — витринный режим. */
    localUnlock: function (id) { return localUnlock(id); }
  };

  function localUnlock(id) {
    var f = FEATURES[id];
    if (!f) return { ok: false, reason: 'unknown-feature' };
    var s = get();
    if (s.plan === PLAN.id) return { ok: true, by: 'plan' };
    if (!f.perUse && s.unlocked[id]) return { ok: true, by: 'already' };
    if (s.balance < f.price) return { ok: false, reason: 'not-enough', need: f.price - s.balance };
    s.balance -= f.price;
    // разовый разбор не запоминается: он оплачен за этот раз и только
    if (!f.perUse) s.unlocked[id] = Date.now();
    s.spent = (s.spent || 0) + f.price;
    set(s);
    return { ok: true, by: 'seeds', spent: f.price };
  }

  /* --------------------------------------------------------- модель */
  var cache = null;
  var listeners = [];

  function get() {
    if (!cache) cache = ADAPTER.load();
    if (!cache.unlocked) cache.unlocked = {};
    return cache;
  }
  function set(s) {
    cache = s;
    ADAPTER.save(s);
    listeners.forEach(function (fn) { try { fn(s); } catch (e) { /* слушатель не должен ломать поток */ } });
  }

  function onChange(fn) { listeners.push(fn); }

  /**
   * Открыт ли разбор: по подписке, по прошлой покупке или нет.
   * У разборов с оплатой за раз (perUse) «навсегда» не бывает —
   * им отвечает только подписка.
   */
  function has(id) {
    var s = get();
    if (s.plan === PLAN.id) return true;
    var f = FEATURES[id];
    if (f && f.perUse) return false;
    return !!s.unlocked[id];
  }

  /** Платится за каждый раз, а не однажды. */
  function perUse(id) { return !!(FEATURES[id] && FEATURES[id].perUse); }

  /** Баланс пришёл с сервера (например, списан при ответе Дипы). */
  function setBalance(n) {
    if (typeof n !== 'number') return balance();
    var s = get();
    s.balance = n;
    set(s);
    return n;
  }

  function balance() { return get().balance; }
  function plan() { return get().plan; }
  function isDemo() { return !!get().demo && DEMO; }

  function feature(id) { return FEATURES[id] || null; }

  /** Попытка открыть разбор. Возвращает {ok, reason, ...}. */
  function unlock(id) { return ADAPTER.unlock(id); }

  /** Покупка пакета бидж. */
  function buy(packSeeds) {
    var pack = null;
    PACKS.forEach(function (p) { if (p.seeds === packSeeds) pack = p; });
    if (!pack) return { ok: false, reason: 'unknown-pack' };
    return ADAPTER.buy(pack);
  }

  function setPlan(id) {
    var s = get();
    s.plan = id === PLAN.id ? PLAN.id : 'free';
    set(s);
    return s.plan;
  }

  /** Сброс — нужен для демонстрации и для кнопки «очистить данные». */
  function reset() {
    try { root.localStorage.removeItem(KEY); } catch (e) { /* пусто */ }
    cache = null;
    set(ADAPTER.load());
  }

  root.ArunaAccess = {
    DEMO: DEMO, CURRENCY: CURRENCY, PACKS: PACKS, PLAN: PLAN, FEATURES: FEATURES,
    ADAPTER: ADAPTER,
    isServerMode: isServerMode, setToken: setToken, token: token,
    syncFromServer: syncFromServer, apiFetch: apiFetch,
    plural: plural, seeds: seeds,
    has: has, perUse: perUse, feature: feature, unlock: unlock, buy: buy,
    setBalance: setBalance,
    balance: balance, plan: plan, setPlan: setPlan, isDemo: isDemo,
    reset: reset, onChange: onChange, state: get
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
