S.editRowNum = -1;
S.editInPrint = undefined;

function setEditInPrint(val) {
  S.editInPrint = val;
  const map = {true: 'editInPrintYes', false: 'editInPrintNo', null: 'editInPrintUnknown'};
  ['editInPrintYes','editInPrintNo','editInPrintUnknown'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) { btn.style.background = ''; btn.style.borderColor = ''; btn.style.fontWeight = ''; }
  });
  const activeId = map[String(val)];
  const activeBtn = document.getElementById(activeId);
  if (activeBtn) { activeBtn.style.background = 'var(--accent-light)'; activeBtn.style.borderColor = 'var(--accent)'; activeBtn.style.fontWeight = '600'; }
  const hidden = document.getElementById('edit-in-print');
  if (hidden) hidden.value = val === null ? '' : String(val);
  _markEditDirty();
}

function openEditFromModal() {
  const idx = S.currentModalIdx;
  const b = S.books[idx];
  if (!b) return;
  S.editRowNum = idx + 2; // +2 for header row and 0-index offset
  S.editCoverUrl = b.rawCover || b.coverUrl || '';

  // Clear ALL edit fields first before populating
  ['edit-title','edit-author','edit-artist','edit-edition','edit-year',
   'edit-publisher','edit-isbn','edit-price','edit-cost','edit-notes'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  populateEditCondition('', ''); // clear condition + flags

  document.getElementById('edit-title').value = b.title || '';
  document.getElementById('edit-author').value = b.author || '';
  const artistEl = document.getElementById('edit-artist');
  if (artistEl) artistEl.value = b.artist || '';
  document.getElementById('edit-edition').value = b.edition || '';
  document.getElementById('edit-year').value = b.year || '';
  document.getElementById('edit-publisher').value = b.publisher || '';
  document.getElementById('edit-isbn').value = b.isbn || '';
  document.getElementById('edit-price').value = (b.price && !isNaN(parseFloat(b.price))) ? b.price : '';
  document.getElementById('edit-cost').value = (b.cost && !isNaN(parseFloat(b.cost))) ? b.cost : '';
  document.getElementById('edit-notes').value = b.notes || '';
  const editLocEl = document.getElementById('edit-location');
  if (editLocEl) editLocEl.value = b.location || '';
  const editCnEl = document.getElementById('edit-collector-note');
  if (editCnEl) editCnEl.value = b.collectorNote || '';
  populateEditCondition(b.condition, b.flags);

  const img = document.getElementById('editCoverImg');
  const ph = document.getElementById('editCoverPh');
  if (S.editCoverUrl) {
    img.src = S.editCoverUrl; img.style.display = 'block'; ph.style.display = 'none';
  } else {
    img.style.display = 'none'; ph.style.display = 'flex';
  }

  // Show/hide fields based on whether this is a wishlist item
  const isWishlist = b.sold === 'Wishlist';
  const libOnlyIds = ['editYearField','editIsbnField','editConditionDivider','editConditionSection','editPurchasePriceField','editLocationField','editCollectorNoteField'];
  libOnlyIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = isWishlist ? 'none' : '';
  });
  // In Print toggle: wishlist only
  const ipRow = document.getElementById('editInPrintRow');
  if (ipRow) ipRow.style.display = isWishlist ? '' : 'none';
  S.editInPrint = undefined;
  if (isWishlist) setEditInPrint(b.inPrint !== undefined ? b.inPrint : null);
  document.getElementById('editModalTitle').textContent = isWishlist ? 'Edit Wishlist — ' + b.title : 'Edit — ' + b.title;

  closeModal();
  document.getElementById('editModalOverlay').classList.remove('hidden');
  // Scroll the modal's own content to top, not the page
  const editScroll = document.getElementById('editModalScroll');
  if (editScroll) editScroll.scrollTop = 0;
  // Reset dirty flag and attach change listeners to all fields
  _editDirty = false;
  setTimeout(() => {
    document.querySelectorAll('#editModalOverlay input, #editModalOverlay textarea, #editModalOverlay select').forEach(el => {
      el.addEventListener('input', _markEditDirty);
      el.addEventListener('change', _markEditDirty);
    });
  }, 100);
}

let _editDirty = false;

