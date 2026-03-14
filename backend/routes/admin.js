const router   = require('express').Router();
const { log, getIp, getRecentLogs, EVENTS } = require('../utils/securityLog');
const crypto   = require('crypto');
const { queryOne, queryAll, run, transaction } = require('../models/db');
const { adminPanelAuth, generateAdminToken } = require('../middleware/auth');
const notify   = require('../utils/notify');
const { completeDeal } = require('./deals');
const { sanitizeUser } = require('./auth');

// Хранилище заблокированных IP в памяти
const blockedIps = new Map(); // ip -> { until, attempts }

// 2FA коды в памяти: ip -> { code, expires }
const twoFaCodes = new Map();

// ── POST /admin/request-2fa — запросить код в Telegram ───────────────────────
router.post('/request-2fa', async (req, res) => {
  const adminLogin    = process.env.ADMIN_LOGIN?.trim();
  const adminPassword = process.env.ADMIN_PASSWORD?.trim();
  const { login, password } = req.body;
  const ip = getIp(req);

  // Проверяем блокировку
  const block = blockedIps.get(ip);
  if (block && block.until > Date.now()) {
    return res.status(429).json({ error: 'IP заблокирован' });
  }

  // Проверяем логин/пароль
  await new Promise(r => setTimeout(r, 500));
  if (!adminLogin || !adminPassword ||
      (login||'').trim() !== adminLogin ||
      (password||'').trim() !== adminPassword) {
    return res.status(401).json({ error: 'Неверные данные' });
  }

  // Генерируем 6-значный код
  const code    = String(Math.floor(100000 + Math.random() * 900000));
  const expires = Date.now() + 5 * 60 * 1000; // 5 минут
  twoFaCodes.set(ip, { code, expires });

  // Отправляем код в Telegram
  try {
    const { sendTg } = require('../utils/notify');
    if (process.env.REPORT_CHAT_ID) {
      await sendTg(process.env.REPORT_CHAT_ID,
        `🔐 <b>Код входа в админку</b>\n\n` +
        `Код: <code>${code}</code>\n` +
        `IP: <code>${ip}</code>\n` +
        `⏱ Действителен 5 минут\n\n` +
        `Если это не вы — немедленно смените пароль!`
      );
    }
  } catch(e) {
    console.error('[2FA] Telegram error:', e.message);
  }

  console.log(`[2FA] Код отправлен для IP ${ip}`);
  res.json({ ok: true, message: 'Код отправлен в Telegram' });
});

