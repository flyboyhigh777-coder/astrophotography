#!/usr/bin/env node
/*
 * Аруна · всё сразу
 * ------------------------------------------------------------------
 * Одна команда поднимает и сайт с API, и телеграм-бота, и связывает их:
 * бот может подтверждать вход на сайте, а сайт знает про кошелёк.
 *
 *     ARUNA_BOT_TOKEN=<токен> node server/index.js
 *
 * Без токена поднимется только сайт — это нормальный режим, если бот
 * пока не нужен.
 */
'use strict';

const api = require('./api.js');

api.start();

if (process.env.ARUNA_BOT_TOKEN || require('node:fs').existsSync(__dirname + '/config.json')) {
  try {
    const bot = require('./bot.js');
    bot.linkApi(api);
    bot.main().catch((e) => {
      console.error('Бот не запустился: ' + e.message);
      console.error('Сайт при этом работает — бот можно поднять позже.');
    });
  } catch (e) {
    console.error('Бот не запустился: ' + e.message);
  }
} else {
  console.log('Бот не запущен: нет токена. Сайт работает.');
  console.log('Как получить токен — в docs/SETUP.md.');
}