function closeEditModal(e) {
  const overlay = document.getElementById('editModalOverlay');
  const fromBackdrop = e && e.target === overlay;
  const fromProgrammatic = !e;
  // Only close if: backdrop tap, programmatic call (save/cancel), or X button
  // Ignore bubbled clicks from inner elements
  if (!fromBackdrop && !fromProgrammatic) return;
  if (_editDirty && fromBackdrop) {
    if (!confirm('Leave without saving? Your changes will be lost.')) return;
  }
  _editDirty = false;
  overlay.classList.add('hidden');
}

function _markEditDirty() { _editDirty = true; }

async function saveEdit() {
  const idx = S.currentModalIdx;
  const b = S.books[idx];
  if (!b || !b._id) { showToast('Could not determine book to update', 'error'); return; }
  if (!_supaUser) { showToast('Not signed in', 'error'); return; }

  const btn = document.getElementById('editSaveBtn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Saving…';

  const _rawNotes   = document.getElementById('edit-notes').value.trim();
  const _editInPrint = S.editInPrint !== undefined ? S.editInPrint : (b.inPrint !== undefined ? b.inPrint : null);
  // For wishlist items, encode In Print status into the notes field (no dedicated DB column)
  const _savedNotes = (b.sold === 'Wishlist')
    ? buildNotesWithInPrint(_rawNotes, _editInPrint)
    : _rawNotes;

  const updatedFields = {
    title:          document.getElementById('edit-title').value.trim(),
    author:         document.getElementById('edit-author').value.trim(),
    artist_subject: document.getElementById('edit-artist') ? document.getElementById('edit-artist').value.trim() : (b.artist || ''),
    edition:        document.getElementById('edit-edition').value.trim(),
    year:           document.getElementById('edit-year').value.trim(),
    publisher:      document.getElementById('edit-publisher').value.trim(),
    isbn:           document.getElementById('edit-isbn').value.trim(),
    condition:      S.editCondition || document.getElementById('edit-condition').value || b.condition || '',
    market_price:   parseFloat(document.getElementById('edit-price').value) || null,
    purchase_price: parseFloat(document.getElementById('edit-cost').value) || null,
    notes:          _savedNotes,
    cover_url:      S.editCoverUrl || b.coverUrl || '',
    condition_flags:(S.editFlags && S.editFlags.length ? S.editFlags.join(', ') : '') || b.flags || '',
    collectors_note:(document.getElementById('edit-collector-note')||{value:''}).value.trim() || b.collectorNote || '',
    where_acquired: (document.getElementById('edit-location')||{value:''}).value.trim() || b.location || '',
    updated_at:     new Date().toISOString(),
  };

  const { error } = await _supa.from('books').update(updatedFields).eq('id', b._id);
  if (error) { showToast('Update failed: ' + error.message, 'error'); btn.disabled=false; btn.textContent='Save Changes'; return; }

  // Update local cache — store clean notes (no IP tag) so UI always shows readable text
  S.books[idx] = { ...b, title:updatedFields.title, author:updatedFields.author, artist:updatedFields.artist_subject, edition:updatedFields.edition, year:updatedFields.year, publisher:updatedFields.publisher, isbn:updatedFields.isbn, condition:updatedFields.condition, price:updatedFields.market_price!=null?String(updatedFields.market_price):'', cost:updatedFields.purchase_price!=null?String(updatedFields.purchase_price):'', notes:_rawNotes, coverUrl:updatedFields.cover_url, rawCover:updatedFields.cover_url, flags:updatedFields.condition_flags, collectorNote:updatedFields.collectors_note, location:updatedFields.where_acquired, inPrint:_editInPrint };
  renderCatalog();
  _editDirty = false;
  showToast('✓ Book updated', 'success', 3000);
  closeEditModal();
  btn.disabled = false; btn.textContent = 'Save Changes';
}




// ── CAPITALISATION ──
// Converts text to title case, respecting common small words
// Tokens that must always appear in a specific casing regardless of position
const PROTECTED_TOKENS = { 'l&l': 'L&L', 'bwm': 'BWM', 'tcc': 'TCC', 'ibm': 'IBM', 'usa': 'USA', 'uk': 'UK' };

function toTitleCase(str) {
  if (!str) return str;
  const small = new Set(['a','an','the','and','but','or','for','nor','on','at','to','by','in','of','up','as','is','it']);
  const result = str.toLowerCase().replace(/[^\s-]+/g, (word, idx, full) => {
    const lower = word.toLowerCase();
    if (PROTECTED_TOKENS[lower]) return PROTECTED_TOKENS[lower];
    const isFirst = idx === 0;
    const isAfterPunct = idx > 0 && /[:(—\/]/.test(full[idx-1]);
    if (isFirst || isAfterPunct || !small.has(word)) {
      return word.charAt(0).toUpperCase() + word.slice(1);
    }
    return word;
  });
  return result;
}

// For publisher fields: check the canonical PUBLISHERS list for an exact case-insensitive match first
function toTitleCasePublisher(str) {
  if (!str) return str;
  if (typeof PUBLISHERS !== 'undefined') {
    const lower = str.toLowerCase().trim();
    const match = PUBLISHERS.find(p => p.toLowerCase() === lower);
    if (match) return match; // return the canonical casing from the list
  }
  return toTitleCase(str);
}

// Apply title case to a field value
function applyTitleCase(id) {
  const el = document.getElementById(id);
  if (el && el.value) el.value = toTitleCase(el.value);
}

// ── CONDITION FLAGS ──
S.conditionFlags = [];
function toggleFlag(btn, value) {
  const active = btn.classList.toggle('active');
  if (active) {
    if (!S.conditionFlags.includes(value)) S.conditionFlags.push(value);
  } else {
    S.conditionFlags = S.conditionFlags.filter(v => v !== value);
  }
}
function clearFlags() {
  document.querySelectorAll('#conditionFlags .flag-btn').forEach(b => b.classList.remove('active'));
  S.conditionFlags = [];
}

// ── SCROLL TO TOP AFTER SAVE ──
function clearForm() {
  // Clear all text fields
  ['f-title','f-author','f-artist','f-edition','f-year','f-publisher','f-isbn','f-price','f-cost','f-notes','f-location','f-collector-note'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  // Reset condition
  S.condition = ''; S.coverUrl = ''; S.coverUrlHighRes = '';
  document.querySelectorAll('.condition-opt').forEach(b => b.classList.remove('selected'));
  // Reset cover display
  const coverImg = document.getElementById('coverImg');
  const coverPh = document.getElementById('coverPlaceholder');
  if (coverImg) coverImg.style.display = 'none';
  if (coverPh) coverPh.style.display = 'flex';
  // Reset price display
  const pd = document.getElementById('priceDisplay');
  const cl = document.getElementById('currencyLabel');
  if (pd) pd.innerHTML = '— <span id="currencyLabel">' + (S.settings.currency || 'AUD') + '</span>';
  const pr = document.getElementById('priceRange');
  if (pr) pr.textContent = '';
  const ps = document.getElementById('priceSource');
  if (ps) ps.textContent = '';
  const sb = document.getElementById('sourceBreakdown');
  if (sb) sb.style.display = 'none';
  // Reset scan status
  const ss = document.getElementById('scanStatus');
  if (ss) ss.className = 'scan-status';
  // Clear flags
  clearFlags();
  // Hide and clear AI info card
  const ac = document.getElementById('aiInfoCard');
  const ai = document.getElementById('aiInfoContent');
  if (ac) ac.style.display = 'none';
  if (ai) ai.innerHTML = '';
  // Clear URL inputs
  const urlEl = document.getElementById('manualUrlInput');
  if (urlEl) urlEl.value = '';
  const urlArea = document.getElementById('urlInputArea');
  if (urlArea) urlArea.style.display = 'none';
  // Scroll to top
  const ve = document.getElementById('view-entry');
  if (ve) ve.scrollTo({top: 0, behavior: 'smooth'});
  window.scrollTo({top: 0, behavior: 'smooth'});
  // Clear any draft context so a future save doesn't accidentally delete a row
  S.draftRowIdx = null;
  S.draftRowNum = null;
  // Reset save button back to normal state
  const saveBtn = document.getElementById('saveBtn');
  if (saveBtn) { saveBtn.textContent = 'Save to Sheet'; saveBtn.style.background = ''; saveBtn.style.color = ''; }
}

// ── AI INFO CARD ──
function showAiInfoCard(html) {
  const card = document.getElementById('aiInfoCard');
  const content = document.getElementById('aiInfoContent');
  if (!html) { card.style.display = 'none'; return; }
  content.innerHTML = html;
  card.style.display = 'block';
}

// Fetch AI book intelligence after scan
function checkLocalDBBadges(title) {
  if (!title) return;
  const inPrice = lookupPriceDB(title);
  const inDisc  = !inPrice && lookupDiscontinued(title);
  const badge   = document.getElementById('localDBBadge');
  if (!badge) return;
  if (inPrice) {
    badge.innerHTML = '<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;padding:4px 10px;border-radius:20px;background:#e8f5ee;color:#2d6a4f;border:0.5px solid #a3d9b9;">✓ In Print — MSRP USD $' + inPrice.price_usd.toFixed(2) + '</span>';
    badge.style.display = 'block';
  } else if (inDisc) {
    badge.innerHTML = '<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;padding:4px 10px;border-radius:20px;background:#faeeda;color:#854f0b;border:0.5px solid #f5d59a;">⚠ Possibly Out of Print</span>';
    badge.style.display = 'block';
  } else {
    badge.style.display = 'none';
  }
}

async function fetchBookIntelligence(title, author) {
  if (!title) return;
  // Show local DB badge immediately
  checkLocalDBBadges(title);
  // Clear card immediately so stale content never shows while waiting
  const _preCard = document.getElementById('aiInfoCard');
  const _preContent = document.getElementById('aiInfoContent');
  if (_preCard) _preCard.style.display = 'none';
  if (_preContent) _preContent.innerHTML = '';
  try {
    const data = await callClaude([{role:'user', content:
      `You are a magic and conjuring book expert. For the book "${title}"${author ? ' by "' + author + '"' : ''}, provide:
1. A brief intelligence summary: rarity/scarcity, historical significance, collector notes, typical condition issues. Under 60 words. Do NOT include a heading or label like "Intelligence Summary:" — just write the summary directly.
2. Any known bibliographic facts you are confident about as JSON on the last line:
{"year":"","publisher":"","edition":""}
Leave fields blank if uncertain. Do not guess.`
    }], 400);
    const raw = data.content[0].text.trim();
    // Extract trailing JSON if present
    const jsonMatch = raw.match(/\{[^}]*"year"[^}]*\}$/m);
    if (jsonMatch) {
      try {
        const meta = JSON.parse(jsonMatch[0]);
        // Only fill fields that are currently empty
        if (meta.year && !document.getElementById('f-year').value) {
          document.getElementById('f-year').value = meta.year;
          showToast('Year filled from Book Intelligence', 'info', 2000);
        }
        if (meta.publisher && !document.getElementById('f-publisher').value) {
          document.getElementById('f-publisher').value = toTitleCasePublisher(meta.publisher);
          showToast('Publisher filled from Book Intelligence', 'info', 2000);
        }
        if (meta.edition && !document.getElementById('f-edition').value) {
          document.getElementById('f-edition').value = toTitleCase(meta.edition);
        }
      } catch(e) { /* JSON parse failed — ignore */ }
    }
    // Show summary text (everything before the JSON line)
    const summaryText = raw.replace(/\{[^}]*"year"[^}]*\}$/m, '').trim()
      .replace(/^\*?\*?Intelligence Summary\*?\*?:\s*/i, '')
      .replace(/^\*?\*?Summary\*?\*?:\s*/i, '').trim();
    showAiInfoCard(summaryText || '<span style="color:var(--ink-faint);font-style:italic;">No intelligence found for this title.</span>');
  } catch(e) {
    showAiInfoCard('<span style="color:var(--ink-faint);font-style:italic;">No intelligence found for this title.</span>');
  }
}

