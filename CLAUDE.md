# MagiLib Project Status - 2026-04-09

## Current Project Status
- **Phase:** Block 2 (Search & Catalog Functionality) + Global Design System - **IN PROGRESS**
- **Current Focus:** Move mode "Poof" transition logic, Draft visual badge, device verification of Phase 1 + 2 UI changes.

## Completed Tasks ✅
- [x] Header Reordering (Add > Library > Wishlist > Settings)
- [x] Avatar Menu implementation (Display Name, Account Settings)
- [x] Version Popup & Application Branding
- [x] Scroll-to-top fix for the 'Add' page
- [x] Terminal Automation (Magic words: `handoff` and `newchat`)
- [x] Notion Hub Sync Integration
- [x] Implement Fuzzy Search (Fuse.js, threshold 0.3, keys: title/author/publisher/year)
- [x] Global Design System: Created `assets/css/magilib.css` (all styles consolidated)
- [x] Magi-Sheet pattern: `.magi-sheet-overlay` / `.magi-sheet` / `.magi-sheet-handle`
- [x] Book Detail View: Bottom sheet, typography hierarchy, pill badges, button restructure
- [x] Magi-Sheet Typography Utilities: `.ms-title`, `.ms-subtitle`, `.ms-metadata-row`, `.ms-image`
- [x] Z-index scale: `--z-sheet:1000`, `--z-dialog:2000`, `--z-fullscreen:3000` in `:root`
- [x] Action Button Hierarchy: Primary (Edit+eBay), Secondary ghost (Mark Sold + Wishlist), Danger text link (Delete)
- [x] Book detail open fixed (removed EMERGENCY OVERRIDE block in catalog.js)
- [x] Delete Book wired to Supabase (uses `b._id`)
- [x] `toggleSold()` and `toggleWishlistStatus()` implemented + wired to Supabase
- [x] Search UX: 250ms debounce on `#catalogSearch`, Clear (X) button in search bar
- [x] Empty State: "Clear search" button in `.empty-search-container`
- [x] Mobile UX Audit: fluid typography via `clamp()`, overflow-x fix, 48px touch targets, safe-area-inset-bottom
- [x] Library Layout Consolidation: `.catalog-toolbar` + `.filter-bar` + `.insights-bar` (replaced 4-row layout)
- [x] Batch Select Mode: `#selectModeBtn`, `#batchActionsBar`, bulk Mark Sold + Delete via Supabase
- [x] Mobile CSS: `.magi-sheet` gets `padding-bottom: calc(20px + env(safe-area-inset-bottom))` for Home Indicator clearance
- [x] Batch Bar: Vertical stack layout (`flex-direction:column`) with `.danger-separator` above Delete; `max-height:40vh; overflow-y:auto`
- [x] Toolbar: Row 1 = [Search][View Toggle][Refresh]; Row 2 = [✓ Edit][Move][⊿ Filters]
- [x] Batch Dual-Mode: `S.selectMode` → `null/'edit'/'move'`; Edit shows Auto-fill/Price Update/Delete; Move shows Mark Sold/Wishlist/Draft
- [x] Batch ergonomics: Absolute `×` close button (`#batchCloseBtn`) on batch bar wired to `exitSelectMode()`
- [x] Bulk functions: `bulkAutofill()`, `bulkWishlist()`, `bulkDraft()` implemented; `bulkPriceUpdate()` stubbed

## Learnings
- **Search algorithm:** Fuse.js with `threshold: 0.3`. Keys are `['title','author','publisher','year']`. Falls back to `.includes()` if Fuse is not loaded.
- **Data source:** Catalog data lives in `S.books` (state object). There is no `window.allBooks`. Supabase fetch populates `S.books` in `loadCatalog()`.
- **Performance pattern:** Fuse results are stored in a `Set` so the filter pass uses O(1) `.has()` lookups.
- **Environment guard:** Always ignore `node_modules` during file/content searches to prevent terminal overflows.
- **CSS architecture:** ALL styles live in `assets/css/magilib.css`. Do NOT add `<style>` blocks to index.html. Do NOT inject CSS via JS (except the bulk-edit IIFE which is managed by a deploy tool).
- **Magi-Sheet pattern:** `.magi-sheet-overlay` uses `opacity` + `pointer-events` (NOT `display:none`) for animation. `.magi-sheet` slides via `transform: translateY(100%) → translateY(0)`. Toggle by adding/removing `.is-active` on the overlay.
- **Book detail open/close:** `openModal()` adds `.is-active` to `#modalOverlay`. `closeModal()` removes it. Do not use `.hidden`.
- **Legacy modals** (support, changelog, wizard, etc.) still use `.modal-overlay` + `.hidden` — do NOT touch them.
- **Bulk-edit IIFE:** The `_CSS` block and `_css()` function in catalog.js are marked "Injected by deploy tool" — leave them in place, do not move to magilib.css.
- **Button hierarchy (Book Detail):** Primary row = Edit + eBay. Secondary row = Mark Sold + Wishlist (ghost style). Danger = "Delete Book" text link. No Close button.
- **Critical ID bug:** `loadCatalog()` maps Supabase rows to `_id: row.id`. ALWAYS use `b._id`, never `b.id` — `b.id` is undefined and causes silent failures everywhere (Supabase queries, find(), delete, toggles).
- **Z-index scale:** `--z-sheet:1000`, `--z-dialog:2000`, `--z-fullscreen:3000` defined in single `:root` block. Never duplicate `:root` blocks.
- **debounce utility:** `debounce(fn, delay)` defined in catalog.js. `filterCatalog` = `debounce(renderCatalog, 250)`. Direct calls (clearSearch) bypass debounce.
- **Batch state:** `S.selectMode` (`null | 'edit' | 'move'`) + `S.selectedBooks` (Set of `_id` strings). Cards get `data-id="${b._id}"`. Click handler branches on truthy `S.selectMode`.
- **Batch bar visibility:** `#batchActionsBar` uses `.batch-actions-bar` + `.is-visible` toggle (translateY animation from bottom). Bar is a vertical column stack; `#batchActionsStack` innerHTML is injected by `updateBatchBar()` based on mode.
- **Batch close:** `#batchCloseBtn` (absolute top-right of bar) calls `exitSelectMode()` — identical cleanup to toolbar "Exit Edit"/"Exit Move" buttons.
- **Draft exclusion:** `priceSrc` filter (line ~549 in catalog.js) already excludes `b.draft === 'Draft'` from value/avg stats — no separate renderStatsRow change needed.
- **Cover zoom:** `zoomCover(imgSrc)` creates a `.ms-zoom-overlay` appended to `document.body` — NOT a static DOM element. Legacy `openZoom()` / `#zoomOverlay` removed.
- **Insights bar:** `renderStatsRow()` outputs inline compact stats: total books · total value · avg · top publisher — all in `.insights-bar` with `<span>` ids.
- **`magiConfirm` / `closeDialog`:** Custom dialog system on `window`. Used for destructive confirmations (delete, bulk delete). Replace any `window.confirm()` usage.

