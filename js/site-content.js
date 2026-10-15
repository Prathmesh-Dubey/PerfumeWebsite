/* Loads the live website content saved from /edit (MongoDB via /api/content).
   Falls back to the built-in SITE_DEFAULTS if nothing is saved or the server can't be reached. */
window.SiteContent = (() => {
  'use strict';
  const D = window.SITE_DEFAULTS;
  let pending = null;

  function merge(saved) {
    if (!saved || typeof saved !== 'object') return D;
    return {
      texts: Object.assign({}, D.texts, saved.texts || {}),
      services: Array.isArray(saved.services) ? saved.services : D.services,
      products: Array.isArray(saved.products) ? saved.products : D.products,
      gallery: Array.isArray(saved.gallery) ? saved.gallery : D.gallery,
      categories: Array.isArray(saved.categories) && saved.categories.length ? saved.categories : D.categories,
      testimonials: Array.isArray(saved.testimonials) ? saved.testimonials : D.testimonials,
      hours: Array.isArray(saved.hours) && saved.hours.length === 7 ? saved.hours : D.hours,
      blogs: Array.isArray(saved.blogs) ? saved.blogs : D.blogs,
      settings: Object.assign({}, D.settings, saved.settings || {})
    };
  }

  function load() {
    if (pending) return pending;
    const ctrl = 'AbortController' in window ? new AbortController() : null;
    const timer = setTimeout(() => ctrl && ctrl.abort(), 4000);
    pending = fetch('/api/content', { signal: ctrl && ctrl.signal, headers: { Accept: 'application/json' } })
      .then(r => (r.ok ? r.json() : null))
      .then(j => merge(j && j.content))
      .catch(() => D)
      .finally(() => clearTimeout(timer));
    return pending;
  }

  // fill every element marked data-k="<text key>" and data-calc="count"
  function applyTexts(c) {
    document.querySelectorAll('[data-k]').forEach(el => {
      const v = c.texts[el.dataset.k];
      if (typeof v === 'string' && v.trim()) el.textContent = v;
    });
    const wa = String(c.settings.wa);
    const calc = { count: String(c.products.length), waDisplay: formatPhone(wa) };
    document.querySelectorAll('[data-calc]').forEach(el => {
      const v = calc[el.dataset.calc];
      if (v) el.textContent = v;
    });
    // WhatsApp number changed in /edit: update every link on the page
    if (wa !== D.settings.wa) {
      document.querySelectorAll('a[href*="wa.me/"]').forEach(a => { a.href = a.href.replace(/wa\.me\/\d+/, 'wa.me/' + wa); });
      // the QR image is a fixed picture of the original number, so hide it
      const qr = document.getElementById('qr');
      if (qr) qr.hidden = true;
    }
  }

  // "919371814999" -> "+91 93718 14999" (other lengths: "+" and digits)
  function formatPhone(d) {
    d = String(d).replace(/\D/g, '');
    return /^91\d{10}$/.test(d) ? `+91 ${d.slice(2, 7)} ${d.slice(7)}` : '+' + d;
  }

  /* ---------- blog helpers (home page and blog.html) ---------- */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // "2026-10-06" -> "6 October 2026"
  function blogDate(d) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || '');
    if (!m) return '';
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  }
  // article text written in /edit -> safe HTML. Everything is escaped first; then only
  // "## heading", "- bullet", **bold** and blank-line paragraphs are turned into tags.
  function blogHtml(body) {
    const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    let html = '', para = [], list = null;
    const endPara = () => { if (para.length) { html += `<p>${inline(para.join(' '))}</p>`; para = []; } };
    const endList = () => { if (list) { html += `<ul>${list.map(li => `<li>${inline(li)}</li>`).join('')}</ul>`; list = null; } };
    String(body || '').replace(/\r\n?/g, '\n').split('\n').forEach(raw => {
      const l = raw.trim();
      if (!l) { endPara(); endList(); return; }
      if (/^#{2,3} /.test(l)) { endPara(); endList(); html += `<h2>${inline(l.replace(/^#+ /, ''))}</h2>`; return; }
      if (/^[-*•] /.test(l)) { endPara(); (list = list || []).push(l.slice(2)); return; }
      endList(); para.push(l);
    });
    endPara(); endList();
    return html;
  }
  const blogUrl = p => `blog.html?p=${encodeURIComponent(p.id)}`;
  const BLOG_COVER = 'assets/gallery/thumb/poster.jpg'; // used when an article has no cover photo

  return { load, applyTexts, formatPhone, defaults: D, esc, blogDate, blogHtml, blogUrl, BLOG_COVER };
})();