// ── SAVE BOOK: include artist, flags, update row array ──
// Override the row building in saveBook to include new fields
// We patch this by updating the row construction
const _origSaveBook = saveBook;
async function saveBook() {
  const title = document.getElementById('f-title').value.trim();
  const author = document.getElementById('f-author').value.trim();
  const price = document.getElementById('f-price').value;
  if (!title || !author) { showToast('Title and Author are required', 'error'); return; }
  if (!S.condition) { showToast('Please select a condition', 'error'); return; }
  if (!price) { showToast('Please enter or fetch a market price', 'error'); return; }
  if (!_supaUser) { showToast('Not signed in', 'error'); return; }

  const artist = document.getElementById('f-artist') ? document.getElementById('f-artist').value.trim() : '';
  const flags = S.conditionFlags.join(', ');
  const bookRow = {
    user_id: _supaUser.id,
    title,
    author,
    artist_subject: artist,
    edition: document.getElementById('f-edition').value.trim(),
    year: document.getElementById('f-year').value.trim(),
    publisher: document.getElementById('f-publisher').value.trim(),
    isbn: document.getElementById('f-isbn').value.trim(),
    condition: S.condition,
    market_price: parseFloat(price) || null,
    purchase_price: parseFloat(document.getElementById('f-cost').value) || null,
    notes: document.getElementById('f-notes').value.trim(),
    cover_url: S.coverUrl || null,
    date_added: new Date().toISOString().slice(0,10),
    condition_flags: flags,
    sold_status: '',
    star_rating: null,
    collectors_note: (document.getElementById('f-collector-note')||{value:''}).value.trim(),
    where_acquired: (document.getElementById('f-location')||{value:''}).value.trim(),
    draft_status: '',
  };

  const btn = document.getElementById('saveBtn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Saving…';

  // If completing a draft, delete it first
  const wasDraft = !!S.draftRowNum;
  if (S.draftRowNum && S.draftRowIdx !== undefined && S.books[S.draftRowIdx] && S.books[S.draftRowIdx]._id) {
    await _supa.from('books').delete().eq('id', S.books[S.draftRowIdx]._id);
    S.books.splice(S.draftRowIdx, 1);
    S.draftRowNum = null;
    S.draftRowIdx = null;
  }

  const { error } = await _supa.from('books').insert(bookRow);
  if (error) { showToast('Save failed: ' + error.message, 'error', 5000); btn.disabled=false; btn.textContent='Save to Library'; return; }

  showToast(wasDraft ? '✓ Draft completed and saved!' : '✓ Saved to Library!', 'success', 3000);
  clearForm();
  if (wasDraft) { showDraftsInCatalog(); } else { renderCatalog(); }
  btn.disabled = false; btn.textContent = 'Save to Library';
}

// ── SOLD / RETURN TO LIBRARY ──
S.showSold = false;
async function toggleSold() {
  const idx = S.currentModalIdx;
  const b = S.books[idx];
  if (!b) return;
  const isSold = b.sold === 'Sold';
  const newStatus = isSold ? '' : 'Sold';
  const label = isSold ? 'Return to Library' : 'Sold';
  const rowNum = idx + 2; // +1 header +1 for 0-index

  if (!b._id) { showToast('Could not update sold status', 'error'); return; }
  await _supa.from('books').update({ sold_status: newStatus }).eq('id', b._id);
  b.sold = newStatus;
  const btn = document.getElementById('modalSoldBtn');
  if (btn) btn.textContent = isSold ? 'Mark Sold' : 'Return to Library';
  renderCatalog();
  showToast(isSold ? 'Returned to library ✓' : 'Marked as sold ✓', 'success');
  closeModal();
}

function toggleShowSold(btn) {
  S.showSold = !S.showSold;
  btn.classList.toggle('active', S.showSold);
  btn.style.background = S.showSold ? '#a32d2d' : 'transparent';
  btn.style.color = S.showSold ? 'white' : '#a32d2d';
  btn.style.borderColor = S.showSold ? '#a32d2d' : '#f5b7b5';
  renderCatalog();
}

// ── DELETE BOOK ──
async function confirmDelete() {
  const idx = S.currentModalIdx;
  const b = S.books[idx];
  if (!b) return;
  const confirmed = window.confirm(`Delete "${b.title}"?\n\nThis will permanently remove it from your Google Sheet. This cannot be undone.`);
  if (!confirmed) return;

  if (b._id) {
    await _supa.from('books').delete().eq('id', b._id);
  }
  S.books.splice(idx, 1);
  closeModal();
  renderCatalog();
  showToast('Book deleted ✓', 'success');
}

// ── EDIT COVER HELPERS ──

function searchEditCoverImages() {
  const title = document.getElementById('edit-title') ? document.getElementById('edit-title').value.trim() : '';
  const author = document.getElementById('edit-author') ? document.getElementById('edit-author').value.trim() : '';
  if (!title) { showToast('Enter a title first', 'error'); return; }
  S.coverPickerTarget = 'edit';
  document.getElementById('coverPickerOverlay').classList.remove('hidden');
  document.getElementById('coverPickerStatus').textContent = 'Searching Google Images…';
  document.getElementById('coverPickerResults').innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:30px;"><span class="spinner dark"></span></div>';
  // Auto-trigger Google Images search
  searchCoverSource('images');
}



function openGoogleImagesTab() {
  const url = S._googleImgUrl || '';
  if (url) { const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent); if (isMobile) window.location.href = url; else window.open(url, '_blank'); }
}

