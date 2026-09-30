/* Подсказки к словам и страница словаря — в настоящем браузере.
 *
 * Проверяется то, чего не видно в разметке: подсказка обязана
 * открываться мышью, пальцем и с клавиатуры, не вылезать за край
 * экрана и закрываться по Escape. Половина людей приходит с телефона,
 * и «наведите на слово» для них пустой звук.
 *
 * Запуск: node test/glossary_check.mjs [корень сайта]
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
function say(ok, line) { if (!ok) bad++; console.log((ok ? '✓ ' : '✗ ') + line); }

/* ------------------------------------------- подсказки: мышь и клавиатура */
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errs = []; watch(page, errs);
  await page.goto(base + '/chart.html', { waitUntil: 'networkidle' });
  await page.click('#exampleBtn');
  await page.waitForTimeout(2200);

  const marked = await page.locator('.term').count();
  say(marked >= 20, `размечено слов: ${marked}`);

  const term = page.locator('.term:visible').first();
  await term.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  await term.hover();
  await page.waitForTimeout(350);
  const word = await page.locator('.termtip__word').innerText().catch(() => '');
  const text = await page.locator('.termtip__text').innerText().catch(() => '');
  say(word.length > 0 && text.length > 40, `мышь открывает подсказку: «${word}»`);

  await page.mouse.move(4, 4);
  await page.waitForTimeout(420);
  say(!(await page.locator('.termtip').isVisible()), 'мышь уведена — подсказка скрылась');

  await term.focus();
  await page.waitForTimeout(300);
  say(await page.locator('.termtip').isVisible(), 'Tab доводит до слова и открывает подсказку');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const closed = !(await page.locator('.termtip').isVisible());
  const back = await page.evaluate(() => document.activeElement.classList.contains('term'));
  say(closed && back, 'Escape закрывает и возвращает фокус на слово');

  // не вылезает за край, где бы слово ни стояло
  const vis = page.locator('.term:visible');
  const n = Math.min(await vis.count(), 14);
  let worst = 0;
  for (let i = 0; i < n; i++) {
    const t = vis.nth(i);
    await t.scrollIntoViewIfNeeded();
    await t.hover(); await page.waitForTimeout(190);
    const box = await page.locator('.termtip').boundingBox();
    if (box) worst = Math.max(worst, -box.x, box.x + box.width - 1280);
    await page.mouse.move(2, 2); await page.waitForTimeout(110);
  }
  say(worst < 1, `подсказка не выходит за край экрана (максимум ${worst.toFixed(1)}px)`);
  say(errs.length === 0, `без ошибок${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
  await ctx.close();
}

/* --------------------------------------------------------- палец на телефоне */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = []; watch(page, errs);
  await page.goto(base + '/today.html', { waitUntil: 'networkidle' });
  await page.click('.sign');
  await page.waitForTimeout(1200);

  const t = page.locator('#today .term').first();
  await t.scrollIntoViewIfNeeded();
  await t.tap();
  await page.waitForTimeout(350);
  const open = await page.locator('.termtip').isVisible();
  const box = open ? await page.locator('.termtip').boundingBox() : null;
  const inside = box && box.x >= -1 && box.x + box.width <= 391;
  say(open && inside, `палец: подсказка открылась и влезла в экран`);

  await t.tap(); await page.waitForTimeout(300);
  say(!(await page.locator('.termtip').isVisible()), 'повторный тап закрывает');
  say(errs.length === 0, `без ошибок${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
  await ctx.close();
}

/* ------------------------------------------------------------- страница словаря */
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errs = []; watch(page, errs);
  await page.goto(base + '/glossary.html', { waitUntil: 'networkidle' });

  const words = await page.locator('.gl dt').count();
  const groups = await page.locator('#glList .panel').count();
  const total = await page.evaluate(() => window.ArunaGlossary.TERMS.length);
  say(words === total && groups >= 6, `все ${total} слов на странице, разделов ${groups}`);

  await page.fill('#glFind', 'ведх');
  await page.waitForTimeout(250);
  const found = await page.locator('.gl dt').count();
  say(found >= 1 && found < 10, `поиск «ведх» нашёл ${found}`);

  await page.fill('#glFind', 'ксзщю');
  await page.waitForTimeout(250);
  const none = await page.locator('.gl dt').count();
  say(none === 0 && await page.locator('#glEmpty').isVisible(),
    'на бессмыслицу пусто и сказано почему');
  await ctx.close();
}

/* --------------------------------- переход из подсказки в словарь по якорю */
{
  // Отдельная вкладка: переход на ту же страницу с другим якорем её не
  // перезагружает, и проверять было бы нечего.
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errs = []; watch(page, errs);
  await page.goto(base + '/glossary.html#w-титхи', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const hit = await page.locator('.gl dt.is-hit').innerText().catch(() => '');
  say(hit === 'Титхи', `кириллический якорь подсвечивает слово: «${hit}»`);

  // и сама ссылка из подсказки ведёт куда надо
  await page.goto(base + '/chart.html', { waitUntil: 'networkidle' });
  await page.click('#exampleBtn');
  await page.waitForTimeout(2000);
  const term = page.locator('.term:visible').first();
  await term.scrollIntoViewIfNeeded();
  await term.click();
  await page.waitForTimeout(300);
  const href = await page.locator('.termtip__more a').getAttribute('href').catch(() => null);
  say(!!href && href.startsWith('glossary.html#w-'), `в подсказке есть ссылка в словарь: ${href}`);
  say(errs.length === 0, `без ошибок${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
  await ctx.close();
}

await browser.close();
srv.close();
console.log(bad === 0 ? '\nподсказки и словарь работают' : `\nпроблем: ${bad}`);
process.exit(bad === 0 ? 0 : 1);
