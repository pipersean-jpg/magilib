# MagiLib Project Status — Session 36

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

## Last Session (Session 36)
- ### 1. `assets/css/magilib.css` (MODIFIED)
- **Bottom nav CSS** — `.bottom-nav`, `.bn-tab`, `.bn-add`, `.bn-add-circle` — mobile-only fixed bottom bar
- **Home view CSS** — `.home-wrap`, `.home-greeting`, `.home-stats-grid`, `.home-stat-card`, `.home-recent-row`, `.home-magic-fact`, `.home-cta`
- **Cover picker option CSS** — `.cover-picker-opts`, `.cover-picker-opt`, `.cpo-icon` — icon+label list rows with `.active` highlight
- **Desktop 50/50** — `@media(min-width:768px)` CSS grid on `.entry-layout`: `"pricing pricing" / "cover details" / "condition condition" / "save save"`
- **Mobile bottom padding** — `.view` gets `padding-bottom:76px` on mobile so content clears the bottom nav

**Known issues carried forward:**
- **Section 4 dirty-check**: verify `magiConfirm` fires after PWA reload (code correct, needs device test)
- **Full beta walkthrough**: Sections 2–8 (Add · Library · Edit · Status · Pricing · Settings · Onboarding) still pending end-to-end device sign-off

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

### Session 25 — CSS Cleanup (cosmetic, no logic changes)
- [x] Copy-row inline styles → `.copy-*` classes
- [x] FAQ accordion inline styles → `.faq-*` classes
- [x] Source evidence rows → `.src-*` classes
- [x] Empty/loading states → `.catalog-loading` + fixes; Retry button stripped; empty search container stripped
- [x] Loading spinner now flex-centered (both axes)

### Session 26 — CSS Cleanup + Cover Fix ✅
- [x] Copy-row, FAQ accordion, source evidence rows, empty/loading states → named CSS classes
- [x] FAQ first-tap bug fixed (`=== 'block'` check)
- [x] Book cover display bug fixed — `onload`/`onerror` pattern, removed CSS `display:none` conflict with `loading="lazy"`

### Session 27 — Beta Walkthrough (Sections 1 & 2) ✅
- [x] Auth bugs fixed (password confirm, forgot password spinner, security)
- [x] Cover display fixed (real fix: position:absolute placeholder)
- [x] Onboarding polish (wizard alignment, welcome button border)
- [x] Add flow bugs fixed (frozen scan status, price message, cover picker, batch queue)

### Session 28 — Beta Walkthrough (Section 3) ✅
- [x] **Splash hang fix**: syntax error (`try` missing catch) in cover picker block — `node --check` caught it
- [x] **Filter pill active CSS**: `.filter-pill.active` rules added
- [x] **Cover proxy revert**: `_imgErr` fallback caused waterfall of slow proxy fetches — reverted to instant `display:none`

### Session 29 — Beta Walkthrough (Section 4 Edit) ✅ (partial)
- [x] **Proactive review**: 4 bugs found and fixed before device testing
- [x] **Edit modal cleanup**: Fetch Price removed, Delete Book added, 2-col footer
- [x] **`confirmDelete` + `closeEditModal`**: `window.confirm` → `magiConfirm`
- [x] **Condition adjustment in Edit**: `editPriceBase` seeded from stored price
- [x] **Cover picker deduplication**: CA + MagicRef same-image dedup
- [ ] **Section 4 reconfirm**: dirty-check dialog verify after PWA reload

### Session 30 — Side Quest ✅ (partial)
- [x] **QTTE inventory scraper**: Python/Playwright, full catalog, publisher+year included
- [x] **Admin portal upsert fix**: insert → upsert on (norm_key, source)
- [x] **book_catalog architecture**: all decisions locked, full Supabase audit completed

