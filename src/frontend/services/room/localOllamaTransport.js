const OLLAMA_LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const OLLAMA_TRUSTED_WEB_ORIGINS = Object.freeze([
  'https://yachiyo.hk',
  'https://yachiyo.com.cn',
  'https://cho-kaguyahime.cn'
]);
const LOCAL_DEVELOPMENT_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i;

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
    targetAddressSpace: 'loopback'
  };
}

export function localOllamaAllowedOrigins(currentOrigin = '') {
  const origins = [...OLLAMA_TRUSTED_WEB_ORIGINS];
  const normalizedOrigin = String(currentOrigin || '').trim();
  if (LOCAL_DEVELOPMENT_ORIGIN.test(normalizedOrigin) && !origins.includes(normalizedOrigin)) {
    origins.push(normalizedOrigin);
  }
  return origins;
}

export function localOllamaWindowsCommand(currentOrigin = '') {
  const origins = localOllamaAllowedOrigins(currentOrigin).join(',');
  return `[Environment]::SetEnvironmentVariable('OLLAMA_ORIGINS','${origins}','User')`;
}

export async function fetchWithLocalOllamaGuidance(apiUrl, options = {}, fetchImpl = globalThis.fetch) {
  try {
    return await fetchImpl(apiUrl, localOllamaFetchOptions(apiUrl, options));
  } catch (error) {
    if (!isLocalOllamaUrl(apiUrl)) throw error;
    throw new TypeError(
      '本机 Ollama 连接失败：请确认服务正在运行，并设置 OLLAMA_ORIGINS 后完全重启 Ollama；可在 /room/settings 复制修复命令。',
      { cause: error }
    );
  }
}
