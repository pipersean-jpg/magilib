# MagiLib Project Status — Session 17

## Current Project Status
- **Phase:** Phase 1 → Beta Launch — IN PROGRESS
- **Current Focus:** 3-session sprint to beta readiness. Redundancy cleanup → Settings/Onboarding overhaul → Pricing simplification + QA.

---

## Workflow

### Session Start — `newchat`
When `newchat` is invoked, Claude Code MUST:
1. Read `SESSION_HANDOFF.md` in full (CLAUDE.md is auto-loaded). Confirm the last session's outcomes and any carried issues.
   - **CLAUDE.md and SESSION_HANDOFF.md are authoritative.** Memory files (`~/.claude/projects/.../memory/`) are supplementary only. If memory conflicts with these files, trust the .md files and silently update memory to match.
2. Run `git status` — report uncommitted changes or unexpected state.
3. State the top 1–2 priorities for this session and confirm with Sean before writing any code.

### Session End — `handoff`
Before running `handoff`, Claude Code MUST:
1. Write `SESSION_HANDOFF.md` covering: what was built/changed (file-level), unresolved bugs, Model Learnings.
2. Update `CLAUDE.md`: bump session number in the header, move completed items into the Completed Tasks list, update Next Session Priorities.
3. Run `handoff` in the terminal. The script commits everything, pushes to GitHub, and syncs Notion.

### Absolute Rules
- **NEVER ask Sean to edit code manually.** Claude Code makes all file changes directly.
- **`b._id` only.** Never use `b.id`. Supabase queries: `.eq('id', b._id)` or `.in('id', ids)`.
- **All CSS in `assets/css/magilib.css`.** No `<style>` blocks in `index.html`. No CSS injected via JS except the bulk-edit IIFE marked "Injected by deploy tool".
- **Pacing:** Max 2–3 steps per response. Ask a clarifying question before writing major code blocks.

---

## Last Session (Session 16)
- ### 1. `index.html` — Cover picker z-index fix
- `#coverPickerOverlay` was at `z-index:400`, below `.modal-overlay` (`--z-sheet: 1000`)
- Changed inline style to `z-index:var(--z-dialog)` (2000) so it renders above the Edit modal
- ### 2. `catalog.js` — Add screen scroll-to-top (robust fix)
- Old: `window.scrollTo({top:0,behavior:'instant'})` — unreliable on iOS Safari
- New: triple-target reset (`window`, `document.body`, `document.documentElement`) fired immediately + again after 50ms to catch post-render focus-scroll

**Known issues carried forward:**
- **eBay API**: fetch-failed on network (not quota) — still 0 live API rows, 2,021 manual CSV rows in price_db
- **QTTE/Penguin**: may have stale matches — rerun scrapers in Phase 2
- **FX rates**: still hardcoded (USD→AUD 1.55, GBP→AUD 2.02) — Phase 2 migration fully specced in CLAUDE.md

---

## Phase 1 Beta Launch — 3-Session Sprint

### Session 10 — Cleanup & Redundancy ✅
- [x] **Book detail sheet**: reduce 6 buttons → 4 (Edit · Mark Sold · eBay · Delete); remove duplicate ✕/Close buttons
- [x] **Nav dropdown**: merge duplicate "Account" + "Settings" items into one Settings link
- [x] **Strip Cloudinary**: remove all Cloudinary config fields from Settings + all references in HTML/JS
- [x] **Strip Google Sheets**: remove all Google Sheets / Apps Script references from wizard, settings, HTML, JS

### Session 11 — Settings & Onboarding ✅ (partial)
- [x] **New Setup Wizard**: display name (unique) → 3-slide feature tour (how to add / search / price)
- [ ] **Settings simplified**: Account · Security · Currency+Marketplace · Library prefs (stat cards, CSV) · Condition presets
- [ ] **Condition % presets**: Fine 100% / Very Good 80% / Good 60% / Fair 40% — stored in settings, used by pricing

### Session 12 — Settings + Beta QA ✅ (partial)
- [x] **Settings simplified**: restructure settings view — Account · Security · Currency+Marketplace · Condition Presets · Library prefs · Help & Feedback
- [x] **Condition % presets**: Fine 100% / VG 80% / Good 60% / Fair 40% stored in settings, consumed by `getEstimatedValue()`
- [x] **Dynamic price labels**: Add + Edit modal price labels update to match selected currency
- [ ] **Library detail pricing**: remove Market Sync panel. Replace with: stored price display + tap-to-edit + "Check eBay" link
- [ ] **Beta readiness walkthrough**: auth → add → search → edit → price → settings

