/* detail.js — Book detail modal content builder
   Provides: MAGIC_TAXONOMY, detectMagicTopics, MetadataCache, buildDetailBodyHTML
   Loaded before catalog.js so openModal() can call buildDetailBodyHTML(). */

// ── Magic taxonomy ────────────────────────────────────────────────
const MAGIC_TAXONOMY = [
  'Card Magic','Coin Magic','Mentalism','Close-up','Parlour','Stage',
  "Children's Magic",'Comedy Magic','Gambling Demonstrations',
  'Sleight of Hand','Self-working','Impromptu','Gaffed Cards',
  'Packet Tricks','Sponge Magic','Rope Magic','Cups and Balls',
  'Linking Rings','Escapology','Bizarre Magic','Theory','Showmanship',
  'Business','History','Collectable','Lecture Notes','Downloads','DVD / Video',
];

const _TOPIC_KW = {
  'Card Magic':              ['card','cards','deck','playing card','cardistry','erdnase','triumph','poker deck'],
  'Coin Magic':              ['coin','coins','silver','copper','half dollar','palming','matrix','scotch and soda'],
  'Mentalism':               ['mental','mentalism','mind read','psychic','esp','prediction','telepathy','thought read','billet','cold read'],
  'Close-up':                ['close-up','closeup','close up','table magic','restaurant magic','walk around','walk-around'],
  'Parlour':                 ['parlour','parlor','platform magic','after dinner'],
  'Stage':                   ['stage','illusion','full evening','grand illusion','cabaret','one man show'],
  "Children's Magic":        ['children','junior magic','birthday party','school show','kids magic',"children's show"],
  'Comedy Magic':            ['comedy','comic','humour','humor','funny magic','laugh','comedic'],
  'Gambling Demonstrations': ['gambling','poker','second deal','bottom deal','false cut','false shuffle','faro','mechanic','cheating at cards','card cheat'],
  'Sleight of Hand':         ['sleight','sleight of hand','dexterity','technique','manipulat','flourish'],
  'Self-working':            ['self-working','self working','mathematical','automatic','no sleight','self-work','no skill'],
  'Impromptu':               ['impromptu','borrowed','any deck','unprepared','no setup'],
  'Gaffed Cards':            ['gaff','gaffed','marked cards','svengali','stripper deck','forcing deck','marked deck'],
  'Packet Tricks':           ['packet trick','mini deck','small packet'],
  'Sponge Magic':            ['sponge ball','sponge magic','sponge rabbit','sponge'],
  'Rope Magic':              ['rope magic','rope trick','cut and restore','professor nightmare'],
  'Cups and Balls':          ['cups and balls','chop cup','cups & balls'],
  'Linking Rings':           ['linking rings','chinese rings','ring and rope'],
  'Escapology':              ['escape','escapology','houdini','straitjacket','handcuff','jail break'],
  'Bizarre Magic':           ['bizarre','dark magic','gothic magic','horror magic','séance','seance'],
  'Theory':                  ['theory of magic','principles of magic','philosophy of magic','psychology of magic'],
  'Showmanship':             ['presentation','showmanship','performance','theatrical','character','stagecraft'],
  'Business':                ['business of magic','marketing for magicians','booking','management','professional magic'],
  'History':                 ['history of magic','historical','biography','autobiography','classic magic','vintage magic'],
  'Collectable':             ['collectable','collectible','rare edition','limited edition','first edition','signed copy'],
  'Lecture Notes':           ['lecture notes','magic lecture'],
  'Downloads':               ['download','digital download','pdf download','ebook'],
  'DVD / Video':             ['dvd','instructional video','video download','streaming magic','blu-ray'],
};

// ── Local metadata cache (localStorage) ─────────────────────────
const MetadataCache = {
  _k: id => 'magilib_enrich_' + id,
  get(id) {
    try { return JSON.parse(localStorage.getItem(this._k(id))); }
    catch { return null; }
  },
  set(id, d) {
    try { localStorage.setItem(this._k(id), JSON.stringify({ ...d, _at: Date.now() })); }
    catch { /* storage full — silent */ }
  },
  clear(id) { localStorage.removeItem(this._k(id)); },
};

