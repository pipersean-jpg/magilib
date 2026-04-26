# MagiLib QA Report — 2026-04-26

**URL:** https://magilib.vercel.app/  
**Viewport:** 390×844 (iPhone 14 simulation)  
**Account:** piper.sean+byron@gmail.com (new-ish user, wizard shown)  
**Tool:** Playwright 1.59.1 · Chromium · 22 screenshots captured  

---

## Summary

| | Count |
|--|--|
| 🟠 Confirmed Bugs | 4 |
| 🟡 Warnings / UX Issues | 8 |
| ✅ Passing Checks | 37 |
| Console errors | 0 |
| Network failures | 0 |

---

## 🟠 Confirmed Bugs

### BUG 1 — Changelog modal blocks all navigation after first login

**Area:** `#changelogOverlay`  
**Symptom:** After wizard completion, the changelog modal fires immediately. All bottom-nav buttons (Home, Library, Add, Wishlist, Settings) are intercepted by the changelog overlay — no tap works until user finds and presses "Got it".  
**Impact:** First-run blocker. Any new user who doesn't notice the changelog cannot navigate.  
**Fix:** Either (a) don't auto-show changelog on first login / immediately after wizard, or (b) render the changelog before the wizard fires, or (c) ensure it only shows on returning users who haven't seen it yet.

---

### BUG 2 — Toast "Loaded 200 books" overlaps bottom nav, blocks taps

**Area:** `#toast`, `#bottomNav`  
**Symptom:** After navigating to Library, a green "Loaded 200 books" success toast renders at bottom of screen and overlaps the bottom nav. The toast persists for ~8+ seconds. All bottom-nav taps are intercepted by the toast during that window.  
**Impact:** Every Library load blocks nav for ~8s. On slow connection could be longer.  
**Fix:** Position toast above the bottom nav (`bottom: calc(65px + env(safe-area-inset-bottom))`), or shorten toast duration to 2–3s, or add `pointer-events: none` on the toast so it doesn't intercept taps.

---

### BUG 3 — Filter/Sort button is outside the viewport on iPhone 14

**Area:** Catalog toolbar / filter button  
**Symptom:** The filter button exists in the DOM but its bounding rect places it outside the 390×844 viewport. Tap does nothing on a real device.  
**Impact:** Filter and sort completely inaccessible on iPhone 14 (390px wide).  
**Fix:** Check catalog toolbar layout at `max-width: 390px`. Likely a flex overflow or fixed positioning issue pushing the button off-screen.

---

### BUG 4 — Search may not filter on input event (needs manual verify)

**Area:** `#searchInput` / Fuse.js  
**Symptom (automation):** Dispatching an `input` event to `#searchInput` returned all 198 books unchanged. Fuse.js did not filter.  
**To verify manually:** Type "Erdnase" in the search bar on device. If results filter correctly, this is an automation limitation only. If they don't, Fuse.js is wired to the wrong event.  
**Fix if real:** Ensure search handler listens to both `input` and `keyup`.

---

## 🟡 Warnings / UX Issues

- **A11y — 16 tap targets below 44px (Apple HIG minimum):**
  - `#userMenuBtn` "PI" avatar: **32×32px** — most critical, tapped constantly
  - "Update Password" button: **301×41px** (3px short)
  - "Download Template" button: **163×32px**
  - "Refresh All Prices" button: **163×40px**
  - Plus ~11 others

- **A11y — 5 cover images missing `alt` text:** `3689a.jpg`, `windasirepertoire.jpg`, `186a.jpg` + 2 others.

- **Add view — form fields require scroll, no auto-focus:** `#f-title` / `#f-author` not in visible viewport on load. Users may not realize manual form is below the scan button.

- **No eBay link in detail modal for tested book ("Conover Vol 2"):** 2×2 pricing grid rendered but no eBay link shown. May be expected (no price record), but confirm the empty state is clear.

- **User menu (`#navMenu`) didn't open via avatar tap:** May be a 32×32px miss or a toggle-class pattern. Needs manual verify.

- **Wizard only 2 steps for this account:** Confirm this is intentional.

- **Home stat cards flash "—" before data loads:** All 3 stat cards show "—" briefly on render. Consider a skeleton loader.

- **Filter sheet opacity stays 0:** Tied to BUG 3 — button is off-screen so the click never lands.

---

## ✅ Confirmed Working

- **Auth:** Google button, email/password, forgot password, "Create one" sign-up link, empty-submit validation, invalid-creds error
- **Protected routes:** `#catalog`, `#add`, `#settings`, `#wishlist` all require auth — no bypass
- **Performance:** Page load ~575ms
- **Zero console errors, zero network failures**
- **No horizontal overflow** on any view (Home, Catalog, Add, Wishlist, Settings, detail modal, edit modal)
- **Library:** 198 books load correctly
- **Book detail modal:** Opens on tap, correct content, scrolls, no overflow
- **Edit modal:** Opens from detail, has title/author/artist/publisher/year fields, Cancel closes correctly
- **Wishlist view:** Renders
- **Settings:** Sign-out button, currency selector, CSV export/import all present
- **Onboarding wizard:** Advances, Skip works, dismisses
- **Changelog modal:** "Got it" button dismisses correctly

---

## Fix Priority for Beta Launch

```
MUST FIX:
1. BUG 2 — Toast covers bottom nav → pointer-events:none OR reposition above nav
2. BUG 1 — Changelog blocks nav → don't auto-show immediately after wizard
3. BUG 3 — Filter button off-viewport at 390px → fix catalog toolbar layout

SHOULD FIX:
4. #userMenuBtn 32×32px → min 44×44px tap target
5. 5 cover images missing alt text

VERIFY ON DEVICE:
6. BUG 4 — Type "Erdnase" in search, confirm filtering works
7. Confirm no eBay link on Conover Vol 2 is expected
```

---

Screenshots: `magilib-qa/screenshots/` (22 frames)
