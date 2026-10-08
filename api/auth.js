// GET    /api/auth  -> { admin: true|false }
// POST   /api/auth  -> log in with { phone, password }
// DELETE /api/auth  -> log out
const { getDb } = require('./_lib/db');
const { send, readJson, clientIp, sameOrigin } = require('./_lib/http');
const { checkCredentials, isAdmin, loginCookie, logoutCookie } = require('./_lib/auth');

const MAX_FAILS = 8; // per IP per 15 minutes

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') return send(res, 200, { admin: isAdmin(req) });

    if (!sameOrigin(req)) return send(res, 403, { error: 'Bad origin' });

    if (req.method === 'DELETE') return send(res, 200, { ok: true }, { 'Set-Cookie': logoutCookie(req) });

    if (req.method === 'POST') {
      const { phone, password } = await readJson(req, 4096);
      const db = await getDb();
      const attempts = db.collection('login_attempts');
      const ip = clientIp(req);
      if (await attempts.countDocuments({ ip }) >= MAX_FAILS) {
        return send(res, 429, { error: 'Too many attempts. Please wait 15 minutes and try again.' });
      }
      if (!checkCredentials(phone, password)) {
        await attempts.insertOne({ ip, at: new Date() });
        await new Promise(r => setTimeout(r, 400));
        return send(res, 401, { error: 'Wrong mobile number or password.' });
      }
      await attempts.deleteMany({ ip });
      return send(res, 200, { ok: true }, { 'Set-Cookie': loginCookie(req) });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return send(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    if (err.status) return send(res, err.status, { error: err.message });
    console.error('auth', err);
    return send(res, 500, { error: 'Server error. Please try again.' });
  }
};
