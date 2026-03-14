const https  = require('https');
const crypto = require('crypto');
const qs     = require('querystring');

const SHOP_ID = () => process.env.RUKASSA_SHOP_ID || '';
const SECRET  = () => process.env.RUKASSA_SECRET  || '';
const TOKEN   = () => process.env.RUKASSA_TOKEN   || '';

function isConfigured() { return !!(SHOP_ID() && TOKEN()); }

function request(path, params) {
  return new Promise((resolve, reject) => {
    // RuKassa принимает form-urlencoded, НЕ JSON
    const data = qs.stringify(params);
    const req = https.request({
      hostname: 'lk.rukassa.io',
      path,
      method: 'POST',
      headers: {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(data),
      },
    }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try { resolve(JSON.parse(b)); }
        catch { resolve({ error: 'parse', raw: b }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(data);
    req.end();
  });
}

async function createInvoice({ amount, orderId, comment = '', hookUrl = '', successUrl = '' }) {
  if (!isConfigured()) return { ok: false, error: 'RuKassa не настроен (нужны RUKASSA_SHOP_ID и RUKASSA_TOKEN)' };

  const shopId      = SHOP_ID();
  const description = comment || `Пополнение баланса на $${amount}`;

  const params = {
    shop_id:          shopId,
    token:            TOKEN(),
    order_id:         String(orderId),
    amount:           String(parseFloat(amount)),
    data:             description,
    notification_url: hookUrl,
    success_url:      successUrl,
    fail_url:         successUrl,
  };

  console.log('[RuKassa] createInvoice request:', JSON.stringify({ ...params, token: '***' }));

  try {
    const res = await request('/api/v1/create', params);
    console.log('[RuKassa] response:', JSON.stringify(res));

    if (res && res.link) return { ok: true, payUrl: res.link, invoiceId: String(res.id || orderId) };
    if (res && res.url)  return { ok: true, payUrl: res.url,  invoiceId: String(res.id || orderId) };
    return { ok: false, error: res?.message || res?.error || JSON.stringify(res) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function verifyWebhook(body) {
  if (!SECRET()) return true; // если SECRET не задан — пропускаем проверку
  try {
    const { shop_id, amount, order_id, sign: s } = body;
    if (!shop_id || !amount || !order_id || !s) return false;
    const expected = crypto.createHash('md5')
      .update(`${shop_id}:${amount}:${order_id}:${SECRET()}`)
      .digest('hex');
    return expected === s.toLowerCase();
  } catch { return false; }
}

module.exports = { isConfigured, createInvoice, verifyWebhook };
