export function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value == null ? fallback : value;
  } catch (_) {
    return fallback;
  }
}

export function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function readText(key, fallback = '') {
  return localStorage.getItem(key) ?? fallback;
}

export function writeText(key, value) {
  localStorage.setItem(key, String(value ?? ''));
}
