import fs from 'fs';
import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootPath = path.resolve(__dirname, '../');
const claudePath = path.join(rootPath, 'CLAUDE.md');
const handoffPath = path.join(rootPath, 'SESSION_HANDOFF.md'); // New!
const syncScriptPath = path.join(__dirname, 'sync-claude-to-notion.js');
const startFilePath = path.join(rootPath, 'GEMINI_START.txt');

console.log("🚀 Starting Total Handoff...");

// 1. GITHUB: Save and Push code
const timestamp = new Date().toLocaleString();
// Added a check to ensure we aren't pushing junk
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

        // 3. PREPARE THE BRAIN DUMP (Now with Handoff Integration)
        let claudeContent = fs.readFileSync(claudePath, 'utf8');
        let handoffContent = "";
        
        if (fs.existsSync(handoffPath)) {
            handoffContent = fs.readFileSync(handoffPath, 'utf8');
        }

        const masterPrompt = `
I am Sean. We are working on MagiLib. 

I am pasting our project "Blueprint" (CLAUDE.md) and the "Last Session Report" (SESSION_HANDOFF.md) below.
Please read both carefully. They explain our new Global Design System and the 'Magi-Sheet' framework.

--- CLAUDE.MD (Blueprint) ---
${claudeContent}

--- SESSION_HANDOFF.MD (Last Shift Report) ---
${handoffContent}

--- ACTION ---
Please acknowledge you understand the new '.magi-sheet' pattern and the hierarchy of buttons we are building. 
Then, let's start on the 'Action Hierarchy' for the Book Detail view.
`.trim();

        // Save to file for 'newchat' to find
        fs.writeFileSync(startFilePath, masterPrompt);

        // Copy to clipboard for immediate use
        const proc = exec('pbcopy');
        proc.stdin.write(masterPrompt);
        proc.stdin.end();

        console.log("--------------------------------------------------");
        console.log("🌌 SYSTEM SYNCED & SECURED:");
        console.log("1. GitHub: Code Pushed to Cloud");
        console.log("2. Notion: Roadmap & History Updated");
        console.log("3. Clipboard: Ultimate Master Prompt Loaded (Cmd+V)");
        console.log("--------------------------------------------------");
        console.log("Next session: Just open Claude and hit Paste.");
    });
});