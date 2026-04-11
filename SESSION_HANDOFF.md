# SESSION HANDOFF — 2026-04-11 (Session 14)

## Session Summary
Lightweight token-efficient session. Three small fixes: confirmed cache-bust already done (v=s6), added currency label to wishlist price input placeholder, added currency-change warning in Settings. Logged full Phase 2 multi-currency architecture spec in CLAUDE.md.

---

## What Was Built/Changed This Session

### 1. `catalog.js` — wishlist price placeholder + currency warning
- `updatePriceLabels()`: added `#wl-price` placeholder update → now reads `Price (AUD)` / `Price (GBP)` etc. matching user currency setting
- `saveSettings()`: after `updatePriceLabels()`, shows `#currencyChangeWarning` element on currency change

### 2. `index.html` — currency change warning
- Added `<p id="currencyChangeWarning">` below currency selector in Settings — hidden by default, shown in red on currency save: *"Currency label updated. Existing prices are not converted — they still reflect the value they were entered in."*

### 3. `CLAUDE.md` — Phase 2 currency spec
- Replaced placeholder Phase 2 currency note with full spec: USD storage, live FX fetch + localStorage cache, manual refresh button, purchase price with `cost_currency` dropdown, one-time migration script.

---

## Known Issues / Still Pending

- **eBay API**: fetch-failed on network (not quota) — still 0 live API rows, 2,021 manual CSV rows in price_db
- **QTTE/Penguin**: may have stale matches — rerun scrapers in Phase 2
- **FX rates**: still hardcoded (USD→AUD 1.55, GBP→AUD 2.02) — Phase 2 migration now fully specced

---

## Next Session Priorities (Session 15)
1. **Library detail pricing**: remove Market Sync panel. Replace with: stored price display + tap-to-edit + "Check eBay" link
2. **Beta readiness walkthrough**: auth → add → search → edit → price → settings — full end-to-end QA on device
3. **Wishlist price label**: verify currency label shows correctly on device after today's fix

---

## Model Learnings
- **Currency warning pattern**: use `style="display:none"` + JS `style.display='block'` on save — no new state needed, no flicker.
- **Phase 2 currency arch**: store in USD, display via FX multiplier. Purchase price is static with `cost_currency` tag. Live FX cached in localStorage, manual refresh in Settings as fallback.