// ── Metadata enrichment (user-initiated, modular adapter pattern) ─
const MetadataEnrichmentAdapters = [
  {
    name: 'OpenGraph / JSON-LD',
    canHandle(url) { return !!url; },
    async fetchMetadata(url, bookId) {
      try {
        const res = await fetch('/api/fetch-proxy?action=fetch&url=' + encodeURIComponent(url));
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const html = await res.text();
        return this.parseMetadata(html, url);
      } catch { return null; }
    },
    parseMetadata(html, sourceUrl) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const og   = sel => (doc.querySelector('meta[property="' + sel + '"]') || {}).content || '';
      const meta = sel => (doc.querySelector('meta[name="' + sel + '"]') || {}).content || '';
      let ld = null;
      doc.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
        try {
          const d = JSON.parse(s.textContent);
          const isBook = t => t === 'Book' || t === 'Product';
          if (isBook(d['@type'])) ld = d;
          else if (Array.isArray(d['@graph'])) {
            const found = d['@graph'].find(x => isBook(x['@type']));
            if (found) ld = found;
          }
        } catch { /* invalid JSON-LD */ }
      });
      const data = {
        title:       (ld && ld.name)        || og('og:title')       || doc.title || '',
        description: (ld && ld.description) || og('og:description') || meta('description') || '',
        image:       (ld && ld.image)       || og('og:image')       || '',
        author:      (ld && ld.author && ld.author.name) || '',
        publisher:   (ld && ld.publisher && ld.publisher.name) || '',
        year:        (ld && ld.datePublished || '').slice(0, 4),
        isbn:        (ld && ld.isbn) || '',
        sourceUrl,
        _source: 'web_scrape',
        _at: Date.now(),
      };
      data.topics = [];
      const hay = (data.description + ' ' + data.title).toLowerCase();
      for (const [topic, kws] of Object.entries(_TOPIC_KW)) {
        if (kws.some(kw => hay.includes(kw))) data.topics.push(topic);
      }
      return data;
    },
    confidence: 2,
  },
];

async function enrichBookFromUrl(book, url) {
  const adapter = MetadataEnrichmentAdapters.find(a => a.canHandle(url));
  if (!adapter) return null;
  const data = await adapter.fetchMetadata(url, book._id);
  if (data) MetadataCache.set(book._id, data);
  return data;
}

// ── Topic detection (keyword match + cached enrichment topics) ────
function detectMagicTopics(book) {
  const hay = [book.title, book.author, book.artist, book.publisher, book.notes, book.collectorNote]
    .filter(Boolean).join(' ').toLowerCase();
  const found = [];
  for (const [topic, kws] of Object.entries(_TOPIC_KW)) {
    if (kws.some(kw => hay.includes(kw))) found.push(topic);
  }
  const cached = MetadataCache.get(book._id);
  if (cached && Array.isArray(cached.topics)) {
    for (const t of cached.topics) {
      if (!found.includes(t) && MAGIC_TAXONOMY.includes(t)) found.push(t);
    }
  }
  return found;
}

// ── Recommendation scoring ────────────────────────────────────────
function _buildRecommendations(book, allBooks) {
  const norm = s => (s || '').toLowerCase().trim();
  const topics = detectMagicTopics(book);
  return allBooks
    .filter(b => b._id !== book._id && b.sold !== 'Sold' && b.draft !== 'Draft')
    .map(b => {
      let s = 0;
      if (book.author && b.author && norm(b.author) === norm(book.author)) s += 12;
      if (book.publisher && b.publisher && norm(b.publisher) === norm(book.publisher)) s += 3;
      if (book.artist && b.artist && norm(b.artist) === norm(book.artist)) s += 5;
      const bt = detectMagicTopics(b);
      s += topics.filter(t => bt.includes(t)).length * 2;
      return { b, s };
    })
    .filter(x => x.s > 0)
    .sort((a, c) => c.s - a.s)
    .slice(0, 8)
    .map(x => x.b);
}

function _wishlistSuggestions(book, allBooks) {
  const norm = s => (s || '').toLowerCase().trim();
  const topics = detectMagicTopics(book);
  return allBooks
    .filter(b => b._id !== book._id && b.sold === 'Wishlist')
    .map(b => {
      let s = 0;
      if (book.author && b.author && norm(b.author) === norm(book.author)) s += 10;
      const bt = detectMagicTopics(b);
      s += topics.filter(t => bt.includes(t)).length * 2;
      return { b, s };
    })
    .filter(x => x.s > 0)
    .sort((a, c) => c.s - a.s)
    .slice(0, 4)
    .map(x => x.b);
}

