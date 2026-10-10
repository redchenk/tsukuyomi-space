import releaseTools from '../../../shared/native-app-release.cjs';
export const { APP_REPOSITORY, RELEASES_API, PACKAGE_SUFFIXES, normalizeAppRelease,
  compareAppReleases, selectAppReleases, chooseAppRelease, appReleaseSnapshot,
  detectDownloadPlatform, fetchGitHubAppReleases } = releaseTools;
export const APP_RELEASE_API = '/api/app/releases';
export const APP_RELEASE_REFRESH_MS = 5 * 60 * 1000;
let cachedResult = null;
let cachedAt = 0;

// Fetch the site's small public metadata response. Installer links still go
// directly to the official repository, without cookies or a download proxy.
export async function loadAppReleases({ signal, force = false, fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const age = now() - cachedAt;
  const ttl = cachedResult?.stale ? 60 * 1000 : APP_RELEASE_REFRESH_MS;
  if (!force && cachedResult && age >= 0 && age < ttl) {
    return { ...cachedResult, source: cachedResult.source === 'verified' ? 'verified' : 'cache' };
  }
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(cancel, 8000);
  try {
    const response = await fetchImpl(APP_RELEASE_API, {
      signal: controller.signal, credentials: 'omit', redirect: 'error', cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    const value = await releaseTools.readReleaseResponse(response, controller);
    const data = value?.data;
    const catalog = selectAppReleases(data?.releases);
    if (value?.success !== true || !catalog || controller.signal.aborted
      || !['github', 'cache', 'verified'].includes(data.source) || typeof data.stale !== 'boolean') {
      throw new Error('Release metadata unavailable');
    }
    cachedResult = { catalog, source: data.source, stale: data.stale };
    cachedAt = now();
    return cachedResult;
  } finally { controller.abort(); clearTimeout(timeout); signal?.removeEventListener('abort', cancel); }
}
