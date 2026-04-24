# SESSION HANDOFF — 2026-04-25 (Session 49)

## Session Summary
Feature 5 (Status) code review + two bugs fixed + device walkthrough ✅. Feature 6 (Pricing) device walkthrough ✅ — no code changes needed. Wishlist UX flagged as pre-beta layout polish.

---

## What Was Built/Changed This Session

### Feature 5 — Status code review + device walkthrough ✅
- Subagent code review identified two real issues; both fixed before device test
- Device walkthrough: all 3 flows confirmed on device (Mark Sold, + Wishlist, Move to Library)

### Bug Fix 1 — Dead toggleSold removed
**catalog.js**
- Removed stale `toggleSold()` (lines 1712–1723) — no-confirmation, no-offline version
- books.js version (with magiConfirm + offline queue) was already the live one; catalog.js version was unreachable dead code

### Bug Fix 2 — addWishlistItem offline guard
**ui.js**
- Added `if (!window._isOnline)` check before Supabase insert in `addWishlistItem()`
- Inserts can't be queued (no server-assigned ID), so block early with friendly toast instead of letting Supabase throw a network error

### Feature 6 — Pricing device walkthrough ✅
- No code changes. Fetch estimate (Add) + stored price display + eBay link (Library) all confirmed working.

### CLAUDE.md updates
- Bumped session 48 → 49
- Status block: Status ✅ Pricing ✅, next: Settings (Feature 7)
- Beta checklist: Status + Pricing checked off
- Wishlist UX moved to Phase 2 Backlog as P3 pre-beta

---

## Unresolved / Carried Forward

- **Feature 7 — Settings**: code review → device test (profile, security, currency, condition presets, stat cards, CSV export/import) — not started
- **Feature 8 — Onboarding**: welcome + feature tour — not started
- **Wishlist UX polish**: pre-beta, small layout changes only — not started

---

## Next Session Priorities
1. **Feature 7 — Settings**: subagent code review → device walkthrough
2. **Wishlist UX polish**: small layout fixes (can be parallelised or done after Settings)

---

## Model Learnings This Session

- **Dead function collision in non-module scripts**: `async function foo()` at global scope creates `window.foo`. When two scripts define the same function name, the last script to load wins — `window.foo = foo` assignments made earlier are silently overwritten. Always grep for duplicate global function names when debugging unexpected behavior.
- **Wishlist inserts can't be queued offline**: Offline queue pattern (`_mgQueuePush`) only works for updates/deletes — these need a known `_id`. Inserts require a server-assigned UUID and must be blocked before attempting, with a clear "you're offline" toast. Don't let the Supabase network error surface to the user.
