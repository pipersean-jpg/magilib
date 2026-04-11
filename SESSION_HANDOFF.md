# SESSION HANDOFF — 2026-04-11 (Session 15)

## Session Summary
Confirmed Library detail layout is beta-complete. Applied 3 quick cosmetic fixes. Logged a full backlog of UI/UX improvements for next sprint.

---

## What Was Built/Changed This Session

### 1. Confirmed Library detail layout as beta-complete (no code change)
The 2×2 button grid (Market Value · Check eBay · Edit Details · Mark Sold) + lazy Market Sync panel is the intended beta UX. Do NOT replace before Phase 2.

### 2. `index.html` + `catalog.js` — remove icons from Edit and Filter toolbar buttons
- Removed SVG checkmark icon from `editModeBtn` in HTML
- Removed ⊿ from `filterMenuBtn` in HTML
- Removed SVG icon from `editModeBtn` label in `toggleMoveMode()` and `exitSelectMode()` in catalog.js

### 3. `index.html` + `assets/css/magilib.css` — Take Photo button: no always-on purple
- Removed `primary-action` class from Take Photo label in HTML
- Removed `@media(max-width:599px) .camera-btn.primary-action` always-on block from CSS
- Added `:active` state for ALL camera buttons: purple bg, white text, white icon SVG stroke

### 4. `catalog.js` — Check eBay always opens in new tab
- Simplified `openEbayModal()` to always use `window.open(_blank)` — removed mobile `location.href` workaround

---

## Library Detail — Current State (LOCKED for Beta)

The 2×2 button grid in the book detail sheet is complete and correct:
- **Market Value** — taps to expand Market Sync panel (lazy-loads from `price_db` via `toggleMarketSync()` / `loadMarketSync()`)
- **Check eBay** — opens eBay search in new tab
- **Edit Details** — opens edit form
- **Mark Sold** — toggles sold status

The Market Sync panel (`#marketSyncSection`) loads on demand below the buttons. This is the intended beta UX. Do NOT remove or replace with a "stored price + tap-to-edit" pattern — that is Phase 2.

---

## Known Issues / Still Pending

- **eBay API**: fetch-failed on network (not quota) — still 0 live API rows, 2,021 manual CSV rows in price_db
- **QTTE/Penguin**: may have stale matches — rerun scrapers in Phase 2
- **FX rates**: still hardcoded (USD→AUD 1.55, GBP→AUD 2.02) — Phase 2 migration fully specced in CLAUDE.md

---

## Low Priority UI/UX Backlog (next sprint, post-beta or Phase 2)

- [ ] **Price conversion**: prices don't convert after currency change in Settings — requires FX logic + stored currency column (Phase 2 arch)
- [ ] **In-app popups audit**: all system-style alert/confirm popups must be replaced with styled in-app equivalents — audit needed
- [ ] **Global centering rule**: all icons, toasts, loading spinners, empty states, popups must be centred on screen — CSS audit needed
- [ ] **Move toast: remove Wishlist option** — redundant when book is already owned; remove Wishlist button from Move batch bar
- [ ] **Slimmer batch action bar** — side-by-side button layout, better for mobile
- [ ] **Remove Move mode entirely?** — evaluate whether Move adds value or is just clutter; consider folding into Select flow
- [ ] **Condense sort options** — replace long list with per-option asc/desc toggle (e.g. Title >/< or Date >/< )
- [ ] **Filter popup: add X button** — global policy: all popup windows need an X/close button to exit without applying changes
- [ ] **Replace Edit/Move/Filter with Select + Filter** — Select activates checkbox mode on all covers; bottom bar shows Modify + Cancel; Modify popup offers: Update Price / Auto Fill / Mark Sold (Library) or Move to Library (Wishlist) / Delete (with "type DELETE" confirmation). Cancel deselects all.
- [ ] **Button contrast audit** — all buttons on Library, Wishlist, Add, Settings must contrast with their background (no white-on-white)
- [ ] **Desktop/mobile detection for Take Photo** — hide "Take Photo" (camera capture) option on desktop; show only on mobile (navigator.userAgent or media query)
- [ ] **Add page: price + condition not required** — only Title and Author/Subject should be required fields
- [ ] **Tab-switch with unsaved Add data** — replace toast with slide-up sheet: "Changes won't be saved" header, Continue (dismiss only) + Discard Changes (clear fields + switch tabs)

---

## Next Session Priorities (Session 16)
1. **Beta readiness walkthrough**: auth → add → search → edit → price → settings — full end-to-end QA on device
2. **Wishlist price label**: verify currency label shows correctly on device after Session 14 fix
3. **Low priority backlog**: tackle any remaining quick wins from the backlog above

---

## Model Learnings
- **Library detail layout is final for beta.** The 2×2 btn-action grid + lazy Market Sync panel is intentional. Do not refactor before Phase 2.
- **Camera button `:active` pattern**: use `:active` pseudo-class (not a persistent class) for press-highlight. Include `svg{stroke:#fff}` inside `:active` rule so icon goes white when background goes purple.
- **eBay new tab**: `openEbayModal()` now always uses `window.open(_blank)`. The old mobile `location.href` workaround is removed — if white-screen-on-back resurfaces on iOS, investigate then rather than pre-empting.
