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

export function getAuthToken() {
  return getSession() ? 'cookie-session' : '';
}

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

export function saveUserSession(token, user) {
  dropLegacyTokens();
  localStorage.removeItem('admin_user');
  localStorage.setItem('tsukuyomi_user', JSON.stringify(user));
}

export function updateStoredUser(user) {
  localStorage.setItem('tsukuyomi_user', JSON.stringify(user));
}

export function clearSession() {
  dropLegacyTokens();
  localStorage.removeItem('tsukuyomi_user');
  localStorage.removeItem('admin_user');
}

export function authHeaders(extra = {}) {
  return { ...extra };
}

export function authFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    credentials: options.credentials || 'include'
  });
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
