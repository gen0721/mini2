const router   = require('express').Router();
const crypto   = require('crypto');
const { queryOne, queryAll, run, transaction } = require('../models/db');
const { auth } = require('../middleware/auth');
const rukassa  = require('../utils/rukassa');
const cryptopay   = require('../utils/cryptopay');
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

// ── POST /wallet/deposit/cryptopay ───────────────────────────────────────────
router.post('/deposit/cryptopay', auth, async (req, res) => {
  try {
    const amount = parseFloat(req.body.amount);
    if (!amount || amount < MIN_DEPOSIT) return res.status(400).json({ error: `Минимум $${MIN_DEPOSIT}` });

    const orderId = `cp_${req.userId}_${Date.now()}`;
    const result  = await cryptopay.createInvoice({
      amount,
      orderId,
      description: `Пополнение Minions Market на $${amount}`,
    });
    if (!result.ok) return res.status(502).json({ error: result.error });

    const user = await queryOne('SELECT balance FROM users WHERE id = $1', [req.userId]);
    await run(`
      INSERT INTO transactions (id, user_id, type, amount, status, description, gateway_type, gateway_invoice_id, gateway_pay_url, gateway_order_id, balance_before)
      VALUES ($1,$2,'deposit',$3,'pending','Пополнение CryptoPay (Telegram)','cryptopay',$4,$5,$6,$7)
    `, [crypto.randomUUID(), req.userId, amount, result.invoiceId, result.payUrl, orderId, user?.balance || 0]);

    res.json({ payUrl: result.payUrl, orderId });
  } catch (e) {
    console.error('CryptoPay deposit error:', e);
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

// ── POST /wallet/webhook/cryptopay ───────────────────────────────────────────
router.post('/webhook/cryptopay', async (req, res) => {
  try {
    // Проверяем подпись
    const signature = req.headers['crypto-pay-api-signature'];
    if (!cryptopay.verifyWebhook(req.body, signature)) {
      console.warn('[CryptoPay] Invalid webhook signature');
      return res.status(400).send('Invalid signature');
    }

    const { update_type, payload: invoiceData } = req.body;
    if (update_type !== 'invoice_paid') return res.send('ok');

    // payload — наш orderId который мы передали при создании
    const orderId = invoiceData?.payload;
    if (!orderId) return res.send('ok');

    const tx = await queryOne('SELECT * FROM transactions WHERE gateway_order_id = $1', [orderId]);
    if (!tx || tx.status === 'completed') return res.send('ok');

    await creditUser(tx);
    res.send('ok');
  } catch (e) {
    console.error('CryptoPay webhook error:', e);
    res.status(500).send('error');
  }
});

// ── POST /wallet/withdraw ─────────────────────────────────────────────────────
const DAILY_WITHDRAW_LIMIT = parseFloat(process.env.DAILY_WITHDRAW_LIMIT || '500'); // $500 в день по умолчанию

router.post('/withdraw', auth, async (req, res) => {
  try {
    const { amount, address, currency = 'USDT' } = req.body;
    const amt = parseFloat(amount);
    if (!amt || amt < 5)    return res.status(400).json({ error: 'Минимальный вывод $5' });
    if (!address?.trim())   return res.status(400).json({ error: 'Укажите адрес/тег CryptoBot' });

    const user = await queryOne('SELECT * FROM users WHERE id = $1', [req.userId]);
    if (parseFloat(user.balance) < amt) return res.status(400).json({ error: 'Недостаточно средств' });

    // ── Лимит вывода за 24 часа ───────────────────────────────────────────────
    const since24h = Math.floor(Date.now() / 1000) - 86400;
    const withdrawn24h = await queryOne(
      `SELECT COALESCE(SUM(amount),0) as total FROM transactions
       WHERE user_id=$1 AND type='withdrawal' AND created_at>=$2`,
      [req.userId, since24h]
    );
    const alreadyWithdrawn = parseFloat(withdrawn24h.total) || 0;

    if (alreadyWithdrawn + amt > DAILY_WITHDRAW_LIMIT) {
      const remaining = Math.max(0, DAILY_WITHDRAW_LIMIT - alreadyWithdrawn);

      // Уведомляем тебя о попытке превысить лимит
      if (process.env.REPORT_CHAT_ID) {
        notify.sendTg(process.env.REPORT_CHAT_ID,
          `⚠️ <b>Превышение лимита вывода</b>\n\n` +
          `👤 @${user.username}\n` +
          `💰 Пытается вывести: $${amt.toFixed(2)}\n` +
          `📊 Уже выведено за 24ч: $${alreadyWithdrawn.toFixed(2)}\n` +
          `🔒 Лимит: $${DAILY_WITHDRAW_LIMIT}\n` +
          `✅ Доступно к выводу: $${remaining.toFixed(2)}`
        ).catch(() => {});
      }

      return res.status(400).json({
        error: `Превышен дневной лимит вывода $${DAILY_WITHDRAW_LIMIT}. Уже выведено: $${alreadyWithdrawn.toFixed(2)}. Доступно: $${remaining.toFixed(2)}`
      });
    }

    // ── Подозрительный вывод — новый IP + крупная сумма ──────────────────────
    const { getIp } = require('../utils/securityLog');
    const currentIp  = getIp(req);
    const isSuspicious = user.last_ip && user.last_ip !== currentIp && amt >= 50;

    if (isSuspicious) {
      // Уведомляем тебя СРАЗУ
      if (process.env.REPORT_CHAT_ID) {
        notify.sendTg(process.env.REPORT_CHAT_ID,
          `🚨 <b>Подозрительный вывод!</b>\n\n` +
          `👤 @${user.username}\n` +
          `💰 Сумма: $${amt.toFixed(2)}\n` +
          `📍 Обычный IP: <code>${user.last_ip}</code>\n` +
          `📍 Текущий IP: <code>${currentIp}</code>\n\n` +
          `⚠️ Вывод с нового IP — возможный взлом аккаунта!`
        ).catch(() => {});
      }
      // Уведомляем пользователя
      if (user.telegram_id) {
        notify.sendTg(user.telegram_id,
          `🚨 <b>Подозрительная активность!</b>\n\n` +
          `Запрос на вывод $${amt.toFixed(2)} с нового устройства.\n\n` +
          `Если это не вы — немедленно смените пароль!`
        ).catch(() => {});
      }
    }

    await transaction(async (client) => {
      await client.query(
        `UPDATE users SET balance = balance - $1, total_withdrawn = total_withdrawn + $1 WHERE id = $2`,
        [amt, req.userId]
      );
      await client.query(`
        INSERT INTO transactions (id, user_id, type, amount, status, description, balance_before, balance_after)
        VALUES ($1,$2,'withdrawal',$3,'pending',$4,$5,$6)
      `, [crypto.randomUUID(), req.userId, amt,
          `Вывод ${currency} → ${address}`,
          user.balance, parseFloat(user.balance) - amt]);
    });

    notify.notifyWithdraw(user, amt, currency).catch(() => {});

    // Уведомляем тебя о каждом выводе
    if (process.env.REPORT_CHAT_ID) {
      notify.sendTg(process.env.REPORT_CHAT_ID,
        `💸 <b>Запрос на вывод</b>\n\n` +
        `👤 @${user.username}\n` +
        `💰 Сумма: $${amt.toFixed(2)} ${currency}\n` +
        `📍 IP: <code>${currentIp}</code>\n` +
        `📊 Выведено за 24ч: $${(alreadyWithdrawn + amt).toFixed(2)} / $${DAILY_WITHDRAW_LIMIT}\n` +
        `🏦 Адрес: <code>${address}</code>`
      ).catch(() => {});
    }

    res.json({ ok: true, message: `Запрос на вывод создан. Обработка в течение 24ч.` });
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
