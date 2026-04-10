// One-time importer for manually scraped eBay sold listing prices.
// Groups by norm_key, takes the median price, upserts into price_db as ebay_sold.
// Run: node import-ebay-csv.js
import 'dotenv/config';
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SUPABASE_URL = 'https://acuehbwbwsbbxuqcmnrp.supabase.co';
const supa = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function normKey(title, author) {
  const clean = s => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  return clean(title) + ':' + clean(author);
}

function parseLine(line) {
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

function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = parseLine(lines[0]);
  return lines.slice(1).map(l => {
    const cols = parseLine(l);
    const row = {};
    headers.forEach((h, i) => row[h] = (cols[i] || '').trim());
    return row;
  });
}

async function main() {
  const csvPath = path.join(__dirname, 'eBay_Magic_Price_Guide_AUD.csv');
  const rows = parseCSV(fs.readFileSync(csvPath, 'utf8'));

  const groups = new Map();
  let skipped = 0;

  for (const row of rows) {
    const title     = (row['Title']     || '').trim();
    const rawAuthor = (row['Author']    || '').trim();
    const condition = (row['Condition'] || '').trim();
    const author    = rawAuthor === 'Nan' ? '' : rawAuthor;

    // Price can be in "Price (AUD)" or accidentally in "Condition" column
    let price = parseFloat(row['Price (AUD)'] || 0);
    if (price < 1 && /^\$[\d.,]+$/.test(condition)) {
      price = parseFloat(condition.replace(/[$,]/g, ''));
    }

    if (!title || price < 1 || price > 10000) { skipped++; continue; }

    const key = normKey(title, author);
    if (!groups.has(key)) groups.set(key, { prices: [], conditions: [] });
    groups.get(key).prices.push(price);
    groups.get(key).conditions.push(condition);
  }

  console.log(`Parsed ${groups.size} unique books (${skipped} rows skipped).`);

  let upserted = 0, errors = 0;
  for (const [norm_key, { prices, conditions }] of groups) {
    const sorted   = prices.slice().sort((a, b) => a - b);
    const median   = sorted[Math.floor(sorted.length / 2)];
    const newCount = conditions.filter(c => c === 'Brand New').length;
    const in_print = newCount > conditions.length / 2 ? 'likely_inprint' : 'likely_oop';

    const { error } = await supa.from('price_db').upsert({
      norm_key,
      source:   'ebay_sold',
      price:    median,
      currency: 'AUD',
      url:      null,
      raw:      prices.join('|'),
      in_print,
    }, { onConflict: 'norm_key,source' });

    if (error) { console.error(`  ERR ${norm_key}: ${error.message}`); errors++; }
    else {
      upserted++;
      if (upserted % 100 === 0) console.log(`  ${upserted} upserted…`);
    }
  }

  console.log(`\nDone. ${upserted} upserted, ${errors} errors.`);
}

main().catch(e => { console.error(e); process.exit(1); });
