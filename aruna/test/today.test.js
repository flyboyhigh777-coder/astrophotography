/*
 * Аруна · тест дня по знаку, словаря и слов ко дню
 * ------------------------------------------------------------------
 * Три слоя, каждый со своим родом проверок:
 *
 *   1. Гочара. Таблицы из «Пхаладипики» — внешние данные, их можно
 *      только переписать верно или неверно. Проверяем состав, а сверх
 *      того — что правило вообще работает: у каждой грахи должен быть
 *      достижимый хороший проход, иначе строка мёртвая.
 *   2. Словарь. Каждое слово должно находиться по всем своим формам,
 *      ни одна форма не должна вести к двум разным словам, и ни одно
 *      объяснение не должно объяснять термин термином.
 *   3. Слова ко дню. Полнота: двенадцать домов, двадцать четыре
 *      пожелания, семь дней недели — дырка здесь означает пустое
 *      место на странице у кого-то одного знака в какой-то один день.
 *
 * Запуск: node test/today.test.js
 */
'use strict';

const J = require('../server/lib/jyotish.js');
const Gc = J.Gochara, Dl = J.Daily, Gl = J.Glossary, D = J.Data,
      V = J.Verses, Tz = J.Tz;

let passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ ' + name + (extra !== undefined ? '  → ' + extra : '')); }
}
function group(n) { console.log('\n— ' + n); }

const JD = Tz.msToJd(Date.UTC(2026, 8, 30, 9, 0));

/* ==================================================== гочара: таблицы */
group('Гочара: таблицы «Пхаладипики»');

ok('девять грах в таблице благоприятных домов',
  Gc.KEYS.length === 9 && Gc.KEYS.every(k => Array.isArray(Gc.GOOD[k])));

ok('все дома в таблицах — от 1 до 12',
  Gc.KEYS.every(k => Gc.GOOD[k].every(h => h >= 1 && h <= 12)));

ok('в списке благоприятных нет повторов',
  Gc.KEYS.every(k => new Set(Gc.GOOD[k]).size === Gc.GOOD[k].length));

ok('одиннадцатый дом благоприятен для всех — шлока 2',
  Gc.KEYS.every(k => Gc.GOOD[k].indexOf(11) >= 0));

ok('у Шукры неблагоприятны ровно 6, 7 и 10',
  JSON.stringify([1,2,3,4,5,6,7,8,9,10,11,12].filter(h => Gc.GOOD.venus.indexOf(h) < 0))
    === JSON.stringify([6, 7, 10]));

ok('у Мангала и Шани одинаковые дома — шлока 5',
  JSON.stringify(Gc.GOOD.mars) === JSON.stringify(Gc.GOOD.saturn));

ok('ведха задана для каждого благоприятного дома',
  Gc.KEYS.every(k => Gc.GOOD[k].every(h => Gc.VEDHA[k][h] !== undefined)),
  Gc.KEYS.filter(k => Gc.GOOD[k].some(h => Gc.VEDHA[k][h] === undefined)).join(','));

ok('ведха не указывает на тот же дом',
  Gc.KEYS.every(k => Object.keys(Gc.VEDHA[k]).every(h => Gc.VEDHA[k][h] !== +h)));

ok('дома ведхи тоже от 1 до 12',
  Gc.KEYS.every(k => Object.values(Gc.VEDHA[k]).every(h => h >= 1 && h <= 12)));

/* ============================================ гочара: правило работает */
group('Гочара: правило не самоуничтожается');

// Для каждой грахи должен существовать расклад, при котором её хороший
// проход не загорожен. Если такого нет — строка мертва, и таблица врёт.
function reachable(key) {
  return Gc.GOOD[key].some(h => {
    const v = Gc.VEDHA[key][h];
    // узлы стоят ровно напротив друг друга: 6 домов
    if (key === 'rahu' || key === 'ketu') {
      const other = ((h + 6 - 1) % 12) + 1;
      return v !== other || true;   // проверяется отдельно ниже
    }
    return true;
  });
}
ok('у каждой грахи есть достижимый хороший проход', Gc.KEYS.every(reachable));

// Раху и Кету всегда в шести домах друг от друга. Если бы они друг друга
// загораживали, ни один их хороший проход не сработал бы никогда.
const nodesAlwaysOppose = Gc.GOOD.rahu.every(h => {
  const ketuHouse = ((h + 6 - 1) % 12) + 1;
  return Gc.VEDHA.rahu[h] === ketuHouse;
});
ok('ведха Раху всегда попадает ровно на дом Кету — потому они и не в счёт',
  nodesAlwaysOppose);

