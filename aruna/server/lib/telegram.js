/*
 * Аруна · тонкая обёртка над Telegram Bot API
 * ------------------------------------------------------------------
 * Ни одной зависимости: в Node есть fetch, а больше ничего и не нужно.
 * Библиотеки вроде telegraf удобны, но тянут за собой десятки пакетов —
 * для бота на несколько команд это лишнее, а для того, кто первый раз
 * запускает сервер, каждая зависимость это ещё один способ сломаться.
 */
'use strict';

const API = 'https://api.telegram.org/bot';

class Telegram {
  constructor(token, opts = {}) {
    if (!token) throw new Error('Нужен токен бота');
    this.token = token;
    this.timeout = opts.timeout || 30;
    this.offset = 0;
    this.onError = opts.onError || ((e) => console.error('[telegram]', e.message));
  }

  async call(method, payload = {}, tries = 3) {
    for (let attempt = 1; attempt <= tries; attempt++) {
      try {
        const res = await fetch(API + this.token + '/' + method, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.ok) return data.result;

        // 429 — телеграм просит подождать; это штатная ситуация
        if (data.error_code === 429 && data.parameters && data.parameters.retry_after) {
          await sleep((data.parameters.retry_after + 1) * 1000);
          continue;
        }
        // 403 — пользователь заблокировал бота; наверх это не ошибка, а факт
        if (data.error_code === 403) {
          const err = new Error('blocked');
          err.blocked = true;
          throw err;
        }
        throw new Error(method + ': ' + (data.description || 'неизвестная ошибка'));
      } catch (e) {
        if (e.blocked) throw e;
        if (attempt === tries) throw e;
        await sleep(attempt * 1500);
      }
    }
  }

  /** Экранирование под parse_mode=HTML. */
  static esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  send(chatId, text, extra = {}) {
    return this.call('sendMessage', Object.assign({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true }
    }, extra));
  }

  editText(chatId, messageId, text, extra = {}) {
    return this.call('editMessageText', Object.assign({
      chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML',
      link_preview_options: { is_disabled: true }
    }, extra));
  }

  answerCallback(id, text) {
    return this.call('answerCallbackQuery', { callback_query_id: id, text: text || '' });
  }

  setCommands(commands) {
    return this.call('setMyCommands', { commands });
  }

  /** Длинный опрос: ждём обновления и отдаём их пачкой. */
  async poll() {
    const updates = await this.call('getUpdates', {
      offset: this.offset,
      timeout: this.timeout,
      allowed_updates: ['message', 'callback_query']
    }, 1);
    if (updates && updates.length) {
      this.offset = updates[updates.length - 1].update_id + 1;
    }
    return updates || [];
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

module.exports = { Telegram, sleep };
