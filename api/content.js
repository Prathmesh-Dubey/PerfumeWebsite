// GET  /api/content  -> public: the saved website content (or null if nothing saved yet)
// PUT  /api/content  -> admin: save new content
const { ObjectId } = require('mongodb');
const { getDb } = require('./_lib/db');
const { send, readJson, sameOrigin } = require('./_lib/http');
const { isAdmin } = require('./_lib/auth');
const { validate, referencedImageIds } = require('./_lib/content');

const DOC_ID = 'main';

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const db = await getDb();
      const doc = await db.collection('site').findOne({ _id: DOC_ID });
      const content = doc ? { texts: doc.texts, services: doc.services, products: doc.products, gallery: doc.gallery } : null;
      // the admin editor asks for a fresh copy; visitors get a briefly cached one
      const fresh = /[?&]fresh=1/.test(req.url || '');
      return send(res, 200, { content, updatedAt: doc ? doc.updatedAt : null }, {
        'Cache-Control': fresh ? 'no-store' : 'public, max-age=0, s-maxage=10, stale-while-revalidate=60'
      });
    }

    if (req.method === 'PUT') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'Bad origin' });
      if (!isAdmin(req)) return send(res, 401, { error: 'Please log in again' });
      const body = await readJson(req, 2 * 1024 * 1024);
      const content = validate(body.content);
      const db = await getDb();
      const updatedAt = new Date();
      await db.collection('site').updateOne({ _id: DOC_ID }, { $set: { ...content, updatedAt } }, { upsert: true });

      // remove uploaded images that are no longer used (keep recent ones: they may be part of an unsaved edit)
      const keep = [...referencedImageIds(content)].map(id => new ObjectId(id));
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      await db.collection('images').deleteMany({ _id: { $nin: keep }, createdAt: { $lt: dayAgo } });

      return send(res, 200, { ok: true, updatedAt });
    }

    res.setHeader('Allow', 'GET, PUT');
    return send(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    if (err.status) return send(res, err.status, { error: err.message });
    console.error('content', err);
    return send(res, 500, { error: 'Server error. Please try again.' });
  }
};
