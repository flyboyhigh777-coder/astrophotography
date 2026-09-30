/*
 * Аруна · страница словаря
 * ------------------------------------------------------------------
 * Подсказки на страницах объясняют слово там, где оно встретилось. Эта
 * страница — для другого случая: человек услышал слово в разговоре или
 * прочёл в книге и хочет посмотреть, не открывая карту.
 *
 * Слова сгруппированы не по алфавиту, а по тому, откуда они: сначала
 * джйотиш, потом западная астрология. По алфавиту «альмутен» стоял бы
 * рядом с «аянамшей», и человек решил бы, что это из одной оперы.
 */
(function (root, doc) {
  'use strict';

  var S = root.Aruna, G = root.ArunaGlossary;
  if (!S || !G) return;

  /*
   * Границы разделов заданы первым словом каждого: словарь хранит
   * слова в осмысленном порядке, и держать порядок в двух местах —
   * значит рано или поздно их разойтись.
   */
  var SECTIONS = [
    { from: 'Граха',      title: 'Джйотиш: из чего состоит карта' },
    { from: 'Даша',       title: 'Джйотиш: как размечено время' },
    { from: 'Панчанга',   title: 'Джйотиш: приметы дня' },
    { from: 'Варга',      title: 'Джйотиш: дробные карты, очки и выбор времени' },
    { from: 'Асцендент',  title: 'Западная: оси и дома' },
    { from: 'Аспект',     title: 'Западная: углы между планетами' },
    { from: 'Обитель',    title: 'Западная: достоинства планет' },
    { from: 'Транзит',    title: 'Западная: время и точки' }
  ];

  function sectionOf(i, terms) {
    var cur = null;
    for (var k = 0; k <= i; k++) {
      var m = SECTIONS.filter(function (s) { return s.from === terms[k].term; })[0];
      if (m) cur = m.title;
    }
    return cur || 'Прочее';
  }

  function render(query) {
    var q = String(query || '').trim().toLowerCase().replace(/ё/g, 'е');
    var terms = G.TERMS;
    var groups = [], seen = {};

    terms.forEach(function (t, i) {
      var hay = (t.term + ' ' + t.forms.join(' ') + ' ' + t.text)
        .toLowerCase().replace(/ё/g, 'е');
      if (q && hay.indexOf(q) < 0) return;
      var title = sectionOf(i, terms);
      if (!seen[title]) { seen[title] = []; groups.push(title); }
      seen[title].push(t);
    });

    var host = doc.getElementById('glList');
    host.innerHTML = groups.map(function (title) {
      return '<div class="panel">' +
        '<div class="panel__head"><h2>' + S.esc(title) + '</h2>' +
        '<p class="tiny muted">' + seen[title].length + '</p></div>' +
        '<dl class="gl">' + seen[title].map(function (t) {
          return '<dt id="' + S.esc(slug(t.term)) + '">' + S.esc(t.term) + '</dt>' +
                 '<dd>' + S.esc(t.text) + '</dd>';
        }).join('') + '</dl></div>';
    }).join('');

    doc.getElementById('glEmpty').hidden = groups.length > 0;
  }

  function slug(s) {
    return 'w-' + String(s).toLowerCase().replace(/ё/g, 'е').replace(/[^а-яa-z0-9]+/g, '-');
  }

  function start() {
    var find = doc.getElementById('glFind');
    if (!find) return;
    render('');
    var t = null;
    find.addEventListener('input', function () {
      clearTimeout(t);
      t = setTimeout(function () { render(find.value); }, 120);
    });
    /*
     * Пришли по ссылке вида #w-титхи — подсветим слово.
     *
     * Якорь кириллический, и браузер отдаёт его в hash уже
     * процентно-закодированным: «#w-%D1%82%D0%B8...». Без разбора
     * обратно getElementById не найдёт ничего.
     */
    if (root.location.hash) {
      var id = root.location.hash.slice(1);
      try { id = decodeURIComponent(id); } catch (e) { /* уже разобран */ }
      var el = doc.getElementById(id);
      if (el) { el.classList.add('is-hit'); el.scrollIntoView({ block: 'center' }); }
    }
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
  else start();
})(typeof globalThis !== 'undefined' ? globalThis : this, document);