## Workflow & Communication Rules
- **Pacing:** Maximum 2-3 steps per response.
- **Pre-Flight Check:** Always ask clarifying questions before generating major code blocks.
- **Status Updates:** Every `handoff` must include a "Learnings" section to update the model on Sean's preferences or new project logic.
- **Role Definition:** Gemini (Web) is the **Architect/Planner** and **Prompt Author**. Claude Code (Terminal) is the **Builder/Executor**.
- **Instruction Flow:** Gemini generates all structured prompt blocks; Sean copies them verbatim into Claude Code; Claude Code executes the diffs. This dual-model workflow remains in effect until Sean explicitly instructs Claude Code to operate solo.
- **Prompt Authorship:** Claude Code must assume every incoming prompt was authored by Gemini. Do not second-guess the prompt's structure or reframe the task — execute it faithfully and report results back so Gemini can plan the next step.
- **Solo Mode:** If Sean says to switch to solo mode, Claude Code takes over full planning, prompting, and execution without Gemini involvement. This must be explicitly requested.
- **Verification:** After Claude Code finishes, Sean reports results to Gemini for the next "Architectural" step.

### Absolute Rules

- **NEVER ask Sean to find/replace or edit code manually.** Always provide a fully-formed copy-paste prompt block for Claude Code to execute. Sean should never touch a file directly.

- **`newchat` START-OF-SESSION PROTOCOL:** When `newchat` is invoked, the model MUST:
  1. Read `CLAUDE.md` and summarize current session priorities.
  2. Run `cat /Users/seanpiper/magilib/GEMINI_START.txt | pbcopy` to copy the Gemini prompt to clipboard.
  3. Analyze overall project progress and current architectural direction.
  4. Critique Gemini's prompting design and architectural input so far — flag anything vague, redundant, or structurally risky.
  5. Suggest 2–3 concrete improvements to Gemini's "Project Manager" mode to maximize build efficiency this session.

- **TECHNICAL GUARDRAILS (non-negotiable):**
  - `b._id` is the **only** valid primary key for all book operations. Never use `b.id`. Supabase queries use `.eq('id', b._id)` or `.in('id', ids)`.
  - ALL CSS lives in `assets/css/magilib.css`. No `<style>` blocks in `index.html`. No CSS injected via JS (except the bulk-edit IIFE marked "Injected by deploy tool").

- **HANDOFF PROTOCOL:** Every session must end with `SESSION_HANDOFF.md` updated to include:
  - What was built/changed this session (file-level summary)
  - Any unresolved bugs or known regressions
  - "Model Learnings" — non-obvious decisions made, why, and what to watch for next session

## Next Session Priority 🚀
- [x] **Magi-Sheet Animation:** iOS transition updated to `cubic-bezier(0.32, 0.72, 0, 1)` + `body.sheet-open` lock added.
- [ ] **Book Detail on Device:** Verify Primary/Secondary/Danger button layout renders correctly on physical device. Adjust sizing/spacing if needed.
- [x] **Edit Book from Modal:** `openEditFromModal()` now calls `closeModal()` then waits 350ms before `openEditForm(b._id)`.
- [x] **Wishlist Tab Sync:** `toggleWishlistStatus()` confirmed calling `renderCatalog()` after successful Supabase update.
- [ ] **Sold Filter Accuracy:** Confirm `#showSoldChip` filter pill still works correctly after the `toggleSold()` changes.
- [x] **Batch Mode Edge Cases:** `bulkDelete()` now alerts "No books selected" when `S.selectedBooks.size === 0`.

## Technical Rules
- **No Frameworks:** Pure HTML/CSS/JS (PWA).
- **Styling:** All CSS in `assets/css/magilib.css`. Flexbox-first, mobile-responsive.
- **Workflow:** Run `handoff` at end; `newchat` at start.
