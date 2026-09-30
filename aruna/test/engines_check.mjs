/* Аруна · прогон по трём движкам
   ------------------------------------------------------------------
   Браузеров много, движков три. Chrome, Яндекс, Edge и Opera — это
   Chromium; Safari — WebKit; Firefox сам по себе. И главное: на
   айфонах Apple обязывает все браузеры, включая Chrome и Яндекс,
   использовать WebKit. Значит, проверив три движка, мы проверили
   все браузеры, которыми реально пользуются.

   Проверяется каждая страница на трёх размерах экрана: ошибки в
   консоли, заполнение расчётных блоков и отсутствие прокрутки вбок.

   Запуск (нужны движки: npx playwright install webkit firefox):
     npx http-server -p 8099 -s &
     node test/engines_check.mjs
*/
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path';
const require = createRequire(import.meta.url);
const pw = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));

const BASE = 'http://127.0.0.1:8099';
const OUT = '/tmp/claude-0/-home-user-astrophotography/6fd8f0b7-b8db-50aa-ad39-efeef6b07729/scratchpad/engines';
fs.mkdirSync(OUT, { recursive: true });

const PAGES = [
  { url:'/index.html', name:'главная', filled:['#skyRows'] },
  { url:'/natal.html', name:'наталка', act: async p => { await p.click('#exampleBtn'); await p.waitForTimeout(1200); },
    filled:['#posTable tbody tr','.w3d__layer--planets','#aspTable tbody tr'] },
  { url:'/chart.html', name:'джйотиш', act: async p => { await p.click('#exampleBtn'); await p.waitForTimeout(900); },
    filled:['.summary .stat__value','#chartCanvas svg'] },
  { url:'/dialog.html', name:'диалог', act: async p => { await p.click('#exampleBtn'); await p.waitForTimeout(400);
    await p.fill('#askField','почему нет сил'); await p.click('#askBtn'); await p.waitForTimeout(800); },
    filled:['.talk__msg--sa .talk__body p'] },
  { url:'/compat.html', name:'совместимость', act: async p => { await p.click('#exampleBtn'); await p.waitForTimeout(700); },
    filled:['.koota-list'] },
  { url:'/pricing.html', name:'тарифы', filled:['#featureTable tbody tr','#packs .pack'] },
];
const SIZES = [
  { name:'телефон', width:390, height:844, mobile:true },
  { name:'планшет', width:820, height:1180, mobile:true },
  { name:'экран',   width:1440, height:900, mobile:false },
];
const chromePath = (() => {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  const d = fs.readdirSync(base).find(x => /^chromium-\d+$/.test(x));
  return d ? path.join(base, d, 'chrome-linux', 'chrome') : undefined;
})();
const ENGINES = [
  { name:'WebKit (iPhone: Safari, Chrome, Яндекс)', eng: pw.webkit, opts:{} },
  { name:'Chromium (Chrome, Яндекс, Edge, Opera)', eng: pw.chromium, opts: chromePath ? {executablePath:chromePath} : {} },
  { name:'Firefox', eng: pw.firefox, opts:{} },
];

let problems = 0;
for (const E of ENGINES) {
  console.log('\n══════ ' + E.name);
  const browser = await E.eng.launch(E.opts);
  for (const S of SIZES) {
    const ctx = await browser.newContext({
      viewport:{width:S.width,height:S.height}, deviceScaleFactor:2,
      locale:'ru-RU', timezoneId:'Europe/Moscow', hasTouch:S.mobile,
      // isMobile Firefox не поддерживает — это ограничение Playwright, не сайта
      ...(E.eng === pw.firefox ? {} : { isMobile: S.mobile }),
    });
    for (const P of PAGES) {
      const page = await ctx.newPage();
      const bad = [];
      page.on('pageerror', e => bad.push('ошибка JS: ' + e.message.split('\n')[0]));
      page.on('console', m => { const t=m.text();
        if (m.type()==='error' && !/Failed to load resource|favicon/.test(t)) bad.push('консоль: '+t.slice(0,90)); });
      try {
        await page.goto(BASE+P.url, {waitUntil:'domcontentloaded', timeout:20000});
        await page.waitForTimeout(600);
        if (P.act) await P.act(page);
        for (const sel of P.filled) {
          const n = await page.$$(sel);
          if (!n.length) bad.push('пусто: ' + sel);
          else {
            const txt = await page.$eval(sel, e => (e.textContent||'').trim() + (e.children.length?'x':''));
            if (!txt) bad.push('пустой узел: ' + sel);
          }
        }
        const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (over > 2) bad.push('вылезает вбок на ' + over + 'px');
      } catch (e) { bad.push('не открылась: ' + e.message.split('\n')[0]); }
      const tag = `${S.name}/${P.name}`;
      if (bad.length) { problems++; console.log('  ✗ ' + tag + '\n      ' + bad.join('\n      ')); }
      else console.log('  ✓ ' + tag);
      if (P.name==='наталка' || P.name==='главная') {
        await page.screenshot({ path: `${OUT}/${E.name.split(' ')[0]}-${S.name}-${P.name}.png` }).catch(()=>{});
      }
      await page.close();
    }
    await ctx.close();
  }
  await browser.close();
}
console.log(problems ? `\nИТОГ: проблем ${problems}` : '\nИТОГ: всё чисто на всех движках');
process.exit(problems ? 1 : 0);
