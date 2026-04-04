require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const path      = require('path');
const rateLimit = require('express-rate-limit');
const cron      = require('node-cron');

const app = express();
app.set('trust proxy', 1);

// ── Блокировка IP ─────────────────────────────────────────────────────────────
const getBlockedIps = () => (process.env.BLOCKED_IPS || '').split(',').map(s => s.trim()).filter(Boolean);

// Автобан в памяти (сбрасывается при рестарте, постоянные — в BLOCKED_IPS)
const autoBannedIps = new Map(); // ip -> { until, reason }

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['cf-connecting-ip']
    || req.socket?.remoteAddress
    || '';
}

function autoBanIp(ip, minutes, reason) {
  autoBannedIps.set(ip, { until: Date.now() + minutes * 60000, reason });
  console.warn(`[SECURITY] Автобан IP ${ip} на ${minutes} мин: ${reason}`);
  // Уведомляем админа
  try {
    const { sendTg } = require('./utils/notify');
    if (process.env.REPORT_CHAT_ID) {
      sendTg(process.env.REPORT_CHAT_ID,
        `🔴 <b>Автобан IP</b>\n\nIP: <code>${ip}</code>\nПричина: ${reason}\nСрок: ${minutes} минут`
      ).catch(() => {});
    }
  } catch(e) {}
}

// SQL-инъекции и известные паттерны атак
const ATTACK_PATTERNS = [
  /(OR|AND)\s+[\d\w'"]+\s*=\s*[\d\w'"]+/i,  // OR 1=1, AND 'a'='a'
  /union\s+select/i,
  /select\s+.+\s+from/i,
  /insert\s+into/i,
  /drop\s+table/i,
  /exec\s*\(/i,
  /script\s*>/i,                                        // XSS
  /<\s*script/i,
  /javascript\s*:/i,
  /\/etc\/passwd/i,                                     // Path traversal
  /\.\.\/\.\.\/\.\.\//,
  /eval\s*\(/i,
  /base64_decode/i,
  /wp-admin|phpmyadmin|\.env|\.git\/config/i,           // Сканирование
];

function containsAttack(str) {
  if (!str || typeof str !== 'string') return false;
  return ATTACK_PATTERNS.some(p => p.test(str));
}

function checkForAttacks(obj, depth = 0) {
  if (depth > 5) return false;
  if (typeof obj === 'string') return containsAttack(obj);
  if (typeof obj === 'object' && obj !== null) {
    return Object.values(obj).some(v => checkForAttacks(v, depth + 1));
  }
  return false;
}

// Главный middleware защиты
app.use((req, res, next) => {
  const ip = getClientIp(req);

  // 1. Постоянный бан из переменной окружения
  if (getBlockedIps().includes(ip)) {
    console.warn(`[BLOCKED] IP ${ip}: ${req.method} ${req.path}`);
    return res.status(403).end();
  }

  // 2. Автобан в памяти
  const ban = autoBannedIps.get(ip);
  if (ban) {
    if (ban.until > Date.now()) {
      return res.status(403).end();
    }
    autoBannedIps.delete(ip);
  }

  // 3. Honeypot — кто лезет в /wp-admin, /phpmyadmin и т.д. — бан навсегда в памяти
  const honeypotPaths = ['/wp-admin', '/wp-login', '/phpmyadmin', '/.env', '/.git', '/admin.php', '/xmlrpc.php'];
  if (honeypotPaths.some(p => req.path.startsWith(p))) {
    autoBanIp(ip, 1440, `Honeypot: ${req.path}`); // 24 часа
    return res.status(404).end();
  }

  // 4. Проверка на SQL-инъекции и XSS во всех входящих данных
  const toCheck = [
    req.path,
    JSON.stringify(req.query),
    JSON.stringify(req.body),
  ].join(' ');

  if (containsAttack(toCheck)) {
    autoBanIp(ip, 60, `Атака: ${req.method} ${req.path}`);
    console.error(`[ATTACK] IP ${ip}: ${req.method} ${req.path} | body: ${JSON.stringify(req.body)?.slice(0, 200)}`);
    return res.status(403).json({ error: 'Forbidden' });
  }

  next();
});

const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:3000'];

app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? allowedOrigins : true,
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false }));
app.use('/api/auth/', rateLimit({ windowMs: 15 * 60 * 1000, max: 30 }));
app.use('/api/wallet/deposit', rateLimit({ windowMs: 60 * 1000, max: 10 }));

