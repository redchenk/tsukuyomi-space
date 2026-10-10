const APP_REPOSITORY = 'https://github.com/redchenk/tsukuyomi-space-app';
const RELEASES_API = 'https://api.github.com/repos/redchenk/tsukuyomi-space-app/releases?per_page=20';
const PACKAGE_SUFFIXES = Object.freeze({
  windows: 'windows-x64-setup.exe', windowsPortable: 'windows-x64.zip',
  macos: 'macos-universal.dmg', android: 'android-arm64-v8a.apk', androidEmulator: 'android-x86_64.apk',
  linux: 'linux-x64.deb', linuxPortable: 'linux-x64.tar.gz', ios: 'ios-arm64-unsigned.ipa',
  checksums: 'SHA256SUMS.txt', notices: 'THIRD_PARTY_NOTICES.md', install: 'INSTALL.md'
});
const REQUIRED = ['windows', 'macos', 'android', 'linux', 'ios', 'checksums', 'install', 'notices'];
const TAG_PATTERN = /^v(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:-([A-Za-z0-9][A-Za-z0-9.-]{0,59}))?$/;

function normalizeAppRelease(value) {
  const match = typeof value?.tag_name === 'string' && TAG_PATTERN.exec(value.tag_name);
  if (!match || value.draft !== false || typeof value.prerelease !== 'boolean'
    || !Array.isArray(value.assets) || value.assets.length > 100
    || typeof value.published_at !== 'string' || !Number.isFinite(Date.parse(value.published_at))) return null;
  const tag = value.tag_name;
  const version = match.slice(1, 4).join('.');
  const url = `${APP_REPOSITORY}/releases/tag/${tag}`;
  if (value.html_url !== url) return null;
  const assets = {};
  for (const [key, suffix] of Object.entries(PACKAGE_SUFFIXES)) {
    const name = key === 'checksums' || key === 'notices' || key === 'install'
      ? suffix : `tsukuyomi-space-${version}-${suffix}`;
    const candidates = value.assets.filter(asset => asset?.name === name);
    if (candidates.length !== 1) continue;
    const asset = candidates[0];
    const href = `${APP_REPOSITORY}/releases/download/${tag}/${name}`;
    if (asset.state !== 'uploaded' || asset.browser_download_url !== href
      || !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > 2 * 1024 ** 3) continue;
    assets[key] = { name, href, size: asset.size,
      sha256: typeof asset.digest === 'string' && /^sha256:[a-f0-9]{64}$/.test(asset.digest) ? asset.digest.slice(7) : '' };
  }
  if (REQUIRED.some(key => !assets[key])) return null;
  return { tag, version, url, assets, publishedAt: value.published_at,
    preview: value.prerelease || Boolean(match[4]), parts: match.slice(1, 4).map(Number), qualifier: match[4] || '',
    guideUrl: `${APP_REPOSITORY}/blob/${tag}/docs/release-guide.md` };
}

function compareAppReleases(a, b) {
  for (let index = 0; index < 3; index++) if (a.parts[index] !== b.parts[index]) return a.parts[index] - b.parts[index];
  if (!a.qualifier || !b.qualifier) return !a.qualifier ? (b.qualifier ? 1 : 0) : -1;
  const left = a.qualifier.split('.'); const right = b.qualifier.split('.');
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    if (left[index] === right[index]) continue;
    if (left[index] === undefined || right[index] === undefined) return left[index] === undefined ? -1 : 1;
    const ln = /^\d+$/.test(left[index]); const rn = /^\d+$/.test(right[index]);
    if (ln && rn) {
      const l = BigInt(left[index]); const r = BigInt(right[index]);
      if (l !== r) return l < r ? -1 : 1;
      continue;
    }
    if (ln !== rn) return ln ? -1 : 1;
    return left[index] < right[index] ? -1 : 1;
  }
  return Date.parse(a.publishedAt) - Date.parse(b.publishedAt);
}

function selectAppReleases(values) {
  if (!Array.isArray(values)) return null;
  const releases = values.slice(0, 20).map(normalizeAppRelease).filter(Boolean).sort((a, b) => compareAppReleases(b, a));
  const stable = releases.find(release => !release.preview) || null;
  const preview = releases.find(release => release.preview) || null;
  return stable || preview ? { stable, preview, latest: releases[0] } : null;
}

function detectDownloadPlatform(device = {}) {
  const ua = String(device.userAgent || ''); const platform = String(device.platform || '');
  if (/iPhone|iPad|iPod/i.test(ua) || (/Mac/i.test(platform) && Number(device.maxTouchPoints) > 1)) return 'ios';
  if (/Android/i.test(ua)) return /armv[5-7]|armeabi\b/i.test(ua) ? '' : /x86_64|amd64/i.test(ua) ? 'androidEmulator' : 'android';
  if (/Windows|Win32|Win64/i.test(ua + ' ' + platform)) return /ARM|aarch64|Win32.*(?:WOW32|x86;)/i.test(ua) ? '' : 'windows';
  if (/Macintosh|Mac OS X|MacIntel/i.test(ua + ' ' + platform)) return 'macos';
  if (/CrOS|FreeBSD/i.test(ua)) return '';
  if (/Linux/i.test(ua + ' ' + platform)) return /aarch64|armv[5-9]|arm64|i[3-6]86/i.test(ua + ' ' + platform) ? '' : 'linux';
  return '';
}


function chooseAppRelease(catalog, channel = '') {
  return catalog?.[channel] || catalog?.latest || null;
}

function appReleaseSnapshot(release) {
  return {
    tag_name: release.tag, html_url: release.url, published_at: release.publishedAt,
    prerelease: release.preview, draft: false,
    assets: Object.values(release.assets).map(asset => ({
      name: asset.name, browser_download_url: asset.href, size: asset.size, state: 'uploaded',
      digest: asset.sha256 ? `sha256:${asset.sha256}` : null
    }))
  };
}

const MAX_RESPONSE_BYTES = 1024 * 1024;
async function readReleaseResponse(response, controller) {
  if (!response.ok || !response.body || Number(response.headers.get('content-length') || 0) > MAX_RESPONSE_BYTES) throw new Error('Release metadata unavailable');
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) { controller.abort(); throw new Error('Release metadata too large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

// This fixed public endpoint only returns metadata; no installer is buffered.
async function fetchGitHubAppReleases({ fetchImpl = globalThis.fetch, signal } = {}) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(cancel, 6000);
  try {
    const response = await fetchImpl(RELEASES_API, {
      signal: controller.signal, credentials: 'omit', redirect: 'error', cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Tsukuyomi-App-Releases' }
    });
    const catalog = selectAppReleases(await readReleaseResponse(response, controller));
    if (!catalog || controller.signal.aborted) throw new Error('No complete release');
    return catalog;
  } finally { controller.abort(); clearTimeout(timeout); signal?.removeEventListener('abort', cancel); }
}

module.exports = { APP_REPOSITORY, RELEASES_API, PACKAGE_SUFFIXES, normalizeAppRelease,
  compareAppReleases, selectAppReleases, chooseAppRelease, appReleaseSnapshot,
  detectDownloadPlatform, readReleaseResponse, fetchGitHubAppReleases };