### Session 31 — book_catalog Build ✅
- [x] **SQL migration**: `book_catalog` table created in Supabase
- [x] **Seed script** (`scripts/seed-book-catalog.js`): 10,495 rows upserted; 6,509 MagicRef · 2,243 raw CA · 1,742 no cover
- [x] **CA cover download**: all 2,243 CA images downloaded, compressed, uploaded to Supabase Storage — 0 failures
- [x] **Price merge script** (`scripts/merge-price-db.js`): 866 entries priced (804 eBay · 92 Penguin · 12 Murphy's)
- [x] **Admin portal**: Book Catalog section — stats + CSV upload in `magilib-admin`
- [x] **Validate**: Royal Road $21 · Strong Magic $139 · Paper Engine $46 · Card College 1 $246

### Session 32 — Wire book_catalog into App ✅ (partial)
- [x] **Add flow**: `onTitleBlur()` queries `book_catalog` on title blur → auto-fill author/publisher/year/cover
- [x] **`applyConjuringMatch` enrichment**: step 6 fills publisher/price from `book_catalog` after live scrape
- [x] **"Not found" toast**: "Not found in local database. Add information manually."
- [x] **Cover fix**: SW was CSP-blocking external image fetches — fixed by bypassing SW for all external origins
- [x] **`enrichCoversFromCatalog()`**: post-load pass fills missing/CA covers from `book_catalog` (norm_key + clean-title prefix)
- [ ] **Reconfirm Section 4** + **beta walkthrough Sections 5–8**

### Session 33 — Cover Picker Fix ✅
- [x] **Magic Sources rewrite**: `book_catalog` direct query replaces MagicRef page scraping
- [x] **CA attribution fix**: scan `entry.i[]` for `C:` codes; don't use `M:`-prefixed `entry.c` as CA
- [x] **Current cover card**: reference card + vertical divider prepended to Magic Sources results

### Session 34 — Beta QA ✅ (partial)
- [x] **Sections 5–8 code review**: Status, Pricing, Settings, Onboarding — all reviewed, one bug fixed
- [x] **"+ Wishlist" / "Move to Library" buttons**: missing from modals — added to both library and wishlist book views
- [x] **Duplicate `toggleWishlistStatus` removed** from `ui.js`
- [x] **Console.logs cleaned**: `deleteBook` debug log removed; `enrichCoversFromCatalog` was already clean
- [ ] **Section 4 reconfirm**: dirty-check dialog after PWA reload (code correct, needs device test)
- [ ] **Full device walkthrough**: end-to-end beta checklist on device

### Session 36 — New Layout (IN PROGRESS — needs device review)

### Session 35 — Device Walkthrough & Beta Sign-off ✅ (partial)
- [x] **Google sign-in button**: added to auth screen, OAuth wired, Supabase + Google Cloud configured
- [x] **Library isolation fix**: `renderCatalog()` on sign-out + `loadCatalog()` in `afterSplash()`
- [x] **SW cache bumped**: `magilib-sw-s35` — forces fresh HTML on device
- [x] Auth device test: Google sign-in + user-switch isolation confirmed on device
- [ ] Full device walkthrough: add → library → edit (dirty-check) → status → pricing → settings → onboarding
- [ ] Section 4 dirty-check: verify `magiConfirm` fires after PWA reload
- [ ] Beta launch checklist sign-off (see checklist below)

**New Layout (Session 36) — needs device review next session:**
- [x] Home/Summary page (`#view-home`) — greeting, stats, Magic Fact, recent books, CTA
- [x] Bottom nav (mobile) — 5 tabs: Home · Library · Add · Wishlist · Settings
- [x] Cover picker restructured — 4-option icon list (Take photo · Gallery · Pro Shelf · Link)
- [x] Desktop 50/50 — Cover + Details side by side on ≥768px
- [ ] Device test: all New Layout changes (see SESSION_HANDOFF.md checklist)

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

## Pre-Beta Fix Backlog

### P1 — Performance & Load Time
1. ~~**Lazy-load 4 static DB scripts after auth**~~ ✅ Done Session 20 — `loadStaticDBs()` in auth.js fires post-auth.
2. ~~**Move publisher `<datalist>` to a JS array**~~ ✅ Done Session 21 — `publishers.js` injects options on DOMContentLoaded; 378 lines removed from `index.html`.
3. ~~**Add `loading="lazy"` to all book cover `<img>` tags**~~ ✅ Done Session 22 — all `<img>` tags in `catalog.js` have `loading="lazy"` and `decoding="async"`.
4. ~~**Add `inputmode="decimal"` to all price/cost inputs**~~ ✅ Done Session 22 — all price/cost `<input type="number">` fields now have `inputmode="decimal"`.

### P2 — Data Integrity & Offline
5. ~~**Fix currency switching to prevent mixed-currency data**~~ ✅ Done Session 20 — `magiConfirm` guard in `saveSettings()` requires explicit confirmation when switching currency with existing books.
6. ~~**Add a basic Service Worker for shell caching + offline read**~~ ✅ Done Session 24 — `sw.js` ships shell pre-cache + network-first strategy; `_idbSaveBooks`/`_idbLoadBooks` in `globals.js`; `loadCatalog()` IDB fallback; offline banner; mutation queue (`_mgQueuePush`/`_mgQueueFlush`) for updates/deletes; inserts blocked offline.

### P3 — UX & Trust
7. ~~**Add spinner/pulse animation to splash screen**~~ ✅ Done Session 22 — `.splash-pulse` + `@keyframes splash-breathe` already wired in `ui.js`/CSS. Tightened range to 0.8–1.0.
8. ~~**Show live condition price adjustment in Add and Edit**~~ ✅ Done Session 22 — `S.priceBase`/`S.editPriceBase` stored on fetch; `_applyConditionAdjustment()` recalculates price + shows inline hint on condition change.
9. ~~**Add batch queue progress indicator**~~ ✅ Done Session 23 — `#queueProgress` label + 4px fill bar in `#queuePanel`; `_setQueueProgress`/`_clearQueueProgress` helpers; wired to both `processNextFromQueue` and `quickAddFromQueue`.
10. ~~**Replace iOS ghost-click `setTimeout` with `requestAnimationFrame`**~~ ✅ Done Session 22 — double-rAF applied to price review sheet, `openCoverPicker`, `openCoverPickerForEdit`, and `openModal`.

### P4 — Code Quality & Accessibility
11. ~~**Add `aria-label` to all icon-only buttons**~~ ✅ Done Session 21 — 10 buttons labelled across `index.html` + `catalog.js`.
12. ~~**Sanitize user input before DOM insertion**~~ ✅ Done Session 21 — `sanitize()` in `globals.js`, applied across all innerHTML user-data insertion points in `catalog.js`.
13. **Migrate inline `onclick` handlers to event delegation (Phase 2 prep)** — 100+ inline `onclick="functionName()"` handlers are a memory leak risk under frequent re-render. Start migrating to event delegation on stable parent containers (`#view-catalog`, `#modalOverlay`, `#view-entry`) using `event.target.closest()`. Prioritize most re-rendered areas first.
14. ~~**Add `rel="preconnect"` for Supabase and CDN domains**~~ ✅ Already present in `index.html` lines 16–19 (confirmed Session 23).

### P5 — Delight (Phase 2 Seeds)
15. **Condition flag value modifiers in Settings** — Extend Condition Presets to support flag-based multipliers (Signed +20%, No Dustjacket -30%, etc.). Store alongside `condPct_*` in settings; `getEstimatedValue()` applies them on top of condition grade.
16. **Populate the AI Info Card with book trivia** — `#aiInfoCard` exists but is unused. When Claude extracts book data from a cover scan, also return a 2-sentence historical note/trivia about the book/author. Populate `#aiInfoContent`. Adds a "magical" touch to the scanning experience.

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

## book_catalog Architecture (locked Session 30)
- **Schema**: `norm_key` (PK), `title`, `author`, `publisher`, `year`, `cover_url`, `cover_source`, `in_print`, `price_msrp`, `price_secondary`, `price_ebay`, `price_retail`, `updated_at`
- **Seed source**: CONJURING_DB (`conjuring_db.js`) — 10,495 entries, primary seed
- **Cover priority**: ConjuringArchive (download→Supabase Storage) → MagicRef (hotlink) → Murphy's → Penguin → Vanishing Inc
- **CA download rule**: only for books with no MagicRef cover (`m` field absent). ~2,000–2,500 images, ≤80KB each, ~200–250MB storage.
- **normKey**: standard `title:author` format (same as price_db/scrapers). NOT the aggressive title-only variant in pricing.js/ui.js.
- **Murphy's author mismatch**: existing price_db Murphy's rows use Last-First author format → won't match book_catalog norm_keys. Migrate forward; don't fix backward.
- **Admin update path**: scraper → CSV → magilib-admin CSV upload → upserts book_catalog. No server needed.
- **"Not found" UX**: toast "Not found in local database. Add information manually." Falls through to manual entry.
- **book_catalog confirmed absent**: `count: exact, head: true` returning `null` ≠ table exists. Confirmed absent via `select()`.

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
- **Lazy DB load timing**: Splash runs ~2.7s post-auth. `loadStaticDBs()` fires at start of `onAuthSuccess()` — DBs are ready before user reaches any feature that needs them. No loading state needed.
- **`_isMagicRef(entry)`**: `!!entry.m` — true if entry has a MagicRef page URL. Merged entries (both sources) also have `m`, so they correctly count as MagicRef. Conjuring Archive-only entries have `C:`-prefixed cover and no `m`.
- **`saveSettings(skipCurrencyGuard)`**: pass `true` to bypass the currency change guard (used by the confirm callback to complete the save after user approval).
- **`sanitize(str)`**: in `globals.js` (loaded first). Escapes `&<>"'`. Apply to all user-entered fields in innerHTML templates. Safe fields (UUIDs, parseFloat'd prices, fixed enums, cover URLs in `src=`) do not need it.
- **datalist injection pattern**: build a `DocumentFragment`, append all `<option>` nodes, single `dl.appendChild(frag)` — one DOM write. Guard with `dl.dataset.loaded` to prevent double injection.
- **aria-label audit scope**: check both static HTML and dynamically-created buttons in JS innerHTML strings — the price review sheet close button is easy to miss.
- **`_applyConditionAdjustment` placement**: in `catalog.js` (where `getConditionPct` and `currSym` live) — no imports needed.
- **`S.editPriceBase` reset timing**: reset in `openEditForm()`, not just on modal close — otherwise switching books in the same session carries over the previous fetch base.
- **`fetchPrice()` does NOT apply condition**: returns raw market price. Condition adjustment is display-layer only via `_applyConditionAdjustment()`.
- **double-rAF for ghost-click**: aligns to browser paint cycle; suitable for modern iOS where 300ms synthetic click delay is largely eliminated. Applied to price review sheet, cover picker, and `#modalOverlay`.
- **FX rates:** Currently hardcoded (USD→AUD 1.55, GBP→AUD 2.02) in catalog.js + ui.js + pricing.js. Will migrate to `fx_rates` table.
- **iOS scroll-to-top pattern:** `window.scrollTo({top:0,behavior:'instant'})` is unreliable on iOS Safari. Use: `window.scrollTo(0,0); document.body.scrollTop=0; document.documentElement.scrollTop=0;` — repeat in a 50ms `setTimeout` to override focus-triggered scroll.
- **Cover picker z-index:** `#coverPickerOverlay` must be `--z-dialog` (2000+) to appear above `.modal-overlay` elements at `--z-sheet` (1000).
- **External links:** all external URLs must use `window.open(url, '_blank')`. Never `location.href`. Universal rule across all link handlers and `<a>` tags.
- **`toggleDrafts` null crash**: `#showWishlistChip` doesn't exist (wishlist is a tab, not a filter chip). Always null-guard `getElementById` calls in toggle functions that reset sibling chips — use `const el = getElementById(id); if (el) el.classList.remove('active')`.
- **Queue progress helpers**: `_setQueueProgress(label, pct)` + `_clearQueueProgress()` in `catalog.js`, exposed on `window` so `ui.js` can call them without imports.
- **SW versioned-asset cache key**: JS/CSS with `?v=sN` must be stored under bare pathname (`url.pathname`) so any version variant hits the same cache entry offline. Strip the query string on `cache.put()` only.
- **SW bypass for Supabase/API**: return early (no `event.respondWith`) for Supabase and `/api/` routes — returning even a 503 response would interfere with Supabase SDK retry logic.
- **IDB offline fallback pattern**: `_idbSaveBooks` on every successful `loadCatalog()`; fall through to IDB only on `catch + !navigator.onLine`. Don't try to sync IDB reads back to Supabase.
- **Mutation queue insert-block**: inserts require server-assigned UUIDs and can't be queued safely without local-ID resolution. Block inserts offline; queue only updates/deletes (which have stable `b._id`).
- **`_supa` availability in globals.js**: `_supa` is initialised in DOMContentLoaded in auth.js. `_mgQueueFlush()` is only called from `online` event (fired after page load) or `onAuthSuccess()` — `_supa` is always initialised by then.
- **Offline banner z-index**: use `calc(var(--z-sheet) - 1)` = 999 so the banner sits above page content but below Magi-sheets (1000) and dialogs (2000).
- **`body.offline-mode .nav`**: shift nav down by banner height (37px) to prevent content clip. Apply via class toggle on `document.body`, not inline style, so CSS transition applies.
- **`text-align:center` ≠ truly centered**: horizontal only. Use `display:flex; align-items:center; justify-content:center` for full viewport centering of loading/empty states.
- **Check for existing descendant CSS rules before writing inline styles**: `.empty-state button` was fully styled in CSS — the Retry button inline style was 100% redundant. Always grep the CSS file for the container class before adding inline styles to children.
- **`last-child:border-none` as an inline style is a no-op**: it's interpreted as a CSS property name, not a selector. Must be written as `.foo:last-child { border-bottom:none }` in a stylesheet.
- **`loading="lazy"` + CSS `display:none` on iOS Safari**: even when inline `style="display:block"` overrides CSS `display:none`, iOS Safari may skip lazy loading the image by evaluating the CSS rule before inline styles. Fix: remove `display:none` from CSS; control initial visibility with inline style + `onload`/`onerror` handlers.
- **Real cover fix — `position:absolute` skeleton pattern**: the correct approach is making `.book-cover-ph` `position:absolute;top:0;left:0` so it overlays the img. The img never needs `display:none`. `onload` hides the placeholder; `onerror` hides the img. Any approach that puts `display:none` on the img (CSS or inline) will break lazy loading on iOS.
- **`signOut()` before `signUp()`**: Supabase does not cleanly switch sessions when `signUp()` is called while a session is active. Always `await _supa.auth.signOut()` first.
- **`S.books = []` in `onAuthSuccess()`**: clears stale library data from any previous session before the new user's catalog loads.
- **`toggleDrafts(btn)`**: expects a real DOM element — calling with `null` crashes. Set `S.showDrafts = true` directly and call `renderCatalog()` instead.
- **`el.style.display` reflects inline styles only, not computed styles**: `el.style.display !== 'none'` returns `true` when display is CSS-only (no inline style set), because `el.style.display` is `''`. Always use positive match `=== 'block'` for toggle checks.
- **`onload`/`onerror` cover reveal pattern**: img starts `style="display:none"` (inline); `onload` sets `display:block` + hides placeholder; `onerror` shows placeholder. Placeholder visible during load = natural skeleton. No CSS vs inline style conflict.
- **Never proxy-fetch inside `onerror` on list/grid items**: triggers a waterfall of simultaneous async HTTP requests (one per visible book card). Only proxy at save time. Instant `this.style.display='none'` is the correct `onerror` for grid cards.
- **`node --check` after every deeply nested async block**: extra `}` in deeply nested try/if/for structures is invisible to the eye but kills the JS parser. Always validate before deploying.
- **SW `fetch()` is subject to `connect-src` CSP, not `img-src`**: when the SW intercepts an image request and calls `fetch()`, the browser applies `connect-src`. Images loaded via `<img src>` use `img-src`. Fix: return early (no `event.respondWith`) for all `url.origin !== self.location.origin` requests.
- **`nextElementSibling` > `nextSibling` in inline handlers**: `nextSibling` can return a text node. `nextElementSibling` always returns an Element — always use it in `onload`/`onerror` inline handlers.
- **Supabase `.or()` breaks on special chars in values**: apostrophes, commas, colons, parens in book titles cause PostgREST parse errors. Use `.in('norm_key', keys)` for exact matches; only use `.or()` with pre-cleaned `[a-z0-9 ]` strings.
- **SW version bumps don't reliably evict old SWs**: `skipWaiting()` + `clients.claim()` may not be enough. Users may need manual Unregister in DevTools. Consider `registration.update()` on page load.
- **`const` redeclaration crash**: two JS files both declaring `const PUBLISHERS` throws SyntaxError on the second load — the entire file fails to parse. Keep constants in one canonical file.
- **`entry.c` in CONJURING_DB is primary cover, not necessarily CA**: can be `M:filename` (MagicRef image). Scan `entry.i[]` for `C:` codes to find actual CA images. Only use `entry.c` as CA if it starts with `C:`.
- **`book_catalog.cover_source` values**: `'supabase_storage'` = CA image in Supabase bucket; `'magicref'` = hotlink to magicref.net. Query `cover_url` directly — far more reliable than scraping MagicRef page HTML via proxy.
- **Flex override in grid container**: set `resultsEl.style.display='flex'` inline to override CSS `display:grid`. `resetPickerState()` restores `display:grid` — no cleanup needed in the conjuring handler.
- **Duplicate `window.fn =` overwrites silently**: if two files both define `function toggleWishlistStatus()` and one does `window.toggleWishlistStatus = toggleWishlistStatus`, the last-loaded file wins. Check for cross-file duplicates when a feature appears wired but doesn't fire as expected.
- **`ms-actions-secondary` full-width button**: `display:grid;grid-template-columns:1fr 1fr` applies to the container — override per-button with `style="width:100%"` (or `grid-column:1/-1`) when you want a single full-width button in the secondary row.
- **`afterSplash()` must call `loadCatalog()`**: for returning users, `checkChangelog()` is the only branch — it never triggers a catalog fetch. Always terminate auth success paths with `loadCatalog()`.
- **`signOut()` clears `S.books` but not the DOM**: call `renderCatalog()` after clearing `S.books` or the old user's rendered HTML persists until the user manually taps Library.
- **SW cache name must be bumped every session**: stale cache name means HTML changes are never served fresh on device. Bump alongside `?v=sN` each session.
- **`onAuthStateChange('SIGNED_IN')` guard**: check `!_supaUser` before calling `onAuthSuccess()` from the handler — normal password sign-in already calls it manually; double-call would re-run splash and loadSettings.
- **`count: exact, head: true` null ≠ table exists**: Supabase returns `null` count (no error) for non-existent tables in some SDK versions. Always confirm with `select().limit(1)` — missing table correctly errors there.
- **`const` in Node.js vm scripts doesn't leak to context**: `vm.runInContext` with `const` declarations leaves the variable inaccessible on the context object. Fix: IIFE wrapper `vm.runInNewContext('(function(){ ...src...; return VAR; })()')`.
- **Supabase upsert INSERT path hits NOT NULL constraint**: even when all target rows exist, Supabase upsert may attempt INSERT for some rows. For known-existing rows, use concurrent `.update().eq()` calls instead of upsert.
- **Supabase default query limit is 1000**: all `select()` calls on large tables must paginate with `.range()` or results will be silently truncated.
- **`dotenv` resolves `.env` relative to CWD, not script file**: always `cd scripts/` before running any script that uses dotenv. Running from wrong directory causes silent failure with no output.
- **CONJURING_DB cover compression**: `"M:filename.jpg"` = MagicRef (hotlink fine). `"C:NNN"` = ConjuringArchive (download + re-host). `m` field presence = has MagicRef page → skip CA download.
- **QTTE scraper data quality**: publisher fragments under 4 chars are regex garbage (e.g. "The" captured mid-sentence). `html.unescape()` required for HTML entities in scraped text.
- **Murphy's price_db norm_key uses Last-First author**: `Artist/Magician` CSV field stored as-is. Won't match book_catalog (First Last). Migrate forward; don't fix backward.
- **magilib-admin has no GitHub remote**: commits are local only. `git push` will fail silently.

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
- Lazy-load 3.4 MB static DB scripts post-auth: `loadStaticDBs()` in `auth.js`, 4 `<script defer>` tags removed from `<head>`
- MagicRef-first search priority: `_isMagicRef()` + split in `conjuringTopMatches()`
- Currency switching guard: `magiConfirm` in `saveSettings()` warns when switching currency with existing books
- Publisher datalist → `publishers.js`: 378 inline `<option>` lines removed from `index.html`
- `sanitize(str)` XSS helper in `globals.js`: applied across all innerHTML user-data insertion points in `catalog.js`
- `aria-label` on 10 icon-only buttons across `index.html` + `catalog.js`
- `loading="lazy"` + `decoding="async"` on all book cover `<img>` tags in `catalog.js`
- `inputmode="decimal"` on all price/cost `<input type="number">` fields
- Splash pulse animation: `.splash-pulse` + `@keyframes splash-breathe` (0.8–1.0 range)
- iOS ghost-click double-rAF: price review sheet, `openCoverPicker`, `openCoverPickerForEdit`, `openModal`
- Live condition price adjustment: `_applyConditionAdjustment()` / `_applyEditConditionAdjustment()` in Add + Edit forms
- Batch queue progress indicator: `#queueProgress` label + fill bar in `#queuePanel`; `_setQueueProgress`/`_clearQueueProgress` helpers in `catalog.js`
- Drafts filter crash fix: null-guarded `#showWishlistChip` in `toggleDrafts()` — element doesn't exist in HTML
- Service Worker (P2 #6): `sw.js` shell pre-cache + network-first strategy; IndexedDB catalog cache (`_idbSaveBooks`/`_idbLoadBooks`); offline banner + `body.offline-mode`; mutation queue (`_mgQueuePush`/`_mgQueueFlush`) for updates/deletes; inserts blocked offline
- **`showView('home')` uses tab index -1**: desktop `.tab-btn` array lookup returns `undefined` for 'home' — intentional; no desktop tab gets highlighted. Logo click is the desktop home entry point.
- **`resetPickerState()` must clear `.cover-picker-opt.active`**: must stay in sync with the cover picker overlay structure; stale class references silently fail.
- **`uploadCoverFromPicker` must close the picker**: unlike the Add-form inline file input, the picker overlay must `classList.add('hidden')` after setting the cover.
- **`renderHomeView()` is called twice on load**: once from `showView('home')` (S.books empty → shows zeros), once from `loadCatalog()` success (S.books populated → updates stats). Progressive display by design.
- **Bottom nav z-index 150**: above sticky nav (100), below Magi-sheets (1000) and dialogs (2000).

---

## Technical Rules
- **No Frameworks:** Pure HTML/CSS/JS (PWA).
- **Styling:** All CSS in `assets/css/magilib.css`. Flexbox-first, mobile-responsive.
- **Workflow:** `handoff` at end of session. `newchat` at start of session.