// ── Верификация домена для платёжных систем и поисковиков ────────────────────

// LAVA верификация
// Добавь на Railway: LAVA_VERIFY_FILENAME и LAVA_VERIFY_TOKEN
app.get('/:file([a-z0-9_\-]+\.html)', (req, res) => {
  const filename = req.params.file;

  // Яндекс Вебмастер: yandex_XXXXXX.html
  // Добавь на Railway: YANDEX_VERIFY_TOKEN=6ad530c6b0deaddf
  const yandexToken = process.env.YANDEX_VERIFY_TOKEN || '';
  if (yandexToken && filename === `yandex_${yandexToken}.html`) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(`<html><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"></head><body>Verification: ${yandexToken}</body></html>`);
  }

  // Google Search Console: googleXXXXXX.html
  // Добавь на Railway: GOOGLE_VERIFY_TOKEN=ваш_токен
  const googleToken = process.env.GOOGLE_VERIFY_TOKEN || '';
  if (googleToken && filename === `google${googleToken}.html`) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(`google-site-verification: google${googleToken}.html`);
  }

  // LAVA верификация
  const lavaExpected = process.env.LAVA_VERIFY_FILENAME || '';
  const lavaToken    = process.env.LAVA_VERIFY_TOKEN    || '';
  if (lavaExpected && lavaToken && filename === lavaExpected) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(lavaToken);
  }

  res.status(404).send('Not found');
});

// ── Routes ─────────────────────────────────────────────────────────────────────
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/products',   require('./routes/products'));
app.use('/api/deals',      require('./routes/deals'));
app.use('/api/wallet',     require('./routes/wallet'));
app.use('/api/users',      require('./routes/users'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/admin',      require('./routes/admin'));
app.use('/api/referral',   require('./routes/referral'));
app.use('/api/messages',   require('./routes/messages'));

app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// ── Telegram bot (webhook mode) ───────────────────────────────────────────────
const { getBot, handleUpdate } = require('./utils/bot');

app.post('/api/tg-webhook/:token', (req, res) => {
  res.sendStatus(200);
  if (req.params.token !== process.env.TELEGRAM_BOT_TOKEN) return;
  handleUpdate(req.body).catch(e => {
    // ECONNRESET — Telegram закрыл соединение, не критично
    if (e.code === 'ECONNRESET' || e.message?.includes('ECONNRESET')) return;
    console.error('[Webhook] error:', e.message);
  });
});

// Инициализация Telegram бота
console.log('[ENV] TELEGRAM_BOT_TOKEN:', process.env.TELEGRAM_BOT_TOKEN ? 'SET (' + process.env.TELEGRAM_BOT_TOKEN.slice(0,10) + '...)' : 'NOT SET');
console.log('[ENV] BACKEND_URL:', process.env.BACKEND_URL || 'NOT SET');
if (process.env.TELEGRAM_BOT_TOKEN) {
  console.log('[Bot] Token found, initializing in 2s...');
  setTimeout(() => getBot(), 2000);
} else {
  console.log('[Bot] TELEGRAM_BOT_TOKEN not set, skipping bot init');
}

// ── Static frontend ────────────────────────────────────────────────────────────
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendDist));
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(frontendDist, 'index.html'));
  }
});

// ── Cron jobs ─────────────────────────────────────────────────────────────────
const { completeDeal } = require('./routes/deals');
const { queryAll, run } = require('./models/db');

cron.schedule('*/15 * * * *', async () => {
  try {
    const now     = Math.floor(Date.now() / 1000);
    const expired = await queryAll(
      `SELECT * FROM deals WHERE status = 'active' AND auto_complete_at IS NOT NULL AND auto_complete_at <= $1`,
      [now]
    );
    if (expired.length) console.log(`[Cron] Auto-completing ${expired.length} deal(s)`);
    for (const deal of expired) {
      try { await completeDeal(deal, 'auto'); }
      catch (e) { console.error(`[Cron] Deal ${deal.id} error:`, e.message); }
    }
  } catch (e) { console.error('[Cron] Error:', e.message); }
});

