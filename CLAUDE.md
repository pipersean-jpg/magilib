# MagiLib Project Status - 2026-04-08

## Current Project Status
- **Phase:** Block 2 (Search & Catalog Functionality) + Global Design System - **IN PROGRESS**
- **Current Focus:** Book Detail View (Magi-Sheet) refinement & button action hierarchy

## Completed Tasks ✅
- [x] Header Reordering (Add > Library > Wishlist > Settings)
- [x] Avatar Menu implementation (Display Name, Account Settings)
- [x] Version Popup & Application Branding
- [x] Scroll-to-top fix for the 'Add' page
- [x] Terminal Automation (Magic words: `handoff` and `newchat`)
- [x] Notion Hub Sync Integration
- [x] Implement Fuzzy Search (Fuse.js, threshold 0.3, keys: title/author/publisher/year)
- [x] Global Design System: Created `assets/css/magilib.css` (all styles consolidated)
- [x] Magi-Sheet pattern: `.magi-sheet-overlay` / `.magi-sheet` / `.magi-sheet-handle`
- [x] Book Detail View: Bottom sheet, typography hierarchy, pill badges, button restructure
- [x] Magi-Sheet Typography Utilities: `.ms-title`, `.ms-subtitle`, `.ms-metadata-row`, `.ms-image`

## Learnings
- **Search algorithm:** Fuse.js with `threshold: 0.3`. Keys are `['title','author','publisher','year']`. Falls back to `.includes()` if Fuse is not loaded.
- **Data source:** Catalog data lives in `S.books` (state object). There is no `window.allBooks`. Supabase fetch populates `S.books` in `loadCatalog()`.
- **Performance pattern:** Fuse results are stored in a `Set` so the filter pass uses O(1) `.has()` lookups.
- **Environment guard:** Always ignore `node_modules` during file/content searches to prevent terminal overflows.
- **CSS architecture:** ALL styles live in `assets/css/magilib.css`. Do NOT add `<style>` blocks to index.html. Do NOT inject CSS via JS (except the bulk-edit IIFE which is managed by a deploy tool).
- **Magi-Sheet pattern:** `.magi-sheet-overlay` is `position:fixed !important; top:0; left:0; width:100vw; height:100vh; z-index:1000`. It uses `opacity` + `pointer-events` (NOT `display:none`) for animation. `.magi-sheet` slides via `transform: translateY(100%) → translateY(0)`. Toggle by adding/removing `.is-active` on the overlay.
- **Book detail open/close:** `openModal()` adds `.is-active` to `#modalOverlay`. `closeModal()` removes it. Do not use `.hidden`.
- **Legacy modals** (support, changelog, wizard, etc.) still use `.modal-overlay` + `.hidden` — do NOT touch them.
- **Bulk-edit IIFE:** The `_CSS` block and `_css()` function in catalog.js are marked "Injected by deploy tool" — leave them in place, do not move to magilib.css.
- **Button hierarchy (Book Detail):** Primary row = Edit + eBay. Secondary row = Mark Sold + Wishlist (ghost style). Danger = "Delete Book" text link. No Close button.

## Workflow & Communication Rules
- **Pacing:** Maximum 2-3 steps per response.
- **Pre-Flight Check:** Always ask clarifying questions before generating major code blocks.
- **Status Updates:** Every `handoff` must include a "Learnings" section to update the model on Sean's preferences or new project logic.

## Next Session Priority 🚀
- [ ] **Search UX Polish:** Debounce the `oninput` handler on `#catalogSearch` to avoid re-rendering on every keystroke.
- [ ] **Book Detail — Action Hierarchy:** Verify the Primary/Secondary/Danger button layout renders correctly on device. Adjust sizing/spacing if needed.
- [ ] **Magi-Sheet Animation:** Confirm slide-up animation works on iOS Safari (test `cubic-bezier` easing and `-webkit-overflow-scrolling`).
- [ ] **Empty State UX:** Consider adding a "Clear search" button inside `.empty-search-container`.

## Technical Rules
- **No Frameworks:** Pure HTML/CSS/JS (PWA).
- **Styling:** All CSS in `assets/css/magilib.css`. Flexbox-first, mobile-responsive.
- **Workflow:** Run `handoff` at end; `newchat` at start.