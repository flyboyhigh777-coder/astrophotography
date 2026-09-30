/*
 * Аруна · «как этим пользоваться»
 * ------------------------------------------------------------------
 * Человек, открывший карту впервые, видит таблицу санскритских слов и
 * закрывает вкладку. Подсказки к словам объясняют каждое по отдельности,
 * но не отвечают на первый вопрос: что мне вообще здесь делать и на что
 * смотреть сначала.
 *
 * Отсюда две вещи:
 *
 *   1. Короткая полоска шагов там, где ещё ничего не посчитано. Три
 *      строки: что ввести, что получится, сколько это стоит. Её видно
 *      без раскрытия — иначе её не увидит никто.
 *   2. Раскрывающийся «как читать» рядом с результатом: что здесь
 *      главное, что можно пропустить, в каком порядке смотреть.
 *      Он закрыт по умолчанию и помнит, закрыли ли его: человек,
 *      который разобрался, не должен закрывать его каждый раз.
 */
(function (root, doc) {
  'use strict';

  var S = root.Aruna;
  if (!S) return;

  var KEY = 'aruna.howto.';

  function closed(id) {
    try { return root.localStorage.getItem(KEY + id) === 'off'; }
    catch (e) { return false; }
  }
  function remember(id, off) {
    try { root.localStorage.setItem(KEY + id, off ? 'off' : 'on'); }
    catch (e) { /* инкогнито */ }
  }

  /**
   * Полоска первых шагов — для пустого состояния.
   * @param {Array} steps [{title, text}]
   */
  function steps(list) {
    return '<ol class="howto-steps">' + list.map(function (s, i) {
      return '<li class="howto-steps__i">' +
        '<span class="howto-steps__n" aria-hidden="true">' + (i + 1) + '</span>' +
        '<span><strong>' + S.esc(s.title) + '</strong> ' + S.esc(s.text) + '</span>' +
        '</li>';
    }).join('') + '</ol>';
  }

  /**
   * Раскрывающееся «как читать».
   * @param {string} id   под каким именем помнить состояние
   * @param {string} title заголовок
   * @param {Array}  rows [{what, why}]
   */
  function panel(id, title, rows) {
    return '<details class="howto" data-howto="' + S.esc(id) + '"' +
           (closed(id) ? '' : ' open') + '>' +
      '<summary><span class="howto__icon" aria-hidden="true">?</span>' +
        S.esc(title) + '</summary>' +
      '<dl class="howto__list">' + rows.map(function (r) {
        return '<dt>' + S.esc(r.what) + '</dt><dd>' + S.esc(r.why) + '</dd>';
      }).join('') + '</dl>' +
    '</details>';
  }

  // Запоминаем, закрыли ли: разобравшийся человек не должен закрывать
  // одно и то же при каждом заходе.
  doc.addEventListener('toggle', function (e) {
    var d = e.target;
    if (d && d.matches && d.matches('details[data-howto]')) {
      remember(d.dataset.howto, !d.open);
    }
  }, true);

  S.Howto = { steps: steps, panel: panel, closed: closed };
})(typeof globalThis !== 'undefined' ? globalThis : this, document);
