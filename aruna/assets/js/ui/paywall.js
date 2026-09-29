/*
 * Аруна · показ платных разборов
 * ------------------------------------------------------------------
 * Замок здесь устроен так, чтобы не раздражать: человек видит начало
 * настоящего разбора (не размытую заглушку), видит цену и видит, что
 * именно останется бесплатным. Никаких таймеров и «осталось 3 минуты».
 */
(function (root, doc) {
  'use strict';

  var S = root.Aruna, Acc = root.ArunaAccess;

  /**
   * Оборачивает готовый разбор в замок, если он не оплачен.
   * @param {string} id       идентификатор разбора из ArunaAccess.FEATURES
   * @param {string} contentHtml полный разбор
   * @param {string} [previewHtml] что показать над замком (по умолчанию — начало разбора)
   */
  function section(id, contentHtml, previewHtml) {
    if (Acc.has(id)) return contentHtml;
    var f = Acc.feature(id);
    if (!f) return contentHtml;

    var enough = Acc.balance() >= f.price;
    return '' +
      '<div class="locked" data-feature="' + S.esc(id) + '">' +
        '<div class="locked__preview" aria-hidden="true">' +
          (previewHtml || contentHtml) +
        '</div>' +
        '<div class="locked__gate">' +
          '<p class="locked__title">' + S.esc(f.title) + '</p>' +
          '<p class="locked__what">' + S.esc(f.about) + '</p>' +
          '<div class="locked__actions">' +
            '<button class="btn btn--gold btn--sm" type="button" data-act="unlock">' +
              (enough ? 'Открыть за ' : 'Нужно ') +
              '<span class="seed">' + Acc.seeds(f.price) + '</span>' +
            '</button>' +
            '<button class="btn btn--ghost btn--sm" type="button" data-act="more">Другие способы</button>' +
          '</div>' +
          '<p class="locked__meta">' + S.esc(f.free) +
            ' · на балансе ' + S.esc(Acc.seeds(Acc.balance())) + '</p>' +
        '</div>' +
      '</div>';
  }

  /** Строка кошелька для боковой колонки. */
  function wallet() {
    var demo = Acc.isDemo();
    var server = Acc.isServerMode && Acc.isServerMode();
    return '<div class="wallet">' +
      (server ? '<span class="chip chip--teal" title="Баланс и покупки проверяет сервер">на сервере</span>' : '') +
      '<span class="wallet__balance seed">' + Acc.balance() + '</span>' +
      '<span class="muted small">' + S.esc(Acc.plural(Acc.balance())) +
        (demo ? ' · демо' : '') + '</span>' +
      '<span class="wallet__tier chip' + (Acc.plan() === Acc.PLAN.id ? ' chip--gold' : '') + '">' +
        (Acc.plan() === Acc.PLAN.id ? Acc.PLAN.title : 'Бесплатный доступ') +
      '</span>' +
    '</div>';
  }

  /* ------------------------------------------------------------ модалка */
  function ensureModal() {
    var m = doc.getElementById('paywallModal');
    if (m) return m;
    m = doc.createElement('div');
    m.className = 'modal';
    m.id = 'paywallModal';
    m.hidden = true;
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-modal', 'true');
    m.setAttribute('aria-labelledby', 'paywallTitle');
    m.innerHTML = '<div class="modal__box"></div>';
    doc.body.appendChild(m);
    m.addEventListener('click', function (e) {
      if (e.target === m) close();
    });
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !m.hidden) close();
    });
    return m;
  }

  var lastFocus = null;

  function close() {
    var m = doc.getElementById('paywallModal');
    if (m) m.hidden = true;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function openModal(id, onDone) {
    var f = Acc.feature(id);
    if (!f) return;
    var m = ensureModal();
    lastFocus = doc.activeElement;
    var box = m.querySelector('.modal__box');
    var enough = Acc.balance() >= f.price;

    var packs = Acc.PACKS.map(function (p) {
      return '<button class="modal__option" type="button" data-act="buy" data-seeds="' + p.seeds + '">' +
        '<b>' + S.esc(Acc.seeds(p.seeds)) + '</b>' +
        '<em>' + p.price.toLocaleString('ru-RU') + ' ₽</em>' +
        '<span>' + (p.save ? 'выгоднее на ' + p.save + '%' : 'разовая покупка') + '</span>' +
      '</button>';
    }).join('');

    box.innerHTML =
      '<div class="modal__head">' +
        '<h2 id="paywallTitle">' + S.esc(f.title) + '</h2>' +
        '<button class="modal__close" type="button" data-act="close" aria-label="Закрыть">×</button>' +
      '</div>' +
      '<p class="muted" style="margin-top:10px">' + S.esc(f.about) + '</p>' +
      '<div class="modal__options">' +
        '<button class="modal__option" type="button" data-act="unlock"' + (enough ? '' : ' disabled') + '>' +
          '<b>Открыть этот разбор</b><em class="seed">' + Acc.seeds(f.price) + '</em>' +
          '<span>' + (enough ? 'спишется с баланса, разбор останется навсегда'
                             : 'на балансе ' + Acc.seeds(Acc.balance()) + ' — не хватает') + '</span>' +
        '</button>' +
        '<button class="modal__option" type="button" data-act="plan">' +
          '<b>Подписка «' + S.esc(Acc.PLAN.title) + '»</b>' +
          '<em>' + Acc.PLAN.month + ' ₽/мес</em>' +
          '<span>' + S.esc(Acc.PLAN.about) + '</span>' +
        '</button>' +
      '</div>' +
      '<p class="modal__note">Пополнить баланс:</p>' +
      '<div class="modal__options">' + packs + '</div>' +
      '<p class="modal__note">' +
        (Acc.isDemo()
          ? 'Приём оплаты ещё не подключён. Сейчас кнопки работают в демонстрационном ' +
            'режиме: биджи начисляются и списываются по-настоящему, но денег ни с кого не берут.'
          : 'Оплата проходит на стороне платёжного провайдера.') +
        ' Подробные условия — на <a href="pricing.html">странице тарифов</a>.' +
      '</p>';

    m.hidden = false;
    var first = box.querySelector('.modal__option:not([disabled])');
    if (first) first.focus();

    box.onclick = function (e) {
      var b = e.target.closest('[data-act]');
      if (!b) return;
      var act = b.dataset.act;
      if (act === 'close') { close(); return; }
      if (act === 'buy') {
        b.disabled = true;
        // на сервере покупка асинхронная, локально — мгновенная; один код на оба
        Promise.resolve(Acc.buy(+b.dataset.seeds)).then(function () {
          openModal(id, onDone);          // перерисовываем с новым балансом
        });
        return;
      }
      if (act === 'plan') {
        Acc.setPlan(Acc.PLAN.id);
        close();
        if (onDone) onDone();
        return;
      }
      if (act === 'unlock') {
        b.disabled = true;
        Promise.resolve(Acc.unlock(id)).then(function (r) {
          if (r && r.ok) { close(); if (onDone) onDone(); }
          else openModal(id, onDone);
        });
      }
    };
  }

  /**
   * Вешает обработчики на все замки внутри контейнера.
   * @param {Element} host
   * @param {Function} rerender вызывается после успешного открытия
   */
  function bind(host, rerender) {
    S.qa('.locked', host).forEach(function (box) {
      var id = box.dataset.feature;
      box.addEventListener('click', function (e) {
        var b = e.target.closest('[data-act]');
        if (!b) return;
        if (b.dataset.act === 'unlock') {
          b.disabled = true;
          Promise.resolve(Acc.unlock(id)).then(function (r) {
            b.disabled = false;
            if (r && r.ok) { if (rerender) rerender(); return; }
            openModal(id, rerender);
          });
        } else {
          openModal(id, rerender);
        }
      });
    });
  }

  S.Paywall = { section: section, wallet: wallet, bind: bind, open: openModal, close: close };
})(typeof globalThis !== 'undefined' ? globalThis : this, document);
