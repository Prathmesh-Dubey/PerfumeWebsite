// Admin login: phone + password, signed session cookie.
// Defaults: 9371814999 / admin123. Override with ADMIN_PHONE and ADMIN_PASSWORD (or ADMIN_PASSWORD_HASH).
const crypto = require('crypto');

const DEFAULT_PHONE = '9371814999';
const DEFAULT_PASSWORD = 'admin123';
const adminPhone = () => process.env.ADMIN_PHONE || DEFAULT_PHONE;
const adminPassword = () => process.env.ADMIN_PASSWORD || DEFAULT_PASSWORD;

const COOKIE = 'kg_admin';
const MAX_AGE = 7 * 24 * 60 * 60; // 7 days

const digits = s => String(s || '').replace(/\D/g, '');
function normPhone(s) {
  let d = digits(s);
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
}

// signing key: SESSION_SECRET if set, otherwise derived from the (private) MongoDB connection string
function secret() {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  return crypto.createHash('sha256').update('kg-session:' + uri).digest('hex');
}

const sign = data => crypto.createHmac('sha256', secret()).update(data).digest('base64url');

// changing the password changes this, which signs everyone out
const passwordStamp = () => sign('pw:' + (process.env.ADMIN_PASSWORD_HASH || adminPassword())).slice(0, 12);

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// ADMIN_PASSWORD_HASH (optional) format: scrypt:<salt hex>:<hash hex>; otherwise the plain password is compared
function verifyPassword(password) {
  if (!process.env.ADMIN_PASSWORD_HASH) {
    const a = crypto.createHash('sha256').update(String(password || '')).digest();
    const b = crypto.createHash('sha256').update(String(adminPassword())).digest();
    return crypto.timingSafeEqual(a, b);
  }
  const parts = String(process.env.ADMIN_PASSWORD_HASH || '').split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex'), expected = Buffer.from(parts[2], 'hex');
  const got = crypto.scryptSync(String(password || ''), salt, expected.length);
  return crypto.timingSafeEqual(got, expected);
}

function checkCredentials(phone, password) {
  const okPhone = safeEqual(normPhone(phone), normPhone(adminPhone()));
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