function _authorBooks(book, allBooks) {
  if (!book.author) return [];
  const norm = s => (s || '').toLowerCase().trim();
  return allBooks.filter(b =>
    b._id !== book._id &&
    b.sold !== 'Sold' &&
    b.draft !== 'Draft' &&
    b.author &&
    norm(b.author) === norm(book.author)
  );
}

// ── Recommendation card HTML ──────────────────────────────────────
function _recoCardHTML(b, idx) {
  const cover = b.rawCover || b.coverUrl || '';
  const inner = cover
    ? `<img src="${cover}" alt="${sanitize(b.title)}" loading="lazy" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'">`
    : `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.2' style='opacity:0.2;'><path d='M4 19.5A2.5 2.5 0 0 1 6.5 17H20'/><path d='M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z'/></svg>`;
  const statusDot = b.sold === 'Wishlist'
    ? `<span style="position:absolute;top:4px;right:4px;width:7px;height:7px;border-radius:50%;background:var(--status-wishlist);border:1.5px solid #fff;"></span>` : '';
  return `<div class="ms-reco-card" data-action="open-book" data-idx="${idx}" title="${sanitize(b.title)}">
    <div class="ms-reco-cover" style="position:relative;">${inner}${statusDot}</div>
    <div class="ms-reco-title">${sanitize(b.title)}</div>
    <div class="ms-reco-author">${sanitize(b.author || '')}</div>
  </div>`;
}

// ── Status badge ──────────────────────────────────────────────────
function _statusBadgeHTML(b) {
  if (b.sold === 'Wishlist') return `<span class="ms-status-badge ms-status-wishlist">★ Wishlist</span>`;
  if (b.sold === 'Sold')     return `<span class="ms-status-badge ms-status-sold">Sold</span>`;
  return `<span class="ms-status-badge ms-status-owned">✓ In Library</span>`;
}

