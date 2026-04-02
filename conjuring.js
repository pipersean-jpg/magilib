let _conjuringDebounce = null;
function debouncedConjuringCheck(title) {
  clearTimeout(_conjuringDebounce);
  if (!title || title.length < 3) { hideTitleDropdown(); return; }
  _conjuringDebounce = setTimeout(async () => {
    if (!title || title.length < 3) return;
    const priceEntry = lookupPriceDB(title);
    const discEntry  = (typeof MARKET_DB !== 'undefined' && MARKET_DB.disc) ? MARKET_DB.disc[normBookTitle(title)] : lookupDiscDB(title);
    if (priceEntry) {
      const aud = Math.round(priceEntry.msrp * 1.55 * 0.80);
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

function conjuringTopMatches(title, n) {
  if (typeof CONJURING_DB === 'undefined' || !title) return [];
  const norm = s => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^(the|a|an)\s+/i, '').trim();
  const q = norm(title);
  const results = [];
  for (const key of Object.keys(CONJURING_DB)) {
    const score = conjuringFuzzyScore(q, norm(key));
    if (score >= 0.45) results.push({ key, url: CONJURING_DB[key], score });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, n);
}

function showTitleDropdown(title) {
  const dd = document.getElementById('titleDropdown');
  if (!dd) return;
  const matches = conjuringTopMatches(title, 7);
  if (matches.length === 0) { hideTitleDropdown(); return; }
  dd.innerHTML = '';
  matches.forEach((match) => {
    const item = document.createElement('div');
    item.style.cssText = 'padding:7px 10px;cursor:pointer;font-size:13px;font-family:inherit;color:var(--ink);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;';

    // Thumbnail
    const thumb = document.createElement('img');
    thumb.src = match.url;
    thumb.alt = '';
    thumb.style.cssText = 'width:30px;height:40px;object-fit:cover;border-radius:3px;flex-shrink:0;background:var(--paper-warm);border:0.5px solid var(--border);';
    thumb.onerror = function() { this.style.visibility='hidden'; };

    // Text block
    const textWrap = document.createElement('div');
    textWrap.style.cssText = 'flex:1;min-width:0;';
    const titleSpan = document.createElement('div');
    titleSpan.textContent = toTitleCase(match.key);
    titleSpan.style.cssText = 'font-size:13px;font-weight:500;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    textWrap.appendChild(titleSpan);

    // Try to show author from price DB if available
    const priceEntry = (typeof MAGILIB_PRICE_DB !== 'undefined') ? MAGILIB_PRICE_DB[match.key] : null;
    if (priceEntry && priceEntry.author) {
      const authorSpan = document.createElement('div');
      authorSpan.textContent = priceEntry.author;
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
        titleEl.value = toTitleCase(match.key);
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
  const items = Array.from(dd.querySelectorAll('div'));
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
    items[activeIdx].dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
  }
}




// Lightweight fuzzy scorer: normalised token overlap + bonus for prefix match
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
  // Bonus: candidate starts with query (handles subtitle truncation)
  const bonus = c.startsWith(q) || q.startsWith(c) ? 0.15 : 0;
  return Math.min(1, score + bonus);
}

// Find best fuzzy match in CONJURING_DB for a given title
function conjuringFuzzyLookup(title) {
  if (typeof CONJURING_DB === 'undefined' || !title) return null;
  const norm = s => s.toLowerCase()
    .replace(/["""'']/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim()
    .replace(/^(the|a|an)\s+/i, '').trim();
  const q = norm(title);
  let best = null, bestScore = 0;
  for (const key of Object.keys(CONJURING_DB)) {
    const score = conjuringFuzzyScore(q, norm(key));
    if (score > bestScore) { bestScore = score; best = { key, url: CONJURING_DB[key], score }; }
  }
  return bestScore >= 0.72 ? best : null;
}

// Extract book ID from a Conjuring Archive cover URL
function conjuringBookId(coverUrl) {
  const m = coverUrl && coverUrl.match(/\/covers\/(\d+)a\./);
  return m ? m[1] : null;
}

// After a fuzzy match: correct the title field, load the cover, then scrape metadata
async function applyConjuringMatch(match, scanSource) {
  // 1. Title correction rules:
  //    - Manual typing ('manual'): NEVER overwrite — user typed what they meant
  //    - Scan ('scan'): only overwrite if title field was empty, or score is perfect (1.0)
  const canonical = toTitleCase(match.key);
  const titleEl = document.getElementById('f-title');
  const currentTitle = titleEl ? titleEl.value.trim() : '';
  const shouldCorrectTitle = scanSource === 'scan' && (!currentTitle || match.score === 1.0);
  if (shouldCorrectTitle && titleEl) {
    titleEl.value = canonical;
    titleEl.classList.add('field-populated');
    setTimeout(() => titleEl.classList.remove('field-populated'), 3000);
  }

  // 2. Load cover
  if (match.url && !S.coverUrl) {
    setCover(match.url);
    S.coverUrl = match.url;
  }

  // 3. Show status
  const statusEl = document.getElementById('scanDetail');
  if (statusEl && scanSource === 'scan') {
    statusEl.textContent = 'Matched in local database — fetching metadata…';
  }

  // 4. Scrape metadata from the detail page
  const bookId = conjuringBookId(match.url);
  if (bookId) {
    await scrapeConjuringMetadata(bookId);
  }
}

// Scrape author, year, publisher from a Conjuring Archive book detail page
async function scrapeConjuringMetadata(bookId) {
  try {
    const url = 'https://www.conjuringarchive.com/list/book/' + bookId;
    const resp = await fetch('/api/fetch-proxy?action=fetch&url=' + encodeURIComponent(url));
    const data = await resp.json();
    if (!data.success || !data.html) return;
    const html = data.html;

    // Parse fields from the detail page HTML
    // CA uses a definition list / table structure with labels
    const extract = (patterns) => {
      for (const pat of patterns) {
        const m = html.match(pat);
        if (m && m[1] && m[1].trim()) return m[1].replace(/<[^>]+>/g, '').trim();
      }
      return '';
    };

    // CA page format: "1987 Written by Harry Lorayne Work of David Regal · 277 pages, published by Star Quality Illustrated..."
    // Always work from stripped text to avoid HTML tag interference
    const rawText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

    const firstMatch = (pat, text) => {
      const m = text.match(pat);
      return (m && m[1] && m[1].trim()) ? m[1].trim() : '';
    };

    // Author: "Written by X Work of" — stop before "Work of", "·", or end
    const author = firstMatch(/Written by ([A-Z][a-zA-Z\s\.\-]+?)(?:\s+Work of|\s+·)/i, rawText)
                || firstMatch(/Written by ([A-Z][a-zA-Z\s\.\-]+)/i, rawText);

    // Year: first publication year in the text (oldest = correct edition year)
    const year = firstMatch(/(1[89]\d{2}|200\d|201\d|202\d)/, rawText);

    // Publisher: "published by X" — stop before "Illustrated", "Language", digits, or end
    const publisher = firstMatch(/published by ([A-Z][a-zA-Z0-9\s&\.\,\-\/]+?)(?:\s+Illustrated|\s+Language|\s+\d|\s{2,}|\·|$)/i, rawText);

    // Fill fields that are currently empty
    const fill = (id, val) => {
      if (!val) return;
      const el = document.getElementById(id);
      if (el && !el.value.trim()) {
        el.value = toTitleCase(val.trim());
        el.classList.add('field-populated');
        setTimeout(() => el.classList.remove('field-populated'), 3000);
      }
    };

    fill('f-author', author);
    fill('f-year', year.match(/\d{4}/) ? year.match(/\d{4}/)[0] : '');
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

// ── CONJURING ARCHIVE COVER ACCEPT ──
function acceptConjuringSuggestion(url, suggId) {
  setCover(url);
  // Replace the suggestion block with a brief confirmation, then fade it out
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

// ── CONJURING ARCHIVE LOCAL LOOKUP ──
// 3,499 titles from conjuringarchive.com — instant local match, no network call needed
function normTitle(t) {
  return t.toLowerCase()
    .replace(/["'“”‘’]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function lookupConjuringCover(title) {
  if (typeof CONJURING_DB === 'undefined') return null;
  const key = normTitle(title);
  // Exact match only — no fuzzy matching to avoid irrelevant suggestions
  if (CONJURING_DB[key]) return CONJURING_DB[key];
  // Only strip subtitle if it makes an exact match (e.g. "Expert at the Card Table: Revised" → "expert at the card table")
  const shortKey = key.split(/[—:]/)[0].trim();
  if (shortKey !== key && CONJURING_DB[shortKey]) return CONJURING_DB[shortKey];
  return null;
}

// Auto-check Conjuring Archive DB after a scan populates the title
function checkConjuringDB(title) {
  if (!title) return;
  const url = lookupConjuringCover(title);
  if (url) {
    // Show it as a suggested cover in the AI info card
    const card = document.getElementById('aiInfoCard');
    const contentEl = document.getElementById('aiInfoContent');
    const existing = contentEl ? contentEl.innerHTML : '';
    const suggId = 'conjuringSugg_' + Date.now();
    const imgHtml = '<div id="' + suggId + '" style="margin-top:8px;">' +
      '<div style="font-size:10px;font-weight:500;color:var(--tier1);margin-bottom:6px;">Cover found in local database — tap to use</div>' +
      '<img src="' + url + '" style="max-width:80px;border-radius:6px;cursor:pointer;border:2px solid transparent;transition:border-color 0.15s;display:block;" ' +
        'onmouseover="this.style.borderColor=\'var(--tier1)\'" onmouseout="this.style.borderColor=\'transparent\'" ' +
        'onclick="acceptConjuringSuggestion(\'' + url + '\',\'' + suggId + '\')" title="Tap to use this cover"/>' +
      '</div>';
    if (contentEl) contentEl.innerHTML = existing + imgHtml;
    if (card) card.style.display = 'block';
  }
}


// ══════════════════════════════════════════════
// MAGILIB v9 — NEW FEATURES JS
// ══════════════════════════════════════════════

// ── WISHLIST / DRAFT FILTER TOGGLES ──
S.showWishlist = false;