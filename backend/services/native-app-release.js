const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const snapshot = require('../../shared/native-app-release.json');
const { selectAppReleases, appReleaseSnapshot, fetchGitHubAppReleases } = require('../../shared/native-app-release.cjs');

const CACHE_MS = 5 * 60 * 1000;
const RETRY_MS = 60 * 1000;

function createAppReleaseService({ cachePath = '', fetchImpl = globalThis.fetch, now = Date.now,
    fallback = snapshot, offline = false, logger = console } = {}) {
    let catalog = selectAppReleases([fallback]);
    if (!catalog) throw new Error('Invalid app release fallback');
    let checkedAt = null;
    let source = 'verified';
    let lastAttempt = null;
    let pending = null;
    if (cachePath) {
        try {
            if (fs.statSync(cachePath).size <= 1024 * 1024) {
                const saved = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
                const cached = selectAppReleases(saved.releases);
                if (cached && Number.isSafeInteger(saved.checkedAt) && saved.checkedAt >= 0
                    && saved.checkedAt <= now() + 60000) {
                    catalog = selectAppReleases([...saved.releases, fallback]);
                    checkedAt = saved.checkedAt;
                    source = 'cache';
                }
            }
        } catch (_) { /* A missing or corrupt cache uses the bundled release. */ }
    }
    const payload = (stale = false) => ({
        releases: [catalog.stable, catalog.preview].filter(Boolean).map(appReleaseSnapshot),
        source, stale, checkedAt: checkedAt === null ? null : new Date(checkedAt).toISOString()
    });
    async function persist() {
        if (!cachePath) return;
        const temporary = `${cachePath}.${randomUUID()}.tmp`;
        try {
            await fs.promises.mkdir(path.dirname(cachePath), { recursive: true });
            await fs.promises.writeFile(temporary, JSON.stringify({ releases: payload().releases, checkedAt }), { mode: 0o600, flag: 'wx' });
            await fs.promises.rename(temporary, cachePath);
        } catch (error) {
            await fs.promises.unlink(temporary).catch(() => {});
            logger.warn('App release cache write failed:', error.code || 'unavailable');
        }
    }
    async function get() {
        if (offline) return payload();
        const time = now();
        const age = checkedAt === null ? Infinity : time - checkedAt;
        if (age >= 0 && age < CACHE_MS) return { ...payload(), source: 'cache' };
        if (pending) return pending;
        const retryAge = lastAttempt === null ? Infinity : time - lastAttempt;
        if (retryAge >= 0 && retryAge < RETRY_MS) return payload(true);
        lastAttempt = time;
        pending = (async () => {
            try {
                catalog = await fetchGitHubAppReleases({ fetchImpl });
                checkedAt = now(); source = 'github';
                await persist();
                return payload();
            } catch (_) {
                if (source !== 'verified') source = 'cache';
                return payload(true);
            } finally { pending = null; }
        })();
        return pending;
    }
    return { get };
}

let defaultService;
function getAppReleaseService() {
    if (!defaultService) defaultService = createAppReleaseService({
        cachePath: path.join(require('../config').dataDir, 'cache', 'native-app-release.json'),
        offline: process.env.APP_RELEASES_OFFLINE === 'true'
    });
    return defaultService;
}
module.exports = { createAppReleaseService, getAppReleaseService, CACHE_MS, RETRY_MS };
