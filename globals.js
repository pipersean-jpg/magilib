const S={condition:'',coverUrl:'',books:[],filterCondition:'all',settings:{},currentModalUrl:''};

// Canonical key for book_catalog.norm_key (Supabase): "title:author" minimal strip
function normCatalogKey(title, author) {
  const clean = s => (s||'').toLowerCase().replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim();
  return clean(title) + ':' + clean(author);
}

// Canonical key for MARKET_DB lookups (title-only, aggressive strip)
function normPriceKey(title) {
  return (title||'')
    .replace(/[^\x00-\x7F]/g,' ')
    .replace(/\([^)]*\)/g,' ')
    .replace(/\[[^\]]*\]/g,' ')
    .replace(/\s+-\s+.*$/,'')
    .replace(/\s+by\s+.*$/i,'')
    .replace(/\s*(hardcover|softcover|paperback|hc\b|pb\b|magic trick|magic book|signed\b|oop\b)\s*/gi,' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g,' ')
    .replace(/\s+/g,' ').trim()
    .replace(/^(the|a|an)\s+/,'');
}

function sanitize(str) {
  return (str == null ? '' : String(str))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── KEY CHANGE: all Claude API calls go through /api/claude-proxy (Netlify function) ──
async function callClaude(messages, maxTokens=800){
  const resp=await fetch('/api/claude-proxy',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:maxTokens,messages})
  });
  if(!resp.ok){
    const err=await resp.json().catch(()=>({}));
    throw new Error(err.error||'API error '+resp.status);
  }
  return resp.json();
}

// ── SUPABASE CLIENT ──
const SUPABASE_URL = 'https://acuehbwbwsbbxuqcmnrp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_dOa7ljuInF06MvN5fWV9ZQ_HIBVuQZa';
let _supa = null; // initialised in DOMContentLoaded after supabase.min.js is guaranteed loaded
let _supaUser = null;

// ── OFFLINE STATE ──────────────────────────────────────────────────────────
// Tracks connectivity. Functions elsewhere guard writes with window._isOnline.
window._isOnline = navigator.onLine;

window.addEventListener('online', function() {
  window._isOnline = true;
  _hideOfflineBanner();
  // Flush any mutations queued while offline, then refresh library.
  _mgQueueFlush();
});

window.addEventListener('offline', function() {
  window._isOnline = false;
  _showOfflineBanner();
});

function _showOfflineBanner() {
  const el = document.getElementById('offlineBanner');
  if (el) { el.classList.add('is-visible'); document.body.classList.add('offline-mode'); }
}
function _hideOfflineBanner() {
  const el = document.getElementById('offlineBanner');
  if (el) { el.classList.remove('is-visible'); document.body.classList.remove('offline-mode'); }
}


// ── INDEXEDDB — catalog cache ──────────────────────────────────────────────
// Stores the raw Supabase rows after a successful loadCatalog() so the
// library is readable with no network.

const _IDB_NAME = 'magilib';
const _IDB_VERSION = 1;
const _IDB_STORE = 'books_cache';

function _idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(_IDB_NAME, _IDB_VERSION);
    req.onupgradeneeded = function(e) {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(_IDB_STORE)) {
        db.createObjectStore(_IDB_STORE); // key = userId
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e.target.error);
  });
}

async function _idbSaveBooks(userId, rows) {
  try {
    const db = await _idbOpen();
    const tx = db.transaction(_IDB_STORE, 'readwrite');
    tx.objectStore(_IDB_STORE).put(rows, userId);
    return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
  } catch(e) {
    console.warn('[MagiLib] IDB save failed:', e);
  }
}

async function _idbLoadBooks(userId) {
  try {
    const db = await _idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(_IDB_STORE, 'readonly');
      const req = tx.objectStore(_IDB_STORE).get(userId);
      req.onsuccess = e => resolve(e.target.result || null);
      req.onerror = e => reject(e.target.error);
    });
  } catch(e) {
    console.warn('[MagiLib] IDB load failed:', e);
    return null;
  }
}


// ── MUTATION QUEUE ─────────────────────────────────────────────────────────
// While offline, write operations (update / delete) are pushed here.
// On reconnect (_mgQueueFlush) they are replayed in order against Supabase.
//
// Entry shapes:
//   { op: 'update', id: string, payload: object, ts: number }
//   { op: 'delete', id: string, ts: number }
//
// Inserts are NOT queued — they require a server-assigned UUID. The UI
// blocks inserts while offline instead.

const _MG_QUEUE_KEY = 'mgl_queue';

function _mgQueueLoad() {
  try { return JSON.parse(localStorage.getItem(_MG_QUEUE_KEY) || '[]'); } catch(e) { return []; }
}

function _mgQueueSave(q) {
  try { localStorage.setItem(_MG_QUEUE_KEY, JSON.stringify(q)); } catch(e) {}
}

function _mgQueuePush(entry) {
  const q = _mgQueueLoad();
  q.push(entry);
  _mgQueueSave(q);
}

async function _mgQueueFlush() {
  const q = _mgQueueLoad();
  if (!q.length) return;
  const failed = [];
  for (const entry of q) {
    try {
      let result;
      if (entry.op === 'update') {
        result = await _supa.from('books').update(entry.payload).eq('id', entry.id);
      } else if (entry.op === 'delete') {
        result = await _supa.from('books').delete().eq('id', entry.id);
      }
      if (result && result.error) failed.push(entry);
    } catch(e) {
      failed.push(entry);
    }
  }
  _mgQueueSave(failed);
  const synced = q.length - failed.length;
  if (synced > 0) {
    if (typeof showToast === 'function') {
      showToast('Synced ' + synced + ' offline change' + (synced !== 1 ? 's' : '') + ' \u2713', 'success', 3000);
    }
    if (typeof loadCatalog === 'function') loadCatalog();
  }
  if (failed.length > 0 && typeof showToast === 'function') {
    showToast(failed.length + ' change' + (failed.length !== 1 ? 's' : '') + ' failed to sync \u2014 try again', 'error', 4000);
  }
}


// Prevent scroll wheel from changing number inputs
document.addEventListener('wheel', function(e) {
  if (e.target && e.target.type === 'number' && e.target === document.activeElement) {
    e.preventDefault();
  }
}, { passive: false });

// ── AUTH FUNCTIONS ──