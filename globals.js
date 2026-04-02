const S={condition:'',coverUrl:'',books:[],filterCondition:'all',settings:{},currentModalUrl:''};

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

// ── AUTH FUNCTIONS ──