// ── Enrich section builder ────────────────────────────────────────
function buildEnrichSectionHTML(b) {
  const q = encodeURIComponent((b.title || '') + (b.author ? ' ' + b.author : ''));
  const mAttr = ('https://www.murphysmagic.com/Search.aspx?q=' + q).replace(/"/g, '&quot;');
  const vAttr = ('https://www.vanishingincmagic.com/search/' + q + '/').replace(/"/g, '&quot;');
  return `<div class="ms-section ms-enrich-section" id="ms-enrich-section">
    <div class="ms-section-title">Enrich from Web</div>
    <div class="ms-enrich-body">
      <div class="ms-enrich-hint">Find the product page, copy its URL, paste below.</div>
      <div class="ms-enrich-chips">
        <button class="ms-enrich-chip" data-action="enrich-open" data-url="${mAttr}">Murphy's Magic ↗</button>
        <button class="ms-enrich-chip" data-action="enrich-open" data-url="${vAttr}">Vanishing Inc ↗</button>
      </div>
      <div class="ms-enrich-paste-row">
        <input type="url" id="enrichUrlInput" class="ms-enrich-input" placeholder="Paste product page URL…" autocomplete="off">
        <button id="enrichFetchBtn" class="ms-enrich-btn" data-action="enrich-fetch">Fetch</button>
      </div>
      <div id="enrichStatus" class="ms-enrich-status"></div>
    </div>
  </div>`;
}

// ── Main HTML builder — called by openModal() in catalog.js ───────
function buildDetailBodyHTML(book, allBooks, opts) {
  const b          = book;
  const isWishlist = opts.isWishlist;
  const libraryMatch   = opts.libraryMatch   || null;
  const modalCoverSrc  = opts.modalCoverSrc  || '';
  const inPrintLabel   = opts.inPrintLabel   || '—';
  const googleUrl      = opts.googleUrl      || '';
  const sym            = opts.sym            || '';

  const recoItems    = _buildRecommendations(b, allBooks);
  const authorItems  = _authorBooks(b, allBooks);
  const wishSuggs    = !isWishlist ? _wishlistSuggestions(b, allBooks) : [];
  const cached       = MetadataCache.get(b._id);
  const _coreContent = (b.notes || '') || ((cached && cached.description) || '');
  const enrichSection = !_coreContent ? buildEnrichSectionHTML(b) : '';

  // ── Library match warning ───────────────────────────────────────
  const matchWarning = libraryMatch
    ? `<div class="ms-match-warning">
        <svg xmlns='http://www.w3.org/2000/svg' width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' style='flex-shrink:0;'><path d='M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z'/><line x1='12' y1='9' x2='12' y2='13'/><line x1='12' y1='17' x2='12.01' y2='17'/></svg>
        <span>Already in your library</span>
      </div>` : '';

  // ── Cover hero ──────────────────────────────────────────────────
  const coverInner = modalCoverSrc
    ? `<img class="ms-hero-img" src="${modalCoverSrc.replace(/"/g, '&quot;')}" alt="${sanitize(b.title)}" loading="lazy" decoding="async" onerror="this.style.display='none'">`
    : `<svg xmlns='http://www.w3.org/2000/svg' width='52' height='52' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='0.8' style='opacity:0.15;color:var(--ink-faint);'><path d='M4 19.5A2.5 2.5 0 0 1 6.5 17H20'/><path d='M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z'/></svg>`;

  const coverCard = modalCoverSrc
    ? `<div class="ms-cover-card" data-action="zoom-cover" data-zoom-src="${modalCoverSrc.replace(/"/g, '&quot;')}" style="cursor:zoom-in;">${coverInner}</div>`
    : `<div class="ms-cover-card ms-cover-empty">${coverInner}</div>`;

  // ── Inline badges ───────────────────────────────────────────────
  const condBadge  = b.condition ? `<span class="ms-badge ms-badge--cond">${sanitize(b.condition)}</span>` : '';
  const priceBadge = (b.price && !isNaN(parseFloat(b.price)))
    ? `<span class="ms-badge ms-badge--price">${sym}${parseFloat(b.price).toFixed(0)}</span>` : '';
  const badgesRow  = (condBadge || priceBadge)
    ? `<div class="ms-badges-row" style="margin-bottom:${b.flags ? '6px' : '10px'};">${condBadge}${priceBadge}</div>` : '';

  const flagsHtml = b.flags
    ? `<div class="ms-flags">${sanitize(b.flags)}</div>` : '';

  // Star rating slot (populated by renderModalStars after injection)
  const starSlot = !isWishlist
    ? `<div class="ms-star-slot"><span class="ms-star-label">Rating</span><div id="modalStarRow" class="star-row" style="margin-top:0;"></div></div>` : '';

  const inPrintHtml = isWishlist
    ? `<div class="ms-subtitle" style="margin-bottom:10px;">In Print: <strong style="color:var(--ink);">${inPrintLabel}</strong></div>` : '';

  // ── Metadata row ────────────────────────────────────────────────
  const metaItems = [
    b.year                             ? `<div class="ms-metadata-item"><span class="ms-label">Year</span><span class="ms-value">${sanitize(b.year)}</span></div>` : '',
    (b.publisher && b.publisher !== b.author) ? `<div class="ms-metadata-item"><span class="ms-label">Publisher</span><span class="ms-value">${sanitize(b.publisher)}</span></div>` : '',
    (b.dateAdded && !isWishlist)       ? `<div class="ms-metadata-item"><span class="ms-label">Added</span><span class="ms-value">${sanitize(b.dateAdded)}</span></div>` : '',
    b.location                         ? `<div class="ms-metadata-item"><span class="ms-label">Acquired</span><span class="ms-value">${sanitize(b.location)}</span></div>` : '',
    b.isbn                             ? `<div class="ms-metadata-item"><span class="ms-label">ISBN</span><span class="ms-value">${sanitize(b.isbn)}</span></div>` : '',
  ].filter(Boolean).join('');
  const metaRow = metaItems ? `<div class="ms-metadata-row">${metaItems}</div>` : '';

  // ── Core Ideas ──────────────────────────────────────────────────
  const notesContent   = b.notes || '';
  const enrichedDesc   = (cached && cached.description) ? cached.description : '';
  const coreContent    = notesContent || enrichedDesc;
  const enrichedLabel  = (enrichedDesc && !notesContent)
    ? `<span class="ms-enrich-source">· from public data</span>` : '';
  const coreSection = `<div class="ms-section">
    <div class="ms-section-title">Core Ideas ${enrichedLabel}</div>
    ${coreContent
      ? `<div class="ms-section-body">${sanitize(coreContent)}</div>`
      : `<div class="ms-empty-state">No notes yet — add your thoughts via <em>Edit Details</em>, or use the enrich button below to pull in public metadata.</div>`}
  </div>`;

  // ── Subject / Topic ─────────────────────────────────────────────
  const chipHtml = topics.map(t =>
    `<button class="ms-topic-chip" data-action="filter-topic" data-topic="${t.replace(/"/g,'&quot;')}">${t}</button>`
  ).join('');
  const topicSection = `<div class="ms-section">
    <div class="ms-section-title">Subject / Topic</div>
    ${chipHtml
      ? `<div class="ms-topic-chips">${chipHtml}</div>`
      : `<div class="ms-empty-state">No topics detected yet — add more details or enrich metadata to classify this item.</div>`}
  </div>`;

  // ── Collector's Note ────────────────────────────────────────────
  const collectorSection = b.collectorNote
    ? `<div class="ms-section ms-section--warm">
        <div class="ms-section-title ms-section-title--gold">Collector's Note</div>
        <div class="ms-section-body" style="font-style:italic;">${sanitize(b.collectorNote)}</div>
      </div>` : '';

  // ── About the Author ────────────────────────────────────────────
  const authorBooksHtml = authorItems.length
    ? `<div style="margin-top:10px;">
        <div class="ms-section-sublabel">Also in your library</div>
        <div class="ms-author-books">${authorItems.map(ab => {
          const aidx = allBooks.indexOf(ab);
          return `<button class="ms-author-book-chip" data-action="open-book" data-idx="${aidx}">${sanitize(ab.title)}</button>`;
        }).join('')}</div>
      </div>` : '';

  const authorSection = b.author
    ? `<div class="ms-section">
        <div class="ms-section-title">About the Author</div>
        <div class="ms-section-body">
          ${(cached && cached.authorBio)
            ? sanitize(cached.authorBio)
            : `<span class="ms-empty-state">No biography on file${b.author ? ' for ' + sanitize(b.author) : ''}.</span>`}
        </div>
        ${authorBooksHtml}
      </div>` : '';

  // ── Recommended from your library ───────────────────────────────
  const recoCardsHtml = recoItems.map(rb => _recoCardHTML(rb, allBooks.indexOf(rb))).join('');
  const recoSection = `<div class="ms-section">
    <div class="ms-section-title">Recommended from Your Library</div>
    ${recoCardsHtml
      ? `<div class="ms-reco-carousel">${recoCardsHtml}</div>`
      : `<div class="ms-empty-state">Nothing similar in your library yet.</div>`}
  </div>`;

  // ── Wishlist suggestions ────────────────────────────────────────
  const wishSuggestSection = (!isWishlist && wishSuggs.length)
    ? `<div class="ms-section">
        <div class="ms-section-title">On Your Wishlist</div>
        <div class="ms-reco-carousel">${wishSuggs.map(wb => _recoCardHTML(wb, allBooks.indexOf(wb))).join('')}</div>
      </div>` : '';

  // ── Google search fallback ──────────────────────────────────────
  const googleFallback = (isWishlist && !modalCoverSrc && !libraryMatch)
    ? `<div class="ms-section" style="align-items:center;gap:10px;display:flex;flex-direction:column;">
        <div class="ms-empty-state" style="text-align:center;">No image found for this title</div>
        <button data-action="google-search" data-url="${googleUrl}" class="btn-enrich-search">
          <svg xmlns='http://www.w3.org/2000/svg' width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='11' cy='11' r='8'/><line x1='21' y1='21' x2='16.65' y2='16.65'/></svg>
          Search for Details
        </button>
      </div>` : '';

  // ── Market sync slot (hidden until "Market Value" pressed) ───────
  const marketSlot = `<div id="marketSyncSection" style="display:none;"></div>`;

  // ── Assemble ────────────────────────────────────────────────────
  return `
    <div class="ms-cover-hero">
      ${matchWarning}
      ${coverCard}
      ${_statusBadgeHTML(b)}
      <div class="ms-title">${sanitize(b.title)}</div>
      <div class="ms-subtitle" style="margin-bottom:${isWishlist ? '6px' : '8px'};">${[b.author, (b.artist && b.artist !== b.author) ? b.artist : null].filter(Boolean).map(sanitize).join(' · ')}</div>
      ${inPrintHtml}
      ${badgesRow}
      ${flagsHtml}
      ${starSlot}
    </div>
    ${metaRow}
    ${coreSection}
    ${enrichSection}
    ${topicSection}
    ${collectorSection}
    ${authorSection}
    ${recoSection}
    ${wishSuggestSection}
    ${googleFallback}
    ${marketSlot}
  `;
}
