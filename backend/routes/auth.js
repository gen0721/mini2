const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const db      = require('../models/db');
const { generateToken, auth } = require('../middleware/auth');
const { getBot } = require('../utils/bot');
const notify  = require('../utils/notify');

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitizeUser(u) {
  if (!u) return null;
  const { password, otp_code, otp_expires, otp_used, reset_code, reset_expires, ...safe } = u;
  safe._id = safe.id;
  safe.username     = safe.username;
  safe.balance      = safe.balance || 0;
  safe.frozenBalance = safe.frozen_balance || 0;
  safe.totalSales   = safe.total_sales || 0;
  safe.totalPurchases = safe.total_purchases || 0;
  safe.isAdmin      = !!safe.is_admin;
  safe.isSubAdmin   = !!safe.is_sub_admin;
  safe.isBanned     = !!safe.is_banned;
  safe.isVerified   = !!safe.is_verified;
  safe.photoUrl     = safe.photo_url;
  safe.firstName    = safe.first_name;
  safe.lastName     = safe.last_name;
  safe.reviewCount  = safe.review_count || 0;
  safe.totalDeposited = safe.total_deposited || 0;
  safe.totalWithdrawn = safe.total_withdrawn || 0;
  return safe;
}

function validateUsername(u) {
  return /^[a-z0-9_]{3,24}$/.test(u);
}

// ── POST /auth/register/init ──────────────────────────────────────────────────
router.post('/register/init', (req, res) => {
  const { username } = req.body;
  if (!username || !validateUsername(username)) {
    return res.status(400).json({ error: 'Недопустимый логин (3-24 символа, только a-z 0-9 _)' });
  }
  // A "taken" user is one that has a password set (fully registered)
  const existing = db.prepare('SELECT id, password FROM users WHERE username = ?').get(username.toLowerCase());
  if (existing?.password) return res.status(409).json({ error: 'Логин уже занят' });
  res.json({ ok: true });
});

// ── POST /auth/register/check ─────────────────────────────────────────────────
router.post('/register/check', (req, res) => {
  const { username } = req.body;
  if (!username || !validateUsername(username)) {
    return res.status(400).json({ error: 'Недопустимый логин' });
  }
  const existing = db.prepare('SELECT id, password FROM users WHERE username = ?').get(username.toLowerCase());
  if (existing?.password) return res.status(409).json({ error: 'Логин уже занят' });

  const bot = getBot();
  const botUsername = bot?.username || process.env.BOT_USERNAME || 'MinionsMarketBot';
  res.json({ botUsername });
});

// ── POST /auth/register/verify ────────────────────────────────────────────────
router.post('/register/verify', async (req, res) => {
  try {
    const { username, code, password } = req.body;
    if (!username || !code || !password) return res.status(400).json({ error: 'Заполните все поля' });
    if (password.length < 6) return res.status(400).json({ error: 'Пароль минимум 6 символов' });
    if (!validateUsername(username)) return res.status(400).json({ error: 'Недопустимый логин' });

    const uname = username.toLowerCase();
    const trimmedCode = code.trim();
    const now = Math.floor(Date.now() / 1000);

    // Check if already fully registered
    const alreadyDone = db.prepare('SELECT id, password FROM users WHERE username = ?').get(uname);
    if (alreadyDone?.password) return res.status(409).json({ error: 'Логин уже занят' });

    // PRIMARY: find stub user by username + code (bot created it via /code <username>)
    let stubUser = db.prepare(
      `SELECT * FROM users WHERE username = ? AND otp_code = ? AND otp_used = 0 AND otp_expires > ?`
    ).get(uname, trimmedCode, now);

    // FALLBACK: find stub by code only (handles edge case where username was re-created)
    if (!stubUser) {
      const byCode = db.prepare(
        `SELECT * FROM users WHERE otp_code = ? AND otp_used = 0 AND otp_expires > ? AND password IS NULL`
      ).all(trimmedCode, now);

      // Match by username among results
      stubUser = byCode.find(u => u.username === uname) || null;
    }

    if (!stubUser) {
      return res.status(400).json({
        error: `Неверный или просроченный код. Запросите новый командой /code ${uname} в боте.`
      });
    }

    const hash = await bcrypt.hash(password, 12);
    db.prepare(
      `UPDATE users SET password = ?, otp_used = 1, otp_code = NULL, otp_expires = NULL, is_verified = 1 WHERE id = ?`
    ).run(hash, stubUser.id);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(stubUser.id);
    const token = generateToken(user.id);

    if (user.telegram_id) notify.notifyRegistered(user).catch(() => {});

    res.json({ token, user: sanitizeUser(user) });
  } catch (e) {
    console.error('Register verify error:', e);
    res.status(500).json({ error: 'Внутренняя ошибка' });
  }
});

// ── POST /auth/login ──────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Заполните все поля' });

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.toLowerCase());
    if (!user || !user.password) return res.status(401).json({ error: 'Неверный логин или пароль' });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Неверный логин или пароль' });

    if (user.is_banned) {
      const until = user.banned_until ? ` до ${new Date(user.banned_until * 1000).toLocaleDateString('ru')}` : ' навсегда';
      return res.status(403).json({ error: `Аккаунт заблокирован${until}. ${user.ban_reason || ''}` });
    }

    db.prepare('UPDATE users SET last_active = ? WHERE id = ?').run(Math.floor(Date.now() / 1000), user.id);

    const token = generateToken(user.id);
    res.json({ token, user: sanitizeUser(user) });
  } catch (e) {
    console.error('Login error:', e);
    res.status(500).json({ error: 'Внутренняя ошибка' });
  }
});

// ── POST /auth/reset/request ──────────────────────────────────────────────────
router.post('/reset/request', (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Введите логин' });

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.toLowerCase());
  const botUsername = getBot()?.username || process.env.BOT_USERNAME || 'MinionsMarketBot';

  if (user && user.telegram_id) {
    const code    = String(Math.floor(100000 + Math.random() * 900000));
    const expires = Math.floor(Date.now() / 1000) + 15 * 60;
    db.prepare('UPDATE users SET reset_code = ?, reset_expires = ? WHERE id = ?').run(code, expires, user.id);
    notify.sendCode(user.telegram_id, code, 'reset').catch(() => {});
  }

  res.json({ ok: true, botUsername });
});

// ── POST /auth/reset/confirm ──────────────────────────────────────────────────
router.post('/reset/confirm', async (req, res) => {
  try {
    const { username, code, newPassword } = req.body;
    if (!username || !code || !newPassword) return res.status(400).json({ error: 'Заполните все поля' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Пароль минимум 6 символов' });

    const user = db.prepare(
      `SELECT * FROM users WHERE username = ? AND reset_code = ? AND reset_expires > ?`
    ).get(username.toLowerCase(), code.trim(), Math.floor(Date.now() / 1000));

    if (!user) return res.status(400).json({ error: 'Неверный или просроченный код' });

    const hash = await bcrypt.hash(newPassword, 12);
    db.prepare('UPDATE users SET password = ?, reset_code = NULL, reset_expires = NULL WHERE id = ?').run(hash, user.id);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Внутренняя ошибка' });
  }
});

// ── GET /auth/me ──────────────────────────────────────────────────────────────
router.get('/me', auth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  res.json({ user: sanitizeUser(user) });
});

module.exports = router;
module.exports.sanitizeUser = sanitizeUser;
