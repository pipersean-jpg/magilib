# SESSION HANDOFF — 2026-04-19 (Session 37)

## Session Summary
Splash screen debugging and hardening. Fuse.js moved from CDN to local bundle; splash call order fixed; CSS auto-dismiss fallback added. Five bugs identified via device/desktop walkthrough — captured for next session.

---

## What Was Built/Changed This Session

### 1. `fuse.min.js` (NEW)
- Downloaded Fuse.js 7.0.0 locally (23 KB) — eliminates blocking CDN script that caused DOMContentLoaded to hang when jsdelivr was slow on mobile

### 2. `index.html` (MODIFIED)
- Fuse.js script tag changed from CDN → `/fuse.min.js?v=s37`
- All `?v=s36` script tags bumped to `?v=s37`
- `#splashScreen` div: added `animation:splashTimeout 0.6s ease forwards 6s` — CSS fallback that force-hides the splash after 6s even if all JS fails

### 3. `ui.js` (MODIFIED)
- `showSplash()` moved to the **very first line** of `DOMContentLoaded` handler, before any potentially-throwing code
- Remaining startup code wrapped in outer try/catch so a crash in `createClient` or session check can't prevent the splash from dismissing

### 4. `assets/css/magilib.css` (MODIFIED)
- Added `@keyframes splashTimeout { to { opacity:0; pointer-events:none; visibility:hidden; } }`

### 5. `sw.js` (MODIFIED)
- Cache name bumped `magilib-sw-s36` → `magilib-sw-s37`
- `/fuse.min.js` added to `SHELL_ASSETS` pre-cache list

---

## Bugs Identified This Session (Fix Next Session)

### B1 — Sign-in hangs on mobile
- Tapping Sign In on mobile does not complete — spinner or button stays stuck
- Desktop sign-in works fine
- Likely: async/await or fetch timing issue on mobile Safari; could also be a touch event vs click event mismatch on the submit button

### B2 — "Save Password" browser prompt records Display Name as username
- When navigating from Add → Library on desktop, the browser's native Save Password dialog fires
- It's treating the Display Name field (`#authUsername` / `#s-username`) as a username credential field
- Fix: add `autocomplete="off"` or `autocomplete="name"` to the Display Name input; add `autocomplete="new-password"` to non-auth password fields to suppress the prompt

### B3 — Cover picker overlay renders behind the detail sheet
- In Library → tap a book → tap "Update Cover" → the cover picker overlay appears behind the book detail sheet instead of on top
- Root cause: `#coverPickerOverlay` z-index may not be high enough when opened from the book detail modal context
- Fix: verify `#coverPickerOverlay` has `z-index: var(--z-dialog)` (2000) AND that the detail sheet isn't at an equal or higher z-index; may need to bump picker to `var(--z-fullscreen)` (3000) when triggered from detail

### B4 — Google Images link missing from cover picker
- Old layout had a direct "Google Images" button that opened a new tab with `{title} {author} book cover` pre-loaded in Google Image Search
- New cover picker (4-option list) dropped this entirely — no equivalent option exists
- Fix: add a 5th option "Search Google Images" (opens `window.open(googleImagesUrl, '_blank')`) to the `#coverPickerSourceBtns` list; wire same URL-building logic as the old button

### B5 — Can't close the detail/edit card
- In Library → book detail sheet — no visible way to close/dismiss it on device
- The close button (✕ or equivalent) may be absent, hidden, or not tappable on mobile
- Fix: verify `closeModal()` button exists and is visible at the top of `#modalOverlay`; check z-index and tap target size (min 48×48px)

---

## Next Session Priorities
1. **Fix B1 (sign-in mobile hang)** — blocks all device testing
2. **Fix B3, B4, B5 (cover picker z-index, Google Images option, modal close)** — blocks cover/edit workflow
3. **Fix B2 (Save Password prompt)** — minor UX polish
4. **Resume device walkthrough** once sign-in and cover picker are resolved

---

## Known Issues Carried Forward
- **Section 4 dirty-check**: verify `magiConfirm` fires after PWA reload (code correct, needs device test)
- **Full beta walkthrough**: Sections 2–8 still pending end-to-end device sign-off
- **Vercel deploy timing**: splash fixes (s37) pushed this session — confirm they resolve the persistent splash on next open

---

## Model Learnings This Session
- **Splash hang root cause**: `showSplash()` was at the END of `DOMContentLoaded` — any throw before it (e.g. slow CDN script blocking parse, Supabase `createClient` error) left the HTML `#splashScreen` permanently visible. Fix: call `showSplash()` first, wrap the rest in try/catch.
- **Blocking CDN script in `<head>`**: `<script src="CDN">` without `async`/`defer` blocks the HTML parser and DOMContentLoaded. All critical scripts must be served locally or marked async. Fuse.js was the offender.
- **CSS animation as JS fallback**: `animation: splashTimeout 0.6s forwards 6s` on the HTML splash element gives a pure-CSS safety net that fires regardless of JS state.
