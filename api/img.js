// GET /api/img?id=<24 hex>  -> an uploaded image (cached for a year; ids never change)
const { ObjectId } = require('mongodb');
const { getDb } = require('./_lib/db');
const { query } = require('./_lib/http');

module.exports = async (req, res) => {
  const id = String(query(req).id || '');
  if (!/^[a-f0-9]{24}$/i.test(id)) { res.statusCode = 400; return res.end('Bad id'); }
  try {
    const db = await getDb();
    const doc = await db.collection('images').findOne({ _id: new ObjectId(id) });
    if (!doc) { res.statusCode = 404; res.setHeader('Cache-Control', 'no-store'); return res.end('Not found'); }
    const buf = Buffer.from(doc.data.buffer);
    res.statusCode = 200;
    res.setHeader('Content-Type', doc.type);
    res.setHeader('Content-Length', buf.length);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.end(buf);
  } catch (err) {
    console.error('img', err);
    res.statusCode = 500; res.end('Error');
  }
};
