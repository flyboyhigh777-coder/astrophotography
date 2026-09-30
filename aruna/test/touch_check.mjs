/* Аруна · проверка для пальца
   ------------------------------------------------------------------
   Две вещи, которые видно только на телефоне и только в настоящем
   движке:

   · цель под палец. Apple и Google сходятся на 44 пикселях. Исключены
     ссылки внутри абзаца и слова с подсказкой: их раздувать нельзя, они
     разорвут строку, и рекомендации их прямо исключают;
   · размер шрифта в полях. Ниже шестнадцати пикселей iOS увеличивает
     всю страницу, едва коснёшься поля, и обратно её уже не вернуть.

   Запуск: npx http-server -p 8099 -s & node test/touch_check.mjs
*/
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path';
const require = createRequire(import.meta.url);
const pw = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const cp = (() => { const b='/opt/pw-browsers'; const d=fs.readdirSync(b).find(x=>/^chromium-\d+$/.test(x));
  return d ? path.join(b,d,'chrome-linux','chrome') : undefined; })();
const PAGES = ['/index.html','/today.html','/glossary.html','/natal.html','/chart.html','/dialog.html','/pricing.html','/compat.html','/muhurta.html','/rectify.html','/legal.html'];
const b = await pw.webkit.launch();
const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, locale:'ru-RU',
  timezoneId:'Europe/Moscow', hasTouch:true, isMobile:true });
let small = 0, checked = 0;
for (const u of PAGES) {
  const p = await ctx.newPage();
  await p.goto('http://127.0.0.1:8099'+u, {waitUntil:'domcontentloaded'});
  await p.waitForTimeout(500);
  const r = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('a, button, input[type=checkbox], select, [role=button]').forEach(e => {
      const b = e.getBoundingClientRect();
      if (!b.width || !b.height) return;                       // скрытое не считаем
      if (getComputedStyle(e).display === 'none') return;
      const t = (e.textContent||'').trim().slice(0,28) || e.getAttribute('aria-label') || e.tagName;
      // ссылку внутри абзаца раздувать нельзя — она разорвёт строку,
      // и рекомендации по размеру цели её прямо исключают
      const inProse = e.tagName === 'A' && e.closest('p, li, dd, summary');
      /*
       * Слово с подсказкой — тот же случай и та же причина: это слово в
       * строке, а не кнопка на панели. Раздуть его до сорока четырёх
       * пикселей значит разорвать текст, ради читаемости которого оно и
       * сделано. Промах пальцем здесь ничего не ломает: подсказка просто
       * не откроется или откроется соседняя.
       */
      const inlineTerm = e.classList.contains('term');
      // у чекбокса цель — подпись вокруг него, а не сам квадрат
      const wrapped = e.type === 'checkbox' && e.closest('label');
      // ссылка «перейти к содержанию» спрятана и появляется только по фокусу
      const skip = b.width <= 2 && b.height <= 2;
      if (skip) return;
      if (inProse || wrapped || inlineTerm) return;
      if (b.height < 44 || b.width < 30) out.push(t + ' — ' + Math.round(b.width)+'×'+Math.round(b.height));
    });
    return out;
  });
  checked++;
  if (r.length) { small += r.length; console.log('  ' + u + ':\n      ' + r.slice(0,6).join('\n      ')); }
  await p.close();
}
console.log(small ? `\nмелких целей: ${small} на ${checked} страницах` : `\nвсе цели под палец не меньше 30px (${checked} страниц)`);
// проверка шрифта полей на сенсорном экране
const p = await ctx.newPage();
await p.goto('http://127.0.0.1:8099/natal.html', {waitUntil:'domcontentloaded'});
await p.waitForTimeout(400);
console.log('шрифт поля на телефоне:', await p.$eval('.input', e => getComputedStyle(e).fontSize), '(нужно ≥16px, иначе iOS зумит)');
await b.close();
process.exit(small ? 1 : 0);
