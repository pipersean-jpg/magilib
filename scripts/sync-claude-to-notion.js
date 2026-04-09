import { Client } from '@notionhq/client';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env') });

const { NOTION_TOKEN, NOTION_PAGE_ID, NOTION_ROADMAP_DB_ID } = process.env;

if (!NOTION_TOKEN || !NOTION_PAGE_ID) {
  console.error("❌ Missing setup in .env file.");
  process.exit(1);
}

const notion = new Client({ auth: NOTION_TOKEN });

function parseClaude() {
  const claudePath = path.resolve(__dirname, '../CLAUDE.md');
  const raw = fs.readFileSync(claudePath, 'utf-8');
  const sections = [];
  let current = null;
  for (const line of raw.split('\n')) {
    const hMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (hMatch) {
      if (current) sections.push(current);
      current = { heading: hMatch[2].trim(), level: hMatch[1].length, lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) sections.push(current);
  const completedSection = sections.find(s => s.heading.toLowerCase().includes('completed task'));
  const completedTasks = completedSection ? completedSection.lines.map(l => l.match(/^\*\s+(.+)/)).filter(Boolean).map(m => m[1].trim()) : [];
  return { sections, completedTasks };
}

function rich(text) {
  return [{ type: 'text', text: { content: text || '' } }];
}

function sectionToBlocks(section) {
  const blocks = [];
  const headingType = ['heading_1', 'heading_2', 'heading_3'][section.level - 1] || 'heading_3';
  blocks.push({ object: 'block', type: headingType, [headingType]: { rich_text: rich(section.heading) } });
  for (const line of section.lines) {
    if (!line.trim()) continue;
    const bullet = line.match(/^\*\s+(.+)/);
    if (bullet) {
      blocks.push({ object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: rich(bullet[1]) } });
    } else {
      blocks.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: rich(line) } });
    }
  }
  return blocks;
}

async function main() {
  console.log('🔄 Syncing to Notion...');
  const { sections, completedTasks } = parseClaude();

  // 1. Update the Text Page (chunk into batches of 100 — Notion API limit)
  const newBlocks = sections.flatMap(sectionToBlocks);
  for (let i = 0; i < newBlocks.length; i += 100) {
    await notion.blocks.children.append({ block_id: NOTION_PAGE_ID, children: newBlocks.slice(i, i + 100) });
  }
  console.log('✅ Page updated.');

  // 2. Update the Build Tracker Database
  if (NOTION_ROADMAP_DB_ID) {
    for (const task of completedTasks) {
      await notion.pages.create({
        parent: { database_id: NOTION_ROADMAP_DB_ID },
        properties: {
          'Item': { title: [{ text: { content: task } }] }, // Matches your "Item" column
          'Status': { status: { name: 'Done' } }            // Matches your "Status" column
        }
      });
    }
    console.log(`✅ ${completedTasks.length} tasks added to Build Tracker.`);
  }
}

main().catch(err => console.error('❌ Error:', err.message));