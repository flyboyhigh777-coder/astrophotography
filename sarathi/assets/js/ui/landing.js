/*
 * Сарати · оживление главной страницы
 * ------------------------------------------------------------------
 * «Небо прямо сейчас» и стих дня считаются здесь же, в браузере: это не
 * заглушка, а тот же расчёт, что и на странице карты. Если гость уже
 * строил свою карту, небо дня показывается над ней.
 */
(function (root, doc) {
  'use strict';

  var S = root.Sarathi, A = root.SarathiAstro, C = root.SarathiChart,
      P = root.SarathiPanchanga, D = root.SarathiData, Tz = root.SarathiTz,
      View = root.SarathiChartView, Verses = root.SarathiVerses;

  function renderSky() {
    var host = S.q('#skyWheel');
    if (!host) return;

    var saved = S.loadBirth();
    var place = saved ? saved.place : S.guessPlace();
    var now = Date.now();
    var jd = Tz.msToJd(now);

    var pan = P.panchanga(jd, place.lat, place.lon, place.tz);
    var ayan = C.ayanamsa(jd);
    var sid = {};
    A.GRAHA_ORDER.forEach(function (k) {
      var t = pan.positions[k];
      sid[k] = {
        lon: C.toSidereal(t.lon, ayan),
        retro: (k === 'rahu' || k === 'ketu') ? true :
               (k === 'sun' || k === 'moon') ? false : t.speed < 0
      };
    });

    // если карта гостя сохранена — ставим его лагну в начало круга
    var natal = null, ascLon = null;
    if (saved) {
      try {
        natal = S.chartFromBirth(saved).chart;
        ascLon = natal.asc.lon;
      } catch (e) { natal = null; }
    }

    host.innerHTML = View.wheel({
      grahas: sid, size: 340,
      zeroLon: ascLon === null ? 0 : ascLon,
      ascLon: ascLon === null ? undefined : ascLon,
      title: 'Положение грах прямо сейчас в сидерическом зодиаке'
    });

    // «29 сентября 2026 г.» -> «29 сентября 2026»: «г.» рядом со временем лишнее
    S.q('#skyDate').textContent =
      S.dateRu(now, place.tz).replace(/\s*г\.$/, '') + ', ' + S.timeRu(now, place.tz);
    S.q('#skyPlace').textContent = place.name;

    var moon = C.describeLongitude(sid.moon.lon);
    var rows = [
      ['Вара', (pan.vara ? pan.vara.sa : '—') + (pan.vara ? ' · ' + pan.vara.ru : '')],
      ['Титхи', pan.tithi.name + ' · ' + pan.tithi.pakshaRu],
      ['Накшатра Луны', pan.nakshatra.name + ', пада ' + pan.nakshatra.pada],
      ['Йога', pan.yoga.name],
      ['Луна в раши', moon.rashiName + ' ' + moon.dms]
    ];
    if (pan.sunrise && pan.sunset) {
      rows.push(['Восход · закат',
        Tz.jdToLocalHm(pan.sunrise, place.tz) + ' · ' + Tz.jdToLocalHm(pan.sunset, place.tz)]);
    }
    if (natal) {
      rows.push(['Луна в бхаве', C.bhavaOf(moon.rashi, natal.asc.rashi) + '-я от вашей лагны']);
    }

    S.q('#skyRows').innerHTML = rows.map(function (r) {
      return '<dt>' + S.esc(r[0]) + '</dt><dd><b>' + S.esc(r[1]) + '</b></dd>';
    }).join('');

    S.q('#skyNote').textContent = natal
      ? 'Небо дня над вашей картой. Считается у вас на устройстве.'
      : 'Пока без вашей карты: круг начинается с Меши. Постройте карту — и он развернётся от вашей лагны.';

    renderVerse(pan, now, place.tz);
  }

  function renderVerse(pan, now, tz) {
    if (!S.q('#verseSa')) return;
    var pick = Verses.pickVerse({
      varaLord: pan.vara ? pan.vara.lord : null,
      nakshatraLord: pan.nakshatra.lord,
      paksha: pan.tithi.paksha,
      tithiName: pan.tithi.name,
      dateKey: S.dayKey(now, tz)
    });
    S.q('#verseSa').textContent = pick.verse.sa;
    S.q('#verseRu').textContent = pick.verse.ru;
    S.q('#verseRef').textContent = pick.verse.src + ' ' + pick.verse.ref;

    var why = [];
    if (pan.vara) why.push('вара ' + D.GRAHAS[pan.vara.lord].sa);
    why.push('накшатра ' + pan.nakshatra.name);
    why.push(pan.tithi.pakshaRu);
    S.q('#verseWhy').textContent = 'выбран по: ' + why.join(' · ');
  }

  function initChat() {
    var chat = S.q('#chat');
    if (!chat) return;
    if (S.reducedMotion() || !root.IntersectionObserver) { chat.classList.add('is-live'); return; }
    var io = new IntersectionObserver(function (en) {
      if (en[0].isIntersecting) { chat.classList.add('is-live'); io.disconnect(); }
    }, { threshold: 0.3 });
    io.observe(chat);
  }

  function start() {
    try { renderSky(); }
    catch (e) {
      // расчёт не должен ломать страницу: показываем честную заглушку
      var host = S.q('#skyRows');
      if (host) host.innerHTML = '<dt>Небо дня</dt><dd><b>не удалось рассчитать</b></dd>';
      if (root.console) root.console.error('Сарати: ошибка расчёта неба дня', e);
    }
    initChat();
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
  else start();
})(typeof globalThis !== 'undefined' ? globalThis : this, document);
