/**
 * ⏰ Hourly AI Report — Minions Market
 * 
 * Каждый час собирает статистику из БД, отправляет в Claude AI,
 * получает умный анализ и шлёт готовый отчёт в Telegram.
 * 
 * Подключение в server.js:
 *   require('./utils/hourlyReport');
 * 
 * Env переменные:
 *   ANTHROPIC_API_KEY   — ключ Claude AI (обязательно)
 *   REPORT_CHAT_ID      — Telegram chat_id куда слать отчёт (обязательно)
 *   TELEGRAM_BOT_TOKEN  — уже есть в проекте
 */

const https  = require('https');
const cron   = require('node-cron');
const { queryOne, queryAll } = require('../models/db');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Отправить сообщение в Telegram */
function sendTelegram(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return Promise.resolve();

  return new Promise((resolve) => {
    const body = JSON.stringify({
      chat_id: String(chatId),
      text,
      parse_mode: 'HTML',
    });
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${token}/sendMessage`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (r) => { r.resume(); resolve(); }
    );
    req.on('error', () => resolve());
    req.setTimeout(10000, () => { req.destroy(); resolve(); });
    req.write(body);
    req.end();
  });
}

/** Запрос к Claude AI */
function askClaude(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY не задан');

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    });

    const req = https.request(
      {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (r) => {
        let data = '';
        r.on('data', (d) => (data += d));
        r.on('end', () => {
          try {
            const json = JSON.parse(data);
            const text = json?.content?.[0]?.text || '';
            resolve(text);
          } catch (e) {
            reject(new Error('Claude API parse error: ' + e.message));
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Claude API timeout')); });
    req.write(body);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Сбор статистики из БД
// ─────────────────────────────────────────────────────────────────────────────

async function collectStats() {
  const now      = Math.floor(Date.now() / 1000);
  const hour1ago = now - 3600;   // 1 час назад
  const hour24ago = now - 86400; // 24 часа назад

  const [
    // Пользователи
    totalUsers,
    newUsersHour,
    activeUsersHour,
    bannedUsers,

    // Продукты
    totalProducts,
    newProductsHour,
    promotedProducts,

    // Сделки за час
    dealsHour,
    dealsCompleted24h,
    dealsDisputed24h,
    dealsPending,

    // Финансы за 24 часа
    revenue24h,
    deposits24h,
    topSellers,

    // Ошибки безопасности за час
    securityLogsHour,
    failedLogins,
  ] = await Promise.all([

    // Пользователи
    queryOne(`SELECT COUNT(*) as c FROM users WHERE password IS NOT NULL`),
    queryOne(`SELECT COUNT(*) as c FROM users WHERE created_at >= $1`, [hour1ago]),
    queryOne(`SELECT COUNT(*) as c FROM users WHERE last_active >= $1 AND password IS NOT NULL`, [hour1ago]),
    queryOne(`SELECT COUNT(*) as c FROM users WHERE is_banned = 1`),

    // Продукты
    queryOne(`SELECT COUNT(*) as c FROM products WHERE status = 'active'`),
    queryOne(`SELECT COUNT(*) as c FROM products WHERE created_at >= $1 AND status != 'deleted'`, [hour1ago]),
    queryOne(`SELECT COUNT(*) as c FROM products WHERE is_promoted = 1 AND status = 'active'`),

    // Сделки
    queryOne(`SELECT COUNT(*) as c, COALESCE(SUM(amount),0) as vol FROM deals WHERE created_at >= $1`, [hour1ago]),
    queryOne(`SELECT COUNT(*) as c FROM deals WHERE status = 'completed' AND updated_at >= $1`, [hour24ago]),
    queryOne(`SELECT COUNT(*) as c FROM deals WHERE status = 'disputed'`),
    queryOne(`SELECT COUNT(*) as c FROM deals WHERE status = 'pending'`),

    // Финансы
    queryOne(`SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE type='commission' AND status='completed' AND created_at >= $1`, [hour24ago]),
    queryOne(`SELECT COUNT(*) as c, COALESCE(SUM(amount),0) as vol FROM transactions WHERE type='deposit' AND status='completed' AND created_at >= $1`, [hour24ago]),

    // Топ продавцов за 24ч
    queryAll(`
      SELECT u.username, COUNT(d.id) as sales, COALESCE(SUM(d.seller_amount),0) as earned
      FROM deals d
      LEFT JOIN users u ON u.id = d.seller_id
      WHERE d.status = 'completed' AND d.updated_at >= $1
      GROUP BY u.username ORDER BY sales DESC LIMIT 3
    `, [hour24ago]),

    // Логи безопасности
    queryOne(`SELECT COUNT(*) as c FROM security_logs WHERE created_at >= $1`, [hour1ago]),
    queryOne(`SELECT COUNT(*) as c FROM security_logs WHERE event = 'ADMIN_LOGIN_FAIL' AND created_at >= $1`, [hour1ago]),
  ]);

  return {
    timestamp: new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }),
    users: {
      total:       parseInt(totalUsers.c),
      newThisHour: parseInt(newUsersHour.c),
      activeHour:  parseInt(activeUsersHour.c),
      banned:      parseInt(bannedUsers.c),
    },
    products: {
      active:      parseInt(totalProducts.c),
      newThisHour: parseInt(newProductsHour.c),
      promoted:    parseInt(promotedProducts.c),
    },
    deals: {
      newThisHour:    parseInt(dealsHour.c),
      volumeHour:     parseFloat(dealsHour.vol).toFixed(2),
      completed24h:   parseInt(dealsCompleted24h.c),
      disputed:       parseInt(dealsDisputed24h.c),
      pending:        parseInt(dealsPending.c),
    },
    finance: {
      revenue24h:     parseFloat(revenue24h.total).toFixed(2),
      deposits24hCount: parseInt(deposits24h.c),
      deposits24hVol:   parseFloat(deposits24h.vol).toFixed(2),
      topSellers:     topSellers.map(s => ({
        username: s.username || 'Unknown',
        sales:    parseInt(s.sales),
        earned:   parseFloat(s.earned).toFixed(2),
      })),
    },
    security: {
      logsHour:    parseInt(securityLogsHour.c),
      failedLogins: parseInt(failedLogins.c),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Генерация отчёта через Claude AI
// ─────────────────────────────────────────────────────────────────────────────

async function generateReport(stats) {
  const prompt = `Ты аналитик маркетплейса. Проанализируй данные и напиши КРАТКИЙ отчёт для администратора.

Данные за последний час (${stats.timestamp} МСК):

ПОЛЬЗОВАТЕЛИ:
- Всего зарегистрировано: ${stats.users.total}
- Новых за час: ${stats.users.newThisHour}
- Активных за час: ${stats.users.activeHour}
- Заблокированных: ${stats.users.banned}

ТОВАРЫ:
- Активных объявлений: ${stats.products.active}
- Новых за час: ${stats.products.newThisHour}
- На продвижении: ${stats.products.promoted}

СДЕЛКИ:
- Новых за час: ${stats.deals.newThisHour} (объём $${stats.deals.volumeHour})
- Завершено за 24ч: ${stats.deals.completed24h}
- Споров активных: ${stats.deals.disputed}
- Ожидают обработки: ${stats.deals.pending}

ФИНАНСЫ (24ч):
- Комиссия платформы: $${stats.finance.revenue24h}
- Пополнений: ${stats.finance.deposits24hCount} шт. на $${stats.finance.deposits24hVol}
${stats.finance.topSellers.length > 0 ? `- Топ продавцы: ${stats.finance.topSellers.map(s => `@${s.username} (${s.sales} сделок, $${s.earned})`).join(', ')}` : ''}

БЕЗОПАСНОСТЬ (час):
- Событий в логах: ${stats.security.logsHour}
- Неудачных входов в админку: ${stats.security.failedLogins}

Напиши анализ в 3-4 предложениях: что хорошо, что настораживает, на что обратить внимание. Будь конкретным. Без лишних слов.`;

  try {
    return await askClaude(prompt);
  } catch (e) {
    console.error('[HourlyReport] Claude API error:', e.message);
    return 'ИИ-анализ недоступен. Проверьте ANTHROPIC_API_KEY.';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Форматирование сообщения для Telegram
// ─────────────────────────────────────────────────────────────────────────────

function formatMessage(stats, aiAnalysis) {
  const topSellersText = stats.finance.topSellers.length > 0
    ? stats.finance.topSellers.map((s, i) => `  ${['🥇','🥈','🥉'][i]} @${s.username} — ${s.sales} сделок, $${s.earned}`).join('\n')
    : '  нет завершённых сделок';

  const disputeAlert = stats.deals.disputed > 0
    ? `\n⚠️ <b>Требуют внимания: ${stats.deals.disputed} спор(а)</b>` : '';

  const securityAlert = stats.security.failedLogins > 3
    ? `\n🚨 <b>Много попыток взлома админки: ${stats.security.failedLogins}</b>` : '';

  return `🟡 <b>MINIONS MARKET — Часовой отчёт</b>
🕐 ${stats.timestamp} МСК
${'─'.repeat(30)}

👥 <b>Пользователи</b>
• Всего: <b>${stats.users.total}</b>
• Новых за час: <b>${stats.users.newThisHour}</b>
• Активных за час: <b>${stats.users.activeHour}</b>
• Заблокированных: <b>${stats.users.banned}</b>

🛍 <b>Товары</b>
• Активных: <b>${stats.products.active}</b>
• Новых за час: <b>${stats.products.newThisHour}</b>
• На продвижении: <b>${stats.products.promoted}</b>

🤝 <b>Сделки</b>
• Новых за час: <b>${stats.deals.newThisHour}</b> ($${stats.deals.volumeHour})
• Завершено за 24ч: <b>${stats.deals.completed24h}</b>
• Споров: <b>${stats.deals.disputed}</b>
• В ожидании: <b>${stats.deals.pending}</b>

💰 <b>Финансы (24ч)</b>
• Комиссия платформы: <b>$${stats.finance.revenue24h}</b>
• Пополнений: <b>${stats.finance.deposits24hCount} шт.</b> на <b>$${stats.finance.deposits24hVol}</b>
• Топ продавцы:
${topSellersText}

🔐 <b>Безопасность (час)</b>
• Событий: <b>${stats.security.logsHour}</b>
• Неудачных входов: <b>${stats.security.failedLogins}</b>
${disputeAlert}${securityAlert}

${'─'.repeat(30)}
🤖 <b>ИИ-анализ:</b>
${aiAnalysis}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Главная функция отчёта
// ─────────────────────────────────────────────────────────────────────────────

async function sendHourlyReport() {
  const chatId = process.env.REPORT_CHAT_ID;
  if (!chatId) {
    console.warn('[HourlyReport] REPORT_CHAT_ID не задан — отчёт пропущен');
    return;
  }

  try {
    console.log('[HourlyReport] Генерирую отчёт...');

    const stats      = await collectStats();
    const aiAnalysis = await generateReport(stats);
    const message    = formatMessage(stats, aiAnalysis);

    await sendTelegram(chatId, message);
    console.log('[HourlyReport] ✅ Отчёт отправлен в Telegram');
  } catch (e) {
    console.error('[HourlyReport] ❌ Ошибка:', e.message);

    // Отправить хотя бы уведомление об ошибке
    try {
      await sendTelegram(
        chatId,
        `❌ <b>Ошибка генерации отчёта</b>\n\n<code>${e.message}</code>`
      );
    } catch (_) {}
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Запуск cron — каждый час в 00 минут
// ─────────────────────────────────────────────────────────────────────────────

cron.schedule('0 * * * *', () => {
  sendHourlyReport().catch(e => console.error('[HourlyReport] Cron error:', e.message));
});

console.log('✅ Hourly Report scheduler запущен (каждый час)');

module.exports = { sendHourlyReport };
