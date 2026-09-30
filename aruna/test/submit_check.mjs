/* Нажатие настоящих кнопок расчёта.
 *
 * Прежний браузерный тест жал «Показать на примере» — а она считает
 * напрямую, минуя разбор формы. Из-за этого поломка в обработчике
 * отправки прошла мимо тестов: на телефоне кнопка «Построить карту»
 * молча ничего не делала. Здесь заполняем форму руками и жмём саму
 * кнопку — как человек.
 *
 * Запуск: node test/submit_check.mjs [корень сайта]
 */
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));

const ROOT = process.argv[2] ||
  path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json' };

const srv = http.createServer((q, r) => {
  const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
    r.writeHead(404); return r.end('нет');
  }
  r.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(r);
});
await new Promise(r => srv.listen(0, r));
const base = `http://127.0.0.1:${srv.address().port}`;
const browser = await chromium.launch();
let bad = 0;

function watch(page, errs) {
  page.on('pageerror', e => errs.push('исключение: ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/fonts\.(googleapis|gstatic)|ERR_CERT_AUTHORITY_INVALID/.test(t)) return;
    errs.push('консоль: ' + t);
  });
}

// Заполняем один блок формы рождения так, как это делает человек:
// печатаем город и выбираем его из подсказки.
async function fillBirth(scope, { date, time, city }) {
  await scope.locator('input[type=date]').first().fill(date);
  const t = scope.locator('input[type=time]').first();
  if (await t.count() && await t.isEnabled()) await t.fill(time);
  const place = scope.locator('input[name=place], .place-input, input[autocomplete=off]').first();
  await place.click();
  await place.fill('');
  await place.type(city, { delay: 40 });
  const opt = scope.locator('.place-list.is-open button, [role=option]').first();
  await opt.waitFor({ state: 'visible', timeout: 5000 });
  const label = (await opt.innerText()).replace(/\s+/g, ' ').trim();
  await opt.click();
  return label;
}

