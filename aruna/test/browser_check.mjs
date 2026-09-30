/* Дымовой тест в настоящем браузере: грузит страницы, ловит ошибки консоли,
   проверяет, что расчётные блоки заполнились, и снимает скриншоты.

   Запуск (нужен playwright и локальный сервер):
     npx http-server -p 8099 -s &
     node test/browser_check.mjs
*/
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const globalRoot = execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(globalRoot, 'playwright'));

const BASE = process.env.ARUNA_BASE || 'http://127.0.0.1:8099';
const OUT = process.env.ARUNA_SHOTS || '/tmp/aruna-shots';
fs.mkdirSync(OUT, { recursive: true });

// act — сценарий, который нужно проиграть перед снимком (страницы-калькуляторы
// пустые, пока не нажать кнопку); filled — то, что обязано быть непустым после.
const PAGES = [
  { url: '/index.html', name: 'landing', filled: ['#skyDate', '#skyRows', '#verseSa', '#verseRef'] },
  {
    url: '/chart.html', name: 'chart',
    act: async page => { await page.click('#exampleBtn'); await page.waitForTimeout(400); },
    filled: ['.summary .stat__value', '#chartCanvas svg', '.dasha-now', '.verse__sa', 'table.data tbody tr']
  },
  {
    url: '/compat.html', name: 'compat',
    act: async page => { await page.click('#exampleBtn'); await page.waitForTimeout(400); },
    filled: ['.koota-list', '.score-ring__num']
  },
  {
    url: '/muhurta.html', name: 'muhurta',
    act: async page => { await page.waitForTimeout(700); },
    filled: ['.daybar', '.win-list', '.wallet__balance']
  },
  {
    url: '/rectify.html', name: 'rectify',
    act: async page => { await page.click('#exampleBtn'); await page.waitForTimeout(900); },
    filled: ['.note-box', '#results .panel']
  },
  {
    url: '/rectify.html', name: 'rectify-unlocked',
    act: async page => {
      await page.evaluate(() => window.ArunaAccess.setPlan(window.ArunaAccess.PLAN.id));
      await page.click('#exampleBtn');
      await page.waitForTimeout(900);
    },
    filled: ['.str-list .str', '.yoga-list .yoga', '.win-list .win']
  },
  {
    url: '/natal.html', name: 'natal',
    act: async page => {
      // предыдущий сценарий включал подписку, а localStorage у контекста общий —
      // без сброса замков на странице не будет и проверять станет нечего
      await page.evaluate(() => window.ArunaAccess.reset());
      await page.click('#exampleBtn');
      await page.waitForTimeout(900);
    },
    filled: ['#wheelBox svg', '#posTable tbody tr', '#housesTable tbody tr',
             '#aspTable tbody tr', '#openingBox .nb', '.locked']
  },
  {
    url: '/natal.html', name: 'natal-live',
    act: async page => {
      await page.evaluate(() => window.ArunaAccess.reset());
      await page.click('#exampleBtn');
      await page.waitForTimeout(900);
      // наведение оставляет на карте только связи выбранной планеты
      await page.hover('[data-planet="saturn"]');
      await page.waitForTimeout(300);
      const on = await page.$$eval('.nw__p.is-on', e => e.length);
      const off = await page.$$eval('.nw__p.is-off', e => e.length);
      if (!on || !off) throw new Error('подсветка планеты не сработала');
      // щелчок закрепляет выбор, второй снимает
      await page.click('[data-planet="saturn"]');
      await page.waitForTimeout(200);
      await page.mouse.move(40, 40);
      await page.waitForTimeout(200);
      if (!(await page.$$eval('.nw__p.is-on', e => e.length))) {
        throw new Error('щелчок не закрепил выбор');
      }
      await page.click('[data-planet="saturn"]');
      await page.waitForTimeout(200);
      if (await page.$$eval('.nw__p.is-on', e => e.length)) {
        throw new Error('повторный щелчок не снял выбор');
      }
      // фильтр аспектов
      await page.click('label[for="aspFilter-none"]');
      await page.waitForTimeout(150);
      const vis = await page.$$eval('.nw__asp', e =>
        e.filter(x => !x.classList.contains('is-hidden')).length);
      if (vis) throw new Error('фильтр «без них» не спрятал линии');
      await page.click('label[for="aspFilter-all"]');
      // плоский вид и обратно
      await page.click('[data-view="flat"]');
      await page.waitForTimeout(300);
      if (!(await page.$eval('.w3d', e => e.classList.contains('is-flat')))) {
        throw new Error('плоский вид не включился');
      }
      await page.click('[data-view="reset"]');
      await page.waitForTimeout(400);
      // транзиты вторым кольцом
      await page.click('#transitToggle');
      await page.waitForTimeout(700);
    },
    filled: ['.w3d__layer--planets', '.w3d-ctl', '[data-wheel-card]', '[data-transit]']
  },
  {
    url: '/natal.html', name: 'natal-unlocked',
    act: async page => {
      await page.evaluate(() => window.ArunaAccess.setPlan(window.ArunaAccess.PLAN.id));
      await page.click('#exampleBtn');
      await page.waitForTimeout(2200);
    },
    filled: ['#transitsReport table tbody tr', '#progressReport table tbody tr',
             '#dignitiesReport .nb', '#shapeReport .nb']
  },
  { url: '/pricing.html', name: 'pricing', filled: ['#featureTable tbody tr', '#packs .pack', '#planMonth'] },
  { url: '/legal.html', name: 'legal', filled: ['.panel p'] },
  {
    url: '/dialog.html', name: 'dialog',
    act: async page => {
      await page.click('#exampleBtn').catch(() => {});
      await page.waitForTimeout(300);
      // вопрос своими словами через поле, а не кнопкой: это основной путь
      await page.fill('#askField', 'Никак не решусь на переезд, всё откладываю');
      await page.click('#askBtn');
      await page.waitForTimeout(900);
    },
    filled: ['.talk__msg--me', '.talk__msg--sa .talk__body p', '.talk__more button', '#quotaLine']
  },
  {
    url: '/dialog.html', name: 'dialog-deep',
    act: async page => {
      await page.click('#exampleBtn').catch(() => {});
      await page.waitForTimeout(300);
      await page.fill('#askField', 'Что мне пора отпустить?');
      await page.click('#askBtn');
      await page.waitForTimeout(900);
      // «развернуть» списывает биджу и должно дать стих и след расчёта
      await page.click('.talk__more button');
      await page.waitForTimeout(900);
    },
    filled: ['.talk__verse', '.talk__trail .trail summary']
  },
  {
    url: '/chart.html', name: 'chart-unlocked',
    act: async page => {
      await page.click('#exampleBtn');
      await page.waitForTimeout(500);
      // сначала покупаем за биджи — проверяем, что списание открывает разбор
      const first = await page.$('.locked [data-act="unlock"]');
      if (first) { await first.click(); await page.waitForTimeout(350); }
      // затем включаем подписку: она должна открыть всё остальное разом
      await page.evaluate(() => window.ArunaAccess.setPlan(window.ArunaAccess.PLAN.id));
      await page.click('#exampleBtn');
      await page.waitForTimeout(600);
    },
    filled: ['.yoga-list .yoga', '.str-list .str', '.timeline']
  }
];

