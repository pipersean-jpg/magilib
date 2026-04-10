/**
 * scrape-prices.js
 * Quarterly price scraper for MagiLib price_db.
 *
 * Sources:
 *   1. eBay (sold listings)       — Production Finding API
 *   2. Murphy's Magic             — HTML scrape (MSRP)
 *   3. Quicker Than The Eye       — HTML scrape (secondary market)
 *   4. Penguin Magic              — HTML scrape (retail + in-print signal)
 *
 * Upserts into Supabase price_db on (norm_key, source).
 * Skips any (norm_key, source) pair updated within the last 90 days,
 * EXCEPT eBay which is always refreshed (prices change constantly).
 *
 * Run: node scrape-prices.js [--dry-run] [--source=ebay|murphys|qtte|penguin]
 * Cron: "0 9 1 * /3 *" - 9am on the 1st of Jan/Apr/Jul/Oct (every 3 months)
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// ── Config ────────────────────────────────────────────────────────────────────
const SUPABASE_URL        = 'https://acuehbwbwsbbxuqcmnrp.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; // service_role key — bypasses RLS
const EBAY_APP_ID         = process.env.EBAY_APP_ID || 'SeanPipe-ArcanaBo-PRD-46c30daa1-b07e8d0c';
const MURPHYS_CSV_URL     = process.env.MURPHYS_CSV_URL || 'https://developer.murphysmagic.com/CSV/CSV_files/MurphysProductList-New_v20.csv?233ec264071945d39a2a584b7d346117';

const DRY_RUN     = process.argv.includes('--dry-run');
const SOURCE_ONLY = (process.argv.find(a => a.startsWith('--source=')) || '').replace('--source=', '') || null;
const STALE_DAYS  = 90;
const DELAY_MS    = 1500; // ms between requests per source
const EBAY_MAX_RESULTS = 10; // sold listings per book

// ── Supabase ──────────────────────────────────────────────────────────────────
const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── Utilities ─────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

function normKey(title, author) {
  const clean = s => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  return clean(title) + ':' + clean(author);
}

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

// ── Fetch all unique title+author combos from books ───────────────────────────
async function fetchBooks() {
  log('Fetching all books from Supabase...');
  const { data, error } = await supa
    .from('books')
    .select('title, author')
    .not('title', 'is', null);

  if (error) throw new Error('Supabase fetch failed: ' + error.message);

  // Deduplicate by norm_key
  const seen = new Set();
  const books = [];
  for (const b of data) {
    const key = normKey(b.title, b.author);
    if (!seen.has(key)) {
      seen.add(key);
      books.push({ title: b.title, author: b.author || '', norm_key: key });
    }
  }
  log(`Found ${books.length} unique title/author combos.`);
  return books;
}

// ── Fetch existing price_db entries (to determine what's stale) ───────────────
async function fetchExistingKeys() {
  log('Fetching existing price_db entries...');
  const cutoff = new Date(Date.now() - STALE_DAYS * 86400_000).toISOString();
  const { data, error } = await supa
    .from('price_db')
    .select('norm_key, source, updated_at')
    .gte('updated_at', cutoff);

  if (error) throw new Error('price_db fetch failed: ' + error.message);

  // Build set of "norm_key:source" strings that are still fresh
  const fresh = new Set(data.map(r => `${r.norm_key}::${r.source}`));
  log(`Found ${fresh.size} fresh price_db entries (< ${STALE_DAYS} days old).`);
  return fresh;
}

// ── Upsert a result into price_db ─────────────────────────────────────────────
async function upsert(row) {
  if (DRY_RUN) { log(`  [DRY RUN] Would upsert: ${row.norm_key} | ${row.source} | ${row.currency}${row.price}`); return; }
  const { error } = await supa.from('price_db').upsert({
    norm_key:   row.norm_key,
    source:     row.source,
    price:      row.price,
    currency:   row.currency,
    url:        row.url || null,
    raw:        row.raw || null,
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  }, { onConflict: 'norm_key,source', ignoreDuplicates: false });

  if (error) log(`  UPSERT ERROR: ${error.message}`);
}

// ── Source 1: eBay Finding API (sold listings) ────────────────────────────────
async function scrapeEbay(book) {
  const query = [book.title, book.author].filter(Boolean).join(' ');
  const url = new URL('https://svcs.ebay.com/services/search/FindingService/v1');
  url.searchParams.set('OPERATION-NAME', 'findCompletedItems');
  url.searchParams.set('SERVICE-VERSION', '1.0.0');
  url.searchParams.set('SECURITY-APPNAME', EBAY_APP_ID);
  url.searchParams.set('RESPONSE-DATA-FORMAT', 'JSON');
  url.searchParams.set('keywords', query);
  url.searchParams.set('categoryId', '267'); // Books & Magazines (broad)
  url.searchParams.set('itemFilter(0).name', 'SoldItemsOnly');
  url.searchParams.set('itemFilter(0).value', 'true');
  url.searchParams.set('itemFilter(1).name', 'ListingType');
  url.searchParams.set('itemFilter(1).value', 'AuctionWithBIN,FixedPrice');
  url.searchParams.set('sortOrder', 'EndTimeSoonest');
  url.searchParams.set('paginationInput.entriesPerPage', String(EBAY_MAX_RESULTS));

  try {
    const resp = await fetch(url.toString(), {
      headers: { 'Accept': 'application/json' }
    });
    const json = await resp.json();
    const items = json?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item || [];
    const results = [];

    for (const item of items) {
      const priceRaw = item?.sellingStatus?.[0]?.currentPrice?.[0];
      const price = parseFloat(priceRaw?.__value__ || 0);
      const currency = priceRaw?.['@currencyId'] || 'USD';
      const itemUrl = item?.viewItemURL?.[0] || null;
      const title = item?.title?.[0] || '';

      if (price < 1 || price > 10000) continue;

      results.push({ price, currency, url: itemUrl, raw: title });
    }

    if (!results.length) return;

    // Store median price as single row, raw = pipe-separated prices
    const prices = results.map(r => r.price).sort((a, b) => a - b);
    const median = prices[Math.floor(prices.length / 2)];
    const currency = results[0].currency;

    await upsert({
      norm_key: book.norm_key,
      source:   'ebay_sold',
      price:    median,
      currency,
      url:      results[0].url,
      raw:      prices.join('|'),
    });
    log(`  eBay: ${book.norm_key} → ${currency}${median.toFixed(2)} (${prices.length} sold)`);
  } catch (e) {
    log(`  eBay ERROR for "${book.title}": ${e.message}`);
  }
}

// ── Source 2: Murphy's Magic (Daily Products CSV) ────────────────────────────
// Fetches the live Murphy's Developer CSV — updated daily, ~10k+ products.
// Columns used: Title, MSRP, Artist/Magician, Product Key, Image URL
let _murphysMap = null;

async function buildMurphysMap() {
  if (_murphysMap) return _murphysMap;
  log('  Fetching Murphy\'s Daily Products CSV...');

  const resp = await fetch(MURPHYS_CSV_URL, {
    headers: { 'User-Agent': 'MagiLib/1.0 price-scraper' }
  });
  if (!resp.ok) throw new Error(`Murphy's CSV fetch failed: ${resp.status}`);
  const text = await resp.text();

  const clean = s => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

  // Parse CSV — first row is headers
  const lines = text.split('\n');
  const headers = parseCSVRow(lines[0]);
  const idxTitle    = headers.indexOf('Title');
  const idxMsrp     = headers.indexOf('MSRP');
  const idxArtist   = headers.indexOf('Artist/Magician');
  const idxKey      = headers.indexOf('Product Key');
  const idxImage    = headers.indexOf('Image URL');

  const idxType   = headers.indexOf('Product Type');

  _murphysMap = new Map();
  let skippedNonBook = 0;
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = parseCSVRow(lines[i]);
    const type   = cols[idxType]   || '';
    if (type !== 'Book') { skippedNonBook++; continue; } // books only

    const title  = cols[idxTitle]  || '';
    const msrp   = parseFloat(cols[idxMsrp] || 0);
    const artist = cols[idxArtist] || '';
    const key    = cols[idxKey]    || '';
    if (!title || msrp < 1) continue;

    const titleClean = clean(title);
    const url = key
      ? `https://www.murphysmagicsupplies.com/products/${key}`
      : 'https://www.murphysmagicsupplies.com';

    _murphysMap.set(titleClean, { price: msrp, url, artist: clean(artist) });
  }

  log(`  Murphy's map built: ${_murphysMap.size} books (${skippedNonBook} non-book products skipped).`);
  return _murphysMap;
}

// Minimal CSV row parser — handles quoted fields with commas
function parseCSVRow(line) {
  const cols = [];
  let cur = '', inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQuote = !inQuote; continue; }
    if (c === ',' && !inQuote) { cols.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  cols.push(cur.trim());
  return cols;
}

async function scrapeMurphys(book) {
  const map = await buildMurphysMap();
  const clean = s => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  const titleClean = clean(book.title);

  // Exact match on cleaned title
  let match = map.get(titleClean);

  // Prefix fallback (handles subtitle variations)
  if (!match && titleClean.length >= 10) {
    for (const [k, v] of map) {
      if (k.startsWith(titleClean.slice(0, 10)) || titleClean.startsWith(k.slice(0, 10))) {
        match = v;
        break;
      }
    }
  }

  if (!match) return;

  await upsert({
    norm_key: book.norm_key,
    source:   'murphys_msrp',
    price:    match.price,
    currency: 'USD',
    url:      match.url,
    raw:      null,
  });
  log(`  Murphy's: ${book.norm_key} → USD${match.price.toFixed(2)}`);
}

// ── Source 3: Quicker Than The Eye ───────────────────────────────────────────
// HTML structure: <div class="product-price">$200.00</div> inside <a href="/p/...">
// Search URL: /products/find/title/{title} returns listing page with multiple results.
// Take the lowest price (best condition comparable), store secondary market USD price.
async function scrapeQTTE(book) {
  const titleQ = encodeURIComponent(book.title.replace(/['"]/g, ''));
  const searchUrl = `https://quickerthantheeye.com/products/find/title/${titleQ}`;

  try {
    const resp = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36',
        'Accept': 'text/html',
      }
    });
    const html = await resp.text();

    // Extract all product listings: href + product-price div within each <li>
    const listingRe = /<li>\s*<a href="(\/p\/[^"]+)"[\s\S]*?<div class="product-price">\$([\d,]+(?:\.\d{2})?)<\/div>/gi;
    const matches = [...html.matchAll(listingRe)];

    if (!matches.length) return;

    // Take lowest price (most accessible copy)
    const prices = matches.map(m => ({
      price: parseFloat(m[2].replace(',', '')),
      url: 'https://quickerthantheeye.com' + m[1],
    })).filter(m => m.price >= 1).sort((a, b) => a.price - b.price);

    if (!prices.length) return;
    const best = prices[0];

    await upsert({
      norm_key: book.norm_key,
      source:   'qtte_secondary',
      price:    best.price,
      currency: 'USD',
      url:      best.url,
      raw:      prices.map(p => p.price).join('|'),
    });
    log(`  QTTE: ${book.norm_key} → USD${best.price.toFixed(2)} (${prices.length} listings)`);
  } catch (e) {
    log(`  QTTE ERROR for "${book.title}": ${e.message}`);
  }
}

// CollectingMagicBooks.com removed — site is fully JS-rendered (Wix),
// prices are not available in static HTML fetches.

// ── Source 4: Penguin Magic ───────────────────────────────────────────────────
// Static HTML search results. Returns title, USD price, and explicit stock status.
// "In stock" = confirmed in-print signal even if absent from Murphy's.
// raw field stores: "in_stock" or "out_of_stock" for use by in-print detection.
async function scrapePenguin(book) {
  const query = encodeURIComponent(book.title.replace(/['"]/g, ''));
  const searchUrl = `https://www.penguinmagic.com/s/${query}`;
  const normT = s => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

  try {
    const resp = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36',
        'Accept': 'text/html',
      }
    });
    const html = await resp.text();

    // Split on search_title class — each block = one product result
    const parts = html.split(/(?=class="search_title")/);
    const bookTitle = normT(book.title);
    let best = null;

    for (const part of parts.slice(1)) {
      const linkM  = part.match(/href="(\/p\/[^"]+)"/);
      const titleM = part.match(/class="search_title"[^>]*>([^<]+)<\/a>/);
      const priceM = part.match(/\$([\d.]+)/);
      const stockM = part.match(/<b>(In stock|Out of stock)\.?<\/b>/i);

      if (!titleM || !priceM || !stockM) continue;

      const resultTitle = normT(titleM[1]);
      // Must be a close title match — first 8 chars overlap
      const isMatch = resultTitle.includes(bookTitle.slice(0, 8)) ||
                      bookTitle.includes(resultTitle.slice(0, 8));
      if (!isMatch) continue;

      const price = parseFloat(priceM[1]);
      const inStock = stockM[1].toLowerCase() === 'in stock';

      // Prefer in-stock results; otherwise take first match
      if (!best || (inStock && !best.inStock)) {
        best = {
          price,
          inStock,
          url: 'https://www.penguinmagic.com' + (linkM?.[1] || ''),
          raw: inStock ? 'in_stock' : 'out_of_stock',
        };
      }
      if (best.inStock) break; // in-stock found, stop scanning
    }

    if (!best) return;

    await upsert({
      norm_key: book.norm_key,
      source:   'penguin_retail',
      price:    best.price,
      currency: 'USD',
      url:      best.url,
      raw:      best.raw, // "in_stock" or "out_of_stock"
    });
    log(`  Penguin: ${book.norm_key} → USD${best.price.toFixed(2)} (${best.raw})`);
  } catch (e) {
    log(`  Penguin ERROR for "${book.title}": ${e.message}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!SUPABASE_SERVICE_KEY) {
    console.error('ERROR: SUPABASE_SERVICE_KEY not set in .env');
    process.exit(1);
  }

  log(DRY_RUN ? '=== DRY RUN MODE ===' : '=== LIVE MODE ===');
  if (SOURCE_ONLY) log(`Source filter: ${SOURCE_ONLY}`);

  const books    = await fetchBooks();
  const freshSet = await fetchExistingKeys();

  let total = 0;
  let skipped = 0;

  // Murphy's is bulk: seed ALL books from the CSV directly (not limited to your 921 Supabase books)
  // This builds a universal MSRP reference for any title any user might add.
  if (!SOURCE_ONLY || SOURCE_ONLY === 'murphys') {
    log('\n── Starting source: murphys ──');
    const map = await buildMurphysMap();
    for (const [titleClean, entry] of map) {
      // Build norm_key from title + artist (author)
      const nk = titleClean + ':' + (entry.artist || '');
      const freshKey = `${nk}::murphys_msrp`;
      if (freshSet.has(freshKey)) { skipped++; continue; }
      if (!DRY_RUN) {
        await upsert({ norm_key: nk, source: 'murphys_msrp', price: entry.price, currency: 'USD', url: entry.url, raw: null });
      } else {
        log(`  [DRY RUN] Would upsert: ${nk} | murphys_msrp | USD${entry.price}`);
      }
      log(`  Murphy's: ${nk} → USD${entry.price.toFixed(2)}`);
      total++;
    }
  }

  const sources = [
    { name: 'ebay',    fn: scrapeEbay,    alwaysRefresh: true  },
    { name: 'qtte',    fn: scrapeQTTE,    alwaysRefresh: false },
    { name: 'penguin', fn: scrapePenguin, alwaysRefresh: false },
  ].filter(s => !SOURCE_ONLY || s.name === SOURCE_ONLY);

  const sourceKeyMap = { ebay: 'ebay_sold', qtte: 'qtte_secondary', penguin: 'penguin_retail' };

  for (const source of sources) {
    log(`\n── Starting source: ${source.name} ──`);
    for (let i = 0; i < books.length; i++) {
      const book = books[i];
      const freshKey = `${book.norm_key}::${sourceKeyMap[source.name]}`;

      if (!source.alwaysRefresh && freshSet.has(freshKey)) {
        skipped++;
        continue;
      }

      if (i > 0 && i % 100 === 0) log(`  Progress: ${i}/${books.length} (${skipped} skipped)`);

      await source.fn(book);
      total++;
      await sleep(DELAY_MS);
    }
  }

  log(`\n=== Done. ${total} requests made, ${skipped} skipped (fresh). ===`);
}

main().catch(e => { console.error(e); process.exit(1); });
