const { run, queryAll } = require('../models/db');

const EVENTS = {
  LOGIN_OK:        'login_ok',
  LOGIN_FAIL:      'login_fail',
  REGISTER:        'register',
  ADMIN_LOGIN_OK:  'admin_login_ok',
  ADMIN_LOGIN_FAIL:'admin_login_fail',
  TOKEN_INVALID:   'token_invalid',
  BANNED_ACCESS:   'banned_access',
  RESET_CODE:      'reset_code',
  RESET_OK:        'reset_ok',
  PURCHASE:        'purchase',
  WITHDRAW:        'withdraw',
  DISPUTE:         'dispute',
};

function getIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['cf-connecting-ip']
    || req.socket?.remoteAddress
    || 'unknown';
}

async function log(event, req, { userId, username, details } = {}) {
  const ip = getIp(req);
  try {
    await run(
      `INSERT INTO security_logs (event, ip, user_id, username, details) VALUES ($1,$2,$3,$4,$5)`,
      [event, ip, userId || null, username || null, details ? JSON.stringify(details) : null]
    );
  } catch(e) {
    // Не крашим сервер из-за логирования
    console.error('[securityLog] failed:', e.message);
  }
  // Дублируем в консоль Railway
  const ts = new Date().toISOString();
  console.log(`[SECURITY] ${ts} | ${event} | ip=${ip} | user=${username||userId||'—'} | ${details ? JSON.stringify(details) : ''}`);
}

async function getRecentLogs({ limit = 200, event, ip } = {}) {
  let where = 'WHERE 1=1';
  const params = [];
  if (event) { params.push(event); where += ` AND event = $${params.length}`; }
  if (ip)    { params.push(ip);    where += ` AND ip = $${params.length}`; }
  params.push(limit);
  return queryAll(
    `SELECT * FROM security_logs ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
    params
  );
}

module.exports = { log, getIp, getRecentLogs, EVENTS };
