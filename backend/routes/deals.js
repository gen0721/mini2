const router  = require('express').Router();
const crypto  = require('crypto');
const { queryOne, queryAll, run, transaction } = require('../models/db');
const { auth } = require('../middleware/auth');
const notify  = require('../utils/notify');

const COMMISSION_RATE     = 0.05;
const AUTO_COMPLETE_HOURS = 72;

function parseDeal(d) {
  if (!d) return null;
  d._id          = d.id;
  d.amount       = parseFloat(d.amount);
  d.sellerAmount = parseFloat(d.seller_amount);
  d.commission   = parseFloat(d.commission);
  d.deliveryData = d.delivery_data;
  d.deliveredAt  = d.delivered_at  ? new Date(d.delivered_at  * 1000) : null;
  d.autoCompleteAt = d.auto_complete_at ? new Date(d.auto_complete_at * 1000) : null;
  d.buyerConfirmed  = !!d.buyer_confirmed;
  d.sellerConfirmed = !!d.seller_confirmed;
  d.createdAt    = new Date(d.created_at * 1000);
  d.updatedAt    = new Date(d.updated_at * 1000);

  if (d.product_title !== undefined) {
    d.product = { _id: d.product_id, id: d.product_id, title: d.product_title, price: d.product_price };
  }
  if (d.buyer_username !== undefined) {
    d.buyer  = { _id: d.buyer_id,  id: d.buyer_id,  username: d.buyer_username,  firstName: d.buyer_first_name };
    d.seller = { _id: d.seller_id, id: d.seller_id, username: d.seller_username, firstName: d.seller_first_name };
  }

  try { d.messages = JSON.parse(d.messages_raw || '[]').map(m => ({
    sender: m.sender, text: m.text, isSystem: !!m.isSystem,
    timestamp: new Date(m.timestamp * 1000)
  })); } catch { d.messages = []; }

  ['product_title','product_price','buyer_username','buyer_first_name',
   'seller_username','seller_first_name','delivery_data','delivered_at',
   'auto_complete_at','buyer_confirmed','seller_confirmed','seller_amount',
   'messages_raw'].forEach(k => delete d[k]);
  return d;
}

const DEAL_SELECT = `
  SELECT d.*,
    p.title   as product_title,
    p.price   as product_price,
    b.username   as buyer_username,  b.first_name as buyer_first_name,
    s.username   as seller_username, s.first_name as seller_first_name,
    (SELECT json_agg(json_build_object(
      'sender', dm.sender_id, 'text', dm.text,
      'isSystem', dm.is_system::boolean, 'timestamp', dm.created_at
    ) ORDER BY dm.created_at ASC) FROM deal_messages dm WHERE dm.deal_id = d.id) as messages_raw
  FROM deals d
  LEFT JOIN products p ON p.id = d.product_id
  LEFT JOIN users b    ON b.id = d.buyer_id
  LEFT JOIN users s    ON s.id = d.seller_id
`;

async function addSystemMessage(client, dealId, text) {
  await client.query(
    `INSERT INTO deal_messages (deal_id, is_system, text) VALUES ($1, 1, $2)`,
    [dealId, text]
  );
}

// ── GET /deals ────────────────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const { role = 'all' } = req.query;
    let condition, params;
    if (role === 'buyer')       { condition = 'WHERE d.buyer_id = $1';  params = [req.userId]; }
    else if (role === 'seller') { condition = 'WHERE d.seller_id = $1'; params = [req.userId]; }
    else                        { condition = 'WHERE d.buyer_id = $1 OR d.seller_id = $1'; params = [req.userId]; }

    const deals = await queryAll(`${DEAL_SELECT} ${condition} ORDER BY d.created_at DESC LIMIT 50`, params);
    res.json(deals.map(parseDeal));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка' });
  }
});

// ── GET /deals/:id ────────────────────────────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const deal = await queryOne(`${DEAL_SELECT} WHERE d.id = $1`, [req.params.id]);
    if (!deal) return res.status(404).json({ error: 'Сделка не найдена' });
    if (deal.buyer_id !== req.userId && deal.seller_id !== req.userId && !req.user.is_admin) {
      return res.status(403).json({ error: 'Нет доступа' });
    }
    const parsed = parseDeal(deal);
    if (deal.buyer_id !== req.userId) delete parsed.deliveryData;
    res.json(parsed);
  } catch (e) {
    res.status(500).json({ error: 'Ошибка' });
  }
});

