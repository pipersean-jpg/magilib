let _authMode = 'signin';

function toggleReveal(id) {
  const input = document.getElementById(id);
  const btn = input.nextElementSibling;
  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  btn.innerHTML = showing
    ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
    : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
}

// ── LAZY DB LOADER ──
// Dynamically loads the 4 static DB scripts after successful auth only.
// All usage sites guard with typeof X === 'undefined' so this is safe to call async.
function loadStaticDBs() {
  const scripts = [
    '/conjuring_db.js',
    '/magilib_price_db.js',
    '/magilib_disc_db.js',
    '/magilib_market_db.js'
  ];
  scripts.forEach(function(src) {
    if (document.querySelector('script[src="' + src + '"]')) return; // already loaded
    var s = document.createElement('script');
    s.src = src;
    s.async = true;
    document.head.appendChild(s);
  });
}

function authSwitchMode() {
  _authMode = _authMode === 'signin' ? 'signup' : 'signin';
  const isSignup = _authMode === 'signup';
  document.getElementById('authTitle').textContent = isSignup ? 'Create your account' : 'Welcome back';
  document.getElementById('authSub').textContent = isSignup ? 'Start cataloguing your magic collection' : 'Sign in to your MagiLib collection';
  document.getElementById('authUsernameField').style.display = isSignup ? '' : 'none';
  document.getElementById('authConfirmField').style.display = isSignup ? '' : 'none';
  document.getElementById('authPassword').autocomplete = isSignup ? 'new-password' : 'current-password';
  document.getElementById('authConfirmPassword').value = '';
  document.getElementById('authSubmitBtn').textContent = isSignup ? 'Create Account' : 'Sign In';
  document.getElementById('authToggle').innerHTML = isSignup
    ? 'Already have an account? <a onclick="authSwitchMode()">Sign in</a>'
    : "Don't have an account? <a onclick='authSwitchMode()'>Create one</a>";
  document.getElementById('authError').classList.remove('show');
  document.getElementById('authSuccess').classList.remove('show');
  const forgotLink = document.getElementById('authForgotLink');
  if (forgotLink) forgotLink.style.display = isSignup ? 'none' : '';
}

async function saveNewPassword() {
  const pw = document.getElementById('resetPassword').value;
  const confirm = document.getElementById('resetConfirmPassword').value;
  const statusEl = document.getElementById('resetStatus');
  statusEl.style.color = '#b91c1c';
  statusEl.textContent = '';
  if (!pw || pw.length < 6) { statusEl.textContent = 'Password must be at least 6 characters.'; return; }
  if (pw !== confirm) { statusEl.textContent = 'Passwords do not match.'; return; }
  const btn = document.getElementById('resetPasswordBtn');
  btn.disabled = true; btn.textContent = 'Saving…';
  const { error } = await _supa.auth.updateUser({ password: pw });
  btn.disabled = false; btn.textContent = 'Save Password';
  if (error) { statusEl.textContent = error.message || 'Could not update password.'; return; }
  statusEl.style.color = '#166534';
  statusEl.textContent = 'Password updated! Taking you to your library…';
  setTimeout(() => {
    document.getElementById('reset-password-form').style.display = 'none';
    showView('entry');
  }, 1800);
}

async function changePasswordFromSettings(btn) {
  const currentPw = document.getElementById('s-current-password').value;
  const pw = document.getElementById('s-new-password').value;
  const confirmPw = document.getElementById('s-confirm-password').value;
  const statusEl = document.getElementById('s-password-status');
  statusEl.textContent = '';
  if (!window._isOnline) { statusEl.textContent = "You're offline — connect to change your password."; return; }
  if (!currentPw) { statusEl.textContent = 'Enter your current password.'; return; }
  if (!pw || pw.length < 6) { statusEl.textContent = 'New password must be at least 6 characters.'; return; }
  if (pw !== confirmPw) { statusEl.textContent = 'New passwords do not match.'; return; }
  btn.disabled = true; btn.textContent = 'Updating…';
  const { error: signInErr } = await _supa.auth.signInWithPassword({ email: _supaUser.email, password: currentPw });
  if (signInErr) {
    btn.disabled = false; btn.textContent = 'Update Password';
    statusEl.textContent = 'Current password is incorrect.';
    return;
  }
  const { error } = await _supa.auth.updateUser({ password: pw });
  btn.disabled = false; btn.textContent = 'Update Password';
  if (error) { statusEl.textContent = error.message || 'Could not update password.'; return; }
  document.getElementById('s-current-password').value = '';
  document.getElementById('s-new-password').value = '';
  document.getElementById('s-confirm-password').value = '';
  showToast('Password updated ✓', 'success', 2500);
}

