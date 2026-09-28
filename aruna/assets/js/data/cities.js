/*
 * Аруна · места рождения
 * ------------------------------------------------------------------
 * [название, широта, долгота (в.д. +), зона IANA, регион].
 * Зона важнее координат: по ней берётся историческое смещение на дату
 * рождения (декретное и летнее время) — см. core/tz.js. Для места, которого
 * здесь нет, на странице есть ручной ввод координат и выбор зоны.
 */
(function (root) {
  'use strict';
  var RU = 'Россия', CIS = 'СНГ и Балтия', EU = 'Европа', AS = 'Азия',
      AM = 'Америка', AF = 'Африка', OC = 'Океания';

  var CITIES = [
    ['Москва', 55.7558, 37.6176, 'Europe/Moscow', RU],
    ['Санкт-Петербург', 59.9311, 30.3609, 'Europe/Moscow', RU],
    ['Новосибирск', 55.0084, 82.9357, 'Asia/Novosibirsk', RU],
    ['Екатеринбург', 56.8389, 60.6057, 'Asia/Yekaterinburg', RU],
    ['Казань', 55.7963, 49.1088, 'Europe/Moscow', RU],
    ['Нижний Новгород', 56.3269, 44.0059, 'Europe/Moscow', RU],
    ['Челябинск', 55.1644, 61.4368, 'Asia/Yekaterinburg', RU],
    ['Самара', 53.1959, 50.1002, 'Europe/Samara', RU],
    ['Омск', 54.9885, 73.3242, 'Asia/Omsk', RU],
    ['Ростов-на-Дону', 47.2357, 39.7015, 'Europe/Moscow', RU],
    ['Уфа', 54.7388, 55.9721, 'Asia/Yekaterinburg', RU],
    ['Красноярск', 56.0153, 92.8932, 'Asia/Krasnoyarsk', RU],
    ['Воронеж', 51.6720, 39.1843, 'Europe/Moscow', RU],
    ['Пермь', 58.0105, 56.2502, 'Asia/Yekaterinburg', RU],
    ['Волгоград', 48.7080, 44.5133, 'Europe/Volgograd', RU],
    ['Краснодар', 45.0355, 38.9753, 'Europe/Moscow', RU],
    ['Саратов', 51.5336, 46.0343, 'Europe/Saratov', RU],
    ['Тюмень', 57.1522, 65.5272, 'Asia/Yekaterinburg', RU],
    ['Тольятти', 53.5303, 49.3461, 'Europe/Samara', RU],
    ['Ижевск', 56.8527, 53.2115, 'Europe/Samara', RU],
    ['Барнаул', 53.3548, 83.7698, 'Asia/Barnaul', RU],
    ['Ульяновск', 54.3142, 48.4031, 'Europe/Ulyanovsk', RU],
    ['Иркутск', 52.2871, 104.3050, 'Asia/Irkutsk', RU],
    ['Хабаровск', 48.4802, 135.0719, 'Asia/Vladivostok', RU],
    ['Ярославль', 57.6261, 39.8845, 'Europe/Moscow', RU],
    ['Владивосток', 43.1155, 131.8855, 'Asia/Vladivostok', RU],
    ['Махачкала', 42.9764, 47.5024, 'Europe/Moscow', RU],
    ['Томск', 56.4846, 84.9476, 'Asia/Tomsk', RU],
    ['Оренбург', 51.7727, 55.0988, 'Asia/Yekaterinburg', RU],
    ['Кемерово', 55.3547, 86.0872, 'Asia/Novokuznetsk', RU],
    ['Новокузнецк', 53.7596, 87.1216, 'Asia/Novokuznetsk', RU],
    ['Рязань', 54.6269, 39.6916, 'Europe/Moscow', RU],
    ['Астрахань', 46.3497, 48.0408, 'Europe/Astrakhan', RU],
    ['Набережные Челны', 55.7436, 52.3958, 'Europe/Moscow', RU],
    ['Пенза', 53.2007, 45.0046, 'Europe/Moscow', RU],
    ['Липецк', 52.6031, 39.5708, 'Europe/Moscow', RU],
    ['Киров', 58.6035, 49.6679, 'Europe/Kirov', RU],
    ['Чебоксары', 56.1322, 47.2519, 'Europe/Moscow', RU],
    ['Тула', 54.2048, 37.6186, 'Europe/Moscow', RU],
    ['Калининград', 54.7104, 20.4522, 'Europe/Kaliningrad', RU],
    ['Сочи', 43.5855, 39.7231, 'Europe/Moscow', RU],
    ['Ставрополь', 45.0428, 41.9734, 'Europe/Moscow', RU],
    ['Улан-Удэ', 51.8335, 107.5841, 'Asia/Irkutsk', RU],
    ['Якутск', 62.0355, 129.6755, 'Asia/Yakutsk', RU],
    ['Мурманск', 68.9585, 33.0827, 'Europe/Moscow', RU],
    ['Архангельск', 64.5401, 40.5433, 'Europe/Moscow', RU],
    ['Петропавловск-Камчатский', 53.0445, 158.6432, 'Asia/Kamchatka', RU],
    ['Симферополь', 44.9572, 34.1108, 'Europe/Simferopol', RU],
    ['Севастополь', 44.6166, 33.5254, 'Europe/Simferopol', RU],
    ['Грозный', 43.3169, 45.6981, 'Europe/Moscow', RU],
    ['Владикавказ', 43.0241, 44.6814, 'Europe/Moscow', RU],
    ['Белгород', 50.5977, 36.5858, 'Europe/Moscow', RU],
    ['Смоленск', 54.7818, 32.0401, 'Europe/Moscow', RU],
    ['Псков', 57.8136, 28.3496, 'Europe/Moscow', RU],
    ['Великий Новгород', 58.5215, 31.2755, 'Europe/Moscow', RU],
    ['Сургут', 61.2540, 73.3962, 'Asia/Yekaterinburg', RU],
    ['Чита', 52.0340, 113.4994, 'Asia/Chita', RU],
    ['Благовещенск', 50.2907, 127.5272, 'Asia/Yakutsk', RU],
    ['Южно-Сахалинск', 46.9591, 142.7380, 'Asia/Sakhalin', RU],
    ['Магадан', 59.5638, 150.8063, 'Asia/Magadan', RU],
    ['Норильск', 69.3535, 88.2027, 'Asia/Krasnoyarsk', RU],
    ['Сыктывкар', 61.6688, 50.8364, 'Europe/Moscow', RU],
    ['Вологда', 59.2181, 39.8886, 'Europe/Moscow', RU],
    ['Курск', 51.7304, 36.1926, 'Europe/Moscow', RU],
    ['Брянск', 53.2434, 34.3639, 'Europe/Moscow', RU],
    ['Иваново', 56.9999, 40.9739, 'Europe/Moscow', RU],
    ['Тверь', 56.8587, 35.9176, 'Europe/Moscow', RU],
    ['Калуга', 54.5293, 36.2754, 'Europe/Moscow', RU],
    ['Владимир', 56.1290, 40.4070, 'Europe/Moscow', RU],
    ['Орёл', 52.9651, 36.0785, 'Europe/Moscow', RU],
    ['Тамбов', 52.7212, 41.4523, 'Europe/Moscow', RU],
    ['Саранск', 54.1838, 45.1749, 'Europe/Moscow', RU],
    ['Йошкар-Ола', 56.6388, 47.8908, 'Europe/Moscow', RU],
    ['Нижневартовск', 60.9344, 76.5531, 'Asia/Yekaterinburg', RU],
    ['Нижний Тагил', 57.9195, 59.9650, 'Asia/Yekaterinburg', RU],
    ['Курган', 55.4507, 65.3411, 'Asia/Yekaterinburg', RU],
    ['Абакан', 53.7156, 91.4292, 'Asia/Krasnoyarsk', RU],
    ['Бийск', 52.5393, 85.2072, 'Asia/Barnaul', RU],
    ['Комсомольск-на-Амуре', 50.5503, 137.0078, 'Asia/Vladivostok', RU],
    ['Находка', 42.8248, 132.8896, 'Asia/Vladivostok', RU],

    ['Минск', 53.9006, 27.5590, 'Europe/Minsk', CIS],
    ['Киев', 50.4501, 30.5234, 'Europe/Kyiv', CIS],
    ['Харьков', 49.9935, 36.2304, 'Europe/Kyiv', CIS],
    ['Одесса', 46.4825, 30.7233, 'Europe/Kyiv', CIS],
    ['Львов', 49.8397, 24.0297, 'Europe/Kyiv', CIS],
    ['Днепр', 48.4647, 35.0462, 'Europe/Kyiv', CIS],
    ['Алматы', 43.2220, 76.8512, 'Asia/Almaty', CIS],
    ['Астана', 51.1694, 71.4491, 'Asia/Almaty', CIS],
    ['Шымкент', 42.3417, 69.5901, 'Asia/Almaty', CIS],
    ['Ташкент', 41.2995, 69.2401, 'Asia/Tashkent', CIS],
    ['Самарканд', 39.6270, 66.9750, 'Asia/Samarkand', CIS],
    ['Бишкек', 42.8746, 74.5698, 'Asia/Bishkek', CIS],
    ['Душанбе', 38.5598, 68.7870, 'Asia/Dushanbe', CIS],
    ['Ашхабад', 37.9601, 58.3261, 'Asia/Ashgabat', CIS],
    ['Баку', 40.4093, 49.8671, 'Asia/Baku', CIS],
    ['Тбилиси', 41.7151, 44.8271, 'Asia/Tbilisi', CIS],
    ['Ереван', 40.1792, 44.4991, 'Asia/Yerevan', CIS],
    ['Кишинёв', 47.0105, 28.8638, 'Europe/Chisinau', CIS],
    ['Рига', 56.9496, 24.1052, 'Europe/Riga', CIS],
    ['Вильнюс', 54.6872, 25.2797, 'Europe/Vilnius', CIS],
    ['Таллин', 59.4370, 24.7536, 'Europe/Tallinn', CIS],

    ['Лондон', 51.5074, -0.1278, 'Europe/London', EU],
    ['Париж', 48.8566, 2.3522, 'Europe/Paris', EU],
    ['Берлин', 52.5200, 13.4050, 'Europe/Berlin', EU],
    ['Мадрид', 40.4168, -3.7038, 'Europe/Madrid', EU],
    ['Барселона', 41.3874, 2.1686, 'Europe/Madrid', EU],
    ['Рим', 41.9028, 12.4964, 'Europe/Rome', EU],
    ['Милан', 45.4642, 9.1900, 'Europe/Rome', EU],
    ['Прага', 50.0755, 14.4378, 'Europe/Prague', EU],
    ['Варшава', 52.2297, 21.0122, 'Europe/Warsaw', EU],
    ['Вена', 48.2082, 16.3738, 'Europe/Vienna', EU],
    ['Амстердам', 52.3676, 4.9041, 'Europe/Amsterdam', EU],
    ['Брюссель', 50.8503, 4.3517, 'Europe/Brussels', EU],
    ['Стокгольм', 59.3293, 18.0686, 'Europe/Stockholm', EU],
    ['Хельсинки', 60.1699, 24.9384, 'Europe/Helsinki', EU],
    ['Осло', 59.9139, 10.7522, 'Europe/Oslo', EU],
    ['Копенгаген', 55.6761, 12.5683, 'Europe/Copenhagen', EU],
    ['Цюрих', 47.3769, 8.5417, 'Europe/Zurich', EU],
    ['Лиссабон', 38.7223, -9.1393, 'Europe/Lisbon', EU],
    ['Белград', 44.7866, 20.4489, 'Europe/Belgrade', EU],
    ['София', 42.6977, 23.3219, 'Europe/Sofia', EU],
    ['Бухарест', 44.4268, 26.1025, 'Europe/Bucharest', EU],
    ['Будапешт', 47.4979, 19.0402, 'Europe/Budapest', EU],
    ['Афины', 37.9838, 23.7275, 'Europe/Athens', EU],
    ['Стамбул', 41.0082, 28.9784, 'Europe/Istanbul', EU],
    ['Тбилиси (Грузия)', 41.7151, 44.8271, 'Asia/Tbilisi', EU],

    ['Нью-Дели', 28.6139, 77.2090, 'Asia/Kolkata', AS],
    ['Мумбаи', 19.0760, 72.8777, 'Asia/Kolkata', AS],
    ['Калькутта', 22.5726, 88.3639, 'Asia/Kolkata', AS],
    ['Ченнаи', 13.0827, 80.2707, 'Asia/Kolkata', AS],
    ['Бангалор', 12.9716, 77.5946, 'Asia/Kolkata', AS],
    ['Хайдарабад', 17.3850, 78.4867, 'Asia/Kolkata', AS],
    ['Пуна', 18.5204, 73.8567, 'Asia/Kolkata', AS],
    ['Ахмадабад', 23.0225, 72.5714, 'Asia/Kolkata', AS],
    ['Джайпур', 26.9124, 75.7873, 'Asia/Kolkata', AS],
    ['Варанаси', 25.3176, 82.9739, 'Asia/Kolkata', AS],
    ['Вриндаван', 27.5650, 77.6593, 'Asia/Kolkata', AS],
    ['Маяпур', 23.4241, 88.3888, 'Asia/Kolkata', AS],
    ['Тируванантапурам', 8.5241, 76.9366, 'Asia/Kolkata', AS],
    ['Катманду', 27.7172, 85.3240, 'Asia/Kathmandu', AS],
    ['Коломбо', 6.9271, 79.8612, 'Asia/Colombo', AS],
    ['Дубай', 25.2048, 55.2708, 'Asia/Dubai', AS],
    ['Тель-Авив', 32.0853, 34.7818, 'Asia/Jerusalem', AS],
    ['Бангкок', 13.7563, 100.5018, 'Asia/Bangkok', AS],
    ['Сингапур', 1.3521, 103.8198, 'Asia/Singapore', AS],
    ['Гонконг', 22.3193, 114.1694, 'Asia/Hong_Kong', AS],
    ['Пекин', 39.9042, 116.4074, 'Asia/Shanghai', AS],
    ['Шанхай', 31.2304, 121.4737, 'Asia/Shanghai', AS],
    ['Токио', 35.6762, 139.6503, 'Asia/Tokyo', AS],
    ['Сеул', 37.5665, 126.9780, 'Asia/Seoul', AS],
    ['Джакарта', -6.2088, 106.8456, 'Asia/Jakarta', AS],
    ['Ханой', 21.0278, 105.8342, 'Asia/Ho_Chi_Minh', AS],

    ['Нью-Йорк', 40.7128, -74.0060, 'America/New_York', AM],
    ['Лос-Анджелес', 34.0522, -118.2437, 'America/Los_Angeles', AM],
    ['Чикаго', 41.8781, -87.6298, 'America/Chicago', AM],
    ['Сан-Франциско', 37.7749, -122.4194, 'America/Los_Angeles', AM],
    ['Майами', 25.7617, -80.1918, 'America/New_York', AM],
    ['Торонто', 43.6532, -79.3832, 'America/Toronto', AM],
    ['Ванкувер', 49.2827, -123.1207, 'America/Vancouver', AM],
    ['Мехико', 19.4326, -99.1332, 'America/Mexico_City', AM],
    ['Гавана', 23.1136, -82.3666, 'America/Havana', AM],
    ['Сан-Паулу', -23.5505, -46.6333, 'America/Sao_Paulo', AM],
    ['Рио-де-Жанейро', -22.9068, -43.1729, 'America/Sao_Paulo', AM],
    ['Буэнос-Айрес', -34.6037, -58.3816, 'America/Argentina/Buenos_Aires', AM],
    ['Лима', -12.0464, -77.0428, 'America/Lima', AM],
    ['Богота', 4.7110, -74.0721, 'America/Bogota', AM],
    ['Сантьяго', -33.4489, -70.6693, 'America/Santiago', AM],

    ['Каир', 30.0444, 31.2357, 'Africa/Cairo', AF],
    ['Найроби', -1.2921, 36.8219, 'Africa/Nairobi', AF],
    ['Лагос', 6.5244, 3.3792, 'Africa/Lagos', AF],
    ['Йоханнесбург', -26.2041, 28.0473, 'Africa/Johannesburg', AF],
    ['Кейптаун', -33.9249, 18.4241, 'Africa/Johannesburg', AF],

    ['Сидней', -33.8688, 151.2093, 'Australia/Sydney', OC],
    ['Мельбурн', -37.8136, 144.9631, 'Australia/Melbourne', OC],
    ['Перт', -31.9505, 115.8605, 'Australia/Perth', OC],
    ['Окленд', -36.8485, 174.7633, 'Pacific/Auckland', OC]
  ];

  /** Поиск по началу слова, без учёта регистра и «ё». */
  function search(query, limit) {
    var q = (query || '').trim().toLowerCase().replace(/ё/g, 'е');
    if (!q) return [];
    var starts = [], inside = [];
    for (var i = 0; i < CITIES.length; i++) {
      var name = CITIES[i][0].toLowerCase().replace(/ё/g, 'е');
      var at = name.indexOf(q);
      if (at === 0) starts.push(CITIES[i]);
      else if (at > 0) inside.push(CITIES[i]);
    }
    return starts.concat(inside).slice(0, limit || 8).map(function (c) {
      return { name: c[0], lat: c[1], lon: c[2], tz: c[3], region: c[4] };
    });
  }

  function byName(name) {
    for (var i = 0; i < CITIES.length; i++) {
      if (CITIES[i][0] === name) {
        return { name: CITIES[i][0], lat: CITIES[i][1], lon: CITIES[i][2],
                 tz: CITIES[i][3], region: CITIES[i][4] };
      }
    }
    return null;
  }

  root.ArunaCities = { CITIES: CITIES, search: search, byName: byName };
})(typeof globalThis !== 'undefined' ? globalThis : this);
