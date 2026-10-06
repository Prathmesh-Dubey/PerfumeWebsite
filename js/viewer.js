/* Zoomable photo viewer.
   window.ZoomViewer.open(items, index)
   items: [{ src, alt?, text?, action? }]  (action = optional link shown as an "Enquire now" button)
   Zoom: pinch, double-tap / double-click, mouse wheel, + / - buttons, keys + - 0.
   Move: drag when zoomed. Browse: swipe, arrow buttons, arrow keys. Close: X, Esc, tap the dark area. */
(() => {
  'use strict';

  const MIN = 1, MAX = 5;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const svg = d => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const I = {
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    minus: svg('<path d="M5 12h14"/>'),
    fit: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
    close: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
    left: svg('<path d="m15 18-6-6 6-6"/>'),
    right: svg('<path d="m9 18 6-6-6-6"/>'),
    wa: '<img class="wa-ic" src="assets/brand/whatsapp.png" alt="" width="20" height="20">'
  };

  let root, stage, img, countEl, textEl, actionEl, btnPrev, btnNext, btnIn, btnOut, btnFit, btnClose;
  let items = [], idx = 0, lastFocus = null;
  let s = 1, tx = 0, ty = 0, sw = 0, sh = 0, w0 = 0, h0 = 0;
  const pointers = new Map();
  let gesture = null;
  let lastTap = { t: 0, x: 0, y: 0 };

  function build() {
    if (root) return;
    root = document.createElement('div');
    root.className = 'zv';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Photo viewer');
    root.innerHTML = `
      <div class="zv-top">
        <span class="zv-count" aria-live="polite"></span>
        <div class="zv-tools">
          <button type="button" class="zv-btn" data-a="out" aria-label="Zoom out">${I.minus}</button>
          <button type="button" class="zv-btn" data-a="in" aria-label="Zoom in">${I.plus}</button>
          <button type="button" class="zv-btn" data-a="fit" aria-label="Reset zoom">${I.fit}</button>
          <button type="button" class="zv-btn" data-a="close" aria-label="Close viewer">${I.close}</button>
        </div>
      </div>
      <div class="zv-stage">
        <img class="zv-img" alt="" draggable="false">
        <button type="button" class="zv-btn zv-nav zv-prev" data-a="prev" aria-label="Previous photo">${I.left}</button>
        <button type="button" class="zv-btn zv-nav zv-next" data-a="next" aria-label="Next photo">${I.right}</button>
      </div>
      <div class="zv-bottom">
        <span class="zv-text"></span>
        <a class="btn btn-sm zv-action" target="_blank" rel="noopener" hidden>${I.wa}Enquire now</a>
      </div>`;
    document.body.appendChild(root);

    stage = root.querySelector('.zv-stage');
    img = root.querySelector('.zv-img');
    countEl = root.querySelector('.zv-count');
    textEl = root.querySelector('.zv-text');
    actionEl = root.querySelector('.zv-action');
    btnPrev = root.querySelector('.zv-prev'); btnNext = root.querySelector('.zv-next');
    btnIn = root.querySelector('[data-a=in]'); btnOut = root.querySelector('[data-a=out]');
    btnFit = root.querySelector('[data-a=fit]'); btnClose = root.querySelector('[data-a=close]');

    root.addEventListener('click', e => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      const a = b.dataset.a;
      if (a === 'close') close();
      else if (a === 'prev') step(-1);
      else if (a === 'next') step(1);
      else if (a === 'in') zoomAt(s * 1.6, 0, 0, true);
      else if (a === 'out') zoomAt(s / 1.6, 0, 0, true);
      else if (a === 'fit') zoomAt(1, 0, 0, true);
    });

    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('pointercancel', onUp);
    stage.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', () => { if (isOpen()) { layout(); apply(false); } });
  }

  const isOpen = () => root && root.classList.contains('open');

  /* ---- geometry ---- */
  function layout() {
    const r = stage.getBoundingClientRect();
    sw = r.width; sh = r.height;
    const nw = img.naturalWidth, nh = img.naturalHeight;
    if (!nw || !nh) return;
    const k = Math.min(sw / nw, sh / nh);
    w0 = nw * k; h0 = nh * k;
    img.style.width = w0 + 'px';
    img.style.height = h0 + 'px';
  }
  function clampPan() {
    const mx = Math.max(0, (w0 * s - sw) / 2), my = Math.max(0, (h0 * s - sh) / 2);
    tx = clamp(tx, -mx, mx); ty = clamp(ty, -my, my);
  }
  function paint(x, y, k, animate) {
    img.style.transition = animate ? 'transform .22s ease' : 'none';
    img.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${k})`;
  }
  function apply(animate) {
    clampPan();
    paint(tx, ty, s, animate);
    stage.classList.toggle('zoomed', s > 1.01);
    btnIn.disabled = s >= MAX - 0.01;
    btnOut.disabled = s <= MIN + 0.01;
    btnFit.disabled = s <= MIN + 0.01;
  }
  // zoom keeping the point (cx, cy), measured from the stage centre, fixed on screen
  function zoomAt(next, cx, cy, animate) {
    next = clamp(next, MIN, MAX);
    const ratio = next / s;
    tx = cx - (cx - tx) * ratio;
    ty = cy - (cy - ty) * ratio;
    s = next;
    if (s <= MIN + 0.001) { tx = 0; ty = 0; }
    apply(animate);
  }
  function stageCentre() {
    const r = stage.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  /* ---- content ---- */
  function show() {
    const it = items[idx];
    s = 1; tx = 0; ty = 0;
    img.classList.remove('ready');
    img.onload = () => { layout(); apply(false); img.classList.add('ready'); };
    img.alt = it.alt || '';
    img.src = it.src;
    countEl.textContent = items.length > 1 ? `${idx + 1} / ${items.length}` : '';
    textEl.textContent = it.text || '';
    textEl.hidden = !it.text;
    if (it.action) { actionEl.href = it.action; actionEl.hidden = false; } else { actionEl.hidden = true; }
    const many = items.length > 1;
    btnPrev.hidden = !many; btnNext.hidden = !many;
    if (many) [idx + 1, idx - 1].forEach(j => { const n = items[(j + items.length) % items.length]; new Image().src = n.src; });
    btnIn.disabled = false; btnOut.disabled = true; btnFit.disabled = true;
  }
  function step(d) {
    if (items.length < 2) return;
    idx = (idx + d + items.length) % items.length;
    show();
  }
  function open(list, i) {
    if (!list || !list.length) return;
    build();
    items = list; idx = clamp(i || 0, 0, list.length - 1);
    lastFocus = document.activeElement;
    root.classList.add('open');
    document.body.style.overflow = 'hidden';
    show();
    btnClose.focus();
  }
  function close() {
    root.classList.remove('open');
    document.body.style.overflow = '';
    img.removeAttribute('src');
    pointers.clear(); gesture = null;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  /* ---- pointer gestures ---- */
  function onDown(e) {
    if (e.target.closest('[data-a]')) return;
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const c = stageCentre();
      gesture = {
        type: 'pinch', s0: s, tx0: tx, ty0: ty,
        d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        mx0: (a.x + b.x) / 2 - c.x, my0: (a.y + b.y) / 2 - c.y
      };
    } else if (pointers.size === 1) {
      gesture = { type: s > 1.01 ? 'pan' : 'swipe', x0: e.clientX, y0: e.clientY, tx0: tx, ty0: ty, t0: performance.now(), moved: false };
    }
  }
  function onMove(e) {
    if (!pointers.has(e.pointerId) || !gesture) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gesture.type === 'pinch' && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const c = stageCentre();
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const next = clamp(gesture.s0 * (d / gesture.d0), MIN, MAX);
      const mx = (a.x + b.x) / 2 - c.x, my = (a.y + b.y) / 2 - c.y;
      const ratio = next / gesture.s0;
      s = next;
      tx = mx - (gesture.mx0 - gesture.tx0) * ratio;
      ty = my - (gesture.my0 - gesture.ty0) * ratio;
      apply(false);
    } else if (gesture.type === 'pan') {
      const dx = e.clientX - gesture.x0, dy = e.clientY - gesture.y0;
      if (Math.hypot(dx, dy) > 4) gesture.moved = true;
      tx = gesture.tx0 + dx; ty = gesture.ty0 + dy;
      stage.classList.add('panning');
      apply(false);
    } else if (gesture.type === 'swipe') {
      const dx = e.clientX - gesture.x0;
      if (Math.abs(dx) > 6) { gesture.moved = true; paint(dx * 0.35, 0, 1, false); }
    }
  }
  function onUp(e) {
    const had = pointers.has(e.pointerId);
    pointers.delete(e.pointerId);
    stage.classList.remove('panning');
    if (!had || !gesture) return;
    const g = gesture;

    if (g.type === 'pinch') {
      if (pointers.size === 1) {
        const [p] = [...pointers.values()];
        gesture = { type: s > 1.01 ? 'pan' : 'swipe', x0: p.x, y0: p.y, tx0: tx, ty0: ty, t0: performance.now(), moved: true };
      } else gesture = null;
      if (s < 1.05) zoomAt(1, 0, 0, true);
      return;
    }
    gesture = null;

    const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
    const dist = Math.hypot(dx, dy), dt = performance.now() - g.t0;

    if (dist < 10 && dt < 350) { onTap(e); return; }
    if (g.type === 'swipe') {
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3 && items.length > 1) step(dx < 0 ? 1 : -1);
      else apply(true);
    }
  }
  function onTap(e) {
    const now = performance.now();
    const r = img.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 32) {
      lastTap.t = 0;
      if (s > 1.05) zoomAt(1, 0, 0, true);
      else { const c = stageCentre(); zoomAt(2.6, e.clientX - c.x, e.clientY - c.y, true); }
      return;
    }
    lastTap = { t: now, x: e.clientX, y: e.clientY };
    if (!inside && s <= 1.01) close();
  }
  function onWheel(e) {
    e.preventDefault();
    const c = stageCentre();
    const k = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018));
    zoomAt(s * k, e.clientX - c.x, e.clientY - c.y, false);
  }

  /* ---- keyboard ---- */
  function onKey(e) {
    if (!isOpen()) return;
    const k = e.key;
    if (k === 'Escape') close();
    else if (k === 'ArrowLeft' || k === 'ArrowRight') {
      const dir = k === 'ArrowLeft' ? -1 : 1;
      if (s > 1.01) { tx -= dir * 80; apply(true); } else step(dir);
    }
    else if (k === 'ArrowUp' && s > 1.01) { ty += 80; apply(true); }
    else if (k === 'ArrowDown' && s > 1.01) { ty -= 80; apply(true); }
    else if (k === '+' || k === '=') zoomAt(s * 1.6, 0, 0, true);
    else if (k === '-' || k === '_') zoomAt(s / 1.6, 0, 0, true);
    else if (k === '0') zoomAt(1, 0, 0, true);
    else if (k === 'Tab') {
      const f = [...root.querySelectorAll('button:not([hidden]):not([disabled]), a[href]:not([hidden])')];
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  window.ZoomViewer = { open, close };
})();
