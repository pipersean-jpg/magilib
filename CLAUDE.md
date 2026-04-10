# MagiLib Project Status - 2026-04-10 (Session 7)

## Current Project Status
- **Phase:** Block 3 (Pricing & Admin Infrastructure) - **IN PROGRESS**
- **Current Focus:** price_db population in progress; scraper infrastructure built; Pricing Engine architecture planned.

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
- [x] `openEditFromModal(id)` implemented (was missing — would throw ReferenceError)
- [x] Poof transition: `triggerPoof(ids, callback)` + `.is-poofing` CSS applied to all bulk move/delete actions
- [x] Price Review Queue: `openPriceReviewSheet(ids)` — dark Magi-Sheet, per-book price inputs, `applyManualPrices()` with parallel Supabase updates
- [x] `magiPrompt({ title, message, placeholder, onConfirm })` — reusable number-input dialog
- [x] Wishlist badge removed from cards; `★ In Wishlist` status shown in Book Detail modal instead
- [x] Settings page crash fixed: `showView('settings')` no longer crashes on missing tab button index
- [x] `bulkMoveToLibrary()`: Move mode sniffs if all selected are Wishlist → shows "Move to Library"; updates `sold_status: null`
- [x] Legacy `☑ Select` button removed from IIFE injection (was re-injecting on every renderCatalog)

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
- **`triggerPoof` callback rule:** NEVER add `renderCatalog()` to the callback — `exitSelectMode()` already calls it. Pattern: `triggerPoof(ids, () => { exitSelectMode(); })`.
- **`market_price` vs `b.price`:** Supabase column = `market_price` (numeric). In-memory = `b.price` (string). All bulk price updates use `{ market_price: value }`. Never use `{ price: value }`.
- **Settings tab index:** `showView('settings')` maps to tab index 3, but only 3 tab buttons exist (0–2). Always guard: `const _tabBtn = querySelectorAll('.tab-btn')[tabs[v]]; if (_tabBtn) _tabBtn.classList.add('active')`.
- **IIFE injection pattern:** The bulk-edit IIFE re-injects DOM elements on every `renderCatalog`. Removing a button means finding and disabling the injector in the IIFE wrapper, not just the static HTML.
- **`price_db` table:** Exists (0 rows). Schema: `norm_key`, `source`, `price`, `currency`, `url`, `raw`. No `title`/`author` columns. `price_master` does NOT exist. Market Sync lookup deferred until `price_db` is populated.
- **`openEditForm(id)`:** Defined in `books.js:27` (not catalog.js). Takes `b._id`, populates and opens `#editModalOverlay`.
- **`closeModal()` scope:** Only closes `#modalOverlay` (book detail sheet). Does NOT close price review sheet or edit modal. Use dedicated close functions for other sheets.
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

## Session 7 Completed (2026-04-10) ✅
- Built `scripts/scrape-prices.js` — quarterly price scraper
- Murphy's source: live Daily Products CSV (7,603 products, filtered to 569 books via `Product Type === 'Book'`), 845 rows in price_db
- QTTE source: HTML scraper, secondary market prices + listing count, ~148+ rows
- Penguin Magic source: HTML scraper, retail price + `in_stock`/`out_of_stock` signal in `raw` column
- eBay Finding API: credentials live (PRD), quota exhausted during testing — restart next session
- CMB (CollectingMagicBooks): dropped — fully JS-rendered (Wix), not scrapeable
- Vanishing Inc: dropped — bot-blocked on every request
- Comprehensive Pricing Engine architecture designed (see below)
- In-print detection strategy designed: Murphy's → Penguin in-stock → QTTE new listings → eBay volume → user prompt

## Pricing Engine Architecture (Session 7 Design) 📐
- **Two modes:** In-Print (MSRP × condition%) vs Out-of-Print (eBay median × scarcity factor)
- **In-print detection hierarchy:** Murphy's row → Penguin `in_stock` → secondary sources → user prompt
- **`in_print` field values:** `confirmed_inprint` / `confirmed_oop` / `likely_inprint` / `likely_oop` / `unknown`
- **Confidence score:** ★1–5 based on source count + data freshness
- **UI components planned:** Est. Value badge, price range bar, condition slider, source breakdown, OOP flag
- **Settings:** condition % presets per grade, home currency, valuation mode (conservative/market/optimistic)
- **New DB needed:** `fx_rates` table (weekly FX), `in_print` + `edition_type` columns on `price_db`
- **Build order:** FX rates → `getEstimatedValue()` fn → price range bar + condition slider → condition settings UI → OOP scarcity → edition premiums

## price_db Status (2026-04-10)
- `murphys_msrp`: 845 rows (universal — all Murphy's books, not just your collection)
- `qtte_secondary`: ~148+ rows (may be incomplete — rerun `--source=qtte` if needed)
- `penguin_retail`: ~23+ rows (may be incomplete — rerun `--source=penguin` if needed)
- `ebay_sold`: 0 rows — rerun `--source=ebay` after quota reset (midnight UTC)
- Scraper: `scripts/scrape-prices.js` — run with `--source=ebay|murphys|qtte|penguin`
- Credentials: `.env` has `SUPABASE_SERVICE_KEY`, `EBAY_APP_ID`, `MURPHYS_CSV_URL`

## Next Session Priority 🚀
- [ ] **Rerun scrapers:** `--source=ebay` (quota reset), verify `--source=qtte` and `--source=penguin` completed
- [ ] **Add `in_print` column** to `price_db` (migration), populate from Murphy's + Penguin `raw` field
- [ ] **Add `fx_rates` table** — seed with USD/GBP/AUD/EUR, weekly refresh
- [ ] **Build `getEstimatedValue(book)`** — pure JS valuation function
- [ ] **Price range bar + condition slider UI** in Book Detail sheet
- [ ] **Small UX fixes:** Login frustrations, book status moves, settings — still deferred
- [ ] **Cache-bust:** bump script tags from `?v=s5` to `?v=s6`

## Technical Rules
- **No Frameworks:** Pure HTML/CSS/JS (PWA).
- **Styling:** All CSS in `assets/css/magilib.css`. Flexbox-first, mobile-responsive.
- **Workflow:** Run `handoff` at end; `newchat` at start.
