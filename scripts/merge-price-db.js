/**
 * merge-price-db.js
 * Copies price data from price_db into book_catalog price columns.
 *
 * Mapping:
 *   source=murphys_msrp   → price_msrp
 *   source=qtte_secondary → price_secondary
 *   source=ebay_sold      → price_ebay (median of all sold rows per norm_key)
 *   source=penguin_retail → price_retail
 *
 * Run: node merge-price-db.js [--dry-run]
 *
 * Note: Murphy's price_db rows use Last-First author in norm_key —
 * match rate will be partial. Expected. Don't fix backward.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://acuehbwbwsbbxuqcmnrp.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const DRY_RUN      = process.argv.includes('--dry-run');

if (!SUPABASE_KEY) { console.error('Missing SUPABASE_SERVICE_KEY in .env'); process.exit(1); }

const supa = createClient(SUPABASE_URL, SUPABASE_KEY);
const log  = msg => console.log(`[${new Date().toISOString()}] ${msg}`);

const SOURCE_COL = {
  murphys_msrp:   'price_msrp',
  qtte_secondary: 'price_secondary',
  ebay_sold:      'price_ebay',
  penguin_retail: 'price_retail',
};

// Fetch all price_db rows (paginated — Supabase default limit is 1000)
async function fetchAllPriceDb() {
  const all = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supa
      .from('price_db')
      .select('norm_key, source, price')
      .range(from, from + PAGE - 1);
    if (error) { log(`ERROR fetching price_db: ${error.message}`); process.exit(1); }
    if (!data.length) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

// Fetch all book_catalog norm_keys (to check match rate)
async function fetchCatalogKeys() {
  const all = new Set();
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supa
      .from('book_catalog')
      .select('norm_key')
      .range(from, from + PAGE - 1);
    if (error) { log(`ERROR fetching book_catalog: ${error.message}`); process.exit(1); }
    if (!data.length) break;
    data.forEach(r => all.add(r.norm_key));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

function median(nums) {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function run() {
  log(`merge-price-db.js${DRY_RUN ? ' DRY RUN' : ''}`);

  log('Fetching price_db...');
  const priceRows = await fetchAllPriceDb();
  log(`${priceRows.length} price_db rows`);

  log('Fetching book_catalog norm_keys...');
  const catalogKeys = await fetchCatalogKeys();
  log(`${catalogKeys.size} book_catalog entries`);

  // Group by source, then by norm_key
  // For ebay_sold: collect all prices per key → take median
  const bySource = {};
  for (const source of Object.keys(SOURCE_COL)) bySource[source] = {};

  for (const row of priceRows) {
    const src = row.source;
    if (!SOURCE_COL[src]) continue;
    const price = parseFloat(row.price);
    if (!price || isNaN(price)) continue;

    if (src === 'ebay_sold') {
      if (!bySource[src][row.norm_key]) bySource[src][row.norm_key] = [];
      bySource[src][row.norm_key].push(price);
    } else {
      // For non-eBay sources: keep highest price if multiple rows
      const existing = bySource[src][row.norm_key];
      if (!existing || price > existing) bySource[src][row.norm_key] = price;
    }
  }

  // Build update map: norm_key → {price_msrp?, price_secondary?, price_ebay?, price_retail?}
  const updates = {};

  for (const [src, col] of Object.entries(SOURCE_COL)) {
    const srcData = bySource[src];
    for (const [key, val] of Object.entries(srcData)) {
      if (!catalogKeys.has(key)) continue;
      if (!updates[key]) updates[key] = {};
      updates[key][col] = src === 'ebay_sold' ? median(val) : val;
    }
  }

  const matchedKeys = Object.keys(updates);
  log(`${matchedKeys.length} book_catalog entries matched`);

  // Log source breakdown
  for (const [src, col] of Object.entries(SOURCE_COL)) {
    const srcData = bySource[src];
    const total   = Object.keys(srcData).length;
    const matched = Object.keys(srcData).filter(k => catalogKeys.has(k)).length;
    log(`  ${src}: ${total} price_db rows → ${matched} matched (${total - matched} unmatched)`);
  }

  if (DRY_RUN) {
    log('DRY RUN — first 3 updates:');
    matchedKeys.slice(0, 3).forEach(k => console.log(JSON.stringify({ norm_key: k, ...updates[k] }, null, 2)));
    return;
  }

  // Update matched rows concurrently (20 at a time)
  const CONCURRENCY = 20;
  let done = 0, failed = 0;
  const now = new Date().toISOString();
  for (let i = 0; i < matchedKeys.length; i += CONCURRENCY) {
    const chunk = matchedKeys.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map(async key => {
      const { error } = await supa.from('book_catalog')
        .update({ ...updates[key], updated_at: now })
        .eq('norm_key', key);
      if (error) { log(`WARN [${key}]: ${error.message}`); failed++; }
      else done++;
    }));
    if ((i + CONCURRENCY) % 200 === 0 || i + CONCURRENCY >= matchedKeys.length) {
      log(`Updated ${done}/${matchedKeys.length} (${failed} failed)`);
    }
  }

  log('Done.');
}

await run();
