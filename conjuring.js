// conjuring.js — Conjuring Archive + MagicRef local DB lookup, fuzzy match, metadata scrape
// DB format updated April 2026: sparse fields (t,a,s,y,c,i,m) + compressed URL prefixes

// ── URL EXPANDERS ──
// New DB stores compressed URLs to save space. Expand at runtime.
// Cover URLs:   "C:NNN"      → https://www.conjuringarchive.com/images/covers/NNNa.jpg
//               "M:filename" → https://www.magicref.net/images/books/filename
// Page URLs:    "P:path"     → https://www.magicref.net/magicbooks/path
const _CA_IMG  = 'https://www.conjuringarchive.com/images/covers/';
const _MR_IMG  = 'https://www.magicref.net/images/books/';
const _MR_PAGE = 'https://www.magicref.net/magicbooks/';

function expandCoverUrl(u) {
  if (!u) return '';
  if (u.startsWith('C:')) return _CA_IMG + u.slice(2) + 'a.jpg';
  if (u.startsWith('M:')) return _MR_IMG + u.slice(2);
  return u; // already a full URL (fallback)
}

function expandPageUrl(u) {
  if (!u) return '';
  if (u.startsWith('P:')) return _MR_PAGE + u.slice(2);
  return u;
}

// ── DB ENTRY ACCESSORS ──
// Read sparse fields from a DB entry, returning empty string if absent.
// Works with both old format (string value) and new format (object with short keys).
function dbTitle(e)      { return (e && e.t) || ''; }
function dbAuthor(e)     { return (e && e.a) || ''; }
function dbAuthorSort(e) { return (e && e.s) || ''; }
function dbYear(e)       { return (e && e.y) || ''; }
function dbCoverUrl(e)   { return e ? expandCoverUrl(e.c || '') : ''; }
function dbAltImages(e)  { return e && e.i ? e.i.map(expandCoverUrl).filter(Boolean) : []; }
function dbMagicrefUrl(e){ return e ? expandPageUrl(e.m || '') : ''; }

// Get ALL cover images for an entry (primary + alts), deduplicated
function dbAllCovers(e) {
  if (!e) return [];
  const primary = dbCoverUrl(e);
  const alts    = dbAltImages(e);
  const all = [];
  if (primary) all.push(primary);
  alts.forEach(u => { if (u && !all.includes(u)) all.push(u); });
  return all;
}

