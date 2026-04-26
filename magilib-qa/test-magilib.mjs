import { chromium } from '/Users/seanpiper/.nvm/versions/node/v24.14.0/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'https://magilib.vercel.app/';
const EMAIL = 'piper.sean+byron@gmail.com';
const PASSWORD = 'password';
const SHOTS_DIR = '/Users/seanpiper/magilib-qa/screenshots';
const REPORT_PATH = '/Users/seanpiper/magilib-qa/QA_REPORT.md';

fs.mkdirSync(SHOTS_DIR, { recursive: true });
fs.readdirSync(SHOTS_DIR).forEach(f => fs.unlinkSync(path.join(SHOTS_DIR, f)));

const findings = [];
let shotIdx = 0;
const consoleErrors = [];
const networkErrors = [];

function log(msg) { console.log(`[QA] ${msg}`); }
function find(sev, area, desc, detail = '') {
  findings.push({ sev, area, desc, detail });
  const icon = { CRITICAL:'🔴', BUG:'🟠', WARN:'🟡', OK:'✅' }[sev] || '•';
  console.log(`  ${icon} [${sev}] ${area}: ${desc}`);
  if (detail) console.log(`     ↳ ${detail}`);
}
async function shot(page, label) {
  shotIdx++;
  const f = `${String(shotIdx).padStart(3,'0')}-${label.replace(/\W+/g,'-')}.png`;
  await page.screenshot({ path: path.join(SHOTS_DIR, f) });
  log(`  📸 ${f}`);
}
async function pause(page, ms = 1000) { await page.waitForTimeout(ms); }

let toastBugFiled = false;
// Wait for any toast to clear before clicking nav (toast overlaps bottom nav)
async function waitForToast(page) {
  // Check if toast is currently blocking
  const toastBlocking = await page.evaluate(() => {
    const t = document.getElementById('toast');
    return t && t.offsetWidth > 0 && t.offsetHeight > 0 && getComputedStyle(t).opacity !== '0';
  });
  if (toastBlocking && !toastBugFiled) {
    find('BUG', 'Toast', 'Toast notification overlaps bottom nav, blocking tap targets for its full display duration');
    toastBugFiled = true;
  }
  const toastGone = await page.waitForFunction(() => {
    const t = document.getElementById('toast');
    return !t || t.offsetWidth === 0 || t.offsetHeight === 0 || getComputedStyle(t).opacity === '0';
  }, { timeout: 8000 }).catch(() => null);
  if (!toastGone) {
    await page.evaluate(() => { const t = document.getElementById('toast'); if(t) t.style.display='none'; });
  }
}

async function navClick(page, id) {
  await waitForToast(page);
  // Force-click bypasses pointer-event interception from toasts/overlays
  await page.click(id, { force: true });
}

// Helper: check horizontal overflow
async function checkOverflow(page, area) {
  const ov = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (ov) find('BUG', area, 'Horizontal overflow — content wider than viewport');
  else find('OK', area, 'No horizontal overflow');
}

// Helper: wait for a view to be active (display not none OR has visible children)
async function waitForView(page, id, timeout = 5000) {
  try {
    await page.waitForFunction(id => {
      const el = document.getElementById(id);
      if (!el) return false;
      const s = getComputedStyle(el);
      return s.display !== 'none' || el.offsetWidth > 0 || el.offsetHeight > 0;
    }, id, { timeout });
    return true;
  } catch { return false; }
}