router.post('/login', async (req, res) => {
  const { login, password } = req.body;
  const adminLogin    = process.env.ADMIN_LOGIN?.trim();
  const adminPassword = process.env.ADMIN_PASSWORD?.trim();
  const ip = getIp(req);

  // Если переменные не заданы — вход ЗАПРЕЩЁН
  if (!adminLogin || !adminPassword) {
    console.error('SECURITY: ADMIN_LOGIN or ADMIN_PASSWORD not set in environment!');
    return res.status(503).json({ error: 'Панель администратора не настроена' });
  }

  // Проверяем блокировку IP
  const block = blockedIps.get(ip);
  if (block && block.until > Date.now()) {
    const minsLeft = Math.ceil((block.until - Date.now()) / 60000);
    console.warn(`SECURITY: Blocked IP ${ip} tried admin login (${minsLeft} min left)`);
    // Уведомляем админа
    try {
      const { sendTg } = require('../utils/notify');
      if (process.env.REPORT_CHAT_ID) {
        await sendTg(process.env.REPORT_CHAT_ID,
          `🚨 <b>Заблокированный IP пытается войти!</b>\n\nIP: <code>${ip}</code>\nЛогин: <code>${String(login||'').slice(0,50)}</code>\nОсталось: ${minsLeft} мин`
        );
      }
    } catch(e) {}
    return res.status(429).json({ error: `Слишком много попыток. Подождите ${minsLeft} минут.` });
  }

  // Задержка от брутфорса
  await new Promise(r => setTimeout(r, 800));

  if ((login||'').trim() !== adminLogin || (password||'').trim() !== adminPassword) {
    console.warn(`SECURITY: Failed admin login attempt for "${login}" from ${ip}`);
    await log(EVENTS.ADMIN_LOGIN_FAIL, req, { username: login });

    // Считаем неудачные попытки с этого IP за последние 10 минут
    const since = Math.floor(Date.now() / 1000) - 600;
    const { queryOne: qOne } = require('../models/db');
    const attempts = await qOne(
      `SELECT COUNT(*) as c FROM security_logs WHERE ip=$1 AND event='admin_login_fail' AND created_at>=$2`,
      [ip, since]
    ).catch(() => ({ c: 0 }));

    const count = parseInt(attempts.c) || 0;

    // После 5 попыток — блокируем IP на 30 минут
    if (count >= 4) {
      const blockUntil = Date.now() + 30 * 60 * 1000;
      blockedIps.set(ip, { until: blockUntil, attempts: count + 1 });

      console.error(`SECURITY: IP ${ip} BLOCKED for 30 min after ${count + 1} failed admin login attempts`);

      // Уведомляем тебя в Telegram
      try {
        const { sendTg } = require('../utils/notify');
        if (process.env.REPORT_CHAT_ID) {
          await sendTg(process.env.REPORT_CHAT_ID,
            `🔴 <b>IP заблокирован!</b>\n\nIP: <code>${ip}</code>\nПопыток: <b>${count + 1}</b>\nПоследний логин: <code>${String(login||'').slice(0,100)}</code>\nЗаблокирован на <b>30 минут</b>\n\n⚠️ Возможная атака на админку!`
          );
        }
      } catch(e) {}

      return res.status(429).json({ error: 'Слишком много попыток. IP заблокирован на 30 минут.' });
    }

    // Предупреждаем если попыток уже 3+
    if (count >= 2) {
      try {
        const { sendTg } = require('../utils/notify');
        if (process.env.REPORT_CHAT_ID) {
          await sendTg(process.env.REPORT_CHAT_ID,
            `⚠️ <b>Подозрительная активность!</b>\n\nIP: <code>${ip}</code>\nПопытка #${count + 1} войти в админку\nЛогин: <code>${String(login||'').slice(0,100)}</code>`
          );
        }
      } catch(e) {}
    }

    return res.status(401).json({ error: 'Неверные данные' });
  }

  // Проверяем 2FA код если включён Telegram
  if (process.env.REPORT_CHAT_ID && process.env.TELEGRAM_BOT_TOKEN) {
    const { twoFaCode } = req.body;
    const saved = twoFaCodes.get(ip);

    if (!saved || saved.expires < Date.now()) {
      return res.status(401).json({ error: 'Сначала запросите код', need2fa: true });
    }
    if (saved.code !== String(twoFaCode || '').trim()) {
      console.warn(`[2FA] Неверный код от IP ${ip}`);
      return res.status(401).json({ error: 'Неверный код из Telegram' });
    }
    twoFaCodes.delete(ip); // Код одноразовый
  }

  // Успешный вход — сбрасываем счётчик этого IP
  blockedIps.delete(ip);
  console.log(`Admin login successful from ${ip}`);
  await log(EVENTS.ADMIN_LOGIN_OK, req, { username: login, details: { ip } });

  // Уведомляем об успешном входе
  try {
    const { sendTg } = require('../utils/notify');
    if (process.env.REPORT_CHAT_ID) {
      await sendTg(process.env.REPORT_CHAT_ID,
        `✅ <b>Вход в админку</b>\n\nIP: <code>${ip}</code>\nВремя: ${new Date().toLocaleString('ru')}`
      );
    }
  } catch(e) {}

  res.json({ token: generateAdminToken() });
});

router.use(adminPanelAuth);

