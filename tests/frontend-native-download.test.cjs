const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const snapshot = require('../shared/native-app-release.json');
const service = () => import('../src/frontend/services/nativeAppRelease.mjs');
const freshService = () => import(`../src/frontend/services/nativeAppRelease.mjs?test=${Math.random()}`);
const clone = () => structuredClone(snapshot);
function release(tag, preview = tag.includes('-')) {
  const value = clone(); const version = tag.slice(1).split('-')[0];
  value.tag_name = tag; value.prerelease = preview;
  value.html_url = `https://github.com/redchenk/tsukuyomi-space-app/releases/tag/${tag}`;
  for (const asset of value.assets) {
    asset.name = asset.name.replace(/tsukuyomi-space-\d+\.\d+\.\d+-/, `tsukuyomi-space-${version}-`);
    asset.browser_download_url = `https://downloads.yachiyo.hk/releases/${tag}/${asset.name}`;
  }
  return value;
}

test('verified release exposes the six main packages and the correctly labeled alternatives', async () => {
  const { normalizeAppRelease } = await service();
  const value = normalizeAppRelease(snapshot);
  assert.ok(value?.preview);
  assert.equal(Object.keys(value.assets).length, 14);
  assert.match(value.assets.android.href, /android-arm64-v8a\.apk$/);
  assert.match(value.assets.androidEmulator.href, /android-x86_64\.apk$/);
  assert.match(value.assets.ios.href, /ios-arm64-unsigned\.ipa$/);
  assert.match(value.assets.ohos.href, /-33-ohos-arm64-unsigned\.hap$/);
  assert.match(value.assets.ohosInstall.href, /\/OHOS-INSTALL\.md$/);
  assert.match(value.assets.ohosChecksums.href, /\/OHOS-SHA256SUMS\.txt$/);
  assert.match(value.guideUrl, /\/releases\/v[^/]+\/INSTALL\.md$/);
  for (const asset of Object.values(value.assets)) {
    assert.equal(new URL(asset.href).origin, 'https://downloads.yachiyo.hk');
    assert.match(asset.sha256, /^[a-f0-9]{64}$/);
  }
});

test('rejects drafts, incomplete releases and tampered download links', async () => {
  const { normalizeAppRelease } = await service();
  const cases = [
    value => { value.draft = true; },
    value => { value.tag_name = '../../latest'; },
    value => { value.published_at = 'invalid'; },
    value => { value.html_url += '?tracking'; },
    value => { value.assets[0].browser_download_url = 'https://example.com/installer.exe'; },
    value => { value.assets[0].browser_download_url += '?redirect=https://example.com'; },
    value => { value.assets[0].state = 'new'; },
    value => { value.assets[0].size = 0; },
    value => { value.assets.push(value.assets[0]); },
    value => { value.assets = value.assets.filter(asset => asset.name !== 'SHA256SUMS.txt'); }
  ];
  for (const mutate of cases) { const value = clone(); mutate(value); assert.equal(normalizeAppRelease(value), null); }
});

test('selects stable and beta independently by version rather than upload order', async () => {
  const { selectAppReleases, normalizeAppRelease, compareAppReleases } = await service();
  const values = [release('v0.6.9-beta.2'), release('v0.6.10-beta.9'), release('v0.6.10-beta.10'), release('v0.6.9', false), release('v0.6.8', false)];
  const catalog = selectAppReleases(values);
  assert.equal(catalog.stable.tag, 'v0.6.9');
  assert.equal(catalog.preview.tag, 'v0.6.10-beta.10');
  assert.equal(catalog.latest.tag, 'v0.6.10-beta.10');
  const { chooseAppRelease } = await service();
  assert.equal(chooseAppRelease(catalog).tag, 'v0.6.10-beta.10');
  assert.equal(chooseAppRelease(catalog, 'stable').tag, 'v0.6.9');
  assert.ok(compareAppReleases(normalizeAppRelease(release('v0.6.10')), catalog.preview) > 0);
  assert.equal(selectAppReleases([{ draft: true }]), null);
  assert.equal(selectAppReleases({}), null);
});

