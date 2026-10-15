(async () => {
  'use strict';

  /* ---------- settings: change business details here ---------- */
  const CFG = {
    wa: '919371814999',            // WhatsApp number (changed from /edit), country code first, digits only
    tz: 'Asia/Kolkata',
    initialProducts: 8,
    carouselPhotos: 10             // photos in the phone/tablet swipe carousel; desktop's masonry box shows them all
  };

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const waUrl = text => `https://wa.me/${CFG.wa}?text=${encodeURIComponent(text)}`;
  const WA_LOGO = '<img class="wa-ic" src="assets/brand/whatsapp.png" alt="" width="20" height="20">';
  const icon = id => `<svg class="ic" aria-hidden="true"><use href="#${id}"/></svg>`;

  // open a link in a new tab (an anchor click keeps the user gesture and avoids popup blockers)
  function openLink(url) {
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
  }

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  /* ---------- data: live content from /edit (MongoDB), falling back to js/content-defaults.js ---------- */
  const CONTENT = await window.SiteContent.load();
  window.SiteContent.applyTexts(CONTENT);
  CFG.wa = String(CONTENT.settings.wa);
  const HOURS = CONTENT.hours;        // [Sun..Sat] of { on, from, to }, changed from /edit
  const SERVICES = CONTENT.services;
  const PRODUCTS = CONTENT.products.map((p, i) => ({ ...p, i }));
  const CATEGORIES = CONTENT.categories;
  const GENDER = Object.fromEntries(CATEGORIES.map(c => [c.id, c.name]));
  const pad = n => String(n).padStart(2, '0');
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  const GALLERY = CONTENT.gallery;

  const AVATAR_COLORS = ['#E4B5C2', '#8FB09F', '#D9A98F', '#B9A7D6', '#9CC0D6', '#E3C98F'];
  const TESTIMONIALS = CONTENT.testimonials.map((t, i) => ({ ...t, c: t.c || AVATAR_COLORS[i % AVATAR_COLORS.length] }));


  /* ---------- shared swipe carousel (scroll-snap, steps one slide at a time; optional autoplay) ----------
     copies > 1 makes it endless: the track holds that many identical copies of the slides, starts in the
     middle copy, and whenever it comes to rest in an outer copy it jumps (invisibly) to the same slide in the
     middle one, so there are always slides on both sides. The 'slide' event's detail is the physical index. */
  const REDUCE_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function carousel({ track, prev, next, dots, total, auto = 0, canAuto = () => true, copies = 1, canJump = () => true }) {
    dots.innerHTML = Array.from({ length: total }, (_, i) => `<button type="button" data-i="${i}" tabindex="-1"></button>`).join('');
    const loop = copies > 1, count = total * copies, home = Math.floor(copies / 2) * total; // first slide of the middle copy
    let idx = -1;
    const slides = Array.from(track.children);
    const width = () => (slides[0] && slides[0].offsetWidth) || track.clientWidth || 1; // one slide (narrower than the track when neighbours peek)
    const dotEls = $$('button', dots);
    function update() {
      const n = clamp(Math.round(track.scrollLeft / width()), 0, count - 1);
      if (n === idx) return;
      idx = n;
      dotEls.forEach((d, i) => d.setAttribute('aria-current', String(i === idx % total)));
      slides.forEach((s, i) => s.classList.toggle('is-on', i === idx));
      prev.disabled = !loop && idx === 0; next.disabled = !loop && idx === total - 1;
      track.dispatchEvent(new CustomEvent('slide', { detail: idx }));
    }
    const go = n => track.scrollTo({ left: clamp(n, 0, count - 1) * width(), behavior: 'smooth' });
    // endless: once scrolling has settled outside the middle copy, jump to the same slide inside it
    let settle = 0, touching = false;
    function recentre() {
      if (!loop || touching || !canJump()) return;
      const shift = Math.floor(idx / total) * total - home;
      if (shift) track.scrollLeft -= shift * width(); // an instant jump between identical slides
    }
    track.addEventListener('scroll', () => { update(); clearTimeout(settle); settle = setTimeout(recentre, 180); }, { passive: true });
    track.addEventListener('touchstart', () => { touching = true; }, { passive: true });
    track.addEventListener('touchend', () => { touching = false; clearTimeout(settle); settle = setTimeout(recentre, 180); }, { passive: true });
    prev.addEventListener('click', () => { go(idx - 1); restart(); });
    next.addEventListener('click', () => { go(idx + 1); restart(); });
    // a dot goes to that slide by the shortest way round
    dots.addEventListener('click', e => {
      const b = e.target.closest('button[data-i]'); if (!b) return;
      let to = idx - idx % total + +b.dataset.i;
      if (loop && to - idx > total / 2) to -= total; else if (loop && idx - to > total / 2) to += total;
      go(to); restart();
    });
    track.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(idx - 1); restart(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(idx + 1); restart(); }
    });
    window.addEventListener('resize', () => { track.scrollLeft = idx * width(); });

    // autoplay: advance every `auto` ms, back to the first slide after the last.
    // Pauses while hovered, keyboard-focused, touched, off screen, in a background tab, or when canAuto() says no.
    let timer = 0, hover = false, focus = false, touchHold = 0, visible = false;
    function restart() {
      clearInterval(timer); timer = 0;
      if (!auto || REDUCE_MOTION || total < 2) return;
      timer = setInterval(() => {
        if (hover || focus || touchHold || !visible || document.hidden || !canAuto()) return;
        go(loop ? idx + 1 : idx === total - 1 ? 0 : idx + 1);
      }, auto);
    }
    if (auto) {
      const root = track.closest('section') || track;
      root.addEventListener('mouseenter', () => { hover = true; });
      root.addEventListener('mouseleave', () => { hover = false; restart(); });
      root.addEventListener('focusin', e => { focus = e.target.matches(':focus-visible'); });
      root.addEventListener('focusout', () => { focus = false; });
      track.addEventListener('touchstart', () => { clearTimeout(touchHold); touchHold = setTimeout(() => { touchHold = 0; restart(); }, 6000); }, { passive: true });
      if ('IntersectionObserver' in window) new IntersectionObserver(([en]) => { visible = en.isIntersecting; }, { threshold: 0.5 }).observe(track);
      else visible = true;
    }
    if (loop) track.scrollLeft = home * width();
    update();
    restart();
  }

  /* ---------- services: glass flip cards, one at a time ---------- */
  (() => {
    const n = SERVICES.length;
    // every service deleted in /edit: hide the section and its menu links
    if (!n) {
      $('#services').hidden = true;
      $$('a[href="#services"]').forEach(a => { a.hidden = true; });
      return;
    }
    const track = $('#svcTrack');
    const num = i => `${pad(i + 1)} / ${pad(n)}`;
    // built-in photos have a sharper copy in /full; uploaded photos are used as they are
    const srcset = src => /\/gallery\/thumb\//.test(src)
      ? ` srcset="${esc(src)} 480w, ${esc(src.replace('/gallery/thumb/', '/gallery/full/'))} 854w" sizes="(min-width: 1024px) 460px, 92vw"` : '';
    // endless coverflow: enough identical copies that at least 4 cards always sit on each side of the centre
    const COPIES = n > 1 ? 2 * Math.ceil(4 / n) + 1 : 1, MID = Math.floor(COPIES / 2);
    const slideHtml = (s, i, clone) => `
      <div class="svc-slide" ${clone ? 'aria-hidden="true"' : `role="group" aria-roledescription="slide" aria-label="Service ${i + 1} of ${n}"`}>
        <article class="flip">
          <div class="flip-in">
            <div class="flip-face flip-front">
              <img class="svc-ph" src="${esc(s.img)}"${srcset(s.img)} alt="" ${i || clone ? 'loading="lazy"' : ''} width="480" height="600" draggable="false">
              <div class="svc-cap">
                <span class="svc-n">${num(i)}</span>
                <h3>${esc(s.t)}</h3>
                <button type="button" class="svc-turn" aria-label="Show details: ${esc(s.t)}">${icon('i-flip')}View details</button>
              </div>
            </div>
            <div class="flip-face flip-back">
              <img class="svc-bg" src="${esc(s.img)}" alt="" loading="lazy" draggable="false">
              <div class="svc-glass">
                <span class="svc-n">${num(i)}</span>
                <h3>${esc(s.t)}</h3>
                <i class="svc-rule" aria-hidden="true"></i>
                <p>${esc(s.d)}</p>
                <div class="svc-acts">
                  <a class="btn btn-sm" href="${waUrl(`Hi Khandelwal Group, I'd like to enquire about ${s.t}. Please share more details.`)}" target="_blank" rel="noopener">${WA_LOGO}Enquiry</a>
                  <button type="button" class="svc-turn svc-turn-back" aria-label="Back to photo: ${esc(s.t)}">${icon('i-flip')}Back</button>
                </div>
              </div>
            </div>
          </div>
        </article>
      </div>`;
    track.innerHTML = Array.from({ length: COPIES }, (_, c) => SERVICES.map((s, i) => slideHtml(s, i, c !== MID)).join('')).join('');
    // copies are for the eye only: keyboard and screen readers use the middle set
    $$('.svc-slide[aria-hidden] :is(a, button)', track).forEach(el => { el.tabIndex = -1; });

    const cards = $$('.flip', track), slides = $$('.svc-slide', track);
    const slideW = () => slides[0].offsetWidth || 1;
    const centreOn = i => track.scrollTo({ left: i * slideW(), behavior: 'smooth' });
    track.addEventListener('click', e => {
      if (e.target.closest('a')) return; // Enquiry opens WhatsApp; the card stays as it is
      const card = e.target.closest('.flip'); if (!card) return;
      const i = cards.indexOf(card);
      // a card at the side is brought to the centre first; only the centre card flips
      if (i !== Math.round(track.scrollLeft / slideW())) { centreOn(i); return; }
      const on = !card.classList.contains('on');
      cards.forEach(c => c.classList.toggle('on', c === card && on));
      // keep the tapped card centred even if an autoplay slide had just started
      if (on) centreOn(i);
      // keyboard users keep their place: move focus to the button on the face that is now showing
      if (e.target.closest('button') && e.detail === 0) $(on ? '.svc-turn-back' : '.svc-turn', card).focus({ preventScroll: true });
    });
    // moving to another service turns the previous card back to its photo, and updates the caption (if the page has one)
    const capName = $('#svcName'), capNum = $('#svcNum');
    track.addEventListener('slide', e => {
      cards.forEach((c, i) => { if (i !== e.detail) c.classList.remove('on'); });
      const i = e.detail % n;
      if (capName) capName.textContent = SERVICES[i].t;
      if (capNum) capNum.textContent = `${pad(i + 1)} — ${pad(n)}`;
    });

    // coverflow: cards either side of the centre shrink, turn inward, blur and fade with their distance from it
    function flow() {
      const pos = track.scrollLeft / slideW();
      cards.forEach((c, i) => {
        const d = i - pos, a = Math.min(Math.abs(d), 3.5), dir = Math.sign(d);
        if (a < 0.01) { c.style.transform = c.style.filter = c.style.opacity = ''; c.style.zIndex = '100'; c.style.visibility = ''; return; }
        c.style.transform = `perspective(1400px) translateX(${(-dir * a * 42).toFixed(2)}%) scale(${(1 - 0.12 * Math.min(a, 3)).toFixed(3)}) rotateY(${(-dir * Math.min(a, 1) * 18).toFixed(2)}deg)`;
        c.style.filter = a > 0.4 ? `blur(${((a - 0.4) * 2).toFixed(2)}px)` : '';
        c.style.opacity = a > 1 ? Math.max(0, 1 - (a - 1) * 0.32).toFixed(3) : '';
        c.style.zIndex = String(100 - Math.round(a * 10));
        c.style.visibility = a > 3.2 ? 'hidden' : '';
      });
    }
    let flowRaf = 0;
    const reflow = () => { cancelAnimationFrame(flowRaf); flowRaf = requestAnimationFrame(flow); };
    track.addEventListener('scroll', reflow, { passive: true });
    window.addEventListener('resize', reflow);
    flow();

    $('#svcCtl').hidden = n < 2;
    carousel({ track, prev: $('#svcPrev'), next: $('#svcNext'), dots: $('#svcDots'), total: n,
      auto: 4500, copies: COPIES, canAuto: () => !track.querySelector('.flip.on'), canJump: () => !track.querySelector('.flip.on') });
  })();

  /* ---------- gallery (phones and tablets): swipe carousel, one photo at a time ---------- */
  (() => {
    const track = $('#galTrack');
    const desktop = matchMedia('(min-width: 1024px)');
    const shown = GALLERY.slice(0, CFG.carouselPhotos);
    track.innerHTML = shown.map((g, i) => `
      <div class="car-slide" role="group" aria-roledescription="slide" aria-label="Photo ${i + 1} of ${GALLERY.length}">
        <button type="button" class="car-card" data-i="${i}" style="${/^#[0-9a-f]{3,8}$/i.test(g.bg || '') ? `background:${g.bg}` : ''}" aria-label="Zoom photo ${i + 1}">
          <img src="${esc(g.full)}" alt="${esc(g.alt)}" style="object-fit:${g.fit === 'contain' ? 'contain' : 'cover'}" ${i < 2 ? '' : 'loading="lazy"'} draggable="false">
        </button>
      </div>`).join('') + `
      <div class="car-slide" role="group" aria-roledescription="slide" aria-label="See all photos">
        <a class="car-card car-all" href="gallery.html">
          <span class="car-all-n">${GALLERY.length}</span>
          <span class="car-all-t">photos in the gallery</span>
          <span class="btn btn-sm">View all photos</span>
        </a>
      </div>`;
    track.addEventListener('click', e => {
      const b = e.target.closest('button[data-i]'); if (!b) return;
      ZoomViewer.open(GALLERY.map(g => ({ src: g.full, alt: g.alt })), +b.dataset.i);
    });
    // the carousel is hidden on desktop (masonry box instead), so it only autoplays below 1024px
    carousel({ track, prev: $('#galPrev'), next: $('#galNext'), dots: $('#galDots'), total: shown.length + 1,
      auto: 3500, canAuto: () => !desktop.matches });
  })();

  /* ---------- gallery (desktop): Pinterest-style masonry inside a framed box that scrolls on its own ---------- */
  (() => {
    const box = $('#galBox'), grid = $('#galGrid'), frame = $('#galFrame');
    // the photos are nearly all the same portrait shape, so tiles take turns with a few crop heights
    // to give the staggered masonry look; posters/flyers ("contain") always show whole at their own shape
    const SHAPES = ['3 / 4', '3 / 5', '4 / 5', '2 / 3', '1 / 1', '5 / 8', '5 / 6', '3 / 5'];
    const bg = g => /^#[0-9a-f]{3,8}$/i.test(g.bg || '') ? `background:${g.bg};` : '';
    grid.innerHTML = GALLERY.map((g, i) => {
      const whole = g.fit === 'contain';
      const sizes = /\/gallery\/thumb\//.test(g.thumb || '')
        ? ` srcset="${esc(g.thumb)} 480w, ${esc(g.full)} 854w" sizes="(min-width: 1280px) 25vw, (min-width: 640px) 33vw, 50vw"` : '';
      return `
      <button type="button" class="m-tile${whole ? ' m-whole' : ''}" data-i="${i}" style="${bg(g)}${whole ? '' : `aspect-ratio:${SHAPES[i % SHAPES.length]}`}" aria-label="Zoom photo ${i + 1} of ${GALLERY.length}">
        <img src="${esc(g.thumb || g.full)}"${sizes} alt="${esc(g.alt)}" loading="lazy" draggable="false">
        <span class="m-zoom" aria-hidden="true"><svg class="ic"><use href="#i-zoom"/></svg>View</span>
      </button>`;
    }).join('');
    grid.addEventListener('click', e => {
      const b = e.target.closest('button[data-i]'); if (!b) return;
      ZoomViewer.open(GALLERY.map(g => ({ src: g.full, alt: g.alt })), +b.dataset.i);
    });
    // the fade at the bottom of the box says "more below"; it goes once the end is reached
    const edge = () => {
      frame.classList.toggle('at-end', box.scrollTop + box.clientHeight >= box.scrollHeight - 4);
      frame.classList.toggle('scrolled', box.scrollTop > 4);
    };
    box.addEventListener('scroll', edge, { passive: true });
    window.addEventListener('resize', edge);
    edge();
  })();

  /* ---------- products ---------- */
  (() => {
    const grid = $('#productGrid'), chips = $('#chips'), count = $('#productCount'), more = $('#productMore');
    let filter = 'all', expanded = false;
    const counts = { all: PRODUCTS.length };
    CATEGORIES.forEach(c => { counts[c.id] = 0; });
    PRODUCTS.forEach(p => { counts[p.g] = (counts[p.g] || 0) + 1; });
    const FILTERS = [['all', 'All'], ...CATEGORIES.map(c => [c.id, c.name])].filter(f => counts[f[0]] > 0);

    chips.innerHTML = FILTERS.map(f => `<button type="button" class="chip" data-f="${f[0]}" aria-pressed="${f[0] === filter}">${f[1]} (${counts[f[0]]})</button>`).join('');

    const enquire = p => waUrl(`Hi Khandelwal Group, I'm interested in Velunia Signature (Code ${p.code}, ${p.size} ml, ₹${p.price}). Please share more details.`);
    const list = () => PRODUCTS.filter(p => filter === 'all' || p.g === filter);

    function render() {
      const all = list();
      const shown = expanded ? all : all.slice(0, CFG.initialProducts);
      // price-focused retail card: the price is the biggest thing on it, with the price per ml beside it
      grid.innerHTML = shown.map(p => `
        <article class="product">
          <button class="ph" type="button" data-i="${p.i}" aria-label="View details for Velunia ${esc(p.code)}">
            <img src="${esc(p.img)}" alt="Velunia Signature ${esc(p.code)} perfume bottle" loading="lazy" width="480" height="720">
            <span class="p-size">${p.size} ml</span>
            ${GENDER[p.g] ? `<span class="p-cat">${esc(GENDER[p.g])}</span>` : ''}
          </button>
          <div class="body">
            <p class="p-brand">Velunia Signature<span class="p-type"> · Eau de parfum</span></p>
            <h3>${esc(p.code)}</h3>
            <div class="p-price">
              <span class="p-amt"><span class="p-cur">₹</span>${p.price.toLocaleString('en-IN')}</span>
              ${p.size ? `<span class="p-unit">₹${(p.price / p.size).toFixed(2)} / ml</span>` : ''}
            </div>
            <a class="p-buy" href="${enquire(p)}" target="_blank" rel="noopener" aria-label="Order Velunia ${esc(p.code)} on WhatsApp">${WA_LOGO}Order now</a>
          </div>
        </article>`).join('');
      count.textContent = `Showing ${shown.length} of ${all.length} fragrances`;
      more.hidden = all.length <= CFG.initialProducts;
      more.textContent = expanded ? 'Show fewer' : `View all ${all.length} fragrances`;
      $$('.chip', chips).forEach(c => c.setAttribute('aria-pressed', String(c.dataset.f === filter)));
    }

    chips.addEventListener('click', e => {
      const c = e.target.closest('.chip'); if (!c) return;
      filter = c.dataset.f; render();
    });
    more.addEventListener('click', () => {
      expanded = !expanded; render();
      if (!expanded) $('#products').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    grid.addEventListener('click', e => {
      const b = e.target.closest('.ph[data-i]'); if (!b) return;
      const all = list();
      const items = all.map(p => ({
        src: p.detail || p.img,
        alt: `Velunia Signature ${p.code} product details`,
        text: `Velunia ${p.code} · ${p.size} ml · ${GENDER[p.g] || ''} · ₹${p.price}`,
        action: enquire(p)
      }));
      ZoomViewer.open(items, all.findIndex(p => p.i === +b.dataset.i));
    });
    render();
  })();

  /* ---------- testimonials: avatar-focused — overlapping customer portraits, the chosen one large, its review beneath ---------- */
  (() => {
    // every testimonial deleted in /edit: hide the section and its menu links
    if (!TESTIMONIALS.length) {
      $('#testimonials').hidden = true;
      $$('a[href="#testimonials"]').forEach(a => { a.hidden = true; });
      return;
    }
    const N = TESTIMONIALS.length, root = $('#tst'), row = $('#tstAvs'), body = $('#tstBody');
    const K = Math.min(2, Math.floor((N - 1) / 2)); // portraits shown either side of the chosen one
    const broken = new Set();                       // photo links that failed to load
    // customer photo from /edit (uploaded or an image link); the coloured avatar if there is none
    const face = i => {
      const t = TESTIMONIALS[i];
      return t.img && !broken.has(i)
        ? `<img src="${esc(t.img)}" alt="" data-i="${i}" referrerpolicy="no-referrer" draggable="false">`
        : `<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" fill="${t.c}"/><use href="#avatar"/></svg>`;
    };
    const rating = t => Math.min(5, Math.max(1, Math.round(+t.rating || 5))); // stars set in /edit (5 if never set)
    let cur = 0;
    function draw() {
      const order = [];
      for (let d = -K; d <= K; d++) order.push((cur + d + N) % N);
      row.innerHTML = order.map((i, k) => {
        const d = Math.abs(k - K);
        return `<button type="button" class="tst-av d${d}" data-i="${i}" ${d ? `aria-label="Read the review from ${esc(TESTIMONIALS[i].n)}"` : 'aria-current="true" tabindex="-1" aria-hidden="true"'}>${face(i)}</button>`;
      }).join('');
      const t = TESTIMONIALS[cur];
      body.innerHTML = `
        <div class="tst-stars" role="img" aria-label="${rating(t)} out of 5 stars"><span class="on">${'★'.repeat(rating(t))}</span><span class="off">${'★'.repeat(5 - rating(t))}</span></div>
        <blockquote>“${esc(t.q)}”</blockquote>
        <div class="tst-who"><span class="tst-av-sm">${face(cur)}</span><b>${esc(t.n)}</b></div>`;
      $('#tstCount').textContent = `Review ${cur + 1} of ${N}`;
      body.classList.remove('in'); void body.offsetWidth; body.classList.add('in'); // replay the slide-in
    }
    // dir: 1 = the new review slides in from the right, -1 = from the left
    const go = (n, dir = 1) => { cur = (n + N) % N; body.style.setProperty('--dir', dir); draw(); };
    $('#tstPrev').addEventListener('click', () => go(cur - 1, -1));
    $('#tstNext').addEventListener('click', () => go(cur + 1, 1));
    row.addEventListener('click', e => {
      const b = e.target.closest('.tst-av[data-i]'); if (!b) return;
      go(+b.dataset.i, Math.sign([...row.children].indexOf(b) - K) || 1);
    });
    root.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(cur - 1, -1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(cur + 1, 1); }
    });

    // swipe (finger or mouse drag): the review follows the pointer, then changes or springs back.
    // Up-and-down movement is left to the page so it still scrolls (touch-action: pan-y in the CSS).
    let drag = null, dragged = false;
    root.addEventListener('pointerdown', e => {
      dragged = false;
      if (N < 2 || e.button > 0 || e.target.closest('.tst-nav')) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, on: false };
    });
    root.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.on) {
        if (Math.abs(dx) < 8) return;
        if (Math.abs(dy) > Math.abs(dx)) { drag = null; return; } // a vertical scroll, not a swipe
        drag.on = true; root.classList.add('dragging');
        try { root.setPointerCapture(e.pointerId); } catch {}
      }
      drag.dx = dx;
      body.style.transform = `translateX(${dx}px)`;
      body.style.opacity = String(1 - Math.min(Math.abs(dx) / 500, 0.45));
    });
    const endDrag = e => {
      if (!drag || e.pointerId !== drag.id) return;
      const { dx, on } = drag; drag = null;
      root.classList.remove('dragging');
      body.style.transform = body.style.opacity = '';
      if (!on) return;
      dragged = true; // the click that follows a drag is not a tap
      if (Math.abs(dx) > 60) go(cur + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
    };
    root.addEventListener('pointerup', endDrag);
    root.addEventListener('pointercancel', endDrag);
    root.addEventListener('click', e => { if (dragged) { dragged = false; e.stopPropagation(); e.preventDefault(); } }, true);
    // a photo link that no longer works falls back to the coloured avatar
    root.addEventListener('error', e => {
      if (e.target.tagName !== 'IMG' || e.target.dataset.i == null) return;
      broken.add(+e.target.dataset.i); draw();
    }, true);
    if (N < 2) $$('.tst-nav', root).forEach(b => { b.hidden = true; });
    draw();
  })();

  /* ---------- blog: one article at a time, swipe / arrows / dots for the next (written in /edit → Blog) ---------- */
  (() => {
    const S = window.SiteContent, posts = CONTENT.blogs || [];
    // no articles: hide the section and every Blog link
    if (!posts.length) {
      $('#blog').hidden = true;
      $$('a[href="#blog"], a[href="blog.html"]').forEach(a => { a.hidden = true; });
      return;
    }
    const track = $('#blogTrack');
    const cover = p => esc(p.cover || S.BLOG_COVER);
    track.innerHTML = posts.map((p, i) => `
      <div class="blog-slide" role="group" aria-roledescription="slide" aria-label="Article ${i + 1} of ${posts.length}">
        <article class="card blog-card blog-feature">
          <a class="ph" href="${S.blogUrl(p)}" tabindex="-1" aria-hidden="true"><img src="${cover(p)}" alt="" ${i ? 'loading="lazy"' : ''} referrerpolicy="no-referrer" draggable="false"></a>
          <div class="body">
            ${i === 0 ? '<span class="blog-tag">Featured</span>' : ''}
            <span class="date">${esc(S.blogDate(p.date))}</span>
            <h3><a href="${S.blogUrl(p)}">${esc(p.title)}</a></h3>
            ${p.excerpt ? `<p>${esc(p.excerpt)}</p>` : ''}
            <a class="btn btn-sm btn-ghost" href="${S.blogUrl(p)}">Read article</a>
          </div>
        </article>
      </div>`).join('');
    $('#blogCtl').hidden = posts.length < 2;
    carousel({ track, prev: $('#blogPrev'), next: $('#blogNext'), dots: $('#blogDots'), total: posts.length });
  })();

  /* ---------- hours + open status ---------- */
  function istNow() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: CFG.tz }));
  }
  const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; }; // "17:30" -> 1050
  const fmtTime = t => { const m = toMin(t), h = Math.floor(m / 60); return `${((h + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
  const isOpenDay = d => HOURS[d].on;
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const WEEK = [1, 2, 3, 4, 5, 6, 0]; // Monday first

  // the "Business Hours" card, the badge on the hero picture and the appointment hint
  (() => {
    $('#hoursList').innerHTML = WEEK.map(d => `<li data-d="${d}"${HOURS[d].on ? '' : ' class="off"'}><span>${DAY_NAMES[d]}</span><span>${HOURS[d].on ? `${fmtTime(HOURS[d].from)} – ${fmtTime(HOURS[d].to)}` : 'Closed'}</span></li>`).join('');
    const openDays = WEEK.filter(isOpenDay);
    const badge = $('#hoursBadge'), hint = $('#apptHint');
    const first = openDays.length ? HOURS[openDays[0]] : null;
    const same = first && openDays.every(d => HOURS[d].from === first.from && HOURS[d].to === first.to);
    const short = t => fmtTime(t).replace(':00', '');
    const three = d => DAY_NAMES[d].slice(0, 3);
    const run = openDays.length > 1 && openDays.every((d, i) => i === 0 || WEEK.indexOf(d) === WEEK.indexOf(openDays[i - 1]) + 1);
    const days = !openDays.length ? '' : openDays.length === 1 ? three(openDays[0])
      : run ? `${three(openDays[0])} – ${three(openDays[openDays.length - 1])}` : openDays.map(three).join(', ');
    if (badge) badge.textContent = !first ? 'Currently closed' : same ? `${days} · ${short(first.from)} – ${short(first.to)}` : `Open ${days}`;
    if (hint) hint.textContent = !first ? 'We are not taking appointments right now.' : `Pick a day we're open (${days}) and a time. We'll confirm on WhatsApp.`;
  })();

  function updateStatus() {
    const n = istNow(), day = n.getDay(), mins = n.getHours() * 60 + n.getMinutes();
    $$('#hoursList li').forEach(li => li.classList.toggle('today', +li.dataset.d === day));
    const s = $('#openStatus'), label = $('span', s), h = HOURS[day];
    const isOpen = h.on && mins >= toMin(h.from) && mins < toMin(h.to);
    s.classList.toggle('open', isOpen); s.classList.toggle('closed', !isOpen);
    if (isOpen) { label.textContent = `Open now · closes at ${fmtTime(h.to)}`; return; }
    if (h.on && mins < toMin(h.from)) { label.textContent = `Closed · opens today at ${fmtTime(h.from)}`; return; }
    let k = 1;
    while (k <= 7 && !isOpenDay((day + k) % 7)) k++;
    if (k > 7) { label.textContent = 'Currently closed'; return; }
    const nd = (day + k) % 7;
    label.textContent = `Closed · opens ${k === 1 ? 'tomorrow' : DAY_NAMES[nd]} at ${fmtTime(HOURS[nd].from)}`;
  }
  updateStatus(); setInterval(updateStatus, 60000);

  /* ---------- forms ---------- */
  function setErr(input, msg) {
    const f = input.closest('.field');
    f.classList.toggle('bad', !!msg);
    $('.err', f).textContent = msg || '';
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    return !msg;
  }
  function wireClear(form) {
    $$('input, textarea, select', form).forEach(el => el.addEventListener('input', () => setErr(el, '')));
  }
  const clean = s => s.trim().replace(/\s+/g, ' ');
  function mobile(v) {
    let d = v.replace(/\D/g, '');
    if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
    if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
    return /^[6-9]\d{9}$/.test(d) ? d : null;
  }

  // appointment
  (() => {
    const form = $('#apptForm'), date = $('#aDate'), time = $('#aTime');
    const pad2 = n => String(n).padStart(2, '0');
    const iso = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    const label = m => { const h = Math.floor(m / 60), mm = m % 60; return `${((h + 11) % 12) + 1}:${pad2(mm)} ${h < 12 ? 'AM' : 'PM'}`; };

    // day of week of the chosen date (0 = Sunday), or null when none is chosen
    const chosenDay = () => {
      if (!date.value) return null;
      const [y, m, d] = date.value.split('-').map(Number);
      return new Date(y, m - 1, d).getDay();
    };
    const closedDayMsg = () => { const d = chosenDay(); return `We're closed on ${d === null ? 'that day' : DAY_NAMES[d] + 's'}. Please pick a day we're open.`; };

    function buildTimes() {
      const n = istNow(), today = date.value === iso(n);
      const nowMin = n.getHours() * 60 + n.getMinutes();
      const prev = time.value;
      const day = chosenDay();
      if (day !== null && !isOpenDay(day)) {
        time.innerHTML = '<option value="">Closed on this day</option>';
        time.disabled = true;
        setErr(date, closedDayMsg());
        return;
      }
      time.disabled = false;
      let html = '<option value="">Select a time</option>';
      // no date chosen yet: show today's slots, or the first open day's
      const hd = (day === null ? [HOURS[n.getDay()], ...HOURS] : [HOURS[day]]).find(x => x.on);
      for (let m = hd ? toMin(hd.from) : 0; m < (hd ? toMin(hd.to) : 0); m += 30) {
        const past = today && m <= nowMin;
        html += `<option value="${label(m)}"${past ? ' disabled' : ''}>${label(m)}${past ? ' (passed)' : ''}</option>`;
      }
      time.innerHTML = html;
      if ([...time.options].some(o => o.value === prev && !o.disabled)) time.value = prev;
    }
    date.min = iso(istNow());
    date.addEventListener('change', buildTimes);
    buildTimes(); wireClear(form);

    form.addEventListener('submit', e => {
      e.preventDefault();
      const name = clean($('#aName').value);
      let ok = true;
      ok = setErr($('#aName'), name.length < 2 ? 'Enter your name.' : '') && ok;
      const day = chosenDay();
      ok = setErr(date, !date.value ? 'Choose a date.' : date.value < date.min ? 'Choose today or a later date.' : !isOpenDay(day) ? closedDayMsg() : '') && ok;
      ok = setErr(time, !time.value && isOpenDay(day) ? 'Choose a time.' : '') && ok;
      if (!ok) return;
      const [y, m, d] = date.value.split('-').map(Number);
      const nice = new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
      openLink(waUrl(`Hi Khandelwal Group, I'd like to make an appointment.\n\nName: ${name}\nDate: ${nice}\nTime: ${time.value}\n\nPlease confirm availability.`));
      toast('Opening WhatsApp…');
      form.reset(); buildTimes();
    });
  })();

  // inquiry
  (() => {
    const form = $('#inqForm');
    wireClear(form);
    form.addEventListener('submit', e => {
      e.preventDefault();
      const name = clean($('#iName').value), phoneRaw = $('#iPhone').value, email = $('#iEmail').value.trim(), msg = $('#iMsg').value.trim();
      const phone = mobile(phoneRaw);
      let ok = true;
      ok = setErr($('#iName'), name.length < 2 ? 'Enter your name.' : '') && ok;
      ok = setErr($('#iPhone'), !phone ? 'Enter a valid 10-digit mobile number.' : '') && ok;
      ok = setErr($('#iEmail'), email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? 'Enter a valid email address.' : '') && ok;
      ok = setErr($('#iMsg'), msg.length < 5 ? 'Write a short message.' : '') && ok;
      if (!ok) return;
      openLink(waUrl(`Hi Khandelwal Group, I have an enquiry.\n\nName: ${name}\nPhone: +91 ${phone}${email ? `\nEmail: ${email}` : ''}\n\nMessage: ${msg}`));
      toast('Opening WhatsApp…');
      form.reset();
    });
  })();

  // updates
  (() => {
    const form = $('#subForm');
    wireClear(form);
    form.addEventListener('submit', e => {
      e.preventDefault();
      const name = clean($('#sName').value);
      if (!setErr($('#sName'), name.length < 2 ? 'Enter your name.' : '')) return;
      openLink(waUrl(`Hi Khandelwal Group, please add me to your updates list for new arrivals and offers. My name is ${name}.`));
      toast('Opening WhatsApp…');
      form.reset();
    });
  })();

  /* ---------- hero video (controls pop up on tap / hover / focus, then fade away) ---------- */
  (() => {
    const v = $('#heroVideo'), hero = $('.hero'), ctrl = $('.hero-controls');
    const play = $('#vPlay'), mute = $('#vMute'), bar = $('#vBar'), fill = $('#vFill');
    const setIcon = (btn, id, label) => { $('use', btn).setAttribute('href', `#${id}`); btn.setAttribute('aria-label', label); };
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const canHover = matchMedia('(hover: hover)').matches;
    let userPaused = false, pausedByView = false, hinted = false, hideT = null;

    // controls stay up while the video is paused (so it can be resumed)
    const sticky = () => v.paused && !pausedByView;
    function reveal(hold) {
      hero.classList.add('show-controls');
      clearTimeout(hideT);
      if (!hold && !sticky()) hideT = setTimeout(hide, 2800);
    }
    function hide() {
      if (sticky() || (canHover && ctrl.matches(':hover')) || hero.querySelector(':focus-visible')) return;
      hero.classList.remove('show-controls');
    }

    function sync() {
      setIcon(play, v.paused ? 'i-play' : 'i-pause', v.paused ? 'Play video' : 'Pause video');
      setIcon(mute, v.muted ? 'i-mute' : 'i-vol', v.muted ? 'Turn sound on' : 'Turn sound off');
    }
    play.addEventListener('click', () => {
      if (v.paused) { userPaused = false; v.play().catch(() => {}); } else { userPaused = true; v.pause(); }
      reveal();
    });
    mute.addEventListener('click', () => { v.muted = !v.muted; sync(); reveal(); });
    v.addEventListener('play', () => { pausedByView = false; sync(); });
    v.addEventListener('pause', () => { sync(); if (sticky()) reveal(true); });
    v.addEventListener('volumechange', sync);
    v.addEventListener('timeupdate', () => {
      const p = v.duration ? (v.currentTime / v.duration) * 100 : 0;
      fill.style.width = p + '%'; bar.setAttribute('aria-valuenow', Math.round(p));
    });
    bar.addEventListener('click', e => {
      if (!v.duration) return;
      const r = bar.getBoundingClientRect();
      v.currentTime = clamp((e.clientX - r.left) / r.width, 0, 1) * v.duration;
      reveal();
    });

    // pop up when someone touches, hovers or tabs to the video
    hero.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') reveal(); });
    hero.addEventListener('pointerleave', e => {
      if (e.pointerType !== 'mouse') return;
      clearTimeout(hideT); hideT = setTimeout(hide, 900);
    });
    hero.addEventListener('click', e => {
      if (e.target.closest('.hero-controls')) { reveal(); return; }
      const touch = e.pointerType && e.pointerType !== 'mouse';
      if (touch && hero.classList.contains('show-controls') && !sticky()) {
        clearTimeout(hideT); hero.classList.remove('show-controls');   // second tap hides them
      } else reveal();
    });

    if (reduce) { sync(); reveal(true); }
    else {
      v.play().catch(() => reveal(true));
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(([en]) => {
          if (!en.isIntersecting) {
            if (!v.paused) { pausedByView = true; v.pause(); }
          } else {
            if (pausedByView) { pausedByView = false; if (!userPaused) v.play().catch(() => reveal(true)); }
            if (en.intersectionRatio >= 0.6 && !hinted) { hinted = true; reveal(); }   // brief hint the first time it is seen
          }
        }, { threshold: [0.25, 0.6] }).observe(v);
      }
    }
    sync();
  })();

  /* ---------- floating quick menu (phones and tablets) ---------- */
  (() => {
    const url = location.href.split('#')[0];
    const title = 'Khandelwal Group | Velunia Signature Perfumes';

    async function copy() {
      try { await navigator.clipboard.writeText(url); }
      catch {
        const ta = document.createElement('textarea'); ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); } catch {}
        ta.remove();
      }
      toast('Link copied');
    }
    async function share() {
      if (navigator.share) { try { await navigator.share({ title, url }); } catch {} }
      else copy();
    }
    const fab = $('#fab'), main = $('#fabMain');
    const setOpen = o => { fab.classList.toggle('open', o); main.setAttribute('aria-expanded', String(o)); };
    main.addEventListener('click', () => setOpen(!fab.classList.contains('open')));
    $('#fabShare').addEventListener('click', () => { setOpen(false); share(); });
    $$('a.fab-item', fab).forEach(a => a.addEventListener('click', () => setOpen(false)));
    document.addEventListener('click', e => { if (!fab.contains(e.target)) setOpen(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });
  })();

  $('#yr').textContent = new Date().getFullYear();
})();
