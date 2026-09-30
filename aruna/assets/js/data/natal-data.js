/*
 * Аруна · западная астрология: справочные таблицы
 * ==================================================================
 * Тропический зодиак, семь классических светил плюс три дальние
 * планеты, аспекты с орбисами, эссенциальные достоинства.
 *
 * Про толкования. Здесь нет готовых абзацев «Солнце в Овне» — их
 * пришлось бы или писать тысячу штук, или у кого-то взять. Вместо
 * этого у каждой части карты есть свои опорные слова: у планеты —
 * что она делает и в чём её тень, у знака — как она это делает, у
 * дома — где, у аспекта — на каких условиях. Текст собирается из них
 * по правилу, и правило показывается рядом. Так честнее и
 * проверяемее: видно, из чего получился вывод.
 *
 * Достоинства даны по классическим таблицам: термы египетские,
 * тритоны по Доротею, деканы халдейские. Где школы расходятся, взят
 * самый распространённый вариант и это помечено.
 */
(function (root) {
  'use strict';

  /* ------------------------------------------------------------ знаки */

  var ELEMENTS = {
    fire:  { ru: 'огонь', about: 'порыв, вера в возможность, действие раньше расчёта' },
    earth: { ru: 'земля', about: 'вещество, польза, проверка руками' },
    air:   { ru: 'воздух', about: 'связь, слово, взгляд со стороны' },
    water: { ru: 'вода',  about: 'чувство, память, вовлечённость' }
  };

  var MODES = {
    cardinal: { ru: 'кардинальный', about: 'начинает' },
    fixed:    { ru: 'фиксированный', about: 'держит' },
    mutable:  { ru: 'мутабельный',  about: 'меняет и приспосабливает' }
  };

  /* ru — родительный для «Солнце в …», in — предложный */
  var SIGNS = [
    { key: 'aries', ru: 'Овен', in: 'Овне', gen: 'Овна', glyph: '♈',
      element: 'fire', mode: 'cardinal', ruler: 'mars', exalt: 'sun', fall: 'saturn', detriment: 'venus',
      style: 'прямо и сразу', keys: ['натиск', 'почин', 'нетерпение'],
      about: 'делает первым и разбирается потом' },
    { key: 'taurus', ru: 'Телец', in: 'Тельце', gen: 'Тельца', glyph: '♉',
      element: 'earth', mode: 'fixed', ruler: 'venus', exalt: 'moon', fall: null, detriment: 'mars',
      style: 'медленно и надёжно', keys: ['устойчивость', 'вкус', 'упрямство'],
      about: 'доводит до вещественного и не любит, когда торопят' },
    { key: 'gemini', ru: 'Близнецы', in: 'Близнецах', gen: 'Близнецов', glyph: '♊',
      element: 'air', mode: 'mutable', ruler: 'mercury', exalt: null, fall: null, detriment: 'jupiter',
      style: 'через слово и обмен', keys: ['любознательность', 'ловкость', 'разбросанность'],
      about: 'схватывает быстро и переключается ещё быстрее' },
    { key: 'cancer', ru: 'Рак', in: 'Раке', gen: 'Рака', glyph: '♋',
      element: 'water', mode: 'cardinal', ruler: 'moon', exalt: 'jupiter', fall: 'mars', detriment: 'saturn',
      style: 'бережно и вкруговую', keys: ['забота', 'память', 'обидчивость'],
      about: 'сначала создаёт безопасное место, потом действует' },
    { key: 'leo', ru: 'Лев', in: 'Льве', gen: 'Льва', glyph: '♌',
      element: 'fire', mode: 'fixed', ruler: 'sun', exalt: null, fall: null, detriment: 'saturn',
      style: 'открыто и щедро', keys: ['достоинство', 'щедрость', 'потребность в признании'],
      about: 'делает так, чтобы это было видно и не стыдно' },
    { key: 'virgo', ru: 'Дева', in: 'Деве', gen: 'Девы', glyph: '♍',
      element: 'earth', mode: 'mutable', ruler: 'mercury', exalt: 'mercury', fall: 'venus', detriment: 'jupiter',
      style: 'разбирая на части', keys: ['точность', 'служение', 'придирчивость'],
      about: 'улучшает то, что уже есть, и видит изъян раньше целого' },
    { key: 'libra', ru: 'Весы', in: 'Весах', gen: 'Весов', glyph: '♎',
      element: 'air', mode: 'cardinal', ruler: 'venus', exalt: 'saturn', fall: 'sun', detriment: 'mars',
      style: 'соразмеряя с другим', keys: ['равновесие', 'такт', 'нерешительность'],
      about: 'взвешивает и ищет форму, которая устроит обоих' },
    { key: 'scorpio', ru: 'Скорпион', in: 'Скорпионе', gen: 'Скорпиона', glyph: '♏',
      element: 'water', mode: 'fixed', ruler: 'mars', exalt: null, fall: 'moon', detriment: 'venus',
      style: 'до дна и без полутонов', keys: ['глубина', 'выдержка', 'скрытность'],
      about: 'идёт туда, где неприятно, и там находит настоящее' },
    { key: 'sagittarius', ru: 'Стрелец', in: 'Стрельце', gen: 'Стрельца', glyph: '♐',
      element: 'fire', mode: 'mutable', ruler: 'jupiter', exalt: null, fall: null, detriment: 'mercury',
      style: 'широко и на вырост', keys: ['смысл', 'размах', 'необязательность'],
      about: 'ищет, ради чего, и теряет интерес к деталям' },
    { key: 'capricorn', ru: 'Козерог', in: 'Козероге', gen: 'Козерога', glyph: '♑',
      element: 'earth', mode: 'cardinal', ruler: 'saturn', exalt: 'mars', fall: 'jupiter', detriment: 'moon',
      style: 'строя и рассчитывая срок', keys: ['ответственность', 'выдержка', 'сухость'],
      about: 'берёт долгую дистанцию и не ждёт лёгкого' },
    { key: 'aquarius', ru: 'Водолей', in: 'Водолее', gen: 'Водолея', glyph: '♒',
      element: 'air', mode: 'fixed', ruler: 'saturn', exalt: null, fall: null, detriment: 'sun',
      style: 'по своему правилу', keys: ['независимость', 'общее дело', 'отстранённость'],
      about: 'смотрит на своё со стороны и держится принципа' },
    { key: 'pisces', ru: 'Рыбы', in: 'Рыбах', gen: 'Рыб', glyph: '♓',
      element: 'water', mode: 'mutable', ruler: 'jupiter', exalt: 'venus', fall: 'mercury', detriment: 'mercury',
      style: 'растворяя границы', keys: ['сочувствие', 'воображение', 'размытость'],
      about: 'чувствует общее целое и плохо различает, где кончается своё' }
  ];

  /* ---------------------------------------------------------- планеты */

  /* need — что планета в человеке хочет; does — что она делает;
     shadow — во что она обращается, когда ей тесно. */
  var PLANETS = {
    sun: { ru: 'Солнце', glyph: '☉', kind: 'light', speed: 0.9856,
      need: 'быть собой в полный рост', does: 'даёт волю, ось и чувство своего пути',
      shadow: 'требование признания вместо дела', domain: 'воля, отец, здоровье, самое главное' },
    moon: { ru: 'Луна', glyph: '☾', kind: 'light', speed: 13.176,
      need: 'быть в безопасности и в своём', does: 'откликается, помнит, задаёт настроение',
      shadow: 'привычка вместо выбора', domain: 'чувства, дом, мать, привычки, тело' },
    mercury: { ru: 'Меркурий', glyph: '☿', kind: 'personal', speed: 1.383,
      need: 'понять и назвать', does: 'связывает, считает, переводит с языка на язык',
      shadow: 'разговор вместо поступка', domain: 'речь, ум, обучение, дороги, руки' },
    venus: { ru: 'Венера', glyph: '♀', kind: 'personal', speed: 1.2,
      need: 'быть в согласии и в красоте', does: 'сближает, выбирает, находит меру',
      shadow: 'угождать, лишь бы не ссориться', domain: 'любовь, вкус, деньги, союзы' },
    mars: { ru: 'Марс', glyph: '♂', kind: 'personal', speed: 0.524,
      need: 'сделать и отстоять', does: 'даёт силу, злость и способность начать',
      shadow: 'война там, где хватило бы разговора', domain: 'воля к действию, спор, риск, желание' },
    jupiter: { ru: 'Юпитер', glyph: '♃', kind: 'social', speed: 0.083,
      need: 'видеть смысл и расти', does: 'расширяет, учит, даёт веру и удачу',
      shadow: 'обещание больше, чем можно', domain: 'смысл, право, учитель, дальние края' },
    saturn: { ru: 'Сатурн', glyph: '♄', kind: 'social', speed: 0.033,
      need: 'опереться на прочное', does: 'ограничивает, держит форму, требует срока',
      shadow: 'страх, выдающий себя за осторожность', domain: 'время, порядок, долг, зрелость' },
    uranus: { ru: 'Уран', glyph: '♅', kind: 'outer', speed: 0.0117,
      need: 'быть свободным от навязанного', does: 'ломает привычное и показывает другое устройство',
      shadow: 'разрыв ради разрыва', domain: 'свобода, внезапное, общее будущее' },
    neptune: { ru: 'Нептун', glyph: '♆', kind: 'outer', speed: 0.006,
      need: 'быть частью большего', does: 'растворяет границы, даёт сострадание и образ',
      shadow: 'туман, в котором удобно не решать', domain: 'вера, искусство, жертва, иллюзия' },
    pluto: { ru: 'Плутон', glyph: '♇', kind: 'outer', speed: 0.004,
      need: 'дойти до сути и выдержать', does: 'обнажает власть, страх и то, что нельзя вернуть',
      shadow: 'контроль вместо доверия', domain: 'кризис, власть, глубина, перерождение' },
    // узлы и Лилит — не тела, но карту без них не читают
    node: { ru: 'Северный узел', glyph: '☊', kind: 'point', speed: -0.053,
      need: 'идти туда, где ещё не был', does: 'показывает непривычное направление роста',
      shadow: 'тянуть в привычное и звать это судьбой', domain: 'направление, задача, рост' },
    southnode: { ru: 'Южный узел', glyph: '☋', kind: 'point', speed: -0.053,
      need: 'опираться на уже умеемое', does: 'показывает накатанное и лёгкое',
      shadow: 'жить прошлым умением', domain: 'багаж, привычное, отдача' },
    lilith: { ru: 'Лилит', glyph: '⚸', kind: 'point', speed: 0.111,
      need: 'не соглашаться на неподходящее', does: 'отмечает место отказа и неудобной правды',
      shadow: 'отвержение вместо разговора', domain: 'отказ, теневое, неприрученное' },
    chiron: null
  };

  /* Порядок вывода: светила, личные, социальные, дальние, точки. */
  var PLANET_ORDER = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn',
                      'uranus', 'neptune', 'pluto', 'node', 'southnode', 'lilith'];
  /* Те, что участвуют в аспектах и достоинствах по умолчанию. */
  var ASPECTING = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn',
                   'uranus', 'neptune', 'pluto', 'node'];
  var CLASSICAL = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn'];

  /* ------------------------------------------------------------ дома */

  var HOUSES = [
    { n: 1,  ru: 'Первый дом',      title: 'я и тело', about: 'внешность, первое впечатление, способ входить в жизнь', angular: true },
    { n: 2,  ru: 'Второй дом',      title: 'своё и цена', about: 'деньги, вещи, ценности, чем человек готов подкрепить слово', angular: false },
    { n: 3,  ru: 'Третий дом',      title: 'речь и ближний круг', about: 'братья и сёстры, учёба, короткие дороги, разговор', angular: false },
    { n: 4,  ru: 'Четвёртый дом',   title: 'дом и корни', about: 'семья, родитель, земля, то, куда возвращаются', angular: true },
    { n: 5,  ru: 'Пятый дом',       title: 'творчество и дети', about: 'игра, влюблённость, дети, всё, что делается ради самого себя', angular: false },
    { n: 6,  ru: 'Шестой дом',      title: 'труд и здоровье', about: 'ежедневная работа, режим, болезни, служение', angular: false },
    { n: 7,  ru: 'Седьмой дом',     title: 'другой', about: 'брак, союзы, договоры, открытые противники', angular: true },
    { n: 8,  ru: 'Восьмой дом',     title: 'общее и предельное', about: 'чужие деньги, кризис, близость, наследство, смерть', angular: false },
    { n: 9,  ru: 'Девятый дом',     title: 'смысл и даль', about: 'вера, высшее образование, дальние страны, закон', angular: false },
    { n: 10, ru: 'Десятый дом',     title: 'дело и имя', about: 'призвание, положение, то, чем человек виден обществу', angular: true },
    { n: 11, ru: 'Одиннадцатый дом', title: 'круг и надежда', about: 'друзья, сообщества, цели, то, что делается вместе', angular: false },
    { n: 12, ru: 'Двенадцатый дом',  title: 'скрытое и отпускание', about: 'уединение, больницы, тайное, то, что человек не видит в себе', angular: false }
  ];

  /* --------------------------------------------------------- аспекты */

  /* orb — базовый орбис; светила получают надбавку (см. aspects.js).
     nature: 'hard' напряжённый, 'soft' гармоничный, 'neutral' смешанный. */
  var ASPECTS = [
    { key: 'conjunction', ru: 'Соединение', glyph: '☌', angle: 0, orb: 8, nature: 'neutral', major: true,
      about: 'планеты слиты: действуют как одно, к добру или к худу — по их природе' },
    { key: 'opposition', ru: 'Оппозиция', glyph: '☍', angle: 180, orb: 8, nature: 'hard', major: true,
      about: 'две правды друг напротив друга; решается не выбором одной, а признанием обеих' },
    { key: 'trine', ru: 'Тригон', glyph: '△', angle: 120, orb: 7, nature: 'soft', major: true,
      about: 'даётся легко и потому редко замечается; талант, который не пришлось добывать' },
    { key: 'square', ru: 'Квадрат', glyph: '□', angle: 90, orb: 7, nature: 'hard', major: true,
      about: 'трение, которое не проходит само; обычно именно оно и заставляет расти' },
    { key: 'sextile', ru: 'Секстиль', glyph: '⚹', angle: 60, orb: 5, nature: 'soft', major: true,
      about: 'возможность, которая работает, если её взять; сама не случается' },
    { key: 'quincunx', ru: 'Квиконс', glyph: '⚻', angle: 150, orb: 3, nature: 'hard', major: false,
      about: 'две области без общего языка: приходится всё время подстраивать одно под другое' },
    { key: 'semisquare', ru: 'Полуквадрат', glyph: '∠', angle: 45, orb: 2, nature: 'hard', major: false,
      about: 'мелкое раздражение, которое копится' },
    { key: 'sesquisquare', ru: 'Полутораквадрат', glyph: '⚼', angle: 135, orb: 2, nature: 'hard', major: false,
      about: 'напряжение, прорывающееся на поздней стадии дела' },
    { key: 'semisextile', ru: 'Полусекстиль', glyph: '⚺', angle: 30, orb: 2, nature: 'neutral', major: false,
      about: 'соседство: связь есть, но без общей природы' },
    { key: 'quintile', ru: 'Квинтиль', glyph: 'Q', angle: 72, orb: 2, nature: 'soft', major: false,
      about: 'своеобразная одарённость, которую человек обычно не считает даром' }
  ];

  /* ------------------------------------------- эссенциальные достоинства */

  /* Термы египетские: [до какого градуса, планета]. Классическая таблица. */
  var TERMS = {
    aries:       [[6,'jupiter'],[12,'venus'],[20,'mercury'],[25,'mars'],[30,'saturn']],
    taurus:      [[8,'venus'],[14,'mercury'],[22,'jupiter'],[27,'saturn'],[30,'mars']],
    gemini:      [[6,'mercury'],[12,'jupiter'],[17,'venus'],[24,'mars'],[30,'saturn']],
    cancer:      [[7,'mars'],[13,'venus'],[19,'mercury'],[26,'jupiter'],[30,'saturn']],
    leo:         [[6,'jupiter'],[11,'venus'],[18,'saturn'],[24,'mercury'],[30,'mars']],
    virgo:       [[7,'mercury'],[17,'venus'],[21,'jupiter'],[28,'mars'],[30,'saturn']],
    libra:       [[6,'saturn'],[14,'mercury'],[21,'jupiter'],[28,'venus'],[30,'mars']],
    scorpio:     [[7,'mars'],[11,'venus'],[19,'mercury'],[24,'jupiter'],[30,'saturn']],
    sagittarius: [[12,'jupiter'],[17,'venus'],[21,'mercury'],[26,'saturn'],[30,'mars']],
    capricorn:   [[7,'mercury'],[14,'jupiter'],[22,'venus'],[26,'saturn'],[30,'mars']],
    aquarius:    [[7,'mercury'],[13,'venus'],[20,'jupiter'],[25,'mars'],[30,'saturn']],
    pisces:      [[12,'venus'],[16,'jupiter'],[19,'mercury'],[28,'mars'],[30,'saturn']]
  };

  /* Деканы (лица) по халдейскому ряду: Марс, Солнце, Венера, Меркурий,
     Луна, Сатурн, Юпитер — подряд по всем 36 декадам от Овна. */
  var CHALDEAN = ['mars', 'sun', 'venus', 'mercury', 'moon', 'saturn', 'jupiter'];

  /* Тритоны по Доротею: [дневной, ночной, участвующий]. */
  var TRIPLICITY = {
    fire:  ['sun', 'jupiter', 'saturn'],
    earth: ['venus', 'moon', 'mars'],
    air:   ['saturn', 'mercury', 'jupiter'],
    water: ['venus', 'mars', 'moon']
  };

  /* Очки достоинства для альмутена — классическая шкала Ибн Эзры. */
  var DIGNITY_SCORE = { ruler: 5, exalt: 4, triplicity: 3, term: 2, face: 1 };

  /* --------------------------------------------------------- помощники */

  function signOf(lon) { return Math.floor(((lon % 360) + 360) % 360 / 30); }
  function degInSign(lon) { var l = ((lon % 360) + 360) % 360; return l - Math.floor(l / 30) * 30; }
  function signByKey(key) {
    for (var i = 0; i < SIGNS.length; i++) if (SIGNS[i].key === key) return SIGNS[i];
    return null;
  }
  function aspectByKey(key) {
    for (var i = 0; i < ASPECTS.length; i++) if (ASPECTS[i].key === key) return ASPECTS[i];
    return null;
  }

  /** Градусы в виде 12°34′. */
  function dms(deg) {
    var d = Math.floor(deg), m = Math.floor((deg - d) * 60);
    return d + '°' + String(m).padStart(2, '0') + '′';
  }

  root.ArunaNatalData = {
    SIGNS: SIGNS, PLANETS: PLANETS, HOUSES: HOUSES, ASPECTS: ASPECTS,
    ELEMENTS: ELEMENTS, MODES: MODES,
    PLANET_ORDER: PLANET_ORDER, ASPECTING: ASPECTING, CLASSICAL: CLASSICAL,
    TERMS: TERMS, CHALDEAN: CHALDEAN, TRIPLICITY: TRIPLICITY, DIGNITY_SCORE: DIGNITY_SCORE,
    signOf: signOf, degInSign: degInSign, signByKey: signByKey, aspectByKey: aspectByKey,
    dms: dms
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
