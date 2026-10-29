const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parse } = require('@babel/parser');

function functions(file, names, context) {
  const code = fs.readFileSync(path.join(__dirname, '../src/frontend/', file), 'utf8').split('<script setup>')[1].split('</script>')[0];
  const ast = parse(code, { sourceType: 'module' });
  const bodies = ast.program.body.filter(node => node.type === 'FunctionDeclaration' && names.includes(node.id.name));
  assert.equal(bodies.length, names.length);
  vm.runInNewContext(bodies.map(node => code.slice(node.start, node.end)).join('\n') + '\nthis.actions = {' + names.join(',') + '};', context);
  return context.actions;
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function gallery() {
  const request = deferred(), asset = { id: 'image', viewer_liked: false, like_count: 4 };
  const c = { isAuthed: { value: true }, currentUserId: { value: 'user' }, state: { images: [asset], selected: { ...asset }, liking: {}, likedResults: {} }, calls: 0,
    authFetch: () => { c.calls++; return request.promise; }, parseResponse: r => r, t: a => a, showMessage: e => { c.error = e; } };
  const api = functions('pages/GalleryPage.vue', ['applyImageLikes', 'likeImage'], c);
  return { c, api, request, asset };
}
test('gallery updates both views before a slow request, blocks duplicate clicks and accepts a deduped server count', async () => {
  const { c, api, request, asset } = gallery();
  const pending = api.likeImage(asset);
  assert.equal(c.state.images[0].viewer_liked, true);
  assert.equal(c.state.selected.like_count, 5);
  await api.likeImage(asset);
  assert.equal(c.calls, 1);
  assert.equal(api.applyImageLikes({ id: 'image', like_count: 4 }).viewer_liked, true);
  request.resolve({ success: true, data: { id: 'image', like_count: 4 } });
  await pending;
  assert.equal(c.state.selected.like_count, 4);
  assert.equal(c.state.images[0].like_count, 4);
  assert.equal(c.state.liking.image, undefined);
});
test('gallery rejects failed requests, rolls back grid and dialog and permits retry', async () => {
  const { c, api, request, asset } = gallery();
  const pending = api.likeImage(asset);
  request.reject(new Error('network unavailable'));
  await pending;
  for (const image of [c.state.selected, ...c.state.images]) { assert.equal(image.viewer_liked, false); assert.equal(image.like_count, 4); }
  assert.equal(c.error, 'network unavailable');
  assert.equal(c.state.liking.image, undefined);
});
function article() {
  const request = deferred();
  const c = { articleLike: { loading: false, liked: false, count: 8 }, articleId: { value: '12' }, articleLoadRevision: 1, requireLogin: () => true,
    getSession: () => ({ user: { id: 'user' } }), applyArticleGrowth: () => '', articleTaskMessage: { value: '' },
    authHeaders: () => ({}), parseResponse: r => r, props: { t: {} }, showMessage: m => { c.message = m; },
    authFetch: (_, options) => { c.method = options.method; return request.promise; } };
  const api = functions('pages/ArticlePage.vue', ['isCurrentArticle', 'toggleArticleLike'], c);
  return { c, api, request };
}
test('article like/unlike uses pre-click state and rolls back on API rejection', async () => {
  const { c, api, request } = article();
  c.articleLike.liked = true;
  const pending = api.toggleArticleLike();
  assert.equal(c.method, 'DELETE');
  assert.equal(c.articleLike.count, 7);
  assert.equal(c.articleLike.liked, false);
  request.resolve({ success: false, message: 'try again' });
  await pending;
  assert.equal(c.articleLike.count, 8);
  assert.equal(c.articleLike.liked, true);
  assert.equal(c.articleLike.loading, false);
});
test('late article reply cannot change a reopened article or clear its loading state', async () => {
  const { c, api, request } = article();
  const pending = api.toggleArticleLike();
  c.articleLoadRevision++;
  c.articleLike.count = 20;
  request.resolve({ success: true, data: { count: 9, liked: true } });
  await pending;
  assert.equal(c.articleLike.count, 20);
  assert.equal(c.articleLike.loading, true);
});
test('plaza likes survive list hydration while pending and roll back on failure', async () => {
  const request = deferred();
  const c = { isAuthed: { value: true }, user: { value: { id: 'user' } }, plaza: { messages: [{ id: 'm', viewer_liked: false, like_count: 2 }] }, pendingLikes: {}, successfulLikes: new Map(), props: { t: {} },
    authFetch: () => request.promise, authHeaders: () => ({}), parseResponse: r => r, showPlazaToast: () => {}, clearPlazaMessageCache: () => {} };
  const api = functions('pages/PlazaPage.vue', ['patchPlazaMessage', 'keepLikeResults', 'plazaLikeMessage'], c);
  const pending = api.plazaLikeMessage('m');
  assert.equal(c.plaza.messages[0].like_count, 3);
  assert.equal(api.keepLikeResults([{ id: 'm', like_count: 2 }])[0].viewer_liked, true);
  request.reject(new Error('offline')); await pending;
  assert.equal(c.plaza.messages[0].like_count, 2);
  assert.equal(c.plaza.messages[0].viewer_liked, false);
  assert.equal(c.pendingLikes.m, undefined);
});
test('search wraps with ArrowUp, keeps input focus, ignores IME and opens the selected result', async () => {
  const c = { results: { value: [{ resultKey: 'page-a', path: '/a' }, { resultKey: 'article-b', path: '/articles/b' }] }, activeKey: { value: '' }, normalizedQuery: { value: 'test' }, nextTick: async () => {}, document: { getElementById: () => ({ scrollIntoView: () => {} }) }, navigate: (_, item) => { c.path = item.path; } };
  c.activeIndex = { get value() { return c.results.value.findIndex(r => r.resultKey === c.activeKey.value); } };
  c.activeId = { get value() { return 'site-result-' + c.activeIndex.value; } };
  const api = functions('components/SiteSearch.vue', ['chooseResult', 'submitSearch'], c);
  await api.chooseResult({ key: 'ArrowUp', isComposing: true });
  assert.equal(c.activeKey.value, '');
  await api.chooseResult({ key: 'ArrowUp', preventDefault() {} });
  assert.equal(c.activeKey.value, 'article-b');
  api.submitSearch({}); assert.equal(c.path, '/articles/b');
  await api.chooseResult({ key: 'ArrowDown', preventDefault() {} });
  assert.equal(c.activeKey.value, 'page-a');
});
test('chat follows new chunks at bottom but never moves a reader viewing history', () => {
  const node = { scrollHeight: 1000, clientHeight: 300, scrollTop: 700 };
  // A real DOM clamps scrollTop to the scroll range.
  let top = 700;
  Object.defineProperty(node, 'scrollTop', { get: () => top, set: value => { top = Math.min(value, node.scrollHeight - node.clientHeight); } });
  const c = { transcriptRef: { value: node }, followingLatestMessage: true, readingHistory: { value: false } };
  const api = functions('components/room/RoomChatPanel.vue', ['followTranscript', 'rememberTranscriptPosition'], c);
  node.scrollHeight = 1100; api.followTranscript(); assert.equal(node.scrollTop, 800);
  node.scrollTop = 300; api.rememberTranscriptPosition();
  node.scrollHeight = 1200; api.followTranscript();
  assert.equal(node.scrollTop, 300); assert.equal(c.readingHistory.value, true);
  node.scrollTop = 900; api.rememberTranscriptPosition();
  node.scrollHeight = 1300; api.followTranscript(); assert.equal(node.scrollTop, 1000);
});

test('a modal closed before rendering never opens late and releases the scroll lock', async () => {
  const tick = deferred(); let open = true, opened = 0, released = 0, focused = 0;
  const c = { ref: value => ({ value }), nextTick: () => tick.promise, document: { activeElement: { isConnected: true, focus: () => focused++ } },
    location: { pathname: '/stage', search: '' }, lockPageScroll: () => () => released++,
    watch: (_, callback) => { c.change = callback; callback(true); }, onBeforeUnmount: callback => { c.cleanup = callback; } };
  const code = fs.readFileSync(path.join(__dirname, '../src/frontend/composables/useModalDialog.js'), 'utf8').replace(/^import .*;\n/gm, '').replace('export function', 'function');
  vm.runInNewContext(code + '\nthis.useModalDialog = useModalDialog;', c);
  const modal = c.useModalDialog(() => open);
  modal.value = { showModal: () => opened++, close() {} };
  open = false; await c.change(false); tick.resolve(); await Promise.resolve();
  assert.equal(opened, 0); assert.equal(released, 1); assert.equal(focused, 1);
  c.cleanup(); assert.equal(released, 1);
});
