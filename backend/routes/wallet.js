const router   = require('express').Router();
const crypto   = require('crypto');
const { queryOne, queryAll, run, transaction } = require('../models/db');
const { auth } = require('../middleware/auth');
const rukassa  = require('../utils/rukassa');
const cryptocloud = require('../utils/cryptocloud');
const notify   = require('../utils/notify');
const { sanitizeUser } = require('./auth');

const MIN_DEPOSIT = 1;

// ── GET /wallet/transactions ──────────────────────────────────────────────────
router.get('/transactions', auth, async (req, res) => {
  try {
    const txs = await queryAll(
      `SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.userId]
    );
    res.json({ transactions: txs.map(tx => ({ ...tx, _id: tx.id, createdAt: new Date(tx.created_at * 1000) })) });
  } catch (e) {
    res.status(500).json({ error: 'Ошибка' });
  }
});

// ── POST /wallet/deposit/rukassa ──────────────────────────────────────────────
router.post('/deposit/rukassa', auth, async (req, res) => {
  try {
    const amount = parseFloat(req.body.amount);
    if (!amount || amount < MIN_DEPOSIT) return res.status(400).json({ error: `Минимум $${MIN_DEPOSIT}` });

    const orderId   = `rukassa_${req.userId}_${Date.now()}`;
    const hookUrl   = `${process.env.BACKEND_URL || ''}/api/wallet/webhook/rukassa`;
    const successUrl = `${process.env.FRONTEND_URL || ''}/wallet?success=1`;

    const result = await rukassa.createInvoice({ amount, orderId, hookUrl, successUrl, comment: `Пополнение баланса Minions Market на $${amount}` });
    if (!result.ok) return res.status(502).json({ error: result.error });

    const user = await queryOne('SELECT balance FROM users WHERE id = $1', [req.userId]);
    await run(`
      INSERT INTO transactions (id, user_id, type, amount, status, description, gateway_type, gateway_invoice_id, gateway_pay_url, gateway_order_id, balance_before)
      VALUES ($1,$2,'deposit',$3,'pending','Пополнение RuKassa','rukassa',$4,$5,$6,$7)
    `, [crypto.randomUUID(), req.userId, amount, result.invoiceId, result.payUrl, orderId, user?.balance || 0]);

    res.json({ payUrl: result.payUrl, orderId });
  } catch (e) {
    console.error('Rukassa deposit error:', e);
    res.status(500).json({ error: 'Ошибка платёжной системы' });
  }
});

// ── POST /wallet/deposit/cryptocloud ─────────────────────────────────────────
router.post('/deposit/cryptocloud', auth, async (req, res) => {
  try {
    const amount = parseFloat(req.body.amount);
    if (!amount || amount < MIN_DEPOSIT) return res.status(400).json({ error: `Минимум $${MIN_DEPOSIT}` });

    const orderId = `cc_${req.userId}_${Date.now()}`;
    const result  = await cryptocloud.createInvoice({ amount, orderId });
    if (!result.ok) return res.status(502).json({ error: result.error });

    const user = await queryOne('SELECT balance FROM users WHERE id = $1', [req.userId]);
    await run(`
      INSERT INTO transactions (id, user_id, type, amount, status, description, gateway_type, gateway_invoice_id, gateway_pay_url, gateway_order_id, balance_before)
      VALUES ($1,$2,'deposit',$3,'pending','Пополнение CryptoCloud','cryptocloud',$4,$5,$6,$7)
    `, [crypto.randomUUID(), req.userId, amount, result.invoiceId, result.payUrl, orderId, user?.balance || 0]);

    res.json({ payUrl: result.payUrl, orderId });
  } catch (e) {
    console.error('CryptoCloud deposit error:', e);
    res.status(500).json({ error: 'Ошибка платёжной системы' });
  }
});

// ── POST /wallet/webhook/rukassa ──────────────────────────────────────────────
router.post('/webhook/rukassa', async (req, res) => {
  try {
    if (!rukassa.verifyWebhook(req.body)) {
      console.warn('Invalid RuKassa webhook signature');
      return res.status(400).send('Invalid signature');
    }
    const { order_id, status } = req.body;
    if (status !== 'success') return res.send('ok');

    const tx = await queryOne('SELECT * FROM transactions WHERE gateway_order_id = $1', [order_id]);
    if (!tx || tx.status === 'completed') return res.send('ok');

    await creditUser(tx);
    res.send('ok');
  } catch (e) {
    console.error('Rukassa webhook error:', e);
    res.status(500).send('error');
  }
});

// ── POST /wallet/webhook/cryptocloud ─────────────────────────────────────────
router.post('/webhook/cryptocloud', async (req, res) => {
  try {
    if (!cryptocloud.verifyWebhook(req.body)) return res.status(400).send('Invalid');
    const { order_id, status } = req.body;
    if (status !== 'success') return res.send('ok');

    const tx = await queryOne('SELECT * FROM transactions WHERE gateway_order_id = $1', [order_id]);
    if (!tx || tx.status === 'completed') return res.send('ok');

    await creditUser(tx);
    res.send('ok');
  } catch (e) {
    console.error('CryptoCloud webhook error:', e);
    res.status(500).send('error');
  }
});

// ── POST /wallet/withdraw ─────────────────────────────────────────────────────
router.post('/withdraw', auth, async (req, res) => {
  try {
    const { amount, address, currency = 'USDT' } = req.body;
    const amt = parseFloat(amount);
    if (!amt || amt < 5)        return res.status(400).json({ error: 'Минимальный вывод $5' });
    if (!address?.trim())       return res.status(400).json({ error: 'Укажите адрес/тег CryptoBot' });

    const user = await queryOne('SELECT * FROM users WHERE id = $1', [req.userId]);
    if (parseFloat(user.balance) < amt) return res.status(400).json({ error: 'Недостаточно средств' });

    await transaction(async (client) => {
      await client.query(
        `UPDATE users SET balance = balance - $1, total_withdrawn = total_withdrawn + $1 WHERE id = $2`,
        [amt, req.userId]
      );
      await client.query(`
        INSERT INTO transactions (id, user_id, type, amount, status, description, balance_before, balance_after)
        VALUES ($1,$2,'withdrawal',$3,'pending',$4,$5,$6)
      `, [crypto.randomUUID(), req.userId, amt, `Вывод ${currency} → ${address}`,
          user.balance, parseFloat(user.balance) - amt]);
    });

    notify.notifyWithdraw(user, amt, currency).catch(() => {});

    const admins = await queryAll('SELECT telegram_id FROM users WHERE is_admin = 1 AND telegram_id IS NOT NULL');
    admins.forEach(a => {
      notify.sendTg(a.telegram_id,
        `💸 <b>Запрос на вывод</b>\n\n@${user.username}: $${amt.toFixed(2)} ${currency}\nАдрес: <code>${address}</code>`
      ).catch(() => {});
    });

    res.json({ ok: true, message: 'Запрос на вывод создан. Обработка в течение 24ч.' });
  } catch (e) {
    console.error('Withdraw error:', e);
    res.status(500).json({ error: 'Ошибка' });
  }
});

// ── Internal: creditUser ───────────────────────────────────────────────────────
async function creditUser(tx) {
  await transaction(async (client) => {
    const userRes = await client.query('SELECT * FROM users WHERE id = $1', [tx.user_id]);
    const user    = userRes.rows[0];
    const newBal  = parseFloat(user.balance) + parseFloat(tx.amount);

    await client.query(
      `UPDATE users SET balance = $1, total_deposited = total_deposited + $2 WHERE id = $3`,
      [newBal, parseFloat(tx.amount), tx.user_id]
    );
    await client.query(
      `UPDATE transactions SET status = 'completed', balance_before = $1, balance_after = $2 WHERE id = $3`,
      [user.balance, newBal, tx.id]
    );
    notify.notifyDeposit({ ...user, balance: newBal }, tx.amount, tx.gateway_type, tx.gateway_type).catch(() => {});
  });
}

module.exports = router;
