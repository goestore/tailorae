// End-to-end smoke test of the whole marketplace against a running local stack.
//
//   ADMIN_PASSWORD=… API_LOG=path/to/api.log node tools/e2e-smoke.mjs
//
// Seller signs up → confirms email (Mailpit) and phone (code from the API log)
// → business, KYC, bank, submit → staff approve → seller lists a product with a
// size → staff approve the listing → a customer buys it (cash on delivery) →
// seller ships and delivers → the return window is wound back in Postgres →
// the seller is credited → staff pay out → the balance is zero.
//
// Needs: the API (`npm run dev:api` or a jar), `npm run db:up` (Postgres,
// Kafka, Mailpit), the API started with TAILORAE_SMS_LOG_CODES=true.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const API = process.env.API_URL ?? 'http://localhost:8081/api';
const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@tailorae.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const API_LOG = process.env.API_LOG;
const DB_CONTAINER = process.env.DB_CONTAINER ?? 'tailorae-db';
const DB_NAME = process.env.DB_NAME ?? 'tailorae_api';
if (!ADMIN_PASSWORD || !API_LOG) {
  console.error('Set ADMIN_PASSWORD and API_LOG (the API log file, for the phone code).');
  process.exit(2);
}

const run = Date.now().toString(36);
const step = (msg) => console.log(`\n▸ ${msg}`);
const ok = (msg) => console.log(`  ✓ ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A browser stand-in: keeps its cookies, speaks the JSON envelope. */
function client(name) {
  const jar = new Map();
  const call = async (method, path, body, { expect = [200, 201], form } = {}) => {
    const headers = { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') };
    let payload;
    if (form) payload = form;
    else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(`${API}${path}`, { method, headers, body: payload, redirect: 'manual' });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      const value = pair.slice(i + 1);
      if (value) jar.set(pair.slice(0, i), value);
      else jar.delete(pair.slice(0, i));
    }
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!expect.includes(res.status)) throw new Error(`${name}: ${method} ${path} → ${res.status} ${text.slice(0, 300)}`);
    return json.data;
  };
  return {
    get: (p, o) => call('GET', p, undefined, o),
    post: (p, b, o) => call('POST', p, b, o),
    put: (p, b, o) => call('PUT', p, b, o),
    patch: (p, b, o) => call('PATCH', p, b, o),
    upload: (p, form) => call('POST', p, undefined, { form }),
  };
}

const sql = (query) =>
  execFileSync('docker', ['exec', DB_CONTAINER, 'psql', '-U', 'postgres', '-d', DB_NAME, '-tAc', query]).toString().trim();

async function mailLink(to, pathPart) {
  for (let i = 0; i < 30; i++) {
    const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`)).json();
    for (const m of list.messages ?? []) {
      const msg = await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json();
      const link = (msg.Text ?? '').match(new RegExp(`https?://\\S*${pathPart}\\S*`));
      if (link) return link[0];
    }
    await sleep(1000);
  }
  throw new Error(`No mail with ${pathPart} for ${to}`);
}

function phoneCode(accountPhone) {
  const digits = accountPhone.slice(-4);
  const lines = readFileSync(API_LOG, 'utf8').split('\n').filter((l) => l.includes('SMS to') && l.includes(digits));
  const code = lines.at(-1)?.match(/(\d{6}) is your TAILORAE code/)?.[1];
  if (!code) throw new Error('No phone code in the API log — is TAILORAE_SMS_LOG_CODES=true?');
  return code;
}

const staff = client('staff');
const seller = client('seller');
const shopper = client('shopper');

