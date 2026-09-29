/*
 * Аруна · тексты бота
 * ------------------------------------------------------------------
 * Всё, что бот говорит, собирается здесь из расчётов. Отдельный файл
 * нужен по той же причине, по которой на сайте отдельный слой ui:
 * расчёт не должен знать про разметку, а разметка — про астрономию.
 *
 * Тон: коротко, по существу, без «звёзды советуют». Сообщение в мессенджере
 * читают на ходу — длинные рассуждения здесь неуместны, для них есть сайт.
 */
'use strict';

const J = require('./jyotish.js');
const { Telegram } = require('./telegram.js');

const esc = Telegram.esc;
const D = J.Data;

/* ------------------------------------------------------------ помощники */

function hm(jd, tz) { return J.Tz.jdToLocalHm(jd, tz); }

/**
 * Предложный падеж названия раши: «в Меше», а не «в Меша».
 * Все санскритские названия, кроме Дхану, в русском склоняются как слова
 * на -а; Дхану не склоняется.
 */
function rashiIn(name) {
  if (name === 'Дхану') return name;
  return name.replace(/а$/, 'е').replace(/я$/, 'е');
}

function dateRu(utcMs, tz, opts) {
  const o = Object.assign({ day: 'numeric', month: 'long' }, opts || {});
  if (tz) o.timeZone = tz;
  return new Intl.DateTimeFormat('ru-RU', o).format(new Date(utcMs));
}

function dayKey(utcMs, tz) {
  const z = J.Tz.utcMsToZoned(utcMs, tz);
  return z.y + '-' + String(z.m).padStart(2, '0') + '-' + String(z.d).padStart(2, '0');
}

/** Карта пользователя + небо на сейчас. */
function context(user, now) {
  now = now || Date.now();
  const built = J.chartFromBirth(user.birth);
  const tz = user.birth.place.tz;
  const jd = J.Tz.msToJd(now);
  const pan = J.Panchanga.panchanga(jd, user.birth.place.lat, user.birth.place.lon, tz);
  const ayan = J.Chart.ayanamsa(jd);
  const moonNow = J.Chart.describeLongitude(
    J.Chart.toSidereal(pan.positions.moon.lon, ayan));
  const dasha = J.Dasha.current(built.chart.jd, built.chart.moonNakshatra,
    built.chart.grahas.moon.nakFraction, jd);
  return {
    chart: built.chart, birth: user.birth, tz, now, jd, pan, ayan, moonNow, dasha,
    moonBhava: J.Chart.bhavaOf(moonNow.rashi, built.chart.asc.rashi)
  };
}

/* ------------------------------------------------------- утренняя сводка */

