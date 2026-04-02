// ── LIVE PRICE SCRAPING ──
async function scrapeQTTEPrices(title, author) {
  const results = [];
  const normT = s => s.toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();

  // Strategy 1: search by author if we have one (QTTE author pages are well-indexed)
  // Strategy 2: fall back to title-only search
  const searchUrls = [];
  const titleQ = encodeURIComponent(title.replace(/['"]/g,''));
  // Primary: search by title (most direct)
  searchUrls.push('https://quickerthantheeye.com/products/find/title/' + titleQ);
  if (author) {
    const authorQ = encodeURIComponent(author.replace(/['"]/g,''));
    searchUrls.push('https://quickerthantheeye.com/products/find/author/' + authorQ);
  }

  for (const searchUrl of searchUrls) {
    try {
      const resp = await fetch('/api/fetch-proxy?action=fetch&url=' + encodeURIComponent(searchUrl));
      const data = await resp.json();
      if (!data.success) continue;
      const html = data.html;

      // Strategy A: check if this IS already a product page (h1 title match)
      const h1M = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      const pageTitle = h1M ? h1M[1].trim() : '';
      if (normT(pageTitle) && normT(title).includes(normT(pageTitle).slice(0,6)) ||
          normT(pageTitle).includes(normT(title).slice(0,6))) {
        const priceM = html.match(/\$([\d,]+(?:\.\d{2})?)/);
        if (priceM) {
          const priceUSD = parseFloat(priceM[1].replace(',',''));
          if (priceUSD >= 5 && priceUSD <= 5000) {
            results.push({ name: 'Quicker Than The Eye', priceUSD, title: pageTitle, url: searchUrl, status: 'listed' });
          }
        }
      }

      // Strategy B: parse product links from a search results page
      if (results.length === 0) {
        const linkBlocks = [...html.matchAll(/href="((?:https?:\/\/(?:www\.)?quickerthantheeye\.com)?\/p\/[^"]+)"[^>]*>([\s\S]{0,800}?)<\/a>/gi)];
        for (const [, href, block] of linkBlocks.slice(0, 30)) {
          const blockText = block.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
          const blockTitle = blockText.slice(0, 120).trim();
          if (!blockTitle) continue;
          const similarity = normT(blockTitle).includes(normT(title).slice(0,6)) ||
                             normT(title).includes(normT(blockTitle).slice(0,6));
          const priceM = blockText.match(/\$([\d,]+(?:\.\d{2})?)/);
          if (priceM && similarity) {
            const priceUSD = parseFloat(priceM[1].replace(',',''));
            if (priceUSD >= 5 && priceUSD <= 5000) {
              const url = href.startsWith('http') ? href : 'https://quickerthantheeye.com' + href;
              results.push({ name: 'Quicker Than The Eye', priceUSD, title: blockTitle.slice(0,80), url, status: 'listed' });
              break;
            }
          }
        }
      }

      // Strategy C: raw text fallback — find any $price near the title in stripped text
      if (results.length === 0) {
        const raw = html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
        const titleIdx = raw.toLowerCase().indexOf(normT(title).slice(0,10));
        if (titleIdx > -1) {
          const snippet = raw.slice(Math.max(0,titleIdx-50), titleIdx+200);
          const priceM = snippet.match(/\$([\d,]+(?:\.\d{2})?)/);
          if (priceM) {
            const priceUSD = parseFloat(priceM[1].replace(',',''));
            if (priceUSD >= 5 && priceUSD <= 5000) {
              results.push({ name: 'Quicker Than The Eye', priceUSD, title, url: searchUrl, status: 'listed' });
            }
          }
        }
      }

      if (results.length > 0) break; // found something, no need to try next URL
    } catch(e) { /* silently fail */ }
  }
  return results;
}

async function scrapeCollectingMagicBooks(title, author, edition) {
  const results = [];
  const GBP_TO_AUD = 2.02;
  const normT = s => s.toLowerCase().replace(/[^a-z0-9]/g,' ').replace(/\s+/g,' ').trim();

  const slugify = s => s.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-').trim();

  const titleSlug  = slugify(title);
  const authorSlug = author ? slugify(author) : '';
  const editionSlug = edition ? slugify(edition) : '';
  const BASE = 'https://www.collectingmagicbooks.com/product-page/';

  // Build all candidate URLs and fetch ALL in parallel
  const candidates = [
    BASE + titleSlug,
    authorSlug ? BASE + titleSlug + '-' + authorSlug : null,
    authorSlug ? BASE + authorSlug + '-' + titleSlug : null,
    editionSlug ? BASE + titleSlug + '-' + editionSlug + '-' + authorSlug : null,
    editionSlug ? BASE + titleSlug + '-' + editionSlug : null,
    // Common edition variants — always try these regardless of edition field
    authorSlug ? BASE + titleSlug + '-first-edition-' + authorSlug : null,
    authorSlug ? BASE + titleSlug + '-second-edition-' + authorSlug : null,
    authorSlug ? BASE + titleSlug + '-limited-edition-' + authorSlug : null,
    authorSlug ? BASE + titleSlug + '-signed-edition-' + authorSlug : null,
    authorSlug ? BASE + titleSlug + '-hardcover-' + authorSlug : null,
  ].filter(Boolean);

  const parsePrice = (html) => {
    const gbpM = html.match(/£\s*([\d,]+(?:\.\d{2})?)/);
    if (gbpM) {
      const gbp = parseFloat(gbpM[1].replace(',',''));
      if (gbp >= 3 && gbp <= 2000) return { priceLocal: gbp, currency: 'GBP', priceAUD: Math.round(gbp * GBP_TO_AUD * 100) / 100 };
    }
    const usdM = html.match(/\$\s*([\d,]+(?:\.\d{2})?)/);
    if (usdM) {
      const usd = parseFloat(usdM[1].replace(',',''));
      if (usd >= 5 && usd <= 2000) return { priceLocal: usd, currency: 'USD', priceAUD: Math.round(usd * 1.55 * 100) / 100 };
    }
    return null;
  };

  // Fetch all candidates in parallel
  const fetchOne = async (url) => {
    try {
      const resp = await fetch('/api/fetch-proxy?action=fetch&url=' + encodeURIComponent(url));
      const data = await resp.json();
      if (!data.success) return null;
      const priceData = parsePrice(data.html);
      if (!priceData) return null;
      // Confirm this page is actually about the right title
      const h1M = data.html.match(/<h1[^>]*>([^<]+)<\/h1>/i) || data.html.match(/^#\s+(.+)$/m);
      const pageTitle = h1M ? h1M[1].replace(/<[^>]+>/g,'').trim() : '';
      if (pageTitle && normT(pageTitle).length > 3 && !normT(pageTitle).includes(normT(title).slice(0,6))) return null;
      const condM = data.html.match(/Condition:\s*([^\n<]+)/i);
      const yearM  = data.html.match(/Year:\s*(\d{4})/i);
      return {
        name: 'Collecting Magic Books',
        priceGBP: priceData.currency === 'GBP' ? priceData.priceLocal : null,
        priceUSD: priceData.currency === 'USD' ? priceData.priceLocal : null,
        priceAUD: priceData.priceAUD,
        title: pageTitle || title,
        detail: [condM ? condM[1].trim() : '', yearM ? yearM[1] : ''].filter(Boolean).join(' · '),
        url, status: 'listed', currency: priceData.currency
      };
    } catch(e) { return null; }
  };

  // Run all fetches in parallel, collect successful ones, deduplicate by price
  const responses = await Promise.all(candidates.map(fetchOne));
  const seen = new Set();
  for (const r of responses) {
    if (!r) continue;
    const key = r.priceAUD + '|' + r.url;
    if (!seen.has(key)) { seen.add(key); results.push(r); }
  }

  // If multiple editions found and user specified one, prefer the match
  if (results.length > 1 && editionSlug) {
    const match = results.find(r => normT(r.title).includes(editionSlug.replace(/-/g,' ')));
    if (match) return [match];
  }

  return results;
}

// ── LOCAL DATABASE LOOKUPS ──
function normForDB(s) {
  if (!s) return '';
  return s.toLowerCase()
    .replace(/\s+by\s+.*/i, '')       // strip "by Author"
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim()
    .replace(/^(the|a|an)\s+/, '');
}

function lookupPriceDB(title) {
  if (typeof PRICE_DB === 'undefined' || !title) return null;
  const key = normForDB(title);
  if (PRICE_DB[key]) return PRICE_DB[key];
  // Try without volume/edition suffix (e.g. "card college volume 1" -> "card college")
  const shortKey = key.replace(/\s+(volume|vol|book|part|no|number)\s+\d+.*$/, '').trim();
  if (shortKey !== key && PRICE_DB[shortKey]) return PRICE_DB[shortKey];
  return null;
}

function lookupDiscontinued(title) {
  if (typeof DISCONTINUED_DB === 'undefined' || !title) return false;
  const key = normForDB(title);
  if (DISCONTINUED_DB[key]) return true;
  const shortKey = key.replace(/\s+(volume|vol|book|part|no|number)\s+\d+.*$/, '').trim();
  return shortKey !== key && !!DISCONTINUED_DB[shortKey];
}

// ── LOCAL BOOK DATABASE LOOKUPS ──

function normBookTitle(s) {
  if (!s) return '';
  return s.toLowerCase()
    .replace(/\s+by\s+.*$/i, '')   // strip " by Author"
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// Look up a title in the master price list. Returns {title, msrp, image} or null.
function lookupPriceDB(title) {
  if (typeof MAGILIB_PRICE_DB === 'undefined' || !title) return null;
  const key = normBookTitle(title);
  if (!key) return null;
  // Exact match first
  if (MAGILIB_PRICE_DB[key]) return MAGILIB_PRICE_DB[key];
  // Partial match — key starts with query or vice versa (handles "Volume 1" suffixes)
  for (const [k, v] of Object.entries(MAGILIB_PRICE_DB)) {
    if (k.startsWith(key) || key.startsWith(k)) return v;
  }
  return null;
}

// Look up a title in the discontinued list. Returns the original description string or null.
function lookupDiscDB(title) {
  if (typeof MAGILIB_DISC_DB === 'undefined' || !title) return null;
  const key = normBookTitle(title);
  if (!key) return null;
  if (MAGILIB_DISC_DB[key]) return MAGILIB_DISC_DB[key];
  for (const [k, v] of Object.entries(MAGILIB_DISC_DB)) {
    if (k.startsWith(key) || key.startsWith(k)) return v;
  }
  return null;
}

// ── PRICING CONSTANTS ──
const RETAIL_DISCOUNT = 0.80;   // -20% from retail for in-stock titles
const USD_RATES = { AUD: 1.55, GBP: 0.79, EUR: 0.92, USD: 1.0 };

function usdToLocal(usd, currency) {
  return Math.round(usd * (USD_RATES[currency] || 1.55) * 100) / 100;
}

// Check retail availability via Claude (Vanishing Inc + Penguin Magic both block scraping with 403)
async function checkRetailAvailability(title, author) {
  try {
    const data = await callClaude([{role:'user', content:
      `Is "${title}"${author ? ' by ' + author : ''} currently available as a NEW retail product from Vanishing Inc (vanishingincmagic.com) or Penguin Magic (penguinmagic.com)?

Reply ONLY with valid JSON, no markdown:
{"in_stock": true|false, "retailer": "Vanishing Inc"|"Penguin Magic"|null, "price_usd": number|null, "url": "string"|null}

Only return in_stock:true if you are confident this is a currently published, in-print title available new from these retailers. If uncertain, return in_stock:false.`
    }], 200);
    const json = JSON.parse(data.content[0].text.replace(/```json|```/g,'').trim());
    if (json.in_stock && json.price_usd && json.price_usd >= 5) {
      return { name: json.retailer || 'Retail', priceUSD: json.price_usd, url: json.url || '', inStock: true, source: 'retail' };
    }
  } catch(e) {}
  return null;
}

function showPriceUnavailable(reason) {
  const sym = currSym();
  const currency = S.settings.currency || 'AUD';
  document.getElementById('priceDisplay').innerHTML = '<span style="font-size:13px;color:var(--ink-faint);">Unable to calculate</span>';
  document.getElementById('priceRange').textContent = reason || 'Fewer than 3 verified sources found. Check eBay sold listings manually.';
  document.getElementById('f-price').value = '';
  const sb = document.getElementById('sourceBreakdown');
  if (sb) sb.style.display = 'none';
}

async function fetchPrice(){
  const title  = document.getElementById('f-title').value.trim();
  const author = document.getElementById('f-author').value.trim();
  if (!title) { showToast('Please enter a title first', 'error'); return; }

  const btn = document.getElementById('fetchPriceBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Searching…';
  const currency = S.settings.currency || 'AUD';
  const sym = currSym();

  // ── Conversion rates ──
  const USD_AUD = 1.55;
  const GBP_AUD = 2.02;
  const toAUD = (price, cur) => Math.round(price * (cur === 'GBP' ? GBP_AUD : USD_AUD));

  // ── Normalise title for DB lookup ──
  const normKey = s => {
    let k = s.replace(/[^\x00-\x7F]/g, ' ')
             .replace(/\([^)]*\)/g, ' ')
             .replace(/\[[^\]]*\]/g, ' ')
             .replace(/\s+-\s+.*$/, '')
             .replace(/\s+by\s+.*$/i, '')
             .replace(/\s*(hardcover|softcover|paperback|hc\b|pb\b|magic trick|magic book|signed\b|oop\b)\s*/gi, ' ')
             .toLowerCase()
             .replace(/[^a-z0-9\s]/g, ' ')
             .replace(/\s+/g, ' ').trim()
             .replace(/^(the|a|an)\s+/, '');
    return k;
  };

  const key = normKey(title);
  const allSources = [];

  // Helper: check if MARKET_DB is loaded
  if (typeof MARKET_DB === 'undefined') {
    showToast('Market database not loaded', 'error');
    btn.disabled = false; btn.textContent = 'Fetch Price Estimate';
    return;
  }

  // ── TIER 1: Murphy's Magic in-print list ──
  const priceEntry = lookupPriceDB(title);
  if (priceEntry) {
    const retailAUD = toAUD(priceEntry.msrp, 'USD');
    const marketAUD = Math.round(retailAUD * 0.80);
    allSources.push({
      name: "Murphy's Magic (In Print)",
      price: marketAUD,
      detail: 'Retail USD $' + priceEntry.msrp + ' → ' + sym + retailAUD + ' × 0.80',
      url: 'https://www.murphysmagicsupplies.com',
      urlLabel: 'Murphy\'s Magic',
      tier: 1, tag: 'listed', isRetail: true
    });
    // Offer product image
    if (priceEntry.image && !S.coverUrl) {
      const _sid = 'retailCover_' + Date.now();
      const _card = document.getElementById('aiInfoCard');
      const _ct   = document.getElementById('aiInfoContent');
      if (_ct) {
        const _wrap = document.createElement('div');
        _wrap.id = _sid; _wrap.style.marginTop = '8px';
        const _lbl = document.createElement('div');
        _lbl.style.cssText = 'font-size:10px;font-weight:500;color:var(--tier2);margin-bottom:5px;';
        _lbl.textContent = 'Retail product image — tap to use';
        const _img = document.createElement('img');
        _img.src = priceEntry.image;
        _img.style.cssText = 'max-width:80px;border-radius:6px;cursor:pointer;border:2px solid transparent;transition:border-color 0.15s;display:block;';
        _img.title = 'Tap to use as cover';
        _img.addEventListener('click', () => acceptConjuringSuggestion(priceEntry.image, _sid));
        _wrap.appendChild(_lbl); _wrap.appendChild(_img); _ct.appendChild(_wrap);
        if (_card) _card.style.display = 'block';
      }
    }
  }

  // ── TIER 2: QTTE ──
  const qtteEntry = MARKET_DB.qtte[key];
  if (qtteEntry) {
    allSources.push({
      name: 'Quicker Than The Eye',
      price: toAUD(qtteEntry.price, 'USD'),
      detail: 'Listed USD $' + qtteEntry.price + ' → ' + sym + toAUD(qtteEntry.price, 'USD'),
      url: qtteEntry.url,
      urlLabel: 'View listing',
      tier: 1, tag: 'specialist'
    });
  }

  // ── TIER 3: CMB (may have multiple editions) ──
  const cmbEntries = MARKET_DB.cmb[key] || [];
  for (const e of cmbEntries) {
    allSources.push({
      name: 'Collecting Magic Books',
      price: toAUD(e.price, 'GBP'),
      detail: e.raw + ' — GBP £' + e.price + ' → ' + sym + toAUD(e.price, 'GBP'),
      url: e.url,
      urlLabel: 'View listing',
      tier: 1, tag: 'specialist'
    });
  }

  // ── TIER 4: eBay sold ──
  const ebayEntries = MARKET_DB.ebay[key] || [];
  if (ebayEntries.length > 0) {
    const prices = ebayEntries.map(e => e.price);
    const avgUSD = prices.reduce((a,b) => a+b, 0) / prices.length;
    const avgAUD = toAUD(avgUSD, 'USD');
    const ebayUrl = 'https://www.ebay.com.au/sch/i.html?_nkw=' + encodeURIComponent(title + ' ' + author) + '&LH_Sold=1&LH_Complete=1';
    allSources.push({
      name: 'eBay Sold',
      price: avgAUD,
      detail: prices.length + ' sold listing' + (prices.length > 1 ? 's' : '') +
              ' — avg USD $' + avgUSD.toFixed(0) + ' → ' + sym + avgAUD +
              (prices.length > 1 ? ' (range $' + Math.min(...prices).toFixed(0) + '–$' + Math.max(...prices).toFixed(0) + ')' : ''),
      url: ebayUrl,
      urlLabel: 'eBay sold listings',
      tier: 2, tag: 'sold'
    });
  }

  // ── TIER 5: Magic Collectibles ──
  const mcEntry = MARKET_DB.mc[key];
  if (mcEntry) {
    allSources.push({
      name: 'Magic Collectibles',
      price: toAUD(mcEntry.price, 'USD'),
      detail: 'Listed USD $' + mcEntry.price + ' → ' + sym + toAUD(mcEntry.price, 'USD'),
      url: mcEntry.url,
      urlLabel: 'View listing',
      tier: 1, tag: 'specialist'
    });
  }

  // ── No results: check discontinued list ──
  if (allSources.length === 0) {
    const discEntry = MARKET_DB.disc[key];
    if (discEntry) {
      document.getElementById('priceDisplay').innerHTML =
        '<span style="font-size:12px;color:var(--tier3);">⚠ Possibly Out of Print</span>';
      document.getElementById('priceRange').textContent =
        'Found on discontinued list. Not currently listed on any dealer site.';
      document.getElementById('f-price').value = '';
      showAiInfoCard(
        '<span style="color:var(--tier3);font-weight:600;">⚠ Possibly Out of Print</span><br>' +
        '<span style="font-size:11px;color:var(--ink-light);">Found on discontinued list. ' +
        'Not currently listed on any dealer site.<br>Unable to calculate market value — check eBay sold listings manually.</span>'
      );
      const sb = document.getElementById('sourceBreakdown');
      if (sb) sb.style.display = 'none';
    } else {
      document.getElementById('priceDisplay').innerHTML =
        '<span style="font-size:12px;color:var(--ink-faint);">Unable to calculate</span>';
      document.getElementById('priceRange').textContent =
        'Not found in any price database. Use search buttons below.';
      document.getElementById('f-price').value = '';
      const sb = document.getElementById('sourceBreakdown');
      if (sb) sb.style.display = 'none';
    }
    btn.disabled = false; btn.textContent = 'Fetch Price Estimate';
    return;
  }

  // ── Calculate recommended price ──
  // If in-print (Murphy's): use retail formula
  // Otherwise: median of all found prices
  let recommended;
  const prices = allSources.map(s => s.price).sort((a,b) => a-b);

  if (allSources.some(s => s.isRetail)) {
    recommended = allSources.find(s => s.isRetail).price;
  } else {
    recommended = prices[Math.floor(prices.length / 2)];
  }

  const low  = prices[0];
  const high = prices[prices.length - 1];
  const confidence = allSources.length >= 3 ? 'high' : allSources.length === 2 ? 'medium' : 'low';

  // ── Display ──
  document.getElementById('priceDisplay').innerHTML =
    sym + recommended + ' <span>' + currency + '</span>';
  document.getElementById('priceRange').textContent =
    'Range: ' + sym + low + ' – ' + sym + high +
    ' · ' + confidence + ' confidence · ' + allSources.length + ' source' + (allSources.length !== 1 ? 's' : '');
  document.getElementById('f-price').value = recommended.toFixed(2);

  renderSources(allSources.map(s => ({
    name: s.name, price: s.price, detail: s.detail,
    url: s.url, urlLabel: s.urlLabel, tier: s.tier, tag: s.tag
  })));

  // Trigger intelligence card
  fetchBookIntelligence(title, author);

  btn.disabled = false; btn.textContent = 'Fetch Price Estimate';
}


// ── RENDER CATALOG: sold awareness ──
// Patch renderCatalog to handle sold status


// ── CONJURING ARCHIVE FUZZY MATCH + METADATA ──