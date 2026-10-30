const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const vue = require('vue');

const source = file => fs.readFileSync(`src/frontend/${file}`, 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

function fixture({ english = true, saved, storageFails = false } = {}) {
  const storage = new Map(saved === undefined ? [] : [['tsukuyomi_content_translation', saved]]);
  const listeners = new Map();
  const requests = [];
  const context = vm.createContext({ ...vue, URLSearchParams, URL, Headers, Date,
    localStorage: {
      getItem: key => { if (storageFails) throw new Error('Storage denied'); return storage.get(key) || null; },
      setItem: (key, value) => { if (storageFails) throw new Error('Storage denied'); storage.set(key, value); },
      removeItem: key => storage.delete(key)
    },
    window: { location: { hostname: english ? 'tsukuyomi-space.com' : 'yachiyo.hk' },
      addEventListener: (key, fn) => listeners.set(key, fn) },
    isEnglishSite: () => english,
    translateFeedback: value => value, uiText: value => value,
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { text: async () => JSON.stringify({ success: true, data: { url } }) };
    }
  });
  vm.runInContext(source('services/contentTranslation.js') + '\nthis.preference = { contentTranslationEnabled, contentTranslationMode, setContentTranslationEnabled };', context);
  vm.runInContext(source('api/client.js') + '\nthis.client = { apiFetch, authFetch, loadPublicSettings };', context);
  return { context, requests, storage, listeners, ...context.preference, ...context.client };
}

