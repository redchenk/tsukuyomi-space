const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parse } = require('@babel/parser');
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function fixture() {
  const code = fs.readFileSync(require.resolve('../src/frontend/pages/DriftPage.vue'), 'utf8').split('<script setup>')[1].split('</script>')[0];
  const names = ['translationSource', 'translate', 'loadThread'];
  const functions = parse(code, { sourceType: 'module' }).program.body.filter(node => node.type === 'FunctionDeclaration' && names.includes(node.id.name));
  assert.equal(functions.length, names.length);
  const response = deferred();
  const context = {
    current: { value: { bottle: { id: 1, content: '一封私密纸条' }, replies: [] } },
    translated: { value: '' }, hasNewLetters: { value: false }, props: { lang: 'en' },
    copy: { value: { unavailable: 'Unavailable' } }, disposed: false, revision: 0,
    fetch: async (url, options) => { context.sent = { url, body: JSON.parse(options.body) }; return response.promise; }
  };
  vm.runInNewContext(functions.map(node => code.slice(node.start, node.end)).join('\n') + '\nthis.actions={translate,loadThread};', context);
  return { context, response };
}
test('private translation uses the uncached endpoint and leaves original text intact', async () => {
  const { context: c, response } = fixture();
  const pending = c.actions.translate();
  assert.equal(c.sent.url, '/en-translate-private');
  assert.equal(c.sent.body.private, true);
  response.resolve({ ok: true, json: async () => ({ translations: ['A private note'] }) });
  await pending;
  assert.equal(c.translated.value, 'A private note');
  assert.equal(c.current.value.bottle.content, '一封私密纸条');
});
test('late translation cannot replace a newer conversation, language or unmounted page', async () => {
  for (const update of [
    c => c.current.value.replies.push({ id: 1, content: '新回信', status: 'approved' }),
    c => c.current.value.bottle.id++,
    c => { c.props.lang = 'ja'; },
    c => { c.disposed = true; }
  ]) {
    const { context: c, response } = fixture();
    const pending = c.actions.translate();
    update(c);
    response.resolve({ ok: true, json: async () => ({ translations: ['Outdated note'] }) });
    await pending;
    assert.equal(c.translated.value, '');
  }
});
test('out-of-order thread reads keep the latest response and clear obsolete translations', async () => {
  const { context: c } = fixture();
  const old = deferred(), latest = deferred();
  let calls = 0;
  c.request = () => (++calls === 1 ? old.promise : latest.promise);
  c.translated.value = 'Old translation';
  const first = c.actions.loadThread(1), second = c.actions.loadThread(1);
  latest.resolve({ bottle: { id: 1, content: '一封私密纸条' }, replies: [{ id: 1, content: '新回信', status: 'approved' }] });
  await second;
  old.resolve({ bottle: { id: 1, content: '一封私密纸条' }, replies: [] });
  await first;
  assert.equal(c.current.value.replies[0].content, '新回信');
  assert.equal(c.translated.value, '');
  assert.equal(c.hasNewLetters.value, true);
});
