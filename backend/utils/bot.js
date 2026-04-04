'use strict';
const https  = require('https');
const crypto = require('crypto');
const { queryOne, queryAll, run } = require('../models/db');

const TOKEN    = () => process.env.TELEGRAM_BOT_TOKEN || '';
const BASE_URL = () => process.env.BACKEND_URL || '';
const isAdmin  = (chatId) => String(chatId) === String(process.env.REPORT_CHAT_ID);

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

// ── Запрос к Claude ───────────────────────────────────────────────────────────
function askClaude(system, userMsg) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Promise.resolve('AI временно недоступен.');
  return new Promise((resolve) => {
    const body = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: system,
      messages: [{ role: 'user', content: userMsg }],
    });
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (r) => {
      let data = '';
      r.on('data', d => data += d);
      r.on('end', () => {
        try {
          const json = JSON.parse(data);
          console.log('[Bot] Claude response status:', r.statusCode, 'body preview:', data.slice(0, 200));
          if (json.error) {
            console.error('[Bot] Claude API error:', json.error);
            resolve('Сервис временно недоступен. Попробуйте позже.');
          } else {
            resolve(json?.content?.[0]?.text || 'Не могу ответить.');
          }
        } catch(e) {
          console.error('[Bot] Claude parse error:', e.message, 'raw:', data.slice(0, 200));
          resolve('Ошибка обработки ответа.');
        }
      });
      r.on('error', (e) => { console.error('[Bot] Claude response error:', e.message); resolve('Ошибка соединения.'); });
    });
    req.on('error', (e) => { console.error('[Bot] Claude request error:', e.message); resolve('Ошибка соединения.'); });
    req.setTimeout(30000, () => { req.destroy(); console.error('[Bot] Claude timeout'); resolve('Время ожидания истекло.'); });
    req.write(body);
    req.end();
  });
}

