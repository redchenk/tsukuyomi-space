const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const snapshot = require('../shared/native-app-release.json');
const { createAppReleaseService, CACHE_MS, RETRY_MS } = require('../backend/services/native-app-release');
const { createAppReleaseRouter } = require('../backend/routes/app-releases');
const { RELEASES_API, selectAppReleases, fetchGitHubAppReleases } = require('../shared/native-app-release.cjs');

function release(tag) {
    const value = structuredClone(snapshot); const version = tag.slice(1).split('-')[0];
    value.tag_name = tag; value.prerelease = tag.includes('-');
    value.html_url = `https://github.com/redchenk/tsukuyomi-space-app/releases/tag/${tag}`;
    for (const asset of value.assets) {
        asset.name = asset.name.replace(/tsukuyomi-space-\d+\.\d+\.\d+-/, `tsukuyomi-space-${version}-`);
        asset.browser_download_url = `https://github.com/redchenk/tsukuyomi-space-app/releases/download/${tag}/${asset.name}`;
    }
    return value;
}
const response = values => new Response(JSON.stringify(values));

test('concurrent visitors share one public GitHub request; cache refresh discovers a newer beta', async () => {
    let time = 1000, calls = 0, version = 'v0.6.11-beta.1';
    const service = createAppReleaseService({ now: () => time, fetchImpl: async (url, options) => {
        calls++; assert.equal(url, RELEASES_API); assert.equal(options.credentials, 'omit');
        assert.equal(options.redirect, 'error'); assert.equal(options.headers.Authorization, undefined);
        return response([release(version), release('v0.6.10')]);
    } });
    const results = await Promise.all(Array.from({ length: 12 }, () => service.get()));
    assert.equal(calls, 1);
    for (const result of results) assert.equal(selectAppReleases(result.releases).latest.tag, version);
    assert.equal((await service.get()).source, 'cache');
    version = 'v0.6.12-beta.1'; time += CACHE_MS + 1;
    assert.equal(selectAppReleases((await service.get()).releases).latest.tag, version);
    assert.equal(calls, 2);
});

test('a failed GitHub check keeps current links, marks stale and backs off before retrying', async () => {
    let time = 1000, failed = false, calls = 0;
    const service = createAppReleaseService({ now: () => time, fetchImpl: async () => {
        calls++; if (failed) return new Response('', { status: 429 });
        return response([release('v0.6.11-beta.1')]);
    } });
    await service.get(); time += CACHE_MS + 1; failed = true;
    const stale = await service.get();
    assert.equal(stale.source, 'cache'); assert.equal(stale.stale, true);
    assert.equal(selectAppReleases(stale.releases).latest.tag, 'v0.6.11-beta.1');
    await service.get(); assert.equal(calls, 2);
    time += RETRY_MS + 1; failed = false;
    assert.equal((await service.get()).stale, false); assert.equal(calls, 3);
});

test('successful metadata survives restart and an upstream outage; corrupt disk cache uses verified fallback', async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'app-release-cache-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const cachePath = path.join(directory, 'cache', 'release.json'); let time = 1000;
    const first = createAppReleaseService({ cachePath, now: () => time,
        fetchImpl: async () => response([release('v0.6.11-beta.1')]) });
    await first.get();
    assert.equal(fs.statSync(cachePath).mode & 0o777, 0o600);
    time += CACHE_MS + 1;
    const restarted = createAppReleaseService({ cachePath, now: () => time,
        fetchImpl: async () => { throw new Error('offline'); } });
    const result = await restarted.get();
    assert.equal(result.stale, true); assert.equal(result.source, 'cache');
    assert.equal(selectAppReleases(result.releases).latest.tag, 'v0.6.11-beta.1');
    fs.writeFileSync(cachePath, 'broken');
    const corrupt = createAppReleaseService({ cachePath, now: () => time,
        fetchImpl: async () => { throw new Error('offline'); } });
    assert.equal((await corrupt.get()).source, 'verified');
});

test('a first-run outage returns the complete verified release with a visible stale state', async () => {
    const service = createAppReleaseService({ fetchImpl: async () => new Response('', { status: 403 }) });
    const result = await service.get();
    assert.equal(result.source, 'verified'); assert.equal(result.stale, true);
    assert.equal(selectAppReleases(result.releases).latest.tag, snapshot.tag_name);
});

test('drafts and incomplete uploads do not hide the newest complete release', async () => {
    const draft = release('v0.6.13-beta.1'); draft.draft = true;
    const incomplete = release('v0.6.12-beta.1');
    incomplete.assets = incomplete.assets.filter(asset => !asset.name.endsWith('ios-arm64-unsigned.ipa'));
    const catalog = await fetchGitHubAppReleases({ fetchImpl: async () => response([
        draft, incomplete, release('v0.6.11-beta.1'), release('v0.6.10')
    ]) });
    assert.equal(catalog.latest.tag, 'v0.6.11-beta.1');
    assert.equal(catalog.stable.tag, 'v0.6.10');
});

test('invalid, oversized and tampered upstream metadata cannot replace verified links', async () => {
    const tampered = release('v0.6.11-beta.1'); tampered.assets[0].browser_download_url = 'https://example.test/file';
    for (const value of [response([tampered]), response([]), new Response('not json'),
        new Response('[]', { headers: { 'content-length': '1048577' } }), new Response(' '.repeat(1048577))]) {
        const service = createAppReleaseService({ fetchImpl: async () => value });
        const result = await service.get();
        assert.equal(result.stale, true); assert.equal(result.source, 'verified');
        assert.equal(selectAppReleases(result.releases).latest.tag, snapshot.tag_name);
    }
});

test('public endpoint only serves bounded metadata and query parameters cannot choose another upstream', async t => {
    let calls = 0;
    const service = createAppReleaseService({ fetchImpl: async url => {
        calls++; assert.equal(url, RELEASES_API); return response([snapshot]);
    } });
    const app = express(); app.use('/api/app', createAppReleaseRouter(service));
    const server = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
    t.after(() => new Promise(resolve => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const url of ['/api/app/releases', '/api/app/releases?force=true&url=https://example.test/installer.exe']) {
        const result = await fetch(base + url);
        assert.equal(result.status, 200); assert.equal(result.headers.get('cache-control'), 'no-store');
        const text = await result.text(); assert.ok(text.length < 15000);
        const body = JSON.parse(text); assert.equal(body.success, true);
        assert.equal(selectAppReleases(body.data.releases).latest.tag, snapshot.tag_name);
    }
    assert.equal(calls, 1);
    assert.equal((await fetch(base + '/api/app/releases', { method: 'POST' })).status, 404);
});
