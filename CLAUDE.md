# MagiLib — Session 60

## Current Status
- **Phase:** Phase 1 → Beta Launch — IN PROGRESS
- **Focus:** Book detail modal redesigned — new `detail.js` module with magic taxonomy, topic chips, recommendation carousels, and enrichment scaffold. SQL migration from Session 59 still needs to run in Supabase. Next: run migration, publisher fix in scan path, normKey unification, beta walkthroughs.

---

## Stack
- **Runtime:** Vanilla JS PWA — pure HTML/CSS/JS. No frameworks.
- **Database:** Supabase (PostgreSQL) — `books`, `price_db`, `book_catalog`, `fx_rates` tables
- **Auth:** Supabase Auth + Google OAuth
- **Hosting:** Vercel
- **Search:** Fuse.js 7.0.0 (local bundle, threshold 0.3)
- **SW:** `sw.js` — shell pre-cache + network-first + IndexedDB offline fallback
- **Sole dev:** Sean Piper (Claude Code as builder)

---

## Workflow

### Session Start — `newchat`
1. Read `SESSION_HANDOFF.md` in full. Confirm outcomes + carried issues.
   - **CLAUDE.md and SESSION_HANDOFF.md are authoritative.** Memory files are supplementary. If conflict, trust .md files and silently update memory to match.
2. Run `git status` — report unexpected state.
3. State top 1–2 priorities. Confirm with Sean before writing any code.

### Session End — `handoff`
1. Write `SESSION_HANDOFF.md`: what was built (file-level), unresolved bugs, Model Learnings.
2. Update `CLAUDE.md`: bump session number in header + update Current Status block.
3. Run `handoff` in the terminal — commits, pushes to GitHub, syncs Notion.

### Absolute Rules
- **NEVER ask Sean to edit code manually.** Claude Code makes all file changes.
- **`b._id` only.** Never `b.id`. Supabase queries: `.eq('id', b._id)` or `.in('id', ids)`.
- **All CSS in `assets/css/magilib.css`.** No `<style>` blocks in HTML. No JS-injected CSS except the bulk-edit IIFE block.
- **Pacing:** Max 2–3 steps per response. Clarify before major code blocks.
- **Typecheck after every JS edit:** `node --check <file>.js` — show output before reporting done.
- **Never say "done" without verify output.** Hallucinated success is not success.
- **Atomic commits:** one fix per commit. >50 lines → break into smaller commits.
- **Never touch Supabase RLS, auth flows, or `sw.js`** without explicit approval in that session message.
- **Subagent discipline:** open-ended grep, multi-file exploration, or research → spawn Explore or general-purpose subagent. Never burn main context on file-digging.
- **Consultation:** risky architecture/security/migration → `consult panel` spawns 2–3 parallel subagents. Synthesize before proceeding.
- **Diagnose before implementing:** understand root cause + full solution. Best practice, not quick fix.
- **Technical Learnings** are in `LEARNINGS.md` — read it when debugging or starting new features.
- **Session history** (Sessions 10–46) is in `docs/session-history.md`.

---

## Last Session (Session 60)
- ### detail.js (NEW — 260 lines)
- `MAGIC_TAXONOMY` — 28-entry controlled tag list for magic categories.
- `_TOPIC_KW` — Keyword→topic mapping for local detection across title/author/publisher/notes.
- `MetadataCache` — localStorage-backed cache for web-enriched metadata (key: `magilib_enrich_<id>`).
- `MetadataEnrichmentAdapters` — Adapter pattern with one OpenGraph/JSON-LD adapter. User-initiated, caches results, calls `/fetch-proxy`. Ready for future sources.
- `enrichBookFromUrl(book, url)` — Calls matching adapter, stores result in cache.

---

## Beta Launch Checklist
- [ ] Auth: sign up (OAuth), sign in, forgot password, change password
- [ ] Add: scan/photo, manual entry, batch queue, save
- [ ] Library: search, filter, sort, view detail
- [ ] Edit: all fields, cover update, dirty-check dialog after PWA reload
- [x] Status: Mark Sold, + Wishlist, Move to Library
- [x] Pricing: Fetch estimate (Add) + stored price display + eBay link (Library)
- [ ] Settings: profile, security, currency, condition presets, stat cards, CSV export/import
- [ ] Onboarding: welcome + feature tour for new users — built, needs walkthrough

---