function digest(user, now) {
  const c = context(user, now);
  const p = c.pan;
  const lines = [];

  lines.push('<b>' + esc(dateRu(c.now, c.tz, { weekday: 'long', day: 'numeric', month: 'long' })) + '</b>');
  lines.push('');
  lines.push('🌙 Луна в <b>' + esc(rashiIn(c.moonNow.rashiName)) + '</b>, накшатра ' +
             esc(p.nakshatra.name) + ' — это <b>' + c.moonBhava + '-я бхава</b> вашей карты: ' +
             esc(D.BHAVAS[c.moonBhava - 1].title) + '.');
  lines.push('');
  lines.push('<b>Панчанга</b>');
  var calendarDow = new Date(c.now).getUTCDay();
  try {
    var z = J.Tz.utcMsToZoned(c.now, c.tz);
    calendarDow = new Date(Date.UTC(z.y, z.m - 1, z.d)).getUTCDay();
  } catch (e) { /* остаёмся на UTC */ }
  var varaMismatch = p.vara && p.varaIndex !== calendarDow;
  lines.push('· вара — ' + esc(p.vara ? p.vara.sa : '—') +
             (varaMismatch ? ' <i>(ведические сутки идут от восхода, поэтому вара ещё вчерашняя)</i>' : ''));
  lines.push('· титхи — ' + esc(p.tithi.name) + ', ' + esc(p.tithi.pakshaRu) +
             (p.tithi.endJd ? ' до ' + hm(p.tithi.endJd, c.tz) : ''));
  lines.push('· йога — ' + esc(p.yoga.name));

  if (p.sunrise && p.sunset && p.muhurtas) {
    const m = p.muhurtas;
    lines.push('');
    lines.push('<b>Время дня</b>');
    lines.push('· восход ' + hm(p.sunrise, c.tz) + ', закат ' + hm(p.sunset, c.tz));
    lines.push('· абхиджит ' + hm(m.abhijit.from, c.tz) + '–' + hm(m.abhijit.to, c.tz) + ' — хорошее окно');
    lines.push('· раху-кала ' + hm(m.rahu.from, c.tz) + '–' + hm(m.rahu.to, c.tz) + ' — переждать');
  }

  if (c.dasha) {
    lines.push('');
    lines.push('<b>Период</b>: ' + esc(D.GRAHAS[c.dasha.maha.lord].sa) + ' / ' +
               esc(D.GRAHAS[c.dasha.antar.lord].sa) + ' / ' +
               esc(D.GRAHAS[c.dasha.pratyantar.lord].sa));
  }

  const pick = J.Verses.pickVerse({
    varaLord: p.vara ? p.vara.lord : null,
    nakshatraLord: p.nakshatra.lord,
    paksha: p.tithi.paksha,
    tithiName: p.tithi.name,
    dateKey: dayKey(c.now, c.tz)
  });
  lines.push('');
  lines.push('<i>' + esc(pick.verse.ru) + '</i>');
  lines.push('<code>' + esc(pick.verse.src + ' ' + pick.verse.ref) + '</code>');

  return lines.join('\n');
}

/* ------------------------------------------------------------ карта */

function chartSummary(user) {
  const c = context(user);
  const ch = c.chart;
  const lines = [];

  lines.push('<b>Ваша карта</b>');
  lines.push(esc(dateRu(J.chartFromBirth(user.birth).utcMs, c.tz, { year: 'numeric' })) +
             ', ' + esc(user.birth.timeKnown === false ? 'время неизвестно' : user.birth.time) +
             ', ' + esc(user.birth.place.name));
  lines.push('');
  lines.push('· лагна — <b>' + esc(ch.asc.rashiName) + '</b> ' + esc(ch.asc.dms) +
             ', накшатра ' + esc(ch.asc.nakshatraName) + ', пада ' + ch.asc.pada);
  lines.push('· Луна — <b>' + esc(ch.grahas.moon.rashiName) + '</b>, накшатра ' +
             esc(ch.grahas.moon.nakshatraName) + ', пада ' + ch.grahas.moon.pada);
  lines.push('· Солнце — <b>' + esc(ch.grahas.sun.rashiName) + '</b>');
  lines.push('');
  lines.push('<b>Грахи по бхавам</b>');
  ch.bhavas.forEach((b) => {
    if (!b.grahas.length) return;
    lines.push('· ' + b.num + '-я (' + esc(b.rashiName) + ') — ' +
      b.grahas.map((k) => esc(D.GRAHAS[k].sa) + (ch.grahas[k].retro ? ' R' : '')).join(', '));
  });

  const yogas = J.Yogas.findAll(ch);
  if (yogas.list.length) {
    lines.push('');
    lines.push('<b>Йоги</b>: найдено ' + yogas.list.length +
               ', из них сильных ' + yogas.strong.length);
    yogas.list.slice(0, 4).forEach((y) => {
      lines.push('· ' + esc(y.title) + (y.adverse ? ' ⚠️' : ''));
    });
    if (yogas.list.length > 4) lines.push('· …и ещё ' + (yogas.list.length - 4) + ' — на сайте');
  }

  return lines.join('\n');
}