/* ------------------------------------------------ западная натальная карта */
for (const [what, viewport] of [['настольный', { width: 1280, height: 860 }],
                                ['телефон', { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errs = []; watch(page, errs);
  await page.goto(base + '/natal.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: 'networkidle' });

  const label = await fillBirth(page.locator('#birthPanel'),
    { date: '1993-05-03', time: '08:00', city: 'Ташкент' });

  await page.locator('#birthPanel button[type=submit]').click();
  await page.waitForTimeout(2200);

  const shown = await page.locator('#results').isVisible();
  const meta = await page.locator('#chartMeta').innerText().catch(() => '');
  const glyphs = await page.locator('#results svg text').count();
  const errText = await page.locator('#formError').isVisible()
    ? await page.locator('#formError').innerText() : '';
  const box = await page.locator('#results').boundingBox();
  const vh = viewport.height;
  const inView = box && box.y < vh * 0.85;      // результат попал на экран

  const ok = shown && glyphs > 20 && !errText && inView
    && /Ташкент/.test(meta) && errs.length === 0;
  if (!ok) bad++;
  console.log(`${ok ? '✓' : '✗'} натальная карта / ${what}: «Построить карту»`);
  console.log(`   подсказка города: ${JSON.stringify(label)}`);
  console.log(`   подпись: ${JSON.stringify(meta)}`);
  console.log(`   результат виден: ${shown}, глифов ${glyphs}, на экране: ${inView}`);
  if (errText) console.log(`   ошибка формы: ${errText}`);
  if (errs.length) console.log('   ' + errs.join('\n   '));
  await ctx.close();
}

/* ---------------------------------------------------------- джйотиш-карта */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = []; watch(page, errs);
  await page.goto(base + '/chart.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: 'networkidle' });
  await fillBirth(page.locator('#birthPanel'), { date: '1993-05-03', time: '08:00', city: 'Ташкент' });
  await page.locator('#birthPanel button[type=submit]').click();
  await page.waitForTimeout(2200);
  const glyphs = await page.locator('#results svg text, #results .rashi').count();
  const box = await page.locator('#results').boundingBox();
  const inView = box && box.y < 844 * 0.85;
  const ok = glyphs > 5 && inView && errs.length === 0;
  if (!ok) bad++;
  console.log(`${ok ? '✓' : '✗'} джйотиш-карта / телефон: «Построить карту» (элементов ${glyphs}, на экране: ${inView})`);
  if (errs.length) console.log('   ' + errs.join('\n   '));
  await ctx.close();
}

/* ---------------------------------------------------------- совместимость */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = []; watch(page, errs);
  await page.goto(base + '/compat.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: 'networkidle' });
  const blocks = page.locator('#formA, #formB');
  const n = await blocks.count();
  await fillBirth(blocks.nth(0), { date: '1993-05-03', time: '08:00', city: 'Ташкент' });
  await fillBirth(blocks.nth(n - 1), { date: '2004-05-06', time: '12:00', city: 'Ташкент' });
  await page.locator('#pairPanel button[type=submit]').click();
  await page.waitForTimeout(2200);
  const text = await page.locator('#results').innerText();
  const box = await page.locator('#results').boundingBox();
  const inView = box && box.y < 844 * 0.85;
  const errText = await page.locator('#formError').isVisible()
    ? await page.locator('#formError').innerText() : '';
  const ok = text.length > 200 && inView && !errText && errs.length === 0;
  if (!ok) bad++;
  console.log(`${ok ? '✓' : '✗'} совместимость / телефон: «Сопоставить карты» (текста ${text.length}, на экране: ${inView})`);
  if (errText) console.log(`   ошибка формы: ${errText}`);
  if (errs.length) console.log('   ' + errs.join('\n   '));
  await ctx.close();
}

/* --------------------- город набран, но в подсказку не тыкали --------- */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = []; watch(page, errs);
  await page.goto(base + '/natal.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: 'networkidle' });
  const f = page.locator('#birthPanel');
  await f.locator('input[type=date]').first().fill('1993-05-03');
  await f.locator('input[type=time]').first().fill('08:00');
  const place = f.locator('input[role=combobox]').first();
  await place.click();
  await place.type('Ташкент', { delay: 40 });     // подсказку не трогаем
  await page.locator('#birthPanel button[type=submit]').click();
  await page.waitForTimeout(2000);
  const meta = await page.locator('#chartMeta').innerText().catch(() => '');
  const glyphs = await page.locator('#results svg text').count();
  const errText = await page.locator('#formError').isVisible()
    ? await page.locator('#formError').innerText() : '';
  const ok = glyphs > 20 && !errText && /Ташкент, Узбекистан/.test(meta) && errs.length === 0;
  if (!ok) bad++;
  console.log(`${ok ? '\u2713' : '\u2717'} город набран без выбора из списка: ${JSON.stringify(meta)}`);
  if (errText) console.log(`   ошибка формы: ${errText}`);
  if (errs.length) console.log('   ' + errs.join('\n   '));
  await ctx.close();
}

/* ------------------------- выбор из списка по-прежнему работает -------- */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = []; watch(page, errs);
  await page.goto(base + '/natal.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: 'networkidle' });
  const f = page.locator('#birthPanel');
  await f.locator('input[type=date]').first().fill('1990-01-01');
  const place = f.locator('input[role=combobox]').first();
  await place.click();
  await place.type('Сама', { delay: 40 });         // Самара и Самарканд
  const opts = page.locator('.place-list.is-open button');
  await opts.first().waitFor({ state: 'visible', timeout: 5000 });
  const n = await opts.count();
  const want = (await opts.nth(n - 1).innerText()).replace(/\s+/g, ' ').trim();
  await opts.nth(n - 1).click();                   // тычем во второй город
  await page.waitForTimeout(300);
  const got = await place.inputValue();
  const ok = n >= 2 && want.startsWith(got) && errs.length === 0;
  if (!ok) bad++;
  console.log(`${ok ? '\u2713' : '\u2717'} тычок в подсказку: из ${n} вариантов выбран ${JSON.stringify(got)} (${JSON.stringify(want)})`);
  if (errs.length) console.log('   ' + errs.join('\n   '));
  await ctx.close();
}

/* --------------- кнопка расчёта не уезжает из-под пальца ------------- */
for (const w of [320, 360, 390, 430, 768, 1280]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(base + '/natal.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: 'networkidle' });
  // Перебираем все часовые пояса: подсказка под полем меняет длину, а
  // кнопка «Построить карту» стоит прямо под ней.
  const r = await page.evaluate(() => {
    const C = globalThis.ArunaCities, Tz = globalThis.ArunaTz;
    const hint = document.getElementById('bf1hint');
    const btn = document.querySelector('#birthPanel button[type=submit]');
    const base = btn.getBoundingClientRect().top + scrollY;
    let worst = 0, who = '';
    const seen = new Set();
    for (const c of C.CITIES) {
      if (seen.has(c[3])) continue;
      seen.add(c[3]);
      const ms = Tz.zonedToUtcMs(1990, 5, 15, 12, 0, c[3]);
      hint.textContent = c[3] + ' · на эту дату ' +
        Tz.offsetLabel(Tz.offsetMinutes(ms, c[3])) + ' — с декретным и летним временем.';
      const d = Math.abs(btn.getBoundingClientRect().top + scrollY - base);
      if (d > worst) { worst = d; who = c[3]; }
    }
    return { worst, who };
  });
  const ok = r.worst < 1;
  if (!ok) bad++;
  console.log(`${ok ? '\u2713' : '\u2717'} кнопка на месте / ${w}px: сдвиг ${r.worst.toFixed(1)}px${r.who ? ' (худшая зона ' + r.who + ')' : ''}`);
  await ctx.close();
}

await browser.close();
srv.close();
console.log(bad === 0 ? '\nкнопки расчёта работают' : `\nпроблем: ${bad}`);
process.exit(bad === 0 ? 0 : 1);