test('English public reads default to translation; original mode preserves paths, queries and interface language', async () => {
  const f = fixture();
  await f.apiFetch('/api/articles/42?tag=%E6%9C%88');
  assert.match(f.requests.at(-1).url, /^\/en-api\/live\/[^/]+\/articles\/42\?tag=%E6%9C%88$/);
  f.setContentTranslationEnabled(false);
  await f.apiFetch('/api/articles/42?tag=%E6%9C%88');
  assert.match(f.requests.at(-1).url, /^\/api\/live\/[^/]+\/articles\/42\?tag=%E6%9C%88$/);
  assert.equal(f.storage.get('tsukuyomi_content_translation'), 'off');
  assert.equal(f.storage.has('lang'), false);
  for (const path of ['/api/messages', '/api/assets/gallery/public', '/api/pixel-art/gallery', '/api/friend-links', '/api/hub-preview']) {
    await f.apiFetch(path);
    assert.match(f.requests.at(-1).url, /^\/api\//);
  }
  f.setContentTranslationEnabled(true);
  await f.apiFetch('/api/messages');
  assert.match(f.requests.at(-1).url, /^\/en-api\//);
});

test('writes, private APIs and external URLs never enter the translator in either mode', async () => {
  const f = fixture();
  for (const enabled of [true, false]) {
    f.setContentTranslationEnabled(enabled);
    await f.authFetch('/api/messages', { method: 'POST', body: 'draft' });
    assert.equal(f.requests.at(-1).url, '/api/messages');
    assert.equal(f.requests.at(-1).options.body, 'draft');
    assert.equal(f.requests.at(-1).options.credentials, 'include');
    for (const path of ['/api/auth/me', '/api/user/bookmarks/42/status', '/api/room/memory', 'https://example.test/api/articles']) {
      await f.authFetch(path);
      assert.equal(f.requests.at(-1).url, path);
    }
  }
});

test('saved preferences, denied storage, domestic sites and changes in another tab behave consistently', async () => {
  assert.equal(fixture({ saved: 'off' }).contentTranslationEnabled.value, false);
  const denied = fixture({ storageFails: true });
  assert.equal(denied.contentTranslationEnabled.value, true);
  assert.doesNotThrow(() => denied.setContentTranslationEnabled(false));
  assert.equal(denied.contentTranslationEnabled.value, false);
  const domestic = fixture({ english: false });
  domestic.setContentTranslationEnabled(true);
  assert.equal(domestic.contentTranslationEnabled.value, false);
  await domestic.apiFetch('/api/messages');
  assert.match(domestic.requests.at(-1).url, /^\/api\//);
  const f = fixture();
  f.storage.set('tsukuyomi_content_translation', 'off');
  f.listeners.get('storage')({ key: 'tsukuyomi_content_translation' });
  assert.equal(f.contentTranslationEnabled.value, false);
  f.storage.clear();
  f.listeners.get('storage')({ key: null });
  assert.equal(f.contentTranslationEnabled.value, true);
});

test('settings and concurrent list responses cannot mix English and original caches', async () => {
  const f = fixture();
  assert.match((await f.loadPublicSettings()).url, /^\/en-api\//);
  f.setContentTranslationEnabled(false);
  assert.match((await f.loadPublicSettings()).url, /^\/api\//);
  f.setContentTranslationEnabled(true);
  const count = f.requests.length;
  assert.match((await f.loadPublicSettings()).url, /^\/en-api\//);
  assert.equal(f.requests.length, count);

  const pending = new Map();
  f.context.apiFetch = () => {
    const mode = f.contentTranslationMode();
    const task = deferred();
    pending.set(mode, task);
    return task.promise;
  };
  f.context.parseResponse = value => value;
  vm.runInContext(source('services/stageArticles.js') + '\nthis.loadStage = loadStageArticles;', f.context);
  const english = f.context.loadStage();
  f.setContentTranslationEnabled(false);
  const original = f.context.loadStage();
  pending.get('original').resolve({ success: true, data: [{ id: 42, title: '原文' }] });
  assert.equal((await original).articles[0].title, '原文');
  pending.get('en').resolve({ success: true, data: [{ id: 42, title: 'English' }] });
  await english;
  assert.equal((await f.context.loadStage()).articles[0].title, '原文');
  f.setContentTranslationEnabled(true);
  assert.equal((await f.context.loadStage()).articles[0].title, 'English');
});

test('Plaza caches remain partitioned and personal filters keep the authenticated API', async () => {
  const f = fixture();
  f.context.parseResponse = value => value;
  f.context.apiFetch = async () => ({ success: true, data: { messages: [{ content: f.contentTranslationMode() }] } });
  f.context.fetch = async (url, options) => ({ success: true, data: { messages: [{ content: url, credentials: options.credentials }] } });
  vm.runInContext(source('services/plazaMessages.js') + '\nthis.loadPlaza = loadPlazaPage;', f.context);
  assert.equal((await f.context.loadPlaza()).messages[0].content, 'en');
  f.setContentTranslationEnabled(false);
  assert.equal((await f.context.loadPlaza()).messages[0].content, 'original');
  f.setContentTranslationEnabled(true);
  assert.equal((await f.context.loadPlaza()).messages[0].content, 'en');
  const mine = (await f.context.loadPlaza({ sort: 'mine' })).messages[0];
  assert.match(mine.content, /^\/api\/messages\?/);
  assert.equal(mine.credentials, 'include');
});

test('cached pages defer inactive refreshes and coalesce changes before activation', () => {
  const state = vue.ref(true);
  let activate, deactivate, refreshes = 0;
  const scope = vue.effectScope();
  scope.run(() => {
    const context = { watch: vue.watch, contentTranslationEnabled: state,
      onActivated: fn => { activate = fn; }, onDeactivated: fn => { deactivate = fn; } };
    vm.runInNewContext(source('composables/useContentTranslationRefresh.js') + '\nthis.useRefresh = useContentTranslationRefresh;', context);
    context.useRefresh(() => { refreshes++; });
    state.value = false;
    assert.equal(refreshes, 1);
    deactivate();
    state.value = true;
    state.value = false;
    assert.equal(refreshes, 1);
    activate();
    assert.equal(refreshes, 2);
  });
  scope.stop();
  state.value = true;
  assert.equal(refreshes, 2);
});