/* ------------------------------------------------------------- даша */

function dashaText(user) {
  const c = context(user);
  if (!c.dasha) return 'Не удалось посчитать периоды.';
  const ch = c.chart;
  const frac = ch.grahas.moon.nakFraction;
  const list = J.Dasha.mahadashas(ch.jd, ch.moonNakshatra, frac).slice(0, 9);

  const fmt = (jd) => {
    const d = J.Astro.fromJulianDay(jd);
    return String(d.d).padStart(2, '0') + '.' + String(d.m).padStart(2, '0') + '.' + d.y;
  };

  const lines = ['<b>Вимшоттари-даша</b>', ''];
  lines.push('Сейчас: <b>' + esc(D.GRAHAS[c.dasha.maha.lord].sa) + '</b> / ' +
             esc(D.GRAHAS[c.dasha.antar.lord].sa) + ' / ' +
             esc(D.GRAHAS[c.dasha.pratyantar.lord].sa));
  lines.push('Антардаша до ' + fmt(c.dasha.antar.to) + ', махадаша до ' + fmt(c.dasha.maha.to));
  lines.push('');
  lines.push('<b>Все периоды</b>');
  list.forEach((p) => {
    const now = c.jd >= p.from && c.jd < p.to;
    lines.push((now ? '▶ ' : '· ') + esc(D.GRAHAS[p.lord].sa).padEnd(8) +
               ' ' + fmt(p.from) + ' — ' + fmt(p.to));
  });
  return lines.join('\n');
}

/* ---------------------------------------------------------- мухурта */

function muhurtaText(user, task) {
  const c = context(user);
  const r = J.Muhurta.scoreDay({
    jd: c.jd, lat: user.birth.place.lat, lon: user.birth.place.lon,
    tz: c.tz, task: task || 'start', chart: c.chart
  });
  if (!r) return 'В этот день солнце не восходит или не заходит — отрезки дня не строятся.';

  const lines = ['<b>' + esc(r.task.title) + ' · сегодня</b>', ''];
  lines.push('<b>Лучшее время</b>');
  r.best.slice(0, 3).forEach((w) => {
    lines.push('· ' + hm(w.from, c.tz) + '–' + hm(w.to, c.tz) + '  (' + (w.score > 0 ? '+' : '') + w.score + ')');
  });
  lines.push('');
  lines.push('<b>Лучше переждать</b>');
  r.worst.slice(0, 3).forEach((w) => {
    lines.push('· ' + hm(w.from, c.tz) + '–' + hm(w.to, c.tz) + '  (' + w.score + ')');
  });
  lines.push('');
  lines.push('<i>Из чего сложилась лучшая оценка:</i>');
  r.best[0].reasons.filter((x) => x.w !== 0)
    .sort((a, b) => b.w - a.w).slice(0, 5)
    .forEach((x) => lines.push('· ' + (x.w > 0 ? '+' : '') + x.w + ' ' + esc(x.t)));
  return lines.join('\n');
}

/* ------------------------------------------------- сарвашта-кавварга */

