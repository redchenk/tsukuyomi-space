const DEFAULT_AUTH_REDIRECT = '/hub';
const AUTH_PATHS = new Set(['/login', '/register']);
const BLOCKED_REDIRECT_PATHS = new Set(['/', '/access', '/login', '/register']);

function pathOnly(value) {
  try {
    const url = new URL(String(value || ''), 'https://tsukuyomi.local');
    return `${url.pathname}${url.search}${url.hash}`;
  } catch (_) {
    return '';
  }
}

function normalizedPathname(value) {
  try {
    const url = new URL(String(value || ''), 'https://tsukuyomi.local');
    return url.pathname.replace(/\/+$/, '') || '/';
  } catch (_) {
    return '';
  }
}

export function sanitizeAuthRedirect(value, fallback = DEFAULT_AUTH_REDIRECT) {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//') || /[\r\n\\]/.test(raw)) return fallback;

  const pathname = normalizedPathname(raw);
  if (!pathname || BLOCKED_REDIRECT_PATHS.has(pathname)) return fallback;

  return pathOnly(raw) || fallback;
}

export function getAuthRedirectFromLocation(fallback = DEFAULT_AUTH_REDIRECT) {
  if (typeof window === 'undefined') return fallback;
  return sanitizeAuthRedirect(new URLSearchParams(window.location.search || '').get('redirect'), fallback);
}

export function isAuthPath(value) {
  return AUTH_PATHS.has(normalizedPathname(value));
}

export function withAuthRedirect(authPath, redirectPath) {
  const redirect = sanitizeAuthRedirect(redirectPath, '');
  if (!redirect) return authPath;

  try {
    const url = new URL(String(authPath || '/login'), 'https://tsukuyomi.local');
    url.searchParams.set('redirect', redirect);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch (_) {
    const separator = String(authPath || '').includes('?') ? '&' : '?';
    return `${authPath || '/login'}${separator}redirect=${encodeURIComponent(redirect)}`;
  }
}
