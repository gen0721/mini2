require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const path      = require('path');
const rateLimit = require('express-rate-limit');
const cron      = require('node-cron');

const app = express();

// ── Trust proxy (Railway / любой reverse proxy) ────────────────────────────────
// Fixes: ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
app.set('trust proxy', 1);

// ── Middleware ─────────────────────────────────────────────────────────────────
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:3000'];

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? allowedOrigins
    : true,
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Rate limiting ──────────────────────────────────────────────────────────────
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false }));
app.use('/api/auth/', rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false }));
app.use('/api/wallet/deposit', rateLimit({ windowMs: 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false }));

// ── Init DB ────────────────────────────────────────────────────────────────────
const db = require('./models/db');
console.log('✅ SQLite database ready');

// ── Routes ─────────────────────────────────────────────────────────────────────
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/products',   require('./routes/products'));
app.use('/api/deals',      require('./routes/deals'));
app.use('/api/wallet',     require('./routes/wallet'));
app.use('/api/users',      require('./routes/users'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/admin',      require('./routes/admin'));

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// ── Static frontend ────────────────────────────────────────────────────────────
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendDist));
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(frontendDist, 'index.html'));
  }
});

// ── Telegram bot (singleton — только один экземпляр) ──────────────────────────
// Запускаем с задержкой чтобы старый инстанс Railway успел завершиться
if (process.env.TELEGRAM_BOT_TOKEN) {
  setTimeout(() => {
    require('./utils/bot').getBot();
  }, 3000);
}

// ── Cron: auto-complete deals after 72h ───────────────────────────────────────
const { completeDeal } = require('./routes/deals');

cron.schedule('*/15 * * * *', () => {
  try {
    const now     = Math.floor(Date.now() / 1000);
    const expired = db.prepare(`
      SELECT * FROM deals WHERE status = 'active' AND auto_complete_at IS NOT NULL AND auto_complete_at <= ?
    `).all(now);

    if (expired.length) console.log(`[Cron] Auto-completing ${expired.length} deal(s)`);
    for (const deal of expired) {
      try { completeDeal(deal, 'auto'); }
      catch (e) { console.error(`[Cron] Deal ${deal.id} complete error:`, e.message); }
    }
  } catch (e) {
    console.error('[Cron] Error:', e.message);
  }
});

// Cron: unban expired bans every hour
cron.schedule('0 * * * *', () => {
  try {
    const now = Math.floor(Date.now() / 1000);
    const unbanned = db.prepare(`UPDATE users SET is_banned = 0, banned_until = NULL WHERE is_banned = 1 AND banned_until IS NOT NULL AND banned_until <= ?`).run(now);
    if (unbanned.changes > 0) console.log(`[Cron] Unbanned ${unbanned.changes} user(s)`);
  } catch (e) { console.error('[Cron] Unban error:', e.message); }
});

// Cron: expire promoted products
cron.schedule('0 * * * *', () => {
  try {
    const now = Math.floor(Date.now() / 1000);
    db.prepare(`UPDATE products SET is_promoted = 0, promoted_until = NULL WHERE is_promoted = 1 AND promoted_until IS NOT NULL AND promoted_until <= ?`).run(now);
  } catch (e) { console.error('[Cron] Promo expire error:', e.message); }
});

// ── Start ──────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Minions Market server on port ${PORT}`);
  if (!process.env.JWT_SECRET)        console.warn('⚠️  JWT_SECRET not set — using dev fallback');
  if (!process.env.TELEGRAM_BOT_TOKEN) console.warn('⚠️  TELEGRAM_BOT_TOKEN not set — bot disabled');
  if (!process.env.ADMIN_PASSWORD)    console.warn('⚠️  ADMIN_PASSWORD not set — using default "changeme123"');
});

module.exports = app;
