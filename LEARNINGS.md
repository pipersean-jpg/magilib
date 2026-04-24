# MagiLib — Technical Learnings

Reference for debugging and new feature work. Read this when something unexpected happens or you're wiring a new pattern. Do NOT load at session start — it's on-demand only.

---

## State & Data

- **`b._id` only.** `_id: row.id` mapped in `loadCatalog()`. Never `b.id`. Supabase queries: `.eq('id', b._id)`.
- **`market_price` vs `b.price`:** Supabase column = `market_price` (numeric). In-memory = `b.price` (string). Bulk updates: `{ market_price: value }`.
- **`S.books`** is the single source of truth. No `window.allBooks`. Supabase populates via `loadCatalog()`.
- **`S._priceUserEdited` flag:** track manual price edits; reset on fetch and `clearForm()`; check before condition-adjustment overwrites.
- **`S.editPriceBase` reset timing:** reset in `openEditForm()`, not just on modal close — switching books in same session carries over the previous fetch base.
- **`fetchPrice()` does NOT apply condition** — returns raw market price. Condition adjustment is display-layer only via `_applyConditionAdjustment()`.
- **`created_at` vs `dateAdded`:** Supabase `created_at` (ISO timestamp) is the reliable sort key. `dateAdded` was display-only `DD/MM/YYYY`.
- **`S.books = []` in `onAuthSuccess()`:** clears stale library data from any previous session before new user's catalog loads.
- **`signOut()` clears `S.books` but not the DOM:** call `renderCatalog()` after clearing or old user's HTML persists.

## Supabase Gotchas

- **Default query limit is 1000.** All `select()` on large tables must paginate with `.range()`.
- **`.or()` breaks with special chars** (apostrophes, commas, colons, parens) in values — PostgREST parse errors. Use `.in('norm_key', keys)` for exact matches; sequential `.ilike()` for title searches.
- **`count: exact, head: true` null ≠ table exists.** Some SDK versions return `null` count for non-existent tables. Confirm with `select().limit(1)` — missing table errors there.
- **Upsert INSERT path hits NOT NULL constraint:** even when all target rows exist, Supabase upsert may attempt INSERT. For known-existing rows, use `.update().eq()` instead.
- **`signOut()` before `signUp()`:** Supabase doesn't cleanly switch sessions when `signUp()` is called while a session is active. Always `await _supa.auth.signOut()` first.
- **`_supa` availability in globals.js:** `_supa` initialised in DOMContentLoaded in auth.js. `_mgQueueFlush()` is only called from `online` event or `onAuthSuccess()` — `_supa` is always ready by then.

## Auth Flow

- **`onAuthStateChange('SIGNED_IN')` guard:** check `!_supaUser` before calling `onAuthSuccess()` — password sign-in calls it manually; double-call re-runs splash and loadSettings.
- **`afterSplash()` must call `loadCatalog()`:** for returning users, `checkChangelog()` is the only branch — it never triggers a catalog fetch.
- **`autocomplete="new-password"` suppresses Save Password.** Dynamically switch `autocomplete` on the password field between sign-up and sign-in mode.
- **signOut() must reset authConfirmField:** hide `#authConfirmField` + clear value + reset `autocomplete` to `current-password`.

## Modals & Overlays

- **`magiConfirm` signature:** `{title, message, confirmText, onConfirm}` — always object style. Positional args silently yield `undefined`. Audit all callers when signature changes.
- **`showView()` guard + `_doShowView()` split:** to add a confirmation guard before navigation, extract nav body into `_doShowView()` and call from `magiConfirm` callback.
- **Book detail open/close:** `openModal()` adds `.is-active` to `#modalOverlay`. `closeModal()` removes it. Never `.hidden`.
- **`closeModal()` scope:** only closes `#modalOverlay`. Use dedicated close functions for other sheets.
- **Edit modal z-index:** `#editModalOverlay` at `z-index:2001` inline. At 1000 it competes with fading `.magi-sheet-overlay` overlays.
- **Edit modal `body.sheet-open` pattern:** `openEditForm()` adds `sheet-open`; `closeEditModal()` removes it in ALL close paths including the dirty-check `onConfirm` callback.
- **`openEditFromModal()` without ID:** guard with `if (!id) id = S.books[S.currentModalIdx]?._id`.
- **Legacy modals** (support, changelog, wizard): `.modal-overlay` + `.hidden` — do NOT touch.
- **`queueThumbAction` dialog uses `#dialogOverlay` directly:** for isolated dialog injections, `.onclick` assignment after `innerHTML` is cleaner than delegation.
- **iOS ghost-click:** any overlay gaining `pointer-events:auto` synchronously can receive the deferred tap. Double-rAF before opening overlays. Applied to price review sheet, cover picker, `#modalOverlay`.
- **iOS `getElementById` after `appendChild`:** build all content inline before appending — two-step construction is fragile on iOS.

