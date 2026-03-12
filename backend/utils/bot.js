/**
 * Telegram Bot — Minions Market
 * Поддерживает: /start /help /code /reset /report /ai_on /ai_off /ai_status
 */

const https  = require('https');
const crypto = require('crypto');
const { queryOne, run } = require('../models/db');

const TOKEN    = () => process.env.TELEGRAM_BOT_TOKEN || '';
const BASE_URL = () => process.env.BACKEND_URL || '';
const isAdmin  = (chatId) => String(chatId) === String(process.env.REPORT_CHAT_ID);

// ─────────────────────────────────────────────────────────────────────────────
// Отправка сообщения
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Регистрация webhook
// ─────────────────────────────────────────────────────────────────────────────

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
        if (res.ok) console.log(`✅ Telegram webhook: ${webhookUrl}`);
        else console.error('[Bot] Webhook error:', res.description);
      } catch { console.error('[Bot] Webhook parse error'); }
    });
  });
  req.on('error', e => console.error('[Bot] setWebhook error:', e.message));
  req.write(body);
  req.end();
}

// ─────────────────────────────────────────────────────────────────────────────
// Обработка входящего апдейта
// ─────────────────────────────────────────────────────────────────────────────

async function handleUpdate(update) {
  const msg = update.message;
  if (!msg || !msg.text) return;

  const chatId = msg.chat.id;
  const text   = msg.text.trim();

  // ── /start ────────────────────────────────────────────────────────────────
  if (text.startsWith('/start')) {
    const adminCommands = isAdmin(chatId)
      ? `\n• /report — часовой отчёт\n• /ai_on — включить AI\n• /ai_off — выключить AI\n• /ai_status — статус AI`
      : '';
    await sendMessage(chatId,
      `🟡 <b>Minions Market Bot</b>\n\n` +
      `Команды:\n` +
      `• /code [логин] — код для входа/регистрации\n` +
      `• /reset [логин] — сбросить пароль\n` +
      `• /help — помощь` +
      adminCommands
    );
    return;
  }

  // ── /help ─────────────────────────────────────────────────────────────────
  if (text === '/help') {
    const adminCommands = isAdmin(chatId)
      ? `\n\n🔧 <b>Команды администратора:</b>\n/report — часовой отчёт\n/ai_on — включить AI Admin\n/ai_off — выключить AI Admin\n/ai_status — статус AI Admin`
      : '';
    await sendMessage(chatId,
      `🟡 <b>Minions Market — Помощь</b>\n\n` +
      `/code [логин] — код для регистрации\n` +
      `/reset [логин] — сброс пароля\n\n` +
      `По вопросам: @givi_hu` +
      adminCommands
    );
    return;
  }

  // ── /ai_on — включить ИИ (только админ) ──────────────────────────────────
  if (text === '/ai_on') {
    if (!isAdmin(chatId)) {
      await sendMessage(chatId, `⛔ Нет доступа.`);
      return;
    }
    const { setEnabled, isEnabled } = require('./aiAdmin');
    if (isEnabled()) {
      await sendMessage(chatId, `✅ AI Admin уже включён.`);
    } else {
      setEnabled(true);
      await sendMessage(chatId,
        `✅ <b>AI Admin включён!</b>\n\n` +
        `🤖 ИИ снова управляет:\n` +
        `• Модерация товаров\n` +
        `• Разрешение споров\n` +
        `• Безопасность и баны\n` +
        `• Поддержка пользователей\n` +
        `• Все автоматические функции`
      );
      console.log('[Bot] AI Admin включён администратором');
    }
    return;
  }

  // ── /ai_off — выключить ИИ (только админ) ────────────────────────────────
  if (text === '/ai_off') {
    if (!isAdmin(chatId)) {
      await sendMessage(chatId, `⛔ Нет доступа.`);
      return;
    }
    const { setEnabled, isEnabled } = require('./aiAdmin');
    if (!isEnabled()) {
      await sendMessage(chatId, `⏸ AI Admin уже выключен.`);
    } else {
      setEnabled(false);
      await sendMessage(chatId,
        `⏸ <b>AI Admin выключен.</b>\n\n` +
        `ИИ остановлен. Все решения теперь принимаются вручную.\n\n` +
        `Для включения: /ai_on`
      );
      console.log('[Bot] AI Admin выключен администратором');
    }
    return;
  }

  // ── /ai_status — статус ИИ (только админ) ────────────────────────────────
  if (text === '/ai_status') {
    if (!isAdmin(chatId)) {
      await sendMessage(chatId, `⛔ Нет доступа.`);
      return;
    }
    const { isEnabled } = require('./aiAdmin');
    const enabled = isEnabled();
    const status  = enabled ? '🟢 ВКЛЮЧЁН' : '🔴 ВЫКЛЮЧЕН';

    // Собираем статистику
    const { queryOne: qOne } = require('../models/db');
    const [pending, disputes, newProducts] = await Promise.all([
      qOne(`SELECT COUNT(*) as c FROM deals WHERE status='pending'`),
      qOne(`SELECT COUNT(*) as c FROM deals WHERE status='disputed'`),
      qOne(`SELECT COUNT(*) as c FROM products WHERE status='active' AND (ai_moderated IS NULL OR ai_moderated=0)`),
    ]);

    await sendMessage(chatId,
      `🤖 <b>AI Admin — Статус</b>\n\n` +
      `Состояние: <b>${status}</b>\n\n` +
      `📋 <b>Очередь задач:</b>\n` +
      `• Товаров на модерации: <b>${newProducts.c}</b>\n` +
      `• Споров на разрешении: <b>${disputes.c}</b>\n` +
      `• Сделок в ожидании: <b>${pending.c}</b>\n\n` +
      `⚙️ <b>Расписание:</b>\n` +
      `• Модерация — каждые 10 мин\n` +
      `• Споры — каждые 5 мин\n` +
      `• Безопасность — каждые 15 мин\n` +
      `• Цены, продвижение — каждый час\n` +
      `• Реактивация — каждый день\n` +
      `• Прогноз — каждый пн\n\n` +
      `${enabled ? 'Для выключения: /ai_off' : 'Для включения: /ai_on'}`
    );
    return;
  }

  // ── /report — часовой отчёт (только админ) ───────────────────────────────
  if (text === '/report') {
    if (!isAdmin(chatId)) {
      await sendMessage(chatId, `⛔ Нет доступа.`);
      return;
    }
    await sendMessage(chatId, `⏳ <b>Генерирую отчёт...</b>\n\nЭто займёт несколько секунд.`);
    try {
      const { sendHourlyReport } = require('./hourlyReport');
      await sendHourlyReport();
    } catch (e) {
      console.error('[Bot] /report error:', e.message);
      await sendMessage(chatId, `❌ Ошибка: <code>${e.message}</code>`);
    }
    return;
  }

  // ── /code ─────────────────────────────────────────────────────────────────
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
        `SELECT id, password, telegram_id FROM users WHERE username = $1`, [username]
      );

      if (existing?.password) {
        await sendMessage(chatId, `❌ Логин <b>${username}</b> уже занят. Выберите другой.`);
        return;
      }

      const code    = String(Math.floor(100000 + Math.random() * 900000));
      const expires = Math.floor(Date.now() / 1000) + 10 * 60;
      const tgId    = String(chatId);

      if (existing) {
        await run(`UPDATE users SET otp_code=$1, otp_expires=$2, otp_used=0, telegram_id=$3 WHERE id=$4`,
          [code, expires, tgId, existing.id]);
      } else {
        const tgExists = await queryOne(`SELECT username FROM users WHERE telegram_id=$1`, [tgId]);
        if (tgExists) {
          await sendMessage(chatId,
            `❌ Этот Telegram уже привязан к <b>${tgExists.username}</b>.\n\nДля входа: <code>${tgExists.username}</code>`
          );
          return;
        }
        await run(
          `INSERT INTO users (id, username, telegram_id, otp_code, otp_expires, otp_used) VALUES ($1,$2,$3,$4,$5,0)`,
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
      console.error('[Bot] /code error:', e.message);
      await sendMessage(chatId, `❌ Ошибка. Попробуйте ещё раз.`);
    }
    return;
  }

  // ── /reset ────────────────────────────────────────────────────────────────
  if (text.startsWith('/reset')) {
    const parts    = text.split(/\s+/);
    const username = (parts[1] || '').toLowerCase();

    if (!username) {
      await sendMessage(chatId, `❗ Укажите логин.\n\nПример: <code>/reset myusername</code>`);
      return;
    }

    try {
      const user = await queryOne(
        `SELECT * FROM users WHERE username=$1 AND telegram_id=$2`, [username, String(chatId)]
      );
      if (!user) {
        await sendMessage(chatId,
          `❌ Пользователь <b>${username}</b> не найден или не привязан к этому Telegram.\n\n` +
          `Для регистрации: /code ${username}`
        );
        return;
      }

      const code    = String(Math.floor(100000 + Math.random() * 900000));
      const expires = Math.floor(Date.now() / 1000) + 15 * 60;
      await run(`UPDATE users SET reset_code=$1, reset_expires=$2 WHERE id=$3`, [code, expires, user.id]);

      await sendMessage(chatId,
        `🔑 <b>Код сброса пароля</b>\n\n` +
        `Логин: <b>${username}</b>\n` +
        `Код: <code>${code}</code>\n\n` +
        `⏱ Действителен <b>15 минут</b>`
      );
    } catch (e) {
      console.error('[Bot] /reset error:', e.message);
      await sendMessage(chatId, `❌ Ошибка. Попробуйте ещё раз.`);
    }
    return;
  }

  // ── Любой другой текст — AI поддержка ────────────────────────────────────
  try {
    const { handleUserQuestion, isEnabled } = require('./aiAdmin');

    if (!isEnabled()) {
      await sendMessage(chatId,
        `ℹ️ Автоматическая поддержка временно недоступна.\n\n` +
        `Команды:\n• /code [логин]\n• /reset [логин]\n• /help`
      );
      return;
    }

    await sendMessage(chatId, `⏳ Отвечаю...`);
    const answer = await handleUserQuestion(chatId, text);
    await sendMessage(chatId, `🤖 ${answer}`);
  } catch (e) {
    console.error('[Bot] AI answer error:', e.message);
    await sendMessage(chatId,
      `❓ Не понял вопрос.\n\nКоманды:\n• /code [логин]\n• /reset [логин]\n• /help`
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Публичный интерфейс
// ─────────────────────────────────────────────────────────────────────────────

function getBot() {
  setWebhook();
  return { username: process.env.BOT_USERNAME || '' };
}

module.exports = { getBot, handleUpdate, sendMessage, setWebhook };