// ── POST /deals — Create deal ─────────────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  try {
    const { productId } = req.body;
    const product = await queryOne(`SELECT * FROM products WHERE id = $1 AND status = 'active'`, [productId]);
    if (!product)                           return res.status(404).json({ error: 'Товар не найден или недоступен' });
    if (product.seller_id === req.userId)   return res.status(400).json({ error: 'Нельзя купить свой товар' });

    const buyer = await queryOne('SELECT * FROM users WHERE id = $1', [req.userId]);
    if (parseFloat(buyer.balance) < parseFloat(product.price)) {
      return res.status(400).json({ error: `Недостаточно средств. Ваш баланс: $${parseFloat(buyer.balance).toFixed(2)}` });
    }

    const seller       = await queryOne('SELECT * FROM users WHERE id = $1', [product.seller_id]);
    const amount       = parseFloat(product.price);
    const commission   = Math.round(amount * COMMISSION_RATE * 100) / 100;
    const sellerAmount = Math.round((amount - commission) * 100) / 100;
    const dealId       = crypto.randomUUID();
    const autoComplete = Math.floor(Date.now() / 1000) + AUTO_COMPLETE_HOURS * 3600;

    await transaction(async (client) => {
      await client.query(
        `UPDATE users SET balance = balance - $1, frozen_balance = frozen_balance + $1 WHERE id = $2`,
        [amount, req.userId]
      );
      await client.query(`UPDATE products SET status = 'frozen' WHERE id = $1`, [productId]);
      await client.query(`
        INSERT INTO deals (id, buyer_id, seller_id, product_id, amount, seller_amount, commission, status, auto_complete_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,'active',$8)
      `, [dealId, req.userId, product.seller_id, productId, amount, sellerAmount, commission, autoComplete]);
      await client.query(`
        INSERT INTO transactions (id, user_id, type, amount, status, description, deal_id, balance_before, balance_after)
        VALUES ($1,$2,'purchase',$3,'completed',$4,$5,$6,$7)
      `, [crypto.randomUUID(), req.userId, amount, `Покупка: ${product.title}`, dealId,
          buyer.balance, parseFloat(buyer.balance) - amount]);
      await addSystemMessage(client, dealId, `✅ Сделка открыта. Покупатель зарезервировал $${amount.toFixed(2)}.`);
    });

    notify.notifyPurchase(buyer, seller, product.title, amount).catch(() => {});
    const deal = await queryOne(`${DEAL_SELECT} WHERE d.id = $1`, [dealId]);
    res.status(201).json(parseDeal(deal));
  } catch (e) {
    console.error('Create deal error:', e);
    res.status(500).json({ error: 'Ошибка создания сделки' });
  }
});

// ── POST /deals/:id/deliver ───────────────────────────────────────────────────
router.post('/:id/deliver', auth, async (req, res) => {
  try {
    const deal = await queryOne('SELECT * FROM deals WHERE id = $1', [req.params.id]);
    if (!deal)                          return res.status(404).json({ error: 'Не найдена' });
    if (deal.seller_id !== req.userId)  return res.status(403).json({ error: 'Нет доступа' });
    if (deal.status !== 'active')       return res.status(400).json({ error: 'Сделка не активна' });
    if (deal.delivered_at)              return res.status(400).json({ error: 'Товар уже передан' });

    const { deliveryData } = req.body;
    if (!deliveryData?.trim()) return res.status(400).json({ error: 'Введите данные товара' });

    const newAutoComplete = Math.floor(Date.now() / 1000) + AUTO_COMPLETE_HOURS * 3600;
    await run(
      `UPDATE deals SET delivery_data = $1, delivered_at = EXTRACT(EPOCH FROM NOW())::BIGINT,
       auto_complete_at = $2, updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT WHERE id = $3`,
      [deliveryData.trim(), newAutoComplete, req.params.id]
    );

    await transaction(async (client) => {
      await addSystemMessage(client, req.params.id, `📦 Продавец передал товар. Проверьте и подтвердите получение в течение 72 часов.`);
    });

    const buyer   = await queryOne('SELECT * FROM users WHERE id = $1', [deal.buyer_id]);
    const product = await queryOne('SELECT title FROM products WHERE id = $1', [deal.product_id]);
    if (buyer?.telegram_id) notify.notifyMessage(buyer, 'Продавец', product?.title || 'Сделка').catch(() => {});

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Ошибка' });
  }
});

