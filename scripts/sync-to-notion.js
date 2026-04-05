/**
 * sync-to-notion.js
 * Upserts the full MagiLib book collection from Supabase into a Notion database.
 *
 * Setup
 * ─────
 * 1.  cd scripts && npm install
 * 2.  Copy .env.example to .env and fill in the four values.
 * 3.  In Notion, create a full-page database and share it with your integration.
 *     The script auto-creates any missing properties on first run.
 * 4.  node sync-to-notion.js [--dry-run]
 *
 * Upsert key: the "Supabase ID" text property.
 * Books already in Notion are updated; new ones are created.
 */

import 'dotenv/config';
import { Client as NotionClient } from '@notionhq/client';
import { createClient as createSupabase } from '@supabase/supabase-js';

// ── Config ────────────────────────────────────────────────────────────────────
const {
  NOTION_TOKEN,
  NOTION_DATABASE_ID,
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY, // service-role key — bypasses RLS so all user rows are readable
  SUPABASE_USER_ID,    // optional: restrict to one user's books
} = process.env;

const DRY_RUN = process.argv.includes('--dry-run');

if (!NOTION_TOKEN || !NOTION_DATABASE_ID || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing required env vars. See .env.example.');
  process.exit(1);
}

const notion = new NotionClient({ auth: NOTION_TOKEN });
const supa = createSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse the "In Print: Yes/No" trailer that MagiLib encodes in the notes field. */
function parseInPrint(notes = '') {
  const m = notes.match(/\nIn Print: (Yes|No)\s*$/i);
  if (!m) return { cleanNotes: notes.trim(), inPrint: null };
  return {
    cleanNotes: notes.slice(0, notes.length - m[0].length).trim(),
    inPrint: m[1],
  };
}

function rich(text) {
  if (!text) return [];
  return [{ type: 'text', text: { content: String(text).slice(0, 2000) } }];
}
function selectProp(value) {
  return value ? { select: { name: String(value) } } : { select: null };
}
function numberProp(value) {
  const n = parseFloat(value);
  return { number: isNaN(n) ? null : n };
}
function dateProp(value) {
  return value ? { date: { start: String(value) } } : { date: null };
}
function urlProp(value) {
  return { url: value || null };
}

/** Build the Notion properties object from a Supabase book row. */
function toNotionProps(row) {
  const { cleanNotes, inPrint } = parseInPrint(row.notes || '');

  return {
    // Title is the Notion page title property — name must match your DB exactly
    'Name': {
      title: rich(row.title || '(Untitled)'),
    },
    'Author':        { rich_text: rich(row.author) },
    'Artist/Subject':{ rich_text: rich(row.artist_subject) },
    'Edition':       { rich_text: rich(row.edition) },
    'Year':          { rich_text: rich(row.year) },
    'Publisher':     { rich_text: rich(row.publisher) },
    'ISBN':          { rich_text: rich(row.isbn) },
    'Condition':     selectProp(row.condition),
    'Market Price':  numberProp(row.market_price),
    'Purchase Price':numberProp(row.purchase_price),
    'Notes':         { rich_text: rich(cleanNotes) },
    'Cover URL':     urlProp(row.cover_url),
    'Date Added':    dateProp(row.date_added),
    'Condition Flags':{ rich_text: rich(row.condition_flags) },
    'Status':        selectProp(row.sold_status || 'Active'),
    'Star Rating':   numberProp(row.star_rating),
    'Collector Note':{ rich_text: rich(row.collectors_note) },
    'Location':      { rich_text: rich(row.where_acquired) },
    'Draft':         selectProp(row.draft_status),
    'In Print':      selectProp(inPrint),
    'Supabase ID':   { rich_text: rich(row.id) },
  };
}

// ── Notion DB introspection ───────────────────────────────────────────────────

/** Fetch all existing pages from the Notion DB, keyed by Supabase ID. */
async function fetchExistingPages() {
  const map = new Map(); // supabaseId → notionPageId
  let cursor;
  do {
    const res = await notion.databases.query({
      database_id: NOTION_DATABASE_ID,
      start_cursor: cursor,
      page_size: 100,
      filter_properties: ['Supabase ID'],
    });
    for (const page of res.results) {
      const idProp = page.properties['Supabase ID'];
      const id = idProp?.rich_text?.[0]?.plain_text;
      if (id) map.set(id, page.id);
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return map;
}

// ── Supabase fetch ────────────────────────────────────────────────────────────

async function fetchAllBooks() {
  let query = supa.from('books').select('*').order('created_at', { ascending: true });
  if (SUPABASE_USER_ID) query = query.eq('user_id', SUPABASE_USER_ID);

  const allRows = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await query.range(from, from + PAGE - 1);
    if (error) throw new Error('Supabase error: ' + error.message);
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return allRows;
}

// ── Sync ──────────────────────────────────────────────────────────────────────

async function sync() {
  console.log(`\n📚 MagiLib → Notion sync${DRY_RUN ? ' (DRY RUN)' : ''}`);
  console.log('─'.repeat(44));

  // 1. Fetch source data
  process.stdout.write('Fetching books from Supabase… ');
  const books = await fetchAllBooks();
  console.log(`${books.length} books`);

  // 2. Fetch existing Notion pages
  process.stdout.write('Fetching existing Notion pages… ');
  const existing = await fetchExistingPages();
  console.log(`${existing.size} pages found`);

  let created = 0, updated = 0, skipped = 0, errors = 0;

  for (const row of books) {
    const props = toNotionProps(row);

    try {
      if (existing.has(row.id)) {
        // Update
        if (!DRY_RUN) {
          await notion.pages.update({
            page_id: existing.get(row.id),
            properties: props,
          });
        }
        updated++;
      } else {
        // Create
        if (!DRY_RUN) {
          await notion.pages.create({
            parent: { database_id: NOTION_DATABASE_ID },
            cover: row.cover_url ? { type: 'external', external: { url: row.cover_url } } : undefined,
            properties: props,
          });
        }
        created++;
      }
    } catch (err) {
      errors++;
      console.error(`\n  ✗ "${row.title}" (${row.id}): ${err.message}`);
    }

    // Simple progress indicator
    const total = created + updated + skipped + errors;
    if (total % 10 === 0) process.stdout.write(`\r  Progress: ${total}/${books.length}`);
  }

  console.log(`\n\n✅ Done`);
  console.log(`   Created : ${created}`);
  console.log(`   Updated : ${updated}`);
  console.log(`   Errors  : ${errors}`);
  if (DRY_RUN) console.log('\n  (Dry run — no changes written to Notion)');
}

sync().catch(err => {
  console.error('\n❌ Fatal:', err.message);
  process.exit(1);
});