step('Staff sign in');
await staff.post('/admin/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
ok('signed in');

step('Seller signs up and confirms email + phone');
const sellerEmail = `e2e-seller-${run}@example.com`;
const sellerPhone = `+91 9${String(Date.now()).slice(-9)}`;
await seller.post('/seller/auth/register', { email: sellerEmail, password: 'linen kurta in saffron', fullName: 'E2E Seller', phone: sellerPhone });
const verifyUrl = await mailLink(sellerEmail, 'verify-email');
await fetch(verifyUrl, { redirect: 'manual' });
await seller.post('/seller/auth/phone/send-code');
await sleep(2000);
await seller.post('/seller/auth/phone/verify', { code: phoneCode(sellerPhone) });
const verification = await seller.get('/seller/auth/verification');
if (!verification.email || !verification.phone) throw new Error(`verification incomplete: ${JSON.stringify(verification)}`);
ok('email and phone confirmed');

step('Business, KYC, bank, submit');
const shop = await seller.post('/seller/business', {
  shopName: `E2E Looms ${run}`, legalName: 'E2E Looms Private Limited', businessType: 'PRIVATE_LIMITED', pan: 'AAPFU0939F',
  registeredAddress: { line1: '12 Linen Lane', city: 'Jaipur', state: 'Rajasthan', postalCode: '302001' }, contactPhone: '+91 98290 12345',
});
const pdf = new FormData();
pdf.append('kind', 'PAN');
pdf.append('file', new Blob(['%PDF-1.4 e2e'], { type: 'application/pdf' }), 'pan.pdf');
await seller.upload('/seller/kyc/documents', pdf);
await seller.put('/seller/bank', { accountName: 'E2E Looms', accountNumber: '123456789012', ifsc: 'HDFC0001234' });
await seller.post('/seller/business/submit');
ok(`submitted ${shop.shopName}`);

step('Staff approve the shop');
await staff.post(`/admin/sellers/${shop.id}/decision`, { action: 'APPROVE' });
ok('approved');

step('Seller lists a product with a size; staff approve the listing');
const category = await staff.post("/admin/categories", { name: `E2E Kurtas ${run}`, slug: `e2e-kurtas-${run}`, commissionRateBp: 1500 });
const categoryId = category.category?.id ?? category.id;
const created = await seller.post('/seller/products', {
  name: `E2E Linen Kurta ${run}`, categoryId, sku: `E2E-${run}`, pricePaise: 120000, mrpPaise: 150000, description: 'Handloom linen.',
});
const productId = (created.product ?? created).id;
const variant = await seller.post(`/seller/products/${productId}/variants`, { name: 'M', size: 'M', sku: `E2E-${run}-M`, quantity: 5 });
const variantId = (variant.variant ?? variant).id;
// A real 1×1 PNG: uploads are identified by their bytes, so it must decode.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const photo = new FormData();
photo.append('file', new Blob([png], { type: 'image/png' }), 'kurta.png');
const media = await seller.upload('/seller/media', photo);
const url = (media.asset ?? media).url;
try {
  await seller.put(`/seller/products/${productId}`, { thumbnail: url, images: [url], status: 'ACTIVE' });
} catch (e) {
  throw new Error(`could not go live: ${e.message}`);
}
await staff.patch(`/admin/moderation/products/${productId}`, { decision: 'approve' });
const listed = await shopper.get(`/products/${productId}`);
ok(`live on the storefront at ₹${((listed.product ?? listed).pricePaise / 100).toFixed(2)}`);

step('Customer buys it (cash on delivery)');
await shopper.post('/auth/register', { email: `e2e-shopper-${run}@example.com`, password: 'linen kurta in saffron', firstName: 'Asha' });
await shopper.post('/cart/items', { productId, variantId, quantity: 2 });
const placed = await shopper.post('/orders', {
  paymentMethod: 'COD',
  shippingAddress: { fullName: 'Asha Rao', phone: '+91 98450 00000', line1: '4 MG Road', city: 'Bengaluru', state: 'Karnataka', postalCode: '560001' },
});
const order = placed.order;
ok(`order ${order.orderNumber}, total ₹${(order.totalPaise / 100).toFixed(2)}`);

step('Seller ships and delivers');
const part = (await seller.get('/seller/orders')).items.find((o) => o.orderNumber.startsWith(order.orderNumber));
for (const status of ['CONFIRMED', 'PROCESSING', 'READY_FOR_SHIPMENT']) await seller.patch(`/seller/orders/${part.id}`, { status });
await seller.patch(`/seller/orders/${part.id}`, { status: 'SHIPPED', trackingNumber: `AWB${run}`, carrier: 'Delhivery' });
await seller.patch(`/seller/orders/${part.id}`, { status: 'DELIVERED' });
const delivered = (await shopper.get(`/orders/${order.id}`)).order;
if (delivered.status !== 'DELIVERED' || delivered.paymentStatus !== 'PAID') throw new Error(`order is ${delivered.status}/${delivered.paymentStatus}`);
ok('delivered, cash collected');

step('Return window passes; seller is credited; staff pay out');
const held = await seller.get('/seller/earnings');
if (held.balancePaise !== 0) throw new Error('credited before the return window');
sql(`update seller_order set delivered_at = now() - interval '8 days' where id = '${part.id}'`);
const credited = await seller.get('/seller/earnings');
ok(`credited ₹${(credited.balancePaise / 100).toFixed(2)} (₹${(part.totalPaise / 100).toFixed(2)} less 15% commission)`);
await staff.post(`/admin/payouts/${shop.id}/settle`, { reference: `UTR${run}` });
const after = await seller.get('/seller/earnings');
if (after.balancePaise !== 0) throw new Error(`balance after payout: ${after.balancePaise}`);
ok('paid out; balance ₹0.00');

console.log('\n✓ End-to-end marketplace flow passed\n');
