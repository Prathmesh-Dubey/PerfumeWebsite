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
      services: Array.isArray(saved.services) && saved.services.length ? saved.services : D.services,
      products: Array.isArray(saved.products) ? saved.products : D.products,
      gallery: Array.isArray(saved.gallery) ? saved.gallery : D.gallery
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

  // fill every element marked data-k="<text key>" and data-calc="count|minPrice"
  function applyTexts(c) {
    document.querySelectorAll('[data-k]').forEach(el => {
      const v = c.texts[el.dataset.k];
      if (typeof v === 'string' && v.trim()) el.textContent = v;
    });
    const prices = c.products.map(p => +p.price).filter(n => n > 0);
    const calc = {
      count: String(c.products.length),
      minPrice: prices.length ? Math.min(...prices).toLocaleString('en-IN') : ''
    };
    document.querySelectorAll('[data-calc]').forEach(el => {
      const v = calc[el.dataset.calc];
      if (v) el.textContent = v;
    });
  }

  return { load, applyTexts, defaults: D };
})();
