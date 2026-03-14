/**
 * 🔍 Site Monitor — Minions Market
 *
 * Запускается 3 раза в день (08:00, 14:00, 20:00)
 * Проверяет сайт на ошибки и отправляет AI-анализ в Telegram
 *
 * Что проверяет:
 *  1. Доступность сайта и API эндпоинтов
 *  2. Время ответа сервера
 *  3. Ошибки в security_logs за последние 8 часов
 *  4. Зависшие сделки и транзакции
 *  5. Состояние БД
 *  6. AI анализирует всё и пишет что нужно починить
 */

'use strict';

const https  = require('https');
const http   = require('http');
const cron   = require('node-cron');
const { queryOne, queryAll } = require('../models/db');

// ─────────────────────────────────────────────────────────────────────────────
// Утилиты
// ─────────────────────────────────────────────────────────────────────────────

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

function askClaude(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Promise.resolve('ANTHROPIC_API_KEY не задан');
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
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
        catch(e) { resolve('Ошибка парсинга ответа Claude'); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Claude timeout')); });
    req.write(body);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Проверка HTTP эндпоинтов
// ─────────────────────────────────────────────────────────────────────────────

function checkEndpoint(url, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const start   = Date.now();
    const lib     = url.startsWith('https') ? https : http;
    const timeout = setTimeout(() => {
      resolve({ ok: false, status: 0, ms: Date.now() - start, error: 'Timeout' });
    }, timeoutMs);

    const req = lib.get(url, (res) => {
      clearTimeout(timeout);
      res.resume();
      resolve({
        ok:     res.statusCode >= 200 && res.statusCode < 400,
        status: res.statusCode,
        ms:     Date.now() - start,
        error:  null,
      });
    });
    req.on('error', (e) => {
      clearTimeout(timeout);
      resolve({ ok: false, status: 0, ms: Date.now() - start, error: e.message });
    });
  });
}