async function forgotPassword() {
  const email = document.getElementById('authEmail').value.trim();
  const successEl = document.getElementById('authSuccess');
  const btn = document.getElementById('authForgotLink');
  successEl.classList.remove('show');
  document.getElementById('authError').classList.remove('show');
  if (!email) { showAuthError('Enter your email address above first.'); return; }
  btn.disabled = true;
  btn.textContent = 'Sending…';
  const { error } = await _supa.auth.resetPasswordForEmail(email, { redirectTo: 'https://magilib.vercel.app' });
  btn.disabled = false;
  btn.textContent = 'Forgot password?';
  if (error) { showAuthError(error.message || 'Could not send reset email.'); return; }
  successEl.textContent = 'Check your email for a password reset link.';
  successEl.classList.add('show');
}

function showAuthError(msg) {
  const el = document.getElementById('authError');
  el.textContent = msg;
  el.classList.add('show');
}

async function signInWithGoogle() {
  const btn = document.querySelector('.auth-google-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Redirecting…'; }
  const { error } = await _supa.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin }
  });
  if (error) {
    if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 18 18" style="vertical-align:middle;margin-right:8px;" xmlns="http://www.w3.org/2000/svg"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/><path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/></svg>Continue with Google'; }
    showAuthError(error.message || 'Google sign-in failed.');
  }
}

async function authSubmit() {
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const usernameEl = document.getElementById('authUsername');
  const username = usernameEl ? usernameEl.value.trim() : '';
  const btn = document.getElementById('authSubmitBtn');
  if (!email || !password) { showAuthError('Email and password are required.'); return; }
  if (password.length < 6) { showAuthError('Password must be at least 6 characters.'); return; }
  if (_authMode === 'signup') {
    const confirmPw = document.getElementById('authConfirmPassword').value;
    if (password !== confirmPw) { showAuthError('Passwords do not match.'); return; }
  }
  btn.disabled = true;
  btn.textContent = _authMode === 'signup' ? 'Creating account…' : 'Signing in…';
  document.getElementById('authError').classList.remove('show');
  try {
    if (_authMode === 'signup') {
      await _supa.auth.signOut(); // ensure clean session before creating new account
      const { data, error } = await _supa.auth.signUp({ email, password, options: { data: { username: username || null } } });
      if (error) throw error;
      if (data.user && !data.session) {
        btn.disabled = false; btn.textContent = 'Create Account';
        showAuthError('Check your email to confirm your account, then sign in.');
        return;
      }
      _supaUser = data.user;
      // Ensure welcome screen always shows for new signups, regardless of device history
      try { const _s = JSON.parse(localStorage.getItem('arcana_books_v2') || '{}'); delete _s.welcomeSeen; localStorage.setItem('arcana_books_v2', JSON.stringify(_s)); } catch(e) {}
    } else {
      const { data, error } = await _supa.auth.signInWithPassword({ email, password });
      if (error) throw error;
      _supaUser = data.user;
    }
    await onAuthSuccess();
  } catch(e) {
    btn.disabled = false;
    btn.textContent = _authMode === 'signup' ? 'Create Account' : 'Sign In';
    showAuthError(e.message || 'Authentication failed. Please try again.');
  }
}

async function onAuthSuccess() {
  S.books = []; // clear any stale library data from previous session
  loadStaticDBs(); // fire-and-forget: 3.4 MB of DB scripts loaded only after auth
  const _profileFallback = new Promise(resolve => setTimeout(() => resolve({ data: null }), 5000));
  const { data: profile } = await Promise.race([
    _supa.from('profiles').select('*').eq('id', _supaUser.id).single(),
    _profileFallback
  ]).catch(() => ({ data: null }));
  S.profile = profile || {};
  updateUserMenu();
  document.getElementById('authScreen').classList.add('hidden');
  loadSettings();
  showSplash();
}