// ── POST /deals/:id/confirm ───────────────────────────────────────────────────
router.post('/:id/confirm', auth, async (req, res) => {
  try {
    const deal = await queryOne('SELECT * FROM deals WHERE id = $1', [req.params.id]);
    if (!deal)                         return res.status(404).json({ error: 'Не найдена' });
    if (deal.buyer_id !== req.userId)  return res.status(403).json({ error: 'Нет доступа' });
    if (deal.status !== 'active')      return res.status(400).json({ error: 'Сделка не активна' });

    await completeDeal(deal, 'buyer_confirm');
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка завершения сделки' });
  }
});


// ── POST /deals/:id/refund ────────────────────────────────────────────────────
router.post('/:id/refund', auth, async (req, res) => {
  try {
    const deal = await queryOne('SELECT * FROM deals WHERE id = $1', [req.params.id]);
    if (!deal)                         return res.status(404).json({ error: 'Не найдена' });
    if (deal.seller_id !== req.userId)  return res.status(403).json({ error: 'Только продавец может вернуть деньги' });
    if (deal.status !== 'active')       return res.status(400).json({ error: 'Нельзя выполнить возврат' });

    const { reason } = req.body;
    await transaction(async (client) => {
      // Возвращаем деньги покупателю
      await client.query(
        `UPDATE users SET balance = balance + $1, frozen_balance = frozen_balance - $1 WHERE id = $2`,
        [deal.amount, deal.buyer_id]
      );
      // Размораживаем товар
      await client.query(`UPDATE products SET status = 'active' WHERE id = $1`, [deal.product_id]);
      // Закрываем сделку
      await client.query(
        `UPDATE deals SET status = 'refunded', updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT WHERE id = $1`,
        [deal.id]
      );
      await client.query(`
        INSERT INTO transactions (id, user_id, type, amount, status, description, deal_id)
        VALUES ($1,$2,'refund',$3,'completed',$4,$5)
      `, [crypto.randomUUID(), deal.buyer_id, deal.amount, `Возврат: ${reason||'возврат от продавца'}`, deal.id]);
      await addSystemMessage(client, deal.id, `↩ Продавец вернул деньги покупателю.`);
    });

    const [buyer, seller, product] = await Promise.all([
      queryOne('SELECT * FROM users WHERE id = $1', [deal.buyer_id]),
      queryOne('SELECT * FROM users WHERE id = $1', [deal.seller_id]),
      queryOne('SELECT title FROM products WHERE id = $1', [deal.product_id]),
    ]);
    notify.notifyDealDispute && notify.notifyDealDispute(buyer, seller, product?.title||'').catch(() => {});

    res.json({ ok: true });
  } catch (e) {
    console.error('Refund error:', e);
    res.status(500).json({ error: e.message || 'Ошибка возврата' });
  }
});

