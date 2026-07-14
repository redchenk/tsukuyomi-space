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

  const isLocalDevelopment = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
  const override = isLocalDevelopment ? localStorage.getItem('tsukuyomi_api_base_url') || '' : '';
  const base = override.trim().replace(/\/+$/, '');
  return base ? `${base}${value}` : value;
}

export function getAuthToken() {
  return getSession() ? 'cookie-session' : '';
}

let sessionRequest = null;
let sessionRequestCanClear = true;
let sessionRevision = 0;
let trustedSessionUntil = 0;
let publicStatsRequest = null;
let publicStatsCache = null;

const PUBLIC_STATS_CACHE_KEY = 'tsukuyomi_public_stats_cache';

function dropLegacyTokens() {
  localStorage.removeItem('tsukuyomi_token');
  localStorage.removeItem('admin_token');
}

function isOAuthPlaceholderEmail(email) {
  return String(email || '').trim().toLowerCase().endsWith('@oauth.yachiyo.local');
}

function sanitizeUser(user) {
  if (!user || typeof user !== 'object') return user;
  const next = { ...user };
  if (isOAuthPlaceholderEmail(next.email)) {
    next.email = '';
    next.has_real_email = false;
  }
  return next;
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
    return { token: '', user: sanitizeUser(JSON.parse(userStr)), admin };
  } catch (_) {
    return null;
  }
}

function saveAdminSession(user) {
  dropLegacyTokens();
  localStorage.removeItem('tsukuyomi_user');
  localStorage.setItem('admin_user', JSON.stringify(user));
  trustedSessionUntil = Date.now() + 8000;
  sessionRevision += 1;
  sessionRequest = null;
}

export function saveUserSession(token, user) {
  dropLegacyTokens();
  localStorage.removeItem('admin_user');
  localStorage.setItem('tsukuyomi_user', JSON.stringify(sanitizeUser(user)));
  trustedSessionUntil = Date.now() + 8000;
  sessionRevision += 1;
  sessionRequest = null;
}

export function updateStoredUser(user) {
  localStorage.setItem('tsukuyomi_user', JSON.stringify(sanitizeUser(user)));
  trustedSessionUntil = Date.now() + 8000;
  sessionRevision += 1;
  sessionRequest = null;
}

export function clearSession() {
  dropLegacyTokens();
  localStorage.removeItem('tsukuyomi_user');
  localStorage.removeItem('admin_user');
  trustedSessionUntil = 0;
  sessionRevision += 1;
  sessionRequest = null;
}

export function authHeaders(extra = {}) {
  return { ...extra };
}

function secureApiOptions(url, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method) || !String(url || '').startsWith('/api')) return options;
  const headers = new Headers(options.headers || {});
  headers.set('X-Requested-With', 'XMLHttpRequest');
  return { ...options, headers };
}

export function authFetch(url, options = {}) {
  return fetch(apiUrl(url), {
    ...secureApiOptions(url, options),
    credentials: options.credentials || 'include'
  });
}

export function apiFetch(url, options = {}) {
  return fetch(apiUrl(url), secureApiOptions(url, options));
}

export function apiBeacon(url, data) {
  if (typeof navigator === 'undefined' || !navigator.sendBeacon) return false;
  return navigator.sendBeacon(apiUrl(url), data);
}

function isAuthFailure(response, result) {
  const status = Number(response?.status || 0);
  const code = String(result?.code || '').toUpperCase();
  return status === 401
    || status === 403
    || ['UNAUTHORIZED', 'TOKEN_EXPIRED', 'TOKEN_INVALID', 'TOKEN_REVOKED', 'FORBIDDEN'].includes(code);
}

function readPublicStatsCache() {
  if (publicStatsCache) return publicStatsCache;
  if (typeof sessionStorage === 'undefined') return null;

  try {
    const parsed = JSON.parse(sessionStorage.getItem(PUBLIC_STATS_CACHE_KEY) || 'null');
    if (!parsed || typeof parsed !== 'object' || !parsed.data) return null;
    publicStatsCache = {
      data: parsed.data,
      cachedAt: Number(parsed.cachedAt || 0)
    };
    return publicStatsCache;
  } catch (_) {
    return null;
  }
}

export function setPublicStatsCache(data) {
  if (!data || typeof data !== 'object') return null;
  publicStatsCache = {
    data,
    cachedAt: Date.now()
  };

  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.setItem(PUBLIC_STATS_CACHE_KEY, JSON.stringify(publicStatsCache));
    } catch (_) {}
  }

  return publicStatsCache.data;
}

export async function loadPublicStats(options = {}) {
  const maxAgeMs = Number(options.maxAgeMs ?? 5000);
  const cached = readPublicStatsCache();
  const fresh = cached?.cachedAt && Date.now() - cached.cachedAt < maxAgeMs;

  if (!options.force && fresh) return cached.data;
  if (publicStatsRequest) {
    return cached && options.staleWhileRevalidate !== false
      ? cached.data
      : publicStatsRequest;
  }

  const statsPath = options.live === false
    ? noStoreUrl('/api/stats')
    : `/api/stats/live/${Date.now().toString(36)}`;

  publicStatsRequest = fetch(apiUrl(statsPath), {
    headers: { Accept: 'application/json' },
    cache: options.cache || 'no-store'
  })
    .then(parseResponse)
    .then((result) => {
      if (!result.success) throw new Error(result.message || 'Stats unavailable');
      return setPublicStatsCache(result.data || {});
    })
    .finally(() => {
      publicStatsRequest = null;
    });

  if (cached && options.staleWhileRevalidate !== false) {
    publicStatsRequest.catch(() => {});
    return cached.data;
  }

  return publicStatsRequest;
}

async function resolveCurrentSession({ allowClear = true } = {}) {
  dropLegacyTokens();
  const startedRevision = sessionRevision;
  const cachedSession = getSession();
  const canClearSession = () => typeof allowClear === 'function' ? allowClear() : allowClear;
  let sawAuthFailure = false;
  let sawSoftFailure = false;

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
    sawAuthFailure = isAuthFailure(response, result);
    sawSoftFailure = !sawAuthFailure;
  } catch (_) {
    sawSoftFailure = true;
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
      sawAuthFailure = isAuthFailure(response, result);
      sawSoftFailure = !sawAuthFailure;
    } catch (_) {
      sawSoftFailure = true;
    }
  }

  if (sawSoftFailure && cachedSession?.user) return cachedSession;

  const recentlyTrusted = Date.now() < trustedSessionUntil;
  if (recentlyTrusted && cachedSession?.user) return cachedSession;
  if (!canClearSession() && cachedSession?.user) return cachedSession;

  if (canClearSession() && !recentlyTrusted && startedRevision === sessionRevision && (sawAuthFailure || !cachedSession?.user)) {
    clearSession();
  }
  return null;
}

export async function loadCurrentSession(options = {}) {
  const allowClear = options.allowClear !== false;
  if (!sessionRequest) {
    sessionRequestCanClear = allowClear;
    sessionRequest = resolveCurrentSession({
      ...options,
      allowClear: () => sessionRequestCanClear
    }).finally(() => {
      sessionRequest = null;
      sessionRequestCanClear = true;
    });
  } else if (!allowClear) {
    sessionRequestCanClear = false;
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
