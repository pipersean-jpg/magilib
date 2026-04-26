# MagiLib — Session 62

## Current Status
- **Phase:** Phase 1 → Beta Launch — IN PROGRESS
- **Focus:** S62 wired Enrich from Web feature in book detail modal — proxy URL fixed, Murphy's/Vanishing Inc search chips, paste+Fetch UI, enriched description saved to Supabase `books.notes`. Next: beta device walkthroughs (Auth, Add, Library, Edit) + test Enrich flow on device.

---

## Stack
- **Runtime:** Vanilla JS PWA — pure HTML/CSS/JS. No frameworks.
- **Database:** Supabase (PostgreSQL) — `books`, `price_db`, `book_catalog`, `fx_rates` tables
- **Auth:** Supabase Auth + Google OAuth
- **Hosting:** Vercel
- **Search:** Fuse.js 7.0.0 (local bundle, threshold 0.3)
- **SW:** `sw.js` — shell pre-cache + network-first + IndexedDB offline fallback
- **Sole dev:** Sean Piper (Claude Code as builder)

---

## Workflow

### Session Start — `newchat`
0. **Caveman mode active.** Terse caveman style every response. Invoke `Skill("caveman:caveman")` if not already confirmed by startup hook.
1. Read `SESSION_HANDOFF.md` in full. Confirm outcomes + carried issues.
   - **CLAUDE.md and SESSION_HANDOFF.md are authoritative.** Memory files are supplementary. If conflict, trust .md files and silently update memory to match.
2. Run `git status` — report unexpected state.
3. State top 1–2 priorities. Confirm with Sean before writing any code.

### Session End — `handoff`
1. Write `SESSION_HANDOFF.md`: what was built (file-level), unresolved bugs, Model Learnings.
2. Update `CLAUDE.md`: bump session number in header + update Current Status block.
3. Run `handoff` in the terminal — commits, pushes to GitHub, syncs Notion.

### Absolute Rules
- **NEVER ask Sean to edit code manually.** Claude Code makes all file changes.
- **`b._id` only.** Never `b.id`. Supabase queries: `.eq('id', b._id)` or `.in('id', ids)`.
- **All CSS in `assets/css/magilib.css`.** No `<style>` blocks in HTML. No JS-injected CSS except the bulk-edit IIFE block.
- **Pacing:** Max 2–3 steps per response. Clarify before major code blocks.
- **Typecheck after every JS edit:** `node --check <file>.js` — show output before reporting done.
- **Never say "done" without verify output.** Hallucinated success is not success.
- **Atomic commits:** one fix per commit. >50 lines → break into smaller commits.
- **Never touch Supabase RLS, auth flows, or `sw.js`** without explicit approval in that session message.
- **Subagent discipline:** open-ended grep, multi-file exploration, or research → spawn Explore or general-purpose subagent. Never burn main context on file-digging.
- **Consultation:** risky architecture/security/migration → `consult panel` spawns 2–3 parallel subagents. Synthesize before proceeding.
- **Diagnose before implementing:** understand root cause + full solution. Best practice, not quick fix.
- **Technical Learnings** are in `LEARNINGS.md` — read it when debugging or starting new features.
- **Session history** (Sessions 10–46) is in `docs/session-history.md`.

---

## Last Session (Session 62)
- ### detail.js (MODIFIED)
- **Proxy URL fixed (line 67):** `/fetch-proxy?url=` → `/api/fetch-proxy?action=fetch&url=` — `enrichBookFromUrl()` was always hitting a 404.
- **`buildEnrichSectionHTML(b)` added (line 211):** Renders Murphy's Magic + Vanishing Inc search chips (open in new tab as search launchers, not scrapers) + paste input + Fetch button + status div.
- **`buildDetailBodyHTML` updated:** Computes `_coreContent`; injects `enrichSection` between Core Ideas and Topics only when Core Ideas is empty (no notes, no cached description). Removed now-unused `topics` local variable (moved into `buildTopicSectionHTML` was considered but full rebuild chosen instead — see Model Learnings).
- ### catalog.js (MODIFIED)
- **`_doEnrichAndSave(b, url)` added (line 2877):** In-flight guard (`_enrichInFlight` flag), calls `enrichBookFromUrl`, on success writes `notes` to Supabase `books` row (skips write if `b.notes` already set), calls `openModal(S.currentModalIdx)` to rebuild modal. Error + no-description paths re-enable Fetch button with inline status text.

---

## Beta Launch Checklist
- [ ] Auth: sign up (OAuth), sign in, forgot password, change password
- [ ] Add: scan/photo, manual entry, batch queue, save
- [ ] Library: search, filter, sort, view detail
- [ ] Edit: all fields, cover update, dirty-check dialog after PWA reload
- [x] Status: Mark Sold, + Wishlist, Move to Library
- [x] Pricing: Fetch estimate (Add) + stored price display + eBay link (Library)
- [ ] Settings: profile, security, currency, condition presets, stat cards, CSV export/import
- [ ] Onboarding: welcome + feature tour for new users — built, needs walkthrough

---