test('device suggestions distinguish phones, emulators, iPad desktop mode and unsupported CPUs', async () => {
  const { detectDownloadPlatform: detect } = await service();
  for (const [device, expected] of [
    [{ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', platform: 'Win32' }, 'windows'],
    [{ userAgent: 'Windows NT 10.0; ARM64', platform: 'Win32' }, ''],
    [{ userAgent: 'Macintosh; Intel Mac OS X', platform: 'MacIntel' }, 'macos'],
    [{ userAgent: 'Macintosh; Intel Mac OS X', platform: 'MacIntel', maxTouchPoints: 5 }, 'ios'],
    [{ userAgent: 'iPhone; CPU iPhone OS 18_0' }, 'ios'],
    [{ userAgent: 'Linux; Android 14; Pixel 8' }, 'android'],
    [{ userAgent: 'Mozilla/5.0 (Phone; HarmonyOS 6.0.2) AppleWebKit' }, 'ohos'],
    [{ userAgent: 'Linux; Android; OpenHarmony 6.0' }, 'ohos'],
    [{ platform: 'HarmonyOS' }, 'ohos'],
    [{ userAgent: 'Linux; Android 13; x86_64' }, 'androidEmulator'],
    [{ userAgent: 'Linux; Android 10; armv7l' }, ''],
    [{ userAgent: 'X11; Linux x86_64' }, 'linux'],
    [{ userAgent: 'X11; Linux aarch64' }, ''],
    [{ userAgent: 'X11; CrOS x86_64' }, ''],
    [{}, '']
  ]) assert.equal(detect(device), expected, JSON.stringify(device));
});

test('fetches public metadata without cookies or redirects, reuses cache and permits explicit refresh', async () => {
  const { loadAppReleases, APP_RELEASE_API } = await freshService(); let calls = 0;
  const fetchImpl = async (url, options) => {
    calls++; assert.equal(url, APP_RELEASE_API);
    assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, undefined);
    return new Response(JSON.stringify({ success: true, data: { releases: [snapshot], source: 'distribution', stale: false } }), { headers: { 'content-type': 'application/json' } });
  };
  assert.equal((await loadAppReleases({ fetchImpl, now: () => 100 })).source, 'distribution');
  assert.equal((await loadAppReleases({ fetchImpl, now: () => 200 })).source, 'cache');
  assert.equal(calls, 1);
  await loadAppReleases({ fetchImpl, now: () => 200, force: true }); assert.equal(calls, 2);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(loadAppReleases({ fetchImpl, now: () => 300, signal: controller.signal }), { name: 'AbortError' });
});

test('failed, oversized or malformed distribution responses never replace verified data', async () => {
  for (const response of [new Response('', { status: 403 }), new Response('invalid JSON'), new Response('[]'),
    new Response('[]', { headers: { 'content-length': '1048577' } }), new Response(' '.repeat(1048577))]) {
    const { loadAppReleases } = await freshService();
    await assert.rejects(loadAppReleases({ fetchImpl: async () => response }));
  }
});

test('server outage metadata stays visibly stale and retries sooner than the normal cache', async () => {
  const { loadAppReleases } = await freshService(); let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return new Response(JSON.stringify({ success: true, data: { releases: [snapshot], source: 'verified', stale: true } }));
  };
  assert.equal((await loadAppReleases({ fetchImpl, now: () => 100 })).stale, true);
  assert.equal((await loadAppReleases({ fetchImpl, now: () => 200 })).source, 'verified');
  assert.equal(calls, 1);
  await loadAppReleases({ fetchImpl, now: () => 60101 }); assert.equal(calls, 2);
});

test('successful status and trustworthy metadata are both required from the site endpoint', async () => {
  for (const data of [{ releases: [snapshot], source: 'arbitrary', stale: false },
    { releases: [snapshot], source: 'distribution' }, { releases: [], source: 'distribution', stale: false }]) {
    const { loadAppReleases } = await freshService();
    await assert.rejects(loadAppReleases({ fetchImpl: async () => new Response(JSON.stringify({ success: true, data })) }));
  }
});

