let _authMode = 'signin';

function authSwitchMode() {
  _authMode = _authMode === 'signin' ? 'signup' : 'signin';
  const isSignup = _authMode === 'signup';
  document.getElementById('authTitle').textContent = isSignup ? 'Create your account' : 'Welcome back';
  document.getElementById('authSub').textContent = isSignup ? 'Start cataloguing your magic collection' : 'Sign in to your MagiLib collection';
  document.getElementById('authUsernameField').style.display = isSignup ? '' : 'none';
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
  const statusEl = document.getElementById('resetStatus');
  statusEl.style.color = '#b91c1c';
  statusEl.textContent = '';
  if (!pw || pw.length < 6) { statusEl.textContent = 'Password must be at least 6 characters.'; return; }
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
  const pw = document.getElementById('s-new-password').value;
  const statusEl = document.getElementById('s-password-status');
  statusEl.style.color = '#b91c1c';
  statusEl.textContent = '';
  if (!pw || pw.length < 6) { statusEl.textContent = 'Password must be at least 6 characters.'; return; }
  btn.disabled = true; btn.textContent = 'Updating…';
  const { error } = await _supa.auth.updateUser({ password: pw });
  btn.disabled = false; btn.textContent = 'Update Password';
  if (error) { statusEl.textContent = error.message || 'Could not update password.'; return; }
  statusEl.style.color = '#166534';
  statusEl.textContent = 'Password updated!';
  document.getElementById('s-new-password').value = '';
  setTimeout(() => { statusEl.textContent = ''; }, 3000);
}

async function forgotPassword() {
  const email = document.getElementById('authEmail').value.trim();
  const successEl = document.getElementById('authSuccess');
  successEl.classList.remove('show');
  document.getElementById('authError').classList.remove('show');
  if (!email) { showAuthError('Enter your email address above first.'); return; }
  const { error } = await _supa.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
  if (error) { showAuthError(error.message || 'Could not send reset email.'); return; }
  successEl.textContent = 'Check your email for a password reset link.';
  successEl.classList.add('show');
}

function showAuthError(msg) {
  const el = document.getElementById('authError');
  el.textContent = msg;
  el.classList.add('show');
}

async function authSubmit() {
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const usernameEl = document.getElementById('authUsername');
  const username = usernameEl ? usernameEl.value.trim() : '';
  const btn = document.getElementById('authSubmitBtn');
  if (!email || !password) { showAuthError('Email and password are required.'); return; }
  if (password.length < 6) { showAuthError('Password must be at least 6 characters.'); return; }
  btn.disabled = true;
  btn.textContent = _authMode === 'signup' ? 'Creating account…' : 'Signing in…';
  document.getElementById('authError').classList.remove('show');
  try {
    if (_authMode === 'signup') {
      const { data, error } = await _supa.auth.signUp({ email, password, options: { data: { username: username || null } } });
      if (error) throw error;
      if (data.user && !data.session) {
        btn.disabled = false; btn.textContent = 'Create Account';
        showAuthError('Check your email to confirm your account, then sign in.');
        return;
      }
      _supaUser = data.user;
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
  const { data: profile } = await _supa.from('profiles').select('*').eq('id', _supaUser.id).single();
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
document.addEventListener('click', function(e) {
  if (!e.target.closest('#userMenuBtn') && !e.target.closest('#userDropdown')) closeUserMenu();
});

async function signOut() {
  await _supa.auth.signOut();
  _supaUser = null; S.books = []; S.profile = {};
  document.getElementById('userMenuBtn').style.display = 'none';
  document.getElementById('authScreen').classList.remove('hidden');
  _authMode = 'signin';
  document.getElementById('authTitle').textContent = 'Welcome back';
  document.getElementById('authSub').textContent = 'Sign in to your MagiLib collection';
  document.getElementById('authUsernameField').style.display = 'none';
  document.getElementById('authSubmitBtn').textContent = 'Sign In';
  document.getElementById('authToggle').innerHTML = "Don't have an account? <a onclick='authSwitchMode()'>Create one</a>";
  document.getElementById('authSuccess').classList.remove('show');
  const forgotLink = document.getElementById('authForgotLink');
  if (forgotLink) forgotLink.style.display = '';
  closeUserMenu();
}
function confirmSignOut() { if (confirm('Sign out of MagiLib?')) signOut(); }

let _usernameSaveTimer = null;
function saveUsernameDebounced() {
  clearTimeout(_usernameSaveTimer);
  _usernameSaveTimer = setTimeout(async () => {
    const username = document.getElementById('s-username').value.trim();
    if (!_supaUser || !username) return;
    await _supa.from('profiles').update({ username }).eq('id', _supaUser.id);
    if (!S.profile) S.profile = {};
    S.profile.username = username;
    updateUserMenu();
    showToast('Display name updated ✓', 'success', 2000);
  }, 800);
}

// ── WELCOME SCREEN ──
function dismissWelcome(action) {
  document.getElementById('welcomeScreen').classList.add('hidden');
  try {
    const s = JSON.parse(localStorage.getItem('arcana_books_v2') || '{}');
    s.welcomeSeen = true;
    localStorage.setItem('arcana_books_v2', JSON.stringify(s));
  } catch(e) {}
  if (action === 'import') {
    showView('settings');
    setTimeout(() => { const el = document.getElementById('csvImportSection'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }, 200);
  } else {
    showView('entry');
  }
}

// ── CSV IMPORT ──