## Phase 2 Backlog (do not implement before beta)
- **P4:** Migrate inline `onclick` handlers to event delegation — 100+ handlers, memory leak under re-render. Use `event.target.closest()` on stable containers (`#view-catalog`, `#modalOverlay`, `#view-entry`).
- **P5:** Condition flag value modifiers in Settings (Signed +20%, No Dustjacket -30%) alongside `condPct_*`
- **P5:** AI Info Card (`#aiInfoCard`) — 2-sentence book trivia from cover scan → `#aiInfoContent`
- **P3 (pre-beta):** Wishlist page layout — too clunky, needs small layout/UX polish before launch
- **Multi-currency:** all `market_price` stored in USD; display layer × FX rate; migrate `fx_rates` table; rates currently hardcoded in catalog.js + ui.js + pricing.js

---

## Key Architecture

### Critical ID + Data
- `_id: row.id` mapped in `loadCatalog()`. Always `b._id`. Never `b.id`.
- Catalog in `S.books`. No `window.allBooks`. Supabase populates via `loadCatalog()`.
- `market_price` (Supabase column, numeric) ↔ `b.price` (in-memory, string).
- Supabase default query limit = 1000. Paginate large `select()` with `.range()`.
- `.or()` breaks with special chars (apostrophes, parens). Use `.in()` for exact; `.ilike()` for search.

### Z-index Scale
`--z-sheet:1000` · `--z-dialog:2000` · `--z-fullscreen:3000` in `:root`. **Hardcode values in inline styles** — CSS vars fail in inline style attributes on iOS Safari.

### Modals & Overlays
- Book detail: `openModal()` → `#modalOverlay` + `.is-active`. `closeModal()` removes it.
- Edit modal: `#editModalOverlay` at `z-index:2001`. `openEditForm()` adds `body.sheet-open`; all close paths remove it.
- Legacy modals (support, changelog): `.modal-overlay` + `.hidden` — do NOT touch.
- Onboarding wizard (`#wizardOverlay`): full-screen `position:fixed;inset:0;z-index:9998` — uses `.hidden` class toggle. Not a `.modal-overlay`.
- Magi-Sheet: `.magi-sheet-overlay` uses `opacity` + `pointer-events` (not `display:none`). Toggle `.is-active`.
- `magiConfirm({title, message, confirmText, onConfirm})` — always object style. Replaces all `window.confirm()`.

### Cover Images
- Reveal pattern: img starts `style="display:none"` (inline); `onload` → `display:block` + hide placeholder; `onerror` → hide img, show placeholder.
- Never CSS `display:none` on cover img — breaks lazy loading on iOS Safari.
- `nextElementSibling` in `onload`/`onerror` handlers (not `nextSibling` — can return text node).

### book_catalog
- **normKey:** `title:author` format. NOT the title-only variant in pricing.js/ui.js.
- **Cover priority:** Supabase Storage (CA) → MagicRef hotlink → Murphy's → Penguin → Vanishing Inc
- **Murphy's author:** Last-First format → won't match book_catalog (First Last). Migrate forward; don't fix backward.
- **`cover_source`:** `'supabase_storage'` (CA in bucket) or `'magicref'` (hotlink). Query `cover_url` directly.

### Pricing
- **Beta:** `getEstimatedValue()` → `price_db` (2,021 eBay + Murphy's + QTTE + Penguin). Library detail: 2×2 grid (Market Value · Check eBay · Edit Details · Mark Sold). **Do not change before Phase 2.**
- **Condition %:** `getConditionPct(condition)` reads `S.settings.condPct_fine/vg/good/fair`. Keys: `'Fine'` `'Very Good'` `'Good'` `'Fair'`. Defaults 100/80/60/40.
- `fetchPrice()` returns raw market price — condition is display-layer only via `_applyConditionAdjustment()`.

### iOS Patterns
- **Scroll-to-top:** `window.scrollTo(0,0); document.body.scrollTop=0; document.documentElement.scrollTop=0;` — repeat in 50ms setTimeout.
- **Ghost-click:** double-rAF before opening overlays that gain `pointer-events:auto`.

### Service Worker
- Bump `CACHE_NAME` + `?v=sN` on all script tags every session.
- Bypass SW (no `event.respondWith`) for all `url.origin !== self.location.origin`.
- Strip `?v=sN` from pathname on `cache.put()` so version variants share one cache entry.

---

## Technical Rules
- **No Frameworks.** Pure HTML/CSS/JS (PWA).
- **All CSS** in `assets/css/magilib.css`. Flexbox-first, mobile-responsive.
- **Session workflow:** `newchat` to start · `handoff` to end.
- **External links:** `window.open(url, '_blank')`. Never `location.href`.
- **claude-flow** (`ruflo v3.5.80`) at `/Users/seanpiper/.nvm/versions/node/v24.14.0/bin/claude-flow` — available for swarm orchestration.
- **Superpowers skills** at `~/.claude/skills/`: `systematic-debugging`, `verification-before-completion`, `test-driven-development`, `dispatching-parallel-agents`.

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.
