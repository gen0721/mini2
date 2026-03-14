/**
 * PostgreSQL database — single source of truth
 */
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// ── Helper: run query ──────────────────────────────────────────────────────────
async function query(text, params) {
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return res;
  } finally {
    client.release();
  }
}

// ── Helper: get one row ────────────────────────────────────────────────────────
async function queryOne(text, params) {
  const res = await query(text, params);
  return res.rows[0] || null;
}

// ── Helper: get all rows ───────────────────────────────────────────────────────
async function queryAll(text, params) {
  const res = await query(text, params);
  return res.rows;
}

// ── Helper: run without return ─────────────────────────────────────────────────
async function run(text, params) {
  return await query(text, params);
}

// ── Transaction helper ─────────────────────────────────────────────────────────
async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ── Init schema ────────────────────────────────────────────────────────────────
async function initSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      username        TEXT UNIQUE,
      password        TEXT,
      telegram_id     TEXT UNIQUE,
      otp_code        TEXT,
      otp_expires     BIGINT,
      otp_used        INTEGER DEFAULT 0,
      first_name      TEXT,
      last_name       TEXT,
      photo_url       TEXT,
      bio             TEXT,
      balance         NUMERIC(12,2) DEFAULT 0,
      frozen_balance  NUMERIC(12,2) DEFAULT 0,
      total_deposited NUMERIC(12,2) DEFAULT 0,
      total_withdrawn NUMERIC(12,2) DEFAULT 0,
      total_sales     INTEGER DEFAULT 0,
      total_purchases INTEGER DEFAULT 0,
      rating          NUMERIC(3,1) DEFAULT 5.0,
      review_count    INTEGER DEFAULT 0,
      is_admin        INTEGER DEFAULT 0,
      is_sub_admin    INTEGER DEFAULT 0,
      is_verified     INTEGER DEFAULT 0,
      is_banned       INTEGER DEFAULT 0,
      banned_until    BIGINT,
      ban_reason      TEXT,
      reset_code      TEXT,
      reset_expires   BIGINT,
      created_at      BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
      last_active     BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
    );

    CREATE TABLE IF NOT EXISTS categories (
      id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      name       TEXT NOT NULL,
      slug       TEXT NOT NULL UNIQUE,
      icon       TEXT,
      parent_id  TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active  INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS products (
      id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      seller_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title          TEXT NOT NULL,
      description    TEXT NOT NULL,
      price          NUMERIC(12,2) NOT NULL,
      category       TEXT NOT NULL,
      subcategory    TEXT,
      images         TEXT DEFAULT '[]',
      delivery_data  TEXT,
      delivery_type  TEXT DEFAULT 'manual',
      game           TEXT,
      server         TEXT,
      status         TEXT DEFAULT 'active',
      views          INTEGER DEFAULT 0,
      tags           TEXT DEFAULT '[]',
      is_promoted    INTEGER DEFAULT 0,
      promoted_until BIGINT,
      created_at     BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
      updated_at     BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
    );

    CREATE TABLE IF NOT EXISTS favorites (
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
      PRIMARY KEY (user_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS deals (
      id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      buyer_id         TEXT NOT NULL REFERENCES users(id),
      seller_id        TEXT NOT NULL REFERENCES users(id),
      product_id       TEXT NOT NULL REFERENCES products(id),
      amount           NUMERIC(12,2) NOT NULL,
      seller_amount    NUMERIC(12,2) NOT NULL,
      commission       NUMERIC(12,2) NOT NULL,
      status           TEXT DEFAULT 'pending',
      delivery_data    TEXT,
      delivered_at     BIGINT,
      buyer_confirmed  INTEGER DEFAULT 0,
      seller_confirmed INTEGER DEFAULT 0,
      auto_complete_at BIGINT,
      admin_note       TEXT,
      resolved_by      TEXT,
      resolved_at      BIGINT,
      dispute_reason   TEXT,
      created_at       BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
      updated_at       BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
    );

    CREATE TABLE IF NOT EXISTS deal_messages (
      id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      deal_id    TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      sender_id  TEXT REFERENCES users(id),
      text       TEXT,
      is_system  INTEGER DEFAULT 0,
      created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id                 TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id            TEXT NOT NULL REFERENCES users(id),
      type               TEXT NOT NULL,
      amount             NUMERIC(12,2) NOT NULL,
      currency           TEXT DEFAULT 'USD',
      status             TEXT DEFAULT 'pending',
      description        TEXT,
      deal_id            TEXT REFERENCES deals(id),
      gateway_type       TEXT,
      gateway_invoice_id TEXT,
      gateway_pay_url    TEXT,
      gateway_order_id   TEXT UNIQUE,
      balance_before     NUMERIC(12,2),
      balance_after      NUMERIC(12,2),
      created_at         BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
    );

    CREATE TABLE IF NOT EXISTS security_logs (
      id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      event      TEXT NOT NULL,
      ip         TEXT,
      user_id    TEXT,
      username   TEXT,
      details    TEXT,
      created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
    );

    CREATE INDEX IF NOT EXISTS idx_security_logs_ip ON security_logs(ip);
    CREATE INDEX IF NOT EXISTS idx_security_logs_event ON security_logs(event, created_at DESC);

    -- IP в таблице users
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_ip TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS register_ip TEXT;

    CREATE TABLE IF NOT EXISTS reviews (
      id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      deal_id     TEXT NOT NULL UNIQUE REFERENCES deals(id),
      reviewer_id TEXT NOT NULL REFERENCES users(id),
      reviewed_id TEXT NOT NULL REFERENCES users(id),
      rating      INTEGER NOT NULL,
      text        TEXT,
      created_at  BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      sender_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      receiver_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      text        TEXT NOT NULL,
      is_read     INTEGER DEFAULT 0,
      created_at  BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
    );

    CREATE INDEX IF NOT EXISTS idx_messages_sender   ON messages(sender_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id, is_read, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_products_category  ON products(category, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_products_seller    ON products(seller_id, status);
    CREATE INDEX IF NOT EXISTS idx_products_status    ON products(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_deals_buyer        ON deals(buyer_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_deals_seller       ON deals(seller_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_deals_status       ON deals(status);
    CREATE INDEX IF NOT EXISTS idx_transactions_user  ON transactions(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_transactions_order ON transactions(gateway_order_id);
  `);

  // Seed categories
  const { rows } = await query(`SELECT COUNT(*) as c FROM categories`);
  if (parseInt(rows[0].c) === 0) {
    const cats = [
      ['game-accounts','Аккаунты','🎮',1],
      ['game-currency','Валюта','💰',2],
      ['items','Предметы','⚔️',3],
      ['skins','Скины','🎨',4],
      ['keys','Ключи','🔑',5],
      ['subscriptions','Подписки','⭐',6],
      ['boost','Буст','🚀',7],
      ['other','Прочее','📦',8],
    ];
    for (const [slug, name, icon, sort_order] of cats) {
      await query(
        `INSERT INTO categories (slug, name, icon, sort_order) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [slug, name, icon, sort_order]
      );
    }
    console.log('✅ Default categories seeded');
  }

  console.log('✅ PostgreSQL database ready');
}

module.exports = { query, queryOne, queryAll, run, transaction, pool, initSchema };
