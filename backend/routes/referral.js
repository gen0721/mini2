'use strict';
const router  = require('express').Router();
const crypto  = require('crypto');
const { queryOne, queryAll, run } = require('../models/db');
const { auth } = require('../middleware/auth');

// Процент партнёра по умолчанию (можно менять в .env)
const PARTNER_PERCENT = () => parseInt(process.env.PARTNER_PERCENT || '10');

// ── GET /referral/link — получить свою реф.ссылку ────────────────────────────
router.get('/link', auth, async (req, res) => {
  try {
    const user = await queryOne('SELECT * FROM users WHERE id=$1', [req.userId]);
    if (!user.is_partner) return res.status(403).json({ error: 'Вы не являетесь партнёром' });

    const base = process.env.FRONTEND_URL || process.env.BACKEND_URL || '';
    const link = `${base}?ref=${user.ref_code}`;
    res.json({ link, ref_code: user.ref_code, percent: user.partner_percent });
  } catch(e) { res.status(500).json({ error: 'Ошибка' }); }
});

// ── GET /referral/stats — статистика партнёра ─────────────────────────────────
router.get('/stats', auth, async (req, res) => {
  try {
    const user = await queryOne('SELECT * FROM users WHERE id=$1', [req.userId]);
    if (!user.is_partner) return res.status(403).json({ error: 'Не партнёр' });

    const referred = await queryOne(
      'SELECT COUNT(*) as c FROM users WHERE ref_by=$1',
      [user.ref_code]
    );
    const rewards = await queryAll(
      'SELECT * FROM referral_rewards WHERE partner_id=$1 ORDER BY created_at DESC LIMIT 20',
      [req.userId]
    );
    const totalEarned = await queryOne(
      'SELECT COALESCE(SUM(amount),0) as t FROM referral_rewards WHERE partner_id=$1',
      [req.userId]
    );

    const base = process.env.FRONTEND_URL || process.env.BACKEND_URL || '';
    res.json({
      ref_code:      user.ref_code,
      ref_link:      `${base}?ref=${user.ref_code}`,
      percent:       user.partner_percent,
      referred_count: parseInt(referred.c),
      total_earned:  parseFloat(totalEarned.t),
      rewards,
    });
  } catch(e) { res.status(500).json({ error: 'Ошибка' }); }
});

// ── POST /referral/apply — применить реф.код при регистрации ─────────────────
// Вызывается автоматически при регистрации если есть ?ref= в URL
router.post('/apply', auth, async (req, res) => {
  try {
    const { ref_code } = req.body;
    if (!ref_code) return res.status(400).json({ error: 'Нет реф.кода' });

    const user = await queryOne('SELECT * FROM users WHERE id=$1', [req.userId]);
    if (user.ref_by) return res.status(400).json({ error: 'Реф.код уже применён' });

    const partner = await queryOne('SELECT * FROM users WHERE ref_code=$1 AND is_partner=1', [ref_code]);
    if (!partner) return res.status(404).json({ error: 'Реф.код не найден' });
    if (partner.id === req.userId) return res.status(400).json({ error: 'Нельзя использовать свой код' });

    await run('UPDATE users SET ref_by=$1 WHERE id=$2', [ref_code, req.userId]);
    res.json({ ok: true, partner: partner.username });
  } catch(e) { res.status(500).json({ error: 'Ошибка' }); }
});

module.exports = router;
