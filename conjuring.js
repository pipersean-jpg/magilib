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
// Returns the raw DB entry (object) or null
function lookupConjuringEntry(title) {
  if (typeof CONJURING_DB === 'undefined' || !title) return null;
  const key = normTitle(title);
  if (CONJURING_DB[key]) return { key, entry: CONJURING_DB[key] };
  // Strip subtitle after colon/dash (e.g. "Expert at the Card Table: Revised")
  const shortKey = key.split(/[—:]/)[0].trim();
  if (shortKey !== key && CONJURING_DB[shortKey]) return { key: shortKey, entry: CONJURING_DB[shortKey] };
  return null;
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

// ── TOP N FUZZY MATCHES (for title dropdown) ──
function conjuringTopMatches(title, n) {
  if (typeof CONJURING_DB === 'undefined' || !title) return [];
  const norm = s => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^(the|a|an)\s+/i, '').trim();
  const q = norm(title);
  const results = [];
  for (const key of Object.keys(CONJURING_DB)) {
    const score = conjuringFuzzyScore(q, norm(key));
    if (score >= 0.45) {
      results.push({ key, entry: CONJURING_DB[key], score, url: dbCoverUrl(CONJURING_DB[key]) });
    }
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, n);
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
  const matches = conjuringTopMatches(title, 7);
  if (matches.length === 0) { hideTitleDropdown(); return; }
  dd.innerHTML = '';
  matches.forEach((match) => {
    const item = document.createElement('div');
    item.style.cssText = 'padding:7px 10px;cursor:pointer;font-size:13px;font-family:inherit;color:var(--ink);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;';

    const thumb = document.createElement('img');
    thumb.src = match.url || '';
    thumb.alt = '';
    thumb.style.cssText = 'width:30px;height:40px;object-fit:cover;border-radius:3px;flex-shrink:0;background:var(--paper-warm);border:0.5px solid var(--border);';
    thumb.onerror = function() { this.style.visibility = 'hidden'; };

    const textWrap = document.createElement('div');
    textWrap.style.cssText = 'flex:1;min-width:0;';

    const titleSpan = document.createElement('div');
    titleSpan.textContent = match.entry.t || toTitleCase(match.key);
    titleSpan.style.cssText = 'font-size:13px;font-weight:500;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
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
