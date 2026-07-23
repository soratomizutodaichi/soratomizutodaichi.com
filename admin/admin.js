/**
 * 管理者画面 共通ロジック
 *
 * A案: Supabase Auth + REST 直アクセス
 * B案への移行準備: adminApiMode を切り替えるだけで
 * Edge Function 経由へ寄せられる構造にしている。
 */

const ADMIN_AUTH_STORAGE_KEY = 'admin_auth_session_v1';
const TOKEN_REFRESH_SKEW_SEC = 60;

function getConfig() {
  if (!window.SUPABASE_CONFIG || !window.SUPABASE_CONFIG.enabled) {
    throw new Error('Supabase 設定が読み込まれていません。../data/supabase-config.js を確認してください。');
  }
  return window.SUPABASE_CONFIG;
}

function isLoginPage() {
  return window.location.pathname.endsWith('/login.html');
}

function getNextPath() {
  const params = new URLSearchParams(window.location.search);
  const next = (params.get('next') || 'dashboard.html').trim();
  if (!next || next.includes('http://') || next.includes('https://') || next.startsWith('/')) {
    return 'dashboard.html';
  }
  return next;
}

function redirectToLogin() {
  if (isLoginPage()) return;
  const next = window.location.pathname.split('/').pop() || 'dashboard.html';
  const query = new URLSearchParams({ next }).toString();
  window.location.replace(`login.html?${query}`);
}

function readSession() {
  try {
    const raw = localStorage.getItem(ADMIN_AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.accessToken) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function writeSession(payload) {
  const expiresIn = Number(payload.expires_in || payload.expiresIn || 3600);
  const expiresAt = Date.now() + (expiresIn * 1000);
  const session = {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token || null,
    expiresAt,
    user: payload.user || null
  };
  localStorage.setItem(ADMIN_AUTH_STORAGE_KEY, JSON.stringify(session));
  return session;
}

function clearSession() {
  localStorage.removeItem(ADMIN_AUTH_STORAGE_KEY);
}

function needsRefresh(session) {
  if (!session || !session.expiresAt) return true;
  return Date.now() >= (session.expiresAt - TOKEN_REFRESH_SKEW_SEC * 1000);
}

async function authRequest(grantType, payload) {
  const config = getConfig();
  const url = `${config.url}/auth/v1/token?grant_type=${encodeURIComponent(grantType)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': config.anonKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body.error_description || body.msg || body.error || `Auth failed: ${res.status}`;
    throw new Error(msg);
  }
  return body;
}

async function refreshSession(session) {
  if (!session || !session.refreshToken) return null;
  const body = await authRequest('refresh_token', { refresh_token: session.refreshToken });
  return writeSession(body);
}

async function getAccessTokenOrRedirect() {
  let session = readSession();
  if (!session) {
    redirectToLogin();
    return null;
  }

  if (needsRefresh(session)) {
    try {
      session = await refreshSession(session);
    } catch (_) {
      clearSession();
      redirectToLogin();
      return null;
    }
  }

  return session ? session.accessToken : null;
}

function getAdminApiMode(config) {
  return config.adminApiMode || 'rest-direct';
}

async function baseHeaders() {
  const config = getConfig();
  const token = await getAccessTokenOrRedirect();
  if (!token) throw new Error('管理者ログインが必要です。');
  return {
    apikey: config.anonKey,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  };
}

async function callRestDirect(action, table, payload) {
  const config = getConfig();
  const headers = await baseHeaders();

  if (action === 'list') {
    const params = new URLSearchParams({ select: '*' });
    if (payload.order) params.set('order', payload.order);
    const url = `${config.url}/rest/v1/${table}?${params.toString()}`;
    let res = await fetch(url, { headers });
    // authenticated ロールの RLS ポリシーが未設定の場合、anon キーでフォールバック
    if (res.status === 403 || res.status === 401) {
      const anonHeaders = {
        apikey: config.anonKey,
        'Content-Type': 'application/json'
      };
      res = await fetch(url, { headers: anonHeaders });
    }
    if (!res.ok) throw new Error(`GET ${table} failed: ${res.status}`);
    return res.json();
  }

  if (action === 'insert') {
    const url = `${config.url}/rest/v1/${table}`;
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload.data)
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`INSERT ${table} failed: ${res.status} - ${err}`);
    }
    return res.json();
  }

  if (action === 'update') {
    const url = `${config.url}/rest/v1/${table}?id=eq.${payload.id}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(payload.data)
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`UPDATE ${table} id=${payload.id} failed: ${res.status} - ${err}`);
    }
    return res.json();
  }

  if (action === 'delete') {
    const url = `${config.url}/rest/v1/${table}?id=eq.${payload.id}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`DELETE ${table} id=${payload.id} failed: ${res.status} - ${err}`);
    }
    return true;
  }

  throw new Error(`Unknown action: ${action}`);
}

async function callEdgeFunction(action, table, payload) {
  const config = getConfig();
  const functionName = config.adminFunctionName || 'admin-content';
  const headers = await baseHeaders();
  const url = `${config.url}/functions/v1/${functionName}`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, table, ...payload })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || `Edge function failed: ${res.status}`);
  }
  return body.data;
}

async function callAdminApi(action, table, payload) {
  const config = getConfig();
  const mode = getAdminApiMode(config);
  if (mode === 'rest-direct') return callRestDirect(action, table, payload || {});
  if (mode === 'edge-function') return callEdgeFunction(action, table, payload || {});
  throw new Error(`Unsupported adminApiMode: ${mode}`);
}

async function fetchRecords(table, orderParam) {
  return callAdminApi('list', table, { order: orderParam || null });
}

async function insertRecord(table, data) {
  return callAdminApi('insert', table, { data });
}

async function updateRecord(table, id, data) {
  return callAdminApi('update', table, { id, data });
}

async function deleteRecord(table, id) {
  return callAdminApi('delete', table, { id });
}

// フィルタ付きで取得（例: filter = 'contact_id=eq.5'）
async function fetchRecordsWhere(table, filter, orderParam) {
  const config = getConfig();
  const headers = await baseHeaders();
  const params = new URLSearchParams({ select: '*' });
  if (orderParam) params.set('order', orderParam);
  let url = `${config.url}/rest/v1/${table}?${params.toString()}`;
  if (filter) url += `&${filter}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GET ${table} failed: ${res.status}`);
  return res.json();
}

// Edge Function をログイン管理者のトークン付きで呼び出す
async function invokeFunction(name, payload) {
  const config = getConfig();
  const headers = await baseHeaders();
  const res = await fetch(`${config.url}/functions/v1/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload || {})
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || `Function ${name} failed: ${res.status}`);
  }
  return body;
}

