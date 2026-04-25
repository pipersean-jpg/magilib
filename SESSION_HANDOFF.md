# SESSION HANDOFF — 2026-04-25 (Session 55)

## Session Summary
Feature 8 onboarding bugs fixed (6 issues across 3 files). No new features. Auth double-splash bug resolved.

---

## What Was Built/Changed This Session

### ui.js
- **Double-splash fix:** Added `_splashRunning` flag — `showSplash()` is now idempotent. `onAuthStateChange` fires with `SIGNED_IN` before `getSession()` resolves on returning-user load, causing a second `showSplash()` → second `afterSplash()`. Guard prevents this.
- **Wizard text updates:**
  - Step 0: "beautifully organised" → "stacked & memorised"
  - Step 1: "Over 1,000 magic titles" → "Over 10,000 magic titles"
  - Step 1: "Conjuring publishers" → "Major magic publishers"
- **Wizard finish destination:** Both `wizardNext()` (step 4) and `wizardSkipUsername()` now call `showView('home')` instead of `showView('catalog')`. Skip button (steps 0–3) already called `showView('home')`.

### catalog.js
- **Magic fact rotation:** Changed from day-based rotation (`Math.floor(Date.now()/86400000)%facts.length`) to per-view random (`Math.floor(Math.random()*facts.length)`). New fact shown every time Home is viewed.

### index.html
- **Edit modal autocomplete:** Added `autocomplete="off"` to all 8 text inputs in the edit modal (`edit-title`, `edit-author`, `edit-artist`, `edit-publisher`, `edit-year`, `edit-edition`, `edit-isbn`, `edit-location`) and `pickerUrlInput`. Prevents Chrome password manager from associating edit fields with stored credentials (was showing "Update password" prompt on every modal close).

---

## Unresolved / Carried Forward

- **Feature 8 — Onboarding device walkthrough**: All known bugs fixed. Still needs first full device test:
  - New user → wizard fires with dark step 0 hero (not blank white)
  - Skip visible on steps 0–3, hidden on step 4
  - Swipe left/right navigates steps
  - Finish with name → lands on **Home**, "All set!" toast
  - Finish via skip-username link → lands on **Home**, "All set!" toast
  - Skip button (top right, steps 0–3) → lands on Home
  - Returning user (wizardSeen = true) → wizard does NOT fire
  - Settings "Revisit tour" → wizard opens; close stays on Settings

- **Feature 7 — Settings device walkthrough**: still needs re-test (carried from Sessions 50/51/52)
  - Condition preset save → toast fires
  - Display name → no Google Save Password prompt on desktop
  - CSV template download → headers only, no example rows
  - CSV import → result card shows, persists, dismissable with ×
  - Edit title field → Conjuring DB dropdown appears while typing
  - Delete from Edit modal → edit card closes after confirm

- **Copies badge CSS**: `.copies-badge` uses `position:absolute; top:7px; right:7px`. Verify in grid and list view.

- **Catalog toolbar sticky top**: Verify no overlap with nav on device.

- **Beta launch checklist**: Settings and Onboarding device tests remaining.

---

## Next Session Priorities
1. **Device walkthrough — Onboarding** (all bugs fixed, re-test on device)
2. **Device walkthrough — Settings** (re-test)
3. **Beta launch prep** if both pass

---

## Model Learnings This Session

- **`onAuthStateChange` races `getSession()` on Supabase JS v2**: For returning users, `onAuthStateChange` can fire `SIGNED_IN` synchronously (or nearly so) before `await _supa.auth.getSession()` assigns `_supaUser`. The `!_supaUser` guard in the listener fires, triggering `onAuthSuccess()` → second `showSplash()`. Fix: make `showSplash()` idempotent with a `_splashRunning` boolean — subsequent calls return immediately and the already-running splash handles navigation.

- **Chrome password manager fires on modal close, not just form submit**: Chrome scans all text inputs in the page DOM. If any un-annotated `type="text"` input is present alongside `type="password"` inputs (even in a different hidden view), Chrome may associate them as credentials and prompt to save/update when a "navigation" occurs (including closing a modal). Fix: `autocomplete="off"` on every text input in the modal.