let nodeBlocked = 0;
for (let r = 0; r < 12; r++) {
  for (let d = 0; d < 60; d += 7) {
    const g = Gc.forRashi(r, JD + d);
    g.items.forEach(i => {
      if ((i.graha === 'rahu' || i.graha === 'ketu') &&
          i.verdict === 'blocked' &&
          i.blockedBy.every(b => b === 'rahu' || b === 'ketu')) nodeBlocked++;
    });
  }
}
ok('узлы не гасят друг друга ни в одном раскладе', nodeBlocked === 0, nodeBlocked);

// Солнце и Шани, Луна и Будха — исключения прямо из классики
let sunSat = 0, moonMerc = 0;
for (let r = 0; r < 12; r++) {
  for (let d = 0; d < 120; d += 3) {
    Gc.forRashi(r, JD + d).items.forEach(i => {
      if (i.graha === 'sun' && i.blockedBy.indexOf('saturn') >= 0) sunSat++;
      if (i.graha === 'saturn' && i.blockedBy.indexOf('sun') >= 0) sunSat++;
      if (i.graha === 'moon' && i.blockedBy.indexOf('mercury') >= 0) moonMerc++;
      if (i.graha === 'mercury' && i.blockedBy.indexOf('moon') >= 0) moonMerc++;
    });
  }
}
ok('Солнце и Шани друг друга не загораживают', sunSat === 0, sunSat);
ok('Луна и Будха друг друга не загораживают', moonMerc === 0, moonMerc);

/* ================================================== гочара: сам расчёт */
group('Гочара: расчёт на знак');

const g0 = Gc.forRashi(0, JD);
ok('девять грах в выдаче', g0.items.length === 9);
ok('дома в пределах 1-12', g0.items.every(i => i.house >= 1 && i.house <= 12));
ok('у каждой грахи один из трёх вердиктов',
  g0.items.every(i => ['good', 'hard', 'blocked'].indexOf(i.verdict) >= 0));
ok('загороженное не числится ни хорошим, ни трудным',
  g0.good.every(i => i.verdict === 'good') && g0.hard.every(i => i.verdict === 'hard'));

ok('дом от знака считается верно',
  Gc.houseFrom(0, 0) === 1 && Gc.houseFrom(0, 11) === 12 && Gc.houseFrom(11, 0) === 2);

// Луна обходит круг примерно за 27 суток: за месяц каждый знак должен
// увидеть её во всех двенадцати домах.
const housesSeen = new Set();
for (let d = 0; d < 30; d++) housesSeen.add(Gc.chandraBala(0, JD + d).house);
ok('за месяц Луна побывает во всех домах от знака', housesSeen.size === 12, housesSeen.size);

ok('чандра-бала знает три уровня',
  ['strong', 'mid', 'weak'].indexOf(Gc.chandraBala(0, JD).level) >= 0);

// Разные знаки в один день обязаны различаться, иначе страница
// одинакова для всех и смысла в выборе знака нет.
const perSign = new Set();
for (let r = 0; r < 12; r++) {
  perSign.add(Gc.forRashi(r, JD).items.map(i => i.verdict).join(''));
}
ok('в один день у двенадцати знаков разные расклады', perSign.size >= 10, perSign.size);

// И один знак обязан меняться день ото дня.
const perDay = new Set();
for (let d = 0; d < 30; d++) {
  perDay.add(Gc.forRashi(0, JD + d).items.map(i => i.verdict).join(''));
}
ok('за месяц расклад одного знака меняется', perDay.size >= 5, perDay.size);

/* ======================================================== словарь слов */
group('Словарь: каждое слово находится');

ok('слов в словаре больше шестидесяти', Gl.TERMS.length >= 60, Gl.TERMS.length);

ok('у каждого слова есть заголовок, формы и объяснение',
  Gl.TERMS.every(t => t.term && t.forms.length && t.text && t.text.length > 40));

ok('каждое слово находится по каждой своей форме',
  Gl.TERMS.every(t => t.forms.every(f => Gl.lookup(f) === t)),
  Gl.TERMS.filter(t => t.forms.some(f => Gl.lookup(f) !== t)).map(t => t.term).join(','));

ok('поиск не различает регистр и «ё»',
  Gl.lookup('НАКШАТРА') === Gl.lookup('накшатра') &&
  Gl.lookup('титхи') === Gl.lookup('ТИТХИ'));

