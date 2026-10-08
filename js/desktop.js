(() => {
  'use strict';
  if (!matchMedia('(min-width: 1024px)').matches) return;
  const $ = (s, r = document) => r.querySelector(s);
  const v = $('#dkVideo'), mute = $('#dkMute'), nav = $('#dkNav');
  if (!v) return;

  // jumbotron video: autoplay muted, pause when scrolled away
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  v.preload = 'metadata';
  if (!reduce) v.play().catch(() => {});
  mute.addEventListener('click', () => {
    v.muted = !v.muted;
    $('use', mute).setAttribute('href', v.muted ? '#i-mute' : '#i-vol');
    mute.setAttribute('aria-label', v.muted ? 'Turn sound on' : 'Turn sound off');
    if (v.paused) v.play().catch(() => {});
  });
  if ('IntersectionObserver' in window && !reduce) {
    new IntersectionObserver(([en]) => { en.isIntersecting ? v.play().catch(() => {}) : v.pause(); }, { threshold: 0.2 }).observe(v);
  }

  // nav gets a shadow once the page scrolls; current section link is highlighted
  const onScroll = () => nav.classList.toggle('scrolled', scrollY > 10);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();
  const links = [...document.querySelectorAll('.dk-links a')];
  if ('IntersectionObserver' in window) {
    const map = new Map(links.map(a => [a.getAttribute('href').slice(1), a]));
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { links.forEach(l => l.classList.remove('on')); map.get(e.target.id)?.classList.add('on'); }
    }), { rootMargin: '-45% 0px -50% 0px' });
    map.forEach((_, id) => { const el = document.getElementById(id); if (el) io.observe(el); });
  }
})();
