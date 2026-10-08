// Admin login: phone + password (scrypt hash in ADMIN_PASSWORD_HASH), signed session cookie.
const crypto = require('crypto');

const COOKIE = 'kg_admin';
const MAX_AGE = 7 * 24 * 60 * 60; // 7 days

const digits = s => String(s || '').replace(/\D/g, '');
function normPhone(s) {
  let d = digits(s);
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
}

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET must be set (32+ characters)');
  return s;
}

const sign = data => crypto.createHmac('sha256', secret()).update(data).digest('base64url');

// changing the password changes this, which signs everyone out
const passwordStamp = () => sign('pw:' + (process.env.ADMIN_PASSWORD_HASH || '')).slice(0, 12);

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// stored format: scrypt:<salt hex>:<hash hex>
function verifyPassword(password) {
  const parts = String(process.env.ADMIN_PASSWORD_HASH || '').split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex'), expected = Buffer.from(parts[2], 'hex');
  const got = crypto.scryptSync(String(password || ''), salt, expected.length);
  return crypto.timingSafeEqual(got, expected);
}

function checkCredentials(phone, password) {
  const okPhone = safeEqual(normPhone(phone), normPhone(process.env.ADMIN_PHONE));
  const okPass = verifyPassword(password); // always run, so timing doesn't reveal which part was wrong
  return okPhone && okPass;
}

function makeToken() {
  const payload = Buffer.from(JSON.stringify({ sub: 'admin', pw: passwordStamp(), exp: Date.now() + MAX_AGE * 1000 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function readCookie(req, name) {
  const m = String(req.headers.cookie || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? m[1] : null;
}

function isAdmin(req) {
  try {
    const t = readCookie(req, COOKIE);
    if (!t) return false;
    const [payload, sig] = t.split('.');
    if (!payload || !sig || !safeEqual(sig, sign(payload))) return false;
    const p = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return p.sub === 'admin' && p.exp > Date.now() && p.pw === passwordStamp();
  } catch { return false; }
}

function secureFlag(req) {
  const proto = String(req.headers['x-forwarded-proto'] || '');
  const host = String(req.headers.host || '');
  return proto === 'https' || !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? '; Secure' : '';
}

const loginCookie = req => `${COOKIE}=${makeToken()}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${MAX_AGE}${secureFlag(req)}`;
const logoutCookie = req => `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secureFlag(req)}`;

module.exports = { checkCredentials, isAdmin, loginCookie, logoutCookie };