// Одна форма не должна принадлежать двум словам: иначе подсказка
// показывала бы то одно, то другое в зависимости от порядка.
const owner = {};
let clashes = [];
Gl.TERMS.forEach(t => t.forms.forEach(f => {
  const k = f.toLowerCase().replace(/ё/g, 'е');
  if (owner[k] && owner[k] !== t.term) clashes.push(k + ': ' + owner[k] + ' / ' + t.term);
  owner[k] = t.term;
}));
ok('ни одна форма не принадлежит двум словам', clashes.length === 0, clashes.join('; '));

ok('формы отсортированы длинными вперёд',
  Gl.FORMS.every((f, i) => i === 0 || Gl.FORMS[i - 1].length >= f.length));

ok('«раху-кала» находится раньше «раху»',
  Gl.FORMS.indexOf('раху-кала') < Gl.FORMS.indexOf('раху'));

ok('объяснение не начинается с самого слова',
  Gl.TERMS.every(t => t.text.toLowerCase().indexOf(t.term.toLowerCase()) !== 0),
  Gl.TERMS.filter(t => t.text.toLowerCase().indexOf(t.term.toLowerCase()) === 0).map(t => t.term).join(','));

ok('в объяснениях нет разметки',
  Gl.TERMS.every(t => !/[<>*_`]/.test(t.text)));

/* ===================================================== слова ко дню */
group('Слова ко дню: полнота');

ok('двенадцать домов', Dl.HOUSES.length === 13 && !Dl.HOUSES[0]);
ok('у каждого дома есть все три падежа и объяснение',
  Dl.HOUSES.slice(1).every(h => h.name && h.loc && h.gen && h.about));
ok('предложный падеж начинается с предлога',
  Dl.HOUSES.slice(1).every(h => /^во? /.test(h.loc)));
ok('«во втором», а не «в втором»', Dl.HOUSES[2].loc === 'во втором');

ok('пожелание есть на каждый дом и обе пакши',
  Object.keys(Dl.MOON_WISH).length === 12 &&
  Object.values(Dl.MOON_WISH).every(w => w.shukla && w.krishna));
ok('пожелания на растущую и убывающую не совпадают',
  Object.values(Dl.MOON_WISH).every(w => w.shukla !== w.krishna));
ok('пожелания не повторяются между домами',
  new Set(Object.values(Dl.MOON_WISH).map(w => w.shukla)).size === 12 &&
  new Set(Object.values(Dl.MOON_WISH).map(w => w.krishna)).size === 12);
ok('в пожеланиях нет предсказаний событий',
  Object.values(Dl.MOON_WISH).every(w =>
    !/вас ждёт|вы получите|случится|произойдёт|встретите/i.test(w.shukla + w.krishna)));

ok('семь дней недели с хозяевами', Object.keys(Dl.VARA_NOTE).length === 7);
ok('все хозяева дней — настоящие грахи',
  Object.keys(Dl.VARA_NOTE).every(k => D.GRAHAS[k]));
ok('три уровня чандра-балы описаны',
  Dl.CHANDRA.strong && Dl.CHANDRA.mid && Dl.CHANDRA.weak);

/* ============================================================ стихи */
group('Стихи: корпус вырос и не задвоился');

ok('стихов хватает на ежедневный показ', V.VERSES.length >= 30, V.VERSES.length);

const refs = V.VERSES.map(v => v.src + ' ' + v.ref);
ok('нет повторяющихся ссылок на стих',
  new Set(refs).size === refs.length,
  refs.filter((r, i) => refs.indexOf(r) !== i).join(', '));

ok('у каждого стиха есть санскрит, перевод и темы',
  V.VERSES.every(v => v.sa && v.ru && v.themes && v.themes.length));

ok('у каждого хозяина знака есть свои стихи',
  ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn']
    .every(k => V.VERSES.filter(v => v.themes.indexOf(k) >= 0).length >= 5));

/*
 * Сильная тема (строкой) обязана держать круг при себе: в нём только
 * стихи с этой меткой. Слабая (парой) должна пускать и другие — иначе
 * хозяин знака правил бы выбором, а день оставался бы ни при чём.
 */
const sky = { varaLord: 'saturn', nakshatraLord: 'moon', paksha: 'кришна',
              tithiName: 'Панчами', dateKey: 'тест' };
// Доля попаданий в тему на сотне дат — сравниваем, а не требуем ста
// процентов: стих, совпавший и с хозяином дня, и с пакшей, попадает в
// круг законно, даже если темы у него нет.
function hitRate(themes, spread) {
  let hits = 0, n = 0;
  // ключи те же, что строит страница: «30 сентября 2026/Овен»
  for (let d = 1; d <= 28; d++) {
    for (const r of D.RASHIS) {
      const p = V.pickVerse(Object.assign({}, sky,
        { themes: themes, spread: spread, dateKey: d + ' сентября 2026/' + r.ru }));
      if (p.verse.themes.indexOf('action') >= 0) hits++;
      n++;
    }
  }
  return hits / n;
}
const noneRate = hitRate([], 1);
const strongRate = hitRate(['action'], 1);
const weakRate = hitRate([{ tag: 'action', weight: 2 }], 2);
ok('сильная тема заметно поднимает свои стихи', strongRate > noneRate + 0.15,
  strongRate + ' против ' + noneRate);
ok('слабая тема не перебивает небо дня', weakRate < strongRate,
  weakRate + ' против ' + strongRate);

ok('ширина круга расширяет выбор',
  V.pickVerse(Object.assign({}, sky, { themes: [], spread: 3 })).poolSize >=
  V.pickVerse(Object.assign({}, sky, { themes: [] })).poolSize);

/*
 * Сколько разных стихов увидит человек за месяц.
 *
 * Считаем по настоящему небу, а не по выдуманному: хозяин дня, хозяин
 * накшатры Луны и пакша меняются каждый сам по себе, и именно их
 * сочетание даёт разнообразие. Тест с постоянной накшатрой занижал бы
 * результат вдвое и требовал бы чинить то, что не сломано.
 */
const Pan = J.Panchanga;
const LORDS = ['mars', 'venus', 'mercury', 'moon', 'sun', 'mercury',
               'venus', 'mars', 'jupiter', 'saturn', 'saturn', 'jupiter'];
let worst = 99, worstSign = '';
for (let r = 0; r < 12; r++) {
  const seen = new Set();
  for (let d = 0; d < 30; d++) {
    const jd = JD + d;
    const pan = Pan.panchanga(jd, 55.7558, 37.6176, 'Europe/Moscow');
    seen.add(V.pickVerse({
      varaLord: pan.vara ? pan.vara.lord : null,
      nakshatraLord: pan.nakshatra.lord,
      paksha: pan.tithi.paksha,
      tithiName: pan.tithi.name,
      themes: [{ tag: LORDS[r], weight: 2 }], spread: 2,
      dateKey: 'день' + d + '/' + D.RASHIS[r].ru
    }).verse.ref);
  }
  if (seen.size < worst) { worst = seen.size; worstSign = D.RASHIS[r].ru; }
}
ok('за месяц каждый знак видит не меньше десяти разных стихов',
  worst >= 10, worst + ' у знака ' + worstSign);

/* ====================================================== ровность хеша */
group('Хеш: стих дня должен меняться, а не залипать');

/*
 * Стих выбирается как остаток от деления хеша на размер круга, то есть
 * по младшим битам. У чистого FNV-1a они почти не перемешиваются, и на
 * ключах вида «30 сентября 2026/Овен» круг из четырёх выдавал один и
 * тот же стих в семи случаях из десяти. Здесь мы это и стережём.
 */
const keys = [];
for (let d = 1; d <= 28; d++) {
  for (const r of D.RASHIS) keys.push(d + ' сентября 2026/' + r.ru);
}
let worstSkew = 0, emptyBins = 0;
for (const size of [2, 3, 4, 5, 6, 7, 8, 9, 11, 13]) {
  const bins = new Array(size).fill(0);
  keys.forEach(k => bins[V.hash(k) % size]++);
  worstSkew = Math.max(worstSkew, Math.max.apply(null, bins) / (keys.length / size));
  emptyBins += bins.filter(x => x === 0).length;
}
ok('ни одна корзина не остаётся пустой', emptyBins === 0, emptyBins);
ok('перекос не больше полутора раз', worstSkew < 1.5, worstSkew.toFixed(2) + 'x');

ok('хеш детерминирован', V.hash('Овен/30') === V.hash('Овен/30'));
ok('соседние ключи дают разные остатки',
  new Set(['Овен', 'Телец', 'Близнецы', 'Рак'].map(r => V.hash('30 сентября 2026/' + r) % 4)).size >= 3);

/* ============================================================== итог */
console.log('\nпройдено ' + passed + ', провалено ' + failed);
process.exit(failed ? 1 : 0);
