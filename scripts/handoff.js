import fs from 'fs';
import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootPath = path.resolve(__dirname, '../');
const claudePath = path.join(rootPath, 'CLAUDE.md');
const syncScriptPath = path.join(__dirname, 'sync-claude-to-notion.js');
const startFilePath = path.join(rootPath, 'GEMINI_START.txt');

console.log("🚀 Starting Total Handoff...");

// 1. GITHUB: Save and Push code
const timestamp = new Date().toLocaleString();
const gitCommand = `git add . && git commit -m "Auto-backup: ${timestamp}" && git push`;

exec(gitCommand, (gitErr) => {
    if (gitErr) {
        console.warn("⚠️ GitHub Update skipped (likely no changes to save).");
    } else {
        console.log("✅ GitHub Code Backup Complete.");
    }

    // 2. NOTION: Update the Hub
    exec(`node ${syncScriptPath}`, (notionErr) => {
        if (notionErr) { 
            console.error(`❌ Notion Failed: ${notionErr.message}`); 
            return; 
        }
        console.log("✅ Notion Hub Updated.");

        // 3. PREPARE THE BRAIN DUMP (Now with the prompt fix!)
        const claudeContent = fs.readFileSync(claudePath, 'utf8');
        const masterPrompt = `
I am Sean. We are working on MagiLib. 

I am pasting my current project state (CLAUDE.md) below so you have full context immediately. 
Please read the 'Next Actions' section and let me know when you're ready to start.

--- CLAUDE.MD CONTENT START ---
${claudeContent}
--- CLAUDE.MD CONTENT END ---
`.trim();

        // Save to file for 'newchat' to find tomorrow
        fs.writeFileSync(startFilePath, masterPrompt);

        // Copy to clipboard for immediate use
        const proc = exec('pbcopy');
        proc.stdin.write(masterPrompt);
        proc.stdin.end();

        console.log("--------------------------------------------------");
        console.log("🌌 EVERYTHING IS SYNCED:");
        console.log("1. GitHub: Code Backed Up");
        console.log("2. Notion: Roadmap Updated");
        console.log("3. Clipboard: Prompt Loaded (Cmd+V)");
        console.log("--------------------------------------------------");
    });
});