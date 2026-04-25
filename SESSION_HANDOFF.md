# SESSION HANDOFF — 2026-04-25 (Session 54)

## Session Summary
Two z-index bugs fixed. No new features. No JS changes — CSS and HTML only.

---

## What Was Built/Changed This Session

### assets/css/magilib.css
- `--z-nav:100` → `--z-nav:400` in `:root`
- `.nav` rule: `z-index:100` → `z-index:var(--z-nav)` (400)
- **Root cause fixed:** `.nav` (`position:sticky; z-index:100`) created a stacking context at z:100 in root. The `.user-dropdown` (z:200) is inside `.nav`'s stacking context, so from root it was effectively z:100 — below the `.catalog-toolbar` (z:300) added in Session 53. Raising nav to z:400 puts the entire nav stacking context above the toolbar.

### index.html
- Moved `#coverPickerOverlay` block from before `#editModalOverlay` (old line 823) to after it (now line 896)
- DOM order is now: `#editModalOverlay` (z:2000) → `#coverPickerOverlay` (z:2500) → `#zoomOverlay`
- **Root cause fixed:** z-indexes were technically correct (2500 > 2000, both direct body children). The "sometimes" behaviour was iOS Safari's compositing layer bug — `.modal` has `-webkit-overflow-scrolling:touch` which promotes it to a compositing layer that can paint above `position:fixed` siblings ignoring z-index, falling back to DOM order. Cover picker was earlier in DOM, so edit card won. Moving cover picker after edit modal ensures DOM-order tiebreaking always favours the cover picker.

---

## Unresolved / Carried Forward

- **Feature 8 — Onboarding device walkthrough**: still needs first test on device. Key flows:
  - New user → wizard fires with dark step 0 hero (not blank white)
  - Skip visible on steps 0–3, hidden on step 4
  - Swipe left/right navigates steps
  - Finish with name → lands on Library, "All set!" toast
  - Finish via skip-username link → lands on Library, "All set!" toast
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

- **Copies badge CSS**: `.copies-badge` uses `position:absolute; top:7px; right:7px` relative to `.book-card`. Verify still appears at top-right in both grid and list view.

- **Catalog toolbar sticky top**: `position:sticky; top:0`. Verify no overlap with nav on device.

- **Beta launch checklist**: Settings and Onboarding re-test remaining.

---

## Next Session Priorities
1. **Device walkthrough — Onboarding** (all bugs fixed, now dropdown behind toolbar fixed too)
2. **Device walkthrough — Settings** (re-test)
3. **Beta launch prep** if both walkthroughs pass

---

## Model Learnings This Session

- **`position:sticky` + explicit z-index creates a stacking context in root**: `.nav { position:sticky; z-index:100 }` means the entire nav — including absolutely-positioned children like `.user-dropdown` — is in a stacking context at z:100 from root's perspective. A child's own `z-index:200` is only relevant within the nav's stacking context, not root. A sibling at z:300 (the toolbar) paints above the entire nav. Fix: raise the nav's own z-index.

- **iOS compositing layer bug with `-webkit-overflow-scrolling:touch`**: On older iOS Safari, elements with `overflow-y:auto` and `-webkit-overflow-scrolling:touch` are promoted to compositing layers that can paint above `position:fixed` siblings regardless of z-index, falling back to DOM order (later = on top). Fix: ensure the element that should be on top is later in the DOM. This is more reliable than fighting the iOS compositing system.

- **Always check DOM order alongside z-index for `position:fixed` sibling stacking**: When two siblings both create stacking contexts (e.g., both `position:fixed` with explicit z-index), z-index is the primary sort. But on iOS Safari with compositing, DOM order is the real tiebreaker. The correct architecture is: higher z-index AND later in DOM for the element that must be on top.
