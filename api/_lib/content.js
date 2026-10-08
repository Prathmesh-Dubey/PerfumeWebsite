// Validates website content sent from /edit before it is saved.

const TEXT_KEYS = ['heroEyebrow', 'heroTitle1', 'heroTitle2', 'heroLead', 'aboutText', 'tagline', 'servicesIntro', 'productsIntro', 'footerTagline'];
const IMG_RE = /^(assets\/[\w\-/. ]+\.(jpe?g|png|webp)|\/api\/img\?id=[a-f0-9]{24})$/i;

function bad(msg) { return Object.assign(new Error(msg), { status: 400 }); }
const str = (v, max, name) => {
  if (typeof v !== 'string') throw bad(`${name} must be text`);
  const s = v.trim();
  if (s.length > max) throw bad(`${name} is too long (max ${max} characters)`);
  return s;
};
const img = (v, name, optional) => {
  if (optional && (v === '' || v == null)) return '';
  if (typeof v !== 'string' || !IMG_RE.test(v)) throw bad(`${name}: invalid image`);
  return v;
};
const int = (v, min, max, name) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${name} must be a whole number between ${min} and ${max}`);
  return n;
};
const list = (v, max, name) => {
  if (!Array.isArray(v)) throw bad(`${name} must be a list`);
  if (v.length > max) throw bad(`Too many ${name} (max ${max})`);
  return v;
};

function validate(input) {
  if (!input || typeof input !== 'object') throw bad('Missing content');

  const texts = {};
  const t = input.texts || {};
  for (const k of TEXT_KEYS) if (t[k] != null) texts[k] = str(t[k], 1500, `Text "${k}"`);

  const services = list(input.services || [], 30, 'services').map((s, i) => ({
    t: str(s.t, 80, `Service ${i + 1} title`) || 'Service',
    d: str(s.d || '', 300, `Service ${i + 1} description`),
    img: img(s.img, `Service ${i + 1}`)
  }));

  const products = list(input.products || [], 500, 'bottles').map((p, i) => {
    const n = `Bottle ${i + 1}`;
    const g = String(p.g || '');
    if (!['F', 'M', 'U'].includes(g)) throw bad(`${n}: choose Women, Men or Unisex`);
    const code = str(p.code, 40, `${n} name/code`);
    if (!code) throw bad(`${n}: name/code is required`);
    return {
      code,
      size: int(p.size, 1, 5000, `${n} size (ml)`),
      g,
      price: int(p.price, 0, 10000000, `${n} price`),
      img: img(p.img, `${n} photo`),
      detail: img(p.detail, `${n} detail photo`, true)
    };
  });

  const gallery = list(input.gallery || [], 1000, 'gallery photos').map((g, i) => ({
    thumb: img(g.thumb, `Gallery photo ${i + 1}`),
    full: img(g.full, `Gallery photo ${i + 1}`),
    alt: str(g.alt || '', 200, `Gallery photo ${i + 1} description`) || 'Velunia Signature perfume',
    fit: g.fit === 'contain' ? 'contain' : 'cover',
    bg: /^#[0-9a-f]{3,8}$/i.test(g.bg || '') ? g.bg : ''
  }));

  return { texts, services, products, gallery };
}

// ids of uploaded images (/api/img?id=...) used anywhere in the content
function referencedImageIds(c) {
  const ids = new Set();
  const add = u => { const m = /id=([a-f0-9]{24})$/i.exec(u || ''); if (m) ids.add(m[1].toLowerCase()); };
  c.services.forEach(s => add(s.img));
  c.products.forEach(p => { add(p.img); add(p.detail); });
  c.gallery.forEach(g => { add(g.thumb); add(g.full); });
  return ids;
}

module.exports = { validate, referencedImageIds };
