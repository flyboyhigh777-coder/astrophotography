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
    'dialog.deep': {
      title: 'Развёрнутый ответ',
      price: 1,
      about: 'Длинный ответ наставника: разбор по нескольким бхавам, связь с дашей ' +
             'и подобранный стих с пояснением.',
      free: 'Короткие ответы по вашей карте — без ограничений.'
    }
  };

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
    /** Здесь будет обращение к платёжному провайдеру. */
    buy: function (pack) {
      if (!DEMO) return { ok: false, reason: 'payment-not-connected' };
      var s = get();
      s.balance += pack.seeds;
      set(s);
      return { ok: true, demo: true };
    },
    /** Здесь будет проверка покупки на сервере. */
    unlock: function (id) {
      var f = FEATURES[id];
      if (!f) return { ok: false, reason: 'unknown-feature' };
      var s = get();
      if (s.plan === PLAN.id) return { ok: true, by: 'plan' };
      if (s.unlocked[id]) return { ok: true, by: 'already' };
      if (s.balance < f.price) return { ok: false, reason: 'not-enough', need: f.price - s.balance };
      s.balance -= f.price;
      s.unlocked[id] = Date.now();
      set(s);
      return { ok: true, by: 'seeds', spent: f.price };
    }
  };

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

  /** Открыт ли разбор: по подписке, по прошлой покупке или нет. */
  function has(id) {
    var s = get();
    if (s.plan === PLAN.id) return true;
    return !!s.unlocked[id];
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
    plural: plural, seeds: seeds,
    has: has, feature: feature, unlock: unlock, buy: buy,
    balance: balance, plan: plan, setPlan: setPlan, isDemo: isDemo,
    reset: reset, onChange: onChange, state: get
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