## CSS & Z-index

- **Z-index scale:** `--z-sheet:1000` · `--z-dialog:2000` · `--z-fullscreen:3000` in `:root`. Never duplicate.
- **CSS vars in inline styles on iOS Safari:** `z-index:var(--z-dialog)` silently fails in inline style attributes. Always hardcode z-index values in inline styles.
- **Magi-Sheet:** `.magi-sheet-overlay` uses `opacity` + `pointer-events` (not `display:none`). Toggle `.is-active`. `.magi-sheet` slides via `transform: translateY`.
- **`position:absolute` inside `overflow:auto`:** without `position:relative` on the scroll container, absolute children anchor to the nearest positioned ancestor. Always add `position:relative` to the containing block.
- **`text-align:center` ≠ truly centered.** Use `display:flex; align-items:center; justify-content:center` for full viewport centering.
- **`last-child:border-none` as an inline style is a no-op.** Write as `.foo:last-child { border-bottom:none }` in stylesheet.
- **Check existing CSS rules before adding inline styles.** Grep the CSS file for the container class first.

## Cover Images

- **`loading="lazy"` + CSS `display:none` on iOS Safari:** iOS may skip lazy loading even with inline `display:block` override. Remove `display:none` from CSS; control with inline style + `onload`/`onerror`.
- **`position:absolute` skeleton pattern:** `.book-cover-ph` `position:absolute;top:0;left:0` overlays the img. `onload` hides placeholder; `onerror` hides img. Never `display:none` on the img itself.
- **`onload`/`onerror` cover reveal:** img starts `style="display:none"` (inline); `onload` sets `display:block` + hides placeholder. Placeholder visible during load = natural skeleton.
- **Never proxy-fetch inside `onerror` on list/grid items:** triggers waterfall of simultaneous HTTP requests. Only proxy at save time. `this.style.display='none'` is the correct `onerror` for grid cards.
- **`nextElementSibling` > `nextSibling` in inline handlers.** `nextSibling` can return a text node.
- **`cover_source` values:** `'supabase_storage'` (CA in bucket) · `'magicref'` (hotlink). Query `cover_url` directly — don't scrape MagicRef page HTML.
- **`entry.c` in CONJURING_DB is NOT always CA.** Can be `M:filename` (MagicRef). Scan `entry.i[]` for `C:` codes to find actual CA images.
- **`_isMagicRef(entry)`:** `!!entry.m` — true if entry has MagicRef page URL. Merged entries also have `m`. CA-only entries have `C:`-prefixed cover and no `m`.

## Service Worker

- **Cache key:** strip `?v=sN` query from pathname on `cache.put()` so any version variant hits the same cache entry offline.
- **Bypass SW for all external origins:** return early (no `event.respondWith`) for Supabase and any `url.origin !== self.location.origin`. SW `fetch()` uses `connect-src` CSP, not `img-src`.
- **SW version bumps don't reliably evict old SWs.** `skipWaiting()` + `clients.claim()` may not be enough. Consider `registration.update()` on page load.
- **Mutation queue insert-block:** inserts require server-assigned UUIDs. Block offline; queue only updates/deletes (stable `b._id`).
- **IDB offline fallback pattern:** `_idbSaveBooks` on every successful `loadCatalog()`; fall through to IDB only on `catch + !navigator.onLine`.
- **Offline banner z-index:** `calc(var(--z-sheet) - 1)` = 999. `body.offline-mode .nav` shifts down by banner height (37px).

## Batch & Select Systems