function pickerUploadCover(event) {
  const file = event.target.files[0]; if (!file) return;
  const r = new FileReader();
  r.onload = async e => {
    const compressed = await compressImage(e.target.result, 300, 0.6);
    selectPickedCover(compressed, null);
    showToast('Cover uploaded ✓', 'success');
  };
  r.readAsDataURL(file);
}
function togglePickerUrlInput() {
  const el = document.getElementById('pickerUrlArea');
  if (el) el.style.display = el.style.display === 'none' ? 'flex' : 'none';
}
function applyPickerUrl() {
  const url = (document.getElementById('pickerUrlInput') || {}).value.trim();
  if (!url) return;
  selectPickedCover(url, null);
}
async function pasteUrlFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    const inp = document.getElementById('pickerUrlInput');
    if (inp && text) {
      inp.value = text.trim();
      inp.focus();
      const btn = document.getElementById('pickerClipboardBtn');
      if (btn) {
        const originalHTML = btn.innerHTML;
        btn.innerHTML = '✓ Pasted';
        btn.style.color = 'var(--success)';
        setTimeout(() => { btn.innerHTML = originalHTML; btn.style.color = ''; }, 1500);
      }
    }
  } catch(e) {
    const inp = document.getElementById('pickerUrlInput');
    if (inp) { inp.focus(); inp.select(); }
    showToast('Tap the URL field and paste manually', 'info');
  }
}