### Session 13 — Beta QA
- [ ] **Beta readiness walkthrough**: auth → add → search → edit → price → settings — full end-to-end QA on device
- [x] **Library detail pricing**: 2×2 button grid (Market Value · Check eBay · Edit Details · Mark Sold) + lazy Market Sync panel — **confirmed complete and locked for beta. Do NOT replace before Phase 2.**
- [x] **Wishlist price label**: currency label fix shipped in Session 14

### Beta Launch Checklist
- [ ] Auth: sign up (OAuth), sign in, forgot password, change password
- [ ] Add: scan/photo, manual entry, batch queue, save
- [ ] Library: search, filter, sort, view detail
- [ ] Edit: all fields, cover update
- [ ] Status: Mark Sold, + Wishlist, Move to Library
- [ ] Pricing: Fetch estimate (Add) + stored price display + eBay link (Library)
- [ ] Settings: profile, security, currency, condition presets, stat cards, CSV export/import
- [ ] Onboarding: welcome + feature tour for new users
- [ ] No dead code: Cloudinary, Google Sheets, Apps Script all removed

---

## price_db Status (end of Session 9)
- `murphys_msrp`: 671 rows — matched to user's collection
- `qtte_secondary`: ~148+ rows — may have stale matches, rerun `--force`
- `penguin_retail`: ~23+ rows — may be incomplete, rerun `--force`
- `ebay_sold`: 2,021 rows from manual CSV import; API scrape pending (fetch-failed last session — network issue, not quota)
- Scraper: `scripts/scrape-prices.js --source=ebay|murphys|qtte|penguin [--force]`
- Credentials: `.env` — `SUPABASE_SERVICE_KEY`, `EBAY_APP_ID`, `MURPHYS_CSV_URL`

---

