# SESSION HANDOFF — 2026-04-25 (Session 51)

## Session Summary
Two bug fixes (stats denominator + price refresh wishlist leak) + Feature 8 (Onboarding) — full-screen 5-step wizard replacing the old welcome card + modal approach.

---

## What Was Built/Changed This Session

### Bug Fix 1 — Stats bar showed global total, not section total
**catalog.js**
- `sectionTotal` computed per-section: library books only when in library view, sold-only in sold view, drafts-only in drafts view, wishlist-only in wishlist view
- Both the loading placeholder (`— / N`) and the final count use `sectionTotal` instead of `S.books.length`
- Removed `wishlistTotal` local variable (folded into `sectionTotal`)
- Root cause: `S.books.length` includes all books regardless of section — wishlist items were inflating the denominator in library view

### Bug Fix 2 — Refresh All Prices (Settings) showed wishlist books
**ui.js** (`startBulkPriceRefresh`)
- Added `b.sold !== 'Wishlist'` to the filter alongside existing `!== 'Sold'` and `!== 'Draft'`
- Root cause: wishlist books are not sold, not drafted — they passed the old filter silently

---

### Feature 8 — Onboarding (full-screen wizard)

#### Architecture change
- **`afterSplash()`** (`ui.js:779`): new users now go directly to `openWizard(false)` — the intermediate `#welcomeScreen` card is no longer shown. Welcome card HTML kept in DOM for backwards compat but unreachable in the new flow.
- Settings "Revisit tour" button still calls `openWizard(true)` — `_wizardFromSettings = true` prevents redirecting away from Settings on close.

#### HTML — `#wizardOverlay` rewrite (`index.html`)
- Removed: `.modal-overlay`, `.modal` wrapper (max-width:540px), `wizardProgress` bar, `btn-icon-dismiss` ×
- New: `position:fixed;inset:0;z-index:9998` — truly full-screen, same z-level as auth screens
- Top bar: `#wizardDots` (progress dots) + `#wizardSkipBtn` ("Skip" text button, always visible except last step)
- Scrollable `#wizardStepContent`
- Bottom bar: `#wizardBackBtn` (hidden on step 0) + `#wizardNextBtn` (flex:1, 46px tall)
- `padding-bottom: max(20px, env(safe-area-inset-bottom))` — handles iPhone home indicator

#### JS — wizard logic (`ui.js`)
- `WIZARD_STEPS = 5` (was 4)
- `_wizardFromSettings` flag — controls whether close/skip redirects to home+catalog or stays in current view
- `skipWizard()` — new function, wraps `closeWizard(true)` + conditional navigation; wired to Skip button
- `wizardSkipUsername()` — updated: no longer just advances to next step; now closes the whole wizard (it's the last step) with "All set!" toast
- `wizardNext()`: username validation moved to `wizardStep === 4` (was 0); final-step close now also calls `loadCatalog()` + `checkChangelog()`
- Touch swipe: IIFE wired to `document` touchstart/touchend — left swipe = next, right = back, 60px threshold. Guards check `wizardOverlay.classList.contains('hidden')` so swipe doesn't fire when wizard is closed.

#### 5-step content (all full-screen hero treatment)
- **Step 0 (Welcome):** Dark `#1a1625` hero with logo + "v1.0 beta", then "Your magic library, beautifully organised." headline + 3 feature pills (Catalogue · Value · Search). Next = "Start tour →"
- **Step 1 (Add):** Accent-coloured hero + pencil icon + "Add in seconds". Content: 3 method pills (Scan cover · Type title · Batch add). "1 of 3"
- **Step 2 (Library):** Paper-warm hero + search icon. "Find anything instantly". 3 feature pills (Fuzzy search · Filter · Sort). "2 of 3"
- **Step 3 (Pricing):** Paper-warm hero + dollar icon. "Know what it's worth". Tip box about condition presets. "3 of 3"
- **Step 4 (Name):** Dark hero + person icon + "One last thing". Display name input (pre-filled). "Skip — I'll set this later in Settings" link. Next = "Finish →". Skip button hidden on this step.

---

## Unresolved / Carried Forward

- **Feature 7 — Settings device walkthrough**: still needs re-test. Skipped again this session to build Feature 8. Key flows:
  - Condition preset save → toast fires
  - Display name → no Google Save Password prompt on desktop
  - CSV template download → headers only, no example rows
  - CSV import → result card shows, persists, dismissable with ×
  - Edit title field → Conjuring DB dropdown appears while typing
  - Delete from Edit modal → edit card closes after confirm
- **Feature 8 — Onboarding device walkthrough**: needs first test on device. Key flows:
  - New user → full-screen wizard fires (not welcome card)
  - Skip visible on steps 0–3, hidden on step 4
  - Swipe left/right navigates steps
  - Finish → lands on Library with catalog loaded
  - Skip → lands on Home with catalog loaded
  - Settings "Revisit tour" → wizard opens; close stays on Settings
  - Returning user → wizard does NOT fire (welcomeSeen flag)
- **Beta launch checklist**: Settings and Onboarding re-test remaining before beta

---

## Next Session Priorities
1. **Feature 7 — Settings device walkthrough** (still pending from Session 50)
2. **Feature 8 — Onboarding device walkthrough** (first test)
3. **Beta launch prep** if both walkthroughs pass

---

## Model Learnings This Session

- **Wizard step numbering shift**: When inserting a new step 0 into an existing wizard, every `if (wizardStep === N)` block in `wizardNext()` must shift. Easy to miss — always grep all step-number comparisons before changing `WIZARD_STEPS`.
- **`_wizardFromSettings` flag pattern**: When the same overlay can be opened from two different contexts (onboarding vs. Settings), store the context at open time as a module-level flag rather than passing it through every function in the call chain. Cleaner than threading `fromSettings` through `closeWizard`, `skipWizard`, `wizardSkipUsername`, etc.
- **Touch swipe IIFE guard**: Swipe listeners wired to `document` need an explicit guard checking that the overlay is visible — otherwise they fire whenever the user swipes anywhere in the app.
- **`env(safe-area-inset-bottom)` on full-screen overlays**: Any `position:fixed;inset:0` overlay that has a bottom action bar needs `padding-bottom: max(Npx, env(safe-area-inset-bottom))` to avoid the iPhone home indicator covering the CTA button.
