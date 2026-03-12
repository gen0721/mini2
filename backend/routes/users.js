const router  = require('express').Router();
const { queryOne, queryAll, run } = require('../models/db');
const { auth } = require('../middleware/auth');
const { sanitizeUser } = require('./auth');

// ── GET /users/:id — Public profile ──────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const user = await queryOne('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    const reviews = await queryAll(`
      SELECT r.*, u.username as reviewer_username, p.title as product_title
      FROM reviews r
      LEFT JOIN users u    ON u.id = r.reviewer_id
      LEFT JOIN deals d    ON d.id = r.deal_id
      LEFT JOIN products p ON p.id = d.product_id
      WHERE r.reviewed_id = $1
      ORDER BY r.created_at DESC LIMIT 20
    `, [req.params.id]);

    const products = await queryAll(`
      SELECT id, title, price, category, status, views, images, created_at
      FROM products WHERE seller_id = $1 AND status = 'active'
      ORDER BY is_promoted DESC, created_at DESC LIMIT 12
    `, [req.params.id]);

    res.json({
      user: sanitizeUser(user),
      reviews: reviews.map(r => ({ ...r, _id: r.id, createdAt: new Date(r.created_at * 1000) })),
      products: products.map(p => ({
        ...p, _id: p.id, price: parseFloat(p.price),
        images: typeof p.images === 'string' ? JSON.parse(p.images || '[]') : (p.images || [])
      }))
    });
  } catch (e) {
    res.status(500).json({ error: 'Ошибка' });
  }
});

// ── PUT /users/me ─────────────────────────────────────────────────────────────
router.put('/me', auth, async (req, res) => {
  try {
    const { bio, firstName, lastName } = req.body;
    await run(
      'UPDATE users SET bio = $1, first_name = $2, last_name = $3 WHERE id = $4',
      [bio?.slice(0, 300) || null, firstName?.slice(0, 50) || null, lastName?.slice(0, 50) || null, req.userId]
    );
    const user = await queryOne('SELECT * FROM users WHERE id = $1', [req.userId]);
    res.json({ user: sanitizeUser(user) });
  } catch (e) {
    res.status(500).json({ error: 'Ошибка' });
  }
});

// ── GET /users/me/favorites ───────────────────────────────────────────────────
router.get('/me/favorites', auth, async (req, res) => {
  try {
    const products = await queryAll(`
      SELECT p.*, u.username as seller_username, u.rating as seller_rating
      FROM favorites f
      JOIN products p  ON p.id = f.product_id
      LEFT JOIN users u ON u.id = p.seller_id
      WHERE f.user_id = $1 AND p.status != 'deleted'
      ORDER BY f.created_at DESC
    `, [req.userId]);

    res.json({
      products: products.map(p => ({
        ...p, _id: p.id,
        images: typeof p.images === 'string' ? JSON.parse(p.images || '[]') : (p.images || []),
        price: parseFloat(p.price),
        seller: { username: p.seller_username, rating: p.seller_rating }
      }))
    });
  } catch (e) {
    res.status(500).json({ error: 'Ошибка' });
  }
});

module.exports = router;
