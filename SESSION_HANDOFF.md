# SESSION HANDOFF — 2026-04-15 (Session 24)

## Session Summary
P2 #6 Service Worker shipped in full: shell caching, offline reads via IndexedDB, offline banner, mutation queue with replay on reconnect. All syntax-clean.

---

## What Was Built/Changed This Session

### 1. `sw.js` — NEW: Service Worker
- Cache name `magilib-sw-s13`; bumped each session alongside `?v=sN`.
- **Install**: pre-caches 14 shell assets (HTML, CSS, logos, manifest, all JS files) without query strings.
- **Activate**: deletes stale caches, claims all clients immediately.
- **Fetch strategy**:
  - Supabase API (`supabase.co`) and `/api/` routes: bypassed entirely (network-only, never cached — auth tokens and live data must not be served stale).
  - CDN assets (Fuse.js, Google Fonts): cache-first.
  - App shell and everything else: network-first with cache fallback. Versioned JS/CSS (e.g. `catalog.js?v=s13`) stored under bare pathname so any `?v=` variant is a cache hit offline.
  - Navigation fallback: serves cached `/index.html` if all else fails.

### 2. `globals.js` — Offline state, IndexedDB helpers, mutation queue
- `window._isOnline`: initialised from `navigator.onLine`; updated on `online`/`offline` events.
- `online` event: hides banner, calls `_mgQueueFlush()`.
- `offline` event: shows banner.
- `_showOfflineBanner()` / `_hideOfflineBanner()`: toggle `#offlineBanner.is-visible` and `body.offline-mode`.
- **IndexedDB helpers** (`_IDB_NAME='magilib'`, store `books_cache`, key = userId):
  - `_idbOpen()` — opens/upgrades DB.
  - `_idbSaveBooks(userId, rows)` — stores raw Supabase row array.
  - `_idbLoadBooks(userId)` — retrieves cached rows.
- **Mutation queue** (localStorage key `mgl_queue`):
  - `_mgQueueLoad()` / `_mgQueueSave(q)` — persist queue entries.
  - `_mgQueuePush({ op, id, payload, ts })` — enqueues one op.
  - `_mgQueueFlush()` — async; replays all queued updates/deletes against Supabase; shows sync toast; calls `loadCatalog()` on success; keeps failed ops for retry.

### 3. `catalog.js` — IDB integration in `loadCatalog()` + offline guard
- On successful Supabase fetch: `_idbSaveBooks(userId, data)` fire-and-forget.
- On Supabase error while offline: falls back to `_idbLoadBooks()`, maps rows identically to online path, shows "Offline — showing cached library" toast.
- `toggleWishlistStatus()`: offline guard — queues update, applies optimistically, shows "will sync when online" toast.

### 4. `books.js` — Offline guards on all write operations
- `saveBook()` (insert): blocked offline — "You're offline — connect to save new books".
- `saveEdit()` (update): offline-queued — builds `offlineFields`, calls `_mgQueuePush`, applies optimistic in-memory update, shows "Saved locally — will sync when online".
- `_doToggleSold()` (update): offline-queued — optimistic update + "will sync when online" toast.
- `confirmDelete()` (delete): blocked offline — "You're offline — connect to delete books".

### 5. `index.html`
- Added `#offlineBanner` element (wifi-off icon + text) before Cover Picker.
- Added SW registration `<script>` block after publishers.js.
- Bumped all `?v=s12` → `?v=s13` (8 script tags).

### 6. `assets/css/magilib.css`
- `#offlineBanner`: fixed top, `z-index:999` (below sheets), dark amber background, hidden by default, flex when `.is-visible`.
- `body.offline-mode .nav`: `margin-top:37px` to prevent nav overlapping banner.

---

## Known Issues / Still Pending

- **Beta readiness walkthrough**: auth → add → search → edit → price → settings — still needed on device.
- **Search dropdown author line**: author often missing — many CONJURING_DB entries lack the `a` field (data gap, not a code bug).
- **eBay API**: fetch-failed on network — 2,021 manual CSV rows in price_db, 0 live API rows.
- **QTTE/Penguin**: may have stale matches — Phase 2.
- **FX rates**: hardcoded — Phase 2.
- **Bulk operations offline**: bulk edit/move/delete not guarded (shows Supabase error naturally). Phase 2.

---

## Next Session Priorities (Session 25)

1. **Beta readiness walkthrough**: auth → add → search → edit → price → settings — full end-to-end QA on device. Carried forward since Session 13. This is the real gate before beta launch.
2. **Service Worker verification**: open Chrome DevTools → Application → Service Workers, confirm registration and cache contents. Also: toggle offline in DevTools, reload app, verify library loads from IDB.

---

## Model Learnings
- **SW versioned-asset matching**: JS/CSS files requested with `?v=sN` query strings must be stored under their bare pathname in the SW cache so that `?v=s12` and `?v=s13` both hit the same cache entry offline. Use `ignoreSearch: true`-equivalent logic (strip search before `cache.put()`).
- **IDB offline-first pattern**: fire-and-forget `_idbSaveBooks()` on every successful `loadCatalog()`; fall through to IDB only on error + `!navigator.onLine`. Don't try to sync IDB reads back to Supabase — that's a full CRDT problem.
- **Mutation queue insert-block decision**: insert operations require server-assigned UUIDs and can't be queued safely without a local-ID-to-server-ID resolution step. Blocking inserts offline is the correct beta decision. Phase 2: assign client-side UUIDs (UUIDs v4) locally so inserts can also be queued.
- **`_supa` not available at globals.js parse time**: `_supa` is initialised in a DOMContentLoaded handler in auth.js. `_mgQueueFlush()` is only ever called from the `online` event or from `onAuthSuccess()`, by which time `_supa` is initialised — safe to call directly.
