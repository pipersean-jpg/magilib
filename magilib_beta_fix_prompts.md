# MagiLib Beta Fix Prompts

> Deduplicated, prioritized prompts for Claude Code sessions. Each prompt is self-contained and actionable.
> Derived from external review + Super Z audit of live app at magilib.vercel.app + source analysis.

---

## P1 — Performance & Load Time

### 1. Lazy-load the 4 static DB scripts after auth

The files `conjuring_db.js`, `magilib_price_db.js`, `magilib_disc_db.js`, and `magilib_market_db.js` are all `<script defer>` in `<head>`, meaning they download and parse before the user even authenticates. Move them to dynamic `import()` or `document.createElement('script')` calls that only fire after successful auth, inside the existing auth flow. Keep fallback `.includes()` search working without Fuse until `conjuring_db.js` loads. This will cut initial page weight dramatically on slow connections.

### 2. Move the publisher `<datalist>` to a JS array

The 300+ `<option>` elements for `id="publisher-list"` are hardcoded in `index.html` (~250 lines of bloat). Extract them into a `publishers.js` file as a plain array, then inject them into the `<datalist>` on load with a loop. This keeps HTML clean, makes the list updatable without touching markup, and reduces initial document size.

### 3. Add `loading="lazy"` to all book cover `<img>` tags

Wherever `#booksGrid` renders book cards (in `catalog.js`), ensure every `<img>` gets `loading="lazy"`. Libraries of 500+ books without this cause memory spikes and jank on older phones. Also add `decoding="async"` for a double win.

### 4. Add `inputmode="decimal"` to all price/cost inputs

All `<input type="number">` fields for prices and costs (Add form, Edit modal, Wishlist quick-add, Price Review) need `inputmode="decimal"`. This forces iOS/Android to show the phone-style keypad with a decimal point instead of the clunky full number keyboard. Zero-cost, high-impact UX fix.

---

## P2 — Data Integrity & Offline

### 5. Fix currency switching to prevent mixed-currency data

Currently, changing currency in Settings only updates labels — existing `market_price` values keep their old currency, creating silent data corruption. Before beta, either: (a) disable the currency dropdown when the library has books and show a migration prompt, or (b) implement the Phase 2 spec now (store all prices in USD, convert on display using FX rates). Option (a) is a 30-minute guard; option (b) is the real fix. At minimum, make the existing `currencyChangeWarning` more prominent and require explicit confirmation before switching.

### 6. Add a basic Service Worker for shell caching + offline read

The app has `<link rel="manifest">` but no service worker registration visible. For a PWA used at book fairs with bad cell reception, this is critical. Implement a service worker that: caches the app shell (HTML, CSS, JS, fonts, logo), stores Supabase library data in IndexedDB on fetch, serves cached data when offline, and shows a clear offline banner. Queue mutations while offline and replay on reconnect. This is the single biggest feature gap for your target demographic.

---

## P3 — UX & Trust

### 7. Add a spinner/pulse animation to the splash screen

The splash screen (`#splashScreen`) shows a static logo on a purple background with no motion. On slow connections, users may think the app is frozen. Add a subtle CSS pulse or scale animation to `#splashLogo` (e.g., a gentle opacity breathe between 0.8–1.0) to signal loading is happening. Pure CSS, no JS needed.

### 8. Show live condition price adjustment in Add and Edit

When a user selects a condition grade (Fine/VG/Good/Fair) and a price estimate has been fetched, dynamically recalculate and display the adjusted price in real-time. If the base estimate is $100 and they tap "Fair", the displayed price should instantly show $40 (per their condition preset). This builds trust in the pricing engine and makes the condition multiplier tangible, not abstract.

### 9. Add batch queue progress indicator

When "Add All to Drafts" or "Process next title" is running, show a clear progress state: "Processing 2 of 5…" with a progress bar or counter. AI vision analysis takes seconds per image, and the current UI gives no feedback that work is happening. Update `#queueCount` and add a visual progress bar inside `#queuePanel` during batch operations.

### 10. Replace iOS ghost-click `setTimeout` with `requestAnimationFrame`

The current iOS ghost-click fix uses a 300–400ms `setTimeout` to delay `pointer-events`. A more robust and future-proof approach: use `requestAnimationFrame` (double-rAF for safety) when toggling overlay visibility. This aligns with the browser's paint cycle instead of fighting it, and is less sensitive to device speed variations. Apply to `.modal-overlay`, `.magi-sheet-overlay`, and `#coverPickerOverlay` open/close handlers.

---

## P4 — Code Quality & Accessibility

### 11. Add `aria-label` to all icon-only buttons

Every button that has only an SVG icon and no visible text needs an `aria-label`. Audit and fix: search clear button, modal close buttons, cover picker close, zoom close, hamburger menu, user menu avatar, view toggle, refresh button, and all sheet close buttons. Zero visual impact, makes the app usable for visually impaired users and passes a11y audits.

### 12. Sanitize user input before DOM insertion

Book titles, notes, collector's notes, and author names are all user-generated content that gets inserted into the DOM (via `innerHTML` in the grid, modal, toast, etc.). This is an XSS vector. Create a `sanitize(str)` helper that escapes `<`, `>`, `&`, `"`, `'` and use it everywhere user content enters the DOM. Apply especially in `renderCatalog()`, `openModal()`, and toast messages.

### 13. Migrate inline `onclick` handlers to event delegation (Phase 2 prep)

The app has 100+ inline `onclick="functionName()"` handlers. As the DOM gets re-rendered more frequently (batch operations, real-time updates), these become a memory leak risk and harder to debug. Start migrating to event delegation: attach listeners once on stable parent containers (`#view-catalog`, `#modalOverlay`, `#view-entry`) and use `event.target.closest()` to identify clicked elements. Prioritize the most re-rendered areas first (catalog grid, modal actions).

### 14. Add `rel="preconnect"` for Supabase and CDN domains

Add `<link rel="preconnect" href="https://[supabase-domain]">` and `dns-prefetch` for the Supabase API domain and `cdn.jsdelivr.net` (Fuse.js). This shaves 100–200ms off the first authenticated request by establishing the TCP/TLS connection early. One-line additions to `<head>`.

---

## P5 — Delight (Phase 2 Seeds)

### 15. Condition flag value modifiers in Settings

Extend the Condition Presets system to support flag-based multipliers (Signed +20%, No Dustjacket -30%, etc.). Store them alongside `condPct_*` in settings, and have `getEstimatedValue()` apply them on top of the condition grade. This makes the pricing engine dramatically more accurate for collectors and differentiates from generic book apps.

### 16. Populate the AI Info Card with book trivia

The `#aiInfoCard` div exists but is unused. When Claude extracts book data from a cover scan, have it also return a 2-sentence historical note or trivia about the book/author. Populate `#aiInfoContent` with this. It adds a delightful "magical" touch to the scanning experience and reinforces the app's niche personality.