cron.schedule('0 * * * *', async () => {
  try {
    const now = Math.floor(Date.now() / 1000);
    await run(`UPDATE users SET is_banned = 0, banned_until = NULL WHERE is_banned = 1 AND banned_until IS NOT NULL AND banned_until <= $1`, [now]);
    await run(`UPDATE products SET is_promoted = 0, promoted_until = NULL WHERE is_promoted = 1 AND promoted_until IS NOT NULL AND promoted_until <= $1`, [now]);
  } catch (e) { console.error('[Cron] Error:', e.message); }
});

// ── Hourly AI Report → Telegram ───────────────────────────────────────────────
require('./utils/hourlyReport');

// ── Site Monitor (3 раза в день) ─────────────────────────────────────────────
require('./utils/monitor');

// ── Init DB then start ────────────────────────────────────────────────────────
const { initSchema } = require('./models/db');
const PORT = process.env.PORT || 5000;

initSchema()
  .then(async () => {
    // Миграция колонок для AI Admin (выполняется автоматически при каждом старте)
    await run(`ALTER TABLE products ADD COLUMN IF NOT EXISTS ai_moderated    INTEGER DEFAULT 0`).catch(() => {});
    await run(`ALTER TABLE messages  ADD COLUMN IF NOT EXISTS image           TEXT DEFAULT NULL`).catch(() => {});
    await run(`ALTER TABLE users    ADD COLUMN IF NOT EXISTS seller_level    TEXT DEFAULT 'newcomer'`).catch(() => {});
    await run(`ALTER TABLE users    ADD COLUMN IF NOT EXISTS level_override   INTEGER DEFAULT 0`).catch(() => {});
    // Реферальная система
    await run(`ALTER TABLE users    ADD COLUMN IF NOT EXISTS ref_code         TEXT DEFAULT NULL`).catch(() => {});
    await run(`ALTER TABLE users    ADD COLUMN IF NOT EXISTS ref_by           TEXT DEFAULT NULL`).catch(() => {});
    await run(`ALTER TABLE users    ADD COLUMN IF NOT EXISTS is_partner       INTEGER DEFAULT 0`).catch(() => {});
    await run(`ALTER TABLE users    ADD COLUMN IF NOT EXISTS partner_percent  INTEGER DEFAULT 5`).catch(() => {});
    await run(`ALTER TABLE users    ADD COLUMN IF NOT EXISTS partner_earned   REAL DEFAULT 0`).catch(() => {});
    await run(`CREATE TABLE IF NOT EXISTS referral_rewards (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      partner_id TEXT REFERENCES users(id),
      referred_user_id TEXT REFERENCES users(id),
      deal_id TEXT,
      amount REAL DEFAULT 0,
      created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
    )`).catch(() => {});
    await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_ref_code ON users(ref_code) WHERE ref_code IS NOT NULL`).catch(() => {});
    await run(`ALTER TABLE users    ADD COLUMN IF NOT EXISTS level_override  INTEGER DEFAULT 0`).catch(() => {});
    await run(`ALTER TABLE products ADD COLUMN IF NOT EXISTS ai_price_advised INTEGER DEFAULT 0`).catch(() => {});
    await run(`ALTER TABLE users    ADD COLUMN IF NOT EXISTS ai_reactivated   INTEGER DEFAULT 0`).catch(() => {});
    console.log('✅ AI Admin миграция выполнена');

    // Запускаем AI Admin после миграции
    const { init: initAiAdmin } = require('./utils/aiAdmin');
    await initAiAdmin().catch(e => console.error('[AI Admin] Init error:', e.message));
  })
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Minions Market server on port ${PORT}`);
      if (!process.env.JWT_SECRET)          console.warn('⚠️  JWT_SECRET not set');
      if (!process.env.TELEGRAM_BOT_TOKEN)  console.warn('⚠️  TELEGRAM_BOT_TOKEN not set');
      if (!process.env.ADMIN_PASSWORD)      console.warn('⚠️  ADMIN_PASSWORD not set');
      if (!process.env.ANTHROPIC_API_KEY)   console.warn('⚠️  ANTHROPIC_API_KEY not set (AI Admin disabled)');
      if (!process.env.REPORT_CHAT_ID)      console.warn('⚠️  REPORT_CHAT_ID not set (AI Admin disabled)');
    });
  })
  .catch(e => {
    console.error('❌ DB init failed:', e.message);
    process.exit(1);
  });

module.exports = app;