// ── POST /deals/:id/dispute ───────────────────────────────────────────────────
router.post('/:id/dispute', auth, async (req, res) => {
  try {
    const deal = await queryOne('SELECT * FROM deals WHERE id = $1', [req.params.id]);
    if (!deal)                         return res.status(404).json({ error: 'Не найдена' });
    if (deal.buyer_id !== req.userId)  return res.status(403).json({ error: 'Нет доступа' });
    if (deal.status !== 'active')      return res.status(400).json({ error: 'Нельзя открыть спор' });
    if (!deal.delivered_at)            return res.status(400).json({ error: 'Товар ещё не передан' });

    const { reason } = req.body;
    await run(
      `UPDATE deals SET status = 'disputed', dispute_reason = $1, updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT WHERE id = $2`,
      [reason || 'Без причины', req.params.id]
    );
    await transaction(async (client) => {
      await addSystemMessage(client, req.params.id, `⚠️ Покупатель открыл спор: "${reason || '—'}". Администратор рассмотрит в течение 24ч.`);
    });

    const [buyer, seller, product] = await Promise.all([
      queryOne('SELECT * FROM users WHERE id = $1', [deal.buyer_id]),
      queryOne('SELECT * FROM users WHERE id = $1', [deal.seller_id]),
      queryOne('SELECT title FROM products WHERE id = $1', [deal.product_id]),
    ]);
    notify.notifyDealDispute(buyer, seller, product?.title || '').catch(() => {});

    const admins = await queryAll('SELECT telegram_id FROM users WHERE is_admin = 1 AND telegram_id IS NOT NULL');
    admins.forEach(a => {
      notify.sendTg(a.telegram_id,
        `🚨 <b>Новый спор!</b>\n\nТовар: ${product?.title}\nПокупатель: @${buyer.username}\nПродавец: @${seller.username}\nПричина: ${reason}`
      ).catch(() => {});
    });

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Ошибка' });
  }
});

