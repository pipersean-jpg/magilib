# MagiLib Project Instructions
**App Version:** v1.0 beta (Updated April 2026)
**Architecture:** PWA for cataloging magic book collections.
**Tech Stack:** Vanilla JS, Supabase backend, Vercel deployment.

## Critical Development Rules
* [cite_start]**No Frameworks:** Stick to Vanilla JS only. [cite: 1, 2]
* [cite_start]**File Separation:** index.html is for HTML/CSS only (111KB). [cite: 1, 3]
* [cite_start]**JS Work:** Never load index.html for JS tasks. [cite: 1, 6]
* [cite_start]**Validation:** Run `node --check {filename}.js` before every output. 
* [cite_start]**Fetching:** Fetch only the ONE file needed via GitHub raw URL. [cite: 1, 5, 6]

## Completed Tasks (April 2026)
* [cite_start]**Security Fix:** Enabled RLS on `admin_users` table with self-read policy. [cite: 1]
* [cite_start]**CSV Template:** Enhanced `catalog.js` with robust example rows and enum constraints. [cite: 1]
* [cite_start]**Wishlist Tab:** Added nav tab to `index.html` and integrated logic/stats into `catalog.js`. [cite: 1]

## Current Task Queue
* [cite_start]**Next:** Task #8 - Admin Portal (management of user roles). [cite: 1]
* [cite_start]**Soon:** Task #10 - Display name uniqueness check. [cite: 1]
* [cite_start]**Soon:** Task #11 - Avatar upload functionality. [cite: 1]

## Backend Info
* [cite_start]**Supabase URL:** https://acuehbwbwsbbxuqcmnrp.supabase.co [cite: 1]
* [cite_start]**Tables:** books, profiles, covers, price_db, admin_users. [cite: 1]

## Master UI/UX Requirements (v1.1 Roadmap)
- **Header Order:** Add > Library > Wishlist > Settings.
- **Library Defaults:** Cold open must default to Title A-Z.
- **Search:** Input must have an 'X' clear button.
- **Add/Edit Page:** - Forced scroll-to-top on every open.
    - 'Take Photo' button: Highlighted on mobile ONLY. 
    - Camera image -> Icon.
    - Add 'Location' dropdown (customizable via Settings).
- **Avatar Menu:** Include Display Name, Account Settings (moved from Settings), and Version Popup.
- **Settings:** - Save Changes buttons required for Preferences/Library settings.
    - Setup Wizard: Dynamic move (Top when incomplete, Bottom when done).
- **Price Refresh:** Transition to a scrolling review list (Thumbnail, Title, Author, Old vs New Price).
- **Global Design:** - NO System popups (all must be styled app-modals).
    - Flexbox-first layouts to prevent menu/container spilling.
    - Remove ALL legacy Google Sheets references.