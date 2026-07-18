const OLLAMA_LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function normalizeLocalOllamaBaseUrl(apiUrl = '') {
  const value = String(apiUrl || '').trim();
  if (!value) return value;
  const candidate = /^(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(value)
    ? `http://${value}`
    : value;

  try {
    const parsed = new URL(candidate);
    const hostname = parsed.hostname.toLowerCase();
    if (!OLLAMA_LOOPBACK_HOSTS.has(hostname) || (parsed.port && parsed.port !== '11434')) {
      return candidate;
    }
    parsed.protocol = 'http:';
    parsed.hostname = 'localhost';
    parsed.port = '11434';
    if (parsed.pathname === '/' && !parsed.search && !parsed.hash) return parsed.origin;
    return parsed.toString();
  } catch (_) {
    return candidate;
  }
}

export function isLocalOllamaUrl(apiUrl = '') {
  try {
    const parsed = new URL(normalizeLocalOllamaBaseUrl(apiUrl));
    return parsed.protocol === 'http:'
      && parsed.hostname.toLowerCase() === 'localhost'
      && parsed.port === '11434';
  } catch (_) {
    return false;
  }
}

export function localOllamaFetchOptions(apiUrl, options = {}) {
  if (!isLocalOllamaUrl(apiUrl)) return options;
  return {
    ...options,
    targetAddressSpace: 'local'
  };
}
