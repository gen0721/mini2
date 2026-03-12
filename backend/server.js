require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const path      = require('path');
const rateLimit = require('express-rate-limit');
const cron      = require('node-cron');

const app = express();
app.set('trust proxy', 1);

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

// ── Routes ─────────────────────────────────────────────────────────────────────
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/products',   require('./routes/products'));
app.use('/api/deals',      require('./routes/deals'));
app.use('/api/wallet',     require('./routes/wallet'));
app.use('/api/users',      require('./routes/users'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/admin',      require('./routes/admin'));

app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// ── Telegram bot (webhook mode) ───────────────────────────────────────────────
const { getBot, handleUpdate } = require('./utils/bot');

app.post('/api/tg-webhook/:token', (req, res) => {
  res.sendStatus(200);
  if (req.params.token !== process.env.TELEGRAM_BOT_TOKEN) return;
  handleUpdate(req.body).catch(e => console.error('[Webhook] error:', e.message));
});

if (process.env.TELEGRAM_BOT_TOKEN) {
  setTimeout(() => getBot(), 2000);
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

// ── Init DB then start ────────────────────────────────────────────────────────
const { initSchema } = require('./models/db');
const PORT = process.env.PORT || 5000;

initSchema().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Minions Market server on port ${PORT}`);
    if (!process.env.JWT_SECRET)          console.warn('⚠️  JWT_SECRET not set');
    if (!process.env.TELEGRAM_BOT_TOKEN)  console.warn('⚠️  TELEGRAM_BOT_TOKEN not set');
    if (!process.env.ADMIN_PASSWORD)      console.warn('⚠️  ADMIN_PASSWORD not set');
  });
}).catch(e => {
  console.error('❌ DB init failed:', e.message);
  process.exit(1);
});

module.exports = app;
