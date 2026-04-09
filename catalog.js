function downloadCSVTemplate() {
  const headers = ['Title','Author','Artist/Subject','Edition','Year','Publisher','ISBN','Condition','Market Price','Purchase Price','Notes','Cover URL','Date Added','Condition Flags','Sold Status','Star Rating','Collector Note','Where Acquired','Draft'];
  // Condition: Fine | Very Good | Good | Fair
  // Sold Status: Active | Sold | Wishlist  (leave blank = Active)
  // Star Rating: 1–5  (leave blank = unrated)
  // Draft: Draft  (leave blank = normal library entry)
  const examples = [
    ['The Art of Magic','Houdini Harry','','First Edition','1920','Sphinx Press','978-0-000-00001-1','Fine','150.00','80.00','Signed copy with dust jacket.','','2024-01-15','','Active','5','Purchased at auction.','Potter & Potter',''],
    ['Card Technique','Hugard Jean','','Second Edition','1946','Faber and Faber','','Good','45.00','20.00','','','','','Sold','3','','eBay',''],
    ['Expert Card Technique','Hugard Jean','Braue Frederick','Revised Edition','1950','Faber and Faber','','Very Good','95.00','','Classic reference work.','','','Spine faded','Wishlist','4','','',''],
    ['Stars of Magic','Various','','','1961','Louis Tannen','','Fair','35.00','','','','','','Active','2','Needs closer inspection before cataloguing.','','Draft'],
  ];
  const rows = [headers, ...examples].map(function(r) {
    return r.map(function(v) { return '"' + String(v).replace(/"/g,'""') + '"'; }).join(',');
  });
  const csv = rows.join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'MagiLib-import-template.csv';
  a.click();
}

function normaliseAuthor(v) {
  if (!v) return '';
  // Detect "Last, First" format and convert to "First Last"
  const m = v.match(/^([^,]+),\s*(.+)$/);
  if (m) return toTitleCase(m[2].trim() + ' ' + m[1].trim());
  return toTitleCase(v);
}

async function importFromCSV(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!_supaUser) { showToast('Please sign in first', 'error'); return; }
  const btn = document.getElementById('csvImportBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Importing…'; }

  const text = await file.text();

  // Proper CSV parser — handles quoted fields with commas inside
  function parseCSV(str) {
    const rows = []; let row = []; let field = ''; let inQuote = false;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i], next = str[i+1];
      if (inQuote) {
        if (ch === '"' && next === '"') { field += '"'; i++; }
        else if (ch === '"') { inQuote = false; }
        else { field += ch; }
      } else {
        if (ch === '"') { inQuote = true; }
        else if (ch === ',') { row.push(field.trim()); field = ''; }
        else if (ch === '\n' || (ch === '\r' && next === '\n')) {
          if (ch === '\r') i++;
          row.push(field.trim()); rows.push(row); row = []; field = '';
        } else { field += ch; }
      }
    }
    if (field || row.length) { row.push(field.trim()); rows.push(row); }
    return rows;
  }

  const allRows = parseCSV(text).filter(r => r.some(c => c));
  if (allRows.length < 2) { showToast('CSV appears empty', 'error'); if(btn){btn.disabled=false;btn.textContent='Import CSV';} return; }

  const headers = allRows[0].map(h => h.toLowerCase().replace(/[^a-z0-9]/g,' ').trim());
  const ci = k => headers.findIndex(h => h.includes(k));
  const colMap = {
    title: ci('title'),
    author: ci('author'),
    artist_subject: ci('artist'),
    edition: ci('edition'),
    year: headers.findIndex(h => h === 'year'),
    publisher: ci('publisher'),
    isbn: ci('isbn'),
    condition: headers.findIndex(h => h.includes('condition') && !h.includes('flag')),
    market_price: ci('market'),
    purchase_price: headers.findIndex(h => h.includes('purchase') && !h.includes('location')),
    notes: ci('notes'),
    cover_url: ci('cover'),
    date_added: ci('date'),
    condition_flags: ci('flag'),
    sold_status: ci('sold'),
    star_rating: ci('star'),
    collectors_note: ci('collector'),
    where_acquired: headers.findIndex(h => h.includes('location') || h.includes('acquired')),
    draft_status: ci('draft'),
  };
  const getC = (row, key) => { const idx = colMap[key]; if (idx == null || idx < 0) return ''; return (row[idx] || '').trim(); };
  const parsePrice = v => { const n = parseFloat(v.replace(/[^0-9.-]/g,'')); return isNaN(n) ? null : n; };
  const parseDate = v => {
    if (!v) return null;
    const au = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (au) return au[3] + '-' + au[2].padStart(2,'0') + '-' + au[1].padStart(2,'0');
    const iso = v.match(/^\d{4}-\d{2}-\d{2}$/);
    if (iso) return v;
    return null;
  };

  // ── Conjuring DB enrichment helper ──
  // Finds the best fuzzy match in CONJURING_DB (≥0.80 confidence).
  // Runs entirely in-memory — no network call needed.
  function enrichFromConjuringDB(title) {
    if (typeof CONJURING_DB === 'undefined' || !title) return null;
    const norm = s => s.toLowerCase()
      .replace(/["""'']/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ').trim()
      .replace(/^(the|a|an)\s+/i, '').trim();
    const q = norm(title);
    let bestKey = null, bestEntry = null, bestScore = 0;
    for (const key of Object.keys(CONJURING_DB)) {
      const score = conjuringFuzzyScore(q, norm(key));
      if (score > bestScore) { bestScore = score; bestKey = key; bestEntry = CONJURING_DB[key]; }
    }
    if (bestScore < 0.80) return null;
    return bestEntry;
  }

  // ── Build rows from CSV ──
  const dataRows = [];
  for (let i = 1; i < allRows.length; i++) {
    const cols = allRows[i];
    const title = getC(cols, 'title');
    if (!title) continue;
    dataRows.push({
      user_id: _supaUser.id,
      title,
      author: normaliseAuthor(getC(cols,'author')),
      artist_subject: getC(cols,'artist_subject'),
      edition: getC(cols,'edition'),
      year: getC(cols,'year'),
      publisher: getC(cols,'publisher'),
      isbn: getC(cols,'isbn'),
      condition: getC(cols,'condition'),
      market_price: parsePrice(getC(cols,'market_price')),
      purchase_price: parsePrice(getC(cols,'purchase_price')),
      notes: getC(cols,'notes'),
      cover_url: getC(cols,'cover_url'),
      date_added: parseDate(getC(cols,'date_added')),
      condition_flags: getC(cols,'condition_flags'),
      sold_status: getC(cols,'sold_status'),
      star_rating: parseInt(getC(cols,'star_rating')) || null,
      collectors_note: getC(cols,'collectors_note'),
      where_acquired: getC(cols,'where_acquired'),
      draft_status: getC(cols,'draft_status'),
    });
  }

  // ── Enrich each row from Conjuring DB ──
  // Only fills blank fields — never overwrites what the user already provided.
  let enriched = 0;
  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    if (btn) btn.textContent = 'Enriching ' + (i + 1) + ' of ' + dataRows.length + '…';

    const entry = enrichFromConjuringDB(row.title);
    if (!entry) continue;

    // entry may be a full object (new format) or a plain string cover URL (legacy)
    const isObj = entry && typeof entry === 'object';

    if (!row.cover_url) {
      const cover = isObj ? dbCoverUrl(entry) : (typeof entry === 'string' ? entry : '');
      if (cover) row.cover_url = cover;
    }
    if (!row.author && isObj) {
      const a = dbAuthor(entry);
      if (a) row.author = toTitleCase(a);
    }
    if (!row.year && isObj) {
      const y = dbYear(entry);
      if (y) row.year = y;
    }
    if (!row.publisher && isObj && entry.p) {
      row.publisher = toTitleCasePublisher(entry.p);
    }

    enriched++;
  }

  // ── Insert to Supabase in batches of 100 ──
  if (btn) btn.textContent = 'Saving…';
  let imported = 0;
  let failed = 0;
  for (let i = 0; i < dataRows.length; i += 100) {
    const { error } = await _supa.from('books').insert(dataRows.slice(i, i+100));
    if (!error) imported += Math.min(100, dataRows.length - i);
    else { console.error('Import chunk error:', error); failed += Math.min(100, dataRows.length - i); }
  }

  if (btn) { btn.disabled=false; btn.textContent='Import CSV'; }
  event.target.value='';

  let msg = failed > 0
    ? 'Imported ' + imported + ', ' + failed + ' failed'
    : 'Imported ' + imported + ' book' + (imported !== 1 ? 's' : '') + ' ✓';
  if (enriched > 0 && failed === 0) msg += ' · ' + enriched + ' matched in local database';
  showToast(msg, failed > 0 ? 'error' : 'success', 4000);
  loadCatalog();
}
function loadSettings(){
  try{
    const s=JSON.parse(localStorage.getItem('arcana_books_v2')||'{}');
    S.settings=s;
    const setField = (id, val) => { const el=document.getElementById(id); if(el&&val) el.value=val; };
    setField('s-cloudName', s.cloudName);
    setField('s-cloudPreset', s.cloudPreset);
    if(s.currency){const el=document.getElementById('s-currency');if(el)el.value=s.currency;const cl=document.getElementById('currencyLabel');if(cl)cl.textContent=s.currency;}
    if(s.marketplace){ const el=document.getElementById('s-marketplace'); if(el) el.value=s.marketplace; }
  }catch(e){ console.warn('loadSettings error:', e); }
}
function saveSettings(){
  let existing = {};
  try { existing = JSON.parse(localStorage.getItem('arcana_books_v2')||'{}'); } catch(e){}
  const getVal = id => { const el=document.getElementById(id); return el ? el.value.trim() : ''; };
  const getCheck = id => { const el=document.getElementById(id); return el ? el.checked : true; };
  const s = {
    cloudName: getVal('s-cloudName') || existing.cloudName || '',
    cloudPreset: getVal('s-cloudPreset') || existing.cloudPreset || '',
    currency: getVal('s-currency') || existing.currency || 'AUD',
    marketplace: getVal('s-marketplace') || existing.marketplace || 'EBAY_AU',
    statTotal: getCheck('s-stat-total'),
    statValue: getCheck('s-stat-value'),
    statAvg:   getCheck('s-stat-avg'),
    statTop:   getCheck('s-stat-top'),
    welcomeSeen: existing.welcomeSeen || false,
  };
  S.settings = s;
  try { localStorage.setItem('arcana_books_v2', JSON.stringify(s)); } catch(e){}
  const cl = document.getElementById('currencyLabel');
  if(cl) cl.textContent = s.currency || 'AUD';
}
function showView(v){
  // Safety lock: block leaving Add tab if queue or key fields have content
  if(v!=='entry'){
    const entryActive=document.getElementById('view-entry');
    if(entryActive&&entryActive.classList.contains('active')){
      const titleVal=(document.getElementById('f-title')||{value:''}).value.trim();
      const authorVal=(document.getElementById('f-author')||{value:''}).value.trim();
      if(photoQueue.length>0||titleVal||authorVal){
        showToast('Save or clear the form before switching tabs.','error',4000);
        return;
      }
    }
  }
  document.querySelectorAll('.view').forEach(el=>el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el=>el.classList.remove('active'));
  const tabs={entry:0,catalog:1,wishlist:2,settings:3};
  const _tabBtn = document.querySelectorAll('.tab-btn')[tabs[v]];
  if (_tabBtn) _tabBtn.classList.add('active');
  const catH2=document.querySelector('.catalog-header h2');
  if(v==='wishlist'){
    document.getElementById('view-catalog').classList.add('active');
    S.showWishlist=true; S.showSold=false; S.showDrafts=false;
    const sc=document.getElementById('showSoldChip');
    const dc=document.getElementById('showDraftsChip');
    const qa=document.getElementById('wishlistQuickAdd');
    if(sc){sc.style.display='none';}
    if(dc){dc.style.display='none';}
    if(qa){qa.style.display='block';}
    if(catH2){catH2.textContent='Wishlist';}
    loadCatalog();
  } else {
    document.getElementById('view-'+v).classList.add('active');
    // Leaving wishlist: restore chips and hide quick-add
    if(S.showWishlist){
      S.showWishlist=false;
      const sc=document.getElementById('showSoldChip');
      const dc=document.getElementById('showDraftsChip');
      const qa=document.getElementById('wishlistQuickAdd');
      if(sc){sc.style.display='';}
      if(dc){dc.style.display='';}
      if(qa){qa.style.display='none';}
    }
    if(catH2&&v==='catalog'){catH2.textContent='Library';}
    if(v==='catalog')loadCatalog();
    if(v==='entry')window.scrollTo({top:0,behavior:'instant'});
  }
}
function showToast(msg,type='info',dur=3500){
  const t=document.getElementById('toast');
  t.textContent=msg;t.className='toast '+type+' show';
  setTimeout(()=>t.classList.remove('show'),dur);
}
function setCondition(c){
  S.condition=c;
  document.querySelectorAll('.condition-opt').forEach(b=>b.classList.toggle('selected',b.textContent.trim()===c));
}
function currSym(){return{AUD:'A$',USD:'$',GBP:'£',EUR:'€'}[S.settings.currency||'AUD']||'$';}

function renderSources(sources){
  const bd=document.getElementById('sourceBreakdown');
  const rows=document.getElementById('sourceRows');
  if(!bd||!rows){return;}
  if(!sources||!sources.length){bd.style.display='none';return;}
  const tierDot={1:'tier1-dot',2:'tier2-dot',3:'tier3-dot'};
  const tagClass={specialist:'tag-specialist',sold:'tag-sold',listed:'tag-listed'};
  const tagLabel={specialist:'Specialist',sold:'Sold',listed:'Listed'};
  const sym=currSym();
  rows.innerHTML=sources.map(s=>`
    <div class="source-row">
      <div class="source-tier-dot ${tierDot[s.tier]||'tier2-dot'}"></div>
      <div class="source-info">
        <div class="source-name">${s.name}<span class="source-tag ${tagClass[s.tag]||''}">${tagLabel[s.tag]||''}</span></div>
        <div class="source-detail">${s.detail||''}</div>
        ${s.url?`<a class="source-link" href="${s.url}" target="_blank">${s.urlLabel||'View ↗'}</a>`:''}
      </div>
      <div class="source-price">${s.price!=null?sym+parseFloat(s.price).toFixed(0):'—'}</div>
    </div>`).join('');
  bd.style.display='block';
}

async function scanCover(event){
  const file=event.target.files[0];if(!file)return;
  event.target.value='';
  // Clear intelligence card for new listing
  const _ac=document.getElementById('aiInfoCard');
  const _ai=document.getElementById('aiInfoContent');
  if(_ac){_ac.style.display='none';}
  if(_ai){_ai.innerHTML='';}

  // Step 1: read file as dataUrl
  const rawDataUrl = await new Promise((res,rej)=>{
    const r=new FileReader();
    r.onload=e=>res(e.target.result);
    r.onerror=()=>rej(new Error('Could not read file'));
    r.readAsDataURL(file);
  });

  // Step 2: compress to thumbnail for display and storage
  await setCoverCompressed(rawDataUrl);

  // Step 3: compress to scan-quality for API (800px, better quality for OCR)
  const scanDataUrl = await compressImage(rawDataUrl, 800, 0.85);
  const b64 = scanDataUrl.split(',')[1];

  const statusEl=document.getElementById('scanStatus');
  statusEl.className='scan-status scanning';
  document.getElementById('scanIcon').textContent='⏳';
  document.getElementById('scanTitle').textContent='Analysing cover…';
  document.getElementById('scanDetail').textContent='Claude is reading the title, author, and edition from your photo.';

  try{
    const data=await callClaude([{role:'user',content:[
      {type:'image',source:{type:'base64',media_type:'image/jpeg',data:b64}},
      {type:'text',text:'You are a bibliographic expert specialising in magic and conjuring books. Extract all metadata visible on this book cover. Reply ONLY with valid JSON, no markdown: {"title":"","author":"","artist":"","edition":"","year":"","publisher":"","isbn":"","confidence":"high|medium|low","fields_found":[],"notes":""}'}
    ]}],600);
    const json=JSON.parse(data.content[0].text.replace(/```json|```/g,'').trim());
    const fields=[{id:'f-title',val:json.title},{id:'f-author',val:json.author},{id:'f-artist',val:json.artist||''},{id:'f-edition',val:json.edition},{id:'f-year',val:json.year},{id:'f-publisher',val:json.publisher},{id:'f-isbn',val:json.isbn}];
    let populated=0;
    fields.forEach(f=>{if(f.val&&f.val.trim()){const el=document.getElementById(f.id);el.value=toTitleCase(f.val.trim());el.classList.add('field-populated');setTimeout(()=>el.classList.remove('field-populated'),3000);populated++;}});
    const confClass={high:'conf-high',medium:'conf-med',low:'conf-low'}[json.confidence]||'conf-med';
    statusEl.className='scan-status done';
    document.getElementById('scanIcon').textContent='✓';
    document.getElementById('scanTitle').innerHTML=`${populated} fields extracted <span class="confidence-badge ${confClass}">${json.confidence} confidence</span>`;
    document.getElementById('scanDetail').textContent=json.notes||'Please verify the details below before saving.';
    if(json.title&&json.author){setTimeout(()=>fetchPrice(),800);setTimeout(()=>fetchBookIntelligence(json.title,json.author),1500);}
    if(json.title){
      // Try fuzzy match against Conjuring Archive DB immediately after scan
      setTimeout(async () => {
        const match = conjuringFuzzyLookup(json.title);
        if (match) {
          await applyConjuringMatch(match, 'scan');
        } else {
          checkConjuringDB(json.title); // fall back to exact match display
        }
      }, 300);
    }
  }catch(err){
    statusEl.className='scan-status error';
    document.getElementById('scanIcon').textContent='✕';
    document.getElementById('scanTitle').textContent='Scan failed';
    document.getElementById('scanDetail').textContent=(err&&err.message)||'Could not read the cover. Please fill in details manually.';
  }
}

async function searchCover(){
  const title=document.getElementById('f-title').value.trim();
  const author=document.getElementById('f-author').value.trim();
  const isbn=document.getElementById('f-isbn').value.trim();
  if(!title){showToast('Enter a title first','error');return;}
  showToast('Searching for cover…','info');
  let imgUrl='';
  if(isbn){imgUrl=`https://books.google.com/books/content?vid=ISBN${isbn.replace(/-/g,'')}&printsec=frontcover&img=1&zoom=2`;}
  else{const q=encodeURIComponent(`${title} ${author} magic conjuring`);try{const r=await fetch(`https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=5`);if(r.ok){const d=await r.json();const item=(d.items||[]).find(i=>i.volumeInfo&&i.volumeInfo.imageLinks);if(item)imgUrl=(item.volumeInfo.imageLinks.thumbnail||'').replace('http://','https://').replace('&zoom=1','&zoom=2');}}catch(e){}}
  if(imgUrl){setCover(imgUrl);showToast('Cover found!','success');}
  else showToast('No cover found — try uploading or pasting a URL','error');
}
function setCover(url){S.coverUrl=url;const img=document.getElementById('coverImg');const ph=document.getElementById('coverPlaceholder');img.onload=()=>{img.style.display='block';ph.style.display='none';};img.onerror=()=>{img.style.display='none';ph.style.display='flex';};img.src=url;}
function uploadCover(event){const file=event.target.files[0];if(!file)return;const r=new FileReader();r.onload=async e=>{await setCoverCompressed(e.target.result);};r.readAsDataURL(file);}
function toggleUrlInput(){const el=document.getElementById('urlInputArea');el.style.display=el.style.display==='none'?'block':'none';}
function applyManualUrl(){
  const url=(document.getElementById('manualUrlInput')||{}).value.trim();
  if(!url){showToast('Please paste a URL first','error');return;}
  S.coverUrl = url;
  const img=document.getElementById('coverImg');
  const ph=document.getElementById('coverPlaceholder');
  if(img){
    img.onload=()=>{img.style.display='block';if(ph)ph.style.display='none';};
    img.onerror=()=>{img.style.display='none';if(ph)ph.style.display='flex';showToast('Could not load that image','error');};
    img.src=url;
  }
  const urlArea=document.getElementById('urlInputArea');
  if(urlArea)urlArea.style.display='none';
}
function buildEbayUrl(title,author){const siteMap={EBAY_AU:'ebay.com.au',EBAY_US:'ebay.com',EBAY_GB:'ebay.co.uk'};const domain=siteMap[S.settings.marketplace||'EBAY_AU']||'ebay.com.au';return`https://www.${domain}/sch/i.html?_nkw=${encodeURIComponent(title+' '+author+' magic')}&LH_Sold=1&LH_Complete=1`;}
function buildWishlistEbayUrl(title, author) {
  const q = encodeURIComponent(title + (author ? ' ' + author : '') + ' book');
  return 'https://www.ebay.com/sch/i.html?_nkw=' + q + '&_sacat=0&_stpos=4123&_fcid=15';
}
function openDealerSearch(dealer, e) {
  if (e) e.preventDefault();
  const title  = document.getElementById('f-title').value.trim();
  const author = document.getElementById('f-author').value.trim();
  if (!title) { showToast('Enter a title first', 'error'); return; }
  const q = encodeURIComponent(title + (author ? ' ' + author : ''));
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const urls = {
    ebay: buildEbayUrl(title, author),
    qtte: 'https://www.google.com/search?q=' + encodeURIComponent(title + (author ? ' ' + author : '') + ' site:quickerthantheeye.com'),
    cmb:  'https://www.collectingmagicbooks.com/all?search=' + q,
    mc:   'https://www.magiccollectibles.com/?s=' + q,
  };
  const url = urls[dealer];
  if (!url) return;
  if (isMobile) { window.location.href = url; } else { window.open(url, '_blank'); }
}

function openEbay(e){
  e.preventDefault();
  const title=document.getElementById('f-title').value.trim();
  const author=document.getElementById('f-author').value.trim();
  if(!title){showToast('Enter a title first','error');return;}
  const url = buildEbayUrl(title,author);
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (isMobile) { window.location.href = url; } else { window.open(url,'_blank'); }
}





// Apps Script URL is now configurable in Settings
function getScriptUrl(){ return ''; } // Legacy stub — no longer used

// ── IN PRINT ↔ NOTES ENCODING ──
// Persists "In Print" status as a trailing line in the notes field.
// Format appended: "\nIn Print: Yes"  or  "\nIn Print: No"
function parseInPrintFromNotes(raw) {
  if (!raw) return { notes: '', inPrint: null };
  const m = raw.match(/\nIn Print: (Yes|No)\s*$/i);
  if (!m) return { notes: raw.trim(), inPrint: null };
  return { notes: raw.slice(0, raw.length - m[0].length).trim(), inPrint: m[1].toLowerCase() === 'yes' };
}
function buildNotesWithInPrint(notes, inPrint) {
  const base = (notes || '').trim();
  if (inPrint === null || inPrint === undefined) return base;
  const tag = '\nIn Print: ' + (inPrint ? 'Yes' : 'No');
  return base ? base + tag : tag.trim();
}

async function loadCatalog(){
  const grid=document.getElementById('booksGrid');
  initScrollTopBtn();
  grid.innerHTML='<div style="padding:40px;text-align:center;color:var(--ink-faint)"><span class="spinner dark"></span> Loading...</div>';
  if (!_supaUser) { grid.innerHTML=''; return; }
  try{
    const { data, error } = await _supa.from('books').select('*').eq('user_id', _supaUser.id).order('created_at', { ascending: false });
    if (error) throw error;
    S.books = (data || []).map(row => {
      const { notes, inPrint } = parseInPrintFromNotes(row.notes || '');
      return {
        _id: row.id,
        title: row.title || '',
        author: row.author || '',
        artist: row.artist_subject || '',
        edition: row.edition || '',
        year: row.year || '',
        publisher: row.publisher || '',
        isbn: row.isbn || '',
        condition: row.condition || '',
        price: row.market_price != null ? String(row.market_price) : '',
        cost: row.purchase_price != null ? String(row.purchase_price) : '',
        notes,
        coverUrl: row.cover_url || '',
        rawCover: row.cover_url || '',
        dateAdded: row.date_added || '',
        flags: row.condition_flags || '',
        sold: row.sold_status || '',
        star: row.star_rating != null ? String(row.star_rating) : '',
        collectorNote: row.collectors_note || '',
        location: row.where_acquired || '',
        draft: row.draft_status || '',
        inPrint,
      };
    });
    renderCatalog();
    showToast('Loaded '+S.books.length+' books','success',2000);
  }catch(e){
    console.error('Catalog load error:',e);
    grid.innerHTML='<div class="empty-state"><div class="empty-icon">⚠ </div><p>'+e.message+'</p><button onclick="loadCatalog()" style="margin-top:12px;padding:10px 20px;background:var(--accent);color:white;border:none;border-radius:7px;font-family:inherit;font-size:13px;cursor:pointer;">Retry</button></div>';
  }
}
function renderCatalog(){
  renderStatsRow();
  const search=(document.getElementById('catalogSearch').value||'').trim();
  const cond=S.filterCondition||'all';
  const pub=(document.getElementById('filterPublisher')||{}).value||'';

  // Fuzzy search via Fuse.js (if loaded and query present)
  let fuzzyMatched = null;
  if(search && typeof Fuse !== 'undefined'){
    const fuse = new Fuse(S.books, {
      keys: ['title','author','publisher','year'],
      threshold: 0.3,
      ignoreLocation: true,
    });
    fuzzyMatched = new Set(fuse.search(search).map(r => r.item));
  }

  let books=S.books.filter(b=>{
    const ms=!search||(fuzzyMatched ? fuzzyMatched.has(b) : b.title.toLowerCase().includes(search.toLowerCase())||b.author.toLowerCase().includes(search.toLowerCase())||(b.publisher||'').toLowerCase().includes(search.toLowerCase())||(b.year||'').includes(search));
    const mc=cond==='all'||b.condition===cond;
    const mp=!pub||b.publisher===pub;
    if(S.showWishlist) return ms&&mc&&mp&&b.sold==='Wishlist';
    if(S.showDrafts) return ms&&mc&&mp&&b.draft==='Draft';
    if(S.showSold) return ms&&mc&&mp&&b.sold==='Sold';
    return ms&&mc&&mp&&b.sold!=='Sold'&&b.sold!=='Wishlist'&&b.draft!=='Draft';
  });
  // Sort
  const sort=S.sortBy||'dateAdded';
  const dir=S.sortDir||'desc';
  books=[...books].sort((a,b2)=>{
    const normSort = s => (s||'').toLowerCase().trim().replace(/^(the|a|an)\s+/i,'').trim();
    if(sort==='title') return dir==='asc'?normSort(a.title).localeCompare(normSort(b2.title)):normSort(b2.title).localeCompare(normSort(a.title));
    if(sort==='author') return dir==='asc'?normSort(a.author).localeCompare(normSort(b2.author)):normSort(b2.author).localeCompare(normSort(a.author));
    if(sort==='price') return dir==='asc'?(parseFloat(a.price)||0)-(parseFloat(b2.price)||0):(parseFloat(b2.price)||0)-(parseFloat(a.price)||0);
    if(sort==='year') return dir==='asc'?(parseInt(a.year)||0)-(parseInt(b2.year)||0):(parseInt(b2.year)||0)-(parseInt(a.year)||0);
    if(sort==='star') return dir==='asc'?(parseInt(a.star)||0)-(parseInt(b2.star)||0):(parseInt(b2.star)||0)-(parseInt(a.star)||0);
    // dateAdded — parse en-AU date (DD/MM/YYYY), use row index as tiebreaker for same-day entries
    const parseDate=d=>{if(!d)return 0;const p=d.split('/');return p.length===3?new Date(p[2],p[1]-1,p[0]).getTime():0;};
    const da=parseDate(a.dateAdded), db=parseDate(b2.dateAdded);
    if(da!==db) return dir==='asc'?da-db:db-da;
    // Same date (or both missing) — use row position so last-added appears first
    const ia=S.books.indexOf(a), ib=S.books.indexOf(b2);
    return dir==='asc'?ia-ib:ib-ia;
  });
  // Price source: wishlist uses the filtered wishlist set; normal view excludes sold/wishlist/drafts
  const priceSrc=S.showWishlist?books:books.filter(b=>b.sold!=='Sold'&&b.sold!=='Wishlist'&&b.draft!=='Draft');
  const prices=priceSrc.map(b=>parseFloat(b.price)||0).filter(p=>p>0&&p<50000);
  const totalVal=prices.reduce((a,b2)=>a+b2,0);
  const avg=prices.length?totalVal/prices.length:0;
  const top=prices.length?Math.max(...prices):0;
  const sym=currSym();
function renderStatsRow() {
  const settings = S.settings || {};
  const chk = id => {
    const el = document.getElementById(id);
    return el ? el.checked : true;
  };
  const show = {
    total: chk('s-stat-total') && settings.statTotal !== false,
    value: chk('s-stat-value') && settings.statValue !== false,
    avg:   chk('s-stat-avg')   && settings.statAvg   !== false,
    top:   chk('s-stat-top')   && settings.statTop   !== false,
  };
  const isWL = !!S.showWishlist;
  const parts = [
    show.total ? `<span class="stat-item"><span id="statTotal">—</span> ${isWL ? 'wishlist' : 'books'}</span>` : '',
    show.value ? `<span class="stat-item"><span id="statValue">—</span> total</span>` : '',
    (show.avg && !isWL) ? `<span class="stat-item">avg <span id="statAvg">—</span></span>` : '',
    show.top   ? `<span class="stat-item">top <span id="statTop">—</span></span>` : '',
  ].filter(Boolean);
  const sep = '<span class="insights-sep">·</span>';
  const row = document.getElementById('statsRow');
  if (row) row.innerHTML = parts.join(sep);
}

  document.getElementById('statTotal') && (document.getElementById('statTotal') && (document.getElementById('statTotal').textContent='— / '+S.books.length));
  document.getElementById('statValue') && (document.getElementById('statValue').textContent=totalVal?sym+totalVal.toFixed(0):'—');
  document.getElementById('statAvg') && (document.getElementById('statAvg').textContent=avg?sym+avg.toFixed(0):'—');
  document.getElementById('statTop') && (document.getElementById('statTop').textContent=top?sym+top.toFixed(0):'—');
  // Populate publisher filter dropdown
  const pubSelect=document.getElementById('filterPublisher');
  if(pubSelect&&pubSelect.options.length<=1){
    const pubs=[...new Set(S.books.map(b=>b.publisher).filter(Boolean))].sort();
    pubs.forEach(p=>{const o=document.createElement('option');o.value=p;o.textContent=p;pubSelect.appendChild(o);});
  }
  const condClasses={'Fine':'cond-fine','Very Good':'cond-vg','Good':'cond-good','Fair':'cond-fair'};
  const grid=document.getElementById('booksGrid');
  if(!books.length){
    const msg = search ? `No results for \u201c${search}\u201d` : 'No books match your filters.';
    const clearBtn = search ? `<button class="btn-ghost" onclick="clearSearch()">Clear search</button>` : '';
    grid.innerHTML = `<div class="empty-search-container"><div class="empty-icon">📚</div><p>${msg}</p>${clearBtn}</div>`;
    return;
  }
  const isListView = S.viewMode === 'list';
  const gridEl = document.getElementById('booksGrid');
  gridEl.parentElement.classList.toggle('list-view', isListView);

  // ── GROUPING ──
  // Normalise: strip leading The/A/An, lowercase, trim
  const normTitle = t => (t||'').toLowerCase().trim().replace(/^(the|a|an)\s+/i,'').trim();
  const groupKey = b => normTitle(b.title) + '||' + (b.author||'').toLowerCase().trim();

  // Build groups — each group keyed by normalised title+author
  // Representative card = first non-sold copy, or first copy if all sold
  const groupMap = new Map();
  books.forEach(b => {
    const k = groupKey(b);
    if (!groupMap.has(k)) groupMap.set(k, []);
    groupMap.get(k).push(b);
  });
  const wishlistTotal=S.books.filter(b=>b.sold==='Wishlist').length;
  document.getElementById('statTotal') && (document.getElementById('statTotal').textContent=S.showWishlist?(groupMap.size+' / '+wishlistTotal):(groupMap.size+' / '+S.books.length));

  // Badge count: active + wishlist + draft (not sold)
  const badgeCount = copies => copies.filter(b => b.sold !== 'Sold').length;

  // Representative copy: best condition non-sold, else first
  const condOrder = ['Fine','Very Good','Good','Fair'];
  const repCopy = copies => {
    const active = copies.filter(b => b.sold !== 'Sold');
    if (!active.length) return copies[0];
    return active.sort((a,b2) => condOrder.indexOf(a.condition) - condOrder.indexOf(b2.condition))[0];
  };

  // Build set + cover map from active library books for duplicate detection and cover inheritance
  let libraryTitleSet = null;
  let libraryTitleCoverMap = null;
  if (S.showWishlist) {
    libraryTitleSet = new Set();
    libraryTitleCoverMap = new Map();
    S.books.forEach(lb => {
      if (lb.sold === 'Wishlist' || lb.sold === 'Sold' || lb.draft === 'Draft') return;
      const nt = normTitle(lb.title);
      libraryTitleSet.add(nt);
      if (lb.coverUrl && lb.coverUrl !== '__local__' && !libraryTitleCoverMap.has(nt)) {
        libraryTitleCoverMap.set(nt, lb.coverUrl);
      }
    });
  }

  grid.innerHTML = [...groupMap.values()].map(copies => {
    const b = repCopy(copies);
    const idx = S.books.indexOf(b);
    const isSold = b.sold === 'Sold';
    const count = badgeCount(copies);
    const totalCopies = copies.length;
    const isGrouped = totalCopies > 1;
    const inLibrary = libraryTitleSet && !isGrouped && b.sold === 'Wishlist' && libraryTitleSet.has(normTitle(b.title));

    // Inherit cover from library match when wishlist card has none
    const ownCover = b.coverUrl && b.coverUrl !== '__local__' ? b.coverUrl : '';
    const inheritedCover = (!ownCover && libraryTitleCoverMap && b.sold === 'Wishlist')
      ? (libraryTitleCoverMap.get(normTitle(b.title)) || '')
      : '';
    const effectiveCover = ownCover || inheritedCover;
    const hasCover = !!effectiveCover;

    const thumbHtml = hasCover
      ? `<img src="${effectiveCover}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'" loading="lazy"/>`
      : `<span>${b.coverUrl==='__local__'?'📷':'📖'}</span>`;
    const clickHandler = S.selectMode
      ? `toggleBookSelection('${b._id}')`
      : isGrouped
        ? `openCopiesSheet('${groupKey(b).replace(/'/g,"\\'")}')`
        : `openModal(${idx})`;
    const isSelected = S.selectMode && S.selectedBooks.has(b._id);
    // Adaptive duplicate badge: icon-only in card view, icon+text in list view
    const dupBadge = inLibrary
      ? (isListView
          ? '<span style="display:inline-block;background:#FEF3C7;color:#92400E;font-size:9px;font-weight:600;padding:2px 6px;border-radius:10px;margin-left:4px;white-space:nowrap;">⚠️ In Library</span>'
          : '<span style="display:inline-block;font-size:11px;margin-left:3px;" title="Already in Library">⚠️</span>')
      : '';
    return `<div class="book-card${isSold&&!isGrouped?' is-sold':''}${b.sold==='Wishlist'&&!isGrouped?' is-wishlist':''}${b.draft==='Draft'&&!isGrouped?' is-draft':''}${isSelected?' is-selected':''}" data-id="${b._id}" onclick="${clickHandler}" style="position:relative;">
      <div class="book-cover">
        ${hasCover?`<img src="${effectiveCover}" alt="${b.title}" style="display:block" onerror="this.style.display='none';this.nextSibling.style.display='flex'">`:''}<div class="book-cover-ph" style="${hasCover?'display:none':''}"><p>${b.coverUrl==='__local__'?'📷':''}</p><p style="margin-top:4px">${b.title}</p></div>
        ${!isGrouped?'<div class="sold-overlay"><span class="sold-badge">Sold</span></div>':''}
        ${isGrouped?`<span class="copies-badge">×${totalCopies}</span>`:''}
      </div>
      <div class="book-info">
        ${isListView?`<div class="book-info-thumb">${thumbHtml}</div>`:''}
        <div class="book-info-main">
          <div class="book-title-text">${b.title}</div>
          <div class="book-author-text">${b.author}</div>
          <div style="font-size:9px;color:var(--ink-faint);margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${b.publisher||''} ${b.year?'· '+b.year:''}</div>
        </div>
        <div class="book-meta-row card-meta"><span class="book-condition-badge ${condClasses[b.condition]||'cond-good'}">${b.condition||'—'}</span><span class="book-price-text">${(b.price&&!isNaN(parseFloat(b.price)))?sym+parseFloat(b.price).toFixed(0):'—'}</span>${!isGrouped&&b.draft==='Draft'?'<span class="draft-badge">Draft</span>':''}${dupBadge}</div>
        ${b.star&&parseInt(b.star)>0&&!isGrouped?`<div class="star-row">${[1,2,3,4,5].map(n=>`<span class="star${parseInt(b.star)>=n?' lit':''}">★</span>`).join('')}</div>`:''}
      </div>
    </div>`;
  }).join('');
  updateFilterBtn();
}

// ── FILTER SHEET ──────────────────────────────────────────────────
function openFilterSheet() {
  document.getElementById('filterSheetOverlay').classList.add('is-active');
  document.body.classList.add('sheet-open');
  updateFilterBtn();
}
function closeFilterSheet(e) {
  if (!e || e.target === document.getElementById('filterSheetOverlay') || !e.target) {
    document.getElementById('filterSheetOverlay').classList.remove('is-active');
    document.body.classList.remove('sheet-open');
  }
}
function updateFilterBtn() {
  const count = document.querySelectorAll('#booksGrid .book-card').length;
  const applyBtn = document.getElementById('filterApplyBtn');
  if (applyBtn) applyBtn.textContent = `Show ${count} Book${count !== 1 ? 's' : ''}`;
  let active = 0;
  if ((S.sortBy || 'dateAdded') !== 'dateAdded' || (S.sortDir || 'desc') !== 'desc') active++;
  if ((S.filterCondition || 'all') !== 'all') active++;
  if (((document.getElementById('filterPublisher') || {}).value || '') !== '') active++;
  if (S.showSold) active++;
  if (S.showDrafts) active++;
  const badge = document.getElementById('filterCount');
  if (badge) badge.textContent = active > 0 ? `(${active})` : '';
}
window.openFilterSheet = openFilterSheet;
window.closeFilterSheet = closeFilterSheet;

function debounce(fn, delay) {
  let t;
  return function(...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), delay); };
}
const filterCatalog = debounce(renderCatalog, 250);
function catalogSearchInput(el) {
  const has = !!el.value;
  const btn = document.getElementById('searchClear');
  const icon = document.getElementById('searchIcon');
  if (btn) btn.style.display = has ? 'flex' : 'none';
  if (icon) icon.style.display = has ? 'none' : '';
}
function clearSearch() {
  const el = document.getElementById('catalogSearch');
  if (el) el.value = '';
  const btn = document.getElementById('searchClear');
  const icon = document.getElementById('searchIcon');
  if (btn) btn.style.display = 'none';
  if (icon) icon.style.display = '';
  renderCatalog();
}
function setFilter(val,btn){S.filterCondition=val;document.querySelectorAll('.filter-chip').forEach(b=>b.classList.remove('active'));btn.classList.add('active');renderCatalog();}

function openCopiesSheet(key) {
  const normTitle = t => (t||'').toLowerCase().trim().replace(/^(the|a|an)\s+/i,'').trim();
  const groupKey  = b => normTitle(b.title) + '||' + (b.author||'').toLowerCase().trim();
  const copies = S.books
    .map((b, idx) => ({b, idx}))
    .filter(({b}) => groupKey(b) === key);
  if (!copies.length) return;

  const condOrder = ['Fine','Very Good','Good','Fair'];
  copies.sort((a, z) => {
    // Active before sold; within active sort by condition
    const aActive = a.b.sold !== 'Sold' ? 0 : 1;
    const zActive = z.b.sold !== 'Sold' ? 0 : 1;
    if (aActive !== zActive) return aActive - zActive;
    return condOrder.indexOf(a.b.condition) - condOrder.indexOf(z.b.condition);
  });

  const condClasses = {'Fine':'cond-fine','Very Good':'cond-vg','Good':'cond-good','Fair':'cond-fair'};
  const sym = currSym();
  const title = copies[0].b.title;

  document.getElementById('copiesSheetTitle').innerHTML =
    `<span style="font-family:'Playfair Display',serif;">${title}</span>
     <span style="font-size:12px;font-weight:400;color:var(--ink-faint);margin-left:8px;">${copies.length} ${copies.length===1?'copy':'copies'}</span>`;

  document.getElementById('copiesSheetBody').innerHTML = copies.map(({b, idx}) => {
    const hasCover = b.coverUrl && b.coverUrl !== '__local__';
    const isSold = b.sold === 'Sold';
    const isWishlist = b.sold === 'Wishlist';
    const isDraft = b.draft === 'Draft';
    return `<div class="copy-row" onclick="closeCopiesSheet();setTimeout(()=>openModal(${idx}),120);">
      <div class="copy-thumb">
        ${hasCover
          ? `<img src="${b.coverUrl}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'" loading="lazy"/>`
          : `<span style="font-size:16px;">${b.coverUrl==='__local__'?'📷':'📖'}</span>`}
      </div>
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:3px;">
          <span class="book-condition-badge ${condClasses[b.condition]||'cond-good'}" style="font-size:10px;">${b.condition||'—'}</span>
          ${b.price&&!isNaN(parseFloat(b.price))?`<span style="font-size:14px;font-weight:500;color:var(--ink);">${sym}${parseFloat(b.price).toFixed(0)}</span>`:''}
          ${isSold?'<span class="draft-badge" style="background:#fdecea;color:#a32d2d;margin-left:0;">Sold</span>':''}
          ${isDraft?'<span class="draft-badge" style="margin-left:0;">Draft</span>':''}
        </div>
        <div style="font-size:12px;color:var(--ink-faint);">
          ${[b.edition, b.year, b.dateAdded?'Added '+b.dateAdded:''].filter(Boolean).join(' · ')}
        </div>
      </div>
      <span style="color:var(--ink-faint);font-size:18px;margin-left:8px;">›</span>
    </div>`;
  }).join('');

  document.getElementById('copiesOverlay').classList.remove('hidden');
}

function closeCopiesSheet(e) {
  if (!e || e.target === document.getElementById('copiesOverlay')) {
    document.getElementById('copiesOverlay').classList.add('hidden');
  }
}
// ── MARKET SYNC ──────────────────────────────────────────────────────
function normKey(title, author) {
  const clean = s => (s||'').toLowerCase().replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim();
  return clean(title) + ':' + clean(author);
}

async function loadMarketSync(b) {
  const el = document.getElementById('marketSyncSection');
  if (!el) return;

  const key = normKey(b.title, b.author);
  const { data, error } = await _supa
    .from('price_db')
    .select('source, price, currency, created_at')
    .eq('norm_key', key)
    .order('created_at', { ascending: false })
    .limit(3);

  if (error || !data || !data.length) { el.style.display = 'none'; return; }

  const sym = currSym();
  const avg = data.reduce((s, r) => s + parseFloat(r.price), 0) / data.length;
  const rows = data.map(r => {
    const date = new Date(r.created_at).toLocaleDateString('en-AU', { month:'short', year:'numeric' });
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:0.5px solid var(--border);">
      <span style="font-size:12px;color:var(--ink-light);">${r.source}</span>
      <span style="font-size:12px;color:var(--ink-faint);">${date}</span>
      <span style="font-size:13px;font-weight:600;color:var(--ink);">${sym}${parseFloat(r.price).toFixed(0)}</span>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div style="margin:0;padding:14px 20px;border-top:0.5px solid var(--border);">
      <div style="font-size:9px;font-weight:600;color:var(--gold);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:10px;">Market Price Evidence</div>
      ${rows}
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;">
        <span style="font-size:12px;color:var(--ink-faint);">Suggested avg</span>
        <span style="font-size:15px;font-weight:700;color:var(--ink);">${sym}${avg.toFixed(0)}</span>
        <button onclick="acceptMarketPrice('${b._id}',${avg.toFixed(2)})" style="padding:6px 14px;background:var(--accent);color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">Accept</button>
      </div>
    </div>`;
  el.style.display = '';
}

async function acceptMarketPrice(id, price) {
  const { error } = await _supa.from('books').update({ market_price: price, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) { showToast('Price update failed', 'error', 2000); return; }
  const b = S.books.find(x => x._id === id);
  if (b) { b.price = String(price); }
  showToast('Market price updated ✓', 'success', 2000);
  // Refresh the price badge in the open modal
  openModal(S.currentModalIdx);
}
// ─────────────────────────────────────────────────────────────────────

function openModal(idx){
  S.currentModalIdx=idx;
  const b=S.books[idx];if(!b)return;
  const isWishlist = b.sold === 'Wishlist';
  const sym=currSym();
  S.currentModalUrl = isWishlist
    ? buildWishlistEbayUrl(b.title, b.author)
    : buildEbayUrl(b.title, b.author);

  // For wishlist: find a matching active library record (normalised title compare)
  const _normT = t => (t||'').toLowerCase().trim().replace(/^(the|a|an)\s+/i,'').trim();
  const libraryMatch = isWishlist
    ? S.books.find(lb => lb.sold !== 'Wishlist' && lb.sold !== 'Sold' && lb.draft !== 'Draft' && _normT(lb.title) === _normT(b.title))
    : null;

  // Inherit cover from matching library record if wishlist item has none
  const ownCover = b.rawCover || b.coverUrl || '';
  const modalCoverSrc = ownCover || (libraryMatch ? libraryMatch.rawCover || libraryMatch.coverUrl || '' : '');

  // In Print label (uses DB column in_print if it exists)
  const inPrintLabel = b.inPrint === true ? 'Yes' : b.inPrint === false ? 'No' : '—';
  // Google search URL for fallback prompt
  const _gq = encodeURIComponent(b.title + (b.author ? ' ' + b.author : '') + ' book');
  const googleUrl = 'https://www.google.com/search?q=' + _gq;

  document.getElementById('modalBody').innerHTML=`
    <div style="display:flex;flex-direction:column;align-items:stretch;padding:20px 20px 0;">
      ${libraryMatch ? `<div style="display:flex;align-items:center;gap:7px;margin-bottom:12px;padding:7px 12px 7px 10px;border-left:3px solid #D97706;background:rgba(251,191,36,0.07);border-radius:0 6px 6px 0;"><span style="font-size:14px;flex-shrink:0;">⚠️</span><span style="font-family:'DM Sans',sans-serif;font-size:11px;font-weight:600;color:#92400E;letter-spacing:0.02em;">Already in your library</span></div>` : ''}
      <div style="align-self:center;margin-bottom:14px;cursor:${modalCoverSrc?'zoom-in':'default'};" onclick="${modalCoverSrc?'zoomCover(\''+modalCoverSrc.replace(/'/g,"\\'")+'\')':''}">
        ${modalCoverSrc
          ? `<img class="ms-image" src="${modalCoverSrc}" alt="${b.title}" onerror="this.style.display='none'">`
          : `<div style="width:100px;height:140px;display:flex;align-items:center;justify-content:center;font-size:36px;opacity:0.15;background:var(--paper-warm);border-radius:6px;">📖</div>`}
      </div>
      <div class="ms-title">${b.title}</div>
      <div class="ms-subtitle" style="margin-bottom:${isWishlist?'6px':'10px'};">${[b.author, (b.artist && b.artist !== b.author) ? b.artist : null].filter(Boolean).join(' · ')}</div>
      ${isWishlist?`<div class="ms-subtitle" style="margin-bottom:10px;">In Print: <strong style="color:var(--ink);">${inPrintLabel}</strong></div>`:''}
      <div style="display:flex;align-items:center;gap:8px;align-self:center;margin-bottom:${b.flags?'6px':'14px'};flex-wrap:wrap;justify-content:center;">
        ${b.condition?`<span style="background:var(--accent-light);color:var(--accent);font-size:11px;font-weight:600;padding:5px 14px;border-radius:20px;letter-spacing:0.02em;">${b.condition}</span>`:''}
        ${(b.price&&!isNaN(parseFloat(b.price)))?`<span style="background:var(--paper-warm);color:var(--ink);font-size:11px;font-weight:600;padding:5px 14px;border-radius:20px;border:0.5px solid var(--border-med);">${sym}${parseFloat(b.price).toFixed(0)}</span>`:''}
      </div>
      ${b.flags?`<div style="font-size:11px;color:var(--ink-faint);text-align:center;margin-bottom:14px;line-height:1.5;">${b.flags}</div>`:''}
      ${!isWishlist?`<div style="display:flex;align-items:center;gap:4px;margin-bottom:4px;align-self:center;"><span style="font-size:11px;color:var(--ink-faint);margin-right:2px;">Rating</span><div id="modalStarRow" class="star-row" style="margin-top:0;"></div></div>`:''}
    </div>
    <div class="ms-metadata-row">
      ${b.publisher && b.publisher !== b.author?`<div class="ms-metadata-item"><span class="ms-label">Publisher</span><span class="ms-value">${b.publisher}</span></div>`:''}
      ${b.year?`<div class="ms-metadata-item"><span class="ms-label">Year</span><span class="ms-value">${b.year}</span></div>`:''}
      ${b.dateAdded&&!isWishlist?`<div class="ms-metadata-item"><span class="ms-label">Added</span><span class="ms-value">${b.dateAdded}</span></div>`:''}
      ${b.location?`<div class="ms-metadata-item"><span class="ms-label">Acquired</span><span class="ms-value">${b.location}</span></div>`:''}
    </div>
    ${b.collectorNote?`<div style="margin:0;padding:14px 20px;border-top:0.5px solid var(--border);background:var(--paper-warm);"><div style="font-size:9px;font-weight:600;color:var(--gold);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:5px;">Collector\'s note</div><div style="font-size:13px;color:var(--ink-light);font-style:italic;line-height:1.6;">${b.collectorNote}</div></div>`:''}
    ${isWishlist&&!modalCoverSrc&&!libraryMatch?`<div style="margin:0;padding:14px 20px;border-top:0.5px solid var(--border);display:flex;flex-direction:column;align-items:center;gap:10px;"><div style="font-size:11px;color:var(--ink-faint);text-align:center;">No image found for this title</div><button onclick="window.open('${googleUrl}','_blank','noopener')" style="padding:9px 20px;background:var(--accent);color:#fff;border:none;border-radius:7px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;cursor:pointer;display:flex;align-items:center;gap:7px;"><svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='11' cy='11' r='8'/><line x1='21' y1='21' x2='16.65' y2='16.65'/></svg>Search Google for Details</button></div>`:''}
    ${isWishlist?'<div class="wishlist-status">★ In Wishlist</div>':''}
    <div id="marketSyncSection" style="display:none;"></div>
`;
  // Rewrite action buttons based on wishlist vs library
  const actionsArea = document.getElementById('modalActionsArea');
  if (actionsArea) {
    const ebayIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
    if (isWishlist) {
      actionsArea.innerHTML =
        `<div class="ms-actions-primary">
          <button class="btn-secondary" onclick="openEditFromModal('${b._id}')">Edit Book</button>
          <button class="btn-primary" onclick="openEbayModal()" style="display:inline-flex;align-items:center;justify-content:center;gap:6px;">${ebayIcon} Check eBay</button>
        </div>
        <hr class="ms-separator">
        <div class="ms-actions-danger">
          <button onclick="deleteBook('${b._id}')" class="btn-danger-link">Delete Book</button>
        </div>`;
    } else {
      actionsArea.innerHTML =
        `<div class="ms-actions-primary">
          <button class="btn-secondary" onclick="openEditFromModal('${b._id}')">Edit Book</button>
          <button class="btn-primary" onclick="openEbayModal()" style="display:inline-flex;align-items:center;justify-content:center;gap:6px;">${ebayIcon} Check eBay</button>
        </div>
        <div class="ms-actions-secondary">
          <button class="btn-ghost" id="modalSoldBtn" onclick="toggleSold()">Mark Sold</button>
          <button class="btn-ghost" id="modalWishlistBtn" onclick="toggleWishlistStatus()">+ Wishlist</button>
        </div>
        <hr class="ms-separator">
        <div class="ms-actions-danger">
          <button onclick="deleteBook('${b._id}')" class="btn-danger-link">Delete Book</button>
        </div>`;
    }
  }
  // Set sold/wishlist button labels (only present for library items)
  if (!isWishlist) {
    const soldBtn = document.getElementById('modalSoldBtn');
    if (soldBtn) soldBtn.textContent = (b.sold === 'Sold') ? 'Return to Library' : 'Mark Sold';
    const wishBtn = document.getElementById('modalWishlistBtn');
    if (wishBtn) wishBtn.textContent = (b.sold === 'Wishlist') ? 'In Wishlist ✓' : '+ Wishlist';
  }
  // Render star rating only for non-wishlist items
  if (!isWishlist) renderModalStars(b);
  // If draft, open in Add form instead
  if (b.draft === 'Draft') { openDraftActions(idx); return; }
  document.getElementById('modalOverlay').classList.add('is-active');
  if (!isWishlist) loadMarketSync(b);
}
function openEbayModal(){
  // Use location.href on mobile to avoid white-screen-on-back issue
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (isMobile) { window.location.href = S.currentModalUrl; }
  else { window.open(S.currentModalUrl, '_blank'); }
}
function openEditFromModal(id){
  const sheet = document.querySelector('#modalOverlay .magi-sheet');
  if (sheet) sheet.classList.add('is-fading');
  closeModal();
  setTimeout(() => { openEditForm(id); }, 350);
}
function closeModal(e){if(!e||e.target===document.getElementById('modalOverlay')||!e.target){document.getElementById('modalOverlay').classList.remove('is-active');document.body.classList.remove('sheet-open');}}

// ── BATCH SELECT MODE ─────────────────────────────────────────────
S.selectMode = null; // null | 'edit' | 'move'
S.selectedBooks = new Set();

function _setModeBtn(id, label, active) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.textContent = label;
  btn.classList.toggle('is-active', active);
}

function toggleEditMode() {
  if (S.selectMode === 'edit') { exitSelectMode(); return; }
  S.selectMode = 'edit';
  S.selectedBooks.clear();
  _setModeBtn('editModeBtn', 'Exit Edit', true);
  _setModeBtn('moveModeBtn', 'Move', false);
  renderCatalog();
}
window.toggleEditMode = toggleEditMode;

function toggleMoveMode() {
  if (S.selectMode === 'move') { exitSelectMode(); return; }
  S.selectMode = 'move';
  S.selectedBooks.clear();
  _setModeBtn('moveModeBtn', 'Exit Move', true);
  _setModeBtn('editModeBtn', '✓ Edit', false);
  renderCatalog();
}
window.toggleMoveMode = toggleMoveMode;

function exitSelectMode() {
  S.selectMode = null;
  S.selectedBooks.clear();
  _setModeBtn('editModeBtn', '✓ Edit', false);
  _setModeBtn('moveModeBtn', 'Move', false);
  const bar = document.getElementById('batchActionsBar');
  if (bar) bar.classList.remove('is-visible');
  renderCatalog();
}
window.exitSelectMode = exitSelectMode;

function toggleBookSelection(bookId) {
  if (S.selectedBooks.has(bookId)) {
    S.selectedBooks.delete(bookId);
  } else {
    S.selectedBooks.add(bookId);
  }
  // Update card visual without full re-render
  document.querySelectorAll('.book-card[data-id]').forEach(card => {
    card.classList.toggle('is-selected', S.selectedBooks.has(card.dataset.id));
  });
  updateBatchBar();
}
window.toggleBookSelection = toggleBookSelection;

function updateBatchBar() {
  const n = S.selectedBooks.size;
  const bar = document.getElementById('batchActionsBar');
  const count = document.getElementById('batchCount');
  const stack = document.getElementById('batchActionsStack');
  if (count) count.textContent = n === 1 ? '1 selected' : `${n} selected`;
  if (bar) bar.classList.toggle('is-visible', n > 0);
  if (!stack) return;
  if (S.selectMode === 'edit') {
    stack.innerHTML =
      '<button onclick="bulkAutofill()" class="batch-btn">Auto-fill</button>' +
      '<button onclick="bulkPriceUpdate()" class="batch-btn">Price Update</button>' +
      '<div class="danger-separator"><button onclick="bulkDelete()" class="batch-btn batch-btn--danger">Delete</button></div>';
  } else if (S.selectMode === 'move') {
    const allWishlist = S.selectedBooks.size > 0 && [...S.selectedBooks].every(id => {
      const b = S.books.find(x => x._id === id);
      return b && b.sold === 'Wishlist';
    });
    stack.innerHTML =
      '<button onclick="bulkMarkSold()" class="batch-btn">Mark Sold</button>' +
      (allWishlist
        ? '<button onclick="bulkMoveToLibrary()" class="batch-btn">Move to Library</button>'
        : '<button onclick="bulkWishlist()" class="batch-btn">Wishlist</button>') +
      '<button onclick="bulkDraft()" class="batch-btn">Draft</button>';
  }
}

function triggerPoof(ids, callback) {
  const arr = [...ids];
  arr.forEach(id => {
    const el = document.querySelector(`.book-card[data-id="${id}"]`);
    if (el) el.classList.add('is-poofing');
  });
  setTimeout(callback, 300);
}
window.triggerPoof = triggerPoof;

async function bulkMarkSold() {
  const ids = [...S.selectedBooks];
  if (!ids.length) return;
  const { error } = await _supa.from('books').update({ sold_status: 'Sold' }).in('id', ids);
  if (error) { showToast('Update failed. Please try again.', 'error', 3000); return; }
  ids.forEach(id => { const b = S.books.find(x => x._id === id); if (b) b.sold = 'Sold'; });
  showToast(`${ids.length} book${ids.length > 1 ? 's' : ''} marked as sold.`, 'success', 2500);
  triggerPoof(ids, () => { exitSelectMode(); });
}
window.bulkMarkSold = bulkMarkSold;

async function bulkDelete() {
  if (S.selectedBooks.size === 0) { alert('No books selected'); return; }
  const ids = [...S.selectedBooks];
  const n = ids.length;
  magiConfirm({
    title: `Delete ${n} book${n > 1 ? 's' : ''}?`,
    message: `This will permanently remove ${n} book${n > 1 ? 's' : ''} from your collection. This cannot be undone.`,
    confirmText: 'Delete All',
    onConfirm: async () => {
      const { error } = await _supa.from('books').delete().in('id', ids);
      if (error) { showToast('Delete failed. Please try again.', 'error', 3000); return; }
      S.books = S.books.filter(b => !ids.includes(b._id));
      showToast(`${n} book${n > 1 ? 's' : ''} removed from your collection.`, 'success', 2500);
      triggerPoof(ids, () => { exitSelectMode(); });
    }
  });
}
window.bulkDelete = bulkDelete;

async function bulkAutofill() {
  const ids = [...S.selectedBooks];
  if (!ids.length) { showToast('No books selected', 'error'); return; }
  const n = ids.length;
  if (!confirm(`Auto-fill missing fields for ${n} book${n !== 1 ? 's' : ''}?\n\nFills year, publisher, cover image. 100% title match only. Existing values will NOT be overwritten.`)) return;
  let done = 0, skip = 0;
  const list = S.books.filter(b => ids.includes(b._id));
  for (const b of list) {
    if (!b.title || !b._id) { skip++; continue; }
    const hit = typeof lookupConjuringEntry === 'function' ? lookupConjuringEntry(b.title) : null;
    if (!hit || !hit.entry) { skip++; continue; }
    const e = hit.entry, upd = {};
    if (!b.year && e.y) { upd.year = e.y; b.year = e.y; }
    if (!b.publisher && e.p) { upd.publisher = e.p; b.publisher = e.p; }
    if (!b.coverUrl && typeof dbCoverUrl === 'function') {
      const cu = dbCoverUrl(e);
      if (cu) { upd.cover_url = cu; b.coverUrl = cu; b.rawCover = cu; }
    }
    if (!Object.keys(upd).length) { skip++; continue; }
    upd.updated_at = new Date().toISOString();
    const r = await _supa.from('books').update(upd).eq('id', b._id);
    if (!r.error) done++; else skip++;
  }
  renderCatalog();
  showToast(`Auto-fill: ${done} updated, ${skip} skipped ✓`, 'success', 4000);
  exitSelectMode();
}
window.bulkAutofill = bulkAutofill;

async function bulkPriceUpdate() {
  showToast('DBG: called, n=' + S.selectedBooks.size, 'info', 5000);
  if (S.selectedBooks.size === 0) { showToast('No books selected', 'error'); return; }
  try {
    openPriceReviewSheet([...S.selectedBooks]);
  } catch(e) {
    showToast('DBG ERR: ' + e.message, 'error', 8000);
  }
}
window.bulkPriceUpdate = bulkPriceUpdate;

function openPriceReviewSheet(ids) {
  console.log('[PriceReview] ids received:', ids);
  // Inject shell into DOM on first use
  if (!document.getElementById('priceReviewOverlay')) {
    const el = document.createElement('div');
    el.className = 'magi-sheet-overlay';
    el.id = 'priceReviewOverlay';
    el.onclick = function(e) { if (e.target === el) closePriceReviewSheet(); };
    el.innerHTML = `
      <div class="magi-sheet" id="priceReviewSheet" style="background:var(--ink);color:#fff;">
        <div class="magi-sheet-handle" style="background:rgba(255,255,255,0.2);"></div>
        <button class="sheet-close-btn" style="background:rgba(255,255,255,0.1);border-color:rgba(255,255,255,0.15);color:#fff;" onclick="closePriceReviewSheet()">✕</button>
        <div id="priceReviewBody" style="padding:0 20px 20px;"></div>
      </div>`;
    document.body.appendChild(el);
  }

  // Populate rows
  const rows = ids.map(id => {
    const b = S.books.find(x => x._id === id);
    if (!b) return '';
    return `<div class="review-row">
      <div style="flex:1;min-width:0;padding-right:12px;">
        <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${b.title}</div>
        <div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:2px;">${b.author || '—'}</div>
        <div style="font-size:11px;color:rgba(255,255,255,0.35);margin-top:3px;">No update found. Enter new price?</div>
      </div>
      <input type="number" class="review-price-input" data-id="${id}" placeholder="0.00" step="0.01" min="0">
    </div>`;
  }).join('');

  document.getElementById('priceReviewBody').innerHTML = `
    <div style="text-align:center;padding:16px 0 20px;">
      <div style="font-family:'Playfair Display',serif;font-size:1.2rem;margin-bottom:4px;">Price Review</div>
      <div style="font-size:12px;color:rgba(255,255,255,0.5);">${ids.length} book${ids.length > 1 ? 's' : ''} selected</div>
    </div>
    <div>${rows}</div>
    <button onclick="applyManualPrices()" style="width:100%;margin-top:20px;padding:14px;background:var(--accent-mid);color:#fff;border:none;border-radius:10px;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:600;cursor:pointer;min-height:48px;">Apply Manual Prices</button>`;

  const ov = document.getElementById('priceReviewOverlay');
  ov.classList.add('is-active');
  ov.style.pointerEvents = 'none';
  document.body.classList.add('sheet-open');
  const bar = document.getElementById('batchActionsBar');
  if (bar) bar.classList.add('sheet-hidden');
  setTimeout(() => { ov.style.pointerEvents = ''; }, 400);
}
window.openPriceReviewSheet = openPriceReviewSheet;

function closePriceReviewSheet() {
  const overlay = document.getElementById('priceReviewOverlay');
  if (overlay) overlay.classList.remove('is-active');
  document.body.classList.remove('sheet-open');
  const bar = document.getElementById('batchActionsBar');
  if (bar) bar.classList.remove('sheet-hidden');
}
window.closePriceReviewSheet = closePriceReviewSheet;

async function applyManualPrices() {
  const inputs = document.querySelectorAll('.review-price-input');
  const updates = [];
  inputs.forEach(input => {
    const val = parseFloat(input.value);
    const id = input.dataset.id;
    if (id && val > 0) updates.push({ id, price: val });
  });
  if (!updates.length) { showToast('No prices entered.', 'error'); return; }

  const results = await Promise.all(
    updates.map(({ id, price }) =>
      _supa.from('books').update({ market_price: price, updated_at: new Date().toISOString() }).eq('id', id)
    )
  );
  const failed = results.filter(r => r.error).length;
  const succeeded = updates.length - failed;

  if (succeeded > 0) {
    updates.forEach(({ id, price }) => { const b = S.books.find(x => x._id === id); if (b) b.price = String(price); });
    showToast(`Updated prices for ${succeeded} book${succeeded > 1 ? 's' : ''}.`, 'success', 2500);
    closePriceReviewSheet();
    triggerPoof(updates.map(u => u.id), () => { exitSelectMode(); });
  }
  if (failed > 0) { showToast(`${failed} update${failed > 1 ? 's' : ''} failed.`, 'error', 3000); }
}
window.applyManualPrices = applyManualPrices;

async function bulkWishlist() {
  const ids = [...S.selectedBooks];
  if (!ids.length) return;
  const { error } = await _supa.from('books').update({ sold_status: 'Wishlist' }).in('id', ids);
  if (error) { showToast('Update failed. Please try again.', 'error', 3000); return; }
  ids.forEach(id => { const b = S.books.find(x => x._id === id); if (b) b.sold = 'Wishlist'; });
  showToast(`${ids.length} book${ids.length > 1 ? 's' : ''} moved to Wishlist.`, 'success', 2500);
  triggerPoof(ids, () => { exitSelectMode(); });
}
window.bulkWishlist = bulkWishlist;

async function bulkMoveToLibrary() {
  const ids = [...S.selectedBooks];
  if (!ids.length) return;
  const { error } = await _supa.from('books').update({ sold_status: null }).in('id', ids);
  if (error) { showToast('Update failed. Please try again.', 'error', 3000); return; }
  ids.forEach(id => { const b = S.books.find(x => x._id === id); if (b) b.sold = ''; });
  showToast(`${ids.length} book${ids.length > 1 ? 's' : ''} moved to Library.`, 'success', 2500);
  triggerPoof(ids, () => { exitSelectMode(); });
}
window.bulkMoveToLibrary = bulkMoveToLibrary;

async function bulkDraft() {
  const ids = [...S.selectedBooks];
  if (!ids.length) return;
  const { error } = await _supa.from('books').update({ draft_status: 'Draft' }).in('id', ids);
  if (error) { showToast('Update failed. Please try again.', 'error', 3000); return; }
  ids.forEach(id => { const b = S.books.find(x => x._id === id); if (b) b.draft = 'Draft'; });
  showToast(`${ids.length} book${ids.length > 1 ? 's' : ''} marked as Draft.`, 'success', 2500);
  triggerPoof(ids, () => { exitSelectMode(); });
}
window.bulkDraft = bulkDraft;

async function toggleSold() {
  const b = S.books[S.currentModalIdx];
  if (!b) return;
  const newStatus = (b.sold === 'Sold') ? '' : 'Sold';
  const { error } = await _supa.from('books').update({ sold_status: newStatus }).eq('id', b._id);
  if (error) { showToast('Update failed. Please try again.', 'error', 3000); return; }
  b.sold = newStatus;
  closeModal();
  renderCatalog();
  showToast(newStatus === 'Sold' ? 'Marked as sold.' : 'Returned to library.', 'success', 2500);
}
window.toggleSold = toggleSold;

async function toggleWishlistStatus() {
  const b = S.books[S.currentModalIdx];
  if (!b) return;
  const newStatus = (b.sold === 'Wishlist') ? '' : 'Wishlist';
  const { error } = await _supa.from('books').update({ sold_status: newStatus }).eq('id', b._id);
  if (error) { showToast('Update failed. Please try again.', 'error', 3000); return; }
  b.sold = newStatus;
  closeModal();
  renderCatalog();
  showToast(newStatus === 'Wishlist' ? 'Moved to wishlist.' : 'Returned to library.', 'success', 2500);
}
window.toggleWishlistStatus = toggleWishlistStatus;

const PUBLISHERS = ["A \"Magic Wand\" Publication", "A ConCam Production", "A G Films Production", "A G-M Publication", "A Goodliffe Publication", "A Mark Leveridge Magic Publication", "A Martini's Magic Company Release", "A Salon de Magie Book, Ken Klosterman", "A Talon Publication", "A Top Magic Publication", "A-1 MagicalMedia", "A. M. Wilson, M. D.", "Aaron Fisher Magic", "Abbott's Magic", "Abraxas", "Ace Place Magic", "Agency of World Entertainment", "Al Mann Exclusives", "Aladdin's Magic Shop", "Alakazam", "Alan Sands Entertainment", "Alexander de Cova Productions", "Alta California Book and Job Printing House", "An Andi Gladwin Production", "Anthony Brahams", "Antinomy Magic", "Aplar Publishing", "Arcas Publications", "Arthur P. Felsman", "Astor", "avanT-Garde Magic", "B.S. Publications", "BammoMagic", "Beat & Roy Books", "Ben Harris Magic Publications", "Benchmark Magic Production", "Berland Presents", "BHM Industries / New Directions Publishing", "Binary Star Publications", "Blue Bikes Production", "Bob King Magic", "Bob Lynn", "Bob Lynn / Tony Raven", "Bodean Enterprises", "Borden Publishing Company", "Borwig & Horster", "Bradbury, Agnew & Co.", "Brunel White", "BW Magic Publishing", "C. Arthur Pearson Limited", "C.C. Éditions", "Caddy Manufacturing Company", "Calostro Publications", "Camirand Academy of Magic", "Card-Shark", "Carl Waring Jones", "Catman Publications", "Cecil E. Griffin", "CEDAM", "Chambers Magic Company", "Charles Scribner’s Sons", "Charlsen + Johansen & Others", "Chas. C. Eastman", "ChicagoMagicBash Publications", "China Productions", "Chuck Martinez", "Clandestine Productions", "Cold Deck Company", "Coleccion Renglones", "Collectors' Workshop", "Columbia Magic Shop Inc.", "Conjuring Arts Research Center", "Conjurors' Library", "Conundrum Publishing", "Corinda's Magic Studio", "Crown Publishers, Inc.", "CYMYS", "D. Robbins & Co., Inc.", "Dan and Dave Industries, Inc.", "Daniel's Den Publication", "Danny Korem", "Dark Arts Press", "David Kemp & Company", "David Meyer Magic Books", "DeCovaMagic", "Developmental Productions Press", "dfgrd ediciones", "Divine Goddess 23 Productions", "DMB Publications", "Docc Co.", "Docc Hilford Productions", "Donald Holmes", "Donnybrook Enterprises, Inc.", "Dover Publications", "DTrik", "Dutton & Co.", "E. F. Rybolt", "East Coast Super Session", "Eckhard Böttchers Zauber-Butike", "Ed Mellon", "Ediciones El Espectador", "ediciones famulus", "ediciones Marré", "Ediciones Vernet Magic", "Edition Olms", "Editions Techniques du Spectacle", "Editorial El Caballo del Malo", "Editorial Frakson", "Edward Bagshawe & Co.", "El Duco", "Electro Fun", "Emerson & West", "Empire", "Every Trick in the Book Inc.", "Excelsior!! Productions", "F. G. Thayer", "Faber & Faber", "FASDIU Enterprises", "Fire Cat Studios", "Fleming Book Company", "Flora & Company", "Florence Art Edizioni", "FOCM Publication", "Fort Worth Magicians' Club", "Frank Werner", "Full Moon Magic Books", "Fun Inc.", "G & E Enterprises", "GBC Press", "Gene Gordon", "Genii", "Geo-Mar Publications", "George G. Harrap & Co., Ltd.", "George Snyder Jr", "George Starke", "Goldshadow Industries", "GrupoKaps", "Hermetic Press", "Guy Bavli - Perfect Magic", "I Saw That!", "Illuma - Illusion Management", "International Magic", "International Magic House", "Invisible Man Productions", "Invisible Practice Production", "Irv Weiner", "J A Enterprises", "Jahoda & Siegel", "Jeff Busby Magic, Inc.", "Jeff McBride, Inc.", "Jerry Mentzer (Magic Methods)", "John King - S. David Walker", "Jose's Studio", "Julius Sussmann, Hamburg", "Juris Druck + Verlag Zürich", "JustJoshinMagic", "Jörg Alexander ZauberKunst", "KANDA Publications", "Kanter's Magic Shop", "Kardyro-Torino Creations", "Kaufman and Company", "Kaufman and Greenberg", "Kee-West Productions", "Kennedy Enterprises", "Kerwin Benson Publishing", "Kreations & Trx", "L&L Publishing", "L. Davenport & Co.", "La boutique de l'illusion", "Laughing Room Only", "Lee Jacobs Productions", "Lehmann & Schüppel, Leipzig", "Lesclapart", "Levy & Müller", "Little, Brown and Company", "Louis Tannen", "Lybrary.com", "M. S. Messinger Printing", "M.C.M. Editora", "Magic Art Studio", "Magic by Boretti", "Magic City", "Magic Communication", "Magic House", "Magic Inspirations", "Magic Limited", "MAGIC Magazine", "Magic Methods", "Magic, Inc.", "Magical Publications", "Magicana", "Magick Enterprises", "Magicland, Tokyo", "Magico Magazine", "Magicseen Magazine", "Magicshop Vienna", "Magie", "Malbrough Magic", "Malek Enterprises", "ManusKrypt", "Marchand de Trucs", "Mark Wilson Publications", "Martin Breese", "Max Abrams", "Max Andrews (Vampire) LTD.", "Max Holden", "Mayette Magie Moderne", "Maynestream Productions", "Me and the other Guy Productions", "Media T Marketing", "Meir Yedid Magic", "Mephisto Huis", "Metempirical Magic", "Micky Hades", "Micky Hades Enterprises", "Micky Hades International", "Mike Caveney's Magic Words", "Mike Powers Magic", "Million Dollar Productions", "Mind Tapped Productions, LLC", "Miracle Makers", "Miracle Press", "Miracles Productions", "Montandon Magic", "Morissey Magic LTD.", "Murphy's Magic Supplies, Inc.", "Mystica", "MZvD", "Namlips Enterprises", "Nat Louis", "Necromancer Press", "Nelson & Nelson Ltd.", "Nelson Enterprises", "Neukomm & Zimmermann", "New Jinx Publication", "Nick Bolton", "Nightmare Alley Productions", "Obie O'Brien", "Ohmigosh Productions", "Old-Guy-In-The-Bathroom Productions", "Oliver Erens - œ", "Ortiz Publications", "Out of the Blue", "Owen Bros.", "Owen Magic Supreme", "Palooka Productions", "Paradigm Press", "Paraninfo", "Patrick Page Magic Limited", "Paul Diamond", "Pavel-Magic", "Penny's Publishing", "Penshaw Press", "PH Marketing Publication", "Philip R. Willmarth", "Piccadilly Books, Ltd", "Popular Magic Publications", "Princeton University Press", "Printed for T. Moore, London", "Private View", "Pro Print", "Producciones El Asombro, S.L.", "Professor Presto", "Psychic Entertainers Association", "Páginas", "R.O.P.S. Press", "Radio Free Atlantis Production", "Random House", "Rauscher & Cie AG", "Raw-Press", "Ray Gamble & W. Herbert Schuh", "Real Miracle Publication", "Red Silk Variety Productions", "Reed Swans Collective", "Reginald Scot Books", "Regow's House of Enchantment", "RFA Production", "Roche Magic Studio", "Rudolf Braunmüller", "Sacred Chao Productions", "San Francisco Book Company", "Sankey Magic", "Saturn Magic Ltd", "Savaco, Ltd.", "Scapegrace Press", "Schwabacher'sche Verlagsbuchhandlung", "Schweizerisches Jugendschriftenwerk Zürich", "Secrets of Dr. Dee", "Sedgehill Industries", "Selfpublished", "Silk King Studios", "simsalabonn", "Slydini Studio of Magic", "Smiling Mule Productions", "Sorcerer's Apprentice", "Sound of Magic", "Spade and Archer", "Sphinx Publishing Corporation", "Squash Publishing", "St. Pierre Enterprises", "Star Magic Co.", "Sterling Magic Company", "Steve Burton", "Steve Reynolds Magic", "Stevens Magic Emporium", "Syzygy Press", "Tannen Magic Inc.", "Taurus Magic Supply", "TCC", "Tenkai Prize Committee", "Tenyo", "Tesmar Zauberartikel", "The Cardician Press", "The Conjurors' Convention Corporation", "The Enchantment", "The False Deal (Mark Tams)", "The FM Factory", "The Genii Corporation", "The Impossible Co.", "The Ireland Magic Co.", "The Journal of Psience", "The Kee Publishing Co.", "The Kent & Surrey Press", "The London Magical Co.", "The Magic Apple", "The Magic Art Book Co.", "The Magic Circle", "The Magic Circle Foundation", "The Magic Corner", "The Magic Fun Factory", "the magic hands editions", "The Magic Wand Office", "The MasterMind Group", "The Merchant of Magic Ltd.", "The Miracle Factory", "The Neat Review", "The Presto Place", "The Second Deal (Jason Alford)", "The Secret Service", "The Sid Lorraine Hat & Rabbit Club", "The Supreme Magic Company", "The Tom-Foolery, Inc.", "The Usual Suspect", "The Welworth Company", "The Williamson Press, Inc.", "The Yogi Magic Mart", "Theory and Art of Magic Press", "Thinkers' Press", "Thomas van Büren Lenger", "Tokyodo Shuppan", "Trapdoor Productions", "Trik-Kard Specialties", "TVMagic.co.uk", "U. F. Grant", "Ultra Neat Ltd.", "Underground Collective", "Unikorn Magik", "Unique Magic Studio", "unknown publisher", "Vanishing Inc.", "Verlag Magischer Zirkel Hamburg", "Verlag Magischer Zirkel Leipzig", "Verlag O. Stolina", "W. H. Allen, London", "Weerd! Publishing", "Westbrook Publishing", "Wiener Spielkartenfabrik Fred. Piatnik & Söhne", "Will Goldston, Ltd.", "Wizard Publishing Company", "Wolfe Publishing Limited", "Wonder Workshop Berlin", "Wunderwinkel", "Zauberbuch-Verlag", "Zauberkabinett Shop", "Zauberkunst", "Zauberschrank", "Zauberzentrale München", "Zentralhaus für Kulturarbeit", "Édition Ch. Eggimann, Genève"];

// ── ERROR BANNER ──
let saveErrorActive = false;
function showErrorBanner(title, msg) {
  saveErrorActive = true;
  document.getElementById('errorBannerTitle').textContent = title;
  document.getElementById('errorBannerMsg').textContent = msg;
  const b = document.getElementById('errorBanner');
  b.style.display = 'flex';
  // Add top padding to nav so content isn't hidden
  document.querySelector('.nav').style.marginTop = '52px';
}
function dismissError() {
  saveErrorActive = false;
  document.getElementById('errorBanner').style.display = 'none';
  document.querySelector('.nav').style.marginTop = '0';
}

// ── PHOTO QUEUE ──
const photoQueue = [];
function addToQueue(event) {
  const files = Array.from(event.target.files);
  event.target.value = '';
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      photoQueue.push({ file, dataUrl: e.target.result });
      updateQueueUI();
    };
    reader.readAsDataURL(file);
  });
}
function updateQueueUI() {
  const count = photoQueue.length;
  document.getElementById('queueCount').textContent = count + ' photo' + (count !== 1 ? 's' : '') + ' queued';
  const panel = document.getElementById('queuePanel');
  panel.style.display = count > 0 ? 'block' : 'none';
  const thumbs = document.getElementById('queueThumbs');
  thumbs.innerHTML = photoQueue.map((item, i) => 
    `<div style="position:relative;width:52px;height:72px;border-radius:6px;overflow:hidden;border:0.5px solid var(--border-med);">
      <img src="${item.dataUrl}" style="width:100%;height:100%;object-fit:cover;">
      ${i === 0 ? '<div style="position:absolute;bottom:0;left:0;right:0;background:var(--accent);color:white;font-size:9px;text-align:center;padding:2px;">Next</div>' : ''}
     </div>`
  ).join('');
  const btn = document.getElementById('processQueueBtn');
  if (btn) btn.textContent = `Process next (${count} left) →`;
}
async function processNextFromQueue() {
  if (!photoQueue.length) { showToast('Queue is empty', 'info'); return; }
  const item = photoQueue.shift();
  updateQueueUI();
  clearForm();
  // Compress to thumbnail for display/storage
  await setCoverCompressed(item.dataUrl);
  // Separately compress at higher quality for OCR accuracy
  const scanDataUrl = await compressImage(item.dataUrl, 800, 0.85);
  // Run scan
  const statusEl = document.getElementById('scanStatus');
  statusEl.className = 'scan-status scanning';
  document.getElementById('scanIcon').textContent = '⏳';
  document.getElementById('scanTitle').textContent = 'Analysing queued photo…';
  document.getElementById('scanDetail').textContent = 'Claude is reading the cover metadata.';
  const b64 = scanDataUrl.split(',')[1];
  const mimeMatch = scanDataUrl.match(/data:([^;]+);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  try {
    const data = await callClaude([{role:'user',content:[
      {type:'image',source:{type:'base64',media_type:mime,data:b64}},
      {type:'text',text:'You are a bibliographic expert specialising in magic and conjuring books. Extract all metadata visible on this book cover. Reply ONLY with valid JSON, no markdown: {"title":"","author":"","artist":"","edition":"","year":"","publisher":"","isbn":"","confidence":"high|medium|low","fields_found":[],"notes":""}'}
    ]}], 600);
    const parsed = JSON.parse(data.content[0].text.replace(/```json|```/g,'').trim());
    const fields = [
      {id:'f-title',val:parsed.title},{id:'f-author',val:parsed.author},
      {id:'f-artist',val:parsed.artist||''},{id:'f-edition',val:parsed.edition},{id:'f-year',val:parsed.year},
      {id:'f-publisher',val:parsed.publisher},{id:'f-isbn',val:parsed.isbn}
    ];
    let populated = 0;
    fields.forEach(f => {
      if (f.val && f.val.trim()) {
        const el = document.getElementById(f.id);
        if (el) { el.value = toTitleCase(f.val.trim()); el.classList.add('field-populated'); setTimeout(()=>el.classList.remove('field-populated'),3000); populated++; }
      }
    });
    const confClass = {high:'conf-high',medium:'conf-med',low:'conf-low'}[parsed.confidence]||'conf-med';
    statusEl.className = 'scan-status done';
    document.getElementById('scanIcon').textContent = '✓';
    document.getElementById('scanTitle').innerHTML = `${populated} fields extracted <span class="confidence-badge ${confClass}">${parsed.confidence} confidence</span>`;
    document.getElementById('scanDetail').textContent = (photoQueue.length > 0 ? `${photoQueue.length} photo(s) still in queue. ` : '') + (parsed.notes || 'Verify details below before saving.');
    if (parsed.title && parsed.author) setTimeout(() => fetchPrice(), 800);
  } catch(err) {
    statusEl.className = 'scan-status error';
    document.getElementById('scanIcon').textContent = '✕';
    document.getElementById('scanTitle').textContent = 'Scan failed';
    document.getElementById('scanDetail').textContent = err.message || 'Could not read the cover.';
  }
}

// ── CATALOG FILTERS/SORT ──
S.filterCondition = 'all';
S.sortBy = 'dateAdded';
S.sortDir = 'desc';
S.filterPublisher = '';

function setFilter(type, val, btn) {
  if (type === 'condition') {
    S.filterCondition = val;
    document.querySelectorAll('.filter-chip').forEach(b => {
      if (['All','Fine','Very Good','Good','Fair'].includes(b.textContent.trim())) b.classList.remove('active');
    });
    btn.classList.add('active');
  }
  filterCatalog();
}

function setSort(val, btn) {
  S.sortBy = val;
  // Remove active from sort chips only
  const sortChips = ['Last Added','Title A–Z','Author A–Z','Price ↓','Price ↑','Year'];
  document.querySelectorAll('.filter-chip').forEach(b => {
    if (sortChips.includes(b.textContent.trim())) b.classList.remove('active');
  });
  btn.classList.add('active');
  filterCatalog();
}


// ── IMAGE COMPRESSION ──
// Compress any image to a small JPEG thumbnail (max 300px wide, ~15KB)
async function compressImage(dataUrl, maxWidth=300, quality=0.6) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ratio = Math.min(maxWidth / img.width, maxWidth / img.height, 1);
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl); // fallback to original
    img.src = dataUrl;
  });
}

// Compress cover before storing — called whenever a local image is set
async function setCoverCompressed(dataUrl) {
  showToast('Processing image…', 'info', 1500);
  const compressed = await compressImage(dataUrl);
  const kb = Math.round(compressed.length * 0.75 / 1024);
  S.coverUrl = compressed;
  const img = document.getElementById('coverImg');
  const ph = document.getElementById('coverPlaceholder');
  img.onload = () => { img.style.display='block'; ph.style.display='none'; };
  img.src = compressed;
  showToast('Cover ready (' + kb + 'KB)', 'success', 2000);
  // Upload full-res to Cloudinary silently in background — NEVER blocks save
  if (S.settings && S.settings.cloudName && S.settings.cloudPreset) {
    setTimeout(() => {
      uploadToCloudinary(dataUrl)
        .then(url => { if (url) S.coverUrlHighRes = url; })
        .catch(e => console.warn('Cloudinary (non-critical):', e));
    }, 500);
  }
}


// ── CURRENT MODAL BOOK INDEX ──
S.currentModalIdx = -1;
S.editCoverUrl = '';
S.coverPickerTarget = 'add'; // 'add' or 'edit'

// ── ZOOM ──
function openZoom(src) {
  if (!src) return;
  document.getElementById('zoomImg').src = src;
  document.getElementById('zoomOverlay').classList.remove('hidden');
}
function openZoomFromModal() {
  const b = S.books[S.currentModalIdx];
  if (b) openZoom(b.rawCover || b.coverUrl);
}
function closeZoom() { document.getElementById('zoomOverlay').classList.add('hidden'); }

// ── CLOUDINARY UPLOAD ──
async function uploadToCloudinary(dataUrl) {
  // Fully silent — never shows errors to user, never blocks anything
  const cloudName = (S.settings.cloudName || '').trim();
  const preset = (S.settings.cloudPreset || '').trim();
  if (!cloudName || !preset) return null;
  try {
    const arr = dataUrl.split(',');
    const mime = (arr[0].match(/:(.*?);/) || [,'image/jpeg'])[1];
    const bstr = atob(arr[1]);
    const u8arr = new Uint8Array(bstr.length);
    for (let n = 0; n < bstr.length; n++) u8arr[n] = bstr.charCodeAt(n);
    const blob = new Blob([u8arr], {type: mime});
    const formData = new FormData();
    formData.append('file', blob, 'cover.jpg');
    formData.append('upload_preset', preset);
    formData.append('folder', 'arcana-books');
    const resp = await fetch('https://api.cloudinary.com/v1_1/' + cloudName + '/image/upload', {
      method: 'POST', body: formData
    });
    const data = await resp.json();
    if (data.secure_url) return data.secure_url;
  } catch(e) { /* silent — Cloudinary is optional */ }
  return null;
}

// Cloudinary upload happens separately — called after setCoverCompressed when needed

// ── CLOUDINARY CONNECTION TEST ──
async function testCloudinaryUpload() {
  const cloudName = (S.settings.cloudName || '').trim();
  const preset = (S.settings.cloudPreset || '').trim();
  const statusEl = document.getElementById('cloudinaryTestStatus');

  const showStatus = (msg, ok) => {
    statusEl.style.display = 'block';
    statusEl.textContent = msg;
    statusEl.style.background = ok ? '#d1fae5' : '#fee2e2';
    statusEl.style.color = ok ? '#065f46' : '#991b1b';
    statusEl.style.border = '0.5px solid ' + (ok ? '#6ee7b7' : '#fca5a5');
  };

  if (!cloudName || !preset) {
    showStatus('⚠  Enter your Cloud Name and Upload Preset above first.', false);
    return;
  }

  showStatus('Testing…', true);
  statusEl.style.background = '#f3f4f6';
  statusEl.style.color = '#374151';
  statusEl.style.border = '0.5px solid #d1d5db';

  try {
    // Upload a minimal 1×1 transparent PNG as a test image
    const testPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const arr = testPng.split(',');
    const bstr = atob(arr[1]);
    const u8arr = new Uint8Array(bstr.length);
    for (let n = 0; n < bstr.length; n++) u8arr[n] = bstr.charCodeAt(n);
    const blob = new Blob([u8arr], {type: 'image/png'});
    const formData = new FormData();
    formData.append('file', blob, 'magilib-test.png');
    formData.append('upload_preset', preset);
    formData.append('folder', 'arcana-books');

    const resp = await fetch('https://api.cloudinary.com/v1_1/' + cloudName + '/image/upload', {
      method: 'POST', body: formData
    });
    const data = await resp.json();

    if (data.secure_url) {
      showStatus('✓ Connected! Test image uploaded successfully. Cloudinary is working.', true);
    } else if (data.error) {
      const msg = data.error.message || 'Unknown error';
      if (msg.toLowerCase().includes('preset')) {
        showStatus('✗ Invalid preset "' + preset + '". Check it exists and is set to Unsigned in Cloudinary.', false);
      } else if (msg.toLowerCase().includes('cloud')) {
        showStatus('✗ Cloud name "' + cloudName + '" not found. Check your Cloudinary dashboard.', false);
      } else {
        showStatus('✗ Cloudinary error: ' + msg, false);
      }
    } else {
      showStatus('✗ Unexpected response from Cloudinary. Check your credentials.', false);
    }
  } catch(e) {
    showStatus('✗ Network error — could not reach Cloudinary. Check your internet connection.', false);
  }
}

// ── COVER PICKER ──
function resetPickerState() {
  document.getElementById('coverPickerStatus').textContent = '';
  document.getElementById('coverPickerResults').innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:30px;"><span class="spinner dark"></span></div>';
  document.getElementById('coverPickerResults').style.display = 'grid';
  // Hide Google Images card and URL field, clear URL input
  const card = document.getElementById('googleImagesCard');
  const urlArea = document.getElementById('pickerUrlArea');
  const urlInput = document.getElementById('pickerUrlInput');
  if (card) card.style.display = 'none';
  if (urlArea) urlArea.style.display = 'none';
  if (urlInput) urlInput.value = '';
  S._googleImgUrl = '';
  const pf = document.getElementById('pickerFooter'); if (pf) pf.style.display = 'block';
  // Highlight Google Images button as active (it loads automatically)
  document.querySelectorAll('.picker-source-btn').forEach(b => b.classList.remove('active'));
  const gBtn = document.getElementById('pickerGoogleBtn');
  if (gBtn) gBtn.classList.add('active');
}
function openCoverPicker() {
  S.coverPickerTarget = 'add';
  resetPickerState();
  document.getElementById('coverPickerOverlay').classList.remove('hidden');
  // Auto-load Google Images so picker is never empty on open
  setTimeout(() => searchCoverSource('images'), 50);
}
function openCoverPickerForEdit() {
  S.coverPickerTarget = 'edit';
  resetPickerState();
  document.getElementById('coverPickerOverlay').classList.remove('hidden');
  // Auto-load Google Images so picker is never empty on open
  setTimeout(() => searchCoverSource('images'), 50);
}
function closeCoverPicker(e) {
  if (!e || e.target === document.getElementById('coverPickerOverlay'))
    document.getElementById('coverPickerOverlay').classList.add('hidden');
}

function getSearchTerms() {
  if (S.coverPickerTarget === 'edit') {
    return { title: document.getElementById('edit-title').value.trim(), author: document.getElementById('edit-author').value.trim() };
  }
  return { title: document.getElementById('f-title').value.trim(), author: document.getElementById('f-author').value.trim() };
}

async function searchCoverSource(source) {
  const { title, author } = getSearchTerms();
  if (!title) { showToast('Enter a title first', 'error'); return; }

  const statusEl = document.getElementById('coverPickerStatus');
  const resultsEl = document.getElementById('coverPickerResults');
  statusEl.textContent = 'Searching…';
  resultsEl.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:30px;"><span class="spinner dark"></span></div>';

  const images = [];

  // Always reset Google Images UI when switching sources
  const _gCard = document.getElementById('googleImagesCard');
  const _gUrlArea = document.getElementById('pickerUrlArea');
  const _gPf = document.getElementById('pickerFooter');
  if (source !== 'images') {
    if (_gCard) _gCard.style.display = 'none';
    if (_gUrlArea) _gUrlArea.style.display = 'none';
    if (resultsEl) resultsEl.style.display = 'grid';
    if (_gPf) _gPf.style.display = 'block';
  }

  // ── GOOGLE IMAGES — show instruction card + URL field, no results grid ──
  if (source === 'images') {
    const searchQuery = encodeURIComponent('"' + title + '"' + (author ? ' "' + author + '"' : '') + ' book cover');
    S._googleImgUrl = 'https://www.google.com/search?tbm=isch&q=' + searchQuery;
    const card = document.getElementById('googleImagesCard');
    const urlArea = document.getElementById('pickerUrlArea');
    const resultsEl = document.getElementById('coverPickerResults');
    const pf = document.getElementById('pickerFooter');
    if (card) card.style.display = 'block';
    if (urlArea) { urlArea.style.display = 'flex'; setTimeout(() => { const inp = document.getElementById('pickerUrlInput'); if (inp) inp.focus(); }, 200); }
    if (resultsEl) resultsEl.style.display = 'none';
    if (pf) pf.style.display = 'none';
    statusEl.textContent = '';
    return;
  }

  if (source === 'google') {
    try {
      // Try multiple search strategies from most to least specific
      const queries = [
        encodeURIComponent(title + (author ? ' ' + author : '')),
        encodeURIComponent(title),
        encodeURIComponent(title.split(' ').slice(0,3).join(' ')) // first 3 words
      ];
      for (const q of queries) {
        if (images.length >= 6) break;
        const r = await fetch('https://www.googleapis.com/books/v1/volumes?q=' + q + '&maxResults=10');
        if (r.ok) {
          const d = await r.json();
          (d.items || []).forEach(item => {
            const v = item.volumeInfo || {};
            const links = v.imageLinks;
            if (links) {
              let url = links.extraLarge || links.large || links.medium || links.small || links.thumbnail || '';
              url = url.replace('http://', 'https://').replace(/zoom=\d/g, 'zoom=3');
              const label = v.title + (v.authors ? ' — ' + v.authors[0] : '');
              if (url && !images.find(i => i.url === url)) images.push({ url, label, source: 'Google Books' });
            }
          });
        }
      }
    } catch(e) { statusEl.textContent = 'Google Books error: ' + e.message; }
  }

  if (source === 'conjuring') {
    try {
      statusEl.textContent = 'Searching local database...';
      resultsEl.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:30px;"><span class="spinner dark"></span></div>';

      // Helper: expand compressed DB cover codes to full URLs
      function _xpandUrl(u) {
        if (!u) return '';
        if (u.startsWith('C:')) return 'https://www.conjuringarchive.com/images/covers/' + u.slice(2) + 'a.jpg';
        if (u.startsWith('M:')) return 'https://www.magicref.net/images/books/' + u.slice(2);
        if (u.startsWith('P:')) return 'https://www.magicref.net/magicbooks/' + u.slice(2);
        return u;
      }

      var caUrl = '';   // Conjuring Archive cover URL
      var mrUrl = '';   // MagicRef cover URL (as base64 data URL after proxy fetch)
      var caLabel = 'Conjuring Archive';
      var mrLabel = 'MagicRef';

      // 1. Look up entry in CONJURING_DB
      if (typeof CONJURING_DB !== 'undefined') {
        var nk = title.toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
        var entry = CONJURING_DB[nk];
        if (!entry) {
          var sk = nk.split(':')[0].trim();
          if (sk !== nk) entry = CONJURING_DB[sk];
        }
        if (!entry && typeof conjuringFuzzyLookup === 'function') {
          var fuzz = conjuringFuzzyLookup(title);
          if (fuzz) entry = CONJURING_DB[fuzz.key];
        }
        if (entry) {
          // Get Conjuring Archive cover URL
          if (typeof entry === 'string') {
            // Old plain-string format
            caUrl = entry;
          } else {
            // New sparse object format
            if (entry.c) caUrl = _xpandUrl(entry.c);
            else if (entry.i && entry.i[0]) caUrl = _xpandUrl(entry.i[0]);
            // Get MagicRef page URL
            if (entry.m) {
              var mrPageUrl = _xpandUrl(entry.m);
              if (mrPageUrl.includes('magicref.net/magicbooks/')) {
                statusEl.textContent = 'Fetching MagicRef cover...';
                try {
                  var mrResp = await fetch('/api/fetch-proxy?action=fetch&url=' + encodeURIComponent(mrPageUrl));
                  var mrData = await mrResp.json();
                  if (mrData.success && mrData.html) {
                    // Find first book-cover image - skip navigation/button images
                    var allImgs = [...mrData.html.matchAll(/<img[^>]+src="([^"]+\.(?:jpg|jpeg|png|webp))"[^>]*>/gi)];
                    for (var ii = 0; ii < allImgs.length; ii++) {
                      var rawSrc = allImgs[ii][1];
                      if (rawSrc.includes('but-') || rawSrc.includes('logo') || rawSrc.includes('icon') || rawSrc.includes('banner')) continue;
                      // Resolve relative path against page URL
                      var absUrl;
                      if (rawSrc.startsWith('http')) {
                        absUrl = rawSrc;
                      } else {
                        // Walk relative path (e.g. ../../images/books/foo.jpg)
                        var pageParts = mrPageUrl.split('/');
                        pageParts.pop(); // remove filename
                        var relParts = rawSrc.split('/');
                        for (var rp = 0; rp < relParts.length; rp++) {
                          if (relParts[rp] === '..') pageParts.pop();
                          else if (relParts[rp] !== '.') pageParts.push(relParts[rp]);
                        }
                        absUrl = pageParts.join('/');
                      }
                      // Fetch the image via proxy (bypasses CORS)
                      var imgResp = await fetch('/api/fetch-proxy?action=image&url=' + encodeURIComponent(absUrl));
                      var imgData = await imgResp.json();
                      if (imgData.success && imgData.dataUrl) {
                        mrUrl = imgData.dataUrl;
                      }
                      break;
                    }
                  }
                } catch(mrErr) { /* MagicRef fetch failed silently */ }
              }
            }
          }
        }
      }

      // 2. Render exactly two cards: Conjuring Archive + MagicRef
      var cardHtml = '';
      var count = (caUrl ? 1 : 0) + (mrUrl ? 1 : 0);

      function makeCard(url, sourceLabel, titleLabel) {
        var esc = url.startsWith('data:') ? url : url.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
        return '<div onclick="selectPickedCover(\'' + esc + '\',this)" style="cursor:pointer;border-radius:8px;overflow:hidden;border:2px solid transparent;transition:border-color 0.15s;background:var(--paper-warm);">' +
          '<div style="width:100%;aspect-ratio:2/3;position:relative;background:var(--paper-warm);">' +
          '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:32px;opacity:0.18;">&#128218;</div>' +
          '<img src="' + url + '" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;" onerror="this.style.display=\'none\'" loading="lazy"/>' +
          '</div>' +
          '<div style="padding:4px 6px;font-size:9px;color:var(--ink-faint);text-align:center;line-height:1.3;">' + sourceLabel + '<br><span style="color:var(--ink);font-size:8px;">' + titleLabel.substring(0,35) + '</span></div>' +
          '</div>';
      }

      if (caUrl) cardHtml += makeCard(caUrl, 'Local Database', caLabel);
      if (mrUrl) cardHtml += makeCard(mrUrl, 'MagicRef', mrLabel);

      if (!cardHtml) {
        statusEl.textContent = 'Not found in local database.';
        resultsEl.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--ink-faint);font-size:13px;">No covers found for "' + title + '" in local database.</div>';
      } else {
        statusEl.textContent = count + ' cover(s) found — tap to select';
        resultsEl.innerHTML = cardHtml;
      }
      return;
    } catch(e) { statusEl.textContent = 'Local database error: ' + e.message; }
  }

  if (source === 'magicref') {
    try {
      const q = encodeURIComponent(title);
      const searchUrl = 'https://magicref.net/magicbooks/?s=' + q;
      statusEl.textContent = 'Fetching MagicRef…';
      const resp = await fetch('/api/fetch-proxy?action=fetch&url=' + encodeURIComponent(searchUrl));
      const data = await resp.json();
      if (!data.success) throw new Error(data.error || 'Fetch failed');
      const linkMatches = [...data.html.matchAll(/href="(https?:\/\/magicref\.net\/magicbooks\/[^"?#\/][^"]*\/?)"/gi)];
      const uniqueLinks = [...new Set(linkMatches.map(m => m[1]))].slice(0, 6);
      statusEl.textContent = 'Found ' + uniqueLinks.length + ' results, loading covers…';
      for (const link of uniqueLinks) {
        try {
          const dr = await fetch('/api/fetch-proxy?action=fetch&url=' + encodeURIComponent(link));
          const dd = await dr.json();
          if (dd.success) {
            const imgMatches = [...dd.html.matchAll(/<img[^>]+src="([^"]+\.(?:jpg|jpeg|png|webp))"[^>]*>/gi)];
            for (const m of imgMatches) {
              const src = m[1].startsWith('http') ? m[1] : 'https://magicref.net' + m[1];
              if (!src.includes('logo') && !src.includes('icon') && !src.includes('avatar') && !src.includes('banner') && !images.find(i => i.url === src)) {
                const titleM = dd.html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
                images.push({ url: src, label: titleM ? titleM[1].trim() : 'MagicRef', source: 'MagicRef' });
                break;
              }
            }
          }
        } catch(e2) {}
      }
    } catch(e) { statusEl.textContent = 'MagicRef error: ' + e.message; }
  }

  if (!images.length) {
    statusEl.textContent = 'No covers found.';
    resultsEl.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--ink-faint);font-size:13px;">No covers found for “' + title + '” — try another source or paste a URL manually.</div>';
    return;
  }

  statusEl.textContent = images.length + ' cover(s) found — tap to select';
  resultsEl.innerHTML = images.map(img => {
    if (img.url === '__google_images__') {
      // Special card: opens Google Images
      const gUrl = img.googleUrl || '';
      return '<div onclick="window.open(\'' + gUrl + '\',\'_blank\')" style="cursor:pointer;border-radius:8px;border:1.5px dashed var(--border-med);background:var(--paper-warm);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;gap:6px;">' +
        '<span style="font-size:24px;">🔍</span>' +
        '<div style="font-size:11px;font-weight:500;color:var(--ink);text-align:center;">Open Google Images</div>' +
        '<div style="font-size:9px;color:var(--ink-faint);text-align:center;">Find image, copy URL,<br>paste in ↗ URL field</div>' +
        '</div>';
    }
    const esc = img.url.replace(/\\/g,'\\\\').replace(/'/g, "\\'");
    return '<div onclick="selectPickedCover(\'' + esc + '\',this)" style="cursor:pointer;border-radius:8px;overflow:hidden;border:2px solid transparent;transition:border-color 0.15s;background:var(--paper-warm);">' +
      '<div style="width:100%;aspect-ratio:2/3;background:var(--paper-warm);position:relative;">' +
      '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:32px;opacity:0.18;">&#128218;</div>' +
      '<img src="' + img.url + '" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;" onerror="this.style.display=\'none\'" loading="lazy"/>' +
      '</div>' +
      '<div style="padding:4px 6px;font-size:9px;color:var(--ink-faint);text-align:center;line-height:1.3;">' + img.source + '<br><span style="color:var(--ink);font-size:8px;">' + (img.label||'').substring(0,35) + '</span></div>' +
      '</div>';
  }).join('');
}

function selectPickedCover(url, el) {
  // Highlight selected
  document.querySelectorAll('#coverPickerResults > div').forEach(d => d.style.borderColor = 'transparent');
  if (el) el.style.borderColor = 'var(--accent)';

  if (S.coverPickerTarget === 'edit') {
    S.editCoverUrl = url;
    const img = document.getElementById('editCoverImg');
    const ph = document.getElementById('editCoverPh');
    img.src = url; img.style.display = 'block'; ph.style.display = 'none';
  } else {
    setCover(url);
    S.coverUrl = url;
  }
  setTimeout(() => document.getElementById('coverPickerOverlay').classList.add('hidden'), 400);
}

// ── EDIT BOOK ──

// ── SCROLL-TO-TOP BUTTON ──
// Injected once into the catalog view. Appears after 300px scroll, fades out at top.
let _scrollTopBtn = null;

function initScrollTopBtn() {
  if (_scrollTopBtn) return;

  const btn = document.createElement('button');
  btn.id = '_scrollTopBtn';
  btn.setAttribute('aria-label', 'Scroll to top');
  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2 9.5L7 4.5L12 9.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
  btn.style.cssText = `
    position: fixed;
    bottom: 72px;
    right: 14px;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--accent);
    color: #fff;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.25s ease;
    z-index: 90;
    box-shadow: 0 1px 6px rgba(0,0,0,0.18);
  `;

  document.body.appendChild(btn);
  _scrollTopBtn = btn;

  btn.addEventListener('mouseenter', () => { if (btn.style.pointerEvents !== 'none') btn.style.opacity = '1'; });
  btn.addEventListener('mouseleave', () => { if (btn.style.pointerEvents !== 'none') btn.style.opacity = '0.4'; });

  btn.addEventListener('click', () => {
    const vc = document.getElementById('view-catalog');
    if (vc) vc.scrollTo({ top: 0, behavior: 'smooth' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  const vc = document.getElementById('view-catalog');


  const onScroll = () => {
const scrollY = window.scrollY || document.documentElement.scrollTop;
    if (scrollY > 300) {
      btn.style.opacity = '0.4';
      btn.style.pointerEvents = 'auto';
    } else {
      btn.style.opacity = '0';
      btn.style.pointerEvents = 'none';
    }
  };

 window.addEventListener('scroll', onScroll, { passive: true });
}





// ══ BULK EDIT ══════════════════════════════════════════════════
//  Injected by deploy tool
// ═══════════════════════════════════════════════════════════════
(function(){

var _on = false;
var _sel = new Set();

// ── CSS ────────────────────────────────────────────────────────
var _CSS = [
  /* Select All banner above grid */
  '.bk-banner{display:none;align-items:center;gap:8px;',
    'padding:4px 0 2px;font-size:12px;font-weight:600;',
    'color:var(--ink,#1A1814);}',
  '.bk-banner.on{display:flex;}',
  '.bk-all{font-size:11px;background:rgba(42,31,107,.1);border:none;',
    'color:var(--accent,#2A1F6B);padding:3px 8px;border-radius:5px;',
    'cursor:pointer;font-family:inherit;}',
  /* Floating action bar — only when selecting */
  '.bk-act{',
    'display:none;',
    'position:fixed;bottom:68px;left:50%;transform:translateX(-50%);',
    'background:rgba(26,20,58,0.93);',
    'backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);',
    'color:#fff;border-radius:12px;',
    'padding:7px 10px;align-items:center;gap:5px;',
    'z-index:300;',
    'box-shadow:0 4px 24px rgba(0,0,0,.32);',
    'font-family:inherit;',
    'min-width:min(280px,88vw);',
  '}',
  '.bk-act.on{display:flex;}',
  '.bk-cnt{font-size:12px;font-weight:600;opacity:.7;white-space:nowrap;padding:0 4px;flex:1;}',
  '.bk-b{background:rgba(255,255,255,.13);border:none;color:#fff;',
    'border-radius:7px;padding:5px 10px;font-size:12px;font-weight:600;',
    'cursor:pointer;white-space:nowrap;transition:background .15s;font-family:inherit;}',
  '.bk-b:hover{background:rgba(255,255,255,.24);}',
  '.bk-b.red{background:rgba(210,50,50,.28);}',
  '.bk-b.red:hover{background:rgba(210,50,50,.5);}',
  '.bk-b.gold{background:rgba(201,168,76,.24);}',
  '.bk-b.gold:hover{background:rgba(201,168,76,.44);}',
  '.bk-b.exit{padding:5px 8px;opacity:.5;}',
  '.bk-b.exit:hover{opacity:1;}',
  /* Cards */
  '.book-card.bk-sel{outline:2px solid #C9A84C;outline-offset:1px;}',
  '.bk-cbw{position:absolute;top:6px;left:6px;z-index:5;pointer-events:none;}',
  '.bk-cb{width:20px;height:20px;border-radius:5px;',
    'border:2px solid rgba(201,168,76,.9);background:rgba(255,255,255,.95);',
    'display:grid;place-items:center;font-size:12px;font-weight:700;',
    'color:#2A1F6B;transition:background .12s,border-color .12s;}',
  '.bk-cb.checked{background:#2A1F6B;border-color:#2A1F6B;color:#fff;}',
  '.bk-ov{position:absolute;inset:0;z-index:4;cursor:pointer;}',
  /* Select button in toolbar — matches app style */
  '#_bkSelBtn{',
    'display:inline-flex;align-items:center;gap:5px;',
    'font-size:13px;font-weight:600;',
    'padding:7px 14px;border-radius:8px;',
    'border:1.5px solid var(--border,#D8D4CE);',
    'background:transparent;cursor:pointer;',
    'color:var(--ink,#1A1814);',
    'font-family:inherit;white-space:nowrap;',
    'transition:background .15s,border-color .15s;',
  '}',
  '#_bkSelBtn:hover{background:rgba(42,31,107,.06);border-color:rgba(42,31,107,.3);}',
  '#_bkSelBtn.active{background:rgba(42,31,107,.1);border-color:rgba(42,31,107,.4);color:var(--accent,#2A1F6B);}',
  /* Delete All in settings */
  '.bk-del-all-btn{',
    'width:100%;margin-top:8px;',
    'background:transparent;',
    'border:1.5px solid rgba(200,60,60,.35);',
    'border-radius:9px;padding:11px 16px;',
    'color:rgba(170,40,40,.9);font-size:14px;font-weight:600;',
    'cursor:pointer;text-align:left;font-family:inherit;',
    'transition:background .15s,border-color .15s;',
  '}',
  '.bk-del-all-btn:hover{background:rgba(200,60,60,.06);border-color:rgba(200,60,60,.6);}'
].join('');

function _css(){
  if(document.getElementById('_bkCSS'))return;
  var s=document.createElement('style');s.id='_bkCSS';s.textContent=_CSS;
  document.head.appendChild(s);
}

// ── DOM ────────────────────────────────────────────────────────
var _actBar, _banner;

function _buildDOM(){
  if(_actBar)return;

  // Floating action bar (center-bottom, only visible when selecting)
  _actBar=document.createElement('div');
  _actBar.className='bk-act';_actBar.id='_bkAct';
  _actBar.innerHTML=
    '<span class="bk-cnt" id="_bkCount">0 selected</span>'+
    '<button class="bk-b gold" onclick="_bkFill()">Auto-fill</button>'+
    '<button class="bk-b gold" onclick="_bkPrice()">Prices</button>'+
    '<button class="bk-b red"  onclick="_bkDel()">Delete</button>'+
    '<button class="bk-b exit" onclick="_bkExit()" title="Exit">\u2715</button>';
  document.body.appendChild(_actBar);

  // Select All banner (above books grid)
  _banner=document.createElement('div');
  _banner.className='bk-banner';_banner.id='_bkBanner';
  _banner.innerHTML=
    '<span id="_bkBTxt">Tap books to select</span>'+
    '<button class="bk-all" id="_bkAllBtn" onclick="_bkAll()">Select All</button>';
  document.body.appendChild(_banner);
}

// ── Find the Refresh Library button row ────────────────────────
// Searches for the button that calls loadCatalog() and returns
// its parent container — that's the top toolbar row.
function _findRefreshBtn(){
  // By onclick attribute
  var btns=document.querySelectorAll('button');
  for(var i=0;i<btns.length;i++){
    var oc=btns[i].getAttribute('onclick')||'';
    var txt=btns[i].textContent||'';
    if(oc.indexOf('loadCatalog')!==-1||txt.indexOf('Refresh')!==-1){
      return btns[i];
    }
  }
  return null;
}

// ── Inject Select button into toolbar ─────────────────────────
var _injTries=0;
function _injectSelBtn(){
  if(document.getElementById('_bkSelBtn'))return;
  _injTries++;
  var ref=_findRefreshBtn();
  if(!ref){
    if(_injTries<15)setTimeout(_injectSelBtn,300);
    return;
  }
  var btn=document.createElement('button');
  btn.id='_bkSelBtn';
  btn.textContent='\u2611 Select';
  btn.title='Select multiple books for bulk actions';
  btn.onclick=function(){_on?_bkExit():_bkEnter();};
  // Insert just before the Refresh Library button
  ref.parentNode.insertBefore(btn,ref);
}

// ── Sync UI ────────────────────────────────────────────────────
function _sync(){
  var n=_sel.size;
  // Floating action bar: only when in select mode
  if(_actBar)_actBar.classList.toggle('on',_on);
  // Count label
  var c=document.getElementById('_bkCount');
  if(c)c.textContent=n+' selected';
  var bt=document.getElementById('_bkBTxt');
  if(bt)bt.textContent=n===0?'Tap books to select':n+' selected';
  // Select button appearance
  var sb=document.getElementById('_bkSelBtn');
  if(sb){
    sb.textContent=_on?'\u2715 Exit Select':'\u2611 Select';
    sb.classList.toggle('active',_on);
  }
}

// ── Stamp cards ────────────────────────────────────────────────
function _stamp(){
  document.querySelectorAll('.book-card').forEach(function(card,i){
    var b=S.books[i];if(!b)return;
    var bid=b._id||('i'+i);
    card.dataset.bkid=bid;
    card.style.position=card.style.position||'relative';
    var ov=card.querySelector('.bk-ov');if(ov)ov.remove();
    var cbw=card.querySelector('.bk-cbw');if(cbw)cbw.remove();
    if(_on){
      var o=document.createElement('div');
      o.className='bk-ov';o.dataset.bid=bid;
      o.addEventListener('click',function(e){
        e.stopPropagation();e.preventDefault();
        _tog(this.dataset.bid);
      });
      card.appendChild(o);
      var w=document.createElement('div');w.className='bk-cbw';
      var cb=document.createElement('div');
      var sel=_sel.has(bid);
      cb.className='bk-cb'+(sel?' checked':'');
      cb.textContent=sel?'\u2713':'';
      w.appendChild(cb);
      card.insertAdjacentElement('afterbegin',w);
      card.classList.toggle('bk-sel',sel);
    }else{
      card.classList.remove('bk-sel');
    }
  });
}

function _refreshCards(){
  document.querySelectorAll('.book-card[data-bkid]').forEach(function(card){
    var bid=card.dataset.bkid;var sel=_sel.has(bid);
    card.classList.toggle('bk-sel',sel);
    var cb=card.querySelector('.bk-cb');
    if(cb){cb.className='bk-cb'+(sel?' checked':'');cb.textContent=sel?'\u2713':'';}
  });
}

function _tog(bid){
  _sel.has(bid)?_sel.delete(bid):_sel.add(bid);
  _refreshCards();_sync();
}

// ── Enter / Exit ───────────────────────────────────────────────
function _bkEnter(){
  _css();_buildDOM();
  _on=true;_sel.clear();
  _stamp();
  var grid=document.getElementById('booksGrid');
  if(grid&&_banner){grid.before(_banner);_banner.classList.add('on');}
  _sync();
}
function _bkExit(){
  _on=false;_sel.clear();
  if(_actBar)_actBar.classList.remove('on');
  if(_banner)_banner.classList.remove('on');
  _stamp();_sync();
}
window._bkExit=_bkExit;

function _bkAll(){
  var all=S.books.map(function(b,i){return b._id||('i'+i);});
  var allIn=all.every(function(id){return _sel.has(id);});
  if(allIn){_sel.clear();}else{all.forEach(function(id){_sel.add(id);});}
  var ab=document.getElementById('_bkAllBtn');
  if(ab)ab.textContent=allIn?'Select All':'Deselect All';
  _refreshCards();_sync();
}
window._bkAll=_bkAll;

// ── Bulk delete selected ───────────────────────────────────────
async function _bkDel(){
  var n=_sel.size;
  if(!n)return showToast('No books selected','error');
  if(!confirm('Delete '+n+' book'+(n!==1?'s':'')+' from your library?\n\nThis cannot be undone.'))return;
  if(!confirm('\u26A0\uFE0F Final warning: permanently delete '+n+' book'+(n!==1?'s':'')+'.\n\nPress OK to confirm.'))return;
  var done=0;var ids=[..._sel];
  for(var j=0;j<ids.length;j++){
    var bid=ids[j];
    if(String(bid).startsWith('i'))continue;
    var res=await _supa.from('books').delete().eq('id',bid);
    if(!res.error)done++;
  }
  S.books=S.books.filter(function(b){return !_sel.has(b._id);});
  _bkExit();renderCatalog();
  showToast('Deleted '+done+' book'+(done!==1?'s':'')+' \u2713','success',3000);
}
window._bkDel=_bkDel;

// ── Bulk price refresh ─────────────────────────────────────────
async function _bkPrice(){
  var n=_sel.size;
  if(!n)return showToast('No books selected','error');
  if(!confirm('Refresh prices for '+n+' selected book'+(n!==1?'s':'')+'\nfrom local price database?'))return;
  var done=0,skip=0;
  var list=S.books.filter(function(b,i){return _sel.has(b._id||('i'+i));});
  for(var j=0;j<list.length;j++){
    var b=list[j];
    if(!b.title||!b._id||String(b._id).startsWith('i')){skip++;continue;}
    var result=typeof localPriceLookup==='function'?localPriceLookup(b.title):null;
    if(!result){skip++;continue;}
    var r=await _supa.from('books').update({market_price:result.recommended,updated_at:new Date().toISOString()}).eq('id',b._id);
    if(!r.error){b.price=String(result.recommended);done++;}else skip++;
  }
  _bkExit();renderCatalog();
  showToast('Prices: '+done+' updated, '+skip+' skipped \u2713','success',3500);
}
window._bkPrice=_bkPrice;

// ── Auto-fill from Conjuring DB ────────────────────────────────
async function _bkFill(){
  var n=_sel.size;
  if(!n)return showToast('No books selected','error');
  if(!confirm('Auto-fill missing fields for '+n+' book'+(n!==1?'s':'')+
    '?\n\nFills year, publisher, cover image.\n100% title match only. Existing values will NOT be overwritten.'))return;
  var done=0,skip=0;
  var list=S.books.filter(function(b,i){return _sel.has(b._id||('i'+i));});
  for(var j=0;j<list.length;j++){
    var b=list[j];
    if(!b.title||!b._id||String(b._id).startsWith('i')){skip++;continue;}
    var hit=typeof lookupConjuringEntry==='function'?lookupConjuringEntry(b.title):null;
    if(!hit||!hit.entry){skip++;continue;}
    var e=hit.entry,upd={};
    if(!b.year&&e.y){upd.year=e.y;b.year=e.y;}
    if(!b.publisher&&e.p){upd.publisher=e.p;b.publisher=e.p;}
    if(!b.coverUrl&&typeof dbCoverUrl==='function'){
      var cu=dbCoverUrl(e);
      if(cu){upd.cover_url=cu;b.coverUrl=cu;b.rawCover=cu;}
    }
    if(!Object.keys(upd).length){skip++;continue;}
    upd.updated_at=new Date().toISOString();
    var r=await _supa.from('books').update(upd).eq('id',b._id);
    if(!r.error)done++;else skip++;
  }
  _bkExit();renderCatalog();
  showToast('Auto-fill: '+done+' updated, '+skip+' skipped \u2713','success',4000);
}
window._bkFill=_bkFill;

// ── Delete entire library (called from Settings) ───────────────
async function _bkDelAll(){
  var total=S.books.length;
  if(!total)return showToast('Library is already empty','info');
  if(!confirm('\u26A0\uFE0F DELETE ENTIRE LIBRARY\n\nPermanently delete ALL '+total+' books?\n\nThis CANNOT be undone.'))return;
  if(!confirm('\uD83D\uDEA8 FINAL WARNING\n\nErase ALL '+total+' books permanently.\n\nPress OK only if 100% certain.'))return;
  var typed=window.prompt('Type  DELETE  to confirm erasing your entire library of '+total+' books:');
  if(!typed||typed.trim().toUpperCase()!=='DELETE'){
    showToast('Cancelled \u2014 library safe \u2713','success');return;
  }
  showToast('Deleting\u2026','info');
  var done=0;
  for(var j=0;j<S.books.length;j++){
    var b=S.books[j];
    if(!b._id||String(b._id).startsWith('i'))continue;
    var r=await _supa.from('books').delete().eq('id',b._id);
    if(!r.error)done++;
  }
  S.books=[];renderCatalog();
  showToast('Library cleared \u2014 '+done+' books deleted \u2713','success',5000);
}
window._bkDelAll=_bkDelAll;

// ── Inject Delete All into Settings ───────────────────────────
var _settTries=0;
function _injectSettingsBtn(){
  if(document.getElementById('_bkDelAllBtn'))return;
  _settTries++;
  var anchor=
    document.querySelector('#view-settings .settings-section:last-child')||
    document.querySelector('#view-settings .settings-footer')||
    document.querySelector('#view-settings > div:last-child')||
    document.querySelector('#view-settings');
  if(!anchor){
    if(_settTries<15)setTimeout(_injectSettingsBtn,400);
    return;
  }
  var wrap=document.createElement('div');
  wrap.style.cssText='padding:16px 0 8px;border-top:1px solid var(--border,#D8D4CE);margin-top:16px;';
  var label=document.createElement('div');
  label.style.cssText='font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-light,#6B6560);font-weight:700;margin-bottom:8px;';
  label.textContent='Danger Zone';
  var btn=document.createElement('button');
  btn.id='_bkDelAllBtn';
  btn.className='bk-del-all-btn';
  btn.textContent='\uD83D\uDDD1  Delete Entire Library';
  btn.onclick=_bkDelAll;
  wrap.appendChild(label);wrap.appendChild(btn);
  anchor.appendChild(wrap);
}

// Watch for settings tab becoming active
function _watchSettings(){
  var settings=document.getElementById('view-settings');
  if(!settings)return;
  var obs=new MutationObserver(function(){
    if(settings.classList.contains('active')){
      _settTries=0;setTimeout(_injectSettingsBtn,200);
    }
  });
  obs.observe(settings,{attributes:true,attributeFilter:['class']});
}

// ── Wrap renderCatalog ─────────────────────────────────────────
setTimeout(function(){
  if(typeof renderCatalog!=='function')return;
  var _orig=renderCatalog;
  window.renderCatalog=function(){
    _orig.apply(this,arguments);
    setTimeout(function(){
      _css();_buildDOM();
      if(_on)_stamp();
      _sync();
    },0);
  };
  // Remove legacy Select button if it exists in the DOM
  var _oldSel=document.getElementById('_bkSelBtn');
  if(_oldSel)_oldSel.remove();
  _watchSettings();
  // Try settings inject immediately in case already on that tab
  _settTries=0;_injectSettingsBtn();
},120);

})();
// ══ END BULK EDIT ══════════════════════════════════════════════
/**
 * Magi-Dialog: Custom Confirmation
 */
function magiConfirm({ title, message, confirmText, onConfirm }) {
  const overlay = document.getElementById('dialogOverlay');
  overlay.innerHTML = `
    <div class="magi-dialog">
      <h3>${title}</h3>
      <p>${message}</p>
      <div class="magi-dialog-actions" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        <button onclick="closeDialog()" class="btn-ghost">Cancel</button>
        <button id="magiConfirmBtn" class="btn-primary" style="background:#a32d2d;">${confirmText}</button>
      </div>
    </div>
  `;
  overlay.classList.add('is-active');
  document.getElementById('magiConfirmBtn').onclick = () => {
    onConfirm();
    closeDialog();
  };
}

function closeDialog() {
  document.getElementById('dialogOverlay').classList.remove('is-active');
}

function magiPrompt({ title, message, placeholder = '0.00', onConfirm }) {
  const overlay = document.getElementById('dialogOverlay');
  overlay.innerHTML = `
    <div class="magi-dialog">
      <h3>${title}</h3>
      <p>${message}</p>
      <input type="number" id="magiPromptInput" step="0.01" min="0" placeholder="${placeholder}">
      <div class="magi-dialog-actions" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:20px;">
        <button onclick="closeDialog()" class="btn-ghost">Cancel</button>
        <button id="magiPromptBtn" class="btn-primary">Confirm</button>
      </div>
    </div>
  `;
  overlay.classList.add('is-active');
  const input = document.getElementById('magiPromptInput');
  setTimeout(() => input.focus(), 50);
  const submit = () => {
    const val = parseFloat(input.value);
    if (isNaN(val) || val < 0) { input.style.borderColor = '#a32d2d'; return; }
    onConfirm(val);
    closeDialog();
  };
  document.getElementById('magiPromptBtn').onclick = submit;
  input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
}
window.magiPrompt = magiPrompt;

/**
 * Enhanced Delete Logic (Brand Safe)
 */
async function deleteBook(bookId) {
  console.log("Delete triggered for:", bookId);
  const book = S.books.find(b => b._id === bookId);
  if (!book) { console.warn("deleteBook: no book found for id", bookId); return; }
  magiConfirm({
    title: 'Delete Book?',
    message: `This will permanently remove "<strong>${book.title}</strong>" from your collection. This cannot be undone.`,
    confirmText: 'Delete',
    onConfirm: async () => {
      const { error } = await _supa.from('books').delete().eq('id', bookId);
      if (error) { showToast('Delete failed. Please try again.', 'error', 3000); return; }
      S.books = S.books.filter(b => b._id !== bookId);
      closeModal();
      renderCatalog();
      showToast('Book removed from your collection.', 'success', 2500);
    }
  });
}
window.deleteBook = deleteBook;
window.magiConfirm = magiConfirm;
window.closeDialog = closeDialog;

/**
 * Image Zoom: appends to body to respect z-index scale (--z-fullscreen)
 */
function zoomCover(imgSrc) {
  const zoomEl = document.createElement('div');
  zoomEl.className = 'ms-zoom-overlay';
  zoomEl.innerHTML = `<img src="${imgSrc}" style="max-width:90%;max-height:90%;object-fit:contain;border-radius:6px;">`;
  zoomEl.onclick = () => zoomEl.remove();
  document.body.appendChild(zoomEl);
}
