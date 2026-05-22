export async function parseResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : { success: false, message: `HTTP ${response.status}` };
  } catch (_) {
    return {
      success: false,
      message: text.replace(/<[^>]*>/g, '').trim().slice(0, 120) || `HTTP ${response.status}`
    };
  }
}

export function apiUrl(url) {
  const value = String(url || '');
  if (/^https?:\/\//i.test(value)) return value;
  if (!value.startsWith('/api')) return value;
  if (typeof window === 'undefined') return value;

  const override = localStorage.getItem('tsukuyomi_api_base_url') || '';
  let base = override.trim().replace(/\/+$/, '');
  if (!base && ['yachiyo.hk', 'www.yachiyo.hk'].includes(window.location.hostname)) {
    base = 'https://origin.yachiyo.hk';
  }
  return base ? `${base}${value}` : value;
}

export function getAuthToken() {
  return getSession() ? 'cookie-session' : '';
}

let sessionRequest = null;
let sessionRevision = 0;

function dropLegacyTokens() {
  localStorage.removeItem('tsukuyomi_token');
  localStorage.removeItem('admin_token');
}

export function getSession() {
  dropLegacyTokens();
  let userStr = localStorage.getItem('admin_user');
  let admin = true;

  if (!userStr) {
    userStr = localStorage.getItem('tsukuyomi_user');
    admin = false;
  }

  if (!userStr) return null;

  try {
    return { token: '', user: JSON.parse(userStr), admin };
  } catch (_) {
    return null;
  }
}

function saveAdminSession(user) {
  dropLegacyTokens();
  localStorage.removeItem('tsukuyomi_user');
  localStorage.setItem('admin_user', JSON.stringify(user));
  sessionRevision += 1;
  sessionRequest = null;
}

export function saveUserSession(token, user) {
  dropLegacyTokens();
  localStorage.removeItem('admin_user');
  localStorage.setItem('tsukuyomi_user', JSON.stringify(user));
  sessionRevision += 1;
  sessionRequest = null;
}

export function updateStoredUser(user) {
  localStorage.setItem('tsukuyomi_user', JSON.stringify(user));
  sessionRevision += 1;
  sessionRequest = null;
}

export function clearSession() {
  dropLegacyTokens();
  localStorage.removeItem('tsukuyomi_user');
  localStorage.removeItem('admin_user');
  sessionRevision += 1;
  sessionRequest = null;
}

export function authHeaders(extra = {}) {
  return { ...extra };
}

export function authFetch(url, options = {}) {
  return fetch(apiUrl(url), {
    ...options,
    credentials: options.credentials || 'include'
  });
}

async function resolveCurrentSession({ allowClear = true } = {}) {
  dropLegacyTokens();
  const startedRevision = sessionRevision;

  try {
    const response = await authFetch(noStoreUrl('/api/auth/me'), {
      headers: authHeaders({ Accept: 'application/json' }),
      cache: 'no-store'
    });
    const result = await parseResponse(response);
    if (result.success && result.data) {
      saveUserSession('', result.data);
      return { user: result.data, admin: false };
    }
  } catch (_) {
    // Fall through to optional admin session validation.
  }

  const hadAdminHint = Boolean(localStorage.getItem('admin_user'));
  if (hadAdminHint) {
    try {
      const response = await authFetch(noStoreUrl('/api/admin/me'), {
        headers: authHeaders({ Accept: 'application/json' }),
        cache: 'no-store'
      });
      const result = await parseResponse(response);
      if (result.success && result.data) {
        saveAdminSession(result.data);
        return { user: result.data, admin: true };
      }
    } catch (_) {
      // Missing or invalid cookies mean the visitor is anonymous.
    }
  }

  if (allowClear && startedRevision === sessionRevision) clearSession();
  return null;
}

export async function loadCurrentSession(options = {}) {
  if (!sessionRequest) {
    sessionRequest = resolveCurrentSession(options).finally(() => {
      sessionRequest = null;
    });
  }
  return sessionRequest;
}

export async function logoutSession() {
  try {
    await authFetch('/api/auth/logout', { method: 'POST' });
  } catch (_) {
    // Client-side cleanup still matters if the network request fails.
  }
  clearSession();
}

export function noStoreUrl(url) {
  const value = String(url || '');
  const hashIndex = value.indexOf('#');
  const base = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
  const hash = hashIndex >= 0 ? value.slice(hashIndex) : '';
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}_=${Date.now()}${hash}`;
}

export function countdown(target, resetLabel) {
  let left = 60;
  target.loading = true;
  const timer = setInterval(() => {
    left -= 1;
    target.label = `${left}s`;
    if (left <= 0) {
      clearInterval(timer);
      target.loading = false;
      target.label = resetLabel;
    }
  }, 1000);
}