async function adminSignIn(email, password) {
  const body = await authRequest('password', { email, password });
  writeSession(body);
  return body;
}

function adminSignOut() {
  clearSession();
  redirectToLogin();
}

function isSignedIn() {
  return !!readSession();
}

function ensureLogoutButton() {
  if (isLoginPage()) return;
  const header = document.querySelector('.admin-header');
  if (!header || document.getElementById('admin-logout-btn')) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'admin-logout-btn';
  btn.className = 'admin-header__logout';
  btn.textContent = 'ログアウト';
  btn.addEventListener('click', adminSignOut);
  header.appendChild(btn);
}

function hideDevBannerWhenAuthenticated() {
  if (isLoginPage()) return;
  const banner = document.querySelector('.dev-banner');
  if (banner) banner.style.display = 'none';
}

async function initAdminAuth() {
  if (isLoginPage()) {
    if (isSignedIn()) {
      window.location.replace(getNextPath());
    }
    return;
  }

  await getAccessTokenOrRedirect();
  ensureLogoutButton();
  hideDevBannerWhenAuthenticated();
}

window.fetchRecords = fetchRecords;
window.insertRecord = insertRecord;
window.updateRecord = updateRecord;
window.deleteRecord = deleteRecord;
window.fetchRecordsWhere = fetchRecordsWhere;
window.invokeFunction = invokeFunction;
window.showMsg = showMsg;
window.escapeHtml = escapeHtml;
window.confirmDelete = confirmDelete;
window.adminSignIn = adminSignIn;
window.adminSignOut = adminSignOut;
window.adminAuthReady = initAdminAuth();

function showMsg(el, text, type) {
  el.textContent = text;
  el.className = `msg msg--${type} show`;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.classList.remove('show'); }, 5000);
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function confirmDelete(title) {
  return confirm(`「${title}」を削除しますか？\nこの操作は取り消せません。`);
}