// ── TITLE NORMALISATION ──
// Matches the app's normTitle exactly — used as DB lookup key
function normTitle(t) {
  return t.toLowerCase()
    .replace(/["\u201c\u201d\u2018\u2019\'\u2019`]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// ── EXACT LOCAL LOOKUP ──
// Returns the best single DB entry match, or null.
// For disambiguated titles (e.g. "tricks of the trade armstrong"),
// returns the first variant if multiple exist — use lookupConjuringAll for all.
function lookupConjuringEntry(title) {
  if (typeof CONJURING_DB === 'undefined' || !title) return null;
  const key = normTitle(title);
  // Direct key match
  if (CONJURING_DB[key]) return { key, entry: CONJURING_DB[key] };
  // Strip subtitle (e.g. "Expert at the Card Table: Revised" → "expert at the card table")
  const shortKey = key.split(/[—:]/)[0].trim();
  if (shortKey !== key && CONJURING_DB[shortKey]) return { key: shortKey, entry: CONJURING_DB[shortKey] };
  // Check for disambiguated variants: any entry whose b (baseKey) matches this key
  for (const [k, e] of Object.entries(CONJURING_DB)) {
    if (e.b === key || e.b === shortKey) return { key: k, entry: e };
  }
  return null;
}

// Returns ALL DB entries whose key or baseKey matches the normalised title.
// Used to surface all variants of a duplicate title in the dropdown.
function lookupConjuringAll(title) {
  if (typeof CONJURING_DB === 'undefined' || !title) return [];
  const key = normTitle(title);
  const shortKey = key.split(/[—:]/)[0].trim();
  const results = [];
  for (const [k, e] of Object.entries(CONJURING_DB)) {
    if (k === key || k === shortKey || e.b === key || e.b === shortKey) {
      results.push({ key: k, entry: e, url: dbCoverUrl(e), score: 1.0 });
    }
  }
  return results;
}

// Legacy helper — returns just the cover URL string (used by cover picker)
function lookupConjuringCover(title) {
  const result = lookupConjuringEntry(title);
  return result ? dbCoverUrl(result.entry) : null;
}

// ── AUTO-CHECK ON TITLE FIELD ──
// Called after a scan populates the title. Shows a suggested cover from DB.
function checkConjuringDB(title) {
  if (!title) return;
  const result = lookupConjuringEntry(title);
  if (!result) return;
  const coverUrl = dbCoverUrl(result.entry);
  if (!coverUrl) return;
  const card      = document.getElementById('aiInfoCard');
  const contentEl = document.getElementById('aiInfoContent');
  const existing  = contentEl ? contentEl.querySelector('.conjuring-suggestion') : null;
  if (existing) return; // already shown
  const suggId = 'conjSugg_' + Date.now();
  const html = `<div id="${suggId}" class="conjuring-suggestion" style="margin-top:6px;">
    <div style="font-size:11px;color:var(--ink-light);margin-bottom:4px;">Found in local database:</div>
    <div style="display:flex;align-items:center;gap:8px;">
      <img src="${coverUrl}" style="width:36px;height:50px;object-fit:cover;border-radius:4px;border:0.5px solid var(--border);flex-shrink:0;" onerror="this.style.display='none'">
      <div style="flex:1;min-width:0;">
        <div style="font-size:12px;font-weight:500;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${result.entry.t || title}</div>
        ${dbAuthor(result.entry) ? `<div style="font-size:11px;color:var(--ink-light);">${dbAuthor(result.entry)}</div>` : ''}
      </div>
      <button onclick="acceptConjuringSuggestion('${coverUrl}','${suggId}')" style="flex-shrink:0;padding:4px 10px;background:var(--accent);color:white;border:none;border-radius:6px;font-size:11px;font-weight:500;cursor:pointer;">Use</button>
    </div>
  </div>`;
  if (contentEl) {
    contentEl.innerHTML = (contentEl.innerHTML || '') + html;
    if (card) card.style.display = 'block';
  }
}

// ── CONJURING ARCHIVE COVER ACCEPT ──
function acceptConjuringSuggestion(url, suggId) {
  setCover(url);
  const sugg = document.getElementById(suggId);
  if (sugg) {
    sugg.innerHTML = '<div style="display:flex;align-items:center;gap:7px;padding:6px 10px;background:var(--success-bg);border-radius:7px;border:0.5px solid var(--tier1-border);margin-top:4px;">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--tier1)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' +
      '<span style="font-size:12px;font-weight:500;color:var(--success);">Cover applied</span>' +
      '</div>';
    setTimeout(() => {
      sugg.style.transition = 'opacity 0.4s ease, max-height 0.4s ease';
      sugg.style.overflow = 'hidden';
      sugg.style.maxHeight = sugg.offsetHeight + 'px';
      requestAnimationFrame(() => {
        sugg.style.opacity = '0';
        sugg.style.maxHeight = '0';
        sugg.style.marginTop = '0';
      });
      setTimeout(() => sugg.remove(), 420);
    }, 1200);
  }
}

// ── FUZZY SCORER ──
// Normalised token overlap + prefix bonus
function conjuringFuzzyScore(query, candidate) {
  const norm = s => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const q = norm(query);
  const c = norm(candidate);
  if (q === c) return 1.0;
  const qTokens = new Set(q.split(' ').filter(t => t.length > 1));
  const cTokens = new Set(c.split(' ').filter(t => t.length > 1));
  if (qTokens.size === 0) return 0;
  let overlap = 0;
  qTokens.forEach(t => { if (cTokens.has(t)) overlap++; });
  const score = overlap / Math.max(qTokens.size, cTokens.size);
  const bonus = c.startsWith(q) || q.startsWith(c) ? 0.15 : 0;
  return Math.min(1, score + bonus);
}

// ── FUZZY LOOKUP ──
// Returns best match above threshold, including the full entry object
function conjuringFuzzyLookup(title) {
  if (typeof CONJURING_DB === 'undefined' || !title) return null;
  const norm = s => s.toLowerCase()
    .replace(/["\u201c\u201d\u2018\u2019\'\u2019`]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim()
    .replace(/^(the|a|an)\s+/i, '').trim();
  const q = norm(title);
  let best = null, bestScore = 0;
  for (const key of Object.keys(CONJURING_DB)) {
    const score = conjuringFuzzyScore(q, norm(key));
    if (score > bestScore) {
      bestScore = score;
      best = { key, entry: CONJURING_DB[key], score };
    }
  }
  if (bestScore < 0.72) return null;
  // Attach expanded url for backward compat
  best.url = dbCoverUrl(best.entry);
  return best;
}

// ── SOURCE CLASSIFIER ──
// MagicRef entries have an `m` field (page URL). Conjuring Archive-only entries have
// a C:-prefixed cover but no `m` field. Merged entries (both sources) count as MagicRef.
function _isMagicRef(entry) { return !!(entry && entry.m); }

// ── BOOK CATALOG LOOKUP (Supabase) ──
async function queryBookCatalog(title) {
  if (!title || typeof _supa === 'undefined') return null;
  const { data, error } = await _supa
    .from('book_catalog')
    .select('title,author,publisher,year,cover_url,price_ebay,price_msrp')
    .ilike('title', title.trim() + '%')
    .order('title')
    .limit(1);
  if (error || !data || !data.length) return null;
  return data[0];
}

function _fillFromCatalogRow(row) {
  const fill = (id, val) => {
    if (!val) return;
    const el = document.getElementById(id);
    if (el && !el.value.trim()) {
      el.value = val;
      el.classList.add('field-populated');
      setTimeout(() => el.classList.remove('field-populated'), 3000);
    }
  };
  if (row.author)    fill('f-author',    toTitleCase(row.author));
  if (row.year)      fill('f-year',      String(row.year));
  if (row.publisher) fill('f-publisher', toTitleCasePublisher(row.publisher));
  if (row.cover_url && !S.coverUrl) {
    setCover(row.cover_url);
    S.coverUrl = row.cover_url;
  }
  const price = row.price_ebay || row.price_msrp;
  if (price && !S.priceBase) S.priceBase = price;
}

// ── TOP N FUZZY MATCHES (for title dropdown) ──
// Surfaces disambiguated variants (e.g. all "Tricks of the Trade" authors) first,
// then fills remaining slots with fuzzy matches.
// Source priority: MagicRef first-only. Fall back to Conjuring Archive only if zero
// MagicRef results match. Never mix both sources in the same dropdown.
function conjuringTopMatches(title, n) {
  if (typeof CONJURING_DB === 'undefined' || !title) return [];
  const normFn = s => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^(the|a|an)\s+/i, '').trim();
  const q = normFn(title);

  // First: exact baseKey variants (score 1.0)
  const exactVariants = lookupConjuringAll(title);
  const exactKeys = new Set(exactVariants.map(r => r.key));

  // Then: fuzzy matches excluding already-found exact variants
  const fuzzy = [];
  for (const key of Object.keys(CONJURING_DB)) {
    if (exactKeys.has(key)) continue;
    const score = conjuringFuzzyScore(q, normFn(key));
    if (score >= 0.45) {
      fuzzy.push({ key, entry: CONJURING_DB[key], score, url: dbCoverUrl(CONJURING_DB[key]) });
    }
  }
  fuzzy.sort((a, b) => b.score - a.score);

  // Combine: exact variants first, then fuzzy
  const all = [...exactVariants, ...fuzzy];

  // Source filter: show MagicRef entries only; fall back to Conjuring Archive if none
  const mrMatches = all.filter(m => _isMagicRef(m.entry));
  const candidates = mrMatches.length > 0 ? mrMatches : all;
  return candidates.slice(0, n);
}
// ── EXTRACT CONJURING ARCHIVE BOOK ID FROM URL ──
function conjuringBookId(coverUrl) {
  const m = coverUrl && coverUrl.match(/\/covers\/(\d+)a\./);
  return m ? m[1] : null;
}

// ── APPLY MATCH ──
// After a fuzzy match: fill title, load cover, fill metadata from DB, then scrape remainder
async function applyConjuringMatch(match, scanSource) {
  const entry = match.entry;

  // 1. Title correction
  const canonical = toTitleCase(match.key);
  const titleEl    = document.getElementById('f-title');
  const currentTitle = titleEl ? titleEl.value.trim() : '';
  const shouldCorrectTitle = scanSource === 'scan' && (!currentTitle || match.score === 1.0);
  if (shouldCorrectTitle && titleEl) {
    titleEl.value = canonical;
    titleEl.classList.add('field-populated');
    setTimeout(() => titleEl.classList.remove('field-populated'), 3000);
  }

  // 2. Load cover (primary from DB)
  const coverUrl = dbCoverUrl(entry);
  if (coverUrl && !S.coverUrl) {
    setCover(coverUrl);
    S.coverUrl = coverUrl;
  }

  // 3. Fill metadata fields from DB (only empty fields)
  const fill = (id, val) => {
    if (!val) return;
    const el = document.getElementById(id);
    if (el && !el.value.trim()) {
      el.value = val;
      el.classList.add('field-populated');
      setTimeout(() => el.classList.remove('field-populated'), 3000);
    }
  };

  const author = dbAuthor(entry);
  const year   = dbYear(entry);
  if (author) fill('f-author', toTitleCase(author));
  if (year)   fill('f-year', year);

  const filledFromDB = [author, year].filter(Boolean).length;

  // 4. Status message
  const statusEl = document.getElementById('scanDetail');
  if (statusEl && scanSource === 'scan') {
    if (filledFromDB > 0) {
      statusEl.textContent = 'Local database: ' + filledFromDB + ' field' + (filledFromDB !== 1 ? 's' : '') + ' filled — checking for more…';
    } else {
      statusEl.textContent = 'Matched in local database — fetching metadata…';
    }
  }

  // 5. Try live scrape for publisher (and any fields still missing)
  // Prefer Conjuring Archive if we have an ID, else try MagicRef
  const caId = conjuringBookId(coverUrl);
  if (caId) {
    await scrapeConjuringMetadata(caId);
  } else {
    const mrUrl = dbMagicrefUrl(entry);
    if (mrUrl) {
      await scrapeMagicRefMetadata(mrUrl);
    }
  }

  // Ensure status never stays frozen on "checking for more…"
  if (statusEl && scanSource === 'scan' && statusEl.textContent.includes('checking for more')) {
    statusEl.textContent = filledFromDB > 0
      ? 'Local database: ' + filledFromDB + ' field' + (filledFromDB !== 1 ? 's' : '') + ' filled.'
      : 'Matched in local database.';
  }

  // 6. Fill any still-empty fields (publisher, price) from book_catalog
  const catalogRow = await queryBookCatalog(canonical);
  if (catalogRow) _fillFromCatalogRow(catalogRow);
}

// ── SCRAPE CONJURING ARCHIVE METADATA ──
// Fills author, year, publisher from live CA page
async function scrapeConjuringMetadata(bookId) {
  try {
    const url  = 'https://www.conjuringarchive.com/list/book/' + bookId;
    const resp = await fetch('/api/fetch-proxy?action=fetch&url=' + encodeURIComponent(url));
    const data = await resp.json();
    if (!data.success || !data.html) return;

    const rawText = data.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

    const firstMatch = (pat, text) => {
      const m = text.match(pat);
      return (m && m[1] && m[1].trim()) ? m[1].trim() : '';
    };

    const author    = firstMatch(/Written by ([A-Z][a-zA-Z\s\.\-]+?)(?:\s+Work of|\s+·)/i, rawText)
                   || firstMatch(/Written by ([A-Z][a-zA-Z\s\.\-]+)/i, rawText);
    const year      = firstMatch(/(1[89]\d{2}|200\d|201\d|202\d)/, rawText);
    const publisher = firstMatch(/published by ([A-Z][a-zA-Z0-9\s&\.\,\-\/]+?)(?:\s+Illustrated|\s+Language|\s+\d|\s{2,}|\·|$)/i, rawText);

    const fill = (id, val) => {
      if (!val) return;
      const el = document.getElementById(id);
      if (el && !el.value.trim()) {
        el.value = toTitleCase(val.trim());
        el.classList.add('field-populated');
        setTimeout(() => el.classList.remove('field-populated'), 3000);
      }
    };

    fill('f-author',    author);
    fill('f-year',      year.match(/\d{4}/) ? year.match(/\d{4}/)[0] : '');
    fill('f-publisher', toTitleCasePublisher(publisher));

    const filled = [author, year, publisher].filter(Boolean).length;
    if (filled > 0) {
      const statusEl = document.getElementById('scanDetail');
      if (statusEl) statusEl.textContent = 'Local database: ' + filled + ' field' + (filled !== 1 ? 's' : '') + ' filled.';
    }
  } catch(e) {
    // Silently fail — metadata scrape is non-critical
  }
}

// ── SCRAPE MAGICREF METADATA ──
// Fills year, publisher from live MagicRef page (format: "©YYYY Author\nFormat, N pages")
async function scrapeMagicRefMetadata(pageUrl) {
  try {
    const resp = await fetch('/api/fetch-proxy?action=fetch&url=' + encodeURIComponent(pageUrl));
    const data = await resp.json();
    if (!data.success || !data.html) return;

    const rawText = data.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

    const firstMatch = (pat, text) => {
      const m = text.match(pat);
      return (m && m[1] && m[1].trim()) ? m[1].trim() : '';
    };

    // "©2001 Steve Reynolds" or "©2001 Murphy's Magic"
    const year      = firstMatch(/©\s*(1[89]\d{2}|20\d{2})/, rawText);
    const publisher = firstMatch(/©\s*(?:1[89]\d{2}|20\d{2})\s+([A-Z][^\n\.]+?)(?:\s{2,}|Softcover|Hardcover|$)/i, rawText);

    const fill = (id, val) => {
      if (!val) return;
      const el = document.getElementById(id);
      if (el && !el.value.trim()) {
        el.value = toTitleCase(val.trim());
        el.classList.add('field-populated');
        setTimeout(() => el.classList.remove('field-populated'), 3000);
      }
    };

    fill('f-year',      year);
    fill('f-publisher', toTitleCasePublisher(publisher));

    const filled = [year, publisher].filter(Boolean).length;
    if (filled > 0) {
      const statusEl = document.getElementById('scanDetail');
      if (statusEl) statusEl.textContent = 'Local database: ' + filled + ' field' + (filled !== 1 ? 's' : '') + ' filled.';
    }
  } catch(e) {
    // Silently fail — non-critical
  }
}

// ── DEBOUNCED CHECK ON TITLE INPUT ──
let _conjuringDebounce = null;
function debouncedConjuringCheck(title) {
  clearTimeout(_conjuringDebounce);
  if (!title || title.length < 3) { hideTitleDropdown(); return; }
  _conjuringDebounce = setTimeout(async () => {
    if (!title || title.length < 3) return;
    const priceEntry = lookupPriceDB(title);
    const discEntry  = (typeof MARKET_DB !== 'undefined' && MARKET_DB.disc) ?
      MARKET_DB.disc[normBookTitle(title)] : lookupDiscDB(title);
    if (priceEntry) {
      const aud  = Math.round(priceEntry.msrp * 1.55 * 0.80);
      const note = '<span style="color:var(--tier2);font-size:11px;">Currently in print — retail ~A$' + aud + '</span>';
      const card = document.getElementById('aiInfoCard');
      const ct   = document.getElementById('aiInfoContent');
      if (ct && !ct.innerHTML) { ct.innerHTML = note; if (card) card.style.display = 'block'; }
    } else if (discEntry && !lookupPriceDB(title)) {
      const card = document.getElementById('aiInfoCard');
      const ct   = document.getElementById('aiInfoContent');
      if (ct && !ct.innerHTML) {
        ct.innerHTML = '<span style="color:var(--tier3);font-weight:600;">⚠ Possibly Out of Print</span>';
        if (card) card.style.display = 'block';
      }
    }
    showTitleDropdown(title);
  }, 350);
}

// ── TITLE DROPDOWN ──
function showTitleDropdown(title) {
  const dd = document.getElementById('titleDropdown');
  if (!dd) return;
  const raw = conjuringTopMatches(title, 12);
  // Deduplicate: skip entries whose displayed title is identical to a prior entry
  const seenTitles = new Set();
  const matches = raw.filter(m => {
    const label = (m.entry.t || m.key).trim().toLowerCase();
    if (seenTitles.has(label)) return false;
    seenTitles.add(label);
    return true;
  }).slice(0, 7);
  if (matches.length === 0) { hideTitleDropdown(); return; }
  dd.innerHTML = '';
  matches.forEach((match) => {
    const item = document.createElement('div');
    item.style.cssText = 'padding:7px 10px;cursor:pointer;font-size:13px;font-family:inherit;color:var(--ink);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;';

    const thumb = document.createElement('img');
    thumb.src = match.url || '';
    thumb.alt = '';
    thumb.style.cssText = 'width:30px;height:40px;object-fit:cover;border-radius:3px;flex-shrink:0;background:var(--paper-warm);border:0.5px solid var(--border);';
    thumb.onerror = function() { this.style.display = 'none'; };

    const textWrap = document.createElement('div');
    textWrap.style.cssText = 'flex:1;min-width:0;';

    const titleSpan = document.createElement('div');
    titleSpan.textContent = match.entry.t || toTitleCase(match.key);
    titleSpan.style.cssText = 'font-size:13px;font-weight:500;color:var(--ink);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.35;';
    textWrap.appendChild(titleSpan);

    // Show author from DB entry if available, else fall back to price DB
    const authorFromDB = dbAuthor(match.entry);
    const priceEntry   = (typeof MAGILIB_PRICE_DB !== 'undefined') ? MAGILIB_PRICE_DB[match.key] : null;
    const authorText   = authorFromDB || (priceEntry && priceEntry.author) || '';
    if (authorText) {
      const authorSpan = document.createElement('div');
      authorSpan.textContent = authorText;
      authorSpan.style.cssText = 'font-size:11px;color:var(--ink-light);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      textWrap.appendChild(authorSpan);
    }

    item.appendChild(thumb);
    item.appendChild(textWrap);

    item.addEventListener('mousedown', async (e) => {
      e.preventDefault();
      hideTitleDropdown();
      const titleEl = document.getElementById('f-title');
      if (titleEl) {
        titleEl.value = match.entry.t || toTitleCase(match.key);
        titleEl.classList.add('field-populated');
        setTimeout(() => titleEl.classList.remove('field-populated'), 3000);
      }
      await applyConjuringMatch(match, 'manual');
    });
    item.addEventListener('mouseenter', () => { item.style.background = 'var(--accent-light)'; });
    item.addEventListener('mouseleave', () => { item.style.background = ''; });
    dd.appendChild(item);
  });
  if (dd.lastChild) dd.lastChild.style.borderBottom = 'none';
  dd.style.display = 'block';
}

function hideTitleDropdown() {
  const dd = document.getElementById('titleDropdown');
  if (dd) dd.style.display = 'none';
}

function handleTitleKey(e) {
  const dd = document.getElementById('titleDropdown');
  if (!dd || dd.style.display === 'none') return;
  const items    = Array.from(dd.querySelectorAll('div'));
  const activeIdx = items.findIndex(el => el.dataset.active);
  if (e.key === 'Escape') { hideTitleDropdown(); return; }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const next = activeIdx < 0 ? 0 : Math.min(activeIdx + 1, items.length - 1);
    items.forEach(el => { delete el.dataset.active; el.style.background = ''; });
    items[next].dataset.active = '1'; items[next].style.background = 'var(--accent-light)';
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    const prev = activeIdx <= 0 ? items.length - 1 : activeIdx - 1;
    items.forEach(el => { delete el.dataset.active; el.style.background = ''; });
    items[prev].dataset.active = '1'; items[prev].style.background = 'var(--accent-light)';
  }
  if (e.key === 'Enter' && activeIdx >= 0) {
    e.preventDefault();
    items[activeIdx].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  }
}

// ── TITLE FIELD BLUR ──
// After user leaves title field: if no conjuring match auto-filled the author,
// try book_catalog directly. Toast if nothing found.
async function onTitleBlur() {
  applyTitleCase('f-title');
  const titleEl = document.getElementById('f-title');
  const title = titleEl ? titleEl.value.trim() : '';
  if (title.length < 3) return;
  const authorEl = document.getElementById('f-author');
  if (authorEl && authorEl.value.trim()) return; // already filled by conjuring match
  const row = await queryBookCatalog(title);
  if (row) {
    _fillFromCatalogRow(row);
  } else {
    if (typeof showToast === 'function') showToast('Not found in local database. Add information manually.');
  }
}
