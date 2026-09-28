/*
 * Аруна · астрономическое ядро
 * ------------------------------------------------------------------
 * Видимые геоцентрические эклиптические долготы Солнца, Луны, пяти
 * видимых планет и лунных узлов. Чистый JS без зависимостей, работает
 * и в браузере (обычный <script>), и в Node (через vm — см. test/).
 *
 * Источники алгоритмов:
 *   Солнце   — J. Meeus, Astronomical Algorithms, гл. 25 (точность ~0.01°)
 *   Луна     — Meeus, гл. 47, усечённая ELP-2000/82 (60 членов, ~10")
 *   Планеты  — кеплеровы элементы + возмущения Юпитера/Сатурна
 *              (P. Schlyter, Computing planetary positions), ~1-3'
 *   Нутация  — Meeus, гл. 22, главные члены (~1")
 *   ΔT       — Espenak & Meeus, полиномы 1800-2150
 *
 * Точность проверена против pyephem (libastro/VSOP87) — test/validate_ephemeris.py.
 */
(function (root) {
  'use strict';

  var DEG = Math.PI / 180;
  function sin(d) { return Math.sin(d * DEG); }
  function cos(d) { return Math.cos(d * DEG); }
  function tan(d) { return Math.tan(d * DEG); }
  function asin(x) { return Math.asin(x) / DEG; }
  function atan2(y, x) { return Math.atan2(y, x) / DEG; }
  function norm360(x) { return ((x % 360) + 360) % 360; }
  /** Разность долгот, приведённая к (-180, 180]. */
  function diff180(a, b) {
    var d = norm360(a - b);
    return d > 180 ? d - 360 : d;
  }

  // ---------------------------------------------------------------- время

  /**
   * Юлианская дата по календарной дате UTC.
   * @param {number} y год (астрономический: 1 г. до н.э. = 0)
   * @param {number} m месяц 1-12
   * @param {number} d день
   * @param {number} hours дробные часы UT
   */
  function julianDay(y, m, d, hours) {
    var gregorian = y > 1582 || (y === 1582 && (m > 10 || (m === 10 && d >= 15)));
    if (m <= 2) { y -= 1; m += 12; }
    // gregorian вычислен до сдвига января/февраля: григорианский календарь
    // начинается 15 октября 1582 года, 4 октября и раньше — ещё юлианский
    // (дней с 5 по 14 октября 1582 года просто не было).
    var a = Math.floor(y / 100);
    var b = gregorian ? 2 - a + Math.floor(a / 4) : 0;
    return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) +
           d + b - 1524.5 + (hours || 0) / 24;
  }

  /** Обратное преобразование: JD -> {y, m, d, hours}. */
  function fromJulianDay(jd) {
    var z = Math.floor(jd + 0.5), f = jd + 0.5 - z, a = z;
    if (z >= 2299161) {
      var alpha = Math.floor((z - 1867216.25) / 36524.25);
      a = z + 1 + alpha - Math.floor(alpha / 4);
    }
    var b = a + 1524, c = Math.floor((b - 122.1) / 365.25),
        d = Math.floor(365.25 * c), e = Math.floor((b - d) / 30.6001);
    var day = b - d - Math.floor(30.6001 * e) + f;
    var month = e < 14 ? e - 1 : e - 13;
    var year = month > 2 ? c - 4716 : c - 4715;
    var dayInt = Math.floor(day);
    return { y: year, m: month, d: dayInt, hours: (day - dayInt) * 24 };
  }

  /** ΔT = TT - UT в секундах (Espenak & Meeus). */
  function deltaT(year) {
    var t, u;
    if (year < 1800) {                       // грубо, но карты до 1800 нам не нужны
      u = (year - 1820) / 100;
      return -20 + 32 * u * u;
    }
    if (year < 1860) {
      t = year - 1800;
      return 13.72 - 0.332447 * t + 0.0068612 * t * t + 0.0041116 * Math.pow(t, 3) -
             0.00037436 * Math.pow(t, 4) + 0.0000121272 * Math.pow(t, 5) -
             0.0000001699 * Math.pow(t, 6) + 0.000000000875 * Math.pow(t, 7);
    }
    if (year < 1900) {
      t = year - 1860;
      return 7.62 + 0.5737 * t - 0.251754 * t * t + 0.01680668 * Math.pow(t, 3) -
             0.0004473624 * Math.pow(t, 4) + Math.pow(t, 5) / 233174;
    }
    if (year < 1920) {
      t = year - 1900;
      return -2.79 + 1.494119 * t - 0.0598939 * t * t + 0.0061966 * Math.pow(t, 3) -
             0.000197 * Math.pow(t, 4);
    }
    if (year < 1941) {
      t = year - 1920;
      return 21.20 + 0.84493 * t - 0.076100 * t * t + 0.0020936 * Math.pow(t, 3);
    }
    if (year < 1961) {
      t = year - 1950;
      return 29.07 + 0.407 * t - t * t / 233 + Math.pow(t, 3) / 2547;
    }
    if (year < 1986) {
      t = year - 1975;
      return 45.45 + 1.067 * t - t * t / 260 - Math.pow(t, 3) / 718;
    }
    if (year < 2005) {
      t = year - 2000;
      return 63.86 + 0.3345 * t - 0.060374 * t * t + 0.0017275 * Math.pow(t, 3) +
             0.000651814 * Math.pow(t, 4) + 0.00002373599 * Math.pow(t, 5);
    }
    if (year < 2050) {
      t = year - 2000;
      return 62.92 + 0.32217 * t + 0.005589 * t * t;
    }
    u = (year - 1820) / 100;
    return -20 + 32 * u * u - 0.5628 * (2150 - year);
  }

  /** JD(UT) -> JDE(TT). */
  function jdToJde(jd) {
    var y = fromJulianDay(jd);
    var year = y.y + (y.m - 0.5) / 12;
    return jd + deltaT(year) / 86400;
  }

  /** Средняя звёздная гринвичская, градусы, от JD(UT). */
  function gmst(jd) {
    var T = (jd - 2451545.0) / 36525;
    return norm360(280.46061837 + 360.98564736629 * (jd - 2451545.0) +
                   0.000387933 * T * T - T * T * T / 38710000);
  }

  // ------------------------------------------------- нутация и наклон эклиптики

  /** Нутация {dpsi, deps} в градусах (главные члены, ~1"). */
  function nutation(T) {
    var om = 125.04452 - 1934.136261 * T + 0.0020708 * T * T + T * T * T / 450000;
    var L  = 280.4665 + 36000.7698 * T;
    var Lm = 218.3165 + 481267.8813 * T;
    var dpsi = (-17.20 * sin(om) - 1.32 * sin(2 * L) -
                 0.23 * sin(2 * Lm) + 0.21 * sin(2 * om)) / 3600;
    var deps = ( 9.20 * cos(om) + 0.57 * cos(2 * L) +
                 0.10 * cos(2 * Lm) - 0.09 * cos(2 * om)) / 3600;
    return { dpsi: dpsi, deps: deps };
  }

  /** Средний наклон эклиптики, градусы (Laskar). */
  function meanObliquity(T) {
    var u = T / 100;
    return 23.43929111 -
      (4680.93 * u + 1.55 * u * u - 1999.25 * Math.pow(u, 3) - 51.38 * Math.pow(u, 4) +
       249.67 * Math.pow(u, 5) + 39.05 * Math.pow(u, 6) - 7.12 * Math.pow(u, 7) -
       27.87 * Math.pow(u, 8) + 5.79 * Math.pow(u, 9) + 2.45 * Math.pow(u, 10)) / 3600;
  }

  // ---------------------------------------------------------------- Солнце

  /** Видимая геоцентрическая долгота Солнца и радиус-вектор, JDE(TT). */
  function sun(jde) {
    var T = (jde - 2451545.0) / 36525;
    var L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
    var M  = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
    var e  = 0.016708634 - 0.000042037 * T - 0.0000001267 * T * T;
    var C  = (1.914602 - 0.004817 * T - 0.000014 * T * T) * sin(M) +
             (0.019993 - 0.000101 * T) * sin(2 * M) +
              0.000289 * sin(3 * M);
    var trueLong = L0 + C;
    var v = M + C;                                    // истинная аномалия
    var R = 1.000001018 * (1 - e * e) / (1 + e * cos(v)); // а.е.
    var om = 125.04 - 1934.136 * T;
    // видимая долгота: нутация (главный член) + аберрация
    var apparent = trueLong - 0.00569 - 0.00478 * sin(om);
    return { lon: norm360(apparent), lat: 0, r: R, trueLon: norm360(trueLong) };
  }

  // ------------------------------------------------------------------ Луна

  /* Meeus, таблица 47.A: [D, M, M', F, коэфф. долготы ×1e-6°] */
  var MOON_L = [
    0, 0, 1, 0, 6288774,   2, 0,-1, 0, 1274027,   2, 0, 0, 0,  658314,
    0, 0, 2, 0,  213618,   0, 1, 0, 0, -185116,   0, 0, 0, 2, -114332,
    2, 0,-2, 0,   58793,   2,-1,-1, 0,   57066,   2, 0, 1, 0,   53322,
    2,-1, 0, 0,   45758,   0, 1,-1, 0,  -40923,   1, 0, 0, 0,  -34720,
    0, 1, 1, 0,  -30383,   2, 0, 0,-2,   15327,   0, 0, 1, 2,  -12528,
    0, 0, 1,-2,   10980,   4, 0,-1, 0,   10675,   0, 0, 3, 0,   10034,
    4, 0,-2, 0,    8548,   2, 1,-1, 0,   -7888,   2, 1, 0, 0,   -6766,
    1, 0,-1, 0,   -5163,   1, 1, 0, 0,    4987,   2,-1, 1, 0,    4036,
    2, 0, 2, 0,    3994,   4, 0, 0, 0,    3861,   2, 0,-3, 0,    3665,
    0, 1,-2, 0,   -2689,   2, 0,-1, 2,   -2602,   2,-1,-2, 0,    2390,
    1, 0, 1, 0,   -2348,   2,-2, 0, 0,    2236,   0, 1, 2, 0,   -2120,
    0, 2, 0, 0,   -2069,   2,-2,-1, 0,    2048,   2, 0, 1,-2,   -1773,
    2, 0, 0, 2,   -1595,   4,-1,-1, 0,    1215,   0, 0, 2, 2,   -1110,
    3, 0,-1, 0,    -892,   2, 1, 1, 0,    -810,   4,-1,-2, 0,     759,
    0, 2,-1, 0,    -713,   2, 2,-1, 0,    -700,   2, 1,-2, 0,     691,
    2,-1, 0,-2,     596,   4, 0, 1, 0,     549,   0, 0, 4, 0,     537,
    4,-1, 0, 0,     520,   1, 0,-2, 0,    -487,   2, 1, 0,-2,    -399,
    0, 0, 2,-2,    -381,   1, 1, 1, 0,     351,   3, 0,-2, 0,    -340,
    4, 0,-3, 0,     330,   2,-1, 2, 0,     327,   0, 2, 1, 0,    -323,
    1, 1,-1, 0,     299,   2, 0, 3, 0,     294
  ];

  /** Видимая геоцентрическая долгота Луны, JDE(TT). */
  function moon(jde) {
    var T = (jde - 2451545.0) / 36525;
    var T2 = T * T, T3 = T2 * T, T4 = T3 * T;
    var Lp = 218.3164477 + 481267.88123421 * T - 0.0015786 * T2 + T3 / 538841 - T4 / 65194000;
    var D  = 297.8501921 + 445267.1114034 * T - 0.0018819 * T2 + T3 / 545868 - T4 / 113065000;
    var M  = 357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000;
    var Mp = 134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699 - T4 / 14712000;
    var F  =  93.2720950 + 483202.0175233 * T - 0.0036539 * T2 - T3 / 3526000 + T4 / 863310000;
    var E  = 1 - 0.002516 * T - 0.0000074 * T2;

    var suml = 0;
    for (var i = 0; i < MOON_L.length; i += 5) {
      var cd = MOON_L[i], cm = MOON_L[i + 1], cmp = MOON_L[i + 2], cf = MOON_L[i + 3];
      var coef = MOON_L[i + 4];
      var ecc = cm === 0 ? 1 : (Math.abs(cm) === 1 ? E : E * E);
      suml += coef * ecc * sin(cd * D + cm * M + cmp * Mp + cf * F);
    }
    var A1 = 119.75 + 131.849 * T;
    var A2 =  53.09 + 479264.290 * T;
    suml += 3958 * sin(A1) + 1962 * sin(Lp - F) + 318 * sin(A2);

    var lon = Lp + suml / 1e6;
    return { lon: norm360(lon + nutation(T).dpsi), lat: 0 };
  }

  /** Средний восходящий узел Луны (Раху), градусы, JDE(TT). */
  function meanNode(jde) {
    var T = (jde - 2451545.0) / 36525;
    return norm360(125.0445479 - 1934.1362891 * T + 0.0020754 * T * T +
                   Math.pow(T, 3) / 467441 - Math.pow(T, 4) / 60616000);
  }

  // --------------------------------------------------------------- планеты

  /* Кеплеровы элементы (Schlyter): d = JD - 2451543.5 сут от 1999-12-31 0:00 TT.
     N — долгота восходящего узла, i — наклон, w — аргумент перигелия,
     a — большая полуось (а.е.), e — эксцентриситет, M — средняя аномалия. */
  var ELEMENTS = {
    mercury: function (d) { return { N:  48.3313 + 3.24587e-5 * d, i: 7.0047 + 5.00e-8 * d,
      w:  29.1241 + 1.01444e-5 * d, a: 0.387098, e: 0.205635 + 5.59e-10 * d,
      M: 168.6562 + 4.0923344368 * d }; },
    venus: function (d) { return { N:  76.6799 + 2.46590e-5 * d, i: 3.3946 + 2.75e-8 * d,
      w:  54.8910 + 1.38374e-5 * d, a: 0.723330, e: 0.006773 - 1.302e-9 * d,
      M:  48.0052 + 1.6021302244 * d }; },
    mars: function (d) { return { N:  49.5574 + 2.11081e-5 * d, i: 1.8497 - 1.78e-8 * d,
      w: 286.5016 + 2.92961e-5 * d, a: 1.523688, e: 0.093405 + 2.516e-9 * d,
      M:  18.6021 + 0.5240207766 * d }; },
    jupiter: function (d) { return { N: 100.4542 + 2.76854e-5 * d, i: 1.3030 - 1.557e-7 * d,
      w: 273.8777 + 1.64505e-5 * d, a: 5.20256, e: 0.048498 + 4.469e-9 * d,
      M:  19.8950 + 0.0830853001 * d }; },
    saturn: function (d) { return { N: 113.6634 + 2.38980e-5 * d, i: 2.4886 - 1.081e-7 * d,
      w: 339.3939 + 2.97661e-5 * d, a: 9.55475, e: 0.055546 - 9.499e-9 * d,
      M: 316.9670 + 0.0334442282 * d }; }
  };

  /** Эксцентрическая аномалия из средней (итерации Ньютона), градусы. */
  function eccentricAnomaly(M, e) {
    M = norm360(M);
    var E = M + (180 / Math.PI) * e * sin(M) * (1 + e * cos(M));
    for (var k = 0; k < 12; k++) {
      var dE = (E - (180 / Math.PI) * e * sin(E) - M) / (1 - e * cos(E));
      E -= dE;
      if (Math.abs(dE) < 1e-10) break;
    }
    return E;
  }

  /** Гелиоцентрические эклиптические координаты планеты: {lon, lat, r}. */
  function heliocentric(name, jde) {
    var d = jde - 2451543.5;
    var el = ELEMENTS[name](d);
    var E = eccentricAnomaly(el.M, el.e);
    var xv = el.a * (cos(E) - el.e);
    var yv = el.a * Math.sqrt(1 - el.e * el.e) * sin(E);
    var v = atan2(yv, xv);
    var r = Math.sqrt(xv * xv + yv * yv);
    var u = v + el.w;
    var xh = r * (cos(el.N) * cos(u) - sin(el.N) * sin(u) * cos(el.i));
    var yh = r * (sin(el.N) * cos(u) + cos(el.N) * sin(u) * cos(el.i));
    var zh = r * sin(u) * sin(el.i);
    var lon = atan2(yh, xh);
    var lat = atan2(zh, Math.sqrt(xh * xh + yh * yh));

    // Возмущения: главное неравенство Юпитер-Сатурн и соседние члены.
    if (name === 'jupiter' || name === 'saturn') {
      var Mj = ELEMENTS.jupiter(d).M, Ms = ELEMENTS.saturn(d).M;
      if (name === 'jupiter') {
        lon += -0.332 * sin(2 * Mj - 5 * Ms - 67.6)
             +  -0.056 * sin(2 * Mj - 2 * Ms + 21)
             +   0.042 * sin(3 * Mj - 5 * Ms + 21)
             +  -0.036 * sin(Mj - 2 * Ms)
             +   0.022 * cos(Mj - Ms)
             +   0.023 * sin(2 * Mj - 3 * Ms + 52)
             +  -0.016 * sin(Mj - 5 * Ms - 69);
      } else {
        lon +=  0.812 * sin(2 * Mj - 5 * Ms - 67.6)
             + -0.229 * cos(2 * Mj - 4 * Ms - 2)
             +  0.119 * sin(Mj - 2 * Ms - 3)
             +  0.046 * sin(2 * Mj - 6 * Ms - 69)
             +  0.014 * sin(Mj - 3 * Ms + 32);
        lat += -0.020 * cos(2 * Mj - 4 * Ms - 2)
             +  0.018 * sin(2 * Mj - 6 * Ms - 49);
      }
    }
    return { lon: norm360(lon), lat: lat, r: r };
  }

  var LIGHT_DAYS_PER_AU = 0.0057755183; // сутки на а.е.

  /** Видимая геоцентрическая долгота планеты (с поправкой на время света). */
  function planet(name, jde) {
    var s = sun(jde);
    // Земля гелиоцентрически = Солнце геоцентрически + 180°
    var xs = s.r * cos(s.lon), ys = s.r * sin(s.lon);
    var h = heliocentric(name, jde), delta = 0;
    for (var k = 0; k < 3; k++) {
      var xh = h.r * cos(h.lat) * cos(h.lon), yh = h.r * cos(h.lat) * sin(h.lon),
          zh = h.r * sin(h.lat);
      var xg = xh + xs, yg = yh + ys, zg = zh;
      var nd = Math.sqrt(xg * xg + yg * yg + zg * zg);
      if (Math.abs(nd - delta) < 1e-7) { delta = nd; break; }
      delta = nd;
      h = heliocentric(name, jde - delta * LIGHT_DAYS_PER_AU);
    }
    var xh2 = h.r * cos(h.lat) * cos(h.lon), yh2 = h.r * cos(h.lat) * sin(h.lon),
        zh2 = h.r * sin(h.lat);
    var xg2 = xh2 + xs, yg2 = yh2 + ys;
    var lon = atan2(yg2, xg2);
    var lat = atan2(zh2, Math.sqrt(xg2 * xg2 + yg2 * yg2));
    var T = (jde - 2451545.0) / 36525;
    // видимое место: нутация в долготе + годичная аберрация
    lon += nutation(T).dpsi;
    lon += -20.4898 / 3600 * cos(s.lon - lon) / Math.max(0.2, cos(lat));
    return { lon: norm360(lon), lat: lat, r: h.r, delta: delta };
  }

  // ---------------------------------------------------- тропические долготы

  var GRAHA_ORDER = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'rahu', 'ketu'];

  /**
   * Тропические видимые долготы всех девяти грах на JD(UT).
   * @returns {Object} ключ -> {lon, speed} (speed — °/сутки, <0 = ретроград)
   */
  function tropicalPositions(jd) {
    var jde = jdToJde(jd);
    var out = {};
    var step = 0.25;
    function withSpeed(fn) {
      var a = fn(jde - step / 2).lon, b = fn(jde + step / 2).lon;
      return { lon: fn(jde).lon, speed: diff180(b, a) / step };
    }
    out.sun = withSpeed(sun);
    out.moon = withSpeed(moon);
    ['mercury', 'venus', 'mars', 'jupiter', 'saturn'].forEach(function (p) {
      out[p] = withSpeed(function (t) { return planet(p, t); });
    });
    var nodeSpeed = (meanNode(jde + step / 2) - meanNode(jde - step / 2)) / step;
    out.rahu = { lon: meanNode(jde), speed: nodeSpeed };
    out.ketu = { lon: norm360(meanNode(jde) + 180), speed: nodeSpeed };
    return out;
  }

  // ------------------------------------------------------- горизонт и лагна

  /** Видимое звёздное время на меридиане места, градусы. */
  function localSiderealTime(jd, lonEast) {
    var T = (jd - 2451545.0) / 36525;
    var nu = nutation(T);
    var eps = meanObliquity(T) + nu.deps;
    return norm360(gmst(jd) + nu.dpsi * cos(eps) + lonEast);
  }

  /**
   * Тропические долготы лагны (Asc) и середины неба (MC).
   * Asc = atan2(cos θ, −(sin θ·cos ε + tg φ·sin ε)) — проверено по таблицам домов.
   */
  function ascendantMc(jd, lat, lonEast) {
    var th = localSiderealTime(jd, lonEast);
    var T = (jd - 2451545.0) / 36525;
    var nu = nutation(T);
    var eps = meanObliquity(T) + nu.deps;
    var phi = Math.max(-89.9, Math.min(89.9, lat));   // полюса: тангенс уходит в бесконечность
    var asc = norm360(atan2(cos(th), -(sin(th) * cos(eps) + tan(phi) * sin(eps))));
    var mc = norm360(atan2(sin(th), cos(th) * cos(eps)));
    return { asc: asc, mc: mc, lst: th, obliquity: eps };
  }

  /** Высота Солнца над горизонтом в градусах (без поправки на рефракцию). */
  function sunAltitude(jd, lat, lonEast) {
    var s = sun(jdToJde(jd));
    var T = (jd - 2451545.0) / 36525;
    var eps = meanObliquity(T) + nutation(T).deps;
    var ra = atan2(sin(s.lon) * cos(eps), cos(s.lon));
    var dec = asin(sin(eps) * sin(s.lon));
    var H = localSiderealTime(jd, lonEast) - ra;
    return asin(sin(lat) * sin(dec) + cos(lat) * cos(dec) * cos(H));
  }

  /**
   * Восход и закат: JD(UT) моментов, когда центр Солнца на высоте -0.833°
   * (рефракция + полудиаметр). Ищем сменой знака + бисекцией — устойчиво
   * на любых широтах; null, если Солнце не заходит/не восходит.
   */
  function sunriseSunset(jdMidnight, lat, lonEast) {
    var h0 = -0.833;
    function f(t) { return sunAltitude(t, lat, lonEast) - h0; }
    var steps = 96, prev = f(jdMidnight), rise = null, set = null;
    for (var i = 1; i <= steps; i++) {
      var t = jdMidnight + i / steps, cur = f(t);
      if (prev < 0 && cur >= 0 && rise === null) rise = bisect(f, t - 1 / steps, t);
      if (prev > 0 && cur <= 0 && set === null) set = bisect(f, t - 1 / steps, t);
      prev = cur;
    }
    return { rise: rise, set: set };
  }

  function bisect(f, lo, hi) {
    for (var i = 0; i < 40; i++) {
      var mid = (lo + hi) / 2;
      if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid;
    }
    return (lo + hi) / 2;
  }

  root.ArunaAstro = {
    DEG: DEG, sin: sin, cos: cos, tan: tan, norm360: norm360, diff180: diff180,
    julianDay: julianDay, fromJulianDay: fromJulianDay, deltaT: deltaT, jdToJde: jdToJde,
    gmst: gmst, nutation: nutation, meanObliquity: meanObliquity,
    sun: sun, moon: moon, meanNode: meanNode, heliocentric: heliocentric, planet: planet,
    tropicalPositions: tropicalPositions, GRAHA_ORDER: GRAHA_ORDER,
    localSiderealTime: localSiderealTime, ascendantMc: ascendantMc,
    sunAltitude: sunAltitude, sunriseSunset: sunriseSunset
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
