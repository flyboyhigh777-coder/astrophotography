/*
 * Аруна · хранилище
 * ------------------------------------------------------------------
 * Обычный JSON-файл. Для базы данных здесь пока нет работы: бот пишет
 * редко, читает из памяти, а файл нужен только чтобы пережить перезапуск.
 *
 * Запись атомарная — сначала во временный файл, потом переименование.
 * Так файл не окажется наполовину записанным, если сервер убьют в момент
 * сохранения. Когда пользователей станет тысячи, этот модуль меняется на
 * SQLite или Postgres, а остальной код не трогается: наружу торчат
 * только get/set/all.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

class Store {
  constructor(file) {
    this.file = file;
    this.data = { users: {}, meta: { created: Date.now() } };
    this.dirty = false;
    this.load();

    // пишем не чаще раза в две секунды — иначе диск дёргается на каждое сообщение
    this.timer = setInterval(() => this.flush(), 2000);
    this.timer.unref && this.timer.unref();
  }

  load() {
    try {
      if (fs.existsSync(this.file)) {
        const raw = fs.readFileSync(this.file, 'utf8');
        if (raw.trim()) this.data = JSON.parse(raw);
        if (!this.data.users) this.data.users = {};
      }
    } catch (e) {
      // битый файл не должен ронять бота: отодвигаем и начинаем заново
      const backup = this.file + '.broken.' + Date.now();
      try { fs.renameSync(this.file, backup); } catch (e2) { /* нечего переименовывать */ }
      console.error('[store] файл повреждён, отложен в ' + backup + ': ' + e.message);
      this.data = { users: {}, meta: { created: Date.now() } };
    }
  }

  flush() {
    if (!this.dirty) return;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      fs.renameSync(tmp, this.file);
      this.dirty = false;
    } catch (e) {
      console.error('[store] не удалось сохранить: ' + e.message);
    }
  }

  user(chatId) {
    const id = String(chatId);
    if (!this.data.users[id]) {
      this.data.users[id] = {
        chatId: Number(chatId),
        state: 'idle',
        draft: {},
        birth: null,
        digest: false,
        digestHour: 7,
        lastDigest: null,
        mood: [],
        notified: {},
        createdAt: Date.now()
      };
      this.dirty = true;
    }
    return this.data.users[id];
  }

  save(user) {
    this.data.users[String(user.chatId)] = user;
    this.dirty = true;
  }

  all() { return Object.values(this.data.users); }

  stats() {
    const users = this.all();
    return {
      total: users.length,
      withBirth: users.filter((u) => u.birth).length,
      digest: users.filter((u) => u.digest && u.birth).length,
      moodEntries: users.reduce((n, u) => n + (u.mood ? u.mood.length : 0), 0)
    };
  }

  close() {
    clearInterval(this.timer);
    this.flush();
  }
}

module.exports = { Store };
