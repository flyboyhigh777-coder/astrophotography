/*
 * Аруна · вход через телеграм-бота
 * ------------------------------------------------------------------
 * Ни почты, ни пароля: сайт показывает шестизначный код, человек
 * отправляет его боту командой /login, сервер связывает их и выдаёт
 * токен. Для пользователя это два касания, для нас — ни SMTP, ни
 * восстановления пароля, ни утечки паролей, потому что их нет.
 *
 * Если сервер не поднят (сайт лежит просто статикой), модуль молча
 * ничего не делает: витрина работает на локальном кошельке.
 */
(function (root, doc) {
  'use strict';

  var S = root.Aruna, Acc = root.ArunaAccess;
  if (!S || !Acc) return;

  var pollTimer = null;

  function apiAvailable() {
    // file:// и статический хостинг серверного API не имеют
    return root.fetch && root.location && /^https?:$/.test(root.location.protocol);
  }

  function box(html) {
    var el = doc.getElementById('authBox');
    if (el) el.innerHTML = html;
  }

  function renderSignedIn() {
    box('<p class="tiny muted">Вы вошли через бота: баланс и покупки хранятся ' +
        'на сервере. <button class="btn btn--quiet btn--sm" type="button" ' +
        'id="authOut" style="padding:0">Выйти</button></p>');
    var out = doc.getElementById('authOut');
    if (out) out.addEventListener('click', function () {
      Acc.setToken(null);
      root.location.reload();
    });
  }

  function renderSignIn() {
    box('<button class="btn btn--ghost btn--sm btn--block" type="button" id="authIn">' +
        'Войти через телеграм</button>' +
        '<p class="tiny muted" style="margin-top:8px">Без пароля: бот подтвердит вход ' +
        'по коду. Тогда покупки переживут смену устройства.</p>');
    var btn = doc.getElementById('authIn');
    if (btn) btn.addEventListener('click', start);
  }

  function start() {
    box('<p class="tiny muted">Готовлю код…</p>');
    Acc.apiFetch('/api/auth/start', { method: 'POST' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.code) throw new Error('нет кода');
        box('<p class="small">Отправьте боту сообщение:</p>' +
            '<p class="auth-code"><code>/login ' + S.esc(d.code) + '</code></p>' +
            '<p class="tiny muted">Код живёт 10 минут. Как только бот ответит, ' +
            'эта страница обновится сама.</p>');
        waitFor(d.code, Date.now() + 10 * 60 * 1000);
      })
      .catch(function () {
        box('<p class="tiny muted">Сервер входа недоступен — сайт работает ' +
            'в витринном режиме, покупки живут только в этом браузере.</p>');
      });
  }

  function waitFor(code, until) {
    clearTimeout(pollTimer);
    if (Date.now() > until) {
      box('<p class="tiny muted">Код устарел.</p>' +
          '<button class="btn btn--ghost btn--sm" type="button" id="authIn">Получить новый</button>');
      var b = doc.getElementById('authIn');
      if (b) b.addEventListener('click', start);
      return;
    }
    pollTimer = setTimeout(function () {
      Acc.apiFetch('/api/auth/poll?code=' + encodeURIComponent(code))
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d.token) {
            Acc.setToken(d.token);
            return Acc.syncFromServer().then(function () { root.location.reload(); });
          }
          waitFor(code, until);
        })
        .catch(function () { waitFor(code, until); });
    }, 2000);
  }

  function init() {
    if (!doc.getElementById('authBox')) return;
    if (!apiAvailable()) {
      box('<p class="tiny muted">Сайт открыт без сервера — кошелёк живёт ' +
          'в этом браузере. Так и задумано для витрины.</p>');
      return;
    }
    if (Acc.isServerMode()) {
      Acc.syncFromServer().then(function (w) {
        if (w) renderSignedIn(); else renderSignIn();
      });
      return;
    }
    renderSignIn();
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();

  S.Auth = { start: start, init: init };
})(typeof globalThis !== 'undefined' ? globalThis : this, document);
