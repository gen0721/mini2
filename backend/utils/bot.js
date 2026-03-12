/**
 * Telegram Bot — webhook mode (не polling)
 */
const https  = require('https');
const crypto = require('crypto');
const { queryOne, run } = require('../models/db');

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

// ── Обработка входящего апдейта ───────────────────────────────────────────────
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
      `• /report — отчёт прямо сейчас (только для админа)\n` +
      `• /help — помощь`
    );
    return;
  }

  // /help
  if (text === '/help') {
    await sendMessage(chatId,
      `🟡 <b>Minions Market — Помощь</b>\n\n` +
      `/code [логин] — код для регистрации\n` +
      `/reset [логин] — сброс пароля\n` +
      `/report — отчёт прямо сейчас (только для админа)\n\n` +
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

    try {
      const existing = await queryOne(
        `SELECT id, password, telegram_id FROM users WHERE username = $1`,
        [username]
      );

      if (existing?.password) {
        await sendMessage(chatId, `❌ Логин <b>${username}</b> уже занят. Выберите другой логин.`);
        return;
      }

      const code    = String(Math.floor(100000 + Math.random() * 900000));
      const expires = Math.floor(Date.now() / 1000) + 10 * 60;
      const tgId    = String(chatId);

      if (existing) {
        await run(
          `UPDATE users SET otp_code = $1, otp_expires = $2, otp_used = 0, telegram_id = $3 WHERE id = $4`,
          [code, expires, tgId, existing.id]
        );
      } else {
        // Проверяем — не привязан ли этот Telegram к другому аккаунту
        const tgExists = await queryOne(
          `SELECT username FROM users WHERE telegram_id = $1`,
          [tgId]
        );
        if (tgExists) {
          await sendMessage(chatId,
            `❌ Этот Telegram уже привязан к аккаунту <b>${tgExists.username}</b>.\n\n` +
            `Один Telegram — один аккаунт.\n` +
            `Для входа используйте логин: <code>${tgExists.username}</code>`
          );
          return;
        }
        await run(
          `INSERT INTO users (id, username, telegram_id, otp_code, otp_expires, otp_used)
           VALUES ($1, $2, $3, $4, $5, 0)`,
          [crypto.randomUUID(), username, tgId, code, expires]
        );
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

  // /report — только для админа
  if (text === '/report') {
    const adminChatId = process.env.REPORT_CHAT_ID;
    if (!adminChatId || String(chatId) !== String(adminChatId)) {
      await sendMessage(chatId, `⛔ У вас нет доступа к этой команде.`);
      return;
    }
    await sendMessage(chatId, `⏳ <b>Генерирую отчёт...</b>\n\nЭто займёт несколько секунд.`);
    try {
      const { sendHourlyReport } = require('./hourlyReport');
      await sendHourlyReport();
    } catch (e) {
      console.error('[Bot] /report error:', e.message);
      await sendMessage(chatId, `❌ Ошибка генерации отчёта: <code>${e.message}</code>`);
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

    try {
      const user = await queryOne(
        `SELECT * FROM users WHERE username = $1 AND telegram_id = $2`,
        [username, String(chatId)]
      );

      if (!user) {
        await sendMessage(chatId,
          `❌ Пользователь <b>${username}</b> не найден или не привязан к этому Telegram.\n\n` +
          `Если вы ещё не зарегистрированы — используйте /code для регистрации.`
        );
        return;
      }

      const code    = String(Math.floor(100000 + Math.random() * 900000));
      const expires = Math.floor(Date.now() / 1000) + 15 * 60;

      await run(
        `UPDATE users SET reset_code = $1, reset_expires = $2 WHERE id = $3`,
        [code, expires, user.id]
      );

      await sendMessage(chatId,
        `🔑 <b>Код для сброса пароля</b>\n\n` +
        `Логин: <b>${username}</b>\n` +
        `Код: <code>${code}</code>\n\n` +
        `⏱ Действителен <b>15 минут</b>`
      );
    } catch (e) {
      console.error('[Bot] /reset db error:', e.message);
      await sendMessage(chatId, `❌ Ошибка. Попробуйте ещё раз.`);
    }
    return;
  }
}

// ── Публичный интерфейс ───────────────────────────────────────────────────────
function getBot() {
  setWebhook();
  return { username: process.env.BOT_USERNAME || '' };
}

module.exports = { getBot, handleUpdate, sendMessage, setWebhook };
