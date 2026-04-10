/**
 * sync-claude-to-notion.js
 *
 * Replaces (not appends) the MagiLib project hub Notion page with a
 * structured, current snapshot of CLAUDE.md + SESSION_HANDOFF.md.
 *
 * Run automatically by: handoff.js
 * Run manually:         node scripts/sync-claude-to-notion.js
 */

import { Client } from '@notionhq/client';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env') });

const { NOTION_TOKEN, NOTION_PAGE_ID } = process.env;

if (!NOTION_TOKEN || !NOTION_PAGE_ID) {
  console.error('❌  Missing NOTION_TOKEN or NOTION_PAGE_ID in scripts/.env');
  process.exit(1);
}

const notion = new Client({ auth: NOTION_TOKEN });

// ─── Parsers ──────────────────────────────────────────────────────────────────

function extractSection(content, headingPattern) {
  const re = new RegExp(`## ${headingPattern}[^\n]*\\n([\\s\\S]*?)(?=\\n---\\n|\\n## |$)`, 'i');
  const m = content.match(re);
  return m ? m[1].trim() : '';
}

function parseClaude() {
  const raw = fs.readFileSync(path.resolve(__dirname, '../CLAUDE.md'), 'utf-8');
  const headerMatch = raw.match(/^# (.+)/m);
  return {
    header: headerMatch ? headerMatch[1] : 'MagiLib',
    status:       extractSection(raw, 'Current Project Status'),
    lastSession:  extractSection(raw, 'Last Session'),
    priorities:   extractSection(raw, 'Next Session Priorities'),
    priceDb:      extractSection(raw, 'price_db Status'),
    architecture: extractSection(raw, 'Pricing Engine Architecture'),
    completed:    extractSection(raw, 'Completed Tasks'),
  };
}

function parseHandoff() {
  const p = path.resolve(__dirname, '../SESSION_HANDOFF.md');
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, 'utf-8');
  const headerMatch = raw.match(/# SESSION HANDOFF[^\n]*/);
  return {
    header:    headerMatch ? headerMatch[0] : 'Last Session',
    summary:   extractSection(raw, 'Session Summary'),
    issues:    extractSection(raw, 'Known Issues.*') ||
               extractSection(raw, 'Still Pending.*') ||
               extractSection(raw, 'Unresolved.*'),
    priorities: extractSection(raw, 'Next Session Priorities.*'),
  };
}

// ─── Block builders ───────────────────────────────────────────────────────────

const rich  = t  => [{ type: 'text', text: { content: String(t || '').slice(0, 2000) } }];
const h1    = t  => ({ object: 'block', type: 'heading_1',          heading_1:          { rich_text: rich(t) } });
const h2    = t  => ({ object: 'block', type: 'heading_2',          heading_2:          { rich_text: rich(t) } });
const h3    = t  => ({ object: 'block', type: 'heading_3',          heading_3:          { rich_text: rich(t) } });
const para  = t  => ({ object: 'block', type: 'paragraph',          paragraph:          { rich_text: rich(t) } });
const blt   = t  => ({ object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: rich(t) } });
const divider   = () => ({ object: 'block', type: 'divider', divider: {} });

/** Convert a markdown text block into Notion blocks. */
function textToBlocks(text) {
  if (!text) return [];
  return text.split('\n').filter(l => l.trim()).flatMap(line => {
    // Heading 3: ### ...
    const h3m = line.match(/^### (.+)/);
    if (h3m) return [h3(h3m[1])];
    // List item (- [ ] or - [x] or - or * or N.)
    const listm = line.match(/^[-*]\s+(?:\[.\]\s+)?(.+)/) || line.match(/^\d+\.\s+\*\*(.+?)\*\*(.*)/) || line.match(/^\d+\.\s+(.+)/);
    if (listm) return [blt(line.replace(/^[-*\d.]+\s+(\[.\]\s+)?/, '').replace(/\*\*/g, ''))];
    // Plain line (strip markdown bold)
    return [para(line.replace(/\*\*/g, ''))];
  });
}

// ─── Clear page ───────────────────────────────────────────────────────────────

async function clearPage(pageId) {
  let cursor;
  let count = 0;
  do {
    const res = await notion.blocks.children.list({ block_id: pageId, start_cursor: cursor, page_size: 100 });
    for (const block of res.results) {
      await notion.blocks.delete({ block_id: block.id });
      count++;
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return count;
}

// ─── Build structured report ──────────────────────────────────────────────────

function buildBlocks(claude, handoff) {
  const now = new Date().toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney', dateStyle: 'medium', timeStyle: 'short',
  });
  const blocks = [];

  // ── Header ──
  blocks.push(h1('MagiLib — Project Hub'));
  blocks.push(para(`Last synced: ${now}`));
  blocks.push(divider());

  // ── Current Status ──
  if (claude.status) {
    blocks.push(h2('Current Status'));
    blocks.push(...textToBlocks(claude.status));
    blocks.push(divider());
  }

  // ── Next Session Priorities ──
  // Use handoff's version if available (more specific); fall back to CLAUDE.md
  const priorities = (handoff?.priorities) || claude.priorities;
  if (priorities) {
    blocks.push(h2('Next Session Priorities'));
    blocks.push(...textToBlocks(priorities));
    blocks.push(divider());
  }

  // ── Last Session ──
  // Use SESSION_HANDOFF.md if available; fall back to CLAUDE.md Last Session section
  const sessionHeader = handoff?.header || 'Last Session';
  const sessionSummary = handoff?.summary || claude.lastSession;
  if (sessionSummary) {
    blocks.push(h2(sessionHeader));
    blocks.push(...textToBlocks(sessionSummary));
  }
  if (handoff?.issues) {
    blocks.push(h3('Known Issues'));
    blocks.push(...textToBlocks(handoff.issues));
  }
  if (sessionSummary || handoff?.issues) blocks.push(divider());

  // ── Price DB Status ──
  if (claude.priceDb) {
    blocks.push(h2('Price DB Status'));
    blocks.push(...textToBlocks(claude.priceDb));
    blocks.push(divider());
  }

  // ── Pricing Engine Architecture ──
  if (claude.architecture) {
    blocks.push(h2('Pricing Engine Architecture'));
    blocks.push(...textToBlocks(claude.architecture));
    blocks.push(divider());
  }

  // ── Completed Work ──
  if (claude.completed) {
    blocks.push(h2('Completed Work'));
    blocks.push(...textToBlocks(claude.completed));
  }

  return blocks;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🔄 Syncing project report to Notion...');

  const claude  = parseClaude();
  const handoff = parseHandoff();
  const blocks  = buildBlocks(claude, handoff);

  // Replace existing content
  process.stdout.write('   Clearing existing page... ');
  const deleted = await clearPage(NOTION_PAGE_ID);
  console.log(`${deleted} blocks removed`);

  // Write in batches of 100 (Notion API limit)
  process.stdout.write('   Writing new report... ');
  for (let i = 0; i < blocks.length; i += 100) {
    await notion.blocks.children.append({ block_id: NOTION_PAGE_ID, children: blocks.slice(i, i + 100) });
  }
  console.log(`${blocks.length} blocks written`);
}

main().catch(err => {
  console.error('❌ Notion sync error:', err.message);
  process.exit(1);
});
