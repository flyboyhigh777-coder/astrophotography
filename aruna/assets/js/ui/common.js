/*
 * Аруна · общий слой интерфейса
 * ------------------------------------------------------------------
 * Шапка, меню, появление блоков при скролле, звёздное поле, хранение
 * данных рождения и мелкие помощники форматирования. Подключается на
 * всех страницах перед остальными скриптами.
 */
(function (root, doc) {
  'use strict';

  var Tz = root.ArunaTz;

  var S = {
    /** Короткий querySelector. */
    q: function (sel, ctx) { return (ctx || doc).querySelector(sel); },
    qa: function (sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); },

    /** Экранирование для вставки в HTML. */
    esc: function (s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    },

    reducedMotion: function () {
      return root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    },

    /*
     * Место как его читают: «Ташкент, Узбекистан». Одного названия мало —
     * городов-тёзок много, а человеку важно видеть, что расчёт пошёл
     * именно по его стране. У координат, введённых вручную, страны нет.
     */
    placeLabel: function (place) {
      if (!place) return '';
      return place.country ? place.name + ', ' + place.country : (place.name || '');
    },

    /*
     * Показать посчитанное.
     *
     * На широком экране форма слева, результат справа — нажал кнопку и
     * сразу видишь карту. На узком они встают друг под друга, и карта
     * рождается ниже сгиба: человек жмёт «Построить карту», ничего не
     * происходит, кнопка кажется сломанной. Поэтому после расчёта
     * подводим страницу к результату — но только если его и правда не
     * видно, иначе экран будет дёргаться на каждый пересчёт.
     *
     * Отступ сверху — под липкую шапку, чтобы заголовок не уезжал под неё.
     */
    reveal: function (node) {
      if (!node || !root.requestAnimationFrame) return;
      root.requestAnimationFrame(function () {
        var box = node.getBoundingClientRect();
        if (!box.height) return;
        var head = S.q('.header');
        var top = head ? head.getBoundingClientRect().height : 0;
        var seen = box.top >= top && box.top < root.innerHeight * 0.6;
        if (seen) return;
        var y = box.top + (root.pageYOffset || doc.documentElement.scrollTop) - top - 12;
        try {
          root.scrollTo({ top: y, behavior: S.reducedMotion() ? 'auto' : 'smooth' });
        } catch (e) {
          root.scrollTo(0, y);          // старые движки без объектной формы
        }
      });
    },

    /* ------------------------------------------------------ дата и время */
    dateRu: function (utcMs, tz, opts) {
      var o = { day: 'numeric', month: 'long', year: 'numeric' };
      if (opts) for (var k in opts) o[k] = opts[k];
      if (tz) o.timeZone = tz;
      return new Intl.DateTimeFormat('ru-RU', o).format(new Date(utcMs));
    },
    timeRu: function (utcMs, tz) {
      return new Intl.DateTimeFormat('ru-RU', {
        hour: '2-digit', minute: '2-digit', timeZone: tz || undefined
      }).format(new Date(utcMs));
    },
    /** «2026-09-28» в указанной зоне — ключ дня для выбора стиха. */
    dayKey: function (utcMs, tz) {
      var z = Tz.utcMsToZoned(utcMs, tz);
      return z.y + '-' + String(z.m).padStart(2, '0') + '-' + String(z.d).padStart(2, '0');
    },
    /** Часы как «1 ч 47 мин». */
    span: function (days) {
      var m = Math.round(days * 24 * 60);
      var h = Math.floor(m / 60);
      return (h ? h + ' ч ' : '') + (m % 60) + ' мин';
    },

    /* ----------------------------------------------------- зона гостя */
    guessTimeZone: function () {
      try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow'; }
      catch (e) { return 'Europe/Moscow'; }
    },
    /** Город из базы, подходящий под зону браузера (иначе Москва). */
    guessPlace: function () {
      var tz = S.guessTimeZone();
      var list = root.ArunaCities ? root.ArunaCities.CITIES : null;
      if (list) {
        for (var i = 0; i < list.length; i++) {
          if (list[i][3] === tz) {
            return { name: list[i][0], lat: list[i][1], lon: list[i][2], tz: list[i][3] };
          }
        }
      }
      return { name: 'Москва', lat: 55.7558, lon: 37.6176, tz: 'Europe/Moscow' };
    },

    /* ---------------------------------------------- данные рождения */
    KEY: 'aruna.birth.v1',
    saveBirth: function (b) {
      try { root.localStorage.setItem(S.KEY, JSON.stringify(b)); } catch (e) { /* режим инкогнито */ }
    },
    loadBirth: function () {
      try {
        var raw = root.localStorage.getItem(S.KEY);
        if (!raw) return null;
        var b = JSON.parse(raw);
        return (b && b.date && b.place) ? b : null;
      } catch (e) { return null; }
    },
    clearBirth: function () {
      try { root.localStorage.removeItem(S.KEY); } catch (e) { /* пусто */ }
    },

    /**
     * Данные формы -> карта. Возвращает {chart, utcMs, offsetLabel}.
     * @param {Object} b {date:'1975-06-15', time:'06:00', place:{name,lat,lon,tz}}
     */
    chartFromBirth: function (b) {
      var d = b.date.split('-').map(Number);
      var t = (b.time || '12:00').split(':').map(Number);
      var utcMs = Tz.zonedToUtcMs(d[0], d[1], d[2], t[0] || 0, t[1] || 0, b.place.tz);
      var chart = root.ArunaChart.buildChart({
        jd: Tz.msToJd(utcMs), lat: b.place.lat, lon: b.place.lon,
        tz: b.place.tz, label: b.place.name
      });
      return {
        chart: chart, utcMs: utcMs,
        offsetLabel: Tz.offsetLabel(Tz.offsetMinutes(utcMs, b.place.tz))
      };
    }
  };

  /* -------------------------------------------------------- шапка и меню */
  function initHeader() {
    var header = S.q('#header'), nav = S.q('#nav'), toggle = S.q('#navToggle');
    if (header) {
      var onScroll = function () {
        header.classList.toggle('is-stuck', root.scrollY > 8);
      };
      onScroll();
      root.addEventListener('scroll', onScroll, { passive: true });
    }
    if (nav && toggle) {
      toggle.addEventListener('click', function () {
        var open = nav.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      nav.addEventListener('click', function (e) {
        if (e.target.tagName === 'A') {
          nav.classList.remove('is-open');
          toggle.setAttribute('aria-expanded', 'false');
        }
      });
    }
  }

  /* ------------------------------------------------ появление при скролле */
  function initReveal() {
    var items = S.qa('.reveal');
    if (!items.length) return;
    if (!root.IntersectionObserver || S.reducedMotion()) {
      items.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.style.transitionDelay = (en.target.dataset.delay || 0) + 'ms';
          en.target.classList.add('is-in');
          io.unobserve(en.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    items.forEach(function (el, i) {
      var group = el.parentElement;
      el.dataset.delay = (Array.prototype.indexOf.call(group.children, el) % 4) * 90;
      io.observe(el);
    });
  }

  /* ------------------------------------------------------- звёздное поле */
  function initStars() {
    var cv = S.q('#stars');
    if (!cv) return;
    var ctx = cv.getContext('2d');
    var stars = [], dpr = Math.min(root.devicePixelRatio || 1, 2), w = 0, h = 0, raf = null;

    function build() {
      var rect = cv.getBoundingClientRect();
      w = Math.max(1, rect.width); h = Math.max(1, rect.height);
      cv.width = w * dpr; cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var count = Math.round(Math.min(230, (w * h) / 5200));
      stars = [];
      for (var i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * w, y: Math.random() * h,
          r: Math.random() * 1.15 + 0.25,
          a: Math.random() * 0.5 + 0.15,
          tw: Math.random() * 0.9 + 0.25,
          ph: Math.random() * Math.PI * 2,
          drift: (Math.random() - 0.5) * 0.02,
          hue: Math.random() < 0.18 ? 'rgba(244,221,169,' : 'rgba(224,231,247,'
        });
      }
    }

    function draw(t) {
      ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        var alpha = s.a + Math.sin(t / 1400 * s.tw + s.ph) * 0.18;
        ctx.beginPath();
        ctx.fillStyle = s.hue + Math.max(0.04, alpha).toFixed(3) + ')';
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
        s.x += s.drift;
        if (s.x < -2) s.x = w + 2; else if (s.x > w + 2) s.x = -2;
      }
      raf = root.requestAnimationFrame(draw);
    }

    build();
    if (S.reducedMotion()) { draw(0); root.cancelAnimationFrame(raf); }
    else raf = root.requestAnimationFrame(draw);

    var resizeTimer = null;
    root.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { build(); }, 180);
    });
  }

  function initYear() {
    var y = S.q('#year');
    if (y) y.textContent = new Date().getFullYear();
  }

  S.init = function () { initHeader(); initReveal(); initStars(); initYear(); };

  root.Aruna = S;
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', S.init);
  else S.init();
})(typeof globalThis !== 'undefined' ? globalThis : this, document);
