/* Shared photo list for the profile page carousel and the full gallery page.
   Files live in assets/gallery/thumb (480 px) and assets/gallery/full (1000 px+). */
window.GALLERY = (() => {
  const pad = n => String(n).padStart(2, '0');
  const photos = [];
  for (let i = 0; i <= 26; i++) {
    if (i === 25) continue; // same artwork as the poster below
    photos.push({ id: `g${pad(i)}`, alt: 'Velunia Signature perfume bottle' });
  }
  const poster = { id: 'poster', alt: 'Velunia Signature fragrance poster', fit: 'contain', bg: '#0d0a08' };
  const flyer = { id: 'flyer', alt: 'Khandelwal Group corporate solutions', fit: 'contain', bg: '#F4EBD8' };
  const list = [...photos.slice(0, 6), poster, ...photos.slice(6), flyer];
  return list.map(x => ({
    thumb: `assets/gallery/thumb/${x.id}.jpg`,
    full: `assets/gallery/full/${x.id}.jpg`,
    alt: x.alt,
    fit: x.fit || 'cover',
    bg: x.bg || ''
  }));
})();
