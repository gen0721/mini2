const https = require('https');

// CryptoPay — https://t.me/CryptoBot
// Документация: https://help.crypt.bot/crypto-pay-api

const TOKEN = () => process.env.CRYPTOPAY_TOKEN || '';

// Для тестов: api.testnet.ton.org, для продакшна: pay.crypt.bot
const HOST  = () => process.env.CRYPTOPAY_TESTNET === 'true'
  ? 'testnet-pay.crypt.bot'
  : 'pay.crypt.bot';

function isConfigured() { return !!TOKEN(); }

function request(method, params = {}) {
  return new Promise((resolve, reject) => {
    const path = `/api/${method}`;
    const data = JSON.stringify(params);
    const req  = https.request({
      hostname: HOST(),
      path,
      method:   'POST',
      headers:  {
        'Crypto-Pay-API-Token': TOKEN(),
        'Content-Type':         'application/json',
        'Content-Length':       Buffer.byteLength(data),
      },
    }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try { resolve(JSON.parse(b)); }
        catch { resolve({ ok: false, error: 'parse' }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(data);
    req.end();
  });
}

// Создать счёт на оплату
async function createInvoice({ amount, orderId, description = '' }) {
  if (!isConfigured()) return { ok: false, error: 'CryptoPay не настроен (нужен CRYPTOPAY_TOKEN)' };

  try {
    const res = await request('createInvoice', {
      currency_type: 'fiat',     // fiat — указываем в USD
      fiat:          'USD',
      amount:        String(parseFloat(amount).toFixed(2)),
      description:   description || `Пополнение Minions Market $${amount}`,
      payload:       String(orderId),  // наш orderId — вернётся в вебхуке
      paid_btn_name: 'openBot',
      paid_btn_url:  process.env.BACKEND_URL || 'https://t.me/',
      allow_comments: false,
      allow_anonymous: false,
    });

    console.log('[CryptoPay] createInvoice response:', JSON.stringify(res));

    if (res.ok && res.result) {
      return {
        ok:        true,
        payUrl:    res.result.bot_invoice_url || res.result.pay_url,
        invoiceId: String(res.result.invoice_id),
      };
    }
    return { ok: false, error: res.error?.name || JSON.stringify(res) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Проверка вебхука от CryptoPay
// CryptoPay отправляет заголовок crypto-pay-api-signature
function verifyWebhook(body, signature) {
  if (!TOKEN() || !signature) return false;
  try {
    const crypto  = require('crypto');
    const secret  = crypto.createHash('sha256').update(TOKEN()).digest();
    const payload = JSON.stringify(body);
    const check   = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return check === signature;
  } catch { return false; }
}

module.exports = { isConfigured, createInvoice, verifyWebhook };