function savText(user) {
  const c = context(user);
  const sv = J.Sarvashtaka.sarva(c.chart);
  const lines = ['<b>Сарвашта-кавварга</b>',
    'Очки бинду по раши. Среднее по кругу — ' + sv.average + ', всего всегда 337.', ''];

  sv.rows.slice().sort((a, b) => a.bhava - b.bhava).forEach((r) => {
    const bar = '█'.repeat(Math.max(1, Math.round(r.bindu / 4)));
    lines.push(String(r.bhava).padStart(2) + '-я ' + esc(r.rashiName).padEnd(10) +
               ' ' + String(r.bindu).padStart(2) + ' ' + bar);
  });

  lines.push('');
  lines.push('Больше всего: ' + sv.strongest.map((r) => esc(r.rashiName) + ' ' + r.bindu).join(', '));
  lines.push('Меньше всего: ' + sv.weakest.map((r) => esc(r.rashiName) + ' ' + r.bindu).join(', '));

  // где сейчас Шани и Гуру и сколько там бинду — то, ради чего систему и смотрят
  lines.push('');
  lines.push('<b>Медленные грахи сейчас</b>');
  ['saturn', 'jupiter'].forEach((k) => {
    const lon = J.Chart.toSidereal(J.Astro.planet(k, J.Astro.jdToJde(c.jd)).lon, c.ayan);
    const rashi = Math.floor(lon / 30);
    const t = J.Sarvashtaka.transitScore(c.chart, k, rashi);
    lines.push('· ' + esc(D.GRAHAS[k].sa) + ' в ' + esc(rashiIn(t.rashiName)) +
               ' — ' + t.bindu + '/8 бинду, ' + esc(t.band));
  });

  return lines.join('\n');
}

/* ------------------------------------------------------------ навамша */

function navamshaText(user) {
  const c = context(user);
  const d9 = J.Varga.buildVarga(c.chart, 'D9');
  const vo = J.Varga.vargottama(c.chart);

  const lines = ['<b>Навамша (D9)</b>',
    'Вторая по важности карта: показывает, насколько прочно держится обещанное раши-картой.', ''];
  lines.push('Лагна навамши — <b>' + esc(d9.asc.rashiName) + '</b>');
  lines.push('');
  J.Astro.GRAHA_ORDER.forEach((k) => {
    const g = d9.grahas[k];
    lines.push('· ' + esc(D.GRAHAS[k].sa).padEnd(8) + ' ' + esc(g.rashiName).padEnd(10) +
               ' ' + g.bhava + '-я' + (g.vargottama ? '  ⭐ варготтама' : ''));
  });
  if (vo.length) {
    lines.push('');
    lines.push('<b>Варготтама</b>: ' + vo.map((k) => esc(D.GRAHAS[k].sa)).join(', ') +
               ' — тот же раши в D1 и D9, признак прочности.');
  }
  return lines.join('\n');
}

/* ------------------------------------------------------------ дневник */

/** Луна в какой бхаве была в этот день — для статистики дневника. */
function moonBhavaOn(user, dateKeyStr) {
  const parts = dateKeyStr.split('-').map(Number);
  const jd = J.Astro.julianDay(parts[0], parts[1], parts[2], 12);
  const built = J.chartFromBirth(user.birth);
  const lon = J.Chart.toSidereal(J.Astro.moon(J.Astro.jdToJde(jd)).lon, J.Chart.ayanamsa(jd));
  return J.Chart.bhavaOf(Math.floor(lon / 30), built.chart.asc.rashi);
}

function moodStats(user) {
  const entries = user.mood || [];
  if (entries.length < 7) {
    return 'Пока мало отметок: <b>' + entries.length + '</b>. Статистика становится ' +
      'осмысленной примерно с трёх недель — отмечайте день кнопкой, и я покажу, ' +
      'на какие бхавы Луны приходятся ваши тяжёлые дни.';
  }

  const byBhava = {};
  entries.forEach((e) => {
    const b = e.moonBhava;
    if (!byBhava[b]) byBhava[b] = { n: 0, sum: 0 };
    byBhava[b].n += 1;
    byBhava[b].sum += e.value;
  });

  const rows = Object.keys(byBhava).map((b) => ({
    bhava: Number(b),
    n: byBhava[b].n,
    avg: byBhava[b].sum / byBhava[b].n
  })).filter((r) => r.n >= 2).sort((a, b) => b.avg - a.avg);

  const lines = ['<b>Ваш дневник</b>', 'Отметок: ' + entries.length +
    '. Это статистика по вашим же данным, а не предсказание.', ''];

  if (!rows.length) {
    lines.push('Отметок по каждой бхаве пока меньше двух — нужно ещё немного времени.');
    return lines.join('\n');
  }

  lines.push('<b>Легче всего</b>');
  rows.slice(0, 3).forEach((r) => {
    lines.push('· Луна в ' + r.bhava + '-й бхаве (' + esc(D.BHAVAS[r.bhava - 1].title) + ') — ' +
               'средняя оценка ' + r.avg.toFixed(2) + ' по ' + r.n + ' дням');
  });
  lines.push('');
  lines.push('<b>Тяжелее всего</b>');
  rows.slice(-3).reverse().forEach((r) => {
    lines.push('· Луна в ' + r.bhava + '-й бхаве (' + esc(D.BHAVAS[r.bhava - 1].title) + ') — ' +
               'средняя оценка ' + r.avg.toFixed(2) + ' по ' + r.n + ' дням');
  });

  const spread = rows[0].avg - rows[rows.length - 1].avg;
  lines.push('');
  lines.push(spread >= 0.5
    ? '<i>Разброс заметный: ваши дни действительно по-разному ложатся на движение Луны.</i>'
    : '<i>Разброс небольшой — пока нельзя сказать, что Луна что-то определяет. ' +
      'Это тоже честный результат.</i>');
  return lines.join('\n');
}

