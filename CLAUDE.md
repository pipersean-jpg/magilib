# MagiLib Project Instructions
**App Version:** v1.1 beta (Roadmap updated April 2026)
**Architecture:** PWA for magic books. Vanilla JS, Supabase, Vercel.

## Critical Development Rules
* **No Frameworks:** Vanilla JS only. 
* **Validation:** Run `node --check {filename}.js` before every output.
* **Layout:** Use Flexbox-first design to prevent mobile container spilling.
* **No Legacy:** Remove all references to Google Sheets.

## Master UI/UX Requirements
- **Header Order:** Add > Library > Wishlist > Settings.
- **Library:** Cold open defaults to Title A-Z. Clear 'X' on search bar.
- **Add Page:** Force scroll-to-top on open. Camera Icon (not bold).
- **Location Dropdown:** Defaults: Shelf 1, 2, 3, Bedroom, Storage. (Customizable in Settings).
- **Stats:** Total Books card: Large Font (Total), Small Font (Unique), Small Font (Duplicates).
- **Avatar Menu:** Include Display Name, Account Settings, and Version Popup.
- **Price Refresh:** Transition to scrolling list view (Thumbnail, Title, Author, Old/New Price).

## Completed Tasks
* Security: RLS enabled on admin_users.
* CSV: Enhanced template with enum constraints.
* Wishlist: Dedicated tab and stats logic implemented.

## Next Session Priority
1. **Block 1: Global UI & Navigation** (Header order, Avatar menu, Scroll-to-top fix).