- **Two separate select systems in catalog.js:** `S.selectMode` ('edit'/'move') is main toolbar batch-select; `_on` is the IIFE inline bulk-select. `.bk-ov` overlay uses `e.stopPropagation()` — delegated `#booksGrid` listener not reached when `_on` active (correct).
- **Two-select-system bridge (`_bkSetOn`):** bridge with `window._bkSetOn(v)` exposed from IIFE. Sync `_tog()` to `S.selectedBooks` only when `S.selectMode==='move'`. Never merge the two systems.
- **`triggerPoof` rule:** never add `renderCatalog()` to the callback — `exitSelectMode()` already calls it.
- **`updateFilterBtn()` must be called in ALL `renderCatalog` exit paths.** Early-return on `!books.length` previously skipped it — stale count in "Show X Books".

## Pricing & Settings

- **`getConditionPct(condition)`:** reads `S.settings.condPct_fine/vg/good/fair`, divides by 100. Keys: `'Fine'`, `'Very Good'`, `'Good'`, `'Fair'`. Defaults 100/80/60/40.
- **`saveSettings(skipCurrencyGuard)`:** pass `true` to bypass currency change guard (used by confirm callback to complete save after approval).
- **`updatePriceLabels(cur)`:** updates `priceLabelAdd`, `costLabelAdd`, `priceLabelEdit`, `costLabelEdit` — call on both `loadSettings` and `saveSettings`.
- **Settings panel order:** Account → Security → Currency & Marketplace → Condition Presets → Library Settings → Price Refresh → Help & Feedback.
- **Settings tab guard:** `const _tabBtn = querySelectorAll('.tab-btn')[tabs[v]]; if (_tabBtn) _tabBtn.classList.add('active')`.
- **Market Sync reads from Supabase `price_db`**, not the static `MARKET_DB` JS object.
- **eBay Finding API fetch-failed** = network block (not quota). Quota exhaustion returns a structured error response.

## Misc Patterns