/* ------------------------------------------------------- уведомления */

/**
 * Что изменилось со вчера: смена антардаши, вход Гуру или Шани в новый раши.
 * Возвращает массив сообщений (обычно пустой).
 */
function alerts(user, now) {
  const out = [];
  if (!user.birth) return out;
  const c = context(user, now);
  const notified = user.notified || {};

  if (c.dasha) {
    const key = c.dasha.maha.lord + '/' + c.dasha.antar.lord;
    if (notified.antar && notified.antar !== key) {
      const d = J.Astro.fromJulianDay(c.dasha.antar.to);
      out.push({
        key: 'antar', value: key,
        text: '🔔 <b>Сменился период</b>\n\nНачалась антардаша <b>' +
          esc(D.GRAHAS[c.dasha.antar.lord].sa) + '</b> внутри махадаши ' +
          esc(D.GRAHAS[c.dasha.maha.lord].sa) + ' — до ' +
          String(d.d).padStart(2, '0') + '.' + String(d.m).padStart(2, '0') + '.' + d.y + '.\n\n' +
          esc(D.GRAHAS[c.dasha.antar.lord].karaka) + ' — темы этой грахи ближайшие месяцы ' +
          'звучат громче остальных.'
      });
    } else if (!notified.antar) {
      out.push({ key: 'antar', value: key, silent: true });
    }
  }

  ['jupiter', 'saturn'].forEach((k) => {
    const lon = J.Chart.toSidereal(J.Astro.planet(k, J.Astro.jdToJde(c.jd)).lon, c.ayan);
    const rashi = Math.floor(lon / 30);
    const key = String(rashi);
    if (notified[k] && notified[k] !== key) {
      const bhava = J.Chart.bhavaOf(rashi, c.chart.asc.rashi);
      const sav = J.Sarvashtaka.transitScore(c.chart, k, rashi);
      out.push({
        key: k, value: key,
        text: '🔔 <b>' + esc(D.GRAHAS[k].sa) + ' сменил раши</b>\n\n' +
          'Теперь в ' + esc(rashiIn(D.RASHIS[rashi].sa)) + ' — это <b>' + bhava + '-я бхава</b> ' +
          'вашей карты: ' + esc(D.BHAVAS[bhava - 1].about) + '.\n\n' +
          'Бинду в этом раши: ' + sav.bindu + ' из 8 — ' + esc(sav.band) + '.'
      });
    } else if (!notified[k]) {
      out.push({ key: k, value: key, silent: true });
    }
  });

  return out;
}

module.exports = {
  context, digest, chartSummary, dashaText, muhurtaText,
  savText, navamshaText, moodStats, moonBhavaOn, alerts,
  dateRu, dayKey, hm, esc, rashiIn
};
