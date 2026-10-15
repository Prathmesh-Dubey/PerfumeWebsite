// Validates website content sent from /edit before it is saved.

const TEXT_KEYS = ['heroEyebrow', 'heroTitle1', 'heroTitle2', 'heroLead', 'aboutText', 'tagline', 'servicesIntro', 'productsIntro', 'footerTagline', 'locationTitle', 'locationAddress'];
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
// an uploaded/built-in image, or a link to an image on another website (https only)
const URL_RE = /^https:\/\/[^\s"'<>()\\]{3,600}$/i;
const imgOrUrl = (v, name) => {
  if (v === '' || v == null) return '';
  if (typeof v === 'string' && (IMG_RE.test(v) || URL_RE.test(v.trim()))) return v.trim();
  throw bad(`${name}: use an uploaded photo or an image link starting with https://`);
};
const EMAIL_RE = /^[^\s@<>"'(),;:]+@[^\s@<>"'(),;:]+\.[^\s@<>"'(),;:]{2,}$/;
const email = (v, name) => {
  if (v === '' || v == null) return '';
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (s.length > 120 || !EMAIL_RE.test(s)) throw bad(`${name}: enter a valid email like name@gmail.com, or leave it empty`);
  return s;
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

const hhmm = (v, name) => {
  if (typeof v !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw bad(`${name}: use a time like 09:00`);
  return v;
};
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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

  const categories = list(input.categories || [{ id: 'F', name: 'Women' }, { id: 'M', name: 'Men' }, { id: 'U', name: 'Unisex' }], 30, 'categories').map((c, i) => {
    const id = String((c && c.id) || '');
    if (!/^[\w-]{1,16}$/.test(id)) throw bad(`Category ${i + 1}: invalid id`);
    const name = str((c && c.name) || '', 30, `Category ${i + 1} name`);
    if (!name) throw bad(`Category ${i + 1} needs a name`);
    return { id, name };
  });
  if (!categories.length) throw bad('Keep at least one category');
  if (new Set(categories.map(c => c.id)).size !== categories.length) throw bad('Duplicate category');
  if (new Set(categories.map(c => c.name.toLowerCase())).size !== categories.length) throw bad('Two categories have the same name');

  const products = list(input.products || [], 500, 'bottles').map((p, i) => {
    const n = `Bottle ${i + 1}`;
    const g = String(p.g || '');
    if (!categories.some(c => c.id === g)) throw bad(`${n}: choose a category`);
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

  const testimonials = list(input.testimonials || [], 30, 'testimonials').map((t, i) => {
    const q = str(t.q || '', 500, `Testimonial ${i + 1} text`);
    if (!q) throw bad(`Testimonial ${i + 1} needs some text`);
    return {
      n: str(t.n || '', 60, `Testimonial ${i + 1} name`) || 'Customer',
      q,
      c: /^#[0-9a-f]{6}$/i.test(t.c || '') ? t.c : '',
      img: imgOrUrl(t.img, `Testimonial ${i + 1} photo`),
      rating: t.rating == null || t.rating === '' ? 5 : int(t.rating, 1, 5, `Testimonial ${i + 1} stars`),
      email: email(t.email, `Testimonial ${i + 1} email`) // private: only the logged-in editor gets it back
    };
  });

  const blogs = list(input.blogs || [], 50, 'blog articles').map((b, i) => {
    const n = `Article ${i + 1}`;
    const id = String((b && b.id) || '');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || id.length > 80) throw bad(`${n}: invalid web address`);
    const title = str(b.title || '', 150, `${n} title`);
    if (!title) throw bad(`${n} needs a title`);
    const date = String(b.date || '');
    const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!dm || +dm[2] < 1 || +dm[2] > 12 || +dm[3] < 1 || +dm[3] > 31) throw bad(`${n}: choose a date`);
    const body = str(b.body || '', 20000, `${n} text`);
    if (!body) throw bad(`${n} needs some text`);
    return { id, title, date, cover: imgOrUrl(b.cover, `${n} cover photo`), excerpt: str(b.excerpt || '', 300, `${n} summary`), body };
  });
  if (new Set(blogs.map(b => b.id)).size !== blogs.length) throw bad('Two articles have the same web address');

  const h = list(input.hours || [], 7, 'days');
  if (h.length !== 7) throw bad('Opening hours must cover all 7 days');
  const hours = h.map((d, i) => {
    const on = !!d.on;
    const from = hhmm(d.from, `${DAYS[i]} opening time`), to = hhmm(d.to, `${DAYS[i]} closing time`);
    if (on && to <= from) throw bad(`${DAYS[i]}: closing time must be after opening time`);
    return { on, from, to };
  });

  const s = input.settings || {};
  const wa = String(s.wa || '').replace(/\D/g, '');
  if (!/^[1-9]\d{9,14}$/.test(wa)) throw bad('WhatsApp number must be 10 to 15 digits including the country code');

  return { texts, services, products, gallery, categories, testimonials, hours, settings: { wa }, blogs };
}

// ids of uploaded images (/api/img?id=...) used anywhere in the content
function referencedImageIds(c) {
  const ids = new Set();
  const add = u => { const m = /id=([a-f0-9]{24})$/i.exec(u || ''); if (m) ids.add(m[1].toLowerCase()); };
  c.services.forEach(s => add(s.img));
  c.products.forEach(p => { add(p.img); add(p.detail); });
  c.gallery.forEach(g => { add(g.thumb); add(g.full); });
  c.testimonials.forEach(t => add(t.img));
  (c.blogs || []).forEach(b => add(b.cover));
  return ids;
}

module.exports = { validate, referencedImageIds };
