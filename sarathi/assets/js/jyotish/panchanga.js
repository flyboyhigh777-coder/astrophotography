/*
 * Сарати · панчанга и мухурта
 * ------------------------------------------------------------------
 * Пять «конечностей» дня: титхи, вара, накшатра, йога, карана — плюс
 * восход/закат и отрезки времени, которые традиция советует обходить
 * (раху-кала, ямаганда, гулика) или использовать (абхиджит, брахма-мухурта).
 *
 * Важно: ведические сутки начинаются с восхода, а не в полночь. Вара до
 * восхода относится к предыдущему дню — это здесь учтено.
 */
(function (root) {
  'use strict';

  var A = root.SarathiAstro, D = root.SarathiData, C = root.SarathiChart;

  /** Решает f(t) = target на [lo, hi] бисекцией (f монотонна). */
  function solve(f, target, lo, hi) {
    var flo = f(lo) - target, fhi = f(hi) - target;
    if (!isFinite(flo) || !isFinite(fhi) || flo * fhi > 0) return null;
    for (var i = 0; i < 48; i++) {
      var mid = (lo + hi) / 2, fm = f(mid) - target;
      if (flo * fm <= 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
    }
    return (lo + hi) / 2;
  }

  function sunLon(jd) { return A.sun(A.jdToJde(jd)).lon; }
  function moonLon(jd) { return A.moon(A.jdToJde(jd)).lon; }
  /** Элонгация Луны от Солнца, 0-360 (растёт монотонно). */
  function elongation(jd) { return A.norm360(moonLon(jd) - sunLon(jd)); }

  /** Момент, когда величина v(jd) дорастёт до следующей границы шага step. */
  function nextBoundary(v, jd, step) {
    var v0 = v(jd);
    var target = (Math.floor(v0 / step) + 1) * step;
    var rel = function (t) { return v0 + A.diff180(v(t), v0); };
    return solve(rel, target, jd, jd + 2.2);
  }

  /** Титхи: {index 0-29, paksha, name, endJd}. */
  function tithi(jd) {
    var e = elongation(jd);
    var idx = Math.floor(e / 12);
    var shukla = idx < 15;
    var name;
    if (idx === 14) name = 'Пурнима';
    else if (idx === 29) name = 'Амавасья';
    else name = D.TITHI_NAMES[idx % 15];
    return {
      index: idx, paksha: shukla ? 'шукла' : 'кришна',
      pakshaRu: shukla ? 'растущая Луна' : 'убывающая Луна',
      name: name, numberInPaksha: (idx % 15) + 1,
      fraction: (e - idx * 12) / 12,
      endJd: nextBoundary(elongation, jd, 12)
    };
  }

  /** Накшатра Луны (сидерическая): {index, name, pada, endJd}. */
  function moonNakshatra(jd) {
    var sid = function (t) { return C.toSidereal(moonLon(t), C.ayanamsa(t)); };
    var info = C.describeLongitude(sid(jd));
    return {
      index: info.nakshatra, name: info.nakshatraName, lord: info.nakshatraLord,
      pada: info.pada, fraction: info.nakFraction,
      endJd: nextBoundary(sid, jd, 360 / 27)
    };
  }

  /** Йога: сумма долгот Солнца и Луны по 13°20′. */
  function yoga(jd) {
    var sum = function (t) { return A.norm360(sunLon(t) + moonLon(t)); };
    var v = sum(jd);
    var idx = Math.floor(v / (360 / 27));
    return {
      index: idx, name: D.YOGA_NAMES[idx],
      endJd: nextBoundary(sum, jd, 360 / 27)
    };
  }

  /** Карана: полутитхи, 60 за лунный месяц. */
  function karana(jd) {
    var e = elongation(jd);
    var n = Math.floor(e / 6) + 1;          // 1..60
    var name;
    if (n === 1) name = D.KARANA_FIXED[3];               // Кимстугхна
    else if (n >= 58) name = D.KARANA_FIXED[n - 58];     // Шакуни, Чатушпада, Нага
    else name = D.KARANA_CYCLE[(n - 2) % 7];
    return { index: n, name: name, endJd: nextBoundary(elongation, jd, 6) };
  }

  /**
   * Полночь местных календарных суток, к которым относится момент jd.
   * С зоной IANA — настоящая полночь по зоне (с историей переходов);
   * без зоны — полночь местного среднего солнечного времени по долготе.
   */
  function localMidnightJd(jd, lonEast, tz) {
    var Tz = root.SarathiTz;
    if (tz && Tz) {
      var z = Tz.utcMsToZoned(Tz.jdToMs(jd), tz);
      return Tz.msToJd(Tz.zonedToUtcMs(z.y, z.m, z.d, 0, 0, tz));
    }
    return Math.floor(jd + lonEast / 360 + 0.5) - 0.5 - lonEast / 360;
  }

  /** День недели (0 = воскресенье) в месте наблюдения, а не по UTC. */
  function weekday(jd, lonEast, tz) {
    var Tz = root.SarathiTz;
    if (tz && Tz) {
      var z = Tz.utcMsToZoned(Tz.jdToMs(jd), tz);
      return new Date(Date.UTC(z.y, z.m - 1, z.d)).getUTCDay();
    }
    return (Math.floor(jd + lonEast / 360 + 1.5) % 7 + 7) % 7;
  }

  /**
   * Полная панчанга на момент jd для места (lat, lonEast).
   * @param {string} [tz] зона IANA — тогда сутки и вара считаются по ней
   * Возвращает и сами отрезки времени (в JD), чтобы UI сам решал, как их
   * показывать в местной зоне.
   */
  function panchanga(jd, lat, lonEast, tz) {
    var t = tithi(jd), nak = moonNakshatra(jd), yg = yoga(jd), kr = karana(jd);

    // ведические сутки: ищем восход, которым начался текущий день
    var midnight = localMidnightJd(jd, lonEast, tz);
    var today = A.sunriseSunset(midnight, lat, lonEast);
    var rise = today.rise, set = today.set;
    if (rise !== null && jd < rise) {                   // ещё «вчера» по традиции
      var prev = A.sunriseSunset(localMidnightJd(midnight - 0.5, lonEast, tz), lat, lonEast);
      if (prev.rise !== null) { rise = prev.rise; set = prev.set; }
    }

    // вара определяется по восходу, а не по календарной полуночи
    var varaIdx = null, vara = null;
    if (rise !== null) {
      varaIdx = weekday(rise, lonEast, tz);
      vara = D.VARAS[varaIdx];
    }

    var parts = null;
    if (rise !== null && set !== null && set > rise) {
      var dayLen = set - rise, eighth = dayLen / 8, fifteenth = dayLen / 15;
      var span = function (n) { return { from: rise + (n - 1) * eighth, to: rise + n * eighth }; };
      parts = {
        dayLengthHours: dayLen * 24,
        rahu: span(D.RAHU_KALA_PART[varaIdx]),
        yamaganda: span(D.YAMA_KALA_PART[varaIdx]),
        gulika: span(D.GULIKA_PART[varaIdx]),
        abhijit: { from: rise + 7 * fifteenth, to: rise + 8 * fifteenth },
        brahma: { from: rise - 96 / 1440, to: rise - 48 / 1440 }
      };
    }

    return {
      jd: jd, tithi: t, nakshatra: nak, yoga: yg, karana: kr,
      vara: vara, varaIndex: varaIdx,
      sunrise: rise, sunset: set, muhurtas: parts,
      // «небо дня» целиком — чтобы показать транзиты рядом с картой
      positions: A.tropicalPositions(jd)
    };
  }

  root.SarathiPanchanga = {
    panchanga: panchanga, tithi: tithi, moonNakshatra: moonNakshatra,
    yoga: yoga, karana: karana, elongation: elongation,
    localMidnightJd: localMidnightJd, weekday: weekday
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
