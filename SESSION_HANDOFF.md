# SESSION HANDOFF — 2026-04-16 (Session 26)

## Session Summary
Two workstreams: continued CSS formatting cleanup (FAQ bug fix, source evidence rows, empty/loading states), then diagnosed and fixed a cover image display bug affecting the library grid on iOS Safari.

---

## What Was Built/Changed This Session

### 1. `assets/css/magilib.css`
- **`.book-cover img`**: removed `display:none` — was causing iOS Safari to skip lazy-loading images entirely when CSS `display:none` was present even though inline `style="display:block"` overrode it. Now just `width:100%;height:100%;object-fit:cover`.
- **`.catalog-loading`**: new — flex-centered spinner wrapper (`display:flex;align-items:center;justify-content:center;min-height:50vh`)
- **`.empty-search-container`**: added `width:100%`
- **`.src-evidence-wrap/heading/row/dot/label/link/price`** etc: 16 new source evidence row classes
- **`.faq-item/btn/question/chevron/answer/answer-body`**: 7 new FAQ accordion classes (plus `:last-child` border fix)
- **`.copy-thumb img`**, **`.copy-info`**, **`.copy-info-top`**, **`.copy-price`**, **`.copy-meta`**, **`.copy-chevron`**, context overrides for `.sold-badge`/`.draft-badge` in copy rows

### 2. `catalog.js`
- **Book card cover template** (line ~785): switched from CSS `display:none` + inline `display:block` pattern to `onload`/`onerror` pattern:
  - img starts `style="display:none"` 
  - `onload`: `this.style.display='block'; this.nextSibling.style.display='none'` — reveals img, hides placeholder atomically
  - `onerror`: `this.nextSibling.style.display='flex'` — shows placeholder
  - `.book-cover-ph` no longer conditionally inline-hidden — shows as skeleton while image loads
- **Loading state** (line 520): inline div → `.catalog-loading`
- **Error state Retry button** (line 598): inline styles removed (`.empty-state button` covers it)
- **Empty search container** (line 701): 6 redundant inline style attrs stripped
- **Source evidence rows** (`buildSourceRow`, lines ~1068–1116): 13 inline style attrs → `.src-*` classes
- **Copy-row template** (lines ~897–915): 9 inline attrs → `.copy-*` classes

### 3. `ui.js`
- **FAQ template** (~lines 800–810): 8 inline style attrs → `.faq-*` classes
- **`toggleFaq`** (line 868): fixed `answer.style.display !== 'none'` → `answer.style.display === 'block'` — first-tap-does-nothing bug caused by CSS `display:none` initial state not matching inline style check

---

## Bug Fixes

- **FAQ first-tap bug**: `toggleFaq` checked `!== 'none'` but `.faq-answer` had no inline style initially (CSS-only `display:none`). Empty string `!== 'none'` evaluated as "open", causing first tap to be a no-op. Fixed by checking `=== 'block'` instead.
- **Book covers not showing on iOS**: `.book-cover img { display:none }` in CSS + `loading="lazy"` caused iOS Safari to skip lazy loading. Fixed with `onload`/`onerror` reveal pattern and removing `display:none` from CSS.
- **Loading spinner centering**: was `text-align:center` only. Fixed with flex-centering in `.catalog-loading`.
- **FAQ last-item border**: `last-child:border-none` in old inline style was a no-op invalid CSS property. Fixed with proper `.faq-item:last-child { border-bottom:none }` rule.
- **Source evidence last row border**: no suppression existed. Added `.src-row:last-of-type { border-bottom:none }`.

---

## Known Issues / Still Pending

- **Beta readiness walkthrough**: auth → add → search → edit → price → settings — still needed on device. Carried forward since Session 13.
- **Search dropdown author line**: author often missing — CONJURING_DB data gap, not a code bug.
- **eBay API**: fetch-failed on network — 2,021 manual CSV rows in price_db, 0 live API rows.
- **Remaining inline styles**: book card grid (~783–794 minor items), modal header (~1175–1199), price review sheet row (~1432–1445), tutorial slides (ui.js ~226–259), feedback tab (ui.js ~817–824).
- **CONJURING_DB bad entry**: one entry has `"c":"Image Address"` which stores a non-URL as cover_url. Low priority — affects one book.

---

## Next Session Priorities (Session 27)

1. **Beta readiness walkthrough**: auth → add → search → edit → price → settings — full end-to-end QA on device. This is the real gate before beta launch.
2. **Verify cover fix**: confirm book covers now display correctly on device after the `onload`/`onerror` pattern change.

---

## Model Learnings
- **`loading="lazy"` + CSS `display:none` on iOS Safari**: even when an inline `style="display:block"` overrides the CSS, some iOS Safari builds skip lazy loading the image because they evaluate the CSS rule `display:none` before inline styles. Fix: remove `display:none` from CSS entirely; control initial visibility with inline style + `onload`/`onerror` handlers.
- **`toggleFaq` CSS initial state**: when element visibility is controlled by CSS (not inline style), JS checks like `el.style.display !== 'none'` return the wrong answer — `el.style` only reflects inline styles, not computed styles. Always check `el.style.display === 'block'` (positive match) rather than `!== 'none'` (negative match on empty string).
- **`onload`/`onerror` cover pattern**: img starts `display:none` (inline), `onload` shows img + hides placeholder, `onerror` shows placeholder. Placeholder visible during load = natural skeleton. No CSS fighting inline styles.
