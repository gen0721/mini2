/**
 * 🤖 AI Admin — Minions Market
 *
 * Полностью автономный ИИ-администратор на базе Claude.
 * Работает без участия человека и выполняет:
 *
 *  1. Модерация товаров     — каждые 10 минут проверяет новые объявления
 *  2. Разрешение споров     — каждые 5 минут анализирует открытые споры
 *  3. Бан подозрительных    — каждые 15 минут мониторит аномалии
 *  4. Ответы пользователям  — в bot.js через handleUserQuestion()
 *
 * Env:
 *   ANTHROPIC_API_KEY  — обязательно
 *   REPORT_CHAT_ID     — Telegram ID админа (для логов действий)
 */

const https  = require('https');
const crypto = require('crypto');
const cron   = require('node-cron');
const { queryOne, queryAll, run, transaction } = require('../models/db');

// ─────────────────────────────────────────────────────────────────────────────
// Claude API
// ─────────────────────────────────────────────────────────────────────────────

function askClaude(systemPrompt, userPrompt, maxTokens = 500) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Promise.reject(new Error('ANTHROPIC_API_KEY не задан'));

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
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
          resolve(json?.content?.[0]?.text || '');
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Claude timeout')); });
    req.write(body);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Telegram уведомление админу о каждом действии ИИ
// ─────────────────────────────────────────────────────────────────────────────