router.get('/stats', async (req, res) => {
  try {
    const [users, products, deals, revenue, recentDeals, monthly] = await Promise.all([
      queryOne(`SELECT COUNT(*) as c FROM users WHERE password IS NOT NULL`),
      queryOne(`SELECT COUNT(*) as c FROM products WHERE status = 'active'`),
      queryOne(`SELECT COUNT(*) as c FROM deals`),
      queryOne(`SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE type = 'commission' AND status = 'completed'`),
      queryAll(`SELECT d.id, d.amount, d.status, p.title as product_title, b.username as buyer_username, s.username as seller_username FROM deals d LEFT JOIN products p ON p.id = d.product_id LEFT JOIN users b ON b.id = d.buyer_id LEFT JOIN users s ON s.id = d.seller_id ORDER BY d.created_at DESC LIMIT 10`),
      queryAll(`SELECT TO_CHAR(TO_TIMESTAMP(created_at), 'YYYY-MM') as month, SUM(amount) as revenue FROM transactions WHERE type = 'commission' AND status = 'completed' GROUP BY month ORDER BY month DESC LIMIT 12`),
    ]);
    res.json({
      users: parseInt(users.c), products: parseInt(products.c),
      deals: parseInt(deals.c), revenue: parseFloat(revenue.total),
      recentDeals: recentDeals.map(d => ({ ...d, _id: d.id, amount: parseFloat(d.amount), product: { title: d.product_title }, buyer: { username: d.buyer_username }, seller: { username: d.seller_username } })),
      monthlyRevenue: monthly.reverse(),
    });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка' }); }
});

router.get('/users', async (req, res) => {
  try {
    const { search } = req.query;
    const users = search
      ? await queryAll(`SELECT * FROM users WHERE (username ILIKE $1 OR telegram_id = $2) AND password IS NOT NULL ORDER BY created_at DESC LIMIT 50`, [`%${search}%`, search])
      : await queryAll(`SELECT * FROM users WHERE password IS NOT NULL ORDER BY created_at DESC LIMIT 100`);
    res.json(users.map(u => ({ ...sanitizeUser(u), isBanned: !!u.is_banned, isVerified: !!u.is_verified, isSubAdmin: !!u.is_sub_admin })));
  } catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});

router.post('/users/:id/ban', async (req, res) => {
  try {
    const { hours, reason } = req.body;
    const bannedUntil = hours ? Math.floor(Date.now() / 1000) + parseInt(hours) * 3600 : null;
    await run(`UPDATE users SET is_banned = 1, banned_until = $1, ban_reason = $2 WHERE id = $3`, [bannedUntil, reason || null, req.params.id]);
    const user = await queryOne('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (user) notify.notifyBanned(user, bannedUntil ? new Date(bannedUntil * 1000) : null, reason).catch(() => {});
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});

router.post('/users/:id/unban', async (req, res) => {
  try {
    await run(`UPDATE users SET is_banned = 0, banned_until = NULL, ban_reason = NULL WHERE id = $1`, [req.params.id]);
    const user = await queryOne('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (user) notify.notifyUnbanned(user).catch(() => {});
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});

router.post('/users/:id/balance', async (req, res) => {
  try {
    const { amount, reason } = req.body;
    const amt = parseFloat(amount);
    if (isNaN(amt)) return res.status(400).json({ error: 'Неверная сумма' });
    const user = await queryOne('SELECT id, balance FROM users WHERE id = $1', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'Не найден' });
    const currentBal = parseFloat(String(user.balance)) || 0;
    const newBal = Math.round((currentBal + amt) * 100) / 100;
    console.log(`Balance adjust: user=${req.params.id} current=${currentBal} amt=${amt} new=${newBal}`);
    if (newBal < 0) return res.status(400).json({ error: 'Баланс не может быть отрицательным' });
    await transaction(async (client) => {
      const result = await client.query(`UPDATE users SET balance = $1::numeric WHERE id = $2 RETURNING balance`, [newBal, req.params.id]);
      console.log('UPDATE result:', result.rows[0]);
      await client.query(`INSERT INTO transactions (id, user_id, type, amount, status, description, balance_before, balance_after) VALUES ($1,$2,'adjustment',$3,'completed',$4,$5,$6)`,
        [crypto.randomUUID(), req.params.id, Math.abs(amt), reason || 'Admin adjustment', user.balance, newBal]);
    });
    if (notify.notifyBalanceAdjust) notify.notifyBalanceAdjust(user, amt, reason).catch(() => {});
    res.json({ ok: true, newBalance: newBal });
  } catch (e) { console.error('Balance adjust error:', e); res.status(500).json({ error: e.message || 'Ошибка' }); }
});

router.get('/deals', async (req, res) => {
  try {
    const deals = await queryAll(`SELECT d.*, p.title as product_title, b.username as buyer_username, s.username as seller_username FROM deals d LEFT JOIN products p ON p.id = d.product_id LEFT JOIN users b ON b.id = d.buyer_id LEFT JOIN users s ON s.id = d.seller_id ORDER BY CASE WHEN d.status = 'disputed' THEN 0 ELSE 1 END, d.created_at DESC LIMIT 100`);
    res.json(deals.map(d => ({ ...d, _id: d.id, amount: parseFloat(d.amount), product: { title: d.product_title }, buyer: { username: d.buyer_username }, seller: { username: d.seller_username }, disputeReason: d.dispute_reason })));
  } catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});

router.post('/deals/:id/resolve', async (req, res) => {
  try {
    const { decision, note } = req.body;
    const deal = await queryOne('SELECT * FROM deals WHERE id = $1', [req.params.id]);
    if (!deal || deal.status !== 'disputed') return res.status(404).json({ error: 'Спор не найден' });
    if (decision === 'complete') {
      await completeDeal(deal, 'admin_complete');
      await run(`UPDATE deals SET admin_note = $1, resolved_at = EXTRACT(EPOCH FROM NOW())::BIGINT WHERE id = $2`, [note || null, deal.id]);
    } else if (decision === 'refund') {
      await transaction(async (client) => {
        await client.query(`UPDATE users SET balance = balance + $1, frozen_balance = frozen_balance - $1 WHERE id = $2`, [deal.amount, deal.buyer_id]);
        await client.query(`UPDATE products SET status = 'active' WHERE id = $1`, [deal.product_id]);
        await client.query(`UPDATE deals SET status = 'refunded', admin_note = $1, resolved_at = EXTRACT(EPOCH FROM NOW())::BIGINT, updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT WHERE id = $2`, [note || null, deal.id]);
      });
      const [buyer, product] = await Promise.all([
        queryOne('SELECT * FROM users WHERE id = $1', [deal.buyer_id]),
        queryOne('SELECT title FROM products WHERE id = $1', [deal.product_id]),
      ]);
      notify.notifyDealRefund(buyer, product?.title || '', deal.amount).catch(() => {});
    }
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка' }); }
});

router.get('/products', async (req, res) => {
  try {
    const products = await queryAll(`SELECT p.*, u.username as seller_username FROM products p LEFT JOIN users u ON u.id = p.seller_id WHERE p.status != 'deleted' ORDER BY p.created_at DESC LIMIT 100`);
    res.json(products.map(p => ({ ...p, _id: p.id, price: parseFloat(p.price), seller: { username: p.seller_username } })));
  } catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});

router.delete('/products/:id', async (req, res) => {
  try { await run(`UPDATE products SET status = 'deleted' WHERE id = $1`, [req.params.id]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});

router.post('/products/:id/promote', async (req, res) => {
  try {
    const { hours = 24 } = req.body;
    await run(`UPDATE products SET is_promoted = 1, promoted_until = $1 WHERE id = $2`, [Math.floor(Date.now() / 1000) + parseInt(hours) * 3600, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});

router.post('/message', async (req, res) => {
  try {
    const { userId, username, text } = req.body;
    if ((!userId && !username) || !text) return res.status(400).json({ error: 'Заполните поля' });
    // Ищем по UUID, логину или TG ID
    let user;
    if (userId) {
      user = await queryOne('SELECT telegram_id, username FROM users WHERE id = $1', [userId]);
    }
    if (!user && username) {
      const q = username.replace(/^@/, '').trim();
      user = await queryOne(
        'SELECT telegram_id, username FROM users WHERE username = $1 OR telegram_id = $1',
        [q]
      );
    }
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    if (!user.telegram_id) return res.status(404).json({ error: 'Telegram не привязан у этого пользователя' });
    await notify.sendTg(user.telegram_id, text);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});

router.get('/transactions', async (req, res) => {
  try {
    const txs = await queryAll(`SELECT t.*, u.username FROM transactions t LEFT JOIN users u ON u.id = t.user_id ORDER BY t.created_at DESC LIMIT 200`);
    res.json(txs.map(tx => ({ ...tx, _id: tx.id, createdAt: new Date(tx.created_at * 1000) })));
  } catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});

router.post('/users/:id/verify', async (req, res) => {
  try { await run(`UPDATE users SET is_verified = 1 WHERE id = $1`, [req.params.id]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});

router.post('/users/:id/make-subadmin', async (req, res) => {
  try { await run(`UPDATE users SET is_sub_admin = 1 WHERE id = $1`, [req.params.id]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});

router.post('/users/:id/remove-subadmin', async (req, res) => {
  try { await run(`UPDATE users SET is_sub_admin = 0 WHERE id = $1`, [req.params.id]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});

module.exports = router;

// ── GET /admin/stats/detailed — детальная статистика ─────────────────────────
router.get('/stats/detailed', async (req, res) => {
  try {
    const now   = Math.floor(Date.now() / 1000);
    const d1    = now - 86400;
    const d7    = now - 604800;
    const d30   = now - 2592000;

    const [
      usersToday, usersWeek, usersMonth,
      dealsToday, dealsWeek, dealsMonth,
      revenueToday, revenueWeek, revenueMonth,
      topSellers, topProducts, newUsers,
      pendingWithdrawals, activeDisputes,
      dailyStats,
    ] = await Promise.all([
      queryOne(`SELECT COUNT(*) as c FROM users WHERE created_at >= $1`, [d1]),
      queryOne(`SELECT COUNT(*) as c FROM users WHERE created_at >= $1`, [d7]),
      queryOne(`SELECT COUNT(*) as c FROM users WHERE created_at >= $1`, [d30]),
      queryOne(`SELECT COUNT(*) as c, COALESCE(SUM(amount),0) as vol FROM deals WHERE created_at >= $1`, [d1]),
      queryOne(`SELECT COUNT(*) as c, COALESCE(SUM(amount),0) as vol FROM deals WHERE created_at >= $1`, [d7]),
      queryOne(`SELECT COUNT(*) as c, COALESCE(SUM(amount),0) as vol FROM deals WHERE created_at >= $1`, [d30]),
      queryOne(`SELECT COALESCE(SUM(amount),0) as t FROM transactions WHERE type='commission' AND status='completed' AND created_at >= $1`, [d1]),
      queryOne(`SELECT COALESCE(SUM(amount),0) as t FROM transactions WHERE type='commission' AND status='completed' AND created_at >= $1`, [d7]),
      queryOne(`SELECT COALESCE(SUM(amount),0) as t FROM transactions WHERE type='commission' AND status='completed' AND created_at >= $1`, [d30]),
      queryAll(`SELECT u.username, u.id, COUNT(d.id) as sales, COALESCE(SUM(d.seller_amount),0) as earned FROM deals d LEFT JOIN users u ON u.id=d.seller_id WHERE d.status='completed' AND d.updated_at >= $1 GROUP BY u.id,u.username ORDER BY sales DESC LIMIT 5`, [d7]),
      queryAll(`SELECT p.title, p.id, p.views, p.price, COUNT(d.id) as sales FROM products p LEFT JOIN deals d ON d.product_id=p.id AND d.status='completed' GROUP BY p.id,p.title,p.views,p.price ORDER BY sales DESC, p.views DESC LIMIT 5`),
      queryAll(`SELECT id, username, created_at, total_sales, total_purchases FROM users WHERE password IS NOT NULL ORDER BY created_at DESC LIMIT 10`),
      queryOne(`SELECT COUNT(*) as c, COALESCE(SUM(amount),0) as vol FROM transactions WHERE type='withdrawal' AND status='pending'`),
      queryOne(`SELECT COUNT(*) as c FROM deals WHERE status='disputed'`),
      queryAll(`SELECT TO_CHAR(TO_TIMESTAMP(created_at),'YYYY-MM-DD') as day, COUNT(*) as deals, COALESCE(SUM(amount),0) as vol FROM deals WHERE created_at >= $1 GROUP BY day ORDER BY day ASC`, [d30]),
    ]);

    res.json({
      users:    { today: parseInt(usersToday.c), week: parseInt(usersWeek.c), month: parseInt(usersMonth.c) },
      deals:    { today: parseInt(dealsToday.c), todayVol: parseFloat(dealsToday.vol), week: parseInt(dealsWeek.c), weekVol: parseFloat(dealsWeek.vol), month: parseInt(dealsMonth.c), monthVol: parseFloat(dealsMonth.vol) },
      revenue:  { today: parseFloat(revenueToday.t), week: parseFloat(revenueWeek.t), month: parseFloat(revenueMonth.t) },
      topSellers: topSellers.map(s => ({ ...s, sales: parseInt(s.sales), earned: parseFloat(s.earned) })),
      topProducts: topProducts.map(p => ({ ...p, sales: parseInt(p.sales), views: parseInt(p.views) })),
      newUsers: newUsers.map(u => ({ id: u.id, username: u.username, created_at: u.created_at, total_sales: u.total_sales, total_purchases: u.total_purchases })),
      pendingWithdrawals: { count: parseInt(pendingWithdrawals.c), vol: parseFloat(pendingWithdrawals.vol) },
      activeDisputes: parseInt(activeDisputes.c),
      dailyStats,
    });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Ошибка' }); }
});

// ── POST /admin/broadcast — массовая рассылка ─────────────────────────────────
router.post('/broadcast', async (req, res) => {
  try {
    const { text, filter } = req.body; // filter: 'all' | 'buyers' | 'sellers' | 'verified'
    if (!text?.trim()) return res.status(400).json({ error: 'Введите текст' });

    let users;
    if (filter === 'buyers')   users = await queryAll(`SELECT telegram_id FROM users WHERE telegram_id IS NOT NULL AND total_purchases > 0`);
    else if (filter === 'sellers') users = await queryAll(`SELECT telegram_id FROM users WHERE telegram_id IS NOT NULL AND total_sales > 0`);
    else if (filter === 'verified') users = await queryAll(`SELECT telegram_id FROM users WHERE telegram_id IS NOT NULL AND is_verified = 1`);
    else users = await queryAll(`SELECT telegram_id FROM users WHERE telegram_id IS NOT NULL AND password IS NOT NULL`);

    const { sendTg } = require('../utils/notify');
    let sent = 0;
    for (const u of users) {
      try { await sendTg(u.telegram_id, text); sent++; await new Promise(r => setTimeout(r, 50)); }
      catch(e) {}
    }
    res.json({ ok: true, sent, total: users.length });
  } catch(e) { res.status(500).json({ error: 'Ошибка' }); }
});

// ── GET /admin/settings — получить настройки ─────────────────────────────────
router.get('/settings', async (req, res) => {
  res.json({
    commission:       process.env.COMMISSION_RATE      || '5',
    minDeposit:       process.env.MIN_DEPOSIT          || '2',
    dailyWithdrawLimit: process.env.DAILY_WITHDRAW_LIMIT || '500',
    aiEnabled:        process.env.ANTHROPIC_API_KEY ? 'true' : 'false',
    registrationOpen: process.env.REGISTRATION_CLOSED !== 'true' ? 'true' : 'false',
  });
});

// ── Уровни продавца ──────────────────────────────────────────────────────────
const SELLER_LEVELS = {
  newcomer:    { min:0,  max:4,  label:'Новичок',  emoji:'🌱', color:'#6b7280' },
  experienced: { min:5,  max:19, label:'Опытный',  emoji:'⭐', color:'#3b82f6' },
  pro:         { min:20, max:49, label:'Про',       emoji:'💎', color:'#8b5cf6' },
  legend:      { min:50, max:Infinity, label:'Легенда', emoji:'👑', color:'#f5c842' },
};

function calcLevel(totalSales) {
  const s = parseInt(totalSales) || 0;
  if (s >= 50) return 'legend';
  if (s >= 20) return 'pro';
  if (s >= 5)  return 'experienced';
  return 'newcomer';
}

// ── POST /admin/users/:id/set-level — установить уровень вручную ──────────────
router.post('/users/:id/set-level', async (req, res) => {
  try {
    const { level, override } = req.body;
    if (!SELLER_LEVELS[level]) return res.status(400).json({ error: 'Неверный уровень' });
    await run(
      'UPDATE users SET seller_level=$1, level_override=$2 WHERE id=$3',
      [level, override ? 1 : 0, req.params.id]
    );
    res.json({ ok: true, level, label: SELLER_LEVELS[level].label });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST /admin/users/recalc-levels — пересчитать все уровни автоматически ────
router.post('/users/recalc-levels', async (req, res) => {
  try {
    const users = await queryAll('SELECT id, total_sales, level_override FROM users WHERE password IS NOT NULL');
    let updated = 0;
    for (const u of users) {
      if (u.level_override) continue; // не трогаем ручные
      const level = calcLevel(u.total_sales);
      await run('UPDATE users SET seller_level=$1 WHERE id=$2', [level, u.id]);
      updated++;
    }
    res.json({ ok: true, updated });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GET /admin/chats — все диалоги пользователей ─────────────────────────────
router.get('/chats', async (req, res) => {
  try {
    const dialogs = await queryAll(`
      SELECT DISTINCT ON (LEAST(m.sender_id, m.receiver_id), GREATEST(m.sender_id, m.receiver_id))
        LEAST(m.sender_id, m.receiver_id)    as user1_id,
        GREATEST(m.sender_id, m.receiver_id) as user2_id,
        u1.username as user1_username,
        u2.username as user2_username,
        m.text      as last_text,
        m.created_at as last_time,
        COUNT(m2.id) OVER (PARTITION BY LEAST(m.sender_id,m.receiver_id), GREATEST(m.sender_id,m.receiver_id)) as msg_count
      FROM messages m
      LEFT JOIN users u1 ON u1.id = LEAST(m.sender_id, m.receiver_id)
      LEFT JOIN users u2 ON u2.id = GREATEST(m.sender_id, m.receiver_id)
      LEFT JOIN messages m2 ON (
        (m2.sender_id = m.sender_id AND m2.receiver_id = m.receiver_id) OR
        (m2.sender_id = m.receiver_id AND m2.receiver_id = m.sender_id)
      )
      ORDER BY LEAST(m.sender_id,m.receiver_id), GREATEST(m.sender_id,m.receiver_id), m.created_at DESC
    `);
    res.json(dialogs);
  } catch(e) { console.error(e); res.status(500).json({ error: 'Ошибка' }); }
});

// ── GET /admin/chats/:user1/:user2 — переписка между двумя юзерами ────────────
router.get('/chats/:user1/:user2', async (req, res) => {
  try {
    const { user1, user2 } = req.params;
    const [u1, u2, messages] = await Promise.all([
      queryOne('SELECT id, username FROM users WHERE id = $1', [user1]),
      queryOne('SELECT id, username FROM users WHERE id = $1', [user2]),
      queryAll(`
        SELECT m.*, u.username as sender_username
        FROM messages m
        LEFT JOIN users u ON u.id = m.sender_id
        WHERE (m.sender_id = $1 AND m.receiver_id = $2)
           OR (m.sender_id = $2 AND m.receiver_id = $1)
        ORDER BY m.created_at ASC
      `, [user1, user2]),
    ]);
    res.json({ user1: u1, user2: u2, messages });
  } catch(e) { res.status(500).json({ error: 'Ошибка' }); }
});

router.get('/security-logs', async (req, res) => {
  try {
    const { event, ip, limit = 200 } = req.query;
    const logs = await getRecentLogs({ event, ip, limit: parseInt(limit) });
    res.json(logs);
  } catch(e) { res.status(500).json({ error: e.message }); }
});