## Phase 2 Backlog (do not implement before beta)
- **P4:** Migrate inline `onclick` handlers to event delegation — 100+ handlers, memory leak under re-render. Use `event.target.closest()` on stable containers (`#view-catalog`, `#modalOverlay`, `#view-entry`).
- **P5:** Condition flag value modifiers in Settings (Signed +20%, No Dustjacket -30%) alongside `condPct_*`
- **P5:** AI Info Card (`#aiInfoCard`) — 2-sentence book trivia from cover scan → `#aiInfoContent`
- **P3 (pre-beta):** Wishlist page layout — too clunky, needs small layout/UX polish before launch
- **Multi-currency:** all `market_price` stored in USD; display layer × FX rate; migrate `fx_rates` table; rates currently hardcoded in catalog.js + ui.js + pricing.js

---

## Key Architecture

### Critical ID + Data
- `_id: row.id` mapped in `loadCatalog()`. Always `b._id`. Never `b.id`.
- Catalog in `S.books`. No `window.allBooks`. Supabase populates via `loadCatalog()`.
- `market_price` (Supabase column, numeric) ↔ `b.price` (in-memory, string).
- Supabase default query limit = 1000. Paginate large `select()` with `.range()`.
- `.or()` breaks with special chars (apostrophes, parens). Use `.in()` for exact; `.ilike()` for search.

### Z-index Scale
`--z-sheet:1000` · `--z-dialog:2000` · `--z-fullscreen:3000` in `:root`. **Hardcode values in inline styles** — CSS vars fail in inline style attributes on iOS Safari.

### Modals & Overlays
- Book detail: `openModal()` → `#modalOverlay` + `.is-active`. `closeModal()` removes it.
- Edit modal: `#editModalOverlay` at `z-index:2001`. `openEditForm()` adds `body.sheet-open`; all close paths remove it.
- Legacy modals (support, changelog): `.modal-overlay` + `.hidden` — do NOT touch.
- Onboarding wizard (`#wizardOverlay`): full-screen `position:fixed;inset:0;z-index:9998` — uses `.hidden` class toggle. Not a `.modal-overlay`.
- Magi-Sheet: `.magi-sheet-overlay` uses `opacity` + `pointer-events` (not `display:none`). Toggle `.is-active`.
- `magiConfirm({title, message, confirmText, onConfirm})` — always object style. Replaces all `window.confirm()`.

### Cover Images
- Reveal pattern: img starts `style="display:none"` (inline); `onload` → `display:block` + hide placeholder; `onerror` → hide img, show placeholder.
- Never CSS `display:none` on cover img — breaks lazy loading on iOS Safari.
- `nextElementSibling` in `onload`/`onerror` handlers (not `nextSibling` — can return text node).

### book_catalog
- **normKey:** `title:author` format. NOT the title-only variant in pricing.js/ui.js.
- **Cover priority:** Supabase Storage (CA) → MagicRef hotlink → Murphy's → Penguin → Vanishing Inc
- **Murphy's author:** Last-First format → won't match book_catalog (First Last). Migrate forward; don't fix backward.
- **`cover_source`:** `'supabase_storage'` (CA in bucket) or `'magicref'` (hotlink). Query `cover_url` directly.

### Pricing
- **Beta:** `getEstimatedValue()` → `price_db` (2,021 eBay + Murphy's + QTTE + Penguin). Library detail: 2×2 grid (Market Value · Check eBay · Edit Details · Mark Sold). **Do not change before Phase 2.**
- **Condition %:** `getConditionPct(condition)` reads `S.settings.condPct_fine/vg/good/fair`. Keys: `'Fine'` `'Very Good'` `'Good'` `'Fair'`. Defaults 100/80/60/40.
- `fetchPrice()` returns raw market price — condition is display-layer only via `_applyConditionAdjustment()`.

### iOS Patterns
- **Scroll-to-top:** `window.scrollTo(0,0); document.body.scrollTop=0; document.documentElement.scrollTop=0;` — repeat in 50ms setTimeout.
- **Ghost-click:** double-rAF before opening overlays that gain `pointer-events:auto`.

### Service Worker
- Bump `CACHE_NAME` + `?v=sN` on all script tags every session.
- Bypass SW (no `event.respondWith`) for all `url.origin !== self.location.origin`.
- Strip `?v=sN` from pathname on `cache.put()` so version variants share one cache entry.

---

## Technical Rules
- **No Frameworks.** Pure HTML/CSS/JS (PWA).
- **All CSS** in `assets/css/magilib.css`. Flexbox-first, mobile-responsive.
- **Session workflow:** `newchat` to start · `handoff` to end.
- **External links:** `window.open(url, '_blank')`. Never `location.href`.
- **claude-flow** (`ruflo v3.5.80`) at `/Users/seanpiper/.nvm/versions/node/v24.14.0/bin/claude-flow` — available for swarm orchestration.
- **Superpowers skills** at `~/.claude/skills/`: `systematic-debugging`, `verification-before-completion`, `test-driven-development`, `dispatching-parallel-agents`.