// ── EDIT MODAL CONDITION ──
S.editFlags = [];
function setEditCondition(c) {
  S.editCondition = c;
  document.querySelectorAll('#editCondSelect .condition-opt').forEach(b =>
    b.classList.toggle('selected', b.textContent.trim() === c)
  );
  const hidden = document.getElementById('edit-condition');
  if (hidden) hidden.value = c;
}
function toggleEditFlag(btn, value) {
  const active = btn.classList.toggle('active');
  if (active) { if (!S.editFlags.includes(value)) S.editFlags.push(value); }
  else { S.editFlags = S.editFlags.filter(v => v !== value); }
}
function clearEditFlags() {
  document.querySelectorAll('#editConditionFlags .flag-btn').forEach(b => b.classList.remove('active'));
  S.editFlags = [];
}
function populateEditCondition(condition, flags) {
  S.editCondition = condition || '';
  document.querySelectorAll('#editCondSelect .condition-opt').forEach(b =>
    b.classList.toggle('selected', b.textContent.trim() === condition)
  );
  const hidden = document.getElementById('edit-condition');
  if (hidden) hidden.value = condition || '';
  // Populate flags
  clearEditFlags();
  if (flags) {
    const flagList = flags.split(',').map(f => f.trim()).filter(Boolean);
    flagList.forEach(flag => {
      const btn = [...document.querySelectorAll('#editConditionFlags .flag-btn')]
        .find(b => b.textContent.trim() === flag);
      if (btn) { btn.classList.add('active'); S.editFlags.push(flag); }
    });
  }
}

function toggleEditUrlInput() {
  const el = document.getElementById('editUrlArea');
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}
function applyEditUrl() {
  const url = document.getElementById('editUrlInput').value.trim();
  if (!url) return;
  S.editCoverUrl = url;
  const img = document.getElementById('editCoverImg');
  const ph = document.getElementById('editCoverPh');
  img.src = url; img.style.display = 'block'; ph.style.display = 'none';
  document.getElementById('editUrlArea').style.display = 'none';
}
function uploadEditCover(event) {
  const file = event.target.files[0]; if (!file) return;
  const r = new FileReader();
  r.onload = async e => {
    const compressed = await compressImage(e.target.result, 300, 0.6);
    S.editCoverUrl = compressed;
    const img = document.getElementById('editCoverImg');
    const ph = document.getElementById('editCoverPh');
    img.src = compressed; img.style.display = 'block'; ph.style.display = 'none';
    showToast('Cover uploaded ✓', 'success');
  };
  r.readAsDataURL(file);
}

// ── IMPROVED PRICE FETCH: parallel sources, honest about uncertainty ──