/* /edit — website editor for Khandelwal Group.
   Log in, change bottles/prices/categories, services, gallery photos, testimonials, timings, the WhatsApp number
   and texts, then "Save changes" writes to MongoDB and the live website shows the new content within a few seconds. */
(() => {
  'use strict';

  const D = window.SITE_DEFAULTS;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = o => JSON.parse(JSON.stringify(o));
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const WEEK = [1, 2, 3, 4, 5, 6, 0]; // Monday first
  const AVATAR_COLORS = ['#E4B5C2', '#8FB09F', '#D9A98F', '#B9A7D6', '#9CC0D6', '#E3C98F'];
  const TABS = ['products', 'services', 'gallery', 'reviews', 'hours', 'texts'];

  // [key, label, help, kind] kind: undefined = one line, 'long' = paragraph
  const TEXT_GROUPS = [
    { title: 'Top of the home page', help: 'The first thing visitors see.', preview: true, fields: [
      ['heroEyebrow', 'Small heading', 'Above the main title, and under the logo on phones'],
      ['heroTitle1', 'Main title, line 1', 'Big heading at the top of the website'],
      ['heroTitle2', 'Main title, line 2', 'Shown in italic under line 1'],
      ['heroLead', 'Intro paragraph', 'Under the main title (computer screens)', 'long']
    ] },
    { title: 'About section', help: 'Who you are, in a few lines.', fields: [
      ['tagline', 'About tagline', 'The large quote in the About section'],
      ['aboutText', 'About paragraph', 'The About section text', 'long']
    ] },
    { title: 'Section subtitles', help: 'The line under each section heading.', fields: [
      ['servicesIntro', 'Services subtitle', 'Under the “Our Services” heading'],
      ['productsIntro', 'Products subtitle', 'Under the “Products” heading']
    ] },
    { title: 'Location & footer', help: 'Shown in “Get in Touch” and at the bottom of every page.', fields: [
      ['locationTitle', 'Location title', 'Bold line on the location card (the map link does not change)'],
      ['locationAddress', 'Location address', 'Address line under the location title (the map link does not change)'],
      ['footerTagline', 'Footer line', 'At the bottom of the page']
    ] }
  ];

  let state = null;       // content being edited
  let savedSnap = '';     // what is in the database
  let busy = 0;           // uploads in progress
  let saving = false;
  let pFilter = 'all';    // category filter in the Bottles tab

  /* ---------- helpers ---------- */
  let toastT;
  function toast(msg, ms = 2800) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms);
  }
  const snap = () => JSON.stringify(state, (k, v) => (k.startsWith('_') ? undefined : v));
  const isDirty = () => !!state && snap() !== savedSnap;
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  async function api(url, { method = 'GET', json, raw } = {}) {
    const headers = {};
    if (json) headers['Content-Type'] = 'application/json';
    if (raw) headers['Content-Type'] = 'application/octet-stream';
    const r = await fetch(url, { method, headers, credentials: 'same-origin', body: raw || (json ? JSON.stringify(json) : undefined) });
    let j = {};
    try { j = await r.json(); } catch {}
    if (r.status === 401 && url !== '/api/auth') {
      showLogin('Your session ended. Please log in again. Your changes are kept.');
      throw new Error('Please log in again');
    }
    if (!r.ok) throw new Error(j.error || `Something went wrong (${r.status})`);
    return j;
  }

  function show(view) {
    $('#loadingView').hidden = view !== 'loading';
    $('#loginView').hidden = view !== 'login';
    $('#appView').hidden = view !== 'app';
  }

  /* ---------- images: shrink in the browser, then upload ---------- */
  function decode(file) {
    if ('createImageBitmap' in window) {
      return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => decodeViaImg(file));
    }
    return decodeViaImg(file);
  }
  function decodeViaImg(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => { URL.revokeObjectURL(url); resolve(im); };
      im.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Couldn't read "${file.name}". Please use a JPG or PNG photo.`)); };
      im.src = url;
    });
  }
  async function resize(file, maxSide) {
    const src = await decode(file);
    const w0 = src.width, h0 = src.height;
    const k = Math.min(1, maxSide / Math.max(w0, h0));
    const w = Math.round(w0 * k), h = Math.round(h0 * k);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(src, 0, 0, w, h);
    if (src.close) src.close();
    let q = 0.86, blob;
    do {
      blob = await new Promise(r => c.toBlob(r, 'image/jpeg', q));
      q -= 0.12;
    } while (blob && blob.size > 2.8 * 1024 * 1024 && q > 0.4);
    if (!blob) throw new Error('Could not process this photo');
    return blob;
  }
  async function upload(file, maxSide) {
    const blob = await resize(file, maxSide);
    const j = await api('/api/upload', { method: 'POST', raw: blob });
    return j.url;
  }
  function pickFiles(multiple) {
    return new Promise(resolve => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = !!multiple;
      inp.addEventListener('change', () => resolve(Array.from(inp.files || [])));
      inp.click();
    });
  }
  async function withBusy(fn) {
    busy++; updateStatus();
    try { return await fn(); }
    finally { busy--; updateStatus(); }
  }

  /* ---------- rank numbers (type a number to move an item there) ---------- */
  const rankBox = (i, n) =>
    `<label class="adm-rank" title="Type a number to move this to that place"><span>Rank</span><b>#</b><input type="number" data-rank min="1" max="${n}" step="1" inputmode="numeric" value="${i + 1}" aria-label="Rank, 1 to ${n}"></label>`;

  // moves list[i] to place `rank` (1-based); returns the new index
  function moveToRank(list, i, rank) {
    let r = Math.round(+rank);
    if (!Number.isFinite(r)) return i;
    const clamped = Math.min(list.length, Math.max(1, r));
    if (clamped !== r) toast(`Rank goes from 1 to ${list.length}, so it was set to ${clamped}.`, 3200);
    const j = clamped - 1;
    if (j === i) return i;
    const [it] = list.splice(i, 1);
    list.splice(j, 0, it);
    return j;
  }
  // wire the rank boxes inside one list; getList() returns the array, render() redraws the cards
  function wireRank(box, getList, render) {
    box.addEventListener('change', e => {
      if (!e.target.matches('[data-rank]')) return;
      const card = e.target.closest('[data-i]'), list = getList();
      const i = +card.dataset.i;
      if (e.target.value === '') { render(); return; }
      const j = moveToRank(list, i, e.target.value);
      render();
      if (j !== i) {
        const moved = $(`[data-i="${j}"]`, box);
        if (moved) {
          moved.scrollIntoView({ behavior: 'smooth', block: 'center' });
          moved.classList.add('is-moved'); setTimeout(() => moved.classList.remove('is-moved'), 1800);
        }
        toast(`Moved to rank #${j + 1}.`, 2200);
      }
    });
    box.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.matches('[data-rank]')) { e.preventDefault(); e.target.blur(); }
    });
    box.addEventListener('focusin', e => { if (e.target.matches('[data-rank]')) e.target.select(); });
  }

  /* ---------- status + save ---------- */
  function updateStatus() {
    const st = $('#saveStatus'), btn = $('#saveBtn');
    const dirty = isDirty();
    st.classList.toggle('dirty', dirty || busy > 0);
    st.textContent = busy > 0 ? 'Uploading photo…' : saving ? 'Saving…' : dirty ? 'Unsaved changes' : 'All changes saved';
    btn.disabled = !dirty || busy > 0 || saving;
    $('#nProducts').textContent = state ? `(${state.products.length})` : '';
    $('#nServices').textContent = state ? `(${state.services.length})` : '';
    $('#nGallery').textContent = state ? `(${state.gallery.length})` : '';
    $('#nReviews').textContent = state ? `(${state.testimonials.length})` : '';
  }

  function jumpTo(tab, sel, msg) {
    setTab(tab);
    const el = $(sel);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('is-new'); if (el.focus) el.focus({ preventScroll: true }); }
    toast(msg, 4500);
  }

  async function save() {
    // friendly checks before the server's own validation
    const missing = state.products.findIndex(p => !p.img || !String(p.code).trim());
    if (missing > -1) {
      pFilter = 'all'; $('#pSearch').value = ''; setTab('products'); renderProducts();
      return jumpTo('products', `#productList [data-i="${missing}"]`, `Bottle #${missing + 1} needs a photo and a name/code before saving.`);
    }
    const bad = state.products.findIndex(p => !(+p.size > 0) || !(+p.price >= 0) || p.price === '');
    if (bad > -1) {
      pFilter = 'all'; $('#pSearch').value = ''; renderProducts();
      return jumpTo('products', `#productList [data-i="${bad}"]`, `Check the size and price of bottle #${bad + 1}.`);
    }
    if (state.categories.some(c => !c.name.trim())) return jumpTo('products', '#catList input', 'A category has no name. Type a name or delete it.');
    const svc = state.services.findIndex(s => !s.img || !String(s.t).trim());
    if (svc > -1) {
      renderServices();
      return jumpTo('services', `#serviceList [data-i="${svc}"]`, `Service #${svc + 1} needs a photo and a title before saving.`);
    }
    const rev = state.testimonials.findIndex(t => !String(t.q).trim());
    if (rev > -1) {
      renderReviews();
      return jumpTo('reviews', `#reviewList [data-i="${rev}"] textarea`, `Testimonial #${rev + 1} needs some text. Write it or delete the card.`);
    }
    if (!validWa(state.settings.wa)) return jumpTo('hours', '#waInput', 'Enter a valid WhatsApp number with country code.');
    const hb = state.hours.findIndex(h => h.on && h.to <= h.from);
    if (hb > -1) return jumpTo('hours', `#hoursEditor [data-d="${hb}"] input[data-h="to"]`, `${DAY_NAMES[hb]}: closing time must be after opening time.`);

    saving = true; updateStatus();
    try {
      const content = JSON.parse(snap());
      await api('/api/content', { method: 'PUT', json: { content } });
      savedSnap = snap();
      state.products.forEach(p => delete p._new);
      state.services.forEach(s => delete s._new);
      renderProducts(); renderServices(); renderReviews();
      toast('Saved. The website now shows your changes.');
    } catch (e) {
      toast(e.message, 5000);
    } finally {
      saving = false; updateStatus();
    }
  }

  /* ---------- tabs ---------- */
  function setTab(name) {
    $$('.adm-tabs [data-tab]').forEach(b => {
      const on = b.dataset.tab === name;
      b.setAttribute('aria-selected', String(on));
      if (on) b.scrollIntoView({ block: 'nearest', inline: 'center' });
    });
    $$('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== name; });
    history.replaceState(null, '', '#' + name);
  }
  $('.adm-tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });

  /* ---------- bottles ---------- */
  const catName = id => (state.categories.find(c => c.id === id) || {}).name || '';
  const catCount = id => state.products.filter(p => p.g === id).length;

  function productCard(p, i) {
    const n = state.products.length;
    const opts = state.categories.map(c => `<option value="${esc(c.id)}"${p.g === c.id ? ' selected' : ''}>${esc(c.name || '(no name)')}</option>`).join('');
    return `
      <article class="card adm-item${p._new ? ' is-new' : ''}" data-i="${i}">
        <div class="adm-photo${p.img ? '' : ' empty'}">
          ${p.img ? `<img src="${esc(p._preview || p.img)}" alt="" loading="lazy">` : '<span>No photo yet.<br>Tap “Add photo”.</span>'}
          ${rankBox(i, n)}
          ${p._busy ? '<span class="adm-busy">Uploading…</span>' : ''}
          <div class="adm-photo-tools">
            <button type="button" class="adm-chip" data-act="photo">${p.img ? 'Change photo' : 'Add photo'}</button>
            <button type="button" class="adm-chip" data-act="detail" title="Shown when a visitor taps the bottle">${p.detail ? `<img src="${esc(p.detail)}" alt="">` : ''}Detail photo</button>
          </div>
        </div>
        <div class="adm-body">
          <div class="field"><label>Name / code</label><input data-f="code" value="${esc(p.code)}" maxlength="40" placeholder="e.g. GA2302"></div>
          <div class="adm-row">
            <div class="field"><label>Size (ml)</label><input data-f="size" type="number" min="1" step="1" inputmode="numeric" value="${esc(p.size)}"></div>
            <div class="field"><label>Category</label><select data-f="g">${opts}</select></div>
          </div>
          <div class="field"><label>Price</label><div class="adm-price"><span>₹</span><input data-f="price" type="number" min="0" step="1" inputmode="numeric" value="${esc(p.price)}"></div></div>
        </div>
        <div class="adm-actions">
          <button type="button" data-act="del" class="adm-del">Delete</button>
        </div>
      </article>`;
  }
  function renderCategories() {
    $('#catList').innerHTML = state.categories.map(c => {
      const k = catCount(c.id);
      return `<div class="adm-cat" data-id="${esc(c.id)}">
        <input data-cat="name" value="${esc(c.name)}" maxlength="30" aria-label="Category name">
        <span class="adm-cat-n">${plural(k, 'bottle')}</span>
        <button type="button" class="adm-x" data-act="catdel" aria-label="Delete category ${esc(c.name)}" title="Delete category">×</button>
      </div>`;
    }).join('');
    const chips = [['all', 'All', state.products.length], ...state.categories.map(c => [c.id, c.name || '(no name)', catCount(c.id)])];
    if (!chips.some(c => c[0] === pFilter)) pFilter = 'all';
    $('#catFilter').innerHTML = chips.map(([id, name, k]) =>
      `<button type="button" class="adm-fchip" data-f="${esc(id)}" aria-pressed="${id === pFilter}">${esc(name)} <i>${k}</i></button>`).join('');
  }
  function renderProducts() {
    renderCategories();
    const q = $('#pSearch').value.trim().toLowerCase();
    const items = state.products.map((p, i) => [p, i])
      .filter(([p]) => (pFilter === 'all' || p.g === pFilter) && (!q || String(p.code).toLowerCase().includes(q)));
    $('#productList').innerHTML = items.length
      ? items.map(([p, i]) => productCard(p, i)).join('')
      : `<p class="adm-empty">${state.products.length ? 'No bottles match your search or category.' : 'No bottles yet. Use “Add bottle”.'}</p>`;
    updateStatus();
  }
  $('#pSearch').addEventListener('input', renderProducts);

  $('#catFilter').addEventListener('click', e => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    pFilter = b.dataset.f; renderProducts();
  });

  // category manager
  $('#catAdd').addEventListener('submit', e => {
    e.preventDefault();
    const inp = $('#catName'), name = inp.value.trim().replace(/\s+/g, ' ');
    if (!name) return toast('Type a category name first.');
    if (state.categories.length >= 30) return toast('You can have up to 30 categories.');
    if (state.categories.some(c => c.name.toLowerCase() === name.toLowerCase())) return toast(`There is already a category called “${name}”.`, 3500);
    const id = 'c' + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 5);
    state.categories.push({ id, name });
    inp.value = '';
    pFilter = id;
    renderProducts();
    toast(`Category “${name}” added. Add a bottle, or pick this category on an existing bottle.`, 4200);
  });
  $('#catList').addEventListener('input', e => {
    if (e.target.dataset.cat !== 'name') return;
    const c = state.categories.find(x => x.id === e.target.closest('[data-id]').dataset.id);
    c.name = e.target.value; updateStatus();
  });
  $('#catList').addEventListener('change', e => {
    if (e.target.dataset.cat !== 'name') return;
    const c = state.categories.find(x => x.id === e.target.closest('[data-id]').dataset.id);
    c.name = c.name.trim().replace(/\s+/g, ' ');
    if (c.name && state.categories.some(x => x !== c && x.name.toLowerCase() === c.name.toLowerCase())) {
      toast(`There is already a category called “${c.name}”. Please use a different name.`, 4000);
    }
    renderProducts();
  });
  $('#catList').addEventListener('click', e => {
    const b = e.target.closest('[data-act="catdel"]'); if (!b) return;
    const id = b.closest('[data-id]').dataset.id;
    const i = state.categories.findIndex(c => c.id === id), c = state.categories[i];
    if (state.categories.length === 1) return toast('Keep at least one category.');
    const k = catCount(id), fallback = state.categories.find(x => x.id !== id);
    const msg = k
      ? `Delete category “${c.name}”? Its ${plural(k, 'bottle')} will move to “${fallback.name}”.`
      : `Delete category “${c.name}”?`;
    if (!confirm(msg)) return;
    state.products.forEach(p => { if (p.g === id) p.g = fallback.id; });
    state.categories.splice(i, 1);
    renderProducts();
  });

  $('#productList').addEventListener('input', e => {
    const f = e.target.dataset.f; if (!f) return;
    const i = +e.target.closest('[data-i]').dataset.i;
    const v = e.target.value;
    state.products[i][f] = (f === 'size' || f === 'price') ? (v === '' ? '' : Math.round(+v)) : v;
    updateStatus();
  });
  $('#productList').addEventListener('change', e => {
    if (e.target.dataset.f === 'g') { renderCategories(); updateStatus(); }
  });
  wireRank($('#productList'), () => state.products, renderProducts);

  $('#productList').addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const i = +b.closest('[data-i]').dataset.i;
    const list = state.products, p = list[i];
    const act = b.dataset.act;

    if (act === 'del') {
      if (!confirm(`Delete bottle "${p.code || 'new bottle'}"? It will disappear from the website after you save.`)) return;
      list.splice(i, 1); renderProducts();
    } else if (act === 'photo' || act === 'detail') {
      const [file] = await pickFiles(false); if (!file) return;
      const key = act === 'photo' ? 'img' : 'detail';
      p._busy = true; renderProducts();
      try {
        const url = await withBusy(() => upload(file, act === 'photo' ? 1200 : 1800));
        p[key] = url;
        toast(act === 'photo' ? 'Photo updated. Remember to save.' : 'Detail photo updated. Remember to save.');
      } catch (err) { toast(err.message, 5000); }
      finally { delete p._busy; renderProducts(); }
    }
  });

  $('#addProduct').addEventListener('click', () => {
    const g = pFilter !== 'all' ? pFilter : state.categories[0].id;
    state.products.unshift({ code: '', size: 50, g, price: 0, img: '', detail: '', _new: true });
    $('#pSearch').value = '';
    renderProducts();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const inp = $('#productList [data-i="0"] input[data-f="code"]'); if (inp) inp.focus({ preventScroll: true });
    toast('New bottle added at rank #1. Add a photo, name and price, then save. Change its rank number to move it.', 5000);
  });

  /* ---------- services ---------- */
  function serviceCard(s, i) {
    const n = state.services.length;
    return `
      <article class="card adm-item${s._new ? ' is-new' : ''}" data-i="${i}">
        <div class="adm-photo${s.img ? '' : ' empty'}">
          ${s.img ? `<img src="${esc(s.img)}" alt="" loading="lazy">` : '<span>No photo yet.<br>Tap “Add photo”.</span>'}
          ${rankBox(i, n)}
          ${s._busy ? '<span class="adm-busy">Uploading…</span>' : ''}
          <div class="adm-photo-tools">
            <button type="button" class="adm-chip" data-act="photo">${s.img ? 'Change photo' : 'Add photo'}</button>
          </div>
        </div>
        <div class="adm-body">
          <div class="field"><label>Title</label><input data-f="t" value="${esc(s.t)}" maxlength="80" placeholder="e.g. Corporate Gifting"></div>
          <div class="field"><label>Description</label><textarea data-f="d" maxlength="300" placeholder="One or two short lines about this service">${esc(s.d)}</textarea></div>
        </div>
        <div class="adm-actions">
          <button type="button" data-act="del" class="adm-del">Delete</button>
        </div>
      </article>`;
  }
  function renderServices() {
    $('#serviceList').innerHTML = state.services.length
      ? state.services.map(serviceCard).join('')
      : '<p class="adm-empty">No services. The Services section is hidden on the website until you add one.</p>';
    updateStatus();
  }

  $('#serviceList').addEventListener('input', e => {
    const f = e.target.dataset.f; if (!f) return;
    state.services[+e.target.closest('[data-i]').dataset.i][f] = e.target.value;
    updateStatus();
  });
  wireRank($('#serviceList'), () => state.services, renderServices);

  $('#serviceList').addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const i = +b.closest('[data-i]').dataset.i;
    const list = state.services, s = list[i];
    const act = b.dataset.act;

    if (act === 'del') {
      if (s._busy) return;
      if (!confirm(`Delete service "${s.t || 'new service'}"? It will disappear from the website after you save.`)) return;
      list.splice(i, 1); renderServices();
    } else if (act === 'photo') {
      const [file] = await pickFiles(false); if (!file) return;
      s._busy = true; renderServices();
      try {
        s.img = await withBusy(() => upload(file, 1000));
        toast('Photo updated. Remember to save.');
      } catch (err) { toast(err.message, 5000); }
      finally { delete s._busy; renderServices(); }
    }
  });

  $('#addService').addEventListener('click', () => {
    if (state.services.length >= 30) return toast('You can have up to 30 services. Delete one to add another.', 4000);
    state.services.unshift({ t: '', d: '', img: '', _new: true });
    renderServices();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const inp = $('#serviceList [data-i="0"] input[data-f="t"]'); if (inp) inp.focus({ preventScroll: true });
    toast('New service added at rank #1. Add a photo, title and description, then save.', 4500);
  });

  /* ---------- gallery ---------- */
  function galleryCard(g, i) {
    const n = state.gallery.length;
    const bg = /^#[0-9a-f]{3,8}$/i.test(g.bg || '') ? `background:${g.bg}` : '';
    return `
      <article class="card adm-item" data-i="${i}">
        <div class="adm-photo" style="${bg}">
          <img src="${esc(g._preview || g.thumb)}" alt="" loading="lazy" style="object-fit:${g.fit === 'contain' ? 'contain' : 'cover'}">
          ${rankBox(i, n)}
          ${i < 10 ? '<span class="adm-home">Home page</span>' : ''}
          ${g._busy ? '<span class="adm-busy">Uploading…</span>' : ''}
          <div class="adm-photo-tools">
            <button type="button" class="adm-chip" data-act="fit">${g.fit === 'contain' ? 'Showing whole photo' : 'Filling the frame'}</button>
          </div>
        </div>
        <div class="adm-body">
          <div class="field"><label>Description (for screen readers)</label><input data-f="alt" value="${esc(g.alt)}" maxlength="200"></div>
        </div>
        <div class="adm-actions">
          <button type="button" data-act="del" class="adm-del">Delete</button>
        </div>
      </article>`;
  }
  function renderGallery() {
    $('#galleryList').innerHTML = state.gallery.length
      ? state.gallery.map(galleryCard).join('')
      : '<p class="adm-empty">No photos yet. Use “Add photos”.</p>';
    updateStatus();
  }
  $('#galleryList').addEventListener('input', e => {
    if (e.target.dataset.f !== 'alt') return;
    state.gallery[+e.target.closest('[data-i]').dataset.i].alt = e.target.value;
    updateStatus();
  });
  wireRank($('#galleryList'), () => state.gallery, renderGallery);
  $('#galleryList').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const i = +b.closest('[data-i]').dataset.i, list = state.gallery;
    const act = b.dataset.act;
    if (act === 'del') {
      if (list[i]._busy) return;
      if (!confirm('Delete this photo from the gallery? It will disappear from the website after you save.')) return;
      list.splice(i, 1);
    } else if (act === 'fit') {
      list[i].fit = list[i].fit === 'contain' ? 'cover' : 'contain';
    }
    renderGallery();
  });

  $('#galleryFiles').addEventListener('change', async e => {
    const files = Array.from(e.target.files || []); e.target.value = '';
    if (!files.length) return;
    // new photos go first, so they show on the home page
    const items = files.map(f => ({ thumb: '', full: '', alt: 'Velunia Signature perfume', fit: 'cover', bg: '', _busy: true, _preview: URL.createObjectURL(f), _file: f }));
    state.gallery.unshift(...items);
    renderGallery();
    let ok = 0;
    for (const it of items) {
      try {
        await withBusy(async () => {
          it.thumb = await upload(it._file, 640);
          it.full = await upload(it._file, 1800);
        });
        ok++;
      } catch (err) {
        state.gallery.splice(state.gallery.indexOf(it), 1);
        toast(err.message, 5000);
      }
      URL.revokeObjectURL(it._preview);
      delete it._busy; delete it._preview; delete it._file;
      renderGallery();
    }
    if (ok) toast(`${plural(ok, 'photo')} added at the start. Change a rank number to move them.`, 3800);
  });

  /* ---------- testimonials ---------- */
  function reviewCard(t, i) {
    const n = state.testimonials.length;
    const color = t.c || AVATAR_COLORS[i % AVATAR_COLORS.length];
    return `
      <article class="card adm-item adm-rev${t._new ? ' is-new' : ''}" data-i="${i}">
        <div class="adm-rev-top">
          <span class="adm-av" style="background:${color}" aria-hidden="true">${esc((t.n || '?').trim().charAt(0).toUpperCase() || '?')}</span>
          <span class="adm-stars" aria-hidden="true">★★★★★</span>
          ${rankBox(i, n)}
        </div>
        <div class="adm-body">
          <div class="field"><label>Customer name</label><input data-f="n" value="${esc(t.n)}" maxlength="60" placeholder="e.g. Priya"></div>
          <div class="field"><label>What they said</label><textarea data-f="q" maxlength="500" placeholder="A sentence or two from the customer">${esc(t.q)}</textarea><small class="adm-count" data-count>${String(t.q || '').length}/500</small></div>
        </div>
        <div class="adm-actions">
          <button type="button" data-act="del" class="adm-del">Delete</button>
        </div>
      </article>`;
  }
  function renderReviews() {
    $('#reviewList').innerHTML = state.testimonials.length
      ? state.testimonials.map(reviewCard).join('')
      : '<p class="adm-empty">No testimonials. The Reviews section is hidden on the website until you add one.</p>';
    updateStatus();
  }
  $('#reviewList').addEventListener('input', e => {
    const f = e.target.dataset.f; if (!f) return;
    const card = e.target.closest('[data-i]');
    const t = state.testimonials[+card.dataset.i];
    t[f] = e.target.value;
    if (f === 'q') $('[data-count]', card).textContent = `${e.target.value.length}/500`;
    if (f === 'n') $('.adm-av', card).textContent = (e.target.value.trim().charAt(0) || '?').toUpperCase();
    updateStatus();
  });
  wireRank($('#reviewList'), () => state.testimonials, renderReviews);
  $('#reviewList').addEventListener('click', e => {
    const b = e.target.closest('[data-act="del"]'); if (!b) return;
    const i = +b.closest('[data-i]').dataset.i, t = state.testimonials[i];
    if (!confirm(`Delete the testimonial from "${t.n || 'this customer'}"? It will disappear from the website after you save.`)) return;
    state.testimonials.splice(i, 1); renderReviews();
  });
  $('#addReview').addEventListener('click', () => {
    if (state.testimonials.length >= 30) return toast('You can have up to 30 testimonials. Delete one to add another.', 4000);
    state.testimonials.unshift({ n: '', q: '', c: '', _new: true });
    renderReviews();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const inp = $('#reviewList [data-i="0"] input[data-f="n"]'); if (inp) inp.focus({ preventScroll: true });
    toast('New testimonial added at rank #1. Write the name and what they said, then save.', 4500);
  });

  /* ---------- timings ---------- */
  function renderHours() {
    $('#hoursEditor').innerHTML = WEEK.map(d => {
      const h = state.hours[d];
      return `<div class="adm-day${h.on ? '' : ' off'}" data-d="${d}">
        <label class="adm-switch"><input type="checkbox" data-h="on"${h.on ? ' checked' : ''} aria-label="${DAY_NAMES[d]} open"><i></i></label>
        <span class="adm-day-name">${DAY_NAMES[d]}</span>
        ${h.on
          ? `<span class="adm-times"><input type="time" data-h="from" value="${esc(h.from)}" aria-label="${DAY_NAMES[d]} opens"><em>to</em><input type="time" data-h="to" value="${esc(h.to)}" aria-label="${DAY_NAMES[d]} closes"></span>`
          : '<span class="adm-closed">Closed</span>'}
      </div>`;
    }).join('');
  }
  $('#hoursEditor').addEventListener('change', e => {
    const k = e.target.dataset.h; if (!k) return;
    const d = +e.target.closest('[data-d]').dataset.d, h = state.hours[d];
    if (k === 'on') { h.on = e.target.checked; renderHours(); }
    else if (e.target.value) { h[k] = e.target.value; if (h.on && h.to <= h.from) toast('Closing time must be after opening time.', 3500); }
    else e.target.value = h[k];
    updateStatus();
  });
  $('#hoursCopy').addEventListener('click', () => {
    const src = state.hours[1];
    state.hours.forEach((h, d) => { if (h.on && d !== 1) { h.from = src.from; h.to = src.to; } });
    renderHours(); updateStatus();
    toast(src.on ? 'Monday’s timings copied to every open day.' : 'Monday is closed, so its timings were copied to the other open days.');
  });

  /* ---------- WhatsApp number ---------- */
  const validWa = v => /^[1-9]\d{9,14}$/.test(String(v || ''));
  const fmtPhone = d => (/^91\d{10}$/.test(d) ? `+91 ${d.slice(2, 7)} ${d.slice(7)}` : '+' + d);
  function readWa(raw) {
    let d = String(raw).replace(/\D/g, '').replace(/^0+/, '');
    if (d.length === 10 && /^[6-9]/.test(d)) d = '91' + d;   // 10-digit Indian mobile: add +91
    return d;
  }
  function renderWa(fromInput) {
    const wa = state.settings.wa, ok = validWa(wa);
    const inp = $('#waInput');
    if (!fromInput) inp.value = wa ? fmtPhone(wa) : '';
    inp.closest('.field').classList.toggle('bad', !ok);
    $('#waHelp').textContent = ok ? `Customers will chat with ${fmtPhone(wa)}` : 'Enter the number with its country code, 10 to 15 digits. A 10-digit Indian mobile number gets +91 automatically.';
    $('#waHelp').classList.toggle('err-text', !ok);
    const test = $('#waTest');
    test.href = ok ? `https://wa.me/${wa}` : '#';
    test.classList.toggle('is-disabled', !ok);
    $('#waNote').hidden = !ok || wa === D.settings.wa;
  }
  $('#waInput').addEventListener('input', e => { state.settings.wa = readWa(e.target.value); renderWa(true); updateStatus(); });
  $('#waInput').addEventListener('blur', () => renderWa(false));
  $('#waTest').addEventListener('click', e => { if (!validWa(state.settings.wa)) e.preventDefault(); });

  /* ---------- texts ---------- */
  function heroPreview() {
    const t = k => (state.texts[k] || '').trim() || D.texts[k];
    const el = $('#heroPreview'); if (!el) return;
    el.innerHTML = `<small>${esc(t('heroEyebrow'))}</small><h4>${esc(t('heroTitle1'))}<br><em>${esc(t('heroTitle2'))}</em></h4><p>${esc(t('heroLead'))}</p>`;
  }
  const isOrig = (k, v) => !v || v === D.texts[k];
  function textField([k, label, help, kind]) {
    const v = state.texts[k] ?? '', max = kind === 'long' ? 1500 : 300, orig = isOrig(k, v);
    return `
      <div class="field adm-tf${kind === 'long' ? ' wide' : ''}" data-key="${k}">
        <div class="adm-tf-top">
          <label for="t-${k}">${esc(label)}</label>
          <button type="button" class="adm-link" data-act="reset"${orig ? ' hidden' : ''}>Use original</button>
        </div>
        ${kind === 'long'
          ? `<textarea id="t-${k}" data-k="${k}" maxlength="${max}" rows="3" placeholder="${esc(D.texts[k])}">${esc(v)}</textarea>`
          : `<input id="t-${k}" data-k="${k}" maxlength="${max}" value="${esc(v)}" placeholder="${esc(D.texts[k])}">`}
        <div class="adm-tf-foot"><small>${esc(help)}</small><small class="adm-count" data-count>${orig ? 'original' : `${v.length}/${max}`}</small></div>
      </div>`;
  }
  function renderTexts() {
    $('#textList').innerHTML = TEXT_GROUPS.map((g, gi) => `
      <section class="card adm-tg">
        <header><span class="adm-tg-n">${gi + 1}</span><div><h3>${esc(g.title)}</h3><p class="adm-muted">${esc(g.help)}</p></div></header>
        ${g.preview ? '<div class="adm-hero-prev" id="heroPreview" aria-label="Preview"></div>' : ''}
        <div class="adm-tg-fields">${g.fields.map(textField).join('')}</div>
      </section>`).join('');
    $$('#textList textarea').forEach(grow);
    heroPreview();
  }
  const grow = ta => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight + 2, 320) + 'px'; };
  $('#textList').addEventListener('input', e => {
    const k = e.target.dataset.k; if (!k) return;
    state.texts[k] = e.target.value;
    const f = e.target.closest('.adm-tf'), max = e.target.maxLength;
    const orig = isOrig(k, e.target.value);
    $('[data-count]', f).textContent = orig ? 'original' : `${e.target.value.length}/${max}`;
    $('[data-act="reset"]', f).hidden = orig;
    if (e.target.tagName === 'TEXTAREA') grow(e.target);
    heroPreview(); updateStatus();
  });
  $('#textList').addEventListener('click', e => {
    const b = e.target.closest('[data-act="reset"]'); if (!b) return;
    const f = b.closest('.adm-tf'), inp = $('[data-k]', f), k = inp.dataset.k;
    state.texts[k] = ''; inp.value = '';
    $('[data-count]', f).textContent = 'original'; b.hidden = true;
    if (inp.tagName === 'TEXTAREA') grow(inp);
    heroPreview(); updateStatus(); inp.focus();
  });

  /* ---------- load editor ---------- */
  async function loadEditor() {
    if (state && isDirty()) { show('app'); return; } // came back after a re-login: keep unsaved edits
    show('loading');
    let content = null;
    try { content = (await api('/api/content?fresh=1')).content; }
    catch (e) { show('app'); toast('Could not load saved content: ' + e.message, 6000); }
    const base = clone(D), has = k => Array.isArray(content?.[k]);
    state = {
      texts: Object.assign({}, base.texts, content?.texts || {}),
      services: has('services') ? content.services : base.services,
      products: has('products') ? content.products : base.products,
      gallery: has('gallery') ? content.gallery : base.gallery,
      categories: has('categories') && content.categories.length ? content.categories : base.categories,
      testimonials: has('testimonials') ? content.testimonials : base.testimonials,
      hours: has('hours') && content.hours.length === 7 ? content.hours : base.hours,
      settings: Object.assign({}, base.settings, content?.settings || {})
    };
    // bottles saved under a category that no longer exists go to the first category
    state.products.forEach(p => { if (!state.categories.some(c => c.id === p.g)) p.g = state.categories[0].id; });
    // nothing saved yet: the built-in content counts as unsaved so the first Save stores it
    savedSnap = content ? snap() : '';
    pFilter = 'all';
    renderProducts(); renderServices(); renderGallery(); renderReviews(); renderHours(); renderWa(false); renderTexts();
    const tab = location.hash.slice(1);
    setTab(TABS.includes(tab) ? tab : 'products');
    show('app');
    updateStatus();
  }

  /* ---------- login / logout ---------- */
  function showLogin(msg) {
    const err = $('#loginError');
    err.hidden = !msg; err.textContent = msg || '';
    show('login');
    setTimeout(() => $('#lPhone').focus(), 50);
  }
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const phone = $('#lPhone').value, password = $('#lPass').value;
    const err = $('#loginError'), btn = $('#loginBtn');
    if (!phone.trim() || !password) { err.textContent = 'Enter your mobile number and password.'; err.hidden = false; return; }
    btn.disabled = true; btn.textContent = 'Logging in…'; err.hidden = true;
    try {
      await api('/api/auth', { method: 'POST', json: { phone, password } });
      $('#lPass').value = '';
      await loadEditor();
    } catch (ex) {
      err.textContent = ex.message; err.hidden = false;
    } finally {
      btn.disabled = false; btn.textContent = 'Log in';
    }
  });
  $('#logoutBtn').addEventListener('click', async () => {
    if (isDirty() && !confirm('You have unsaved changes. Log out anyway and lose them?')) return;
    try { await api('/api/auth', { method: 'DELETE' }); } catch {}
    state = null; savedSnap = '';
    showLogin();
  });
  $('#saveBtn').addEventListener('click', save);
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && state) { e.preventDefault(); if (!$('#saveBtn').disabled) save(); }
  });
  window.addEventListener('beforeunload', e => { if (isDirty() || busy) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------- start ---------- */
  (async () => {
    try {
      const { admin } = await api('/api/auth');
      if (admin) await loadEditor(); else showLogin();
    } catch { showLogin('Could not reach the server. Check your internet connection and reload.'); }
  })();
})();
