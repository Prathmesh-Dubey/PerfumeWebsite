/* Site navbar + footer, the same on every page (home, blog, gallery); the home page's navbar leaves out Blog.
   Each page has <body data-page="home|blog|gallery"> and empty <header id="dkNav"> / <footer id="siteFoot">
   placeholders; this fills them in. Load it right after site-content.js and before the page's own script. */
(() => {
  'use strict';
  const page = document.body.dataset.page || 'home';
  const home = page === 'home';
  const sec = id => (home ? `#${id}` : `index.html#${id}`); // home-page sections, from any page
  const WA = '919371814999'; // SiteContent.applyTexts swaps this for the number saved in /edit
  const WA_IC = '<img class="wa-ic" src="assets/brand/whatsapp.png" alt="" width="20" height="20">';

  const LINKS = [
    ['About', sec('about')],
    ['Services', sec('services')],
    ['Products', sec('products')],
    ['Gallery', page === 'gallery' ? 'gallery.html' : sec('gallery'), 'gallery'],
    ['Reviews', sec('testimonials')],
    ['Blog', 'blog.html', 'blog'],
    ['Visit', sec('visit')],
    ['Contact', sec('contact')]
  ];
  const link = ([text, href, key]) => `<a href="${href}"${key === page ? ' class="on" aria-current="page"' : ''}>${text}</a>`;

  /* ---------- navbar ---------- */
  const nav = document.getElementById('dkNav');
  if (nav) {
    nav.className = 'dk-nav';
    nav.innerHTML = `
      <div class="dk-wrap dk-nav-in">
        <a class="dk-logo" href="${home ? '#top' : 'index.html'}" aria-label="Khandelwal Group home">
          <img src="assets/brand/logo.jpg" alt="" width="44" height="44">
          <span><b>Khandelwal Group</b><i>Velunia Signature</i></span>
        </a>
        <nav class="dk-links" id="dkLinks" aria-label="Main">${LINKS.filter(l => !(home && l[2] === 'blog')).map(link).join('')}</nav>
        <a class="btn dk-cta" href="https://wa.me/${WA}" target="_blank" rel="noopener">${WA_IC}<span>WhatsApp us</span></a>
        <button class="dk-menu" id="dkMenu" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="dkLinks"><i></i><i></i><i></i></button>
      </div>`;

    // phones and tablets: the links open as a drop-down from the menu button
    const btn = nav.querySelector('#dkMenu');
    const setOpen = open => {
      nav.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };
    btn.addEventListener('click', () => setOpen(!nav.classList.contains('open')));
    nav.querySelector('#dkLinks').addEventListener('click', e => { if (e.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && nav.classList.contains('open')) { setOpen(false); btn.focus(); } });
    document.addEventListener('click', e => { if (!nav.contains(e.target)) setOpen(false); });

    // shadow under the bar once the page scrolls
    const onScroll = () => nav.classList.toggle('scrolled', scrollY > 10);
    addEventListener('scroll', onScroll, { passive: true }); onScroll();
  }

  /* ---------- footer ---------- */
  const foot = document.getElementById('siteFoot');
  if (foot) {
    foot.className = 'footer site-foot';
    foot.innerHTML = `
      <div class="dk-foot-cols">
        <div>
          <div class="script">Velunia Signature</div>
          <p data-k="footerTagline">Fragrances that speak, impressions that last.</p>
        </div>
        <div class="dk-foot-nav">
          <h4>Explore</h4>
          ${LINKS.filter(l => ['About', 'Services', 'Products', 'Gallery', 'Blog'].includes(l[0])).map(([t, h]) => `<a href="${h}">${t}</a>`).join('')}
        </div>
        <div class="dk-foot-nav">
          <h4>Contact</h4>
          <a href="tel:+919371814999">+91 93718 14999</a>
          <a href="mailto:khandelwalgroups0601@gmail.com">khandelwalgroups0601@gmail.com</a>
          <a href="https://wa.me/${WA}" target="_blank" rel="noopener">WhatsApp</a>
        </div>
      </div>
      <p class="dk-copy">© <span id="yr">${new Date().getFullYear()}</span> Khandelwal Group · Kondhwa Budruk, Pune, Maharashtra 411048</p>`;
  }
})();
