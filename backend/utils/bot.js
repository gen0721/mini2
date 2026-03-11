/**
 * Telegram Bot — webhook mode (не polling)
 * Webhook = Railway сам получает апдейты, конфликтов нет
 */
const https = require('https');
const crypto = require('crypto');

const TOKEN    = () => process.env.TELEGRAM_BOT_TOKEN || '';
const BASE_URL = () => process.env.BACKEND_URL || '';

// ── Отправка сообщения ────────────────────────────────────────────────────────
function sendMessage(chatId, text, opts = {}) {
  const token = TOKEN();
  if (!token || !chatId) return Promise.resolve();
  return new Promise((resolve) => {
    const body = JSON.stringify({ chat_id: String(chatId), text, parse_mode: 'HTML', ...opts });
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${token}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (r) => { r.resume(); resolve(); });
    req.on('error', () => resolve());
    req.setTimeout(8000, () => { req.destroy(); resolve(); });
    req.write(body);
    req.end();
  });
}

// ── Регистрация webhook ───────────────────────────────────────────────────────
function setWebhook() {
  const token = TOKEN();
  const base  = BASE_URL();
  if (!token || !base) {
    console.warn('[Bot] TELEGRAM_BOT_TOKEN или BACKEND_URL не заданы — бот не запущен');
    return;
  }

  const webhookUrl = `${base}/api/tg-webhook/${token}`;
  const body = JSON.stringify({ url: webhookUrl, drop_pending_updates: true });

  const req = https.request({
    hostname: 'api.telegram.org',
    path: `/bot${token}/setWebhook`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  }, (r) => {
    let data = '';
    r.on('data', d => data += d);
    r.on('end', () => {
      try {
        const res = JSON.parse(data);
        if (res.ok) console.log(`✅ Telegram webhook установлен: ${webhookUrl}`);
        else console.error('[Bot] Webhook error:', res.description);
      } catch { console.error('[Bot] Webhook response parse error'); }
    });
  });
  req.on('error', e => console.error('[Bot] setWebhook error:', e.message));
  req.write(body);
  req.end();
}

// ── Обработка входящего апдейта (вызывается из роута) ─────────────────────────
async function handleUpdate(update) {
  const msg = update.message;
  if (!msg || !msg.text) return;

  const chatId = msg.chat.id;
  const text   = msg.text.trim();

  // /start
  if (text.startsWith('/start')) {
    await sendMessage(chatId,
      `🟡 <b>Minions Market Bot</b>\n\n` +
      `Команды:\n` +
      `• /code [логин] — получить код для входа/регистрации\n` +
      `• /reset [логин] — сбросить пароль\n` +
      `• /help — помощь`
    );
    return;
  }

  // /help
  if (text === '/help') {
    await sendMessage(chatId,
      `🟡 <b>Minions Market — Помощь</b>\n\n` +
      `/code [логин] — код для регистрации\n` +
      `/reset [логин] — сброс пароля\n\n` +
      `По вопросам: @givi_hu`
    );
    return;
  }

  // /code
  if (text.startsWith('/code')) {
    const parts    = text.split(/\s+/);
    const username = (parts[1] || '').toLowerCase();

    if (!username || !/^[a-z0-9_]{3,24}$/.test(username)) {
      await sendMessage(chatId,
        `❗ Укажите логин.\n\nПример: <code>/code myusername</code>\n\nТолько <b>a-z, 0-9, _</b> (3-24 символа).`
      );
      return;
    }

    const db = require('../models/db');
    const existing = db.prepare('SELECT id, password, telegram_id FROM users WHERE username = ?').get(username);

    if (existing?.password) {
      await sendMessage(chatId, `❌ Логин <b>${username}</b> уже занят.\n\nВыберите другой логин.`);
      return;
    }

    const code    = String(Math.floor(100000 + Math.random() * 900000));
    const expires = Math.floor(Date.now() / 1000) + 10 * 60;
    const tgId    = String(chatId);

    try {
      if (existing) {
        db.prepare(`UPDATE users SET otp_code = ?, otp_expires = ?, otp_used = 0, telegram_id = ? WHERE id = ?`)
          .run(code, expires, tgId, existing.id);
      } else {
        db.prepare(`INSERT INTO users (id, username, telegram_id, otp_code, otp_expires, otp_used) VALUES (?, ?, ?, ?, ?, 0)`)
          .run(crypto.randomUUID(), username, tgId, code, expires);
      }

      await sendMessage(chatId,
        `🔐 <b>Код подтверждения</b>\n\n` +
        `Логин: <b>${username}</b>\n` +
        `Код: <code>${code}</code>\n\n` +
        `⏱ Действителен <b>10 минут</b>\n` +
        `⚠️ Никому не сообщайте этот код!`
      );
    } catch (e) {
      console.error('[Bot] /code db error:', e.message);
      await sendMessage(chatId, `❌ Ошибка генерации кода. Попробуйте ещё раз.`);
    }
    return;
  }

  // /reset
  if (text.startsWith('/reset')) {
    const parts    = text.split(/\s+/);
    const username = (parts[1] || '').toLowerCase();

    if (!username) {
      await sendMessage(chatId, `❗ Укажите логин.\n\nПример: <code>/reset myusername</code>`);
      return;
    }

    const db   = require('../models/db');
    const user = db.prepare('SELECT * FROM users WHERE username = ? AND telegram_id = ?').get(username, String(chatId));

    if (!user) {
      await sendMessage(chatId,
        `❌ Пользователь <b>${username}</b> не найден или не привязан к этому Telegram.\n\n` +
        `Если вы ещё не зарегистрированы — используйте /code для регистрации.`
      );
      return;
    }

    const code    = String(Math.floor(100000 + Math.random() * 900000));
    const expires = Math.floor(Date.now() / 1000) + 15 * 60;
    db.prepare('UPDATE users SET reset_code = ?, reset_expires = ? WHERE id = ?').run(code, expires, user.id);

    await sendMessage(chatId,
      `🔑 <b>Код для сброса пароля</b>\n\n` +
      `Логин: <b>${username}</b>\n` +
      `Код: <code>${code}</code>\n\n` +
      `⏱ Действителен <b>15 минут</b>`
    );
    return;
  }
}

// ── Публичный интерфейс ───────────────────────────────────────────────────────
function getBot() {
  // Совместимость со старым кодом — просто устанавливаем webhook
  setWebhook();
  return { username: process.env.BOT_USERNAME || '' };
}

module.exports = { getBot, handleUpdate, sendMessage, setWebhook };
