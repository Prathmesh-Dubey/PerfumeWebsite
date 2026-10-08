/* /edit — website editor for Khandelwal Group.
   Log in, change bottles/prices, services, gallery photos and texts, then "Save changes" writes to MongoDB
   and the live website shows the new content within a few seconds. */
(() => {
  'use strict';

  const D = window.SITE_DEFAULTS;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = o => JSON.parse(JSON.stringify(o));
  const GENDER = { F: 'Women', M: 'Men', U: 'Unisex' };

  const TEXT_FIELDS = [
    ['heroTitle1', 'Main title, line 1', 'Big heading at the top of the website'],
    ['heroTitle2', 'Main title, line 2', 'Shown in italic under line 1'],
    ['heroEyebrow', 'Small heading', 'Above the main title, and under the logo on phones'],
    ['tagline', 'About tagline', 'The large quote in the About section'],
    ['heroLead', 'Intro paragraph', 'Under the main title (computer screens)', true],
    ['aboutText', 'About paragraph', 'The About section text', true],
    ['servicesIntro', 'Services subtitle', 'Under the "Our Services" heading'],
    ['productsIntro', 'Products subtitle', 'Under the "Products" heading'],
    ['footerTagline', 'Footer line', 'At the bottom of the page'],
    ['locationTitle', 'Location title', 'Bold line on the location card in "Get in Touch" (the map link does not change)'],
    ['locationAddress', 'Location address', 'Address line under the location title (the map link does not change)']
  ];

  let state = null;       // content being edited
  let savedSnap = '';     // what is in the database
  let busy = 0;           // uploads in progress
  let saving = false;

  /* ---------- helpers ---------- */
  let toastT;
  function toast(msg, ms = 2800) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms);
  }
  const snap = () => JSON.stringify(state, (k, v) => (k.startsWith('_') ? undefined : v));
  const isDirty = () => !!state && snap() !== savedSnap;

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
  }

  async function save() {
    // friendly checks before the server's own validation
    const missing = state.products.findIndex(p => !p.img || !String(p.code).trim());
    if (missing > -1) {
      setTab('products'); $('#pSearch').value = ''; renderProducts();
      const card = $(`#productList [data-i="${missing}"]`);
      if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); card.classList.add('is-new'); }
      return toast(`Bottle #${missing + 1} needs a photo and a name/code before saving.`, 4000);
    }
    const bad = state.products.findIndex(p => !(+p.size > 0) || !(+p.price >= 0) || p.price === '');
    if (bad > -1) { setTab('products'); return toast(`Check the size and price of bottle #${bad + 1}.`, 4000); }
    const svc = state.services.findIndex(s => !s.img || !String(s.t).trim());
    if (svc > -1) {
      setTab('services'); renderServices();
      const card = $(`#serviceList [data-i="${svc}"]`);
      if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); card.classList.add('is-new'); }
      return toast(`Service #${svc + 1} needs a photo and a title before saving.`, 4000);
    }

    saving = true; updateStatus();
    try {
      const content = JSON.parse(snap());
      await api('/api/content', { method: 'PUT', json: { content } });
      savedSnap = snap();
      state.products.forEach(p => delete p._new);
      state.services.forEach(s => delete s._new);
      renderProducts(); renderServices();
      toast('Saved. The website now shows your changes.');
    } catch (e) {
      toast(e.message, 5000);
    } finally {
      saving = false; updateStatus();
    }
  }

  /* ---------- tabs ---------- */
  function setTab(name) {
    $$('.adm-tabs [data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    $$('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== name; });
    history.replaceState(null, '', '#' + name);
  }
  $('.adm-tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });

  /* ---------- bottles ---------- */
  function productCard(p, i) {
    const n = state.products.length;
    return `
      <article class="card adm-item${p._new ? ' is-new' : ''}" data-i="${i}">
        <div class="adm-photo${p.img ? '' : ' empty'}">
          ${p.img ? `<img src="${esc(p._preview || p.img)}" alt="" loading="lazy">` : '<span>No photo yet.<br>Tap “Add photo”.</span>'}
          <span class="adm-pos">#${i + 1}</span>
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
            <div class="field"><label>For</label><select data-f="g">${Object.entries(GENDER).map(([k, v]) => `<option value="${k}"${p.g === k ? ' selected' : ''}>${v}</option>`).join('')}</select></div>
          </div>
          <div class="field"><label>Price</label><div class="adm-price"><span>₹</span><input data-f="price" type="number" min="0" step="1" inputmode="numeric" value="${esc(p.price)}"></div></div>
        </div>
        <div class="adm-actions">
          <button type="button" data-act="up" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑ Up</button>
          <button type="button" data-act="down" ${i === n - 1 ? 'disabled' : ''} aria-label="Move down">↓ Down</button>
          <button type="button" data-act="del" class="adm-del">Delete</button>
        </div>
      </article>`;
  }
  function renderProducts() {
    const q = $('#pSearch').value.trim().toLowerCase();
    const items = state.products.map((p, i) => [p, i]).filter(([p]) => !q || String(p.code).toLowerCase().includes(q));
    $('#productList').innerHTML = items.length
      ? items.map(([p, i]) => productCard(p, i)).join('')
      : '<p class="adm-empty">No bottles match your search.</p>';
    updateStatus();
  }
  $('#pSearch').addEventListener('input', renderProducts);

  $('#productList').addEventListener('input', e => {
    const f = e.target.dataset.f; if (!f) return;
    const i = +e.target.closest('[data-i]').dataset.i;
    const v = e.target.value;
    state.products[i][f] = (f === 'size' || f === 'price') ? (v === '' ? '' : Math.round(+v)) : v;
    updateStatus();
  });
  $('#productList').addEventListener('change', e => { if (e.target.dataset.f === 'g') updateStatus(); });

  $('#productList').addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const i = +b.closest('[data-i]').dataset.i;
    const list = state.products, p = list[i];
    const act = b.dataset.act;

    if (act === 'up' || act === 'down') {
      const j = act === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      renderProducts();
    } else if (act === 'del') {
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
    state.products.unshift({ code: '', size: 50, g: 'F', price: 0, img: '', detail: '', _new: true });
    $('#pSearch').value = '';
    renderProducts();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const inp = $('#productList [data-i="0"] input[data-f="code"]'); if (inp) inp.focus();
    toast('New bottle added at the top. Add a photo, name and price, then save.', 4000);
  });

  /* ---------- services ---------- */
  function serviceCard(s, i) {
    const n = state.services.length;
    return `
      <article class="card adm-item${s._new ? ' is-new' : ''}" data-i="${i}">
        <div class="adm-photo${s.img ? '' : ' empty'}">
          ${s.img ? `<img src="${esc(s.img)}" alt="" loading="lazy">` : '<span>No photo yet.<br>Tap “Add photo”.</span>'}
          <span class="adm-pos">#${i + 1}</span>
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
          <button type="button" data-act="up" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑ Up</button>
          <button type="button" data-act="down" ${i === n - 1 ? 'disabled' : ''} aria-label="Move down">↓ Down</button>
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

  $('#serviceList').addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const i = +b.closest('[data-i]').dataset.i;
    const list = state.services, s = list[i];
    const act = b.dataset.act;

    if (act === 'up' || act === 'down') {
      const j = act === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      renderServices();
    } else if (act === 'del') {
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
    const inp = $('#serviceList [data-i="0"] input[data-f="t"]'); if (inp) inp.focus();
    toast('New service added at the top. Add a photo, title and description, then save.', 4000);
  });

  /* ---------- gallery ---------- */
  function galleryCard(g, i) {
    const n = state.gallery.length;
    const bg = /^#[0-9a-f]{3,8}$/i.test(g.bg || '') ? `background:${g.bg}` : '';
    return `
      <article class="card adm-item" data-i="${i}">
        <div class="adm-photo" style="${bg}">
          <img src="${esc(g._preview || g.thumb)}" alt="" loading="lazy" style="object-fit:${g.fit === 'contain' ? 'contain' : 'cover'}">
          <span class="adm-pos">#${i + 1}${i < 10 ? ' · home' : ''}</span>
          ${g._busy ? '<span class="adm-busy">Uploading…</span>' : ''}
          <div class="adm-photo-tools">
            <button type="button" class="adm-chip" data-act="fit">${g.fit === 'contain' ? 'Showing whole photo' : 'Filling the frame'}</button>
          </div>
        </div>
        <div class="adm-body">
          <div class="field"><label>Description (for screen readers)</label><input data-f="alt" value="${esc(g.alt)}" maxlength="200"></div>
        </div>
        <div class="adm-actions">
          <button type="button" data-act="up" ${i === 0 ? 'disabled' : ''} aria-label="Move earlier">← Earlier</button>
          <button type="button" data-act="down" ${i === n - 1 ? 'disabled' : ''} aria-label="Move later">Later →</button>
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
  $('#galleryList').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const i = +b.closest('[data-i]').dataset.i, list = state.gallery;
    const act = b.dataset.act;
    if (act === 'up' || act === 'down') {
      const j = act === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
    } else if (act === 'del') {
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
    if (ok) toast(`${ok} photo${ok > 1 ? 's' : ''} added at the start. Remember to save.`, 3500);
  });

  /* ---------- texts ---------- */
  function renderTexts() {
    $('#textList').innerHTML = TEXT_FIELDS.map(([k, label, help, long]) => `
      <div class="field${long ? ' wide' : ''}">
        <label for="t-${k}">${esc(label)}</label>
        ${long
          ? `<textarea id="t-${k}" data-k="${k}" maxlength="1500" placeholder="${esc(D.texts[k])}">${esc(state.texts[k] ?? '')}</textarea>`
          : `<input id="t-${k}" data-k="${k}" maxlength="300" value="${esc(state.texts[k] ?? '')}" placeholder="${esc(D.texts[k])}">`}
        <small>${esc(help)}</small>
      </div>`).join('');
  }
  $('#textList').addEventListener('input', e => {
    const k = e.target.dataset.k; if (!k) return;
    state.texts[k] = e.target.value; updateStatus();
  });

  /* ---------- load editor ---------- */
  async function loadEditor() {
    if (state && isDirty()) { show('app'); return; } // came back after a re-login: keep unsaved edits
    show('loading');
    let content = null;
    try { content = (await api('/api/content?fresh=1')).content; }
    catch (e) { show('app'); toast('Could not load saved content: ' + e.message, 6000); }
    const base = clone(D);
    state = {
      texts: Object.assign({}, base.texts, content?.texts || {}),
      services: Array.isArray(content?.services) ? content.services : base.services,
      products: Array.isArray(content?.products) ? content.products : base.products,
      gallery: Array.isArray(content?.gallery) ? content.gallery : base.gallery
    };
    // nothing saved yet: the built-in content counts as unsaved so the first Save stores it
    savedSnap = content ? snap() : '';
    renderProducts(); renderServices(); renderGallery(); renderTexts();
    const tab = location.hash.slice(1);
    setTab(['products', 'services', 'gallery', 'texts'].includes(tab) ? tab : 'products');
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