const VIEWPORTS = [
  { name: 'desktop', width: 1360, height: 900 },
  { name: 'mobile', width: 390, height: 844 }
];

let failures = 0;

// Chromium предустановлен в образе; путь содержит номер сборки, ищем его
const CHROME = process.env.ARUNA_CHROME || (() => {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  const dir = fs.readdirSync(base).find(d => /^chromium-\d+$/.test(d));
  return dir ? path.join(base, dir, 'chrome-linux', 'chrome') : undefined;
})();

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2, locale: 'ru-RU', timezoneId: 'Europe/Moscow',
    ignoreHTTPSErrors: true
  });
  for (const p of PAGES) {
    if (!fs.existsSync(path.join(process.cwd(), p.url.slice(1)))) continue;
    const page = await ctx.newPage();
    const problems = [];
    page.on('console', m => {
      // «Failed to load resource» без URL — это внешние шрифты, которые в
      // песочнице режет прокси; локальные сбои ловит requestfailed ниже
      const t = m.text();
      if (m.type() === 'error' && !/Failed to load resource/.test(t)) problems.push('console: ' + t);
    });
    page.on('pageerror', e => problems.push('pageerror: ' + e.message));
    page.on('requestfailed', r => {
      const u = r.url();
      if (!u.includes('fonts.googleapis') && !u.includes('fonts.gstatic')) {
        problems.push('request failed: ' + u + ' — ' + (r.failure()?.errorText || ''));
      }
    });

    await page.goto(BASE + p.url, { waitUntil: 'load' });
    await page.waitForTimeout(700);

    // прокручиваем страницу целиком: так срабатывает IntersectionObserver,
    // и на полностраничном снимке видно то же, что видит живой посетитель
    await page.evaluate(async () => {
      const step = Math.round(window.innerHeight * 0.8);
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise(r => setTimeout(r, 90));
      }
      window.scrollTo(0, 0);
      await new Promise(r => setTimeout(r, 400));
    });

    if (p.act) { try { await p.act(page); } catch (e) { problems.push('сценарий: ' + e.message); } }

    for (const sel of p.filled) {
      const node = await page.$(sel);
      if (!node) { problems.push(`нет узла: ${sel}`); continue; }
      const txt = ((await page.textContent(sel).catch(() => null)) || '').trim();
      // узел считается заполненным, если в нём есть текст, это svg или
      // в нём есть дочерние элементы (полоса дня — это набор <span> без текста)
      const kind = await node.evaluate(n => ({
        svg: n.tagName.toLowerCase() === 'svg',
        kids: n.childElementCount
      }));
      if (!kind.svg && !kind.kids && (!txt || txt === '—')) {
        problems.push(`пусто: ${sel} ("${txt}")`);
      }
    }

    // горизонтальной прокрутки быть не должно
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 2) problems.push(`горизонтальная прокрутка: +${overflow}px`);

    await page.screenshot({
      path: path.join(OUT, `${p.name}-${vp.name}.png`),
      fullPage: vp.name === 'desktop'
    });

    const tag = `${p.name}/${vp.name}`;
    if (problems.length) { failures += problems.length; console.log(`✗ ${tag}\n   ` + problems.join('\n   ')); }
    else console.log(`✓ ${tag}`);
    await page.close();
  }
  await ctx.close();
}
await browser.close();
console.log(failures ? `\nпроблем: ${failures}` : '\nвсе страницы чисты');
process.exit(failures ? 1 : 0);
