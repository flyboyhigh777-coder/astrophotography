/*
 * Аруна · справочные таблицы джйотиш
 * ------------------------------------------------------------------
 * Раши, накшатры, грахи, бхавы, панчанга. Названия даны в санскритской
 * традиции с привычным русским эквивалентом рядом — чтобы человек,
 * знающий «Овна», не терялся в «Меше».
 *
 * Достоинства грах (экзальтация/дебилитация/мулатрикона), натуральные
 * дружбы и дришти — по классическому набору (Брихат-Парашара-Хора-Шастра).
 */
(function (root) {
  'use strict';

  /* ------------------------------------------------------------- раши */
  // lord — ключ грахи-хозяина; tattva — стихия; mobility: chara/sthira/dvi
  var RASHIS = [
    { sa: 'Меша',     ru: 'Овен',      lord: 'mars',    tattva: 'огонь',  mobility: 'chara',  sex: 'м' },
    { sa: 'Вришабха', ru: 'Телец',     lord: 'venus',   tattva: 'земля',  mobility: 'sthira', sex: 'ж' },
    { sa: 'Митхуна',  ru: 'Близнецы',  lord: 'mercury', tattva: 'воздух', mobility: 'dvi',    sex: 'м' },
    { sa: 'Карка',    ru: 'Рак',       lord: 'moon',    tattva: 'вода',   mobility: 'chara',  sex: 'ж' },
    { sa: 'Симха',    ru: 'Лев',       lord: 'sun',     tattva: 'огонь',  mobility: 'sthira', sex: 'м' },
    { sa: 'Канья',    ru: 'Дева',      lord: 'mercury', tattva: 'земля',  mobility: 'dvi',    sex: 'ж' },
    { sa: 'Тула',     ru: 'Весы',      lord: 'venus',   tattva: 'воздух', mobility: 'chara',  sex: 'м' },
    { sa: 'Вришчика', ru: 'Скорпион',  lord: 'mars',    tattva: 'вода',   mobility: 'sthira', sex: 'ж' },
    { sa: 'Дхану',    ru: 'Стрелец',   lord: 'jupiter', tattva: 'огонь',  mobility: 'dvi',    sex: 'м' },
    { sa: 'Макара',   ru: 'Козерог',   lord: 'saturn',  tattva: 'земля',  mobility: 'chara',  sex: 'ж' },
    { sa: 'Кумбха',   ru: 'Водолей',   lord: 'saturn',  tattva: 'воздух', mobility: 'sthira', sex: 'м' },
    { sa: 'Мина',     ru: 'Рыбы',      lord: 'jupiter', tattva: 'вода',   mobility: 'dvi',    sex: 'ж' }
  ];

  var MOBILITY_RU = { chara: 'подвижный', sthira: 'устойчивый', dvi: 'двойственный' };

  /* --------------------------------------------------------- накшатры */
  // lord — хозяин по Вимшоттари; yoni/gana/nadi — для сопоставления карт
  var NAKSHATRAS = [
    { sa: 'Ашвини',            deity: 'Ашвины',        lord: 'ketu',    yoni: 'horse',    gana: 'deva',     nadi: 'adi'    },
    { sa: 'Бхарани',           deity: 'Яма',           lord: 'venus',   yoni: 'elephant', gana: 'manushya', nadi: 'madhya' },
    { sa: 'Криттика',          deity: 'Агни',          lord: 'sun',     yoni: 'sheep',    gana: 'rakshasa', nadi: 'antya'  },
    { sa: 'Рохини',            deity: 'Брахма',        lord: 'moon',    yoni: 'serpent',  gana: 'manushya', nadi: 'antya'  },
    { sa: 'Мригашира',         deity: 'Сома',          lord: 'mars',    yoni: 'serpent',  gana: 'deva',     nadi: 'madhya' },
    { sa: 'Ардра',             deity: 'Рудра',         lord: 'rahu',    yoni: 'dog',      gana: 'manushya', nadi: 'adi'    },
    { sa: 'Пунарвасу',         deity: 'Адити',         lord: 'jupiter', yoni: 'cat',      gana: 'deva',     nadi: 'adi'    },
    { sa: 'Пушья',             deity: 'Брихаспати',    lord: 'saturn',  yoni: 'sheep',    gana: 'deva',     nadi: 'madhya' },
    { sa: 'Ашлеша',            deity: 'Наги',          lord: 'mercury', yoni: 'cat',      gana: 'rakshasa', nadi: 'antya'  },
    { sa: 'Магха',             deity: 'Питри',         lord: 'ketu',    yoni: 'rat',      gana: 'rakshasa', nadi: 'antya'  },
    { sa: 'Пурва Пхалгуни',    deity: 'Бхага',         lord: 'venus',   yoni: 'rat',      gana: 'manushya', nadi: 'madhya' },
    { sa: 'Уттара Пхалгуни',   deity: 'Арьяман',       lord: 'sun',     yoni: 'cow',      gana: 'manushya', nadi: 'adi'    },
    { sa: 'Хаста',             deity: 'Савитар',       lord: 'moon',    yoni: 'buffalo',  gana: 'deva',     nadi: 'adi'    },
    { sa: 'Читра',            deity: 'Вишвакарман',   lord: 'mars',    yoni: 'tiger',    gana: 'rakshasa', nadi: 'madhya' },
    { sa: 'Свати',             deity: 'Ваю',           lord: 'rahu',    yoni: 'buffalo',  gana: 'deva',     nadi: 'antya'  },
    { sa: 'Вишакха',           deity: 'Индра и Агни',  lord: 'jupiter', yoni: 'tiger',    gana: 'rakshasa', nadi: 'antya'  },
    { sa: 'Анурадха',          deity: 'Митра',         lord: 'saturn',  yoni: 'deer',     gana: 'deva',     nadi: 'madhya' },
    { sa: 'Джьештха',          deity: 'Индра',         lord: 'mercury', yoni: 'deer',     gana: 'rakshasa', nadi: 'adi'    },
    { sa: 'Мула',              deity: 'Ниррити',       lord: 'ketu',    yoni: 'dog',      gana: 'rakshasa', nadi: 'adi'    },
    { sa: 'Пурва Ашадха',      deity: 'Апас',          lord: 'venus',   yoni: 'monkey',   gana: 'manushya', nadi: 'madhya' },
    { sa: 'Уттара Ашадха',     deity: 'Вишвадэвы',     lord: 'sun',     yoni: 'mongoose', gana: 'manushya', nadi: 'antya'  },
    { sa: 'Шравана',           deity: 'Вишну',         lord: 'moon',    yoni: 'monkey',   gana: 'deva',     nadi: 'antya'  },
    { sa: 'Дхаништха',         deity: 'Васу',          lord: 'mars',    yoni: 'lion',     gana: 'rakshasa', nadi: 'madhya' },
    { sa: 'Шатабхиша',         deity: 'Варуна',        lord: 'rahu',    yoni: 'horse',    gana: 'rakshasa', nadi: 'adi'    },
    { sa: 'Пурва Бхадрапада',  deity: 'Аджаикапада',   lord: 'jupiter', yoni: 'lion',     gana: 'manushya', nadi: 'adi'    },
    { sa: 'Уттара Бхадрапада', deity: 'Ахирбудхнья',   lord: 'saturn',  yoni: 'cow',      gana: 'manushya', nadi: 'madhya' },
    { sa: 'Ревати',            deity: 'Пушан',         lord: 'mercury', yoni: 'elephant', gana: 'deva',     nadi: 'antya'  }
  ];

  var YONI_RU = {
    horse: 'конь', elephant: 'слон', sheep: 'овца', serpent: 'змея', dog: 'собака',
    cat: 'кошка', rat: 'крыса', cow: 'корова', buffalo: 'буйвол', tiger: 'тигр',
    deer: 'лань', monkey: 'обезьяна', mongoose: 'мангуст', lion: 'лев'
  };
  var GANA_RU = { deva: 'дэва', manushya: 'манушья', rakshasa: 'ракшаса' };
  var NADI_RU = { adi: 'ади (вата)', madhya: 'мадхья (питта)', antya: 'антья (капха)' };

  /* ------------------------------------------------------------- грахи */
  // own — раши во владении (индексы 0-11); exalt/debil — {rashi, deg}
  // friends/enemies — натуральная дружба; drishti — особые аспекты (в домах)
  var GRAHAS = {
    sun:     { sa: 'Сурья',   ru: 'Солнце',  glyph: '☉', short: 'Су', color: '#e8a33d',
               own: [4],    exalt: { rashi: 0, deg: 10 }, debil: { rashi: 6, deg: 10 },
               moola: { rashi: 4, from: 0, to: 20 },
               friends: ['moon', 'mars', 'jupiter'], enemies: ['venus', 'saturn'],
               drishti: [], karaka: 'душа, отец, воля, положение' },
    moon:    { sa: 'Чандра',  ru: 'Луна',    glyph: '☾', short: 'Ча', color: '#cfd6e6',
               own: [3],    exalt: { rashi: 1, deg: 3 },  debil: { rashi: 7, deg: 3 },
               moola: { rashi: 1, from: 4, to: 30 },
               friends: ['sun', 'mercury'], enemies: [],
               drishti: [], karaka: 'ум, мать, чувства, покой' },
    mercury: { sa: 'Будха',   ru: 'Меркурий', glyph: '☿', short: 'Бу', color: '#8fd3c7',
               own: [2, 5],  exalt: { rashi: 5, deg: 15 }, debil: { rashi: 11, deg: 15 },
               moola: { rashi: 5, from: 16, to: 20 },
               friends: ['sun', 'venus'], enemies: ['moon'],
               drishti: [], karaka: 'речь, ум-аналитик, учёба, торговля' },
    venus:   { sa: 'Шукра',   ru: 'Венера',  glyph: '♀', short: 'Шу', color: '#f0c7de',
               own: [1, 6],  exalt: { rashi: 11, deg: 27 }, debil: { rashi: 5, deg: 27 },
               moola: { rashi: 6, from: 0, to: 15 },
               friends: ['mercury', 'saturn'], enemies: ['sun', 'moon'],
               drishti: [], karaka: 'любовь, красота, супруг(а), вкус' },
    mars:    { sa: 'Мангала', ru: 'Марс',    glyph: '♂', short: 'Ма', color: '#e0664f',
               own: [0, 7],  exalt: { rashi: 9, deg: 28 }, debil: { rashi: 3, deg: 28 },
               moola: { rashi: 0, from: 0, to: 12 },
               friends: ['sun', 'moon', 'jupiter'], enemies: ['mercury'],
               drishti: [4, 8], karaka: 'воля к действию, братья, смелость' },
    jupiter: { sa: 'Гуру',    ru: 'Юпитер',  glyph: '♃', short: 'Гу', color: '#f2d79b',
               own: [8, 11], exalt: { rashi: 3, deg: 5 },  debil: { rashi: 9, deg: 5 },
               moola: { rashi: 8, from: 0, to: 10 },
               friends: ['sun', 'moon', 'mars'], enemies: ['mercury', 'venus'],
               drishti: [5, 9], karaka: 'учитель, дхарма, дети, знание' },
    saturn:  { sa: 'Шани',    ru: 'Сатурн',  glyph: '♄', short: 'Ша', color: '#9aa4bf',
               own: [9, 10], exalt: { rashi: 6, deg: 20 }, debil: { rashi: 0, deg: 20 },
               moola: { rashi: 10, from: 0, to: 20 },
               friends: ['mercury', 'venus'], enemies: ['sun', 'moon', 'mars'],
               drishti: [3, 10], karaka: 'время, труд, терпение, ограничение' },
    rahu:    { sa: 'Раху',    ru: 'Раху',    glyph: '☊', short: 'Ра', color: '#a98fd3',
               own: [],     friends: ['venus', 'saturn'], enemies: ['sun', 'moon'],
               drishti: [], karaka: 'жажда, рост наружу, непривычное' },
    ketu:    { sa: 'Кету',    ru: 'Кету',    glyph: '☋', short: 'Ке', color: '#b7a08c',
               own: [],     friends: ['mars', 'jupiter'], enemies: ['sun', 'moon'],
               drishti: [], karaka: 'отпускание, прошлый опыт, отрешённость' }
  };

  /* ------------------------------------------------------------- бхавы */
  var BHAVAS = [
    { name: 'Танубхава',     title: 'тело и «я»',        about: 'внешность, здоровье, то, как вас видят первым взглядом' },
    { name: 'Дханабхава',    title: 'речь и ресурсы',    about: 'речь, деньги, еда, ближняя семья, накопленное' },
    { name: 'Сахаджабхава',  title: 'усилие и близкие',  about: 'братья и сёстры, смелость, руки, короткие пути' },
    { name: 'Матрибхава',    title: 'дом и мать',        about: 'дом, мать, покой ума, земля, корни' },
    { name: 'Путрабхава',    title: 'творчество и дети', about: 'дети, творчество, ученики, заслуга прошлого (пурва-пунья)' },
    { name: 'Рогабхава',     title: 'препятствия',       about: 'болезни, долги, соперники, но и дисциплина, служение' },
    { name: 'Калатрабхава',  title: 'партнёр',           about: 'супруг(а), союзы, договоры, открытая встреча с другим' },
    { name: 'Аюрбхава',      title: 'перемены и скрытое',about: 'долголетие, кризисы и переходы, тайное, наследство' },
    { name: 'Бхагьябхава',   title: 'дхарма и удача',    about: 'учитель, отец, писания, дальние путешествия, вера' },
    { name: 'Кармабхава',    title: 'дело и положение',  about: 'работа, призвание, статус, поступки на виду' },
    { name: 'Лабхабхава',    title: 'обретения',         about: 'доходы, друзья, сообщество, исполнение желаний' },
    { name: 'Мокшабхава',    title: 'уход и свобода',    about: 'освобождение, затраты, чужие края, сон, уединение' }
  ];

  /* ---------------------------------------------------------- панчанга */
  var TITHI_NAMES = [
    'Пратипада', 'Двитийя', 'Тритийя', 'Чатуртхи', 'Панчами', 'Шаштхи',
    'Саптами', 'Аштами', 'Навами', 'Дашами', 'Экадаши', 'Двадаши',
    'Трайодаши', 'Чатурдаши'
  ];
  var YOGA_NAMES = [
    'Вишкамбха', 'Прити', 'Аюшман', 'Саубхагья', 'Шобхана', 'Атиганда',
    'Сукарма', 'Дхрити', 'Шула', 'Ганда', 'Вриддхи', 'Дхрува', 'Вьягхата',
    'Харшана', 'Ваджра', 'Сиддхи', 'Вьятипата', 'Варияна', 'Паригха',
    'Шива', 'Сиддха', 'Садхья', 'Шубха', 'Шукла', 'Брахма', 'Индра',
    'Вайдхрити'
  ];
  var KARANA_CYCLE = ['Бава', 'Балава', 'Каулава', 'Тайтила', 'Гара', 'Ваниджа', 'Виштхи'];
  var KARANA_FIXED = ['Шакуни', 'Чатушпада', 'Нага', 'Кимстугхна'];

  // vara: индекс = день недели JS (0 = воскресенье)
  var VARAS = [
    { sa: 'Равивара',    ru: 'воскресенье', lord: 'sun'     },
    { sa: 'Сомавара',    ru: 'понедельник', lord: 'moon'    },
    { sa: 'Мангалавара', ru: 'вторник',     lord: 'mars'    },
    { sa: 'Будхавара',   ru: 'среда',       lord: 'mercury' },
    { sa: 'Гурувара',    ru: 'четверг',     lord: 'jupiter' },
    { sa: 'Шукравара',   ru: 'пятница',     lord: 'venus'   },
    { sa: 'Шанивара',    ru: 'суббота',     lord: 'saturn'  }
  ];

  // Какая из 8 частей светового дня отдана Раху / Ямаганде / Гулике,
  // по дню недели (индекс = день недели JS, значение = номер части, 1-8)
  var RAHU_KALA_PART  = [8, 2, 7, 5, 6, 4, 3];
  var YAMA_KALA_PART  = [5, 4, 3, 2, 1, 7, 6];
  var GULIKA_PART     = [7, 6, 5, 4, 3, 2, 1];

  /* --------------------------------------------- периоды Вимшоттари-даши */
  var DASHA_ORDER = ['ketu', 'venus', 'sun', 'moon', 'mars', 'rahu', 'jupiter', 'saturn', 'mercury'];
  var DASHA_YEARS = { ketu: 7, venus: 20, sun: 6, moon: 10, mars: 7, rahu: 18, jupiter: 16, saturn: 19, mercury: 17 };

  root.ArunaData = {
    RASHIS: RASHIS, MOBILITY_RU: MOBILITY_RU,
    NAKSHATRAS: NAKSHATRAS, YONI_RU: YONI_RU, GANA_RU: GANA_RU, NADI_RU: NADI_RU,
    GRAHAS: GRAHAS, BHAVAS: BHAVAS,
    TITHI_NAMES: TITHI_NAMES, YOGA_NAMES: YOGA_NAMES,
    KARANA_CYCLE: KARANA_CYCLE, KARANA_FIXED: KARANA_FIXED, VARAS: VARAS,
    RAHU_KALA_PART: RAHU_KALA_PART, YAMA_KALA_PART: YAMA_KALA_PART, GULIKA_PART: GULIKA_PART,
    DASHA_ORDER: DASHA_ORDER, DASHA_YEARS: DASHA_YEARS
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
