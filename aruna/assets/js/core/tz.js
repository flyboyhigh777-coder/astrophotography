/*
 * Аруна · местное время -> UTC
 * ------------------------------------------------------------------
 * Для карты рождения смещение нельзя брать «текущим» для города: в 1975-м
 * в Москве был UTC+3, в 1985-м летом +4, в 2012-м круглый год +4. Поэтому
 * смещение берём из базы IANA, которая уже есть в браузере (ICU внутри
 * Intl) — она знает всю историю декретного и летнего времени.
 */
(function (root) {
  'use strict';

  var cache = Object.create(null);

  function fmt(timeZone) {
    if (!cache[timeZone]) {
      cache[timeZone] = new Intl.DateTimeFormat('en-US', {
        timeZone: timeZone, hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
    }
    return cache[timeZone];
  }

  /** Смещение зоны в минутах (местное − UTC) в указанный момент времени. */
  function offsetMinutes(utcMs, timeZone) {
    var parts = fmt(timeZone).formatToParts(new Date(utcMs));
    var v = {};
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].type !== 'literal') v[parts[i].type] = parts[i].value;
    }
    var asUtc = Date.UTC(+v.year, +v.month - 1, +v.day,
                         +v.hour % 24, +v.minute, +v.second);
    return Math.round((asUtc - utcMs) / 60000);
  }

  /**
   * Местное «настенное» время в зоне -> момент UTC (мс).
   * Итерация нужна, потому что смещение само зависит от момента;
   * два прохода сходятся всюду, кроме «пропавшего» часа перехода
   * (тогда возвращается ближайший существующий момент).
   */
  function zonedToUtcMs(y, mo, d, h, mi, timeZone) {
    var naive = Date.UTC(y, mo - 1, d, h, mi, 0);
    var utc = naive - offsetMinutes(naive, timeZone) * 60000;
    for (var k = 0; k < 3; k++) {
      var next = naive - offsetMinutes(utc, timeZone) * 60000;
      if (next === utc) break;
      utc = next;
    }
    return utc;
  }

  /** Момент UTC (мс) -> {y, m, d, h, mi, s} в указанной зоне. */
  function utcMsToZoned(utcMs, timeZone) {
    var parts = fmt(timeZone).formatToParts(new Date(utcMs));
    var v = {};
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].type !== 'literal') v[parts[i].type] = parts[i].value;
    }
    return { y: +v.year, m: +v.month, d: +v.day,
             h: +v.hour % 24, mi: +v.minute, s: +v.second };
  }

  /** Подпись смещения вида «UTC+03:00». */
  function offsetLabel(min) {
    var sign = min < 0 ? '−' : '+';
    var a = Math.abs(min);
    return 'UTC' + sign + String(Math.floor(a / 60)).padStart(2, '0') +
           ':' + String(a % 60).padStart(2, '0');
  }

  /** Момент UTC (мс) -> юлианская дата. */
  function msToJd(utcMs) { return utcMs / 86400000 + 2440587.5; }
  /** Юлианская дата -> момент UTC (мс). */
  function jdToMs(jd) { return (jd - 2440587.5) * 86400000; }

  /** Часы+минуты из JD в указанной зоне, строкой «ЧЧ:ММ». */
  function jdToLocalHm(jd, timeZone) {
    if (jd === null || jd === undefined || !isFinite(jd)) return '—';
    var z = utcMsToZoned(Math.round(jdToMs(jd) / 60000) * 60000, timeZone);
    return String(z.h).padStart(2, '0') + ':' + String(z.mi).padStart(2, '0');
  }

  root.ArunaTz = {
    offsetMinutes: offsetMinutes, zonedToUtcMs: zonedToUtcMs,
    utcMsToZoned: utcMsToZoned, offsetLabel: offsetLabel,
    msToJd: msToJd, jdToMs: jdToMs, jdToLocalHm: jdToLocalHm
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