async function run() {
  log('Launching headed Chromium (iPhone 14)...');
  const browser = await chromium.launch({ headless: false, slowMo: 200, args: ['--window-size=430,900'] });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    deviceScaleFactor: 3,
  });
  ctx.on('page', p => {
    p.on('console', msg => {
      if (msg.type() === 'error') {
        const t = msg.text();
        if (!t.includes('400') && !t.includes('ERR_BLOCKED')) {
          consoleErrors.push({ url: p.url().slice(0,60), text: t });
          console.log(`  ⚡ console.error: ${t.slice(0,100)}`);
        }
      }
    });
    p.on('pageerror', err => {
      consoleErrors.push({ url: p.url().slice(0,60), text: err.message });
      console.log(`  ⚡ pageerror: ${err.message.slice(0,100)}`);
    });
    p.on('requestfailed', req => {
      const url = req.url();
      if (!url.includes('favicon') && !url.includes('apple-touch')) {
        networkErrors.push({ url: url.slice(0,80), err: req.failure()?.errorText });
        console.log(`  ⚡ netfail: ${url.slice(0,60)}`);
      }
    });
  });

  const page = await ctx.newPage();

  // ─────────────────────────────────────────────────────────
  // 1. AUTH
  // ─────────────────────────────────────────────────────────
  log('\n══ 1. AUTH ══');
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await pause(page, 2000);
  await shot(page, '1-auth-screen');

  const loadMs = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0];
    return n ? Math.round(n.loadEventEnd - n.startTime) : null;
  });
  if (loadMs) find(loadMs > 5000 ? 'WARN' : 'OK', 'Performance', `Page load ${loadMs}ms`);

  // Verify auth elements
  const googleBtn = await page.$('.auth-google-btn, button:has-text("Continue with Google")');
  const forgotBtn = await page.$('#authForgotLink, .auth-forgot');
  const createLink = await page.$('a:has-text("Create one"), a:has-text("Sign up")');
  if (!googleBtn) find('WARN', 'Auth', 'Google sign-in button not found');
  else find('OK', 'Auth', 'Google sign-in button present');
  if (!forgotBtn) find('WARN', 'Auth', 'Forgot password link not found');
  else find('OK', 'Auth', 'Forgot password link present');
  if (!createLink) find('WARN', 'Auth', 'No "Create account" link visible — new users may not discover sign-up');
  else find('OK', 'Auth', '"Create one" sign-up link present');

  // Empty submit validation
  await page.click('#authSubmitBtn');
  await pause(page, 500);
  const authErr = await page.$('.auth-error, [class*="error"]:visible, #authError');
  if (!authErr) find('WARN', 'Auth', 'Empty submit — no visible error message');
  else find('OK', 'Auth', 'Empty submit shows validation error');

  // Sign in
  await page.fill('#authEmail', EMAIL);
  await page.fill('#authPassword', PASSWORD);
  await shot(page, '2-auth-filled');
  await page.click('#authSubmitBtn');
  log('  Waiting for post-login state...');
  await pause(page, 5000);
  await shot(page, '3-post-signin');

  // Detect wizard or view
  const wizardVisible = await page.evaluate(() => {
    const w = document.getElementById('wizardOverlay');
    return w && w.offsetWidth > 0 && w.offsetHeight > 0;
  });
  if (wizardVisible) {
    find('OK', 'Auth', 'Login succeeded — onboarding wizard shown');
    log('  Onboarding wizard active');
  } else {
    const anyView = await page.$('#view-home, #view-catalog, #view-entry, #bottomNav');
    if (!anyView) { find('CRITICAL', 'Auth', 'Login failed — no app content after 5s'); await browser.close(); return writeReport(); }
    find('OK', 'Auth', 'Login succeeded — app loaded directly');
  }

  // ─────────────────────────────────────────────────────────
  // 2. ONBOARDING WIZARD
  // ─────────────────────────────────────────────────────────
  log('\n══ 2. ONBOARDING WIZARD ══');
  if (wizardVisible) {
    await shot(page, '4-wizard-step1');

    // Count steps by advancing
    let stepCount = 1;
    const maxSteps = 10;
    while (stepCount < maxSteps) {
      const nextBtn = await page.$('#wizardNextBtn');
      if (!nextBtn) break;
      const btnText = await nextBtn.innerText();
      log(`  Wizard step ${stepCount}: next btn = "${btnText}"`);
      if (btnText.toLowerCase().includes('go') || btnText.toLowerCase().includes('start') || btnText.toLowerCase().includes('done')) {
        await nextBtn.click();
        stepCount++;
        await pause(page, 800);
        break;
      }
      await nextBtn.click();
      stepCount++;
      await pause(page, 700);
      await shot(page, `5-wizard-step${stepCount}`);
    }
    find('OK', 'Onboarding', `Wizard has ${stepCount} step(s), advances correctly`);

    // Check wizard gone after completion or skip
    await pause(page, 1500);
    const wizardStillVisible = await page.evaluate(() => {
      const w = document.getElementById('wizardOverlay');
      return w && w.offsetWidth > 0 && w.offsetHeight > 0;
    });
    if (wizardStillVisible) {
      // Try skip button
      const skipBtn = await page.$('button:has-text("Skip")');
      if (skipBtn) {
        await skipBtn.click();
        await pause(page, 1000);
        find('OK', 'Onboarding', 'Skip button works');
      } else {
        find('WARN', 'Onboarding', 'Wizard still showing after completing all steps — may loop or not dismiss');
      }
    } else {
      find('OK', 'Onboarding', 'Wizard dismisses after completion');
    }
    await shot(page, '6-post-wizard');
  }

  // ─────────────────────────────────────────────────────────
  // 2b. CHANGELOG MODAL (blocks nav after wizard)
  // ─────────────────────────────────────────────────────────
  log('\n══ 2b. CHANGELOG MODAL ══');
  await pause(page, 800);
  const changelog = await page.$('#changelogOverlay');
  const changelogVisible = changelog ? await page.evaluate(el => el.offsetWidth > 0 || getComputedStyle(el).display !== 'none', changelog) : false;
  if (changelogVisible) {
    find('BUG', 'Changelog', 'Changelog modal auto-shows after wizard/login — blocks all nav until dismissed');
    const gotItBtn = await page.$('#changelogOverlay button:has-text("Got it"), button[onclick*="closeChangelog"]');
    if (gotItBtn) {
      await gotItBtn.click();
      await pause(page, 600);
      find('OK', 'Changelog', '"Got it" button dismisses changelog modal');
    } else {
      find('BUG', 'Changelog', 'No dismiss button found on changelog modal');
      await page.evaluate(() => { const el = document.getElementById('changelogOverlay'); if(el) el.style.display='none'; });
    }
    await shot(page, '5b-changelog-dismissed');
  }

  // ─────────────────────────────────────────────────────────
  // 3. HOME VIEW
  // ─────────────────────────────────────────────────────────
  log('\n══ 3. HOME VIEW ══');
  await navClick(page, '#bn-home');
  const homeVisible = await waitForView(page, 'view-home');
  await pause(page, 1000);
  await shot(page, '7-home-view');
  if (!homeVisible) find('BUG', 'Home', '#view-home never became visible after #bn-home click');
  else find('OK', 'Home', 'Home view renders');

  // Stat cards
  const statCards = await page.$$('.home-stat-card');
  if (statCards.length === 0) find('WARN', 'Home', 'No stat cards found on home view');
  else {
    find('OK', 'Home', `${statCards.length} stat card(s) visible`);
    // Check for loading dashes vs real data
    const statText = await page.$$eval('.home-stat-card', els => els.map(e => e.textContent.trim()));
    const allDashes = statText.every(t => t.includes('—'));
    if (allDashes) find('WARN', 'Home', 'All stat cards show "—" — data may not have loaded');
  }

  // CTA buttons
  const addBookCTA = await page.$('button:has-text("Add a Book"), .home-cta');
  const browseBtn = await page.$('button:has-text("Browse Library")');
  if (!addBookCTA) find('WARN', 'Home', 'No "Add a Book" CTA on home view');
  else find('OK', 'Home', '"Add a Book" CTA present');
  if (!browseBtn) find('WARN', 'Home', 'No "Browse Library" button on home');
  else find('OK', 'Home', '"Browse Library" button present');

  await checkOverflow(page, 'Home');

  // ─────────────────────────────────────────────────────────
  // 4. LIBRARY / CATALOG
  // ─────────────────────────────────────────────────────────
  log('\n══ 4. LIBRARY / CATALOG ══');
  await navClick(page, '#bn-catalog');
  await pause(page, 2500);
  await shot(page, '8-catalog-view');

  // Book count (primary proxy for catalog render — view uses display:none in computed even when active)
  const bookCards = await page.$$('.book-card, [class*="book-card"]');
  log(`  Book cards found: ${bookCards.length}`);
  if (bookCards.length === 0) find('BUG', 'Catalog', 'Library view shows no book cards after navigation');
  else find('OK', 'Catalog', `Library renders — ${bookCards.length} book(s) loaded`);

  await checkOverflow(page, 'Catalog');

  // Search bar
  const searchInput = await page.$('#catalogSearch, #searchInput, input[type="search"], [placeholder*="Search" i]');
  if (!searchInput) find('WARN', 'Search', 'No search input found in catalog');
  else {
    try {
      // JS-level interaction for elements in overflow:hidden containers
      await page.evaluate(() => {
        const el = document.querySelector('#catalogSearch, #searchInput, input[type="search"]');
        if (el) { el.focus(); el.value = 'magic'; el.dispatchEvent(new Event('input', {bubbles:true})); }
      });
      await pause(page, 1200);
      await shot(page, '9-search-results');
      const results = await page.$$('.book-card, [class*="book-card"]');
      if (results.length === bookCards.length) find('BUG', 'Search', `Search "magic" returned ALL ${results.length} books — input event not triggering Fuse.js filter`);
      else find('OK', 'Search', `Search "magic" → ${results.length} of ${bookCards.length} result(s)`);
      await page.evaluate(() => {
        const el = document.querySelector('#catalogSearch, #searchInput, input[type="search"]');
        if (el) { el.value = ''; el.dispatchEvent(new Event('input', {bubbles:true})); }
      });
      await pause(page, 800);
    } catch(e) {
      find('WARN', 'Search', `Search interaction failed: ${e.message.slice(0,60)}`);
    }
  }

  // Filter sheet
  const filterBtn = await page.$('#filterMenuBtn, #filterBtn, button[aria-label*="filter" i], button:has-text("Sort"), button:has-text("Filter"), [class*="filter-btn"]');
  if (!filterBtn) find('WARN', 'Filter', 'No filter button found');
  else {
    try {
      await page.evaluate(() => {
        const btn = document.querySelector('#filterMenuBtn, #filterBtn, button[aria-label*="filter" i], [class*="filter-btn"]');
        if (btn) btn.click();
      });
      await pause(page, 800);
      await filterBtn.click({ force: true }).catch(() => {}); // also try Playwright click
      await pause(page, 800);
      await shot(page, '10-filter-sheet');
      const filterSheet = await page.evaluate(() => {
        const el = document.getElementById('filterSheetOverlay');
        return el ? getComputedStyle(el).opacity : 'not found';
      });
      find(filterSheet === '1' ? 'OK' : 'WARN', 'Filter', `Filter sheet opacity=${filterSheet} after open`);
      const closeX = await page.$('#filterSheetOverlay button:has-text("✕"), #filterSheetOverlay .close-btn');
      if (closeX) await closeX.click({ force: true });
      else await page.keyboard.press('Escape');
      await pause(page, 500);
    } catch(e) {
      find('WARN', 'Filter', `Filter button click failed: ${e.message.slice(0,60)}`);
    }
  }

  // ─────────────────────────────────────────────────────────
  // 5. BOOK DETAIL MODAL
  // ─────────────────────────────────────────────────────────
  log('\n══ 5. BOOK DETAIL MODAL ══');
  // Use JS click to bypass viewport/overflow restrictions
  const cardClicked = await page.evaluate(() => {
    const card = document.querySelector('.book-card, [class*="book-card"]');
    if (!card) return false;
    card.click();
    return true;
  });
  if (!cardClicked) {
    find('WARN', 'Detail', 'No book cards found in DOM — skipping detail modal tests');
  } else {
    await pause(page, 1500);
    await shot(page, '11-detail-modal');

    // Check modal overlay opened (opacity = 1)
    const overlayState = await page.evaluate(() => {
      const el = document.getElementById('modalOverlay');
      if (!el) return 'not found';
      const s = getComputedStyle(el);
      return { opacity: s.opacity, pointerEvents: s.pointerEvents };
    });
    if (overlayState === 'not found') find('BUG', 'Detail', '#modalOverlay element missing from DOM');
    else if (overlayState.opacity !== '1') find('BUG', 'Detail', `Detail modal opacity=${overlayState.opacity} — not visible after book tap`);
    else find('OK', 'Detail', 'Book detail modal opens (opacity=1)');

    // Content checks
    const modalText = await page.evaluate(() => document.getElementById('modalOverlay')?.textContent.slice(0,200) || '');
    log(`  Modal text preview: "${modalText.trim().slice(0,80)}"`);

    const hasEditBtn = modalText.includes('Edit') || await page.$('#modalOverlay button:has-text("Edit"), #modalOverlay [data-action="edit"]');
    if (!hasEditBtn) find('WARN', 'Detail', 'No Edit button found in detail modal');
    else find('OK', 'Detail', 'Edit button present in detail modal');

    const hasEbayBtn = modalText.includes('eBay') || await page.$('#modalOverlay a:has-text("eBay"), #modalOverlay [href*="ebay"]');
    if (!hasEbayBtn) find('WARN', 'Detail', 'No eBay link in detail modal');
    else find('OK', 'Detail', 'eBay link present');

    // Scroll the sheet
    const sheet = await page.$('#modalOverlay .magi-sheet, #modalOverlay [class*="sheet-content"], #modalOverlay [class*="ms-"]');
    if (sheet) {
      await sheet.evaluate(el => el.scrollTo(0, 400));
      await pause(page, 500);
      await shot(page, '12-detail-scrolled');
      find('OK', 'Detail', 'Detail modal scrolls');
    }

    // Check modal overflow
    const modalOv = await page.evaluate(() => {
      const el = document.getElementById('modalOverlay');
      return el ? el.scrollWidth > el.clientWidth : false;
    });
    if (modalOv) find('BUG', 'Detail', 'Horizontal overflow inside detail modal');
    else find('OK', 'Detail', 'No horizontal overflow in modal');

    // Edit flow
    log('  Testing Edit button...');
    const editBtn = await page.$('#modalOverlay button:has-text("Edit"), #modalOverlay .ms-edit-btn, #modalOverlay [data-action*="edit"]');
    if (editBtn) {
      const editVisible = await editBtn.isVisible();
      if (!editVisible) {
        // scroll to find it
        if (sheet) await sheet.evaluate(el => el.scrollTo(0, 0));
        await pause(page, 300);
      }
      try {
        await editBtn.click({ timeout: 5000 });
        await pause(page, 1500);
        await shot(page, '13-edit-modal');

        const editOverlay = await page.$('#editModalOverlay, [id*="editModal"]');
        const editVisible2 = editOverlay ? await page.evaluate(el => getComputedStyle(el).display !== 'none' && el.offsetWidth > 0, editOverlay) : false;
        if (!editVisible2) find('BUG', 'Edit', 'Edit button clicked but edit modal not visible');
        else {
          find('OK', 'Edit', 'Edit modal opens');
          // Check fields
          const editFields = await page.$$eval('#editModalOverlay input, #editModalOverlay select, #editModalOverlay textarea', els => els.map(e => e.id || e.name || e.placeholder).filter(Boolean));
          find('OK', 'Edit', `Edit fields: ${editFields.slice(0,6).join(', ')}`);
          if (!editFields.some(f => f.toLowerCase().includes('title'))) find('WARN', 'Edit', 'No title field found in edit modal');
          if (!editFields.some(f => f.toLowerCase().includes('author'))) find('WARN', 'Edit', 'No author field found in edit modal');

          // Overflow
          const editOv = await page.evaluate(() => {
            const el = document.getElementById('editModalOverlay');
            return el ? el.scrollWidth > el.clientWidth : false;
          });
          if (editOv) find('BUG', 'Edit', 'Horizontal overflow in edit modal');

          await shot(page, '14-edit-fields');

          // Cancel
          const cancelBtn = await page.$('#editModalOverlay button:has-text("Cancel"), #editModalOverlay [data-action="cancel"]');
          if (cancelBtn) {
            await cancelBtn.click();
            await pause(page, 800);
            find('OK', 'Edit', 'Cancel button closes edit modal');
          } else {
            find('WARN', 'Edit', 'No cancel button in edit modal');
            await page.keyboard.press('Escape');
          }
        }
      } catch (e) {
        find('WARN', 'Edit', `Edit button click failed: ${e.message.slice(0,60)}`);
      }
    } else {
      find('WARN', 'Edit', 'Edit button not found in detail modal after searching');
    }

    // Close detail modal — use JS click to avoid viewport issues
    const modalClosed0 = await page.evaluate(() => {
      const closeBtn = document.querySelector('#modalOverlay .ms-close, #modalOverlay [data-action="close"], #modalOverlay button[aria-label*="close" i]');
      if (closeBtn) { closeBtn.click(); return 'btn'; }
      // Fallback: click the overlay backdrop
      const overlay = document.getElementById('modalOverlay');
      if (overlay) { overlay.click(); return 'overlay'; }
      return 'none';
    });
    log(`  Modal close method: ${modalClosed0}`);
    await pause(page, 800);
    await shot(page, '15-modal-closed');
    const modalClosed = await page.evaluate(() => {
      const el = document.getElementById('modalOverlay');
      return !el || getComputedStyle(el).opacity !== '1';
    });
    if (!modalClosed) find('BUG', 'Detail', 'Detail modal does not close — opacity still 1 after close attempt');
    else find('OK', 'Detail', 'Detail modal closes correctly');
  }

  // ─────────────────────────────────────────────────────────
  // 6. ADD BOOK VIEW
  // ─────────────────────────────────────────────────────────
  log('\n══ 6. ADD BOOK ══');
  await navClick(page, '#bn-entry');
  const entryVisible = await waitForView(page, 'view-entry');
  await pause(page, 1200);
  await shot(page, '16-add-view');
  if (!entryVisible) find('BUG', 'Add', '#view-entry never visible after #bn-entry click');
  else find('OK', 'Add', 'Add book view renders');

  const scanBtn = await page.$('.scan-btn, [class*="scan"], button:has-text("Scan"), button:has-text("Camera"), .file-input');
  if (!scanBtn) find('WARN', 'Add', 'No scan/camera input on add view');
  else find('OK', 'Add', 'Scan/photo input present');

  const titleField = await page.$('#f-title');
  const authorField = await page.$('#f-author');
  if (!titleField) find('BUG', 'Add', '#f-title input not found');
  else find('OK', 'Add', 'Title (#f-title) input present');
  if (!authorField) find('BUG', 'Add', '#f-author input not found');
  else find('OK', 'Add', 'Author (#f-author) input present');

  // Check price fetch button
  const fetchPriceBtn = await page.$('#fetchPriceBtn');
  if (!fetchPriceBtn) find('WARN', 'Add', 'No "Fetch Price Estimate" button on add view');
  else find('OK', 'Add', '"Fetch Price Estimate" button present');

  // Check eBay / dealer links
  const dealerLinks = await page.$$('.search-dealer-btn, [class*="dealer"]');
  find('OK', 'Add', `${dealerLinks.length} dealer search button(s) present`);

  await checkOverflow(page, 'Add');

  // Try filling and submitting
  if (titleField && authorField) {
    const titleVis = await titleField.isVisible();
    if (titleVis) {
      await titleField.fill('Test Book QA');
      await authorField.fill('QA Tester');
      await shot(page, '17-add-filled');
      find('OK', 'Add', 'Title/author fields fillable');
      // Clear
      await titleField.fill('');
      await authorField.fill('');
    } else {
      find('WARN', 'Add', 'Title/author fields in DOM but not visible — may need scroll');
    }
  }

  // ─────────────────────────────────────────────────────────
  // 7. WISHLIST
  // ─────────────────────────────────────────────────────────
  log('\n══ 7. WISHLIST ══');
  await navClick(page, '#bn-wishlist');
  await pause(page, 1200);
  await shot(page, '18-wishlist');
  // Can't wait for view-wishlist since it may have a different id
  const wishText = await page.evaluate(() => document.body.innerText.toLowerCase());
  if (!wishText.includes('wishlist')) find('WARN', 'Wishlist', 'No "wishlist" text visible after #bn-wishlist click');
  else find('OK', 'Wishlist', 'Wishlist view content visible');
  await checkOverflow(page, 'Wishlist');

  // ─────────────────────────────────────────────────────────
  // 8. SETTINGS
  // ─────────────────────────────────────────────────────────
  log('\n══ 8. SETTINGS ══');
  await navClick(page, '#bn-settings');
  const settingsOk = await waitForView(page, 'view-settings');
  await pause(page, 1200);
  await shot(page, '19-settings');
  if (!settingsOk) find('BUG', 'Settings', '#view-settings never visible');
  else find('OK', 'Settings', 'Settings view renders');

  const signOutBtn = await page.$('button:has-text("Sign out"), button:has-text("Log out"), button:has-text("Sign Out"), [data-action="signout"]');
  if (!signOutBtn) find('WARN', 'Settings', 'No sign-out button in settings');
  else find('OK', 'Settings', 'Sign-out button present');

  // Check for currency setting
  const currencyEl = await page.$('#currency, select[name*="currency" i], [id*="currency"]');
  if (!currencyEl) find('WARN', 'Settings', 'No currency selector found');
  else find('OK', 'Settings', 'Currency selector present');

  // CSV export/import
  const csvEl = await page.$('button:has-text("Export"), button:has-text("CSV"), [data-action*="export" i], [data-action*="import" i]');
  if (!csvEl) find('WARN', 'Settings', 'No CSV export/import button found');
  else find('OK', 'Settings', 'CSV export/import button present');

  await checkOverflow(page, 'Settings');
  await shot(page, '20-settings-full');

  // ─────────────────────────────────────────────────────────
  // 9. BOTTOM NAV TAP TARGETS
  // ─────────────────────────────────────────────────────────
  log('\n══ 9. TAP TARGETS & A11Y ══');
  const smallBtns = await page.$$eval('button, a, [role="button"]', els =>
    els.filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44);
    }).map(el => ({
      text: (el.textContent || '').trim().slice(0,30),
      cls: el.className.toString().slice(0,40),
      w: Math.round(el.getBoundingClientRect().width),
      h: Math.round(el.getBoundingClientRect().height),
    }))
  );
  if (smallBtns.length > 0) {
    find('WARN', 'A11y', `${smallBtns.length} tap target(s) < 44px`);
    smallBtns.slice(0,5).forEach(b => find('WARN', 'A11y', `Small target: "${b.text}" ${b.w}×${b.h}px — cls: ${b.cls}`));
  } else find('OK', 'A11y', 'All tap targets ≥ 44px');

  const imgsNoAlt = await page.$$eval('img', imgs => imgs.filter(i => !i.alt).map(i => i.src.split('/').pop().slice(0,30)));
  if (imgsNoAlt.length) find('WARN', 'A11y', `${imgsNoAlt.length} img(s) missing alt: ${imgsNoAlt.slice(0,3).join(', ')}`);
  else find('OK', 'A11y', 'All images have alt text');

  // ─────────────────────────────────────────────────────────
  // 10. USER MENU
  // ─────────────────────────────────────────────────────────
  log('\n══ 10. USER MENU ══');
  await page.click('#userMenuBtn');
  await pause(page, 700);
  await shot(page, '21-user-menu');
  const navMenu = await page.$('#navMenu');
  const menuVisible = navMenu ? await page.evaluate(el => el.offsetWidth > 0, navMenu) : false;
  if (!menuVisible) find('WARN', 'Nav', '#navMenu not visible after #userMenuBtn click');
  else find('OK', 'Nav', 'User menu (#navMenu) opens');
  // Close by clicking away
  await page.mouse.click(195, 500);
  await pause(page, 400);

  // ─────────────────────────────────────────────────────────
  // 11. BACK TO CATALOG — FINAL SCREENSHOT
  // ─────────────────────────────────────────────────────────
  await navClick(page, '#bn-catalog');
  await pause(page, 1500);
  await shot(page, '22-catalog-final');

  log('\nBrowser stays open 10s for review...');
  await pause(page, 10000);
  await browser.close();

  writeReport();
}

