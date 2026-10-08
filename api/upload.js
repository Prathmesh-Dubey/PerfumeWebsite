// POST /api/upload  (admin) body: the image file (JPEG/PNG/WebP, max 3 MB) -> { url }
// The editor shrinks photos in the browser before sending, so uploads stay small.
const { Binary } = require('mongodb');
const { getDb } = require('./_lib/db');
const { send, readRaw, sameOrigin } = require('./_lib/http');
const { isAdmin } = require('./_lib/auth');

const MAX = 3 * 1024 * 1024;

function sniff(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(res, 405, { error: 'Method not allowed' }); }
    if (!sameOrigin(req)) return send(res, 403, { error: 'Bad origin' });
    if (!isAdmin(req)) return send(res, 401, { error: 'Please log in again' });

    const buf = await readRaw(req, MAX);
    if (!buf.length) return send(res, 400, { error: 'No file received' });
    if (buf.length > MAX) return send(res, 413, { error: 'Image is too large (max 3 MB)' });
    const type = sniff(buf);
    if (!type) return send(res, 415, { error: 'Only JPEG, PNG or WebP images' });

    const db = await getDb();
    const r = await db.collection('images').insertOne({ data: new Binary(buf), type, size: buf.length, createdAt: new Date() });
    return send(res, 200, { url: `/api/img?id=${r.insertedId.toHexString()}` });
  } catch (err) {
    if (err.status) return send(res, err.status, { error: err.message });
    console.error('upload', err);
    return send(res, 500, { error: 'Upload failed. Please try again.' });
  }
};
