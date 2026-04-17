/**
 * seed-book-catalog.js
 * Seeds book_catalog from CONJURING_DB (10,495 entries).
 *
 * Phase 1 (default): upserts all metadata + cover URLs.
 *   - MagicRef covers (M: prefix) are stored as hotlinks.
 *   - ConjuringArchive covers (C: prefix) are stored as raw CA URLs for now.
 *
 * Phase 2 (--download-ca-covers): finds rows with raw CA URLs, downloads,
 *   compresses to ≤80KB JPEG, uploads to Supabase Storage, updates cover_url.
 *   Requires: npm install sharp
 *
 * Run:
 *   node seed-book-catalog.js [--dry-run]
 *   node seed-book-catalog.js --download-ca-covers
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import vm from 'vm';
import { createClient } from '@supabase/supabase-js';

const __dirname    = dirname(fileURLToPath(import.meta.url));
const SUPABASE_URL = 'https://acuehbwbwsbbxuqcmnrp.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const WITH_CA      = process.argv.includes('--download-ca-covers');
const DRY_RUN      = process.argv.includes('--dry-run');
const BATCH_SIZE   = 500;
const STORAGE_BUCKET = 'book-covers';
const CA_DELAY_MS  = 200;

if (!SUPABASE_KEY) { console.error('Missing SUPABASE_SERVICE_KEY in .env'); process.exit(1); }

const supa  = createClient(SUPABASE_URL, SUPABASE_KEY);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log   = msg => console.log(`[${new Date().toISOString()}] ${msg}`);

// ── Load CONJURING_DB (not exported — eval via vm IIFE) ───────────────────────
// `const` in vm scripts is block-scoped and doesn't leak to context; use IIFE to return value.
const dbSrc = readFileSync(join(__dirname, '..', 'conjuring_db.js'), 'utf8');
const CONJURING_DB = vm.runInNewContext(`(function(){ ${dbSrc}; return CONJURING_DB; })()`);

// ── Utilities ─────────────────────────────────────────────────────────────────
function htmlDecode(s) {
  if (!s) return s;
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function normKey(title, author) {
  const clean = s => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  return `${clean(title)}:${clean(author)}`;
}

function expandCover(c) {
  if (!c) return null;
  if (c.startsWith('C:')) return `https://www.conjuringarchive.com/images/covers/${c.slice(2)}a.jpg`;
  if (c.startsWith('M:')) return `https://www.magicref.net/images/books/${c.slice(2)}`;
  return c || null;
}

function coverSource(c) {
  if (!c) return null;
  if (c.startsWith('M:')) return 'magicref';
  return null; // C: entries are raw CA URLs until phase 2 rehosts them
}

// ── Phase 1: seed metadata + URLs ────────────────────────────────────────────
async function phaseOne() {
  const entries = Object.values(CONJURING_DB).filter(e => e.t);
  log(`${entries.length} CONJURING_DB entries`);

  const rows = entries.map(e => ({
    norm_key:     normKey(e.t, e.a),
    title:        htmlDecode(e.t),
    author:       htmlDecode(e.a)  || null,
    publisher:    htmlDecode(e.p)  || null,
    year:         e.y  || null,
    cover_url:    expandCover(e.c || ''),
    cover_source: coverSource(e.c || ''),
    in_print:     null,
    updated_at:   new Date().toISOString(),
  }));

  if (DRY_RUN) {
    log('DRY RUN — first 3 rows:');
    rows.slice(0, 3).forEach(r => console.log(JSON.stringify(r, null, 2)));
    return;
  }

  let upserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supa.from('book_catalog').upsert(batch, { onConflict: 'norm_key' });
    if (error) { log(`ERROR batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`); process.exit(1); }
    upserted += batch.length;
    log(`Upserted ${upserted}/${rows.length}`);
  }

  const mrCount = rows.filter(r => r.cover_source === 'magicref').length;
  const caCount = rows.filter(r => r.cover_url?.includes('conjuringarchive')).length;
  const noCount = rows.filter(r => !r.cover_url).length;
  log(`Done. ${upserted} rows upserted.`);
  log(`Covers: ${mrCount} MagicRef hotlinks · ${caCount} raw CA URLs · ${noCount} no cover`);
  if (caCount > 0) log(`Run --download-ca-covers to rehost ${caCount} CA images to Supabase Storage.`);
}

// ── Phase 2: download + rehost CA cover images ────────────────────────────────
async function phaseCaCovers() {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    log('ERROR: sharp not installed. Run: npm install sharp');
    process.exit(1);
  }

  log('Fetching rows with raw CA cover URLs...');
  const rows = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supa
      .from('book_catalog')
      .select('norm_key, cover_url')
      .like('cover_url', '%conjuringarchive.com%')
      .range(from, from + PAGE - 1);
    if (error) { log(`ERROR: ${error.message}`); process.exit(1); }
    if (!data.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  log(`${rows.length} CA covers to download and rehost`);

  // Ensure storage bucket exists
  const { error: bucketErr } = await supa.storage.createBucket(STORAGE_BUCKET, { public: true });
  if (bucketErr && !bucketErr.message.includes('already exists')) {
    log(`ERROR creating bucket: ${bucketErr.message}`); process.exit(1);
  }

  let done = 0, failed = 0;
  for (const row of rows) {
    try {
      const res = await fetch(row.cover_url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const compressed = await sharp(Buffer.from(await res.arrayBuffer()))
        .resize({ width: 300, withoutEnlargement: true })
        .jpeg({ quality: 70 })
        .toBuffer();

      const fileName = `ca/${row.norm_key.replace(/[^a-z0-9]/g, '_')}.jpg`;
      const { error: upErr } = await supa.storage
        .from(STORAGE_BUCKET)
        .upload(fileName, compressed, { contentType: 'image/jpeg', upsert: true });
      if (upErr) throw new Error(upErr.message);

      const { data: { publicUrl } } = supa.storage.from(STORAGE_BUCKET).getPublicUrl(fileName);
      const { error: updateErr } = await supa.from('book_catalog')
        .update({ cover_url: publicUrl, cover_source: 'supabase_storage', updated_at: new Date().toISOString() })
        .eq('norm_key', row.norm_key);
      if (updateErr) throw new Error(updateErr.message);

      done++;
      if (done % 100 === 0) log(`Progress: ${done}/${rows.length} (${failed} failed)`);
      await sleep(CA_DELAY_MS);
    } catch (err) {
      failed++;
      log(`FAIL [${row.norm_key}]: ${err.message}`);
    }
  }
  log(`Phase 2 complete: ${done} uploaded, ${failed} failed`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
log(`seed-book-catalog.js — ${WITH_CA ? 'Phase 2 (CA covers)' : 'Phase 1 (metadata)'}${DRY_RUN ? ' DRY RUN' : ''}`);
if (WITH_CA) {
  await phaseCaCovers();
} else {
  await phaseOne();
}