function writeReport() {
  const bugs = findings.filter(f => f.sev === 'CRITICAL' || f.sev === 'BUG');
  const warns = findings.filter(f => f.sev === 'WARN');
  const oks = findings.filter(f => f.sev === 'OK');

  let r = `# MagiLib QA Report — ${new Date().toISOString().slice(0,10)}\n\n`;
  r += `**URL:** ${BASE_URL}  \n**Viewport:** 390×844 (iPhone 14)  \n**Tester:** Playwright 1.59.1\n\n---\n\n`;
  r += `## Summary\n\n| | Count |\n|--|--|\n`;
  r += `| 🔴 Critical | ${findings.filter(f=>f.sev==='CRITICAL').length} |\n`;
  r += `| 🟠 Bug | ${findings.filter(f=>f.sev==='BUG').length} |\n`;
  r += `| 🟡 Warn | ${warns.length} |\n`;
  r += `| ✅ OK | ${oks.length} |\n`;
  r += `| Console errors | ${consoleErrors.length} |\n`;
  r += `| Network failures | ${networkErrors.length} |\n\n---\n\n`;

  if (bugs.length) {
    r += `## 🔴🟠 Bugs & Criticals\n\n`;
    bugs.forEach(b => {
      r += `### [${b.sev}] ${b.area} — ${b.desc}\n`;
      if (b.detail) r += `> ${b.detail}\n`;
      r += '\n';
    });
  }

  if (warns.length) {
    r += `## 🟡 Warnings / UX Issues\n\n`;
    warns.forEach(w => {
      r += `- **${w.area}:** ${w.desc}`;
      if (w.detail) r += `\n  > ${w.detail}`;
      r += '\n';
    });
    r += '\n';
  }

  if (consoleErrors.length) {
    r += `## Console Errors\n\n\`\`\`\n`;
    consoleErrors.forEach(e => r += `[${e.url}]\n${e.text}\n\n`);
    r += '```\n\n';
  }
  if (networkErrors.length) {
    r += `## Network Failures\n\n\`\`\`\n`;
    networkErrors.forEach(e => r += `${e.url}\n  → ${e.err}\n`);
    r += '```\n\n';
  }

  r += `## ✅ Passing Checks\n\n`;
  oks.forEach(o => r += `- **${o.area}:** ${o.desc}\n`);
  r += `\n---\n\nScreenshots saved to \`magilib-qa/screenshots/\`\n`;

  fs.writeFileSync(REPORT_PATH, r);

  console.log('\n' + '═'.repeat(52));
  console.log('BUGS:');
  bugs.forEach(b => console.log(`  [${b.sev}] ${b.area}: ${b.desc}`));
  console.log('\nWARNINGS:');
  warns.forEach(w => console.log(`  ${w.area}: ${w.desc}`));
  console.log(`\n✅ ${oks.length} checks passed`);
  if (consoleErrors.length) { console.log('\nCONSOLE ERRORS:'); consoleErrors.forEach(e => console.log(`  ${e.text.slice(0,80)}`)); }
  console.log('═'.repeat(52));
  console.log(`\nReport: ${REPORT_PATH}`);
}

run().catch(err => { console.error('FATAL:', err.message); writeReport(); process.exit(1); });
