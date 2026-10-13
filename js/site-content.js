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

  return { load, applyTexts, formatPhone, defaults: D };
})();
