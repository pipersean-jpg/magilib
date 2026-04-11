import fs from 'fs';
import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootPath      = path.resolve(__dirname, '../');
const claudePath    = path.join(rootPath, 'CLAUDE.md');
const handoffPath   = path.join(rootPath, 'SESSION_HANDOFF.md');
const syncScriptPath = path.join(__dirname, 'sync-claude-to-notion.js');
const memoryPath    = path.join(
  process.env.HOME,
  '.claude/projects/-Users-seanpiper/memory/project_magilib.md'
);

// ─── Parsers ──────────────────────────────────────────────────────────────────

function extractSection(content, headingPattern) {
  const re = new RegExp(`## ${headingPattern}[^\n]*\\n([\\s\\S]*?)(?=\\n---\\n|\\n## |$)`, 'i');
  const m = content.match(re);
  return m ? m[1].trim() : '';
}

function parseHandoff(content) {
  const headerMatch = content.match(/# SESSION HANDOFF[^\n]*\(Session (\d+)\)/i);
  const sessionNum  = headerMatch ? headerMatch[1] : '?';

  const summaryRaw = extractSection(content, 'Session Summary');
  // Take the first 2 non-empty lines of the summary for the CLAUDE.md "Last Session" snippet
  const summaryLines = summaryRaw.split('\n').filter(l => l.trim()).slice(0, 2);

  // First line used for git commit message (strip markdown, cap length)
  const commitSummary = summaryLines[0]?.replace(/^[-*\d.]+\s*/, '').replace(/\*\*/g, '').trim().slice(0, 80) || 'session complete';

  const issues = extractSection(content, 'Known Issues.*') ||
                 extractSection(content, 'Still Pending.*') ||
                 extractSection(content, 'Unresolved.*');

  // Build a compact "Last Session" block (3–6 bullet points max)
  const whatWasBuilt = extractSection(content, 'What Was (?:Built|Fixed|Changed).*') ||
                       extractSection(content, 'Session Summary');
  const builtLines = whatWasBuilt.split('\n').filter(l => l.trim()).slice(0, 6);

  const nextPriorities = extractSection(content, 'Next Session Priorities.*');
  const nextLines = nextPriorities.split('\n').filter(l => l.trim()).slice(0, 5);

  return { sessionNum, commitSummary, summaryLines, builtLines, issues, nextLines };
}

// ─── Inject "Last Session" section into CLAUDE.md ────────────────────────────

function updateClaudeMd(claudeContent, sessionNum, builtLines, issues) {
  // Build the replacement section (compact — 6 build items + 1 issue line max)
  const builtBlock = builtLines.map(l => `- ${l.replace(/^[-*\d.]+\s+(\[.\]\s+)?/, '')}`).join('\n');
  const issueBlock = issues
    ? '\n\n**Known issues carried forward:**\n' +
      issues.split('\n').filter(l => l.trim()).slice(0, 3).map(l => `- ${l.replace(/^[-*\d.]+\s+/, '')}`).join('\n')
    : '';
  const newSection = `## Last Session (Session ${sessionNum})\n${builtBlock}${issueBlock}`;

  // Replace existing "Last Session" section if present, otherwise insert before "Next Session Priorities"
  const existingRe = /## Last Session[^\n]*\n[\s\S]*?(?=\n---\n|\n## )/;
  if (existingRe.test(claudeContent)) {
    return claudeContent.replace(existingRe, newSection + '\n');
  }

  // Insert before "## Next Session Priorities"
  return claudeContent.replace(
    /(## Next Session Priorities)/,
    `${newSection}\n\n---\n\n$1`
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log('🚀 Handoff starting...\n');

// Validate SESSION_HANDOFF.md exists
if (!fs.existsSync(handoffPath)) {
  console.error('❌  SESSION_HANDOFF.md not found. Write it before running handoff.');
  process.exit(1);
}
if (!fs.existsSync(claudePath)) {
  console.error('❌  CLAUDE.md not found.');
  process.exit(1);
}

// Warn if SESSION_HANDOFF.md is stale
const hoursSince = (Date.now() - fs.statSync(handoffPath).mtimeMs) / 3_600_000;
if (hoursSince > 6) {
  console.warn(`⚠️  SESSION_HANDOFF.md last modified ${Math.round(hoursSince)}h ago — is it current?\n`);
}

const handoffContent = fs.readFileSync(handoffPath, 'utf-8');
const { sessionNum, commitSummary, builtLines, issues, nextLines } = parseHandoff(handoffContent);

// Step 1 — Inject "Last Session" summary into CLAUDE.md (so it's in auto-loaded context next session)
const claudeContent = fs.readFileSync(claudePath, 'utf-8');
const updatedClaude = updateClaudeMd(claudeContent, sessionNum, builtLines, issues);
if (updatedClaude !== claudeContent) {
  fs.writeFileSync(claudePath, updatedClaude);
  console.log(`✅ CLAUDE.md updated — Last Session (${sessionNum}) injected`);
} else {
  console.log('ℹ️  CLAUDE.md Last Session section already current');
}

// Step 2 — Git: stage all, commit with meaningful message, push
const commitMsg = `Session ${sessionNum} handoff: ${commitSummary}`;
const gitCmd = `cd "${rootPath}" && git add -A && git commit -m "${commitMsg.replace(/"/g, '\\"')}" && git push`;

exec(gitCmd, (gitErr, _stdout, stderr) => {
  if (gitErr) {
    const msg = stderr?.trim() || gitErr.message;
    if (msg.includes('nothing to commit')) {
      console.log('ℹ️  Git: nothing to commit, working tree clean.');
    } else {
      console.warn('⚠️  GitHub push issue:', msg);
    }
  } else {
    console.log(`✅ GitHub pushed — "${commitMsg}"`);
  }

  // Step 3 — Notion sync (replace, not append)
  exec(`node "${syncScriptPath}"`, (notionErr, notionOut) => {
    if (notionErr) {
      console.warn('⚠️  Notion sync failed:', notionErr.message);
    } else {
      if (notionOut) process.stdout.write(notionOut);
      console.log('✅ Notion Hub replaced with current report');
    }

    // Step 4 — Update Claude memory file so newchat context is current
    try {
      const nextBlock = nextLines.length
        ? nextLines.map(l => `- ${l.replace(/^[-*\d.]+\s+(\[.\]\s+)?/, '')}`).join('\n')
        : '- See SESSION_HANDOFF.md';
      const issueBlock = issues
        ? '\n\n**Known issues carried forward:**\n' +
          issues.split('\n').filter(l => l.trim()).slice(0, 3).map(l => `- ${l.replace(/^[-*\d.]+\s+/, '')}`).join('\n')
        : '';
      const builtBlock = builtLines.length
        ? builtLines.map(l => `- ${l.replace(/^[-*\d.]+\s+(\[.\]\s+)?/, '')}`).join('\n')
        : '- See SESSION_HANDOFF.md';

      const memoryContent = `---
name: MagiLib Project State
description: Current state, priorities, and critical rules for the MagiLib PWA project — auto-updated by handoff script
type: project
---

**Project:** MagiLib — magic book collection PWA. Pure HTML/CSS/JS. No frameworks.
**Location:** /Users/seanpiper/magilib/
**Last completed session:** Session ${sessionNum}
**Authoritative files:** \`CLAUDE.md\` (auto-loaded) and \`SESSION_HANDOFF.md\` — always read these first. This memory is a supplement only.

**Session ${sessionNum} — What Was Built:**
${builtBlock}
${issueBlock}

**Next Session (Session ${parseInt(sessionNum) + 1}) Priorities:**
${nextBlock}

**How to apply:** On \`newchat\`, read SESSION_HANDOFF.md immediately. If this memory conflicts with CLAUDE.md or SESSION_HANDOFF.md, trust the .md files.
`;

      if (fs.existsSync(path.dirname(memoryPath))) {
        fs.writeFileSync(memoryPath, memoryContent);
        console.log(`✅ Memory updated — project_magilib.md synced to Session ${sessionNum}`);
      } else {
        console.warn('⚠️  Memory directory not found — skipping memory update');
      }
    } catch (memErr) {
      console.warn('⚠️  Memory update failed:', memErr.message);
    }

    console.log('\n──────────────────────────────────────────────────');
    console.log(`🌌 Session ${sessionNum} handoff complete`);
    console.log(`   CLAUDE.md → Last Session section updated`);
    console.log(`   GitHub    → pushed`);
    console.log(`   Notion    → replaced with current report`);
    console.log(`   Memory    → project_magilib.md synced`);
    console.log('──────────────────────────────────────────────────');
    console.log('Next: open new Claude Code chat and type: newchat');
  });
});
