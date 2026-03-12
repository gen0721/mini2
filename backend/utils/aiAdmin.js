/**
 * 🤖 AI Admin ULTRA — Minions Market
 *
 * Управление: /ai_on | /ai_off | /ai_status через Telegram
 * Уведомления: сначала админ, потом юзер (если касается юзера)
 */

'use strict';

const https  = require('https');
const crypto = require('crypto');
const cron   = require('node-cron');
const { queryOne, queryAll, run, transaction } = require('../models/db');

// ─────────────────────────────────────────────────────────────────────────────
// Состояние ИИ (включён / выключен)
// Хранится в памяти — при рестарте сервера включается по умолчанию
// ─────────────────────────────────────────────────────────────────────────────

let AI_ENABLED = true;

function isEnabled()    { return AI_ENABLED; }
function setEnabled(v)  { AI_ENABLED = v; }

// ─────────────────────────────────────────────────────────────────────────────
// Утилиты
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
        try { resolve(JSON.parse(data)?.content?.[0]?.text || ''); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Claude timeout')); });
    req.write(body);
    req.end();
  });
}

function parseJSON(text) {
  try { return JSON.parse(text.replace(/```json|```/g, '').trim()); }
  catch { return null; }
}

// Отправить Telegram-сообщение любому chat_id
function tg(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return Promise.resolve();
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

// Уведомить сначала ТЕБЯ, потом (опционально) юзера
async function notify(adminText, userTgId = null, userText = null) {
  // 1. Сначала всегда тебе
  await tg(process.env.REPORT_CHAT_ID, adminText);
  // 2. Потом юзеру если нужно
  if (userTgId && userText) {
    await tg(userTgId, userText);
  }
}

function log(tag, msg) { console.log(`[AI:${tag}] ${msg}`); }

// ─────────────────────────────────────────────────────────────────────────────
// 1. МОДЕРАЦИЯ ТОВАРОВ
// ─────────────────────────────────────────────────────────────────────────────

async function moderateProducts() {
  if (!isEnabled()) return;

  const products = await queryAll(`
    SELECT p.*, u.username as seller_username, u.total_sales, u.rating,
           u.review_count, u.is_verified, u.telegram_id as seller_tg
    FROM products p
    LEFT JOIN users u ON u.id = p.seller_id
    WHERE p.status = 'active' AND (p.ai_moderated IS NULL OR p.ai_moderated = 0)
    ORDER BY p.created_at ASC LIMIT 10
  `);
  if (!products.length) return;

  log('MOD', `Проверяю ${products.length} товаров...`);

  for (const p of products) {
    try {
      const res = parseJSON(await askClaude(
        `Ты модератор игрового маркетплейса. Проверь объявление.

Решения:
- APPROVE — нормальный игровой товар
- DELETE  — мошенничество, запрещённый контент, спам, краденое
- IMPROVE — товар нормальный, но описание слабое

Отвечай ТОЛЬКО JSON:
{"decision":"APPROVE"}
{"decision":"DELETE","reason":"причина для пользователя"}
{"decision":"IMPROVE","newDescription":"улучшенное описание до 300 символов","tip":"совет продавцу"}`,

        `Название: ${p.title}
Описание: ${(p.description || '').slice(0, 400)}
Цена: $${p.price}
Категория: ${p.category}
Продавец: @${p.seller_username} (продаж: ${p.total_sales}, рейтинг: ${p.rating}, верифицирован: ${p.is_verified ? 'да' : 'нет'})`, 300));

      await run(`UPDATE products SET ai_moderated = 1 WHERE id = $1`, [p.id]);
      if (!res) continue;

      if (res.decision === 'DELETE') {
        await run(`UPDATE products SET status = 'deleted' WHERE id = $1`, [p.id]);

        await notify(
          `🤖 <b>Модерация — УДАЛЕНО</b>\n\n📦 <b>${p.title}</b>\n👤 @${p.seller_username}\n💰 $${p.price}\n❌ Причина: ${res.reason}`,
          p.seller_tg,
          `🚫 <b>Ваше объявление удалено</b>\n\nТовар: <b>${p.title}</b>\nПричина: ${res.reason}\n\nЕсли считаете ошибкой — напишите в поддержку.`
        );
        log('MOD', `УДАЛЁН: "${p.title}" — ${res.reason}`);

      } else if (res.decision === 'IMPROVE') {
        if (res.newDescription) await run(`UPDATE products SET description = $1 WHERE id = $2`, [res.newDescription, p.id]);

        await notify(
          `🤖 <b>Модерация — УЛУЧШЕНО</b>\n\n📦 <b>${p.title}</b>\n👤 @${p.seller_username}\n✏️ Описание улучшено автоматически`,
          p.seller_tg,
          `💡 <b>Совет по объявлению</b>\n\nТовар: <b>${p.title}</b>\n\n${res.tip || 'Описание улучшено автоматически.'}`
        );
        log('MOD', `УЛУЧШЕНО: "${p.title}"`);

      } else {
        await notify(`🤖 <b>Модерация — ОДОБРЕНО</b>\n\n📦 <b>${p.title}</b>\n👤 @${p.seller_username}\n💰 $${p.price}`);
        log('MOD', `ОДОБРЕН: "${p.title}"`);
      }
    } catch (e) {
      console.error(`[AI:MOD] Ошибка ${p.id}:`, e.message);
      await run(`UPDATE products SET ai_moderated = 1 WHERE id = $1`, [p.id]).catch(() => {});
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. МОНИТОРИНГ ЦЕН
// ─────────────────────────────────────────────────────────────────────────────

async function monitorPrices() {
  if (!isEnabled()) return;

  const stale = await queryAll(`
    SELECT p.*, u.username, u.telegram_id,
      (SELECT AVG(p2.price) FROM products p2 WHERE p2.category = p.category AND p2.status = 'active' AND p2.id != p.id) as avg_cat_price,
      (SELECT COUNT(*) FROM products p2 WHERE p2.category = p.category AND p2.status = 'active' AND p2.price < p.price) as cheaper_count
    FROM products p
    LEFT JOIN users u ON u.id = p.seller_id
    WHERE p.status = 'active'
      AND p.created_at < EXTRACT(EPOCH FROM NOW())::BIGINT - 604800
      AND p.views > 10
      AND (p.ai_price_advised IS NULL OR p.ai_price_advised = 0)
    LIMIT 5
  `);

  for (const p of stale) {
    try {
      const avgPrice = parseFloat(p.avg_cat_price) || 0;
      if (!avgPrice || p.price <= avgPrice * 1.3) continue;
      const suggested = Math.round(avgPrice * 1.05 * 100) / 100;
      await run(`UPDATE products SET ai_price_advised = 1 WHERE id = $1`, [p.id]);

      await notify(
        `🤖 <b>Совет по цене</b>\n\n📦 <b>${p.title}</b>\n👤 @${p.username}\n💰 Цена: $${p.price} → Рекомендую: $${suggested}\n📊 Средняя в категории: $${avgPrice.toFixed(2)}, дешевле: ${p.cheaper_count} шт.`,
        p.telegram_id,
        `📊 <b>Совет по цене</b>\n\nТовар: <b>${p.title}</b>\nВаша цена: $${p.price}\nСредняя в категории: $${avgPrice.toFixed(2)}\nДешевле вас: ${p.cheaper_count} объявлений\n\n💡 Рекомендуем снизить до <b>$${suggested}</b> для быстрой продажи.`
      );
      log('PRICE', `Совет @${p.username}: $${p.price} → $${suggested}`);
    } catch (e) { console.error(`[AI:PRICE]`, e.message); }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. АВТОПРОДВИЖЕНИЕ ТОП-ПРОДАВЦОВ
// ─────────────────────────────────────────────────────────────────────────────

async function autoPromoteTopSellers() {
  if (!isEnabled()) return;

  const week = Math.floor(Date.now() / 1000) - 604800;
  const topSellers = await queryAll(`
    SELECT u.id, u.username, u.telegram_id, COUNT(d.id) as weekly_sales
    FROM deals d
    LEFT JOIN users u ON u.id = d.seller_id
    WHERE d.status = 'completed' AND d.updated_at >= $1
    GROUP BY u.id, u.username, u.telegram_id
    HAVING COUNT(d.id) >= 3
    ORDER BY COUNT(d.id) DESC LIMIT 3
  `, [week]);

  for (const seller of topSellers) {
    try {
      const topProduct = await queryOne(`
        SELECT id, title FROM products
        WHERE seller_id = $1 AND status = 'active' AND (is_promoted = 0 OR promoted_until IS NULL)
        ORDER BY views DESC LIMIT 1
      `, [seller.id]);
      if (!topProduct) continue;

      const until = Math.floor(Date.now() / 1000) + 86400;
      await run(`UPDATE products SET is_promoted = 1, promoted_until = $1 WHERE id = $2`, [until, topProduct.id]);

      await notify(
        `🤖 <b>Автопродвижение</b>\n\n👤 @${seller.username} (${seller.weekly_sales} сделок за неделю)\n📦 Продвинут: <b>${topProduct.title}</b> на 24ч`,
        seller.telegram_id,
        `🚀 <b>Ваш товар продвинут бесплатно!</b>\n\nЗа ${seller.weekly_sales} сделок на этой неделе:\n📦 <b>${topProduct.title}</b>\n\nПродвижение действует 24 часа. Спасибо! 🟡`
      );
      log('PROMOTE', `@${seller.username}: "${topProduct.title}"`);
    } catch (e) { console.error(`[AI:PROMOTE]`, e.message); }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. РАЗРЕШЕНИЕ СПОРОВ
// ─────────────────────────────────────────────────────────────────────────────

async function resolveDisputes() {
  if (!isEnabled()) return;

  const disputes = await queryAll(`
    SELECT d.*,
      p.title as product_title, p.description as product_desc, p.price as product_price,
      b.username as buyer_username, b.telegram_id as buyer_tg, b.total_purchases, b.rating as buyer_rating,
      s.username as seller_username, s.telegram_id as seller_tg, s.total_sales, s.rating as seller_rating, s.is_verified as seller_verified
    FROM deals d
    LEFT JOIN products p ON p.id = d.product_id
    LEFT JOIN users b ON b.id = d.buyer_id
    LEFT JOIN users s ON s.id = d.seller_id
    WHERE d.status = 'disputed'
    ORDER BY d.updated_at ASC LIMIT 5
  `);
  if (!disputes.length) return;

  for (const deal of disputes) {
    try {
      const messages = await queryAll(`
        SELECT dm.text, dm.is_system, u.username
        FROM deal_messages dm LEFT JOIN users u ON u.id = dm.sender_id
        WHERE dm.deal_id = $1 ORDER BY dm.created_at ASC
      `, [deal.id]);

      const chat = messages.filter(m => !m.is_system).slice(-15)
        .map(m => `@${m.username || '?'}: ${m.text}`).join('\n');

      const res = parseJSON(await askClaude(
        `Ты арбитр игрового маркетплейса. Реши спор справедливо.

Варианты:
- COMPLETE — завершить в пользу продавца
- REFUND   — вернуть деньги покупателю
- PARTIAL  — частичный возврат

Отвечай ТОЛЬКО JSON:
{"decision":"COMPLETE","reason":"..."}
{"decision":"REFUND","reason":"..."}
{"decision":"PARTIAL","refundPercent":50,"reason":"..."}`,

        `Товар: ${deal.product_title} ($${deal.product_price})
Описание: ${(deal.product_desc || '').slice(0, 200)}
Товар передан: ${deal.delivered_at ? 'Да' : 'Нет'}
Причина спора: ${deal.dispute_reason}
Покупатель: @${deal.buyer_username} (покупок: ${deal.total_purchases}, рейтинг: ${deal.buyer_rating})
Продавец: @${deal.seller_username} (продаж: ${deal.total_sales}, рейтинг: ${deal.seller_rating})
Переписка:\n${chat || '(нет)'}`, 400));

      if (!res) continue;

      const { completeDeal } = require('../routes/deals');

      if (res.decision === 'COMPLETE') {
        await completeDeal(deal, 'ai_admin');
        await run(`UPDATE deals SET admin_note=$1, resolved_by='ai', resolved_at=EXTRACT(EPOCH FROM NOW())::BIGINT WHERE id=$2`,
          [`AI: ${res.reason}`, deal.id]);

      } else if (res.decision === 'REFUND') {
        await transaction(async (client) => {
          await client.query(`UPDATE users SET balance=balance+$1, frozen_balance=frozen_balance-$1 WHERE id=$2`, [deal.amount, deal.buyer_id]);
          await client.query(`UPDATE products SET status='active' WHERE id=$1`, [deal.product_id]);
          await client.query(`UPDATE deals SET status='refunded', admin_note=$1, resolved_by='ai', resolved_at=EXTRACT(EPOCH FROM NOW())::BIGINT, updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT WHERE id=$2`,
            [`AI: ${res.reason}`, deal.id]);
          await client.query(`INSERT INTO transactions (id,user_id,type,amount,status,description,deal_id) VALUES ($1,$2,'refund',$3,'completed',$4,$5)`,
            [crypto.randomUUID(), deal.buyer_id, deal.amount, `Возврат AI: ${res.reason}`, deal.id]);
        });

      } else if (res.decision === 'PARTIAL') {
        const pct       = Math.min(Math.max(parseInt(res.refundPercent) || 50, 1), 99);
        const refundAmt = Math.round(deal.amount * pct / 100 * 100) / 100;
        const toSeller  = Math.round((deal.amount - refundAmt) * 0.95 * 100) / 100;
        await transaction(async (client) => {
          await client.query(`UPDATE users SET balance=balance+$1, frozen_balance=frozen_balance-$2 WHERE id=$3`, [refundAmt, deal.amount, deal.buyer_id]);
          await client.query(`UPDATE users SET balance=balance+$1 WHERE id=$2`, [toSeller, deal.seller_id]);
          await client.query(`UPDATE products SET status='sold' WHERE id=$1`, [deal.product_id]);
          await client.query(`UPDATE deals SET status='completed', admin_note=$1, resolved_by='ai', resolved_at=EXTRACT(EPOCH FROM NOW())::BIGINT, updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT WHERE id=$2`,
            [`AI (частичный ${pct}% возврат): ${res.reason}`, deal.id]);
          await client.query(`INSERT INTO transactions (id,user_id,type,amount,status,description,deal_id) VALUES ($1,$2,'refund',$3,'completed',$4,$5)`,
            [crypto.randomUUID(), deal.buyer_id, refundAmt, `Частичный возврат ${pct}%: ${res.reason}`, deal.id]);
        });
      }

      const outcomeText = res.decision === 'COMPLETE' ? 'в пользу продавца 💰'
        : res.decision === 'REFUND' ? 'возврат покупателю ↩️'
        : `частичный возврат ${res.refundPercent}% ⚖️`;

      const userMsg = `⚖️ <b>Спор разрешён AI</b>\n\nТовар: <b>${deal.product_title}</b>\nРешение: <b>${outcomeText}</b>\n\n${res.reason}`;

      // Сначала тебе — потом обеим сторонам
      await tg(process.env.REPORT_CHAT_ID,
        `🤖 <b>Арбитраж завершён</b>\n\n` +
        `📦 <b>${deal.product_title}</b> ($${deal.product_price})\n` +
        `👤 Покупатель: @${deal.buyer_username}\n` +
        `👤 Продавец: @${deal.seller_username}\n` +
        `⚖️ Решение: <b>${outcomeText}</b>\n` +
        `💬 ${res.reason}`
      );
      await tg(deal.buyer_tg, userMsg);
      await tg(deal.seller_tg, userMsg);

      log('DISPUTE', `${deal.id} → ${res.decision}`);
    } catch (e) { console.error(`[AI:DISPUTE] ${deal.id}:`, e.message); }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. БАН ПОДОЗРИТЕЛЬНЫХ
// ─────────────────────────────────────────────────────────────────────────────

async function monitorSuspiciousUsers() {
  if (!isEnabled()) return;

  const h1 = Math.floor(Date.now() / 1000) - 3600;
  const h6 = Math.floor(Date.now() / 1000) - 21600;

  const suspicious = await queryAll(`
    SELECT u.id, u.username, u.telegram_id, u.created_at,
      u.total_sales, u.total_purchases, u.rating, u.review_count, u.is_verified,
      (SELECT COUNT(*) FROM security_logs sl WHERE sl.user_id=u.id AND sl.event='LOGIN_FAIL' AND sl.created_at>=$1) as failed_logins,
      (SELECT COUNT(*) FROM deals d WHERE (d.buyer_id=u.id OR d.seller_id=u.id) AND d.status='disputed') as total_disputes,
      (SELECT COUNT(*) FROM deals d WHERE (d.buyer_id=u.id OR d.seller_id=u.id) AND d.status='disputed' AND d.created_at>=$2) as recent_disputes,
      (SELECT COUNT(*) FROM products p2 WHERE p2.seller_id=u.id AND p2.status='deleted') as deleted_products
    FROM users u
    WHERE u.is_banned=0 AND u.password IS NOT NULL
    HAVING
      (SELECT COUNT(*) FROM security_logs sl WHERE sl.user_id=u.id AND sl.event='LOGIN_FAIL' AND sl.created_at>=$1) > 10
      OR (SELECT COUNT(*) FROM deals d WHERE (d.buyer_id=u.id OR d.seller_id=u.id) AND d.status='disputed' AND d.created_at>=$2) >= 3
      OR (SELECT COUNT(*) FROM products p2 WHERE p2.seller_id=u.id AND p2.status='deleted') >= 3
    LIMIT 5
  `, [h1, h6]);

  for (const u of suspicious) {
    try {
      const age = Math.floor((Date.now() / 1000 - u.created_at) / 86400);
      const res = parseJSON(await askClaude(
        `Ты офицер безопасности маркетплейса. Реши: BAN или OK.
При сомнениях — OK.

Отвечай ТОЛЬКО JSON:
{"decision":"BAN","hours":24,"reason":"причина"}
{"decision":"OK","reason":"почему оставить"}`,
        `@${u.username} (аккаунт ${age} дн.) | Продаж: ${u.total_sales} | Покупок: ${u.total_purchases}
Рейтинг: ${u.rating} (${u.review_count} отзывов) | Верифицирован: ${u.is_verified ? 'да' : 'нет'}
Неудачных входов за час: ${u.failed_logins}
Споров всего: ${u.total_disputes} | За 6ч: ${u.recent_disputes}
Удалено AI-модерацией: ${u.deleted_products}`, 200));

      if (!res) continue;

      if (res.decision === 'BAN') {
        const bannedUntil = res.hours ? Math.floor(Date.now() / 1000) + res.hours * 3600 : null;
        await run(`UPDATE users SET is_banned=1, banned_until=$1, ban_reason=$2 WHERE id=$3`,
          [bannedUntil, `AI: ${res.reason}`, u.id]);

        await notify(
          `🤖 <b>Безопасность — БАН</b>\n\n👤 @${u.username}\n⏱ ${res.hours ? res.hours + ' часов' : 'навсегда'}\n❌ ${res.reason}\n\n📊 Входов: ${u.failed_logins}/ч | Споров: ${u.recent_disputes}/6ч | Удалено товаров: ${u.deleted_products}`,
          u.telegram_id,
          `🚫 <b>Аккаунт заблокирован</b>\n\nСрок: <b>${res.hours ? res.hours + ' часов' : 'навсегда'}</b>\nПричина: ${res.reason}`
        );
        log('BAN', `@${u.username}: ${res.reason}`);
      } else {
        await notify(`🤖 <b>Безопасность — OK</b>\n\n👤 @${u.username}\n✅ ${res.reason}`);
        log('BAN', `@${u.username} — OK: ${res.reason}`);
      }
    } catch (e) { console.error(`[AI:BAN] ${u.id}:`, e.message); }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. МОНИТОРИНГ АНОМАЛИЙ
// ─────────────────────────────────────────────────────────────────────────────

async function monitorAnomalies() {
  if (!isEnabled()) return;

  const h1  = Math.floor(Date.now() / 1000) - 3600;
  const h24 = Math.floor(Date.now() / 1000) - 86400;
  const h48 = Math.floor(Date.now() / 1000) - 172800;
  try {
    const [regHour, regYest, dealsHour, dealsYest, revToday, revYest, failed] = await Promise.all([
      queryOne(`SELECT COUNT(*) as c FROM users WHERE created_at >= $1`, [h1]),
      queryOne(`SELECT COUNT(*) as c FROM users WHERE created_at BETWEEN $1 AND $2`, [h48, h24]),
      queryOne(`SELECT COUNT(*) as c FROM deals WHERE created_at >= $1`, [h1]),
      queryOne(`SELECT COUNT(*) as c FROM deals WHERE created_at BETWEEN $1 AND $2`, [h48, h24]),
      queryOne(`SELECT COALESCE(SUM(amount),0) as t FROM transactions WHERE type='commission' AND status='completed' AND created_at >= $1`, [h24]),
      queryOne(`SELECT COALESCE(SUM(amount),0) as t FROM transactions WHERE type='commission' AND status='completed' AND created_at BETWEEN $1 AND $2`, [h48, h24]),
      queryOne(`SELECT COUNT(*) as c FROM security_logs WHERE event='LOGIN_FAIL' AND created_at >= $1`, [h1]),
    ]);

    const alerts = [];
    if (parseInt(regHour.c) > (parseInt(regYest.c) || 1) * 5 && parseInt(regHour.c) > 10)
      alerts.push(`🚨 Регистраций за час: <b>${regHour.c}</b> (обычно ~${regYest.c}) — возможная атака ботов`);
    if (parseInt(dealsYest.c) > 5 && parseInt(dealsHour.c) < parseInt(dealsYest.c) * 0.3)
      alerts.push(`📉 Продажи упали: <b>${dealsHour.c}</b> за час (обычно ~${dealsYest.c})`);
    if (parseInt(failed.c) > 50)
      alerts.push(`🔐 Брутфорс: <b>${failed.c}</b> неудачных входов за час`);
    const rn = parseFloat(revToday.t), ry = parseFloat(revYest.t);
    if (ry > 10 && rn < ry * 0.5)
      alerts.push(`💸 Доход за 24ч: <b>$${rn.toFixed(2)}</b> (вчера: $${ry.toFixed(2)}) — падение ${Math.round((1-rn/ry)*100)}%`);

    if (alerts.length) {
      await tg(process.env.REPORT_CHAT_ID, `⚠️ <b>AI Алерты</b>\n\n${alerts.join('\n\n')}`);
      log('ANOMALY', `${alerts.length} алертов`);
    }
  } catch (e) { console.error('[AI:ANOMALY]', e.message); }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. РЕАКТИВАЦИЯ НЕАКТИВНЫХ
// ─────────────────────────────────────────────────────────────────────────────

async function reactivateUsers() {
  if (!isEnabled()) return;

  const d14 = Math.floor(Date.now() / 1000) - 1209600;
  const d28 = Math.floor(Date.now() / 1000) - 2419200;

  const inactive = await queryAll(`
    SELECT u.id, u.username, u.first_name, u.telegram_id, u.total_purchases, u.balance
    FROM users u
    WHERE u.telegram_id IS NOT NULL AND u.is_banned=0
      AND u.last_active BETWEEN $1 AND $2
      AND (u.ai_reactivated IS NULL OR u.ai_reactivated=0)
    LIMIT 10
  `, [d28, d14]);

  for (const u of inactive) {
    try {
      const fav = await queryOne(`
        SELECT p.category FROM deals d JOIN products p ON p.id=d.product_id
        WHERE d.buyer_id=$1 GROUP BY p.category ORDER BY COUNT(*) DESC LIMIT 1
      `, [u.id]);
      let hotProduct = null;
      if (fav) hotProduct = await queryOne(
        `SELECT title, price FROM products WHERE category=$1 AND status='active' ORDER BY views DESC LIMIT 1`,
        [fav.category]
      );

      const name = u.first_name || u.username || 'друг';
      let userMsg = `👋 <b>Привет, ${name}!</b>\n\nДавно не видели тебя на Minions Market.\n\n`;
      if (hotProduct) userMsg += `🔥 Сейчас популярно: <b>${hotProduct.title}</b> за $${hotProduct.price}\n\n`;
      if (parseFloat(u.balance) > 0) userMsg += `💰 На балансе: <b>$${parseFloat(u.balance).toFixed(2)}</b>\n\n`;
      userMsg += `Заходи, много новых товаров! 🟡`;

      // Сначала тебе, потом юзеру
      await notify(
        `🤖 <b>Реактивация</b>\n\n👤 @${u.username}\n📅 Неактивен 14-28 дней\n💰 Баланс: $${parseFloat(u.balance).toFixed(2)}\n📤 Сообщение отправлено`,
        u.telegram_id,
        userMsg
      );
      await run(`UPDATE users SET ai_reactivated=1 WHERE id=$1`, [u.id]);
      log('REACTIVATE', `@${u.username}`);
    } catch (e) { console.error(`[AI:REACTIVATE]`, e.message); }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. ПОЗДРАВЛЕНИЯ
// ─────────────────────────────────────────────────────────────────────────────

async function sendCongratulations() {
  if (!isEnabled()) return;

  const h1 = Math.floor(Date.now() / 1000) - 3600;

  const firstSales = await queryAll(`
    SELECT u.username, u.first_name, u.telegram_id, d.amount
    FROM deals d JOIN users u ON u.id=d.seller_id
    WHERE d.status='completed' AND d.updated_at>=$1 AND u.total_sales=1 AND u.telegram_id IS NOT NULL
    LIMIT 5
  `, [h1]);

  for (const u of firstSales) {
    const earned = (parseFloat(u.amount) * 0.95).toFixed(2);
    await notify(
      `🤖 <b>Поздравление отправлено</b>\n\n👤 @${u.username}\n🎉 Первая продажа! Заработал $${earned}`,
      u.telegram_id,
      `🎉 <b>Поздравляем с первой продажей!</b>\n\nВы заработали <b>$${earned}</b>!\n\nЭто только начало — добавляйте ещё товары. 🚀`
    );
    log('CONGRATS', `Первая продажа @${u.username}`);
  }

  const firstBuys = await queryAll(`
    SELECT u.username, u.first_name, u.telegram_id, p.title as product_title
    FROM deals d JOIN users u ON u.id=d.buyer_id JOIN products p ON p.id=d.product_id
    WHERE d.created_at>=$1 AND u.total_purchases=1 AND u.telegram_id IS NOT NULL
    LIMIT 5
  `, [h1]);

  for (const u of firstBuys) {
    await notify(
      `🤖 <b>Поздравление отправлено</b>\n\n👤 @${u.username}\n🛒 Первая покупка: ${u.product_title}`,
      u.telegram_id,
      `🛒 <b>Добро пожаловать в Minions Market!</b>\n\nВы купили: <b>${u.product_title}</b>\n\nВаши деньги в безопасности до подтверждения. Если вопросы — напишите нам! 🟡`
    );
    log('CONGRATS', `Первая покупка @${u.username}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. ЕЖЕНЕДЕЛЬНЫЙ ПРОГНОЗ
// ─────────────────────────────────────────────────────────────────────────────

async function weeklyForecast() {
  if (!isEnabled()) return;
  try {
    const now = Math.floor(Date.now() / 1000);
    const weeks = await Promise.all([0,1,2,3].map(i => queryOne(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE created_at BETWEEN $1 AND $2) as new_users,
        (SELECT COUNT(*) FROM deals WHERE created_at BETWEEN $1 AND $2) as deals,
        (SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='commission' AND status='completed' AND created_at BETWEEN $1 AND $2) as revenue
    `, [now-(i+1)*604800, now-i*604800])));

    const data = weeks.reverse().map((w, i) => ({
      week: `Неделя -${3-i}`,
      users: parseInt(w.new_users)||0,
      deals: parseInt(w.deals)||0,
      revenue: parseFloat(w.revenue).toFixed(2),
    }));

    const forecast = await askClaude(
      `Ты финансовый аналитик игрового маркетплейса. Проанализируй тренд и дай прогноз на следующую неделю. Назови ожидаемые цифры. Максимум 5 предложений.`,
      data.map(w => `${w.week}: ${w.users} новых пользователей, ${w.deals} сделок, $${w.revenue}`).join('\n'),
      400
    );

    const trend = parseFloat(data[3].revenue) > parseFloat(data[0].revenue) ? '📈' : '📉';
    await tg(process.env.REPORT_CHAT_ID,
      `🤖 <b>Еженедельный AI-прогноз</b> ${trend}\n\n` +
      data.map(w => `${w.week}: ${w.deals} сделок, $${w.revenue}`).join('\n') +
      `\n\n<b>Прогноз:</b>\n${forecast}`
    );
    log('FORECAST', 'Отправлен');
  } catch (e) { console.error('[AI:FORECAST]', e.message); }
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. ПОДДЕРЖКА ПОЛЬЗОВАТЕЛЕЙ
// ─────────────────────────────────────────────────────────────────────────────

async function handleUserQuestion(telegramId, question) {
  try {
    const user = await queryOne(
      `SELECT username, balance, total_sales, total_purchases FROM users WHERE telegram_id=$1`,
      [String(telegramId)]
    );
    const ctx = user
      ? `Пользователь: @${user.username}, баланс: $${parseFloat(user.balance).toFixed(2)}, продаж: ${user.total_sales}, покупок: ${user.total_purchases}\n\n`
      : '';

    // Уведомляем тебя о каждом входящем вопросе
    await tg(process.env.REPORT_CHAT_ID,
      `💬 <b>Вопрос пользователя</b>\n\n👤 ${user ? '@' + user.username : `TG:${telegramId}`}\n❓ ${question}`
    );

    const answer = await askClaude(
      `Ты дружелюбный помощник игрового маркетплейса Minions Market. Отвечай кратко по-русски.

О платформе: продажа игровых товаров, комиссия 5%, безопасные сделки через эскроу, автозавершение 72ч, пополнение через Rukassa и CryptoCloud.
Регистрация: /code [логин] | Сброс пароля: /reset [логин]

Если вопрос о конкретной сделке — скажи писать в чат сделки на сайте.
Максимум 3-4 предложения.`,
      ctx + `Вопрос: ${question}`, 400
    );

    // Уведомляем тебя об ответе ИИ
    await tg(process.env.REPORT_CHAT_ID,
      `🤖 <b>AI ответил</b>\n\n👤 ${user ? '@' + user.username : `TG:${telegramId}`}\n💬 ${answer}`
    );

    return answer;
  } catch (e) {
    console.error('[AI:SUPPORT]', e.message);
    return 'Извините, произошла ошибка. Попробуйте позже.';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Миграция БД
// ─────────────────────────────────────────────────────────────────────────────

async function migrate() {
  try {
    await run(`ALTER TABLE products ADD COLUMN IF NOT EXISTS ai_moderated     INTEGER DEFAULT 0`);
    await run(`ALTER TABLE products ADD COLUMN IF NOT EXISTS ai_price_advised  INTEGER DEFAULT 0`);
    await run(`ALTER TABLE users    ADD COLUMN IF NOT EXISTS ai_reactivated    INTEGER DEFAULT 0`);
    console.log('[AI Admin] Миграция выполнена');
  } catch (e) { console.error('[AI Admin] Миграция:', e.message); }
}

// ─────────────────────────────────────────────────────────────────────────────
// ЗАПУСК
// ─────────────────────────────────────────────────────────────────────────────

async function init() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[AI Admin] ANTHROPIC_API_KEY не задан — AI Admin отключён');
    return;
  }
  await migrate();

  cron.schedule('*/10 * * * *', () => moderateProducts().catch(e => console.error('[AI:MOD]', e.message)));
  cron.schedule('*/5 * * * *',  () => resolveDisputes().catch(e => console.error('[AI:DISPUTE]', e.message)));
  cron.schedule('*/15 * * * *', () => monitorSuspiciousUsers().catch(e => console.error('[AI:BAN]', e.message)));
  cron.schedule('*/15 * * * *', () => monitorAnomalies().catch(e => console.error('[AI:ANOMALY]', e.message)));
  cron.schedule('0 * * * *',    () => monitorPrices().catch(e => console.error('[AI:PRICE]', e.message)));
  cron.schedule('0 * * * *',    () => autoPromoteTopSellers().catch(e => console.error('[AI:PROMOTE]', e.message)));
  cron.schedule('0 * * * *',    () => sendCongratulations().catch(e => console.error('[AI:CONGRATS]', e.message)));
  cron.schedule('0 10 * * *',   () => reactivateUsers().catch(e => console.error('[AI:REACTIVATE]', e.message)));
  cron.schedule('0 9 * * 1',    () => weeklyForecast().catch(e => console.error('[AI:FORECAST]', e.message)));

  console.log('[AI Admin] ULTRA запущен');
  await tg(process.env.REPORT_CHAT_ID,
    `🤖 <b>AI Admin ULTRA запущен</b>\n\n` +
    `✅ Модерация товаров — каждые 10 мин\n` +
    `✅ Разрешение споров — каждые 5 мин\n` +
    `✅ Мониторинг безопасности — каждые 15 мин\n` +
    `✅ Алерты аномалий — каждые 15 мин\n` +
    `✅ Мониторинг цен — каждый час\n` +
    `✅ Автопродвижение топ-продавцов — каждый час\n` +
    `✅ Поздравления — каждый час\n` +
    `✅ Реактивация пользователей — каждый день 10:00\n` +
    `✅ Еженедельный прогноз — каждый пн 09:00\n` +
    `✅ Поддержка пользователей — в реальном времени\n\n` +
    `Управление: /ai_off — выключить | /ai_on — включить | /ai_status — статус`
  );
}

module.exports = { init, handleUserQuestion, isEnabled, setEnabled };
