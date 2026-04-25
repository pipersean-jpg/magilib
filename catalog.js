function downloadCSVTemplate() {
  const headers = ['Title','Author','Artist/Subject','Edition','Year','Publisher','ISBN','Condition','Market Price','Purchase Price','Notes','Cover URL','Date Added','Condition Flags','Sold Status','Star Rating','Collector Note','Where Acquired','Draft'];
  const rows = [headers].map(function(r) {
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
      if (a) row.author = toTitleCase(normalizeConjuringAuthor(a));
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
  const skippedCount = (allRows.length - 1) - dataRows.length;
  const resultCard = document.getElementById('csvImportResult');
  const resultContent = document.getElementById('csvImportResultContent');
  if (resultCard && resultContent) {
    resultContent.innerHTML = '<span style="color:var(--ink-faint);">Saving ' + dataRows.length + ' book' + (dataRows.length !== 1 ? 's' : '') + '…</span>';
    resultCard.style.display = 'block';
  }
  if (btn) btn.textContent = 'Saving…';
  let imported = 0;
  let failed = 0;
  for (let i = 0; i < dataRows.length; i += 100) {
    const chunk = dataRows.slice(i, i + 100);
    const { error } = await _supa.from('books').insert(chunk);
    if (!error) {
      imported += chunk.length;
    } else {
      console.error('Import chunk error:', error);
      // Retry row-by-row so we know exactly which rows failed
      for (let j = 0; j < chunk.length; j++) {
        if (resultContent) resultContent.innerHTML = '<span style="color:var(--ink-faint);">Saving ' + (imported + j + 1) + ' of ' + dataRows.length + '…</span>';
        const { error: rowErr } = await _supa.from('books').insert([chunk[j]]);
        if (!rowErr) imported++;
        else failed++;
      }
    }
  }

  if (btn) { btn.disabled=false; btn.textContent='Upload CSV'; }
  event.target.value='';

  // ── Static result card (stays open until user dismisses) ──
  if (resultContent) {
    const lines = [];
    if (imported > 0) lines.push('<span style="color:#16a34a;">✓ ' + imported + ' book' + (imported !== 1 ? 's' : '') + ' imported</span>');
    if (skippedCount > 0) lines.push('<span style="color:var(--ink-faint);">— ' + skippedCount + ' row' + (skippedCount !== 1 ? 's' : '') + ' skipped (no title)</span>');
    if (failed > 0) lines.push('<span style="color:#b91c1c;">✗ ' + failed + ' row' + (failed !== 1 ? 's' : '') + ' failed — check details in browser console</span>');
    if (enriched > 0) lines.push('<span style="color:var(--ink-faint);">· ' + enriched + ' enriched from local database</span>');
    resultContent.innerHTML = lines.join('<br>');
  }
  if (resultCard) resultCard.style.display = 'block';

  if (failed > 0) showToast('Import complete — ' + failed + ' failed', 'error', 4000);
  else showToast('Imported ' + imported + ' book' + (imported !== 1 ? 's' : '') + ' ✓', 'success', 3000);
  loadCatalog();
}
function updatePriceLabels(cur) {
  const c = cur || (S.settings && S.settings.currency) || 'AUD';
  const el = id => document.getElementById(id);
  if(el('priceLabelAdd'))  el('priceLabelAdd').textContent  = 'Market price estimate (' + c + ') *';
  if(el('costLabelAdd'))   el('costLabelAdd').textContent   = 'Purchase price (' + c + ')';
  if(el('priceLabelEdit')) el('priceLabelEdit').textContent = 'Market Price (' + c + ')';
  if(el('costLabelEdit'))  el('costLabelEdit').textContent  = 'Purchase Price (' + c + ')';
  if(el('wl-price'))       el('wl-price').placeholder       = 'Price (' + c + ')';
}
function loadSettings(){
  try{
    const s=JSON.parse(localStorage.getItem('arcana_books_v2')||'{}');
    S.settings=s;
    if(s.currency){const el=document.getElementById('s-currency');if(el)el.value=s.currency;const cl=document.getElementById('currencyLabel');if(cl)cl.textContent=s.currency;}
    if(s.marketplace){ const el=document.getElementById('s-marketplace'); if(el) el.value=s.marketplace; }
    const condDefs = { fine:100, vg:80, good:60, fair:40 };
    for(const [k,def] of Object.entries(condDefs)){
      const el=document.getElementById('s-cond-'+k);
      if(el) el.value = s['condPct_'+k] !== undefined ? s['condPct_'+k] : def;
    }
    updatePriceLabels(s.currency);
  }catch(e){ console.warn('loadSettings error:', e); }
}
function saveSettings(skipCurrencyGuard){
  let existing = {};
  try { existing = JSON.parse(localStorage.getItem('arcana_books_v2')||'{}'); } catch(e){}
  const getVal   = id => { const el=document.getElementById(id); return el ? el.value.trim() : ''; };
  const getCheck = id => { const el=document.getElementById(id); return el ? el.checked : true; };
  const getNum   = (id, def) => { const el=document.getElementById(id); return el && el.value !== '' ? parseInt(el.value, 10) : def; };
  const currency = getVal('s-currency') || existing.currency || 'AUD';

  // Currency change guard: if the user has books and is switching currency,
  // require explicit confirmation to prevent silent mixed-currency data corruption.
  if (!skipCurrencyGuard && existing.currency && currency !== existing.currency && S.books && S.books.length > 0) {
    magiConfirm({
      title: 'Change currency?',
      message: 'You have ' + S.books.length + ' book' + (S.books.length === 1 ? '' : 's') + ' with prices stored in ' + existing.currency + '. Changing to ' + currency + ' will not convert existing prices — they will display incorrectly until updated manually.',
      confirmText: 'Change Anyway',
      onConfirm: function() { saveSettings(true); }
    });
    // Revert the dropdown to the current saved currency so the UI doesn't jump
    const currEl = document.getElementById('s-currency');
    if (currEl) currEl.value = existing.currency || 'AUD';
    return;
  }

  const s = {
    currency,
    marketplace:  getVal('s-marketplace') || existing.marketplace || 'EBAY_AU',
    statTotal:    getCheck('s-stat-total'),
    statValue:    getCheck('s-stat-value'),
    statAvg:      getCheck('s-stat-avg'),
    statTop:      getCheck('s-stat-top'),
    wizardSeen:   existing.wizardSeen || false,
    condPct_fine: getNum('s-cond-fine', 100),
    condPct_vg:   getNum('s-cond-vg',   80),
    condPct_good: getNum('s-cond-good',  60),
    condPct_fair: getNum('s-cond-fair',  40),
  };
  S.settings = s;
  try { localStorage.setItem('arcana_books_v2', JSON.stringify(s)); } catch(e){}
  const cl = document.getElementById('currencyLabel');
  if(cl) cl.textContent = currency;
  updatePriceLabels(currency);
  const curWarn = document.getElementById('currencyChangeWarning');
  if (curWarn) curWarn.style.display = (existing.currency && currency !== existing.currency) ? 'block' : 'none';
  showToast('Settings saved ✓', 'success', 1500);
}
function showView(v){
  if(v!=='entry'){
    const entryActive=document.getElementById('view-entry');
    if(entryActive&&entryActive.classList.contains('active')){
      const titleVal=(document.getElementById('f-title')||{value:''}).value.trim();
      const authorVal=(document.getElementById('f-author')||{value:''}).value.trim();
      if(photoQueue.length>0||titleVal||authorVal){
        magiConfirm({title:'Leave this page?',message:'You have unsaved entries. Your progress will be lost.',confirmText:'Leave page',onConfirm:()=>{clearForm();_doShowView(v);}});
        return;
      }
    }
  }
  _doShowView(v);
}
function _doShowView(v){
  document.querySelectorAll('.view').forEach(el=>el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el=>el.classList.remove('active'));
  // Update bottom nav active state
  document.querySelectorAll('.bn-tab').forEach(el=>el.classList.remove('active'));
  const bnMap={home:'bn-home',catalog:'bn-catalog',entry:'bn-entry',wishlist:'bn-wishlist',settings:'bn-settings'};
  const _bnTab=document.getElementById(bnMap[v]);
  if(_bnTab)_bnTab.classList.add('active');
  // Update top nav tabs (desktop)
  const tabs={home:-1,entry:0,catalog:1,wishlist:2,settings:3};
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
    S.viewMode=S.wishlistViewMode||'list';
    const _vbW=document.getElementById('viewToggleBtn');
    if(_vbW)_vbW.textContent=S.viewMode==='grid'?'⊞':'☰';
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
    if(v==='catalog'){
      S.viewMode=S.catalogViewMode||'grid';
      const _vbC=document.getElementById('viewToggleBtn');
      if(_vbC)_vbC.textContent=S.viewMode==='grid'?'⊞':'☰';
      loadCatalog();
    }
    if(v==='home')renderHomeView();
    if(v==='entry'){
      window.scrollTo(0,0);
      document.body.scrollTop=0;
      document.documentElement.scrollTop=0;
      setTimeout(()=>{window.scrollTo(0,0);document.body.scrollTop=0;document.documentElement.scrollTop=0;},50);
    }
  }
}

const MAGIC_FACTS = [
  "The oldest known magic text is the Westcar Papyrus (c.1600 BC), describing Egyptian court magicians performing miracles before the Pharaoh.",
  "Houdini's personal library contained over 5,000 volumes on magic and spiritualism — one of the largest collections ever assembled by a performer.",
  "The Expert at the Card Table (1902) was published anonymously. S.W. Erdnase was never definitively identified despite over a century of research.",
  "Jean Eugène Robert-Houdin, often called the 'father of modern magic', pioneered the use of science and technology to create seemingly impossible illusions in the 1840s.",
  "The magic book Conjuring with Cards (1894) by Paul Valadon is so rare that fewer than 10 copies are known to survive worldwide.",
  "Vernon's The Dai Vernon Book of Magic (1957) changed card magic forever — it documented techniques so refined they became the foundation of modern sleight of hand.",
  "The Linking Ring, the official publication of the International Brotherhood of Magicians, has been published continuously since 1923.",
  "Edwin Sachs' Sleight of Hand (1877) was the first comprehensive English-language text on sleight of hand magic and is still reprinted today.",
  "Card College by Roberto Giobbi took 20 years to write and is considered the most thorough treatment of card technique ever published.",
  "The conjuring archive at the Library of Congress holds over 12,000 items related to magic, making it one of the largest institutional magic collections in the world.",
  "Tarbell Course in Magic began as a mail-order course in 1927 and eventually expanded to 8 volumes — one of the most comprehensive magic curricula ever created.",
  "Strong Magic by Darwin Ortiz (1994) shifted how magicians think about performance — arguing that technique is secondary to making the audience feel genuine wonder.",
];

function renderHomeView(){
  const lib=S.books.filter(b=>b.sold!=='Sold'&&b.sold!=='Wishlist');
  const wishlist=S.books.filter(b=>b.sold==='Wishlist');
  const totalVal=lib.reduce((sum,b)=>{const p=parseFloat(b.price)||0;return sum+p;},0);
  const cur=(S.settings&&S.settings.currency)||'AUD';
  const sym={'AUD':'A$','USD':'$','GBP':'£','EUR':'€','JPY':'¥'}[cur]||cur+' ';
  // Stats
  const el=id=>document.getElementById(id);
  if(el('homeStatBooks'))el('homeStatBooks').textContent=lib.length||'0';
  if(el('homeStatValue'))el('homeStatValue').textContent=totalVal>0?(sym+Math.round(totalVal).toLocaleString()):'—';
  if(el('homeStatWishlist'))el('homeStatWishlist').textContent=wishlist.length||'0';
  // Greeting
  const name=(S.profile&&S.profile.username)||(S.settings&&S.settings.displayName)||'Collector';
  if(el('homeGreeting'))el('homeGreeting').textContent='Welcome back, '+name+'.';
  if(el('homeGreetingSub')){
    if(lib.length===0){
      el('homeGreetingSub').textContent='Your magic library awaits — add your first book!';
    } else {
      el('homeGreetingSub').textContent='You have '+lib.length+' book'+(lib.length===1?'':'s')+' in your collection.';
    }
  }
  // Magic fact — rotate each time Home is viewed
  if(el('homeMagicFact')){
    (async()=>{
      let facts=MAGIC_FACTS;
      try{
        const{data}=await _supa.from('magic_facts').select('fact');
        if(data&&data.length)facts=[...MAGIC_FACTS,...data.map(r=>r.fact)];
      }catch(e){}
      el('homeMagicFact').textContent=facts[Math.floor(Math.random()*facts.length)];
    })();
  }
  // Recent books (last 5)
  const row=el('homeRecentRow');
  if(row){
    const recent=lib.slice(0,5);
    if(recent.length===0){
      row.innerHTML='<div class="home-empty-recent">No books yet — add your first one below.</div>';
    } else {
      row.innerHTML=recent.map(b=>{
        const cover=b.coverUrl?`<img class="home-recent-cover" src="${sanitize(b.coverUrl)}" loading="lazy" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="home-recent-cover" style="display:none;align-items:center;justify-content:center;color:var(--ink-faint);font-size:20px;">📖</div>`
          :`<div class="home-recent-cover" style="display:flex;align-items:center;justify-content:center;color:var(--ink-faint);font-size:20px;">📖</div>`;
        return `<div class="home-recent-book" onclick="openBookFromHome('${sanitize(b._id)}')">${cover}<div class="home-recent-title">${sanitize(b.title)}</div></div>`;
      }).join('');
    }
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
  _applyConditionAdjustment();
}
function _applyConditionAdjustment(){
  if(!S.priceBase)return;
  if(S._priceUserEdited)return;
  const pct=getConditionPct(S.condition);
  const adjusted=Math.round(S.priceBase*pct);
  const priceEl=document.getElementById('f-price');
  if(priceEl)priceEl.value=adjusted;
  const hint=document.getElementById('condAdjHintAdd');
  if(hint){
    const sym=currSym();
    hint.textContent='Base '+sym+S.priceBase+' × '+Math.round(pct*100)+'% ('+S.condition+') = '+sym+adjusted;
    hint.style.display='block';
  }
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
  document.getElementById('scanDetail').textContent='Reading title, author, and edition from your photo.';

  try{
    const data=await callClaude([{role:'user',content:[
      {type:'image',source:{type:'base64',media_type:'image/jpeg',data:b64}},
      {type:'text',text:'You are a bibliographic expert specialising in magic and conjuring books. Extract all metadata visible on this book cover. Reply ONLY with valid JSON, no markdown: {"title":"","author":"","artist":"","edition":"","year":"","publisher":"","isbn":"","confidence":"high|medium|low","fields_found":[],"notes":""}'}
    ]}],600);
    const json=JSON.parse(data.content[0].text.replace(/```json|```/g,'').trim());
    const fields=[{id:'f-title',val:json.title},{id:'f-author',val:json.author},{id:'f-artist',val:json.artist||''},{id:'f-edition',val:json.edition},{id:'f-year',val:json.year},{id:'f-publisher',val:json.publisher}];
    let populated=0;
    fields.forEach(f=>{if(f.val&&f.val.trim()){const el=document.getElementById(f.id);if(!el)return;el.value=toTitleCase(f.val.trim());el.classList.add('field-populated');setTimeout(()=>el.classList.remove('field-populated'),3000);populated++;}});
    const confClass={high:'conf-high',medium:'conf-med',low:'conf-low'}[json.confidence]||'conf-med';
    statusEl.className='scan-status done';
    document.getElementById('scanIcon').innerHTML='<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    document.getElementById('scanTitle').innerHTML=`${populated} fields extracted <span class="confidence-badge ${confClass}">${json.confidence} confidence</span>`;
    document.getElementById('scanDetail').textContent=json.notes||'Please verify the details below before saving.';
    // Strip subtitle (anything after : or —) for DB/price lookups to improve match rate
    const searchTitle = json.title ? json.title.replace(/\s*[:—–].*$/, '').trim() : json.title;
    if(json.title&&json.author){setTimeout(()=>fetchPrice(),800);setTimeout(()=>fetchBookIntelligence(searchTitle,json.author),1500);}
    if(searchTitle){
      // Try fuzzy match against Conjuring Archive DB immediately after scan
      setTimeout(async () => {
        const match = conjuringFuzzyLookup(searchTitle);
        if (match) {
          await applyConjuringMatch(match, 'scan');
        } else {
          checkConjuringDB(searchTitle); // fall back to exact match display
        }
      }, 300);
    }
  }catch(err){
    statusEl.className='scan-status error';
    document.getElementById('scanIcon').innerHTML='<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    document.getElementById('scanTitle').textContent='Scan failed';
    document.getElementById('scanDetail').textContent=(err&&err.message)||'Could not read the cover. Please fill in details manually.';
  }
}

async function searchCover(){
  const title=document.getElementById('f-title').value.trim();
  const author=document.getElementById('f-author').value.trim();
  const isbnEl=document.getElementById('f-isbn');
  const isbn=isbnEl?isbnEl.value.trim():'';
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

let _catalogLoading = false;

async function loadCatalog(){
  if (_catalogLoading) return;
  _catalogLoading = true;
  const grid=document.getElementById('booksGrid');
  initScrollTopBtn();
  grid.innerHTML='<div class="catalog-loading"><span class="spinner dark"></span> Loading...</div>';
  if (!_supaUser) { grid.innerHTML=''; _catalogLoading = false; return; }
  try{
    const { data, error } = await _supa.from('books').select('*').eq('user_id', _supaUser.id).order('created_at', { ascending: false });
    if (error) throw error;
    S.books = (data || []).map(row => {
      const { notes, inPrint: notesInPrint } = parseInPrintFromNotes(row.notes || '');
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
        priceCurrency: row.price_currency || '',
        priceUpdatedAt: row.price_updated_at || '',
        cost: row.purchase_price != null ? String(row.purchase_price) : '',
        notes,
        coverUrl: row.cover_url || '',
        rawCover: row.cover_url || '',
        dateAdded: row.date_added || '',
        createdAt: row.created_at || '',
        flags: row.condition_flags || '',
        sold: row.sold_status || '',
        star: row.star_rating != null ? String(row.star_rating) : '',
        collectorNote: row.collectors_note || '',
        location: row.where_acquired || '',
        draft: row.draft_status || '',
        inPrint: row.in_print !== null && row.in_print !== undefined ? row.in_print : notesInPrint,
      };
    });
    // Cache rows in IndexedDB for offline access (fire-and-forget).
    _idbSaveBooks(_supaUser.id, data || []);
    renderCatalog();
    if(document.getElementById('view-home')&&document.getElementById('view-home').classList.contains('active'))renderHomeView();
    showToast('Loaded '+S.books.length+' books','success',2000);
    enrichCoversFromCatalog();
  }catch(e){
    console.error('Catalog load error:',e);
    // Offline fallback: serve cached books from IndexedDB.
    if (!navigator.onLine) {
      try {
        const cached = await _idbLoadBooks(_supaUser.id);
        if (cached && cached.length > 0) {
          S.books = cached.map(row => {
            const { notes, inPrint: notesInPrint } = parseInPrintFromNotes(row.notes || '');
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
              priceCurrency: row.price_currency || '',
              priceUpdatedAt: row.price_updated_at || '',
              cost: row.purchase_price != null ? String(row.purchase_price) : '',
              notes,
              coverUrl: row.cover_url || '',
              rawCover: row.cover_url || '',
              dateAdded: row.date_added || '',
              createdAt: row.created_at || '',
              flags: row.condition_flags || '',
              sold: row.sold_status || '',
              star: row.star_rating != null ? String(row.star_rating) : '',
              collectorNote: row.collectors_note || '',
              location: row.where_acquired || '',
              draft: row.draft_status || '',
              inPrint: row.in_print !== null && row.in_print !== undefined ? row.in_print : notesInPrint,
            };
          });
          renderCatalog();
          showToast('Offline \u2014 showing cached library', 'info', 4000);
          return;
        }
      } catch(idbErr) {
        console.warn('[MagiLib] IDB fallback failed:', idbErr);
      }
    }
    grid.innerHTML='<div class="empty-state"><div class="empty-icon"><svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div><p>'+e.message+'</p><button onclick="loadCatalog()">Retry</button></div>';
  } finally {
    _catalogLoading = false;
  }
}
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

function renderCatalog(){
  renderStatsRow();
  // Filter status strip
  const _fs = document.getElementById('filterStatus');
  if (_fs) {
    if (S.showDrafts) {
      _fs.style.display = 'block';
      _fs.style.color = 'var(--status-draft)';
      _fs.textContent = '▸ Showing Drafts';
    } else if (S.showSold) {
      _fs.style.display = 'block';
      _fs.style.color = 'var(--status-sold)';
      _fs.textContent = '▸ Showing Sold';
    } else {
      _fs.style.display = 'none';
    }
  }
  const search=(document.getElementById('catalogSearch').value||'').trim();
  const cond=S.filterCondition||'all';
  const pub=(document.getElementById('filterPublisher')||{}).value||'';

  // Fuzzy search via Fuse.js (if loaded and query present)
  let fuzzyMatched = null;
  let _fuseOrder = null;
  if(search && typeof Fuse !== 'undefined'){
    const fuse = new Fuse(S.books, {
      keys: [
        { name: 'title', weight: 3 },
        { name: 'author', weight: 2 },
        { name: 'publisher', weight: 0.5 },
      ],
      threshold: 0.25,
      ignoreLocation: true,
      includeScore: true,
    });
    const _fuseResults = fuse.search(search);
    fuzzyMatched = new Set(_fuseResults.map(r => r.item));
    _fuseOrder = new Map(_fuseResults.map((r, i) => [r.item, i]));
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
  // Sort — when searching rank by relevance, otherwise use selected sort
  if (search && _fuseOrder) {
    books = books.sort((a, b2) => (_fuseOrder.get(a) ?? 9999) - (_fuseOrder.get(b2) ?? 9999));
  } else {
    const sort=S.sortBy||'dateAdded';
    const dir=S.sortDir||'desc';
    books=[...books].sort((a,b2)=>{
      const normSort = s => (s||'').toLowerCase().trim().replace(/^(the|a|an)\s+/i,'').trim();
      if(sort==='title') return dir==='asc'?normSort(a.title).localeCompare(normSort(b2.title)):normSort(b2.title).localeCompare(normSort(a.title));
      if(sort==='author') return dir==='asc'?normSort(a.author).localeCompare(normSort(b2.author)):normSort(b2.author).localeCompare(normSort(a.author));
      if(sort==='price') return dir==='asc'?(parseFloat(a.price)||0)-(parseFloat(b2.price)||0):(parseFloat(b2.price)||0)-(parseFloat(a.price)||0);
      if(sort==='year') return dir==='asc'?(parseInt(a.year)||0)-(parseInt(b2.year)||0):(parseInt(b2.year)||0)-(parseInt(a.year)||0);
      if(sort==='star') return dir==='asc'?(parseInt(a.star)||0)-(parseInt(b2.star)||0):(parseInt(b2.star)||0)-(parseInt(a.star)||0);
      const parseTs=b=>b.createdAt?new Date(b.createdAt).getTime():(b.dateAdded?new Date(b.dateAdded).getTime():0);
      const da=parseTs(a), db=parseTs(b2);
      if(da!==db) return dir==='asc'?da-db:db-da;
      const ia=S.books.indexOf(a), ib=S.books.indexOf(b2);
      return dir==='asc'?ia-ib:ib-ia;
    });
  }
  // Price source: wishlist uses the filtered wishlist set; normal view excludes sold/wishlist/drafts
  const priceSrc=S.showWishlist?books:books.filter(b=>b.sold!=='Sold'&&b.sold!=='Wishlist'&&b.draft!=='Draft');
  const prices=priceSrc.map(b=>parseFloat(b.price)||0).filter(p=>p>0&&p<50000);
  const totalVal=prices.reduce((a,b2)=>a+b2,0);
  const avg=prices.length?totalVal/prices.length:0;
  const top=prices.length?Math.max(...prices):0;
  const sym=currSym();

  const sectionTotal = S.showWishlist
    ? S.books.filter(b => b.sold === 'Wishlist').length
    : S.showDrafts
      ? S.books.filter(b => b.draft === 'Draft').length
      : S.showSold
        ? S.books.filter(b => b.sold === 'Sold').length
        : S.books.filter(b => b.sold !== 'Sold' && b.sold !== 'Wishlist' && b.draft !== 'Draft').length;
  document.getElementById('statTotal') && (document.getElementById('statTotal').textContent='— / '+sectionTotal);
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
    if (!S.books.length) {
      grid.innerHTML = `<div class="empty-search-container"><div class="empty-icon"><svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg></div><p style="font-weight:600;margin-bottom:6px;">Your library is empty</p><p style="font-size:13px;margin-top:0;">Tap <strong>Add</strong> in the menu to add your first book.</p></div>`;
    } else {
      let msg;
      if (search) msg = `No results for \u201c${search}\u201d`;
      else if (S.showDrafts) msg = 'No drafts found.';
      else if (S.showSold) msg = 'No sold books found.';
      else msg = 'No books match your filters.';
      const clearBtn = search ? `<button class="btn-ghost" onclick="clearSearch()">Clear search</button>` : '';
      grid.innerHTML = `<div class="empty-search-container"><div class="empty-icon"><svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg></div><p>${msg}</p>${clearBtn}</div>`;
    }
    updateFilterBtn();
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
  document.getElementById('statTotal') && (document.getElementById('statTotal').textContent=groupMap.size+' / '+sectionTotal);

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
      ? `<img src="${effectiveCover}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'" loading="lazy" decoding="async"/>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" style="opacity:0.4;color:var(--ink-faint)"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`;
    const isSelected = S.selectMode && S.selectedBooks.has(b._id);
    // Adaptive duplicate badge: icon-only in card view, icon+text in list view
    const dupBadge = inLibrary
      ? (isListView
          ? '<span style="display:inline-flex;align-items:center;gap:3px;background:var(--tier3-bg);color:var(--tier3);font-size:9px;font-weight:600;padding:2px 6px;border-radius:10px;margin-left:4px;white-space:nowrap;"><svg xmlns=\'http://www.w3.org/2000/svg\' width=\'9\' height=\'9\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'currentColor\' stroke-width=\'2.5\' stroke-linecap=\'round\'><path d=\'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z\'/></svg> In Library</span>'
          : '<span style="display:inline-flex;align-items:center;margin-left:3px;color:var(--tier3);" title="Already in Library"><svg xmlns=\'http://www.w3.org/2000/svg\' width=\'11\' height=\'11\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'currentColor\' stroke-width=\'2\' stroke-linecap=\'round\'><path d=\'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z\'/></svg></span>')
      : '';
    return `<div class="book-card${isSold&&!isGrouped?' is-sold':''}${b.sold==='Wishlist'&&!isGrouped?' is-wishlist':''}${b.draft==='Draft'&&!isGrouped?' is-draft':''}${isSelected?' is-selected':''}" data-id="${b._id}" data-idx="${idx}"${isGrouped?` data-grouped="1" data-group-key="${encodeURIComponent(groupKey(b))}"`:''}  style="position:relative;">
      <div class="book-cover">
        ${hasCover?`<img src="${effectiveCover}" alt="${sanitize(b.title)}" loading="lazy" decoding="async" onload="this.nextElementSibling.style.display='none'" onerror="this.style.display='none'">`:''}<div class="book-cover-ph"><p style="margin-top:4px">${sanitize(b.title)}</p></div>
        ${(b.sold==='Sold'&&!isGrouped)?'<div class="sold-overlay"><span class="sold-badge">Sold</span></div>':''}
      </div>
      ${isGrouped?`<span class="copies-badge">×${totalCopies}</span>`:''}
      <div class="book-info">
        ${isListView?`<div class="book-info-thumb">${thumbHtml}</div>`:''}
        <div class="book-info-main">
          <div class="book-title-text">${sanitize(b.title)}</div>
          <div class="book-author-text">${sanitize(b.author)}</div>
          <div style="font-size:9px;color:var(--ink-faint);margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${sanitize(b.publisher||'')} ${b.year?'· '+b.year:''}</div>
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
  // Compute count from data (not DOM) to avoid timing issues
  const search = ((document.getElementById('catalogSearch') || {}).value || '').trim().toLowerCase();
  const cond = S.filterCondition || 'all';
  const pub = ((document.getElementById('filterPublisher') || {}).value || '');
  const count = (S.books || []).filter(b => {
    const ms = !search || (b.title||'').toLowerCase().includes(search) || (b.author||'').toLowerCase().includes(search);
    const mc = cond === 'all' || b.condition === cond;
    const mp = !pub || b.publisher === pub;
    if (S.showWishlist) return ms && mc && mp && b.sold === 'Wishlist';
    if (S.showDrafts)   return ms && mc && mp && b.draft === 'Draft';
    if (S.showSold)     return ms && mc && mp && b.sold === 'Sold';
    return ms && mc && mp && b.sold !== 'Sold' && b.sold !== 'Wishlist' && b.draft !== 'Draft';
  }).length;
  const applyBtn = document.getElementById('filterApplyBtn');
  if (applyBtn) applyBtn.textContent = `Show ${count} Book${count !== 1 ? 's' : ''}`;
  let active = 0;
  if ((S.sortBy || 'dateAdded') !== 'dateAdded' || (S.sortDir || 'desc') !== 'desc') active++;
  if ((S.filterCondition || 'all') !== 'all') active++;
  if (pub !== '') active++;
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
    `<span style="font-family:'Playfair Display',serif;">${sanitize(title)}</span>
     <span style="font-size:12px;font-weight:400;color:var(--ink-faint);margin-left:8px;">${copies.length} ${copies.length===1?'copy':'copies'}</span>`;

  document.getElementById('copiesSheetBody').innerHTML = copies.map(({b, idx}) => {
    const hasCover = b.coverUrl && b.coverUrl !== '__local__';
    const isSold = b.sold === 'Sold';
    const isWishlist = b.sold === 'Wishlist';
    const isDraft = b.draft === 'Draft';
    return `<div class="copy-row" onclick="closeCopiesSheet();setTimeout(()=>openModal(${idx}),120);">
      <div class="copy-thumb">
        ${hasCover
          ? `<img src="${b.coverUrl}" onerror="this.style.display='none'" loading="lazy" decoding="async"/>`
          : `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" style="opacity:0.4;color:var(--ink-faint)"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`}
      </div>
      <div class="copy-info">
        <div class="copy-info-top">
          <span class="book-condition-badge ${condClasses[b.condition]||'cond-good'}">${b.condition||'—'}</span>
          ${b.price&&!isNaN(parseFloat(b.price))?`<span class="copy-price">${sym}${parseFloat(b.price).toFixed(0)}</span>`:''}
          ${isSold?'<span class="sold-badge">Sold</span>':''}
          ${isDraft?'<span class="draft-badge">Draft</span>':''}
        </div>
        <div class="copy-meta">
          ${[b.edition, b.year, b.dateAdded?'Added '+b.dateAdded:''].filter(Boolean).map(s=>sanitize(s)).join(' · ')}
        </div>
      </div>
      <span class="copy-chevron">›</span>
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

// ── COVER ENRICHMENT FROM book_catalog ──
// Pass 1: exact norm_key match (title+author). Pass 2: clean-title prefix match for
// books with no author or unmatched by pass 1. Runs once per load.
async function enrichCoversFromCatalog() {
  if (typeof _supa === 'undefined' || !S.books || !S.books.length) return;
  const booksToFix = S.books.filter(b =>
    !b.coverUrl || b.coverUrl.includes('conjuringarchive.com')
  );
  if (!booksToFix.length) return;

  const cleanStr = s => (s||'').toLowerCase().replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim();

  // Pass 1 — exact norm_key lookup (handles special chars via .in())
  const keyToBooks = {};
  booksToFix.forEach(b => {
    const k = normKey(b.title, b.author);
    if (!keyToBooks[k]) keyToBooks[k] = [];
    keyToBooks[k].push(b);
  });
  const keys = Object.keys(keyToBooks);
  let changed = 0;

  for (let i = 0; i < keys.length; i += 200) {
    const { data } = await _supa
      .from('book_catalog')
      .select('norm_key,cover_url')
      .in('norm_key', keys.slice(i, i + 200));
    if (!data) continue;
    data.forEach(row => {
      if (!row.cover_url) return;
      (keyToBooks[row.norm_key] || []).forEach(b => {
        b.coverUrl = row.cover_url;
        b.rawCover = row.cover_url;
        changed++;
      });
    });
  }

  // Pass 2 — prefix match on clean title for any still-unmatched books
  // Clean titles are [a-z0-9 ] only — safe to use in .or() filter
  const stillUnmatched = booksToFix.filter(b =>
    !b.coverUrl || b.coverUrl.includes('conjuringarchive.com')
  );
  if (stillUnmatched.length) {
    const cleanTitleToBooks = {};
    stillUnmatched.forEach(b => {
      const k = cleanStr(b.title);
      if (!k) return;
      if (!cleanTitleToBooks[k]) cleanTitleToBooks[k] = [];
      cleanTitleToBooks[k].push(b);
    });
    const cleanTitles = Object.keys(cleanTitleToBooks);
    for (let i = 0; i < cleanTitles.length; i += 100) {
      const batch = cleanTitles.slice(i, i + 100);
      const orFilter = batch.map(t => `norm_key.ilike.${t}:%`).join(',');
      const { data } = await _supa
        .from('book_catalog')
        .select('norm_key,cover_url')
        .or(orFilter);
      if (!data) continue;
      data.forEach(row => {
        if (!row.cover_url) return;
        const cleanTitle = row.norm_key.split(':')[0];
        (cleanTitleToBooks[cleanTitle] || []).forEach(b => {
          b.coverUrl = row.cover_url;
          b.rawCover = row.cover_url;
          changed++;
        });
      });
    }
  }

  if (changed > 0) renderCatalog();
}

// ── FX cache ──────────────────────────────────────────────────────────────
let _fxCache = null;
async function getFxRates() {
  if (_fxCache) return _fxCache;
  const { data } = await _supa.from('fx_rates').select('from_cur,to_cur,rate');
  _fxCache = {};
  if (data && data.length) {
    data.forEach(r => { (_fxCache[r.from_cur] = _fxCache[r.from_cur] || {})[r.to_cur] = parseFloat(r.rate); });
  } else {
    _fxCache = { USD:{AUD:1.55,GBP:0.645,EUR:0.92}, GBP:{AUD:2.02,USD:1.55,EUR:1.17} };
  }
  return _fxCache;
}

// ── Condition % presets ───────────────────────────────────────────────────
function getConditionPct(condition) {
  const s = S.settings || {};
  const map = {
    'Fine':       (s.condPct_fine !== undefined ? s.condPct_fine : 100) / 100,
    'Very Good':  (s.condPct_vg   !== undefined ? s.condPct_vg   : 80)  / 100,
    'Good':       (s.condPct_good !== undefined ? s.condPct_good : 60)  / 100,
    'Fair':       (s.condPct_fair !== undefined ? s.condPct_fair : 40)  / 100,
    'Mint': 1.0, 'New': 1.0, 'VG+': 0.80, 'VG': 0.70, 'Poor': 0.30,
  };
  return map[condition] !== undefined ? map[condition] : 0.70;
}

// ── getEstimatedValue ─────────────────────────────────────────────────────
async function getEstimatedValue(book) {
  const key = normKey(book.title, book.author);
  const userCur = (S.settings && S.settings.currency) || 'AUD';

  const [{ data: rows }, fx] = await Promise.all([
    _supa.from('price_db').select('source,price,currency,url,in_print,created_at').eq('norm_key', key),
    getFxRates(),
  ]);
  if (!rows || !rows.length) return null;

  const toLocal = (price, srcCur) => {
    if (!srcCur || srcCur === userCur) return parseFloat(price);
    return parseFloat(price) * ((fx[srcCur] || {})[userCur] || 1);
  };

  // Determine in_print status by highest-confidence row
  const RANK = { confirmed_inprint:5, confirmed_oop:4, likely_inprint:3, likely_oop:2, unknown:1 };
  const best = rows.reduce((a, r) => (RANK[r.in_print]||0) > (RANK[a.in_print]||0) ? r : a, rows[0]);
  const inPrint = best.in_print || 'unknown';
  const isInPrint = inPrint === 'confirmed_inprint' || inPrint === 'likely_inprint';

  const condPct = getConditionPct(book.condition);
  let value, low, high, mode, usedSources;

  if (isInPrint) {
    mode = 'inprint';
    const msrp = rows.find(r => r.source === 'murphys_msrp') || rows.find(r => r.source === 'penguin_retail');
    if (!msrp) return null;
    const base = toLocal(msrp.price, msrp.currency || 'USD');
    value = base * condPct;
    low   = base * Math.max(0, condPct - 0.10);
    high  = base * (condPct + 0.10);
    usedSources = [msrp];
  } else {
    mode = 'oop';
    const secondary = rows.filter(r => r.source === 'ebay_sold' || r.source === 'qtte_secondary');
    const pool = secondary.length ? secondary : rows;
    const prices = pool.map(r => toLocal(r.price, r.currency || 'USD')).sort((a, b) => a - b);
    const median = prices[Math.floor(prices.length / 2)];
    const scarcity = pool.length === 1 ? 1.1 : 1.0;
    value = median * scarcity;
    low   = prices[0] * 0.9;
    high  = prices[prices.length - 1] * 1.1;
    usedSources = pool;
  }

  // Confidence ★1–5
  const freshDays = Math.min(...rows.map(r => (Date.now() - new Date(r.created_at)) / 86400000));
  const sourceCnt = new Set(rows.map(r => r.source)).size;
  let confidence = 1;
  if (inPrint.startsWith('confirmed')) confidence += 2;
  else if (inPrint.startsWith('likely')) confidence += 1;
  if (sourceCnt >= 2) confidence += 1;
  if (freshDays < 90) confidence += 1;
  confidence = Math.min(5, confidence);

  return { value, low, high, mode, confidence, currency: userCur, sources: rows, usedSources, inPrint };
}

// ── SOURCE_LABELS (shared) ────────────────────────────────────────────────
const SOURCE_LABELS = {
  qtte_secondary: 'QTTE (Pre-Owned)',
  murphys_msrp:   "Murphy's Magic (New)",
  penguin_retail: 'Penguin Magic (New)',
  ebay_sold:      'eBay (Used)',
};

async function loadMarketSync(b) {
  const el = document.getElementById('marketSyncSection');
  if (!el) return;

  const key = normKey(b.title, b.author);
  const sym = currSym();
  const userCur = (S.settings && S.settings.currency) || 'AUD';

  const [{ data: rows }, fxRates] = await Promise.all([
    _supa.from('price_db').select('source,price,currency,url,in_print,created_at').eq('norm_key', key),
    getFxRates()
  ]);

  const allRows = rows || [];
  const toLocal = (price, srcCur) => {
    if (!srcCur || srcCur === userCur) return parseFloat(price);
    return parseFloat(price) * ((fxRates[srcCur] || {})[userCur] || 1);
  };

  // Group rows by source
  const bySource = {};
  allRows.forEach(r => { (bySource[r.source] = bySource[r.source] || []).push(r); });

  // Dot colour: eBay/QTTE = pre-owned (yellow), MSRP = green if in_print else red
  const dotFor = (srcKey, srcRows) => {
    if (srcKey === 'ebay_sold' || srcKey === 'qtte_secondary') return '#f5a623';
    const ip = srcRows[0] && srcRows[0].in_print;
    if (ip === 'confirmed_inprint' || ip === 'likely_inprint') return '#2a9d5c';
    if (ip === 'confirmed_oop'     || ip === 'likely_oop')     return '#e05252';
    return '#f5a623';
  };

  const ebayUrl = buildEbayUrl(b.title, b.author);

  const SOURCES = [
    { key: 'ebay_sold',      label: 'eBay Sold Listings',    fallbackUrl: ebayUrl },
    { key: 'qtte_secondary', label: 'QTTE / CMB / MC',        fallbackUrl: null    },
    { key: 'penguin_retail', label: 'Penguin Magic (MSRP)',   fallbackUrl: null    },
    { key: 'murphys_msrp',   label: "Murphy's Magic (MSRP)", fallbackUrl: null    },
  ];

  const rowsHtml = SOURCES.map(({ key: srcKey, label, fallbackUrl }) => {
    const srcRows = bySource[srcKey] || [];
    const dotColor = srcRows.length ? dotFor(srcKey, srcRows) : '#ccc';
    const dot = `<span class="src-dot" style="background:${dotColor};"></span>`;

    let priceHtml, linkUrl;

    if (srcRows.length) {
      if (srcKey === 'ebay_sold') {
        const prices = srcRows.map(r => toLocal(r.price, r.currency || 'USD'));
        const avg = prices.reduce((a, x) => a + x, 0) / prices.length;
        priceHtml = `<span class="src-price">${sym}${avg.toFixed(0)}</span>${prices.length > 1 ? `<div class="src-price-sub">avg of ${prices.length} sales</div>` : ''}`;
      } else {
        const local = toLocal(srcRows[0].price, srcRows[0].currency || 'USD');
        priceHtml = `<span class="src-price">${sym}${local.toFixed(0)}</span>`;
      }
      linkUrl = srcRows[0].url || fallbackUrl;
    } else {
      priceHtml = `<span class="src-price-unavail">Price fetch not reliable</span>`;
      linkUrl = fallbackUrl;
    }

    const linkLabel = srcKey === 'ebay_sold' ? 'Check sold listings ↗' : 'View listing ↗';
    const linkHtml = linkUrl
      ? `<a href="${linkUrl}" target="_blank" rel="noopener" class="src-link">${linkLabel}</a>`
      : '';

    return `<div class="src-row">
      <div class="src-row-left">
        ${dot}
        <div>
          <div class="src-label">${label}</div>
          ${linkHtml ? `<div class="src-link-wrap">${linkHtml}</div>` : ''}
        </div>
      </div>
      <div class="src-row-price">${priceHtml}</div>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div class="src-evidence-wrap">
      <div class="src-evidence-heading">Market Price Evidence</div>
      ${rowsHtml}
      <div class="src-legend">
        <span style="color:#2a9d5c;">●</span> New &nbsp;
        <span style="color:#f5a623;">●</span> Pre-Owned &nbsp;
        <span style="color:#e05252;">●</span> Out of Print
      </div>
    </div>`;
  el.style.display = '';
}

async function toggleMarketSync(bookId) {
  const el = document.getElementById('marketSyncSection');
  if (!el) return;
  const btn = document.getElementById('btnMarketValue');
  if (el.style.display !== 'none') {
    el.style.display = 'none';
    if (btn) btn.classList.remove('is-active');
    return;
  }
  const b = S.books.find(x => x._id === bookId);
  if (!b) return;
  el.innerHTML = `<div style="padding:14px 20px;border-top:0.5px solid var(--border);text-align:center;font-size:12px;color:var(--ink-faint);">Loading…</div>`;
  el.style.display = '';
  await loadMarketSync(b);
  if (btn) btn.classList.add('is-active');
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function acceptMarketPrice(id, price) {
  const _now = new Date().toISOString();
  const _cur = (S.settings && S.settings.currency) || 'AUD';
  const { error } = await _supa.from('books').update({ market_price: price, price_currency: _cur, price_updated_at: _now, updated_at: _now }).eq('id', id);
  if (error) { showToast('Price update failed', 'error', 2000); return; }
  const b = S.books.find(x => x._id === id);
  if (b) { b.price = String(price); b.priceCurrency = _cur; b.priceUpdatedAt = _now; }
  showToast('Market price updated ✓', 'success', 2000);
  // Refresh the price badge in the open modal
  openModal(S.currentModalIdx);
}
// ─────────────────────────────────────────────────────────────────────
function openBookFromHome(bookId){
  const idx=S.books.findIndex(b=>b._id===bookId);
  if(idx===-1)return;
  showView('catalog');
  openModal(idx);
}

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

  document.getElementById('modalBody').innerHTML = buildDetailBodyHTML(b, S.books, {
    isWishlist, libraryMatch, modalCoverSrc, inPrintLabel, googleUrl, sym,
  });
  // Rewrite action buttons based on wishlist vs library
  const actionsArea = document.getElementById('modalActionsArea');
  if (actionsArea) {
    const ebayIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
    if (isWishlist) {
      actionsArea.innerHTML =
        `<div class="ms-actions-primary">
          <button class="btn-action" data-action="edit-book">Edit Details</button>
        </div>
        <div class="ms-actions-secondary">
          <button class="btn-ghost" style="width:100%" data-action="toggle-wishlist">Move to Library</button>
        </div>
        <hr class="ms-separator">
        <div class="ms-actions-danger">
          <button data-action="delete-book" class="btn-danger-link">Delete Book</button>
        </div>`;
    } else {
      actionsArea.innerHTML =
        `<div class="ms-actions-primary" style="grid-template-columns:1fr;">
          <button class="btn-action" id="btnMarketValue" data-action="market-value">Market Value</button>
          <button class="btn-action" data-action="edit-book">Edit Details</button>
          <button class="btn-action" id="modalSoldBtn" data-action="mark-sold">Mark Sold</button>
        </div>
        <hr class="ms-separator">
        <div class="ms-actions-danger">
          <button data-action="delete-book" class="btn-danger-link">Delete Book</button>
        </div>`;
    }
  }
  // Set sold button label
  if (!isWishlist) {
    const soldBtn = document.getElementById('modalSoldBtn');
    if (soldBtn) soldBtn.textContent = (b.sold === 'Sold') ? 'Return to Library' : 'Mark Sold';
  }
  // Render star rating only for non-wishlist items
  if (!isWishlist) renderModalStars(b);
  // If draft, open in Add form instead
  if (b.draft === 'Draft') { openDraftActions(idx); return; }
  const _mo = document.getElementById('modalOverlay');
  _mo.classList.add('is-active');
  _mo.style.pointerEvents = 'none';
  requestAnimationFrame(() => { requestAnimationFrame(() => { _mo.style.pointerEvents = ''; }); });
}
function openEbayModal(){
  // Installed PWA on iOS loses state with window.open — use location.href only in that case
  const isIOSPWA = /iPhone|iPad|iPod/i.test(navigator.userAgent) && window.navigator.standalone === true;
  if (isIOSPWA) { window.location.href = S.currentModalUrl; return; }
  window.open(S.currentModalUrl, '_blank');
}
function openEditFromModal(id){
  if (!id && S.currentModalIdx !== undefined) {
    const b = S.books[S.currentModalIdx];
    if (b) id = b._id;
  }
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
  btn.innerHTML = label;
  btn.classList.toggle('is-active', active);
}

function toggleEditMode() {
  if (S.selectMode === 'edit') { exitSelectMode(); return; }
  S.selectMode = 'edit';
  S.selectedBooks.clear();
  _setModeBtn('editModeBtn', 'Exit Edit', true);
  _setModeBtn('moveModeBtn', 'Bulk Select', false);
  renderCatalog();
}
window.toggleEditMode = toggleEditMode;

function toggleMoveMode() {
  if (S.selectMode === 'move') { exitSelectMode(); return; }
  S.selectMode = 'move';
  S.selectedBooks.clear();
  _setModeBtn('moveModeBtn', 'Exit Select', true);
  if (window._bkSetOn) window._bkSetOn(true);
  renderCatalog();
}
window.toggleMoveMode = toggleMoveMode;

function exitSelectMode() {
  if (window._bkSetOn) window._bkSetOn(false);
  S.selectMode = null;
  S.selectedBooks.clear();
  _setModeBtn('editModeBtn', 'Edit', false);
  _setModeBtn('moveModeBtn', 'Bulk Select', false);
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
  if (S.selectMode === 'move') {
    stack.innerHTML =
      '<button data-action="bulk-mark-sold" class="batch-btn">Mark Sold</button>' +
      '<button data-action="bulk-draft" class="batch-btn">Move to Draft</button>' +
      '<button data-action="bulk-delete" class="batch-btn batch-btn--danger">Delete</button>';
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
  const n = ids.length;
  magiConfirm({title:`Mark ${n} book${n>1?'s':''} as Sold?`,message:`These books will move to your Sold view and be hidden from the main library.`,confirmText:'Mark Sold',onConfirm:async()=>{
    const { error } = await _supa.from('books').update({ sold_status: 'Sold' }).in('id', ids);
    if (error) { showToast('Update failed. Please try again.', 'error', 3000); return; }
    ids.forEach(id => { const b = S.books.find(x => x._id === id); if (b) b.sold = 'Sold'; });
    showToast(`${n} book${n > 1 ? 's' : ''} marked as sold.`, 'success', 2500);
    triggerPoof(ids, () => { exitSelectMode(); });
  }});
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
  if (S.selectedBooks.size === 0) { showToast('No books selected', 'error'); return; }
  openPriceReviewSheet([...S.selectedBooks]);
}
window.bulkPriceUpdate = bulkPriceUpdate;

function openPriceReviewSheet(ids) {
  // Always recreate overlay so getElementById never returns stale/detached elements
  const existing = document.getElementById('priceReviewOverlay');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.className = 'magi-sheet-overlay';
  el.id = 'priceReviewOverlay';
  el.onclick = function(e) { if (e.target === el) closePriceReviewSheet(); };

  // Build rows inline so we never need a secondary getElementById lookup
  const rows = ids.map(id => {
    const b = S.books.find(x => x._id === id);
    if (!b) return '';
    return `<div class="review-row">
      <div style="flex:1;min-width:0;padding-right:12px;">
        <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${sanitize(b.title)}</div>
        <div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:2px;">${sanitize(b.author || '—')}</div>
        <div style="font-size:11px;color:rgba(255,255,255,0.35);margin-top:3px;">No update found. Enter new price?</div>
      </div>
      <input type="number" class="review-price-input" data-id="${id}" placeholder="0.00" step="0.01" min="0" inputmode="decimal">
    </div>`;
  }).join('');

  el.innerHTML = `
    <div class="magi-sheet" id="priceReviewSheet" style="background:var(--ink);color:#fff;">
      <div class="magi-sheet-handle" style="background:rgba(255,255,255,0.2);"></div>
      <button class="sheet-close-btn" style="background:rgba(255,255,255,0.1);border-color:rgba(255,255,255,0.15);color:#fff;" onclick="closePriceReviewSheet()" aria-label="Close"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      <div style="padding:0 20px 20px;">
        <div style="text-align:center;padding:16px 0 20px;">
          <div style="font-family:'Playfair Display',serif;font-size:1.2rem;margin-bottom:4px;">Price Review</div>
          <div style="font-size:12px;color:rgba(255,255,255,0.5);">${ids.length} book${ids.length > 1 ? 's' : ''} selected</div>
        </div>
        <div>${rows}</div>
        <button onclick="applyManualPrices()" style="width:100%;margin-top:20px;padding:14px;background:var(--accent-mid);color:#fff;border:none;border-radius:10px;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:600;cursor:pointer;min-height:48px;touch-action:manipulation;">Apply Manual Prices</button>
      </div>
    </div>`;

  document.body.appendChild(el);

  // Suppress ghost-click for two paint frames so the tap that opened this doesn't close it
  el.style.pointerEvents = 'none';
  requestAnimationFrame(() => { requestAnimationFrame(() => { el.style.pointerEvents = ''; }); });

  requestAnimationFrame(() => {
    el.classList.add('is-active');
    document.body.classList.add('sheet-open');
    const bar = document.getElementById('batchActionsBar');
    if (bar) bar.classList.add('sheet-hidden');
  });
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
      _supa.from('books').update({ market_price: price, price_currency: (S.settings && S.settings.currency) || 'AUD', price_updated_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id)
    )
  );
  const failed = results.filter(r => r.error).length;
  const succeeded = updates.length - failed;

  if (succeeded > 0) {
    updates.forEach(({ id, price }) => { const b = S.books.find(x => x._id === id); if (b) { b.price = String(price); b.priceCurrency = (S.settings && S.settings.currency) || 'AUD'; b.priceUpdatedAt = new Date().toISOString(); } });
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
  const n = ids.length;
  magiConfirm({title:`Move ${n} book${n>1?'s':''} to Draft?`,message:`These books will be moved to Drafts and hidden from the main library.`,confirmText:'Move to Draft',onConfirm:async()=>{
    const { error } = await _supa.from('books').update({ draft_status: 'Draft' }).in('id', ids);
    if (error) { showToast('Update failed. Please try again.', 'error', 3000); return; }
    ids.forEach(id => { const b = S.books.find(x => x._id === id); if (b) b.draft = 'Draft'; });
    showToast(`${n} book${n > 1 ? 's' : ''} moved to Draft.`, 'success', 2500);
    triggerPoof(ids, () => { exitSelectMode(); });
  }});
}
window.bulkDraft = bulkDraft;

async function toggleWishlistStatus() {
  const b = S.books[S.currentModalIdx];
  if (!b) return;
  const newStatus = (b.sold === 'Wishlist') ? '' : 'Wishlist';
  if (!window._isOnline) {
    _mgQueuePush({ op: 'update', id: b._id, payload: { sold_status: newStatus }, ts: Date.now() });
    b.sold = newStatus;
    closeModal();
    renderCatalog();
    showToast((newStatus === 'Wishlist' ? 'Moved to wishlist' : 'Returned to library') + ' \u2014 will sync when online', 'info', 3500);
    return;
  }
  const { error } = await _supa.from('books').update({ sold_status: newStatus }).eq('id', b._id);
  if (error) { showToast('Update failed. Please try again.', 'error', 3000); return; }
  b.sold = newStatus;
  closeModal();
  renderCatalog();
  showToast(newStatus === 'Wishlist' ? 'Moved to wishlist.' : 'Returned to library.', 'success', 2500);
}
window.toggleWishlistStatus = toggleWishlistStatus;

// PUBLISHERS list moved to publishers.js — do not redeclare here
// const PUBLISHERS = ["A \"Magic Wand\" Publication", "A ConCam Production", "A G Films Production", "A G-M Publication", "A Goodliffe Publication", "A Mark Leveridge Magic Publication", "A Martini's Magic Company Release", "A Salon de Magie Book, Ken Klosterman", "A Talon Publication", "A Top Magic Publication", "A-1 MagicalMedia", "A. M. Wilson, M. D.", "Aaron Fisher Magic", "Abbott's Magic", "Abraxas", "Ace Place Magic", "Agency of World Entertainment", "Al Mann Exclusives", "Aladdin's Magic Shop", "Alakazam", "Alan Sands Entertainment", "Alexander de Cova Productions", "Alta California Book and Job Printing House", "An Andi Gladwin Production", "Anthony Brahams", "Antinomy Magic", "Aplar Publishing", "Arcas Publications", "Arthur P. Felsman", "Astor", "avanT-Garde Magic", "B.S. Publications", "BammoMagic", "Beat & Roy Books", "Ben Harris Magic Publications", "Benchmark Magic Production", "Berland Presents", "BHM Industries / New Directions Publishing", "Binary Star Publications", "Blue Bikes Production", "Bob King Magic", "Bob Lynn", "Bob Lynn / Tony Raven", "Bodean Enterprises", "Borden Publishing Company", "Borwig & Horster", "Bradbury, Agnew & Co.", "Brunel White", "BW Magic Publishing", "C. Arthur Pearson Limited", "C.C. Éditions", "Caddy Manufacturing Company", "Calostro Publications", "Camirand Academy of Magic", "Card-Shark", "Carl Waring Jones", "Catman Publications", "Cecil E. Griffin", "CEDAM", "Chambers Magic Company", "Charles Scribner’s Sons", "Charlsen + Johansen & Others", "Chas. C. Eastman", "ChicagoMagicBash Publications", "China Productions", "Chuck Martinez", "Clandestine Productions", "Cold Deck Company", "Coleccion Renglones", "Collectors' Workshop", "Columbia Magic Shop Inc.", "Conjuring Arts Research Center", "Conjurors' Library", "Conundrum Publishing", "Corinda's Magic Studio", "Crown Publishers, Inc.", "CYMYS", "D. Robbins & Co., Inc.", "Dan and Dave Industries, Inc.", "Daniel's Den Publication", "Danny Korem", "Dark Arts Press", "David Kemp & Company", "David Meyer Magic Books", "DeCovaMagic", "Developmental Productions Press", "dfgrd ediciones", "Divine Goddess 23 Productions", "DMB Publications", "Docc Co.", "Docc Hilford Productions", "Donald Holmes", "Donnybrook Enterprises, Inc.", "Dover Publications", "DTrik", "Dutton & Co.", "E. F. Rybolt", "East Coast Super Session", "Eckhard Böttchers Zauber-Butike", "Ed Mellon", "Ediciones El Espectador", "ediciones famulus", "ediciones Marré", "Ediciones Vernet Magic", "Edition Olms", "Editions Techniques du Spectacle", "Editorial El Caballo del Malo", "Editorial Frakson", "Edward Bagshawe & Co.", "El Duco", "Electro Fun", "Emerson & West", "Empire", "Every Trick in the Book Inc.", "Excelsior!! Productions", "F. G. Thayer", "Faber & Faber", "FASDIU Enterprises", "Fire Cat Studios", "Fleming Book Company", "Flora & Company", "Florence Art Edizioni", "FOCM Publication", "Fort Worth Magicians' Club", "Frank Werner", "Full Moon Magic Books", "Fun Inc.", "G & E Enterprises", "GBC Press", "Gene Gordon", "Genii", "Geo-Mar Publications", "George G. Harrap & Co., Ltd.", "George Snyder Jr", "George Starke", "Goldshadow Industries", "GrupoKaps", "Hermetic Press", "Guy Bavli - Perfect Magic", "I Saw That!", "Illuma - Illusion Management", "International Magic", "International Magic House", "Invisible Man Productions", "Invisible Practice Production", "Irv Weiner", "J A Enterprises", "Jahoda & Siegel", "Jeff Busby Magic, Inc.", "Jeff McBride, Inc.", "Jerry Mentzer (Magic Methods)", "John King - S. David Walker", "Jose's Studio", "Julius Sussmann, Hamburg", "Juris Druck + Verlag Zürich", "JustJoshinMagic", "Jörg Alexander ZauberKunst", "KANDA Publications", "Kanter's Magic Shop", "Kardyro-Torino Creations", "Kaufman and Company", "Kaufman and Greenberg", "Kee-West Productions", "Kennedy Enterprises", "Kerwin Benson Publishing", "Kreations & Trx", "L&L Publishing", "L. Davenport & Co.", "La boutique de l'illusion", "Laughing Room Only", "Lee Jacobs Productions", "Lehmann & Schüppel, Leipzig", "Lesclapart", "Levy & Müller", "Little, Brown and Company", "Louis Tannen", "Lybrary.com", "M. S. Messinger Printing", "M.C.M. Editora", "Magic Art Studio", "Magic by Boretti", "Magic City", "Magic Communication", "Magic House", "Magic Inspirations", "Magic Limited", "MAGIC Magazine", "Magic Methods", "Magic, Inc.", "Magical Publications", "Magicana", "Magick Enterprises", "Magicland, Tokyo", "Magico Magazine", "Magicseen Magazine", "Magicshop Vienna", "Magie", "Malbrough Magic", "Malek Enterprises", "ManusKrypt", "Marchand de Trucs", "Mark Wilson Publications", "Martin Breese", "Max Abrams", "Max Andrews (Vampire) LTD.", "Max Holden", "Mayette Magie Moderne", "Maynestream Productions", "Me and the other Guy Productions", "Media T Marketing", "Meir Yedid Magic", "Mephisto Huis", "Metempirical Magic", "Micky Hades", "Micky Hades Enterprises", "Micky Hades International", "Mike Caveney's Magic Words", "Mike Powers Magic", "Million Dollar Productions", "Mind Tapped Productions, LLC", "Miracle Makers", "Miracle Press", "Miracles Productions", "Montandon Magic", "Morissey Magic LTD.", "Murphy's Magic Supplies, Inc.", "Mystica", "MZvD", "Namlips Enterprises", "Nat Louis", "Necromancer Press", "Nelson & Nelson Ltd.", "Nelson Enterprises", "Neukomm & Zimmermann", "New Jinx Publication", "Nick Bolton", "Nightmare Alley Productions", "Obie O'Brien", "Ohmigosh Productions", "Old-Guy-In-The-Bathroom Productions", "Oliver Erens - œ", "Ortiz Publications", "Out of the Blue", "Owen Bros.", "Owen Magic Supreme", "Palooka Productions", "Paradigm Press", "Paraninfo", "Patrick Page Magic Limited", "Paul Diamond", "Pavel-Magic", "Penny's Publishing", "Penshaw Press", "PH Marketing Publication", "Philip R. Willmarth", "Piccadilly Books, Ltd", "Popular Magic Publications", "Princeton University Press", "Printed for T. Moore, London", "Private View", "Pro Print", "Producciones El Asombro, S.L.", "Professor Presto", "Psychic Entertainers Association", "Páginas", "R.O.P.S. Press", "Radio Free Atlantis Production", "Random House", "Rauscher & Cie AG", "Raw-Press", "Ray Gamble & W. Herbert Schuh", "Real Miracle Publication", "Red Silk Variety Productions", "Reed Swans Collective", "Reginald Scot Books", "Regow's House of Enchantment", "RFA Production", "Roche Magic Studio", "Rudolf Braunmüller", "Sacred Chao Productions", "San Francisco Book Company", "Sankey Magic", "Saturn Magic Ltd", "Savaco, Ltd.", "Scapegrace Press", "Schwabacher'sche Verlagsbuchhandlung", "Schweizerisches Jugendschriftenwerk Zürich", "Secrets of Dr. Dee", "Sedgehill Industries", "Selfpublished", "Silk King Studios", "simsalabonn", "Slydini Studio of Magic", "Smiling Mule Productions", "Sorcerer's Apprentice", "Sound of Magic", "Spade and Archer", "Sphinx Publishing Corporation", "Squash Publishing", "St. Pierre Enterprises", "Star Magic Co.", "Sterling Magic Company", "Steve Burton", "Steve Reynolds Magic", "Stevens Magic Emporium", "Syzygy Press", "Tannen Magic Inc.", "Taurus Magic Supply", "TCC", "Tenkai Prize Committee", "Tenyo", "Tesmar Zauberartikel", "The Cardician Press", "The Conjurors' Convention Corporation", "The Enchantment", "The False Deal (Mark Tams)", "The FM Factory", "The Genii Corporation", "The Impossible Co.", "The Ireland Magic Co.", "The Journal of Psience", "The Kee Publishing Co.", "The Kent & Surrey Press", "The London Magical Co.", "The Magic Apple", "The Magic Art Book Co.", "The Magic Circle", "The Magic Circle Foundation", "The Magic Corner", "The Magic Fun Factory", "the magic hands editions", "The Magic Wand Office", "The MasterMind Group", "The Merchant of Magic Ltd.", "The Miracle Factory", "The Neat Review", "The Presto Place", "The Second Deal (Jason Alford)", "The Secret Service", "The Sid Lorraine Hat & Rabbit Club", "The Supreme Magic Company", "The Tom-Foolery, Inc.", "The Usual Suspect", "The Welworth Company", "The Williamson Press, Inc.", "The Yogi Magic Mart", "Theory and Art of Magic Press", "Thinkers' Press", "Thomas van Büren Lenger", "Tokyodo Shuppan", "Trapdoor Productions", "Trik-Kard Specialties", "TVMagic.co.uk", "U. F. Grant", "Ultra Neat Ltd.", "Underground Collective", "Unikorn Magik", "Unique Magic Studio", "unknown publisher", "Vanishing Inc.", "Verlag Magischer Zirkel Hamburg", "Verlag Magischer Zirkel Leipzig", "Verlag O. Stolina", "W. H. Allen, London", "Weerd! Publishing", "Westbrook Publishing", "Wiener Spielkartenfabrik Fred. Piatnik & Söhne", "Will Goldston, Ltd.", "Wizard Publishing Company", "Wolfe Publishing Limited", "Wonder Workshop Berlin", "Wunderwinkel", "Zauberbuch-Verlag", "Zauberkabinett Shop", "Zauberkunst", "Zauberschrank", "Zauberzentrale München", "Zentralhaus für Kulturarbeit", "Édition Ch. Eggimann, Genève"];

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
const QUEUE_LIMIT = 20;
const photoQueue = [];
function addToQueue(event) {
  const files = Array.from(event.target.files);
  event.target.value = '';
  const remaining = QUEUE_LIMIT - photoQueue.length;
  if (remaining <= 0) { showToast('Queue limit reached (20 books max)', 'error'); return; }
  const toAdd = files.slice(0, remaining);
  if (files.length > remaining) showToast(`Added ${toAdd.length} of ${files.length} — queue limit is 20`, 'info', 3000);
  toAdd.forEach(file => {
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
  const hint = document.getElementById('queueLimitHint');
  if (hint) hint.textContent = count > 0 ? `(${count}/20)` : '';
  const thumbs = document.getElementById('queueThumbs');
  thumbs.innerHTML = photoQueue.map((item, i) =>
    `<div data-action="queue-thumb" data-idx="${i}" style="position:relative;width:52px;height:72px;border-radius:6px;overflow:hidden;border:0.5px solid var(--border-med);cursor:pointer;">
      <img src="${item.dataUrl}" style="width:100%;height:100%;object-fit:cover;">
      ${i === 0 ? '<div style="position:absolute;bottom:0;left:0;right:0;background:var(--accent);color:white;font-size:9px;text-align:center;padding:2px;">Next</div>' : ''}
    </div>`
  ).join('');
  const btn = document.getElementById('processQueueBtn');
  if (btn) btn.textContent = `Process next title`;
}
function _setQueueProgress(label, pct) {
  const el = document.getElementById('queueProgress');
  if (!el) return;
  document.getElementById('queueProgressLabel').textContent = label;
  document.getElementById('queueProgressBar').style.width = pct + '%';
  el.style.display = 'block';
}
function _clearQueueProgress() {
  const el = document.getElementById('queueProgress');
  if (el) el.style.display = 'none';
}
window._setQueueProgress = _setQueueProgress;
window._clearQueueProgress = _clearQueueProgress;
function queueThumbAction(idx) {
  const overlay = document.getElementById('dialogOverlay');
  overlay.innerHTML = `
    <div class="magi-dialog">
      <h3>Photo ${idx + 1} of ${photoQueue.length}</h3>
      <p>Process this photo now, or remove it from the queue?</p>
      <div class="magi-dialog-actions" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <button id="queueRemoveBtn" class="btn-ghost" style="color:#b91c1c;border-color:#fca5a5;">Remove</button>
        <button id="queueProcessBtn" class="btn-primary">Process Now</button>
      </div>
    </div>`;
  document.getElementById('queueRemoveBtn').onclick = () => { closeDialog(); removeFromQueue(idx); };
  document.getElementById('queueProcessBtn').onclick = () => { closeDialog(); processSpecificFromQueue(idx); };
  overlay.classList.add('is-active');
}
function removeFromQueue(idx) {
  photoQueue.splice(idx, 1);
  updateQueueUI();
}
function processSpecificFromQueue(idx) {
  if (idx > 0) photoQueue.unshift(photoQueue.splice(idx, 1)[0]);
  processNextFromQueue();
}
function closeQueuePanel() {
  if (photoQueue.length === 0) { document.getElementById('queuePanel').style.display = 'none'; return; }
  magiConfirm({
    title: 'Close photo queue?',
    message: `${photoQueue.length} queued photo${photoQueue.length > 1 ? 's' : ''} will be lost. This cannot be undone.`,
    confirmText: 'Close & Discard',
    onConfirm: () => { photoQueue.length = 0; updateQueueUI(); }
  });
}
window.queueThumbAction = queueThumbAction;
window.removeFromQueue = removeFromQueue;
window.processSpecificFromQueue = processSpecificFromQueue;
window.closeQueuePanel = closeQueuePanel;
async function processNextFromQueue() {
  if (!photoQueue.length) { showToast('Queue is empty', 'info'); return; }
  const total = photoQueue.length;
  const item = photoQueue.shift();
  updateQueueUI();
  _setQueueProgress(`Processing 1 of ${total}…`, 40);
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
  document.getElementById('scanDetail').textContent = 'AI is reading the cover metadata.';
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
      {id:'f-publisher',val:parsed.publisher}
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
    document.getElementById('scanIcon').innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    document.getElementById('scanTitle').innerHTML = `${populated} fields extracted <span class="confidence-badge ${confClass}">${parsed.confidence} confidence</span>`;
    document.getElementById('scanDetail').textContent = (photoQueue.length > 0 ? `${photoQueue.length} photo(s) still in queue. ` : '') + (parsed.notes || 'Verify details below before saving.');
    if (parsed.title && parsed.author) setTimeout(() => fetchPrice(), 800);
    _setQueueProgress(`Done — ${photoQueue.length > 0 ? photoQueue.length + ' remaining' : 'queue empty'}`, 100);
    setTimeout(_clearQueueProgress, 1200);
  } catch(err) {
    statusEl.className = 'scan-status error';
    document.getElementById('scanIcon').innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    document.getElementById('scanTitle').textContent = 'Scan failed';
    document.getElementById('scanDetail').textContent = err.message || 'Could not read the cover.';
    _clearQueueProgress();
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

// ── COVER PICKER ──
function resetPickerState() {
  const statusEl = document.getElementById('coverPickerStatus');
  if (statusEl) statusEl.textContent = '';
  const res = document.getElementById('coverPickerResults');
  if (res) { res.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:24px;color:var(--ink-faint);font-size:13px;">Searching Magic Sources…</div>'; res.style.display = 'grid'; }
  ['pickerShelfArea','googleImagesCard','pickerUrlArea'].forEach(id => { const el=document.getElementById(id); if(el)el.style.display='none'; });
  const urlInput = document.getElementById('pickerUrlInput');
  if (urlInput) urlInput.value = '';
  S._googleImgUrl = '';
  document.querySelectorAll('.cover-picker-opt').forEach(el=>el.classList.remove('active'));
}
function _openPickerOverlay() {
  const _cp = document.getElementById('coverPickerOverlay');
  _cp.classList.remove('hidden');
  _cp.style.pointerEvents = 'none';
  requestAnimationFrame(() => { requestAnimationFrame(() => { _cp.style.pointerEvents = ''; }); });
  // Reset option highlighting
  document.querySelectorAll('.cover-picker-opt').forEach(el=>el.classList.remove('active'));
  ['pickerShelfArea','googleImagesCard','pickerUrlArea'].forEach(id => { const el=document.getElementById(id); if(el)el.style.display='none'; });
}
function openCoverPicker() {
  S.coverPickerTarget = 'add';
  resetPickerState();
  _openPickerOverlay();
}
function openCoverPickerForEdit() {
  S.coverPickerTarget = 'edit';
  resetPickerState();
  _openPickerOverlay();
}

function selectCoverOpt(opt) {
  // Close all accordion panels first
  ['pickerShelfArea','googleImagesCard','pickerUrlArea'].forEach(id => { const el=document.getElementById(id); if(el)el.style.display='none'; });
  document.querySelectorAll('.cover-picker-opt').forEach(el=>el.classList.remove('active'));
  const idMap={shelf:'cpoShelf',images:'cpoImages'};
  const btn=document.getElementById(idMap[opt]);
  if(btn)btn.classList.add('active');
  if(opt==='shelf'){
    const area=document.getElementById('pickerShelfArea');
    if(area)area.style.display='block';
    searchCoverSource('conjuring');
  } else if(opt==='images'){
    const area=document.getElementById('googleImagesCard');
    if(area)area.style.display='block';
    // Pre-fill Google Images URL
    const {title,author}=getSearchTerms();
    const searchQuery=encodeURIComponent('"'+title+'"'+(author?' "'+author+'"':'')+' book cover');
    S._googleImgUrl='https://www.google.com/search?tbm=isch&q='+searchQuery;
  }
}

function uploadCoverFromPicker(event) {
  const file = event.target.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = async e => {
    await setCoverCompressed(e.target.result);
    document.getElementById('coverPickerOverlay').classList.add('hidden');
  };
  r.readAsDataURL(file);
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

  // Google Images — accordion already open via selectCoverOpt; just return
  if (source === 'images') {
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

      var caUrl = '';   // Conjuring Archive cover URL (Supabase Storage or direct CA)
      var mrUrl = '';   // MagicRef direct image URL
      var caLabel = 'Conjuring Archive';
      var mrLabel = 'MagicRef';

      // 1. Query book_catalog for stored cover — reliable direct URLs, no page scraping
      try {
        statusEl.textContent = 'Searching local database…';
        var _titleBase = title.trim().replace(/^(the|a|an)\s+/i,'');
        var { data: catRows } = await _supa.from('book_catalog')
          .select('cover_url,cover_source')
          .ilike('title', _titleBase + '%')
          .limit(1);
        // If no match on bare title, try with leading "The"
        if ((!catRows || !catRows.length) && _titleBase !== title.trim()) {
          const { data: catRows2 } = await _supa.from('book_catalog')
            .select('cover_url,cover_source')
            .ilike('title', 'the ' + _titleBase + '%')
            .limit(1);
          if (catRows2 && catRows2.length) catRows = catRows2;
        }
        if (catRows && catRows.length && catRows[0].cover_url) {
          var catSrc = catRows[0].cover_source || '';
          if (catSrc === 'supabase_storage') {
            caUrl = catRows[0].cover_url;  // CA image already in our storage — best quality
          } else if (catSrc === 'magicref') {
            mrUrl = catRows[0].cover_url;  // Direct MagicRef image URL
          }
        }
      } catch(catE) {}

      // 2. Look up CONJURING_DB — get CA cover from C: codes in entry.i or entry.c
      if (!caUrl && typeof CONJURING_DB !== 'undefined') {
        var nk = title.toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
        var nkNoArt = nk.replace(/^(the|a|an)\s+/,'');
        var entry = CONJURING_DB[nk] || CONJURING_DB['the ' + nkNoArt] || CONJURING_DB[nkNoArt];
        if (!entry) {
          var sk = nk.split(':')[0].trim();
          if (sk !== nk) entry = CONJURING_DB[sk];
        }
        if (!entry && typeof conjuringFuzzyLookup === 'function') {
          var fuzz = conjuringFuzzyLookup(title);
          if (fuzz) entry = CONJURING_DB[fuzz.key];
        }
        if (entry) {
          // Find a C: code — check entry.i first, then entry.c
          var caCode = null;
          if (entry.i && entry.i.length) caCode = entry.i.find(function(x) { return typeof x === 'string' && x.startsWith('C:'); });
          if (!caCode && entry.c && typeof entry.c === 'string' && entry.c.startsWith('C:')) caCode = entry.c;
          if (caCode) {
            var caRawUrl = _xpandUrl(caCode);  // → conjuringarchive.com URL
            try {
              statusEl.textContent = 'Fetching Conjuring Archive cover…';
              var caImgResp = await fetch('/api/fetch-proxy?action=image&url=' + encodeURIComponent(caRawUrl));
              var caImgData = await caImgResp.json();
              if (caImgData.success && caImgData.dataUrl) caUrl = caImgData.dataUrl;
              else caUrl = caRawUrl;
            } catch(caErr) { caUrl = caRawUrl; }
          }
        }
      }

      // 2. Render cards: current cover (reference) + divider + CA + MagicRef options
      function makeCard(url, sourceLabel, titleLabel, isCurrentCard) {
        var esc = url.startsWith('data:') ? url : url.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
        var cardStyle = 'flex-shrink:0;width:110px;border-radius:8px;overflow:hidden;border:2px solid transparent;transition:border-color 0.15s;background:var(--paper-warm);';
        if (isCurrentCard) {
          cardStyle += 'opacity:0.6;border:2px dashed var(--border-med);cursor:default;';
          return '<div style="' + cardStyle + '">' +
            '<div style="width:100%;aspect-ratio:2/3;position:relative;background:var(--paper-warm);">' +
            '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:32px;opacity:0.18;">&#128218;</div>' +
            '<img src="' + esc + '" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;" onerror="this.style.display=\'none\'" loading="lazy" decoding="async"/>' +
            '</div>' +
            '<div style="padding:4px 6px;font-size:9px;color:var(--ink-faint);text-align:center;line-height:1.3;">' + sourceLabel + '<br><span style="color:var(--ink);font-size:8px;">' + titleLabel.substring(0,35) + '</span></div>' +
            '</div>';
        }
        cardStyle += 'cursor:pointer;';
        return '<div onclick="selectPickedCover(\'' + esc + '\',this)" style="' + cardStyle + '">' +
          '<div style="width:100%;aspect-ratio:2/3;position:relative;background:var(--paper-warm);">' +
          '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:32px;opacity:0.18;">&#128218;</div>' +
          '<img src="' + url + '" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;" onerror="this.style.display=\'none\'" loading="lazy" decoding="async"/>' +
          '</div>' +
          '<div style="padding:4px 6px;font-size:9px;color:var(--ink-faint);text-align:center;line-height:1.3;">' + sourceLabel + '<br><span style="color:var(--ink);font-size:8px;">' + titleLabel.substring(0,35) + '</span></div>' +
          '</div>';
      }

      var cardHtml = '';
      var count = (caUrl ? 1 : 0) + (mrUrl ? 1 : 0);

      // Prepend current cover card if one is set
      var currentUrl = S.coverPickerTarget === 'edit' ? S.editCoverUrl : S.coverUrl;
      if (currentUrl && count > 0) {
        cardHtml += makeCard(currentUrl, 'Current', 'Your selection', true);
        cardHtml += '<div style="width:1px;flex-shrink:0;background:var(--border);align-self:stretch;margin:0 2px;"></div>';
      }

      if (caUrl) cardHtml += makeCard(caUrl, 'Courtesy of', caLabel, false);
      if (mrUrl && mrUrl.substring(0, 200) !== caUrl.substring(0, 200)) cardHtml += makeCard(mrUrl, 'Courtesy of', mrLabel, false);

      if (!cardHtml) {
        statusEl.textContent = 'Not found in local database.';
        resultsEl.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--ink-faint);font-size:13px;">No covers found for "' + title + '" in local database.</div>';
      } else {
        resultsEl.style.display = 'flex';
        resultsEl.style.alignItems = 'flex-start';
        resultsEl.style.flexWrap = 'nowrap';
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
      '<img src="' + img.url + '" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;" onerror="this.style.display=\'none\'" loading="lazy" decoding="async"/>' +
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
    bottom: calc(72px + env(safe-area-inset-bottom, 0px));
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
  if(typeof S!=='undefined'&&S.selectMode==='move'&&S.selectedBooks){
    _sel.has(bid)?S.selectedBooks.add(bid):S.selectedBooks.delete(bid);
    if(typeof updateBatchBar==='function')updateBatchBar();
  }
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
window._bkSetOn=function(v){_on=v;if(!v)_sel.clear();};

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
    var r=await _supa.from('books').update({market_price:result.recommended,price_currency:(S.settings&&S.settings.currency)||'AUD',price_updated_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',b._id);
    if(!r.error){b.price=String(result.recommended);b.priceCurrency=(S.settings&&S.settings.currency)||'AUD';b.priceUpdatedAt=new Date().toISOString();done++;}else skip++;
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
  return; // Delete Entire Library button removed — use Danger Zone accordion in Settings
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
        <button id="magiConfirmBtn" class="btn-primary" style="background:var(--status-sold);">${confirmText}</button>
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
      <input type="number" id="magiPromptInput" step="0.01" min="0" inputmode="decimal" placeholder="${placeholder}">
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
    if (isNaN(val) || val < 0) { input.style.borderColor = 'var(--status-sold)'; return; }
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
  const book = S.books.find(b => b._id === bookId);
  if (!book) return;
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

// Delegated click handlers — replaces inline onclick on modal and batch bar buttons
(function() {
  const overlay = document.getElementById('modalOverlay');
  if (overlay) {
    overlay.addEventListener('click', function(e) {
      const el = e.target.closest('[data-action]');
      if (!el) return;
      const action = el.dataset.action;
      const b = S.books[S.currentModalIdx];
      const id = b ? b._id : null;
      switch (action) {
        case 'zoom-cover': { const src = el.dataset.zoomSrc; if (src) zoomCover(src); break; }
        case 'google-search': window.open(el.dataset.url, '_blank', 'noopener'); break;
        case 'edit-book': if (id) openEditFromModal(id); break;
        case 'ebay-check': openEbayModal(); break;
        case 'toggle-wishlist': toggleWishlistStatus(); break;
        case 'market-value': if (id) toggleMarketSync(id); break;
        case 'mark-sold': toggleSold(); break;
        case 'delete-book': if (id) deleteBook(id); break;
        case 'filter-topic': {
          const topic = el.dataset.topic;
          if (topic) {
            closeModal();
            showView('catalog');
            const si = document.getElementById('catalogSearch');
            if (si) {
              si.value = topic;
              catalogSearchInput(si);
              renderCatalog();
            }
          }
          break;
        }
        case 'open-book': {
          const targetIdx = parseInt(el.dataset.idx, 10);
          if (!isNaN(targetIdx) && S.books[targetIdx]) {
            closeModal();
            requestAnimationFrame(() => { requestAnimationFrame(() => { openModal(targetIdx); }); });
          }
          break;
        }
      }
    });
  }

  const batchBar = document.getElementById('batchActionsBar');
  if (batchBar) {
    batchBar.addEventListener('click', function(e) {
      const el = e.target.closest('[data-action]');
      if (!el) return;
      switch (el.dataset.action) {
        case 'bulk-autofill': bulkAutofill(); break;
        case 'bulk-price-update': bulkPriceUpdate(); break;
        case 'bulk-delete': bulkDelete(); break;
        case 'bulk-mark-sold': bulkMarkSold(); break;
        case 'bulk-move-library': bulkMoveToLibrary(); break;
        case 'bulk-wishlist': bulkWishlist(); break;
        case 'bulk-draft': bulkDraft(); break;
      }
    });
  }

  const queueThumbs = document.getElementById('queueThumbs');
  if (queueThumbs) {
    queueThumbs.addEventListener('click', function(e) {
      const el = e.target.closest('[data-action="queue-thumb"]');
      if (!el) return;
      queueThumbAction(Number(el.dataset.idx));
    });
  }

  const booksGrid = document.getElementById('booksGrid');
  if (booksGrid) {
    booksGrid.addEventListener('click', function(e) {
      const card = e.target.closest('.book-card[data-id]');
      if (!card) return;
      if (S.selectMode) {
        toggleBookSelection(card.dataset.id);
      } else if (card.dataset.grouped) {
        openCopiesSheet(decodeURIComponent(card.dataset.groupKey));
      } else {
        openModal(Number(card.dataset.idx));
      }
    });
  }
})();
