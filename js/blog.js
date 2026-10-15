/* blog.html — editorial pages from /edit → Blog, using the full width:
   the list of articles, or one article (blog.html?p=<article>): a jumbotron (cover photo behind the title),
   then "In this article", the overview, numbered section cards, a help band and more articles.
   The navbar and footer come from js/chrome.js, the same as every page. */
(async () => {
  'use strict';
  const S = window.SiteContent, esc = S.esc;
  const C = await S.load();
  S.applyTexts(C); // footer tagline + the WhatsApp number saved in /edit (navbar/footer links too)
  const posts = C.blogs || [];
  const wa = String(C.settings.wa);
  const page = document.getElementById('blogPage');
  const id = new URLSearchParams(location.search).get('p');
  const post = id && posts.find(p => p.id === id);
  const pad = n => String(n).padStart(2, '0');
  const minutes = p => Math.max(1, Math.round(String(p.body || '').split(/\s+/).filter(Boolean).length / 200));
  const waLink = text => `https://wa.me/${wa}?text=${encodeURIComponent(text)}`;
  const WA_IC = '<img class="wa-ic" src="assets/brand/whatsapp.png" alt="" width="20" height="20">';
  const back = b => `<a class="ed-back" href="${b.href}">${b.text}</a>`;

  // article card: cover, date pill, title, summary
  const card = (p, wide) => `
    <a class="ed-card${wide ? ' ed-card-wide' : ''}" href="${S.blogUrl(p)}">
      <span class="ed-card-ph"><img src="${esc(p.cover || S.BLOG_COVER)}" alt="" loading="lazy" referrerpolicy="no-referrer"></span>
      <span class="ed-card-body">
        <span class="ed-pills"><span class="ed-pill">${esc(S.blogDate(p.date))}</span><span class="ed-pill ed-pill-soft">${minutes(p)} min read</span></span>
        <span class="ed-card-title">${esc(p.title)}</span>
        ${p.excerpt ? `<span class="ed-card-ex">${esc(p.excerpt)}</span>` : ''}
        <span class="ed-card-go">Read article →</span>
      </span>
    </a>`;

  if (post) {
    document.title = `${post.title} | Khandelwal Group`;
    const desc = document.querySelector('meta[name="description"]');
    if (desc && post.excerpt) desc.setAttribute('content', post.excerpt);
    const others = posts.filter(p => p !== post).slice(0, 3);
    const ask = waLink(`Hi Khandelwal Group, I read your article "${post.title}" and would like to know more.`);

    // split the article at its "## " headings: the part before the first heading is the introduction,
    // every heading starts its own numbered section card
    const tmp = document.createElement('div');
    tmp.innerHTML = S.blogHtml(post.body); // already escaped/safe (see SiteContent.blogHtml)
    const intro = [], sections = [];
    [...tmp.children].forEach(el => {
      if (el.tagName === 'H2') sections.push({ title: el.textContent, html: '' });
      else if (sections.length) sections[sections.length - 1].html += el.outerHTML;
      else intro.push(el.outerHTML);
    });

    page.innerHTML = `
      <article>
        <!-- jumbotron: the cover photo fills the band, the title sits on it -->
        <header class="ed-jumbo">
          <img class="ed-jumbo-bg" src="${esc(post.cover || S.BLOG_COVER)}" alt="" referrerpolicy="no-referrer">
          <div class="ed-wrap ed-jumbo-in">
            ${back(posts.length > 1 ? { href: 'blog.html', text: '← All articles' } : { href: 'index.html', text: '← Home' })}
            <span class="ed-pills"><span class="ed-pill">${esc(S.blogDate(post.date))}</span><span class="ed-pill ed-pill-soft">${minutes(post)} min read</span></span>
            <h1>${esc(post.title)}</h1>
            ${post.excerpt ? `<p class="ed-lede">${esc(post.excerpt)}</p>` : ''}
            <a class="btn ed-jumbo-btn" href="${ask}" target="_blank" rel="noopener">${WA_IC}Ask us on WhatsApp</a>
          </div>
        </header>

        ${sections.length > 1 ? `
        <nav class="ed-wrap ed-sectionblock" aria-label="In this article">
          <div class="ed-box ed-toc">
            <h2 class="ed-box-h">In this article</h2>
            <ol>${sections.map((s, i) => `<li><a href="#s${i + 1}"><span class="ed-num">${pad(i + 1)}</span>${esc(s.title)}</a></li>`).join('')}</ol>
          </div>
        </nav>` : ''}

        ${intro.length ? `
        <section class="ed-wrap ed-sectionblock">
          <div class="ed-box ed-intro"><h2 class="ed-box-h">Overview</h2><div class="ed-body">${intro.join('')}</div></div>
        </section>` : ''}

        ${sections.length ? `
        <section class="ed-wrap ed-sectionblock">
          <div class="ed-sections">${sections.map((s, i) => `
            <section class="ed-part" id="s${i + 1}">
              <h2><span class="ed-num" aria-hidden="true">${pad(i + 1)}</span>${esc(s.title)}</h2>
              <div class="ed-body">${s.html}</div>
            </section>`).join('')}
          </div>
        </section>` : ''}
      </article>

      <section class="ed-wrap ed-sectionblock">
        <div class="ed-box ed-help">
          <div>
            <h2 class="ed-box-h">Need help choosing?</h2>
            <b>Planning a gift or a bulk order?</b>
            <p>Corporate gifting, private label and bulk orders across India. Tell us the occasion, quantity and budget and we'll reply on WhatsApp.</p>
          </div>
          <a class="btn" href="${ask}" target="_blank" rel="noopener">${WA_IC}Chat on WhatsApp</a>
        </div>
      </section>

      ${others.length ? `<section class="ed-wrap ed-more"><h2 class="ed-sec"><span>More articles</span></h2><div class="ed-cards">${others.map(p => card(p)).join('')}</div></section>` : ''}`;
    return;
  }

  // all articles (also shown for an address that doesn't match an article)
  const [first, ...rest] = posts;
  page.innerHTML = `
    <section class="ed-wrap ed-index">
      <header class="ed-banner">
        <span class="ed-pill">Journal</span>
        <h1>Fragrance &amp; gifting notes</h1>
        <p>Guides and ideas from Khandelwal Group, Pune: makers of Velunia Signature eau de parfum.</p>
        <span class="ed-pill ed-pill-soft">${posts.length} article${posts.length === 1 ? '' : 's'}</span>
      </header>
      ${id ? '<p class="ed-note">That article is no longer available. Here is everything we have written.</p>' : ''}
      ${posts.length
        ? `${card(first, true)}${rest.length ? `<div class="ed-cards">${rest.map(p => card(p)).join('')}</div>` : ''}`
        : '<p class="ed-note">No articles yet. Please check back soon.</p>'}
    </section>`;
})();
