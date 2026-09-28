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

const BASE = process.env.SARATHI_BASE || 'http://127.0.0.1:8099';
const OUT = process.env.SARATHI_SHOTS || '/tmp/sarathi-shots';
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
    url: '/dialog.html', name: 'dialog',
    act: async page => {
      await page.click('#exampleBtn').catch(() => {});
      await page.waitForTimeout(300);
      const b = await page.$('.prompt-btn');
      if (b) { await b.click(); await page.waitForTimeout(500); }
    },
    filled: ['.talk__msg--sa']
  }
];

const VIEWPORTS = [
  { name: 'desktop', width: 1360, height: 900 },
  { name: 'mobile', width: 390, height: 844 }
];

let failures = 0;

// Chromium предустановлен в образе; путь содержит номер сборки, ищем его
const CHROME = process.env.SARATHI_CHROME || (() => {
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
      const isSvg = await node.evaluate(n => n.tagName.toLowerCase() === 'svg');
      if (!isSvg && (!txt || txt === '—')) problems.push(`пусто: ${sel} ("${txt}")`);
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
