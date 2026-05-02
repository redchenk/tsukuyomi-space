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
  return localStorage.getItem('tsukuyomi_token') || localStorage.getItem('admin_token') || '';
}

export function getSession() {
  let token = localStorage.getItem('admin_token');
  let userStr = localStorage.getItem('admin_user');
  let admin = true;

  if (!token || !userStr) {
    token = localStorage.getItem('tsukuyomi_token');
    userStr = localStorage.getItem('tsukuyomi_user');
    admin = false;
  }

  if (!token || !userStr) return null;

  try {
    return { token, user: JSON.parse(userStr), admin };
  } catch (_) {
    return null;
  }
}

export function saveUserSession(token, user) {
  localStorage.removeItem('admin_token');
  localStorage.removeItem('admin_user');
  localStorage.setItem('tsukuyomi_token', token);
  localStorage.setItem('tsukuyomi_user', JSON.stringify(user));
}

export function updateStoredUser(user) {
  localStorage.setItem('tsukuyomi_user', JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem('tsukuyomi_token');
  localStorage.removeItem('tsukuyomi_user');
  localStorage.removeItem('admin_token');
  localStorage.removeItem('admin_user');
}

export function authHeaders(extra = {}) {
  const token = getAuthToken();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
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