// ── Регистрация webhook ───────────────────────────────────────────────────────
function setWebhook() {
  const token = TOKEN();
  const base  = BASE_URL();
  console.log('[Bot] setWebhook called. TOKEN exists:', !!token, 'BASE_URL:', base || '(empty)');
  if (!token || !base) {
    console.warn('[Bot] TELEGRAM_BOT_TOKEN или BACKEND_URL не заданы');
    console.warn('[Bot] TOKEN length:', token?.length || 0, '| BASE_URL:', base || '(not set)');
    return;
  }
  // На Vercel backend доступен через /_/backend/, локально — напрямую
  const prefix = base.includes('vercel') || base.includes('.app') ? '/_/backend' : '';
  const webhookUrl = base + prefix + '/api/tg-webhook/' + token;
  console.log('[Bot] Registering webhook:', webhookUrl);
  const body = JSON.stringify({ url: webhookUrl, drop_pending_updates: true });
  const req = https.request({
    hostname: 'api.telegram.org',
    path: '/bot' + token + '/setWebhook',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  }, (r) => {
    let data = '';
    r.on('data', d => data += d);
    r.on('end', () => {
      try {
        const res = JSON.parse(data);
        if (res.ok) console.log('Telegram webhook: ' + webhookUrl);
        else console.error('[Bot] Webhook error:', res.description);
      } catch { console.error('[Bot] Webhook parse error'); }
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
    const adminCmds = isAdmin(chatId)
      ? '\n• /report — отчёт\n• /monitor — проверка сайта\n• /ai_on — включить AI\n• /ai_off — выключить AI\n• /ai_status — статус AI'
      : '';
    await sendMessage(chatId,
      '🟡 <b>Minions Market Bot</b>\n\n' +
      'Команды:\n' +
      '• /code [логин] — код для входа\n' +
      '• /reset [логин] — сброс пароля\n' +
      '• /help — помощь' + adminCmds
    );
    return;
  }

  // /help
  if (text === '/help') {
    const adminCmds = isAdmin(chatId)
      ? '\n\n🔧 Команды администратора:\n/report — отчёт\n/monitor — проверка сайта\n/ai_on /ai_off /ai_status'
      : '';
    await sendMessage(chatId,
      '🟡 <b>Minions Market — Помощь</b>\n\n' +
      '/code [логин] — код для регистрации\n' +
      '/reset [логин] — сброс пароля\n\n' +
      'По вопросам: @givi_hu' + adminCmds
    );
    return;
  }

  // /ai_on
  if (text === '/ai_on') {
    if (!isAdmin(chatId)) { await sendMessage(chatId, '⛔ Нет доступа.'); return; }
    try {
      const { setEnabled, isEnabled } = require('./aiAdmin');
      if (isEnabled()) { await sendMessage(chatId, '✅ AI Admin уже включён.'); }
      else { setEnabled(true); await sendMessage(chatId, '✅ <b>AI Admin включён!</b>'); }
    } catch(e) { await sendMessage(chatId, '❌ Ошибка: ' + e.message); }
    return;
  }

  // /ai_off
  if (text === '/ai_off') {
    if (!isAdmin(chatId)) { await sendMessage(chatId, '⛔ Нет доступа.'); return; }
    try {
      const { setEnabled, isEnabled } = require('./aiAdmin');
      if (!isEnabled()) { await sendMessage(chatId, '⏸ AI Admin уже выключен.'); }
      else { setEnabled(false); await sendMessage(chatId, '⏸ <b>AI Admin выключен.</b>'); }
    } catch(e) { await sendMessage(chatId, '❌ Ошибка: ' + e.message); }
    return;
  }

  // /ai_status
  if (text === '/ai_status') {
    if (!isAdmin(chatId)) { await sendMessage(chatId, '⛔ Нет доступа.'); return; }
    try {
      const { isEnabled } = require('./aiAdmin');
      const status = isEnabled() ? '🟢 ВКЛЮЧЁН' : '🔴 ВЫКЛЮЧЕН';
      const pending  = await queryOne("SELECT COUNT(*) as c FROM deals WHERE status='pending'").catch(() => ({c:0}));
      const disputes = await queryOne("SELECT COUNT(*) as c FROM deals WHERE status='disputed'").catch(() => ({c:0}));
      const newProds = await queryOne("SELECT COUNT(*) as c FROM products WHERE status='active' AND (ai_moderated IS NULL OR ai_moderated=0)").catch(() => ({c:0}));
      await sendMessage(chatId,
        '🤖 <b>AI Admin — ' + status + '</b>\n\n' +
        '📋 Очередь:\n' +
        '• На модерации: ' + newProds.c + '\n' +
        '• Споров: ' + disputes.c + '\n' +
        '• Ожидают: ' + pending.c + '\n\n' +
        (isEnabled() ? 'Выключить: /ai_off' : 'Включить: /ai_on')
      );
    } catch(e) { await sendMessage(chatId, '❌ Ошибка: ' + e.message); }
    return;
  }

  // /report
  if (text === '/report') {
    if (!isAdmin(chatId)) { await sendMessage(chatId, '⛔ Нет доступа.'); return; }
    await sendMessage(chatId, '⏳ <b>Генерирую отчёт...</b>');
    try {
      const { sendHourlyReport } = require('./hourlyReport');
      await sendHourlyReport();
    } catch(e) { await sendMessage(chatId, '❌ Ошибка: <code>' + e.message + '</code>'); }
    return;
  }

  // /monitor
  if (text === '/monitor') {
    if (!isAdmin(chatId)) { await sendMessage(chatId, '⛔ Нет доступа.'); return; }
    await sendMessage(chatId, '🔍 <b>Запускаю проверку сайта...</b>');
    try {
      const { runMonitor } = require('./monitor');
      await runMonitor();
    } catch(e) { await sendMessage(chatId, '❌ Ошибка: <code>' + e.message + '</code>'); }
    return;
  }

  // /code
  if (text.startsWith('/code')) {
    const parts    = text.split(/\s+/);
    const username = (parts[1] || '').toLowerCase();
    if (!username || !/^[a-z0-9_]{3,24}$/.test(username)) {
      await sendMessage(chatId, '❗ Укажите логин.\n\nПример: <code>/code myusername</code>');
      return;
    }
    try {
      const existing = await queryOne('SELECT id, password, telegram_id FROM users WHERE username=$1', [username]);
      if (existing && existing.password) {
        await sendMessage(chatId, '❌ Логин <b>' + username + '</b> уже занят.');
        return;
      }
      const code    = String(Math.floor(100000 + Math.random() * 900000));
      const expires = Math.floor(Date.now() / 1000) + 10 * 60;
      const tgId    = String(chatId);
      if (existing) {
        await run('UPDATE users SET otp_code=$1, otp_expires=$2, otp_used=0, telegram_id=$3 WHERE id=$4', [code, expires, tgId, existing.id]);
      } else {
        const tgExists = await queryOne('SELECT username FROM users WHERE telegram_id=$1', [tgId]);
        if (tgExists) {
          await sendMessage(chatId, '❌ Этот Telegram уже привязан к <b>' + tgExists.username + '</b>.');
          return;
        }
        await run('INSERT INTO users (id, username, telegram_id, otp_code, otp_expires, otp_used) VALUES ($1,$2,$3,$4,$5,0)',
          [crypto.randomUUID(), username, tgId, code, expires]);
      }
      await sendMessage(chatId,
        '🔐 <b>Код подтверждения</b>\n\nЛогин: <b>' + username + '</b>\nКод: <code>' + code + '</code>\n\n⏱ 10 минут'
      );
    } catch(e) {
      console.error('[Bot] /code error:', e.message);
      await sendMessage(chatId, '❌ Ошибка. Попробуйте ещё раз.');
    }
    return;
  }

  // /reset
  if (text.startsWith('/reset')) {
    const parts    = text.split(/\s+/);
    const username = (parts[1] || '').toLowerCase();
    if (!username) { await sendMessage(chatId, '❗ Укажите логин. Пример: <code>/reset myusername</code>'); return; }
    try {
      const user = await queryOne('SELECT * FROM users WHERE username=$1 AND telegram_id=$2', [username, String(chatId)]);
      if (!user) {
        await sendMessage(chatId, '❌ Пользователь <b>' + username + '</b> не найден или не привязан к этому Telegram.');
        return;
      }
      const code    = String(Math.floor(100000 + Math.random() * 900000));
      const expires = Math.floor(Date.now() / 1000) + 15 * 60;
      await run('UPDATE users SET reset_code=$1, reset_expires=$2 WHERE id=$3', [code, expires, user.id]);
      await sendMessage(chatId,
        '🔑 <b>Код сброса пароля</b>\n\nЛогин: <b>' + username + '</b>\nКод: <code>' + code + '</code>\n\n⏱ 15 минут'
      );
    } catch(e) {
      console.error('[Bot] /reset error:', e.message);
      await sendMessage(chatId, '❌ Ошибка. Попробуйте ещё раз.');
    }
    return;
  }

  // /partner — стать партнёром
  if (text === '/partner') {
    const user = await queryOne('SELECT * FROM users WHERE telegram_id=$1', [String(chatId)]).catch(() => null);
    if (!user) {
      await sendMessage(chatId, '❌ Сначала зарегистрируйтесь на сайте.\n/code [логин] — для регистрации');
      return;
    }
    if (user.is_partner) {
      const base = process.env.FRONTEND_URL || process.env.BACKEND_URL || '';
      await sendMessage(chatId,
        '✅ <b>Вы уже партнёр!</b>\n\n' +
        '🔗 Ваша ссылка:\n<code>' + base + '?ref=' + user.ref_code + '</code>\n\n' +
        '💰 Ваш процент: <b>' + user.partner_percent + '%</b> с каждой сделки реферала\n\n' +
        '/refstats — статистика рефералов'
      );
      return;
    }
    const percent = parseInt(process.env.PARTNER_PERCENT || '10');
    await sendMessage(chatId,
      '🤝 <b>Партнёрская программа Minions Market</b>\n\n' +
      'Условия сотрудничества:\n\n' +
      '• Вы получаете <b>' + percent + '%</b> с каждой завершённой сделки ваших рефералов\n' +
      '• Вознаграждение начисляется автоматически на баланс\n' +
      '• Вывод через CryptoBot в USDT\n' +
      '• Статистика в реальном времени через /refstats\n\n' +
      'Для подтверждения напишите: <b>/joinpartner да</b>'
    );
    return;
  }

  // /joinpartner да — подтверждение партнёрства
  if (text.toLowerCase().startsWith('/joinpartner')) {
    const confirm = text.split(/\s+/)[1]?.toLowerCase();
    if (confirm !== 'да') {
      await sendMessage(chatId, '❗ Для подтверждения напишите: /joinpartner да');
      return;
    }
    const user = await queryOne('SELECT * FROM users WHERE telegram_id=$1', [String(chatId)]).catch(() => null);
    if (!user) { await sendMessage(chatId, '❌ Сначала зарегистрируйтесь на сайте.'); return; }
    if (user.is_partner) { await sendMessage(chatId, '✅ Вы уже партнёр!'); return; }

    // Генерируем уникальный реф код
    const refCode = user.username + '_' + Math.random().toString(36).slice(2, 6).toUpperCase();
    const percent = parseInt(process.env.PARTNER_PERCENT || '10');
    await run('UPDATE users SET is_partner=1, ref_code=$1, partner_percent=$2 WHERE id=$3',
      [refCode, percent, user.id]);

    const base = process.env.FRONTEND_URL || process.env.BACKEND_URL || '';
    const refLink = base + '?ref=' + refCode;

    // Уведомляем тебя
    if (process.env.REPORT_CHAT_ID) {
      sendMessage(process.env.REPORT_CHAT_ID,
        '🤝 <b>Новый партнёр!</b>\n\n@' + user.username + '\nКод: ' + refCode + '\nПроцент: ' + percent + '%'
      ).catch(() => {});
    }

    await sendMessage(chatId,
      '🎉 <b>Добро пожаловать в партнёрскую программу!</b>\n\n' +
      '🔗 Ваша реферальная ссылка:\n<code>' + refLink + '</code>\n\n' +
      '💰 Ваш процент: <b>' + percent + '%</b> с каждой сделки\n\n' +
      'Поделитесь ссылкой — и зарабатывайте автоматичес��и!\n\n' +
      '/refstats — ваша статистика'
    );
    return;
  }

  // /refstats — статистика рефералов
  if (text === '/refstats') {
    const user = await queryOne('SELECT * FROM users WHERE telegram_id=$1', [String(chatId)]).catch(() => null);
    if (!user || !user.is_partner) {
      await sendMessage(chatId, '❌ Вы не являетесь партнёром.\n/partner — узнать об условиях');
      return;
    }
    const referred = await queryOne('SELECT COUNT(*) as c FROM users WHERE ref_by=$1', [user.ref_code]).catch(() => ({c:0}));
    const earned   = await queryOne('SELECT COALESCE(SUM(amount),0) as t FROM referral_rewards WHERE partner_id=$1', [user.id]).catch(() => ({t:0}));
    const lastRewards = await queryAll('SELECT amount, created_at FROM referral_rewards WHERE partner_id=$1 ORDER BY created_at DESC LIMIT 5', [user.id]).catch(() => []);

    const base = process.env.FRONTEND_URL || process.env.BACKEND_URL || '';
    await sendMessage(chatId,
      '📊 <b>Ваша статистика</b>\n\n' +
      '🔗 Ссылка: <code>' + base + '?ref=' + user.ref_code + '</code>\n' +
      '👥 Зарегистрировалось: <b>' + referred.c + '</b> человек\n' +
      '💰 Заработано всего: <b>$' + parseFloat(earned.t).toFixed(2) + '</b>\n' +
      '💳 Баланс: <b>$' + parseFloat(user.balance || 0).toFixed(2) + '</b>\n' +
      '📈 Ваш процент: <b>' + user.partner_percent + '%</b>\n\n' +
      (lastRewards.length > 0
        ? '🕐 Последние начисления:\n' + lastRewards.map(r => '  +$' + parseFloat(r.amount).toFixed(2) + ' · ' + new Date(r.created_at * 1000).toLocaleDateString('ru')).join('\n')
        : 'Сделок по рефералам ещё нет.')
    );
    return;
  }

  // ── Свободный чат с AI ────────────────────────────────────────────────────
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      await sendMessage(chatId, 'AI временно недоступен. Используйте /help для списка команд.');
      return;
    }

    await sendMessage(chatId, '⏳ Отвечаю...');

    // Данные пользователя
    const user = await queryOne(
      'SELECT id, username, balance, frozen_balance, total_sales, total_purchases, rating FROM users WHERE telegram_id=$1',
      [String(chatId)]
    ).catch(() => null);

    let userContext = '';

    if (user) {
      // Товары пользователя
      const myProducts = await queryAll(
        "SELECT title, price FROM products WHERE seller_id=$1 AND status='active' LIMIT 10",
        [user.id]
      ).catch(() => []);

      // Активные сделки
      const myDeals = await queryAll(
        "SELECT d.status, p.title, d.amount FROM deals d LEFT JOIN products p ON p.id=d.product_id WHERE (d.buyer_id=$1 OR d.seller_id=$1) AND d.status IN ('active','pending') ORDER BY d.created_at DESC LIMIT 5",
        [user.id]
      ).catch(() => []);

      userContext = 'Пользователь: @' + user.username + '\n' +
        'Баланс: $' + parseFloat(user.balance || 0).toFixed(2) + '\n' +
        'Заморожено: $' + parseFloat(user.frozen_balance || 0).toFixed(2) + '\n' +
        'Продаж: ' + (user.total_sales || 0) + ' | Покупок: ' + (user.total_purchases || 0) + '\n' +
        'Рейтинг: ' + (user.rating || 5.0);

      if (myProducts.length > 0) {
        userContext += '\n\nМои активные товары:\n' + myProducts.map(p => '- ' + p.title + ' ($' + p.price + ')').join('\n');
      } else {
        userContext += '\n\nАктивных товаров нет.';
      }

      if (myDeals.length > 0) {
        userContext += '\n\nМои активные сделки:\n' + myDeals.map(d => '- ' + (d.title || '?') + ' $' + d.amount + ' (' + d.status + ')').join('\n');
      }
    } else {
      userContext = 'Пользователь не зарегистрирован на платформе.';
    }

    // Поиск товаров в каталоге если нужно
    let catalogContext = '';
    if (text.length > 3) {
      const found = await queryAll(
        "SELECT title, price FROM products WHERE status='active' AND (LOWER(title) LIKE $1 OR LOWER(category) LIKE $1) LIMIT 5",
        ['%' + text.toLowerCase().slice(0, 30) + '%']
      ).catch(() => []);
      if (found.length > 0) {
        catalogContext = '\n\nТовары в каталоге по запросу:\n' + found.map(p => '- ' + p.title + ' за $' + p.price).join('\n');
      }
    }

    const isOwner = isAdmin(chatId);

    const systemPrompt = isOwner
      ? 'Ты умный AI-ассистент хозяина маркетплейса Minions Market (игровые товары, аккаунты, валюта). Общайся свободно и естественно по-русски. Помогай с вопросами о сайте, бизнесе, статистике.'
      : 'Ты помощник маркетплейса Minions Market. Общайся дружелюбно по-русски.\n\nПРАВИЛА:\n- Показывай только данные ЭТОГО пользователя\n- Никогда не раскрывай данные других\n- На вопросы не по теме сайта: "Я помогаю только по вопросам маркетплейса"\n\nО платформе: игровые товары, комиссия 5%, эскроу защита, пополнение RuKassa/CryptoPay.';

    const fullContext = userContext + catalogContext + '\n\nСообщение: ' + text;

    const answer = await askClaude(systemPrompt, fullContext);
    await sendMessage(chatId, answer);

    // Уведомляем тебя о переписке с другими юзерами
    if (!isOwner && process.env.REPORT_CHAT_ID) {
      sendMessage(process.env.REPORT_CHAT_ID,
        '💬 <b>@' + (user ? user.username : chatId) + '</b>\n❓ ' + text.slice(0, 100) + '\n🤖 ' + answer.slice(0, 100)
      ).catch(() => {});
    }

  } catch(e) {
    console.error('[Bot] chat error:', e.message);
    await sendMessage(chatId, 'Произошла ошибка. Попробуйте ещё раз.');
  }
}

// ── Публичный интерфейс ───────────────────────────────────────────────────────
function getBot() {
  setWebhook();
  return { username: process.env.BOT_USERNAME || '' };
}

module.exports = { getBot, handleUpdate, sendMessage, setWebhook };
