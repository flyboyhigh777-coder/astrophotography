/*
 * Аруна · расчётное ядро для Node
 * ------------------------------------------------------------------
 * Сайт написан обычными <script>-файлами без сборки, и это удобно: те же
 * самые файлы работают и на сервере. Здесь они загружаются в песочницу
 * и отдаются как обычный модуль — никакого дублирования кода, одна
 * правда на сайт, бота и API.
 *
 * Если завтра сайт переедет на сборщик, меняется только этот файл.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ASSETS = path.join(__dirname, '..', '..', 'assets', 'js');

// порядок важен: модули опираются друг на друга через глобальные объекты
const FILES = [
  'core/astro.js',
  'core/tz.js',
  'data/jyotish-data.js',
  'data/cities.js',
  'data/verses.js',
  'jyotish/chart.js',
  'jyotish/panchanga.js',
  'jyotish/dasha.js',
  'jyotish/ashtakoota.js',
  'jyotish/yogas.js',
  'jyotish/strength.js',
  'jyotish/forecast.js',
  'jyotish/muhurta.js',
  'jyotish/varga.js',
  'jyotish/rectify.js',
  'jyotish/sarvashtaka.js',
  'jyotish/talk.js'
];

const sandbox = {
  console,
  Intl,
  Date,
  Math,
  JSON,
  // localStorage нужен только браузерным модулям; на сервере — заглушка
  localStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
  }
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

for (const rel of FILES) {
  const file = path.join(ASSETS, rel);
  if (!fs.existsSync(file)) continue;          // модуль может появиться позже
  vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: rel });
}

const A = sandbox.ArunaAstro;
const Tz = sandbox.ArunaTz;
const C = sandbox.ArunaChart;

/**
 * Карта по данным рождения.
 * @param {Object} b {date:'1975-06-15', time:'06:00', place:{name,lat,lon,tz}}
 */
function chartFromBirth(b) {
  const d = String(b.date).split('-').map(Number);
  const t = String(b.time || '12:00').split(':').map(Number);
  const utcMs = Tz.zonedToUtcMs(d[0], d[1], d[2], t[0] || 0, t[1] || 0, b.place.tz);
  const chart = C.buildChart({
    jd: Tz.msToJd(utcMs),
    lat: b.place.lat,
    lon: b.place.lon,
    tz: b.place.tz,
    label: b.place.name
  });
  return { chart, utcMs, jd: Tz.msToJd(utcMs) };
}

module.exports = {
  Astro: A,
  Tz,
  Chart: C,
  Data: sandbox.ArunaData,
  Cities: sandbox.ArunaCities,
  Verses: sandbox.ArunaVerses,
  Panchanga: sandbox.ArunaPanchanga,
  Dasha: sandbox.ArunaDasha,
  Ashtakoota: sandbox.ArunaAshtakoota,
  Yogas: sandbox.ArunaYogas,
  Strength: sandbox.ArunaStrength,
  Forecast: sandbox.ArunaForecast,
  Muhurta: sandbox.ArunaMuhurta,
  Varga: sandbox.ArunaVarga,
  Rectify: sandbox.ArunaRectify,
  Sarvashtaka: sandbox.ArunaSarvashtaka,
  Talk: sandbox.ArunaTalk,
  chartFromBirth
};