async function checkEndpoints() {
  const baseUrl = process.env.BACKEND_URL || 'http://localhost:5000';
  const endpoints = [
    { name: 'Health check',  url: `${baseUrl}/api/health` },
    { name: 'Главная',       url: `${baseUrl}/` },
    { name: 'Каталог API',   url: `${baseUrl}/api/products?limit=1` },
    { name: 'Категории API', url: `${baseUrl}/api/categories` },
  ];

  const results = [];
  for (const ep of endpoints) {
    const result = await checkEndpoint(ep.url);
    results.push({ ...ep, ...result });
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Проверка БД и данных
// ─────────────────────────────────────────────────────────────────────────────

async function checkDatabase() {
  const issues = [];
  const now    = Math.floor(Date.now() / 1000);
  const h8     = now - 28800;  // 8 часов назад
  const h24    = now - 86400;

  try {
    // Проверка соединения с БД
    const dbCheck = await queryOne(`SELECT 1 as ok`);
    if (!dbCheck) issues.push('❌ БД не отвечает!');

    // Зависшие транзакции (pending больше 24 часов)
    const stuckTx = await queryOne(
      `SELECT COUNT(*) as c FROM transactions WHERE status='pending' AND created_at < $1`,
      [h24]
    );
    if (parseInt(stuckTx.c) > 0) {
      issues.push(`⚠️ ${stuckTx.c} транзакций зависли в статусе pending > 24ч`);
    }

    // Сделки в статусе disputed без движения > 24ч
    const stuckDisputes = await queryOne(
      `SELECT COUNT(*) as c FROM deals WHERE status='disputed' AND updated_at < $1`,
      [h24]
    );
    if (parseInt(stuckDisputes.c) > 0) {
      issues.push(`⚠️ ${stuckDisputes.c} споров без движения > 24ч — требуют внимания`);
    }

    // Пользователи с отрицательным балансом
    const negBalance = await queryOne(
      `SELECT COUNT(*) as c FROM users WHERE balance < 0`
    );
    if (parseInt(negBalance.c) > 0) {
      issues.push(`🚨 ${negBalance.c} пользователей с отрицательным балансом!`);
    }

    // Товары в статусе frozen > 7 дней (сделка не завершается)
    const frozenProducts = await queryOne(
      `SELECT COUNT(*) as c FROM products WHERE status='frozen' AND updated_at < $1`,
      [now - 604800]
    );
    if (parseInt(frozenProducts.c) > 0) {
      issues.push(`⚠️ ${frozenProducts.c} товаров заморожены > 7 дней`);
    }

    // Много ошибок в security_logs за 8 часов
    const secErrors = await queryOne(
      `SELECT COUNT(*) as c FROM security_logs WHERE event IN ('login_fail','admin_login_fail') AND created_at >= $1`,
      [h8]
    );
    if (parseInt(secErrors.c) > 20) {
      issues.push(`🔐 ${secErrors.c} неудачных попыток входа за 8 часов — возможная атака`);
    }

    // Статистика
    const stats = await queryOne(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE password IS NOT NULL) as users,
        (SELECT COUNT(*) FROM products WHERE status='active') as products,
        (SELECT COUNT(*) FROM deals WHERE status='active') as active_deals,
        (SELECT COUNT(*) FROM deals WHERE status='pending') as pending_deals,
        (SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='commission' AND status='completed' AND created_at >= $1) as revenue_8h
    `, [h8]);

    return { issues, stats, ok: issues.length === 0 };
  } catch(e) {
    return { issues: [`❌ Ошибка проверки БД: ${e.message}`], stats: null, ok: false };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Проверка логов на ошибки
// ─────────────────────────────────────────────────────────────────────────────

async function checkLogs() {
  const h8  = Math.floor(Date.now() / 1000) - 28800;
  const issues = [];

  try {
    // Частые ошибки с одного IP
    const suspiciousIps = await queryAll(`
      SELECT ip, COUNT(*) as attempts
      FROM security_logs
      WHERE event = 'login_fail' AND created_at >= $1
      GROUP BY ip
      HAVING COUNT(*) > 10
      ORDER BY attempts DESC
      LIMIT 5
    `, [h8]);

    if (suspiciousIps.length > 0) {
      issues.push(`🚨 Подозрительные IP за 8ч:\n${suspiciousIps.map(r => `  ${r.ip}: ${r.attempts} попыток`).join('\n')}`);
    }

    // Заблокированные доступы
    const bannedAccess = await queryOne(
      `SELECT COUNT(*) as c FROM security_logs WHERE event='banned_access' AND created_at >= $1`,
      [h8]
    );
    if (parseInt(bannedAccess.c) > 5) {
      issues.push(`🚫 ${bannedAccess.c} попыток входа с заблокированных аккаунтов за 8ч`);
    }

    return { issues };
  } catch(e) {
    return { issues: [`Ошибка чтения логов: ${e.message}`] };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Главная функция мониторинга
// ─────────────────────────────────────────────────────────────────────────────

async function runMonitor() {
  const chatId = process.env.REPORT_CHAT_ID;
  if (!chatId) return;

  const startTime = Date.now();
  console.log('[Monitor] Запуск проверки сайта...');

  try {
    // Параллельно проверяем всё
    const [endpoints, dbResult, logsResult] = await Promise.all([
      checkEndpoints(),
      checkDatabase(),
      checkLogs(),
    ]);

    const totalMs   = Date.now() - startTime;
    const allIssues = [...dbResult.issues, ...logsResult.issues];
    const endpointIssues = endpoints.filter(e => !e.ok);
    const slowEndpoints  = endpoints.filter(e => e.ok && e.ms > 3000);

    // Добавляем проблемы с эндпоинтами
    endpointIssues.forEach(e => {
      allIssues.unshift(`❌ ${e.name} недоступен (${e.status || e.error})`);
    });
    slowEndpoints.forEach(e => {
      allIssues.push(`🐢 ${e.name} отвечает медленно: ${e.ms}ms`);
    });

    const hasIssues = allIssues.length > 0;
    const status    = hasIssues ? '⚠️ НАЙДЕНЫ ПРОБЛЕМЫ' : '✅ ВСЁ РАБОТАЕТ';

    // Формируем отчёт
    const endpointReport = endpoints.map(e =>
      `${e.ok ? '✅' : '❌'} ${e.name}: ${e.ok ? e.ms + 'ms' : e.error || e.status}`
    ).join('\n');

    let report = `🔍 <b>Мониторинг сайта</b> — ${status}\n`;
    report += `🕐 ${new Date().toLocaleString('ru', { timeZone:'Europe/Moscow' })} МСК\n`;
    report += `⏱ Проверка заняла: ${totalMs}ms\n\n`;

    report += `<b>Эндпоинты:</b>\n${endpointReport}\n\n`;

    if (dbResult.stats) {
      report += `<b>БД:</b>\n`;
      report += `👥 Юзеров: ${dbResult.stats.users}\n`;
      report += `📦 Активных товаров: ${dbResult.stats.products}\n`;
      report += `🤝 Активных сделок: ${dbResult.stats.active_deals}\n`;
      report += `💰 Доход за 8ч: $${parseFloat(dbResult.stats.revenue_8h).toFixed(2)}\n\n`;
    }

    if (hasIssues) {
      report += `<b>⚠️ Проблемы (${allIssues.length}):</b>\n`;
      report += allIssues.join('\n') + '\n\n';

      // AI анализирует проблемы и даёт рекомендации
      try {
        const aiAnalysis = await askClaude(
          `Ты DevOps инженер Node.js/PostgreSQL приложения. Проанализируй проблемы и дай конкретные рекомендации что проверить и как починить. Максимум 5 пунктов, кратко.\n\nПроблемы:\n${allIssues.join('\n')}\n\nАдрес сайта: ${process.env.BACKEND_URL}`
        );
        report += `<b>🤖 AI рекомендации:</b>\n${aiAnalysis}`;
      } catch(e) {
        report += `<b>🤖 AI:</b> Не удалось получить рекомендации`;
      }
    } else {
      report += `<b>🤖 AI:</b> Сайт работает стабильно, проблем не обнаружено.`;
    }

    await tg(chatId, report);
    console.log(`[Monitor] Проверка завершена. Проблем: ${allIssues.length}`);

  } catch(e) {
    console.error('[Monitor] Ошибка:', e.message);
    await tg(chatId, `🔍 <b>Мониторинг</b>\n\n❌ Ошибка проверки: <code>${e.message}</code>`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Запуск — 3 раза в день: 08:00, 14:00, 20:00 (МСК = UTC+3)
// ─────────────────────────────────────────────────────────────────────────────

// 05:00, 11:00, 17:00 UTC = 08:00, 14:00, 20:00 МСК
cron.schedule('0 5,11,17 * * *', () => {
  runMonitor().catch(e => console.error('[Monitor] Cron error:', e.message));
});

console.log('✅ Site Monitor запущен (08:00, 14:00, 20:00 МСК)');

module.exports = { runMonitor };