function updateUserMenu() {
  const btn = document.getElementById('userMenuBtn');
  const nameEl = document.getElementById('userMenuName');
  const settingsAvatar = document.getElementById('settingsAvatar');
  const settingsDisplayName = document.getElementById('settingsDisplayName');
  const settingsEmail = document.getElementById('settingsEmail');
  const welcomeNameEl = document.getElementById('welcomeName');
  const usernameInput = document.getElementById('s-username');
  const displayName = (S.profile && S.profile.username) || (_supaUser && _supaUser.email ? _supaUser.email.split('@')[0] : 'Collector');
  const email = (_supaUser && _supaUser.email) || '';
  const initials = displayName.split(/\s+/).filter(Boolean).length > 1
    ? displayName.split(/\s+/).map(w=>w[0]).join('').slice(0,2).toUpperCase()
    : displayName.slice(0,2).toUpperCase();
  if (btn) { btn.style.display = 'flex'; btn.textContent = initials; }
  if (nameEl) nameEl.textContent = displayName;
  if (settingsAvatar) settingsAvatar.textContent = initials;
  if (settingsDisplayName) settingsDisplayName.textContent = displayName;
  if (settingsEmail) settingsEmail.textContent = email;
  if (welcomeNameEl) welcomeNameEl.textContent = displayName;
  if (usernameInput && S.profile && S.profile.username) usernameInput.value = S.profile.username;
}

function toggleUserMenu() { document.getElementById('userDropdown').classList.toggle('open'); }
function closeUserMenu() { document.getElementById('userDropdown').classList.remove('open'); }
function toggleNavMenu() { document.getElementById('navMenu').classList.toggle('open'); }
function closeNavMenu() { document.getElementById('navMenu').classList.remove('open'); }
document.addEventListener('click', function(e) {
  if (!e.target.closest('#userMenuBtn') && !e.target.closest('#userDropdown')) closeUserMenu();
  if (!e.target.closest('#hamburgerBtn') && !e.target.closest('#navMenu')) closeNavMenu();
});

async function signOut() {
  await _supa.auth.signOut();
  _supaUser = null; S.books = []; S.profile = {};
  if (typeof renderCatalog === 'function') renderCatalog();
  // Close all overlays so nothing blocks auth inputs on iOS
  ['editModalOverlay','coverPickerOverlay','magiDialogOverlay'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.classList.add('hidden'); el.style.pointerEvents = 'none'; }
  });
  document.querySelectorAll('.magi-sheet-overlay.is-active, .modal-overlay:not(.hidden)').forEach(el => {
    el.classList.remove('is-active'); el.classList.add('hidden');
  });
  document.getElementById('userMenuBtn').style.display = 'none';
  document.getElementById('authScreen').classList.remove('hidden');
  _authMode = 'signin';
  document.getElementById('authTitle').textContent = 'Welcome back';
  document.getElementById('authSub').textContent = 'Sign in to your MagiLib collection';
  document.getElementById('authUsernameField').style.display = 'none';
  document.getElementById('authConfirmField').style.display = 'none';
  document.getElementById('authConfirmPassword').value = '';
  document.getElementById('authPassword').autocomplete = 'current-password';
  document.getElementById('authSubmitBtn').textContent = 'Sign In';
  document.getElementById('authToggle').innerHTML = "Don't have an account? <a onclick='authSwitchMode()'>Create one</a>";
  document.getElementById('authSuccess').classList.remove('show');
  const forgotLink = document.getElementById('authForgotLink');
  if (forgotLink) forgotLink.style.display = '';
  document.getElementById('authSubmitBtn').disabled = false;
  document.getElementById('authError').classList.remove('show');
  closeUserMenu();
  // Restore pointer-events on auth inputs (defensive — clears any residual block)
  const authScreen = document.getElementById('authScreen');
  if (authScreen) authScreen.style.pointerEvents = '';
  // Focus email field after paint so iOS keyboard appears
  setTimeout(() => {
    const emailEl = document.getElementById('authEmail');
    if (emailEl) { emailEl.removeAttribute('disabled'); emailEl.focus(); }
  }, 350);
}
function confirmDeleteAccount() {
  magiConfirm({
    title: 'Delete your account?',
    message: 'This will permanently erase your entire library and account. This action cannot be undone.',
    confirmText: 'Yes, delete everything',
    onConfirm: () => {
      magiConfirm({
        title: 'Are you absolutely sure?',
        message: 'All ' + S.books.length + ' book' + (S.books.length !== 1 ? 's' : '') + ' and your account will be permanently deleted. There is no recovery.',
        confirmText: 'Delete permanently',
        onConfirm: async () => {
          try {
            const { error: bErr } = await _supa.from('books').delete().eq('user_id', _supaUser.id);
            if (bErr) { showToast('Could not delete account. Contact support.', 'error', 4000); return; }
            const { error: pErr } = await _supa.from('profiles').delete().eq('id', _supaUser.id);
            if (pErr) { showToast('Could not delete account. Contact support.', 'error', 4000); return; }
            await _supa.auth.admin ? _supa.auth.admin.deleteUser(_supaUser.id) : _supa.rpc('delete_user');
            await _supa.auth.signOut();
            showToast('Account deleted.', 'success', 3000);
            setTimeout(() => location.reload(), 1500);
          } catch(e) {
            showToast('Could not delete account. Contact support.', 'error', 4000);
          }
        }
      });
    }
  });
}