## Pricing Model — Beta Scope (simplified)
- **Add page**: "Fetch Price Estimate" button uses `pricing.js` → looks up `price_db` (2,021 eBay sold rows + Murphy's MSRP + QTTE + Penguin) → returns estimate. Working. Keep as-is.
- **Library detail**: 2×2 button grid — Market Value (lazy Market Sync via `price_db`) · Check eBay · Edit Details · Mark Sold. This is the final beta UX — do NOT change before Phase 2.
- **Condition %**: user-set presets (Fine 100% / VG 80% / Good 60% / Fair 40%) stored in settings — used by estimate function.
- **Phase 2 (post-beta)**: full scraper-backed Market Sync panel, price range bar, condition slider, OOP scarcity, FX rates table.
- **Phase 2 — Multi-currency architecture** (spec confirmed):
  - **Storage**: all `market_price` values stored in USD internally. Display layer multiplies by FX rate for user's currency preference. Requires `price_currency` column on books table + one-time migration script (existing `currency` tags on `price_db` rows already cover this).
  - **Live FX rates**: fetch from free API (exchangerate.host or similar) on app load. Cache in localStorage with timestamp. Refresh if >24hrs old. If fetch fails, keep existing cached/hardcoded rates silently.
  - **Manual refresh**: "Update rates" button in Settings → fetch live rates → show last-updated timestamp.
  - **Purchase price**: stays static (never converted). Add `cost_currency` column + small currency dropdown (USD/AUD/GBP/EUR/JPY) on Add + Edit forms. Display-only — shows what the user actually paid in original currency.
  - **Migration**: one-time batch script converts existing `market_price` values to USD using rate at migration time. After that, only new book additions convert on write. Run once; no ongoing UI impact.

---

## Dead Code to Remove (Phase 1 cleanup)
- **Cloudinary**: `s-cloudName`, `s-cloudPreset`, `testCloudinaryUpload()`, all Cloudinary upload logic — users no longer need this
- **Google Sheets / Apps Script**: `getScriptUrl()` (already a stub), `appsScriptOverlay`, wizard steps referencing Sheets setup, any `SHEET_URL` / Apps Script references
- **Setup Wizard content**: replace with feature tour (no technical config). `openWizard()` / `#wizardOverlay` stays, content inside changes.
- **Market Sync panel in detail sheet**: `toggleMarketSync()`, `loadMarketSync()`, `.btn-action` grid in modal — remove from beta, keep in code as Phase 2 (comment out rather than delete)
- **`magilib_market_db.js`**: large static JS file loaded on every page — can be deferred or removed from `<head>` if Market Sync is hidden
- **Auth**: check if `authSwitchMode()` / `authUsernameField` still needed once OAuth is primary signup path

## Technical Learnings
- **Search algorithm:** Fuse.js `threshold: 0.3`. Keys: `['title','author','publisher','year']`. Falls back to `.includes()` if Fuse not loaded.
- **Data source:** Catalog lives in `S.books`. No `window.allBooks`. Supabase populates via `loadCatalog()`.
- **Performance pattern:** Fuse results stored in a `Set` → O(1) `.has()` in filter pass.
- **Environment guard:** Always exclude `node_modules` from file/content searches.
- **CSS architecture:** ALL styles in `assets/css/magilib.css`. Bulk-edit IIFE `_CSS` block is deploy-tool managed — leave in place.
- **Magi-Sheet:** `.magi-sheet-overlay` uses `opacity` + `pointer-events` (not `display:none`). Toggle `.is-active`. `.magi-sheet` slides via `transform: translateY`.
- **Book detail open/close:** `openModal()` adds `.is-active` to `#modalOverlay`. `closeModal()` removes it. Never `.hidden`.
- **Legacy modals** (support, changelog, wizard): use `.modal-overlay` + `.hidden` — do NOT touch.
- **Button hierarchy (Book Detail):** Primary = Edit + eBay. Secondary ghost = Mark Sold + Wishlist. Danger text link = Delete Book.
- **Critical ID:** `_id: row.id` set in `loadCatalog()`. Always `b._id`. Never `b.id`.
- **Z-index scale:** `--z-sheet:1000`, `--z-dialog:2000`, `--z-fullscreen:3000` in single `:root`. Never duplicate.
- **debounce:** `debounce(fn, delay)` in catalog.js. `filterCatalog` = debounced `renderCatalog`. Direct calls (e.g. clearSearch) bypass it.
- **Batch state:** `S.selectMode` (`null | 'edit' | 'move'`) + `S.selectedBooks` (Set of `_id` strings).
- **Batch bar:** `#batchActionsBar` — `.is-visible` toggle. `#batchActionsStack` innerHTML injected by `updateBatchBar()`.
- **`triggerPoof` rule:** Never add `renderCatalog()` to the callback — `exitSelectMode()` already calls it.
- **`market_price` vs `b.price`:** Supabase column = `market_price` (numeric). In-memory = `b.price` (string). Bulk updates: `{ market_price: value }`.
- **Settings tab guard:** `const _tabBtn = querySelectorAll('.tab-btn')[tabs[v]]; if (_tabBtn) _tabBtn.classList.add('active')`.
- **IIFE injection:** Removing a button means disabling its injector in the IIFE wrapper, not just the static HTML.
- **`price_db` schema:** `norm_key`, `source`, `price`, `currency`, `url`, `raw`, `in_print`. No `title`/`author`. `price_master` does not exist.
- **`openEditForm(id)`:** In `books.js:27`. Takes `b._id`.
- **`closeModal()` scope:** Only closes `#modalOverlay`. Use dedicated close functions for other sheets.
- **Cover zoom:** `zoomCover(imgSrc)` creates `.ms-zoom-overlay` on `document.body` — not static DOM.
- **Insights bar:** `renderStatsRow()` → `.insights-bar` inline compact stats.
- **`magiConfirm` / `closeDialog`:** Custom dialog for all destructive confirmations. Replace any `window.confirm()`.
- **iOS ghost-click:** Any overlay gaining `pointer-events:auto` synchronously can receive the deferred tap. Suppress `pointer-events` for 300–400ms on newly-opened overlays.
- **iOS `getElementById` after `appendChild`:** Build all content inline before appending — two-step construction is fragile on iOS.
- **PWA cache-busting:** Bump `?v=sN` on script tags each session to prevent stale JS.
- **QTTE slug:** `/p/category/Title_Words_Here-NNNNN` — strip `-NNNNN`, replace `_` with spaces.
- **Title matching:** Use `startsWith()` not `includes()` — `includes()` causes false positives on short common phrases.
- **Market Sync reads from Supabase `price_db`**, not the static `MARKET_DB` JS object.
- **`getConditionPct(condition)`**: replaces `CONDITION_PCT` constant. Reads from `S.settings.condPct_fine/vg/good/fair`, divides by 100. Defaults 100/80/60/40. Keys match app condition labels: `'Fine'`, `'Very Good'`, `'Good'`, `'Fair'`.
- **`updatePriceLabels(cur)`**: updates `priceLabelAdd`, `costLabelAdd`, `priceLabelEdit`, `costLabelEdit` — call on both `loadSettings` and `saveSettings`.
- **Settings panel order**: Account → Security → Currency & Marketplace → Condition Presets → Library Settings → Price Refresh → Help & Feedback.
- **eBay Finding API fetch-failed** = network block (not quota). Quota exhaustion returns a structured error response.
- **FX rates:** Currently hardcoded (USD→AUD 1.55, GBP→AUD 2.02) in catalog.js + ui.js + pricing.js. Will migrate to `fx_rates` table.
- **iOS scroll-to-top pattern:** `window.scrollTo({top:0,behavior:'instant'})` is unreliable on iOS Safari. Use: `window.scrollTo(0,0); document.body.scrollTop=0; document.documentElement.scrollTop=0;` — repeat in a 50ms `setTimeout` to override focus-triggered scroll.
- **Cover picker z-index:** `#coverPickerOverlay` must be `--z-dialog` (2000+) to appear above `.modal-overlay` elements at `--z-sheet` (1000).
- **External links:** all external URLs must use `window.open(url, '_blank')`. Never `location.href`. Universal rule across all link handlers and `<a>` tags.

---

## Completed Tasks ✅
- Header Reordering (Add > Library > Wishlist > Settings)
- Avatar Menu (Display Name, Account Settings)
- Version Popup & Branding
- Scroll-to-top on Add page
- Terminal automation (`handoff` / `newchat` magic words)
- Notion Hub Sync Integration
- Fuzzy Search (Fuse.js, threshold 0.3)
- Global Design System (`assets/css/magilib.css`)
- Magi-Sheet pattern + Typography Utilities
- Z-index scale
- Book Detail View (bottom sheet, hierarchy, pill badges)
- Delete / toggleSold / toggleWishlistStatus wired to Supabase
- Search UX: 250ms debounce + Clear button + Empty State
- Mobile UX audit: fluid typography, overflow-x fix, 48px targets, safe-area-inset
- Library Layout Consolidation (toolbar + filter-bar + insights-bar)
- Batch Select Mode (dual mode: edit / move) + poof transition
- Price Review Queue (dark Magi-Sheet, per-book inputs)
- `magiPrompt` reusable dialog
- Settings page crash fix
- `bulkMoveToLibrary()`, `openEditFromModal()`, `bulkAutofill()`, `bulkWishlist()`, `bulkDraft()`
- iOS bug fixes: ghost-click, viewport scale, toast z-index, batch tap delay
- `scripts/scrape-prices.js` — Murphy's, QTTE, Penguin, eBay scrapers
- `getEstimatedValue(book)` — full pricing engine
- Market Price Evidence UI — source rows, confidence stars, est. value, Accept button
- 2×2 modal button grid: Market Value / Check eBay / Edit Details / Mark Sold
- `.btn-action` class + `toggleMarketSync` lazy-load
- Murphy's scraper fixes (URL format, norm_key suffix stripping, in_print field)
- QTTE cross-boundary regex fix + word-boundary matching
- eBay CSV import → 2,021 `ebay_sold` rows
- `fx_rates` table + `in_print` column migrations
- Settings restructure: Currency & Marketplace, Condition Presets, wizard folded into Help & Feedback
- `getConditionPct()` — user-configurable condition % presets, fixes 'Very Good'/'VG' mismatch
- `updatePriceLabels()` — dynamic price labels on Add + Edit modal tied to currency setting
- Cover picker z-index fix: `#coverPickerOverlay` at `--z-dialog` (2000)
- Add screen scroll-to-top robust fix: triple-target + 50ms setTimeout repeat
- Cover picker: "Local Database" → "The Pro Shelf" (button); thumbnail label → "Courtesy of"

---

## Technical Rules
- **No Frameworks:** Pure HTML/CSS/JS (PWA).
- **Styling:** All CSS in `assets/css/magilib.css`. Flexbox-first, mobile-responsive.
- **Workflow:** `handoff` at end of session. `newchat` at start of session.
