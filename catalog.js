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

  const rows = [];
  for (let i = 1; i < allRows.length; i++) {
    const cols = allRows[i];
    const title = getC(cols, 'title');
    if (!title) continue;
    rows.push({
      user_id: _supaUser.id,
      title,
      author: getC(cols,'author'),
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

  let imported = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await _supa.from('books').insert(rows.slice(i, i+100));
    if (!error) imported += Math.min(100, rows.length - i);
    else { console.error('Import chunk error:', error); failed += Math.min(100, rows.length - i); }
  }
  if (btn) { btn.disabled=false; btn.textContent='Import CSV'; }
  event.target.value='';
  const msg = failed > 0 ? 'Imported ' + imported + ', ' + failed + ' failed' : 'Imported ' + imported + ' books ✓';
  showToast(msg, failed > 0 ? 'error' : 'success', 3500);
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
  document.querySelectorAll('.view').forEach(el=>el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el=>el.classList.remove('active'));
  document.getElementById('view-'+v).classList.add('active');
  const tabs={entry:0,catalog:1,settings:2};
  document.querySelectorAll('.tab-btn')[tabs[v]].classList.add('active');
  if(v==='catalog')loadCatalog();
  if(v==='entry')window.scrollTo({top:0,behavior:'instant'});
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

async function loadCatalog(){
  const grid=document.getElementById('booksGrid');
  initScrollTopBtn();
  grid.innerHTML='<div style="padding:40px;text-align:center;color:var(--ink-faint)"><span class="spinner dark"></span> Loading…</div>';
  if (!_supaUser) { grid.innerHTML=''; return; }
  try{
    const { data, error } = await _supa.from('books').select('*').eq('user_id', _supaUser.id).order('created_at', { ascending: false });
    if (error) throw error;
    S.books = (data || []).map(row => ({
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
      notes: row.notes || '',
      coverUrl: row.cover_url || '',
      rawCover: row.cover_url || '',
      dateAdded: row.date_added || '',
      flags: row.condition_flags || '',
      sold: row.sold_status || '',
      star: row.star_rating != null ? String(row.star_rating) : '',
      collectorNote: row.collectors_note || '',
      location: row.where_acquired || '',
      draft: row.draft_status || '',
    }));
    renderCatalog();
    showToast('Loaded '+S.books.length+' books','success',2000);
  }catch(e){
    console.error('Catalog load error:',e);
    grid.innerHTML='<div class="empty-state"><div class="empty-icon">⚠</div><p>'+e.message+'</p><button onclick="loadCatalog()" style="margin-top:12px;padding:10px 20px;background:var(--accent);color:white;border:none;border-radius:7px;font-family:inherit;font-size:13px;cursor:pointer;">Retry</button></div>';
  }
}
function renderCatalog(){
  renderStatsRow();
  const search=(document.getElementById('catalogSearch').value||'').toLowerCase();
  const cond=S.filterCondition||'all';
  const pub=(document.getElementById('filterPublisher')||{}).value||'';
  let books=S.books.filter(b=>{
    const ms=!search||(b.title.toLowerCase().includes(search)||b.author.toLowerCase().includes(search)||(b.publisher||'').toLowerCase().includes(search)||(b.year||'').includes(search));
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
  // Exclude sold books from value totals
  const activeBooks = books.filter(b => b.sold !== 'Sold' && b.sold !== 'Wishlist' && b.draft !== 'Draft');
  const prices=activeBooks.map(b=>parseFloat(b.price)||0).filter(p=>p>0&&p<50000);
  const totalVal=prices.reduce((a,b2)=>a+b2,0);
  const avg=prices.length?totalVal/prices.length:0;
  const top=prices.length?Math.max(...prices):0;
  const sym=currSym();
function renderStatsRow() {
  const settings = S.settings || {};
  const show = {
    total: document.getElementById('s-stat-total') ? document.getElementById('s-stat-total').checked : (settings.statTotal !== false),
    value: document.getElementById('s-stat-value') ? document.getElementById('s-stat-value').checked : (settings.statValue !== false),
    avg:   document.getElementById('s-stat-avg')   ? document.getElementById('s-stat-avg').checked   : (settings.statAvg   !== false),
    top:   document.getElementById('s-stat-top')   ? document.getElementById('s-stat-top').checked   : (settings.statTop   !== false),
  };
  const cards = [
    show.total ? '<div class="stat-card"><div class="stat-label">Total books</div><div class="stat-val" id="statTotal">—</div></div>' : '',
    show.value ? '<div class="stat-card"><div class="stat-label">Total value</div><div class="stat-val" id="statValue">—</div></div>' : '',
    show.avg   ? '<div class="stat-card"><div class="stat-label">Avg. price</div><div class="stat-val" id="statAvg">—</div></div>' : '',
    show.top   ? '<div class="stat-card"><div class="stat-label">Highest</div><div class="stat-val" id="statTop">—</div></div>' : '',
  ].filter(Boolean).join('');
  const row = document.getElementById('statsRow');
  if (row) row.innerHTML = cards;
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
  if(!books.length){grid.innerHTML='<div class="empty-state"><div class="empty-icon">📚</div><p>No books match your filters.</p></div>';return;}
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
  document.getElementById('statTotal') && (document.getElementById('statTotal').textContent=groupMap.size+' / '+S.books.length);

  // Badge count: active + wishlist + draft (not sold)
  const badgeCount = copies => copies.filter(b => b.sold !== 'Sold').length;

  // Representative copy: best condition non-sold, else first
  const condOrder = ['Fine','Very Good','Good','Fair'];
  const repCopy = copies => {
    const active = copies.filter(b => b.sold !== 'Sold');
    if (!active.length) return copies[0];
    return active.sort((a,b2) => condOrder.indexOf(a.condition) - condOrder.indexOf(b2.condition))[0];
  };

  grid.innerHTML = [...groupMap.values()].map(copies => {
    const b = repCopy(copies);
    const idx = S.books.indexOf(b);
    const hasCover = b.coverUrl && b.coverUrl !== '__local__';
    const isSold = b.sold === 'Sold';
    const count = badgeCount(copies);
    const totalCopies = copies.length;
    const isGrouped = totalCopies > 1;
    const thumbHtml = hasCover
      ? `<img src="${b.coverUrl}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'" loading="lazy"/>`
      : `<span>${b.coverUrl==='__local__'?'📷':'📖'}</span>`;
    const clickHandler = isGrouped
      ? `openCopiesSheet('${groupKey(b).replace(/'/g,"\\'")}')` 
      : `openModal(${idx})`;
    return `<div class="book-card${isSold&&!isGrouped?' is-sold':''}${b.sold==='Wishlist'&&!isGrouped?' is-wishlist':''}${b.draft==='Draft'&&!isGrouped?' is-draft':''}" onclick="${clickHandler}" style="position:relative;">
      <div class="book-cover">
        ${hasCover?`<img src="${b.coverUrl}" alt="${b.title}" style="display:block" onerror="this.style.display='none';this.nextSibling.style.display='flex'">`:''}<div class="book-cover-ph" style="${hasCover?'display:none':''}"><p>${b.coverUrl==='__local__'?'📷':''}</p><p style="margin-top:4px">${b.title}</p></div>
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
        <div class="book-meta-row"><span class="book-condition-badge ${condClasses[b.condition]||'cond-good'}">${b.condition||'—'}</span><span class="book-price-text">${(b.price&&!isNaN(parseFloat(b.price)))?sym+parseFloat(b.price).toFixed(0):'—'}</span>${!isGrouped&&b.sold==='Wishlist'?'<span class="wishlist-badge">Wishlist</span>':''}${!isGrouped&&b.draft==='Draft'?'<span class="draft-badge">Draft</span>':''}</div>
        ${b.star&&parseInt(b.star)>0&&!isGrouped?`<div class="star-row">${[1,2,3,4,5].map(n=>`<span class="star${parseInt(b.star)>=n?' lit':''}">★</span>`).join('')}</div>`:''}
      </div>
    </div>`;
  }).join('');
}
function filterCatalog(){renderCatalog();}
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
          ${isWishlist?'<span class="wishlist-badge" style="margin-left:0;">Wishlist</span>':''}
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
function openModal(idx){
  S.currentModalIdx=idx;
  const b=S.books[idx];if(!b)return;
  const sym=currSym();S.currentModalUrl=buildEbayUrl(b.title,b.author);
  document.getElementById('modalTitle').textContent=b.title;
  const modalCoverSrc = b.rawCover || b.coverUrl || '';
  document.getElementById('modalBody').innerHTML=`
    <div style="display:flex;flex-direction:column;align-items:stretch;padding:20px 20px 0;">
      <div class="modal-cover" style="width:140px;height:185px;cursor:${modalCoverSrc?'zoom-in':'default'};margin-bottom:14px;border-radius:8px;overflow:hidden;border:0.5px solid var(--border);flex-shrink:0;background:var(--paper-warm);align-self:center;" onclick="${modalCoverSrc?'openZoom(\''+modalCoverSrc.replace(/'/g,"\\'")+'\')':''}">
        ${modalCoverSrc?`<img src="${modalCoverSrc}" alt="${b.title}" style="width:100%;height:100%;object-fit:contain;display:block;" onerror="this.style.display='none'">`:
        `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:36px;opacity:0.15;">📖</div>`}
      </div>
      <div style="font-family:'Playfair Display',serif;font-size:17px;font-weight:600;color:var(--ink);text-align:center;line-height:1.35;margin-bottom:5px;padding:0 4px;">${b.title}</div>
      <div style="font-size:13px;color:var(--ink-light);text-align:center;margin-bottom:10px;">${b.author||''}${b.artist?` · <span style="color:var(--ink-faint)">${b.artist}</span>`:''}</div>
      <div style="display:flex;align-items:center;gap:10px;align-self:center;margin-bottom:${b.flags?'6px':'14px'};flex-wrap:wrap;justify-content:center;">
        ${b.condition?`<span style="background:var(--accent-light);color:var(--accent);font-size:10px;font-weight:600;padding:4px 10px;border-radius:5px;letter-spacing:0.03em;">${b.condition}</span>`:''}
        ${(b.price&&!isNaN(parseFloat(b.price)))?`<span style="font-size:20px;font-weight:700;color:var(--ink);letter-spacing:-0.02em;">${sym}${parseFloat(b.price).toFixed(0)}</span>`:''}
      </div>
      ${b.flags?`<div style="font-size:11px;color:var(--ink-faint);text-align:center;margin-bottom:14px;line-height:1.5;">${b.flags}</div>`:''}
      <div style="display:flex;align-items:center;gap:4px;margin-bottom:4px;align-self:center;">
        <span style="font-size:11px;color:var(--ink-faint);margin-right:2px;">Rating</span>
        <div id="modalStarRow" class="star-row" style="margin-top:0;"></div>
      </div>
    </div>
    <div style="width:100%;border-top:0.5px solid var(--border);margin-top:14px;display:grid;grid-template-columns:1fr 1fr;">
      ${b.publisher?`<div style="padding:14px 20px;text-align:center;border-right:0.5px solid var(--border);border-bottom:0.5px solid var(--border);"><div style="font-size:9px;font-weight:600;color:var(--ink-faint);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:3px;">Publisher</div><div style="font-size:13px;color:var(--ink);line-height:1.4;">${b.publisher}</div></div>`:''}
      ${b.year?`<div style="padding:14px 20px;text-align:center;border-bottom:0.5px solid var(--border);"><div style="font-size:9px;font-weight:600;color:var(--ink-faint);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:3px;">Published</div><div style="font-size:13px;color:var(--ink);">${b.year}</div></div>`:''}
      ${b.dateAdded?`<div style="padding:14px 20px;text-align:center;border-right:0.5px solid var(--border);"><div style="font-size:9px;font-weight:600;color:var(--ink-faint);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:3px;">Added</div><div style="font-size:13px;color:var(--ink);">${b.dateAdded}</div></div>`:''}
      ${b.location?`<div style="padding:14px 20px;text-align:center;"><div style="font-size:9px;font-weight:600;color:var(--ink-faint);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:3px;">Acquired</div><div style="font-size:13px;color:var(--ink);">${b.location}</div></div>`:''}
    </div>
    ${b.collectorNote?`<div style="margin:0;padding:14px 20px;border-top:0.5px solid var(--border);background:var(--paper-warm);"><div style="font-size:9px;font-weight:600;color:var(--gold);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:5px;">Collector\'s note</div><div style="font-size:13px;color:var(--ink-light);font-style:italic;line-height:1.6;">${b.collectorNote}</div></div>`:''}
`;
  // Set sold/wishlist button labels
  const soldBtn = document.getElementById('modalSoldBtn');
  if (soldBtn) soldBtn.textContent = (b.sold === 'Sold') ? 'Return to Library' : 'Mark Sold';
  const wishBtn = document.getElementById('modalWishlistBtn');
  if (wishBtn) wishBtn.textContent = (b.sold === 'Wishlist') ? 'In Wishlist ✓' : '+ Wishlist';
  // Render star rating
  renderModalStars(b);
  // If draft, open in Add form instead
  if (b.draft === 'Draft') { openDraftActions(idx); return; }
  document.getElementById('modalOverlay').classList.remove('hidden');
}
function openEbayModal(){
  // Use location.href on mobile to avoid white-screen-on-back issue
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (isMobile) { window.location.href = S.currentModalUrl; }
  else { window.open(S.currentModalUrl, '_blank'); }
}
function closeModal(e){if(!e||e.target===document.getElementById('modalOverlay')||!e.target)document.getElementById('modalOverlay').classList.add('hidden');}

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
    showStatus('⚠ Enter your Cloud Name and Upload Preset above first.', false);
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
  document.getElementById('coverPickerResults').innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--ink-faint);font-size:13px;">Select a source above to search for covers</div>';
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
}
function openCoverPicker() {
  S.coverPickerTarget = 'add';
  resetPickerState();
  document.getElementById('coverPickerOverlay').classList.remove('hidden');
}
function openCoverPickerForEdit() {
  S.coverPickerTarget = 'edit';
  resetPickerState();
  document.getElementById('coverPickerOverlay').classList.remove('hidden');
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
      // Try local database first — instant, no network call
      const localUrl = lookupConjuringCover(title);
      if (localUrl) {
        images.push({ url: localUrl, label: title + ' (local DB match)', source: 'Local Database' });
        statusEl.textContent = 'Found in local database — also checking online…';
      }
      const q = encodeURIComponent(title);
      const searchUrl = 'https://www.conjuringarchive.com/list/search?q=' + q;
      statusEl.textContent = localUrl ? 'Found locally + checking online…' : 'Searching local database…';
      const resp = await fetch('/api/fetch-proxy?action=fetch&url=' + encodeURIComponent(searchUrl));
      const data = await resp.json();
      if (!data.success) throw new Error(data.error || 'Fetch failed');
      const linkMatches = [...data.html.matchAll(/href="(\/list\/medium\/\d+)"/gi)];
      const uniqueLinks = [...new Set(linkMatches.map(m => m[1]))].slice(0, 6);
      statusEl.textContent = 'Found ' + uniqueLinks.length + ' results, loading covers…';
      for (const link of uniqueLinks) {
        try {
          const dr = await fetch('/api/fetch-proxy?action=fetch&url=' + encodeURIComponent('https://www.conjuringarchive.com' + link));
          const dd = await dr.json();
          if (dd.success) {
            const patterns = [
              /src="([^"]*\/media\/image\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i,
              /src="([^"]*\/images\/[^"]+\.(?:jpg|jpeg|png))"[^>]*(?:class|alt)="[^"]*(?:cover|book)[^"]*"/i,
            ];
            for (const pat of patterns) {
              const m = dd.html.match(pat);
              if (m) {
                let src = m[1].startsWith('http') ? m[1] : 'https://www.conjuringarchive.com' + m[1];
                if (!images.find(i => i.url === src)) {
                  const titleM = dd.html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
                  images.push({ url: src, label: titleM ? titleM[1].trim() : 'Local Database', source: 'Local Database' });
                }
                break;
              }
            }
          }
        } catch(e2) {}
      }
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
      '<img src="' + img.url + '" style="width:100%;aspect-ratio:2/3;object-fit:cover;display:block;" onerror="this.parentElement.style.display=\'none\'" loading="lazy"/>' +
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
  const scrollTarget = vc || window;

  const onScroll = () => {
    const scrollY = vc ? vc.scrollTop : (window.scrollY || document.documentElement.scrollTop);
    if (scrollY > 300) {
      btn.style.opacity = '0.4';
      btn.style.pointerEvents = 'auto';
    } else {
      btn.style.opacity = '0';
      btn.style.pointerEvents = 'none';
    }
  };

  scrollTarget.addEventListener('scroll', onScroll, { passive: true });
}