function confirmDeleteLibrary() {
  const n = S.books ? S.books.length : 0;
  magiConfirm({
    title: 'Delete your library?',
    message: 'This will permanently delete all ' + n + ' book' + (n !== 1 ? 's' : '') + ' from your library. Your account will remain active.',
    confirmText: 'Yes, delete library',
    onConfirm: () => {
      magiConfirm({
        title: 'Are you absolutely sure?',
        message: 'All ' + n + ' book' + (n !== 1 ? 's' : '') + ' will be permanently deleted. This cannot be undone.',
        confirmText: 'Delete permanently',
        onConfirm: async () => {
          try {
            const { error } = await _supa.from('books').delete().eq('user_id', _supaUser.id);
            if (error) { showToast('Could not delete library. Contact support.', 'error', 4000); return; }
            S.books = [];
            if (typeof renderCatalog === 'function') renderCatalog();
            showToast('Library deleted.', 'success', 3000);
          } catch(e) {
            showToast('Could not delete library. Contact support.', 'error', 4000);
          }
        }
      });
    }
  });
}
window.confirmDeleteLibrary = confirmDeleteLibrary;

function confirmSignOut() {
  magiConfirm({
    title: 'Sign out?',
    message: 'You\'ll need to sign back in to access your collection.',
    confirmText: 'Sign Out',
    onConfirm: signOut
  });
}

let _usernameSaveTimer = null;
function saveUsernameDebounced() {
  clearTimeout(_usernameSaveTimer);
  _usernameSaveTimer = setTimeout(async () => {
    const username = document.getElementById('s-username').value.trim();
    if (!_supaUser || !username) return;
    const { error } = await _supa.from('profiles').update({ username }).eq('id', _supaUser.id);
    if (error) { showToast('Could not update display name.', 'error', 2500); return; }
    if (!S.profile) S.profile = {};
    S.profile.username = username;
    updateUserMenu();
    showToast('Display name updated ✓', 'success', 2000);
  }, 800);
}

// ── WELCOME SCREEN ──
function _markWelcomeSeen() {
  try {
    const s = JSON.parse(localStorage.getItem('arcana_books_v2') || '{}');
    s.welcomeSeen = true;
    localStorage.setItem('arcana_books_v2', JSON.stringify(s));
  } catch(e) {}
}

function startWizardTour() {
  document.getElementById('welcomeScreen').classList.add('hidden');
  _markWelcomeSeen();
  openWizard(true);
}

function dismissWelcome(action) {
  document.getElementById('welcomeScreen').classList.add('hidden');
  _markWelcomeSeen();
  if (action === 'import') {
    showView('settings');
    setTimeout(() => { const el = document.getElementById('csvImportSection'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }, 200);
  } else {
    showView('home');
    if (typeof loadCatalog === 'function') loadCatalog();
  }
}

// ── CSV IMPORT ──