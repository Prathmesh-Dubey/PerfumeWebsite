/* Built-in website content. Used when nothing has been saved from /edit yet,
   or when the database can't be reached. The admin editor starts from this too. */
window.SITE_DEFAULTS = (() => {
  const pad = n => String(n).padStart(2, '0');

  const texts = {
    heroEyebrow: 'Perfumes & Fragrances · Pune',
    heroTitle1: 'Crafting scents.',
    heroTitle2: 'Creating impressions.',
    heroLead: 'Khandelwal Group is a Pune-based manufacturer and supplier of premium eau de parfum. Under our signature label, Velunia, we make long-lasting fragrances for women, men and everyone in between, with corporate gifting, private label and bulk orders across India.',
    aboutText: 'Khandelwal Group is a Pune-based manufacturer and supplier of premium fragrances and perfumes. Under our signature label, Velunia, we craft long-lasting eau de parfums for women, men and every taste in between, and supply corporate gifting, private label and bulk orders across India.',
    tagline: 'Crafting scents. Creating impressions.',
    servicesIntro: 'Fragrance solutions for businesses, events and celebrations.',
    productsIntro: 'Velunia Signature eau de parfum. Tap a bottle for the full details.',
    footerTagline: 'Fragrances that speak, impressions that last.'
  };

  const services = [
    ['Corporate Gifting', 'Premium fragrance gifts for clients, teams and partners.', 'g03'],
    ['Customized Fragrances', 'Scents tailored to your brand, occasion or personal taste.', 'g16'],
    ['Private Label & OEM', 'Your brand name on our fragrances, made to your specification.', 'g10'],
    ['Bulk Orders & Pan India Delivery', 'Large-volume orders supplied and delivered across India.', 'g24'],
    ['Wedding & Party Favours', 'Elegant fragrance favours for weddings, parties and celebrations.', 'g05'],
    ['Festive & Return Gifts', 'Thoughtful festive gifts and return gifts guests remember.', 'g17'],
    ['Hotel & Hospitality', 'Signature fragrances for hotels and hospitality spaces.', 'g15'],
    ['Events & Brand Promotions', 'Fragrances for exhibitions, events and promotional gifting.', 'g23']
  ].map(([t, d, img]) => ({ t, d, img: `assets/gallery/thumb/${img}.jpg` }));

  // [code, size ml, gender (F/M/U), price in rupees]
  const products = [
    ['GA2302', 50, 'F', 599], ['S-7350', 50, 'F', 599], ['IP 2302', 50, 'F', 599], ['S7060', 100, 'F', 699],
    ['NR8181', 100, 'M', 699], ['DE 2302', 50, 'F', 599], ['DE2302', 100, 'F', 699], ['NR2210', 100, 'F', 699],
    ['CR2302', 100, 'F', 699], ['NQ8324', 50, 'F', 599], ['NR4504', 50, 'M', 599], ['BL 2302', 100, 'F', 699],
    ['K3557', 100, 'M', 699], ['S6222', 100, 'F', 699], ['KW2302', 100, 'F', 699], ['NR8974', 100, 'M', 699],
    ['NQ8324', 50, 'F', 499], ['YS2308', 50, 'F', 499], ['JP2302', 100, 'U', 699], ['NR1810', 50, 'F', 599],
    ['NR9127', 100, 'M', 699], ['BR2302', 100, 'F', 600], ['HI2302', 100, 'F', 699], ['NR9127', 50, 'M', 400],
    ['NR6282', 50, 'M', 499], ['BN2302', 50, 'M', 500], ['2202', 50, 'F', 500], ['K7887', 50, 'F', 500]
  ].map(([code, size, g, price], i) => ({
    code, size, g, price,
    img: `assets/products/p${pad(i)}.jpg`,
    detail: `assets/catalogue/c${pad(i)}.jpg`
  }));

  const photos = [];
  for (let i = 0; i <= 26; i++) {
    if (i === 25) continue; // same artwork as the poster below
    photos.push({ id: `g${pad(i)}`, alt: 'Velunia Signature perfume bottle' });
  }
  const poster = { id: 'poster', alt: 'Velunia Signature fragrance poster', fit: 'contain', bg: '#0d0a08' };
  const flyer = { id: 'flyer', alt: 'Khandelwal Group corporate solutions', fit: 'contain', bg: '#F4EBD8' };
  const gallery = [...photos.slice(0, 6), poster, ...photos.slice(6), flyer].map(x => ({
    thumb: `assets/gallery/thumb/${x.id}.jpg`,
    full: `assets/gallery/full/${x.id}.jpg`,
    alt: x.alt,
    fit: x.fit || 'cover',
    bg: x.bg || ''
  }));

  return { texts, services, products, gallery };
})();