// ── POST /deals/:id/message ───────────────────────────────────────────────────
router.post('/:id/message', auth, async (req, res) => {
  try {
    const deal = await queryOne('SELECT * FROM deals WHERE id = $1', [req.params.id]);
    if (!deal) return res.status(404).json({ error: 'Не найдена' });
    if (deal.buyer_id !== req.userId && deal.seller_id !== req.userId) {
      return res.status(403).json({ error: 'Нет доступа' });
    }
    if (!['active', 'disputed'].includes(deal.status)) {
      return res.status(400).json({ error: 'Нельзя писать в закрытой сделке' });
    }
    const { text } = req.body;
    if (!text?.trim())    return res.status(400).json({ error: 'Пустое сообщение' });
    if (text.length > 2000) return res.status(400).json({ error: 'Сообщение слишком длинное' });

    await run(
      `INSERT INTO deal_messages (deal_id, sender_id, text) VALUES ($1,$2,$3)`,
      [req.params.id, req.userId, text.trim()]
    );

    const otherId = deal.buyer_id === req.userId ? deal.seller_id : deal.buyer_id;
    const [other, sender, product] = await Promise.all([
      queryOne('SELECT * FROM users WHERE id = $1', [otherId]),
      queryOne('SELECT username FROM users WHERE id = $1', [req.userId]),
      queryOne('SELECT title FROM products WHERE id = $1', [deal.product_id]),
    ]);
    if (other?.telegram_id) {
      notify.notifyMessage(other, '@' + (sender?.username || '?'), product?.title || 'Сделка').catch(() => {});
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Ошибка' });
  }
});

// ── POST /deals/:id/review ────────────────────────────────────────────────────
router.post('/:id/review', auth, async (req, res) => {
  try {
    const deal = await queryOne('SELECT * FROM deals WHERE id = $1', [req.params.id]);
    if (!deal)                         return res.status(404).json({ error: 'Не найдена' });
    if (deal.buyer_id !== req.userId)  return res.status(403).json({ error: 'Только покупатель может оставить отзыв' });
    if (deal.status !== 'completed')   return res.status(400).json({ error: 'Сделка не завершена' });

    const existing = await queryOne('SELECT id FROM reviews WHERE deal_id = $1', [req.params.id]);
    if (existing) return res.status(409).json({ error: 'Отзыв уже оставлен' });

    const { rating, text } = req.body;
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Оценка от 1 до 5' });

    await run(
      `INSERT INTO reviews (id, deal_id, reviewer_id, reviewed_id, rating, text) VALUES ($1,$2,$3,$4,$5,$6)`,
      [crypto.randomUUID(), req.params.id, req.userId, deal.seller_id, parseInt(rating), text?.slice(0, 500) || null]
    );

    const stats = await queryOne(`SELECT AVG(rating) as avg, COUNT(*) as cnt FROM reviews WHERE reviewed_id = $1`, [deal.seller_id]);
    await run('UPDATE users SET rating = $1, review_count = $2 WHERE id = $3',
      [Math.round(parseFloat(stats.avg) * 10) / 10, parseInt(stats.cnt), deal.seller_id]);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Ошибка' });
  }
});

// ── Internal: completeDeal ─────────────────────────────────────────────────────
async function payReferralReward(sellerId, dealId, dealAmount) {
  try {
    const seller = await queryOne('SELECT ref_by FROM users WHERE id=$1', [sellerId]);
    if (!seller?.ref_by) return;
    const partner = await queryOne('SELECT id, partner_percent FROM users WHERE ref_code=$1 AND is_partner=1', [seller.ref_by]);
    if (!partner) return;
    const reward = Math.round(dealAmount * (partner.partner_percent || 10) / 100 * 100) / 100;
    if (reward <= 0) return;
    await run('INSERT INTO referral_rewards (id, partner_id, referred_user_id, deal_id, amount) VALUES ($1,$2,$3,$4,$5)',
      [require('crypto').randomUUID(), partner.id, sellerId, dealId, reward]);
    await run('UPDATE users SET partner_earned=partner_earned+$1, balance=balance+$1 WHERE id=$2', [reward, partner.id]);
    const notify = require('../utils/notify');
    const p = await queryOne('SELECT telegram_id FROM users WHERE id=$1', [partner.id]);
    if (p?.telegram_id) {
      notify.sendTg(p.telegram_id,
        '💰 <b>Реферальное вознаграждение!</b>\n\n+$' + reward.toFixed(2) + ' за сделку вашего реферала\nСумма сделки: $' + dealAmount
      ).catch(() => {});
    }
  } catch(e) { console.error('[Referral]', e.message); }
}

async function completeDeal(deal, reason = 'auto') {
  await transaction(async (client) => {
    const [seller, buyer, product] = await Promise.all([
      client.query('SELECT * FROM users WHERE id = $1', [deal.seller_id]).then(r => r.rows[0]),
      client.query('SELECT * FROM users WHERE id = $1', [deal.buyer_id]).then(r => r.rows[0]),
      client.query('SELECT title FROM products WHERE id = $1', [deal.product_id]).then(r => r.rows[0]),
    ]);
    const sellerAmount = parseFloat(deal.seller_amount);
    const amount       = parseFloat(deal.amount);

    await client.query(
      `UPDATE users SET balance = balance + $1, frozen_balance = frozen_balance - $2, total_sales = total_sales + 1 WHERE id = $3`,
      [sellerAmount, amount, deal.seller_id]
    );
    await client.query(
      `UPDATE users SET frozen_balance = frozen_balance - $1, total_purchases = total_purchases + 1 WHERE id = $2`,
      [amount, deal.buyer_id]
    );
    await client.query(`UPDATE products SET status = 'sold' WHERE id = $1`, [deal.product_id]);
    await client.query(
      `UPDATE deals SET status = 'completed', buyer_confirmed = 1, updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT WHERE id = $1`,
      [deal.id]
    );
    await client.query(`
      INSERT INTO transactions (id, user_id, type, amount, status, description, deal_id, balance_before, balance_after)
      VALUES ($1,$2,'sale',$3,'completed',$4,$5,$6,$7)
    `, [crypto.randomUUID(), deal.seller_id, sellerAmount, `Продажа: ${product?.title}`,
        deal.id, seller.balance, parseFloat(seller.balance) + sellerAmount]);
    await client.query(`
      INSERT INTO transactions (id, user_id, type, amount, status, description, deal_id)
      VALUES ($1,$2,'commission',$3,'completed',$4,$5)
    `, [crypto.randomUUID(), deal.seller_id, deal.commission, `Комиссия 5%: ${product?.title}`, deal.id]);

    await addSystemMessage(client, deal.id, reason === 'auto'
      ? `✅ Сделка автоматически завершена (72ч без спора). Деньги переведены продавцу.`
      : `✅ Покупатель подтвердил получение. Деньги переведены продавцу.`
    );

    notify.notifyDealComplete(buyer, seller, product?.title || '', sellerAmount).catch(() => {});
  });
}

module.exports = router;
module.exports.completeDeal = completeDeal;