function notifyAdmin(text) {
  const chatId = process.env.REPORT_CHAT_ID;
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  if (!chatId || !token) return Promise.resolve();

  return new Promise((resolve) => {
    const body = JSON.stringify({ chat_id: String(chatId), text, parse_mode: 'HTML' });
    const req  = https.request({
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

function notifyUser(telegramId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!telegramId || !token) return Promise.resolve();

  return new Promise((resolve) => {
    const body = JSON.stringify({ chat_id: String(telegramId), text, parse_mode: 'HTML' });
    const req  = https.request({
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
// 1. МОДЕРАЦИЯ ТОВАРОВ
// ─────────────────────────────────────────────────────────────────────────────

async function moderateProducts() {
  // Берём товары без метки модерации — добавим поле ai_moderated в БД
  const products = await queryAll(`
    SELECT p.*, u.username as seller_username, u.total_sales, u.rating, u.review_count
    FROM products p
    LEFT JOIN users u ON u.id = p.seller_id
    WHERE p.status = 'active' AND (p.ai_moderated IS NULL OR p.ai_moderated = 0)
    ORDER BY p.created_at ASC
    LIMIT 10
  `);

  if (!products.length) return;

  for (const product of products) {
    try {
      const systemPrompt = `Ты модератор игрового маркетплейса Minions Market. 
Твоя задача — проверить объявление и принять решение: APPROVE или DELETE.

Удаляй если:
- Мошеннические признаки (слишком низкая цена, подозрительное описание)
- Запрещённый контент (обман, взлом аккаунтов, кража)
- Спам или бессмысленный текст
- Продажа реальных денег или незаконных услуг

Одобряй если:
- Нормальный игровой товар (аккаунты, валюта, предметы, скины, буст)
- Адекватная цена и описание

Отвечай ТОЛЬКО в формате JSON:
{"decision":"APPROVE","reason":"причина"}
или
{"decision":"DELETE","reason":"причина для пользователя"}`;

      const userPrompt = `Объявление:
Название: ${product.title}
Описание: ${product.description}
Цена: $${product.price}
Категория: ${product.category}
Продавец: @${product.seller_username} (продаж: ${product.total_sales}, рейтинг: ${product.rating})`;

      const response = await askClaude(systemPrompt, userPrompt, 200);
      const clean    = response.replace(/```json|```/g, '').trim();
      const result   = JSON.parse(clean);

      // Помечаем как проверенный в любом случае
      await run(`UPDATE products SET ai_moderated = 1 WHERE id = $1`, [product.id]);

      if (result.decision === 'DELETE') {
        await run(`UPDATE products SET status = 'deleted' WHERE id = $1`, [product.id]);

        const seller = await queryOne('SELECT telegram_id FROM users WHERE id = $1', [product.seller_id]);
        if (seller?.telegram_id) {
          await notifyUser(seller.telegram_id,
            `🚫 <b>Ваше объявление удалено</b>\n\n` +
            `Товар: <b>${product.title}</b>\n` +
            `Причина: ${result.reason}\n\n` +
            `Если считаете это ошибкой — напишите в поддержку.`
          );
        }

        await notifyAdmin(
          `🤖 <b>AI Модерация — УДАЛЕНО</b>\n\n` +
          `Товар: <b>${product.title}</b>\n` +
          `Продавец: @${product.seller_username}\n` +
          `Причина: ${result.reason}`
        );

        console.log(`[AI Admin] Удалён товар: "${product.title}" — ${result.reason}`);
      } else {
        await notifyAdmin(
          `✅ <b>AI Модерация — Одобрено</b>\n\n` +
          `Товар: <b>${product.title}</b>\n` +
          `Продавец: @${product.seller_username}`
        );
        console.log(`[AI Admin] Одобрен товар: "${product.title}"`);
      }

    } catch (e) {
      console.error(`[AI Admin] Ошибка модерации товара ${product.id}:`, e.message);
      // Помечаем чтобы не зациклиться
      await run(`UPDATE products SET ai_moderated = 1 WHERE id = $1`, [product.id]).catch(() => {});
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. РАЗРЕШЕНИЕ СПОРОВ
// ─────────────────────────────────────────────────────────────────────────────

async function resolveDisputes() {
  const disputes = await queryAll(`
    SELECT d.*,
      p.title as product_title, p.description as product_desc, p.price as product_price,
      b.username as buyer_username, b.telegram_id as buyer_tg, b.total_purchases,
      s.username as seller_username, s.telegram_id as seller_tg, s.total_sales, s.rating as seller_rating
    FROM deals d
    LEFT JOIN products p ON p.id = d.product_id
    LEFT JOIN users b    ON b.id = d.buyer_id
    LEFT JOIN users s    ON s.id = d.seller_id
    WHERE d.status = 'disputed'
    ORDER BY d.updated_at ASC
    LIMIT 5
  `);

  if (!disputes.length) return;

  for (const deal of disputes) {
    try {
      // Читаем переписку по сделке
      const messages = await queryAll(`
        SELECT dm.text, dm.is_system, u.username
        FROM deal_messages dm
        LEFT JOIN users u ON u.id = dm.sender_id
        WHERE dm.deal_id = $1
        ORDER BY dm.created_at ASC
      `, [deal.id]);

      const chatHistory = messages
        .filter(m => !m.is_system)
        .slice(-20)
        .map(m => `@${m.username || 'система'}: ${m.text}`)
        .join('\n');

      const systemPrompt = `Ты арбитр игрового маркетплейса Minions Market.
Разреши спор между покупателем и продавцом.

Твои варианты:
- COMPLETE — завершить сделку в пользу продавца (деньги продавцу)
- REFUND — вернуть деньги покупателю

Принимай решение на основе:
- Описания товара и причины спора
- Переписки сторон
- Репутации продавца

Отвечай ТОЛЬКО в формате JSON:
{"decision":"COMPLETE","reason":"объяснение для обеих сторон"}
или
{"decision":"REFUND","reason":"объяснение для обеих сторон"}`;

      const userPrompt = `Спор по сделке:

Товар: ${deal.product_title} ($${deal.product_price})
Описание товара: ${deal.product_desc?.slice(0, 300)}

Покупатель: @${deal.buyer_username} (покупок: ${deal.total_purchases})
Продавец: @${deal.seller_username} (продаж: ${deal.total_sales}, рейтинг: ${deal.seller_rating})

Причина спора: ${deal.dispute_reason}

Товар был передан: ${deal.delivered_at ? 'Да' : 'Нет'}

Переписка:
${chatHistory || '(переписки нет)'}`;

      const response = await askClaude(systemPrompt, userPrompt, 300);
      const clean    = response.replace(/```json|```/g, '').trim();
      const result   = JSON.parse(clean);

      if (result.decision === 'COMPLETE') {
        // Завершить в пользу продавца
        const { completeDeal } = require('../routes/deals');
        await completeDeal(deal, 'ai_admin');
        await run(
          `UPDATE deals SET admin_note = $1, resolved_by = 'ai', resolved_at = EXTRACT(EPOCH FROM NOW())::BIGINT WHERE id = $2`,
          [`AI: ${result.reason}`, deal.id]
        );
      } else {
        // Возврат покупателю
        await transaction(async (client) => {
          await client.query(
            `UPDATE users SET balance = balance + $1, frozen_balance = frozen_balance - $1 WHERE id = $2`,
            [deal.amount, deal.buyer_id]
          );
          await client.query(`UPDATE products SET status = 'active' WHERE id = $1`, [deal.product_id]);
          await client.query(
            `UPDATE deals SET status = 'refunded', admin_note = $1, resolved_by = 'ai',
             resolved_at = EXTRACT(EPOCH FROM NOW())::BIGINT, updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT WHERE id = $2`,
            [`AI: ${result.reason}`, deal.id]
          );
          await client.query(
            `INSERT INTO transactions (id, user_id, type, amount, status, description, deal_id)
             VALUES ($1,$2,'refund',$3,'completed',$4,$5)`,
            [crypto.randomUUID(), deal.buyer_id, deal.amount, `Возврат по решению AI: ${result.reason}`, deal.id]
          );
        });
      }

      const outcome = result.decision === 'COMPLETE' ? 'в пользу продавца 💰' : 'возврат покупателю ↩️';
      const userMsg =
        `⚖️ <b>Спор разрешён</b>\n\n` +
        `Товар: <b>${deal.product_title}</b>\n` +
        `Решение: <b>${outcome}</b>\n\n` +
        `${result.reason}`;

      await Promise.all([
        notifyUser(deal.buyer_tg, userMsg),
        notifyUser(deal.seller_tg, userMsg),
        notifyAdmin(
          `🤖 <b>AI Арбитраж</b>\n\n` +
          `Товар: <b>${deal.product_title}</b>\n` +
          `Покупатель: @${deal.buyer_username}\n` +
          `Продавец: @${deal.seller_username}\n` +
          `Решение: <b>${outcome}</b>\n` +
          `Причина: ${result.reason}`
        ),
      ]);

      console.log(`[AI Admin] Спор ${deal.id} разрешён: ${result.decision}`);

    } catch (e) {
      console.error(`[AI Admin] Ошибка разрешения спора ${deal.id}:`, e.message);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. АВТОБАН ПОДОЗРИТЕЛЬНЫХ ПОЛЬЗОВАТЕЛЕЙ
// ─────────────────────────────────────────────────────────────────────────────

async function monitorSuspiciousUsers() {
  const hour1ago = Math.floor(Date.now() / 1000) - 3600;
  const hour6ago = Math.floor(Date.now() / 1000) - 21600;

  // Ищем подозрительных: много неудачных входов, много споров, новый аккаунт с кучей активности
  const suspicious = await queryAll(`
    SELECT
      u.id, u.username, u.telegram_id, u.is_banned,
      u.created_at, u.total_sales, u.total_purchases, u.rating, u.review_count,
      (SELECT COUNT(*) FROM security_logs sl WHERE sl.user_id = u.id AND sl.event = 'LOGIN_FAIL' AND sl.created_at >= $1) as failed_logins,
      (SELECT COUNT(*) FROM deals d WHERE (d.buyer_id = u.id OR d.seller_id = u.id) AND d.status = 'disputed') as total_disputes,
      (SELECT COUNT(*) FROM deals d WHERE (d.buyer_id = u.id OR d.seller_id = u.id) AND d.status = 'disputed' AND d.created_at >= $2) as recent_disputes,
      (SELECT COUNT(*) FROM products p WHERE p.seller_id = u.id AND p.status = 'deleted') as deleted_products
    FROM users u
    WHERE u.is_banned = 0 AND u.password IS NOT NULL
    HAVING
      (SELECT COUNT(*) FROM security_logs sl WHERE sl.user_id = u.id AND sl.event = 'LOGIN_FAIL' AND sl.created_at >= $1) > 10
      OR (SELECT COUNT(*) FROM deals d WHERE (d.buyer_id = u.id OR d.seller_id = u.id) AND d.status = 'disputed' AND d.created_at >= $2) >= 3
      OR (SELECT COUNT(*) FROM products p WHERE p.seller_id = u.id AND p.status = 'deleted') >= 3
    LIMIT 5
  `, [hour1ago, hour6ago]);

  if (!suspicious.length) return;

  for (const user of suspicious) {
    try {
      const systemPrompt = `Ты модератор безопасности игрового маркетплейса.
Проанализируй данные пользователя и реши: BAN или OK.

Банить если явные признаки мошенничества или злоупотреблений.
Не банить если данные неоднозначны или мало информации.

Отвечай ТОЛЬКО в формате JSON:
{"decision":"BAN","hours":24,"reason":"причина"}
или
{"decision":"OK","reason":"объяснение"}

hours — на сколько часов банить (24, 48, 72 или 0 = навсегда)`;

      const accountAge = Math.floor((Date.now() / 1000 - user.created_at) / 86400);

      const userPrompt = `Пользователь @${user.username}:
- Возраст аккаунта: ${accountAge} дней
- Продаж: ${user.total_sales}, покупок: ${user.total_purchases}
- Рейтинг: ${user.rating} (${user.review_count} отзывов)
- Неудачных входов за час: ${user.failed_logins}
- Всего споров: ${user.total_disputes} (за 6ч: ${user.recent_disputes})
- Удалённых товаров AI-модерацией: ${user.deleted_products}`;

      const response = await askClaude(systemPrompt, userPrompt, 200);
      const clean    = response.replace(/```json|```/g, '').trim();
      const result   = JSON.parse(clean);

      if (result.decision === 'BAN') {
        const bannedUntil = result.hours
          ? Math.floor(Date.now() / 1000) + result.hours * 3600
          : null;

        await run(
          `UPDATE users SET is_banned = 1, banned_until = $1, ban_reason = $2 WHERE id = $3`,
          [bannedUntil, `AI: ${result.reason}`, user.id]
        );

        if (user.telegram_id) {
          const exp = bannedUntil
            ? `на ${result.hours} часов`
            : 'навсегда';
          await notifyUser(user.telegram_id,
            `🚫 <b>Аккаунт заблокирован</b>\n\n` +
            `Срок: <b>${exp}</b>\n` +
            `Причина: ${result.reason}\n\n` +
            `Если считаете это ошибкой — обратитесь в поддержку.`
          );
        }

        await notifyAdmin(
          `🤖 <b>AI Безопасность — БАН</b>\n\n` +
          `Пользователь: @${user.username}\n` +
          `Срок: ${result.hours ? result.hours + 'ч' : 'навсегда'}\n` +
          `Причина: ${result.reason}`
        );

        console.log(`[AI Admin] Забанен @${user.username}: ${result.reason}`);
      }

    } catch (e) {
      console.error(`[AI Admin] Ошибка проверки пользователя ${user.id}:`, e.message);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. ОТВЕТ НА ВОПРОСЫ ПОЛЬЗОВАТЕЛЕЙ В БОТЕ
// ─────────────────────────────────────────────────────────────────────────────

async function handleUserQuestion(telegramId, question) {
  try {
    // Получаем данные пользователя для контекста
    const user = await queryOne(
      `SELECT username, balance, total_sales, total_purchases, rating, is_banned, ban_reason
       FROM users WHERE telegram_id = $1`,
      [String(telegramId)]
    );

    const systemPrompt = `Ты дружелюбный помощник игрового маркетплейса Minions Market.
Отвечай кратко и по делу, на русском языке.

О маркетплейсе:
- Площадка для продажи игровых товаров: аккаунты, валюта, предметы, скины, ключи, буст
- Комиссия платформы: 5%
- Безопасные сделки через эскроу (деньги замораживаются до подтверждения)
- Автозавершение сделки через 72 часа если нет спора
- Пополнение через Rukassa или CryptoCloud

Команды бота:
/code [логин] — код для регистрации
/reset [логин] — сброс пароля
/report — часовой отчёт (только для админа)

Если вопрос о конкретной сделке или проблеме — скажи написать в чат сделки на сайте.
Если вопрос не по теме маркетплейса — вежливо откажи.
Отвечай максимум 3-4 предложения.`;

    const userContext = user
      ? `Пользователь: @${user.username}, баланс: $${parseFloat(user.balance).toFixed(2)}, продаж: ${user.total_sales}, покупок: ${user.total_purchases}\n\n`
      : '';

    const answer = await askClaude(systemPrompt, userContext + `Вопрос: ${question}`, 400);
    return answer;

  } catch (e) {
    console.error('[AI Admin] Ошибка ответа на вопрос:', e.message);
    return 'Извините, произошла ошибка. Попробуйте позже или обратитесь к администратору.';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Миграция БД — добавляем поле ai_moderated если нет
// ─────────────────────────────────────────────────────────────────────────────

async function migrate() {
  try {
    await run(`ALTER TABLE products ADD COLUMN IF NOT EXISTS ai_moderated INTEGER DEFAULT 0`);
    console.log('[AI Admin] ✅ Миграция БД выполнена');
  } catch (e) {
    console.error('[AI Admin] Миграция:', e.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CRON расписание
// ─────────────────────────────────────────────────────────────────────────────

async function init() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[AI Admin] ⚠️  ANTHROPIC_API_KEY не задан — AI Admin отключён');
    return;
  }

  await migrate();

  // Модерация товаров — каждые 10 минут
  cron.schedule('*/10 * * * *', () => {
    moderateProducts().catch(e => console.error('[AI Admin] Модерация:', e.message));
  });

  // Разрешение споров — каждые 5 минут
  cron.schedule('*/5 * * * *', () => {
    resolveDisputes().catch(e => console.error('[AI Admin] Споры:', e.message));
  });

  // Мониторинг безопасности — каждые 15 минут
  cron.schedule('*/15 * * * *', () => {
    monitorSuspiciousUsers().catch(e => console.error('[AI Admin] Безопасность:', e.message));
  });

  console.log('✅ AI Admin запущен (модерация / споры / безопасность)');

  await notifyAdmin(
    `🤖 <b>AI Admin запущен</b>\n\n` +
    `✅ Модерация товаров — каждые 10 мин\n` +
    `✅ Разрешение споров — каждые 5 мин\n` +
    `✅ Мониторинг безопасности — каждые 15 мин\n` +
    `✅ Ответы пользователям — в реальном времени`
  );
}

module.exports = { init, handleUserQuestion };
