const router  = require('express').Router();
const crypto  = require('crypto');
const { queryOne, queryAll, run, transaction } = require('../models/db');
const { auth } = require('../middleware/auth');
const notify  = require('../utils/notify');

// ── GET /messages — список диалогов ──────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const dialogs = await queryAll(`
      SELECT DISTINCT ON (
        CASE WHEN m.sender_id = $1 THEN m.receiver_id ELSE m.sender_id END
      )
        CASE WHEN m.sender_id = $1 THEN m.receiver_id ELSE m.sender_id END as partner_id,
        u.username as partner_username,
        u.photo_url as partner_photo,
        u.is_verified as partner_verified,
        m.text as last_text,
        m.created_at as last_time,
        m.sender_id as last_sender_id,
        (SELECT COUNT(*) FROM messages m2
          WHERE m2.receiver_id = $1
            AND m2.sender_id = CASE WHEN m.sender_id = $1 THEN m.receiver_id ELSE m.sender_id END
            AND m2.is_read = 0) as unread_count
      FROM messages m
      LEFT JOIN users u ON u.id = CASE WHEN m.sender_id = $1 THEN m.receiver_id ELSE m.sender_id END
      WHERE m.sender_id = $1 OR m.receiver_id = $1
      ORDER BY
        CASE WHEN m.sender_id = $1 THEN m.receiver_id ELSE m.sender_id END,
        m.created_at DESC
    `, [req.userId]);

    res.json({ dialogs });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка' });
  }
});

// ── GET /messages/:userId — переписка с пользователем ────────────────────────
router.get('/:userId', auth, async (req, res) => {
  try {
    const partnerId = req.params.userId;
    const partner   = await queryOne('SELECT id, username, photo_url, is_verified, rating, total_sales FROM users WHERE id = $1', [partnerId]);
    if (!partner) return res.status(404).json({ error: 'Пользователь не найден' });

    const messages = await queryAll(`
      SELECT m.*, 
        su.username as sender_username
      FROM messages m
      LEFT JOIN users su ON su.id = m.sender_id
      WHERE (m.sender_id = $1 AND m.receiver_id = $2)
         OR (m.sender_id = $2 AND m.receiver_id = $1)
      ORDER BY m.created_at ASC
      LIMIT 100
    `, [req.userId, partnerId]);

    // Помечаем сообщения как прочитанные
    await run(
      `UPDATE messages SET is_read = 1 WHERE receiver_id = $1 AND sender_id = $2 AND is_read = 0`,
      [req.userId, partnerId]
    );

    res.json({ partner, messages });
  } catch (e) {
    res.status(500).json({ error: 'Ошибка' });
  }
});

// ── POST /messages/:userId — отправить сообщение ─────────────────────────────
router.post('/:userId', auth, async (req, res) => {
  try {
    const receiverId = req.params.userId;
    const { text }   = req.body;

    if (!text?.trim())        return res.status(400).json({ error: 'Пустое сообщение' });
    if (text.length > 2000)   return res.status(400).json({ error: 'Слишком длинное' });
    if (receiverId === req.userId) return res.status(400).json({ error: 'Нельзя писать себе' });

    const receiver = await queryOne('SELECT id, username, telegram_id FROM users WHERE id = $1', [receiverId]);
    if (!receiver) return res.status(404).json({ error: 'Пользователь не найден' });

    const sender = await queryOne('SELECT username FROM users WHERE id = $1', [req.userId]);

    const msgId = crypto.randomUUID();
    await run(
      `INSERT INTO messages (id, sender_id, receiver_id, text) VALUES ($1,$2,$3,$4)`,
      [msgId, req.userId, receiverId, text.trim()]
    );

    const msg = await queryOne('SELECT * FROM messages WHERE id = $1', [msgId]);

    // Уведомление в Telegram получателю
    if (receiver.telegram_id) {
      notify.sendTg(receiver.telegram_id,
        `💬 <b>Новое сообщение</b>\n\n` +
        `От: @${sender.username}\n` +
        `${text.slice(0, 100)}${text.length > 100 ? '...' : ''}\n\n` +
        `Откройте сайт чтобы ответить.`
      ).catch(() => {});
    }

    res.status(201).json({ message: msg });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка' });
  }
});

// ── GET /messages/unread/count — количество непрочитанных ────────────────────
router.get('/unread/count', auth, async (req, res) => {
  try {
    const result = await queryOne(
      `SELECT COUNT(*) as c FROM messages WHERE receiver_id = $1 AND is_read = 0`,
      [req.userId]
    );
    res.json({ count: parseInt(result.c) || 0 });
  } catch (e) {
    res.status(500).json({ error: 'Ошибка' });
  }
});

module.exports = router;
