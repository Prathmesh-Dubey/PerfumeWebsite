(async () => {
  'use strict';

  /* ---------- settings: change business details here ---------- */
  const CFG = {
    wa: '919371814999',            // WhatsApp number, country code first, digits only
    tz: 'Asia/Kolkata',
    openHour: 9,                   // 9 AM
    closeHour: 17,                 // 5 PM
    openDays: [1, 2, 3, 4, 5],     // Monday to Friday (0 = Sunday, 6 = Saturday)
    initialProducts: 8,
    carouselPhotos: 10             // photos shown in the swipe carousel; the rest are on gallery.html
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
  const SERVICES = CONTENT.services;
  const PRODUCTS = CONTENT.products.map((p, i) => ({ ...p, i }));
  const GENDER = { F: 'Women', M: 'Men', U: 'Unisex' };
  const pad = n => String(n).padStart(2, '0');
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  const GALLERY = CONTENT.gallery;

  const TESTIMONIALS = [
    { n: 'Prathmesh', c: '#E4B5C2', q: 'Beautiful presentation and a fragrance that lasts all day. Ordering over WhatsApp was quick and easy.' },
    { n: 'Shail', c: '#8FB09F', q: 'Great quality for the price. The scent stays fresh for hours and the bottle looks even better in person.' },
    { n: 'Akshata', c: '#D9A98F', q: 'I loved the floral range. It feels premium, and the team helped me choose the right one for gifting.' }
  ];


  /* ---------- services ---------- */
  $('#servicesGrid').innerHTML = SERVICES.map(s => `
    <article class="card service">
      <div class="ph"><img src="${esc(s.img)}" alt="" loading="lazy" width="480" height="640"></div>
      <div class="body">
        <h3>${esc(s.t)}</h3>
        <p>${esc(s.d)}</p>
        <a class="btn btn-sm" href="${waUrl(`Hi Khandelwal Group, I'd like to enquire about ${s.t}. Please share more details.`)}" target="_blank" rel="noopener">${WA_LOGO}Enquiry</a>
      </div>
    </article>`).join('');
  // every service deleted in /edit: hide the section and its menu links
  if (!SERVICES.length) {
    $('#services').hidden = true;
    $$('a[href="#services"]').forEach(a => { a.hidden = true; });
  }

  /* ---------- shared swipe carousel (scroll-snap: one card at a time) ---------- */
  function carousel({ track, prev, next, dots, total }) {
    dots.innerHTML = Array.from({ length: total }, (_, i) => `<button type="button" data-i="${i}" tabindex="-1"></button>`).join('');
    let idx = 0;
    const width = () => track.clientWidth || 1;
    const dotEls = $$('button', dots);
    function update() {
      const n = clamp(Math.round(track.scrollLeft / width()), 0, total - 1);
      if (n === idx && dotEls[n].hasAttribute('aria-current')) return;
      idx = n;
      dotEls.forEach((d, i) => d.setAttribute('aria-current', String(i === idx)));
      prev.disabled = idx === 0; next.disabled = idx === total - 1;
    }
    const go = n => track.scrollTo({ left: clamp(n, 0, total - 1) * width(), behavior: 'smooth' });
    track.addEventListener('scroll', update, { passive: true });
    prev.addEventListener('click', () => go(idx - 1));
    next.addEventListener('click', () => go(idx + 1));
    dots.addEventListener('click', e => { const b = e.target.closest('button[data-i]'); if (b) go(+b.dataset.i); });
    track.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(idx - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(idx + 1); }
    });
    window.addEventListener('resize', () => { track.scrollLeft = idx * width(); });
    update();
  }

  /* ---------- gallery carousel ---------- */
  (() => {
    const track = $('#galTrack');
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
    carousel({ track, prev: $('#galPrev'), next: $('#galNext'), dots: $('#galDots'), total: shown.length + 1 });
  })();

  /* ---------- products ---------- */
  (() => {
    const grid = $('#productGrid'), chips = $('#chips'), count = $('#productCount'), more = $('#productMore');
    let filter = 'all', expanded = false;
    const counts = { all: PRODUCTS.length, F: 0, M: 0, U: 0 };
    PRODUCTS.forEach(p => counts[p.g]++);
    const FILTERS = [['all', 'All'], ['F', 'Women'], ['M', 'Men'], ['U', 'Unisex']].filter(f => counts[f[0]] > 0);

    chips.innerHTML = FILTERS.map(f => `<button type="button" class="chip" data-f="${f[0]}" aria-pressed="${f[0] === filter}">${f[1]} (${counts[f[0]]})</button>`).join('');

    const enquire = p => waUrl(`Hi Khandelwal Group, I'm interested in Velunia Signature (Code ${p.code}, ${p.size} ml, ₹${p.price}). Please share more details.`);
    const list = () => PRODUCTS.filter(p => filter === 'all' || p.g === filter);

    function render() {
      const all = list();
      const shown = expanded ? all : all.slice(0, CFG.initialProducts);
      grid.innerHTML = shown.map(p => `
        <article class="card product">
          <button class="ph" type="button" data-i="${p.i}" aria-label="View details for Velunia ${esc(p.code)}">
            <img src="${esc(p.img)}" alt="Velunia Signature ${esc(p.code)} perfume bottle" loading="lazy" width="480" height="720">
            <span class="ribbon">${p.size} ml</span>
          </button>
          <div class="body">
            <h3>Velunia ${esc(p.code)}</h3>
            <p class="meta">Eau de parfum · ${GENDER[p.g]}</p>
            <div class="price">₹${p.price.toLocaleString('en-IN')}</div>
            <a class="btn btn-sm" href="${enquire(p)}" target="_blank" rel="noopener">${WA_LOGO}Enquire now</a>
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
        text: `Velunia ${p.code} · ${p.size} ml · ${GENDER[p.g]} · ₹${p.price}`,
        action: enquire(p)
      }));
      ZoomViewer.open(items, all.findIndex(p => p.i === +b.dataset.i));
    });
    render();
  })();

  /* ---------- testimonials (swipe carousel, same as the gallery) ---------- */
  (() => {
    const track = $('#testiTrack');
    track.innerHTML = TESTIMONIALS.map((t, i) => `
      <div class="car-slide" role="group" aria-roledescription="slide" aria-label="Testimonial ${i + 1} of ${TESTIMONIALS.length}">
        <figure class="card testi-card">
          <div class="av"><svg viewBox="0 0 64 64" role="img" aria-label="${esc(t.n)}"><rect width="64" height="64" fill="${t.c}"/><use href="#avatar"/></svg></div>
          <div class="stars" aria-label="5 out of 5 stars">★★★★★</div>
          <blockquote>“${esc(t.q)}”</blockquote>
          <cite>${esc(t.n)}</cite>
        </figure>
      </div>`).join('');
    carousel({ track, prev: $('#testiPrev'), next: $('#testiNext'), dots: $('#testiDots'), total: TESTIMONIALS.length });
  })();

  /* ---------- hours + open status ---------- */
  function istNow() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: CFG.tz }));
  }
  const fmtHour = h => `${((h + 11) % 12) + 1}:00 ${h < 12 ? 'AM' : 'PM'}`;
  const isOpenDay = d => CFG.openDays.includes(d);
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function updateStatus() {
    const n = istNow(), day = n.getDay(), mins = n.getHours() * 60 + n.getMinutes();
    $$('#hoursList li').forEach(li => li.classList.toggle('today', +li.dataset.d === day));
    const s = $('#openStatus'), label = $('span', s);
    const isOpen = isOpenDay(day) && mins >= CFG.openHour * 60 && mins < CFG.closeHour * 60;
    s.classList.toggle('open', isOpen); s.classList.toggle('closed', !isOpen);
    if (isOpen) { label.textContent = `Open now · closes at ${fmtHour(CFG.closeHour)}`; return; }
    if (isOpenDay(day) && mins < CFG.openHour * 60) { label.textContent = `Closed · opens today at ${fmtHour(CFG.openHour)}`; return; }
    let k = 1;
    while (k < 7 && !isOpenDay((day + k) % 7)) k++;
    const when = k === 1 ? 'tomorrow' : DAY_NAMES[(day + k) % 7];
    label.textContent = `Closed · opens ${when} at ${fmtHour(CFG.openHour)}`;
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
    const closedDayMsg = () => `We're closed on Saturdays and Sundays. Please pick a weekday.`;

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
      for (let m = CFG.openHour * 60; m < CFG.closeHour * 60; m += 30) {
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
