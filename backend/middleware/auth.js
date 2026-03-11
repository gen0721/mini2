const jwt = require('jsonwebtoken');
const db  = require('../models/db');

function getSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === 'production') {
      console.error('FATAL: JWT_SECRET env var is not set!');
      process.exit(1);
    }
    return 'dev-only-secret-change-in-production';
  }
  return s;
}

function generateToken(userId, expiresIn = '30d') {
  return jwt.sign({ userId }, getSecret(), { expiresIn });
}

function generateAdminToken() {
  return jwt.sign({ role: 'admin', adminId: 'main' }, getSecret() + '_admin', { expiresIn: '7d' });
}

async function auth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const { userId } = jwt.verify(token, getSecret());
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(401).json({ error: 'User not found' });

    // Auto-unban if ban expired
    if (user.is_banned && user.banned_until && user.banned_until < Math.floor(Date.now() / 1000)) {
      db.prepare('UPDATE users SET is_banned = 0, banned_until = NULL WHERE id = ?').run(userId);
      user.is_banned = 0;
    }

    if (user.is_banned) {
      return res.status(403).json({
        error: 'Аккаунт заблокирован',
        bannedUntil: user.banned_until ? new Date(user.banned_until * 1000) : null,
        reason: user.ban_reason
      });
    }

    // Update last_active (non-blocking)
    db.prepare('UPDATE users SET last_active = ? WHERE id = ?').run(Math.floor(Date.now() / 1000), userId);

    req.userId = userId;
    req.user   = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function adminAuth(req, res, next) {
  auth(req, res, () => {
    if (!req.user?.is_admin && !req.user?.is_sub_admin) {
      return res.status(403).json({ error: 'Admin only' });
    }
    next();
  });
}

function adminPanelAuth(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token) return res.status(401).json({ error: 'Admin token required' });

  // Способ 1: главный admin-panel токен (логин/пароль из env)
  try {
    const payload = jwt.verify(token, getSecret() + '_admin');
    if (payload.role === 'admin') {
      req.adminId = payload.adminId;
      req.isSuperAdmin = true;
      return next();
    }
  } catch {}

  // Способ 2: обычный JWT суб-админа (is_sub_admin = 1 в БД)
  try {
    const { userId } = jwt.verify(token, getSecret());
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (user && (user.is_admin || user.is_sub_admin)) {
      req.adminId = userId;
      req.isSuperAdmin = !!user.is_admin;
      req.isSubAdmin = !!user.is_sub_admin;
      return next();
    }
  } catch {}

  return res.status(401).json({ error: 'Invalid admin token' });
}

module.exports = { generateToken, generateAdminToken, auth, adminAuth, adminPanelAuth };
