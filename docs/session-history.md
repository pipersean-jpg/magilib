# MagiLib — Session History

Archived from CLAUDE.md to reduce context load. Full detail is in git log.

---

## Session 10 — Cleanup & Redundancy ✅
- Book detail sheet: 6 buttons → 4 (Edit · Mark Sold · eBay · Delete)
- Nav dropdown: merged "Account" + "Settings" into one Settings link
- Stripped Cloudinary: all config fields + references removed from HTML/JS
- Stripped Google Sheets / Apps Script: all references removed

## Session 11 — Settings & Onboarding ✅ (partial)
- New Setup Wizard: display name → 3-slide feature tour

## Session 12 — Settings + Beta QA ✅ (partial)
- Settings restructured: Account · Security · Currency+Marketplace · Condition Presets · Library prefs · Help & Feedback
- Condition % presets: Fine 100% / VG 80% / Good 60% / Fair 40% stored in settings, consumed by `getEstimatedValue()`
- Dynamic price labels: Add + Edit modal price labels update to match selected currency

## Session 13 — Beta QA
- Library detail pricing locked: 2×2 button grid (Market Value · Check eBay · Edit Details · Mark Sold) — confirmed final for beta

## Session 25 — CSS Cleanup
- Copy-row, FAQ accordion, source evidence rows, empty/loading states → named CSS classes
- Loading spinner flex-centered

## Session 26 — CSS Cleanup + Cover Fix ✅
- FAQ first-tap bug fixed (`=== 'block'` check)
- Book cover display bug fixed — `onload`/`onerror` pattern, removed CSS `display:none` conflict

## Session 27 — Beta Walkthrough (Sections 1 & 2) ✅
- Auth bugs fixed (password confirm, forgot password spinner, security)
- Cover display fixed (position:absolute placeholder)
- Onboarding polish, Add flow bugs fixed

## Session 28 — Beta Walkthrough (Section 3) ✅
- Splash hang fix: syntax error (`try` missing catch) — `node --check` caught it
- Filter pill active CSS added
- Cover proxy revert: `_imgErr` fallback reverted to instant `display:none`

## Session 29 — Beta Walkthrough (Section 4 Edit) ✅ (partial)
- Edit modal cleanup: Fetch Price removed, Delete Book added, 2-col footer
- `confirmDelete` + `closeEditModal`: `window.confirm` → `magiConfirm`
- Condition adjustment in Edit: `editPriceBase` seeded from stored price
- Cover picker deduplication: CA + MagicRef same-image dedup

## Session 30 — Side Quest ✅
- QTTE inventory scraper: Python/Playwright, full catalog, publisher+year included
- Admin portal upsert fix: insert → upsert on (norm_key, source)
- book_catalog architecture decisions locked

## Session 31 — book_catalog Build ✅
- SQL migration: `book_catalog` table created in Supabase
- Seed script: 10,495 rows upserted (6,509 MagicRef · 2,243 raw CA · 1,742 no cover)
- CA cover download: all 2,243 CA images downloaded, compressed, uploaded to Supabase Storage
- Price merge script: 866 entries priced (804 eBay · 92 Penguin · 12 Murphy's)
- Admin portal: Book Catalog section with stats + CSV upload

## Session 32 — Wire book_catalog into App ✅
- Add flow: `onTitleBlur()` queries `book_catalog` → auto-fills author/publisher/year/cover
- `applyConjuringMatch` enrichment: fills publisher/price from `book_catalog` after live scrape
- Cover fix: SW was CSP-blocking external image fetches — bypassed for all external origins
- `enrichCoversFromCatalog()`: post-load pass fills missing/CA covers

## Session 33 — Cover Picker Fix ✅
- Magic Sources rewrite: `book_catalog` direct query replaces MagicRef page scraping
- CA attribution fix: scan `entry.i[]` for `C:` codes
- Current cover card: reference card + vertical divider prepended to results

## Session 34 — Beta QA ✅ (partial)
- Sections 5–8 code review: Status, Pricing, Settings, Onboarding — all reviewed, one bug fixed
- "+ Wishlist" / "Move to Library" buttons added to both library and wishlist book views
- Duplicate `toggleWishlistStatus` removed from `ui.js`
- Console.logs cleaned

## Session 35 — Device Walkthrough & Beta Sign-off ✅ (partial)
- Google sign-in button added; OAuth wired; Supabase + Google Cloud configured
- Library isolation fix: `renderCatalog()` on sign-out + `loadCatalog()` in `afterSplash()`
- Auth device test: Google sign-in + user-switch isolation confirmed on device

## Session 36 — New Layout ✅
- Home/Summary page (`#view-home`): greeting, stats, Magic Fact, recent books, CTA
- Bottom nav (mobile): 5 tabs — Home · Library · Add · Wishlist · Settings
- Cover picker restructured: 4-option icon list (Take photo · Gallery · Magic Sources · Link)
- Desktop 50/50: Cover + Details side by side on ≥768px

## Sessions 37–46 — Walkthrough Continuation
See git log for per-session detail.

## Completed Pre-Beta Backlog (all ✅)
- P1: Lazy-load 4 static DB scripts after auth (`loadStaticDBs()`)
- P1: Publisher `<datalist>` → `publishers.js` (378 lines removed from index.html)
- P1: `loading="lazy"` + `decoding="async"` on all book cover `<img>` tags
- P1: `inputmode="decimal"` on all price/cost inputs
- P2: Currency switching guard (`magiConfirm` in `saveSettings()`)
- P2: Service Worker — shell pre-cache + network-first + IndexedDB + offline banner + mutation queue
- P3: Splash pulse animation (`.splash-pulse`, `@keyframes splash-breathe`)
- P3: iOS ghost-click double-rAF on overlays
- P3: Live condition price adjustment (`_applyConditionAdjustment()`)
- P3: Batch queue progress indicator (`#queueProgress`, `_setQueueProgress`)
- P4: `aria-label` on 10 icon-only buttons
- P4: `sanitize(str)` XSS helper in `globals.js`
- P4: `rel="preconnect"` for Supabase and CDN (already present in index.html)