test('all three download dictionaries cover the same guidance and platform actions', () => {
  const filename = path.join(__dirname, '../src/frontend/data/nativeAppCopy.js');
  const context = {};
  vm.runInNewContext(fs.readFileSync(filename, 'utf8').replace('export function ', 'function ') + '\nglobalThis.copy = nativeAppCopy;', context);
  const shape = value => Object.keys(value).sort().map(key => [key, typeof value[key] === 'object' && !Array.isArray(value[key]) ? shape(value[key]) : typeof value[key]]);
  assert.deepEqual(shape(context.copy('zh')), shape(context.copy('en')));
  assert.deepEqual(shape(context.copy('zh')), shape(context.copy('ja')));
  for (const locale of ['zh', 'en', 'ja']) {
    assert.equal(context.copy(locale).steps.length, 3);
    assert.equal(context.copy(locale).help.length, 3);
    assert.ok(context.copy(locale).platformsCopy.ios.note.length > 20);
  }
});

test('OHOS remains optional and cannot borrow packages from another channel', async () => {
  const { normalizeAppRelease, selectAppReleases, chooseAppRelease } = await service();
  const old = release('v0.6.20', false);
  old.assets = old.assets.filter(asset => !/ohos/i.test(asset.name));
  assert.ok(normalizeAppRelease(old));
  assert.equal(normalizeAppRelease(old).assets.ohos, undefined);
  const catalog = selectAppReleases([old, snapshot]);
  assert.ok(catalog.latest.assets.ohos);
  assert.equal(chooseAppRelease(catalog, 'stable').assets.ohos, undefined);
});

test('OHOS requires a unique matching build, official link, checksum and signing guide', async () => {
  const { normalizeAppRelease } = await service();
  const cases = [
    value => { value.assets.find(a => a.name.endsWith('.hap')).name = 'tsukuyomi-space-0.6.20-28-ohos-arm64-unsigned.hap'; },
    value => { value.assets.find(a => a.name.endsWith('.hap')).browser_download_url += '?redirect=external'; },
    value => { value.assets.find(a => a.name.endsWith('.hap')).digest = ''; },
    value => { value.assets.find(a => a.name.endsWith('.hap')).state = 'new'; },
    value => { value.assets.find(a => a.name.endsWith('.hap')).size = 0; },
    value => { value.assets = value.assets.filter(a => a.name !== 'OHOS-INSTALL.md'); },
    value => { value.assets = value.assets.filter(a => a.name !== 'OHOS-SHA256SUMS.txt'); },
    value => { value.assets.push(structuredClone(value.assets.find(a => a.name.endsWith('.hap')))); },
    value => { const second = structuredClone(value.assets.find(a => a.name.endsWith('.hap'))); second.name = second.name.replace('-28-', '-29-'); second.browser_download_url = second.browser_download_url.replace('-28-', '-29-'); value.assets.push(second); }
  ];
  for (const mutate of cases) {
    const value = clone(); mutate(value);
    const result = normalizeAppRelease(value);
    assert.ok(result?.assets.android, 'other platforms must remain usable');
    assert.equal(result.assets.ohos, undefined);
  }
});

test('OHOS supplements survive normalized snapshots and stale same-tag metadata', async () => {
  const { normalizeAppRelease, selectAppReleases, appReleaseSnapshot } = await service();
  const old = clone(); old.assets = old.assets.filter(a => !/ohos/i.test(a.name));
  for (const values of [[old, snapshot], [snapshot, old]]) {
    const release = selectAppReleases(values).latest;
    assert.ok(release.assets.ohos);
    assert.equal(normalizeAppRelease(appReleaseSnapshot(release)).assets.ohos.href, release.assets.ohos.href);
  }
});

test('a HarmonyOS visitor on a channel without a HAP gets the platform chooser without reading a missing package size', () => {
  const script = fs.readFileSync(path.join(__dirname, '../src/frontend/pages/DownloadPage.vue'), 'utf8').split('<script setup>')[1].split('</script>')[0];
  const ast = require('@babel/parser').parse(script, { sourceType: 'module' });
  const declaration = ast.program.body.find(node => node.type === 'VariableDeclaration' && node.declarations[0].id.name === 'heroTarget');
  const context = { computed: get => ({ get value() { return get(); } }), heroAsset: { value: undefined }, device: { value: 'ohos' }, recommended: { value: { target: 'HarmonyOS' } }, copy: { value: {} } };
  vm.runInNewContext(script.slice(declaration.start, declaration.end) + '\nthis.target = heroTarget;', context);
  assert.equal(context.target.value, '');
  context.heroAsset.value = { size: 100 };
  assert.equal(context.target.value, 'HarmonyOS');
});