- **`passive:false` on wheel events:** required to call `preventDefault()`. Register on `document`, check `e.target.type === 'number' && e.target === document.activeElement`.
- **`decodeURIComponent` for data-attribute group keys:** `encodeURIComponent` on write; `decodeURIComponent` on read.
- **iOS scroll-to-top:** `window.scrollTo(0,0); document.body.scrollTop=0; document.documentElement.scrollTop=0;` — repeat in 50ms setTimeout.
- **External links:** always `window.open(url, '_blank')`. Never `location.href`.
- **`const` redeclaration crash:** two files both declaring `const PUBLISHERS` throws SyntaxError on second load. Keep constants in one canonical file.
- **Duplicate `window.fn =` overwrites silently.** Last-loaded file wins. Check for cross-file duplicates when a feature appears wired but doesn't fire.
- **`el.style.display` reflects inline styles only.** `el.style.display !== 'none'` returns `true` when display is CSS-only (style is `''`). Use positive match `=== 'block'`.
- **Profile fetch timeout pattern:** `Promise.race([supabaseFetch, new Promise(r => setTimeout(() => r({data:null}), 5000))])`.
- **`toggleDrafts(btn):`** expects a real DOM element — calling with `null` crashes. Set `S.showDrafts = true` directly and call `renderCatalog()` instead.
- **`toggleDrafts` null crash:** `#showWishlistChip` doesn't exist. Always null-guard: `const el = getElementById(id); if (el) el.classList.remove('active')`.
- **`showSplash()` must be first in DOMContentLoaded:** any throw before it leaves splash permanently visible.
- **Blocking CDN `<script>` in `<head>` hangs DOMContentLoaded.** All critical scripts must be served locally.
- **`node --check` after every deeply nested async block.** Extra `}` in try/if/for is invisible to the eye but kills the JS parser.
- **Lazy DB load timing:** `loadStaticDBs()` fires at start of `onAuthSuccess()` — DBs ready before user reaches features that need them.
- **`ms-actions-secondary` full-width button:** override per-button with `style="width:100%"` or `grid-column:1/-1` to span a 2-col grid.
- **Queue progress helpers:** `_setQueueProgress(label, pct)` + `_clearQueueProgress()` in `catalog.js`, exposed on `window`.
- **`showView('home')` uses tab index -1:** intentional — no desktop tab gets highlighted for home.
- **`renderHomeView()` is called twice on load:** once from `showView('home')` (empty), once from `loadCatalog()` success (populated). Progressive display by design.
- **Bottom nav z-index 150:** above sticky nav (100), below Magi-sheets (1000) and dialogs (2000).
- **Flex override in grid container:** `resultsEl.style.display='flex'` inline overrides CSS `display:grid`. `resetPickerState()` restores `display:grid`.
- **`dotenv` resolves `.env` relative to CWD:** always `cd scripts/` before running any script that uses dotenv.
- **QTTE slug:** `/p/category/Title_Words_Here-NNNNN` — strip `-NNNNN`, replace `_` with spaces.
- **QTTE scraper data quality:** publisher fragments under 4 chars are regex garbage. `html.unescape()` required for HTML entities.
- **Murphy's price_db norm_key uses Last-First author.** Won't match book_catalog (First Last). Migrate forward; don't fix backward.
- **`toTitleCasePublisher`:** strip HTML entities + state codes (`/,\s*[A-Za-z]{2}\.?\s*$/`) before matching against PUBLISHERS list.
- **`const` in Node.js vm scripts doesn't leak to context.** Use IIFE wrapper `vm.runInNewContext('(function(){ ...src...; return VAR; })()')`.
- **magilib-admin has no GitHub remote.** `git push` will fail silently.
- **`toggleReveal` pattern:** `input.nextElementSibling` reaches the button inside `.auth-pw-wrap`; swap `input.type`; swap button innerHTML.
- **`IIFE injection`:** removing a button means disabling its injector in the IIFE wrapper, not just the static HTML.
- **PWA cache-busting:** bump `?v=sN` on script tags + `CACHE_NAME` each session.
- **Conjuring DB compound author format:** `"First1 & SecondFull Last1"` — last word = First Author's surname. Guard: `first1.includes(' ')` → leave alone.
- **Supabase `.or()` with title strings** → apostrophes/parens/spaces = PostgREST errors. Use sequential `.ilike()` queries.
- **SW `fetch()` uses `connect-src` CSP, not `img-src`.** Return early (no `event.respondWith`) for all external origins.
- **`datalist injection pattern`:** build `DocumentFragment`, append all `<option>` nodes, single `dl.appendChild(frag)`. Guard with `dl.dataset.loaded`.
- **`resetPickerState()` must clear `.cover-picker-opt.active`** — stale class references silently fail.
- **`uploadCoverFromPicker` must close the picker** — `classList.add('hidden')` after setting cover.
- **`debounce(fn, delay)` in catalog.js.** `filterCatalog` = debounced `renderCatalog`. Direct calls (e.g. clearSearch) bypass it.
- **Batch bar:** `#batchActionsBar` — `.is-visible` toggle. `#batchActionsStack` innerHTML injected by `updateBatchBar()`.
- **Cover zoom:** `zoomCover(imgSrc)` creates `.ms-zoom-overlay` on `document.body` — not static DOM.
- **Insights bar:** `renderStatsRow()` → `.insights-bar` inline compact stats.
- **Title matching:** use `startsWith()` not `includes()` — `includes()` causes false positives on short common phrases.
- **CSS animation as JS-independent splash fallback:** `animation: splashTimeout 0.6s forwards 6s` auto-hides splash after 6s regardless of JS state.
- **`openEditForm(id)` in `books.js:27`.** Takes `b._id`.
- **`price_db` schema:** `norm_key`, `source`, `price`, `currency`, `url`, `raw`, `in_print`. No `title`/`author`. `price_master` does not exist.
- **`book_catalog.cover_source` values:** `'supabase_storage'` (CA in bucket) · `'magicref'` (hotlink).
- **`_applyConditionAdjustment` placement:** in `catalog.js` (where `getConditionPct` and `currSym` live) — no imports needed.
- **Search algorithm:** Fuse.js `threshold: 0.3`. Keys: `['title','author','publisher','year']`. Falls back to `.includes()` if Fuse not loaded. Results stored in a `Set` → O(1) `.has()` in filter pass.
- **`signOut()` before `signUp()`:** always `await _supa.auth.signOut()` first.
- **FX rates:** hardcoded (USD→AUD 1.55, GBP→AUD 2.02) in catalog.js + ui.js + pricing.js. Phase 2: migrate to `fx_rates` table.
- **`afterSplash()` must call `loadCatalog()`:** for returning users, `checkChangelog()` is the only branch.
