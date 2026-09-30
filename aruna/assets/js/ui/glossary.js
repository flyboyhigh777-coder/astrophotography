/*
 * Аруна · подсказки к непонятным словам
 * ------------------------------------------------------------------
 * Слова вроде «Титхи» и «альмутен» ничего не говорят человеку, который
 * пришёл впервые, — а заменить их нельзя: они точные. Поэтому слово
 * остаётся, но становится кнопкой: навёл мышью — увидел объяснение,
 * ткнул пальцем — тоже.
 *
 * Три вещи, ради которых это написано руками, а не взято готовым:
 *
 *   1. Наведение мышью не работает на телефоне. Половина людей придёт
 *      с телефона, и «наведите на слово» для них пустой звук. Поэтому
 *      здесь настоящая кнопка: она отзывается и на мышь, и на палец,
 *      и на Tab с клавиатуры.
 *   2. Подсказка одна на всю страницу и переезжает к нужному слову.
 *      Двести отдельных всплывашек в разметке — двести лишних узлов.
 *   3. Разметка размечается сама. Таблицы и списки строятся из JS в
 *      десятке мест; вписывать <button> в каждую строку — значит
 *      забыть в половине. Здесь текст размечается после отрисовки.
 */
(function (root, doc) {
  'use strict';

  var S = root.Aruna, G = root.ArunaGlossary;
  if (!S || !G) return;

  var tip = null, anchor = null, hideTimer = null, seq = 0;

  /* ---------------------------------------------------------- разметка */

  /*
   * Где размечать нельзя. Поля ввода — там текст правят; ссылки и кнопки —
   * кнопка внутри кнопки не нажимается; svg — там свои правила разметки;
   * а уже размеченное трогать второй раз незачем.
   */
  var SKIP = /^(input|select|textarea|button|a|script|style|svg|code|pre|abbr)$/i;

  function skipped(node) {
    for (var n = node.parentNode; n && n.nodeType === 1; n = n.parentNode) {
      if (SKIP.test(n.tagName)) return true;
      if (n.classList && (n.classList.contains('term') ||
                          n.classList.contains('no-terms'))) return true;
      if (n.hasAttribute && n.hasAttribute('data-no-terms')) return true;
    }
    return false;
  }

  /*
   * Одно выражение на все формы всех слов, длинные раньше коротких —
   * иначе «раху» съест «раху-кала».
   *
   * Границы слова заданы просмотром назад через захват и просмотром
   * вперёд: \b в JS считает буквами только латиницу, с кириллицей он
   * молча не срабатывает. Заглядывание назад ((?<=…)) обошли бы это,
   * но его нет в Safari до 16.4 — а это половина айфонов на руках.
   */
  var RE = new RegExp(
    '(^|[^0-9A-Za-zА-Яа-яЁё́-])(' +
    G.FORMS.map(function (f) {
      return f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('|') +
    ')(?![0-9A-Za-zА-Яа-яЁё])', 'i');

  /*
   * Область, внутри которой слово объясняется один раз.
   *
   * Если считать по абзацам, таблица из девяти строк со столбцом «Раши»
   * получит девять подчёркиваний подряд — читать это невозможно. Если
   * считать по всей странице, объяснение окажется в шапке, а человек
   * встретит слово в середине. Панель — золотая середина: столько же,
   * сколько видно за раз.
   */
  var SCOPE = '.panel, .card, table, section, .empty-state, .hero, footer';

  function scopeOf(node, host) {
    var el = node.parentNode;
    while (el && el.nodeType === 1) {
      if (el === host) break;
      if (el.matches && el.matches(SCOPE)) return el;
      el = el.parentNode;
    }
    return host;
  }

  /**
   * Размечает термины внутри узла.
   * @param {Element} host где размечать
   */
  function mark(host) {
    if (!host) return;
    var walker = doc.createTreeWalker(host, NodeFilter.SHOW_TEXT, null, false);
    var texts = [], n;
    while ((n = walker.nextNode())) texts.push(n);

    var seen = new Map();
    texts.forEach(function (node) {
      if (!node.parentNode || skipped(node)) return;
      var m = RE.exec(node.nodeValue);
      if (!m) return;
      var key = m[2].toLowerCase().replace(/ё/g, 'е');
      if (!G.lookup(key)) return;

      var scope = scopeOf(node, host);
      var used = seen.get(scope);
      if (!used) { used = {}; seen.set(scope, used); }
      if (used[key]) return;
      used[key] = true;

      var start = m.index + m[1].length;
      var after = node.splitText(start);
      after.splitText(m[2].length);
      var btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'term';
      btn.textContent = m[2];
      btn.setAttribute('aria-label', m[2] + ' — что это значит');
      btn.setAttribute('aria-expanded', 'false');
      after.parentNode.replaceChild(btn, after);
    });
  }

  /* ---------------------------------------------------------- подсказка */

  function ensureTip() {
    if (tip) return tip;
    tip = doc.createElement('div');
    tip.className = 'termtip';
    tip.id = 'termtip';
    tip.setAttribute('role', 'tooltip');
    tip.hidden = true;
    doc.body.appendChild(tip);
    // уводить мышь через саму подсказку можно: её не прячем
    tip.addEventListener('pointerenter', function () { clearTimeout(hideTimer); });
    tip.addEventListener('pointerleave', function () { hide(120); });
    return tip;
  }

  function place(btn) {
    var b = btn.getBoundingClientRect();
    var t = tip.getBoundingClientRect();
    var pad = 10;
    var left = b.left + b.width / 2 - t.width / 2;
    left = Math.max(pad, Math.min(left, root.innerWidth - t.width - pad));
    // сверху, если снизу не помещается
    var below = b.bottom + 8;
    var above = b.top - t.height - 8;
    var top = (below + t.height > root.innerHeight - pad && above > pad) ? above : below;
    tip.classList.toggle('termtip--above', top === above);
    tip.style.left = Math.round(left + (root.pageXOffset || 0)) + 'px';
    tip.style.top = Math.round(top + (root.pageYOffset || 0)) + 'px';
    // носик указывает на слово, даже когда подсказку прижало к краю
    var nose = b.left + b.width / 2 - left;
    tip.style.setProperty('--nose', Math.round(Math.max(14, Math.min(nose, t.width - 14))) + 'px');
  }

  function show(btn) {
    var entry = G.lookup(btn.textContent);
    if (!entry) return;
    clearTimeout(hideTimer);
    ensureTip();
    if (anchor && anchor !== btn) anchor.setAttribute('aria-expanded', 'false');
    anchor = btn;
    tip.innerHTML =
      '<p class="termtip__word">' + S.esc(entry.term) + '</p>' +
      '<p class="termtip__text">' + S.esc(entry.text) + '</p>' +
      '<p class="termtip__more"><a href="glossary.html#w-' +
        S.esc(entry.term.toLowerCase().replace(/ё/g, 'е').replace(/[^а-яa-z0-9]+/g, '-')) +
        '">Все слова словаря</a></p>';
    tip.hidden = false;
    if (!tip.id) tip.id = 'termtip';
    btn.setAttribute('aria-describedby', tip.id);
    btn.setAttribute('aria-expanded', 'true');
    // сначала показать (чтобы измерилась высота), потом поставить на место
    place(btn);
    tip.classList.add('is-open');
  }

  function hide(delay) {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () {
      if (!tip) return;
      tip.classList.remove('is-open');
      tip.hidden = true;
      if (anchor) {
        anchor.removeAttribute('aria-describedby');
        anchor.setAttribute('aria-expanded', 'false');
        anchor = null;
      }
    }, delay === undefined ? 120 : delay);
  }

  /* ------------------------------------------------------------ события */

  function bind() {
    /*
     * Наведение — только там, где есть чем наводить: на телефоне
     * касание тоже приходит указателем, и подсказка мигала бы на
     * каждый тап дважды.
     *
     * pointerover, а не pointerenter: enter не всплывает, и слушателю
     * на документе достаётся не всё.
     */
    doc.addEventListener('pointerover', function (e) {
      if (e.pointerType === 'touch') return;
      var t = e.target.closest && e.target.closest('.term');
      if (t) show(t);
    });

    doc.addEventListener('pointerout', function (e) {
      if (e.pointerType === 'touch') return;
      var t = e.target.closest && e.target.closest('.term');
      if (!t) return;
      // ушли внутрь самой подсказки — не прячем
      if (e.relatedTarget && tip && tip.contains(e.relatedTarget)) return;
      hide(160);
    });

    // Нажатие: на пальце это единственный способ, на мыши — способ
    // оставить подсказку открытой и прочитать спокойно.
    doc.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('.term');
      if (t) {
        e.preventDefault();
        if (anchor === t && tip && !tip.hidden) hide(0);
        else show(t);
        return;
      }
      if (tip && !tip.hidden && !(tip.contains && tip.contains(e.target))) hide(0);
    });

    // Клавиатура: Tab доводит до слова, Esc закрывает.
    doc.addEventListener('focusin', function (e) {
      var t = e.target;
      if (t.classList && t.classList.contains('term')) show(t);
    });
    doc.addEventListener('focusout', function (e) {
      var t = e.target;
      if (t.classList && t.classList.contains('term')) hide(160);
    });
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && tip && !tip.hidden) {
        var a = anchor;
        hide(0);
        if (a) a.focus();
      }
    });

    // Подсказка приклеена к месту на экране, а страница едет — уводим.
    root.addEventListener('scroll', function () { if (anchor) hide(0); }, { passive: true });
    root.addEventListener('resize', function () { if (anchor) hide(0); });
  }

  var bound = false;
  /**
   * Разметить и включить. Вызывается после каждой перерисовки панелей.
   * @param {Element} [host] что размечать; по умолчанию вся страница
   */
  function apply(host) {
    if (!bound) { bind(); bound = true; }
    mark(host || doc.body);
  }

  S.Glossary = { apply: apply, mark: mark, show: show, hide: hide };

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', function () { apply(); });
  } else {
    apply();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, document);
