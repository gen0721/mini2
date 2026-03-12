const router   = require('express').Router();
const crypto   = require('crypto');
const { queryOne, queryAll, run, transaction } = require('../models/db');
const { adminPanelAuth, generateAdminToken } = require('../middleware/auth');
const notify   = require('../utils/notify');
const { completeDeal } = require('./deals');
const { sanitizeUser } = require('./routes_auth');

router.post('/login', async (req, res) => {
  const { login, password } = req.body;
  const adminLogin    = (process.env.ADMIN_LOGIN    || 'admin').trim();
  const adminPassword = (process.env.ADMIN_PASSWORD || 'changeme123').trim();
  if ((login||'').trim() !== adminLogin || (password||'').trim() !== adminPassword) {
    return res.status(401).json({ error: 'Неверные данные' });
  }
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
    const user = await queryOne('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'Не найден' });
    const newBal = parseFloat(user.balance) + amt;
    if (newBal < 0) return res.status(400).json({ error: 'Баланс не может быть отрицательным' });
    await transaction(async (client) => {
      await client.query(`UPDATE users SET balance = $1 WHERE id = $2`, [newBal, req.params.id]);
      await client.query(`INSERT INTO transactions (id, user_id, type, amount, status, description, balance_before, balance_after) VALUES ($1,$2,'adjustment',$3,'completed',$4,$5,$6)`,
        [crypto.randomUUID(), req.params.id, Math.abs(amt), reason || 'Admin adjustment', user.balance, newBal]);
    });
    notify.notifyBalanceAdjust(user, amt, reason).catch(() => {});
    res.json({ ok: true, newBalance: newBal });
  } catch (e) { res.status(500).json({ error: 'Ошибка' }); }
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
    const { userId, text } = req.body;
    if (!userId || !text) return res.status(400).json({ error: 'Заполните поля' });
    const user = await queryOne('SELECT telegram_id FROM users WHERE id = $1', [userId]);
    if (!user?.telegram_id) return res.status(404).json({ error: 'Telegram не привязан' });
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
